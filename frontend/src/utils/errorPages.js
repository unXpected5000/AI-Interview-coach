// Content for full-page error states. Pure data so it can be unit-tested and
// reused by the router, the error boundary, and pages whose data fails to load.

export const ERROR_PAGES = {
  404: {
    code: "404",
    title: "We couldn't find that page",
    explanation: "The link may be mistyped, outdated, or the item may have been deleted (for example, an interview or resume you removed).",
    steps: ["Check the address for typos.", "Go back to your dashboard and open the item from there."],
  },
  403: {
    code: "403",
    title: "You don't have access to this",
    explanation: "Your account is signed in, but its role doesn't allow this page. HOD pages are for department faculty, and user management is for operators.",
    steps: ["Return to your dashboard.", "If you think you need access, ask an operator to review your role."],
  },
  401: {
    code: "401",
    title: "Please sign in again",
    explanation: "Your session expired or is no longer valid, so the app couldn't confirm who you are.",
    steps: ["Sign in again; your saved interviews and resumes are kept."],
  },
  500: {
    code: "500",
    title: "Something went wrong on our side",
    explanation: "The server hit an unexpected error while handling this request. Your saved work is not affected by this error message.",
    steps: ["Try again in a moment.", "If it keeps happening, note the time and what you clicked, and contact support."],
  },
  503: {
    code: "503",
    title: "The service is temporarily unavailable",
    explanation: "The API or its database isn't responding right now. On free hosting the server can take up to a minute to wake up after being idle.",
    steps: ["Wait 30–60 seconds and try again.", "Your saved interviews are stored safely and will be there when the service is back."],
  },
  offline: {
    code: "Offline",
    title: "You're offline",
    explanation: "Your device lost its internet connection, so the app can't reach the server.",
    steps: ["Check Wi-Fi or mobile data.", "Unsaved typed answers stay in the page; retry once you're back online."],
  },
  crash: {
    code: "Error",
    title: "This page stopped working",
    explanation: "Part of the app ran into an unexpected problem while displaying this page.",
    steps: ["Reload the page.", "If the problem returns, go back to the dashboard and try again."],
  },
};

/** Choose an error page for an API/network error, or null when an inline message fits better. */
export function errorPageKindFor(error) {
  if (!error) return null;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "offline";
  const status = error.response?.status;
  if (!error.response && error.request) return "503";
  if (status === 404 || status === 400) return "404";
  if (status === 403) return "403";
  if (status === 401) return "401";
  if (status === 502 || status === 503 || status === 504) return "503";
  if (status >= 500) return "500";
  return null;
}
