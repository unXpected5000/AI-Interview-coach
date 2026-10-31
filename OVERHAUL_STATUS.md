# Product overhaul implementation status

Repository snapshot: 31 October 2026. These statuses describe this code change only. A page, checkbox, or draft is not a claim of legal compliance.

Status key: **Implemented**, **Partially implemented**, **Requires owner input**, **Requires legal review**, **Blocked**, **Not applicable**.

## Privacy, security, legal and trust (1–25)

| # | Status | Evidence / remaining work |
|---:|---|---|
| 1 | Partially implemented | Privacy draft describes observed storage/providers; owner contact, jurisdiction, processor terms and final review missing. |
| 2 | Partially implemented | Terms draft covers education-only limits, user content, acceptable use, availability and payments; owner identity/jurisdiction and counsel review missing. |
| 3 | Not applicable | No payment/checkout/subscription code was found; refund page says no purchases/refunds. |
| 4 | Partially implemented | Cookie/storage draft reflects localStorage and no app cookie/analytics; hosting-provider behavior needs confirmation. |
| 5 | Partially implemented | Accept/reject/customize preferences persist locally; currently no optional tracker is installed. Server consent history is best-effort when authenticated. |
| 6 | Partially implemented | AI, optimizer and voice disclosures are visible and gate those features; a full audit of every personal-data form and a saved acknowledgement on all paths remain. |
| 7 | Partially implemented | Raw camera/video and raw upload bytes are not persisted; extracted resume text and transcripts remain in MongoDB with no expiry schedule. |
| 8 | Partially implemented | Integration inventory is in `PRIVACY_AUDIT.md`; transitive package, provider DPA, CDN/model and license verification remains. |
| 9 | Partially implemented | No payment/cancellation/marketing dark patterns found in inspected flows; no exhaustive product audit. |
| 10 | Partially implemented | Current code has no purchase flow; no independent public pricing page or usage-cost display. |
| 11 | Partially implemented | No testimonials/logos were found in reviewed app UI; marketing surface not exhaustively audited. |
| 12 | Partially implemented | Specific privacy/readiness/voice claims corrected in touched copy; all marketing copy needs owner review. |
| 13 | Partially implemented | Improved names/labels/focus in touched controls; full alt-text and screen-reader audit remains. |
| 14 | Partially implemented | Dark palette and focus tokens improved; no complete WCAG contrast measurement performed. |
| 15 | Partially implemented | Key controls use labels/keyboard buttons/focus outlines; keyboard-only workflows and dialog focus management remain unverified. |
| 16 | Requires owner input | Operator name, address, support/privacy email, registration and jurisdiction are intentionally not invented. |
| 17 | Requires owner input; Requires legal review | No date of birth is collected; age threshold/parental consent policy is unconfigured and must be decided before launch. |
| 18 | Not applicable | No marketing email or unsubscribe workflow exists in repository. |
| 19 | Partially implemented | Main dependencies and external assets are inventoried; every transitive/font/avatar/model license still needs verification. |
| 20 | Partially implemented | Authenticated permanent account deletion and dependent record cleanup added; provider propagation, retention exceptions, status receipt, retry queue and deletion audit are absent. |
| 21 | Partially implemented | Authenticated user-scoped JSON export includes app records and browser preferences; no CSV/account bundle PDF, pagination or large-export streaming. |
| 22 | Partially implemented | JWT access token expires (default 60 minutes) and logout clears local storage; no device/session listing, revocation endpoint, refresh rotation or server-side logout invalidation. |
| 23 | Partially implemented | Contextual AI/resume/voice disclosures added; disclosure behavior and provider naming must track production configuration and browser-specific STT behavior. |
| 24 | Partially implemented | Authenticated consent events/preferences stored with timestamps and bounded history; local unauthenticated preference changes may not sync server-side. |
| 25 | Partially implemented | Individual interview/report deletion added; no configurable retention window or scheduled server-side expiration. |

## Design system and anti-template work (26–45)

| # | Status | Evidence / remaining work |
|---:|---|---|
| 26 | Partially implemented | Existing restrained stone/teal palette retained; no comprehensive brand redesign. |
| 27 | Partially implemented | No new gradient hero treatment; existing site surfaces not exhaustively reviewed. |
| 28 | Partially implemented | No emoji heading patterns were added; all copy still needs review. |
| 29 | Partially implemented | System-first font guidance documented; current CSS still names Inter as a fallback. |
| 30 | Partially implemented | No broad card-layout migration completed. |
| 31 | Partially implemented | No new glass effects added; existing UI still contains some translucent overlays. |
| 32 | Partially implemented | Dark tokens changed from pure black to charcoal; extensive hard-coded classes remain. |
| 33 | Partially implemented | No general feature-layout redesign completed. |
| 34 | Partially implemented | No exhaustive badge/headline review. |
| 35 | Partially implemented | No wholesale icon audit; labels retained for key actions. |
| 36 | Partially implemented | No shadcn/ui dependency found in package manifest; shared-system adoption is documented, not completed. |
| 37 | Partially implemented | Reduced-motion rules exist; existing entrance animations remain. |
| 38 | Implemented | No cursor-following beam/pointer spotlight found in reviewed source. |
| 39 | Partially implemented | Loading/disabled/focus states improved in touched controls; no every-button audit. |
| 40 | Partially implemented | Design tokens/spacing notes documented; Tailwind spacing is not yet centralized across every component. |
| 41 | Partially implemented | No full-copy sweep for punctuation patterns. |
| 42 | Partially implemented | Touched copy uses qualified product claims; full marketing copy audit remains. |
| 43 | Partially implemented | No broad typography audit completed. |
| 44 | Partially implemented | Existing font stack documented; full typography system not implemented. |
| 45 | Implemented | No grain overlay pattern was found in reviewed frontend source. |

