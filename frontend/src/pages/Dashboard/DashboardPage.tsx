// src/pages/Dashboard/DashboardPage.tsx
import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { getMyTeams } from "../../api/coach";
import type { TeamWithRole } from "../../api/types";

export default function DashboardPage() {
  const { profile } = useAuth();

  const name =
    profile?.display_name ||
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") ||
    "Coach";

  const role = profile?.role ?? "unknown";

  const isCoachLike = role === "coach" || role === "assistant";

  const [teams, setTeams] = useState<TeamWithRole[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [teamsError, setTeamsError] = useState<string | null>(null);

  useEffect(() => {
    if (!isCoachLike) return;

    let cancelled = false;

    async function loadTeams() {
      setLoadingTeams(true);
      setTeamsError(null);
      try {
        const data = await getMyTeams();
        if (!cancelled) {
          setTeams(data);
        }
      } catch (err: any) {
        if (!cancelled) {
          setTeamsError(
            err?.response?.data?.message ||
              err?.message ||
              "Failed to load teams"
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingTeams(false);
        }
      }
    }

    loadTeams();

    return () => {
      cancelled = true;
    };
  }, [isCoachLike]);

  return (
    <div className="space-y-6">
      {/* Welcome / hero section */}
      <section>
        <h2 className="text-xl font-semibold mb-1">Dashboard</h2>
        <p className="text-sm text-slate-300">
          Welcome back, <span className="font-semibold">{name}</span> ({role}).
        </p>
        <p className="text-xs text-slate-400 mt-1">
          This is your primary hub for teams, assessments, and quick actions.
        </p>
      </section>

      {/* Quick actions */}
      <section className="grid sm:grid-cols-2 gap-4">
        <DashboardCard
          title="Start new assessment"
          description="Run an official or practice evaluation for one of your teams or players."
          buttonLabel="Start assessment"
          onClick={() => {
            // Stub for now
            alert("Stub: this will open the assessment flow.");
          }}
        />
        {isCoachLike && (
          <DashboardCard
            title="Create new team"
            description="Add a new team, set age group & level, and invite players."
            buttonLabel="Create team"
            onClick={() => {
              // Stub for now
              alert("Stub: this will open the create team flow.");
            }}
          />
        )}
      </section>

      {/* My Teams (for coaches / assistants) */}
      {isCoachLike && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-lg font-semibold">My teams</h3>
          </div>

          <div className="rounded-xl bg-slate-900/70 border border-slate-700 p-4 text-sm">
            {loadingTeams && (
              <p className="text-slate-300 text-sm">Loading your teams…</p>
            )}

            {teamsError && !loadingTeams && (
              <p className="text-red-400 text-sm">{teamsError}</p>
            )}

            {!loadingTeams && !teamsError && teams.length === 0 && (
              <p className="text-slate-300 text-sm">
                You don&apos;t have any teams yet. Use{" "}
                <span className="font-semibold">Create team</span> to add one.
              </p>
            )}

            {!loadingTeams && !teamsError && teams.length > 0 && (
              <div className="space-y-2">
                {teams.map((team) => (
                  <TeamRow key={team.id} team={team} />
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Player/parent future view */}
      {!isCoachLike && (
        <section className="space-y-2">
          <h3 className="text-lg font-semibold">Player overview</h3>
          <p className="text-sm text-slate-300">
            For player/parent roles, this will show the main team, latest BPOP
            rating, and next event.
          </p>
        </section>
      )}
    </div>
  );
}

function DashboardCard(props: {
  title: string;
  description: string;
  buttonLabel: string;
  onClick?: () => void;
}) {
  return (
    <div className="rounded-xl bg-slate-900/70 border border-slate-700 p-4">
      <h3 className="text-sm font-semibold mb-1">{props.title}</h3>
      <p className="text-xs text-slate-300 mb-3">{props.description}</p>
      <button
        type="button"
        onClick={props.onClick}
        className="inline-flex items-center text-xs font-semibold text-emerald-400 hover:text-emerald-300"
      >
        {props.buttonLabel} →
      </button>
    </div>
  );
}

function TeamRow({ team }: { team: TeamWithRole }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-slate-800 last:border-b-0">
      <div>
        <div className="font-semibold text-slate-100">{team.name}</div>
        <div className="text-xs text-slate-400">
          {team.age_group || "Unknown age group"} •{" "}
          {team.level || "Unknown level"} •{" "}
          <span className="uppercase">{team.role}</span>
        </div>
        {team.motto && (
          <div className="text-xs text-slate-500 italic mt-1">
            &ldquo;{team.motto}&rdquo;
          </div>
        )}
      </div>
      {team.logo_url && (
        <div className="w-10 h-10 rounded-full bg-slate-800 overflow-hidden border border-slate-700 flex items-center justify-center text-[10px] text-slate-400">
          {/* Later: real logo image; for now just initials */}
          <span className="px-1 text-center">
            {team.name
              .split(" ")
              .map((w) => w[0])
              .join("")
              .slice(0, 3)
              .toUpperCase()}
          </span>
        </div>
      )}
    </div>
  );
}
