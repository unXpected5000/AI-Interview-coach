import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext.jsx";
import ProfileFields, { profilePayload, useProfileOptions } from "../components/auth/ProfileFields.jsx";
import PageHeader from "../components/ui/PageHeader.jsx";
import { getErrorMessage } from "../utils/errorMessage.js";

export default function CompleteProfilePage() {
  const navigate = useNavigate();
  const { user, updateProfile } = useAuth();
  const { options, error: optionsError } = useProfileOptions();
  const isStudent = user?.role === "student";
  const [profile, setProfile] = useState({ department: user?.department ?? "", year: user?.year ?? "", phone: user?.phone ?? "" });
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  if (user?.profile_complete) return <Navigate to="/dashboard" replace />;

  if (!isStudent) {
    return (
      <section className="rounded-lg border border-amber-300 bg-amber-50 p-6 text-sm text-amber-950">
        <h1 className="text-xl font-bold">Department assignment needed</h1>
        <p className="mt-2">Your HOD account has no department yet. An operator must assign one before department tools are available.</p>
      </section>
    );
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setIsSaving(true);
    try {
      await updateProfile(profilePayload(profile));
      navigate("/dashboard", { replace: true });
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Could not save your profile."));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="max-w-xl">
      <PageHeader eyebrow="One more step" title="Complete your student profile" description="Your department and year let your department's HOD see your practice progress. After this, only your HOD or an operator can change them." />
      <form className="space-y-4 rounded-lg border border-stone-200 bg-white p-6 shadow-sm" onSubmit={handleSubmit}>
        <ProfileFields
          lockDepartment={Boolean(user?.department)}
          onChange={setProfile}
          options={options}
          value={profile}
        />
        {optionsError ? <p className="text-sm text-amber-700">{optionsError}</p> : null}
        {error ? <p className="text-sm text-red-600" role="alert">{error}</p> : null}
        <button className="rounded-full bg-stone-950 px-5 py-2 text-sm font-bold text-white disabled:bg-stone-400" disabled={isSaving} type="submit">{isSaving ? "Saving..." : "Save and continue"}</button>
      </form>
    </div>
  );
}
