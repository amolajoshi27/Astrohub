// Observer tools: telescope/eyepiece calculator, eyepiece set, camera FOV, sidereal time, light pollution.
import { esc, store } from '../util.js';
import { localSiderealTime } from '../astro.js';

const fmtHMS = h => { const s = Math.round(h * 3600); return `${String(Math.floor(s / 3600) % 24).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
const r = (k, v, u = '') => `<div class="result"><div class="k">${k}</div><div class="v">${v}${u ? ` <small>${u}</small>` : ''}</div></div>`;

export async function render(root, { loc }) {
  const eq = { scopeName: '', aperture: 200, focal: 1200, eyepiece: 25, afov: 52, barlow: 1, sensorW: 23.5, sensorH: 15.6, pixel: 3.9, camFocal: 1200, eyepieces: [], ...store.get('equipment', {}) };
  root.innerHTML = `
  <header class="page-head"><p class="eyebrow">Observer tools</p><h1>Calculators &amp; references</h1>
    <p class="lede">Work out magnification and field of view, plan astrophotography framing, and find darker skies. Your equipment is remembered in this browser.</p></header>
  <section class="grid-2">
    <div class="card"><h2>Telescope &amp; eyepiece</h2>
      <div class="form-grid">
        <label class="field full">Telescope name<input type="text" id="scopeName" value="${esc(eq.scopeName)}" placeholder='e.g. 8" Dobsonian'></label>
        <label class="field">Aperture (mm)<input type="number" id="aperture" value="${eq.aperture}"></label>
        <label class="field">Focal length (mm)<input type="number" id="focal" value="${eq.focal}"></label>
        <label class="field">Eyepiece (mm)<input type="number" id="eyepiece" value="${eq.eyepiece}" step="0.5"></label>
        <label class="field">Apparent FOV (°)<input type="number" id="afov" value="${eq.afov}"></label>
        <label class="field">Barlow / reducer<select id="barlow">${[0.5, 0.63, 0.8, 1, 1.5, 2, 2.5, 3, 5].map(v => `<option value="${v}" ${v === +eq.barlow ? 'selected' : ''}>${v === 1 ? 'None' : v + '×'}</option>`).join('')}</select></label>
      </div>
      <div class="result-grid" id="scopeOut"></div>
      <div style="display:flex;gap:16px;align-items:center;margin-top:16px;flex-wrap:wrap"><svg id="fovSvg" viewBox="0 0 160 160" width="160" height="160"></svg><p class="small muted" style="flex:1;min-width:180px" id="fovNote"></p></div>
      <button class="btn sm" id="addEp" style="margin-top:12px">Add this eyepiece to my set</button>
    </div>
    <div class="card"><h2>My eyepiece set</h2><p class="small muted">Results for each eyepiece with the telescope on the left.</p>
      <div class="table-wrap"><table><thead><tr><th>Eyepiece</th><th>AFOV</th><th>Mag.</th><th>True field</th><th>Exit pupil</th><th></th></tr></thead><tbody id="epRows"></tbody></table></div>
      <h2 style="margin-top:24px">Astrophotography framing</h2>
      <div class="form-grid">
        <label class="field">Sensor width (mm)<input type="number" id="sensorW" value="${eq.sensorW}" step="0.1"></label>
        <label class="field">Sensor height (mm)<input type="number" id="sensorH" value="${eq.sensorH}" step="0.1"></label>
        <label class="field">Pixel size (µm)<input type="number" id="pixel" value="${eq.pixel}" step="0.01"></label>
        <label class="field">Focal length (mm)<input type="number" id="camFocal" value="${eq.camFocal}"></label>
      </div>
      <p class="xsmall muted" style="margin-top:8px">APS-C ≈ 23.5 × 15.6 mm · Full frame 36 × 24 mm · Phone main camera ≈ 7 × 5 mm</p>
      <div class="result-grid" id="camOut"></div>
    </div>
  </section>
  <section class="grid-2">
    <div class="card"><h2>Time</h2><div class="result-grid" id="timeOut"></div><p class="small muted" style="margin-top:10px">Local sidereal time = the right ascension currently on your meridian (due south from the northern hemisphere). Objects with that RA are at their highest.</p></div>
    <div class="card"><h2>Find dark skies</h2>
      <p class="small dim">Light pollution is the biggest limit on what you can see. Use these maps to find darker sites near you.</p>
      <div class="toolbar">
        <a class="btn sm" target="_blank" rel="noopener" href="https://www.lightpollutionmap.info/${loc ? `#zoom=8&lat=${loc.lat.toFixed(3)}&lon=${loc.lon.toFixed(3)}` : ''}">Light Pollution Map ↗</a>
        <a class="btn sm" target="_blank" rel="noopener" href="https://djlorenz.github.io/astronomy/lp/">World Atlas overlay ↗</a>
        <a class="btn sm" target="_blank" rel="noopener" href="https://www.darksky.org/our-work/conservation/idsp/finder/">Dark Sky Places ↗</a>
        <a class="btn sm" target="_blank" rel="noopener" href="https://www.cleardarksky.com/">Clear Sky Charts ↗</a>
      </div>
      <div class="table-wrap"><table><thead><tr><th>Bortle</th><th>Sky</th><th>Naked-eye limit</th><th>What you'll see</th></tr></thead><tbody>
        <tr><td>1–2</td><td>Truly dark</td><td>7.1–7.6</td><td>Milky Way casts shadows; zodiacal light obvious</td></tr>
        <tr><td>3</td><td>Rural</td><td>6.6–7.0</td><td>Milky Way detailed; M33 visible to the eye</td></tr>
        <tr><td>4</td><td>Rural/suburban</td><td>6.1–6.5</td><td>Milky Way visible but washed out near horizon</td></tr>
        <tr><td>5–6</td><td>Suburban</td><td>5.1–6.0</td><td>Milky Way faint or only overhead</td></tr>
        <tr><td>7–9</td><td>City</td><td>4.0–5.0</td><td>Moon, planets, bright stars and clusters</td></tr>
      </tbody></table></div>
    </div>
  </section>`;
  const $ = id => root.querySelector('#' + id);
  const ids = ['scopeName', 'aperture', 'focal', 'eyepiece', 'afov', 'barlow', 'sensorW', 'sensorH', 'pixel', 'camFocal'];

  function calc() {
    ids.forEach(id => { eq[id] = id === 'scopeName' ? $(id).value : +$(id).value; });
    store.set('equipment', eq);
    const D = eq.aperture, F = eq.focal * eq.barlow;
    const mag = F / eq.eyepiece, tfov = eq.afov / mag, exit = D / mag;
    const maxMag = 2 * D, limMag = 7.7 + 5 * Math.log10(D / 10), dawes = 116 / D;
    $('scopeOut').innerHTML = [
      r('Magnification', mag.toFixed(0), '×'), r('True field', tfov >= 1 ? tfov.toFixed(2) : (tfov * 60).toFixed(1), tfov >= 1 ? '°' : "'"),
      r('Exit pupil', exit.toFixed(1), 'mm'), r('Focal ratio', 'f/' + (F / D).toFixed(1)),
      r('Max useful mag.', maxMag.toFixed(0), '×'), r('Faintest star', limMag.toFixed(1), 'mag'),
      r('Resolution (Dawes)', dawes.toFixed(2), '"'), r('Light grasp vs eye', Math.round((D / 7) ** 2), '×'),
    ].join('');
    const note = mag > maxMag ? 'Above the useful maximum — the image will be dim and blurry.'
      : exit > 7 ? 'Exit pupil above 7 mm — some light is wasted; choose a shorter eyepiece.'
        : exit >= 4 ? 'Low power, wide field: great for star clusters, big nebulae and finding objects.'
          : exit >= 2 ? 'Medium power: good all-rounder for galaxies, globulars and planetary nebulae.'
            : 'High power: for the Moon, planets, double stars — needs steady seeing.';
    const moonD = 0.52, k = 70 / Math.max(tfov, moonD);
    $('fovSvg').innerHTML = `<circle cx="80" cy="80" r="${(tfov / 2) * k * 2}" fill="#0b1630" stroke="var(--accent)" stroke-width="1.5"/>
      <circle cx="80" cy="80" r="${(moonD / 2) * k * 2}" fill="#ece6d3" opacity=".85"/>
      <text x="80" y="156" text-anchor="middle" fill="var(--muted)" font-size="10">Field vs full Moon</text>`;
    $('fovNote').innerHTML = `<b class="dim">${note}</b><br>The blue circle is your eyepiece view; the disc is the full Moon (½°) to scale.`;
    $('epRows').innerHTML = (eq.eyepieces.length ? eq.eyepieces : []).map((e, i) => {
      const m = F / e.fl, t = e.afov / m;
      return `<tr><td>${e.fl} mm</td><td>${e.afov}°</td><td class="mono">${m.toFixed(0)}×</td><td class="mono">${t >= 1 ? t.toFixed(2) + '°' : (t * 60).toFixed(1) + "'"}</td><td class="mono">${(D / m).toFixed(1)} mm</td><td><button class="btn sm ghost danger" data-rm="${i}" aria-label="Remove">✕</button></td></tr>`;
    }).join('') || '<tr><td colspan="6" class="muted">Add eyepieces using the button on the left.</td></tr>';
    const scale = 206.265 * eq.pixel / eq.camFocal;
    const fw = eq.sensorW / eq.camFocal * 57.2958, fh = eq.sensorH / eq.camFocal * 57.2958;
    const fmt = v => v >= 1 ? v.toFixed(2) + '°' : (v * 60).toFixed(1) + "'";
    $('camOut').innerHTML = [r('Field of view', `${fmt(fw)} × ${fmt(fh)}`), r('Image scale', scale.toFixed(2), '"/px'),
      r('Sampling', scale < 0.67 ? 'Over' : scale > 2 ? 'Under' : 'Good', scale < 0.67 ? '(bin 2×2)' : scale > 2 ? '(wide-field ok)' : '(1–2"/px)'),
      r('Moons across', (fw / 0.52).toFixed(1), '×')].join('');
  }
  root.addEventListener('input', e => { if (ids.includes(e.target.id)) calc(); });
  $('barlow').addEventListener('change', calc);
  $('addEp').addEventListener('click', () => {
    if (!eq.eyepieces.some(e => e.fl === eq.eyepiece && e.afov === eq.afov)) eq.eyepieces.push({ fl: eq.eyepiece, afov: eq.afov });
    eq.eyepieces.sort((a, b) => b.fl - a.fl);
    calc();
  });
  $('epRows').addEventListener('click', e => { const b = e.target.closest('[data-rm]'); if (b) { eq.eyepieces.splice(+b.dataset.rm, 1); calc(); } });
  calc();

  const tick = () => {
    const now = new Date();
    const jd = now / 864e5 + 2440587.5;
    const utc = now.toISOString().slice(11, 19);
    $('timeOut').innerHTML = [r('UTC', utc), loc ? r('Local sidereal time', fmtHMS(localSiderealTime(now, loc.lon))) : r('LST', 'Set location'),
      r('Julian date', jd.toFixed(4)), r('Local time', now.toLocaleTimeString([], { timeZone: loc?.tz || undefined, hour12: false }))].join('');
  };
  tick();
  const t = setInterval(tick, 1000);
  return () => clearInterval(t);
}
