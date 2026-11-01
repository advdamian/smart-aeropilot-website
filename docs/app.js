// Smart AeroPilot Hub - Client application with RBAC, Java Engine Bridge & GitHub Pages Support

const IS_GH_PAGES = window.location.hostname.includes("github.io") || window.location.hostname.includes("aeropilot.tech");

function sanitizeApiUrl(url) {
    if (!url) return "";
    return url.trim().replace(/\/+$/, "");
}

// Default to the active Cloudflare live tunnel so the site works immediately out-of-the-box
let rawBase = localStorage.getItem("aeropilot_api_base") || "https://shipped-lessons-evaluation-testament.trycloudflare.com";
let API_BASE = sanitizeApiUrl(rawBase);

let currentUser = {
    username: "Damian",
    name: "Damian",
    role: "passenger",
    token: "token-passenger-default"
};

let currentFlightCode = "RO301";
let weatherOverride = null;

// Helper to make API calls with fallback to mock data on GitHub Pages when backend is offline
async function apiFetch(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    try {
        const headers = options.headers ? { ...options.headers } : {};
        // Bypass ngrok browser interstitial warning screen for API JSON calls
        headers['ngrok-skip-browser-warning'] = 'true';
        options.headers = headers;

        const res = await fetch(url, options);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } catch (err) {
        console.warn(`API call failed for ${endpoint}, using smart mock fallback:`, err);
        return getMockResponse(endpoint, options);
    }
}

// ----------------- AUTH & RBAC SYSTEM -----------------

function initAuth() {
    const saved = localStorage.getItem("aeropilot_user");
    if (saved) {
        try {
            currentUser = JSON.parse(saved);
        } catch (e) {
            currentUser = { username: "Damian", name: "Damian", role: "passenger", token: "default" };
        }
    }
    applyUserRole(currentUser.role, currentUser.name);

    const swLink = document.getElementById('swagger-link');
    if (swLink) swLink.href = `${API_BASE}/docs`;

    if (IS_GH_PAGES && !API_BASE) {
        const banner = document.getElementById('gh-pages-banner');
        if (banner) banner.style.display = 'flex';
    }
}

function openLoginModal() {
    document.getElementById('login-modal').style.display = 'flex';
}

function closeLoginModal() {
    document.getElementById('login-modal').style.display = 'none';
}

function openApiConfigModal() {
    document.getElementById('api-url-input').value = API_BASE || "http://localhost:8000";
    document.getElementById('api-config-modal').style.display = 'flex';
}

function closeApiConfigModal() {
    document.getElementById('api-config-modal').style.display = 'none';
}

function saveApiConfig() {
    const val = sanitizeApiUrl(document.getElementById('api-url-input').value);
    API_BASE = val;
    localStorage.setItem("aeropilot_api_base", API_BASE);
    closeApiConfigModal();
    alert("Adresa API a fost conectată cu succes: " + (API_BASE || "Mod Standalone"));
    pollQueueStatus();
    evaluateFlightRisk();
    fetchRerouteData();
}

async function handleLoginSubmit() {
    const u = document.getElementById('auth-username').value.trim();
    const p = document.getElementById('auth-password').value.trim();

    try {
        const data = await apiFetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: u || "Damian", password: p })
        });
        currentUser = data;
        localStorage.setItem("aeropilot_user", JSON.stringify(currentUser));
        applyUserRole(currentUser.role, currentUser.name);
        closeLoginModal();

        pollQueueStatus();
        evaluateFlightRisk();
        fetchRerouteData();
    } catch (e) {
        console.error("Login failed:", e);
    }
}

function applyUserRole(role, name) {
    const nameEl = document.getElementById('user-name-display');
    const roleTag = document.getElementById('role-tag');
    if (nameEl) nameEl.innerText = name;

    const isAdmin = (role === 'admin');

    if (roleTag) {
        roleTag.className = isAdmin ? 'role-tag-admin' : 'role-tag-passenger';
        roleTag.innerText = isAdmin ? 'ADMINISTRATOR' : 'PASAGER';
    }

    document.querySelectorAll('.admin-only').forEach(el => {
        el.style.display = isAdmin ? 'block' : 'none';
    });

    const javaTabBtn = document.getElementById('tab-btn-java');
    if (javaTabBtn) javaTabBtn.style.display = isAdmin ? 'inline-block' : 'none';

    const passView = document.getElementById('passenger-queue-view');
    const adminView = document.getElementById('admin-queue-view');
    if (passView && adminView) {
        if (isAdmin) {
            passView.style.display = 'none';
            adminView.style.display = 'block';
            const streamImg = document.getElementById('admin-live-stream');
            if (streamImg && !streamImg.src.includes("stream")) {
                streamImg.src = `${API_BASE}/api/queue/stream?role=admin&ngrok-skip-browser-warning=true`;
            }
        } else {
            passView.style.display = 'block';
            adminView.style.display = 'none';
        }
    }

    const vPass = document.getElementById('voucher-passenger');
    if (vPass) vPass.innerText = name;
}

// ----------------- TAB NAVIGATION -----------------

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('nav.tabs button').forEach(el => el.classList.remove('active'));

    const targetTab = document.getElementById(tabId);
    if (targetTab) targetTab.classList.add('active');

    const buttonMap = {
        'tab-overview': 'tab-btn-overview',
        'tab-queue': 'tab-btn-queue',
        'tab-risk': 'tab-btn-risk',
        'tab-reroute': 'tab-btn-reroute',
        'tab-java': 'tab-btn-java'
    };
    const btn = document.getElementById(buttonMap[tabId]);
    if (btn) btn.classList.add('active');
}

