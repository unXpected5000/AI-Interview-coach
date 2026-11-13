# Free deployment setup

This repository is prepared for a static frontend on Cloudflare Pages and a Python API on Render's free web service. Deployments are not activated by this repository change; each provider requires signing in and connecting/configuring the repository. The Pages Function forwards `/api/*` over HTTPS to the backend, so browser API calls remain same-origin and do not need permissive CORS.

## Before deploying

- Use a MongoDB connection string for a hosted database reachable from Render. Do not use `localhost` for a hosted API. Keep the URI private.
- AI-generated question/feedback features need a Gemini API key. The Render Blueprint asks for it as a secret and does not place it in source code. Do not enter a key unless you have confirmed your Google AI Studio project's free-tier eligibility and usage limits; using the API may incur charges. Without a key, the app uses its fallback question and feedback paths.
- Rate limits are in-memory and per process: they reset when the free instance sleeps or restarts. Behind the Pages proxy, many users may share one apparent client IP, so per-IP limits are deliberately generous and per-account limits do most of the work.
- Free hosting has limits: Render services can sleep while idle and have ephemeral local storage. The app must keep user uploads/data in MongoDB or recreateable storage, not local files.

## API on Render

1. Sign in to Render and create a Blueprint from this GitHub repository. Render reads the root `render.yaml`.
2. Set `MONGODB_URI` to the hosted MongoDB connection string when prompted. Set `GOOGLE_CLIENT_ID` to the Google OAuth **Web application client ID** to enable Google sign-in. Enter `GEMINI_API_KEY` only if you want live model-generated questions and feedback and have verified that requests stay within a free quota.
3. Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, and `SMTP_FROM_EMAIL` for the email provider you choose (password registration is refused with a 503 until these are set). Set `OPERATOR_EMAILS` to the address of the first operator; it is promoted after it signs in with a verified email. Optionally set `DEPARTMENTS`. `PYTHON_VERSION` is pinned to 3.11.9 in `render.yaml` because Render's default for new services changes over time (3.14.x as of November 2026).
4. Wait for the API to deploy. Verify `https://<render-service>.onrender.com/api/health` returns `{"status":"ok","database":"ok"}`. It returns 503 when MongoDB is unreachable, so Render will not report a broken API as healthy; `/api/health/live` only checks the process.
5. The Pages Function proxies `/api/*` server-to-server, so browser requests are same-origin and CORS is not required. If you later change the frontend to call Render directly, set `BACKEND_CORS_ORIGINS` to the exact Pages origin and redeploy.

## Frontend on Cloudflare Pages

Create a Pages project connected to this repository with:

- Root directory: `frontend`
- Build command: `npm ci && npm run build`
- Build output directory: `dist`
- Runtime environment variable `BACKEND_API_ORIGIN`: `https://<render-service>.onrender.com` (HTTPS origin only; no `/api` suffix)
- Build environment variable `VITE_GOOGLE_CLIENT_ID`: the same Google OAuth Web application client ID configured on Render
- Build environment variables for the legal pages: `VITE_LEGAL_OPERATOR_NAME`, `VITE_LEGAL_CONTACT_EMAIL`, `VITE_LEGAL_POSTAL_ADDRESS`, `VITE_LEGAL_GOVERNING_LAW`, `VITE_LEGAL_MINIMUM_AGE` (and optionally `VITE_LEGAL_INSTITUTION`)

Create that OAuth client in Google Cloud Console. Add the exact local and deployed frontend origins to **Authorized JavaScript origins** (for example `http://localhost:5173`, `http://127.0.0.1:5173`, and your Cloudflare Pages domain). No client secret is used by this GIS credential flow. The backend validates each ID token signature, expiry, issuer, and audience before accepting it.

Set the variable for both Production and Preview environments if you use preview deployments. The `public/_redirects` file enables client-side route fallback. The Pages Function returns a clear `503` if the backend origin is missing and rejects non-HTTPS origins.

## Privacy and cost

Do not commit `.env` files, database URIs, JWT secrets, or provider API keys. Render's Blueprint generates the JWT signing secret. Render and Cloudflare account limits and terms may change; confirm the currently displayed plan limits before creating services. No paid service or subscription is enabled by this template; adding an LLM API key can still result in usage charges.
