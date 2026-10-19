// Sky calculations built on Astronomy Engine (global `Astronomy`).
import { SHOWERS } from '../data/showers.js';

const A = () => window.Astronomy;
const d = t => (t ? t.date : null);
export const addH = (date, h) => new Date(date.getTime() + h * 3600e3);

export const PLANETS = ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'];
export const BODY_COLORS = {
  Sun: '#ffd34d', Moon: '#e9e4d4', Mercury: '#b9b2a6', Venus: '#f6e7b8', Mars: '#ff8a5c',
  Jupiter: '#e8c79a', Saturn: '#e6d28f', Uranus: '#9fe3e6', Neptune: '#8aa6ff',
};

// Bright stars (J2000 RA hours, Dec degrees, magnitude) for orientation on the sky chart.
export const STARS = [
  ['Sirius', 6.752, -16.716, -1.46], ['Canopus', 6.399, -52.696, -0.74], ['Arcturus', 14.261, 19.182, -0.05],
  ['Vega', 18.616, 38.784, 0.03], ['Capella', 5.278, 45.998, 0.08], ['Rigel', 5.242, -8.202, 0.13],
  ['Procyon', 7.655, 5.225, 0.34], ['Betelgeuse', 5.919, 7.407, 0.5], ['Achernar', 1.629, -57.237, 0.46],
  ['Hadar', 14.064, -60.373, 0.61], ['Altair', 19.846, 8.868, 0.77], ['Acrux', 12.443, -63.099, 0.76],
  ['Aldebaran', 4.599, 16.509, 0.86], ['Antares', 16.490, -26.432, 0.96], ['Spica', 13.420, -11.161, 0.97],
  ['Pollux', 7.755, 28.026, 1.14], ['Fomalhaut', 22.961, -29.622, 1.16], ['Deneb', 20.690, 45.280, 1.25],
  ['Mimosa', 12.795, -59.689, 1.25], ['Regulus', 10.139, 11.967, 1.35], ['Adhara', 6.977, -28.972, 1.5],
  ['Castor', 7.577, 31.888, 1.58], ['Bellatrix', 5.419, 6.350, 1.64], ['Alnilam', 5.604, -1.202, 1.69],
  ['Alnitak', 5.679, -1.943, 1.77], ['Mintaka', 5.533, -0.299, 2.23], ['Polaris', 2.530, 89.264, 1.98],
  ['Dubhe', 11.062, 61.751, 1.79], ['Merak', 11.031, 56.382, 2.37], ['Phecda', 11.897, 53.695, 2.44],
  ['Megrez', 12.257, 57.033, 3.31], ['Alioth', 12.900, 55.960, 1.77], ['Mizar', 13.399, 54.925, 2.27],
  ['Alkaid', 13.792, 49.313, 1.86], ['Schedar', 0.675, 56.537, 2.24], ['Caph', 0.153, 59.150, 2.28],
  ['Navi', 0.945, 60.717, 2.47], ['Ruchbah', 1.430, 60.235, 2.68], ['Segin', 1.907, 63.670, 3.37],
  ['Mirfak', 3.405, 49.861, 1.79], ['Alpheratz', 0.140, 29.091, 2.06], ['Markab', 23.079, 15.205, 2.48],
  ['Scheat', 23.063, 28.083, 2.42], ['Algenib', 0.221, 15.184, 2.83], ['Hamal', 2.120, 23.463, 2.0],
  ['Shaula', 17.560, -37.104, 1.62], ['Kaus Australis', 18.403, -34.385, 1.85], ['Nunki', 18.921, -26.297, 2.05],
  ['Denebola', 11.818, 14.572, 2.13], ['Algol', 3.136, 40.956, 2.1], ['Mirach', 1.162, 35.621, 2.05],
  ['Almach', 2.065, 42.330, 2.1], ['Rasalhague', 17.582, 12.560, 2.08], ['Kochab', 14.845, 74.156, 2.08],
];

export function observer(loc) { return new (A().Observer)(loc.lat, loc.lon, loc.elev || 0); }

