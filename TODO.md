# SafePath Free Deploy Plan (Vercel Frontend + Render Backend)

## Prerequisites
- GitHub account/repo (current local is ready)
- Free accounts: vercel.com, render.com
- Mapbox token (for maps): console.mapbox.com → Access Tokens → New (Public)

## Steps:
1. [ ] Push to GitHub: 
   ```
   git add .
   git commit -m \"Prepare for free deploy: Vercel+Render\"
   git push origin main
   ```
2. [ ] Update secrets in .gitignore (done below)
3. [ ] Frontend Vercel:
   - vercel.com/login → New Project → Import GitHub Repo
   - Env: `VITE_MAPBOX_TOKEN=pk.ey...` (your token)
   - Deploy! → URL like safepath.vercel.app
4. [ ] Backend Render:
   - render.com → New → Web Service → Connect GitHub Repo → Docker
   - Env: DEBUG=False, DB_HOST=postgres://..., REDIS_URL=...
   - Plan: Free → URL like safepath-api.onrender.com
5. [ ] Connect: Vercel redeploy with `VITE_API_URL=https://safepath-api.onrender.com/api`
6. [ ] Test: Visit frontend, check maps/routes/ML predictions
7. [ ] Optional: Custom domain (free subdomain)

## Progress
1. [x] .gitignore secrets
2. [x] .env.example created
3. [x] Backend Dockerfile (gunicorn prod)
4. [x] settings.py prod-ready (DEBUG/HOSTS/CORS/DB env-based)
5. [x] README.md deploy guide with buttons

6. [ ] User: git push origin main
7. [ ] Deploy Vercel frontend
8. [ ] Deploy Render backend (Postgres+Redis)
9. [ ] Complete

## Local Test Before Deploy
docker-compose up --build
Frontend: localhost:5173
Backend: localhost:8000/api

