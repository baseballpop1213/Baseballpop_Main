// src/App.tsx
import "./index.css";
import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { getMe } from "./api/auth";
import type { Profile } from "./api/types";

function App() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);

  // On load, if there's already a Supabase session, fetch /me
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        const me = await getMe();
        setProfile(me);
      }
      setInitializing(false);
    })();
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthError(null);
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setAuthError(error.message);
        return;
      }

      const me = await getMe();
      setProfile(me);
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    setLoading(true);
    setAuthError(null);
    try {
      await supabase.auth.signOut();
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }

  if (initializing) {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-50 flex items-center justify-center">
        <div className="text-sm text-slate-300">Loading BPOP…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl bg-slate-800/80 rounded-2xl p-6 shadow-lg border border-slate-700">
        <header className="flex items-center justify-between gap-4 mb-6">
          <h1 className="text-2xl font-bold">
            BPOP <span className="text-emerald-400">Frontend</span> ⚾
          </h1>

          {profile && (
            <div className="flex items-center gap-3">
              <div className="text-right text-xs sm:text-sm">
                <div className="font-semibold">
                  {profile.display_name ||
                    [profile.first_name, profile.last_name]
                      .filter(Boolean)
                      .join(" ") ||
                    "Unknown user"}
                </div>
                <div className="text-slate-300 font-mono truncate max-w-[180px]">
                  {profile.email}
                </div>
                <div className="text-slate-400">
                  Role: <span className="font-mono">{profile.role}</span>
                </div>
              </div>
              <button
                onClick={handleLogout}
                disabled={loading}
                className="rounded-xl bg-red-500 hover:bg-red-600 disabled:opacity-60 px-3 py-1 text-xs sm:text-sm font-semibold"
              >
                {loading ? "Signing out..." : "Sign out"}
              </button>
            </div>
          )}
        </header>

        {!profile ? (
          // ---------- LOGIN VIEW ----------
          <div className="grid sm:grid-cols-[2fr,3fr] gap-6 items-start">
            <form onSubmit={handleLogin} className="space-y-4">
              <h2 className="text-lg font-semibold mb-1">Sign in</h2>
              <p className="text-xs text-slate-300 mb-2">
                Use your Supabase test user (e.g.{" "}
                <span className="font-mono">coachmike@test.com</span>) to log in.
              </p>
              <div>
                <label className="block text-sm mb-1">Email</label>
                <input
                  type="email"
                  className="w-full rounded-lg bg-slate-900/60 border border-slate-700 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Password</label>
                <input
                  type="password"
                  className="w-full rounded-lg bg-slate-900/60 border border-slate-700 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>
              {authError && (
                <p className="text-sm text-red-400">{authError}</p>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 py-2 text-sm font-semibold"
              >
                {loading ? "Signing in..." : "Sign in & fetch /me"}
              </button>
            </form>

            <div className="hidden sm:block text-sm text-slate-300 space-y-2">
              <h2 className="text-base font-semibold mb-1">
                What BPOP will do
              </h2>
              <ul className="list-disc list-inside space-y-1">
                <li>Run age-group specific evaluations for players + teams.</li>
                <li>Optimize fielding, batting order, and pitching rotations.</li>
                <li>Show medals & trophies earned from official evals.</li>
                <li>Handle team events, messaging, and player profiles.</li>
              </ul>
            </div>
          </div>
        ) : (
          // ---------- HOME VIEW ----------
          <div className="space-y-4">
            {profile.role === "coach" ? (
              <CoachHome />
            ) : (
              <GenericHome role={profile.role} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function CoachHome() {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Coach Home</h2>
      <p className="text-sm text-slate-300">
        This is the central hub we&apos;ll grow into:
      </p>
      <div className="grid sm:grid-cols-2 gap-4 mt-2">
        <HomeCard title="Team Overview" description="View your teams, rosters, and quick stats. Later: tap into fielding, batting, and pitching optimization from here." />
        <HomeCard title="Run Evaluations" description="Start new official or practice evaluations for a team or player, using the age-group templates we already defined." />
        <HomeCard title="Medals & Trophies" description="See which medals and team trophies have been earned at each age group." />
        <HomeCard title="Messaging & Events" description="Access team chats, DMs, and event schedules for practices, games, and tryouts." />
      </div>
    </div>
  );
}

function GenericHome({ role }: { role: string }) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold capitalize">{role} Home</h2>
      <p className="text-sm text-slate-300">
        We&apos;ll customize this view for each role (player, parent, assistant)
        as we go. For now this confirms auth and role detection are working.
      </p>
    </div>
  );
}

function HomeCard(props: { title: string; description: string }) {
  return (
    <div className="rounded-xl bg-slate-900/70 border border-slate-700 p-4">
      <h3 className="text-sm font-semibold mb-1">{props.title}</h3>
      <p className="text-xs text-slate-300">{props.description}</p>
      <button className="mt-3 inline-flex items-center text-xs font-semibold text-emerald-400 hover:text-emerald-300">
        Open (stub) →
      </button>
    </div>
  );
}

export default App;
