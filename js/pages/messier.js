// Messier checklist with live altitude and tonight's visibility.
import { esc, store, fmtTime, compass } from '../util.js';
import { MESSIER, TYPE_NAMES } from '../../data/messier.js';
import { observer, radecAltAz, nightInfo } from '../astro.js';

export async function render(root, { loc }) {
  const tz = loc?.tz;
  const seen = new Set(store.get('messierSeen', []));
  let filter = { q: '', type: '', vis: false, hideSeen: false, sort: 'n' };
  let rows = MESSIER.map(m => ({ ...m }));
  if (loc) {
    const obs = observer(loc), n = nightInfo(loc), now = new Date();
    const ds = n.darkStart || now, de = n.darkEnd || new Date(+now + 8 * 3600e3);
    rows.forEach(m => {
      m.now = radecAltAz(m.ra, m.dec, now, obs);
      m.best = { alt: -90 };
      for (let t = +ds; t <= +de; t += 30 * 60e3) { const p = radecAltAz(m.ra, m.dec, new Date(t), obs); if (p.alt > m.best.alt) m.best = { ...p, t: new Date(t) }; }
      m.maxEver = 90 - Math.abs(loc.lat - m.dec);
    });
  }

  root.innerHTML = `
  <header class="page-head"><p class="eyebrow">Observing challenge</p><h1>Messier checklist</h1>
    <p class="lede">Charles Messier's 110 deep-sky objects — the classic list for amateur astronomers. Tick them off as you observe them; entries in your Observing Log tick them automatically.</p></header>
  <div class="card"><div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap"><h2 id="mCount"></h2><span class="small muted">Saved in this browser</span></div><div class="progress"><i id="mBar"></i></div></div>
  <div class="toolbar" style="margin-top:18px">
    <input type="search" class="grow" id="mQ" placeholder="Search name, number or constellation…" style="max-width:340px">
    <select id="mType" style="width:auto"><option value="">All types</option>${Object.entries(TYPE_NAMES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
    <select id="mSort" style="width:auto"><option value="n">Sort: number</option><option value="mag">Sort: brightness</option>${loc ? '<option value="alt">Sort: highest tonight</option>' : ''}</select>
    ${loc ? '<label class="small dim" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="mVis"> Well placed tonight</label>' : ''}
    <label class="small dim" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="mHide"> Hide observed</label>
  </div>
  <div class="card"><div class="table-wrap"><table><thead><tr><th>Seen</th><th>Object</th><th>Type</th><th>Constellation</th><th>Mag</th>${loc ? '<th>Now</th><th>Best tonight</th>' : ''}<th></th></tr></thead><tbody id="mRows"></tbody></table></div></div>`;

  const draw = () => {
    root.querySelector('#mCount').textContent = `${seen.size} of 110 observed`;
    root.querySelector('#mBar').style.width = (seen.size / 110 * 100) + '%';
    const q = filter.q.toLowerCase();
    let list = rows.filter(m => (!q || `${m.id} ${m.name} ${m.con} m ${m.n}`.toLowerCase().includes(q))
      && (!filter.type || m.type === filter.type) && (!filter.vis || m.best?.alt > 30) && (!filter.hideSeen || !seen.has(m.id)));
    if (filter.sort === 'mag') list.sort((a, b) => a.mag - b.mag);
    if (filter.sort === 'alt') list.sort((a, b) => (b.best?.alt ?? -90) - (a.best?.alt ?? -90));
    root.querySelector('#mRows').innerHTML = list.map(m => `<tr class="${seen.has(m.id) ? 'observed' : ''}">
      <td><input type="checkbox" data-id="${m.id}" ${seen.has(m.id) ? 'checked' : ''} aria-label="Observed ${m.id}"></td>
      <td class="name"><b>${m.id}</b> ${m.name ? `<span class="dim">${esc(m.name)}</span>` : ''}</td>
      <td>${TYPE_NAMES[m.type]}</td><td>${esc(m.con)}</td><td class="mono">${m.mag}</td>
      ${loc ? `<td class="nowrap">${m.now.alt > 0 ? `${Math.round(m.now.alt)}° ${compass(m.now.az)}` : '<span class="muted">below</span>'}</td>
      <td class="nowrap">${m.maxEver < 5 ? '<span class="muted">Never rises here</span>' : m.best.alt > 15 ? `${fmtTime(m.best.t, tz)} · ${Math.round(m.best.alt)}°` : '<span class="muted">Not tonight</span>'}</td>` : ''}
      <td><a class="btn sm ghost" href="#/log?obj=${m.id}">Log</a></td></tr>`).join('') || `<tr><td colspan="8" class="muted">No objects match.</td></tr>`;
  };
  root.querySelector('#mRows').addEventListener('change', e => {
    const id = e.target.dataset.id; if (!id) return;
    e.target.checked ? seen.add(id) : seen.delete(id);
    store.set('messierSeen', [...seen]);
    draw();
  });
  root.querySelector('#mQ').addEventListener('input', e => { filter.q = e.target.value; draw(); });
  root.querySelector('#mType').addEventListener('change', e => { filter.type = e.target.value; draw(); });
  root.querySelector('#mSort').addEventListener('change', e => { filter.sort = e.target.value; draw(); });
  root.querySelector('#mVis')?.addEventListener('change', e => { filter.vis = e.target.checked; draw(); });
  root.querySelector('#mHide').addEventListener('change', e => { filter.hideSeen = e.target.checked; draw(); });
  draw();
}
