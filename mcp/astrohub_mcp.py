"""AstroHub MCP server.

Gives the Claude desktop app AstroHub's sky tools: tonight's conditions, planets,
best Messier targets, ISS passes, sky events, space weather, launches, news and an
eyepiece calculator. Runs locally over stdio; no API key needed.

Sky maths uses Astronomy Engine (same library as the website) and SGP4 for the ISS.
The Messier catalogue and meteor showers are read from the website's data/*.js files.
"""
from __future__ import annotations

import glob
import json
import math
import os
import re
import time as _time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import astronomy as A
from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from mcp.types import ToolAnnotations
from sgp4.api import Satrec, jday

HERE = Path(__file__).resolve().parent
SITE = HERE.parent
UTC = timezone.utc
PLANETS = ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune']

# ---------------------------------------------------------------- helpers

_cache: dict[str, tuple[float, object]] = {}


def http_get(url: str, ttl: float = 3600, text: bool = False, timeout: float = 25):
    now = _time.time()
    hit = _cache.get(url)
    if hit and now - hit[0] < ttl:
        return hit[1]
    req = urllib.request.Request(url, headers={'User-Agent': 'AstroHub-MCP/1.0'})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            body = r.read().decode('utf-8')
    except Exception as e:
        if hit:  # serve stale data rather than nothing
            return hit[1]
        raise ToolError(f'Could not reach {urllib.parse.urlsplit(url).netloc} ({e}). Check the internet connection and try again.') from e
    val = body if text else json.loads(body)
    _cache[url] = (now, val)
    return val


def load_config() -> dict | None:
    p = HERE / 'config.json'
    if not p.exists():
        return None
    cfg = json.loads(p.read_text(encoding='utf-8'))
    return cfg if 'lat' in cfg and 'lon' in cfg else None


def resolve(place: str | None) -> dict:
    """A place name (geocoded) or the home location from config.json."""
    if place and place.strip():
        q = urllib.parse.urlencode({'name': place.strip(), 'count': 1, 'language': 'en', 'format': 'json'})
        j = http_get(f'https://geocoding-api.open-meteo.com/v1/search?{q}', ttl=86400)
        r = (j.get('results') or [None])[0]
        if not r:
            raise ToolError(f'Could not find a place called "{place}". Try a nearby larger town.')
        name = ', '.join(x for x in [r['name'], r.get('admin1'), r.get('country')] if x)
        return {'name': name, 'lat': r['latitude'], 'lon': r['longitude'], 'elev': r.get('elevation') or 0, 'tz': r.get('timezone') or 'UTC'}
    cfg = load_config()
    if cfg:
        return {'name': cfg.get('name', 'Home'), 'lat': cfg['lat'], 'lon': cfg['lon'], 'elev': cfg.get('elev', 0), 'tz': cfg.get('tz', 'UTC')}
    raise ToolError('No location given and no home location set. Pass a place name, or set it in mcp/config.json.')


def T(dt: datetime) -> A.Time:
    dt = dt.astimezone(UTC)
    return A.Time.Make(dt.year, dt.month, dt.day, dt.hour, dt.minute, dt.second + dt.microsecond / 1e6)


def D(t) -> datetime | None:
    if t is None:
        return None
    d = t.Utc()
    return d.replace(tzinfo=UTC) if d.tzinfo is None else d


def fmt(dt: datetime | None, tz: str, with_date: bool = True) -> str | None:
    if dt is None:
        return None
    local = dt.astimezone(ZoneInfo(tz))
    return local.strftime('%a %d %b %H:%M' if with_date else '%H:%M')


def compass(az: float) -> str:
    dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
    return dirs[round((az % 360) / 22.5) % 16]


def observer(loc: dict) -> A.Observer:
    return A.Observer(loc['lat'], loc['lon'], loc.get('elev', 0) or 0)


def body(name: str):
    return getattr(A.Body, name)


def altaz(b, dt: datetime, obs) -> tuple[float, float]:
    t = T(dt)
    eq = A.Equator(b, t, obs, True, True)
    h = A.Horizon(t, obs, eq.ra, eq.dec, A.Refraction.Normal)
    return h.altitude, h.azimuth


def radec_altaz(ra: float, dec: float, dt: datetime, obs) -> tuple[float, float]:
    t = T(dt)
    h = A.Horizon(t, obs, ra, dec, A.Refraction.Normal)
    return h.altitude, h.azimuth


def rise_set(b, obs, direction, start: datetime, days: float) -> datetime | None:
    return D(A.SearchRiseSet(b, obs, direction, T(start), days))


def sun_alt_cross(obs, direction, start: datetime | None, alt: float) -> datetime | None:
    if start is None:
        return None
    return D(A.SearchAltitude(A.Body.Sun, obs, direction, T(start), 1, alt))


# ---------------------------------------------------------------- website data files

TYPE_NAMES = {'GC': 'Globular cluster', 'OC': 'Open cluster', 'Neb': 'Nebula', 'PN': 'Planetary nebula',
              'SNR': 'Supernova remnant', 'Gal': 'Galaxy', 'Ast': 'Asterism / double star', 'SC': 'Star cloud'}