## Adaptive difficulty system (46–56)

| # | Status | Evidence / remaining work |
|---:|---|---|
| 46 | Partially implemented | LOW/MEDIUM/HARD and INTERVIEW READY selectors; ready mode uses mixed levels, but training behavior needs broader validation. |
| 47 | Partially implemented | Setup selector and question-level difficulty labels; persistent mode/progression indicators during live call are limited. |
| 48 | Implemented | Server-side rolling three-evaluation window; one-level changes at configurable-in-code 80/55 thresholds; skips/failed evaluations excluded; transition reasons persisted. Thresholds are coaching heuristics, not validated predictors. |
| 49 | Partially implemented | Fixed/adaptive selector works; manual increase/decrease/keep controls are not implemented. |
| 50 | Partially implemented | Difficulty is passed into question planning/prompt; deterministic fallback changes difficulty; AI output and role-specific quality need integration tests. |
| 51 | Partially implemented | Expected points and question difficulty are retained; evaluation weights are not yet calibrated by difficulty. |
| 52 | Partially implemented | Additive interview metadata persists initial/current/mode/history and per-question difficulty; no explicit migration script needed for optional fields. |
| 53 | Partially implemented | Dashboard shows per-level question counts, attempts and averages; no full progression-over-time visualization. |
| 54 | Partially implemented | Report contains configuration, progression, score/count breakdown, highest/strongest/lowest observed level and next practice recommendation; no validated benchmark or causal claims. |
| 55 | Partially implemented | Existing question evaluation reports status, score and evidence; report UI needs complete readability/coverage audit. |
| 56 | Partially implemented | Canonical readiness recomputed and weak evidence at LOW caps strongest category; completion/reliability separate. Legacy reports are refreshed when readiness text is stale. |

## API and schema changes

- `POST /api/interviews/start` accepts validated `difficulty` and `difficulty_mode` fields.
- Interview documents now optionally contain `difficulty.initial`, `difficulty.current`, `difficulty.mode`, and `difficulty.history`; existing documents retain backward-compatible defaults.
- `DELETE /api/interviews/{id}` deletes that user's interview, answers, scores and report.
- Authenticated `GET /api/account/export`, `DELETE /api/account`, `GET /api/account/consent`, and `PUT /api/account/consent` added.
- No destructive migration or external schema migration was run.

## Ten future improvements (not implemented)

| Priority | Improvement / problem solved | Complexity / dependencies | Cost estimate and free alternative |
|---|---|---|---|
| Critical | Server-side revocable sessions and device list; stolen JWT currently lives until expiry | High; session collection, token rotation, auth migration | No new vendor cost; local MongoDB session records |
| Critical | Retention schedule and queued deletion verification across database/backups/providers | High; background job and provider procedures | No new API spend; scheduled free worker with provider-specific limits |
| High | Full rights-request and processor deletion workflow | High; owner contacts, provider APIs, legal review | Provider-specific; manual verified process is free but slower |
| High | WCAG 2.2 AA audit and keyboard/screen-reader regression suite | Medium; accessibility tooling and browser QA | Free axe/Playwright tooling; manual assistive-tech checks |
| High | Difficulty-specific scoring rubrics validated with representative answer sets | High; evaluator changes and quality dataset | Existing provider may incur usage-based cost; deterministic rubric fixtures are free |
| High | Broader domain/role question bank with difficulty coverage | Medium-high; reviewed question set and topic metadata | Curated local question bank is free; model generation remains current usage-based provider cost |
| Medium | Full token migration and visual regression tests for light/dark/mobile | Medium; component refactor and screenshot runner | Free local tooling; no design SaaS required |
| Medium | Voice health telemetry and user-controlled language/device diagnostics | Medium; browser test matrix and privacy review | Free browser APIs; text entry remains zero-cost fallback |
| Medium | Long-term personal learning path based on weak topics and difficulty evidence | Medium; local aggregation and UI | Deterministic database queries, no new AI calls needed |
| Low | CSV export and export manifest/versioning | Low-medium; schema versioning and streaming | Local code only, no added service cost |

No paid integration, subscription, asset or external account was activated as part of this change.
