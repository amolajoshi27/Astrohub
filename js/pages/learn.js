// Learn: constellation of the month and practical observing guides.
import { esc } from '../util.js';

// Well placed in the evening (~9–10 pm) for mid-northern latitudes; southern observers see them lower / inverted.
const CONSTELLATIONS = [
  ['Orion', 'The Hunter', 'Betelgeuse and Rigel, the belt stars, and the Orion Nebula (M42) in the sword — the finest nebula in the sky.'],
  ['Canis Major & Gemini', 'Great Dog & Twins', 'Sirius, the brightest star; open cluster M41 below it. Castor and Pollux mark the Twins, with M35 at their feet.'],
  ['Cancer', 'The Crab', 'Faint stars, but the Beehive Cluster (M44) is a lovely binocular sight. M67 is one of the oldest open clusters known.'],
  ['Leo', 'The Lion', 'The "backwards question mark" sickle with Regulus. The Leo Triplet (M65, M66, NGC 3628) fits in one telescope field.'],
  ['Ursa Major & Boötes', 'Great Bear & Herdsman', 'Follow the arc of the Big Dipper\'s handle to Arcturus. Hunt M81/M82 and the Whirlpool M51.'],
  ['Virgo & Hercules', 'Maiden & Hero', 'Spica leads to the Virgo galaxy cluster. In Hercules, the Great Globular Cluster M13 is a summer showpiece.'],
  ['Scorpius', 'The Scorpion', 'Red Antares and the curling tail. Globulars M4 and M80; clusters M6 and M7 near the stinger.'],
  ['Sagittarius & Lyra', 'Archer & Lyre', 'The "Teapot" points to the galactic centre: Lagoon (M8), Trifid (M20), M22. Vega in Lyra hosts the Ring Nebula M57.'],
  ['Cygnus & Aquila', 'Swan & Eagle', 'The Northern Cross along the Milky Way. Albireo is a stunning gold-and-blue double star; the Dumbbell M27 is nearby.'],
  ['Pegasus', 'The Winged Horse', 'The Great Square of autumn. Globular M15 sits off the horse\'s nose; Andromeda attaches to the square\'s corner.'],
  ['Andromeda & Perseus', 'Princess & Hero', 'The Andromeda Galaxy (M31), 2.5 million light-years away, is visible to the naked eye. The Double Cluster lies in Perseus.'],
  ['Taurus & Cassiopeia', 'Bull & Queen', 'The Pleiades (M45) and Hyades with orange Aldebaran. The "W" of Cassiopeia is full of open clusters.'],
];

const GUIDES = [
  ['Getting started: your first nights', `
    <ul><li><strong>Start with your eyes and binoculars.</strong> 7×50 or 10×50 binoculars show craters on the Moon, Jupiter's moons, the Pleiades and the Andromeda Galaxy.</li>
    <li><strong>Learn a few bright patterns first</strong> — the Big Dipper, Orion, Cassiopeia, the Summer Triangle — then "star hop" from them.</li>
    <li><strong>Dark adaptation takes 20–30 minutes.</strong> One glance at a white phone screen resets it. Use red light: press <kbd>R</kbd> or the moon button for this site's red mode.</li>
    <li><strong>Use averted vision:</strong> look slightly to one side of a faint object — the edge of your eye is more sensitive to dim light.</li>
    <li><strong>Dress warmer than you think,</strong> bring a chair and a notebook (or use the Log page).</li></ul>`],
  ['Choosing a telescope', `
    <ul><li><strong>Aperture matters most.</strong> A bigger mirror or lens gathers more light and shows fainter objects. An 8" (200 mm) Dobsonian is the classic best-value first telescope.</li>
    <li><strong>A steady mount matters more than magnification.</strong> Ignore "500× power" claims; useful maximum is about 2× the aperture in mm.</li>
    <li><strong>Refractors</strong> are low-maintenance and great for the Moon, planets and wide-field photography. <strong>Reflectors</strong> give the most aperture per rupee/dollar. <strong>Catadioptrics</strong> (SCT/Maksutov) are compact with long focal lengths.</li>
    <li><strong>Eyepieces:</strong> start with a low-power (25–32 mm) and a medium-power (9–12 mm) eyepiece. Use the Tools page to see magnification and field of view.</li></ul>`],
  ['Seeing vs transparency', `
    <p><strong>Seeing</strong> is how steady the air is. Poor seeing makes stars twinkle strongly and planets "boil" at high magnification. Good seeing matters most for the Moon, planets and double stars.</p>
    <p><strong>Transparency</strong> is how clear the air is — haze, humidity, smoke and dust dim faint objects. Good transparency matters most for galaxies and nebulae.</p>
    <p>A night can have excellent seeing but poor transparency (often hazy, calm nights) or the opposite (crisp nights after a cold front). The Tonight page shows both.</p>`],
  ['Star hopping', `
    <ol><li>Find a bright star near your target using a chart or the sky chart on the Tonight page.</li>
    <li>Look through your finder and note the patterns of stars — triangles, lines, pairs.</li>
    <li>Move from pattern to pattern towards the target, using your finder's field width as a "ruler".</li>
    <li>Switch to your lowest-power eyepiece to confirm, then increase magnification.</li></ol>
    <p>Handy sky ruler at arm's length: little finger ≈ 1°, three fingers ≈ 5°, fist ≈ 10°, spread hand ≈ 20°.</p>`],
  ['Photographing the night sky with a phone', `
    <ul><li>Use a tripod and Night mode (or Pro/Manual mode with 10–30 s exposures and ISO 800–3200).</li>
    <li>Focus manually on infinity, or tap to focus on a bright star.</li>
    <li>Use a 2–3 s timer so touching the phone doesn't shake the image.</li>
    <li>For the Moon through a telescope, hold the phone camera centred on the eyepiece (phone adapters make this easy) and lower the exposure.</li></ul>`],
  ['Observing the Sun safely', `
    <p><strong>Never look at the Sun through binoculars or a telescope without a certified solar filter</strong> fitted securely over the front of the instrument — permanent eye damage happens instantly. Eclipse glasses must meet ISO 12312-2. Projection onto white card is a safe alternative. See the live Sun images on the Space Feeds page.</p>`],
];