def load_messier() -> list[dict]:
    src = (SITE / 'data' / 'messier.js').read_text(encoding='utf-8')
    rows = []
    pat = r"\[(\d+),\s*(?:'([^']*)'|\"([^\"]*)\"),\s*'(\w+)',\s*'([^']*)',\s*([\d.]+),\s*([\d.]+),\s*(-?[\d.]+)\]"
    for m in re.finditer(pat, src):
        n, a, b, typ, con, mag, ra, dec = m.groups()
        rows.append({'id': f'M{n}', 'n': int(n), 'name': a if a is not None else b, 'type': TYPE_NAMES.get(typ, typ),
                     'con': con, 'mag': float(mag), 'ra': float(ra), 'dec': float(dec)})
    return rows


def load_showers() -> list[dict]:
    src = (SITE / 'data' / 'showers.js').read_text(encoding='utf-8')
    pat = (r"name: '([^']*)', peak: \[(\d+), (\d+)\], active: '([^']*)', zhr: (\d+), ra: ([\d.]+), "
           r"dec: (-?[\d.]+), con: '([^']*)', parent: '([^']*)'")
    return [{'name': g[0], 'month': int(g[1]), 'day': int(g[2]), 'active': g[3], 'zhr': int(g[4]),
             'ra': float(g[5]), 'dec': float(g[6]), 'con': g[7], 'parent': g[8]} for g in re.findall(pat, src)]


MESSIER = load_messier()
SHOWERS = load_showers()

# ---------------------------------------------------------------- tonight

def phase_name(a: float) -> str:
    a %= 360
    for lim, name in [(6, 'New Moon'), (84, 'Waxing Crescent'), (96, 'First Quarter'), (174, 'Waxing Gibbous'),
                      (186, 'Full Moon'), (264, 'Waning Gibbous'), (276, 'Last Quarter'), (354, 'Waning Crescent')]:
        if a < lim:
            return name
    return 'New Moon'


def night_info(loc: dict, now: datetime | None = None) -> dict:
    now = now or datetime.now(UTC)
    obs = observer(loc)
    sun_now, _ = altaz(A.Body.Sun, now, obs)
    start = now if sun_now > -0.833 else now - timedelta(hours=16)
    sunset = rise_set(A.Body.Sun, obs, A.Direction.Set, start, 2)
    base = sunset or now
    S, R = A.Direction.Set, A.Direction.Rise
    civil_dusk, naut_dusk, astro_dusk = (sun_alt_cross(obs, S, base, a) for a in (-6, -12, -18))
    astro_dawn = sun_alt_cross(obs, R, astro_dusk, -18)
    naut_dawn = sun_alt_cross(obs, R, naut_dusk, -12)
    civil_dawn = sun_alt_cross(obs, R, civil_dusk, -6)
    sunrise = rise_set(A.Body.Sun, obs, R, base, 2)
    dark_start = astro_dusk or naut_dusk or civil_dusk or sunset
    dark_end = astro_dawn or naut_dawn or civil_dawn or sunrise

    phase = A.MoonPhase(T(now))
    illum = A.Illumination(A.Body.Moon, T(now)).phase_fraction
    up_frac, illum_mid = 0.0, illum
    if dark_start and dark_end and dark_end > dark_start:
        steps = up = 0
        t = dark_start
        while t <= dark_end:
            steps += 1
            if altaz(A.Body.Moon, t, obs)[0] > 0:
                up += 1
            t += timedelta(minutes=15)
        up_frac = up / steps if steps else 0
        illum_mid = A.Illumination(A.Body.Moon, T(dark_start + (dark_end - dark_start) / 2)).phase_fraction
    q = A.SearchMoonQuarter(T(now))
    next_full = next_new = None
    for _ in range(5):
        if q.quarter == 2 and not next_full:
            next_full = D(q.time)
        if q.quarter == 0 and not next_new:
            next_new = D(q.time)
        q = A.NextMoonQuarter(q)
    return {
        'sunset': sunset, 'civil_dusk': civil_dusk, 'nautical_dusk': naut_dusk, 'astro_dusk': astro_dusk,
        'astro_dawn': astro_dawn, 'nautical_dawn': naut_dawn, 'civil_dawn': civil_dawn, 'sunrise': sunrise,
        'dark_start': dark_start, 'dark_end': dark_end,
        'darkness': 'astronomical' if astro_dusk else 'nautical' if naut_dusk else 'civil' if civil_dusk else 'none',
        'moon': {'phase_angle': phase, 'name': phase_name(phase), 'illum': illum, 'illum_mid': illum_mid, 'up_frac': up_frac,
                 'rise': rise_set(A.Body.Moon, obs, R, now, 1.5), 'set': rise_set(A.Body.Moon, obs, S, now, 1.5),
                 'next_full': next_full, 'next_new': next_new},
    }


def forecast(loc: dict) -> list[dict]:
    q = urllib.parse.urlencode({
        'latitude': round(loc['lat'], 3), 'longitude': round(loc['lon'], 3),
        'hourly': 'cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,relative_humidity_2m,wind_speed_10m,'
                  'temperature_2m,dew_point_2m,visibility,wind_speed_250hPa',
        'timeformat': 'unixtime', 'forecast_days': 3, 'timezone': 'auto'})
    h = http_get(f'https://api.open-meteo.com/v1/forecast?{q}', ttl=3600)['hourly']
    keys = {'cloud': 'cloud_cover', 'low': 'cloud_cover_low', 'mid': 'cloud_cover_mid', 'high': 'cloud_cover_high',
            'rh': 'relative_humidity_2m', 'wind': 'wind_speed_10m', 'temp': 'temperature_2m', 'dew': 'dew_point_2m',
            'vis': 'visibility', 'jet': 'wind_speed_250hPa'}
    return [{'t': datetime.fromtimestamp(ts, UTC), **{k: (h.get(v) or [None] * len(h['time']))[i] for k, v in keys.items()}}
            for i, ts in enumerate(h['time'])]