function goToRerouteTab() {
    switchTab('tab-reroute');
    fetchRerouteData();
}

// ----------------- FEATURE 1: QUEUE POLLING -----------------

async function pollQueueStatus() {
    try {
        if (currentUser.role === 'admin') {
            const data = await apiFetch('/api/queue/status');
            if (!data) return;

            const overviewLane = document.getElementById('overview-fastest-lane');
            const overviewTime = document.getElementById('overview-queue-time');
            if (overviewLane) overviewLane.innerText = `Banda ${data.fastest_lane}`;
            if (overviewTime) overviewTime.innerText = `Timp estimat: ${data.lanes[data.fastest_lane - 1]?.wait_display || '--'}`;

            const alertEl = document.getElementById('admin-queue-alert');
            if (alertEl) {
                alertEl.innerText = `✅ ${data.recommended_lane_message} · ${data.total_people} pasageri & ${data.total_detected_objects} bagaje detectate`;
            }

            const adminLanes = document.getElementById('admin-lanes-container');
            if (adminLanes && data.lanes) {
                adminLanes.innerHTML = data.lanes.map(lane => `
                    <div class="lane-card ${lane.is_fastest ? 'fastest' : ''}">
                        <span class="lane-badge ${lane.is_fastest ? 'badge-fastest' : 'badge-normal'}">
                            ${lane.is_fastest ? '★ CEA MAI RAPIDĂ' : 'BANDA ' + lane.lane_id}
                        </span>
                        <div style="font-size: 13px; font-weight: 600;">Banda ${lane.lane_id}</div>
                        <div class="metric-big" style="margin: 6px 0; color: ${lane.is_fastest ? '#16a34a' : '#1e293b'};">
                            ${lane.wait_display}
                        </div>
                        <div style="font-size: 11px; color: #64748b; line-height: 1.4;">
                            <div>YOLO: ${lane.people_yolo} | IR: ${lane.thermal_ir}</div>
                            <div>Bagaje: +${Math.round(lane.extra_bag_seconds / 60)} min</div>
                            <div style="font-weight: 700; color: #334155;">${lane.level}</div>
                        </div>
                    </div>
                `).join('');
            }
        } else {
            const data = await apiFetch('/api/queue/passenger_recommendation');
            if (!data) return;

            const pFastest = document.getElementById('passenger-fastest-lane');
            const pTime = document.getElementById('passenger-wait-time');
            const pStatus = document.getElementById('passenger-lane-status');
            if (pFastest) pFastest.innerText = `Banda ${data.fastest_lane}`;
            if (pTime) pTime.innerText = `Timp estimat: ${data.wait_display}`;
            if (pStatus) pStatus.innerText = data.message;

            const overviewLane = document.getElementById('overview-fastest-lane');
            const overviewTime = document.getElementById('overview-queue-time');
            if (overviewLane) overviewLane.innerText = `Banda ${data.fastest_lane}`;
            if (overviewTime) overviewTime.innerText = `Timp estimat: ${data.wait_display}`;
        }
    } catch (err) {
        console.error("Queue poll error:", err);
    }
}

let clientMediaStream = null;

async function changeVideoSource() {
    const sel = document.getElementById('video-source-select');
    const val = sel.value;
    const statusPill = document.getElementById('cam-status-pill');
    const imgStream = document.getElementById('admin-live-stream');
    const clientCamContainer = document.getElementById('client-webcam-container');
    const clientCamVideo = document.getElementById('client-webcam-video');

    // 1. Stop any running client-side camera
    if (clientMediaStream) {
        clientMediaStream.getTracks().forEach(track => track.stop());
        clientMediaStream = null;
    }

    if (val === 'client_webcam') {
        if (imgStream) imgStream.style.display = 'none';
        if (clientCamContainer) clientCamContainer.style.display = 'block';
        if (statusPill) statusPill.innerText = "⏳ Se inițializează camera...";

        try {
            clientMediaStream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
                audio: false
            });
            if (clientCamVideo) {
                clientCamVideo.srcObject = clientMediaStream;
                clientCamVideo.play();
            }
            if (statusPill) {
                statusPill.innerText = "● Cameră Locală Activă";
                statusPill.style.color = "#16a34a";
            }
        } catch (err) {
            console.error("Client webcam error:", err);
            alert("Nu s-a putut deschide camera locală a dispozitivului. Verifică permisiunile camerei în browser.");
            sel.value = "demo";
            changeVideoSource();
        }
    } else {
        if (clientCamContainer) clientCamContainer.style.display = 'none';
        if (imgStream) imgStream.style.display = 'block';

        const srcType = (val === 'server_webcam') ? 'webcam' : 'demo';
        if (statusPill) statusPill.innerText = (srcType === 'webcam') ? "⏳ Conectare la cameră server..." : "● Redare clip...";

        try {
            await apiFetch(`/api/queue/source?source_type=${srcType}&camera_id=0`, { method: 'POST' });
            if (imgStream) {
                imgStream.src = `${API_BASE}/api/queue/stream?role=admin&ngrok-skip-browser-warning=true&t=${Date.now()}`;
            }
            if (statusPill) {
                statusPill.innerText = (srcType === 'webcam') ? "● Cameră Server OpenCV Activă" : "● Clip Demonstrativ Activ";
                statusPill.style.color = "#16a34a";
            }
        } catch (e) {
            console.error(e);
            if (statusPill) {
                statusPill.innerText = "● Mod Simulare";
                statusPill.style.color = "#d97706";
            }
        }
    }
}

