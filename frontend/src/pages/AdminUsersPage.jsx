import PageHeader from "../components/ui/PageHeader.jsx";
import UserDirectory from "../components/staff/UserDirectory.jsx";
import { getUserProgress, listUsers, setUserRole, updateUser } from "../api/userApi.js";

const adminApi = {
  list: listUsers,
  detail: getUserProgress,
  update: updateUser,
  setRole: setUserRole,
};

export default function AdminUsersPage() {
  return (
    <>
      <PageHeader
        eyebrow="Operator"
        title="User management"
        description="Manage users across departments: move students, assign HODs to a department, and grant or remove operator access."
      />
      <UserDirectory api={adminApi} mode="admin" />
    </>
  );
}
