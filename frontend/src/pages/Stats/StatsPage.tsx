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
  getTeamDefenseDrilldown,
  getTeamEvaluations,
} from "../../api/stats";
import type {
  CoreMetricCode,
  TeamStatsOverview,
  PlayerStatsOverview,
  TeamTrophyWithDefinition,
  TrophyTier,
  PlayerMedalWithDefinition,
  TeamOffenseDrilldown,
  TeamDefenseDrilldown,
  TeamWithRole,
  OffenseTestBreakdown,
  TeamEvaluationOption,
  TeamEvalScope,
} from "../../api/types";
import { getMetricMeta } from "../../config/metricMeta";

// ------------------------ Athletic configs ------------------------

type AthleticCategoryCode = "speed" | "strength" | "power" | "balance" | "mobility";

type AthleticTestConfig = {
  category: AthleticCategoryCode;
  /** metricMeta key for labels / copy – numeric values still come from the breakdown key. */
  metricKey?: string;
  /** Hide helper/duplicate keys from the UI. */
  visible?: boolean;
  /** Optional hard‑coded unit override. */
  unitOverride?: string;
};

const ATHLETIC_TEST_KEY_CONFIG: Record<string, AthleticTestConfig> = {
  // ---------------------- SPEED ----------------------
  run_1b_fps: {
    category: "speed",
    metricKey: "timed_run_1b",
    unitOverride: "ft/s",
  },
  run_1b_seconds: {
    category: "speed",
    metricKey: "timed_run_1b",
  },
  run_1b_points: {
    category: "speed",
    metricKey: "timed_run_1b",
    visible: false,
  },

  run_4b_fps: {
    category: "speed",
    metricKey: "timed_run_4b",
    unitOverride: "ft/s",
  },
  run_4b_seconds: {
    category: "speed",
    metricKey: "timed_run_4b",
  },
  run_4b_points: {
    category: "speed",
    metricKey: "timed_run_4b",
    visible: false,
  },

  run_1b_distance_ft: {
    category: "speed",
    metricKey: "timed_run_1b_distance_ft",
  },
  run_4b_distance_ft: {
    category: "speed",
    metricKey: "timed_run_4b_distance_ft",
  },

  // -------------------- STRENGTH ---------------------
  // 30‑second versions (youth)
  situps_30_raw: {
    category: "strength",
    metricKey: "asit_30",
  },
  situps_30_points: {
    category: "strength",
    metricKey: "asit_30",
    visible: false,
  },
  pushups_30_raw: {
    category: "strength",
    metricKey: "apush_30",
  },
  pushups_30_points: {
    category: "strength",
    metricKey: "apush_30",
    visible: false,
  },

  // 60‑second versions (Pro / older)
  situps_60_raw: {
    category: "strength",
    metricKey: "asit_60",
  },
  situps_60_points: {
    category: "strength",
    metricKey: "asit_60",
    visible: false,
  },
  pushups_60_raw: {
    category: "strength",
    metricKey: "apush_60",
  },
  pushups_60_points: {
    category: "strength",
    metricKey: "apush_60",
    visible: false,
  },
  pullups_60_raw: {
    category: "strength",
    metricKey: "apull_60",
  },
  pullups_60_points: {
    category: "strength",
    metricKey: "apull_60",
    visible: false,
  },

  // ---------------------- POWER ----------------------
  vjump_inches_raw: {
    category: "power",
    metricKey: "asp_jump_inches",
  },
  vjump_points: {
    category: "power",
    metricKey: "asp_jump_inches",
    visible: false, // helper points; used for rubric only
  },

  aspscp_distance_ft: {
    category: "power",
    metricKey: "aspscp_distance_ft",
  },
  aspscp_points: {
    category: "power",
    metricKey: "aspscp_distance_ft",
    visible: false,
  },

  aspsup_distance_ft: {
    category: "power",
    metricKey: "aspsup_distance_ft",
  },
  aspsup_points: {
    category: "power",
    metricKey: "aspsup_distance_ft",
    visible: false,
  },

  // --------------------- BALANCE ---------------------
  sls_open_avg_seconds: {
    category: "balance",
    metricKey: "sls_eyes_open_right",
    visible: false,
  },
  sls_open_left_seconds: {
    category: "balance",
    metricKey: "sls_eyes_open_left",
  },
  sls_open_right_seconds: {
    category: "balance",
    metricKey: "sls_eyes_open_right",
  },
  sls_open_points: {
    category: "balance",
    metricKey: "sls_eyes_open_right",
    visible: false, // helper points row – used for rubrics only
  },

  sls_closed_avg_seconds: {
    category: "balance",
    metricKey: "sls_eyes_closed_right",
    visible: false,
  },
  sls_closed_left_seconds: {
    category: "balance",
    metricKey: "sls_eyes_closed_left",
  },
  sls_closed_right_seconds: {
    category: "balance",
    metricKey: "sls_eyes_closed_right",
  },
  sls_closed_points: {
    category: "balance",
    metricKey: "sls_eyes_closed_right",
    visible: false,
  },

  // --------------------- MOBILITY --------------------
  msr_right_raw: {
    category: "mobility",
    metricKey: "msr_right",
    visible: false,
  },
  msr_left_raw: {
    category: "mobility",
    metricKey: "msr_left",
    visible: false,
  },
  msr_right_points: {
    category: "mobility",
    metricKey: "msr_right",
  },
  msr_left_points: {
    category: "mobility",
    metricKey: "msr_left",
  },
  msr_points_total: {
    category: "mobility",
    metricKey: "msr_right",
    visible: false,
  },

  toe_touch_raw_points: {
    category: "mobility",
    metricKey: "toe_touch",
    visible: false,
  },
  toe_touch_points: {
    category: "mobility",
    metricKey: "toe_touch",
  },

  deep_squat_raw_points: {
    category: "mobility",
    metricKey: "deep_squat",
    visible: false,
  },
  deep_squat_points: {
    category: "mobility",
    metricKey: "deep_squat",
  },
};

// ------------------------ Shared types / constants ------------------------

type OffenseMetricCode = "offense" | "contact" | "power" | "speed" | "strikechance";

type ViewMode = "team" | "player";
type OffenseViewMode = "team" | "players";
type AthleticViewMode = "team" | "players";

// ➜ Defense drilldown types
type DefenseCategoryCode = "infield" | "outfield" | "catcher" | "first_base";
type DefenseMetricCode = "defense" | DefenseCategoryCode;
type DefenseViewMode = "team" | "players";


type EvaluationSelectOption = {
  key: string;
  label: string;
  evalScope: TeamEvalScope;
  assessmentDate?: string | null;
};

interface AthleticTestDisplay {
  key: string;
  label: string;
  value: number | string | null;
  unit?: string | null;
  extra?: string | null;
  category: AthleticCategoryCode;
  /** Optional 0–50 normalized score for a per‑test rubric, if available. */
  rubricScore?: number | null;
}

interface AthleticSubmetricRow {
  code: AthleticCategoryCode;
  label: string;
  score: number | null; // 0–50 engine scale
  tests: AthleticTestDisplay[];
}

interface AthleticPlayerRow {
  playerId: string;
  playerName: string | null;
  jerseyNumber: number | string | null;
  /** Raw per‑test values for this player (keys like deep_squat_points, toe_touch_points, etc.). */
  tests: Record<string, any>;
}

interface AthleticDrilldownData {
  overallScore: number | null; // 0–50 engine scale
  submetrics: AthleticSubmetricRow[];
  players: AthleticPlayerRow[];
}

const METRIC_ORDER: CoreMetricCode[] = ["bpoprating", "offense", "defense", "pitching", "athletic"];

const ATHLETIC_HEADER_LABEL_BY_CODE: Record<AthleticCategoryCode, string> = {
  speed: "Speed tests",
  strength: "Strength tests",
  power: "Power tests",
  balance: "Balance tests",
  mobility: "Mobility tests",
};

const TROPHY_TIER_ORDER: TrophyTier[] = ["bronze", "silver", "gold", "platinum"];

// Defense – categories in drilldown header (inside the Defense section)
const DEFENSE_CATEGORY_ORDER: DefenseCategoryCode[] = [
  "infield",
  "outfield",
  "catcher",
  "first_base",
];


// No "offense" tile – that score lives in the overview card
const OFFENSE_METRIC_CODES: OffenseMetricCode[] = ["contact", "power", "speed", "strikechance"];

const ATHLETIC_SUBMETRICS: AthleticSubmetricRow["code"][] = [
  "speed",
  "strength",
  "power",
  "balance",
  "mobility",
];

// For mapping helper/points keys → rubric base keys for the visible test rows
const ATHLETIC_POINTS_BASE_KEY_OVERRIDES: Record<string, string> = {
  // Vertical jump: points are stored on vjump_points, visible test is vjump_inches_raw
  vjump_inches_raw: "vjump",
  // SLS eyes open
  sls_open_left_seconds: "sls_open",
  sls_open_right_seconds: "sls_open",
  // SLS eyes closed
  sls_closed_left_seconds: "sls_closed",
  sls_closed_right_seconds: "sls_closed",
};

// ------------------------ Helpers ------------------------

function formatNumber(value: number | null | undefined, decimals: number = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  return Number(value).toFixed(decimals);
}

function parseFiniteNumber(value: any): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number.parseFloat(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// ------------------------ Strike chance helpers ------------------------

function normalizeStrikeChanceValue(raw: number | null | undefined): number | null {
  if (raw === null || raw === undefined || !Number.isFinite(raw)) return null;
  const n = Number(raw);
  if (n < 0) return null;
  // If <= 1, assume fraction (0–1) and convert to percent
  return n <= 1 ? n * 100 : n;
}

function formatStrikePercent(raw: number | null | undefined, decimals: number = 1): string {
  const val = normalizeStrikeChanceValue(raw);
  if (val === null) return "—";
  return `${val.toFixed(decimals)}%`;
}

// Convert a 0–50 contact score into a StrikeChance %, using:
//   SC% = (1 - (ContactPercent / 90)) * 100
// where ContactPercent is the contact score converted from 0–50 to 0–100.
function computeStrikePercentFromContactScore(
  contactScore50: number | null | undefined,
): number | null {
  if (contactScore50 === null || contactScore50 === undefined || !Number.isFinite(contactScore50)) {
    return null;
  }
  const contactPercent = (Number(contactScore50) / 50) * 100;
  const raw = (1 - contactPercent / 90) * 100;
  return Math.max(0, Math.min(100, raw));
}

// ------------------------ Trophies / medals / rubric ------------------------

function pickBestTrophyForMetric(
  metric: CoreMetricCode,
  trophies: TeamTrophyWithDefinition[],
): TeamTrophyWithDefinition | null {
  if (!trophies.length) return null;

  const targetCodes = metric === "bpoprating" ? ["bpoprating", "overall"] : [metric];

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

    const bestTime = best.awarded_at ? new Date(best.awarded_at).getTime() : 0;
    const currentTime = current.awarded_at ? new Date(current.awarded_at).getTime() : 0;
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

/** Simple red / yellow / green bar with equal segments. */
function RubricBar({ score, showLabels = false }: RubricBarProps) {
  const clamped =
    score === null || score === undefined ? null : Math.max(0, Math.min(50, score));

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

/** Generic metric card used in the team overview. */
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
        active ? "border-amber-400 shadow-sm" : "border-slate-700 hover:border-amber-400/60",
        clickable ? "cursor-pointer" : "",
      ].join(" ")}
    >
      <div>
        <div className="text-xs uppercase tracking-wide text-slate-400">{metric.label}</div>
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
        {showRubric && <RubricBar score={metric.score} showLabels={rubricShowLabels} />}
      </div>
      {trophy && (
        <div className="mt-1">
          <TrophyChip trophy={trophy} />
        </div>
      )}
    </div>
  );
}

