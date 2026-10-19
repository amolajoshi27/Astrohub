// Small SVG charts with hover tooltips. Re-draw on resize; return a cleanup function.
import { fmtDate, hourIn } from './util.js';

function attach(wrap, draw) {
  wrap.classList.add('chart-wrap');
  let lastW = 0;
  const run = () => { const w = wrap.clientWidth | 0; if (w && w !== lastW) { lastW = w; draw(w); } };
  run();
  const ro = new ResizeObserver(run);
  ro.observe(wrap);
  return () => ro.disconnect();
}

function placeTip(wrap, tip, x, y) {
  tip.hidden = false;
  const W = wrap.clientWidth, tw = tip.offsetWidth;
  let left = x + 14;
  if (left + tw > W) left = x - tw - 14;
  tip.style.left = Math.max(0, left) + 'px';
  tip.style.top = Math.max(0, y - 10) + 'px';
}

function xTicks(t0, t1, x, tz, H, m) {
  let s = '';
  for (let t = Math.ceil(t0 / 3600e3) * 3600e3; t <= t1; t += 3600e3) {
    const h = hourIn(new Date(t), tz);
    if (h % 6) continue;
    const X = x(t);
    const lbl = h === 0 ? fmtDate(new Date(t), tz, { weekday: 'short', day: 'numeric' }) : `${String(h).padStart(2, '0')}:00`;
    s += `<line x1="${X}" x2="${X}" y1="${H - m.b}" y2="${H - m.b + 4}" class="tick"/>
      <text x="${X}" y="${H - 10}" text-anchor="middle" class="axis${h === 0 ? ' strong' : ''}">${lbl}</text>`;
  }
  return s;
}

