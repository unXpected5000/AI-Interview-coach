import { Link, useParams } from "react-router-dom";

const pages = {
  privacy: {
    title: "Privacy Policy",
    sections: [
      ["Data this app handles", "Account name and email; uploaded PDF resume text and extracted profile details; interview setup, generated questions, typed or transcribed answers, scores and reports; and optional derived local webcam metrics. The resume model stores extracted text and metadata, not the original PDF bytes. Raw webcam footage is not stored by the app."],
      ["Processing and providers", "Google verifies identity when Google sign-in is used. The configured language model provider (Gemini or OpenAI, according to backend configuration) may receive resume context for question generation and resume optimization, and answers/evaluation context for generated feedback. Browser SpeechRecognition may transmit microphone audio to its vendor, depending on browser support and configuration. The app also has a local Transformers.js Whisper fallback: its temporary recording is held in browser memory, transcribed locally, and only the transcript is submitted. Speech synthesis uses browser-installed voices. This repository does not implement an OpenAI Realtime audio session. Webcam frames are analyzed locally and are not uploaded by the app."],
      ["Storage and retention", "Account and resume text, interview records, answers, evaluations, reports, consent history and optimization results are stored in MongoDB. There is no automatic retention/expiry schedule. Users can delete an individual resume and its dependents, delete an interview and its report, or permanently delete the account. Access tokens, theme, and cookie preferences are in browser local storage. The app does not set an authentication cookie."],
      ["Purpose and sharing", "Data is used to provide authentication, resume tools, interview practice and requested AI feedback. Relevant content is sent to configured providers when a related feature needs it. No analytics or advertising SDK is currently installed. Do not submit information you are not authorized to share."],
      ["Choices, age and contact", "Text answers work without microphone access; webcam access is separate and optional. The app does not collect date of birth and the operator has not configured a minimum age eligibility rule or parental consent flow. The owner must settle age eligibility before public launch. Operator and privacy contact details are not configured; owner input is required."],
      ["Security and legal status", "The app uses authenticated API routes and user-scoped database queries, but no security measure is absolute. This page describes observed code paths and is not a claim of legal compliance. The owner must confirm deployment providers, retention settings, contact information, affected jurisdictions and applicable legal duties."],
    ],
  },
  terms: {
    title: "Terms of Service",
    sections: [
      ["Purpose and limits", "AI Interview Coach is an interview preparation and educational tool. Scores and feedback are coaching signals, may be incomplete or incorrect, and are not hiring decisions or predictions of employment outcomes. No interview or job result is guaranteed."],
      ["Accounts and acceptable use", "Keep sign-in credentials secure and use the service lawfully. Do not upload content you do not have permission to use, attempt to access another account's data, disrupt the service, or use it to violate applicable law. Age eligibility has not yet been set by the operator."],
      ["Your content and generated output", "You retain rights in content you provide, subject to rights needed to operate features you request. AI-generated questions, analysis and suggestions may be inaccurate and should be reviewed before use."],
      ["Availability and third parties", "The service depends on hosting, database, authentication, browser and AI providers and may be unavailable or change. Their services are governed by their own terms and privacy practices."],
      ["Payments, termination and contact", "The current application contains no payment or subscription flow; purchases and refunds are not currently offered. The owner may restrict access for abuse or security reasons. Legal operator identity, governing jurisdiction, address, and contact email are not configured and require owner input and legal review."],
    ],
  },
  refund: { title: "Refund Policy", sections: [["No current purchases", "The current application has no payment, checkout, or subscription feature. Purchases and refunds are therefore not currently offered. If paid features are added, terms will be published before payment is accepted."]] },
  cookies: {
    title: "Cookie and Storage Policy",
    sections: [
      ["Cookies", "The current application does not set authentication cookies and does not include analytics or advertising trackers. Hosting infrastructure and Google sign-in may apply their own browser storage or cookies under their own policies."],
      ["Browser storage", "The app stores its bearer access token, theme preference and cookie preference in local storage. Local storage is not a cookie, but persists in this browser until cleared. Clearing it may sign you out or reset preferences."],
      ["Optional technologies", "No optional analytics or advertising scripts are currently configured, so accepting optional categories does not enable a tracker. If optional categories are added later, those scripts must remain disabled until valid consent is recorded."],
    ],
  },
};

export default function LegalPage() {
  const { kind = "privacy" } = useParams();
  const page = pages[kind] ?? pages.privacy;
  return (
    <main className="min-h-screen bg-[var(--app-background)] px-5 py-10 text-[var(--text-primary)]">
      <article className="mx-auto max-w-3xl">
        <Link className="text-sm font-semibold text-teal-800 underline focus-visible:outline" to="/login">Back to sign in</Link>
        <h1 className="mt-6 text-3xl font-bold">{page.title}</h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">Application behavior summary · reviewed October 2026 · not legal advice</p>
        {page.sections.map(([heading, body]) => <section className="mt-7" key={heading}><h2 className="text-lg font-bold">{heading}</h2><p className="mt-2 leading-7 text-[var(--text-secondary)]">{body}</p></section>)}
        <p className="mt-8 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950">Owner input required: provide the legal operator and brand name, service and privacy contact, business location/jurisdiction, intended age policy, and verified hosting/AI provider configuration before treating these drafts as final public legal terms.</p>
      </article>
    </main>
  );
}
