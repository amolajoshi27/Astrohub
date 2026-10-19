// Tonight's Sky: darkness timeline, Go/No-go, cloud forecast, planets, sky chart, best targets, aurora.
import { esc, fmtTime, fmtDate, fmtDateTime, badge, needLoc, compass } from '../util.js';
import { tonight, verdict, scoreRing, SEEING_TEXT } from '../conditions.js';
import { observer, altAz, radecAltAz, bodiesTonight, moonSVG, STARS, BODY_COLORS, sunAltAt, addH } from '../astro.js';
import { timeAreaChart } from '../charts.js';
import { MESSIER, TYPE_NAMES } from '../../data/messier.js';
import { renderSpaceWeather } from '../spaceweather.js';

export async function render(root, { loc }) {
  if (!loc) { root.innerHTML = needLoc("Tonight's Sky"); return; }
  const tz = loc.tz;
  const cleanups = [];
  root.innerHTML = `
  <header class="page-head"><p class="eyebrow">Tonight's sky</p><h1>${esc(loc.name)}</h1>
    <p class="lede">Darkness, Moon, weather and what's worth pointing at tonight. Times shown in ${esc(tz || 'your local time')}.</p></header>
  <section class="card timeline" id="skTimeline"><div class="skeleton" style="height:90px"></div></section>
  <section class="stat-row" id="skStats" style="margin-top:18px;grid-template-columns:repeat(auto-fit,minmax(230px,1fr))"></section>
  <section class="card"><div class="card-head"><h2>Cloud cover — next 3 days</h2><span class="xsmall muted">Shaded bands = astronomical darkness · hover for details</span></div>
    <div id="skCloud"></div><p class="small muted" id="skSeeing" style="margin:10px 0 0"></p></section>
  <section class="card" id="skPlanets"></section>
  <section class="card"><div class="card-head"><h2>Sky chart</h2><span class="xsmall muted">Looking up · N at top, E at left · drag the slider to change time</span></div><div class="skychart" id="skChart"></div></section>
  <section class="card" id="skTargets"></section>
  <section class="card"><div class="card-head"><h2>Space weather &amp; aurora</h2><a class="card-link" href="#/feeds?tab=sun">Sun &amp; space weather →</a></div><div id="skAurora"></div></section>
  <section class="card"><div class="card-head"><h2>Interactive planetarium</h2><a class="card-link" href="https://stellarium-web.org/" target="_blank" rel="noopener">Open Stellarium Web ↗</a></div>
    <div id="skVirtual"><p class="small muted">A full interactive star map (VirtualSky by Las Cumbres Observatory) set to your location.</p><button class="btn" id="loadVS">Load planetarium</button></div></section>`;

  const T = await tonight(loc);
  const n = T.night;
  const obs = observer(loc);

  // ---- Darkness timeline
  const tl = root.querySelector('#skTimeline');
  if (n.polar || !n.sunset || !n.sunrise) {
    tl.innerHTML = '<p>The Sun does not set (or rise) here in the next day — polar day/night.</p>';
  } else {
    const a = addH(n.sunset, -1), z = addH(n.sunrise, 1), span = z - a;
    let rects = '';
    const col = alt => alt > 0 ? '#2b4a7c' : alt > -6 ? '#1d3358' : alt > -12 ? '#132443' : alt > -18 ? '#0b1630' : '#04070e';
    const N = 200;
    for (let i = 0; i < N; i++) {
      const t = new Date(+a + span * (i + 0.5) / N);
      rects += `<rect x="${i * 1000 / N}" y="0" width="${1000 / N + 0.6}" height="44" fill="${col(sunAltAt(t, obs))}"/>`;
    }
    const X = t => ((+t - +a) / span) * 1000;
    const now = Date.now();
    const nowMark = now > +a && now < +z ? `<line x1="${X(now)}" x2="${X(now)}" y1="-4" y2="48" stroke="var(--violet)" stroke-width="3"/>` : '';
    const moonBar = [];
    for (let i = 0; i < N; i++) {
      const t = new Date(+a + span * (i + 0.5) / N);
      if (altAz('Moon', t, obs).alt > 0) moonBar.push(i);
    }
    const moonRects = moonBar.map(i => `<rect x="${i * 1000 / N}" y="50" width="${1000 / N + 0.6}" height="6" fill="#e9e4d4" opacity=".55"/>`).join('');
    const marks = [['Sunset', n.sunset], ['Civil dusk', n.civilDusk], ['Nautical dusk', n.nautDusk], ['Astro dusk', n.astroDusk], ['Astro dawn', n.astroDawn], ['Nautical dawn', n.nautDawn], ['Civil dawn', n.civilDawn], ['Sunrise', n.sunrise]].filter(m => m[1]);
    tl.innerHTML = `<div class="card-head"><h2>Darkness tonight</h2><span class="small dim">${n.darkness === 'astronomical' ? `Full darkness ${fmtTime(n.astroDusk, tz)} – ${fmtTime(n.astroDawn, tz)}` : `No astronomical darkness — darkest is ${n.darkness} twilight`}</span></div>
      <svg viewBox="0 -6 1000 64" preserveAspectRatio="none" style="height:70px;border-radius:8px">${rects}${moonRects}${marks.map(m => `<line x1="${X(m[1])}" x2="${X(m[1])}" y1="0" y2="44" stroke="#ffffff" stroke-opacity=".25"/>`).join('')}${nowMark}</svg>
      <div class="timeline-legend">
        <span><i style="background:#2b4a7c"></i>Daylight</span><span><i style="background:#1d3358"></i>Civil twilight</span><span><i style="background:#132443"></i>Nautical</span><span><i style="background:#0b1630"></i>Astronomical</span><span><i style="background:#04070e;border:1px solid var(--border-2)"></i>Dark</span><span><i style="background:#e9e4d4;opacity:.55"></i>Moon up</span><span><i style="background:var(--violet)"></i>Now</span>
      </div>
      <div class="table-wrap" style="margin-top:12px"><table><tr>${marks.map(m => `<th>${m[0]}</th>`).join('')}</tr><tr>${marks.map(m => `<td class="mono">${fmtTime(m[1], tz)}</td>`).join('')}</tr></table></div>`;
  }

  // ---- Stats
  const vd = verdict(T.score?.deep), vp = verdict(T.score?.planets);
  const southern = loc.lat < 0;
  root.querySelector('#skStats').innerHTML = `
    <div class="stat" style="display:flex;gap:14px;align-items:center">${scoreRing(T.score?.deep, 'Deep sky')}<div><div class="label">Galaxies &amp; nebulae</div>${badge(vd.level, vd.label)}<div class="sub">Clouds, Moon, humidity &amp; wind</div></div></div>
    <div class="stat" style="display:flex;gap:14px;align-items:center">${scoreRing(T.score?.planets, 'Planets')}<div><div class="label">Moon &amp; planets</div>${badge(vp.level, vp.label)}<div class="sub">Clouds, seeing &amp; wind</div></div></div>
    <div class="stat"><div class="label">Cloud cover (dark hours)</div><div class="value">${T.cloud != null ? Math.round(T.cloud) : '—'}<small>%</small></div><div class="sub">Humidity ${T.rh != null ? Math.round(T.rh) + '%' : '—'} · Wind ${T.wind != null ? Math.round(T.wind) + ' km/h' : '—'}${T.temp != null && T.dew != null && T.temp - T.dew < 3 ? ' · <span style="color:var(--warning)">Dew risk</span>' : ''}</div></div>
    <div class="stat"><div class="label">Seeing / transparency</div><div class="value" style="font-size:1.35rem">${SEEING_TEXT(T.seeAvg)} <small>/ ${SEEING_TEXT(T.transAvg)}</small></div><div class="sub">${T.seeAvg != null ? 'Estimated from jet-stream wind &amp; humidity' : 'Unavailable right now'}</div></div>
    <div class="stat" style="display:flex;gap:14px;align-items:center">${moonSVG(n.moon.phase, 64, southern)}<div><div class="label">${n.moon.name}</div><div class="value" style="font-size:1.4rem">${Math.round(n.moon.illum * 100)}<small>% lit</small></div><div class="sub">Rise ${fmtTime(n.moon.rise, tz)} · Set ${fmtTime(n.moon.set, tz)}<br>Full ${fmtDate(n.moon.nextFull, tz)} · New ${fmtDate(n.moon.nextNew, tz)}</div></div></div>`;

  // ---- Cloud chart
  const cloudEl = root.querySelector('#skCloud');
  if (T.hours.length) {
    const bands = [];
    let cur = null;
    for (let t = +T.hours[0].t; t <= +T.hours[T.hours.length - 1].t; t += 15 * 60e3) {
      const dark = sunAltAt(new Date(t), obs) < -18;
      if (dark && !cur) cur = { start: new Date(t) };
      if (!dark && cur) { cur.end = new Date(t); bands.push(cur); cur = null; }
    }
    if (cur) { cur.end = T.hours[T.hours.length - 1].t; bands.push(cur); }
    cleanups.push(timeAreaChart(cloudEl, {
      points: T.hours.map(h => ({ ...h, v: h.cloud })), yMax: 100, yTicks: [0, 25, 50, 75, 100], yUnit: '%', bands, tz, label: 'Cloud cover forecast',
      tooltip: p => `<b>${fmtDateTime(p.t, tz)}</b>
        <div class="row"><span>Total cloud</span><span>${p.cloud}%</span></div>
        <div class="row"><span>Low / mid / high</span><span>${p.low} / ${p.mid} / ${p.high}%</span></div>
        <div class="row"><span>Humidity</span><span>${p.rh}%</span></div>
        <div class="row"><span>Wind</span><span>${Math.round(p.wind)} km/h</span></div>
        <div class="row"><span>Temp / dew point</span><span>${Math.round(p.temp)}° / ${Math.round(p.dew)}°</span></div>`,
    }));
  } else cloudEl.innerHTML = '<p class="error">Weather forecast unavailable right now.</p>';
  if (T.seeing.length) {
    const nextNight = T.seeing.filter((p, i) => n.darkStart && p.t >= addH(n.darkStart, -0.5) && p.t <= n.darkEnd && i % 2 === 0);
    root.querySelector('#skSeeing').innerHTML = nextNight.length
      ? `Estimated seeing tonight: ${nextNight.map(p => `<span class="nowrap">${fmtTime(p.t, tz)} <b class="dim">${SEEING_TEXT(p.seeing)}</b></span>`).join(' · ')}`
      : '';
  }

  // ---- Planets table
  const bodies = bodiesTonight(loc, n);
  root.querySelector('#skPlanets').innerHTML = `<div class="card-head"><h2>Moon &amp; planets</h2><span class="xsmall muted">Best = highest during twilight/night</span></div>
    <div class="table-wrap"><table><thead><tr><th>Object</th><th>Now</th><th>Rise</th><th>Set</th><th>Best tonight</th><th>Mag</th></tr></thead><tbody>
    ${bodies.map(b => {
      const up = b.cur.alt > 0;
      const good = b.best.alt > 10 && (b.elong == null || b.elong > 12);
      return `<tr${good ? '' : ' style="opacity:.55"'}><td class="nowrap"><span class="dot" style="background:${BODY_COLORS[b.name]}"></span><b>${b.name}</b><div class="xsmall muted" style="margin-left:17px">${esc(b.con)}</div></td>
        <td class="nowrap">${up ? `${Math.round(b.cur.alt)}° ${compass(b.cur.az)}` : '<span class="muted">below</span>'}</td>
        <td class="mono">${fmtTime(b.rise, tz)}</td><td class="mono">${fmtTime(b.set, tz)}</td>
        <td class="nowrap">${good ? `${fmtTime(b.best.t, tz)} · ${Math.round(b.best.alt)}° ${compass(b.best.az)}` : '<span class="muted">Not visible</span>'}</td>
        <td class="mono">${b.mag.toFixed(1)}</td></tr>`;
    }).join('')}</tbody></table></div>`;

  // ---- Sky chart with time slider
  const chartEl = root.querySelector('#skChart');
  const from = n.civilDusk || n.sunset || new Date(), to = n.civilDawn || n.sunrise || addH(from, 12);
  const steps = Math.max(1, Math.round((to - from) / (15 * 60e3)));
  let idx = Date.now() > +from && Date.now() < +to ? Math.round((Date.now() - from) / (15 * 60e3)) : Math.round(((n.darkStart || from) - from) / (15 * 60e3));
  let showDSO = false;
  chartEl.innerHTML = `<svg id="skySvg" viewBox="0 0 500 500"></svg>
    <div class="controls"><input type="range" id="skyT" min="0" max="${steps}" value="${idx}" aria-label="Time">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-top:6px"><b id="skyTime" class="mono"></b>
      <label class="small dim" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="skyDSO"> Show Messier objects</label></div></div>`;
  const drawSky = () => {
    const t = new Date(+from + idx * 15 * 60e3);
    root.querySelector('#skyTime').textContent = fmtDateTime(t, tz);
    const R = 235, c = 250;
    const P = (alt, az) => { const r = R * (90 - alt) / 90, a = az * Math.PI / 180; return [c - r * Math.sin(a), c - r * Math.cos(a)]; };
    let s = `<defs><radialGradient id="skyBg"><stop offset="0" stop-color="#0d1630"/><stop offset="1" stop-color="#060a16"/></radialGradient></defs>
      <circle cx="${c}" cy="${c}" r="${R}" fill="url(#skyBg)" stroke="var(--border-2)"/>
      <circle cx="${c}" cy="${c}" r="${R * 2 / 3}" fill="none" stroke="var(--border)" stroke-dasharray="3 4"/>
      <circle cx="${c}" cy="${c}" r="${R / 3}" fill="none" stroke="var(--border)" stroke-dasharray="3 4"/>
      <line x1="${c - R}" x2="${c + R}" y1="${c}" y2="${c}" stroke="var(--border)"/><line y1="${c - R}" y2="${c + R}" x1="${c}" x2="${c}" stroke="var(--border)"/>
      <text x="${c}" y="10" text-anchor="middle" fill="var(--text-2)" font-size="13" font-weight="600">N</text>
      <text x="${c}" y="498" text-anchor="middle" fill="var(--text-2)" font-size="13" font-weight="600">S</text>
      <text x="4" y="${c + 4}" fill="var(--text-2)" font-size="13" font-weight="600">E</text>
      <text x="496" y="${c + 4}" text-anchor="end" fill="var(--text-2)" font-size="13" font-weight="600">W</text>
      <text x="${c + 3}" y="${c - R / 3 + 12}" fill="var(--muted)" font-size="10">60°</text><text x="${c + 3}" y="${c - R * 2 / 3 + 12}" fill="var(--muted)" font-size="10">30°</text>`;
    for (const [name, ra, dec, mag] of STARS) {
      const p = radecAltAz(ra, dec, t, obs);
      if (p.alt < 0) continue;
      const [x, y] = P(p.alt, p.az);
      const r = Math.max(1, 3.4 - mag * 0.75);
      s += `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" opacity="${mag < 1.5 ? 0.95 : 0.7}"><title>${name} (mag ${mag})</title></circle>`;
      if (mag < 1.0) s += `<text x="${x + 5}" y="${y - 4}" fill="var(--muted)" font-size="10">${name}</text>`;
    }
    if (showDSO) for (const m of MESSIER) {
      const p = radecAltAz(m.ra, m.dec, t, obs);
      if (p.alt < 5) continue;
      const [x, y] = P(p.alt, p.az);
      s += `<rect x="${x - 3}" y="${y - 3}" width="6" height="6" fill="none" stroke="var(--violet)" stroke-width="1.2"><title>${m.id}${m.name ? ' ' + m.name : ''}</title></rect><text x="${x + 5}" y="${y + 3}" fill="var(--violet)" font-size="9">${m.id}</text>`;
    }
    for (const b of ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Moon']) {
      const p = altAz(b, t, obs);
      if (p.alt < 0) continue;
      const [x, y] = P(p.alt, p.az);
      if (b === 'Moon') {
        s += `<g transform="translate(${x - 11},${y - 11})">${moonSVG(window.Astronomy.MoonPhase(t), 22, southern)}</g>`;
      } else {
        s += `<circle cx="${x}" cy="${y}" r="5.5" fill="${BODY_COLORS[b]}" stroke="#060912" stroke-width="2"/>`;
      }
      s += `<text x="${x + 10}" y="${y + 4}" fill="${BODY_COLORS[b]}" font-size="12" font-weight="600">${b}</text>`;
    }
    root.querySelector('#skySvg').innerHTML = s;
  };
  root.querySelector('#skyT').addEventListener('input', e => { idx = +e.target.value; drawSky(); });
  root.querySelector('#skyDSO').addEventListener('change', e => { showDSO = e.target.checked; drawSky(); });
  drawSky();

  // ---- Best deep-sky targets
  const ds = n.darkStart || from, de = n.darkEnd || to;
  const targets = MESSIER.map(m => {
    let best = { alt: -90, t: null };
    for (let t = +ds; t <= +de; t += 30 * 60e3) { const p = radecAltAz(m.ra, m.dec, new Date(t), obs); if (p.alt > best.alt) best = { alt: p.alt, t: new Date(t), az: p.az }; }
    return { ...m, best, score: best.alt - m.mag * 4 };
  }).filter(m => m.best.alt > 30).sort((a, b) => b.score - a.score).slice(0, 12);
  root.querySelector('#skTargets').innerHTML = `<div class="card-head"><h2>Best Messier targets tonight</h2><a class="card-link" href="#/messier">Full Messier checklist →</a></div>
    ${n.moon.illumMid > 0.6 && n.moon.upFrac > 0.5 ? '<p class="small" style="color:var(--warning)">Bright Moon tonight — favour clusters over faint galaxies.</p>' : ''}
    <div class="table-wrap"><table><thead><tr><th>Object</th><th>Type</th><th>Constellation</th><th>Mag</th><th>Highest</th><th></th></tr></thead><tbody>
    ${targets.map(m => `<tr><td><b>${m.id}</b> ${m.name ? `<span class="dim">${esc(m.name)}</span>` : ''}</td><td>${TYPE_NAMES[m.type]}</td><td>${esc(m.con)}</td><td class="mono">${m.mag}</td>
      <td class="nowrap">${fmtTime(m.best.t, tz)} · ${Math.round(m.best.alt)}° ${compass(m.best.az)}</td><td><a class="btn sm" href="#/log?obj=${m.id}">Log</a></td></tr>`).join('') || '<tr><td colspan="6" class="muted">No targets above 30° during darkness.</td></tr>'}
    </tbody></table></div>`;

  // ---- Space weather
  renderSpaceWeather(root.querySelector('#skAurora'), loc, { compact: true }).then(c => cleanups.push(c));

  // ---- VirtualSky
  root.querySelector('#loadVS').addEventListener('click', () => {
    root.querySelector('#skVirtual').innerHTML = `<div class="frame" style="aspect-ratio:4/3"><iframe src="https://virtualsky.lco.global/embed/index.html?longitude=${loc.lon}&latitude=${loc.lat}&projection=stereo&constellations=true&constellationlabels=true&showplanets=true&showplanetlabels=true&showstarlabels=true&gridlines_az=true&live=true&az=180" title="VirtualSky planetarium" allowfullscreen loading="lazy"></iframe></div>`;
  });

  return () => cleanups.forEach(c => c && c());
}