def seeing_of(h: dict) -> int | None:
    j = h.get('jet')
    if j is None:
        return None
    return 2 if j < 60 else 3 if j < 100 else 5 if j < 140 else 6 if j < 180 else 8


def transparency_of(h: dict) -> int:
    vis = (h.get('vis') or 30000) / 1000
    rh = h.get('rh') or 0
    return 2 if rh < 50 and vis > 30 else 3 if rh < 65 and vis > 20 else 5 if rh < 80 else 6 if rh < 90 else 8


def quality(v: float | None) -> str:
    if v is None:
        return 'unknown'
    return 'excellent' if v <= 2 else 'good' if v <= 4 else 'average' if v <= 6 else 'poor'


def verdict(score: int | None) -> str:
    if score is None:
        return 'No data'
    return 'Go' if score >= 70 else 'Marginal' if score >= 45 else 'No-go'


def avg(rows: list[dict], key: str) -> float | None:
    vals = [r[key] for r in rows if r.get(key) is not None]
    return sum(vals) / len(vals) if vals else None


# ---------------------------------------------------------------- ISS (SGP4)

_iss: dict = {}


def iss_satrec() -> Satrec:
    if _iss.get('sat') and _time.time() - _iss['t'] < 6 * 3600:
        return _iss['sat']
    try:
        j = http_get('https://api.wheretheiss.at/v1/satellites/25544/tles', ttl=6 * 3600)
        l1, l2 = j['line1'], j['line2']
    except Exception:
        txt = http_get('https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE', ttl=6 * 3600, text=True)
        lines = [x.strip() for x in txt.strip().splitlines()]
        l1, l2 = lines[1], lines[2]
    _iss.update(sat=Satrec.twoline2rv(l1, l2), t=_time.time())
    return _iss['sat']


def _gmst(jd: float) -> float:
    t = (jd - 2451545.0) / 36525
    sec = 67310.54841 + (876600 * 3600 + 8640184.812866) * t + 0.093104 * t * t - 6.2e-6 * t ** 3
    return math.radians((sec % 86400) / 240.0)


def iss_teme(dt: datetime):
    d = dt.astimezone(UTC)
    jd, fr = jday(d.year, d.month, d.day, d.hour, d.minute, d.second + d.microsecond / 1e6)
    err, r, v = iss_satrec().sgp4(jd, fr)
    if err:
        return None
    return r, v, _gmst(jd + fr)


def teme_to_ecef(r, g):
    c, s = math.cos(g), math.sin(g)
    return (c * r[0] + s * r[1], -s * r[0] + c * r[1], r[2])


def sunlit(r, dt: datetime) -> bool:
    v = A.GeoVector(A.Body.Sun, T(dt), True)
    n = math.sqrt(v.x ** 2 + v.y ** 2 + v.z ** 2)
    s = (v.x / n, v.y / n, v.z / n)
    p = r[0] * s[0] + r[1] * s[1] + r[2] * s[2]
    if p > 0:
        return True
    return math.dist(r, (p * s[0], p * s[1], p * s[2])) > 6371


def look_angles(r_teme, g, loc):
    x, y, z = teme_to_ecef(r_teme, g)
    a, f = 6378.137, 1 / 298.257223563
    e2 = f * (2 - f)
    lat, lon = math.radians(loc['lat']), math.radians(loc['lon'])
    h = (loc.get('elev') or 0) / 1000
    N = a / math.sqrt(1 - e2 * math.sin(lat) ** 2)
    ox = (N + h) * math.cos(lat) * math.cos(lon)
    oy = (N + h) * math.cos(lat) * math.sin(lon)
    oz = (N * (1 - e2) + h) * math.sin(lat)
    dx, dy, dz = x - ox, y - oy, z - oz
    e = -math.sin(lon) * dx + math.cos(lon) * dy
    n = -math.sin(lat) * math.cos(lon) * dx - math.sin(lat) * math.sin(lon) * dy + math.cos(lat) * dz
    u = math.cos(lat) * math.cos(lon) * dx + math.cos(lat) * math.sin(lon) * dy + math.sin(lat) * dz
    return math.degrees(math.atan2(u, math.hypot(e, n))), math.degrees(math.atan2(e, n)) % 360


# ---------------------------------------------------------------- server + tools

mcp = MCPServer(
    name='AstroHub',
    instructions=(
        "AstroHub gives live astronomy data for the user's observing location: tonight's sky conditions and "
        "go/no-go scores, Moon and planets, best Messier targets, ISS passes, sky events, space weather and aurora, "
        "rocket launches, space news, and eyepiece maths. Every location-based tool takes an optional `place`; when "
        "omitted it uses the user's home location. Times are local to that location. Prefer calling tools over "
        "guessing sky positions or weather, and say when data is unavailable."),
)
RO = ToolAnnotations(readOnlyHint=True, openWorldHint=True)


