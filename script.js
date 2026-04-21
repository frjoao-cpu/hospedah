// ============================================================
// ⚠️  ATENÇÃO — SEGURANÇA CRÍTICA
//
// A chave abaixo está exposta no código-fonte do site estático
// e pode ser usada indevidamente por terceiros.
//
// AÇÃO IMEDIATA RECOMENDADA:
//  1. Acesse https://home.openweathermap.org/api_keys
//  2. Adicione uma restrição de HTTP Referer para hospedah.tur.br/*
//  3. Migre a chamada para uma Supabase Edge Function ou proxy
//     serverless (ex.: /api/weather) para que a chave nunca
//     apareça no front-end.
//
// Enquanto a migração não é feita, NUNCA exponha outras chaves
// (Supabase, pagamentos etc.) neste arquivo.
// ============================================================

/** @type {{ apiKey: string, baseUrl: string, proxyUrl: string|null }} */
const WEATHER_CONFIG = {
    /* Substitua por uma Edge Function/proxy assim que possível */
    apiKey: 'b6fd43b74eda4370d4f4948410281366',
    baseUrl: 'https://api.openweathermap.org/data/2.5',
    /* Se houver um proxy serverless, defina a URL aqui e a chave
       será omitida das chamadas diretas ao cliente. Exemplo:
       proxyUrl: 'https://ydrmjoppjxtmnwtvtinb.supabase.co/functions/v1/weather'
    */
    proxyUrl: null
};

// Atalhos para uso interno
const API_KEY  = WEATHER_CONFIG.apiKey;
const BASE_URL = WEATHER_CONFIG.baseUrl;

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
/* ============================================================
   UTILITÁRIOS COMPARTILHADOS
   Disponíveis globalmente para todas as páginas que carregarem
   este script ou que definirem as mesmas funções localmente.
   ============================================================ */

/**
 * Formata uma data ISO (YYYY-MM-DD) ou objeto Date para pt-BR.
 * @param {string|Date} date
 * @param {Intl.DateTimeFormatOptions} [options]
 * @returns {string}
 */
function formatDate(date, options) {
    var d = (date instanceof Date) ? date : new Date(date + 'T00:00:00');
    return d.toLocaleDateString('pt-BR', options || { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Formata um número para Real Brasileiro (R$ 1.234,56).
 * @param {number} value
 * @returns {string}
 */
function currencyBR(value) {
    return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Retorna uma função que adia a execução de `fn` por `delay` ms
 * enquanto continua sendo chamada.
 * @param {Function} fn
 * @param {number} delay
 * @returns {Function}
 */
function debounce(fn, delay) {
    var timer;
    return function () {
        var args = arguments;
        clearTimeout(timer);
        timer = setTimeout(function () { fn.apply(this, args); }, delay);
    };
}

/**
 * Exibe um toast de notificação temporário no canto inferior direito.
 * @param {string} message  Mensagem HTML
 * @param {'info'|'success'|'error'|'warning'} [type='info']
 * @param {number} [duration=4000]  Duração em ms
 */
function showToast(message, type, duration) {
    type = type || 'info';
    duration = duration || 4000;

    var colors = {
        info:    { bg: 'rgba(11,28,61,0.96)',  border: 'rgba(212,175,55,0.35)',  icon: 'ℹ️' },
        success: { bg: 'rgba(10,60,30,0.96)',  border: 'rgba(37,211,102,0.45)', icon: '✅' },
        error:   { bg: 'rgba(80,15,15,0.96)',  border: 'rgba(231,76,60,0.45)',  icon: '❌' },
        warning: { bg: 'rgba(80,55,0,0.96)',   border: 'rgba(243,156,18,0.45)', icon: '⚠️' }
    };
    var c = colors[type] || colors.info;

    var container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:99999;display:flex;flex-direction:column;gap:10px;pointer-events:none;';
        document.body.appendChild(container);
    }

    var toast = document.createElement('div');
    toast.style.cssText = [
        'background:' + c.bg,
        'border:1px solid ' + c.border,
        'color:#fff',
        'border-radius:12px',
        'padding:12px 18px',
        'font-size:0.88rem',
        'line-height:1.45',
        'display:flex',
        'align-items:center',
        'gap:10px',
        'box-shadow:0 4px 20px rgba(0,0,0,0.4)',
        'min-width:220px',
        'max-width:320px',
        'pointer-events:auto',
        'animation:toastIn 0.35s cubic-bezier(0.22,1.2,0.46,1) both'
    ].join(';');
    toast.innerHTML = '<span>' + c.icon + '</span><span>' + message + '</span>';

    /* Injeta keyframe apenas uma vez */
    if (!document.getElementById('toast-style')) {
        var s = document.createElement('style');
        s.id = 'toast-style';
        s.textContent = '@keyframes toastIn{from{transform:translateX(110%);opacity:0}to{transform:translateX(0);opacity:1}}@keyframes toastOut{from{opacity:1;transform:translateX(0)}to{opacity:0;transform:translateX(110%)}}';
        document.head.appendChild(s);
    }

    container.appendChild(toast);

    setTimeout(function () {
        toast.style.animation = 'toastOut 0.35s ease both';
        setTimeout(function () { toast.remove(); }, 360);
    }, duration);
}

/**
 * Dispara um evento de "proposta abandonada" para integração com
 * automações de CRM / WhatsApp. Registra no dataLayer (GTM) e
 * armazena no sessionStorage para uso por webhooks externos.
 *
 * @param {Object} data  Dados do formulário parcialmente preenchido
 */
function trackAbandonedProposal(data) {
    try {
        sessionStorage.setItem('hospedah_abandoned', JSON.stringify({
            ts: new Date().toISOString(),
            data: data
        }));
        if (window.dataLayer) {
            dataLayer.push({ event: 'proposta_abandonada', payload: data });
        }
    } catch (e) { /* silencioso */ }
}
