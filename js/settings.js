// Location + preferences dialog. Everything is stored in this browser only.
import { store, esc, fetchJSON } from './util.js';

export const getLoc = () => store.get('location', null);
export const getSettings = () => ({ nasaKey: '', issVideo: '', ...store.get('settings', {}) });

let onChangeCb = () => { };

export function initSettings(onChange) { onChangeCb = onChange; }

function setLoc(loc) {
  store.set('location', loc);
  onChangeCb();
}

export function openSettings(focusLocation = false) {
  const dlg = document.getElementById('settings');
  const loc = getLoc();
  const s = getSettings();
  dlg.innerHTML = `<form method="dialog">
    <h2>Settings</h2>
    <div class="section">
      <h3>Observing location</h3>
      <p class="small muted">Current: ${loc ? `<b class="dim">${esc(loc.name)}</b> (${loc.lat.toFixed(3)}°, ${loc.lon.toFixed(3)}°${loc.tz ? ', ' + esc(loc.tz) : ''})` : 'not set'}</p>
      <div class="row"><input type="search" id="cityQ" placeholder="Search a city or town…" autocomplete="off"><button type="button" class="btn" id="citySearch">Search</button></div>
      <ul class="results" id="cityResults"></ul>
      <div class="row" style="margin-top:10px"><button type="button" class="btn ghost sm" id="useGps">Use my device location</button></div>
      <details style="margin-top:10px"><summary class="small dim" style="cursor:pointer">Enter coordinates manually</summary>
        <div class="form-grid" style="margin-top:10px">
          <label class="field">Name<input type="text" id="mName" value="${esc(loc?.name || '')}"></label>
          <label class="field">Latitude<input type="number" step="0.0001" id="mLat" value="${loc?.lat ?? ''}"></label>
          <label class="field">Longitude<input type="number" step="0.0001" id="mLon" value="${loc?.lon ?? ''}"></label>
          <label class="field">Elevation (m)<input type="number" id="mElev" value="${loc?.elev ?? 0}"></label>
        </div>
        <button type="button" class="btn sm" id="mSave" style="margin-top:10px">Use these coordinates</button>
      </details>
      <p class="error" id="locErr"></p>
    </div>
    <div class="section">
      <h3>NASA API key <span class="xsmall muted">(optional)</span></h3>
      <p class="small muted">Only used as a backup source for Picture of the Day. The shared DEMO_KEY is limited to ~30 requests/hour; a free personal key from <a href="https://api.nasa.gov/" target="_blank" rel="noopener">api.nasa.gov</a> avoids that.</p>
      <input type="text" id="nasaKey" value="${esc(s.nasaKey)}" placeholder="DEMO_KEY" autocomplete="off">
    </div>
    <div class="section">
      <h3>ISS live video <span class="xsmall muted">(optional)</span></h3>
      <p class="small muted">NASA's ISS stream ID on YouTube changes from time to time. Paste a YouTube video ID or URL here to override the default.</p>
      <input type="text" id="issVideo" value="${esc(s.issVideo)}" placeholder="e.g. a YouTube video ID">
    </div>
    <div class="actions"><button class="btn" value="cancel">Close</button><button class="btn primary" id="saveSettings" value="save">Save</button></div>
  </form>`;

  const $ = id => dlg.querySelector('#' + id);
  const err = msg => { $('locErr').textContent = msg || ''; };

  async function search() {
    const q = $('cityQ').value.trim();
    if (!q) return;
    err('');
    $('cityResults').innerHTML = '<li class="small muted">Searching…</li>';
    try {
      const j = await fetchJSON(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=en&format=json`);
      const res = j.results || [];
      $('cityResults').innerHTML = res.length ? res.map((r, i) => `<li><button type="button" data-i="${i}">
        <b>${esc(r.name)}</b> <span class="small muted">${esc([r.admin1, r.country].filter(Boolean).join(', '))} · ${r.latitude.toFixed(2)}°, ${r.longitude.toFixed(2)}°</span></button></li>`).join('')
        : '<li class="small muted">No matches — try a nearby larger town.</li>';
      $('cityResults').querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
        const r = res[+b.dataset.i];
        setLoc({ name: r.name + (r.country_code ? ', ' + r.country_code : ''), lat: r.latitude, lon: r.longitude, elev: r.elevation || 0, tz: r.timezone });
        dlg.close();
      }));
    } catch (e) { $('cityResults').innerHTML = ''; err('Search failed: ' + e.message); }
  }
  $('citySearch').addEventListener('click', search);
  $('cityQ').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); search(); } });

  $('useGps').addEventListener('click', () => {
    if (!navigator.geolocation) return err('Geolocation is not available in this browser.');
    err('Getting your position…');
    navigator.geolocation.getCurrentPosition(async p => {
      const lat = +p.coords.latitude.toFixed(4), lon = +p.coords.longitude.toFixed(4);
      let name = `${lat.toFixed(2)}°, ${lon.toFixed(2)}°`;
      try {
        const g = await fetchJSON(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`);
        name = g.city || g.locality || name;
        if (g.countryCode) name += ', ' + g.countryCode;
      } catch { }
      setLoc({ name, lat, lon, elev: Math.round(p.coords.altitude || 0), tz: Intl.DateTimeFormat().resolvedOptions().timeZone });
      dlg.close();
    }, e => err('Could not get location: ' + e.message), { timeout: 15000 });
  });

  $('mSave').addEventListener('click', () => {
    const lat = parseFloat($('mLat').value), lon = parseFloat($('mLon').value);
    if (!(lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180)) return err('Enter a valid latitude (−90…90) and longitude (−180…180).');
    setLoc({ name: $('mName').value.trim() || `${lat.toFixed(2)}°, ${lon.toFixed(2)}°`, lat, lon, elev: +$('mElev').value || 0, tz: loc?.tz || Intl.DateTimeFormat().resolvedOptions().timeZone });
    dlg.close();
  });

  $('saveSettings').addEventListener('click', () => {
    const v = $('issVideo').value.trim();
    const m = v.match(/(?:v=|youtu\.be\/|embed\/|live\/)([\w-]{11})/);
    store.set('settings', { nasaKey: $('nasaKey').value.trim(), issVideo: m ? m[1] : v });
    onChangeCb();
  });

  dlg.showModal();
  if (focusLocation || !loc) $('cityQ').focus();
}
