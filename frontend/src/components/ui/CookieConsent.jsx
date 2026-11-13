import { useEffect, useState } from "react";
import { recordConsent } from "../../api/accountApi.js";
import { getAccessToken } from "../../utils/tokenStorage.js";
import { OPEN_COOKIE_SETTINGS_EVENT } from "./LegalFooter.jsx";
const KEY = "ai-interview-coach-cookie-preferences";
function read() { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; } }
export default function CookieConsent() {
 const [preferences, setPreferences] = useState(read); const [open, setOpen] = useState(!preferences); const [custom, setCustom] = useState(false); const [analytics, setAnalytics] = useState(false); const [marketing, setMarketing] = useState(false);
 function save(next) { const value = { essential: true, analytics: Boolean(next.analytics), marketing: Boolean(next.marketing), updated_at: new Date().toISOString() }; try { localStorage.setItem(KEY, JSON.stringify(value)); } catch { /* Keep the choice for this visit if persistent storage is blocked. */ } setPreferences(value); setOpen(false); setCustom(false); if (getAccessToken()) recordConsent("cookie_preferences", "updated", value).catch(() => {}); }
 // Reopened from the "Cookie settings" footer link instead of a floating button
 // that covered page content on phones.
 useEffect(() => {
  const reopen = () => { setAnalytics(Boolean(preferences?.analytics)); setMarketing(Boolean(preferences?.marketing)); setCustom(true); setOpen(true); };
  window.addEventListener(OPEN_COOKIE_SETTINGS_EVENT, reopen);
  return () => window.removeEventListener(OPEN_COOKIE_SETTINGS_EVENT, reopen);
 }, [preferences]);
 if (!open) return null;
 return <aside aria-label="Cookie preferences" className="safe-bottom fixed inset-x-3 bottom-3 z-50 mx-auto max-h-[80vh] max-w-2xl overflow-y-auto rounded-xl border border-stone-300 bg-white p-4 text-stone-900 shadow-xl sm:inset-x-auto sm:right-5"><h2 className="font-bold">Cookie and storage choices</h2><p className="mt-1 text-sm leading-5">Essential local storage supports sign-in and theme preferences. No analytics or advertising trackers are currently installed. See the <a className="underline" href="/legal/cookies">storage policy</a>.</p>{custom && <fieldset className="mt-3 space-y-2 text-sm"><legend className="font-semibold">Optional categories (not currently used by the app)</legend><label className="flex items-center gap-2"><input checked={analytics} onChange={(e) => setAnalytics(e.target.checked)} type="checkbox" />Analytics</label><label className="flex items-center gap-2"><input checked={marketing} onChange={(e) => setMarketing(e.target.checked)} type="checkbox" />Marketing</label></fieldset>}<div className="mt-3 flex flex-wrap gap-2"><button className="rounded-lg bg-stone-950 px-3 py-2 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700" onClick={() => save({ analytics: true, marketing: true })} type="button">Accept all</button><button className="rounded-lg border border-stone-400 px-3 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700" onClick={() => save({ analytics: false, marketing: false })} type="button">Reject optional</button><button className="rounded-lg border border-stone-400 px-3 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700" onClick={() => custom ? save({ analytics, marketing }) : setCustom(true)} type="button">{custom ? "Save preferences" : "Customize"}</button></div></aside>;
}
