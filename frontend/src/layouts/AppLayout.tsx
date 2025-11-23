// src/layouts/AppLayout.tsx
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const navItems = [
  { to: "/", label: "Dashboard" },
  { to: "/stats", label: "Stats" },
  { to: "/messages", label: "Messages" },
  { to: "/events", label: "Events" },
  { to: "/profile", label: "Profile" },
];

export default function AppLayout() {
  const { profile, logout } = useAuth();

  async function handleLogout() {
    try {
      await logout();
    } catch {
      // ignore for now
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-50 flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur px-4 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold">
            BPOP <span className="text-emerald-400">App</span> ⚾
          </span>
        </div>
        {profile && (
          <div className="flex items-center gap-3 text-xs sm:text-sm">
            <div className="text-right">
              <div className="font-semibold">
                {profile.display_name ||
                  [profile.first_name, profile.last_name]
                    .filter(Boolean)
                    .join(" ") ||
                  "Unknown user"}
              </div>
              <div className="font-mono text-slate-300 truncate max-w-[180px]">
                {profile.email}
              </div>
              <div className="text-slate-400">
                Role: <span className="font-mono">{profile.role}</span>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="rounded-xl bg-red-500 hover:bg-red-600 px-3 py-1 text-xs font-semibold"
            >
              Sign out
            </button>
          </div>
        )}
      </header>

      {/* Content + nav */}
      <div className="flex-1 flex flex-col">
        {/* Top nav (also acts like mobile-friendly tabs) */}
        <nav className="border-b border-slate-800 bg-slate-950/80 px-2 sm:px-4">
          <div className="flex justify-between sm:justify-start gap-1 sm:gap-3 overflow-x-auto text-sm">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  [
                    "px-3 py-2 rounded-lg whitespace-nowrap",
                    isActive
                      ? "bg-emerald-500 text-slate-900 font-semibold"
                      : "text-slate-200 hover:bg-slate-800/80",
                  ].join(" ")
                }
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        </nav>

        {/* Routed content */}
        <main className="flex-1 p-4">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
