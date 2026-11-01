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

async function changeVideoSource() {
    const sel = document.getElementById('video-source-select');
    const val = sel.value;
    try {
        await apiFetch(`/api/queue/source?source_type=${val}`, { method: 'POST' });
        const img = document.getElementById('admin-live-stream');
        if (img) img.src = `${API_BASE}/api/queue/stream?role=admin&ngrok-skip-browser-warning=true&t=${Date.now()}`;
    } catch (e) {
        console.error(e);
    }
}

// ----------------- FEATURE 2: FLIGHT RISK & WEATHER -----------------

async function evaluateFlightRisk() {
    const sel = document.getElementById('flight-select');
    currentFlightCode = sel ? sel.value : "RO301";

    const payload = {
        flight_number: currentFlightCode,
        origin: "OTP"
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
        if (data) renderFlightRisk(data);
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

    document.getElementById('meteo-origin-cond').innerText = data.weather_origin.condition;
    document.getElementById('meteo-origin-details').innerText = 
        `${data.weather_origin.temp_c}°C | Vânt: ${data.weather_origin.wind_speed_kmh} km/h | Vizib: ${data.weather_origin.visibility_m}m`;

    document.getElementById('meteo-dest-cond').innerText = data.weather_destination.condition;
    document.getElementById('meteo-dest-details').innerText = 
        `${data.weather_destination.temp_c}°C | Vânt: ${data.weather_destination.wind_speed_kmh} km/h | Vizib: ${data.weather_destination.visibility_m}m`;

    const badge = document.getElementById('risk-score-badge');
    badge.className = `status-pill pill-${data.risk_level}`;
    badge.innerText = `${data.risk_level} (${data.risk_score}%)`;

    const bar = document.getElementById('risk-progress-bar');
    bar.style.width = `${data.risk_score}%`;
    bar.className = `risk-fill risk-${data.risk_level}`;

    const rec = document.getElementById('risk-recommendation');
    rec.innerText = data.recommendation;
    rec.style.background = data.risk_score >= 80 ? '#fee2e2' : (data.risk_score >= 50 ? '#fef9c3' : '#dcfce7');
    rec.style.color = data.risk_score >= 80 ? '#991b1b' : (data.risk_score >= 50 ? '#854d0e' : '#166534');

    const factorsUl = document.getElementById('risk-factors-list');
    factorsUl.innerHTML = data.risk_factors.map(f => `<li>${f}</li>`).join('');

    const rerouteBtn = document.getElementById('btn-trigger-reroute');
    if (data.can_trigger_reroute) {
        rerouteBtn.style.display = 'block';
    } else {
        rerouteBtn.style.display = 'none';
    }
}

function setWeatherCrisis(type) {
    weatherOverride = type;
    evaluateFlightRisk();
}

// ----------------- FEATURE 3: RE-ROUTING & EU261 -----------------

async function fetchRerouteData() {
    try {
        const data = await apiFetch('/api/flight/reroute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                original_flight: currentFlightCode,
                origin: "OTP",
                destination: "LHR",
                passenger_name: currentUser.name
            })
        });
        if (data) renderReroute(data);
    } catch (e) {
        console.error("Error fetching reroute:", e);
    }
}

