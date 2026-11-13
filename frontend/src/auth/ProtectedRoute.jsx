import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "./AuthContext.jsx";
import { profileRedirect } from "./roleAccess.js";

export default function ProtectedRoute() {
  const location = useLocation();
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 text-gray-700">
        Loading session...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  const redirect = profileRedirect(user, location.pathname);
  if (redirect) return <Navigate to={redirect} replace />;

  return <Outlet />;
}
