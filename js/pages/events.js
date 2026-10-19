// Events: computed sky events, rocket launches & spaceflight events, and your own local events.
import { esc, fmtDate, fmtTime, fmtDateTime, badge, needLoc, store, downloadFile, relTime } from '../util.js';
import { computeSkyEvents } from '../astro.js';
import { getLaunches, getSpaceEvents } from '../data.js';

const CATS = {
  eclipse: ['Eclipses', '#ef5a52'], meteor: ['Meteor showers', '#b79dff'], planet: ['Planets', '#e3b341'],
  conjunction: ['Conjunctions', '#7ea6ff'], moon: ['Moon phases', '#e9e4d4'], season: ['Seasons', '#3fc383'],
  launch: ['Launches', '#f0883e'], space: ['Spaceflight', '#5fd4d4'], local: ['My local events', '#ff7eb6'],
};

function ics(e) {
  const f = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const end = new Date(+e.date + (e.allDay ? 864e5 : 3600e3));
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//AstroHub//EN', 'BEGIN:VEVENT',
    `UID:${+e.date}-${e.title.replace(/\W/g, '')}@astrohub`, `DTSTAMP:${f(new Date())}`,
    `DTSTART:${f(e.date)}`, `DTEND:${f(end)}`, `SUMMARY:${e.title}`, `DESCRIPTION:${(e.detail || '').replace(/\n/g, ' ')}`,
    e.place ? `LOCATION:${e.place}` : '', 'END:VEVENT', 'END:VCALENDAR'].filter(Boolean).join('\r\n');
}

