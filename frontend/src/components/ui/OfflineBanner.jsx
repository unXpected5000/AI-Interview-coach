import { useEffect, useState } from "react";

/** Thin banner shown while the device reports no network connection. */
export default function OfflineBanner() {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  if (online) return null;
  return (
    <div className="safe-top fixed inset-x-0 top-0 z-[70] bg-amber-500 px-4 py-2 text-center text-sm font-bold text-amber-950" role="status">
      You're offline. Changes can't be saved until your connection returns.
    </div>
  );
}
