import { LEGAL_EFFECTIVE_DATE, legalConfig, legalValue } from "./legalConfig.js";

// Policies describe what this codebase actually does. Keep them in sync with
// the app when data handling changes, and have them reviewed before launch.

export function buildLegalPages(config = legalConfig) {
  const v = (key) => legalValue(key, config);
  const name = config.serviceName;
  const operator = v("operatorName");
  const contact = v("contactEmail");
  const minimumAge = config.minimumAge || null;

  const privacy = {
    title: "Privacy Policy",
    summary: `How ${name} collects, uses, shares, and protects personal data, and the choices you have.`,
    sections: [
      {
        id: "who-we-are",
        heading: "1. Who we are",
        paragraphs: [
          `${name} ("the service", "we") is operated by ${operator}${config.institution ? ` for ${config.institution}` : ""}. The operator is the controller of personal data processed through the service.`,
          `Contact for privacy questions and requests: ${contact}. Postal address: ${v("postalAddress")}.`,
        ],
      },
      {
        id: "data-we-collect",
        heading: "2. Data we collect",
        list: [
          "Account details: name, email address, password (stored only as a one-way bcrypt hash), role, department, year of study, optional phone number, and whether your email is verified.",
          "Email verification: a one-time 6-digit code sent to your address. Only a keyed hash of the code, its expiry, attempt count, and send times are stored, and they are deleted once the code is used.",
          "Google sign-in (if used): your Google account identifier, verified email address, and name, as confirmed by Google.",
          "Resumes: the text extracted from PDFs you upload and the structured details and skills derived from it. The original PDF file is not stored.",
          "Interview practice: generated questions, your typed or transcribed answers, scores, feedback, reports, chosen difficulty, and timing information.",
          "Voice (optional): only the text transcript of your answers and timing metadata are sent to the server. Audio recordings are not uploaded or stored by the service.",
          "Camera (optional, with separate consent): if you choose to save measurements, derived numbers such as face-detection coverage, framing, approximate head orientation and movement, an estimated gaze direction, an upright-shoulders estimate, and a coarse timeline. Video and images are never uploaded or stored.",
          "Consent records: your choices for AI processing, microphone and camera processing, terms acknowledgement, and cookie/storage preferences, with timestamps.",
          "Technical data: hosting providers process IP addresses and request logs to deliver the service. Temporary rate-limit counters are kept in server memory and are not written to the database.",
        ],
      },
      {
        id: "how-we-use",
        heading: "3. How we use data and why",
        list: [
          "To create and secure your account, verify your email, and sign you in (performance of our agreement with you; security).",
          "To generate interview questions from your resume, evaluate answers, and produce coaching reports (performance of the service you request).",
          "To let your department's HOD see your profile and summary practice progress, and to let operators administer accounts (the educational purpose the service is provided for, or your institution's legitimate interest).",
          "To prevent abuse, such as rate limiting sign-in and expensive features (legitimate interest in keeping the service secure and available).",
          "Optional AI, microphone, and camera processing happen only after you enable them; you can withdraw at any time (consent).",
        ],
        paragraphs: [
          "We do not sell personal data, use it for advertising, or make automated decisions with legal or similarly significant effects. Scores are coaching feedback, not hiring decisions.",
        ],
      },
      {
        id: "who-can-see",
        heading: "4. Who can see your data",
        list: [
          "You: everything stored about your account, through the app and the data export.",
          "Your department HOD: your name, email, phone, department, year, interview counts, dates, difficulty, and summary scores. HODs cannot see your resumes, answers, transcripts, or detailed feedback, and cannot change scores.",
          "Operators: account and profile details across departments for administration, plus the same summary progress view.",
        ],
      },
      {
        id: "processors",
        heading: "5. Service providers and third parties",
        paragraphs: ["We use providers that process data on our behalf or that your browser contacts directly. Which ones are active depends on how the service is configured:"],
        list: [
          "Hosting and database: the API host (for example Render), the web host and proxy (for example Cloudflare Pages), and the MongoDB database provider (for example MongoDB Atlas).",
          "Email delivery: the SMTP provider configured by the operator, which receives your email address and the verification message.",
          "Google Identity Services: when you choose Google sign-in.",
          "AI model provider (Google Gemini or OpenAI, if configured): receives resume context to generate questions, and answers with evaluation context to write feedback. Answers are not sent to any embedding service; scoring runs on our server.",
          "Speech recognition: in Auto mode your browser's speech recognition may send microphone audio to the browser vendor; if it fails, or if you choose on-device mode, transcription runs on your device (Moonshine model) and audio never leaves it.",
          "Interviewer voice: the natural voice (Kokoro model) is generated on your device; questions are not sent to a speech service. The browser voice option uses your browser's built-in voices.",
          "Model downloads: the on-device speech, voice, and camera models are downloaded from public model hosts (Hugging Face, Google model storage, and jsDelivr for some runtime files). These hosts see your IP address, but not your answers, audio, or video.",
        ],
      },
      {
        id: "transfers",
        heading: "6. International transfers",
        paragraphs: [
          "Providers may process data in countries other than yours. Where required, we rely on the providers' contractual safeguards (such as standard contractual clauses).",
        ],
      },
      {
        id: "retention",
        heading: "7. How long we keep data",
        list: [
          "Account, resume, interview, and report data: until you delete it or delete your account.",
          "Verification codes: until used or expired (15 minutes by default); the hash is then removed.",
          "Consent history: the most recent 100 entries per account.",
          "Hosting logs and backups: according to each provider's retention, after which deleted data ages out.",
        ],
        paragraphs: ["There is currently no automatic expiry for inactive accounts; delete data you no longer need from the app."],
      },
      {
        id: "your-rights",
        heading: "8. Your rights and choices",
        list: [
          "Access and portability: download your data from Account & data (JSON export).",
          "Correction: edit your name and phone; your HOD or an operator can correct department and year.",
          "Deletion: delete a resume, an interview, or your whole account at any time from the app.",
          "Withdraw consent: turn off AI-dependent features, voice processing, or the camera, and change cookie settings from the footer.",
          `Objection, restriction, and complaints: contact ${contact}. You may also complain to your local data protection authority.`,
        ],
        paragraphs: ["We respond to verified requests within the time required by applicable law (typically one month)."],
      },
      {
        id: "security",
        heading: "9. Security",
        paragraphs: [
          "We use HTTPS, hashed passwords and verification codes, signed short-lived access tokens, per-account access checks on every request, role-based authorization, and rate limiting. No system is perfectly secure; tell us promptly if you suspect unauthorized access to your account.",
        ],
      },
      {
        id: "children",
        heading: "10. Children",
        paragraphs: [
          minimumAge
            ? `The service is not intended for anyone under ${minimumAge}. If you believe a child under this age has provided personal data, contact ${contact} so we can delete it.`
            : `Minimum age: ${v("minimumAge")}. Until the operator sets an age policy, the service must not be offered to children who need parental consent under local law.`,
        ],
      },
      {
        id: "changes",
        heading: "11. Changes to this policy",
        paragraphs: [
          "We will post changes here and update the effective date. Material changes will be announced in the app before they take effect.",
        ],
      },
    ],
  };

  const terms = {
    title: "Terms of Service",
    summary: `The rules for using ${name}. By creating an account or using the service you agree to these terms.`,
    sections: [
      {
        id: "agreement",
        heading: "1. Agreement",
        paragraphs: [
          `These terms are an agreement between you and ${operator} ("we"). If you use the service on behalf of an institution, you confirm you are authorized to do so. If you do not agree, do not use the service.`,
        ],
      },
      {
        id: "eligibility",
        heading: "2. Eligibility and accounts",
        list: [
          minimumAge ? `You must be at least ${minimumAge} years old.` : `Minimum age: ${v("minimumAge")}.`,
          "Provide accurate details, including your department and year if you are a student, and keep your password confidential.",
          "Each account is for one person. You are responsible for activity under your account; tell us promptly about unauthorized use.",
          "Password accounts must verify their email address before signing in.",
        ],
      },
      {
        id: "roles",
        heading: "3. Roles",
        paragraphs: [
          "Accounts are students by default. Operators may assign HOD (department faculty) or operator roles. HODs may view summary progress and update profile details for students in their department, and must use that access only for legitimate educational purposes and keep it confidential. Do not attempt to obtain a role you were not given.",
        ],
      },
      {
        id: "acceptable-use",
        heading: "4. Acceptable use",
        paragraphs: ["You agree not to:"],
        list: [
          "access another person's account or data, or try to bypass authorization, rate limits, or security controls;",
          "upload content you have no right to use, or content that is unlawful, harmful, or infringes others' rights;",
          "use automated tools to overload the service, scrape it, or generate excessive AI requests;",
          "reverse engineer or interfere with the service, except where the law allows;",
          "misrepresent practice scores as an official assessment or certification.",
        ],
      },
      {
        id: "content",
        heading: "5. Your content",
        paragraphs: [
          "You keep ownership of resumes, answers, and other content you submit. You grant us a limited license to store, process, and display that content only to provide the service to you and, within the limits described in the Privacy Policy, to your HOD and operators.",
        ],
      },
      {
        id: "ai-output",
        heading: "6. AI-generated output and scores",
        list: [
          "Questions, feedback, scores, readiness categories, and resume suggestions are automated coaching aids. They can be incomplete or wrong.",
          "Answer scoring compares wording with reference points; correct answers phrased differently may score lower.",
          "Camera and voice measurements are rough estimates and do not measure confidence, honesty, emotion, or ability.",
          "Nothing in the service is a hiring decision, prediction, or guarantee of employment. Review suggestions before relying on them.",
        ],
      },
      {
        id: "availability",
        heading: "7. Availability and changes",
        paragraphs: [
          "The service runs on third-party hosting that may sleep, restart, or be unavailable, and features may change. We do not guarantee uninterrupted availability. Keep your own copies of anything important; you can export your data at any time.",
        ],
      },
      {
        id: "fees",
        heading: "8. Fees",
        paragraphs: ["The service is currently free. If paid features are introduced, prices and terms will be shown before you are charged."],
      },
      {
        id: "termination",
        heading: "9. Suspension and termination",
        paragraphs: [
          "You may stop using the service and delete your account at any time. We may suspend or close accounts that breach these terms or put the service or other users at risk, and will give notice where reasonable.",
        ],
      },
      {
        id: "disclaimers",
        heading: "10. Disclaimers and limitation of liability",
        paragraphs: [
          "To the extent the law allows, the service is provided \"as is\" without warranties of any kind, and we are not liable for indirect or consequential losses, lost opportunities, or decisions made based on practice results. Nothing in these terms limits liability that cannot be limited by law, or your statutory rights as a consumer.",
        ],
      },
      {
        id: "law",
        heading: "11. Governing law and disputes",
        paragraphs: [`These terms are governed by the laws of ${v("governingLaw")}, without prejudice to mandatory consumer protections where you live.`],
      },
      {
        id: "contact-terms",
        heading: "12. Changes and contact",
        paragraphs: [`We may update these terms and will post the new effective date here. Questions: ${contact}.`],
      },
    ],
  };

  const cookies = {
    title: "Cookies and Storage Policy",
    summary: "What the app stores in your browser and why.",
    sections: [
      {
        id: "cookies",
        heading: "Cookies",
        paragraphs: [
          "The app does not set authentication, analytics, or advertising cookies. Hosting infrastructure and Google sign-in may set their own cookies under their policies.",
        ],
      },
      {
        id: "storage",
        heading: "Browser storage",
        list: [
          "Local storage: your sign-in token, theme preference (light, dark, or automatic), and cookie/storage choices. These persist until you sign out or clear site data.",
          "Session storage: a one-time \"session expired\" notice shown on the sign-in page.",
          "Browser cache: downloaded speech and camera model files, so they do not download again.",
        ],
      },
      {
        id: "optional",
        heading: "Optional categories",
        paragraphs: [
          "No optional analytics or marketing scripts are installed, so choosing \"Accept all\" does not enable any tracker. If optional tools are added later, they will stay off until you consent. Change your choice any time with \"Cookie settings\" in the footer.",
        ],
      },
    ],
  };

  const refund = {
    title: "Refund Policy",
    summary: "Purchases and refunds.",
    sections: [
      {
        id: "no-purchases",
        heading: "No purchases",
        paragraphs: [
          `The service has no payment, checkout, or subscription feature, so no refunds apply. If paid features are added, this page will explain refund terms before any purchase. Questions: ${contact}.`,
        ],
      },
    ],
  };

  return { privacy, terms, cookies, refund, effectiveDate: LEGAL_EFFECTIVE_DATE };
}
