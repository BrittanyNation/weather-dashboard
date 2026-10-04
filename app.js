/**
 * Weather Dashboard — vanilla JS app powered by the Open-Meteo API.
 *
 * Flow:
 *   1. On load, fetch weather for the default city (Nashville, TN).
 *   2. City search (debounced) hits the Open-Meteo geocoding API and
 *      shows an autocomplete dropdown; picking a city loads its weather.
 *   3. All temperatures render in the selected unit (°F default, °C toggle).
 *      Forecast data is requested in Celsius and converted on the client
 *      so toggling units never needs a refetch.
 *   4. The sky gradient class reflects the current condition + day/night.
 */

/* ---------------- Configuration ---------------- */
const GEOCODE_URL  = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const DEFAULT_CITY = { name: 'Nashville', admin1: 'Tennessee', country: 'United States', latitude: 36.1627, longitude: -86.7816 };

/* ---------------- DOM references ---------------- */
const $ = (id) => document.getElementById(id);
const searchInput  = $('search-input');
const suggestions  = $('suggestions');
const searchSpinner = $('search-spinner');
const errorBanner  = $('error-banner');
const loader       = $('loader');
const dashboard    = $('dashboard');
const sky          = $('sky');
const btnC         = $('btn-c');
const btnF         = $('btn-f');

/* ---------------- State ---------------- */
let unit = 'F';              // 'F' | 'C'
let lastData = null;         // last full forecast payload (for unit re-render)
let activeIndex = -1;        // keyboard nav position in suggestions
let debounceTimer = null;

/* ---------------- WMO weather-code map ----------------
   Open-Meteo returns numeric WMO codes. We map each range to an
   emoji icon + label, plus a "mood" used for the sky gradient. */
const WMO = {
  0:  { icon: '☀️',  label: 'Clear sky',           mood: 'clear'  },
  1:  { icon: '🌤️',  label: 'Mostly clear',        mood: 'clear'  },
  2:  { icon: '⛅',  label: 'Partly cloudy',       mood: 'cloudy' },
  3:  { icon: '☁️',  label: 'Overcast',            mood: 'cloudy' },
  45: { icon: '🌫️',  label: 'Fog',                 mood: 'cloudy' },
  48: { icon: '🌫️',  label: 'Icy fog',             mood: 'cloudy' },
  51: { icon: '🌦️',  label: 'Light drizzle',       mood: 'rain'   },
  53: { icon: '🌦️',  label: 'Drizzle',             mood: 'rain'   },
  55: { icon: '🌧️',  label: 'Dense drizzle',       mood: 'rain'   },
  56: { icon: '🌧️',  label: 'Freezing drizzle',    mood: 'rain'   },
  57: { icon: '🌧️',  label: 'Dense freezing drizzle', mood: 'rain'},
  61: { icon: '🌧️',  label: 'Light rain',          mood: 'rain'   },
  63: { icon: '🌧️',  label: 'Rain',                mood: 'rain'   },
  65: { icon: '🌧️',  label: 'Heavy rain',          mood: 'rain'   },
  66: { icon: '🌧️',  label: 'Freezing rain',       mood: 'rain'   },
  67: { icon: '🌧️',  label: 'Heavy freezing rain', mood: 'rain'   },
  71: { icon: '🌨️',  label: 'Light snow',          mood: 'snow'   },
  73: { icon: '🌨️',  label: 'Snow',                mood: 'snow'   },
  75: { icon: '❄️',  label: 'Heavy snow',          mood: 'snow'   },
  77: { icon: '🌨️',  label: 'Snow grains',         mood: 'snow'   },
  80: { icon: '🌦️',  label: 'Light showers',       mood: 'rain'   },
  81: { icon: '🌧️',  label: 'Showers',             mood: 'rain'   },
  82: { icon: '⛈️',  label: 'Violent showers',     mood: 'storm'  },
  85: { icon: '🌨️',  label: 'Snow showers',        mood: 'snow'   },
  86: { icon: '🌨️',  label: 'Heavy snow showers',  mood: 'snow'   },
  95: { icon: '⛈️',  label: 'Thunderstorm',        mood: 'storm'  },
  96: { icon: '⛈️',  label: 'Thunderstorm w/ hail', mood: 'storm' },
  99: { icon: '⛈️',  label: 'Thunderstorm w/ hail', mood: 'storm' },
};
const codeInfo = (code) => WMO[code] || { icon: '🌡️', label: 'Unknown', mood: 'cloudy' };