export async function render(root) {
  const m = new Date().getMonth();
  const [name, nick, text] = CONSTELLATIONS[m];
  const next = CONSTELLATIONS[(m + 1) % 12];
  root.innerHTML = `
  <header class="page-head"><p class="eyebrow">Learn</p><h1>Observing guides</h1>
    <p class="lede">Practical know-how for getting the most out of every clear night.</p></header>
  <section class="grid-2">
    <div class="card"><p class="eyebrow">Constellation of the month</p><h2 style="font-size:1.6rem">${esc(name)}</h2><p class="dim"><em>${esc(nick)}</em></p><p>${esc(text)}</p>
      <p class="small muted">Best in the evening sky this month for mid-northern latitudes. Next month: ${esc(next[0])}.</p></div>
    <div class="card"><p class="eyebrow">Quick reference</p>
      <div class="table-wrap"><table><tbody>
        <tr><td>Magnitude</td><td class="dim">Lower = brighter. Sirius −1.5, faintest naked-eye ~6, Pluto ~14.</td></tr>
        <tr><td>Arcminute (′)</td><td class="dim">1/60 of a degree. The full Moon is ~31′ across.</td></tr>
        <tr><td>RA / Dec</td><td class="dim">Sky "longitude" (hours) and "latitude" (degrees).</td></tr>
        <tr><td>Opposition</td><td class="dim">A planet opposite the Sun — closest, brightest, up all night.</td></tr>
        <tr><td>Elongation</td><td class="dim">Angle from the Sun; Mercury and Venus are best at greatest elongation.</td></tr>
        <tr><td>Kp index</td><td class="dim">Geomagnetic activity 0–9; higher means aurora further from the poles.</td></tr>
      </tbody></table></div></div>
  </section>
  <section style="margin-top:18px">${GUIDES.map(([t, h], i) => `<details class="guide"${i ? '' : ' open'}><summary>${esc(t)}</summary><div class="prose">${h}</div></details>`).join('')}</section>
  <section class="card"><h2>All twelve months</h2><div class="table-wrap"><table><thead><tr><th>Month</th><th>Constellation</th><th>Highlights</th></tr></thead><tbody>
    ${CONSTELLATIONS.map((c, i) => `<tr${i === m ? ' style="background:var(--accent-soft)"' : ''}><td class="nowrap">${new Date(2000, i, 1).toLocaleString(undefined, { month: 'long' })}</td><td class="nowrap"><b>${esc(c[0])}</b></td><td class="dim">${esc(c[2])}</td></tr>`).join('')}
  </tbody></table></div></section>`;
}