export async function render(root, { loc }) {
  const tz = loc?.tz;
  const active = new Set(store.get('eventCats', Object.keys(CATS).filter(c => c !== 'moon')));
  let onlyHighlights = false;
  root.innerHTML = `
  <header class="page-head"><p class="eyebrow">Events</p><h1>What's happening</h1>
    <p class="lede">Eclipses, meteor showers, planetary events and conjunctions for the next 12 months — calculated for your location — plus rocket launches and your own club or star-party events.</p></header>
  <div class="toolbar"><div class="chips" id="eCats">${Object.entries(CATS).map(([k, [l, c]]) => `<button class="chip" data-c="${k}" aria-pressed="${active.has(k)}"><span class="cat-dot" style="background:${c}"></span>${l}</button>`).join('')}</div></div>
  <div class="toolbar"><label class="small dim" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="eHi"> Highlights only</label><span class="grow"></span><button class="btn sm" id="eAdd">+ Add local event</button></div>
  <div class="card" id="eForm" hidden><h3>Add a local event</h3>
    <div class="form-grid"><label class="field">Title<input type="text" id="lfTitle" placeholder="Star party at …"></label>
    <label class="field">Date &amp; time<input type="datetime-local" id="lfDate"></label>
    <label class="field">Place<input type="text" id="lfPlace"></label>
    <label class="field">Link<input type="url" id="lfLink" placeholder="https://"></label>
    <label class="field full">Notes<input type="text" id="lfNotes"></label></div>
    <div class="toolbar" style="margin:12px 0 0"><button class="btn primary" id="lfSave">Save event</button><button class="btn ghost" id="lfCancel">Cancel</button></div>
    <p class="small muted" style="margin:10px 0 0">Find local events: ${loc ? `<a href="https://www.meetup.com/find/?keywords=astronomy&location=${encodeURIComponent(loc.name)}" target="_blank" rel="noopener">Meetup</a> ·
      <a href="https://www.google.com/search?q=${encodeURIComponent('astronomy club star party near ' + loc.name)}" target="_blank" rel="noopener">clubs &amp; star parties near ${esc(loc.name.split(',')[0])}</a> ·` : ''}
      <a href="https://www.darksky.org/" target="_blank" rel="noopener">DarkSky International</a></p></div>
  <div id="eList"><div class="skeleton" style="height:300px"></div></div>`;

  if (!loc) root.querySelector('#eList').insertAdjacentHTML('beforebegin', needLoc('Sky events'));

  let all = [];
  const sky = loc ? computeSkyEvents(loc) : [];
  const local = () => store.get('localEvents', []).map(e => ({ ...e, date: new Date(e.date), cat: 'local', detail: [e.place, e.notes].filter(Boolean).join(' — ') }));

  function draw() {
    const now = Date.now() - 6 * 3600e3;
    const list = all.filter(e => active.has(e.cat) && +e.date >= now && (!onlyHighlights || e.important || e.cat === 'local' || e.cat === 'launch'))
      .sort((a, b) => a.date - b.date);
    const groups = new Map();
    for (const e of list) {
      const k = fmtDate(e.date, tz, { month: 'long', year: 'numeric' });
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(e);
    }
    const el = root.querySelector('#eList');
    el.innerHTML = list.length ? [...groups].map(([m, evs]) => `<div class="month-group"><h3>${m}</h3>${evs.map((e, i) => `
      <div class="event"><div class="date"><b>${fmtDate(e.date, tz, { day: 'numeric' })}</b><span>${fmtDate(e.date, tz, { weekday: 'short' })}</span></div>
        <div><h4><span class="cat-dot" style="background:${CATS[e.cat][1]}"></span>${esc(e.title)}${e.important ? badge('accent', 'Highlight') : ''}${e.local ? badge('good', 'Visible from you') : ''}</h4>
          <p>${e.allDay ? 'Night of' : fmtTime(e.date, tz)}${e.cat === 'launch' || e.cat === 'space' ? ` · ${relTime(e.date)}` : ''}${e.detail ? ' — ' + esc(e.detail) : ''}${e.link ? ` <a href="${esc(e.link)}" target="_blank" rel="noopener">More ↗</a>` : ''}</p></div>
        <div class="actions"><button class="btn sm ghost" data-ics="${list.indexOf(e)}" title="Add to your calendar">.ics</button>${e.cat === 'local' ? `<button class="btn sm ghost danger" data-del="${e.id}" title="Remove">✕</button>` : ''}</div>
      </div>`).join('')}</div>`).join('') : '<p class="empty">No events match the selected filters.</p>';
    el.querySelectorAll('[data-ics]').forEach(b => b.addEventListener('click', () => {
      const e = list[+b.dataset.ics];
      downloadFile(e.title.replace(/[^\w]+/g, '-').toLowerCase() + '.ics', ics(e), 'text/calendar');
    }));
    el.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => {
      if (!confirm('Remove this local event?')) return;
      store.set('localEvents', store.get('localEvents', []).filter(x => x.id !== b.dataset.del));
      rebuild();
    }));
  }

  let remote = [];
  function rebuild() { all = [...sky, ...remote, ...local()]; draw(); }
  rebuild();

  Promise.allSettled([getLaunches(), getSpaceEvents()]).then(([l, s]) => {
    if (l.status === 'fulfilled') remote.push(...l.value.results.map(r => ({
      date: new Date(r.net), cat: 'launch', title: r.name,
      detail: [r.launch_service_provider?.name, r.pad?.location?.name, r.status?.abbrev && `Status: ${r.status.abbrev}`].filter(Boolean).join(' · '),
      important: /Artemis|Starship|crew/i.test(r.name),
    })));
    if (s.status === 'fulfilled') remote.push(...s.value.results.map(r => ({
      date: new Date(r.date), cat: 'space', title: r.name,
      detail: [r.type?.name, (r.description || '').slice(0, 180)].filter(Boolean).join(' — '), link: r.vid_urls?.[0]?.url || r.info_urls?.[0]?.url || '',
    })));
    rebuild();
  });

  root.querySelector('#eCats').addEventListener('click', e => {
    const b = e.target.closest('[data-c]'); if (!b) return;
    const c = b.dataset.c;
    active.has(c) ? active.delete(c) : active.add(c);
    b.setAttribute('aria-pressed', active.has(c));
    store.set('eventCats', [...active]);
    draw();
  });
  root.querySelector('#eHi').addEventListener('change', e => { onlyHighlights = e.target.checked; draw(); });
  const form = root.querySelector('#eForm');
  root.querySelector('#eAdd').addEventListener('click', () => { form.hidden = false; root.querySelector('#lfTitle').focus(); });
  root.querySelector('#lfCancel').addEventListener('click', () => { form.hidden = true; });
  root.querySelector('#lfSave').addEventListener('click', () => {
    const v = id => root.querySelector('#' + id).value.trim();
    if (!v('lfTitle') || !v('lfDate')) return alert('Please enter a title and date.');
    const evs = store.get('localEvents', []);
    evs.push({ id: String(Date.now()), title: v('lfTitle'), date: new Date(v('lfDate')).toISOString(), place: v('lfPlace'), link: v('lfLink'), notes: v('lfNotes') });
    store.set('localEvents', evs);
    form.hidden = true;
    ['lfTitle', 'lfDate', 'lfPlace', 'lfLink', 'lfNotes'].forEach(id => { root.querySelector('#' + id).value = ''; });
    active.add('local');
    root.querySelector('[data-c="local"]').setAttribute('aria-pressed', true);
    rebuild();
  });
}
