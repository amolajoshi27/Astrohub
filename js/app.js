// Router, top bar, red-light mode.
import { store, esc } from './util.js';
import { getLoc, getSettings, initSettings, openSettings } from './settings.js';

const ROUTES = ['', 'sky', 'news', 'feeds', 'iss', 'events', 'messier', 'log', 'tools', 'learn'];
const PAGE = { '': 'home' };
const view = document.getElementById('view');
let cleanup = null, token = 0;

function currentRoute() {
  const r = location.hash.replace(/^#\/?/, '').split('?')[0];
  return ROUTES.includes(r) ? r : '';
}

async function route() {
  const r = currentRoute();
  const my = ++token;
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('active', a.dataset.route === r));
  document.getElementById('nav').classList.remove('open');
  if (cleanup) { try { cleanup(); } catch { } cleanup = null; }
  view.innerHTML = '<div class="loading">Loading…</div>';
  try {
    const mod = await import(`./pages/${PAGE[r] ?? r}.js`);
    if (my !== token) return;
    view.innerHTML = '';
    const c = await mod.render(view, { loc: getLoc(), settings: getSettings(), isCurrent: () => my === token });
    if (my !== token) { if (typeof c === 'function') c(); return; }
    cleanup = typeof c === 'function' ? c : null;
  } catch (e) {
    console.error(e);
    if (my === token) view.innerHTML = `<div class="card"><h2>Something went wrong</h2><p class="error">${esc(e.message)}</p><p class="small muted">Check your internet connection, then reload.</p></div>`;
  }
}

function refreshLocChip() {
  const loc = getLoc();
  document.getElementById('locName').textContent = loc ? loc.name : 'Set location';
}

function setRed(on) {
  document.documentElement.classList.toggle('red', on);
  document.getElementById('redBtn').setAttribute('aria-pressed', on);
  store.set('red', on);
}

initSettings(() => { refreshLocChip(); route(); });
document.getElementById('locBtn').addEventListener('click', () => openSettings(true));
document.getElementById('settingsBtn').addEventListener('click', () => openSettings());
document.getElementById('redBtn').addEventListener('click', () => setRed(!document.documentElement.classList.contains('red')));
document.getElementById('navToggle').addEventListener('click', e => {
  const nav = document.getElementById('nav');
  nav.classList.toggle('open');
  e.currentTarget.setAttribute('aria-expanded', nav.classList.contains('open'));
});
document.addEventListener('click', e => {
  if (e.target.closest('[data-action="set-location"]')) openSettings(true);
});
// Keyboard shortcut: "r" toggles red mode (when not typing).
document.addEventListener('keydown', e => {
  if (e.key === 'r' && !e.ctrlKey && !e.metaKey && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) {
    setRed(!document.documentElement.classList.contains('red'));
  }
});

let lastRoute = null;
window.addEventListener('hashchange', () => {
  // Re-render only when the page changes; query-string changes are handled by pages themselves.
  const r = currentRoute();
  if (r !== lastRoute) { lastRoute = r; route(); window.scrollTo(0, 0); }
});

setRed(store.get('red', false));
refreshLocChip();
lastRoute = currentRoute();
if (!window.Astronomy) {
  view.innerHTML = '<div class="card"><h2>Could not load the astronomy library</h2><p>Check your internet connection and reload the page.</p></div>';
} else {
  route();
  if (!getLoc()) openSettings(true);
}
