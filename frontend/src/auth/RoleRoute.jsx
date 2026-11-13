import { Navigate, Outlet } from "react-router-dom";

import { useAuth } from "./AuthContext.jsx";

// UI convenience only: the API enforces every role check independently.
export default function RoleRoute({ roles }) {
  const { user } = useAuth();
  if (!user || !roles.includes(user.role)) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
