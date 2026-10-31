import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext.jsx";
import GoogleSignInButton from "../components/auth/GoogleSignInButton.jsx";
import { recordConsent } from "../api/accountApi.js";

export default function RegisterPage() {
  const navigate = useNavigate();
  const { register, loginWithGoogle } = useAuth();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);

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
      await register(form);
      await recordConsent("terms_acknowledgement", "accepted").catch(() => {});
      navigate("/dashboard", { replace: true });
    } catch (requestError) {
      setError(
        requestError.response?.data?.detail ?? "Registration failed. Try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleGoogleCredential(credential) {
    setError("");
    setIsSubmitting(true);
    try {
      await loginWithGoogle(credential);
      await recordConsent("terms_acknowledgement", "accepted").catch(() => {});
      navigate("/dashboard", { replace: true });
    } catch (requestError) {
      setError(requestError.response?.data?.detail ?? "Google sign-in failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-semibold text-gray-950">Register</h1>
      <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Name</span>
          <input
            required
            autoComplete="name"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-gray-950 outline-none focus:border-gray-950"
            minLength={2}
            name="name"
            type="text"
            value={form.name}
            onChange={updateField}
          />
        </label>

        <label className="flex items-start gap-2 text-xs leading-5 text-gray-700"><input checked={termsAccepted} className="mt-1" onChange={(event) => setTermsAccepted(event.target.checked)} type="checkbox" /><span>I agree to the <Link className="underline" to="/legal/terms">Terms of Service</Link> and acknowledge the <Link className="underline" to="/legal/privacy">Privacy Policy</Link>. No marketing consent is requested.</span></label>

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
            autoComplete="new-password"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-gray-950 outline-none focus:border-gray-950"
            minLength={8}
            name="password"
            type="password"
            value={form.password}
            onChange={updateField}
          />
        </label>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <button
          className="w-full rounded-md bg-gray-950 px-4 py-2 font-medium text-white disabled:cursor-not-allowed disabled:bg-gray-400"
          disabled={isSubmitting || !termsAccepted}
          type="submit"
        >
          {isSubmitting ? "Creating account..." : "Create account"}
        </button>
      </form>

      <div className="my-5 flex items-center gap-3 text-xs text-gray-500"><span className="h-px flex-1 bg-gray-200" />or continue with<span className="h-px flex-1 bg-gray-200" /></div>
      <GoogleSignInButton disabled={isSubmitting || !termsAccepted} onCredential={handleGoogleCredential} />

      <p className="mt-4 text-sm text-gray-600">
        Already have an account?{" "}
        <Link className="font-medium text-gray-950 underline" to="/login">
          Sign in
        </Link>
      </p>
    </section>
  );
}
