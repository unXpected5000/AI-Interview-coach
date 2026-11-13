import { Link } from "react-router-dom";

export const OPEN_COOKIE_SETTINGS_EVENT = "ai-interview-coach:open-cookie-settings";

export default function LegalFooter({ className = "" }) {
  return (
    <footer className={`flex flex-wrap gap-x-5 gap-y-2 text-xs text-stone-600 ${className}`}>
      <Link className="underline" to="/legal/privacy">Privacy</Link>
      <Link className="underline" to="/legal/terms">Terms</Link>
      <Link className="underline" to="/legal/cookies">Cookies &amp; storage</Link>
      <Link className="underline" to="/legal/refund">Refunds</Link>
      <button className="underline" onClick={() => window.dispatchEvent(new Event(OPEN_COOKIE_SETTINGS_EVENT))} type="button">
        Cookie settings
      </button>
    </footer>
  );
}
