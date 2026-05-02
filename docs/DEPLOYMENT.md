# Deployment Guide (Railway + Vercel)

## Backend on Railway

1. Push latest code to GitHub.
2. In Railway, create a new project from this GitHub repository.
3. Railway uses:
   - `railway.json` for start command
   - `nixpacks.toml` for install/build phases
4. Set backend environment variables in Railway:
   - `OPENAI_API_KEY`
   - `SARVAM_API_KEY`
   - `TTS_FIRST_CHUNK_MIN_CHARS` (optional)
   - `TTS_NEXT_CHUNK_MIN_CHARS` (optional)
   - `TTS_CHUNK_MAX_CHARS` (optional)
5. Do not hardcode `PORT`; Railway injects it automatically.
6. Deploy and verify:
   - `GET /` -> `Server is running`
   - `GET /health` -> JSON status

## Frontend on Vercel

1. Deploy frontend project to Vercel.
2. Add environment variable in Vercel:
   - `VITE_BACKEND_URL=https://<your-railway-backend-domain>`
3. Redeploy Vercel after adding the env var.

## Notes

- Frontend socket URL is centralized in `frontend/src/services/socket.js`.
- Local fallback is `http://localhost:3001` for development.