// ----------------- FEATURE 2: FLIGHT RISK, SEARCH & WEATHER -----------------

let allAvailableFlights = [
    { code: "RO301", origin: "OTP", destination: "LHR", departure: "18:45", aircraft: "Boeing 737-800", airline: "TAROM" },
    { code: "W43105", origin: "OTP", destination: "CDG", departure: "19:30", aircraft: "Airbus A321neo", airline: "Wizz Air" },
    { code: "LH1412", origin: "OTP", destination: "FRA", departure: "17:15", aircraft: "Airbus A320", airline: "Lufthansa" },
    { code: "OS784", origin: "OTP", destination: "VIE", departure: "16:40", aircraft: "Embraer 195", airline: "Austrian Airlines" },
    { code: "KL1374", origin: "OTP", destination: "AMS", departure: "19:00", aircraft: "Boeing 737-900", airline: "KLM" },
    { code: "LH1655", origin: "OTP", destination: "MUC", departure: "20:10", aircraft: "Airbus A319", airline: "Lufthansa" },
    { code: "BA887", origin: "OTP", destination: "LHR", departure: "20:30", aircraft: "Airbus A320neo", airline: "British Airways" },
    { code: "FR1008", origin: "OTP", destination: "STN", departure: "21:40", aircraft: "Boeing 737-8200", airline: "Ryanair" },
    { code: "AP100", origin: "CRA", destination: "OTP", departure: "06:00", aircraft: "ATR 72-600", airline: "TAROM" },
    { code: "AP101", origin: "CRA", destination: "MUC", departure: "07:00", aircraft: "Airbus A319", airline: "Lufthansa" },
    { code: "AP102", origin: "CRA", destination: "FCO", departure: "09:30", aircraft: "Airbus A320", airline: "Wizz Air" },
    { code: "W43751", origin: "CRA", destination: "LTN", departure: "13:45", aircraft: "Airbus A321", airline: "Wizz Air" },
    { code: "W43755", origin: "CRA", destination: "BGY", departure: "15:20", aircraft: "Airbus A320", airline: "Wizz Air" },
    { code: "W43761", origin: "CRA", destination: "BLQ", departure: "18:10", aircraft: "Airbus A320", airline: "Wizz Air" },
    { code: "AP103", origin: "OTP", destination: "CDG", departure: "07:00", aircraft: "Airbus A320", airline: "TAROM" },
    { code: "AP104", origin: "OTP", destination: "AMS", departure: "08:00", aircraft: "Boeing 737-800", airline: "TAROM" },
    { code: "AP105", origin: "OTP", destination: "VIE", departure: "07:20", aircraft: "ATR 72-600", airline: "TAROM" },
    { code: "AP106", origin: "OTP", destination: "FRA", departure: "10:00", aircraft: "Airbus A320", airline: "TAROM" },
    { code: "AP107", origin: "OTP", destination: "FCO", departure: "11:00", aircraft: "Airbus A320", airline: "TAROM" },
    { code: "AP108", origin: "OTP", destination: "LHR", departure: "13:00", aircraft: "Boeing 737-800", airline: "TAROM" }
];

async function loadAllFlights() {
    try {
        const data = await apiFetch('/api/flight/list');
        if (Array.isArray(data) && data.length > 0) {
            allAvailableFlights = data;
        }
    } catch (e) {
        console.warn("Could not load flight list, using presets:", e);
    }
    populateFlightDropdowns();
}

function populateFlightDropdowns() {
    const selRisk = document.getElementById('flight-select');
    const selJava = document.getElementById('java-flight-select');
    
    if (selRisk) {
        selRisk.innerHTML = allAvailableFlights.map(f => `
            <option value="${f.code}" ${f.code === currentFlightCode ? 'selected' : ''}>
                ${f.code} — ${f.origin} ➔ ${f.destination} (${f.airline || 'TAROM'} @ ${f.departure || '18:00'})
            </option>
        `).join('');
    }

    if (selJava) {
        selJava.innerHTML = allAvailableFlights.map(f => `
            <option value="${f.code}" ${f.code === currentFlightCode ? 'selected' : ''}>
                ${f.code} — ${f.origin} ➔ ${f.destination} (${f.airline || 'TAROM'} @ ${f.departure || '18:00'})
            </option>
        `).join('');
    }
}

function handleFlightSearchInput() {
    const inp = document.getElementById('flight-search-input');
    const dropdown = document.getElementById('flight-search-dropdown');
    if (!inp || !dropdown) return;
    
    const query = inp.value.trim().toLowerCase();
    if (!query) {
        dropdown.style.display = 'none';
        return;
    }

    const matches = allAvailableFlights.filter(f => {
        const text = `${f.code} ${f.origin} ${f.destination} ${f.airline || ''} ${f.aircraft || ''}`.toLowerCase();
        return text.includes(query);
    });

    if (matches.length === 0) {
        dropdown.innerHTML = `<div style="padding: 10px; font-size: 12px; color: #64748b; text-align: center;">Niciun zbor găsit pentru "${query}"</div>`;
        dropdown.style.display = 'block';
        return;
    }

    dropdown.innerHTML = matches.slice(0, 8).map(f => `
        <div class="search-dropdown-item" onclick="selectFlightFromSearch('${f.code}')">
            <div>
                <strong>${f.code}</strong> — ${f.origin} ➔ ${f.destination}
                <div style="font-size: 11px; color: #64748b;">${f.airline || 'Companie'} • Plecare: ${f.departure || '18:30'}</div>
            </div>
            <span style="font-size: 11px; color: #0284c7; font-weight: 600;">Selectează ➔</span>
        </div>
    `).join('');
    dropdown.style.display = 'block';
}

