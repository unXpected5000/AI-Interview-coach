# Privacy, integrations and legal review notes

Repository inspection snapshot: 31 October 2026. This is an engineering inventory, not a compliance opinion.

## Observed data flows

| Feature | Current behavior | Persistence / external processor |
|---|---|---|
| Registration / Google sign-in | Name, email, password hash or Google subject ID | User record in MongoDB; Google verifies Google sign-in |
| Resume upload | PDF is parsed on the FastAPI server; extracted text, filename, skills and structured resume saved | Resume text and structure persist in MongoDB; the uploaded PDF bytes are not stored by the current resume model |
| Interview questions / optimizer / generated feedback | Backend uses configured Gemini or OpenAI LLM client for generation and feedback | Resume context, target role/job description, and/or submitted answers may be transmitted to whichever provider is configured; provider-specific retention/region settings require owner review |
| Answer scoring | Similarity and rubric metrics are computed by backend code; generated coaching feedback may use the configured LLM | Answers and derived evaluation/report are saved in MongoDB |
| Voice input | Browser SpeechRecognition where supported; local Transformers.js Whisper worker fallback; browser speech synthesis | Browser recognition service may receive audio depending on browser; local fallback processes temporary audio in browser memory, saves transcript only. No OpenAI Realtime integration exists in repository |
| Webcam | Optional browser preview and MediaPipe-derived framing/visibility metrics | Frames stay in browser; only derived metrics can be submitted and persisted |
| Storage | JWT access token, theme, cookie preference in browser localStorage | Access token is currently persistent browser storage; no app authentication cookie, analytics, ad pixel, email marketing or payment SDK found |
| ONNX runtime | Transformers.js uses package-version-matched ONNX WASM from jsDelivr per Vite setup | Browser downloads runtime assets from CDN; confirm CDN and model terms/region implications before public launch |

## Dependency and asset observations

- Frontend: React, Vite, Axios, Three.js, `@huggingface/transformers`, `@mediapipe/tasks-vision`, Heroicons.
- Backend: FastAPI, Motor/PyMongo, PyMuPDF, sentence-transformers, Google Auth, JWT/passlib, configured Gemini/OpenAI clients.
- Hosting/data: Cloudflare Pages/Pages Functions proxy, Render, MongoDB Atlas, subject to actual deployment account settings.
- No payments, analytics, advertising, marketing-email, or avatar-SaaS integration was found.
- This pass did not independently verify every transitive package license, the avatar asset provenance, model licenses, CDN terms, or provider data processing agreements. Treat those as open audit items.

## India legal research checkpoint

- The Digital Personal Data Protection Act, 2023 is the primary Indian digital personal data statute reviewed. Its own commencement provision permits staggered commencement. The Central Government's 13 November 2025 notification appoints commencement dates in tranches: some provisions at publication, specified provisions after one year, and most substantive data-processing provisions after eighteen months. As of this repository snapshot (31 October 2026), the one-year and eighteen-month dates have not yet arrived. Verify later notifications and rules before launch or processing. [Official Act text (MeitY)](https://www.meity.gov.in/static/uploads/2024/02/Digital-Personal-Data-Protection-Act-2023.pdf) · [Official commencement notification (Gazette via MeitY)](https://www.meity.gov.in/static/uploads/2025/11/c56ceae6c383460ca69577428d36828b.pdf) · [MeitY DPDP Rules 2025 page](https://www.meity.gov.in/documents/act-and-policies/digital-personal-data-protection-rules-2025-gDOxUjMtQWa?pageTitle=Digital-Personal-Data-Protection-Rules-2025-2).
- The Consumer Protection (E-Commerce) Rules, 2020 have broad stated coverage of digital/electronic network services and cross-border entities systematically offering services to consumers in India. Whether and how they apply to this operator/product requires legal advice based on operator status, users and operating model. [Official Department of Consumer Affairs rules](https://consumeraffairs.nic.in/sites/default/files/E%20commerce%20rules_0.pdf) · [Official India Code Act record](https://www.indiacode.nic.in/indiacode/handle/123456789/16103?view_type=browse).
- The operator's establishment, target markets, business model, age policy, applicable jurisdiction and responsible contact are unknown. No public legal page should be treated as final until those details and the currently operative regulations are reviewed by counsel.

## Owner / legal review needed

1. Supply the legal operator and product/brand name, registered/business address if applicable, support/privacy contact, establishment country, intended markets, governing law, and intended audience age policy.
2. Confirm the exact Gemini/OpenAI models, account/API terms, data-retention controls, processing regions, subprocessors, and whether the provider receives full resume text or only reduced context in production.
3. Decide a data-retention schedule and ensure Render, Atlas, Cloudflare logs/backups and provider retention align with it. Current application DB has no automatic expiry policy.
4. Review the privacy notice/terms, rights request process, children's data safeguards, consumer disclosures and deletion/processor propagation with qualified counsel.
5. Verify all direct/transitive dependency, icon, avatar, model and font licenses before public commercialization.
