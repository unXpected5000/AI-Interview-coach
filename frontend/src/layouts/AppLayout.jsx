import { NavLink, Outlet, useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext.jsx";
import ThemeToggle from "../components/ui/ThemeToggle.jsx";

const navItems = [
  { label: "Dashboard", path: "/dashboard", mark: "DB" },
  { label: "Account & data", path: "/account", mark: "AC" },
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
];

export default function AppLayout() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="min-h-screen bg-[#f6f3ee] text-stone-950 lg:flex">
      <aside className="sticky top-0 z-20 border-b border-stone-200 bg-white/90 backdrop-blur lg:h-screen lg:w-72 lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between px-5 py-4 lg:block lg:p-6">
          <NavLink to="/dashboard" className="block">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-teal-700">
              AI Coach
            </p>
            <h1 className="mt-1 text-xl font-black tracking-tight">
              AI Interview Coach
            </h1>
          </NavLink>
          <div className="mt-4">
            <ThemeToggle />
          </div>
          <button
            className="rounded-full border border-stone-300 px-3 py-1 text-xs font-bold text-stone-700 transition hover:border-stone-950 hover:text-stone-950 lg:hidden"
            type="button"
            onClick={handleLogout}
          >
            Logout
          </button>
        </div>

        <nav className="flex gap-2 overflow-x-auto px-4 pb-4 lg:block lg:space-y-2 lg:px-4">
            {navItems.map((item) => (
              <div className="min-w-max" key={item.label}>
                <NavLink
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-semibold transition ${
                      isActive
                        ? "bg-stone-950 text-white shadow-lg shadow-stone-950/10"
                        : "text-stone-600 hover:bg-stone-100 hover:text-stone-950"
                    }`
                  }
                  end={!item.children}
                  to={item.path}
                >
                  <span className="grid size-8 place-items-center rounded-md bg-white/15 text-xs">
                    {item.mark}
                  </span>
                  {item.label}
                </NavLink>
                {item.children ? (
                  <div className="ml-8 mt-1 border-l border-stone-200 pl-3 lg:space-y-1">
                    {item.children.map((child) => (
                      <NavLink
                        className={({ isActive }) =>
                          `block rounded-md px-3 py-2 text-xs font-semibold transition ${
                            isActive ? "bg-teal-50 text-teal-800" : "text-stone-500 hover:bg-stone-100 hover:text-stone-900"
                          }`
                        }
                        key={child.path}
                        to={child.path}
                      >
                        {child.label}
                      </NavLink>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
        </nav>

        <div className="mx-4 mt-8 hidden rounded-lg border border-teal-100 bg-teal-50 p-4 lg:block">
          <p className="text-sm font-bold text-teal-900">Signed in as</p>
          <p className="mt-1 text-sm text-teal-800">{user?.name ?? "Candidate"}</p>
          <p className="mt-3 text-xs leading-5 text-teal-700">
            Resume upload, interview generation, evaluation, and feedback all stay
            tied to this account.
          </p>
          <button
            className="mt-4 rounded-full bg-stone-950 px-4 py-2 text-xs font-bold text-white transition hover:bg-teal-800"
            type="button"
            onClick={handleLogout}
          >
            Logout
          </button>
        </div>
      </aside>

      <main className="flex-1 px-5 py-6 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-7xl">
          <Outlet />
          <footer className="mt-12 flex flex-wrap gap-x-5 gap-y-2 border-t border-stone-200 pt-5 text-xs text-stone-600">
            <NavLink to="/legal/privacy" className="underline">Privacy</NavLink>
            <NavLink to="/legal/terms" className="underline">Terms</NavLink>
            <NavLink to="/legal/refund" className="underline">Refunds</NavLink>
            <NavLink to="/legal/cookies" className="underline">Cookies & storage</NavLink>
          </footer>
        </div>
      </main>
    </div>
  );
}
