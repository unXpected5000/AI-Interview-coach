# AI Interview Coach

A full-stack interview practice application. Candidates manage and build resumes, get role-relevant questions, practice by typing or speaking, use a call-style spoken interview room, receive question-level coaching and a final report, and export session results.

## Project layout

- `backend/`: FastAPI application, MongoDB repositories, resume parsing, question generation/adaptation, answer evaluation, coaching reports, and export endpoints.
- `frontend/`: React + Vite application, webcam capture, browser speech recognition with a local Whisper fallback, interview flow, results, and resume management.

## Workflow

1. Register or sign in.
2. In Resume Studio, upload and manage a PDF, optimize it for a target role, or use the built-in Classic, Modern, and Compact resume layouts.
3. Start an interview. The backend creates ten resume/skill-based questions. Choose LOW, MEDIUM, HARD, or INTERVIEW READY difficulty and fixed or adaptive behavior, then choose question-by-question practice or the call-style live room.
4. In the live room, browser text-to-speech reads each question. Browser speech recognition supplies the lowest-latency transcript when available; if it disconnects or is unsupported, an in-browser Whisper model shows a rolling transcript preview and rechecks the complete answer when submitted. Typed mode is always available. A procedural Three.js interviewer responds to idle, listening, thinking, speaking, interruption, and disconnected states. Webcam access starts only after the candidate enables it, and approximate face tracking runs locally.
5. The server derives filler and word counts from the transcript, computes speech timing from browser timing metadata, and may add a follow-up (up to three per interview). Adaptive difficulty uses the last three evaluated answers and moves only one level at a time; skips and evaluation failures do not trigger a change. The 80/55 cutoffs are coaching heuristics, not validated ability measures.
6. Complete or end a session to save coaching scores and a report. Export a completed report as PDF, or export session JSON/transcript. Delete a resume to remove its optimization history, interviews, answers, and scores.

## Report scoring and themes

Readiness is a coaching category, not a hiring prediction. Defaults are 0–19 needs substantial practice, 20–39 developing, 40–59 moderate readiness, 60–79 good progress, and 80–100 strong interview readiness. A high score based only on LOW/easy questions is capped at “Good progress”; performance at a lower difficulty is not evidence of readiness for harder interviews. Set `READINESS_DEVELOPING_THRESHOLD`, `READINESS_MODERATE_THRESHOLD`, `READINESS_GOOD_PROGRESS_THRESHOLD`, and `READINESS_STRONG_THRESHOLD` in `backend/.env` to change score boundaries; values must be strictly increasing. Unanswered and skipped questions contribute zero, while failed evaluations are excluded from the score denominator and identified separately. Low completion is shown as a limited-sample assessment.

The live webcam panel can be dragged with its header and resized from its corner; its position is constrained above the question panel. The light/dark theme toggle applies across the application while preserving accent colors.

## Speech recognition and privacy

The browser's SpeechRecognition service may send microphone audio to the browser's recognition provider. The Whisper fallback runs in a web worker on the candidate's device and keeps its backup audio in memory only; it does not upload or persist the recording. Only the transcript is submitted to this application. The fallback currently recognizes English and downloads the quantized model (about 45 MB) from the public Hugging Face model repository on first use; the browser caches it for later sessions. A live fallback preview runs on short overlapping windows, then the complete recording is transcribed once more when the answer is finished. If model download or local inference fails, typed answers remain available.

## Requirements

- Python 3.11+
- Node.js and npm
- MongoDB (local or hosted)
- Optional LLM provider credentials for generated questions, adaptations, and coaching. Fallback behavior is used when the provider is unavailable.

## Configuration

Copy `backend/.env.example` to `backend/.env` and set the MongoDB URI and any desired LLM credentials. To enable Google sign-in, create a Google OAuth Web application client, set its ID as `GOOGLE_CLIENT_ID` in `backend/.env` and `VITE_GOOGLE_CLIENT_ID` in `frontend/.env` (copy `frontend/.env.example`). Register every exact frontend origin in Google Cloud Console under **Authorized JavaScript origins**. For this deployment include `https://ai-interview-coach-3bj.pages.dev` with no path and no trailing slash, as well as local origins `http://localhost:5173` and `http://127.0.0.1:5173`. Also ensure the same client ID is configured in Cloudflare Pages and Render. The client ID is public; never put a client secret in the frontend. Keep other secrets out of source control. The frontend defaults to `http://localhost:8000/api`; set `VITE_API_BASE_URL` if your backend uses another address.

## Run locally

From the project folder, run `run_project.bat` for the one-step launcher, or use two terminals:

```powershell
cd backend
.venv\Scripts\activate
python -m uvicorn app.main:app --reload
```

```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. The API documentation is at `http://127.0.0.1:8000/docs`.

## Checks

Run `check_project.bat` for the project checks. Individual commands:

```powershell
cd backend
.venv\Scripts\python.exe -m pytest
```

```powershell
cd frontend
npm test
npm run lint
npm run build
```

Tests use local/fake dependencies where possible and do not require a live MongoDB or LLM service.

## Main API areas

- `/api/auth`: registration and authentication
- `/api/auth/google`: Google Identity Services credential verification and app-session creation
- `/api/resumes`: upload, list, view, role recommendations, and owner-scoped delete
- `/api/interviews`: start, answer, complete, and list sessions
- `/api/interviews/{id}`: owner-scoped session read and permanent session/report deletion
- `/api/interviews/{id}/export/{pdf|json|transcript}`: owner-scoped downloads
- `/api/account/export`, `/api/account/consent`: authenticated data export and consent history
- `DELETE /api/account`: permanent account and dependent-record deletion

## Notes and limitations

Speech timing is estimated from browser recognition timestamps; it is not a full acoustic analysis. On-device speech recognition depends on browser and language-pack support; otherwise recognition may use the browser's online service. The live room currently uses browser TTS/STT and is not connected to a realtime voice API. Realtime voice can use a billable API and is not enabled in this project. Camera frames are processed locally, and camera values are approximate framing signals only; they do not measure confidence, emotion, or interview quality. The procedural 3D model uses state-driven mouth motion tied to TTS playback; it is not phoneme-accurate lip synchronization. Camera and microphone access requires browser permission and a secure context (localhost is treated as secure by browsers).