function selectFlightFromSearch(code) {
    const inp = document.getElementById('flight-search-input');
    const dropdown = document.getElementById('flight-search-dropdown');
    const sel = document.getElementById('flight-select');
    const selJava = document.getElementById('java-flight-select');

    currentFlightCode = code;
    if (inp) inp.value = code;
    if (dropdown) dropdown.style.display = 'none';
    if (sel) sel.value = code;
    if (selJava) selJava.value = code;

    evaluateFlightRisk();
    fetchRerouteData();
}

function clearFlightSearch() {
    const inp = document.getElementById('flight-search-input');
    const dropdown = document.getElementById('flight-search-dropdown');
    if (inp) inp.value = '';
    if (dropdown) dropdown.style.display = 'none';
}

// Close search dropdown on click outside
document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('flight-search-dropdown');
    const inp = document.getElementById('flight-search-input');
    if (dropdown && e.target !== dropdown && e.target !== inp && !dropdown.contains(e.target)) {
        dropdown.style.display = 'none';
    }
});

function onFlightSelectChange() {
    const sel = document.getElementById('flight-select');
    if (sel) {
        currentFlightCode = sel.value;
        const selJava = document.getElementById('java-flight-select');
        if (selJava) selJava.value = currentFlightCode;
    }
    evaluateFlightRisk();
    fetchRerouteData();
}

async function evaluateFlightRisk() {
    const sel = document.getElementById('flight-select');
    if (sel && sel.value) currentFlightCode = sel.value;

    const activeFlight = allAvailableFlights.find(f => f.code === currentFlightCode) || { origin: "OTP", destination: "LHR" };

    const payload = {
        flight_number: currentFlightCode,
        origin: activeFlight.origin || "OTP",
        destination: activeFlight.destination || "LHR"
    };

    if (weatherOverride === 'fog') {
        payload.condition_override = "Ceață critică densă (Zero vizibilitate)";
        payload.visibility_override = 180;
        payload.wind_speed_override = 45.0;
    } else if (weatherOverride === 'storm') {
        payload.condition_override = "Furtună violentă & Rafale de vânt";
        payload.visibility_override = 1200;
        payload.wind_speed_override = 65.0;
    }

    try {
        const data = await apiFetch('/api/flight/risk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (data) {
            renderFlightRisk(data);
            fetchRerouteData(data.origin, data.destination);
        }
    } catch (e) {
        console.error("Error evaluating risk:", e);
    }
}

function renderFlightRisk(data) {
    const oCode = document.getElementById('overview-flight-code');
    const oRoute = document.getElementById('overview-flight-route');
    const oPill = document.getElementById('overview-risk-pill');
    if (oCode) oCode.innerText = data.flight_number;
    if (oRoute) oRoute.innerText = `${data.origin} → ${data.destination} (${data.aircraft_type})`;
    if (oPill) {
        oPill.className = `status-pill pill-${data.risk_level}`;
        oPill.innerText = `${data.risk_level} (${data.risk_score}%)`;
    }

    const origCond = document.getElementById('meteo-origin-cond');
    const origDet = document.getElementById('meteo-origin-details');
    if (origCond) origCond.innerText = data.weather_origin.condition;
    if (origDet) origDet.innerText = `${data.weather_origin.temp_c}°C | Vânt: ${data.weather_origin.wind_speed_kmh} km/h | Vizib: ${data.weather_origin.visibility_m}m`;

    const destCond = document.getElementById('meteo-dest-cond');
    const destDet = document.getElementById('meteo-dest-details');
    if (destCond) destCond.innerText = data.weather_destination.condition;
    if (destDet) destDet.innerText = `${data.weather_destination.temp_c}°C | Vânt: ${data.weather_destination.wind_speed_kmh} km/h | Vizib: ${data.weather_destination.visibility_m}m`;

    const badge = document.getElementById('risk-score-badge');
    if (badge) {
        badge.className = `status-pill pill-${data.risk_level}`;
        badge.innerText = `${data.risk_level} (${data.risk_score}%)`;
    }

    const bar = document.getElementById('risk-progress-bar');
    if (bar) {
        bar.style.width = `${data.risk_score}%`;
        bar.className = `risk-fill risk-${data.risk_level}`;
    }

    const rec = document.getElementById('risk-recommendation');
    if (rec) {
        rec.innerText = data.recommendation;
        rec.style.background = data.risk_score >= 80 ? '#fee2e2' : (data.risk_score >= 50 ? '#fef9c3' : '#dcfce7');
        rec.style.color = data.risk_score >= 80 ? '#991b1b' : (data.risk_score >= 50 ? '#854d0e' : '#166534');
    }

    const factorsUl = document.getElementById('risk-factors-list');
    if (factorsUl) {
        factorsUl.innerHTML = data.risk_factors.map(f => `<li>${f}</li>`).join('');
    }

    // Show re-booking button when cancellation probability or risk score is over 50%
    const rerouteBtn = document.getElementById('btn-trigger-reroute');
    if (rerouteBtn) {
        const isHighRisk = (data.risk_score >= 50) || (data.cancellation_probability >= 0.50) || data.can_trigger_reroute;
        if (isHighRisk) {
            rerouteBtn.style.display = 'block';
            rerouteBtn.innerText = `⚠️ Risc Ridicat (${data.risk_score}%) — Găsește Zboruri Alternative către ${data.destination} ➔`;
        } else {
            rerouteBtn.style.display = 'none';
        }
    }
}