@mcp.tool(annotations=RO)
def get_tonight(place: str | None = None) -> dict:
    """Tonight's observing conditions: darkness times, Moon, cloud/humidity/wind for the dark hours,
    estimated seeing and transparency, and go/no-go scores (0-100) for deep-sky and for planets.
    `place` is an optional city name; omit it for the user's home location."""
    loc = resolve(place)
    tz = loc['tz']
    n = night_info(loc)
    try:
        hours = forecast(loc)
    except Exception as e:  # weather is optional
        hours, wx_error = [], str(e)
    else:
        wx_error = None
    dark = [h for h in hours if n['dark_start'] and n['dark_end'] and n['dark_start'] - timedelta(minutes=30) <= h['t'] <= n['dark_end']]
    cloud, rh, wind = avg(dark, 'cloud'), avg(dark, 'rh'), avg(dark, 'wind')
    seeing = avg([{'s': seeing_of(h)} for h in dark], 's')
    transp = avg([{'s': transparency_of(h)} for h in dark], 's')
    deep = planets = None
    if cloud is not None:
        sky = (1 - cloud / 100) ** 1.4
        hum = 0.6 if rh > 92 else 0.8 if rh > 85 else 0.92 if rh > 75 else 1
        wnd = 0.6 if wind > 35 else 0.8 if wind > 25 else 0.92 if wind > 15 else 1
        moon_f = 1 - 0.65 * n['moon']['illum_mid'] * n['moon']['up_frac']
        see_f = 1 if not seeing or seeing <= 3 else 0.85 if seeing <= 5 else 0.7
        deep, planets = round(100 * sky * hum * wnd * moon_f), round(100 * sky * hum * wnd * see_f)
    temp, dew = avg(dark, 'temp'), avg(dark, 'dew')
    m = n['moon']
    return {
        'location': loc['name'], 'timezone': tz,
        'darkness': n['darkness'],
        'times': {k: fmt(n[k], tz) for k in ('sunset', 'civil_dusk', 'nautical_dusk', 'astro_dusk', 'astro_dawn', 'nautical_dawn', 'civil_dawn', 'sunrise')},
        'dark_window': f"{fmt(n['dark_start'], tz)} to {fmt(n['dark_end'], tz)}" if n['dark_start'] else None,
        'moon': {'phase': m['name'], 'illuminated_percent': round(m['illum'] * 100), 'rises': fmt(m['rise'], tz), 'sets': fmt(m['set'], tz),
                 'up_during_dark_percent': round(m['up_frac'] * 100), 'next_full': fmt(m['next_full'], tz), 'next_new': fmt(m['next_new'], tz)},
        'weather_dark_hours': None if cloud is None else {
            'cloud_cover_percent': round(cloud), 'humidity_percent': round(rh), 'wind_kmh': round(wind),
            'dew_risk': bool(temp is not None and dew is not None and temp - dew < 3),
            'seeing_estimate': quality(seeing), 'transparency_estimate': quality(transp)},
        'weather_error': wx_error,
        'scores': {'deep_sky': deep, 'deep_sky_verdict': verdict(deep), 'planets': planets, 'planets_verdict': verdict(planets)},
        'hourly_cloud': [{'time': fmt(h['t'], tz), 'cloud_percent': h['cloud'], 'low_mid_high': [h['low'], h['mid'], h['high']]}
                         for h in hours if h['t'] >= datetime.now(UTC) - timedelta(hours=1)][:30],
        'notes': 'Seeing/transparency are estimates from jet-stream wind and humidity (Open-Meteo). Scores weigh cloud, humidity, wind, and (deep-sky) moonlight or (planets) seeing.',
    }


@mcp.tool(annotations=RO)
def get_planets(place: str | None = None) -> list[dict]:
    """The Moon and planets tonight: current altitude/direction, rise and set times, the best time to view
    (highest point between dusk and dawn), magnitude and constellation. `place` optional."""
    loc = resolve(place)
    tz, obs, now = loc['tz'], observer(loc), datetime.now(UTC)
    n = night_info(loc, now)
    start = n['civil_dusk'] or n['sunset'] or now
    end = n['civil_dawn'] or n['sunrise'] or start + timedelta(hours=12)
    out = []
    for name in ['Moon'] + PLANETS:
        b = body(name)
        alt, az = altaz(b, now, obs)
        best = (-90.0, None, 0.0)
        t = start
        while t <= end:
            a2, z2 = altaz(b, t, obs)
            if a2 > best[0]:
                best = (a2, t, z2)
            t += timedelta(minutes=10)
        j = A.Equator(b, T(now), obs, False, True)
        elong = None if name == 'Moon' else A.AngleFromSun(b, T(now))
        visible = best[0] > 10 and (elong is None or elong > 12)
        out.append({
            'object': name, 'now': f'{alt:.0f}° {compass(az)}' if alt > 0 else 'below horizon',
            'rises': fmt(rise_set(b, obs, A.Direction.Rise, now, 1.5), tz), 'sets': fmt(rise_set(b, obs, A.Direction.Set, now, 1.5), tz),
            'visible_tonight': visible,
            'best': f'{fmt(best[1], tz)} at {best[0]:.0f}° {compass(best[2])}' if visible else None,
            'magnitude': round(A.Illumination(b, T(now)).mag, 1),
            'constellation': A.Constellation(j.ra, j.dec).name,
            'degrees_from_sun': None if elong is None else round(elong),
        })
    return out


