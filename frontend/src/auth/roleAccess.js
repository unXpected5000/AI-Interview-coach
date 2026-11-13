export const ROLE_LABELS = {
  student: "Student",
  department_faculty: "HOD (department faculty)",
  operator: "Operator",
};

// Paths an account with an incomplete profile may still open.
const PROFILE_EXEMPT_PATHS = ["/complete-profile", "/account"];

export function profileRedirect(user, pathname) {
  if (!user || user.profile_complete) return null;
  if (PROFILE_EXEMPT_PATHS.some((path) => pathname.startsWith(path))) return null;
  return "/complete-profile";
}

export function navItemsForRole(role) {
  const items = [
    { label: "Dashboard", path: "/dashboard", mark: "DB" },
    { label: "Account & data", path: "/account", mark: "AC" },
  ];
  if (role === "department_faculty") items.push({ label: "My department", path: "/department", mark: "DP" });
  if (role === "operator") items.push({ label: "User management", path: "/admin/users", mark: "OP" });
  items.push(
    { label: "Start Interview", path: "/interviews/start", mark: "ST" },
    {
      label: "Resume Studio",
      path: "/resumes/upload",
      mark: "RS",
      children: [
        { label: "Upload & manage", path: "/resumes/upload" },
        { label: "Optimize resume", path: "/resume-optimizer" },
        { label: "Build from template", path: "/resume-builder" },
      ],
    },
  );
  return items;
}
