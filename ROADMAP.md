# AstroHub roadmap

Ideas for after Phase 1 (the current site). Nothing here is built yet.

## Phase 2 — suggested order

Recommended sequence: **offline app → observing planner → alerts**, which covers before, during and after a session.

### 1. Make it work at the telescope
- **Installable app with offline mode** (PWA): add to the phone home screen; sky calculations, Messier list, log and tools work at a dark site without signal, using the last downloaded forecast.
- **Better sky chart**: constellation lines and names, tap an object for details, and a "point your phone at the sky" mode using the compass and tilt sensors.

### 2. Tonight's observing plan
- Pick telescope, eyepieces and available hours → an ordered target list based on what's up when, aperture, tonight's Moon, and objects not yet logged.
- Printable, red-light-friendly target sheets.
- Field-of-view preview of each object in your eyepiece or camera frame, using sky survey images.

### 3. Alerts
- Telegram or email notifications for a clear dark night, a visible ISS pass, a jump in the aurora Kp index, or a highlight event the next day.
- Runs free on a **GitHub Actions** schedule, so the site stays static with nothing to host.

### Other additions
- **More to observe:** Caldwell list, bright comets and asteroids (NASA/JPL data), Jupiter moon events and Great Red Spot transits, double and variable stars, other bright satellites (Tiangong, Starlink trains).
- **Data everywhere:** optional sign-in sync (Supabase or Firebase free tier) so the log and settings match across phone and laptop.
- **Astrophotography:** exposure calculator (500 rule and NPF rule), photo gallery linked to log entries.
- **Local astronomy scene:** a data file of local clubs, planetariums and dark-sky sites, shown on a map.
- **Polish:** a light theme for daytime reading, and image caching for faster loads.

**Skip for now:** accounts for other people, comments or forums. They turn a personal tool into a service that needs moderating and securing.

## AI agent ("Ask AstroHub")

**Status (October 2026):** a local-only version is built as an **MCP server for the Claude desktop app** (`mcp/`, see the README). It uses the existing Claude plan, so it needs no API key and no backend, and nothing is published. The in-site chat panel below is still parked; it would need the paid API and a relay.

Free and low-cost alternatives that were considered:

| Option | Cost | Notes |
|---|---|---|
| **MCP + Claude desktop app** (chosen) | Covered by a Claude plan | Chat happens in the Claude app, not inside AstroHub |
| Claude API key, local relay in `serve.py` | Haiku 5.5 under $1 a month; Opus 5.5 ~$15–30 | Chat inside AstroHub; key stays on this PC |
| Hugging Face Inference Providers | $0.10 a month free (only a few chats) | Open models; less reliable tool calling |
| Ollama (local open models) | Free | Needs a strong PC; weaker planning |

The rest of this section describes the in-site chat panel.

### Use cases, most useful first
1. **"Should I go out tonight?"**: a plain-language answer with reasons, from weather, darkness, Moon and seeing.
2. **Personal observing plan**: from available time, eyepieces and Messier progress.
3. **Log by talking or typing**: free text turned into a structured log entry, confirmed before saving.
4. **Photo help**: identify objects in a sky photo, or suggest focus, exposure and tracking fixes.
5. **Explain anything**: a tutor that knows what's on screen, such as a Webb image or an event.
6. **News and events digest**: a short weekly briefing, with web search for the latest on a topic.
7. **Alert summaries**: one short daily message, combined with the Phase 2 alerts.

### How it would work
- Claude **tool use**. The tools are AstroHub's existing JavaScript functions, run in the browser:
  `get_tonight_conditions`, `get_planets`, `get_best_messier_targets`, `find_iss_passes`, `get_sky_events`,
  `get_space_weather`, `calculate_eyepiece_view`, and `add_log_entry` (asks before saving).
- Only the conversation goes to Claude. The data stays in the browser.

### Hard requirement: a small backend relay
- The Anthropic API key **must not** be in the public site. A tiny relay holds it as a secret and passes messages through:
  **Cloudflare Workers** (recommended, free tier, about 30 lines), or Netlify or Vercel functions.
- Lock the relay to this site's address, add a passphrase, and set a **monthly spending limit** in the Anthropic Console.
- Needs an Anthropic API account (console.anthropic.com) with billing. This is separate from a Claude subscription.

### Model and rough cost
Estimates only, assuming a chat of about 6 messages with tool calls (about 40K tokens in, 3K out):

| Model | Per chat | At ~5 chats a day |
|---|---|---|
| Claude Opus 5.5 ($4 / $20 per million tokens in / out) | ~$0.10–0.20 | ~$15–30 a month |
| Claude Sonnet 5.5 ($2 / $10) | about half | ~$8–15 a month |
| Claude Haiku 5.5 ($0.10 / $0.50) | well under 1¢ | under $1 a month |

Opus 5.5 is the suggested default, because planning and photo analysis benefit most from strong reasoning. Prompt caching would roughly halve the Opus cost. Prices as of October 2026.

### Build order when resumed
1. Anthropic API account with a spending limit, then the Cloudflare relay.
2. "Ask AstroHub" chat panel with the read-only tools (use cases 1, 2, 5, 6).
3. Log-by-chat with confirmation, then photo analysis.
4. Daily briefings, connected to the alerts.