@mcp.tool(annotations=RO)
def get_best_targets(place: str | None = None, limit: int = 12, object_type: str | None = None,
                     exclude_observed: bool = False) -> dict:
    """Best Messier objects to observe tonight, ranked by altitude during darkness and brightness.
    `object_type` filters by type (e.g. 'Galaxy', 'Globular cluster', 'Nebula', 'Open cluster', 'Planetary nebula').
    `exclude_observed` skips objects already ticked in the user's latest AstroHub log export. `place` optional."""
    loc = resolve(place)
    tz, obs = loc['tz'], observer(loc)
    n = night_info(loc)
    ds = n['dark_start'] or datetime.now(UTC)
    de = n['dark_end'] or ds + timedelta(hours=8)
    seen = set(_latest_log()[1].get('messierSeen', [])) if exclude_observed else set()
    rows = []
    for m in MESSIER:
        if object_type and object_type.lower() not in m['type'].lower():
            continue
        if m['id'] in seen:
            continue
        best = (-90.0, None, 0.0)
        t = ds
        while t <= de:
            a, z = radec_altaz(m['ra'], m['dec'], t, obs)
            if a > best[0]:
                best = (a, t, z)
            t += timedelta(minutes=30)
        if best[0] > 30:
            rows.append((best[0] - m['mag'] * 4, m, best))
    rows.sort(key=lambda r: -r[0])
    moon = n['moon']
    return {
        'location': loc['name'], 'dark_window': f"{fmt(ds, tz)} to {fmt(de, tz)}",
        'moon_warning': 'Bright Moon up for much of the night: favour clusters over faint galaxies.' if moon['illum_mid'] > 0.6 and moon['up_frac'] > 0.5 else None,
        'excluded_already_observed': len(seen),
        'targets': [{'id': m['id'], 'name': m['name'] or None, 'type': m['type'], 'constellation': m['con'], 'magnitude': m['mag'],
                     'best_time': fmt(b[1], tz), 'max_altitude': round(b[0]), 'direction': compass(b[2])} for _, m, b in rows[:max(1, min(limit, 40))]],
    }


@mcp.tool(annotations=RO)
def where_is(object_name: str, place: str | None = None) -> dict:
    """Where a sky object is now and when it's best tonight. Accepts the Moon, planets, Messier objects
    ('M31', 'Andromeda Galaxy', 'Orion Nebula') and the Sun. `place` optional."""
    loc = resolve(place)
    tz, obs, now = loc['tz'], observer(loc), datetime.now(UTC)
    q = object_name.strip().lower().replace(' ', '')
    target = None
    for name in ['Sun', 'Moon'] + PLANETS:
        if q == name.lower():
            target = ('body', name)
    if not target:
        for m in MESSIER:
            if q in (m['id'].lower(), f"messier{m['n']}") or (m['name'] and q == m['name'].lower().replace(' ', '')):
                target = ('dso', m)
    if not target:
        raise ToolError(f'Unknown object "{object_name}". Try a planet, the Moon, or a Messier object such as M42.')
    n = night_info(loc, now)
    start, end = n['civil_dusk'] or now, n['civil_dawn'] or now + timedelta(hours=12)
    if target[0] == 'body':
        b = body(target[1])
        pos = lambda t: altaz(b, t, obs)
        info = {'object': target[1], 'rises': fmt(rise_set(b, obs, A.Direction.Rise, now, 1.5), tz),
                'sets': fmt(rise_set(b, obs, A.Direction.Set, now, 1.5), tz)}
    else:
        m = target[1]
        pos = lambda t: radec_altaz(m['ra'], m['dec'], t, obs)
        info = {'object': f"{m['id']}{' ' + m['name'] if m['name'] else ''}", 'type': m['type'], 'constellation': m['con'],
                'magnitude': m['mag'], 'highest_possible_altitude': round(90 - abs(loc['lat'] - m['dec']))}
    alt, az = pos(now)
    best = (-90.0, None, 0.0)
    t = start
    while t <= end:
        a, z = pos(t)
        if a > best[0]:
            best = (a, t, z)
        t += timedelta(minutes=10)
    info.update({'location': loc['name'], 'now': f'{alt:.0f}° altitude, {compass(az)} ({az:.0f}°)' if alt > 0 else 'below the horizon',
                 'best_tonight': f'{fmt(best[1], tz)} at {best[0]:.0f}° {compass(best[2])}' if best[0] > 0 else 'not above the horizon tonight'})
    return info


