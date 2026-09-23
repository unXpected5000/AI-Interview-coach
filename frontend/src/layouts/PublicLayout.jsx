import { Outlet } from "react-router-dom";

export default function PublicLayout() {
  return (
    <main className="min-h-screen bg-gray-50 px-6 py-12">
      <div className="mx-auto max-w-md">
        <Outlet />
      </div>
    </main>
  );
}