function setWeatherCrisis(type) {
    if (type === 'normal' || !type) {
        weatherOverride = null;
    } else {
        weatherOverride = type;
    }

    // Update active button styling
    document.querySelectorAll('.btn-weather-toggle').forEach(b => b.classList.remove('active-weather'));
    if (!weatherOverride) {
        const bNorm = document.getElementById('btn-weather-normal');
        if (bNorm) bNorm.classList.add('active-weather');
    } else {
        const bActive = document.getElementById(`btn-weather-${weatherOverride}`);
        if (bActive) bActive.classList.add('active-weather');
    }

    evaluateFlightRisk();
}

// ----------------- FEATURE 3: RE-ROUTING, SORTING, BUY & EU261 -----------------

let latestRerouteData = null;
let currentRerouteSort = 'risk'; // 'price' | 'time' | 'risk'

function goToRerouteTab() {
    switchTab('tab-reroute');
    const activeFlight = allAvailableFlights.find(f => f.code === currentFlightCode);
    if (activeFlight) {
        fetchRerouteData(activeFlight.origin, activeFlight.destination);
    } else {
        fetchRerouteData();
    }
}

function sortRerouteOptions(criteria) {
    currentRerouteSort = criteria;
    document.querySelectorAll('[id^="btn-sort-"]').forEach(b => b.classList.remove('active-sort'));
    const activeBtn = document.getElementById(`btn-sort-${criteria}`);
    if (activeBtn) activeBtn.classList.add('active-sort');

    if (!latestRerouteData || !latestRerouteData.routes) return;

    if (criteria === 'price') {
        latestRerouteData.routes.sort((a, b) => a.price_eur - b.price_eur);
    } else if (criteria === 'time') {
        latestRerouteData.routes.sort((a, b) => a.total_duration_minutes - b.total_duration_minutes);
    } else if (criteria === 'risk') {
        latestRerouteData.routes.sort((a, b) => a.risk_score - b.risk_score);
    }

    renderReroute(latestRerouteData, false);
}

async function fetchRerouteData(orig = null, dest = null) {
    const activeFlight = allAvailableFlights.find(f => f.code === currentFlightCode);
    const originAirport = orig || (activeFlight ? activeFlight.origin : "OTP");
    const destAirport = dest || (activeFlight ? activeFlight.destination : "LHR");

    try {
        const data = await apiFetch('/api/flight/reroute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                original_flight: currentFlightCode,
                origin: originAirport,
                destination: destAirport,
                passenger_name: currentUser.name
            })
        });
        if (data) renderReroute(data);
    } catch (e) {
        console.error("Error fetching reroute:", e);
    }
}

function renderReroute(data, applySort = true) {
    latestRerouteData = data;
    if (applySort && currentRerouteSort && latestRerouteData && latestRerouteData.routes) {
        if (currentRerouteSort === 'price') {
            latestRerouteData.routes.sort((a, b) => a.price_eur - b.price_eur);
        } else if (currentRerouteSort === 'time') {
            latestRerouteData.routes.sort((a, b) => a.total_duration_minutes - b.total_duration_minutes);
        } else if (currentRerouteSort === 'risk') {
            latestRerouteData.routes.sort((a, b) => a.risk_score - b.risk_score);
        }
    }

    const container = document.getElementById('routes-container');
    const paxDisp = document.getElementById('reroute-passenger-display');
    const fltDisp = document.getElementById('reroute-flight-display');

    const activeFlight = allAvailableFlights.find(f => f.code === currentFlightCode);
    const destName = activeFlight ? activeFlight.destination : "destinație";

    if (paxDisp) paxDisp.innerText = currentUser.name || "Damian Dabija";
    if (fltDisp) fltDisp.innerText = `${currentFlightCode} (${activeFlight ? `${activeFlight.origin} → ${activeFlight.destination}` : currentFlightCode})`;

    if (!container || !data || !data.routes) return;

    container.innerHTML = data.routes.map(r => {
        const segmentsHtml = r.segments.map(s => `
            <div><strong>${s.airline} (${s.flight_number})</strong>: ${s.origin} (${s.departure}) ➔ ${s.destination} (${s.arrival}) [${s.duration_minutes} min]</div>
        `).join('');

        const layoverBadge = r.layover_airport ? 
            `<span style="background: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-size: 11px;">Escală la ${r.layover_airport} (${r.layover_minutes} min)</span>` :
            `<span style="background: #dcfce7; color: #166534; padding: 2px 6px; border-radius: 4px; font-size: 11px;">ZBOR DIRECT</span>`;

        return `
            <div class="route-card ${r.recommended ? 'best' : ''}">
                <div class="route-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <div>
                        <strong>${r.recommended ? '⭐ RECOMANDAT — ' : ''}Opțiunea ${r.id}</strong>
                        ${layoverBadge}
                    </div>
                    <span style="color: #2563eb; font-weight: 700; font-size: 15px;">€${r.price_eur} (0 € Rebooking)</span>
                </div>
                <div class="route-timeline" style="margin-bottom: 8px; font-size: 13px; line-height: 1.5;">
                    ${segmentsHtml}
                </div>
                <div style="font-size: 12px; color: #64748b; display: flex; justify-content: space-between; margin-bottom: 10px;">
                    <span>Timp total: <strong>${Math.floor(r.total_duration_minutes / 60)}h ${r.total_duration_minutes % 60}m</strong></span>
                    <span>Locuri libere: <strong>${r.available_seats}</strong></span>
                    <span>Risc: <strong>${r.risk_score}%</strong></span>
                </div>
                <button class="btn-primary" style="width: 100%; font-size: 13px; padding: 9px;" onclick="openBoardingPassModal('${r.id}')">
                    ✈️ Selectează & Rezervă Bilet către ${destName} (0 €)
                </button>
            </div>
        `;
    }).join('');

    if (data.compensation_voucher) {
        const v = data.compensation_voucher;
        const vAmt = document.getElementById('voucher-amount');
        const vPax = document.getElementById('voucher-passenger');
        const vCode = document.getElementById('voucher-code');
        if (vAmt) vAmt.innerText = `€${v.amount_eur}`;
        if (vPax) vPax.innerText = currentUser.name || "Damian";
        if (vCode) vCode.innerText = v.voucher_code;
    }
}

