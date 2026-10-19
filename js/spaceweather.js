// Kp index chart + aurora outlook, shared by Tonight and Space Feeds.
import { esc, fmtDateTime, badge } from './util.js';
import { getKp } from './data.js';
import { timeBarChart } from './charts.js';
import { geomagLat } from './astro.js';

export function kpLevel(kp) {
  if (kp >= 7) return { level: 'critical', label: `Strong storm (G${Math.min(5, Math.floor(kp) - 4)})`, color: 'var(--critical)' };
  if (kp >= 5) return { level: 'serious', label: `Storm (G${Math.floor(kp) - 4})`, color: 'var(--serious)' };
  if (kp >= 4) return { level: 'warning', label: 'Active', color: 'var(--warning)' };
  return { level: 'good', label: 'Quiet', color: 'var(--good)' };
}

// Renders into `el`. Returns a cleanup function for the chart.
export async function renderSpaceWeather(el, loc, { compact = false } = {}) {
  el.innerHTML = '<div class="skeleton" style="height:200px"></div>';
  let rows;
  try { rows = await getKp(); } catch (e) { el.innerHTML = `<p class="error">Space-weather data unavailable: ${esc(e.message)}</p>`; return () => { }; }
  const tz = loc?.tz;
  const now = Date.now();
  const observed = rows.filter(r => r.kind !== 'predicted' && +r.t <= now);
  const latest = observed[observed.length - 1] || rows[0];
  const next24 = rows.filter(r => +r.t > now && +r.t < now + 864e5);
  const maxNext = next24.reduce((m, r) => Math.max(m, r.kp), 0);
  const lv = kpLevel(latest.kp), lvNext = kpLevel(maxNext);
  let auroraHtml = '';
  if (loc) {
    const gm = Math.abs(geomagLat(loc.lat, loc.lon));
    const need = Math.max(0, Math.ceil((66.5 - gm) / 2.2));
    const chance = maxNext >= need ? (maxNext >= need + 1 ? 'Good' : 'Possible') : 'Unlikely';
    auroraHtml = `<div class="stat"><div class="label">Aurora chance from ${esc(loc.name.split(',')[0])}</div>
      <div class="value">${chance}</div><div class="sub">${need > 9 ? 'Your latitude is too far from the auroral zones — only extreme storms reach you.' : `Needs about Kp ${need}+ (geomagnetic latitude ${gm.toFixed(0)}°). Look ${loc.lat >= 0 ? 'north' : 'south'}, away from city lights.`}</div></div>`;
  }
  el.innerHTML = `
    <div class="stat-row">
      <div class="stat"><div class="label">Kp now ${badge(lv.level, lv.label)}</div><div class="value">${latest.kp.toFixed(1)}</div><div class="sub">${fmtDateTime(latest.t, tz)}</div></div>
      <div class="stat"><div class="label">Max next 24 h ${badge(lvNext.level, lvNext.label)}</div><div class="value">${maxNext.toFixed(1)}</div><div class="sub">NOAA SWPC forecast</div></div>
      ${auroraHtml}
    </div>
    <div style="margin-top:16px" id="kpChart"></div>
    <div class="legend"><span><i style="background:var(--good)"></i>Quiet (&lt;4)</span><span><i style="background:var(--warning)"></i>Active (4)</span><span><i style="background:var(--serious)"></i>Storm (5–6)</span><span><i style="background:var(--critical)"></i>Strong storm (7+)</span><span><i style="background:repeating-linear-gradient(45deg,#888 0 2px,transparent 2px 4px)"></i>Forecast</span></div>
    ${compact ? '' : `<div class="grid-2" style="margin-top:18px">
      <figure style="margin:0"><img src="https://services.swpc.noaa.gov/images/animations/ovation/north/latest.jpg" alt="Aurora forecast, northern hemisphere" loading="lazy" style="border-radius:10px;border:1px solid var(--border)"><figcaption class="xsmall muted" style="margin-top:6px">30-minute aurora forecast — north (NOAA OVATION)</figcaption></figure>
      <figure style="margin:0"><img src="https://services.swpc.noaa.gov/images/animations/ovation/south/latest.jpg" alt="Aurora forecast, southern hemisphere" loading="lazy" style="border-radius:10px;border:1px solid var(--border)"><figcaption class="xsmall muted" style="margin-top:6px">30-minute aurora forecast — south (NOAA OVATION)</figcaption></figure>
    </div>`}`;
  const recent = rows.filter(r => +r.t > now - 3 * 864e5);
  return timeBarChart(el.querySelector('#kpChart'), {
    bars: recent.map(r => ({ ...r, v: r.kp, color: kpLevel(r.kp).color, pattern: r.kind === 'predicted' })),
    width: 3 * 3600e3, yMax: 9, yTicks: [0, 3, 6, 9], tz, height: compact ? 170 : 210, label: 'Planetary Kp index',
    tooltip: b => `<b>${fmtDateTime(b.t, tz)}</b><div class="row"><span>Kp</span><span>${b.v.toFixed(2)}</span></div><div class="row"><span>Level</span><span>${kpLevel(b.v).label}</span></div><div class="row"><span>Type</span><span>${b.kind}</span></div>`,
  });
}
