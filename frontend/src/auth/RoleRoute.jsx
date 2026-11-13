import { Outlet } from "react-router-dom";

import { useAuth } from "./AuthContext.jsx";
import ErrorPage from "../components/ui/ErrorPage.jsx";

// UI convenience only: the API enforces every role check independently.
export default function RoleRoute({ roles }) {
  const { user } = useAuth();
  if (!user || !roles.includes(user.role)) return <ErrorPage kind="403" />;
  return <Outlet />;
}