function openBoardingPassModal(routeId, customPax = null) {
    const modal = document.getElementById('boarding-pass-modal');
    if (!modal) return;

    let route = null;
    if (latestRerouteData && latestRerouteData.routes) {
        route = latestRerouteData.routes.find(r => r.id === routeId) || latestRerouteData.routes[0];
    }

    const firstSeg = (route && route.segments.length > 0) ? route.segments[0] : { flight_number: "LH1412", airline: "Lufthansa", origin: "OTP", destination: "FRA", departure: "20:15", arrival: "22:30" };
    const lastSeg = (route && route.segments.length > 0) ? route.segments[route.segments.length - 1] : firstSeg;

    const paxName = customPax ? customPax.name : (currentUser.name || "Damian Dabija");
    const pnr = "AP-" + Math.floor(1000 + Math.random() * 9000) + String.fromCharCode(65 + Math.floor(Math.random() * 26));
    const randomSeat = (Math.floor(Math.random() * 25) + 3) + ["A", "B", "C", "D", "F"][Math.floor(Math.random() * 5)];
    const randomGate = "0" + (Math.floor(Math.random() * 9) + 1) + ["A", "B"][Math.floor(Math.random() * 2)];

    document.getElementById('ticket-passenger-name').innerText = paxName;
    document.getElementById('ticket-pnr-code').innerText = pnr;
    document.getElementById('ticket-origin-code').innerText = firstSeg.origin;
    document.getElementById('ticket-origin-city').innerText = (firstSeg.origin === "OTP" || firstSeg.origin === "LROP") ? "București (Otopeni)" : (firstSeg.origin === "CRA" || firstSeg.origin === "LRCV") ? "Craiova" : firstSeg.origin;
    document.getElementById('ticket-departure-time').innerText = firstSeg.departure;

    document.getElementById('ticket-dest-code').innerText = lastSeg.destination;
    document.getElementById('ticket-dest-city').innerText = (lastSeg.destination === "LHR" || lastSeg.destination === "EGLL") ? "Londra (Heathrow)" : (lastSeg.destination === "CDG" || lastSeg.destination === "LFPG") ? "Paris (Charles de Gaulle)" : lastSeg.destination;
    document.getElementById('ticket-arrival-time').innerText = lastSeg.arrival;

    document.getElementById('ticket-flight-number').innerText = firstSeg.flight_number;
    document.getElementById('ticket-gate').innerText = randomGate;
    document.getElementById('ticket-seat').innerText = randomSeat;
    document.getElementById('ticket-status-label').innerText = "0 € Rebook";
    document.getElementById('ticket-eticket-num').innerText = `E-TKT: 281-${Math.floor(1000000000 + Math.random() * 9000000000)} • PNR: ${pnr}`;

    const alertMsg = document.getElementById('ticket-alert-msg');
    if (alertMsg) alertMsg.style.display = 'none';

    modal.style.display = 'flex';
}

function closeBoardingPassModal() {
    const modal = document.getElementById('boarding-pass-modal');
    if (modal) modal.style.display = 'none';
}

function downloadTicketPdf() {
    const alertMsg = document.getElementById('ticket-alert-msg');
    if (alertMsg) {
        alertMsg.innerText = "✅ Biletul electronic a fost salvat și descărcat cu succes (PDF)!";
        alertMsg.style.display = 'block';
    }
}

function saveToWallet() {
    const alertMsg = document.getElementById('ticket-alert-msg');
    if (alertMsg) {
        alertMsg.innerText = "📲 Biletul a fost adăugat în Apple Wallet / Google Pay Pass!";
        alertMsg.style.display = 'block';
    }
}

// ----------------- FEATURE 4: JAVA REROUTE ENGINE (ADMIN DISPATCH) -----------------

let currentDispatchResults = [];

