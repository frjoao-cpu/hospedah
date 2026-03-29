const API_KEY = 'b6fd43b74eda4370d4f4948410281366';
const BASE_URL = 'https://api.openweathermap.org/data/2.5';

const weatherIcons = {
    '01d': '☀️',
    '01n': '🌙',
    '02d': '⛅',
    '02n': '☁️',
    '03d': '☁️',
    '03n': '☁️',
    '04d': '☁️',
    '04n': '☁️',
    '09d': '🌧️',
    '09n': '🌧️',
    '10d': '🌦️',
    '10n': '🌧️',
    '11d': '⛈️',
    '11n': '⛈️',
    '13d': '❄️',
    '13n': '❄️',
    '50d': '🌫️',
    '50n': '🌫️'
};

window.addEventListener('load', () => {
    getLocationAndWeather();
});

document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('cityInput');
    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') searchWeather();
        });
    }
});

function getLocationAndWeather() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                fetchWeather(latitude, longitude);
            },
            () => {
                searchWeatherByCity('São Paulo');
            }
        );
    } else {
        searchWeatherByCity('São Paulo');
    }
}

function searchWeather() {
    const cityInput = document.getElementById('cityInput');
    if (cityInput) {
        const city = cityInput.value.trim();
        if (city) {
            searchWeatherByCity(city);
        }
    }
}

function searchWeatherByCity(city) {
    fetch(`${BASE_URL}/weather?q=${city}&appid=${API_KEY}&units=metric&lang=pt_br`)
        .then(response => {
            if (!response.ok) throw new Error('Cidade não encontrada');
            return response.json();
        })
        .then(data => {
            fetchWeather(data.coord.lat, data.coord.lon);
        })
        .catch(error => {
            alert('Erro: ' + error.message);
        });
}

function fetchWeather(lat, lon) {
    const url = `${BASE_URL}/onecall?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric&lang=pt_br`;

    fetch(url)
        .then(response => response.json())
        .then(data => {
            displayCurrentWeather(data.current, data.timezone);
            displayForecast(data.daily);
            displayDetails(data.current);
        })
        .catch(error => console.error('Erro:', error));
}

function displayCurrentWeather(current, timezone) {
    const section = document.getElementById('currentWeather');
    if (!section) return;
    
    const icon = weatherIcons[current.weather[0].icon] || '🌤️';
    
    section.innerHTML = `
        <div class="weather-icon">${icon}</div>
        <div class="city-name">${getTimeZoneName(timezone)}</div>
        <div class="temperature">${Math.round(current.temp)}°C</div>
        <div class="weather-description">${current.weather[0].description}</div>
        <div class="feels-like">Sensação térmica: ${Math.round(current.feels_like)}°C</div>
    `;
}

function displayForecast(daily) {
    const grid = document.getElementById('forecastGrid');
    if (!grid) return;
    
    grid.innerHTML = '';

    for (let i = 1; i <= 5; i++) {
        const day = daily[i];
        const date = new Date(day.dt * 1000);
        const icon = weatherIcons[day.weather[0].icon] || '🌤️';

        const card = document.createElement('div');
        card.className = 'forecast-card';
        card.innerHTML = `
            <div class="forecast-date">${date.toLocaleDateString('pt-BR', { weekday: 'short' })}</div>
            <div class="forecast-icon">${icon}</div>
            <div class="forecast-temp">${Math.round(day.temp.max)}° / ${Math.round(day.temp.min)}°</div>
            <div class="forecast-desc">${day.weather[0].main}</div>
        `;
        grid.appendChild(card);
    }
}

function displayDetails(current) {
    const section = document.getElementById('details');
    if (!section) return;
    
    section.innerHTML = `
        <h2>Detalhes do Clima</h2>
        <div class="details-grid">
            <div class="detail-item">
                <div class="detail-label">Umidade</div>
                <div class="detail-value">${current.humidity}%</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Pressão</div>
                <div class="detail-value">${current.pressure} hPa</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Vento</div>
                <div class="detail-value">${(current.wind_speed * 3.6).toFixed(1)} km/h</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Nuvens</div>
                <div class="detail-value">${current.clouds}%</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Visibilidade</div>
                <div class="detail-value">${(current.visibility / 1000).toFixed(1)} km</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Índice UV</div>
                <div class="detail-value">${current.uvi.toFixed(1)}</div>
            </div>
        </div>
    `;
}

function getTimeZoneName(timezone) {
    return timezone.split('/')[1]?.replace('_', ' ') || 'Localização';
}