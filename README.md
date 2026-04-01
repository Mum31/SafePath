# SafePath - Planificateur de trajets sécurisés à Paris

[![Vercel](https://theregister.s3.amazonaws.com/prod/archive/2022/10/vercel_logo.png)](https://vercel.com/new/git/external) [![Render](https://render.com/images/deploy-to-render.svg)](https://render.com/deploy-docker?repo=https://github.com/YOURUSERNAME/SafePath)

## 🚀 Déploiement Gratuit (Frontend Vercel + Backend Render)

### 1. Pousser sur GitHub
```bash
git add .
git commit -m \"Deploy ready\"
git push origin main
```

### 2. Frontend (Vercel - Static React)
- Allez sur [vercel.com](https://vercel.com) → New Project → Import repo GitHub
- Ajoutez env: `VITE_MAPBOX_TOKEN=pk...` (obtenez sur mapbox.com)
- Déployé! URL: https://safepath.vercel.app

### 3. Backend (Render - Docker Django/Postgres)
- [render.com](https://render.com) → New → Web Service → Docker → GitHub repo
- Env vars (de .env.example):
  - `SECRET_KEY=...` (générer nouveau)
  - `DEBUG=False`
  - `DB_NAME=... DB_HOST=...` (créer Postgres gratuit sur Render)
  - `REDIS_URL=...` (Redis gratuit Render)
  - `ALLOWED_HOSTS=*`
- Build Command: auto (Dockerfile)
- URL: https://safepath-api.onrender.com/api/

### 4. Connecter
- Redeploy Vercel avec `VITE_API_URL=https://safepath-api.onrender.com/api`

### Local Dev
```bash
docker-compose up --build
Frontend: http://localhost:5173
Backend: http://localhost:8000/api/
```

## Fonctionnalités
- Trajets sécurisés (densité ML)
- Transports IDFM/Navitia
- Maps Leaflet/Mapbox
- Chatbot IA

## Stack
- Frontend: React/Vite/Leaflet/Recharts
- Backend: Django/DRF/PostGIS/Redis/Pandas/scikit-learn
- DB: Postgres/PostGIS

Fork & star! 🌟