@mcp.tool(annotations=RO)
def get_iss_passes(place: str | None = None, days: int = 10, include_daylight: bool = False) -> dict:
    """International Space Station passes over a location. By default only visible passes (ISS sunlit while
    the observer's sky is dark). Also returns where the ISS is right now. `place` optional, `days` up to 21."""
    loc = resolve(place)
    tz, obs = loc['tz'], observer(loc)
    now = datetime.now(UTC)
    days = max(1, min(days, 21))
    passes, cur = [], None
    t = now
    end = now + timedelta(days=days)
    while t < end:
        st = iss_teme(t)
        if st:
            r, _, g = st
            el, az = look_angles(r, g, loc)
            if el >= 10:
                if not cur:
                    cur = {'start': t, 'start_az': az, 'max_el': el, 'max_az': az, 'visible': False, 'vis_start': None, 'vis_end': None, 'vis_max': 0}
                if el > cur['max_el']:
                    cur.update(max_el=el, max_az=az)
                cur.update(end=t, end_az=az)
                if altaz(A.Body.Sun, t, obs)[0] < -6 and sunlit(r, t):
                    cur['visible'] = True
                    cur['vis_start'] = cur['vis_start'] or t
                    cur['vis_end'] = t
                    cur['vis_max'] = max(cur['vis_max'], el)
            elif cur:
                passes.append(cur)
                cur = None
        t += timedelta(seconds=20)
    if cur:
        passes.append(cur)
    shown = [p for p in passes if include_daylight or p['visible']]
    st = iss_teme(now)
    here = None
    if st:
        x, y, z = teme_to_ecef(st[0], st[2])
        here = {'latitude': round(math.degrees(math.atan2(z, math.hypot(x, y))), 2), 'longitude': round(math.degrees(math.atan2(y, x)), 2),
                'altitude_km': round(math.dist((0, 0, 0), st[0]) - 6371), 'speed_kmh': round(math.dist((0, 0, 0), st[1]) * 3600),
                'in_sunlight': sunlit(st[0], now)}
    return {
        'location': loc['name'], 'days_searched': days, 'iss_now': here,
        'passes': [{'starts': fmt(p['vis_start'] if p['visible'] else p['start'], tz),
                    'duration_min': round(((p['vis_end'] if p['visible'] else p['end']) - (p['vis_start'] if p['visible'] else p['start'])).total_seconds() / 60 + 0.3, 1),
                    'max_elevation': round(p['vis_max'] if p['visible'] else p['max_el']),
                    'path': f"{compass(p['start_az'])} → {compass(p['max_az'])} → {compass(p['end_az'])}",
                    'visible': p['visible']} for p in shown],
        'note': 'Visible passes look like a bright, steady star crossing the sky. If none are listed, the ISS only crosses this sky in daylight or in Earth\'s shadow during this period.',
    }


@mcp.tool(annotations=RO)
def get_sky_events(place: str | None = None, days: int = 90, include_moon_phases: bool = True,
                   include_conjunctions: bool = True) -> dict:
    """Astronomical events coming up: eclipses (with visibility from the location), meteor shower peaks
    (with moonlight), planet oppositions and greatest elongations, Moon-planet and planet-planet conjunctions,
    new/full moons (with supermoons), equinoxes and solstices. `days` up to 365. `place` optional."""
    loc = resolve(place)
    tz, obs = loc['tz'], observer(loc)
    start = datetime.now(UTC)
    days = max(1, min(days, 365))
    end = start + timedelta(days=days)
    ev = []

    def add(dt, cat, title, detail=''):
        if dt and start <= dt <= end:
            ev.append({'dt': dt, 'category': cat, 'event': title, 'details': detail})

    if include_moon_phases:
        names = ['Wolf', 'Snow', 'Worm', 'Pink', 'Flower', 'Strawberry', 'Buck', 'Sturgeon', 'Harvest', "Hunter's", 'Beaver', 'Cold']
        q = A.SearchMoonQuarter(T(start))
        while D(q.time) <= end:
            if q.quarter == 0:
                add(D(q.time), 'moon', 'New Moon', 'Darkest skies of the month.')
            elif q.quarter == 2:
                v = A.GeoMoon(q.time)
                km = math.sqrt(v.x ** 2 + v.y ** 2 + v.z ** 2) * 149597870.7
                add(D(q.time), 'moon', 'Full Moon' + (' (Supermoon)' if km < 362000 else ''), f"The {names[D(q.time).month - 1]} Moon, {km:,.0f} km away.")
            q = A.NextMoonQuarter(q)

    le = A.SearchLunarEclipse(T(start))
    while D(le.peak) <= end:
        up = altaz(A.Body.Moon, D(le.peak), obs)[0] > 0
        add(D(le.peak), 'eclipse', f'{le.kind.name} lunar eclipse', 'Visible from this location.' if up else 'Moon below the horizon here at mid-eclipse.')
        le = A.NextLunarEclipse(le.peak)

    locals_ = []
    ls = A.SearchLocalSolarEclipse(T(start), obs)
    while D(ls.peak.time) <= end:
        locals_.append(ls)
        ls = A.NextLocalSolarEclipse(ls.peak.time, obs)
    ge = A.SearchGlobalSolarEclipse(T(start))
    while D(ge.peak) <= end:
        detail = f'Greatest eclipse near {ge.latitude:.1f}°, {ge.longitude:.1f}°.' if ge.latitude is not None else 'Partial eclipse seen from part of the globe.'
        lc = next((x for x in locals_ if abs((D(x.peak.time) - D(ge.peak)).total_seconds()) < 86400), None)
        if lc and lc.peak.altitude > 0:
            detail += f' From here: {lc.kind.name.lower()}, {lc.obscuration * 100:.0f}% of the Sun covered. Use a certified solar filter.'
        else:
            detail += ' Not visible from this location.'
        add(D(ge.peak), 'eclipse', f'{ge.kind.name} solar eclipse', detail)
        ge = A.NextGlobalSolarEclipse(ge.peak)

    for y in {start.year, end.year}:
        s = A.Seasons(y)
        for attr, name in [('mar_equinox', 'March equinox'), ('jun_solstice', 'June solstice'), ('sep_equinox', 'September equinox'), ('dec_solstice', 'December solstice')]:
            add(D(getattr(s, attr)), 'season', name)

    for name in ['Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune']:
        t = start
        for _ in range(2):
            o = A.SearchRelativeLongitude(body(name), 0, T(t))
            if not o or D(o) > end:
                break
            add(D(o), 'planet', f'{name} at opposition', f'Closest and brightest (mag {A.Illumination(body(name), o).mag:.1f}); up all night.')
            t = D(o) + timedelta(days=60)

    for name in ['Mercury', 'Venus']:
        t = start
        for _ in range(8):
            e = A.SearchMaxElongation(body(name), T(t))
            if D(e.time) > end:
                break
            vis = e.visibility.name.lower()
            add(D(e.time), 'planet', f'{name} at greatest {vis} elongation',
                f"{e.elongation:.1f}° from the Sun; look {'west after sunset' if vis == 'evening' else 'east before sunrise'}.")
            t = D(e.time) + timedelta(days=10)

    if include_conjunctions:
        names = ['Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn']
        step = timedelta(hours=3)
        n_steps = int((end - start) / step)

        def unit(b, t):
            v = A.GeoVector(body(b), T(t), True)
            l = math.sqrt(v.x ** 2 + v.y ** 2 + v.z ** 2)
            return (v.x / l, v.y / l, v.z / l)

        def ang(u, w):
            return math.degrees(math.acos(max(-1.0, min(1.0, sum(a * b for a, b in zip(u, w))))))

        vec = {b: [unit(b, start + i * step) for i in range(n_steps)] for b in names + ['Sun']}
        for i, a in enumerate(names):
            for b in names[i + 1:]:
                lim = 3 if a == 'Moon' else 2.5
                seps = [ang(vec[a][k], vec[b][k]) for k in range(n_steps)]
                for k in range(1, n_steps - 1):
                    if seps[k] < seps[k - 1] and seps[k] <= seps[k + 1] and seps[k] < lim + 1:
                        best_t, best_s = start + k * step, seps[k]
                        t = best_t - step
                        while t <= start + (k + 1) * step:
                            s = ang(unit(a, t), unit(b, t))
                            if s < best_s:
                                best_t, best_s = t, s
                            t += timedelta(minutes=10)
                        from_sun = min(ang(vec[a][k], vec['Sun'][k]), ang(vec[b][k], vec['Sun'][k]))
                        if best_s < lim and from_sun > 18:
                            add(best_t, 'conjunction', f'{a} and {b} conjunction', f'{best_s:.1f}° apart{"; low in twilight" if from_sun < 35 else ""}.')

    for s in SHOWERS:
        for y in {start.year, end.year}:
            peak = datetime(y, s['month'], s['day'], tzinfo=UTC)
            illum = A.Illumination(A.Body.Moon, T(peak)).phase_fraction
            low = 90 - abs(loc['lat'] - s['dec']) < 15
            add(peak, 'meteor', f"{s['name']} meteor shower peak",
                f"Up to ~{s['zhr']}/hour in ideal dark skies; active {s['active']}; radiant in {s['con']}"
                f"{' (stays low from here)' if low else ''}; Moon {illum * 100:.0f}% lit; parent {s['parent']}.")

    ev.sort(key=lambda e: e['dt'])
    for e in ev:
        dt = e.pop('dt')
        # Shower peaks are dates, not instants.
        e['date'] = 'Night of ' + dt.strftime('%a %d %b') if e['category'] == 'meteor' else fmt(dt, tz)
    return {'location': loc['name'], 'from': fmt(start, tz), 'to': fmt(end, tz), 'events': ev}