// ------------------------ Offense drilldown ------------------------

// Map backend offense test IDs → canonical metric keys in metricMeta.
const OFFENSE_TEST_FIELD_TO_METRIC_KEY: Record<string, string> = {
  // Contact – quality of contact points
  tee_ld_points: "tee_line_drive_test_10",
  pitch_points: "m_10_fastball_quality",
  curveball_points: "m_5_curveball_quality",
  varied_speed_points: "m_5_varied_speed_quality",

  // Power – MPH
  bat_speed_points: "max_bat_speed",
  exit_velo_points: "max_exit_velo_tee",

  // Speed – timed runs; secs + ft/s
  run_1b_points: "timed_run_1b",
  run_4b_points: "timed_run_4b",
};

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
  test: OffenseTestBreakdown,
): {
  label: string;
  metricKey?: string;
  unit?: string | null;
} {
  const metricKey = OFFENSE_TEST_FIELD_TO_METRIC_KEY[test.id];
  const meta = metricKey ? (getMetricMeta(metricKey) as any) : undefined;

  const label = meta?.shortLabel ?? meta?.displayName ?? test.label;

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
 */
function OffenseTestsForMetric({ metricCode, drilldown, viewMode }: OffenseTestsForMetricProps) {
  if (!drilldown) return null;

  const rawTests =
    ((drilldown as any).tests_by_metric?.[
      metricCode
    ] as OffenseTestBreakdown[] | undefined) ?? [];

  // Filter out synthetic “Raw Score” helper rows
  const tests = rawTests.filter((t) => {
    const label = (t.label || "").toLowerCase();
    return !label.includes("raw score");
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

  // ---------------- TEAM VIEW ----------------
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
            const strikeTest = test.submetric === "strikechance";

            const teamScore50 = parseNum(test.team_average);

            const perPlayerRows = test.per_player ?? [];
            const scoreValues = perPlayerRows
              .map((p: any) => parseNum(p.value))
              .filter((v): v is number => v !== null);

            const scoreFallback =
              teamScore50 !== null
                ? teamScore50
                : scoreValues.length
                ? scoreValues.reduce((sum, v) => sum + v, 0) / scoreValues.length
                : null;

            let displayMain = "—";

            let avgSeconds: number | null = null;
            let avgFeetPerSecond: number | null = null;
            let basePathFeet: number | null = null;

            if (strikeTest) {
              displayMain = formatStrikePercent(test.team_average);
            } else if (powerTest) {
              const mphAvg = parseNum((test as any).team_avg_mph);
              if (mphAvg !== null) {
                displayMain = `${mphAvg.toFixed(1)} mph`;
              } else if (scoreFallback !== null) {
                displayMain = scoreFallback.toFixed(1);
              }
            } else if (speedTest) {
              const tAny = test as any;
              avgSeconds = parseNum(tAny.team_avg_seconds ?? tAny.avg_seconds ?? null);

              basePathFeet = parseNum(tAny.base_path_feet ?? tAny.base_feet ?? null);

              const explicitFps = parseNum(
                tAny.team_avg_feet_per_second ?? tAny.avg_feet_per_second ?? null,
              );

              if (explicitFps !== null) {
                avgFeetPerSecond = explicitFps;
              } else if (avgSeconds !== null && basePathFeet !== null && avgSeconds > 0) {
                avgFeetPerSecond = basePathFeet / avgSeconds;
              }

              if (avgFeetPerSecond !== null) {
                displayMain = `${avgFeetPerSecond.toFixed(2)} ft/s`;
              } else if (scoreFallback !== null) {
                displayMain = scoreFallback.toFixed(1);
              }
            } else {
              if (scoreFallback !== null) {
                displayMain = scoreFallback.toFixed(1);
              }
            }

            const rubricScore = strikeTest || scoreFallback === null ? null : scoreFallback;

            return (
              <div
                key={test.id}
                className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2"
              >
                <div className="text-sm font-medium text-slate-100">{label}</div>

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
                    <span className="font-mono text-slate-50">{displayMain}</span>
                  </span>
                  <span className="text-[10px] text-slate-500">n={test.player_count}</span>
                </div>

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

  // ---------------- PLAYERS VIEW ----------------
  return (
    <div className="mt-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
        {metricLabel}
      </div>
      <div className="space-y-3">
        {tests.map((test) => {
          const { label, metricKey } = getHumanizedTestMeta(test);
          const powerTest = isPowerTest(test.id, metricKey);
          const speedTest = isSpeedTest(test.id, metricKey);

          const perPlayer = [...(test.per_player ?? [])];

          const getSortValue = (row: any): number => {
            if (metricCode === "strikechance") {
              const v = normalizeStrikeChanceValue(row.value);
              return v ?? Infinity; // lower is better
            }

            if (powerTest) {
              const mph = parseNum(row.raw_mph);
              const score50 = parseNum(row.value);
              return mph ?? score50 ?? -Infinity;
            }

            if (speedTest) {
              const fps = parseNum(row.feet_per_second);
              const seconds = parseNum(row.raw_seconds);
              if (fps !== null) return fps;
              if (seconds !== null && seconds > 0) {
                return 1 / seconds;
              }
              return -Infinity;
            }

            const score50 = parseNum(row.value);
            return score50 ?? -Infinity;
          };

          perPlayer.sort((a, b) => {
            const va = getSortValue(a);
            const vb = getSortValue(b);
            if (metricCode === "strikechance") {
              return va - vb; // lower K% better
            }
            return vb - va; // higher better
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
                          <th className="text-right py-1 px-2">Speed (ft/s)</th>
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
                    {perPlayer.map((row: any) => {
                      const displayName =
                        row.player_name ?? `Player ${row.player_id.slice(0, 8)}…`;
                      const jersey =
                        row.jersey_number != null ? `#${row.jersey_number} ` : "";

                      if (speedTest) {
                        const seconds = parseNum(row.raw_seconds);
                        const dist = parseNum(row.raw_distance_ft);
                        let fps = parseNum(row.feet_per_second);

                        if (
                          fps === null &&
                          seconds !== null &&
                          dist !== null &&
                          seconds > 0
                        ) {
                          fps = dist / seconds;
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
                            <td className="py-1 px-2 text-right">
                              {seconds != null ? seconds.toFixed(2) : "—"}
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
                        const mph = parseNum(row.raw_mph);
                        valueDisplay = mph != null ? `${mph.toFixed(1)} mph` : "—";
                      } else {
                        const v = parseNum(row.value);
                        valueDisplay = v != null ? v.toFixed(1) : "—";
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

  const getMetricValue = (p: (typeof drilldown.players)[number]) => {
    switch (code) {
      case "offense":
        return p.hitting_score != null ? p.hitting_score * 3 : null;
      case "contact":
        return p.contact_score != null ? p.contact_score * 3 : null;
      case "power":
        return p.power_score != null ? p.power_score * 3 : null;
      case "speed":
        return p.speed_score != null ? p.speed_score * 3 : null;
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
      const nva = va ?? Infinity;
      const nvb = vb ?? Infinity;
      if (nva === nvb) {
        return (a.player_name || "").localeCompare(b.player_name || "");
      }
      return nva - nvb;
    }

    const nva = va ?? -Infinity;
    const nvb = vb ?? -Infinity;
    if (nva === nvb) {
      return (a.player_name || "").localeCompare(b.player_name || "");
    }
    return nvb - nva;
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
              const strikePercent = computeStrikePercentFromContactScore(
                p.contact_score,
              );
              const kPercent =
                strikePercent == null ? "—" : `${strikePercent.toFixed(1)}%`;

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
                      0,
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
                      0,
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
                      0,
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
                      0,
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
  // Start with contact as the default active metric (offense score lives above)
  const [activeMetrics, setActiveMetrics] = useState<OffenseMetricCode[]>(["contact"]);

  const metricsByCode = useMemo(() => {
    const map = new Map<OffenseMetricCode, { label: string; value: number | null }>();

    if (drilldown?.metrics) {
      for (const m of drilldown.metrics as any[]) {
        const code = m.code as OffenseMetricCode;
        if (!["offense", "contact", "power", "speed"].includes(code)) continue;
        map.set(code, { label: m.label, value: m.team_average ?? null });
      }
    }

    // Derive StrikeChance from the contact score, using the 0–50 normalized contact value.
    const contactMetric = map.get("contact");
    if (contactMetric) {
      const strikePercent = computeStrikePercentFromContactScore(contactMetric.value);
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
              Contact, power, speed, and strikeout chance for this team.
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
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {OFFENSE_METRIC_CODES.map((code) => {
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

                      {!isStrike && (
                        <div className="mt-1">
                          <RubricBar score={rawValue} showLabels={false} />
                        </div>
                      )}

                      <div className="mt-0.5 text-[10px] text-slate-500">
                        {isActive ? "Showing breakdown" : "Tap to show breakdown"}
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

// ------------------------ Defense drilldown ------------------------

/**
 * Map a raw defense position key (like "shortstop" or "left_center")
 * to a high-level defense category.
 */
function getDefensePositionCategory(
  key: string | null | undefined,
): DefenseCategoryCode | null {
  if (!key) return null;
  const k = String(key).toLowerCase();
  if (DEFENSE_POSITION_INFIELD_KEYS.has(k)) return "infield";
  if (DEFENSE_POSITION_OUTFIELD_KEYS.has(k)) return "outfield";
  if (DEFENSE_POSITION_CATCHER_KEYS.has(k)) return "catcher";
  if (DEFENSE_POSITION_FIRST_BASE_KEYS.has(k)) return "first_base";
  return null;
}

/**
 * Get a 0–50 engine-scale score for a given player + defense category/metric code.
 */
function getDefensePlayerScoreForCategory(
  player: any,
  code: DefenseMetricCode,
): number | null {
  if (!player) return null;

  if (code === "defense") {
    return typeof player.defense_score === "number"
      ? player.defense_score
      : null;
  }
  if (code === "infield") {
    return typeof player.infield_score === "number"
      ? player.infield_score
      : null;
  }
  if (code === "outfield") {
    return typeof player.outfield_score === "number"
      ? player.outfield_score
      : null;
  }
  if (code === "catcher") {
    if (typeof player.catcher_score === "number") return player.catcher_score;
    if (typeof player.catching_score === "number") return player.catching_score;
    return null;
  }
  if (code === "first_base") {
    if (typeof player.first_base_score === "number")
      return player.first_base_score;
    if (typeof player.firstbase_score === "number")
      return player.firstbase_score;
    return null;
  }

  return null;
}

const DEFENSE_CATEGORY_LABELS: Record<DefenseCategoryCode, string> = {
  infield: "Infield score",
  outfield: "Outfield score",
  catcher: "Catcher score",
  first_base: "First base score",
};

const DEFENSE_CATEGORY_HEADER_LABELS: Record<DefenseCategoryCode, string> = {
  infield: "Infield defense",
  outfield: "Outfield defense",
  catcher: "Catcher defense",
  first_base: "First base defense",
};

// Position key sets
const DEFENSE_POSITION_INFIELD_KEYS = new Set<string>([
  "pitcher",
  "pitchers_helper",
  "second_base",
  "shortstop",
  "second_shortstop",
  "third_base",
  "short_fielder",
]);

const DEFENSE_POSITION_CATCHER_KEYS = new Set<string>(["catcher"]);

const DEFENSE_POSITION_FIRST_BASE_KEYS = new Set<string>([
  "first_base",
  "firstbase",
]);

const DEFENSE_POSITION_OUTFIELD_KEYS = new Set<string>([
  "left_field",
  "center_field",
  "right_field",
  "left_center",
  "right_center",
]);

/**
 * Try to infer a defense category from a metricMeta group string.
 */
function inferDefenseCategoryFromGroup(
  groupRaw: string | null | undefined,
): DefenseCategoryCode | null {
  if (!groupRaw) return null;
  const g = groupRaw.toLowerCase();

  if (g.includes("first base") || g.includes("1b")) return "first_base";
  if (g.includes("outfield")) return "outfield";
  if (g.includes("catcher") || g.includes("catching")) return "catcher";
  if (g.includes("infield")) return "infield";
  if (g.includes("fielding")) return "infield";
  return null;
}

/**
 * Try to infer a defense category directly from a metric key.
 */
function inferDefenseCategoryFromMetricKey(
  metricKeyRaw: string | null | undefined,
): DefenseCategoryCode | null {
  if (!metricKeyRaw) return null;
  const k = metricKeyRaw.toLowerCase();

  if (k.includes("first_base") || k.includes("1b_") || k.startsWith("c1b")) {
    return "first_base";
  }
  if (
    k.includes("outfield") ||
    k.startsWith("throw_80ft") ||
    k.startsWith("throw_100ft") ||
    k.startsWith("throw_120ft") ||
    k.startsWith("ofgbht")
  ) {
    return "outfield";
  }
  if (
    k.includes("catcher") ||
    k.includes("ct2bt") ||
    k.includes("cttt2b") ||
    k.startsWith("c5pcs") ||
    k.startsWith("c10pcs") ||
    k.startsWith("c20pcs") ||
    k.startsWith("c15x15m") ||
    k.startsWith("c20ft") ||
    k.startsWith("c40ft")
  ) {
    return "catcher";
  }
  if (
    k.includes("rlc2b") ||
    k.includes("rlcss") ||
    k.includes("rlc3b") ||
    k.includes("grounders_") ||
    k.includes("infield") ||
    k.startsWith("ifss1bt") ||
    k.startsWith("iff") ||
    k.startsWith("cld")
  ) {
    return "infield";
  }

  return null;
}

type DefenseTestBreakdown = {
  id: string;
  label?: string;
  team_average?: number | null;
  player_count?: number;
  per_player?: any[];
};

/**
 * For a given test record, build display label / metricKey / unit and best‑guess category.
 */
function getDefenseTestDisplayMeta(test: any): {
  label: string;
  metricKey?: string;
  unit?: string | null;
  categoryGuess?: DefenseCategoryCode | null;
} {
  const metricKey: string | undefined =
    (test?.metric_key as string | undefined) ??
    (test?.metricKey as string | undefined) ??
    (test?.id as string | undefined);

  const meta = metricKey ? (getMetricMeta(metricKey) as any) : undefined;

  const label: string =
    (meta?.shortLabel as string | undefined) ??
    (meta?.displayName as string | undefined) ??
    (typeof test?.label === "string" && test.label.trim()
      ? test.label
      : metricKey ?? "Defense test");

  let unit: string | null = null;
  const metaUnit =
    (meta?.unit as string | undefined) ??
    (meta?.unitHint as string | undefined);
  if (metaUnit) unit = metaUnit;

  let categoryGuess: DefenseCategoryCode | null = null;
  if (meta?.group) {
    categoryGuess = inferDefenseCategoryFromGroup(meta.group);
  }
  if (!categoryGuess && metricKey) {
    categoryGuess = inferDefenseCategoryFromMetricKey(metricKey);
  }

  return { label, metricKey, unit, categoryGuess };
}

/**
 * Choose a list of outfield position keys to show as tiles based on whatever
 * positions exist in the drilldown payload.
 */
function getOutfieldPositionKeysForTeam(
  drilldown: TeamDefenseDrilldown | null,
): string[] {
  const positions = (drilldown?.positions ?? []) as any[];
  if (!positions.length) return [];

  const keys = positions.map((p) => String(p.key ?? "").toLowerCase());

  const hasLeftCenter = keys.includes("left_center");
  const hasRightCenter = keys.includes("right_center");

  // If LC / RC exist, prefer LF / LC / RC / RF
  if (hasLeftCenter || hasRightCenter) {
    const preferred = [
      "left_field",
      "left_center",
      "right_center",
      "right_field",
    ];
    return preferred.filter((k) => keys.includes(k));
  }

  // Otherwise prefer the standard LF / CF / RF trio
  const threePos = ["left_field", "center_field", "right_field"].filter((k) =>
    keys.includes(k),
  );
  if (threePos.length) return threePos;

  // Fallback: any outfield‑labeled positions we can find
  return positions
    .filter((p) =>
      DEFENSE_POSITION_OUTFIELD_KEYS.has(String(p.key ?? "").toLowerCase()),
    )
    .map((p) => String(p.key));
}

/**
 * Get tests for a given category / optional positionKey.
 * This is intentionally defensive: it supports a few possible backend shapes.
 */
function getDefenseTestsForNode(
  drilldown: TeamDefenseDrilldown | null,
  category: DefenseCategoryCode,
  positionKey?: string | null,
): DefenseTestBreakdown[] {
  if (!drilldown) return [];

  const anyDr = drilldown as any;

  const posKeyLower = positionKey ? String(positionKey).toLowerCase() : null;

  const testsByPosition =
    (anyDr.tests_by_position as Record<string, DefenseTestBreakdown[]> | undefined) ??
    (anyDr.testsByPosition as Record<string, DefenseTestBreakdown[]> | undefined);

  const testsByCategory =
    (anyDr.tests_by_category as Record<string, DefenseTestBreakdown[]> | undefined) ??
    (anyDr.testsByCategory as Record<string, DefenseTestBreakdown[]> | undefined);

  // 1) Explicit mapping by position
  if (posKeyLower && testsByPosition) {
    for (const [key, list] of Object.entries(testsByPosition)) {
      if (key.toLowerCase() === posKeyLower) {
        return Array.isArray(list) ? list : [];
      }
    }
  }

  // 2) Explicit mapping by category
  if (!posKeyLower && testsByCategory) {
    const catKey = category.toLowerCase();
    for (const [key, list] of Object.entries(testsByCategory)) {
      if (key.toLowerCase() === catKey) {
        return Array.isArray(list) ? list : [];
      }
    }
  }

  // 3) Fallback: a flat `tests` array – filter by category / position heuristics
  const allTests: DefenseTestBreakdown[] = Array.isArray(anyDr.tests)
    ? (anyDr.tests as DefenseTestBreakdown[])
    : [];

  if (!allTests.length) return [];

  return allTests.filter((test: any) => {
    const rawPos =
      (test.position_key as string | undefined) ??
      (test.position as string | undefined) ??
      (test.position_code as string | undefined) ??
      (test.pos_key as string | undefined);

    if (posKeyLower) {
      if (
        rawPos &&
        String(rawPos).toLowerCase() === posKeyLower
      ) {
        return true;
      }
    }

    const metricKey: string | undefined =
      (test.metric_key as string | undefined) ??
      (test.metricKey as string | undefined) ??
      (test.id as string | undefined);

    const meta = metricKey ? (getMetricMeta(metricKey) as any) : undefined;

    const group =
      (meta?.group as string | undefined) ??
      (test.group as string | undefined);
    const catFromGroup = inferDefenseCategoryFromGroup(group);
    const catFromMetric =
      catFromGroup ?? inferDefenseCategoryFromMetricKey(metricKey);

    return catFromMetric === category;
  });
}

/**
 * Human‑friendly position label (fallbacks if `positions` array doesn't include it).
 */
function humanizeDefensePositionLabel(
  drilldown: TeamDefenseDrilldown | null,
  positionKey: string,
): string {
  const pos = (drilldown?.positions ?? []).find(
    (p: any) => String(p.key) === positionKey,
  ) as any | undefined;

  if (pos?.label) return String(pos.label);

  return String(positionKey)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Build a synthetic summary metric for a category if the backend didn't send one.
 */
function buildDefenseCategorySummary(
  drilldown: TeamDefenseDrilldown | null,
  category: DefenseCategoryCode,
): { label: string; value: number | null; playerCount: number } | null {
  if (!drilldown) return null;

  const players = (drilldown.players ?? []) as any[];

  let sum = 0;
  let count = 0;

  for (const p of players) {
    const score = getDefensePlayerScoreForCategory(p, category);
    if (typeof score === "number") {
      sum += score;
      count += 1;
    }
  }

  if (count > 0) {
    return {
      label: DEFENSE_CATEGORY_LABELS[category],
      value: sum / count,
      playerCount: count,
    };
  }

  const positions = (drilldown.positions ?? []) as any[];
  let posSum = 0;
  let posCount = 0;
  let posPlayerCount = 0;

  for (const pos of positions) {
    const posCategory = getDefensePositionCategory(pos.key);
    if (posCategory !== category) continue;

    if (typeof pos.team_average === "number") {
      posSum += pos.team_average;
      posCount += 1;
    }
    if (typeof pos.player_count === "number") {
      posPlayerCount += pos.player_count;
    }
  }

  if (posCount > 0) {
    return {
      label: DEFENSE_CATEGORY_LABELS[category],
      value: posSum / posCount,
      playerCount: posPlayerCount,
    };
  }

  return {
    label: DEFENSE_CATEGORY_LABELS[category],
    value: null,
    playerCount: players.length || 0,
  };
}

function DefensePlayerGrid({
  drilldown,
  focusMetric,
  limit,
}: {
  drilldown: TeamDefenseDrilldown;
  focusMetric: DefenseMetricCode;
  /** Optional: only show top N players */
  limit?: number;
}) {
  const labelMap: Record<DefenseMetricCode, string> = {
    defense: "Overall defense score",
    infield: "Infield defense score",
    outfield: "Outfield defense score",
    catcher: "Catcher defense score",
    first_base: "First base defense score",
  };

  const players = [...((drilldown.players ?? []) as any[])];

  players.sort((a, b) => {
    const va = getDefensePlayerScoreForCategory(a, focusMetric);
    const vb = getDefensePlayerScoreForCategory(b, focusMetric);

    const nva = va ?? -Infinity;
    const nvb = vb ?? -Infinity;

    if (nva === nvb) {
      return (a.player_name || "").localeCompare(b.player_name || "");
    }
    return nvb - nva; // higher is better
  });

  const rows =
    typeof limit === "number" && limit > 0 ? players.slice(0, limit) : players;

  const highlightClass = (target: DefenseMetricCode) =>
    focusMetric === target ? "font-semibold text-amber-200" : "";

  const to150 = (v: number | null) => (v != null ? v * 3 : null);

  return (
    <div className="rounded-lg bg-slate-950/40 border border-slate-800 p-3">
      <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1">
        <div className="text-xs uppercase tracking-wide text-slate-400">
          {labelMap[focusMetric]} – player grid
        </div>
        <div className="text-[10px] text-slate-500">
          Scores are on a 0–150 visual scale (0–50 engine scale × 3).
        </div>
      </div>

      <div className="mt-2 overflow-x-auto">
        <table className="min-w-full text-xs text-left">
          <thead>
            <tr className="border-b border-slate-700 text-slate-400">
              <th className="px-2 py-1 font-semibold">Player</th>
              <th className="px-2 py-1 font-semibold">#</th>
              <th className="px-2 py-1 font-semibold text-right">Defense</th>
              <th className="px-2 py-1 font-semibold text-right">Infield</th>
              <th className="px-2 py-1 font-semibold text-right">Outfield</th>
              <th className="px-2 py-1 font-semibold text-right">Catcher</th>
              <th className="px-2 py-1 font-semibold text-right">1B</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p: any) => {
              const name =
                p.player_name ?? `Player ${p.jersey_number ?? ""}`.trim();
              const jersey = p.jersey_number ?? "—";

              const defense50 = getDefensePlayerScoreForCategory(
                p,
                "defense",
              );
              const infield50 = getDefensePlayerScoreForCategory(
                p,
                "infield",
              );
              const outfield50 = getDefensePlayerScoreForCategory(
                p,
                "outfield",
              );
              const catcher50 = getDefensePlayerScoreForCategory(
                p,
                "catcher",
              );
              const firstBase50 = getDefensePlayerScoreForCategory(
                p,
                "first_base",
              );

              return (
                <tr
                  key={p.player_id}
                  className="border-t border-slate-800 text-slate-100"
                >
                  <td className="px-2 py-1">{name}</td>
                  <td className="px-2 py-1">{jersey}</td>
                  <td
                    className={[
                      "px-2 py-1 text-right",
                      highlightClass("defense"),
                    ].join(" ")}
                  >
                    {formatNumber(to150(defense50), 0)}
                  </td>
                  <td
                    className={[
                      "px-2 py-1 text-right",
                      highlightClass("infield"),
                    ].join(" ")}
                  >
                    {formatNumber(to150(infield50), 0)}
                  </td>
                  <td
                    className={[
                      "px-2 py-1 text-right",
                      highlightClass("outfield"),
                    ].join(" ")}
                  >
                    {formatNumber(to150(outfield50), 0)}
                  </td>
                  <td
                    className={[
                      "px-2 py-1 text-right",
                      highlightClass("catcher"),
                    ].join(" ")}
                  >
                    {formatNumber(to150(catcher50), 0)}
                  </td>
                  <td
                    className={[
                      "px-2 py-1 text-right",
                      highlightClass("first_base"),
                    ].join(" ")}
                  >
                    {formatNumber(to150(firstBase50), 0)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {limit && (drilldown.players?.length ?? 0) > limit && (
        <div className="mt-1 text-[10px] text-slate-500">
          Showing top {limit} of {drilldown.players?.length ?? 0} players. Switch
          to Player grid view to see all.
        </div>
      )}
    </div>
  );
}

function DefensePositionsGrid({
  drilldown,
  category,
  activePositionKey,
  onPositionChange,
}: {
  drilldown: TeamDefenseDrilldown;
  category: DefenseCategoryCode;
  activePositionKey: string | null;
  onPositionChange: (key: string | null) => void;
}) {
  const allPositions = (drilldown.positions ?? []) as any[];

  let filtered: any[] = [];

  if (category === "infield") {
    filtered = allPositions.filter((p) =>
      DEFENSE_POSITION_INFIELD_KEYS.has(String(p.key ?? "").toLowerCase()),
    );
  } else if (category === "outfield") {
    const keysInOrder = getOutfieldPositionKeysForTeam(drilldown);
    const byKey = new Map(
      allPositions.map((p) => [String(p.key), p] as [string, any]),
    );
    filtered = keysInOrder
      .map((k) => byKey.get(k))
      .filter((p): p is any => !!p);
  } else if (category === "catcher") {
    filtered = allPositions.filter((p) =>
      DEFENSE_POSITION_CATCHER_KEYS.has(String(p.key ?? "").toLowerCase()),
    );
  } else if (category === "first_base") {
    filtered = allPositions.filter((p) =>
      DEFENSE_POSITION_FIRST_BASE_KEYS.has(String(p.key ?? "").toLowerCase()),
    );
  }

  if (!filtered.length) {
    // For catcher / 1B it's fine to have no explicit positions; we'll just show tests.
    if (category === "infield" || category === "outfield") {
      return (
        <div className="rounded-lg bg-slate-950/40 border border-slate-800 p-3">
          <p className="text-xs text-slate-400">
            No position‑level breakdown yet for{" "}
            {DEFENSE_CATEGORY_HEADER_LABELS[category].toLowerCase()}.
          </p>
        </div>
      );
    }
    return null;
  }

  return (
    <div className="space-y-2">
      <div className="text-xs uppercase tracking-wide text-slate-400">
        {DEFENSE_CATEGORY_HEADER_LABELS[category]} – positions
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {filtered.map((pos: any) => {
          const key = String(pos.key);
          const isActive = activePositionKey === key;
          const score50 =
            typeof pos.team_average === "number" ? pos.team_average : null;
          const score150 = score50 != null ? score50 * 3 : null;
          const playerCount =
            typeof pos.player_count === "number" ? pos.player_count : 0;

          const label =
            typeof pos.label === "string" && pos.label.trim()
              ? pos.label
              : humanizeDefensePositionLabel(drilldown, key);

          return (
            <button
              key={key}
              type="button"
              onClick={() => onPositionChange(isActive ? null : key)}
              className={[
                "text-left rounded-lg border px-3 py-2 bg-slate-950/60 transition",
                isActive
                  ? "border-amber-400 shadow-sm"
                  : "border-slate-700 hover:border-amber-400/60",
              ].join(" ")}
            >
              <div className="text-[11px] uppercase tracking-wide text-slate-400">
                {label}
              </div>
              <div className="mt-1 text-lg font-semibold text-slate-50">
                {formatNumber(score150, 0)}
              </div>
              <div className="mt-1">
                <RubricBar score={score50} showLabels={false} />
              </div>
              <div className="mt-0.5 text-[10px] text-slate-500">
                n={playerCount} {playerCount === 1 ? "player" : "players"}
              </div>
              <div className="mt-0.5 text-[10px] text-slate-500">
                {isActive
                  ? "Showing test breakdown"
                  : "Tap to drill into tests"}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DefenseTestsForNode({
  drilldown,
  category,
  positionKey,
  viewMode,
}: {
  drilldown: TeamDefenseDrilldown | null;
  category: DefenseCategoryCode;
  positionKey?: string | null;
  viewMode: DefenseViewMode;
}) {
  if (!drilldown) return null;

  const tests = getDefenseTestsForNode(drilldown, category, positionKey ?? null);

  if (!tests.length) {
    return (
      <div className="rounded-lg bg-slate-950/40 border border-slate-800 p-3">
        <p className="text-xs text-slate-400">
          {positionKey
            ? "No test‑level breakdown yet for this position."
            : "No test‑level breakdown yet for this category."}
        </p>
      </div>
    );
  }

  const scopeLabel = positionKey
    ? humanizeDefensePositionLabel(drilldown, positionKey)
    : DEFENSE_CATEGORY_HEADER_LABELS[category];

  if (viewMode === "team") {
    return (
      <div className="rounded-lg bg-slate-950/40 border border-slate-800 p-3">
        <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1">
          <div className="text-xs uppercase tracking-wide text-slate-400">
            {scopeLabel} – test breakdown
          </div>
          <div className="text-[10px] text-slate-500">
            Scores are shown on a 0–150 visual scale (0–50 engine scale × 3).
          </div>
        </div>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {tests.map((test: any) => {
            const { label } = getDefenseTestDisplayMeta(test);

            const score50 =
              typeof test.team_average === "number"
                ? test.team_average
                : null;
            const score150 = score50 != null ? score50 * 3 : null;
            const playerCount =
              typeof test.player_count === "number"
                ? test.player_count
                : 0;

            return (
              <div
                key={test.id ?? label}
                className="rounded-md bg-slate-900/60 border border-slate-800 px-3 py-2"
              >
                <div className="text-sm font-medium text-slate-100">
                  {label}
                </div>
                <div className="mt-1 flex items-baseline justify-between gap-2">
                  <div className="text-xs text-slate-300">
                    Team avg score:{" "}
                    <span className="font-mono text-slate-50">
                      {formatNumber(score150, 0)}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500">
                    n={playerCount}
                  </div>
                </div>
                {score50 != null && (
                  <div className="mt-2 max-w-[140px]">
                    <RubricBar score={score50} showLabels={false} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Player‑grid view for tests
  return (
    <div className="rounded-lg bg-slate-950/40 border border-slate-800 p-3">
      <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1">
        <div className="text-xs uppercase tracking-wide text-slate-400">
          {scopeLabel} – test leaderboards
        </div>
        <div className="text-[10px] text-slate-500">
          One table per test; scores use the same 0–50 engine scale
          (×3 for the 0–150 visual scale).
        </div>
      </div>
      <div className="mt-3 space-y-3">
        {tests.map((test: any) => {
          const { label } = getDefenseTestDisplayMeta(test);
          const perPlayer = Array.isArray(test.per_player)
            ? [...test.per_player]
            : [];

          if (!perPlayer.length) {
            return (
              <div
                key={test.id ?? label}
                className="rounded-md bg-slate-900/60 border border-slate-800 px-3 py-2"
              >
                <div className="text-xs font-semibold text-slate-200">
                  {label}
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  No player‑level records yet for this test.
                </p>
              </div>
            );
          }

          perPlayer.sort((a: any, b: any) => {
            const va =
              typeof a.value === "number" ? (a.value as number) : -Infinity;
            const vb =
              typeof b.value === "number" ? (b.value as number) : -Infinity;
            if (va === vb) {
              return (a.player_name || "").localeCompare(
                b.player_name || "",
              );
            }
            return vb - va;
          });

          return (
            <div
              key={test.id ?? label}
              className="rounded-md bg-slate-900/60 border border-slate-800 px-3 py-2"
            >
              <div className="text-xs font-semibold text-slate-200 mb-2">
                {label}
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="text-slate-400">
                      <th className="text-left py-1 pr-2">Player</th>
                      <th className="text-left py-1 pr-2">#</th>
                      <th className="text-right py-1 pl-2">
                        Score (0–150)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {perPlayer.map((row: any) => {
                      const value50 =
                        typeof row.value === "number"
                          ? (row.value as number)
                          : null;
                      const value150 =
                        value50 != null ? value50 * 3 : null;

                      const name =
                        row.player_name ??
                        `Player ${row.jersey_number ?? ""}`.trim();
                      const jersey = row.jersey_number ?? "—";

                      return (
                        <tr
                          key={row.player_id}
                          className="border-t border-slate-800"
                        >
                          <td className="py-1 pr-2">
                            <span className="font-medium text-slate-100">
                              {name}
                            </span>
                          </td>
                          <td className="py-1 pr-2">{jersey}</td>
                          <td className="py-1 pl-2 text-right">
                            {formatNumber(value150, 0)}
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

function DefenseDrilldownSection({
  drilldown,
  loading,
  error,
  viewMode,
  onViewModeChange,
}: {
  drilldown: TeamDefenseDrilldown | null;
  loading: boolean;
  error: string | null;
  viewMode: DefenseViewMode;
  onViewModeChange: (mode: DefenseViewMode) => void;
}) {
  const [activeCategory, setActiveCategory] =
    useState<DefenseCategoryCode>("infield");
  const [activePositionKey, setActivePositionKey] = useState<string | null>(
    null,
  );

  const metricsByCode = useMemo(() => {
    const map = new Map<
      DefenseMetricCode,
      { label: string; value: number | null; playerCount: number }
    >();

    if (drilldown?.metrics) {
      for (const m of drilldown.metrics as any[]) {
        const code = m.code as DefenseMetricCode;
        if (
          code !== "defense" &&
          code !== "infield" &&
          code !== "outfield" &&
          code !== "catcher" &&
          code !== "first_base"
        ) {
          continue;
        }
        map.set(code, {
          label:
            m.label ??
            (code === "defense"
              ? "Defense score"
              : DEFENSE_CATEGORY_LABELS[code as DefenseCategoryCode]),
          value:
            typeof m.team_average === "number" ? m.team_average : null,
          playerCount: m.player_count ?? 0,
        });
      }
    }

    return map;
  }, [drilldown]);

  useEffect(() => {
    if (!drilldown) return;

    const hasDataForCategory = (cat: DefenseCategoryCode) => {
      if (metricsByCode.has(cat as DefenseMetricCode)) return true;

      const positions = (drilldown.positions ?? []) as any[];
      if (
        positions.some((p) => getDefensePositionCategory(p.key) === cat)
      ) {
        return true;
      }

      const players = (drilldown.players ?? []) as any[];
      if (
        players.some(
          (p) => getDefensePlayerScoreForCategory(p, cat) != null,
        )
      ) {
        return true;
      }

      return false;
    };

    if (!hasDataForCategory(activeCategory)) {
      for (const cat of DEFENSE_CATEGORY_ORDER) {
        if (hasDataForCategory(cat)) {
          setActiveCategory(cat);
          setActivePositionKey(null);
          break;
        }
      }
    }
  }, [drilldown, metricsByCode, activeCategory]);

  const hasAnyData =
    !!drilldown &&
    (metricsByCode.size > 0 ||
      (drilldown.positions?.length ?? 0) > 0 ||
      (drilldown.players?.length ?? 0) > 0);

  const activeSummary =
    metricsByCode.get(activeCategory as DefenseMetricCode) ??
    buildDefenseCategorySummary(drilldown, activeCategory);

  const overallDefenseSummary = metricsByCode.get("defense") ?? null;

  return (
    <section className="mt-6">
      <div className="rounded-xl bg-slate-900/70 border border-slate-700">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 border-b border-slate-700">
          <div>
            <h3 className="text-sm font-semibold text-slate-50">
              Defense drilldown
            </h3>
            <p className="text-xs text-slate-400">
              Tap a category to see infield, outfield, catcher, and first
              base defense broken all the way down to individual tests.
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
              Loading defense details…
            </p>
          )}

          {!loading && error && (
            <p className="text-xs text-red-400">
              Failed to load defense breakdown: {error}
            </p>
          )}

          {!loading && !error && !hasAnyData && (
            <p className="text-xs text-slate-400">
              {drilldown
                ? "No defense ratings yet for this team."
                : "Select a team and evaluation to view defense details."}
            </p>
          )}

          {!loading && !error && hasAnyData && drilldown && (
            <>
              {/* Overall defense summary (if available) */}
              {overallDefenseSummary && (
                <div className="rounded-lg bg-slate-950/40 border border-slate-800 p-3">
                  <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1">
                    <div className="text-xs uppercase tracking-wide text-slate-400">
                      Overall defense score
                    </div>
                    <div className="text-xs text-slate-300">
                      Team average:{" "}
                      <span className="font-semibold text-slate-50">
                        {formatNumber(
                          overallDefenseSummary.value != null
                            ? overallDefenseSummary.value * 3
                            : null,
                          0,
                        )}
                      </span>{" "}
                      (0–150 scale)
                    </div>
                  </div>
                  <div className="mt-2">
                    <RubricBar
                      score={overallDefenseSummary.value}
                      showLabels
                    />
                  </div>
                </div>
              )}

              {/* Category tiles – Infield / OF / Catcher / 1B */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {DEFENSE_CATEGORY_ORDER.map((cat) => {
                  const summary =
                    metricsByCode.get(cat as DefenseMetricCode) ??
                    buildDefenseCategorySummary(drilldown, cat)!;

                  const score50 = summary.value;
                  const score150 = score50 != null ? score50 * 3 : null;
                  const isActive = activeCategory === cat;

                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => {
                        setActiveCategory(cat);
                        setActivePositionKey(null);
                      }}
                      className={[
                        "text-left rounded-lg border px-3 py-2 bg-slate-950/60 transition",
                        isActive
                          ? "border-amber-400 shadow-sm"
                          : "border-slate-700 hover:border-amber-400/60",
                      ].join(" ")}
                    >
                      <div className="text-[11px] uppercase tracking-wide text-slate-400">
                        {summary.label}
                      </div>
                      <div className="mt-1 text-lg font-semibold text-slate-50">
                        {formatNumber(score150, 0)}
                      </div>
                      <div className="mt-1">
                        <RubricBar score={score50} showLabels={false} />
                      </div>
                      <div className="mt-0.5 text-[10px] text-slate-500">
                        n={summary.playerCount}{" "}
                        {summary.playerCount === 1 ? "player" : "players"}
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

              {/* Detail area for active category */}
              {activeSummary && (
                <div className="space-y-4 mt-4">
                  <div className="rounded-lg bg-slate-950/40 border border-slate-800 p-3">
                    <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1">
                      <div className="text-xs uppercase tracking-wide text-slate-400">
                        {DEFENSE_CATEGORY_HEADER_LABELS[activeCategory]}
                      </div>
                      <div className="text-xs text-slate-300">
                        Team average:{" "}
                        <span className="font-semibold text-slate-50">
                          {formatNumber(
                            activeSummary.value != null
                              ? activeSummary.value * 3
                              : null,
                            0,
                          )}
                        </span>{" "}
                        (0–150 scale)
                      </div>
                    </div>

                    <div className="mt-3">
                      <DefensePlayerGrid
                        drilldown={drilldown}
                        focusMetric={activeCategory}
                        limit={viewMode === "team" ? 5 : undefined}
                      />
                    </div>
                  </div>

                  {/* Positions for infield / outfield */}
                  {(activeCategory === "infield" ||
                    activeCategory === "outfield") && (
                    <DefensePositionsGrid
                      drilldown={drilldown}
                      category={activeCategory}
                      activePositionKey={activePositionKey}
                      onPositionChange={setActivePositionKey}
                    />
                  )}

                  {/* Test‑level breakdown */}
                  {activeCategory === "catcher" ||
                  activeCategory === "first_base" ? (
                    <DefenseTestsForNode
                      drilldown={drilldown}
                      category={activeCategory}
                      viewMode={viewMode}
                    />
                  ) : (
                    (activeCategory === "infield" ||
                      activeCategory === "outfield") && (
                      <>
                        {activePositionKey ? (
                          <DefenseTestsForNode
                            drilldown={drilldown}
                            category={activeCategory}
                            positionKey={activePositionKey}
                            viewMode={viewMode}
                          />
                        ) : (
                          <div className="rounded-lg bg-slate-950/40 border border-slate-800 p-3">
                            <p className="text-xs text-slate-400">
                              Tap a position above to see the exact tests
                              that roll up into that position&apos;s{" "}
                              {activeCategory === "infield"
                                ? "infield"
                                : "outfield"}{" "}
                              score.
                            </p>
                          </div>
                        )}
                      </>
                    )
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}


// ------------------------ Athletic helpers ------------------------

function getAthleticPlayerTestsObject(
  row: AthleticPlayerRow | any,
): Record<string, any> {
  if (!row) return {};
  if (row.tests && typeof row.tests === "object") return row.tests;
  if (row.athletic_tests && typeof row.athletic_tests === "object") {
    return row.athletic_tests;
  }
  return row as Record<string, any>;
}

const DEEP_SQUAT_CODE_MAP: Record<string, string> = {
  full: "Full overhead deep squat",
  ankles: "Ankles flare",
  pelvis: "Pelvis not below the knees",
  arms: "Arms move forward",
};

function describeDeepSquatFromPlayerTests(
  tests: Record<string, any>,
): { text: string | null; points: number | null } {
  const rawText =
    (tests["deep_squat_value_text"] as string | undefined) ??
    (tests["deep_squat_text"] as string | undefined);

  const points = parseFiniteNumber(
    tests["deep_squat_points"] ?? tests["deep_squat_raw_points"],
  );

  const labels: string[] = [];
  if (typeof rawText === "string" && rawText.trim()) {
    const tokens = rawText.split(/[,\s]+/).map((t) => t.trim());
    const seen = new Set<string>();
    for (const tokenRaw of tokens) {
      if (!tokenRaw) continue;
      const token = tokenRaw.toLowerCase().replace(/[^a-z]/g, "");
      const label = DEEP_SQUAT_CODE_MAP[token];
      if (label && !seen.has(label)) {
        seen.add(label);
        labels.push(label);
      }
    }
  }

  const text = labels.length ? labels.join(" • ") : null;
  return { text, points };
}

function describeToeTouchFromPlayerTests(
  tests: Record<string, any>,
): { text: string | null; points: number | null } {
  const rawText =
    (tests["toe_touch_value_text"] as string | undefined) ??
    (tests["toe_touch_text"] as string | undefined);

  const points = parseFiniteNumber(
    tests["toe_touch_points"] ?? tests["toe_touch_raw_points"],
  );

  let text: string | null = null;
  if (typeof rawText === "string" && rawText.trim()) {
    text = rawText.trim();
  } else if (points !== null) {
    if (points === 0) text = "Cannot touch toes";
    else if (points === 3) text = "Touches toes";
    else if (points === 6) text = "Touches ground";
  }

  return { text, points };
}

function mapMsrPointsToText(points: number | null): string | null {
  if (points === null) return null;
  if (points === 0) return "Turns less than 180 degrees";
  if (points === 1) return "Turns equal to 180 degrees";
  if (points === 3) return "Turns greater than 180 degrees";
  return null;
}

function describeMsrFromPlayerTests(
  tests: Record<string, any>,
  side: "left" | "right",
): { text: string | null; points: number | null } {
  const base = side === "left" ? "msr_left" : "msr_right";
  const points = parseFiniteNumber(
    tests[`${base}_points`] ?? tests[`${base}_raw`],
  );
  const text = mapMsrPointsToText(points);
  return { text, points };
}

function formatAthleticNumericValue(value: number, unit?: string | null): string {
  const decimals = Number.isInteger(value) || Math.abs(value) >= 10 ? 1 : 2;
  const formatted = value.toFixed(decimals);
  const u = unit ?? "";
  return u ? `${formatted} ${u}` : formatted;
}

function humanizeAthleticLabel(
  rawKey: string,
  metricKeyOverride?: string,
): { label: string; unit?: string | null } {
  const cfg = ATHLETIC_TEST_KEY_CONFIG[rawKey];
  const metricKey = metricKeyOverride ?? cfg?.metricKey ?? rawKey;

  const meta = (getMetricMeta(metricKey) as any) ?? null;

  const baseLabel =
    meta?.shortLabel ??
    meta?.displayName ??
    metricKey
      .replace(/_(raw|raw_points|points|avg_seconds|seconds|fps)$/gi, "")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c: string) => c.toUpperCase());

  let unit: string | undefined =
    meta?.unit ?? meta?.unitShort ?? meta?.unitHint ?? undefined;

  if (!unit) {
    const k = rawKey.toLowerCase();
    if (k.endsWith("_seconds") || k.endsWith("_sec")) unit = "sec";
    else if (k.endsWith("_fps")) unit = "ft/s";
    else if (k.includes("reps") || k.endsWith("_raw")) unit = "reps";
  } else {
    const lower = unit.toLowerCase();
    if (lower === "seconds" || lower === "second") unit = "sec";
    else if (lower === "feet") unit = "ft";
    else if (lower === "inches") unit = "in";
    else if (lower === "repetitions" || lower === "reps") unit = "reps";
    else if (lower.includes("points")) unit = "pts";
  }

  return { label: baseLabel, unit: unit ?? null };
}

function categorizeAthleticKey(key: string): AthleticCategoryCode | null {
  const k = key.toLowerCase();

  if (
    k.includes("run_1b") ||
    k.includes("run_4b") ||
    k.includes("sprint") ||
    k.includes("speed")
  ) {
    return "speed";
  }

  if (
    k.includes("situps") ||
    k.includes("pushups") ||
    k.includes("pullups") ||
    k.includes("plank") ||
    k.includes("strength")
  ) {
    return "strength";
  }

  if (
    k.includes("broad_jump") ||
    k.includes("vertical_jump") ||
    k.includes("chest_throw") ||
    k.includes("power")
  ) {
    return "power";
  }

  if (
    k.startsWith("sls_") ||
    k.includes("single_leg") ||
    k.includes("stance") ||
    k.includes("balance")
  ) {
    return "balance";
  }

  if (
    k.startsWith("msr_") ||
    k.includes("toe_touch") ||
    k.includes("deep_squat") ||
    k.includes("mobility") ||
    k.includes("flex") ||
    k.includes("range")
  ) {
    return "mobility";
  }

  return null;
}

function buildAthleticDrilldown(
  teamStats: TeamStatsOverview | null,
  teamMetricsByCode: Map<
    CoreMetricCode,
    { label: string; score: number | null; percent: number | null }
  >,
): AthleticDrilldownData {
  const breakdown = (teamStats as any)?.breakdown ?? {};
  const athleticSection =
    (breakdown as any).athletic ?? (breakdown as any).athlete ?? {};

  const testsSource =
    athleticSection && typeof athleticSection === "object"
      ? athleticSection.tests && typeof athleticSection.tests === "object"
        ? athleticSection.tests
        : athleticSection
      : {};

  const rawTests: Record<string, any> =
    testsSource && typeof testsSource === "object" ? testsSource : {};

  const submetricTests: Record<AthleticCategoryCode, AthleticTestDisplay[]> = {
    speed: [],
    strength: [],
    power: [],
    balance: [],
    mobility: [],
  };

  // Helper scores (points) used for per‑test rubrics
  const pointsByBaseKey: Record<string, number | null> = {};
  const handledKeys = new Set<string>();

  for (const [key, rawValue] of Object.entries(rawTests)) {
    const lowerKey = key.toLowerCase();
    if (lowerKey.endsWith("_points") || lowerKey.endsWith("_raw_points")) {
      const baseKey = key.replace(/_(raw_points|points)$/i, "");
      const numericValue = parseFiniteNumber(rawValue);
      pointsByBaseKey[baseKey] = numericValue;
    }
  }

  // Combined speed tiles for 1B / 4B
  const speedCombos: {
    baseKey: string;
    secondsKey: string;
    fpsKey: string;
    distanceKey: string;
  }[] = [
    {
      baseKey: "run_1b",
      secondsKey: "run_1b_seconds",
      fpsKey: "run_1b_fps",
      distanceKey: "run_1b_distance_ft",
    },
    {
      baseKey: "run_4b",
      secondsKey: "run_4b_seconds",
      fpsKey: "run_4b_fps",
      distanceKey: "run_4b_distance_ft",
    },
  ];

  for (const combo of speedCombos) {
    const secondsVal = parseFiniteNumber(rawTests[combo.secondsKey]);
    const fpsVal = parseFiniteNumber(rawTests[combo.fpsKey]);
    const distanceVal = parseFiniteNumber(rawTests[combo.distanceKey]);

    if (secondsVal === null && fpsVal === null && distanceVal === null) {
      continue;
    }

    handledKeys.add(combo.secondsKey);
    handledKeys.add(combo.fpsKey);
    handledKeys.add(combo.distanceKey);

    const labelSourceKey = combo.fpsKey in rawTests ? combo.fpsKey : combo.secondsKey;

    const cfg = ATHLETIC_TEST_KEY_CONFIG[labelSourceKey];
    const { label } = humanizeAthleticLabel(labelSourceKey, cfg?.metricKey);

    let mainValue: number | string | null = null;
    let unit: string | null = null;

    if (fpsVal !== null) {
      mainValue = fpsVal;
      unit = "ft/s";
    } else if (secondsVal !== null) {
      mainValue = secondsVal;
      unit = "sec";
    } else if (distanceVal !== null) {
      mainValue = distanceVal;
      unit = "ft";
    }

    const parts: string[] = [];
    if (secondsVal !== null) {
      parts.push(`Time: ${secondsVal.toFixed(2)} sec`);
    }
    if (fpsVal !== null) {
      parts.push(`Speed: ${fpsVal.toFixed(2)} ft/s`);
    }
    if (distanceVal !== null) {
      parts.push(`Distance: ${distanceVal.toFixed(0)} ft`);
    }

    const extra = parts.length ? parts.join(" • ") : null;
    const rubricScore = pointsByBaseKey[combo.baseKey] ?? null;

    submetricTests.speed.push({
      key: `${combo.baseKey}_speed`,
      label,
      value: mainValue,
      unit,
      extra,
      category: "speed",
      rubricScore,
    });
  }

  // Generic loop for remaining tests (including mobility)
  for (const [key, rawValue] of Object.entries(rawTests)) {
    if (handledKeys.has(key)) continue;

    const lowerKey = key.toLowerCase();

    // Skip summary / helper fields – including *_points_max
    if (
      lowerKey === "overall_score" ||
      lowerKey === "max_points" ||
      lowerKey === "total_points" ||
      lowerKey.endsWith("_score") ||
      lowerKey.endsWith("_points_total") ||
      lowerKey.endsWith("_total_points") ||
      lowerKey.endsWith("_max_points")
    ) {
      continue;
    }

    const cfg = ATHLETIC_TEST_KEY_CONFIG[key];
    if (cfg && cfg.visible === false) continue;

    const category: AthleticCategoryCode | null =
      (cfg?.category as AthleticCategoryCode | undefined) ??
      categorizeAthleticKey(key);

    if (!category) continue;

    const { label, unit } = humanizeAthleticLabel(key, cfg?.metricKey);
    const numericValue = parseFiniteNumber(rawValue);
    const value: number | string | null =
      numericValue !== null ? numericValue : (rawValue as any);

    const computedBaseKey = key.replace(
      /_(raw|raw_points|points|avg_seconds|seconds|fps|distance_ft)$/i,
      "",
    );
    const baseKey =
      ATHLETIC_POINTS_BASE_KEY_OVERRIDES[key] ?? computedBaseKey;

    const rubricScore = pointsByBaseKey[baseKey] ?? null;

    submetricTests[category].push({
      key,
      label,
      value,
      unit: unit ?? null,
      extra: null,
      category,
      rubricScore,
    });
  }

  for (const code of ATHLETIC_SUBMETRICS) {
    submetricTests[code].sort((a, b) => a.label.localeCompare(b.label));
  }

  const testsAny = rawTests as any;

  const totalPoints = parseFiniteNumber(
    athleticSection.total_points ?? testsAny.total_points,
  );
  const maxPoints = parseFiniteNumber(
    athleticSection.max_points ?? testsAny.max_points,
  );

  const pointsDerivedOverall =
    totalPoints !== null && maxPoints !== null && maxPoints > 0
      ? (totalPoints / maxPoints) * 50
      : null;

  const derivedScore = parseFiniteNumber(
    athleticSection.overall_score ??
      testsAny.overall_score ??
      pointsDerivedOverall,
  );

  const overallScore =
    derivedScore ??
    (teamMetricsByCode.get("athletic")?.score != null
      ? teamMetricsByCode.get("athletic")!.score! / 3
      : null);

  const submetrics: AthleticSubmetricRow[] = ATHLETIC_SUBMETRICS.map((code) => {
    const scoreKey = `${code}_score`;
    const score = parseFiniteNumber(
      testsAny[scoreKey] ?? (athleticSection as any)[scoreKey],
    );

    const label =
      code === "power"
        ? "Power score"
        : code === "balance"
        ? "Balance score"
        : `${code.charAt(0).toUpperCase()}${code.slice(1)} score`;

    return {
      code,
      label,
      score,
      tests: submetricTests[code],
    };
  });

  const rawPlayersSource =
    (athleticSection as any).players ??
    (athleticSection as any).athletic_players ??
    (breakdown as any).athletic_players ??
    [];

  const rawPlayers: any[] = Array.isArray(rawPlayersSource)
    ? rawPlayersSource
    : [];

  const players: AthleticPlayerRow[] = rawPlayers.map((p: any) => {
    const tests =
      (p.tests && typeof p.tests === "object" ? p.tests : null) ??
      (p.athletic_tests && typeof p.athletic_tests === "object"
        ? p.athletic_tests
        : null) ??
      p;

    const nameFromParts =
      [p.first_name, p.last_name].filter(Boolean).join(" ") || null;

    return {
      playerId: p.player_id ?? p.id ?? "",
      playerName: p.player_name ?? p.name ?? nameFromParts,
      jerseyNumber:
        p.jersey_number ?? p.jersey ?? p.uniform_number ?? null,
      tests: tests ?? {},
    };
  });

  return { overallScore, submetrics, players };
}

function formatAthleticTestValue(test: AthleticTestDisplay): string {
  if (test.value === null || test.value === undefined) return "—";

  if (typeof test.value === "number") {
    const decimals =
      Number.isInteger(test.value) || Math.abs(test.value) >= 10 ? 1 : 2;
    const formatted = test.value.toFixed(decimals);
    const unit = test.unit ?? "";
    return unit ? `${formatted} ${unit}` : formatted;
  }

  return String(test.value);
}

function formatAthleticPlayerCell(
  category: AthleticCategoryCode,
  test: AthleticTestDisplay,
  testsObj: Record<string, any>,
): string {
  const key = test.key;
  const lowerKey = key.toLowerCase();

  if (category === "mobility") {
    if (lowerKey.includes("deep_squat")) {
      const { text, points } = describeDeepSquatFromPlayerTests(testsObj);
      if (text && points != null) return `${text} (${points.toFixed(1)} pts)`;
      if (text) return text;
      if (points != null) return `${points.toFixed(1)} pts`;
      return "—";
    }

    if (lowerKey.includes("toe_touch")) {
      const { text, points } = describeToeTouchFromPlayerTests(testsObj);
      if (text && points != null) return `${text} (${points.toFixed(1)} pts)`;
      if (text) return text;
      if (points != null) return `${points.toFixed(1)} pts`;
      return "—";
    }

    if (lowerKey.includes("msr_left")) {
      const { text, points } = describeMsrFromPlayerTests(testsObj, "left");
      if (text && points != null) return `${text} (${points.toFixed(1)} pts)`;
      if (text) return text;
      if (points != null) return `${points.toFixed(1)} pts`;
      return "—";
    }

    if (lowerKey.includes("msr_right")) {
      const { text, points } = describeMsrFromPlayerTests(testsObj, "right");
      if (text && points != null) return `${text} (${points.toFixed(1)} pts)`;
      if (text) return text;
      if (points != null) return `${points.toFixed(1)} pts`;
      return "—";
    }

    const numeric = parseFiniteNumber(testsObj[key]);
    if (numeric !== null) {
      return formatAthleticNumericValue(numeric, test.unit);
    }
    if (testsObj[key] !== undefined && testsObj[key] !== null) {
      return String(testsObj[key]);
    }
    return "—";
  }

  const numeric = parseFiniteNumber(testsObj[key]);
  if (numeric !== null) {
    if (category === "speed" && lowerKey.endsWith("_speed")) {
      return `${numeric.toFixed(2)} ft/s`;
    }
    return formatAthleticNumericValue(numeric, test.unit);
  }

  if (testsObj[key] !== undefined && testsObj[key] !== null) {
    return String(testsObj[key]);
  }

  return "—";
}

function AthleticPlayerGridForCategory({
  category,
  drilldown,
}: {
  category: AthleticCategoryCode;
  drilldown: AthleticDrilldownData;
}) {
  const sub = drilldown.submetrics.find((s) => s.code === category);
  if (!sub) return null;

  const players = drilldown.players ?? [];
  if (!players.length) {
    return (
      <div className="rounded-lg bg-slate-950/40 border border-slate-800 p-3">
        <p className="text-xs text-slate-400">
          No player‑level athletic data yet for this category.
        </p>
      </div>
    );
  }

  const testsForCategory = sub.tests;
  if (!testsForCategory.length) {
    return (
      <div className="rounded-lg bg-slate-950/40 border border-slate-800 p-3">
        <p className="text-xs text-slate-400">
          No raw tests for this category yet.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-slate-950/40 border border-slate-800 p-3">
      <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1">
        <div className="text-xs uppercase tracking-wide text-slate-400">
          {ATHLETIC_HEADER_LABEL_BY_CODE[category]} – player grid
        </div>
        <div className="text-[10px] text-slate-500">
          One row per player; columns show each test in this category.
        </div>
      </div>
      <div className="mt-2 overflow-x-auto">
        <table className="min-w-full text-xs text-left">
          <thead>
            <tr className="border-b border-slate-700 text-slate-400">
              <th className="px-2 py-1 font-semibold">Player</th>
              <th className="px-2 py-1 font-semibold">#</th>
              {testsForCategory.map((test) => (
                <th
                  key={test.key}
                  className="px-2 py-1 font-semibold text-right"
                >
                  {test.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {players.map((p) => {
              const testsObj = getAthleticPlayerTestsObject(p);
              const name = p.playerName || "Player";
              const jersey =
                p.jerseyNumber !== null &&
                p.jerseyNumber !== undefined &&
                p.jerseyNumber !== ""
                  ? p.jerseyNumber
                  : "—";

              return (
                <tr
                  key={p.playerId}
                  className="border-t border-slate-800 text-slate-100"
                >
                  <td className="px-2 py-1">{name}</td>
                  <td className="px-2 py-1">{jersey}</td>
                  {testsForCategory.map((test) => (
                    <td
                      key={test.key}
                      className="px-2 py-1 text-right align-top whitespace-pre-wrap"
                    >
                      {formatAthleticPlayerCell(
                        category,
                        test,
                        testsObj,
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AthleticDrilldownSection({
  teamStats,
  teamMetricsByCode,
  viewMode,
  onViewModeChange,
}: {
  teamStats: TeamStatsOverview | null;
  teamMetricsByCode: Map<
    CoreMetricCode,
    { label: string; score: number | null; percent: number | null }
  >;
  viewMode: AthleticViewMode;
  onViewModeChange: (mode: AthleticViewMode) => void;
}) {
  const drilldown = useMemo(
    () => buildAthleticDrilldown(teamStats, teamMetricsByCode),
    [teamStats, teamMetricsByCode],
  );

  const [activeSubmetrics, setActiveSubmetrics] = useState<AthleticCategoryCode[]>([
    "speed",
  ]);

  const hasAnyTests = drilldown.submetrics.some(
    (s) => s.tests.length > 0 || s.score !== null,
  );

  const athleticMetric = teamMetricsByCode.get("athletic") ?? null;

  const toggleSubmetric = (code: AthleticCategoryCode) => {
    setActiveSubmetrics((prev) => {
      if (prev.includes(code)) {
        if (prev.length === 1) return prev;
        return prev.filter((c) => c !== code);
      }
      return [...prev, code];
    });
  };

  return (
    <section className="mt-6">
      <div className="rounded-xl bg-slate-900/70 border border-slate-700">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 border-b border-slate-700">
          <div>
            <h3 className="text-sm font-semibold text-slate-50">
              Athletic drilldown
            </h3>
            <p className="text-xs text-slate-400">
              Speed, strength, power, balance, and mobility results for this
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

        <div className="p-4 space-y-4">
          {!teamStats && (
            <p className="text-xs text-slate-400">
              Select a team and evaluation to view athletic details.
            </p>
          )}

          {teamStats && !hasAnyTests && (
            <p className="text-xs text-slate-400">
              No athletic metrics yet for this team. Once players complete an
              assessment, we&apos;ll surface their speed, strength, power,
              balance, and mobility drill results here.
            </p>
          )}

          {teamStats && hasAnyTests && (
            <>
              {/* Category tiles – clickable to toggle which categories are shown below */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {drilldown.submetrics.map((sub) => {
                  const displayScore =
                    sub.score != null ? formatNumber(sub.score * 3, 0) : "—";
                  const isActive = activeSubmetrics.includes(sub.code);

                  return (
                    <button
                      key={sub.code}
                      type="button"
                      onClick={() => toggleSubmetric(sub.code)}
                      className={[
                        "text-left rounded-lg border p-3 bg-slate-950/60 flex flex-col gap-2 transition",
                        isActive
                          ? "border-amber-400 shadow-sm"
                          : "border-slate-800 hover:border-amber-400/60",
                      ].join(" ")}
                    >
                      <div>
                        <div className="text-[11px] uppercase tracking-wide text-slate-400">
                          {sub.label}
                        </div>
                        <div className="text-lg font-semibold text-slate-50">
                          {displayScore}
                        </div>
                        <div className="mt-1">
                          <RubricBar score={sub.score} showLabels={false} />
                        </div>
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {isActive ? "Showing breakdown" : "Tap to show breakdown"}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Detail sections */}
              {viewMode === "team" ? (
                <div className="space-y-4 mt-4">
                  {activeSubmetrics.map((code) => {
                    const sub = drilldown.submetrics.find((s) => s.code === code);
                    if (!sub) return null;

                    const headerLabel = ATHLETIC_HEADER_LABEL_BY_CODE[code];
                    const displayScore =
                      sub.score != null ? formatNumber(sub.score * 3, 0) : "—";

                    return (
                      <div
                        key={code}
                        className="rounded-lg bg-slate-950/40 border border-slate-800 p-3"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1">
                          <div className="text-xs uppercase tracking-wide text-slate-400">
                            {headerLabel}
                          </div>
                          <div className="text-xs text-slate-300">
                            Team average:{" "}
                            <span className="font-semibold text-slate-50">
                              {displayScore}
                            </span>
                          </div>
                        </div>

                        {sub.tests.length === 0 ? (
                          <p className="mt-2 text-[11px] text-slate-500">
                            No raw tests for this category yet.
                          </p>
                        ) : (
                          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {sub.tests.map((test) => (
                              <div
                                key={test.key}
                                className="rounded-md bg-slate-900/60 border border-slate-800 px-3 py-2"
                              >
                                <div className="text-sm font-medium text-slate-100">
                                  {test.label}
                                </div>
                                <div className="mt-1 text-xs text-slate-300">
                                  Team avg:{" "}
                                  <span className="font-mono text-slate-50">
                                    {formatAthleticTestValue(test)}
                                  </span>
                                </div>
                                {test.extra && (
                                  <div className="mt-1 text-[10px] text-slate-400">
                                    {test.extra}
                                  </div>
                                )}
                                {test.rubricScore != null && (
                                  <div className="mt-2 max-w-[140px]">
                                    <RubricBar
                                      score={test.rubricScore}
                                      showLabels={false}
                                    />
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-4 mt-4">
                  {!drilldown.players.length ? (
                    <p className="text-xs text-slate-400">
                      No player‑level athletic records yet for this evaluation.
                    </p>
                  ) : (
                    activeSubmetrics.map((code) => (
                      <AthleticPlayerGridForCategory
                        key={code}
                        category={code}
                        drilldown={drilldown}
                      />
                    ))
                  )}
                </div>
              )}

              {/* Overall team athletic score */}
              <div className="rounded-lg bg-slate-950/40 border border-slate-800 p-3">
                <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-2">
                  <div className="text-xs uppercase tracking-wide text-slate-400">
                    Team athletic score
                  </div>
                  <div className="text-xs text-slate-300">
                    {athleticMetric?.label ?? "Athletic"}
                  </div>
                </div>
                <div className="mt-1 text-xl font-semibold text-slate-50">
                  {formatNumber(
                    drilldown.overallScore != null
                      ? drilldown.overallScore * 3
                      : athleticMetric?.score ?? null,
                    0,
                  )}
                </div>
                <div className="mt-2">
                  <RubricBar
                    score={drilldown.overallScore ?? null}
                    showLabels
                  />
                </div>
                <p className="mt-2 text-[11px] text-slate-500">
                  Scores are shown on a 0–150 visual scale (0–50 engine scale ×
                  3). Raw test outputs (times, reps, distances, and mobility
                  responses) appear under each category above.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

// ------------------------ Main page ------------------------

export default function StatsPage() {
  const { profile } = useAuth();
  const role = profile?.role;
  const isCoachLike = role === "coach" || role === "assistant" || role === "admin";

  const [hasPlayerProfile, setHasPlayerProfile] = useState<boolean>(role === "player");

  const playerId = hasPlayerProfile ? profile?.id ?? null : null;

  const [viewMode, setViewMode] = useState<ViewMode>(isCoachLike ? "team" : "player");

  const [activeCoreMetric, setActiveCoreMetric] = useState<CoreMetricCode>("offense");

  // --- Team data (coach / admin view) --------------------------

  const [teams, setTeams] = useState<TeamWithRole[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [teamsError, setTeamsError] = useState<string | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);

  const [teamEvaluations, setTeamEvaluations] = useState<TeamEvaluationOption[]>([]);
  const [teamEvaluationsLoading, setTeamEvaluationsLoading] = useState(false);
  const [teamEvaluationsError, setTeamEvaluationsError] = useState<string | null>(null);
  const [selectedEvalKey, setSelectedEvalKey] = useState<string>("all_star");

  const [teamStats, setTeamStats] = useState<TeamStatsOverview | null>(null);
  const [teamStatsLoading, setTeamStatsLoading] = useState(false);
  const [teamStatsError, setTeamStatsError] = useState<string | null>(null);

  const [teamTrophies, setTeamTrophies] = useState<TeamTrophyWithDefinition[]>([]);

  // Offense drilldown
  const [offenseViewMode, setOffenseViewMode] = useState<OffenseViewMode>("team");
  const [offenseDrilldown, setOffenseDrilldown] =
    useState<TeamOffenseDrilldown | null>(null);
  const [offenseLoading, setOffenseLoading] = useState(false);
  const [offenseError, setOffenseError] = useState<string | null>(null);

  // Athletic drilldown
  const [athleticViewMode, setAthleticViewMode] =
    useState<AthleticViewMode>("team");

  // Defense drilldown
  const [defenseDrilldown, setDefenseDrilldown] =
    useState<TeamDefenseDrilldown | null>(null);
  const [defenseDrilldownLoading, setDefenseDrilldownLoading] = useState(false);
  const [defenseError, setDefenseError] = useState<string | null>(null);
  const [defenseViewMode, setDefenseViewMode] =
    useState<DefenseViewMode>("team");


  // --- Player data (player / parent view, and for coach "self" view) ---

  const [playerStats, setPlayerStats] = useState<PlayerStatsOverview | null>(null);
  const [playerStatsLoading, setPlayerStatsLoading] = useState(false);
  const [playerStatsError, setPlayerStatsError] = useState<string | null>(null);

  const [playerMedals, setPlayerMedals] = useState<PlayerMedalWithDefinition[]>([]);

  useEffect(() => {
    if (!hasPlayerProfile && viewMode === "player") {
      setViewMode(isCoachLike ? "team" : "team");
    }
  }, [hasPlayerProfile, viewMode, isCoachLike]);

  // Load teams for coach-like users
  useEffect(() => {
    if (!isCoachLike) return;

    let cancelled = false;
    setTeamsLoading(true);
    setTeamsError(null);

    getMyTeams()
      .then((data) => {
        if (cancelled) return;
        const teams = data ?? [];
        setTeams(teams);

        const hasPlayerRole = teams.some((team) => team.role === "player");
        if (hasPlayerRole) {
          setHasPlayerProfile((prev) => prev || hasPlayerRole);
        }

        if (!selectedTeamId && teams.length > 0) {
          setSelectedTeamId(teams[0].id);
        }
      })
      .catch((err: any) => {
        if (cancelled) return;
        console.error("Error loading teams for stats page:", err);
        setTeamsError(
          err?.response?.data?.error ||
            err?.message ||
            "Failed to load your teams.",
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

  // Load team evaluations
  useEffect(() => {
    if (!selectedTeamId || !isCoachLike || viewMode !== "team") {
      setTeamEvaluations([]);
      return;
    }

    let cancelled = false;
    setTeamEvaluationsLoading(true);
    setTeamEvaluationsError(null);

    getTeamEvaluations(selectedTeamId)
      .then((data) => {
        if (cancelled) return;
        setTeamEvaluations(data?.evaluations ?? []);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Error loading team evaluations:", err);
        setTeamEvaluationsError(
          err?.response?.data?.error ||
            err?.message ||
            "Failed to load team evaluations.",
        );
      })
      .finally(() => {
        if (cancelled) return;
        setTeamEvaluationsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedTeamId, isCoachLike, viewMode]);

  const evaluationSelectOptions = useMemo<EvaluationSelectOption[]>(() => {
    const base: EvaluationSelectOption[] = [
      {
        key: "all_star",
        label: "All-Star Points",
        evalScope: "all_star",
      },
      {
        key: "latest_eval",
        label: "Latest Eval",
        evalScope: "latest_eval",
      },
    ];

    const formatDateTimeLabel = (timestamp: string | null | undefined) => {
      if (!timestamp) return "Unknown date";
      const d = new Date(timestamp);
      if (Number.isNaN(d.getTime())) return timestamp;
      return d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    };

    const formatKindLabel = (kind?: string | null) => {
      if (!kind || !kind.trim()) return null;
      return kind
        .trim()
        .split(/[_\s]+/)
        .map((p) => (p ? p[0].toUpperCase() + p.slice(1).toLowerCase() : p))
        .join(" ");
    };

    const dated = [...teamEvaluations]
      .sort((a, b) => {
        const aTs = a.performed_at ?? "";
        const bTs = b.performed_at ?? "";
        return bTs.localeCompare(aTs);
      })
      .map((ev) => {
        const dateLabel = formatDateTimeLabel(ev.performed_at);
        const typeLabel =
          (ev.template_name && ev.template_name.trim()) ||
          formatKindLabel(ev.kind);
        const label = typeLabel ? `${dateLabel} — ${typeLabel}` : dateLabel;

        return {
          key:
            ev.id != null
              ? String(ev.id)
              : `${ev.performed_at ?? "unknown"}-${
                  ev.template_id ?? ev.kind ?? "unknown"
                }`,
          label,
          evalScope: "specific" as TeamEvalScope,
          assessmentDate: ev.performed_at ?? null,
        };
      });

    return [...base, ...dated];
  }, [teamEvaluations]);

  useEffect(() => {
    if (!evaluationSelectOptions.length) return;
    const exists = evaluationSelectOptions.some((opt) => opt.key === selectedEvalKey);
    if (!exists) {
      setSelectedEvalKey(evaluationSelectOptions[0].key);
    }
  }, [evaluationSelectOptions, selectedEvalKey]);

  const selectedEvalOption = useMemo(() => {
    if (!evaluationSelectOptions.length) return null;
    return (
      evaluationSelectOptions.find((opt) => opt.key === selectedEvalKey) ??
      evaluationSelectOptions[0]
    );
  }, [evaluationSelectOptions, selectedEvalKey]);

  // Load team stats & trophies
  useEffect(() => {
    if (
      !selectedTeamId ||
      !isCoachLike ||
      viewMode !== "team" ||
      !selectedEvalOption
    ) {
      return;
    }

    let cancelled = false;
    setTeamStatsLoading(true);
    setTeamStatsError(null);

    (async () => {
      try {
        const evalParams = {
          evalScope: selectedEvalOption.evalScope,
          assessmentDate: selectedEvalOption.assessmentDate ?? null,
        };

        const [stats, trophiesRes] = await Promise.all([
          getTeamStatsOverview(selectedTeamId, evalParams),
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
            "Failed to load team stats.",
        );
      } finally {
        if (cancelled) return;
        setTeamStatsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedTeamId, isCoachLike, viewMode, selectedEvalOption]);

  // Load offense drilldown
  useEffect(() => {
    if (
      !selectedTeamId ||
      !isCoachLike ||
      viewMode !== "team" ||
      !selectedEvalOption
    ) {
      return;
    }

    let cancelled = false;
    setOffenseLoading(true);
    setOffenseError(null);

    const evalParams = {
      evalScope: selectedEvalOption.evalScope,
      assessmentDate: selectedEvalOption.assessmentDate ?? null,
    };

    getTeamOffenseDrilldown(selectedTeamId, evalParams)
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
  }, [selectedTeamId, isCoachLike, viewMode, selectedEvalOption]);

  // Load defense drilldown (used by DefenseDrilldownSection)
  useEffect(() => {
    let cancelled = false;

    async function run() {
      // If we don't have the basics, reset and bail
      if (!selectedTeamId || !isCoachLike || viewMode !== "team" || !selectedEvalOption) {
        if (!cancelled) {
          setDefenseDrilldown(null);
          setDefenseError(null);
          setDefenseDrilldownLoading(false);
        }
        return;
      }

      setDefenseDrilldownLoading(true);
      setDefenseError(null);

      type DefenseQueryParams = {
        evalScope?: TeamEvalScope;
        assessmentDate?: string | null;
      };

      // 1) Primary attempt: whatever the user selected in the dropdown
      const attempts: DefenseQueryParams[] = [
        {
          evalScope: selectedEvalOption.evalScope,
          assessmentDate: selectedEvalOption.assessmentDate ?? null,
        },
      ];

      // 2) Fallback: if All-Star / specific returns "no defense ratings"
      //    we fall back to latest_eval so at least *some* defense data shows.
      if (selectedEvalOption.evalScope !== "latest_eval") {
        attempts.push({ evalScope: "latest_eval" as TeamEvalScope });
      }

      let success = false;
      let lastError: string | null = null;

      for (const params of attempts) {
        try {
          const data = await getTeamDefenseDrilldown(selectedTeamId, params);
          if (cancelled) return;

          setDefenseDrilldown(data);
          setDefenseError(null);
          success = true;
          break;
        } catch (err: any) {
          if (cancelled) return;

          console.error(
            "Failed to load defense drilldown with params",
            params,
            err,
          );

          const msg: string =
            err?.response?.data?.error ||
            err?.message ||
            "Failed to load team defense breakdown.";
          lastError = msg;

          const lower = msg.toLowerCase();
          const isNoDefense =
            lower.includes("no defense ratings") ||
            lower.includes("no defense") ||
            lower.includes("no defensive ratings");

          // If this looks like a "no defense ratings" case and we still have a
          // fallback attempt left, continue the loop; otherwise stop trying.
          const isLastAttempt = params === attempts[attempts.length - 1];
          if (!isNoDefense || isLastAttempt) {
            break;
          }
        }
      }

      if (!cancelled && !success) {
        setDefenseDrilldown(null);

        // If the last error was "no defense ratings", treat it as "no data yet"
        // instead of a big red error.
        if (
          lastError &&
          lastError.toLowerCase().includes("no defense")
        ) {
          setDefenseError(null);
        } else {
          setDefenseError(
            lastError ?? "Failed to load team defense breakdown.",
          );
        }
      }

      if (!cancelled) {
        setDefenseDrilldownLoading(false);
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [selectedTeamId, isCoachLike, viewMode, selectedEvalOption]);


  // Load player stats & medals
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
            "Failed to load your stats.",
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
          score: metric.score != null ? metric.score * 3 : null,
          percent: metric.percent,
        });
      }
    }

    const breakdown = (teamStats as any)?.breakdown as
      | Record<string, any>
      | undefined;

    const athleticSection =
      breakdown?.athletic ?? breakdown?.athlete ?? null;

    if (athleticSection) {
      const testsAny = (athleticSection.tests ??
        athleticSection ??
        {}) as Record<string, any>;

      const totalPoints = parseFiniteNumber(
        athleticSection.total_points ?? testsAny.total_points,
      );
      const maxPoints = parseFiniteNumber(
        athleticSection.max_points ?? testsAny.max_points,
      );

      const fromPoints =
        totalPoints !== null &&
        maxPoints !== null &&
        maxPoints > 0
          ? (totalPoints / maxPoints) * 50
          : null;

      const athleticOverall = parseFiniteNumber(
        athleticSection.overall_score ??
          testsAny.overall_score ??
          (breakdown as any)?.athletic_score ??
          fromPoints,
      );

      const existing = map.get("athletic");
      const label = existing?.label ?? "Athletic";

      let score: number | null = existing?.score ?? null;
      let percent: number | null = existing?.percent ?? null;

      if (athleticOverall != null) {
        score = athleticOverall * 3; // 0–150 visual scale
        if (percent == null) {
          percent = Math.round((athleticOverall / 50) * 100);
        }
      }

      map.set("athletic", { label, score, percent });
    }

    return map;
  }, [teamStats]);

  const bestTrophiesByMetric = useMemo(() => {
    const result: Partial<Record<CoreMetricCode, TeamTrophyWithDefinition | null>> =
      {};
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
              ? "View BPOP ratings, trophies, and offense, defense & athletic breakdowns for your teams."
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
            {hasPlayerProfile && (
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
            )}
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

              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex items-center gap-2">
                  {teamsLoading && (
                    <span className="text-xs text-slate-400">
                      Loading teams…
                    </span>
                  )}
                  {teamsError && (
                    <span className="text-xs text-red-400">
                      {teamsError}
                    </span>
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

                {selectedTeamId && evaluationSelectOptions.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-300">Evaluation:</span>
                    {teamEvaluationsLoading && (
                      <span className="text-xs text-slate-400">
                        Loading…
                      </span>
                    )}
                    {teamEvaluationsError && (
                      <span className="text-xs text-red-400">
                        {teamEvaluationsError}
                      </span>
                    )}
                    <select
                      value={selectedEvalKey}
                      onChange={(e) => setSelectedEvalKey(e.target.value)}
                      className="text-xs bg-slate-950/80 border border-slate-700 rounded-md px-2 py-1 text-slate-100"
                    >
                      {evaluationSelectOptions.map((opt) => (
                        <option key={opt.key} value={opt.key}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
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

                  {/* Core categories */}
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {(METRIC_ORDER.filter(
                      (code) => code !== "bpoprating",
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
          ) : activeCoreMetric === "defense" ? (
            <DefenseDrilldownSection
              drilldown={defenseDrilldown}
              loading={defenseDrilldownLoading}
              error={defenseError}
              viewMode={defenseViewMode}
              onViewModeChange={setDefenseViewMode}
            />
          ) : activeCoreMetric === "athletic" ? (
            <AthleticDrilldownSection
              teamStats={teamStats}
              teamMetricsByCode={teamMetricsByCode}
              viewMode={athleticViewMode}
              onViewModeChange={setAthleticViewMode}
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
                  <span className="font-semibold text-amber-400">
                    Offense
                  </span>
                  ,{" "}
                  <span className="font-semibold text-amber-400">
                    Defense
                  </span>{" "}
                  or{" "}
                  <span className="font-semibold text-amber-400">
                    Athletic
                  </span>{" "}
                  to view the full breakdowns and team / player leaderboards.
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
                              metric.score != null ? metric.score * 3 : null,
                            )}
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

          {/* Placeholder for full medal history / rankings */}
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
