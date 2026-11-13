import { useAuth } from "../auth/AuthContext.jsx";
import PageHeader from "../components/ui/PageHeader.jsx";
import UserDirectory from "../components/staff/UserDirectory.jsx";
import { getDepartmentStudent, listDepartmentStudents, updateDepartmentStudent } from "../api/userApi.js";

const departmentApi = {
  list: listDepartmentStudents,
  detail: getDepartmentStudent,
  update: updateDepartmentStudent,
};

export default function DepartmentPage() {
  const { user } = useAuth();
  return (
    <>
      <PageHeader
        eyebrow="HOD"
        title={`${user?.department ?? "Department"} students`}
        description="View practice progress and update student name, contact details, and year. Interview answers, transcripts, resumes, and scores are read-only and not shown in detail."
      />
      <UserDirectory api={departmentApi} mode="department" />
    </>
  );
}
