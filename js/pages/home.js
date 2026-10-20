// Dashboard: tonight summary, ISS next pass, APOD, upcoming events, latest news.
import { esc, fmtTime, fmtDate, fmtDateTime, relTime, badge, needLoc, compass } from '../util.js';
import { tonight, verdict, scoreRing } from '../conditions.js';
import { moonSVG, computeSkyEvents } from '../astro.js';
import { getAPOD, getNews } from '../data.js';
import { loadISS, findPasses } from '../iss-calc.js';

const CAT_COLORS = { moon: '#e9e4d4', eclipse: '#ef5a52', meteor: '#b79dff', planet: '#e3b341', conjunction: '#7ea6ff', season: '#3fc383', launch: '#f0883e' };

export async function render(root, { loc, settings }) {
  const tz = loc?.tz;
  root.innerHTML = `
  <section class="hero">
    <p class="eyebrow">${fmtDate(new Date(), tz, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
    <h1>Clear skies${loc ? ', ' + esc(loc.name.split(',')[0]) : ''}</h1>
    <p class="lede">Tonight's conditions, what's up, the ISS, fresh space images and the latest news — all in one place.</p>
  </section>
  <div class="dash">
    <article class="card span-2" id="hTonight">${loc ? '<div class="skeleton" style="height:150px"></div>' : needLoc("Tonight's forecast")}</article>
    <article class="card" id="hISS"><div class="card-head"><h2>ISS</h2><a class="card-link" href="#/iss">Live view →</a></div><div id="hIssBody"><div class="skeleton" style="height:90px"></div></div></article>
    <article class="card" id="hApod"><div class="card-head"><h2>Picture of the Day</h2><a class="card-link" href="#/feeds">More →</a></div><div id="hApodBody"><div class="skeleton" style="height:180px"></div></div></article>
    <article class="card span-2" id="hEvents"><div class="card-head"><h2>Coming up in the sky</h2><a class="card-link" href="#/events">All events →</a></div><div id="hEventsBody">${loc ? '<div class="skeleton" style="height:180px"></div>' : '<p class="muted small">Set your location to see events.</p>'}</div></article>
    <article class="card span-3"><div class="card-head"><h2>Latest news</h2><a class="card-link" href="#/news">All news →</a></div><div id="hNewsBody" class="news-mini"><div class="skeleton" style="height:70px"></div></div></article>
  </div>`;

  if (loc) {
    tonight(loc).then(T => {
      const n = T.night, v = verdict(T.score?.deep);
      root.querySelector('#hTonight').innerHTML = `
        <div class="card-head"><h2>Tonight</h2><a class="card-link" href="#/sky">Full sky report →</a></div>
        <div class="tonight-grid">
          <div class="score-pair">${scoreRing(T.score?.deep, 'Deep sky')}${scoreRing(T.score?.planets, 'Planets')}</div>
          <div>
            <p style="margin-bottom:10px">${badge(v.level, v.label + ' for deep sky')} ${T.weatherOk ? '' : '<span class="small muted">Weather unavailable</span>'}</p>
            <div class="stat-row" style="grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px">
              <div><div class="xsmall muted">Dark sky</div><b class="mono">${n.darkStart ? fmtTime(n.darkStart, tz) + ' – ' + fmtTime(n.darkEnd, tz) : 'No true darkness'}</b></div>
              <div><div class="xsmall muted">Cloud (avg)</div><b class="mono">${T.cloud != null ? Math.round(T.cloud) + '%' : '—'}</b></div>
              <div><div class="xsmall muted">Sunset</div><b class="mono">${fmtTime(n.sunset, tz)}</b></div>
              <div style="display:flex;gap:10px;align-items:center">${moonSVG(n.moon.phase, 38, loc.lat < 0)}<div><div class="xsmall muted">${n.moon.name}</div><b class="mono">${Math.round(n.moon.illum * 100)}% lit</b></div></div>
            </div>
          </div>
        </div>`;
    }).catch(e => { root.querySelector('#hTonight').innerHTML = `<p class="error">Could not load tonight's forecast: ${esc(e.message)}</p>`; });

    setTimeout(() => {
      try {
        const evs = computeSkyEvents(loc).slice(0, 6);
        root.querySelector('#hEventsBody').innerHTML = `<ul class="list">${evs.map(e => `<li>
          <span class="cat-dot" style="background:${CAT_COLORS[e.cat]};margin-top:7px"></span>
          <div style="flex:1;min-width:0"><b>${esc(e.title)}</b>${e.important ? ' ' + badge('accent', 'Highlight') : ''}<div class="small muted">${esc(e.detail)}</div></div>
          <span class="small dim nowrap">${fmtDate(e.date, tz)}</span></li>`).join('')}</ul>`;
      } catch (e) { root.querySelector('#hEventsBody').innerHTML = `<p class="error">${esc(e.message)}</p>`; }
    }, 30);
  }

  // ISS
  (async () => {
    const el = root.querySelector('#hIssBody');
    try {
      await loadISS();
      if (!loc) { el.innerHTML = '<p class="small muted">Set your location to see when the ISS flies over you.</p><a class="btn sm" href="#/iss">Track the ISS live</a>'; return; }
      const passes = findPasses(loc, { days: 21 });
      const vis = passes.find(p => p.visible);
      el.innerHTML = vis ? `
        <p class="small muted" style="margin-bottom:4px">Next visible pass</p>
        <p style="font-family:var(--display);font-size:1.35rem;font-weight:600;margin:0">${fmtDateTime(vis.visStart, tz)}</p>
        <p class="small dim">${relTime(vis.visStart)} · up to ${Math.round(vis.visMaxEl)}° high · ${compass(vis.startAz)} → ${compass(vis.endAz)}</p>
        <p class="small muted">Looks like a bright, steady star moving across the sky — no telescope needed.</p>`
        : `<p class="small dim">No visible passes in the next 3 weeks — the ISS only crosses your sky in daylight or while in Earth's shadow.</p>`;
    } catch (e) { el.innerHTML = `<p class="error">ISS data unavailable: ${esc(e.message)}</p>`; }
  })();

  // APOD
  getAPOD(settings.nasaKey).then(list => {
    const a = list[list.length - 1];
    const img = a.thumbnail_url || (a.media_type === 'image' ? a.url : '');
    root.querySelector('#hApodBody').innerHTML = `<a href="#/feeds" style="color:inherit">
      ${img ? `<img src="${esc(img)}" alt="${esc(a.title)}" style="width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:10px;margin-bottom:10px">`
        : '<div style="aspect-ratio:4/3;display:grid;place-items:center;border-radius:10px;margin-bottom:10px;background:var(--surface-2);color:var(--muted)">▶ Today\'s APOD is a video</div>'}
      <b>${esc(a.title)}</b></a><div class="xsmall muted">${esc(a.date)}${a.credit ? ' · ' + esc(a.credit.trim().slice(0, 80)) : ''}</div>`;
  }).catch(e => {
    root.querySelector('#hApodBody').innerHTML = `<p class="error">Picture of the Day unavailable (${esc(e.message)}).</p>
      <p class="small muted">${/429/.test(e.message) ? 'The shared NASA key has hit its hourly limit — add your own free key in Settings.' : "NASA's server is having trouble — try again later."}
      <a href="https://science.nasa.gov/apod/" target="_blank" rel="noopener">Open APOD ↗</a></p>`;
  });

  // News
  getNews({ limit: 6 }).then(j => {
    root.querySelector('#hNewsBody').innerHTML = j.results.map(a => `<a class="news-row" href="${esc(a.url)}" target="_blank" rel="noopener">
      <img src="${esc(a.image_url)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
      <div><h4>${esc(a.title)}</h4><div class="xsmall muted">${esc(a.news_site)} · ${relTime(a.published_at)}</div></div></a>`).join('');
  }).catch(e => { root.querySelector('#hNewsBody').innerHTML = `<p class="error">News unavailable: ${esc(e.message)}</p>`; });
}