@mcp.tool(annotations=RO)
def get_space_weather(place: str | None = None) -> dict:
    """Geomagnetic activity (planetary Kp index, observed and 3-day forecast from NOAA SWPC) and the chance
    of seeing aurora from the location. `place` optional."""
    loc = resolve(place)
    tz = loc['tz']
    j = http_get('https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json', ttl=3600)
    if j and isinstance(j[0], list):
        hdr, *rest = j
        rows = [dict(zip(hdr, r)) for r in rest]
    else:
        rows = j
    now = datetime.now(UTC)
    data = []
    for r in rows:
        tt = str(r['time_tag']).replace(' ', 'T')
        dt = datetime.fromisoformat(tt.rstrip('Z')).replace(tzinfo=UTC)
        data.append({'t': dt, 'kp': float(r['kp']), 'kind': r.get('observed') or 'predicted'})
    past = [d for d in data if d['kind'] != 'predicted' and d['t'] <= now]
    latest = past[-1] if past else data[0]
    nxt = [d for d in data if now < d['t'] < now + timedelta(days=1)]
    max_next = max((d['kp'] for d in nxt), default=0)

    def level(kp):
        return 'strong storm' if kp >= 7 else 'storm (G%d)' % (int(kp) - 4) if kp >= 5 else 'active' if kp >= 4 else 'quiet'

    r, pl, pn = math.radians, math.radians(80.7), math.radians(-72.7)
    gm = abs(math.degrees(math.asin(math.sin(r(loc['lat'])) * math.sin(pl) + math.cos(r(loc['lat'])) * math.cos(pl) * math.cos(r(loc['lon']) - pn))))
    need = max(0, math.ceil((66.5 - gm) / 2.2))
    chance = 'good' if max_next >= need + 1 else 'possible' if max_next >= need else 'unlikely'
    return {
        'location': loc['name'],
        'kp_now': latest['kp'], 'kp_now_level': level(latest['kp']), 'kp_now_time': fmt(latest['t'], tz),
        'kp_max_next_24h': max_next, 'kp_max_next_24h_level': level(max_next),
        'aurora': {'chance': chance, 'kp_needed': need if need <= 9 else None, 'geomagnetic_latitude': round(gm),
                   'note': 'Too far from the auroral zones except in extreme storms.' if need > 9 else f"Look {'north' if loc['lat'] >= 0 else 'south'}, away from lights."},
        'forecast_3h': [{'time': fmt(d['t'], tz), 'kp': d['kp'], 'type': d['kind']} for d in data if d['t'] >= now - timedelta(hours=6)][:24],
    }


