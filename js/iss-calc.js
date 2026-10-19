// ISS position and pass predictions using satellite.js (SGP4) + Astronomy Engine for the Sun.
import { getISSTLE } from './data.js';

const S = () => window.satellite;
const RE = 6371;
let satrec = null, loadedAt = 0;

export async function loadISS() {
  if (satrec && Date.now() - loadedAt < 6 * 3600e3) return satrec;
  const [l1, l2] = await getISSTLE();
  satrec = S().twoline2satrec(l1, l2);
  loadedAt = Date.now();
  return satrec;
}

function sunDir(date) {
  const v = window.Astronomy.GeoVector('Sun', date, true);
  const n = Math.hypot(v.x, v.y, v.z);
  return [v.x / n, v.y / n, v.z / n];
}

// Cylindrical Earth-shadow test.
export function isSunlit(r, date) {
  const s = sunDir(date);
  const p = r.x * s[0] + r.y * s[1] + r.z * s[2];
  if (p > 0) return true;
  return Math.hypot(r.x - p * s[0], r.y - p * s[1], r.z - p * s[2]) > RE;
}

export function issState(date = new Date()) {
  const s = S();
  const pv = s.propagate(satrec, date);
  if (!pv.position) return null;
  const gmst = s.gstime(date);
  const gd = s.eciToGeodetic(pv.position, gmst);
  const v = pv.velocity;
  return {
    lat: s.degreesLat(gd.latitude), lon: s.degreesLong(gd.longitude), alt: gd.height,
    speed: Math.hypot(v.x, v.y, v.z) * 3600, sunlit: isSunlit(pv.position, date),
  };
}

export function groundTrack(fromMin, toMin, stepMin = 1, now = new Date()) {
  const pts = [];
  for (let m = fromMin; m <= toMin; m += stepMin) {
    const st = issState(new Date(+now + m * 60e3));
    if (st) pts.push([st.lat, st.lon]);
  }
  // Split at the antimeridian so Leaflet doesn't draw lines across the map.
  const segs = [[]];
  pts.forEach((p, i) => {
    if (i && Math.abs(p[1] - pts[i - 1][1]) > 180) segs.push([]);
    segs[segs.length - 1].push(p);
  });
  return segs;
}

function lookAngles(date, og) {
  const s = S();
  const pv = s.propagate(satrec, date);
  const gmst = s.gstime(date);
  const la = s.ecfToLookAngles(og, s.eciToEcf(pv.position, gmst));
  return { el: la.elevation * 180 / Math.PI, az: ((la.azimuth * 180 / Math.PI) + 360) % 360, eci: pv.position };
}

export function findPasses(loc, { days = 5, minEl = 10, start = new Date() } = {}) {
  const s = S();
  const Ast = window.Astronomy;
  const obs = new Ast.Observer(loc.lat, loc.lon, loc.elev || 0);
  const og = { longitude: s.degreesToRadians(loc.lon), latitude: s.degreesToRadians(loc.lat), height: (loc.elev || 0) / 1000 };
  const passes = [];
  let cur = null;
  const end = +start + days * 864e5;
  for (let t = +start; t < end; t += 20e3) {
    const dt = new Date(t);
    const la = lookAngles(dt, og);
    if (la.el >= minEl) {
      if (!cur) cur = { start: dt, startAz: la.az, maxEl: la.el, maxAt: dt, maxAz: la.az, visible: false };
      if (la.el > cur.maxEl) Object.assign(cur, { maxEl: la.el, maxAt: dt, maxAz: la.az });
      cur.end = dt; cur.endAz = la.az;
      const eq = Ast.Equator('Sun', dt, obs, true, true);
      const sunAlt = Ast.Horizon(dt, obs, eq.ra, eq.dec, 'normal').altitude;
      if (sunAlt < -6 && isSunlit(la.eci, dt)) {
        cur.visible = true;
        cur.visStart ??= dt; cur.visEnd = dt;
        if (la.el > (cur.visMaxEl ?? -1)) cur.visMaxEl = la.el;
      }
    } else if (cur) { passes.push(cur); cur = null; }
  }
  if (cur) passes.push(cur);
  return passes;
}
