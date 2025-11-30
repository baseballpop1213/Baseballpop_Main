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

// Local union for the offense drilldown cards we show in the UI
type OffenseMetricCode = "offense" | "contact" | "power" | "speed" | "strikechance";

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

const OFFENSE_METRIC_CODES: OffenseMetricCode[] = [
  "offense",
  "contact",
  "power",
  "speed",
  "strikechance",
];

function formatNumber(
  value: number | null | undefined,
  decimals: number = 1
): string {
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
      <span className="font-semibold truncate max-w-[140px]" title={name}>
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
      <span className="font-semibold truncate max-w-[140px]" title={label}>
        {label}
      </span>
    </span>
  );
}

interface RubricBarProps {
  score: number | null; // 0–50 scale
  showLabels?: boolean;
}

/**
 * Simple red / yellow / green bar with equal segments.
 * BPOP uses labels; other metrics just use the colors.
 */
function RubricBar({ score, showLabels = false }: RubricBarProps) {
  const clamped =
    score === null || score === undefined
      ? null
      : Math.max(0, Math.min(50, score));

  const segments = [
    { label: "Developing", color: "bg-rose-500/70" },
    { label: "Competitive", color: "bg-amber-400/70" },
    { label: "Elite", color: "bg-emerald-500/70" },
  ];

  return (
    <div className="mt-2">
      <div className="relative h-2 rounded-full overflow-hidden bg-slate-800 flex">
        {segments.map((seg) => (
          <div key={seg.label} className={`${seg.color} flex-1`} />
        ))}
        {clamped !== null && (
          <div
            className="absolute top-[-3px] h-4 w-[2px] bg-white rounded-full shadow"
            style={{ left: `${(clamped / 50) * 100}%` }}
          />
        )}
      </div>
      {showLabels && (
        <div className="mt-1 flex justify-between text-[10px] text-slate-400">
          {segments.map((seg) => (
            <span key={seg.label}>{seg.label}</span>
          ))}
        </div>
      )}
    </div>
  );
}

interface MetricCardProps {
  metric:
    | {
        label: string;
        score: number | null;
        percent: number | null;
      }
    | null
    | undefined;
  trophy?: TeamTrophyWithDefinition | null;
  active?: boolean;
  onClick?: () => void;
  showRubric?: boolean;
  rubricShowLabels?: boolean;
}

/**
 * Generic metric card used in the team overview.
 * - BPOP uses showRubric + rubricShowLabels
 * - Offense/Defense/Pitching/Athletic use showRubric without labels
 */
function MetricCard({
  metric,
  trophy,
  active = false,
  onClick,
  showRubric = false,
  rubricShowLabels = false,
}: MetricCardProps) {
  if (!metric) return null;

  const clickable = !!onClick;

  return (
    <div
      onClick={onClick}
      className={[
        "rounded-xl bg-slate-900/70 border p-3 flex flex-col justify-between gap-2 transition",
        active
          ? "border-amber-400 shadow-sm"
          : "border-slate-700 hover:border-amber-400/60",
        clickable ? "cursor-pointer" : "",
      ].join(" ")}
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
            {metric.percent !== null && metric.percent !== undefined
              ? `${formatNumber(metric.percent, 0)}%`
              : "—"}
          </div>
        </div>
        {showRubric && (
          <RubricBar score={metric.score} showLabels={rubricShowLabels} />
        )}
      </div>
      {trophy && (
        <div className="mt-1">
          <TrophyChip trophy={trophy} />
        </div>
      )}
    </div>
  );
}

/**
 * Player leaderboard for a specific offense metric.
 * Uses the TeamOffenseDrilldown players array and sorts by the chosen metric.
 */