@mcp.tool(annotations=RO)
def get_launches(limit: int = 10) -> list[dict]:
    """Upcoming rocket launches worldwide (Launch Library 2): name, time (UTC), provider, pad, status."""
    j = http_get(f'https://ll.thespacedevs.com/2.3.0/launches/upcoming/?limit={max(1, min(limit, 25))}&hide_recent_previous=true', ttl=3600)
    return [{'name': r['name'], 'time_utc': r.get('net'), 'provider': (r.get('launch_service_provider') or {}).get('name'),
             'pad': ((r.get('pad') or {}).get('location') or {}).get('name'), 'status': (r.get('status') or {}).get('name'),
             'mission': ((r.get('mission') or {}).get('description') or '')[:300] or None} for r in j['results']]


@mcp.tool(annotations=RO)
def get_news(search: str | None = None, limit: int = 10) -> list[dict]:
    """Latest space and astronomy news (Spaceflight News API). Optional `search` keyword, e.g. 'Webb' or 'Mars'."""
    q = {'limit': max(1, min(limit, 30))}
    if search:
        q['search'] = search
    j = http_get('https://api.spaceflightnewsapi.net/v4/articles/?' + urllib.parse.urlencode(q), ttl=1200)
    return [{'title': a['title'], 'site': a['news_site'], 'published': a['published_at'], 'summary': a['summary'][:400], 'url': a['url']}
            for a in j['results']]


@mcp.tool(annotations=ToolAnnotations(readOnlyHint=True, openWorldHint=False))
def calculate_eyepiece(aperture_mm: float, focal_length_mm: float, eyepiece_mm: float,
                       apparent_fov_deg: float = 52, barlow: float = 1) -> dict:
    """Telescope + eyepiece maths: magnification, true field of view, exit pupil, focal ratio,
    maximum useful magnification, faintest visible star and resolving power."""
    F = focal_length_mm * barlow
    mag = F / eyepiece_mm
    tfov = apparent_fov_deg / mag
    exit_pupil = aperture_mm / mag
    if mag > 2 * aperture_mm:
        advice = 'Above the useful maximum: the image will be dim and soft.'
    elif exit_pupil > 7:
        advice = 'Exit pupil over 7 mm wastes light; use a shorter eyepiece.'
    elif exit_pupil >= 4:
        advice = 'Low power, wide field: clusters, large nebulae, finding objects.'
    elif exit_pupil >= 2:
        advice = 'Medium power: galaxies, globular clusters, planetary nebulae.'
    else:
        advice = 'High power: Moon, planets and double stars; needs steady seeing.'
    return {'magnification': round(mag), 'true_field_deg': round(tfov, 2), 'true_field_arcmin': round(tfov * 60, 1),
            'full_moons_across': round(tfov / 0.52, 1), 'exit_pupil_mm': round(exit_pupil, 1), 'focal_ratio': f'f/{F / aperture_mm:.1f}',
            'max_useful_magnification': round(2 * aperture_mm), 'faintest_star_mag': round(7.7 + 5 * math.log10(aperture_mm / 10), 1),
            'dawes_limit_arcsec': round(116 / aperture_mm, 2), 'advice': advice}


def _latest_log() -> tuple[str | None, dict]:
    cfg = load_config() or {}
    folder = Path(cfg.get('log_folder') or (Path.home() / 'Downloads'))
    files = sorted(glob.glob(str(folder / 'astrohub-log-*.json')), key=os.path.getmtime)
    if not files:
        return None, {}
    return files[-1], json.loads(Path(files[-1]).read_text(encoding='utf-8'))


@mcp.tool(annotations=ToolAnnotations(readOnlyHint=True, openWorldHint=False))
def get_observing_log(limit: int = 50) -> dict:
    """The user's observing log and Messier progress, read from their most recent AstroHub export
    (Log page > Export JSON, saved to the Downloads folder). Photos are omitted."""
    path, data = _latest_log()
    if not path:
        return {'found': False, 'message': 'No AstroHub log export found. In AstroHub, open Log and click Export JSON (it saves to Downloads).'}
    entries = sorted(data.get('entries', []), key=lambda e: e.get('date', ''), reverse=True)
    seen = sorted(data.get('messierSeen', []), key=lambda s: int(s[1:]) if s[1:].isdigit() else 0)
    return {'found': True, 'file': path, 'exported': datetime.fromtimestamp(os.path.getmtime(path)).strftime('%d %b %Y %H:%M'),
            'total_entries': len(entries), 'messier_observed_count': len(seen), 'messier_observed': seen,
            'messier_not_observed': [m['id'] for m in MESSIER if m['id'] not in set(seen)],
            'entries': [{k: e.get(k) for k in ('date', 'object', 'location', 'equipment', 'seeing', 'transparency', 'rating', 'notes')} for e in entries[:max(1, limit)]]}


if __name__ == '__main__':
    mcp.run()
