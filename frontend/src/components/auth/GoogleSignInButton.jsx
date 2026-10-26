import { useEffect, useRef, useState } from "react";

const GOOGLE_SCRIPT_URL = "https://accounts.google.com/gsi/client";
let googleScriptPromise;

function loadGoogleIdentityScript() {
  if (window.google?.accounts?.id) return Promise.resolve(window.google);
  if (googleScriptPromise) return googleScriptPromise;

  googleScriptPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector(`script[src="${GOOGLE_SCRIPT_URL}"]`);
    const script = existingScript ?? document.createElement("script");
    const onLoad = () => {
      if (window.google?.accounts?.id) resolve(window.google);
      else reject(new Error("Google sign-in could not initialize in this browser."));
    };
    const onError = () => reject(new Error("Google sign-in could not load. Check your connection or content blockers."));

    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", onError, { once: true });
    if (!existingScript) {
      script.src = GOOGLE_SCRIPT_URL;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    } else if (window.google?.accounts?.id) {
      onLoad();
    }
  }).catch((error) => {
    googleScriptPromise = undefined;
    throw error;
  });

  return googleScriptPromise;
}

export default function GoogleSignInButton({ onCredential, disabled = false }) {
  const containerRef = useRef(null);
  const callbackRef = useRef(onCredential);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const clientId = import.meta.env?.VITE_GOOGLE_CLIENT_ID?.trim() ?? "";

  useEffect(() => {
    callbackRef.current = onCredential;
  }, [onCredential]);

  useEffect(() => {
    if (!clientId || !containerRef.current) return undefined;
    let active = true;
    setIsLoading(true);
    loadGoogleIdentityScript()
      .then((google) => {
        if (!active || !containerRef.current) return;
        google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => {
            if (!response.credential) {
              setError("Google did not return a sign-in credential. Please try again.");
              return;
            }
            setError("");
            void callbackRef.current(response.credential);
          },
          auto_select: false,
          cancel_on_tap_outside: true,
        });
        google.accounts.id.renderButton(containerRef.current, {
          theme: "outline",
          size: "large",
          shape: "pill",
          text: "continue_with",
          width: Math.min(Math.max(containerRef.current.clientWidth, 220), 400),
        });
      })
      .catch((loadError) => setError(loadError.message || "Google sign-in could not load."))
      .finally(() => active && setIsLoading(false));

    return () => {
      active = false;
      if (containerRef.current) containerRef.current.replaceChildren();
    };
  }, [clientId]);

  if (!clientId) {
    return <div className="mt-4 rounded-lg border border-stone-200 bg-stone-50 p-3 text-center">
      <button className="w-full rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-500" disabled type="button">Google sign-in setup required</button>
      <p className="mt-2 text-xs text-stone-500">Set VITE_GOOGLE_CLIENT_ID in the frontend and GOOGLE_CLIENT_ID on the backend to enable it.</p>
    </div>;
  }

  return <div className="mt-4">
    <div aria-busy={isLoading || disabled} className={disabled ? "pointer-events-none opacity-60" : ""} ref={containerRef} />
    {isLoading ? <p className="mt-2 text-center text-xs text-stone-500">Loading Google sign-in…</p> : null}
    {error ? <p className="mt-2 text-center text-xs text-rose-700" role="status">{error}</p> : null}
  </div>;
}