function PlayerGridForMetric({
  code,
  drilldown,
}: {
  code: OffenseMetricCode;
  drilldown: TeamOffenseDrilldown;
}) {
  const labelMap: Record<OffenseMetricCode, string> = {
    offense: "Offense score",
    contact: "Contact score",
    power: "Power score",
    speed: "Speed score",
    strikechance: "Strikeout chance (K%)",
  };

  const players = [...(drilldown.players ?? [])];

  const getMetricValue = (p: (typeof drilldown.players)[number]) => {
    switch (code) {
      case "offense":
        return p.hitting_score ?? null;
      case "contact":
        return p.contact_score ?? null;
      case "power":
        return p.power_score ?? null;
      case "speed":
        return p.speed_score ?? null;
      case "strikechance":
        return p.strike_chance ?? null;
      default:
        return null;
    }
  };

  players.sort((a, b) => {
    const va = getMetricValue(a);
    const vb = getMetricValue(b);

    if (code === "strikechance") {
      // For K%, lower is better → sort ascending
      const nva = va ?? Infinity;
      const nvb = vb ?? Infinity;
      if (nva === nvb) {
        return (a.player_name || "").localeCompare(b.player_name || "");
      }
      return nva - nvb;
    } else {
      // For the other metrics, higher is better → sort descending
      const nva = va ?? -Infinity;
      const nvb = vb ?? -Infinity;
      if (nva === nvb) {
        return (a.player_name || "").localeCompare(b.player_name || "");
      }
      return nvb - nva;
    }
  });

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <div className="text-xs font-semibold text-slate-200">
          {labelMap[code]} – player grid
        </div>
        <div className="text-[10px] text-slate-400">
          {code === "strikechance"
            ? "Lower K% is better."
            : "Higher score is better."}
        </div>
      </div>
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
              <th className="px-2 py-1 font-semibold">K% (lower is better)</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => {
              const rawStrike = p.strike_chance ?? null;
              const kPercent =
                rawStrike === null || rawStrike === undefined
                  ? "—"
                  : `${formatNumber(rawStrike * 100, 1)}%`;

              const name =
                p.player_name ?? `Player ${p.jersey_number ?? ""}`.trim();

              const highlightClass = (target: OffenseMetricCode) =>
                code === target ? "font-semibold text-amber-200" : "";

              return (
                <tr
                  key={p.player_id}
                  className="border-t border-slate-800 text-slate-100"
                >
                  <td className="px-2 py-1">{name}</td>
                  <td className="px-2 py-1">{p.jersey_number ?? "—"}</td>
                  <td
                    className={[
                      "px-2 py-1",
                      highlightClass("offense"),
                    ].join(" ")}
                  >
                    {formatNumber(p.hitting_score)}
                  </td>
                  <td
                    className={[
                      "px-2 py-1",
                      highlightClass("contact"),
                    ].join(" ")}
                  >
                    {formatNumber(p.contact_score)}
                  </td>
                  <td
                    className={[
                      "px-2 py-1",
                      highlightClass("power"),
                    ].join(" ")}
                  >
                    {formatNumber(p.power_score)}
                  </td>
                  <td
                    className={[
                      "px-2 py-1",
                      highlightClass("speed"),
                    ].join(" ")}
                  >
                    {formatNumber(p.speed_score)}
                  </td>
                  <td
                    className={[
                      "px-2 py-1",
                      highlightClass("strikechance"),
                    ].join(" ")}
                  >
                    {kPercent}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Offense drilldown section – no accordion.
 * - Header contains the "Team averages / Player grid" toggle
 * - Top row = clickable summary cards (Offense / Contact / Power / Speed / K%)
 * - Below that:
 *   - Team view: simple per-metric panels (ready for test-level details)
 *   - Player view: one leaderboard table per active metric
 */
function OffenseDrilldownSection({
  drilldown,
  loading,
  error,
  viewMode,
  onViewModeChange,
}: {
  drilldown: TeamOffenseDrilldown | null;
  loading: boolean;
  error: string | null;
  viewMode: OffenseViewMode;
  onViewModeChange: (mode: OffenseViewMode) => void;
}) {
  const [activeMetrics, setActiveMetrics] = useState<OffenseMetricCode[]>([
    "offense",
  ]);

  const metricsByCode = useMemo(() => {
    const map = new Map<OffenseMetricCode, { label: string; value: number | null }>();
    if (drilldown?.metrics) {
      for (const m of drilldown.metrics as any[]) {
        const code = m.code as OffenseMetricCode;
        map.set(code, { label: m.label, value: m.team_average ?? null });
      }
    }
    return map;
  }, [drilldown]);

  const hasAnyData =
    !!drilldown && !!drilldown.metrics && drilldown.metrics.length > 0;

  const toggleMetric = (code: OffenseMetricCode) => {
    setActiveMetrics((prev) => {
      if (prev.includes(code)) {
        // Keep at least one metric active.
        if (prev.length === 1) return prev;
        return prev.filter((c) => c !== code);
      }
      return [...prev, code];
    });
  };

  return (
    <section className="mt-6">
      <div className="rounded-xl bg-slate-900/70 border border-slate-700">
        {/* Header with view toggle */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 border-b border-slate-700">
          <div>
            <h3 className="text-sm font-semibold text-slate-50">
              Offense drilldown
            </h3>
            <p className="text-xs text-slate-400">
              Offense, contact, power, speed, and strikeout chance for this
              team.
            </p>
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

        <div className="px-4 py-3 space-y-4">
          {loading && (
            <p className="text-xs text-slate-400">
              Loading offense details…
            </p>
          )}

          {error && (
            <p className="text-xs text-red-400">
              Failed to load offense breakdown: {error}
            </p>
          )}

          {!loading && !error && !hasAnyData && (
            <p className="text-xs text-slate-400">
              No offense ratings yet for this team.
            </p>
          )}

          {!loading && !error && hasAnyData && drilldown && (
            <>
              {/* Top summary cards – clickable to toggle detail sections */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {OFFENSE_METRIC_CODES.map((code) => {
                  const m = metricsByCode.get(code);
                  if (!m) return null;

                  const isStrike = code === "strikechance";
                  const raw = m.value;
                  const display =
                    raw === null || raw === undefined
                      ? "—"
                      : isStrike
                      ? `${formatNumber(raw * 100, 1)}%`
                      : formatNumber(raw, 1);

                  const isActive = activeMetrics.includes(code);

                  return (
                    <button
                      key={code}
                      type="button"
                      onClick={() => toggleMetric(code)}
                      className={[
                        "text-left rounded-lg border px-3 py-2 bg-slate-950/60 transition",
                        isActive
                          ? "border-amber-400 shadow-sm"
                          : "border-slate-700 hover:border-amber-400/60",
                      ].join(" ")}
                    >
                      <div className="text-[11px] uppercase tracking-wide text-slate-400">
                        {m.label}
                      </div>
                      <div className="mt-1 text-lg font-semibold text-slate-50">
                        {display}
                      </div>
                      <div className="mt-0.5 text-[10px] text-slate-500">
                        {isActive
                          ? "Showing breakdown"
                          : "Tap to show breakdown"}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Detail area */}
              {viewMode === "team" ? (
                <div className="space-y-4">
                  {activeMetrics.map((code) => {
                    const m = metricsByCode.get(code);
                    if (!m) return null;

                    const isStrike = code === "strikechance";
                    const raw = m.value;
                    const display =
                      raw === null || raw === undefined
                        ? "—"
                        : isStrike
                        ? `${formatNumber(raw * 100, 1)}%`
                        : formatNumber(raw, 1);

                    return (
                      <div
                        key={code}
                        className="rounded-lg bg-slate-950/40 border border-slate-800 p-3"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1">
                          <div className="text-xs uppercase tracking-wide text-slate-400">
                            {m.label}
                          </div>
                          <div className="text-xs text-slate-300">
                            Team average:{" "}
                            <span className="font-semibold text-slate-50">
                              {display}
                            </span>
                          </div>
                        </div>
                        <p className="mt-1 text-[11px] text-slate-400">
                          This panel will show the{" "}
                          <span className="font-semibold">
                            per‑test breakdown
                          </span>{" "}
                          for this metric (tee line drives, hitting matrix,
                          etc.) once we wire those test scores through the
                          stats API.
                        </p>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-4">
                  {activeMetrics.map((code) => (
                    <PlayerGridForMetric
                      key={code}
                      code={code}
                      drilldown={drilldown}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
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

  // Which core metric's drilldown we are looking at (Offense / Defense / Pitching / Athletic).
  // For now only "offense" has a full implementation.
  const [activeCoreMetric, setActiveCoreMetric] =
    useState<CoreMetricCode>("offense");

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

  // Load offense drilldown whenever we’re in team view and have a team
  useEffect(() => {
    if (!selectedTeamId || !isCoachLike || viewMode !== "team") {
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
  }, [selectedTeamId, isCoachLike, viewMode]);

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

      const normalized = code.toLowerCase();
      const existing = result[normalized];

      if (!existing) {
        result[normalized] = medal;
        continue;
      }

      const existingTier = tierRank(existing.definition?.tier);
      const thisTier = tierRank(medal.definition?.tier);

      if (thisTier > existingTier) {
        result[normalized] = medal;
      } else if (thisTier === existingTier) {
        const existingTime = existing.awarded_at
          ? new Date(existing.awarded_at).getTime()
          : 0;
        const thisTime = medal.awarded_at
          ? new Date(medal.awarded_at).getTime()
          : 0;
        if (thisTime > existingTime) {
          result[normalized] = medal;
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
          {/* Team overview */}
          <section className="rounded-xl bg-slate-900/70 border border-slate-700 p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-50">
                  Team overview
                </h2>
                <p className="text-xs text-slate-400">
                  Choose a team to see its BPOP rating and core category
                  scores. Tap a category to drive the drilldown below.
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

            {/* Team metrics */}
            <div className="mt-2 space-y-3">
              {teamStatsLoading && (
                <div className="text-xs text-slate-400">
                  Loading team stats…
                </div>
              )}

              {teamStatsError && (
                <div className="text-xs text-red-400">{teamStatsError}</div>
              )}

              {!teamStatsLoading && !teamStatsError && teamStats && (
                <>
                  {/* BPOP hero */}
                  <div className="grid gap-3 sm:grid-cols-1 md:grid-cols-2">
                    <MetricCard
                      metric={teamMetricsByCode.get("bpoprating")}
                      trophy={bestTrophiesByMetric["bpoprating"] ?? null}
                      showRubric
                      rubricShowLabels
                    />
                  </div>

                  {/* Core categories under BPOP */}
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {(METRIC_ORDER.filter(
                      (code) => code !== "bpoprating"
                    ) as CoreMetricCode[]).map((code) => {
                      const metric = teamMetricsByCode.get(code);
                      if (!metric) return null;
                      const trophy = bestTrophiesByMetric[code] ?? null;
                      const isActive = activeCoreMetric === code;
                      return (
                        <MetricCard
                          key={code}
                          metric={metric}
                          trophy={trophy}
                          active={isActive}
                          onClick={() => setActiveCoreMetric(code)}
                          showRubric
                          // No labels on these – colors do the work
                          rubricShowLabels={false}
                        />
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </section>

          {/* Drilldown section for the active core metric */}
          {activeCoreMetric === "offense" ? (
            <OffenseDrilldownSection
              drilldown={offenseDrilldown}
              loading={offenseLoading}
              error={offenseError}
              viewMode={offenseViewMode}
              onViewModeChange={setOffenseViewMode}
            />
          ) : (
            <section className="mt-6">
              <div className="rounded-xl bg-slate-900/70 border border-slate-700 px-4 py-3">
                <h3 className="text-sm font-semibold text-slate-50">
                  {teamMetricsByCode.get(activeCoreMetric)?.label ??
                    "Drilldown"}
                </h3>
                <p className="mt-1 text-xs text-slate-400">
                  We&apos;ll add{" "}
                  {teamMetricsByCode
                    .get(activeCoreMetric)
                    ?.label.toLowerCase() ?? "this metric"}{" "}
                  drilldowns here in a later block. For now, select{" "}
                  <span className="font-semibold text-amber-400">Offense</span>{" "}
                  above to view the full contact/power/speed/strikeout
                  breakdown and team/player leaderboards.
                </p>
              </div>
            </section>
          )}
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
                    bestMedalsByMetric[code] ??
                    bestMedalsByMetric[metric.code];
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
