// Remote data sources. Everything is free and works from the browser (CORS-enabled).
import { fetchJSON } from './util.js';

const MIN = 60e3, H = 3600e3;

// Hourly weather for astronomy (Open-Meteo).
export async function getForecast(loc) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat.toFixed(3)}&longitude=${loc.lon.toFixed(3)}`
    + '&hourly=cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,relative_humidity_2m,wind_speed_10m,temperature_2m,dew_point_2m,visibility,wind_speed_250hPa'
    + '&timeformat=unixtime&forecast_days=3&timezone=auto';
  const j = await fetchJSON(url, { ttl: H });
  const h = j.hourly;
  return h.time.map((t, i) => ({
    t: new Date(t * 1000), cloud: h.cloud_cover[i], low: h.cloud_cover_low[i], mid: h.cloud_cover_mid[i],
    high: h.cloud_cover_high[i], rh: h.relative_humidity_2m[i], wind: h.wind_speed_10m[i],
    temp: h.temperature_2m[i], dew: h.dew_point_2m[i], vis: h.visibility[i], jet: h.wind_speed_250hPa?.[i],
  }));
}

// Seeing & transparency estimates on a 1 (best) – 8 (worst) scale, derived from the same forecast:
// seeing from jet-stream (250 hPa) wind speed, transparency from humidity and visibility.
// (7Timer! has a dedicated model but its server blocks browser requests.)
export async function getSeeing(loc) {
  const hours = await getForecast(loc);
  return hours.filter(h => h.jet != null).map(h => {
    const seeing = h.jet < 60 ? 2 : h.jet < 100 ? 3 : h.jet < 140 ? 5 : h.jet < 180 ? 6 : 8;
    const vis = (h.vis ?? 30000) / 1000;
    const transparency = h.rh < 50 && vis > 30 ? 2 : h.rh < 65 && vis > 20 ? 3 : h.rh < 80 ? 5 : h.rh < 90 ? 6 : 8;
    return { t: h.t, seeing, transparency, jet: h.jet };
  });
}

// Planetary Kp index: observed + 3-day forecast (NOAA SWPC). Handles both the old array-of-arrays and newer object formats.
export async function getKp() {
  const j = await fetchJSON('https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json', { ttl: H });
  let rows;
  if (Array.isArray(j[0])) {
    const [hdr, ...rest] = j;
    const ix = k => hdr.indexOf(k);
    rows = rest.map(r => ({ t: r[ix('time_tag')], kp: r[ix('kp')], kind: r[ix('observed')] }));
  } else {
    rows = j.map(r => ({ t: r.time_tag, kp: r.kp, kind: r.observed }));
  }
  return rows.map(r => ({
    t: new Date(String(r.t).replace(' ', 'T') + (/Z$/.test(r.t) ? '' : 'Z')),
    kp: +r.kp, kind: r.kind || 'predicted',
  })).filter(r => !isNaN(r.kp));
}

// NASA Astronomy Picture of the Day — about the last 8 days, oldest first. Each item:
// { date, title, explanation, credit, media_type: 'image'|'video'|'mp4', url, hdurl, thumbnail_url, link }
//
// APOD moved from apod.nasa.gov to science.nasa.gov/apod in 2026, and api.nasa.gov/planetary/apod
// now returns a placeholder ("NASA Science") for every day. So the primary source is the new site's
// WordPress API (APOD entries are "image-article" posts); the old API is only a fallback.
export async function getAPOD(apiKey) {
  try {
    const posts = await fetchJSON('https://science.nasa.gov/wp-json/wp/v2/image-article?search=apod&per_page=10&_fields=date,slug,link,title,content',
      { ttl: 3 * H, key: 'apod-science', timeout: 30000 });
    const list = posts.filter(p => p.slug.startsWith('apod-')).map(parseApodPost).filter(a => a.url);
    if (list.length) return list.sort((a, b) => a.date.localeCompare(b.date));
  } catch { /* fall through to the old API */ }

  const start = new Date(Date.now() - 8 * 864e5).toISOString().slice(0, 10);
  const url = `https://api.nasa.gov/planetary/apod?api_key=${encodeURIComponent(apiKey || 'DEMO_KEY')}&thumbs=true&start_date=${start}`;
  const raw = await fetchJSON(url, { ttl: 3 * H, key: 'apod-range', timeout: 40000 });
  const ok = (Array.isArray(raw) ? raw : [raw])
    .filter(a => a && (a.url || a.thumbnail_url) && !/\/themes\/nasa-child\//.test(a.url || ''))
    .map(a => ({ ...a, credit: a.copyright, link: `https://apod.nasa.gov/apod/ap${a.date.slice(2).replace(/-/g, '')}.html` }));
  if (!ok.length) throw new Error("NASA's APOD service isn't returning pictures right now");
  return ok.sort((a, b) => a.date.localeCompare(b.date));
}

