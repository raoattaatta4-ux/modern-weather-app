const els = {
  searchForm: document.getElementById('searchForm'),
  cityInput: document.getElementById('cityInput'),
  suggestions: document.getElementById('suggestions'),
  locationBtn: document.getElementById('locationBtn'),
  unitToggle: document.getElementById('unitToggle'),
  unitC: document.getElementById('unitC'),
  status: document.getElementById('status'),
  weatherContent: document.getElementById('weatherContent'),
  recentSearches: document.getElementById('recentSearches'),
  locationLabel: document.getElementById('locationLabel'),
  dateLabel: document.getElementById('dateLabel'),
  weatherIcon: document.getElementById('weatherIcon'),
  weatherText: document.getElementById('weatherText'),
  currentTemp: document.getElementById('currentTemp'),
  feelsLike: document.getElementById('feelsLike'),
  humidity: document.getElementById('humidity'),
  wind: document.getElementById('wind'),
  pressure: document.getElementById('pressure'),
  cloudCover: document.getElementById('cloudCover'),
  sunrise: document.getElementById('sunrise'),
  sunset: document.getElementById('sunset'),
  rainNow: document.getElementById('rainNow'),
  windDirection: document.getElementById('windDirection'),
  hourlyForecast: document.getElementById('hourlyForecast'),
  dailyForecast: document.getElementById('dailyForecast')
};

let unit = localStorage.getItem('skycast-unit') || 'c';
let lastPlace = null;
let suggestionTimer = null;

const weatherMap = {
  0: ['Clear sky', '☀️'],
  1: ['Mainly clear', '🌤️'],
  2: ['Partly cloudy', '⛅'],
  3: ['Overcast', '☁️'],
  45: ['Fog', '🌫️'],
  48: ['Rime fog', '🌫️'],
  51: ['Light drizzle', '🌦️'],
  53: ['Drizzle', '🌦️'],
  55: ['Heavy drizzle', '🌧️'],
  56: ['Freezing drizzle', '🌧️'],
  57: ['Heavy freezing drizzle', '🌧️'],
  61: ['Light rain', '🌦️'],
  63: ['Rain', '🌧️'],
  65: ['Heavy rain', '🌧️'],
  66: ['Freezing rain', '🌧️'],
  67: ['Heavy freezing rain', '🌧️'],
  71: ['Light snow', '🌨️'],
  73: ['Snow', '❄️'],
  75: ['Heavy snow', '❄️'],
  77: ['Snow grains', '🌨️'],
  80: ['Light showers', '🌦️'],
  81: ['Showers', '🌧️'],
  82: ['Heavy showers', '⛈️'],
  85: ['Snow showers', '🌨️'],
  86: ['Heavy snow showers', '❄️'],
  95: ['Thunderstorm', '⛈️'],
  96: ['Storm with hail', '⛈️'],
  99: ['Severe storm with hail', '⛈️']
};

function weatherInfo(code, isDay = 1) {
  const base = weatherMap[code] || ['Weather', '🌤️'];
  if (!isDay && code <= 2) return [base[0], code === 0 ? '🌙' : '☁️'];
  return base;
}

function toF(c) { return c * 9 / 5 + 32; }
function displayTemp(c) {
  const value = unit === 'c' ? c : toF(c);
  return `${Math.round(value)}°`;
}
function displayWind(kmh) {
  if (unit === 'c') return `${Math.round(kmh)} km/h`;
  return `${Math.round(kmh * 0.621371)} mph`;
}

function setStatus(message, type = 'info') {
  if (!message) {
    els.status.className = 'status hidden';
    els.status.textContent = '';
    return;
  }
  els.status.className = `status ${type === 'error' ? 'error' : ''}`;
  els.status.textContent = message;
}