function renderReroute(data) {
    const container = document.getElementById('routes-container');
    if (!container || !data || !data.routes) return;

    container.innerHTML = data.routes.map(r => {
        const segmentsHtml = r.segments.map(s => `
            <div><strong>${s.airline} (${s.flight_number})</strong>: ${s.origin} (${s.departure}) → ${s.destination} (${s.arrival}) [${s.duration_minutes} min]</div>
        `).join('');

        const layoverBadge = r.layover_airport ? 
            `<span style="background: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-size: 11px;">Escală la ${r.layover_airport} (${r.layover_minutes} min)</span>` :
            `<span style="background: #dcfce7; color: #166534; padding: 2px 6px; border-radius: 4px; font-size: 11px;">ZBOR DIRECT</span>`;

        return `
            <div class="route-card ${r.recommended ? 'best' : ''}">
                <div class="route-header">
                    <div>
                        <span>${r.recommended ? '⭐ RECOMANDAT — ' : ''}Opțiunea ${r.id}</span>
                        ${layoverBadge}
                    </div>
                    <span style="color: #2563eb;">€${r.price_eur}</span>
                </div>
                <div class="route-timeline" style="margin-bottom: 8px;">
                    ${segmentsHtml}
                </div>
                <div style="font-size: 12px; color: #64748b; display: flex; justify-content: space-between;">
                    <span>Timp total: <strong>${Math.floor(r.total_duration_minutes / 60)}h ${r.total_duration_minutes % 60}m</strong></span>
                    <span>Locuri disponibile: <strong>${r.available_seats}</strong></span>
                    <span>Risc: <strong>${r.risk_score}%</strong></span>
                </div>
            </div>
        `;
    }).join('');

    if (data.compensation_voucher) {
        const v = data.compensation_voucher;
        document.getElementById('voucher-amount').innerText = `€${v.amount_eur}`;
        document.getElementById('voucher-regulation').innerText = v.regulation;
        document.getElementById('voucher-passenger').innerText = currentUser.name;
        document.getElementById('voucher-reason').innerText = v.reason;
        document.getElementById('voucher-code').innerText = v.voucher_code;
    }
}

// ----------------- FEATURE 4: JAVA REROUTE ENGINE (ADMIN DISPATCH) -----------------

async function executeJavaCancel() {
    const flightId = document.getElementById('java-flight-select').value;
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
            summary.innerText = "Nu s-au putut prelua datele de la motorul Java. Verificați conexiunea la backend.";
            return;
        }

        summary.innerText = `Zborul ${data.cancelled.id} (${data.cancelled.from} → ${data.cancelled.to}) a fost anulat. Motorul Java a re-rutat ${data.results.length} pasageri afectați conform priorităților:`;

        tbody.innerHTML = data.results.map(r => {
            const p = r.passenger;
            const chosen = r.chosen;
            const v = r.voucher;

            const itineraryHtml = chosen ? chosen.legs.map(l => 
                `${l.airline} ${l.id} (${l.from} ${l.depart} → ${l.to} ${l.arrive})`
            ).join(' ➔ ') : '<span style="color: #dc2626; font-weight: 700;">Nicio rută viabilă (Locuri epuizate)</span>';

            const situation = `
                ${p.tight_connection ? '⚠️ Conexiune strânsă<br>' : ''}
                ${p.family_size > 1 ? '👨‍👩‍👧‍👦 Familie (' + p.family_size + ' pers)<br>' : '1 pasager<br>'}
                ${p.deadline ? '⏰ Deadline: ' + p.deadline : ''}
            `;

            return `
                <tr>
                    <td><strong>${p.name}</strong><br><span style="font-size: 11px; color: #64748b;">ID: ${p.id}</span></td>
                    <td><span style="font-weight: 700; color: #0284c7;">${r.priority.toFixed(1)}</span></td>
                    <td>${situation}</td>
                    <td>${itineraryHtml}</td>
                    <td>${r.delay_minutes !== null ? '+' + Math.floor(r.delay_minutes / 60) + 'h ' + (r.delay_minutes % 60) + 'm' : '--'}</td>
                    <td>
                        <strong style="color: #16a34a;">€${v.total}</strong><br>
                        <span style="font-size: 10px; color: #64748b;">${v.code}</span>
                    </td>
                    <td>
                        <span class="status-pill ${r.status === 'rebooked' ? 'pill-LOW' : 'pill-CRITICAL'}">
                            ${r.status === 'rebooked' ? 'RE-REZERVAT' : 'NEALOCAT'}
                        </span>
                    </td>
                </tr>
            `;
        }).join('');

    } catch (e) {
        console.error(e);
        summary.innerText = "Eroare la apelarea motorului Java: " + e.message;
    }
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
    pollQueueStatus();
    setInterval(pollQueueStatus, 2500);
    evaluateFlightRisk();
    fetchRerouteData();
});
