// Combines darkness, Moon and weather into a "Go / No-go" verdict for tonight.
import { nightInfo, addH } from './astro.js';
import { getForecast, getSeeing } from './data.js';

const avg = (arr, k) => (arr.length ? arr.reduce((a, b) => a + (b[k] ?? 0), 0) / arr.length : null);

export async function tonight(loc) {
  const night = nightInfo(loc);
  const [hours, seeing] = await Promise.all([
    getForecast(loc).catch(() => []),
    getSeeing(loc).catch(() => []),
  ]);
  let inDark = [], seeIn = [];
  if (night.darkStart && night.darkEnd) {
    inDark = hours.filter(h => h.t >= addH(night.darkStart, -0.5) && h.t <= night.darkEnd);
    seeIn = seeing.filter(p => p.t >= addH(night.darkStart, -1.5) && p.t <= addH(night.darkEnd, 1.5));
  }
  const c = { cloud: avg(inDark, 'cloud'), rh: avg(inDark, 'rh'), wind: avg(inDark, 'wind'), temp: avg(inDark, 'temp'), dew: avg(inDark, 'dew') };
  const seeAvg = avg(seeIn, 'seeing'), transAvg = avg(seeIn, 'transparency');
  const score = scoreNight({ ...c, moonIllum: night.moon.illumMid, moonUp: night.moon.upFrac, seeing: seeAvg });
  return { night, hours, seeing, ...c, seeAvg, transAvg, score, weatherOk: hours.length > 0 };
}

export function scoreNight({ cloud, rh, wind, moonIllum, moonUp, seeing }) {
  if (cloud == null) return null;
  const sky = Math.pow(1 - cloud / 100, 1.4);
  const hum = rh > 92 ? 0.6 : rh > 85 ? 0.8 : rh > 75 ? 0.92 : 1;
  const wnd = wind > 35 ? 0.6 : wind > 25 ? 0.8 : wind > 15 ? 0.92 : 1;
  const moonF = 1 - 0.65 * moonIllum * moonUp;
  const seeF = seeing ? (seeing <= 3 ? 1 : seeing <= 5 ? 0.85 : 0.7) : 1;
  return {
    deep: Math.round(100 * sky * hum * wnd * moonF),
    planets: Math.round(100 * sky * hum * wnd * seeF),
  };
}

export function verdict(score) {
  if (score == null) return { level: 'neutral', label: 'No data' };
  if (score >= 70) return { level: 'good', label: 'Go' };
  if (score >= 45) return { level: 'warning', label: 'Marginal' };
  return { level: 'critical', label: 'No-go' };
}

const COLORS = { good: 'var(--good)', warning: 'var(--warning)', critical: 'var(--critical)', neutral: 'var(--muted)' };

export function scoreRing(score, caption) {
  const v = verdict(score);
  const r = 48, c = 2 * Math.PI * r, pct = score == null ? 0 : score / 100;
  return `<div class="score-ring" title="${caption}: ${score ?? '—'}/100 (${v.label})">
    <svg viewBox="0 0 112 112" width="112" height="112"><circle cx="56" cy="56" r="${r}" fill="none" stroke="var(--surface-3)" stroke-width="8"/>
    <circle cx="56" cy="56" r="${r}" fill="none" stroke="${COLORS[v.level]}" stroke-width="8" stroke-linecap="round" stroke-dasharray="${c * pct} ${c}"/></svg>
    <div class="num"><div><b>${score ?? '—'}</b><span>${caption}</span></div></div></div>`;
}

export const SEEING_TEXT = v => v == null ? '—' : v <= 2 ? 'Excellent' : v <= 4 ? 'Good' : v <= 6 ? 'Average' : 'Poor';
