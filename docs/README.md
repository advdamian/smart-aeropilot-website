# ✈️ Smart AeroPilot System
### Sistem inteligent de optimizare a fluxului de pasageri, predicție meteo & re-rutare automată
**Proiect dezvoltat în cadrul Craiova Hackathon (Airport & Smart Mobility Edition)**  
🌐 **Live Web Hub:** [https://aeropilot.tech](https://aeropilot.tech)

---

## 📌 1. Problema Abordată

Aeroporturile moderne se confruntă cu blocaje operaționale critice:
1. **Haos la controlul de securitate:** Timpii de așteptare sunt imprevizibili, iar benzile de scanare sunt distribuite inegal (unii pasageri au doar un rucsac, alții călătoresc cu multiple valize și laptopuri ce necesită tăvi separate).
2. **Anulări și întârzieri anunțate din scurt:** Călătorii află că zborul este anulat abia când ajung la poartă, deși condițiile meteo severe (ceață densă sub standardele CAT III, rafale de forfecare a vântului) erau vizibile din telemetrie cu ore înainte.
3. **Stresul re-rezervării și al compensațiilor:** În caz de criză, sute de pasageri se calcă în picioare la ghișeele de asistență; familiile sunt adesea separate pe zboruri diferite, iar obținerea voucherelor legale de compensare (Directiva Europeană CE 261/2004) este un proces birocratic infernal.

---

## 🚀 2. Soluția: Ce este Smart AeroPilot?

**Smart AeroPilot** este un hub centralizat care conectează în timp real infrastructura fizică a aeroportului cu pasagerul și dispeceratul operațional, pe 3 piloni tehnologici:

```
                          ┌────────────────────────────────────────┐
                          │   AeroPilot Central Hub (FastAPI)     │
                          │        https://aeropilot.tech          │
                          └──────┬────────────┬────────────┬───────┘
                                 │            │            │
            ┌────────────────────┘            │            └────────────────────┐
            ▼                                 ▼                                 ▼
   [PILONUL 1: VIZIUNE]              [PILONUL 2: RISC]                [PILONUL 3: JAVA]
Estimator Cozi Securitate        Predictor Întârzieri Meteo       Motor Re-rutare Dijkstra
  • YOLOv8n pe CPU (ONNX)         • Standarde aviație CAT III      • Graf european de zboruri
  • Clasificare tipuri bagaje     • Analiză ceață & vânt lateral   • Păstrare familii grupate
  • Fuziune termică IR simulată   • Calcul probabilitate anulare   • Vouchere automate EU261
```

---

## 🧠 3. Componentele Tehnice & Contribuția Echipei

### 🔹 Pilonul 1: Estimator Cozi Securitate (Computer Vision & Senzori)
* **Tehnologie:** Python, ONNX Runtime (CPU inference ultra-rapid), OpenCV, YOLOv8n.
* **Ce face:**
  * Numără în timp real fluxul de călători de la punctele de control.
  * **Asociere geometrică persoană-bagaj:** Nu numără doar oameni, ci clasifică încărcătura fizică (rucsac `+120s`, valiză `+90s`, laptop `+60s`, geantă `+30s`).
  * **Fuziune multi-senzorială:** Suprapune o matrice termică IR simulată peste detecțiile optice (`0.7 × YOLO + 0.3 × IR`) și netezește timpii cu factorul alfa 0.15 pentru a elimina fluctuațiile false.
  * Ghidează automat pasagerul către cea mai rapidă bandă de securitate.

### 🔹 Pilonul 2: Predictor Risc Anulare & Telemetrie Meteo
* **Tehnologie:** Python, modele de risc conform normelor internaționale de aviație ICAO.
* **Ce face:**
  * Monitorizează condițiile meteo la sol atât pe aeroportul de plecare (ex: Craiova / Otopeni), cât și la destinație (ex: Londra Heathrow, München, Paris).
  * Aplică reguli stricte de aviație:
    * Vizibilitate sub 300m (dincolo de limitele ILS CAT III) ➔ salt masiv la **88% probabilitate de anulare**.
    * Vânt de forfecare (crosswind > 45 km/h) sau celule convective de furtună ➔ alertă critică de deviere.
  * Declanșează din timp starea de criză pentru a permite re-rutarea pasagerilor *înainte* ca aceștia să rămână blocați în tranzit.

### 🔹 Pilonul 3: Motor Algoritmic de Re-rutare în Java (Time-Dependent Dijkstra)
* **Tehnologie:** Java 17+, zero dependențe externe, structuri de date native de grafuri.
* **Ce face:**
  * În secunda în care un zbor este anulat (ex: `AP103`), analizează graful aeroportuar european cu escale (Viena, Frankfurt, Amsterdam, Paris).
  * **Algoritm de prioritizare socială & operațională:**
    * Călătorii cu conexiuni strânse primesc bonus de prioritate (+3.0 puncte).
    * Familiile sunt ținute împreună (+2.0 puncte + 0.5 per membru) și li se alocă locuri grupate pe aceeași aeronavă.
    * Pasagerii cu deadline urgent sunt deserviți primii.
  * **Compensații legale instant:** Generează automat vouchere garantate conform Regulamentului European (CE) Nr. 261/2004 (**€250 - €600** în funcție de distanță) + tichete de masă (€15), emise direct cu cod unic de revendicare.

---

## 👤 4. Securitate & Permisiuni (Role-Based Access Control)

Platforma separă strict ceea ce vede pasagerul de ceea ce gestionează dispeceratul aeroportului:

| Funcționalitate | Mod Pasager (Mobil / Web) | Mod Administrator / Dispecerat |
| :--- | :---: | :---: |
| **Ghidare Bandă Securitate** | ✅ Recomandare bandă rapidă (~4 min) | ✅ Recomandare bandă rapidă |
| **Camere CCTV & Heatmap IR** | ❌ **Blocat** (confidențialitate) | ✅ **Stream video live** YOLOv8 + IR |
| **Comutare sursă video / Webcam** | ❌ Fără acces | ✅ Control webcam & clipuri demo |
| **Status Zbor & Risc Meteo** | ✅ Doar pentru zborul personal | ✅ Monitorizare globală flote zboruri |
| **Simulare Scenarii de Criză** | ❌ Fără acces | ✅ Declanșare alerte meteo live |
| **Dispecerat Anulări Java** | ❌ Doar biletul propriu & voucherul | ✅ Tabel complet pasageri, priorități & graf |

* **Cont Admin:** utilizator `admin`, parolă `admin`.
* **Cont Pasager:** accesibil instant cu orice nume (ex: `Damian`).

---

## 🛠️ 5. Stack Tehnologic & Arhitectură

* **Backend & API:** Python 3.13 cu **FastAPI** (asincron, documentație interactivă Swagger la `/docs`).
* **Computer Vision:** `onnxruntime` (CPU-optimized), `opencv-python-headless`.
* **Graph Engine:** Java 17+ (JDK 25 LTS), compilat nativ, integrat cu backend-ul prin bridge de date și execuție directă.
* **Frontend Web:** HTML5 curat, CSS modern complet responsive (optimizat special pentru telefoane mobile, fără framework-uri greoaie), Vanilla JavaScript.
* **Networking & Deployment:**
  * **Interfață Web:** Publicată pe **GitHub Pages** și mapată pe domeniul achiziționat: **[https://aeropilot.tech](https://aeropilot.tech)**.
  * **Tunel Backend Securizat:** **Cloudflare Quick Tunnel (`cloudflared`)**, permițând comunicare sigură HTTPS între domeniul public și backend-ul local de pe laptop (fără a necesita ngrok sau deschidere de porturi router).

---

## ⚡ 6. Cum se rulează proiectul local

### Cerințe preliminare:
* Python 3.11 - 3.13
* Java JDK 17 sau mai nou

### Pornire cu o singură comandă:
Am creat scriptul automat care compilează engine-ul Java și pornește FastAPI:
```bash
./run.sh
```
* **Frontend & Dashboard:** `http://localhost:8000`
* **Swagger API Docs:** `http://localhost:8000/docs`

### Pornire Tunel Cloudflare (opțional, pentru conectare la domeniul extern):
```bash
./tunnel.sh
```
Copiază adresa HTTPS generată (ex: `https://xxxx.trycloudflare.com`) și lipește-o în butonul **⚙️ API Host** din interfața web.

---

## 🏆 Scenariul de Demonstrație pentru Pitch (Demo Flow)

1. **Pasul 1:** Deschideți `https://aeropilot.tech` pe telefon pentru a arăta perspectiva călătorului: acces rapid la banda optimă de scanare și zborul monitorizat.
2. **Pasul 2:** Deschideți panoul de **Administrator (`admin`/`admin`)** pe laptop pentru a prezenta juriului camerele CCTV cu detecția YOLOv8 a bagajelor și harta termică.
3. **Pasul 3 (Criza Live):** Apăsați pe butonul roșu **„🚨 Declanșează Criza Meteo”** (simulează ceață densă de 180m la destinație). Riscul zborului sare la 88% (Critic).
4. **Pasul 4 (Rezolvarea Automată):** Intrați în tab-ul **Dispecerat Java** și rulați anularea zborului. Motorul Dijkstra realocă instant pasagerii pe rute alternative (prin Viena/Frankfurt), ține familiile grupate și generează tichetele de compensare europeană EU261 de **400€** nominale.
