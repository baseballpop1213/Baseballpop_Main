// src/pages/Stats/StatsPage.tsx
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { getMyTeams } from "../../api/coach";
import {
  getTeamStatsOverview,
  getPlayerStatsOverview,
  getTeamTrophies,
  getPlayerMedals,
  getTeamOffenseDrilldown,
} from "../../api/stats";
import type {
  CoreMetricCode,
  TeamStatsOverview,
  PlayerStatsOverview,
  TeamTrophyWithDefinition,
  TrophyTier,
  PlayerMedalWithDefinition,
  TeamOffenseDrilldown,
  TeamWithRole,
} from "../../api/types";

type ViewMode = "team" | "player";
type OffenseViewMode = "team" | "players";

const METRIC_ORDER: CoreMetricCode[] = [
  "bpoprating",
  "offense",
  "defense",
  "pitching",
  "athletic",
];

const TROPHY_TIER_ORDER: TrophyTier[] = [
  "bronze",
  "silver",
  "gold",
  "platinum",
];

function formatNumber(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  return Number(value).toFixed(decimals);
}

function pickBestTrophyForMetric(
  metric: CoreMetricCode,
  trophies: TeamTrophyWithDefinition[]
): TeamTrophyWithDefinition | null {
  if (!trophies.length) return null;

  // For BPOP we allow trophies tagged either "bpoprating" or generic "overall".
  const targetCodes =
    metric === "bpoprating" ? ["bpoprating", "overall"] : [metric];

  const matching = trophies.filter((t) => {
    const code = t.definition?.metric_code;
    return !!code && targetCodes.includes(code);
  });

  if (!matching.length) return null;

  const tierRank = (tier: TrophyTier | null | undefined) => {
    if (!tier) return -1;
    return TROPHY_TIER_ORDER.indexOf(tier as TrophyTier);
  };

  return matching.reduce<TeamTrophyWithDefinition | null>((best, current) => {
    if (!best) return current;
    const bestTier = tierRank(best.definition?.tier);
    const currentTier = tierRank(current.definition?.tier);

    if (currentTier > bestTier) return current;
    if (currentTier < bestTier) return best;

    const bestTime = best.awarded_at
      ? new Date(best.awarded_at).getTime()
      : 0;
    const currentTime = current.awarded_at
      ? new Date(current.awarded_at).getTime()
      : 0;

    return currentTime > bestTime ? current : best;
  }, null);
}

function TrophyChip({ trophy }: { trophy: TeamTrophyWithDefinition }) {
  const tier = trophy.definition?.tier ?? "bronze";
  const name = trophy.definition?.name ?? "Trophy";

  const tierColor =
    tier === "platinum"
      ? "border-violet-400 text-violet-100"
      : tier === "gold"
      ? "border-amber-400 text-amber-200"
      : tier === "silver"
      ? "border-slate-300 text-slate-100"
      : "border-orange-400 text-orange-200";

  return (
    <span
      className={[
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] bg-slate-900/60",
        tierColor,
      ].join(" ")}
    >
      <span className="mr-1">🏆</span>
      <span className="font-semibold truncate max-w-[120px]" title={name}>
        {name}
      </span>
    </span>
  );
}

function MedalChip({ medal }: { medal: PlayerMedalWithDefinition }) {
  const tier = medal.definition?.tier ?? "bronze";
  const label = medal.definition?.name ?? "Medal";

  const tierColor =
    tier === "platinum"
      ? "border-violet-400 text-violet-100"
      : tier === "gold"
      ? "border-amber-400 text-amber-200"
      : tier === "silver"
      ? "border-slate-300 text-slate-100"
      : "border-orange-400 text-orange-200";

  return (
    <span
      className={[
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] bg-slate-900/60",
        tierColor,
      ].join(" ")}
    >
      <span className="mr-1">🎖️</span>
      <span className="font-semibold truncate max-w-[120px]" title={label}>
        {label}
      </span>
    </span>
  );
}

