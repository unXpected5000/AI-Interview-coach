# Phase 2 Authentication

Phase 2 implements complete MVP authentication for the backend and frontend.

## Backend Responsibilities

### `backend/app/api/routes/auth.py`

Defines authentication endpoints:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`

The route layer validates request payloads, calls the auth service, and maps auth errors to HTTP responses.

### `backend/app/api/deps.py`

Provides shared FastAPI dependencies:

- user repository creation
- auth service creation
- current-user JWT validation

Future protected routes should depend on `get_current_user`.

### `backend/app/core/security.py`

Owns password hashing and verification using bcrypt through Passlib.

### `backend/app/core/jwt.py`

Owns JWT access-token creation and decoding. The JWT secret must come from environment variables.

### `backend/app/models/user_model.py`

Defines the MongoDB collection name, user document factory, and user serialization helper.

### `backend/app/schemas/auth_schema.py`

Defines request and response schemas for register/login flows.

### `backend/app/schemas/user_schema.py`

Defines the public user response schema. It intentionally excludes `password_hash`.

### `backend/app/repositories/user_repository.py`

Owns MongoDB access for user records.

### `backend/app/services/auth_service.py`

Owns authentication workflow logic:

- duplicate email checks
- password hashing
- credential verification
- token issuing
- public user serialization

### `backend/app/db/mongodb.py`

Creates the unique `users.email` index during MongoDB startup when a MongoDB URI is configured.

## Frontend Responsibilities

### `frontend/src/api/authApi.js`

Defines auth API calls for register, login, and current user.

### `frontend/src/api/client.js`

Shared Axios client. Automatically attaches the bearer token when present.

### `frontend/src/auth/AuthContext.jsx`

Owns frontend auth state:

- session bootstrap
- login
- register
- logout
- current user

### `frontend/src/auth/ProtectedRoute.jsx`

Guards authenticated pages.

### `frontend/src/auth/PublicOnlyRoute.jsx`

Prevents authenticated users from returning to login/register pages.

### `frontend/src/utils/tokenStorage.js`

Centralizes access-token persistence.

### `frontend/src/pages/LoginPage.jsx`

Login form connected to the backend auth API.

### `frontend/src/pages/RegisterPage.jsx`

Registration form connected to the backend auth API.

### `frontend/src/layouts/AppLayout.jsx`

Displays the current user and logout action.

## Required Environment Variables

Backend:

```text
MONGODB_URI
MONGODB_DB_NAME
JWT_SECRET_KEY
JWT_ALGORITHM
JWT_ACCESS_TOKEN_EXPIRE_MINUTES
BACKEND_CORS_ORIGINS
```

Frontend:

```text
VITE_API_BASE_URL
```

## Phase 2 Completion Criteria

- Users can register.
- Users can log in.
- Passwords are hashed with bcrypt.
- JWTs are issued on register/login.
- `/api/auth/me` returns the current user for valid tokens.
- Protected frontend routes require authentication.
- Public auth pages redirect authenticated users.
- Logout clears the local session.

