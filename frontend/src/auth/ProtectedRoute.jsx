import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "./AuthContext.jsx";
import { profileRedirect } from "./roleAccess.js";
import ErrorPage from "../components/ui/ErrorPage.jsx";
import { errorPageKindFor } from "../utils/errorPages.js";

export default function ProtectedRoute() {
  const location = useLocation();
  const { isAuthenticated, isLoading, user, sessionError } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 text-gray-700">
        Loading session...
      </div>
    );
  }

  if (!isAuthenticated && sessionError) {
    // Keep the saved session; explain the outage instead of showing sign-in.
    return <ErrorPage fullScreen kind={errorPageKindFor(sessionError) ?? "503"} onRetry={() => window.location.reload()} />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  const redirect = profileRedirect(user, location.pathname);
  if (redirect) return <Navigate to={redirect} replace />;

  return <Outlet />;
}