function MetricCard({
  metric,
  trophy,
}: {
  metric: { label: string; score: number | null; percent: number | null };
  trophy: TeamTrophyWithDefinition | null;
}) {
  return (
    <div className="rounded-xl bg-slate-900/70 border border-slate-700 p-3 flex flex-col justify-between gap-2">
      <div>
        <div className="text-xs uppercase tracking-wide text-slate-400">
          {metric.label}
        </div>
        <div className="flex items-baseline gap-2 mt-1">
          <div className="text-2xl font-semibold text-slate-50">
            {formatNumber(metric.score)}
          </div>
          <div className="text-xs text-slate-400">
            {metric.percent !== null && metric.percent !== undefined
              ? `${formatNumber(metric.percent, 0)}%`
              : "—"}
          </div>
        </div>
      </div>
      {trophy && (
        <div className="mt-1">
          <TrophyChip trophy={trophy} />
        </div>
      )}
    </div>
  );
}

function OffenseDrilldownSection({
  isOpen,
  onToggle,
  drilldown,
  loading,
  error,
  viewMode,
  onViewModeChange,
}: {
  isOpen: boolean;
  onToggle: () => void;
  drilldown: TeamOffenseDrilldown | null;
  loading: boolean;
  error: string | null;
  viewMode: OffenseViewMode;
  onViewModeChange: (mode: OffenseViewMode) => void;
}) {
  return (
    <section className="mt-6">
      <div className="rounded-xl bg-slate-900/70 border border-slate-700">
        <button
          type="button"
          onClick={onToggle}
          className="w-full flex items-center justify-between px-4 py-3 text-left"
        >
          <div>
            <h3 className="text-sm font-semibold text-slate-50">
              Offense breakdown
            </h3>
            <p className="text-xs text-slate-400">
              Contact, power, speed, and strikeout chance for your team.
            </p>
          </div>
          <span className="ml-3 text-slate-400">{isOpen ? "▴" : "▾"}</span>
        </button>

        {isOpen && (
          <div className="border-t border-slate-700 px-4 py-3 space-y-4">
            {loading && (
              <p className="text-xs text-slate-400">Loading offense details…</p>
            )}

            {error && (
              <p className="text-xs text-red-400">
                Failed to load offense breakdown: {error}
              </p>
            )}

            {!loading && !error && !drilldown && (
              <p className="text-xs text-slate-400">
                No offense ratings yet for this team.
              </p>
            )}

            {!loading && !error && drilldown && (
              <>
                {/* Team summary row */}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  {[
                    { key: "offense", match: (c: string) => c === "offense" },
                    { key: "contact", match: (c: string) => c === "contact" },
                    { key: "power", match: (c: string) => c === "power" },
                    { key: "speed", match: (c: string) => c === "speed" },
                    {
                      key: "strike",
                      match: (c: string) => c.includes("strike"),
                    },
                  ].map(({ key, match }) => {
                    const metric = drilldown.metrics.find((m) => {
                      const code = (m.code || "").toLowerCase();
                      return match(code);
                    });

                    if (!metric) return null;

                    const isStrike = key === "strike";
                    const value = metric.team_average;

                    const displayValue =
                      value === null || value === undefined
                        ? "—"
                        : isStrike
                        ? `${formatNumber(value * 100, 1)}%`
                        : formatNumber(value, 1);

                    const label = metric.label;

                    return (
                      <div
                        key={key}
                        className="rounded-lg bg-slate-950/60 border border-slate-700 px-3 py-2"
                      >
                        <div className="text-[11px] uppercase tracking-wide text-slate-400">
                          {label}
                        </div>
                        <div className="mt-1 text-lg font-semibold text-slate-50">
                          {displayValue}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* View toggle */}
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="text-xs text-slate-400">
                    Based on latest official ratings for players on this team.
                  </div>
                  <div className="inline-flex rounded-full bg-slate-800/80 border border-slate-700 text-xs overflow-hidden">
                    <button
                      type="button"
                      onClick={() => onViewModeChange("team")}
                      className={[
                        "px-3 py-1",
                        viewMode === "team"
                          ? "bg-amber-500 text-slate-900"
                          : "text-slate-300",
                      ].join(" ")}
                    >
                      Team averages
                    </button>
                    <button
                      type="button"
                      onClick={() => onViewModeChange("players")}
                      className={[
                        "px-3 py-1",
                        viewMode === "players"
                          ? "bg-amber-500 text-slate-900"
                          : "text-slate-300",
                      ].join(" ")}
                    >
                      Player grid
                    </button>
                  </div>
                </div>

                {/* Content by view mode */}
                {viewMode === "team" ? (
                  <p className="text-xs text-slate-300">
                    Use this view to see how your team&apos;s overall offense,
                    contact, power, speed, and strikeout chance stack up as a
                    group. In later blocks we&apos;ll add rubrics and leaderboards
                    here.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-xs text-left">
                      <thead>
                        <tr className="border-b border-slate-700 text-slate-400">
                          <th className="px-2 py-1 font-semibold">Player</th>
                          <th className="px-2 py-1 font-semibold">#</th>
                          <th className="px-2 py-1 font-semibold">Offense</th>
                          <th className="px-2 py-1 font-semibold">Contact</th>
                          <th className="px-2 py-1 font-semibold">Power</th>
                          <th className="px-2 py-1 font-semibold">Speed</th>
                          <th className="px-2 py-1 font-semibold">
                            K% (lower is better)
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...drilldown.players]
                          .sort(
                            (a, b) =>
                              (b.hitting_score ?? 0) - (a.hitting_score ?? 0)
                          )
                          .map((p) => {
                            const rawStrike =
                              p.strike_chance ??
                              // allow for backend variants like strikeChance / strike_out_chance
                              (p as any).strikeChance ??
                              (p as any).strike_out_chance ??
                              null;

                            const kPercent =
                              rawStrike === null || rawStrike === undefined
                                ? "—"
                                : `${formatNumber(rawStrike * 100, 1)}%`;

                            const name =
                              p.player_name ??
                              `Player ${p.jersey_number ?? ""}`.trim();

                            return (
                              <tr
                                key={p.player_id}
                                className="border-t border-slate-800 text-slate-100"
                              >
                                <td className="px-2 py-1">{name}</td>
                                <td className="px-2 py-1">
                                  {p.jersey_number ?? "—"}
                                </td>
                                <td className="px-2 py-1">
                                  {formatNumber(p.hitting_score)}
                                </td>
                                <td className="px-2 py-1">
                                  {formatNumber(p.contact_score)}
                                </td>
                                <td className="px-2 py-1">
                                  {formatNumber(p.power_score)}
                                </td>
                                <td className="px-2 py-1">
                                  {formatNumber(p.speed_score)}
                                </td>
                                <td className="px-2 py-1">{kPercent}</td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

export default function StatsPage() {
  const { profile } = useAuth();
  const role = profile?.role;
  const isCoachLike =
    role === "coach" || role === "assistant" || role === "admin";

  const playerId = profile?.id ?? null;

  const [viewMode, setViewMode] = useState<ViewMode>(
    isCoachLike ? "team" : "player"
  );

  // --- Team data (coach / admin view) --------------------------

  const [teams, setTeams] = useState<TeamWithRole[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [teamsError, setTeamsError] = useState<string | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);

  const [teamStats, setTeamStats] = useState<TeamStatsOverview | null>(null);
  const [teamStatsLoading, setTeamStatsLoading] = useState(false);
  const [teamStatsError, setTeamStatsError] = useState<string | null>(null);

  const [teamTrophies, setTeamTrophies] = useState<TeamTrophyWithDefinition[]>(
    []
  );

  // Offense drilldown (Block 2A)
  const [offenseOpen, setOffenseOpen] = useState(false);
  const [offenseViewMode, setOffenseViewMode] =
    useState<OffenseViewMode>("team");
  const [offenseDrilldown, setOffenseDrilldown] =
    useState<TeamOffenseDrilldown | null>(null);
  const [offenseLoading, setOffenseLoading] = useState(false);
  const [offenseError, setOffenseError] = useState<string | null>(null);

  // --- Player data (player / parent view, and for coach "self" view) ---

  const [playerStats, setPlayerStats] = useState<PlayerStatsOverview | null>(
    null
  );
  const [playerStatsLoading, setPlayerStatsLoading] = useState(false);
  const [playerStatsError, setPlayerStatsError] = useState<string | null>(null);

  const [playerMedals, setPlayerMedals] = useState<PlayerMedalWithDefinition[]>(
    []
  );

  // Load teams for coach-like users
  useEffect(() => {
    if (!isCoachLike) return;

    let cancelled = false;
    setTeamsLoading(true);
    setTeamsError(null);

    getMyTeams()
      .then((data) => {
        if (cancelled) return;
        setTeams(data ?? []);
        if (!selectedTeamId && data && data.length > 0) {
          setSelectedTeamId(data[0].id);
        }
      })
      .catch((err: any) => {
        if (cancelled) return;
        console.error("Error loading teams for stats page:", err);
        setTeamsError(
          err?.response?.data?.error ||
            err?.message ||
            "Failed to load your teams."
        );
      })
      .finally(() => {
        if (cancelled) return;
        setTeamsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isCoachLike, selectedTeamId]);

  // Load team stats & trophies when team changes in team view
  useEffect(() => {
    if (!selectedTeamId || !isCoachLike || viewMode !== "team") {
      return;
    }

    let cancelled = false;
    setTeamStatsLoading(true);
    setTeamStatsError(null);

    (async () => {
      try {
        const [stats, trophiesRes] = await Promise.all([
          getTeamStatsOverview(selectedTeamId),
          getTeamTrophies(selectedTeamId),
        ]);

        if (cancelled) return;

        setTeamStats(stats);
        setTeamTrophies(trophiesRes?.trophies ?? []);
      } catch (err: any) {
        if (cancelled) return;
        console.error("Error loading team stats overview:", err);
        setTeamStats(null);
        setTeamStatsError(
          err?.response?.data?.error ||
            err?.message ||
            "Failed to load team stats."
        );
      } finally {
        if (cancelled) return;
        setTeamStatsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedTeamId, isCoachLike, viewMode]);

  // Load offense drilldown when accordion opens
  useEffect(() => {
    if (!selectedTeamId || !isCoachLike || viewMode !== "team" || !offenseOpen) {
      return;
    }

    let cancelled = false;
    setOffenseLoading(true);
    setOffenseError(null);

    getTeamOffenseDrilldown(selectedTeamId)
      .then((data) => {
        if (cancelled) return;
        setOffenseDrilldown(data);
      })
      .catch((err: any) => {
        if (cancelled) return;
        console.error("Error loading team offense drilldown:", err);

        const msg =
          err?.response?.data?.error ||
          err?.message ||
          "Failed to load team offense breakdown.";

        // Treat "no offense ratings" as a non-error empty state
        if (typeof msg === "string" && msg.toLowerCase().includes("no offense")) {
          setOffenseDrilldown(null);
          setOffenseError(null);
        } else {
          setOffenseDrilldown(null);
          setOffenseError(msg);
        }
      })
      .finally(() => {
        if (cancelled) return;
        setOffenseLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedTeamId, isCoachLike, viewMode, offenseOpen]);

  // Load player stats & medals (used for player view and later ranking)
  useEffect(() => {
    if (!playerId) return;

    let cancelled = false;
    setPlayerStatsLoading(true);
    setPlayerStatsError(null);

    (async () => {
      try {
        const [stats, medalsRes] = await Promise.all([
          getPlayerStatsOverview(playerId),
          getPlayerMedals(playerId),
        ]);

        if (cancelled) return;
        setPlayerStats(stats);
        setPlayerMedals(medalsRes?.medals ?? []);
      } catch (err: any) {
        if (cancelled) return;
        console.error("Error loading player stats overview:", err);
        setPlayerStats(null);
        setPlayerStatsError(
          err?.response?.data?.error ||
            err?.message ||
            "Failed to load your stats."
        );
      } finally {
        if (cancelled) return;
        setPlayerStatsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [playerId]);

  const teamMetricsByCode = useMemo(() => {
    const map = new Map<
      CoreMetricCode,
      { label: string; score: number | null; percent: number | null }
    >();
    if (teamStats?.metrics) {
      for (const metric of teamStats.metrics) {
        map.set(metric.code, {
          label: metric.label,
          score: metric.score,
          percent: metric.percent,
        });
      }
    }
    return map;
  }, [teamStats]);

  const bestTrophiesByMetric = useMemo(() => {
    const result: Partial<
      Record<CoreMetricCode, TeamTrophyWithDefinition | null>
    > = {};
    if (!teamTrophies?.length) return result;

    for (const code of METRIC_ORDER) {
      result[code] = pickBestTrophyForMetric(code, teamTrophies);
    }
    return result;
  }, [teamTrophies]);

  const bestMedalsByMetric = useMemo(() => {
    const result: Record<string, PlayerMedalWithDefinition | null> = {};
    if (!playerMedals?.length) return result;

    const tierRank = (tier: TrophyTier | null | undefined) => {
      if (!tier) return -1;
      return TROPHY_TIER_ORDER.indexOf(tier as TrophyTier);
    };

    for (const medal of playerMedals) {
      const code = medal.definition?.metric_code;
      if (!code) continue;

      const existing = result[code];
      if (!existing) {
        result[code] = medal;
        continue;
      }

      const existingTier = tierRank(existing.definition?.tier);
      const thisTier = tierRank(medal.definition?.tier);

      if (thisTier > existingTier) {
        result[code] = medal;
      } else if (thisTier === existingTier) {
        const existingTime = existing.awarded_at
          ? new Date(existing.awarded_at).getTime()
          : 0;
        const thisTime = medal.awarded_at
          ? new Date(medal.awarded_at).getTime()
          : 0;
        if (thisTime > existingTime) {
          result[code] = medal;
        }
      }
    }

    return result;
  }, [playerMedals]);

  const displayName =
    profile?.display_name ||
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") ||
    profile?.email ||
    "Player";

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-50">Stats</h1>
          <p className="text-sm text-slate-300">
            {isCoachLike
              ? "View BPOP ratings, trophies, and offense breakdowns for your teams."
              : "See how you stack up from your BPOP evaluations."}
          </p>
        </div>

        {isCoachLike && (
          <div className="inline-flex rounded-full bg-slate-900/80 border border-slate-700 text-xs overflow-hidden">
            <button
              type="button"
              onClick={() => setViewMode("team")}
              className={[
                "px-3 py-1",
                viewMode === "team"
                  ? "bg-amber-500 text-slate-900"
                  : "text-slate-300",
              ].join(" ")}
            >
              Team view
            </button>
            <button
              type="button"
              onClick={() => setViewMode("player")}
              className={[
                "px-3 py-1",
                viewMode === "player"
                  ? "bg-amber-500 text-slate-900"
                  : "text-slate-300",
              ].join(" ")}
            >
              My stats
            </button>
          </div>
        )}
      </header>

      {viewMode === "team" && isCoachLike ? (
        <>
          {/* Team selector */}
          <section className="rounded-xl bg-slate-900/70 border border-slate-700 p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-50">
                  Team overview
                </h2>
                <p className="text-xs text-slate-400">
                  Choose a team to see its BPOP rating and core category scores.
                </p>
              </div>

              <div className="flex items-center gap-2">
                {teamsLoading && (
                  <span className="text-xs text-slate-400">
                    Loading teams…
                  </span>
                )}
                {teamsError && (
                  <span className="text-xs text-red-400">{teamsError}</span>
                )}
                {teams.length > 0 && (
                  <select
                    value={selectedTeamId ?? ""}
                    onChange={(e) =>
                      setSelectedTeamId(e.target.value || null)
                    }
                    className="text-xs bg-slate-950/80 border border-slate-700 rounded-md px-2 py-1 text-slate-100"
                  >
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {/* Team metrics grid */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 mt-2">
              {teamStatsLoading && (
                <div className="sm:col-span-2 lg:col-span-5 text-xs text-slate-400">
                  Loading team stats…
                </div>
              )}

              {teamStatsError && (
                <div className="sm:col-span-2 lg:col-span-5 text-xs text-red-400">
                  {teamStatsError}
                </div>
              )}

              {!teamStatsLoading && !teamStatsError && teamStats && (
                <>
                  {METRIC_ORDER.map((code) => {
                    const metric = teamMetricsByCode.get(code);
                    if (!metric) return null;
                    const trophy = bestTrophiesByMetric[code] ?? null;
                    return (
                      <MetricCard
                        key={code}
                        metric={metric}
                        trophy={trophy}
                      />
                    );
                  })}
                </>
              )}
            </div>
          </section>

          {/* Offense drilldown accordion (Block 2A) */}
          <OffenseDrilldownSection
            isOpen={offenseOpen}
            onToggle={() => setOffenseOpen((prev) => !prev)}
            drilldown={offenseDrilldown}
            loading={offenseLoading}
            error={offenseError}
            viewMode={offenseViewMode}
            onViewModeChange={setOffenseViewMode}
          />
        </>
      ) : (
        <>
          {/* Player view */}
          <section className="rounded-xl bg-slate-900/70 border border-slate-700 p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-50">
                  {displayName}&apos;s overview
                </h2>
                <p className="text-xs text-slate-400">
                  Latest BPOP rating and medal progress (player view).
                </p>
              </div>
            </div>

            {playerStatsLoading && (
              <p className="text-xs text-slate-400">Loading your stats…</p>
            )}
            {playerStatsError && (
              <p className="text-xs text-red-400">{playerStatsError}</p>
            )}

            {!playerStatsLoading && !playerStatsError && playerStats && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 mt-2">
                {playerStats.metrics.map((metric) => {
                  const code = metric.code.toLowerCase();
                  const medal =
                    bestMedalsByMetric[metric.code] ??
                    bestMedalsByMetric[code];
                  return (
                    <div
                      key={metric.code}
                      className="rounded-xl bg-slate-900/70 border border-slate-700 p-3 flex flex-col gap-2"
                    >
                      <div>
                        <div className="text-xs uppercase tracking-wide text-slate-400">
                          {metric.label}
                        </div>
                        <div className="flex items-baseline gap-2 mt-1">
                          <div className="text-2xl font-semibold text-slate-50">
                            {formatNumber(metric.score)}
                          </div>
                          <div className="text-xs text-slate-400">
                            {metric.percent !== null &&
                            metric.percent !== undefined
                              ? `${formatNumber(metric.percent, 0)}%`
                              : "—"}
                          </div>
                        </div>
                      </div>
                      {medal && (
                        <div className="mt-1">
                          <MedalChip medal={medal} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {!playerStatsLoading &&
              !playerStatsError &&
              (!playerStats || !playerStats.metrics.length) && (
                <p className="text-xs text-slate-400">
                  No ratings yet. Once you&apos;ve completed an evaluation,
                  we&apos;ll show your BPOP scores here.
                </p>
              )}
          </section>

          {/* Placeholder for full medal history / rankings (Block 2B/2C) */}
          <section className="rounded-xl bg-slate-900/70 border border-slate-700 p-4 space-y-2">
            <h3 className="text-sm font-semibold text-slate-50">
              Awards & ranking (coming next)
            </h3>
            <p className="text-xs text-slate-400">
              In the next blocks we&apos;ll add a full medal history accordion
              and leaderboards so you can see exactly where you rank on your
              team and across BPOP.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