// Single-series area chart over time. o: {points:[{t,v,...}], yMax, yTicks, yUnit, bands, tz, tooltip(p), label}
export function timeAreaChart(wrap, o) {
  const tip = document.createElement('div');
  tip.className = 'chart-tip'; tip.hidden = true;
  return attach(wrap, W => {
    const H = o.height || 220, m = { l: 42, r: 14, t: 14, b: 30 };
    const P = o.points;
    const t0 = +P[0].t, t1 = +P[P.length - 1].t;
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const x = t => m.l + (t - t0) / (t1 - t0) * iw;
    const y = v => m.t + (1 - v / o.yMax) * ih;
    let s = `<svg width="${W}" height="${H}" role="img" aria-label="${o.label || 'chart'}">
      <defs><linearGradient id="areaFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#7ea6ff" stop-opacity=".35"/><stop offset="1" stop-color="#7ea6ff" stop-opacity=".03"/></linearGradient></defs>`;
    for (const b of o.bands || []) {
      const a = Math.max(+b.start, t0), z = Math.min(+b.end, t1);
      if (z > a) s += `<rect x="${x(a)}" y="${m.t}" width="${x(z) - x(a)}" height="${ih}" fill="var(--band)"/>`;
    }
    for (const g of o.yTicks) s += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(g)}" y2="${y(g)}" class="grid"/><text x="${m.l - 8}" y="${y(g) + 4}" text-anchor="end" class="axis">${g}${o.yUnit || ''}</text>`;
    s += xTicks(t0, t1, x, o.tz, H, m);
    const line = P.map((p, i) => `${i ? 'L' : 'M'}${x(+p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
    s += `<path d="${line}L${x(t1)},${y(0)}L${x(t0)},${y(0)}Z" class="area"/><path d="${line}" class="line"/>`;
    const now = Date.now();
    if (now > t0 && now < t1) s += `<line x1="${x(now)}" x2="${x(now)}" y1="${m.t}" y2="${m.t + ih}" class="now"/><text x="${x(now) + 4}" y="${m.t + 10}" class="now-label">now</text>`;
    s += `<line class="cross" y1="${m.t}" y2="${m.t + ih}"/><circle class="cross-dot" r="4.5"/>
      <rect x="${m.l}" y="${m.t}" width="${iw}" height="${ih}" fill="transparent" class="hit"/></svg>`;
    wrap.innerHTML = s;
    wrap.appendChild(tip);
    const svg = wrap.querySelector('svg'), cross = svg.querySelector('.cross'), dot = svg.querySelector('.cross-dot');
    const hit = svg.querySelector('.hit');
    hit.addEventListener('pointermove', e => {
      const r = svg.getBoundingClientRect();
      const px = e.clientX - r.left;
      const t = t0 + (px - m.l) / iw * (t1 - t0);
      let i = 0, best = Infinity;
      P.forEach((p, k) => { const dd = Math.abs(+p.t - t); if (dd < best) { best = dd; i = k; } });
      const p = P[i], X = x(+p.t), Y = y(p.v);
      cross.setAttribute('x1', X); cross.setAttribute('x2', X);
      dot.setAttribute('cx', X); dot.setAttribute('cy', Y);
      wrap.classList.add('hovering');
      tip.innerHTML = o.tooltip(p);
      placeTip(wrap, tip, X, Y);
    });
    hit.addEventListener('pointerleave', () => { wrap.classList.remove('hovering'); tip.hidden = true; });
  });
}

// Time bar chart. o: {bars:[{t,v,color,pattern}], width(ms), yMax, yTicks, tz, tooltip(b), label, thresholds:[{v,label}]}
export function timeBarChart(wrap, o) {
  const tip = document.createElement('div');
  tip.className = 'chart-tip'; tip.hidden = true;
  return attach(wrap, W => {
    const H = o.height || 220, m = { l: 34, r: 12, t: 14, b: 30 };
    const B = o.bars;
    const t0 = +B[0].t, t1 = +B[B.length - 1].t + o.width;
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const x = t => m.l + (t - t0) / (t1 - t0) * iw;
    const y = v => m.t + (1 - v / o.yMax) * ih;
    const bw = Math.max(2, x(t0 + o.width) - x(t0) - 2);
    let s = `<svg width="${W}" height="${H}" role="img" aria-label="${o.label || 'chart'}">
      <defs><pattern id="hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="var(--surface)"/><line x1="0" y1="0" x2="0" y2="5" stroke="#fff" stroke-opacity=".45" stroke-width="2"/></pattern></defs>`;
    for (const g of o.yTicks) s += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(g)}" y2="${y(g)}" class="grid"/><text x="${m.l - 8}" y="${y(g) + 4}" text-anchor="end" class="axis">${g}</text>`;
    for (const th of o.thresholds || []) s += `<text x="${W - m.r}" y="${y(th.v) - 4}" text-anchor="end" class="axis">${th.label}</text>`;
    s += xTicks(t0, t1, x, o.tz, H, m);
    B.forEach((b, i) => {
      const X = x(+b.t) + 1, Y = y(Math.max(b.v, 0.15)), h = m.t + ih - Y;
      const r = Math.min(4, bw / 2);
      const path = `M${X},${m.t + ih}V${Y + r}Q${X},${Y} ${X + r},${Y}H${X + bw - r}Q${X + bw},${Y} ${X + bw},${Y + r}V${m.t + ih}Z`;
      s += `<path d="${path}" fill="${b.color}" class="bar" data-i="${i}"/>`;
      if (b.pattern) s += `<path d="${path}" fill="url(#hatch)" opacity=".35" class="bar" data-i="${i}" pointer-events="none"/>`;
      void h;
    });
    const now = Date.now();
    if (now > t0 && now < t1) s += `<line x1="${x(now)}" x2="${x(now)}" y1="${m.t}" y2="${m.t + ih}" class="now"/><text x="${x(now) + 4}" y="${m.t + 10}" class="now-label">now</text>`;
    s += `<rect x="${m.l}" y="${m.t}" width="${iw}" height="${ih}" fill="transparent" class="hit"/></svg>`;
    wrap.innerHTML = s;
    wrap.appendChild(tip);
    const svg = wrap.querySelector('svg'), hit = svg.querySelector('.hit');
    hit.addEventListener('pointermove', e => {
      const r = svg.getBoundingClientRect();
      const t = t0 + (e.clientX - r.left - m.l) / iw * (t1 - t0);
      const i = Math.max(0, Math.min(B.length - 1, B.findIndex(b => t >= +b.t && t < +b.t + o.width)));
      svg.querySelectorAll('.bar').forEach(el => el.classList.toggle('hot', +el.dataset.i === i));
      wrap.classList.add('hovering');
      tip.innerHTML = o.tooltip(B[i]);
      placeTip(wrap, tip, x(+B[i].t) + bw / 2, y(B[i].v));
    });
    hit.addEventListener('pointerleave', () => { wrap.classList.remove('hovering'); tip.hidden = true; });
  });
}
