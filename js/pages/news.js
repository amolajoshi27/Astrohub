// News hub: Spaceflight News API topics + astronomy RSS feeds.
import { esc, relTime, stripHtml } from '../util.js';
import { getNews, getRSS } from '../data.js';

const TOPICS = [
  { id: 'latest', label: 'Latest', q: '' },
  { id: 'telescopes', label: 'Webb & Hubble', q: 'telescope' },
  { id: 'planets', label: 'Planets & Moon', q: 'Mars' },
  { id: 'moon', label: 'Lunar', q: 'Moon' },
  { id: 'launches', label: 'Launches', q: 'launch' },
  { id: 'blogs', label: 'Blogs', q: '', type: 'blogs' },
  { id: 'rss', label: 'Astronomy sources', rss: true },
];
const FEEDS = [
  { name: 'NASA Science', url: 'https://science.nasa.gov/feed/' },
  { name: 'Universe Today', url: 'https://www.universetoday.com/feed/' },
  { name: 'Sky & Telescope', url: 'https://skyandtelescope.org/feed/' },
  { name: 'ESA Space Science', url: 'https://www.esa.int/rssfeed/Our_Activities/Space_Science' },
  { name: 'Phys.org Astronomy', url: 'https://phys.org/rss-feed/space-news/astronomy/' },
];

export async function render(root) {
  let topic = TOPICS[0], offset = 0, search = '';
  root.innerHTML = `
  <header class="page-head"><p class="eyebrow">News</p><h1>Astronomy &amp; space news</h1>
    <p class="lede">Fresh stories from dozens of space news sites, plus feeds from NASA, ESA and astronomy magazines.</p></header>
  <div class="tabs" id="nTabs">${TOPICS.map((t, i) => `<button data-i="${i}" class="${i ? '' : 'active'}">${t.label}</button>`).join('')}</div>
  <div class="toolbar" id="nTools"><input type="search" class="grow" id="nSearch" placeholder="Search stories (e.g. exoplanet, Artemis, JWST)…" style="max-width:420px"><button class="btn" id="nGo">Search</button></div>
  <div class="cards" id="nList"></div>
  <div style="text-align:center;margin-top:20px"><button class="btn" id="nMore">Load more</button></div>`;
  const list = root.querySelector('#nList'), more = root.querySelector('#nMore');

  const card = a => `<a class="media-card" href="${esc(a.url)}" target="_blank" rel="noopener">
    <div class="thumb">${a.img ? `<img src="${esc(a.img)}" alt="" loading="lazy" onerror="this.remove()">` : ''}</div>
    <div class="body"><div class="meta"><b>${esc(a.site)}</b><span>${relTime(a.date)}</span></div><h3>${esc(a.title)}</h3><p>${esc(a.summary)}</p></div></a>`;

  async function load(reset) {
    if (reset) { offset = 0; list.innerHTML = Array(6).fill('<div class="skeleton" style="height:280px"></div>').join(''); }
    more.disabled = true;
    try {
      let items;
      if (topic.rss) {
        const res = await Promise.allSettled(FEEDS.map(f => getRSS(f.url).then(j => (j.items || []).map(it => ({
          url: it.link, title: it.title, site: f.name, date: (it.pubDate || '').replace(' ', 'T') + 'Z',
          img: it.thumbnail || it.enclosure?.link || '', summary: stripHtml(it.description).slice(0, 220),
        })))));
        items = res.flatMap(r => r.status === 'fulfilled' ? r.value : []).sort((a, b) => new Date(b.date) - new Date(a.date));
        if (search) items = items.filter(i => (i.title + i.summary).toLowerCase().includes(search.toLowerCase()));
        more.style.display = 'none';
      } else {
        const j = await getNews({ search: search || topic.q, offset, limit: 24, type: topic.type || 'articles' });
        items = j.results.map(a => ({ url: a.url, title: a.title, site: a.news_site, date: a.published_at, img: a.image_url, summary: a.summary }));
        offset += j.results.length;
        more.style.display = j.next ? '' : 'none';
      }
      if (reset) list.innerHTML = '';
      list.insertAdjacentHTML('beforeend', items.map(card).join('') || '<p class="empty">No stories found.</p>');
    } catch (e) {
      list.innerHTML = `<p class="error">Could not load news: ${esc(e.message)}</p>`;
    }
    more.disabled = false;
  }

  root.querySelector('#nTabs').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    root.querySelectorAll('#nTabs button').forEach(x => x.classList.toggle('active', x === b));
    topic = TOPICS[+b.dataset.i]; search = ''; root.querySelector('#nSearch').value = '';
    load(true);
  });
  const doSearch = () => { search = root.querySelector('#nSearch').value.trim(); load(true); };
  root.querySelector('#nGo').addEventListener('click', doSearch);
  root.querySelector('#nSearch').addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
  more.addEventListener('click', () => load(false));
  load(true);
}