/* ---------------- Unit conversion ---------------- */
const toUnit = (c) => (unit === 'F' ? (c * 9) / 5 + 32 : c);
const fmtTemp = (c) => `${Math.round(toUnit(c))}°`;
const fmtWind = (kmh) => (unit === 'F' ? `${Math.round(kmh * 0.621371)} mph` : `${Math.round(kmh)} km/h`);
const fmtTime = (iso) =>
  new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/* ---------------- API calls ---------------- */
async function geocode(query) {
  const url = `${GEOCODE_URL}?name=${encodeURIComponent(query)}&count=6&language=en&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('search');
  const data = await res.json();
  return data.results || [];
}

async function fetchWeather(lat, lon) {
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m',
    hourly: 'temperature_2m,weather_code',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max',
    timezone: 'auto',
    forecast_days: '7',
  });
  const res = await fetch(`${FORECAST_URL}?${params}`);
  if (!res.ok) throw new Error('forecast');
  return res.json();
}

/* ---------------- Search autocomplete ---------------- */
searchInput.addEventListener('input', () => {
  clearTimeout(debounceTimer);
  const q = searchInput.value.trim();
  hideSuggestions();
  if (q.length < 2) return;
  debounceTimer = setTimeout(async () => {
    searchSpinner.classList.remove('hidden');
    try {
      const results = await geocode(q);
      renderSuggestions(results);
    } catch {
      showError('Search is unavailable right now. Please check your connection and try again.');
    } finally {
      searchSpinner.classList.add('hidden');
    }
  }, 350); // debounced so we don't fire a request per keystroke
});

searchInput.addEventListener('keydown', (e) => {
  const items = [...suggestions.querySelectorAll('.suggestion-item')];
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (!items.length) return;
    activeIndex = e.key === 'ArrowDown'
      ? (activeIndex + 1) % items.length
      : (activeIndex - 1 + items.length) % items.length;
    items.forEach((el, i) => el.classList.toggle('suggestion-active', i === activeIndex));
    items[activeIndex].scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter') {
    if (activeIndex >= 0 && items[activeIndex]) items[activeIndex].click();
    else if (items.length) items[0].click(); // Enter selects the top match
  } else if (e.key === 'Escape') {
    hideSuggestions();
  }
});

// Close the dropdown when clicking elsewhere
document.addEventListener('click', (e) => {
  if (!e.target.closest('#search-input') && !e.target.closest('#suggestions')) hideSuggestions();
});

function renderSuggestions(results) {
  suggestions.innerHTML = '';
  activeIndex = -1;
  if (!results.length) {
    suggestions.innerHTML = `<li class="px-5 py-4 text-sm text-white/60">No cities found — try another spelling.</li>`;
  } else {
    for (const r of results) {
      const li = document.createElement('li');
      li.innerHTML = `
        <button type="button" class="suggestion-item" role="option">
          <span aria-hidden="true">📍</span>
          <span><strong class="font-semibold">${escapeHtml(r.name)}</strong>
          <span class="text-white/55 text-sm">${escapeHtml([r.admin1, r.country].filter(Boolean).join(', '))}</span></span>
        </button>`;
      li.querySelector('button').addEventListener('click', () => {
        hideSuggestions();
        searchInput.value = r.name;
        loadCity(r);
      });
      suggestions.appendChild(li);
    }
  }
  suggestions.classList.remove('hidden');
}

function hideSuggestions() {
  suggestions.classList.add('hidden');
  activeIndex = -1;
}

/* ---------------- Loading a city's weather ---------------- */
async function loadCity(place) {
  hideError();
  loader.classList.remove('hidden');
  dashboard.classList.add('hidden');
  try {
    const data = await fetchWeather(place.latitude, place.longitude);
    lastData = { data, place };
    render(data, place);
    loader.classList.add('hidden');
    dashboard.classList.remove('hidden');
  } catch {
    loader.classList.add('hidden');
    showError('Could not load weather data. Check your connection and try again.');
  }
}

/* ---------------- Rendering ---------------- */
function render(data, place) {
  const c = data.current;
  const d = data.daily;
  const info = codeInfo(c.weather_code);

  // Hero
  $('location').textContent = [place.name, place.admin1, place.country].filter(Boolean).join(', ');
  $('current-temp').textContent = Math.round(toUnit(c.temperature_2m));
  $('current-unit-label').textContent = `°${unit}`;
  $('current-icon').textContent = info.icon;
  $('current-condition').textContent = info.label;
  $('feels-like').textContent = fmtTemp(c.apparent_temperature);
  $('today-high').textContent = fmtTemp(d.temperature_2m_max[0]);
  $('today-low').textContent = fmtTemp(d.temperature_2m_min[0]);
  $('humidity').textContent = `${c.relative_humidity_2m}%`;
  $('wind').textContent = fmtWind(c.wind_speed_10m);
  $('sunrise').textContent = fmtTime(d.sunrise[0]);
  $('sunset').textContent = fmtTime(d.sunset[0]);

  // Sky gradient: mood + day/night from sunrise/sunset
  applySky(info.mood, c.time, d.sunrise[0], d.sunset[0]);

  // Hourly strip: next 24 hours from "now"
  renderHourly(data);

  // 7-day forecast
  renderDaily(data);
}

function applySky(mood, nowIso, sunriseIso, sunsetIso) {
  const now = new Date(nowIso);
  const isNight = now < new Date(sunriseIso) || now >= new Date(sunsetIso);
  const time = isNight ? 'night' : 'day';
  const moodClass = ['clear', 'cloudy', 'rain', 'snow', 'storm'].includes(mood)
    ? `${mood}-${time}`
    : `cloudy-${time}`;
  // snow/storm use one gradient regardless of day/night
  const cls = mood === 'snow' ? 'sky-snow' : mood === 'storm' ? 'sky-storm' : `sky-${moodClass}`;
  sky.className = `sky ${cls}`;
}

function renderHourly(data) {
  const strip = $('hourly-strip');
  strip.innerHTML = '';
  const now = new Date(data.current.time);
  // Find the first hourly slot at/after now, then take 24
  let start = data.hourly.time.findIndex((t) => new Date(t) >= now);
  if (start < 0) start = 0;
  const slice = data.hourly.time.slice(start, start + 24);

  slice.forEach((t, i) => {
    const idx = start + i;
    const item = document.createElement('div');
    item.className = 'hour-item' + (i === 0 ? ' hour-item-now' : '');
    item.innerHTML = `
      <span class="text-[11px] font-semibold text-white/60">${i === 0 ? 'Now' : fmtTime(t).replace(':00', '')}</span>
      <span class="text-xl" aria-hidden="true">${codeInfo(data.hourly.weather_code[idx]).icon}</span>
      <span class="text-sm font-bold">${fmtTemp(data.hourly.temperature_2m[idx])}</span>`;
    strip.appendChild(item);
  });
}

function renderDaily(data) {
  const grid = $('daily-grid');
  grid.innerHTML = '';
  const today = new Date(data.current.time).toDateString();

  data.daily.time.forEach((t, i) => {
    const date = new Date(t + 'T12:00:00'); // noon avoids TZ edge cases
    const isToday = date.toDateString() === today;
    const info = codeInfo(data.daily.weather_code[i]);
    const precip = data.daily.precipitation_probability_max[i] ?? 0;
    const card = document.createElement('div');
    card.className = 'day-card' + (isToday ? ' day-card-today' : '');
    card.innerHTML = `
      <p class="text-xs font-bold uppercase tracking-wider text-white/60">${isToday ? 'Today' : date.toLocaleDateString([], { weekday: 'short' })}</p>
      <p class="text-3xl my-2" aria-hidden="true">${info.icon}</p>
      <p class="text-sm font-semibold"><span>${fmtTemp(data.daily.temperature_2m_max[i])}</span>
        <span class="text-white/55 font-medium"> / ${fmtTemp(data.daily.temperature_2m_min[i])}</span></p>
      <div class="precip-bar" title="${precip}% chance of precipitation">
        <div class="precip-fill" style="width:${precip}%"></div>
      </div>
      <p class="text-[11px] text-sky-200 mt-1 font-medium">${precip}% precip</p>`;
    grid.appendChild(card);
  });
}

/* ---------------- Error handling ---------------- */
function showError(msg) {
  errorBanner.textContent = msg;
  errorBanner.classList.remove('hidden');
  errorBanner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function hideError() {
  errorBanner.classList.add('hidden');
}

/* ---------------- Unit toggle ---------------- */
function setUnit(u) {
  unit = u;
  btnC.classList.toggle('unit-btn-active', u === 'C');
  btnF.classList.toggle('unit-btn-active', u === 'F');
  btnC.setAttribute('aria-pressed', u === 'C');
  btnF.setAttribute('aria-pressed', u === 'F');
  if (lastData) render(lastData.data, lastData.place); // re-render, no refetch
}
btnC.addEventListener('click', () => setUnit('C'));
btnF.addEventListener('click', () => setUnit('F'));

/* ---------------- XSS guard for API-provided names ---------------- */
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[m]));
}

/* ---------------- Boot: load default city ---------------- */
loadCity(DEFAULT_CITY);
