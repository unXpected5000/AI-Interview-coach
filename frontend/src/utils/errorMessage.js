// Turns any API or network error into a safe, readable string. FastAPI returns
// `detail` as a string, an object ({ code, message }), or a list of validation
// errors ({ loc, msg }); rendering those objects directly would crash React.

function fieldLabel(loc) {
  if (!Array.isArray(loc)) return "";
  const parts = loc.filter((part) => part !== "body" && part !== "query" && part !== "path" && typeof part !== "number");
  const last = parts[parts.length - 1];
  return typeof last === "string" ? last.replaceAll("_", " ") : "";
}

export function formatErrorDetail(detail) {
  if (typeof detail === "string") return detail.trim();
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === "string") return item.trim();
        if (item && typeof item === "object") {
          const label = fieldLabel(item.loc);
          const message = typeof item.msg === "string" ? item.msg : formatErrorDetail(item.message);
          return [label, message].filter(Boolean).join(": ");
        }
        return "";
      })
      .filter(Boolean)
      .join(" ");
  }
  if (detail && typeof detail === "object") {
    return formatErrorDetail(detail.message ?? detail.msg ?? detail.detail ?? "");
  }
  return "";
}

export function getErrorCode(error) {
  const detail = error?.response?.data?.detail;
  return detail && typeof detail === "object" && !Array.isArray(detail) && typeof detail.code === "string" ? detail.code : "";
}

export function getErrorMessage(error, fallback = "Something went wrong. Please try again.") {
  if (!error) return fallback;
  const response = error.response;
  if (response) {
    const data = response.data;
    const message = data && typeof data === "object" && !(typeof Blob !== "undefined" && data instanceof Blob)
      ? formatErrorDetail(data.detail ?? data.message)
      : "";
    if (message) return message;
    if (response.status === 429) return "Too many requests. Wait a moment and try again.";
    if (response.status === 413) return "The file is too large.";
    if (response.status >= 500) return `${fallback} The server is unavailable right now.`;
    return fallback;
  }
  if (error.request) return "Could not reach the server. Check your connection and try again.";
  return fallback;
}
