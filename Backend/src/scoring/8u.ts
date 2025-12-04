// src/scoring/8u.ts
import type { MetricMap, RatingResult } from "./5u";

/**
 * Helpers
 */
function clamp(value: number | null | undefined, min: number, max: number): number | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function sum(values: Array<number | null | undefined>): number | null {
  const nums = values.filter((v): v is number => v !== null && v !== undefined && !Number.isNaN(v));
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0);
}

function average(values: Array<number | null | undefined>): number | null {
  const total = sum(values);
  if (total === null) return null;
  const count = values.filter((v) => v !== null && v !== undefined && !Number.isNaN(v)).length;
  if (count === 0) return null;
  return total / count;
}

function getMetric(metrics: MetricMap, key: string): number | null {
  const v = (metrics as any)[key];
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * 8U ATHLETIC SKILLS
 *
 * Tests & maxima (points):
 * - 1B Speed:    from timed_run_1b (seconds) + timed_run_1b_distance_ft (feet) -> FPS -> max 40
 * - 4B Speed:    from timed_run_4b (seconds) + timed_run_4b_distance_ft (feet) -> FPS -> max 45
 * - Push-ups 30s (APUSH30): raw/2, max 20
 * - Sit-ups 30s (ASIT30):   raw/3, max 15
 * - Vertical jump inches (ASPJUMP): raw inches, max 20
 * - SLS Eyes Open (avg of L/R seconds): (avg / 3), max 10
 * - SLS Eyes Closed (avg of L/R seconds): (avg / 2), max 15
 * - MSR Right / Left: each 0–3, total max 6
 * - Toe Touch: 0–3 (same as 6U/7U)
 * - Deep Squat: 0–8 (same as 6U/7U)
 *
 * If the distance metrics are missing, we default to:
 *   1B distance = 60 ft, 4B distance = 240 ft
 *
 * Category max points = 40 + 45 + 20 + 15 + 20 + 10 + 15 + 6 + 3 + 8 = 182
 * Category score = (totalPoints / 182) * 50
 */

const TS1B_MAX_POINTS_8U = 40;
const TS4B_MAX_POINTS_8U = 45;
const SPEED_POINTS_MAX_8U = TS1B_MAX_POINTS_8U + TS4B_MAX_POINTS_8U; // 85

const PUSHUPS_MAX_POINTS_8U = 20; // 40 / 2
const SITUPS_MAX_POINTS_8U = 15;  // 45 / 3
const VJUMP_MAX_POINTS_8U = 20;

const SLS_OPEN_MAX_8U = 10;   // 30s / 3
const SLS_CLOSED_MAX_8U = 15; // 30s / 2

const MSR_TOTAL_MAX_8U = 6;   // 3 + 3
const TOE_TOUCH_MAX_8U = 3;
const DEEP_SQUAT_MAX_8U = 8;

const ATHLETIC_MAX_POINTS_8U =
  TS1B_MAX_POINTS_8U +
  TS4B_MAX_POINTS_8U +
  PUSHUPS_MAX_POINTS_8U +
  SITUPS_MAX_POINTS_8U +
  VJUMP_MAX_POINTS_8U +
  SLS_OPEN_MAX_8U +
  SLS_CLOSED_MAX_8U +
  MSR_TOTAL_MAX_8U +
  TOE_TOUCH_MAX_8U +
  DEEP_SQUAT_MAX_8U; // 182

function compute8UAthleticSkills(metrics: MetricMap) {
  // Raw inputs: times
  const run1bSeconds = getMetric(metrics, "timed_run_1b");
  const run4bSeconds = getMetric(metrics, "timed_run_4b");

  // New distance metrics (feet), with sane defaults if missing
  const run1bDistanceRawFt = getMetric(metrics, "timed_run_1b_distance_ft");
  const run4bDistanceRawFt = getMetric(metrics, "timed_run_4b_distance_ft");

  const run1bDistanceFt = run1bDistanceRawFt ?? 60;   // default 60 ft
  const run4bDistanceFt = run4bDistanceRawFt ?? 240;  // default 4 × 60 ft

  // Convert to FPS: distance / time
  const run1bFps =
    run1bSeconds !== null && run1bSeconds > 0
      ? run1bDistanceFt / run1bSeconds
      : null;

  const run4bFps =
    run4bSeconds !== null && run4bSeconds > 0
      ? run4bDistanceFt / run4bSeconds
      : null;

  // Speed points (using sheet logic: FPS/5 * 10 → capped to TS1B/TS4B max)
  const run1bPointsRaw = run1bFps !== null ? (run1bFps / 5) * 10 : null;
  const run4bPointsRaw = run4bFps !== null ? (run4bFps / 5) * 10 : null;

  const run1bPoints = clamp(run1bPointsRaw, 0, TS1B_MAX_POINTS_8U);
  const run4bPoints = clamp(run4bPointsRaw, 0, TS4B_MAX_POINTS_8U);

  const speedPointsTotal = sum([run1bPoints, run4bPoints]);
  const speedScore =
    speedPointsTotal !== null
      ? Number(((speedPointsTotal / SPEED_POINTS_MAX_8U) * 50).toFixed(1))
      : null;

  // Balance: SLS open/closed (avg of L/R)
  const slsOpenRightSec = getMetric(metrics, "sls_eyes_open_right");
  const slsOpenLeftSec = getMetric(metrics, "sls_eyes_open_left");
  const slsClosedRightSec = getMetric(metrics, "sls_eyes_closed_right");
  const slsClosedLeftSec = getMetric(metrics, "sls_eyes_closed_left");

  const slsOpenAvgSeconds = average([slsOpenRightSec, slsOpenLeftSec]);
  const slsClosedAvgSeconds = average([slsClosedRightSec, slsClosedLeftSec]);

  const slsOpenPointsRaw = slsOpenAvgSeconds !== null ? slsOpenAvgSeconds / 3 : null;
  const slsClosedPointsRaw = slsClosedAvgSeconds !== null ? slsClosedAvgSeconds / 2 : null;

  const slsOpenPoints = clamp(slsOpenPointsRaw, 0, SLS_OPEN_MAX_8U);
  const slsClosedPoints = clamp(slsClosedPointsRaw, 0, SLS_CLOSED_MAX_8U);

  // Strength: push-ups & sit-ups
  const pushupsRaw = getMetric(metrics, "apush_30");
  const situpsRaw = getMetric(metrics, "asit_30");

  const pushupsPointsRaw = pushupsRaw !== null ? pushupsRaw / 2 : null;
  const situpsPointsRaw = situpsRaw !== null ? situpsRaw / 3 : null;

  const pushupsPoints = clamp(pushupsPointsRaw, 0, PUSHUPS_MAX_POINTS_8U);
  const situpsPoints = clamp(situpsPointsRaw, 0, SITUPS_MAX_POINTS_8U);

  // Vertical jump
  const vjumpInches = getMetric(metrics, "asp_jump_inches");
  const vjumpPoints = clamp(vjumpInches, 0, VJUMP_MAX_POINTS_8U);

  // MSR (multi-segment rotation) – degrees
  const msrRightRaw = getMetric(metrics, "msr_right");
  const msrLeftRaw = getMetric(metrics, "msr_left");

  const msrRightPoints =
    msrRightRaw === null
      ? null
      : msrRightRaw > 180
      ? 3
      : msrRightRaw === 180
      ? 1
      : 0;

  const msrLeftPoints =
    msrLeftRaw === null
      ? null
      : msrLeftRaw > 180
      ? 3
      : msrLeftRaw === 180
      ? 1
      : 0;

  const msrPointsTotal = sum([msrRightPoints, msrLeftPoints]);

  // Mobility: toe touch & deep squat (same as 6U/7U)
  const toeTouchRawPoints = getMetric(metrics, "toe_touch");
  const deepSquatRawPoints = getMetric(metrics, "deep_squat");

  const toeTouchPoints = clamp(toeTouchRawPoints, 0, TOE_TOUCH_MAX_8U);
  const deepSquatPoints = clamp(deepSquatRawPoints, 0, DEEP_SQUAT_MAX_8U);

  // Category total
  const athleticTotalPoints = sum([
    run1bPoints,
    run4bPoints,
    pushupsPoints,
    situpsPoints,
    vjumpPoints,
    slsOpenPoints,
    slsClosedPoints,
    msrPointsTotal,
    toeTouchPoints,
    deepSquatPoints,
  ]);

  const athleticScore =
    athleticTotalPoints !== null
      ? Number(((athleticTotalPoints / ATHLETIC_MAX_POINTS_8U) * 50).toFixed(1))
      : null;

  return {
    score: athleticScore,
    max_points: ATHLETIC_MAX_POINTS_8U,
    total_points: athleticTotalPoints,
    breakdown: {
      tests: {
        // Speed
        run_1b_seconds: run1bSeconds,
        run_4b_seconds: run4bSeconds,
        run_1b_distance_ft: run1bDistanceFt,
        run_4b_distance_ft: run4bDistanceFt,
        run_1b_fps: run1bFps,
        run_4b_fps: run4bFps,
        speed_score: speedScore,
        run_1b_points: run1bPoints,
        run_4b_points: run4bPoints,

        // Strength
        pushups_30_raw: pushupsRaw,
        situps_30_raw: situpsRaw,
        pushups_30_points: pushupsPoints,
        situps_30_points: situpsPoints,

        // Vertical jump
        vjump_inches_raw: vjumpInches,
        vjump_points: vjumpPoints,

        // Balance
        sls_open_avg_seconds: slsOpenAvgSeconds,
        sls_open_points: slsOpenPoints,
        sls_open_right_seconds: slsOpenRightSec,
        sls_open_left_seconds: slsOpenLeftSec,

        sls_closed_avg_seconds: slsClosedAvgSeconds,
        sls_closed_points: slsClosedPoints,
        sls_closed_right_seconds: slsClosedRightSec,
        sls_closed_left_seconds: slsClosedLeftSec,

        // MSR
        msr_right_raw: msrRightRaw,
        msr_left_raw: msrLeftRaw,
        msr_right_points: msrRightPoints,
        msr_left_points: msrLeftPoints,
        msr_points_total: msrPointsTotal,

        // Mobility
        toe_touch_raw_points: toeTouchRawPoints,
        toe_touch_points: toeTouchPoints,
        deep_squat_raw_points: deepSquatRawPoints,
        deep_squat_points: deepSquatPoints,

        speed_points_total: speedPointsTotal,
      },
      max_points: ATHLETIC_MAX_POINTS_8U,
      total_points: athleticTotalPoints,
    },
  };
}


/**
 * 8U HITTING
 *
 * Metrics:
 * - H10FAST:   m_10_fastball_quality   (0–50 points)
 * - HC10LD:    tee_line_drive_test_10  (0–10 points)
 * - HPTEV:     max_exit_velo_tee (mph)       -> points = mph / 5, max 12
 * - HPBS:      max_bat_speed (mph)           -> points = mph / 4, max 13.75
 *
 * ContactScore = (HC10LD + H10FAST) / 60 * 100
 * PowerScore   = (HPTEV_pts + H10FAST + HPBS_pts) / 75.75 * 100
 * Hitting category max points = 10 + 12 + 50 + 13.75 = 85.75
 * Hitting score (0–50) = (sum of those 4 point components / 85.75) * 50
 */

const HITTING_CONTACT_MAX_8U = 60;       // HC10LD (10) + H10FAST (50)
const HITTING_POWER_MAX_8U = 75.75;      // HPTEV(12) + H10FAST(50) + HPBS(13.75)
const HITTING_CATEGORY_MAX_8U = 85.75;   // 10 + 12 + 50 + 13.75

function compute8UHitting(metrics: MetricMap) {
  const fastballRaw = getMetric(metrics, "m_10_fastball_quality"); // H10FAST (0–50)
  const teeLdRaw = getMetric(metrics, "tee_line_drive_test_10");    // HC10LD (0–10)
  const batSpeedMph = getMetric(metrics, "max_bat_speed");          // HPBS
  const exitVeloMph = getMetric(metrics, "max_exit_velo_tee");      // HPTEV

  // Clamp raw tests
  const pitchPoints = clamp(fastballRaw, 0, 50);
  const teeLdPoints = clamp(teeLdRaw, 0, 10);

  const batSpeedPointsRaw = batSpeedMph !== null ? batSpeedMph / 4 : null;
  const exitVeloPointsRaw = exitVeloMph !== null ? exitVeloMph / 5 : null;

  const batSpeedPoints = clamp(batSpeedPointsRaw, 0, 13.75);
  const exitVeloPoints = clamp(exitVeloPointsRaw, 0, 12);

  // Contact & Power raw points (for % scores)
  const contactRawPoints = sum([teeLdPoints, pitchPoints]);
  const powerRawPoints = sum([exitVeloPoints, pitchPoints, batSpeedPoints]);

  const contactScore =
    contactRawPoints !== null
      ? Number(((contactRawPoints / HITTING_CONTACT_MAX_8U) * 100).toFixed(1))
      : null;

  const powerScore =
    powerRawPoints !== null
      ? Number(((powerRawPoints / HITTING_POWER_MAX_8U) * 100).toFixed(1))
      : null;

  // Category total points used for the 0–50 hitting score
  const hittingTotalPoints = sum([teeLdPoints, exitVeloPoints, pitchPoints, batSpeedPoints]);
  const hittingScore =
    hittingTotalPoints !== null
      ? Number(((hittingTotalPoints / HITTING_CATEGORY_MAX_8U) * 50).toFixed(1))
      : null;

  return {
    score: hittingScore,
    max_points: HITTING_CATEGORY_MAX_8U,
    total_points: hittingTotalPoints,
    breakdown: {
      tests: {
        pitch_raw: fastballRaw,
        tee_ld_raw: teeLdRaw,
        bat_speed_mph: batSpeedMph,
        exit_velo_mph: exitVeloMph,

        pitch_points: pitchPoints,
        tee_ld_points: teeLdPoints,
        bat_speed_points: batSpeedPoints,
        exit_velo_points: exitVeloPoints,

        contact_raw_points: contactRawPoints,
        power_raw_points: powerRawPoints,
        contact_score: contactScore,
        power_score: powerScore,

        // For convenience if you want to show “strike chance” in hitting table too
        strike_chance_percent: null,
      },
      max_points: HITTING_CATEGORY_MAX_8U,
      total_points: hittingTotalPoints,
    },
  };
}

/**
 * 8U THROWING / PITCHING
 *
 * Metrics:
 * - TSPEED40:  max_throwing_speed (mph)
 *     -> tspeed40_points = mph / 2 (max 27.5)
 * - TPITCH1040: m_10_throw_test_40ft (0–30 points)
 * - T80FT:      throw_80ft_target (0–20 points)
 *
 * Throwing category max points = 27.5 + 30 + 20 = 77.5
 * Throwing score (0–50) = totalPoints / 77.5 * 50
 *
 * Pitching-only metrics:
 * - PITCHSPEED       = TSPEED40 (mph)
 * - PITCHSPEEDSCORE  = tspeed40_points / 27.5 * 100
 * - PITCHACCSCORE    = TPITCH1040_points / 30 * 100
 * - PITCHINGSCORE    = (tspeed40_points + TPITCH1040_points)/(27.5+30) * 100
 *
 * StrikeoutChance (logistic model):
 *   nS = clamp((speed - 35) / (55 - 35), 0, 1)
 *   dA = accuracyPoints / 30
 *   x  = -2.3 + 0.8 * nS + 0.75 * dA
 *   StrikeoutChance% = 1 / (1 + exp(-x)) * 100
 */

const TSPEED40_MAX_POINTS_8U = 27.5; // 55 / 2
const TPITCH1040_MAX_POINTS_8U = 30;
const T80FT_MAX_POINTS_8U = 20;
const THROWING_MAX_POINTS_8U = TSPEED40_MAX_POINTS_8U + TPITCH1040_MAX_POINTS_8U + T80FT_MAX_POINTS_8U; // 77.5

// Strikeout model constants
const STRIKE_MIN_SPEED_8U = 35;
const STRIKE_MAX_SPEED_8U = 55;
const STRIKE_BASELINE_8U = -2.3;
const STRIKE_WEIGHT_SPEED_8U = 0.8;
const STRIKE_WEIGHT_ACC_8U = 0.75;

function compute8UThrowing(metrics: MetricMap) {
  const tspeedMph = getMetric(metrics, "max_throwing_speed");
  const tpitchRaw = getMetric(metrics, "m_10_throw_test_40ft");
  const t80Raw = getMetric(metrics, "throw_80ft_target");

  const tspeedPointsRaw = tspeedMph !== null ? tspeedMph / 2 : null;
  const tspeedPoints = clamp(tspeedPointsRaw, 0, TSPEED40_MAX_POINTS_8U);

  const tpitchPoints = clamp(tpitchRaw, 0, TPITCH1040_MAX_POINTS_8U);
  const t80Points = clamp(t80Raw, 0, T80FT_MAX_POINTS_8U);

  const throwingTotalPoints = sum([tspeedPoints, tpitchPoints, t80Points]);
  const throwingScore =
    throwingTotalPoints !== null
      ? Number(((throwingTotalPoints / THROWING_MAX_POINTS_8U) * 50).toFixed(1))
      : null;

  // Pitching-specific scores
  const pitchSpeedScorePercent =
    tspeedPoints !== null
      ? Number(((tspeedPoints / TSPEED40_MAX_POINTS_8U) * 100).toFixed(1))
      : null;

  const pitchAccScorePercent =
    tpitchPoints !== null
      ? Number(((tpitchPoints / TPITCH1040_MAX_POINTS_8U) * 100).toFixed(1))
      : null;

  const pitchScorePercent =
    tspeedPoints !== null && tpitchPoints !== null
      ? Number(
          (
            ((tspeedPoints + tpitchPoints) /
              (TSPEED40_MAX_POINTS_8U + TPITCH1040_MAX_POINTS_8U)) *
            100
          ).toFixed(1)
        )
      : null;

  // Logistic StrikeoutChance
  let strikeoutChancePercent: number | null = null;
  if (tspeedMph !== null && tpitchPoints !== null) {
    const nSRaw = (tspeedMph - STRIKE_MIN_SPEED_8U) / (STRIKE_MAX_SPEED_8U - STRIKE_MIN_SPEED_8U);
    const nS = Math.max(0, Math.min(1, nSRaw));
    const dA = tpitchPoints / TPITCH1040_MAX_POINTS_8U; // accuracy as 0–1

    const x =
      STRIKE_BASELINE_8U +
      STRIKE_WEIGHT_SPEED_8U * nS +
      STRIKE_WEIGHT_ACC_8U * dA;

    const logistic = 1 / (1 + Math.exp(-x));
    strikeoutChancePercent = Number((logistic * 100).toFixed(1));
  }

  return {
    score: throwingScore,
    max_points: THROWING_MAX_POINTS_8U,
    total_points: throwingTotalPoints,
    breakdown: {
      tests: {
        t40ft_points: tpitchPoints,
        t80ft_points: t80Points,
        tspeed40_points: tspeedPoints,
        tspeed40_raw_mph: tspeedMph,

        pitch_speed_mph: tspeedMph,
        pitch_speed_score_percent: pitchSpeedScorePercent,
        pitch_acc_score_percent: pitchAccScorePercent,
        pitch_score_percent: pitchScorePercent,
        strike_chance_percent: strikeoutChancePercent,
      },
      max_points: THROWING_MAX_POINTS_8U,
      total_points: throwingTotalPoints,
    },
  };
}

/**
 * 8U CATCHING
 *
 * Metrics:
 * - C10X10 Fly Ball Ladder Level (1–6) -> Points: 1->0, 2->5, 3->10, 4->15, 5->20, 6->25
 * - C51B: 5 throws; frontend already returns 0–15 total (Miss=0, Block=1, Catch=3)
 * - C1BST: 5 scoops; same scoring as C51B, total 0–15
 * - CIFF2B / 3B / SS: 3 fly balls each, Miss=0, Catch=2, totals 0–6
 * - CLD2B / 3B / SS: 3 line drives each, Miss=0, Catch=2, totals 0–6
 *
 * We assume the app sends the aggregate totals for each of those tests:
 * - c51b_catching_test       (0–15)
 * - c1bst_scoops_test        (0–15)
 * - infield_fly_2b / 3b / ss (0–6)
 * - infield_ld_2b / 3b / ss  (0–6)
 *
 * Category max points = 25 + 15 + 15 + 6*6 = 25 + 15 + 15 + 36 = 91
 * Catching score (0–50) = totalPoints / 91 * 50
 */

const C10X10_LADDER_MAX_POINTS_8U = 25;
const C51B_MAX_POINTS_8U = 15;
const C1BST_MAX_POINTS_8U = 15;
const CIFF_MAX_POINTS_8U = 6; // per infield fly test (2B/3B/SS)
const CLD_MAX_POINTS_8U = 6;  // per infield LD test (2B/3B/SS)

const CATCHING_MAX_POINTS_8U =
  C10X10_LADDER_MAX_POINTS_8U +
  C51B_MAX_POINTS_8U +
  C1BST_MAX_POINTS_8U +
  CIFF_MAX_POINTS_8U * 3 +
  CLD_MAX_POINTS_8U * 3; // 91

function c10x10LevelToPoints(level: number | null): number | null {
  if (level === null || Number.isNaN(level)) return null;
  if (level <= 1) return 0;
  if (level === 2) return 5;
  if (level === 3) return 10;
  if (level === 4) return 15;
  if (level === 5) return 20;
  if (level >= 6) return 25;
  return null;
}

function compute8UCatching(metrics: MetricMap) {
  const ladderLevelRaw = getMetric(metrics, "c10x10_fly_ball_ladder_level");
  const c51bRaw = getMetric(metrics, "c51b_catching_test");
  const c1bstRaw = getMetric(metrics, "c1bst_scoops_test");

  const ciff2bRaw = getMetric(metrics, "infield_fly_2b");
  const ciff3bRaw = getMetric(metrics, "infield_fly_3b");
  const ciffssRaw = getMetric(metrics, "infield_fly_ss");

  const cld2bRaw = getMetric(metrics, "infield_ld_2b");
  const cld3bRaw = getMetric(metrics, "infield_ld_3b");
  const cldssRaw = getMetric(metrics, "infield_ld_ss");

  const ladderPoints = c10x10LevelToPoints(ladderLevelRaw);
  const c51bPoints = clamp(c51bRaw, 0, C51B_MAX_POINTS_8U);
  const c1bstPoints = clamp(c1bstRaw, 0, C1BST_MAX_POINTS_8U);

  const ciff2bPoints = clamp(ciff2bRaw, 0, CIFF_MAX_POINTS_8U);
  const ciff3bPoints = clamp(ciff3bRaw, 0, CIFF_MAX_POINTS_8U);
  const ciffssPoints = clamp(ciffssRaw, 0, CIFF_MAX_POINTS_8U);

  const cld2bPoints = clamp(cld2bRaw, 0, CLD_MAX_POINTS_8U);
  const cld3bPoints = clamp(cld3bRaw, 0, CLD_MAX_POINTS_8U);
  const cldssPoints = clamp(cldssRaw, 0, CLD_MAX_POINTS_8U);

  const catchingTotalPoints = sum([
    ladderPoints,
    c51bPoints,
    c1bstPoints,
    ciff2bPoints,
    ciff3bPoints,
    ciffssPoints,
    cld2bPoints,
    cld3bPoints,
    cldssPoints,
  ]);

  const catchingScore =
    catchingTotalPoints !== null
      ? Number(((catchingTotalPoints / CATCHING_MAX_POINTS_8U) * 50).toFixed(1))
      : null;

  return {
    score: catchingScore,
    max_points: CATCHING_MAX_POINTS_8U,
    total_points: catchingTotalPoints,
    breakdown: {
      tests: {
        c10x10_level_raw: ladderLevelRaw,
        c10x10_points: ladderPoints,

        c51b_raw_points: c51bRaw,
        c51b_points: c51bPoints,

        c1bst_raw_points: c1bstRaw,
        c1bst_points: c1bstPoints,

        ciff2b_raw_points: ciff2bRaw,
        ciff2b_points: ciff2bPoints,
        ciff3b_raw_points: ciff3bRaw,
        ciff3b_points: ciff3bPoints,
        ciffss_raw_points: ciffssRaw,
        ciffss_points: ciffssPoints,

        cld2b_raw_points: cld2bRaw,
        cld2b_points: cld2bPoints,
        cld3b_raw_points: cld3bRaw,
        cld3b_points: cld3bPoints,
        cldss_raw_points: cldssRaw,
        cldss_points: cldssPoints,
      },
      max_points: CATCHING_MAX_POINTS_8U,
      total_points: catchingTotalPoints,
    },
  };
}

/**
 * 8U FIELDING
 *
 * Metrics:
 * - RLCG2B: 6 reps, each rep points 0/1/2 -> total 0–12
 * - RLCGSS: same
 * - RLCG3B: same
 * - IFSS1BT: seconds, score = max(0, (10 - seconds) * 2), practical max 14.5
 *
 * We treat the fielding category max as:
 *   RLCG2B (12) + RLCGSS (12) + RLCG3B (12) + IFSS1BT (14.5) = 50.5
 * Category score (0–50) = totalPoints / 50.5 * 50
 */

const RLCG_MAX_POINTS_8U = 12; // per position
const IFSS1BT_MAX_POINTS_8U = 14.5;
const FIELDING_MAX_POINTS_8U = RLCG_MAX_POINTS_8U * 3 + IFSS1BT_MAX_POINTS_8U; // 50.5

function computeRlcTotalForPrefix(metrics: MetricMap, prefix: string) {
  // prefix examples: "rlc2b", "rlcss", "rlc3b"
  const reps = [1, 2, 3, 4, 5, 6];
  const points: (number | null)[] = [];

  for (const idx of reps) {
    const key = `${prefix}_grounder_${idx}_points`;
    points.push(getMetric(metrics, key));
  }

  const total = sum(points);
  const clampedTotal =
    total !== null ? Math.max(0, Math.min(RLCG_MAX_POINTS_8U, total)) : null;

  return { pointsByRep: points, total: clampedTotal };
}

function compute8UFielding(metrics: MetricMap) {
  const rlc2b = computeRlcTotalForPrefix(metrics, "rlc2b");
  const rlcss = computeRlcTotalForPrefix(metrics, "rlcss");
  const rlc3b = computeRlcTotalForPrefix(metrics, "rlc3b");

  const ifssSeconds = getMetric(metrics, "ifss1bt_seconds");
  let ifssPoints: number | null = null;

  if (ifssSeconds !== null) {
    const raw = (10 - ifssSeconds) * 2;
    ifssPoints = raw <= 0 ? 0 : raw;
    ifssPoints = Math.min(ifssPoints, IFSS1BT_MAX_POINTS_8U);
  }

  const fieldingTotalPoints = sum([
    rlc2b.total,
    rlcss.total,
    rlc3b.total,
    ifssPoints,
  ]);

  const fieldingScore =
    fieldingTotalPoints !== null
      ? Number(((fieldingTotalPoints / FIELDING_MAX_POINTS_8U) * 50).toFixed(1))
      : null;

  return {
    score: fieldingScore,
    max_points: FIELDING_MAX_POINTS_8U,
    total_points: fieldingTotalPoints,
    breakdown: {
      tests: {
        // 2B
        rlc2b_points_total: rlc2b.total,
        rlc2b_rep_points: rlc2b.pointsByRep,

        // SS
        rlcss_points_total: rlcss.total,
        rlcss_rep_points: rlcss.pointsByRep,

        // 3B
        rlc3b_points_total: rlc3b.total,
        rlc3b_rep_points: rlc3b.pointsByRep,

        ifss1bt_seconds: ifssSeconds,
        ifss1bt_points: ifssPoints,
      },
      max_points: FIELDING_MAX_POINTS_8U,
      total_points: fieldingTotalPoints,
    },
  };
}

/**
 * MAIN 8U RATING ENTRYPOINT
 *
 * Same pattern as 5U/6U/7U:
 * - We always compute all categories.
 * - For a given assessment, only one category will have metric values,
 *   so only that category will have non-null total_points.
 * - overall_score = first non-null category score (athletic, hitting, throwing, catching, fielding)
 */

export function compute8URatings(metrics: MetricMap): RatingResult {
  const athletic = compute8UAthleticSkills(metrics);
  const hitting = compute8UHitting(metrics);
  const throwing = compute8UThrowing(metrics);
  const catching = compute8UCatching(metrics);
  const fielding = compute8UFielding(metrics);

  const overallScore =
    athletic.score ??
    hitting.score ??
    throwing.score ??
    catching.score ??
    fielding.score ??
    null;

  const pitchingScore = throwing.score ?? null;

  return {
    overall_score: overallScore,
    offense_score: hitting.score ?? athletic.score ?? null,
    defense_score: fielding.score ?? catching.score ?? throwing.score ?? null,
    pitching_score: pitchingScore,
    breakdown: {
      hitting: hitting.breakdown,
      athletic: athletic.breakdown,
      catching: catching.breakdown,
      fielding: fielding.breakdown,
      throwing: throwing.breakdown,
    },
  };
}
