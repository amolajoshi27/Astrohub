// ISS: live video, live map with ground track, pass predictions, crew.
import { esc, fmtDateTime, fmtTime, relTime, compass, duration, badge } from '../util.js';
import { loadISS, issState, groundTrack, findPasses } from '../iss-calc.js';
import { getCrew } from '../data.js';

// NASA's official 24/7 ISS streams on YouTube (IDs as of Oct 2026). If NASA restarts a stream its ID
// changes — paste the new ID in Settings to override.
const STREAMS = [
  { id: 'awQzjn72bI0', label: 'HD Earth views' },
  { id: 'M3HKLzjvKPc', label: 'Station cameras' },
];
const embed = id => `https://www.youtube.com/embed/${encodeURIComponent(id)}?autoplay=1&mute=1`;

export async function render(root, { loc, settings }) {
  const tz = loc?.tz;
  const video = embed(settings.issVideo || STREAMS[0].id);
  root.innerHTML = `
  <header class="page-head"><p class="eyebrow">International Space Station</p><h1>ISS live</h1>
    <p class="lede">Watch Earth from orbit, see where the station is right now, and find out when it will fly over you.</p></header>
  <div class="iss-layout">
    <div class="card"><div class="card-head"><h2>Live video</h2><span class="xsmall muted">Stream may show a blue screen or replay during signal loss</span></div>
      <div class="frame"><iframe id="issVid" src="${video}" title="ISS live video" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div>
      <div class="toolbar" style="margin:12px 0 0">
        ${settings.issVideo ? '<span class="chip active">Custom stream</span>' : `<div class="chips" id="vidChips">${STREAMS.map((s, i) => `<button class="chip${i ? '' : ' active'}" data-id="${s.id}">${s.label}</button>`).join('')}</div>`}
        <a class="btn sm" href="https://www.youtube.com/@NASA/streams" target="_blank" rel="noopener">All NASA streams ↗</a>
        <button class="btn sm ghost" data-action="set-location" title="If a stream stops working, paste its new YouTube ID in Settings">Stream not working?</button>
      </div></div>
    <div class="card"><div class="card-head"><h2>Right now</h2><span id="issLight"></span></div>
      <div class="stat-row" style="grid-template-columns:1fr 1fr" id="issStats"><div class="skeleton" style="height:80px"></div></div></div>
  </div>
  <section class="card"><div class="card-head"><h2>Live position</h2><span class="xsmall muted">Solid line: next 90 min · dashed: last 45 min · shaded circle: area that can see the ISS</span></div><div id="issMap"></div></section>
  <section class="card" id="issPasses"></section>
  <section class="card" id="issCrew"><div class="card-head"><h2>People in space</h2></div><div class="skeleton" style="height:80px"></div></section>`;

  root.querySelector('#vidChips')?.addEventListener('click', e => {
    const b = e.target.closest('[data-id]'); if (!b) return;
    root.querySelectorAll('#vidChips .chip').forEach(c => c.classList.toggle('active', c === b));
    root.querySelector('#issVid').src = embed(b.dataset.id);
  });

  try { await loadISS(); } catch (e) {
    root.querySelector('#issStats').innerHTML = `<p class="error">Orbit data unavailable: ${esc(e.message)}</p>`;
    return;
  }

  // ---- Map
  const L = window.L;
  const map = L.map('issMap', { worldCopyJump: true, minZoom: 1, zoomSnap: 0.5 }).setView([0, 0], 1.5);
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ', maxZoom: 16,
  }).addTo(map);
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', { maxZoom: 16 }).addTo(map);
  const icon = L.divIcon({ className: '', html: '<div class="iss-icon">🛰️</div>', iconSize: [28, 28], iconAnchor: [14, 14] });
  const marker = L.marker([0, 0], { icon }).addTo(map);
  const foot = L.circle([0, 0], { radius: 1, color: '#7ea6ff', weight: 1, fillOpacity: 0.08 }).addTo(map);
  if (loc) L.circleMarker([loc.lat, loc.lon], { radius: 6, color: '#b79dff', fillColor: '#b79dff', fillOpacity: 0.9 }).addTo(map).bindTooltip(esc(loc.name));
  let trackLayers = [];
  const drawTrack = () => {
    trackLayers.forEach(l => l.remove());
    trackLayers = [
      ...groundTrack(-45, 0).map(seg => L.polyline(seg, { color: '#7ea6ff', weight: 2, opacity: 0.5, dashArray: '4 6' })),
      ...groundTrack(0, 90).map(seg => L.polyline(seg, { color: '#7ea6ff', weight: 2, opacity: 0.9 })),
    ];
    trackLayers.forEach(l => l.addTo(map));
  };
  drawTrack();
  let first = true, ticks = 0;
  const tick = () => {
    const s = issState();
    if (!s) return;
    marker.setLatLng([s.lat, s.lon]);
    const RE = 6371;
    foot.setLatLng([s.lat, s.lon]).setRadius(RE * Math.acos(RE / (RE + s.alt)) * 1000);
    if (first) { map.setView([s.lat, s.lon], 2); first = false; }
    if (++ticks % 60 === 0) drawTrack();
    root.querySelector('#issLight').innerHTML = s.sunlit ? badge('warning', 'In sunlight') : badge('neutral', "In Earth's shadow");
    root.querySelector('#issStats').innerHTML = `
      <div class="stat"><div class="label">Latitude</div><div class="value" style="font-size:1.5rem">${s.lat.toFixed(2)}°</div></div>
      <div class="stat"><div class="label">Longitude</div><div class="value" style="font-size:1.5rem">${s.lon.toFixed(2)}°</div></div>
      <div class="stat"><div class="label">Altitude</div><div class="value" style="font-size:1.5rem">${Math.round(s.alt)} <small>km</small></div></div>
      <div class="stat"><div class="label">Speed</div><div class="value" style="font-size:1.5rem">${Math.round(s.speed).toLocaleString()} <small>km/h</small></div></div>`;
  };
  tick();
  const timer = setInterval(tick, 1000);

  // ---- Passes
  const pEl = root.querySelector('#issPasses');
  if (!loc) {
    pEl.innerHTML = '<div class="card-head"><h2>Passes over you</h2></div><p class="muted">Set your location to predict passes.</p><button class="btn primary" data-action="set-location">Set location</button>';
  } else {
    const passes = findPasses(loc, { days: 21 });
    const vis = passes.filter(p => p.visible);
    pEl.innerHTML = `<div class="card-head"><h2>Visible passes over ${esc(loc.name.split(',')[0])} — next 3 weeks</h2><label class="small dim" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="showAll"> Show all passes</label></div>
      <p class="small muted">"Visible" means the ISS is sunlit while your sky is dark — it looks like a bright, steady, fast-moving star. Elevation 90° = straight overhead.</p>
      <div class="table-wrap"><table><thead><tr><th>Starts</th><th></th><th>Max height</th><th>Direction</th><th>Duration</th><th>Status</th></tr></thead><tbody id="passRows"></tbody></table></div>`;
    const rows = all => (all ? passes : vis).map(p => {
      const s = p.visible ? p.visStart : p.start, e = p.visible ? p.visEnd : p.end;
      const maxEl = p.visible ? p.visMaxEl : p.maxEl;
      return `<tr><td class="nowrap"><b>${fmtDateTime(s, tz)}</b></td><td class="small muted nowrap">${relTime(s)}</td>
        <td class="mono">${Math.round(maxEl)}°</td><td class="nowrap">${compass(p.startAz)} → ${compass(p.maxAz)} → ${compass(p.endAz)}</td>
        <td class="nowrap">${duration(e - s + 20e3)}</td>
        <td>${p.visible ? (maxEl > 40 ? badge('good', 'Great') : badge('good', 'Visible')) : badge('neutral', 'Not visible')}</td></tr>`;
    }).join('') || '<tr><td colspan="6" class="muted">No visible passes in this period — the ISS is only visible in certain weeks, then not for a while.</td></tr>';
    const tb = pEl.querySelector('#passRows');
    tb.innerHTML = rows(false);
    pEl.querySelector('#showAll').addEventListener('change', e => { tb.innerHTML = rows(e.target.checked); });
  }

  // ---- Crew
  getCrew().then(j => {
    const people = j.people || [];
    root.querySelector('#issCrew').innerHTML = `<div class="card-head"><h2>People in space right now: ${people.length}</h2>${j.iss_expedition ? `<span class="small muted">ISS Expedition ${esc(j.iss_expedition)}</span>` : ''}</div>
      <div class="cards" style="grid-template-columns:repeat(auto-fill,minmax(210px,1fr))">${people.map(p => `<div class="stat" style="display:flex;gap:12px;align-items:center">
        ${p.image ? `<img src="${esc(p.image)}" alt="" style="width:48px;height:48px;border-radius:50%;object-fit:cover" loading="lazy" onerror="this.remove()">` : ''}
        <div><b>${esc(p.name)}</b><div class="xsmall muted">${esc([p.agency, p.position].filter(Boolean).join(' · '))}</div><div class="xsmall dim">${esc(p.spacecraft || p.craft || '')}${p.iss ? ' · aboard ISS' : ''}</div></div></div>`).join('')}</div>`;
  }).catch(() => { root.querySelector('#issCrew').innerHTML = '<div class="card-head"><h2>People in space</h2></div><p class="small muted">Crew list unavailable right now.</p>'; });

  return () => { clearInterval(timer); map.remove(); };
}
