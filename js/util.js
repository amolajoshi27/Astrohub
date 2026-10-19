// Shared helpers: escaping, storage, cached fetch, formatting.

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const store = {
  get(k, d) {
    try { const v = localStorage.getItem('astro:' + k); return v == null ? d : JSON.parse(v); } catch { return d; }
  },
  set(k, v) {
    try { localStorage.setItem('astro:' + k, JSON.stringify(v)); } catch { /* quota or blocked */ }
  },
  del(k) { try { localStorage.removeItem('astro:' + k); } catch { } },
};

// Fetch JSON (or text) with a localStorage cache. On network failure, falls back to stale cache.
export async function fetchJSON(url, { ttl = 0, key = url, text = false, timeout = 15000 } = {}) {
  const ck = 'cache:' + key;
  const cached = ttl ? store.get(ck) : null;
  if (cached && Date.now() - cached.t < ttl) return cached.v;
  try {
    const ctl = new AbortController();
    const tm = setTimeout(() => ctl.abort(), timeout);
    const r = await fetch(url, { signal: ctl.signal });
    clearTimeout(tm);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const v = text ? await r.text() : await r.json();
    if (ttl) store.set(ck, { t: Date.now(), v });
    return v;
  } catch (e) {
    if (cached) return cached.v;
    if (e.name === 'AbortError') throw new Error('the server took too long to respond');
    throw e;
  }
}

const dtfCache = new Map();
function dtf(opts, tz) {
  const k = JSON.stringify(opts) + (tz || '');
  if (!dtfCache.has(k)) {
    let f;
    try { f = new Intl.DateTimeFormat(undefined, { ...opts, timeZone: tz || undefined }); }
    catch { f = new Intl.DateTimeFormat(undefined, opts); }
    dtfCache.set(k, f);
  }
  return dtfCache.get(k);
}
const valid = d => d instanceof Date && !isNaN(d);
export const fmtTime = (d, tz) => valid(d) ? dtf({ hour: '2-digit', minute: '2-digit' }, tz).format(d) : '—';
export const fmtDate = (d, tz, o = { weekday: 'short', day: 'numeric', month: 'short' }) => valid(d) ? dtf(o, tz).format(d) : '—';
export const fmtDateTime = (d, tz) => valid(d) ? dtf({ weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }, tz).format(d) : '—';
export function hourIn(d, tz) { return +dtf({ hour: 'numeric', hourCycle: 'h23' }, tz).format(d) % 24; }
export function dayKey(d, tz) { return dtf({ year: 'numeric', month: '2-digit', day: '2-digit' }, tz).format(d); }

export function relTime(d) {
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const s = (new Date(d) - Date.now()) / 1000;
  const a = Math.abs(s);
  if (a < 60) return rtf.format(Math.round(s), 'second');
  if (a < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (a < 86400) return rtf.format(Math.round(s / 3600), 'hour');
  if (a < 86400 * 30) return rtf.format(Math.round(s / 86400), 'day');
  return rtf.format(Math.round(s / 86400 / 30), 'month');
}

export function duration(ms) {
  const m = Math.round(ms / 60000);
  const h = Math.floor(m / 60);
  return h ? `${h} h ${m % 60} min` : `${m} min`;
}

export function compass(az) {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return dirs[Math.round((((az % 360) + 360) % 360) / 22.5) % 16];
}

const STATUS_ICONS = {
  good: '<svg viewBox="0 0 16 16" width="12" height="12"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  warning: '<svg viewBox="0 0 16 16" width="12" height="12"><path d="M8 4v5M8 12v.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  serious: '<svg viewBox="0 0 16 16" width="12" height="12"><path d="M8 4v5M8 12v.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  critical: '<svg viewBox="0 0 16 16" width="12" height="12"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
};
export function badge(level, label) {
  return `<span class="badge ${level}">${STATUS_ICONS[level] || ''}${esc(label)}</span>`;
}

export function needLoc(title = 'This page') {
  return `<div class="card empty"><h2>${esc(title)} needs your location</h2>
    <p>Set your city once and AstroHub will calculate sky conditions, rise/set times and ISS passes for you.</p>
    <button class="btn primary" data-action="set-location">Set my location</button></div>`;
}

export function errorBox(msg) { return `<p class="error">${esc(msg)}</p>`; }

export function hashParams() {
  const q = location.hash.split('?')[1] || '';
  return new URLSearchParams(q);
}

export function downloadFile(name, content, type = 'application/json') {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function lightbox(src) {
  const el = document.createElement('div');
  el.className = 'lightbox';
  el.innerHTML = `<img src="${esc(src)}" alt="">`;
  el.addEventListener('click', () => el.remove());
  document.body.appendChild(el);
}

export function stripHtml(s) {
  const d = document.createElement('div');
  d.innerHTML = s || '';
  return d.textContent.trim();
}