function parseApodPost(p) {
  const doc = new DOMParser().parseFromString(p.content.rendered, 'text/html');
  doc.querySelectorAll('nav, button, script, style').forEach(e => e.remove());
  const paras = [...doc.querySelectorAll('p')].map(x => x.textContent.replace(/\s+/g, ' ').trim());
  const explanation = (paras.find(t => /^Explanation\s*:/i.test(t)) || '').replace(/^(Explanation\s*:\s*)+/i, '');
  const credit = (paras.find(t => /credit/i.test(t) && t.length < 400) || '').replace(/^.*?credit[^:]*:\s*/i, '');
  const title = new DOMParser().parseFromString(p.title.rendered, 'text/html').body.textContent
    .replace(/^APOD:\s*\d{4}\s+\w+\s+\d{1,2}\s*[–-]\s*/, '');
  const base = { date: p.date.slice(0, 10), title, explanation, credit, link: p.link };
  const yt = doc.querySelector('iframe[src*="youtube"], iframe[src*="vimeo"]');
  if (yt) {
    const id = (yt.src.match(/embed\/([\w-]{11})/) || [])[1];
    return { ...base, media_type: 'video', url: yt.src, thumbnail_url: id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : '' };
  }
  const img = doc.querySelector('img[src*="assets.science.nasa.gov"]') || doc.querySelector('img');
  const mp4 = doc.querySelector('video source[src], video[src]');
  if (mp4 && !img) return { ...base, media_type: 'mp4', url: mp4.getAttribute('src'), thumbnail_url: '' };
  if (!img) return base;
  const full = img.getAttribute('src').split('?')[0];
  return { ...base, media_type: 'image', url: full + '?w=1600', hdurl: full, thumbnail_url: full + '?w=800' };
}

// Spaceflight News API (articles, blogs, reports).
export function getNews({ search = '', limit = 24, offset = 0, type = 'articles' } = {}) {
  const u = new URL(`https://api.spaceflightnewsapi.net/v4/${type}/`);
  u.searchParams.set('limit', limit);
  u.searchParams.set('offset', offset);
  if (search) u.searchParams.set('search', search);
  return fetchJSON(u.toString(), { ttl: 20 * MIN });
}

// Any RSS feed converted to JSON (rss2json free tier).
export function getRSS(feedUrl) {
  return fetchJSON(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feedUrl)}`, { ttl: H });
}

// ESA/Webb and ESA/Hubble official image feeds (RSS, CORS-enabled). Merged, de-duplicated, newest first.
export const ESA_FEEDS = {
  webb: { site: 'https://esawebb.org', cdn: 'https://cdn.esawebb.org', feeds: ['/images/feed/', '/images/potm/feed/'] },
  hubble: { site: 'https://esahubble.org', cdn: 'https://cdn.esahubble.org', feeds: ['/images/feed/', '/images/potw/feed/'] },
};
export async function getEsaImages(which) {
  const cfg = ESA_FEEDS[which];
  const texts = await Promise.allSettled(cfg.feeds.map(f => fetchJSON(cfg.site + f, { ttl: 6 * H, text: true })));
  const seen = new Set(), out = [];
  texts.forEach((r, fi) => {
    if (r.status !== 'fulfilled') return;
    const doc = new DOMParser().parseFromString(r.value, 'text/xml');
    doc.querySelectorAll('item').forEach((it, idx) => {
      const link = it.querySelector('link')?.textContent.trim();
      if (!link || seen.has(link)) return;
      seen.add(link);
      const id = link.replace(/\/$/, '').split('/').pop();
      const html = it.querySelector('description')?.textContent || '';
      const box = document.createElement('div');
      box.innerHTML = html.replace(/<img[^>]*>/gi, '');
      const pub = it.querySelector('pubDate')?.textContent;
      out.push({
        id, link, title: it.querySelector('title')?.textContent.trim(),
        date: pub ? new Date(pub) : null, order: fi * 100 + idx,
        desc: box.textContent.replace(/\s+/g, ' ').trim().slice(0, 400),
        thumb: `${cfg.cdn}/archives/images/thumb700x/${id}.jpg`,
        large: `${cfg.cdn}/archives/images/screen/${id}.jpg`,
        potm: fi === 1,
      });
    });
  });
  if (!out.length) throw new Error(texts.find(t => t.status === 'rejected')?.reason?.message || 'no images');
  return out.sort((a, b) => (b.date && a.date) ? b.date - a.date : a.order - b.order);
}

// NASA Image and Video Library search, newest first.
export async function getNasaImages(q, yearsBack = 2) {
  const url = `https://images-api.nasa.gov/search?q=${encodeURIComponent(q)}&media_type=image&year_start=${new Date().getFullYear() - yearsBack}`;
  const j = await fetchJSON(url, { ttl: 6 * H });
  return j.collection.items
    .map(it => {
      const dd = it.data?.[0] || {};
      return {
        id: dd.nasa_id, title: dd.title, date: dd.date_created || '', center: dd.center,
        desc: (dd.description || '').slice(0, 600), thumb: it.links?.[0]?.href,
      };
    })
    .filter(x => x.thumb && x.id)
    .sort((a, b) => b.date.localeCompare(a.date));
}

// Launch Library 2 (The Space Devs) — free tier allows ~15 requests/hour, so cache for an hour.
export function getLaunches() {
  return fetchJSON('https://ll.thespacedevs.com/2.3.0/launches/upcoming/?limit=15&hide_recent_previous=true', { ttl: H });
}
export function getSpaceEvents() {
  return fetchJSON('https://ll.thespacedevs.com/2.3.0/events/upcoming/?limit=12', { ttl: H });
}

// ISS orbital elements (TLE), with CelesTrak as a fallback.
export async function getISSTLE() {
  try {
    const j = await fetchJSON('https://api.wheretheiss.at/v1/satellites/25544/tles', { ttl: 6 * H });
    return [j.line1, j.line2];
  } catch {
    const t = await fetchJSON('https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE', { ttl: 6 * H, text: true });
    const l = t.trim().split(/\r?\n/);
    return [l[1].trim(), l[2].trim()];
  }
}

// People currently in space.
export function getCrew() {
  return fetchJSON('https://corquaid.github.io/international-space-station-APIs/JSON/people-in-space.json', { ttl: 12 * H });
}
