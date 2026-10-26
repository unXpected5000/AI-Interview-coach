# Free deployment setup

This repository is prepared for a static frontend on Cloudflare Pages and a Python API on Render's free web service. Deployments are not activated by this repository change; each provider requires signing in and connecting/configuring the repository.

## Before deploying

- Use a MongoDB connection string for a hosted database reachable from Render. Do not use `localhost` for a hosted API. Keep the URI private.
- The application can use its non-AI fallback paths without a provider key. AI-generated question/feedback features need a configured Gemini or OpenAI API key and may incur usage charges. This deployment template deliberately does not configure either key.
- Free hosting has limits: Render services can sleep while idle and have ephemeral local storage. The app must keep user uploads/data in MongoDB or recreateable storage, not local files.

## API on Render

1. Sign in to Render and create a Blueprint from this GitHub repository. Render reads the root `render.yaml`.
2. Set `MONGODB_URI` to the hosted MongoDB connection string when prompted. Leave `BACKEND_CORS_ORIGINS` temporarily as a placeholder only until the Pages URL is known.
3. Wait for the API to deploy. Verify `https://<render-service>.onrender.com/api/health` returns `{"status":"ok"}`.
4. In Render's environment settings, set `BACKEND_CORS_ORIGINS` to the exact Cloudflare Pages origin (for example, `https://your-project.pages.dev`) and redeploy.

## Frontend on Cloudflare Pages

Create a Pages project connected to this repository with:

- Root directory: `frontend`
- Build command: `npm ci && npm run build`
- Build output directory: `dist`
- Environment variable `VITE_API_BASE_URL`: `https://<render-service>.onrender.com/api`

After the first Pages deployment, complete the Render CORS setting above. The `public/_redirects` file enables client-side route fallback. Redeploy the frontend after changing its API URL.

## Privacy and cost

Do not commit `.env` files, database URIs, JWT secrets, or provider API keys. Render's Blueprint generates the JWT signing secret. Render and Cloudflare account limits and terms may change; confirm the currently displayed plan limits before creating services. No paid service, API key, or subscription is enabled by this template.