function compass(deg = 0) {
  const dirs = ['N','NE','E','SE','S','SW','W','NW'];
  return dirs[Math.round(deg / 45) % 8];
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function updateUnitButton() {
  const spans = els.unitToggle.querySelectorAll('span');
  spans[0].classList.toggle('active', unit === 'c');
  spans[1].classList.toggle('active', unit === 'f');
}

function recentPlaces() {
  try { return JSON.parse(localStorage.getItem('skycast-recents') || '[]'); }
  catch { return []; }
}

function addRecent(place) {
  const item = { name: place.name, country: place.country, latitude: place.latitude, longitude: place.longitude, admin1: place.admin1 || '' };
  const next = [item, ...recentPlaces().filter(x => !(x.name === item.name && x.country === item.country))].slice(0, 5);
  localStorage.setItem('skycast-recents', JSON.stringify(next));
  renderRecents();
}

function renderRecents() {
  const items = recentPlaces();
  els.recentSearches.innerHTML = items.map((p, i) => `<button class="recent-chip" data-recent="${i}" type="button">${escapeHtml(p.name)}</button>`).join('');
}

function escapeHtml(str = '') {
  return String(str).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[ch]));
}

async function geocode(query) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=6&language=en&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Could not search for that city.');
  const data = await res.json();
  return data.results || [];
}

