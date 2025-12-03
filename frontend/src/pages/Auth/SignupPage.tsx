// src/pages/Auth/SignupPage.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../supabaseClient";
import { createBasicAccount } from "../../api/account";

type AccountKind = "player" | "parent" | "coach";

interface FormState {
  email: string;
  password: string;
  confirmPassword: string;
  role: AccountKind;
  firstName: string;
  lastName: string;
  phone: string;
  organization: string;
  levels: string[];
}

const coachLevels = ["5U-14U", "High School", "College", "Pro"];

export default function SignupPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState<FormState>({
    email: "",
    password: "",
    confirmPassword: "",
    role: "player",
    firstName: "",
    lastName: "",
    phone: "",
    organization: "",
    levels: [],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCoach = form.role === "coach";

  const displayName = useMemo(() => {
    const parts = [form.firstName, form.lastName].filter(Boolean);
    return parts.length > 0 ? parts.join(" ") : form.email;
  }, [form.email, form.firstName, form.lastName]);

  useEffect(() => {
    setError(null);
  }, [form.role]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.email || !form.password) {
      setError("Email and password are required.");
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (isCoach) {
      if (!form.firstName || !form.lastName || !form.phone || !form.organization) {
        setError("Coach accounts require name, phone, and organization.");
        return;
      }
      if (form.levels.length === 0) {
        setError("Select at least one level you coach.");
        return;
      }
    } else {
      if (!form.firstName || !form.lastName) {
        setError("Please provide your first and last name.");
        return;
      }
    }

    setLoading(true);

    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          data: {
            role: form.role,
            first_name: form.firstName,
            last_name: form.lastName,
          },
        },
      });

      let session = data.session;

      // If Supabase email confirmation is enabled, we won't get a session back yet.
      // Attempt a follow-up sign-in to establish a session so the backend call is authorized.
      if (!session && !signUpError) {
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: form.email,
          password: form.password,
        });

        if (signInError) {
          throw new Error(
            signInError.message ||
              "Please confirm your email (if required) before continuing."
          );
        }

        session = signInData.session;
      }

      if (signUpError || !session) {
        throw new Error(signUpError?.message || "Unable to sign up");
      }

      await createBasicAccount({
        role: form.role,
        display_name: displayName,
        email: form.email,
        first_name: form.firstName || null,
        last_name: form.lastName || null,
        phone: form.phone || null,
        organization: form.organization || null,
      });

      // Coach extra metadata can be captured later in profile page; we only ensure session + profile row now
      navigate("/profile");
    } catch (err: any) {
      setError(err?.message || "Failed to create account");
    } finally {
      setLoading(false);
    }
  }

  function toggleLevel(level: string) {
    setForm((prev) => {
      const has = prev.levels.includes(level);
      return {
        ...prev,
        levels: has ? prev.levels.filter((l) => l !== level) : [...prev.levels, level],
      };
    });
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-slate-800/80 rounded-2xl p-6 shadow-lg border border-slate-700">
        <h1 className="text-2xl font-bold mb-2 text-center">Create your BPOP account</h1>
        <p className="text-sm text-slate-300 text-center mb-6">
          Pick an account type to unlock the right onboarding flow.
        </p>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-semibold mb-1">Account type</label>
            <div className="grid grid-cols-3 gap-2">
              {(["player", "parent", "coach"] as AccountKind[]).map((role) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, role }))}
                  className={`rounded-lg border px-3 py-2 text-sm capitalize transition ${
                    form.role === role
                      ? "border-emerald-400 bg-emerald-500/10 text-emerald-100"
                      : "border-slate-700 bg-slate-900/50 text-slate-200"
                  }`}
                >
                  {role}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Assistants are invited by coaches; admins are created via the backend.
            </p>
          </div>

          <div>
            <label className="block text-sm mb-1">Email</label>
            <input
              type="email"
              className="w-full rounded-lg bg-slate-900/60 border border-slate-700 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              autoComplete="email"
              required
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Password</label>
            <input
              type="password"
              className="w-full rounded-lg bg-slate-900/60 border border-slate-700 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              autoComplete="new-password"
              required
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Confirm password</label>
            <input
              type="password"
              className="w-full rounded-lg bg-slate-900/60 border border-slate-700 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
              value={form.confirmPassword}
              onChange={(e) => setForm((f) => ({ ...f, confirmPassword: e.target.value }))}
              autoComplete="new-password"
              required
            />
          </div>

          <div>
            <label className="block text-sm mb-1">First name</label>
            <input
              type="text"
              className="w-full rounded-lg bg-slate-900/60 border border-slate-700 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
              value={form.firstName}
              onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
              required={!isCoach}
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Last name</label>
            <input
              type="text"
              className="w-full rounded-lg bg-slate-900/60 border border-slate-700 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
              value={form.lastName}
              onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
              required={!isCoach}
            />
          </div>

          {isCoach && (
            <>
              <div>
                <label className="block text-sm mb-1">Phone</label>
                <input
                  type="tel"
                  className="w-full rounded-lg bg-slate-900/60 border border-slate-700 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  required={isCoach}
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Organization</label>
                <input
                  type="text"
                  className="w-full rounded-lg bg-slate-900/60 border border-slate-700 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                  value={form.organization}
                  onChange={(e) => setForm((f) => ({ ...f, organization: e.target.value }))}
                  placeholder="Ripit Raptors, Smoky High School, etc."
                  required={isCoach}
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold mb-1">
                  Levels you coach
                </label>
                <div className="flex flex-wrap gap-2">
                  {coachLevels.map((level) => (
                    <button
                      type="button"
                      key={level}
                      onClick={() => toggleLevel(level)}
                      className={`rounded-full border px-3 py-1 text-xs transition ${
                        form.levels.includes(level)
                          ? "border-emerald-400 bg-emerald-500/10 text-emerald-100"
                          : "border-slate-700 bg-slate-900/50 text-slate-200"
                      }`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {error && (
            <div className="md:col-span-2 text-sm text-red-400">{error}</div>
          )}

          <div className="md:col-span-2 flex flex-col gap-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 py-2 text-sm font-semibold"
            >
              {loading ? "Creating account..." : "Create account"}
            </button>
            <button
              type="button"
              className="w-full rounded-xl border border-slate-700 py-2 text-sm font-semibold text-slate-200"
              onClick={() => navigate("/login")}
            >
              Back to login
            </button>
          </div>
        </form>

        <div className="mt-6 text-xs text-slate-400 space-y-1">
          <p>Parent/assistant flows are invite-ready. Admin accounts are backend-only.</p>
          <p>
            After signing up you can complete the full profile (player data, parent-child links, coach bio)
            on the Profile tab.
          </p>
        </div>
      </div>
    </div>
  );
}

