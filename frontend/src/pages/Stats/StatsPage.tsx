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
  OffenseTestBreakdown,
} from "../../api/types";
import { getMetricMeta } from "../../config/metricMeta";

// Local union for the offense drilldown cards we show in the UI
type OffenseMetricCode =
  | "offense"
  | "contact"
  | "power"
  | "speed"
  | "strikechance";

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

/**
 * Strike chance helpers – handle either 0–1 or 0–100 coming from the backend.
 */
function normalizeStrikeChanceValue(
  raw: number | null | undefined
): number | null {
  if (raw === null || raw === undefined || !Number.isFinite(raw)) return null;
  const n = Number(raw);
  if (n < 0) return null;
  // If <= 1, assume fraction (0–1) and convert to percent
  return n <= 1 ? n * 100 : n;
}

function formatStrikePercent(
  raw: number | null | undefined,
  decimals: number = 1
): string {
  const val = normalizeStrikeChanceValue(raw);
  if (val === null) return "—";
  return `${val.toFixed(decimals)}%`;
}

// Convert a 0–50 contact score into a realistic StrikeChance %, using:
//   SC% = (1 - (ContactPercent / 90)) * 100
// where ContactPercent is the contact score converted from 0–50 to 0–100.
function computeStrikePercentFromContactScore(
  contactScore50: number | null | undefined
): number | null {
  if (
    contactScore50 === null ||
    contactScore50 === undefined ||
    !Number.isFinite(contactScore50)
  ) {
    return null;
  }

  // First convert the 0–50 normalized score into a 0–100 percent.
  const contactPercent = (Number(contactScore50) / 50) * 100;

  // Apply the formula you provided.
  const raw = (1 - contactPercent / 90) * 100;

  // Clamp to a sensible 0–100 range.
  const clamped = Math.max(0, Math.min(100, raw));
  return clamped;
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

// Map backend offense test IDs → canonical metric keys in metricMeta.
// The backend OffenseTestBreakdown.id is still the internal test id
// (tee_ld_points, pitch_points, bat_speed_points, run_1b_points, etc.)
const OFFENSE_TEST_FIELD_TO_METRIC_KEY: Record<string, string> = {
  // Contact – quality of contact points
  tee_ld_points: "tee_line_drive_test_10",
  pitch_points: "m_10_fastball_quality",
  curveball_points: "m_5_curveball_quality",
  varied_speed_points: "m_5_varied_speed_quality",

  // Power – we’ll show MPH for these
  bat_speed_points: "max_bat_speed",
  exit_velo_points: "max_exit_velo_tee",

  // Speed – timed runs; we’ll use secs + ft/s (value will be ft/s)
  run_1b_points: "timed_run_1b",
  run_4b_points: "timed_run_4b",
};

// Tiny helpers to detect “special” tests by id/metric key
const POWER_TEST_IDS = new Set<string>(["bat_speed_points", "exit_velo_points"]);
const SPEED_TEST_IDS = new Set<string>(["run_1b_points", "run_4b_points"]);

function isPowerTest(testId: string, metricKey?: string | null) {
  return (
    POWER_TEST_IDS.has(testId) ||
    metricKey === "max_bat_speed" ||
    metricKey === "max_exit_velo_tee"
  );
}

function isSpeedTest(testId: string, metricKey?: string | null) {
  return (
    SPEED_TEST_IDS.has(testId) ||
    metricKey === "timed_run_1b" ||
    metricKey === "timed_run_4b"
  );
}

function getHumanizedTestMeta(
  test: OffenseTestBreakdown
): {
  label: string;
  metricKey?: string;
  unit?: string | null;
} {
  const metricKey = OFFENSE_TEST_FIELD_TO_METRIC_KEY[test.id];
  const meta = metricKey ? (getMetricMeta(metricKey) as any) : undefined;

  // Priority: shortLabel → displayName → backend label
  const label =
    meta?.shortLabel ??
    meta?.displayName ??
    test.label;

  return {
    label,
    metricKey,
    unit: meta?.unit ?? null,
  };
}



type OffenseDrilldownViewMode = "team" | "players";

interface OffenseTestsForMetricProps {
  metricCode: OffenseMetricCode;
  drilldown: TeamOffenseDrilldown | null;
  viewMode: OffenseDrilldownViewMode;
}

/**
 * Per‑metric test breakdown chip list + per‑test leaderboards.
 * Uses TeamOffenseDrilldown.tests_by_metric.
 *
 * Special handling:
 *  - Contact tests: show points as "Score"
 *  - Power tests (bat speed / exit velo): show MPH
 *  - Speed tests (1B / 4B): show Time (s), Speed (ft/s), Base (ft)
 */
function OffenseTestsForMetric({
  metricCode,
  drilldown,
  viewMode,
}: OffenseTestsForMetricProps) {
  if (!drilldown) return null;

  const rawTests =
    ((drilldown as any).tests_by_metric?.[
      metricCode
    ] as OffenseTestBreakdown[] | undefined) ?? [];

  // Filter out "raw score" helpers (Contact Raw Score, Power Raw Score, Speed Raw Score, etc.)
  const tests = rawTests.filter((t) => {
    const label = (t.label || "").toLowerCase();
    if (label.includes("raw score")) return false;
    return true;
  });

  if (!tests.length) return null;

  const metricLabelMap: Record<OffenseMetricCode, string> = {
    offense: "Overall offense tests",
    contact: "Contact tests",
    power: "Power tests",
    speed: "Speed tests",
    strikechance: "Strikeout‑chance tests",
  };

  const metricLabel = metricLabelMap[metricCode];

  const parseNum = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;

  // TEAM VIEW: test tiles with team averages
  if (viewMode === "team") {
    return (
      <div className="mt-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
          {metricLabel}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {tests.map((test) => {
            const { label, metricKey } = getHumanizedTestMeta(test);

            const powerTest = isPowerTest(test.id, metricKey);
            const speedTest = isSpeedTest(test.id, metricKey);

            // Collect numeric values from players
            const numericValues = (test.per_player || [])
              .map((p) =>
                typeof p.value === "number" && !Number.isNaN(p.value)
                  ? p.value
                  : null
              )
              .filter((v): v is number => v !== null);

            const rawAvg =
              test.team_average !== null &&
              test.team_average !== undefined &&
              !Number.isNaN(test.team_average)
                ? test.team_average
                : numericValues.length
                ? numericValues.reduce((sum, v) => sum + v, 0) /
                  numericValues.length
                : null;

            // How we display the team average number
            let avgDisplay: string;

            if (test.submetric === "strikechance") {
              avgDisplay = formatStrikePercent(rawAvg);
            } else if (powerTest) {
              // Power tests → show MPH
              avgDisplay =
                rawAvg === null ? "—" : `${rawAvg.toFixed(1)} mph`;
            } else {
              avgDisplay = rawAvg === null ? "—" : rawAvg.toFixed(1);
            }

            // Optional extra aggregates for speed tests
            // These will be wired from the backend later.
            let avgSeconds: number | null = null;
            let avgFeetPerSecond: number | null = null;
            let basePathFeet: number | null = null;

            if (speedTest) {
              const t = test as any;
              avgSeconds = parseNum(
                t.team_avg_seconds ?? t.avg_seconds ?? null
              );
              avgFeetPerSecond = parseNum(
                t.team_avg_feet_per_second ??
                  t.avg_feet_per_second ??
                  rawAvg
              );
              basePathFeet = parseNum(
                t.base_path_feet ?? t.base_feet ?? null
              );
            }

            // Mini rubric: use the underlying 0–50-style score.
            // RubricBar already clamps 0–50.
            const rubricScore =
              test.submetric === "strikechance" || rawAvg == null
                ? null
                : rawAvg;

            return (
              <div
                key={test.id}
                className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2"
              >
                <div className="text-sm font-medium text-slate-100">
                  {label}
                </div>

                {/* Speed-only line: avg time / speed / base (team level) */}
                {speedTest &&
                  (avgSeconds !== null ||
                    avgFeetPerSecond !== null ||
                    basePathFeet !== null) && (
                    <div className="mt-0.5 text-[11px] text-slate-400 space-x-2">
                      {avgSeconds !== null && (
                        <span>
                          Avg time:{" "}
                          <span className="font-mono text-slate-50">
                            {avgSeconds.toFixed(2)}s
                          </span>
                        </span>
                      )}
                      {avgFeetPerSecond !== null && (
                        <span>
                          Avg speed:{" "}
                          <span className="font-mono text-slate-50">
                            {avgFeetPerSecond.toFixed(2)} ft/s
                          </span>
                        </span>
                      )}
                      {basePathFeet !== null && (
                        <span>
                          Base:{" "}
                          <span className="font-mono text-slate-50">
                            {basePathFeet.toFixed(0)} ft
                          </span>
                        </span>
                      )}
                    </div>
                  )}

                <div className="mt-1 text-xs text-slate-300 flex items-center justify-between">
                  <span>
                    Team avg:{" "}
                    <span className="font-mono text-slate-50">
                      {avgDisplay}
                    </span>
                  </span>
                  <span className="text-[10px] text-slate-500">
                    n={test.player_count}
                  </span>
                </div>

                {/* Mini rubric bar for this test */}
                {rubricScore !== null && (
                  <div className="mt-1 max-w-[140px]">
                    <RubricBar score={rubricScore} showLabels={false} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }


  // PLAYERS VIEW: per‑test leaderboards
  return (
    <div className="mt-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
        {metricLabel}
      </div>
      <div className="space-y-3">
        {tests.map((test) => {
          const { label, metricKey } = getHumanizedTestMeta(test);
          const perPlayer = [...(test.per_player ?? [])];

          const powerTest = isPowerTest(test.id, metricKey);
          const speedTest = isSpeedTest(test.id, metricKey);

          // Sort “best first”
          perPlayer.sort((a, b) => {
            const va = parseNum(a.value) ?? 0;
            const vb = parseNum(b.value) ?? 0;
            if (metricCode === "strikechance") {
              // Lower K% is better
              return va - vb;
            }
            // Otherwise higher is better
            return vb - va;
          });

          return (
            <div
              key={test.id}
              className="rounded-lg bg-slate-950/40 border border-slate-800 p-3"
            >
              <div className="text-xs font-semibold text-slate-200 mb-2">
                {label}
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="text-slate-400">
                      <th className="text-left py-1 pr-2">Player</th>
                      {speedTest ? (
                        <>
                          <th className="text-right py-1 px-2">Time (s)</th>
                          <th className="text-right py-1 px-2">
                            Speed (ft/s)
                          </th>
                          <th className="text-right py-1 pl-2">Base (ft)</th>
                        </>
                      ) : (
                        <th className="text-right py-1 pl-2">
                          {metricCode === "strikechance"
                            ? "K%"
                            : powerTest
                            ? "MPH"
                            : "Score"}
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {perPlayer.map((row) => {
                      const displayName =
                        row.player_name ??
                        `Player ${row.player_id.slice(0, 8)}…`;
                      const jersey =
                        row.jersey_number != null
                          ? `#${row.jersey_number} `
                          : "";

                      if (speedTest) {
                        const seconds = parseNum(
                          (row as any).raw_seconds
                        );
                        const fps = parseNum(row.value);
                        const dist = parseNum(
                          (row as any).raw_distance_ft
                        );

                        return (
                          <tr
                            key={row.player_id}
                            className="border-t border-slate-800"
                          >
                            <td className="py-1 pr-2">
                              <span className="font-medium text-slate-100">
                                {jersey}
                                {displayName}
                              </span>
                            </td>
                            <td className="py-1 px-2 text-right">
                              {seconds != null
                                ? seconds.toFixed(2)
                                : "—"}
                            </td>
                            <td className="py-1 px-2 text-right">
                              {fps != null ? fps.toFixed(2) : "—"}
                            </td>
                            <td className="py-1 pl-2 text-right">
                              {dist != null ? dist.toFixed(0) : "—"}
                            </td>
                          </tr>
                        );
                      }

                      let valueDisplay = "—";

                      if (metricCode === "strikechance") {
                        valueDisplay = formatStrikePercent(row.value);
                      } else if (powerTest) {
                        const mph = parseNum(row.value);
                        valueDisplay =
                          mph != null ? `${mph.toFixed(1)} mph` : "—";
                      } else {
                        const v = parseNum(row.value);
                        valueDisplay =
                          v != null ? v.toFixed(1) : "—";
                      }

                      return (
                        <tr
                          key={row.player_id}
                          className="border-t border-slate-800"
                        >
                          <td className="py-1 pr-2">
                            <span className="font-medium text-slate-100">
                              {jersey}
                              {displayName}
                            </span>
                          </td>
                          <td className="py-1 pl-2 text-right">
                            {valueDisplay}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}



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

  // Use 0–150 visual scores for offense/contact/power/speed
  // and the derived StrikeChance% from contact for K%.
  const getMetricValue = (p: (typeof drilldown.players)[number]) => {
    switch (code) {
      case "offense":
        return p.hitting_score != null ? p.hitting_score * 3 : null; // 0–150
      case "contact":
        return p.contact_score != null ? p.contact_score * 3 : null; // 0–150
      case "power":
        return p.power_score != null ? p.power_score * 3 : null; // 0–150
      case "speed":
        return p.speed_score != null ? p.speed_score * 3 : null; // 0–150
      case "strikechance":
        return computeStrikePercentFromContactScore(p.contact_score);
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
            : "Higher score (0–150) is better."}
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
              // Derive StrikeChance from this player's contact score.
              const strikePercent = computeStrikePercentFromContactScore(
                p.contact_score
              );
              const kPercent =
                strikePercent == null
                  ? "—"
                  : `${strikePercent.toFixed(1)}%`;

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
                    {formatNumber(
                      p.hitting_score != null ? p.hitting_score * 3 : null,
                      0
                    )}
                  </td>
                  <td
                    className={[
                      "px-2 py-1",
                      highlightClass("contact"),
                    ].join(" ")}
                  >
                    {formatNumber(
                      p.contact_score != null ? p.contact_score * 3 : null,
                      0
                    )}
                  </td>
                  <td
                    className={[
                      "px-2 py-1",
                      highlightClass("power"),
                    ].join(" ")}
                  >
                    {formatNumber(
                      p.power_score != null ? p.power_score * 3 : null,
                      0
                    )}
                  </td>
                  <td
                    className={[
                      "px-2 py-1",
                      highlightClass("speed"),
                    ].join(" ")}
                  >
                    {formatNumber(
                      p.speed_score != null ? p.speed_score * 3 : null,
                      0
                    )}
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
 *   - Team view: per‑metric panels + test‑level tiles
 *   - Player view: per‑metric leaderboard + per‑test mini leaderboards
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
    const map = new Map<
      OffenseMetricCode,
      { label: string; value: number | null }
    >();

    if (drilldown?.metrics) {
      for (const m of drilldown.metrics as any[]) {
        const code = m.code as OffenseMetricCode;
        if (!OFFENSE_METRIC_CODES.includes(code)) continue;
        map.set(code, { label: m.label, value: m.team_average ?? null });
      }
    }

    // Derive StrikeChance from the contact score, using the 0–50 normalized contact value.
    const contactMetric = map.get("contact");
    if (contactMetric) {
      const strikePercent = computeStrikePercentFromContactScore(
        contactMetric.value
      );
      map.set("strikechance", {
        label: "Strikeout chance (lower is better)",
        value: strikePercent,
      });
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
                  const rawValue = m.value;

                  let displayMain = "—";
                  if (rawValue !== null && rawValue !== undefined) {
                    if (isStrike) {
                      // rawValue is already a 0–100 StrikeChance %
                      displayMain = formatStrikePercent(rawValue, 1);
                    } else {
                      // Visual 0–150 scale for the 0–50 score.
                      const scaled = rawValue * 3;
                      displayMain = formatNumber(scaled, 0);
                    }
                  }

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
                        {displayMain}
                      </div>

                      {/* Small rubric strip for non-percent metrics */}
                      {!isStrike && (
                        <div className="mt-1">
                          <RubricBar score={rawValue} showLabels={false} />
                        </div>
                      )}

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
                    const rawValue = m.value;

                    let displayMain = "—";
                    if (rawValue !== null && rawValue !== undefined) {
                      if (isStrike) {
                        displayMain = formatStrikePercent(rawValue, 1);
                      } else {
                        const scaled = rawValue * 3;
                        displayMain = formatNumber(scaled, 0);
                      }
                    }

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
                              {displayMain}
                            </span>
                          </div>
                        </div>

                        {!isStrike && (
                          <div className="mt-2">
                          </div>
                        )}

                        {/* Test‑level tiles for this metric */}
                        <OffenseTestsForMetric
                          metricCode={code}
                          drilldown={drilldown}
                          viewMode="team"
                        />
                      </div>
                    );
                  })}
                </div>
              ) : (

                <div className="space-y-6">
                  {activeMetrics.map((code) => (
                    <div key={code} className="space-y-3">
                      <PlayerGridForMetric code={code} drilldown={drilldown} />
                      <OffenseTestsForMetric
                        metricCode={code}
                        drilldown={drilldown}
                        viewMode="players"
                      />
                    </div>
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
          // Frontend‑only scaling: show scores on a 0–150 scale instead of 0–50
          score: metric.score != null ? metric.score * 3 : null,
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
                        <div className="mt-1 flex items-baseline gap-2">
                          <div className="text-2xl font-semibold text-slate-50">
                            {formatNumber(
                              metric.score != null ? metric.score * 3 : null
                            )}
                          </div>
                          <div className="text-xs text-slate-400">
                            {metric.percent !== null && metric.percent !== undefined
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
