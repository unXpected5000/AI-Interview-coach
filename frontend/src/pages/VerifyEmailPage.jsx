import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { recordConsent } from "../api/accountApi.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { getErrorMessage } from "../utils/errorMessage.js";

const inputClass = "mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-gray-950 outline-none focus:border-gray-950";

export default function VerifyEmailPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { verifyEmail, resendVerification, hasRememberedPassword } = useAuth();
  const [email, setEmail] = useState(location.state?.email ?? "");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState(location.state?.notice ?? "");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const passwordRemembered = hasRememberedPassword(email);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      const user = await verifyEmail({ email, code: code.trim(), password });
      await recordConsent("terms_acknowledgement", "accepted").catch(() => {});
      navigate(user.profile_complete ? "/dashboard" : "/complete-profile", { replace: true });
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Verification failed. Check the code and try again."));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResend() {
    setError("");
    if (!email) {
      setError("Enter your email address first.");
      return;
    }
    try {
      const result = await resendVerification(email);
      setNotice(`${result.message} New codes can be requested about once a minute.`);
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Could not request a new code."));
    }
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-semibold text-gray-950">Verify your email</h1>
      <p className="mt-2 text-sm text-gray-600">Enter the 6-digit code from your inbox. Codes expire and can be tried a limited number of times.</p>
      {notice ? <p className="mt-4 rounded-md border border-teal-200 bg-teal-50 p-3 text-sm text-teal-900" role="status">{notice}</p> : null}
      <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Email</span>
          <input autoComplete="email" className={inputClass} onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Verification code</span>
          <input autoComplete="one-time-code" className={`${inputClass} tracking-[0.4em]`} inputMode="numeric" maxLength={6} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} pattern="\d{6}" required value={code} />
        </label>
        {passwordRemembered ? null : (
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Password</span>
            <input autoComplete="current-password" className={inputClass} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
            <span className="mt-1 block text-xs text-gray-500">The password you registered with. It confirms the code is being used by you.</span>
          </label>
        )}
        {error ? <p className="text-sm text-red-600" role="alert">{error}</p> : null}
        <button className="w-full rounded-md bg-gray-950 px-4 py-2 font-medium text-white disabled:cursor-not-allowed disabled:bg-gray-400" disabled={isSubmitting || code.length !== 6} type="submit">
          {isSubmitting ? "Verifying..." : "Verify and sign in"}
        </button>
      </form>
      <button className="mt-4 text-sm font-medium text-gray-950 underline" onClick={handleResend} type="button">Send a new code</button>
      <p className="mt-4 text-sm text-gray-600"><Link className="underline" to="/login">Back to sign in</Link></p>
    </section>
  );
}
