# Weather Dashboard

A polished, mobile-responsive weather dashboard with city search, live current conditions, a 24-hour outlook, and a 7-day forecast. Built with vanilla JavaScript and Tailwind CSS.

**Live demo:** https://brittanynation.github.io/weather-dashboard/

## Features

- **City search with autocomplete** — debounced search against the Open-Meteo geocoding API, with keyboard navigation (arrow keys + Enter) and a friendly empty state
- **Current conditions hero** — big temperature, condition label and icon, feels-like, today's high/low, humidity, wind, sunrise and sunset
- **7-day forecast cards** — day name, weather icon, high/low temps, and a precipitation-chance bar
- **24-hour temperature strip** — horizontally scrollable, starting at the current hour
- **°C / °F toggle** — converts every temperature on the page instantly, no refetch needed
- **Adaptive sky gradient** — the background shifts with the current condition (clear, cloudy, rain, snow, storm) and day/night
- **Loading and error states** — spinner while fetching, clear messages for bad searches and network failures
- **Mobile-responsive** — stacked layout and a 2-column day grid on small screens

## Data

Weather data is provided by [Open-Meteo](https://open-meteo.com/) — a free, open-source weather API. No API key is required. Weather codes follow the WMO standard and are mapped to emoji icons in `app.js`.

## Run locally

No build step needed — just serve the folder and open it in a browser:

```bash
cd weather-dashboard
npx serve .
# or
python3 -m http.server 8000
```

Then visit `http://localhost:8000` (or the port shown).

## Files

| File | Purpose |
|------|---------|
| `index.html` | Markup, Tailwind via CDN |
| `styles.css` | Custom styles: sky gradients, glassmorphism, spinners |
| `app.js` | All app logic, commented: search, fetch, render, unit toggle |

## License

MIT — feel free to use and adapt.