export function altAz(body, date, obs) {
  const eq = A().Equator(body, date, obs, true, true);
  const hor = A().Horizon(date, obs, eq.ra, eq.dec, 'normal');
  return { alt: hor.altitude, az: hor.azimuth, ra: eq.ra, dec: eq.dec };
}
export function radecAltAz(ra, dec, date, obs) {
  const hor = A().Horizon(date, obs, ra, dec, 'normal');
  return { alt: hor.altitude, az: hor.azimuth };
}
export function constellationOf(body, date, obs) {
  const j = A().Equator(body, date, obs, false, true);
  return A().Constellation(j.ra, j.dec).name;
}

export function phaseName(angle) {
  const a = ((angle % 360) + 360) % 360;
  if (a < 6 || a >= 354) return 'New Moon';
  if (a < 84) return 'Waxing Crescent';
  if (a < 96) return 'First Quarter';
  if (a < 174) return 'Waxing Gibbous';
  if (a < 186) return 'Full Moon';
  if (a < 264) return 'Waning Gibbous';
  if (a < 276) return 'Last Quarter';
  return 'Waning Crescent';
}

// Moon phase drawing. Southern-hemisphere observers see it mirrored.
export function moonSVG(angle, size = 64, southern = false) {
  const r = size / 2 - 1, c = size / 2;
  const p = ((angle % 360) + 360) % 360;
  const rx = Math.abs(Math.cos(p * Math.PI / 180)) * r;
  let path;
  if (p < 180) {
    path = `M${c},${c - r} A${r},${r} 0 0 1 ${c},${c + r} A${rx},${r} 0 0 ${p < 90 ? 0 : 1} ${c},${c - r}Z`;
  } else {
    path = `M${c},${c - r} A${r},${r} 0 0 0 ${c},${c + r} A${rx},${r} 0 0 ${p > 270 ? 1 : 0} ${c},${c - r}Z`;
  }
  const flip = southern ? ` transform="scale(-1,1) translate(-${size},0)"` : '';
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">
    <circle cx="${c}" cy="${c}" r="${r}" fill="#1c2438" stroke="#2c3858"/>
    <path d="${path}" fill="#ece6d3"${flip}/></svg>`;
}

// Tonight's key times. If it's currently night, describes the night in progress.
export function nightInfo(loc, now = new Date()) {
  const Ast = A();
  const obs = observer(loc);
  const sunNow = altAz('Sun', now, obs).alt;
  const from = sunNow > -0.833 ? now : addH(now, -16);
  const sunset = d(Ast.SearchRiseSet('Sun', obs, -1, from, 2));
  const base = sunset || now;
  const civilDusk = d(Ast.SearchAltitude('Sun', obs, -1, base, 1, -6));
  const nautDusk = d(Ast.SearchAltitude('Sun', obs, -1, base, 1, -12));
  const astroDusk = d(Ast.SearchAltitude('Sun', obs, -1, base, 1, -18));
  const astroDawn = astroDusk ? d(Ast.SearchAltitude('Sun', obs, +1, astroDusk, 1, -18)) : null;
  const nautDawn = nautDusk ? d(Ast.SearchAltitude('Sun', obs, +1, nautDusk, 1, -12)) : null;
  const civilDawn = civilDusk ? d(Ast.SearchAltitude('Sun', obs, +1, civilDusk, 1, -6)) : null;
  const sunrise = d(Ast.SearchRiseSet('Sun', obs, +1, base, 2));
  const darkStart = astroDusk || nautDusk || civilDusk || sunset;
  const darkEnd = astroDawn || nautDawn || civilDawn || sunrise;
  const darkness = astroDusk ? 'astronomical' : nautDusk ? 'nautical' : civilDusk ? 'civil' : 'none';

  // Moon
  const phase = Ast.MoonPhase(now);
  const illum = Ast.Illumination('Moon', now).phase_fraction;
  const moonrise = d(Ast.SearchRiseSet('Moon', obs, +1, now, 1.5));
  const moonset = d(Ast.SearchRiseSet('Moon', obs, -1, now, 1.5));
  let upFrac = 0, illumMid = illum;
  if (darkStart && darkEnd && darkEnd > darkStart) {
    let up = 0, n = 0;
    for (let t = +darkStart; t <= +darkEnd; t += 15 * 60e3, n++) if (altAz('Moon', new Date(t), obs).alt > 0) up++;
    upFrac = n ? up / n : 0;
    illumMid = Ast.Illumination('Moon', new Date((+darkStart + +darkEnd) / 2)).phase_fraction;
  }
  let q = Ast.SearchMoonQuarter(now), nextFull = null, nextNew = null;
  for (let i = 0; i < 5 && !(nextFull && nextNew); i++) {
    if (q.quarter === 2 && !nextFull) nextFull = q.time.date;
    if (q.quarter === 0 && !nextNew) nextNew = q.time.date;
    q = Ast.NextMoonQuarter(q);
  }
  return {
    sunset, civilDusk, nautDusk, astroDusk, astroDawn, nautDawn, civilDawn, sunrise,
    darkStart, darkEnd, darkness, polar: !sunset,
    moon: { phase, illum, illumMid, upFrac, name: phaseName(phase), rise: moonrise, set: moonset, nextFull, nextNew },
  };
}

export function sunAltAt(date, obs) { return altAz('Sun', date, obs).alt; }

// Moon + planets for tonight: current position, best time, rise/set, magnitude.
export function bodiesTonight(loc, night, now = new Date()) {
  const Ast = A();
  const obs = observer(loc);
  const from = night.civilDusk || night.sunset || now;
  const to = night.civilDawn || night.sunrise || addH(from, 12);
  return ['Moon', ...PLANETS].map(b => {
    const cur = altAz(b, now, obs);
    let best = { alt: -90, t: null, az: 0 }, visStart = null, visEnd = null;
    for (let t = +from; t <= +to; t += 10 * 60e3) {
      const dt = new Date(t);
      const p = altAz(b, dt, obs);
      if (p.alt > best.alt) best = { alt: p.alt, t: dt, az: p.az };
      if (p.alt > 10) { visStart ??= dt; visEnd = dt; }
    }
    return {
      name: b, cur, best, visStart, visEnd,
      rise: d(Ast.SearchRiseSet(b, obs, +1, now, 1.5)),
      set: d(Ast.SearchRiseSet(b, obs, -1, now, 1.5)),
      mag: Ast.Illumination(b, now).mag,
      con: constellationOf(b, now, obs),
      elong: b === 'Moon' ? null : Ast.AngleFromSun(b, now),
    };
  });
}

// Geomagnetic latitude (dipole approximation) — used for aurora chances.
export function geomagLat(lat, lon) {
  const r = Math.PI / 180, pl = 80.7 * r, pn = -72.7 * r;
  const s = Math.sin(lat * r) * Math.sin(pl) + Math.cos(lat * r) * Math.cos(pl) * Math.cos(lon * r - pn);
  return Math.asin(s) / r;
}

const FULL_MOON_NAMES = ['Wolf', 'Snow', 'Worm', 'Pink', 'Flower', 'Strawberry', 'Buck', 'Sturgeon', 'Harvest', "Hunter's", 'Beaver', 'Cold'];
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

let eventsCache = { key: '', list: [] };

// Astronomical events for the coming year: moon phases, eclipses, oppositions,
// elongations, conjunctions, equinoxes/solstices and meteor showers.
export function computeSkyEvents(loc, start = new Date(), days = 365) {
  const key = `${loc.lat.toFixed(2)},${loc.lon.toFixed(2)},${start.toISOString().slice(0, 10)},${days}`;
  if (eventsCache.key === key) return eventsCache.list;
  const Ast = A();
  const obs = observer(loc);
  const end = new Date(+start + days * 864e5);
  const ev = [];
  const push = (date, cat, title, detail, extra = {}) => {
    if (date >= start && date <= end) ev.push({ date, cat, title, detail, ...extra });
  };

  // Moon: new & full (with supermoon flag)
  let mq = Ast.SearchMoonQuarter(start);
  while (mq.time.date <= end) {
    if (mq.quarter === 0) push(mq.time.date, 'moon', 'New Moon', 'Darkest skies of the month — best for galaxies and nebulae.');
    if (mq.quarter === 2) {
      const v = Ast.GeoMoon(mq.time);
      const km = Math.hypot(v.x, v.y, v.z) * 149597870.7;
      const sup = km < 362000;
      push(mq.time.date, 'moon', `Full Moon${sup ? ' — Supermoon' : ''}`,
        `The ${FULL_MOON_NAMES[mq.time.date.getUTCMonth()]} Moon, ${Math.round(km).toLocaleString()} km away.`, { important: sup });
    }
    mq = Ast.NextMoonQuarter(mq);
  }

  // Lunar eclipses
  let le = Ast.SearchLunarEclipse(start);
  while (le.peak.date <= end) {
    const up = altAz('Moon', le.peak.date, obs).alt > 0;
    push(le.peak.date, 'eclipse', `${cap(le.kind)} lunar eclipse`,
      up ? 'Visible from your location — the Moon is above the horizon at mid-eclipse.' : 'Not visible from your location at mid-eclipse (Moon below horizon).',
      { local: up, important: le.kind !== 'penumbral' });
    le = Ast.NextLunarEclipse(le.peak);
  }

  // Solar eclipses (global, with local circumstances)
  const locals = [];
  let ls = Ast.SearchLocalSolarEclipse(start, obs);
  while (ls.peak.time.date <= end) { locals.push(ls); ls = Ast.NextLocalSolarEclipse(ls.peak.time, obs); }
  let ge = Ast.SearchGlobalSolarEclipse(start);
  while (ge.peak.date <= end) {
    const l = locals.find(x => Math.abs(x.peak.time.date - ge.peak.date) < 864e5);
    let detail = ge.latitude != null
      ? `Greatest eclipse near ${ge.latitude.toFixed(1)}°, ${ge.longitude.toFixed(1)}°.`
      : 'A partial eclipse seen from part of the globe.';
    const seen = l && l.peak.altitude > 0;
    detail += seen ? ` From your location: ${l.kind}, ${Math.round(l.obscuration * 100)}% of the Sun covered. Never look without a certified solar filter.`
      : ' Not visible from your location.';
    push(ge.peak.date, 'eclipse', `${cap(ge.kind)} solar eclipse`, detail, { local: !!seen, important: true });
    ge = Ast.NextGlobalSolarEclipse(ge.peak);
  }

  // Seasons
  const y0 = start.getUTCFullYear();
  for (const y of [y0, y0 + 1]) {
    const s = Ast.Seasons(y);
    [['mar_equinox', 'March equinox'], ['jun_solstice', 'June solstice'], ['sep_equinox', 'September equinox'], ['dec_solstice', 'December solstice']]
      .forEach(([k, n]) => push(s[k].date, 'season', n, k.includes('equinox') ? 'Day and night are nearly equal everywhere.' : (k === 'jun_solstice' ? 'Longest day in the north, longest night in the south.' : 'Longest night in the north, longest day in the south.')));
  }

  // Oppositions
  for (const b of ['Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune']) {
    let t = start;
    for (let i = 0; i < 2; i++) {
      const o = Ast.SearchRelativeLongitude(b, 0, t);
      if (!o || o.date > end) break;
      const mag = Ast.Illumination(b, o).mag;
      push(o.date, 'planet', `${b} at opposition`, `Closest and brightest for the year (mag ${mag.toFixed(1)}). Up all night — rises at sunset.`,
        { important: ['Mars', 'Jupiter', 'Saturn'].includes(b) });
      t = new Date(+o.date + 60 * 864e5);
    }
  }

  // Greatest elongations of Mercury and Venus
  for (const b of ['Mercury', 'Venus']) {
    let t = start;
    for (let i = 0; i < 8; i++) {
      const e = Ast.SearchMaxElongation(b, t);
      if (e.time.date > end) break;
      push(e.time.date, 'planet', `${b} at greatest ${e.visibility} elongation`,
        `${e.elongation.toFixed(1)}° from the Sun — look ${e.visibility === 'evening' ? 'low in the west after sunset' : 'low in the east before sunrise'}.`,
        { important: b === 'Venus' });
      t = new Date(+e.time.date + 10 * 864e5);
    }
  }

  // Conjunctions (Moon–planet within 3°, planet–planet within 2.5°), away from the Sun
  const bodies = ['Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'];
  const step = 3 * 3600e3;
  const n = Math.floor((+end - +start) / step);
  const vecs = {};
  const unit = v => { const l = Math.hypot(v.x, v.y, v.z); return [v.x / l, v.y / l, v.z / l]; };
  for (const b of [...bodies, 'Sun']) vecs[b] = new Array(n);
  for (let i = 0; i < n; i++) {
    const t = new Date(+start + i * step);
    for (const b of [...bodies, 'Sun']) vecs[b][i] = unit(Ast.GeoVector(b, t, true));
  }
  const ang = (a, b) => Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])) * 180 / Math.PI;
  for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
    const a = bodies[i], b = bodies[j];
    const lim = a === 'Moon' ? 3 : 2.5;
    let prev = Infinity, prev2 = Infinity;
    for (let k = 0; k < n; k++) {
      const s = ang(vecs[a][k], vecs[b][k]);
      if (k >= 2 && prev < prev2 && prev <= s && prev < lim + 1) {
        const idx = k - 1;
        // Refine the closest approach to 10-minute resolution around the coarse minimum.
        let bestT = +start + idx * step, bestSep = prev;
        for (let t = bestT - step; t <= bestT + step; t += 10 * 60e3) {
          const sep = ang(unit(Ast.GeoVector(a, new Date(t), true)), unit(Ast.GeoVector(b, new Date(t), true)));
          if (sep < bestSep) { bestSep = sep; bestT = t; }
        }
        const fromSun = Math.min(ang(vecs[a][idx], vecs.Sun[idx]), ang(vecs[b][idx], vecs.Sun[idx]));
        if (bestSep < lim && fromSun > 18) {
          push(new Date(bestT), 'conjunction', `${a === 'Moon' ? 'Moon' : a} and ${b} conjunction`,
            `${a} and ${b} appear ${bestSep.toFixed(1)}° apart (a fingertip at arm's length is ~1°). ${fromSun < 35 ? 'Low in twilight — catch it soon after sunset or before sunrise.' : ''}`,
            { important: a !== 'Moon' && bestSep < 1 });
        }
      }
      prev2 = prev; prev = s;
    }
  }

  // Meteor showers
  for (const s of SHOWERS) for (const y of [y0, y0 + 1]) {
    const peak = new Date(Date.UTC(y, s.peak[0] - 1, s.peak[1], 0));
    const illum = Ast.Illumination('Moon', peak).phase_fraction;
    const maxAlt = 90 - Math.abs(loc.lat - s.dec);
    const moonNote = illum > 0.6 ? ' Bright moonlight will wash out fainter meteors.' : illum < 0.3 ? ' Dark, moon-free skies — a great year for it!' : '';
    push(peak, 'meteor', `${s.name} meteor shower peak`,
      `Up to ~${s.zhr} meteors/hour under ideal dark skies. Radiant in ${s.con}${maxAlt < 15 ? ' — stays low from your latitude' : ''}. Moon ${Math.round(illum * 100)}% lit.${moonNote} Parent: ${s.parent}.`,
      { allDay: true, important: s.zhr >= 50 });
  }

  ev.sort((a, b) => a.date - b.date);
  eventsCache = { key, list: ev };
  return ev;
}

// Local sidereal time in hours.
export function localSiderealTime(date, lon) {
  const gst = A().SiderealTime(date);
  return ((gst + lon / 15) % 24 + 24) % 24;
}
