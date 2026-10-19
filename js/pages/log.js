// Observing log stored in this browser (IndexedDB), with photo, export and import.
import { esc, store, hashParams, fmtDateTime, downloadFile, lightbox } from '../util.js';

const DB = 'astrohub', STORE = 'log';
function db() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function tx(mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => res(out?.result ?? out);
    t.onerror = () => rej(t.error);
  });
}
const allEntries = () => tx('readonly', s => s.getAll());
const putEntry = e => tx('readwrite', s => s.put(e));
const delEntry = id => tx('readwrite', s => s.delete(id));

function shrink(file, max = 1400) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      res(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = rej;
    img.src = URL.createObjectURL(file);
  });
}

function markMessier(obj) {
  const m = String(obj).toUpperCase().match(/\bM\s?(\d{1,3})\b/);
  if (m && +m[1] >= 1 && +m[1] <= 110) {
    const seen = new Set(store.get('messierSeen', []));
    seen.add('M' + +m[1]);
    store.set('messierSeen', [...seen]);
  }
}

const localISO = d => new Date(+d - d.getTimezoneOffset() * 60e3).toISOString().slice(0, 16);
const stars = n => '★'.repeat(n) + '<span class="muted">' + '★'.repeat(5 - n) + '</span>';

export async function render(root, { loc }) {
  const pre = hashParams().get('obj') || '';
  const equip = store.get('equipment', {});
  let editing = null, photo = null, query = '';
  root.innerHTML = `
  <header class="page-head"><p class="eyebrow">Observing log</p><h1>My observations</h1>
    <p class="lede">Record what you saw, when, with what, and how the sky was. Saved privately in this browser — use Export to back it up or move it to another computer.</p></header>
  <div class="stat-row" id="lStats"></div>
  <section class="card"><h2 id="lFormTitle">New entry</h2>
    <div class="form-grid">
      <label class="field">Object<input type="text" id="fObj" placeholder="e.g. M31, Jupiter, Orion Nebula" value="${esc(pre)}"></label>
      <label class="field">Date &amp; time<input type="datetime-local" id="fDate" value="${localISO(new Date())}"></label>
      <label class="field">Location<input type="text" id="fLoc" value="${esc(loc?.name || '')}"></label>
      <label class="field">Equipment<input type="text" id="fEq" value="${esc(equip.scopeName || '')}" placeholder="e.g. 8&quot; Dobsonian, 25 mm"></label>
      <label class="field">Seeing (1–5)<select id="fSee">${[5, 4, 3, 2, 1].map(v => `<option value="${v}" ${v === 3 ? 'selected' : ''}>${v} – ${['Very poor', 'Poor', 'Average', 'Good', 'Excellent'][v - 1]}</option>`).join('')}</select></label>
      <label class="field">Transparency (1–5)<select id="fTr">${[5, 4, 3, 2, 1].map(v => `<option value="${v}" ${v === 3 ? 'selected' : ''}>${v} – ${['Very poor', 'Poor', 'Average', 'Good', 'Excellent'][v - 1]}</option>`).join('')}</select></label>
      <label class="field">Rating<select id="fRate">${[5, 4, 3, 2, 1].map(v => `<option value="${v}" ${v === 4 ? 'selected' : ''}>${'★'.repeat(v)}</option>`).join('')}</select></label>
      <label class="field">Photo or sketch<input type="file" id="fPhoto" accept="image/*" style="padding:6px"></label>
      <label class="field full">Notes<textarea id="fNotes" placeholder="What did it look like? Magnification, filters, details you noticed…"></textarea></label>
    </div>
    <div class="toolbar" style="margin:14px 0 0"><button class="btn primary" id="fSave">Save entry</button><button class="btn ghost" id="fCancel" hidden>Cancel edit</button><span class="small muted" id="fMsg"></span></div>
  </section>
  <div class="toolbar" style="margin-top:22px"><input type="search" class="grow" id="lQ" placeholder="Search your log…" style="max-width:340px"><span class="grow"></span>
    <button class="btn sm" id="lExport">Export JSON</button><label class="btn sm">Import JSON<input type="file" id="lImport" accept="application/json" hidden></label></div>
  <div id="lList"></div>`;
  const $ = id => root.querySelector('#' + id);

  async function draw() {
    let list;
    try { list = await allEntries(); } catch (e) { $('lList').innerHTML = `<p class="error">Storage unavailable: ${esc(e.message)}</p>`; return; }
    list.sort((a, b) => b.date.localeCompare(a.date));
    const objs = new Set(list.map(e => e.object.toLowerCase()));
    const nights = new Set(list.map(e => e.date.slice(0, 10)));
    $('lStats').innerHTML = `<div class="stat"><div class="label">Entries</div><div class="value">${list.length}</div></div>
      <div class="stat"><div class="label">Different objects</div><div class="value">${objs.size}</div></div>
      <div class="stat"><div class="label">Observing nights</div><div class="value">${nights.size}</div></div>
      <div class="stat"><div class="label">Messier observed</div><div class="value">${store.get('messierSeen', []).length}<small> / 110</small></div></div>`;
    const q = query.toLowerCase();
    const shown = list.filter(e => !q || `${e.object} ${e.notes} ${e.location} ${e.equipment}`.toLowerCase().includes(q));
    $('lList').innerHTML = shown.map(e => `<div class="card log-entry">
      ${e.photo ? `<img src="${e.photo}" alt="${esc(e.object)}" data-zoom>` : '<div class="noimg">✦</div>'}
      <div><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><h3 style="margin:0">${esc(e.object)}</h3><span class="stars-rating">${stars(e.rating)}</span></div>
        <p class="small muted" style="margin:2px 0 8px">${fmtDateTime(new Date(e.date))} · ${esc(e.location || '—')} · ${esc(e.equipment || '—')} · Seeing ${e.seeing}/5 · Transparency ${e.transparency}/5</p>
        <p style="white-space:pre-wrap;margin-bottom:8px">${esc(e.notes)}</p>
        <div class="toolbar" style="margin:0"><button class="btn sm ghost" data-edit="${e.id}">Edit</button><button class="btn sm ghost danger" data-del="${e.id}">Delete</button></div></div></div>`).join('')
      || `<p class="empty">${list.length ? 'No entries match your search.' : 'No observations yet — your first entry is one clear night away.'}</p>`;
    $('lList').querySelectorAll('[data-zoom]').forEach(i => i.addEventListener('click', () => lightbox(i.src)));
    $('lList').querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
      if (confirm('Delete this log entry? This cannot be undone.')) { await delEntry(b.dataset.del); draw(); }
    }));
    $('lList').querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => {
      const e = list.find(x => x.id === b.dataset.edit);
      editing = e; photo = e.photo || null;
      $('fObj').value = e.object; $('fDate').value = localISO(new Date(e.date)); $('fLoc').value = e.location; $('fEq').value = e.equipment;
      $('fSee').value = e.seeing; $('fTr').value = e.transparency; $('fRate').value = e.rating; $('fNotes').value = e.notes;
      $('lFormTitle').textContent = 'Edit entry'; $('fCancel').hidden = false;
      $('lFormTitle').scrollIntoView({ behavior: 'smooth' });
    }));
  }

  function resetForm() {
    editing = null; photo = null;
    ['fObj', 'fNotes'].forEach(id => { $(id).value = ''; });
    $('fPhoto').value = ''; $('fDate').value = localISO(new Date());
    $('lFormTitle').textContent = 'New entry'; $('fCancel').hidden = true;
  }

  $('fPhoto').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    $('fMsg').textContent = 'Processing photo…';
    try { photo = await shrink(f); $('fMsg').textContent = 'Photo ready.'; } catch { $('fMsg').textContent = 'Could not read that image.'; }
  });
  $('fSave').addEventListener('click', async () => {
    const obj = $('fObj').value.trim();
    if (!obj) { $('fMsg').textContent = 'Please enter what you observed.'; return; }
    const entry = {
      id: editing?.id || String(Date.now()), object: obj, date: new Date($('fDate').value || Date.now()).toISOString(),
      location: $('fLoc').value.trim(), equipment: $('fEq').value.trim(), seeing: +$('fSee').value, transparency: +$('fTr').value,
      rating: +$('fRate').value, notes: $('fNotes').value.trim(), photo,
    };
    try {
      await putEntry(entry);
      markMessier(obj);
      $('fMsg').textContent = editing ? 'Entry updated.' : 'Entry saved.';
      resetForm(); draw();
    } catch (e) { $('fMsg').textContent = 'Could not save: ' + e.message; }
  });
  $('fCancel').addEventListener('click', resetForm);
  $('lQ').addEventListener('input', e => { query = e.target.value; draw(); });
  $('lExport').addEventListener('click', async () => {
    const list = await allEntries();
    downloadFile(`astrohub-log-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ version: 1, entries: list, messierSeen: store.get('messierSeen', []) }, null, 1));
  });
  $('lImport').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const j = JSON.parse(await f.text());
      const entries = j.entries || [];
      for (const en of entries) if (en.id && en.object && en.date) await putEntry(en);
      if (Array.isArray(j.messierSeen)) store.set('messierSeen', [...new Set([...store.get('messierSeen', []), ...j.messierSeen])]);
      alert(`Imported ${entries.length} entries.`);
      draw();
    } catch (err) { alert('Import failed: ' + err.message); }
    e.target.value = '';
  });
  draw();
}
