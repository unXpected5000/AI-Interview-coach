# Phase 1 Foundation

This document explains the responsibility of every file created for Phase 1.

## Root Files

### `README.md`

Project overview, current phase status, and high-level application boundaries.

### `PHASE1_FOUNDATION.md`

Phase 1 scaffold documentation. Explains the purpose of each file and directory so later phases can be implemented independently.

## Backend Files

### `backend/requirements.txt`

Python dependency list for the FastAPI backend foundation.

### `backend/.env.example`

Example backend environment variables. This file documents required configuration without storing secrets.

### `backend/app/__init__.py`

Marks `app` as a Python package.

### `backend/app/main.py`

FastAPI application entry point. Creates the app, configures CORS, registers infrastructure routes, and wires startup/shutdown hooks.

### `backend/app/api/__init__.py`

Marks API modules as a package.

### `backend/app/api/deps.py`

Shared FastAPI dependency placeholder. Authentication and request-level dependencies will be added in later phases.

### `backend/app/api/routes/__init__.py`

Collects route modules. Feature routes will be added here as the MVP grows.

### `backend/app/api/routes/health.py`

Infrastructure health check route used to verify that the backend process is running.

### `backend/app/core/__init__.py`

Marks core infrastructure modules as a package.

### `backend/app/core/config.py`

Centralized settings layer. Reads environment variables through Pydantic settings and prevents hardcoded credentials.

### `backend/app/core/exceptions.py`

Shared exception helpers placeholder. Later phases can standardize API error responses here.

### `backend/app/core/security.py`

Security helper module. Password hashing and password verification are implemented in Phase 2.

### `backend/app/db/__init__.py`

Marks database modules as a package.

### `backend/app/db/mongodb.py`

MongoDB client lifecycle module. Owns connection initialization, shutdown, and database access helpers.

### `backend/app/models/__init__.py`

Backend persistence model package placeholder. MongoDB document models will be added by feature phase.

### `backend/app/schemas/__init__.py`

Pydantic schema package placeholder. Request and response schemas will be added by feature phase.

### `backend/app/repositories/__init__.py`

Repository package placeholder. Database access classes will live here.

### `backend/app/services/__init__.py`

Service package placeholder. Business workflows will live here.

### `backend/app/ai/__init__.py`

AI integration package placeholder. LLM clients, embeddings, and prompts will be added in later phases.

### `backend/tests/__init__.py`

Marks backend tests as a package.

### `backend/tests/test_health.py`

Foundation test for the health endpoint.

## Frontend Files

### `frontend/package.json`

Node package manifest with scripts and foundation dependencies.

### `frontend/.env.example`

Example frontend environment variables. Documents the API URL without storing secrets.

### `frontend/index.html`

Vite HTML entry point.

### `frontend/vite.config.js`

Vite configuration for the React frontend.

### `frontend/tailwind.config.js`

Tailwind content configuration.

### `frontend/postcss.config.js`

PostCSS configuration for Tailwind.

### `frontend/src/main.jsx`

React entry point. Mounts the app into the DOM.

### `frontend/src/App.jsx`

Top-level frontend app shell and placeholder routes.

### `frontend/src/index.css`

Tailwind CSS entry file and minimal base styling.

### `frontend/src/api/client.js`

Shared Axios client. All future API modules should use this client.

### `frontend/src/api/index.js`

API package barrel placeholder for future feature API modules.

### `frontend/src/auth/index.js`

Authentication package placeholder. Auth context and protected routes will be added in Phase 2.

### `frontend/src/components/.gitkeep`

Keeps the shared components directory in version control until components are added.

### `frontend/src/hooks/.gitkeep`

Keeps the custom hooks directory in version control until hooks are added.

### `frontend/src/layouts/AppLayout.jsx`

Authenticated application layout placeholder.

### `frontend/src/layouts/PublicLayout.jsx`

Public page layout placeholder.

### `frontend/src/pages/DashboardPage.jsx`

Dashboard placeholder page. Real dashboard data comes in Phase 6.

### `frontend/src/pages/LoginPage.jsx`

Login placeholder page. Real auth behavior comes in Phase 2.

### `frontend/src/pages/RegisterPage.jsx`

Register placeholder page. Real auth behavior comes in Phase 2.

### `frontend/src/pages/ResumeUploadPage.jsx`

Resume upload placeholder page. Real upload behavior comes in Phase 3.

### `frontend/src/pages/InterviewPage.jsx`

Interview placeholder page. Real session behavior comes in Phase 4.

### `frontend/src/utils/env.js`

Frontend environment helper. Centralizes access to Vite environment variables.
