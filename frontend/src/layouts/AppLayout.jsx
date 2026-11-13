import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext.jsx";
import ThemeToggle from "../components/ui/ThemeToggle.jsx";
import LegalFooter from "../components/ui/LegalFooter.jsx";
import { navItemsForRole, ROLE_LABELS } from "../auth/roleAccess.js";

function NavList({ items, onNavigate }) {
  return (
    <nav aria-label="Main" className="space-y-1">
      {items.map((item) => (
        <div key={item.label}>
          <NavLink
            className={({ isActive }) =>
              `flex min-h-11 items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-semibold transition ${
                isActive
                  ? "bg-stone-950 text-white shadow-lg shadow-stone-950/10"
                  : "text-stone-600 hover:bg-stone-100 hover:text-stone-950"
              }`
            }
            end={!item.children}
            onClick={onNavigate}
            to={item.path}
          >
            <span aria-hidden="true" className="grid size-8 place-items-center rounded-md bg-white/15 text-xs">
              {item.mark}
            </span>
            {item.label}
          </NavLink>
          {item.children ? (
            <div className="ml-8 mt-1 space-y-1 border-l border-stone-200 pl-3">
              {item.children.map((child) => (
                <NavLink
                  className={({ isActive }) =>
                    `block rounded-md px-3 py-2 text-xs font-semibold transition ${
                      isActive ? "bg-teal-50 text-teal-800" : "text-stone-500 hover:bg-stone-100 hover:text-stone-900"
                    }`
                  }
                  key={child.path}
                  onClick={onNavigate}
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
  );
}

function AccountCard({ user, onLogout }) {
  return (
    <div className="rounded-lg border border-teal-100 bg-teal-50 p-4">
      <p className="text-sm font-bold text-teal-900">Signed in as</p>
      <p className="mt-1 truncate text-sm text-teal-800">{user?.name ?? "Candidate"}</p>
      <p className="mt-1 text-xs font-semibold text-teal-700">
        {ROLE_LABELS[user?.role] ?? "Student"}
        {user?.department ? ` · ${user.department}` : ""}
        {user?.year ? ` · Year ${user.year}` : ""}
      </p>
      <button
        className="mt-4 rounded-full bg-stone-950 px-4 py-2 text-xs font-bold text-white transition hover:bg-teal-800"
        type="button"
        onClick={onLogout}
      >
        Log out
      </button>
    </div>
  );
}

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const navItems = navItemsForRole(user?.role);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef(null);
  const drawerRef = useRef(null);

  function handleLogout() {
    setMenuOpen(false);
    logout();
    navigate("/login", { replace: true });
  }

  // Close the phone menu on navigation.
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    drawerRef.current?.querySelector("a, button")?.focus();
    const onKey = (event) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <div className="min-h-screen bg-[#f6f3ee] text-stone-950 lg:flex">
      <a className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:font-bold" href="#main-content">Skip to content</a>

      {/* Phone and tablet: compact sticky bar with a slide-out menu. */}
      <header className="safe-top sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-stone-200 bg-white/90 px-4 py-2 backdrop-blur lg:hidden">
        <NavLink className="min-w-0" to="/dashboard">
          <p className="truncate text-base font-black tracking-tight">AI Interview Coach</p>
        </NavLink>
        <div className="flex items-center gap-2">
          <ThemeToggle compact />
          <button
            aria-controls="mobile-menu"
            aria-expanded={menuOpen}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            className="grid size-11 place-items-center rounded-lg border border-stone-300 text-lg"
            onClick={() => setMenuOpen((open) => !open)}
            ref={menuButtonRef}
            type="button"
          >
            <span aria-hidden="true">{menuOpen ? "✕" : "☰"}</span>
          </button>
        </div>
      </header>

      {menuOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button aria-label="Close menu" className="absolute inset-0 h-full w-full bg-black/40" onClick={() => setMenuOpen(false)} tabIndex={-1} type="button" />
          <aside
            aria-label="Menu"
            className="safe-bottom absolute inset-y-0 right-0 flex w-[min(20rem,86vw)] flex-col gap-6 overflow-y-auto bg-white p-5 shadow-2xl"
            id="mobile-menu"
            ref={drawerRef}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-base font-black tracking-tight">Menu</p>
              <button
                aria-label="Close menu"
                className="grid size-11 place-items-center rounded-lg border border-stone-300 text-lg"
                onClick={() => { setMenuOpen(false); menuButtonRef.current?.focus(); }}
                type="button"
              >
                <span aria-hidden="true">✕</span>
              </button>
            </div>
            <NavList items={navItems} onNavigate={() => setMenuOpen(false)} />
            <AccountCard onLogout={handleLogout} user={user} />
          </aside>
        </div>
      ) : null}

      {/* Desktop: persistent sidebar. */}
      <aside className="sticky top-0 hidden h-screen w-72 shrink-0 flex-col overflow-y-auto border-r border-stone-200 bg-white/90 backdrop-blur lg:flex">
        <div className="p-6">
          <NavLink to="/dashboard" className="block">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-teal-700">AI Coach</p>
            <p className="mt-1 text-xl font-black tracking-tight">AI Interview Coach</p>
          </NavLink>
          <div className="mt-4">
            <ThemeToggle />
          </div>
        </div>
        <div className="px-4">
          <NavList items={navItems} />
        </div>
        <div className="mx-4 my-8">
          <AccountCard onLogout={handleLogout} user={user} />
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 lg:px-10" id="main-content" tabIndex={-1}>
        <div className="mx-auto max-w-7xl">
          <Outlet />
          <LegalFooter className="mt-12 border-t border-stone-200 pt-5" />
        </div>
      </main>
    </div>
  );
}
