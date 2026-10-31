import { Link, Outlet } from "react-router-dom";
import ThemeToggle from "../components/ui/ThemeToggle.jsx";

export default function PublicLayout() {
  return (
    <main className="relative min-h-screen bg-gray-50 px-6 py-12">
      <div className="absolute right-5 top-5">
        <ThemeToggle compact />
      </div>
      <div className="mx-auto max-w-md">
        <Outlet />
        <footer className="mt-8 flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-stone-600">
          <Link className="underline" to="/legal/privacy">Privacy</Link><Link className="underline" to="/legal/terms">Terms</Link><Link className="underline" to="/legal/refund">Refunds</Link><Link className="underline" to="/legal/cookies">Cookies</Link>
        </footer>
      </div>
    </main>
  );
}

