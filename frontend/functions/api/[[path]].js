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
  try {
    return await fetch(upstreamRequest);
  } catch (error) {
    // Keep origin transport failures distinguishable from application errors;
    // do not forward exception details that could contain request data.
    console.error("API origin fetch failed", {
      host: origin.host,
      path: incoming.pathname,
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return jsonResponse(502, "The API server did not return a response. It may be waking up or temporarily unavailable; retry shortly.");
  }
}