async function reverseGeocode(lat, lon) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(`${lat.toFixed(2)},${lon.toFixed(2)}`)}&count=1&language=en&format=json`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.results?.[0]) return data.results[0];
  } catch (_) {}
  return { name: 'My location', country: '', latitude: lat, longitude: lon };
}

async function fetchWeather(place) {
  const { latitude, longitude } = place;
  const params = new URLSearchParams({
    latitude,
    longitude,
    timezone: 'auto',
    forecast_days: '7',
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,weather_code,cloud_cover,surface_pressure,wind_speed_10m,wind_direction_10m',
    hourly: 'temperature_2m,weather_code,precipitation_probability,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset'
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
  if (!res.ok) throw new Error('Weather service is temporarily unavailable.');
  return res.json();
}

async function loadPlace(place, saveRecent = true) {
  setStatus('Loading live weather…');
  els.suggestions.classList.add('hidden');
  try {
    const data = await fetchWeather(place);
    lastPlace = place;
    if (saveRecent) addRecent(place);
    renderWeather(place, data);
    setStatus('');
    els.weatherContent.classList.remove('hidden');
    setTimeout(() => els.weatherContent.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  } catch (err) {
    setStatus(err.message || 'Something went wrong.', 'error');
  }
}

function renderWeather(place, data) {
  const c = data.current;
  const [label, icon] = weatherInfo(c.weather_code, c.is_day);
  const locationParts = [place.name, place.admin1, place.country].filter(Boolean);
  els.locationLabel.textContent = locationParts.join(', ');
  els.dateLabel.textContent = new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  els.weatherIcon.textContent = icon;
  els.weatherText.textContent = label;
  els.currentTemp.textContent = displayTemp(c.temperature_2m);
  els.feelsLike.textContent = `Feels like ${displayTemp(c.apparent_temperature)}`;
  els.humidity.textContent = `${Math.round(c.relative_humidity_2m)}%`;
  els.wind.textContent = displayWind(c.wind_speed_10m);
  els.pressure.textContent = `${Math.round(c.surface_pressure)} hPa`;
  els.cloudCover.textContent = `${Math.round(c.cloud_cover)}%`;
  els.rainNow.textContent = `${Number(c.rain || 0).toFixed(1)} mm`;
  els.windDirection.textContent = `${compass(c.wind_direction_10m)} ${Math.round(c.wind_direction_10m)}°`;
  els.sunrise.textContent = formatTime(data.daily.sunrise[0]);
  els.sunset.textContent = formatTime(data.daily.sunset[0]);

  renderHourly(data);
  renderDaily(data);
}

function renderHourly(data) {
  const currentTime = new Date(data.current.time).getTime();
  const times = data.hourly.time.map(t => new Date(t).getTime());
  let start = times.findIndex(t => t >= currentTime);
  if (start < 0) start = 0;
  const end = Math.min(start + 24, times.length);
  let html = '';
  for (let i = start; i < end; i++) {
    const [, icon] = weatherInfo(data.hourly.weather_code[i], data.hourly.is_day[i]);
    const rain = data.hourly.precipitation_probability[i] ?? 0;
    html += `<div class="hour-item ${i === start ? 'now' : ''}">
      <div class="hour-time">${i === start ? 'Now' : new Date(data.hourly.time[i]).toLocaleTimeString([], {hour:'numeric'})}</div>
      <div class="hour-icon">${icon}</div>
      <div class="hour-temp">${displayTemp(data.hourly.temperature_2m[i])}</div>
      <div class="hour-rain">💧 ${rain}%</div>
    </div>`;
  }
  els.hourlyForecast.innerHTML = html;
}

function renderDaily(data) {
  els.dailyForecast.innerHTML = data.daily.time.map((date, i) => {
    const [, icon] = weatherInfo(data.daily.weather_code[i], 1);
    const dayName = i === 0 ? 'Today' : new Date(`${date}T12:00:00`).toLocaleDateString([], { weekday: 'short' });
    const rain = data.daily.precipitation_probability_max[i] ?? 0;
    return `<div class="day-item">
      <div class="day-name">${dayName}</div>
      <div class="day-icon">${icon}</div>
      <div class="day-temp"><strong>${displayTemp(data.daily.temperature_2m_max[i])}</strong><span class="muted">${displayTemp(data.daily.temperature_2m_min[i])}</span></div>
      <div class="day-rain">💧 ${rain}%</div>
    </div>`;
  }).join('');
}

async function renderSuggestions(query) {
  if (query.trim().length < 2) {
    els.suggestions.classList.add('hidden');
    return;
  }
  try {
    const results = await geocode(query.trim());
    if (!results.length) {
      els.suggestions.innerHTML = `<div class="suggestion-item"><span>No places found</span></div>`;
    } else {
      els.suggestions.innerHTML = results.map((p, i) => `<button class="suggestion-item" type="button" data-index="${i}">
        <span>${escapeHtml(p.name)}${p.admin1 ? `, ${escapeHtml(p.admin1)}` : ''}</span>
        <small>${escapeHtml(p.country || '')}</small>
      </button>`).join('');
      els.suggestions.dataset.results = JSON.stringify(results);
    }
    els.suggestions.classList.remove('hidden');
  } catch (_) {
    els.suggestions.classList.add('hidden');
  }
}

els.cityInput.addEventListener('input', (e) => {
  clearTimeout(suggestionTimer);
  suggestionTimer = setTimeout(() => renderSuggestions(e.target.value), 280);
});

els.searchForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const query = els.cityInput.value.trim();
  if (!query) return;
  setStatus('Finding that city…');
  try {
    const results = await geocode(query);
    if (!results.length) throw new Error('City not found. Try another search.');
    els.cityInput.value = results[0].name;
    await loadPlace(results[0]);
  } catch (err) {
    setStatus(err.message || 'Search failed.', 'error');
  }
});

els.suggestions.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-index]');
  if (!btn) return;
  const results = JSON.parse(els.suggestions.dataset.results || '[]');
  const place = results[Number(btn.dataset.index)];
  if (!place) return;
  els.cityInput.value = place.name;
  await loadPlace(place);
});

els.locationBtn.addEventListener('click', () => {
  if (!navigator.geolocation) {
    setStatus('Location is not supported in this browser.', 'error');
    return;
  }
  setStatus('Getting your location…');
  navigator.geolocation.getCurrentPosition(async ({ coords }) => {
    const place = { name: 'My location', country: '', latitude: coords.latitude, longitude: coords.longitude };
    await loadPlace(place, false);
  }, () => setStatus('Location access was blocked. Search for your city instead.', 'error'), { enableHighAccuracy: true, timeout: 10000 });
});

els.unitToggle.addEventListener('click', () => {
  unit = unit === 'c' ? 'f' : 'c';
  localStorage.setItem('skycast-unit', unit);
  updateUnitButton();
  if (lastPlace) loadPlace(lastPlace, false);
});

els.recentSearches.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-recent]');
  if (!btn) return;
  const place = recentPlaces()[Number(btn.dataset.recent)];
  if (place) {
    els.cityInput.value = place.name;
    await loadPlace(place, false);
  }
});

document.addEventListener('click', (e) => {
  if (!els.suggestions.contains(e.target) && e.target !== els.cityInput) els.suggestions.classList.add('hidden');
});

updateUnitButton();
renderRecents();
loadPlace({ name: 'London', country: 'United Kingdom', latitude: 51.5074, longitude: -0.1278 }, false);
