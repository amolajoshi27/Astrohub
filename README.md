# AstroHub

*All things astronomical.*

**Live site:** https://amolajoshi27.github.io/Astrohub/

A personal astronomy website: tonight's sky and observing forecast, ISS live tracking, Webb/Hubble/APOD images, live Sun, space weather, news, a 12-month events calendar, Messier checklist, observing log, observer calculators and beginner guides.

It's a plain static site (HTML, CSS, JavaScript). It needs no build step, server code or accounts.

## Run it locally

Browsers block JavaScript modules opened straight from a file, so serve the folder with Python. `serve.py` turns off browser caching, so edits show up as soon as you reload:

```
cd D:\Amol\Amol\AI\Claude\Astrohub
C:\Users\Amol\AppData\Local\Programs\Python\Python312\python.exe serve.py
```

Then open http://localhost:8080 in your browser. Press Ctrl+C in the terminal to stop.

## First run

1. Choose your city in the location dialog that opens on the first visit, or use your device location.
2. Optional: under **Settings**, add a free NASA API key from https://api.nasa.gov. It's only used as a backup source for Picture of the Day, where the shared `DEMO_KEY` allows about 30 requests an hour.
3. Press **R** at any time, or click the moon button, to switch red night-vision mode on or off.

Your location, settings, Messier ticks, local events and observing log are stored in this browser only. Use **Log → Export JSON** to back up your log.

## Publishing

The site is published with GitHub Pages from the `main` branch of https://github.com/amolajoshi27/Astrohub (**Settings → Pages → Deploy from a branch → `main` / root**). To update the live site, commit and push:

```
git add -A
git commit -m "Describe your change"
git push
```

GitHub rebuilds the site within a minute or two.

Browser data does not move with the site, because each web address keeps its own storage. Export your log from the local copy and import it on the published one.

## Data sources

| Feature | Source |
|---|---|
| Sun/Moon/planets, eclipses, conjunctions | Astronomy Engine (calculated in the browser) |
| ISS position and passes | satellite.js with TLE from wheretheiss.at / CelesTrak |
| Cloud, humidity, wind | Open-Meteo |
| Seeing and transparency | Estimated from Open-Meteo jet-stream wind, humidity and visibility |
| Kp index and aurora | NOAA SWPC |
| News | Spaceflight News API, plus RSS via rss2json |
| Picture of the Day | science.nasa.gov/apod (APOD's new home), with the NASA APOD API as a backup |
| Webb and Hubble images | ESA/Webb and ESA/Hubble image feeds |
| ISS live video | NASA's official 24/7 YouTube streams (change the ID in Settings if NASA restarts them) |
| Live Sun | NASA SDO and SOHO |
| Launches and spaceflight events | Launch Library 2 (The Space Devs) |
| City search | Open-Meteo Geocoding |

## Project layout

```
index.html          page shell and navigation
css/style.css       theme (night + red mode)
js/app.js           router, top bar, red mode
js/settings.js      location and preferences dialog
js/astro.js         sky calculations and the events engine
js/data.js          remote data sources
js/iss-calc.js      ISS orbit and passes
js/charts.js        SVG charts
js/pages/*.js       one file per page
data/*.js           Messier catalogue and meteor showers
```
