import { Outlet } from "react-router-dom";
import ThemeToggle from "../components/ui/ThemeToggle.jsx";

export default function PublicLayout() {
  return (
    <main className="relative min-h-screen bg-gray-50 px-6 py-12">
      <div className="absolute right-5 top-5">
        <ThemeToggle compact />
      </div>
      <div className="mx-auto max-w-md">
        <Outlet />
      </div>
    </main>
  );
}