async function executeJavaCancel() {
    const sel = document.getElementById('java-flight-select');
    const flightId = sel ? sel.value : "RO301";
    const card = document.getElementById('java-results-card');
    const summary = document.getElementById('java-summary');
    const tbody = document.getElementById('java-passengers-tbody');

    summary.innerText = "Interogare motor Java (Time-dependent Dijkstra)...";
    card.style.display = 'block';

    try {
        const data = await apiFetch('/api/java/cancel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ flightId: flightId })
        });

        if (!data || !data.results || !data.cancelled) {
            summary.innerText = "Nu s-au putut prelua datele de la motorul Java. Verificați conexiunea.";
            return;
        }

        currentDispatchResults = data.results;
        const totalAffected = data.cancelled.total_passengers_affected || data.results.length;
        const hotelCount = data.results.filter(r => r.status === 'hotel_assigned').length;
        const reroutedCount = data.results.length - hotelCount;
        const reroutedPct = Math.round((reroutedCount / data.results.length) * 100);

        const pTot = document.getElementById('dispatch-total-pax');
        const pPct = document.getElementById('dispatch-rerouted-pct');
        const pHtl = document.getElementById('dispatch-hotel-count');

        if (pTot) pTot.innerText = totalAffected;
        if (pPct) pPct.innerText = `${reroutedPct}% (${reroutedCount})`;
        if (pHtl) pHtl.innerText = hotelCount;

        summary.innerText = `Zborul ${data.cancelled.id} (${data.cancelled.from} ➔ ${data.cancelled.to}) a fost anulat. Motorul Java / AI a analizat graful și a re-alocat ${data.results.length} pasageri conform priorităților:`;

        tbody.innerHTML = data.results.map((r, idx) => {
            const p = r.passenger;
            const chosen = r.chosen;
            const isHotel = r.status === 'hotel_assigned';

            const itineraryHtml = chosen ? chosen.legs.map(l => 
                `<strong>${l.airline} ${l.id}</strong> (${l.from} ${l.depart} ➔ ${l.to} ${l.arrive})`
            ).join(' ➔ ') : '<span style="color: #dc2626; font-weight: 700;">Nicio rută viabilă (Locuri epuizate)</span>';

            const categoryLabel = p.category || (p.family_size > 1 ? `Familie (${p.family_size} pers)` : (p.tight_connection ? 'Conexiune Strânsă' : 'Standard'));

            return `
                <tr>
                    <td><strong>${p.name}</strong><br><span style="font-size: 11px; color: #64748b;">ID: ${p.id}</span></td>
                    <td><span style="font-weight: 700; color: #0284c7;">${(r.priority || 5.0).toFixed(1)}</span></td>
                    <td><span style="font-size: 12px; background: #f1f5f9; padding: 2px 6px; border-radius: 4px;">${categoryLabel}</span></td>
                    <td style="font-size: 12px;">
                        ${itineraryHtml}
                        ${chosen && chosen.hotel ? `<div style="font-size: 11px; color: #854d0e; margin-top: 3px;">🏨 ${chosen.hotel}</div>` : ''}
                    </td>
                    <td>${r.delay_minutes !== null ? '+' + Math.floor(r.delay_minutes / 60) + 'h ' + (r.delay_minutes % 60) + 'm' : '--'}</td>
                    <td>
                        <span class="status-pill ${isHotel ? 'pill-HIGH' : 'pill-LOW'}">
                            ${isHotel ? 'HOTEL + ZBOR MÂINE' : 'RERUTAT CU SUCCES'}
                        </span>
                    </td>
                    <td>
                        <button class="btn-secondary" style="font-size: 11px; padding: 4px 8px;" onclick="viewDispatchPassengerTicket(${idx})">
                            🎫 Vezi Bilet
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

    } catch (e) {
        console.error(e);
        summary.innerText = "Eroare la apelarea motorului Java: " + e.message;
    }
}

function viewDispatchPassengerTicket(idx) {
    if (!currentDispatchResults || !currentDispatchResults[idx]) return;
    const r = currentDispatchResults[idx];
    openBoardingPassModal('DISPATCH', r.passenger);
}

// ----------------- PITCH CRISIS DEMO -----------------

async function triggerCrisisDemo() {
    try {
        const data = await apiFetch('/api/scenarios/crisis?flight_code=RO301');
        weatherOverride = 'fog';
        renderFlightRisk(data.flight_risk);
        renderReroute(data.reroute);

        alert("🚨 Scenariul de criză a fost declanșat!\n\nZborul RO301 a intrat în risc CRITIC (88% probabilitate de anulare din cauza ceții din Londra). Re-rutarea optimă a fost pregătită prin Viena/Frankfurt, iar voucherul de compensare de €400 a fost emis.");
    } catch (e) {
        console.error(e);
    }
}

function resetDemo() {
    weatherOverride = null;
    evaluateFlightRisk();
    fetchRerouteData();
}

// ----------------- FALLBACK MOCK ENGINE (FOR GITHUB PAGES STANDALONE) -----------------

function getMockResponse(endpoint, options) {
    if (endpoint.includes("/api/auth/login")) {
        const body = JSON.parse(options.body || "{}");
        const isAdmin = body.username?.toLowerCase() === "admin" && body.password === "admin";
        return {
            username: body.username || "Damian",
            name: isAdmin ? "Dispecer Aeroport (Admin)" : (body.username || "Damian"),
            role: isAdmin ? "admin" : "passenger",
            token: "mock-token"
        };
    }
    if (endpoint.includes("/passenger_recommendation")) {
        return {
            fastest_lane: 2,
            wait_display: "~4 min",
            message: "Mergi la Banda 2 pentru cel mai rapid control de securitate.",
            level: "Fluent"
        };
    }
    if (endpoint.includes("/queue/status")) {
        return {
            lanes: [
                { lane_id: 1, people_yolo: 5, thermal_ir: 3.5, wait_display: "~7 min", level: "Moderat", is_fastest: false, extra_bag_seconds: 180 },
                { lane_id: 2, people_yolo: 2, thermal_ir: 2.0, wait_display: "~4 min", level: "Fluent", is_fastest: true, extra_bag_seconds: 60 },
                { lane_id: 3, people_yolo: 7, thermal_ir: 4.8, wait_display: "~9 min", level: "Aglomerat", is_fastest: false, extra_bag_seconds: 240 }
            ],
            fastest_lane: 2,
            total_people: 14,
            total_detected_objects: 22,
            recommended_lane_message: "Banda 2 este cea mai rapida (~4 min)"
        };
    }
    if (endpoint.includes("/flight/risk")) {
        const isFog = weatherOverride === 'fog';
        return {
            flight_number: currentFlightCode,
            origin: "OTP",
            destination: "LHR",
            aircraft_type: "Boeing 737-800",
            risk_score: isFog ? 88 : 45,
            risk_level: isFog ? "CRITICAL" : "MODERATE",
            cancellation_probability: isFog ? 0.88 : 0.25,
            weather_origin: { city: "București (OTP)", temp_c: 12, condition: "Noros", wind_speed_kmh: 14, visibility_m: 9000 },
            weather_destination: { city: "Londra (LHR)", temp_c: 4, condition: isFog ? "Ceață critică densă" : "Ploaie ușoară", wind_speed_kmh: 42, visibility_m: isFog ? 180 : 4500 },
            recommendation: isFog ? "ANULARE IMINENTĂ! Aeroportul destinație a emis restricții severe de aterizare." : "Zbor în grafic, întârzieri minore posibile.",
            risk_factors: isFog ? ["Vizibilitate critică sub 200m la destinație (CAT III activ)", "Rafale puternice de vânt pe piste"] : ["Condiții atmosferice stabile"],
            can_trigger_reroute: isFog
        };
    }
    if (endpoint.includes("/flight/reroute")) {
        return {
            original_flight: currentFlightCode,
            status: "CRITICAL_RISK_RECOVERY",
            routes: [
                {
                    id: "OPT-1",
                    route_type: "LAYOVER",
                    recommended: true,
                    total_duration_minutes: 315,
                    layover_airport: "VIE",
                    layover_minutes: 75,
                    price_eur: 300,
                    available_seats: 7,
                    risk_score: 15,
                    segments: [
                        { airline: "Austrian Airlines", flight_number: "OS784", origin: "OTP", destination: "VIE", departure: "16:40", arrival: "17:20", duration_minutes: 100 },
                        { airline: "Austrian Airlines", flight_number: "OS453", origin: "VIE", destination: "LHR", departure: "18:35", arrival: "19:55", duration_minutes: 140 }
                    ]
                },
                {
                    id: "OPT-2",
                    route_type: "LAYOVER",
                    recommended: false,
                    total_duration_minutes: 325,
                    layover_airport: "FRA",
                    layover_minutes: 75,
                    price_eur: 330,
                    available_seats: 11,
                    risk_score: 20,
                    segments: [
                        { airline: "Lufthansa", flight_number: "LH1412", origin: "OTP", destination: "FRA", departure: "17:15", arrival: "18:45", duration_minutes: 150 },
                        { airline: "Lufthansa", flight_number: "LH902", origin: "FRA", destination: "LHR", departure: "20:00", arrival: "20:40", duration_minutes: 100 }
                    ]
                }
            ],
            compensation_voucher: {
                amount_eur: 400,
                regulation: "Regulamentul European (CE) Nr. 261/2004",
                passenger_name: currentUser.name,
                reason: `Anulare zbor ${currentFlightCode} (OTP -> LHR)`,
                voucher_code: "EU261-OTPLHR-" + Math.random().toString(36).substring(2, 8).toUpperCase()
            }
        };
    }
    if (endpoint.includes("/api/java/cancel")) {
        return {
            cancelled: { id: "AP103", from: "LROP", to: "LFPG" },
            results: [
                {
                    passenger: { id: "PX012", name: "Vlad Ilie", tight_connection: true, family_size: 2, deadline: "16:30" },
                    priority: 10.8,
                    delay_minutes: 540,
                    status: "rebooked",
                    voucher: { total: 265, code: "AP-PX012-AP103" },
                    chosen: { legs: [{ airline: "TAROM", id: "AP143", from: "LROP", to: "LFPG", depart: "16:00", arrive: "18:55" }] }
                },
                {
                    passenger: { id: "PX002", name: "Alexandra Marin", tight_connection: false, family_size: 3, deadline: "14:00" },
                    priority: 9.5,
                    delay_minutes: 540,
                    status: "rebooked",
                    voucher: { total: 265, code: "AP-PX002-AP103" },
                    chosen: { legs: [{ airline: "TAROM", id: "AP143", from: "LROP", to: "LFPG", depart: "16:00", arrive: "18:55" }] }
                }
            ]
        };
    }
    return {};
}

// ----------------- INIT -----------------

window.addEventListener('DOMContentLoaded', () => {
    initAuth();
    loadAllFlights();
    pollQueueStatus();
    setInterval(pollQueueStatus, 2500);
    evaluateFlightRisk();
    fetchRerouteData();
});
