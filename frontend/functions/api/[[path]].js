const jsonResponse = (status, detail) => Response.json({ detail }, { status });

export async function onRequest({ request, env }) {
  const configuredOrigin = env.BACKEND_API_ORIGIN?.trim();
  if (!configuredOrigin) {
    return jsonResponse(503, "The API proxy is not configured. Set BACKEND_API_ORIGIN in the Pages project settings.");
  }

  let origin;
  try {
    origin = new URL(configuredOrigin);
  } catch {
    return jsonResponse(500, "The API proxy origin is invalid.");
  }
  if (origin.protocol !== "https:" || origin.pathname !== "/" || origin.search || origin.hash) {
    return jsonResponse(500, "BACKEND_API_ORIGIN must be an HTTPS origin without a path.");
  }

  const incoming = new URL(request.url);
  const upstreamUrl = new URL(`${incoming.pathname}${incoming.search}`, origin);
  const upstreamRequest = new Request(upstreamUrl, request);
  return fetch(upstreamRequest);
}
