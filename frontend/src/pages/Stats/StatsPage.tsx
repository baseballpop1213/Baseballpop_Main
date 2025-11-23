// src/pages/Stats/StatsPage.tsx
import { useAuth } from "../../context/AuthContext";

export default function StatsPage() {
  const { profile } = useAuth();

  const name =
    profile?.display_name ||
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") ||
    profile?.email ||
    "Player";

  const role = profile?.role ?? "unknown";
  const isCoachLike = role === "coach" || role === "assistant";

  return (
    <div className="space-y-6">
      {/* Header */}
      <section>
        <h2 className="text-xl font-semibold mb-1">Stats</h2>
        <p className="text-sm text-slate-300">
          {isCoachLike ? "Team & player evaluation data" : "Your evaluation data"}{" "}
          at a glance.
        </p>
        <p className="text-xs text-slate-400 mt-1">
          This page will eventually show BPOP ratings, medal/trophy progress, and
          drill down into individual assessments.
        </p>
      </section>

      {/* Summary card */}
      <section className="grid sm:grid-cols-2 gap-4">
        <div className="rounded-xl bg-slate-900/70 border border-slate-700 p-4">
          <h3 className="text-sm font-semibold mb-1">
            {isCoachLike ? "Coach overview" : "Player overview"}
          </h3>
          <p className="text-xs text-slate-300 mb-2">
            Signed in as <span className="font-semibold">{name}</span> ({role}).
          </p>
          <p className="text-xs text-slate-400">
            Here we&apos;ll show your main BPOP rating, recent assessments, and
            high-level trends over time.
          </p>
        </div>

        <div className="rounded-xl bg-slate-900/70 border border-slate-700 p-4">
          <h3 className="text-sm font-semibold mb-1">Coming soon</h3>
          <ul className="text-xs text-slate-300 list-disc list-inside space-y-1">
            <li>Latest official assessment summary</li>
            <li>Category scores (offense, defense, pitching, athlete)</li>
            <li>Medals & trophies earned by age group</li>
            <li>Shortcuts into optimizers (fielding, batting, pitching)</li>
          </ul>
        </div>
      </section>

      {/* Placeholder for charts / tables */}
      <section className="rounded-xl bg-slate-900/70 border border-slate-700 p-4">
        <h3 className="text-sm font-semibold mb-2">History & breakdown</h3>
        <p className="text-xs text-slate-300">
          We&apos;ll add charts and tables here for evaluation history once we
          wire up the relevant backend routes.
        </p>
      </section>
    </div>
  );
}
