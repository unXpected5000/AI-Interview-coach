import { Outlet } from "react-router-dom";
import ThemeToggle from "../components/ui/ThemeToggle.jsx";
import LegalFooter from "../components/ui/LegalFooter.jsx";

export default function PublicLayout() {
  return (
    <main className="safe-bottom min-h-screen bg-gray-50 px-4 pb-10 pt-4 sm:px-6 sm:pt-6">
      <div className="mx-auto flex max-w-md items-center justify-between gap-3">
        <p className="text-sm font-black tracking-tight text-stone-900">AI Interview Coach</p>
        <ThemeToggle compact />
      </div>
      <div className="mx-auto mt-6 max-w-md">
        <Outlet />
        <LegalFooter className="mt-8 justify-center" />
      </div>
    </main>
  );
}
