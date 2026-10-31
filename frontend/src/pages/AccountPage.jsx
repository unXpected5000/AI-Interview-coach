import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { deleteAccount, downloadAccountExport, getConsentHistory } from "../api/accountApi.js";
import { useAuth } from "../auth/AuthContext.jsx";
import PageHeader from "../components/ui/PageHeader.jsx";

export default function AccountPage() {
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const [confirmation, setConfirmation] = useState("");
  const [consentHistory, setConsentHistory] = useState([]);
  const { logout } = useAuth(); const navigate = useNavigate();
  useEffect(() => { getConsentHistory().then((response) => setConsentHistory(response.data.history ?? [])).catch(() => {}); }, []);
  async function exportData() {
    setError(""); setBusy(true);
    try { const response = await downloadAccountExport(); const exported = await response.data.text(); const payload = JSON.parse(exported); let browserPreferences = {}; try { browserPreferences = { theme: localStorage.getItem("ai-interview-coach-theme"), cookie_preferences: JSON.parse(localStorage.getItem("ai-interview-coach-cookie-preferences") || "null") }; } catch { browserPreferences = { unavailable: "Browser storage could not be read." }; } payload.browser_preferences = browserPreferences; const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })); const link = document.createElement("a"); link.href = url; link.download = "ai-interview-coach-data.json"; link.click(); URL.revokeObjectURL(url); }
    catch (e) { setError(e.response?.data?.detail ?? "Could not export your data."); } finally { setBusy(false); }
  }
  async function eraseAccount() {
    if (confirmation !== "DELETE") return;
    setError(""); setBusy(true);
    try { await deleteAccount(); logout(); navigate("/register", { replace: true }); }
    catch (e) { setError(e.response?.data?.detail ?? "Account deletion failed. Your account remains available so you can retry."); } finally { setBusy(false); }
  }
  return <section><PageHeader eyebrow="Account" title="Your data and access" description="Review and manage account information stored by this app." />
    {error && <p role="alert" className="mb-4 rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900">{error}</p>}
    <article className="max-w-3xl rounded-lg border border-stone-200 bg-white p-6"><h2 className="text-lg font-bold">Export your data</h2><p className="mt-2 text-sm leading-6 text-stone-600">Download your account profile, resume and extracted content, interviews, answers, scores, reports, and saved resume optimization records as JSON. Password hashes and authentication secrets are excluded.</p><button className="mt-4 rounded-lg bg-stone-950 px-4 py-2 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:opacity-50" disabled={busy} onClick={exportData} type="button">Download account export</button></article>
    <article className="mt-5 max-w-3xl rounded-lg border border-stone-200 bg-white p-6"><h2 className="text-lg font-bold">Consent history</h2><p className="mt-1 text-sm text-stone-600">Records feature acknowledgements and cookie preference updates. This is not a substitute for consent required by law.</p>{consentHistory.length ? <ul className="mt-3 divide-y divide-stone-200">{[...consentHistory].reverse().map((event, index) => <li className="py-2 text-sm" key={`${event.timestamp}-${index}`}><strong>{String(event.type).replaceAll("_", " ")}</strong> · {event.action} · {event.timestamp ? new Date(event.timestamp).toLocaleString() : "time unavailable"}</li>)}</ul> : <p className="mt-3 text-sm text-stone-500">No server-side consent events are recorded yet. Cookie preferences remain stored locally in this browser.</p>}</article>
    <article className="mt-5 max-w-3xl rounded-lg border border-rose-300 bg-white p-6"><h2 className="text-lg font-bold text-rose-900">Delete account and data</h2><p className="mt-2 text-sm leading-6 text-stone-700">This permanently deletes your account, resumes, interview questions and answers, evaluations, reports, consent history, and resume optimization records. This cannot be undone. Deletion applies to records in this application database; external provider retention is governed by that provider.</p><label className="mt-4 block text-sm font-semibold" htmlFor="delete-confirm">Type DELETE to confirm</label><input id="delete-confirm" autoComplete="off" className="mt-1 w-full max-w-xs rounded-lg border border-stone-300 px-3 py-2" onChange={(e) => setConfirmation(e.target.value)} value={confirmation} /><button className="mt-3 block rounded-lg bg-rose-800 px-4 py-2 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-700 disabled:cursor-not-allowed disabled:opacity-50" disabled={busy || confirmation !== "DELETE"} onClick={eraseAccount} type="button">Delete my account permanently</button></article>
  </section>;
}
