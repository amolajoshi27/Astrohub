// Space Feeds: APOD, latest Webb & Hubble images, live Sun and space weather.
import { esc, fmtDate, hashParams, lightbox } from '../util.js';
import { getAPOD, getEsaImages } from '../data.js';
import { renderSpaceWeather } from '../spaceweather.js';

const TABS = [['apod', 'Picture of the Day'], ['webb', 'James Webb'], ['hubble', 'Hubble'], ['sun', 'Live Sun & space weather']];
const SUN = [
  ['0171', 'AIA 171 Å', 'Quiet corona & coronal loops (~600,000 °C)'],
  ['0193', 'AIA 193 Å', 'Corona & coronal holes (~1 million °C)'],
  ['0304', 'AIA 304 Å', 'Chromosphere & prominences'],
  ['0131', 'AIA 131 Å', 'Flaring regions (~10 million °C)'],
  ['HMIIC', 'HMI Intensitygram', 'Visible-light disc — sunspots'],
  ['HMIB', 'HMI Magnetogram', 'Magnetic field polarity'],
];

export async function render(root, { loc, settings }) {
  let cleanup = null;
  const initial = hashParams().get('tab') || 'apod';
  root.innerHTML = `
  <header class="page-head"><p class="eyebrow">Space feeds</p><h1>Images from space</h1>
    <p class="lede">Webb and Hubble don't stream live video — their images are processed and released over days to months. Here are the newest releases, plus the Sun as it looks right now.</p></header>
  <div class="tabs" id="fTabs">${TABS.map(([id, l]) => `<button data-id="${id}">${l}</button>`).join('')}</div>
  <div id="fBody"></div>`;
  const body = root.querySelector('#fBody');

  async function show(id) {
    if (cleanup) { cleanup(); cleanup = null; }
    root.querySelectorAll('#fTabs button').forEach(b => b.classList.toggle('active', b.dataset.id === id));
    history.replaceState(null, '', `#/feeds?tab=${id}`);
    body.innerHTML = '<div class="skeleton" style="height:320px"></div>';
    if (id === 'apod') return showApod();
    if (id === 'sun') return showSun();
    return showMission(id);
  }

  async function showApod() {
    try {
      const list = (await getAPOD(settings.nasaKey)).reverse();
      const a = list[0];
      const media = a.media_type === 'video'
        ? `<div class="frame"><iframe src="${esc(a.url)}" title="${esc(a.title)}" allowfullscreen></iframe></div>`
        : a.media_type === 'mp4'
          ? `<video src="${esc(a.url)}" controls muted loop playsinline style="width:100%;border-radius:var(--radius-sm)"></video>`
          : `<img src="${esc(a.url)}" alt="${esc(a.title)}" style="cursor:zoom-in" data-hd="${esc(a.hdurl || a.url)}" id="apodImg">`;
      body.innerHTML = `<div class="card"><div class="apod-hero">${media}
        <div><p class="eyebrow">${esc(a.date)}</p><h2 style="font-size:1.5rem">${esc(a.title)}</h2>
        ${a.credit ? `<p class="small muted">Credit: ${esc(a.credit.trim())}</p>` : ''}
        <p class="dim" style="font-size:.93rem">${esc(a.explanation)}</p>
        <a class="btn sm" href="${esc(a.link)}" target="_blank" rel="noopener">View on APOD ↗</a></div></div></div>
        <h2 style="margin-top:26px">Previous days</h2>
        <div class="gallery">${list.slice(1).map(p => `<a class="media-card" href="${esc(p.link)}" target="_blank" rel="noopener">
          <div class="thumb">${p.thumbnail_url || p.media_type === 'image' ? `<img src="${esc(p.thumbnail_url || p.url)}" alt="" loading="lazy" onerror="this.remove()">` : '<div style="display:grid;place-items:center;height:100%;color:var(--muted)">▶ Video</div>'}</div>
          <div class="body"><div class="meta">${esc(p.date)}</div><h3>${esc(p.title)}</h3></div></a>`).join('')}</div>`;
      body.querySelector('#apodImg')?.addEventListener('click', e => lightbox(e.target.dataset.hd));
    } catch (e) {
      body.innerHTML = `<div class="card"><p class="error">APOD unavailable: ${esc(e.message)}</p><p class="small muted">${/429/.test(e.message) ? 'The shared NASA key has hit its hourly limit — add your own free key in Settings.' : "NASA's server is having trouble — try again later."} <a href="https://science.nasa.gov/apod/" target="_blank" rel="noopener">Open APOD ↗</a></p></div>`;
    }
  }

  async function showMission(id) {
    const webb = id === 'webb';
    const links = webb
      ? `<a class="btn sm" href="https://esawebb.org/images/" target="_blank" rel="noopener">ESA/Webb gallery ↗</a>
         <a class="btn sm" href="https://webbtelescope.org/resource-gallery/images" target="_blank" rel="noopener">STScI Webb releases ↗</a>
         <a class="btn sm" href="https://www.stsci.edu/jwst/science-execution/observing-schedules" target="_blank" rel="noopener">What Webb is observing this week ↗</a>
         <a class="btn sm" href="https://webb.nasa.gov/content/webbLaunch/whereIsWebb.html" target="_blank" rel="noopener">Where is Webb? ↗</a>`
      : `<a class="btn sm" href="https://esahubble.org/images/" target="_blank" rel="noopener">ESA/Hubble gallery ↗</a>
         <a class="btn sm" href="https://science.nasa.gov/mission/hubble/multimedia/images/" target="_blank" rel="noopener">NASA Hubble images ↗</a>
         <a class="btn sm" href="https://esahubble.org/images/potw/" target="_blank" rel="noopener">Hubble Picture of the Week ↗</a>`;
    try {
      const items = await getEsaImages(webb ? 'webb' : 'hubble');
      body.innerHTML = `<div class="toolbar">${links}</div>
        <p class="small muted">Newest releases from ${webb ? 'ESA/Webb' : 'ESA/Hubble'}, including the ${webb ? 'Picture of the Month' : 'Picture of the Week'}. Click an image for a larger view.</p>
        <div class="gallery">${items.map((it, i) => `<div class="media-card" style="cursor:zoom-in" data-i="${i}">
          <div class="thumb"><img src="${esc(it.thumb)}" alt="${esc(it.title)}" loading="lazy" onerror="this.onerror=null;this.src='${esc(it.large)}'"></div>
          <div class="body"><div class="meta"><b>${it.potm ? (webb ? 'Picture of the Month' : 'Picture of the Week') : esc(it.id)}</b>${it.date ? `<span>${fmtDate(it.date, null, { day: 'numeric', month: 'short', year: 'numeric' })}</span>` : ''}</div>
          <h3>${esc(it.title)}</h3><p>${esc(it.desc)}</p>
          <a class="xsmall" href="${esc(it.link)}" target="_blank" rel="noopener">Full resolution &amp; details ↗</a></div></div>`).join('')}</div>`;
      body.querySelectorAll('.media-card[data-i]').forEach(c => c.addEventListener('click', e => {
        if (e.target.closest('a')) return;
        lightbox(items[+c.dataset.i].large);
      }));
    } catch (e) {
      body.innerHTML = `<div class="toolbar">${links}</div><p class="error">Image library unavailable: ${esc(e.message)}</p>`;
    }
  }

  async function showSun() {
    const v = Math.floor(Date.now() / 900e3); // refresh images every 15 minutes
    body.innerHTML = `<p class="small muted">Live images from NASA's Solar Dynamics Observatory, updated every few minutes. <b class="dim">Never look at the Sun through a telescope without a certified solar filter.</b></p>
      <div class="gallery">${SUN.map(([code, name, desc]) => `<figure class="media-card" style="margin:0;cursor:zoom-in" data-src="https://sdo.gsfc.nasa.gov/assets/img/latest/latest_1024_${code}.jpg?v=${v}">
        <div class="thumb"><img src="https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_${code}.jpg?v=${v}" alt="${name}" loading="lazy"></div>
        <figcaption class="body"><h3>${name}</h3><p>${desc}</p></figcaption></figure>`).join('')}
        <figure class="media-card" style="margin:0;cursor:zoom-in" data-src="https://soho.nascom.nasa.gov/data/realtime/c3/1024/latest.jpg?v=${v}">
          <div class="thumb"><img src="https://soho.nascom.nasa.gov/data/realtime/c3/512/latest.jpg?v=${v}" alt="SOHO LASCO C3" loading="lazy"></div>
          <figcaption class="body"><h3>SOHO LASCO C3</h3><p>Coronagraph — watch for coronal mass ejections</p></figcaption></figure>
      </div>
      <div class="card" style="margin-top:22px"><div class="card-head"><h2>Geomagnetic activity &amp; aurora</h2><a class="card-link" href="https://www.swpc.noaa.gov/" target="_blank" rel="noopener">NOAA SWPC ↗</a></div><div id="swBody"></div></div>`;
    body.querySelectorAll('figure[data-src]').forEach(f => f.addEventListener('click', () => lightbox(f.dataset.src)));
    cleanup = await renderSpaceWeather(body.querySelector('#swBody'), loc);
  }

  root.querySelector('#fTabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) show(b.dataset.id); });
  show(TABS.some(t => t[0] === initial) ? initial : 'apod');
  return () => cleanup && cleanup();
}
