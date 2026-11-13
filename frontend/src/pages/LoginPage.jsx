import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext.jsx";
import { clearSessionMessage, peekSessionMessage } from "../auth/session.js";
import GoogleSignInButton from "../components/auth/GoogleSignInButton.jsx";
import { getErrorCode, getErrorMessage } from "../utils/errorMessage.js";

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, loginWithGoogle } = useAuth();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  // Shown once after the API client signed the user out on a 401.
  const [notice] = useState(() => peekSessionMessage());
  useEffect(() => { clearSessionMessage(); }, []);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const destination = location.state?.from?.pathname ?? "/dashboard";

  function updateField(event) {
    setForm((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      await login(form);
      navigate(destination, { replace: true });
    } catch (requestError) {
      if (getErrorCode(requestError) === "email_verification_required") {
        navigate("/verify-email", { state: { email: form.email, notice: getErrorMessage(requestError) } });
        return;
      }
      setError(getErrorMessage(requestError, "Login failed. Check your credentials."));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleGoogleCredential(credential) {
    setError("");
    setIsSubmitting(true);
    try {
      await loginWithGoogle(credential);
      navigate(destination, { replace: true });
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Google sign-in failed. Please try again."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-semibold text-gray-950">Login</h1>
      {notice ? <p className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" role="status">{notice}</p> : null}
      <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Email</span>
          <input
            required
            autoComplete="email"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-gray-950 outline-none focus:border-gray-950"
            name="email"
            type="email"
            value={form.email}
            onChange={updateField}
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">Password</span>
          <input
            required
            autoComplete="current-password"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-gray-950 outline-none focus:border-gray-950"
            name="password"
            type="password"
            value={form.password}
            onChange={updateField}
          />
        </label>

        {error ? <p className="text-sm text-red-600" role="alert">{error}</p> : null}

        <button
          className="w-full rounded-md bg-gray-950 px-4 py-2 font-medium text-white disabled:cursor-not-allowed disabled:bg-gray-400"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? "Signing in..." : "Sign in"}
        </button>
      </form>

      <div className="my-5 flex items-center gap-3 text-xs text-gray-500"><span className="h-px flex-1 bg-gray-200" />or continue with<span className="h-px flex-1 bg-gray-200" /></div>
      <GoogleSignInButton disabled={isSubmitting} onCredential={handleGoogleCredential} />

      <p className="mt-4 text-sm text-gray-600">
        Need an account?{" "}
        <Link className="font-medium text-gray-950 underline" to="/register">
          Register
        </Link>
        {" · "}
        <Link className="font-medium text-gray-950 underline" to="/verify-email">
          Enter a verification code
        </Link>
      </p>
    </section>
  );
}
