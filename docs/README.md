# AeroPilot Hub — GitHub Pages Deployment

Folderul `/docs` este configurat pentru a fi publicat direct prin **GitHub Pages** și legat la un domeniu personalizat.

## 🚀 Cum activezi GitHub Pages

1. Fă push la cod pe GitHub:
   ```bash
   git add docs/
   git commit -m "Deploy AeroPilot Hub to GitHub Pages"
   git push origin main
   ```
2. Deschide repository-ul pe GitHub și mergi la:
   - **Settings** ➔ **Pages**
   - La secțiunea **Build and deployment**:
     - **Source**: `Deploy from a branch`
     - **Branch**: `main` (sau `master`)
     - **Folder**: `/docs`
   - Apasă **Save**.

## 🌐 Cum legi domeniul personalizat

1. În aceeași pagină (**Settings ➔ Pages**), la secțiunea **Custom domain**:
   - Introdu domeniul tău (ex: `aeropilot.ro` sau `app.aeropilot.ro`).
   - Apasă **Save**. GitHub va genera automat fișierul `CNAME`.
   - Bifează **Enforce HTTPS** (se va emite certificat SSL gratuit Let's Encrypt în câteva minute).
2. În panoul DNS al furnizorului de domeniu (ex: Cloudflare, Namecheap, RoTLD):
   - Pentru domeniu rădăcină (`aeropilot.ro`), adaugă înregistrări DNS de tip **A** către IP-urile GitHub:
     - `185.199.108.153`
     - `185.199.109.153`
     - `185.199.110.153`
     - `185.199.111.153`
   - Pentru subdomeniu (`app.aeropilot.ro`), adaugă o înregistrare **CNAME** cu valoarea `<utilizator-github>.github.io`.

## ⚙️ Conectarea la Backend-ul API

GitHub Pages găzduiește doar fișiere statice (HTML/CSS/JS). Backend-ul (FastAPI + YOLOv8 + Java Dijkstra) rulează separat:
- **Local:** `http://localhost:8000` (folosind `./run.sh`).
- **Producție:** Deployed pe un VPS / Render / Railway (ex: `https://api.aeropilot.ro`).

În site există butonul **⚙️ API Host** în header de unde poți introduce adresa backend-ului tău. Dacă backend-ul nu este conectat, site-ul rulează automat în **Mod Demo Autonom** (totul funcționează fără erori).
