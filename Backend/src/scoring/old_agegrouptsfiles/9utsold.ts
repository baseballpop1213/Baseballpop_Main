// src/scoring/9u.ts
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

function getFps(
  metrics: MetricMap,
  timeKey: string,
  distanceKey: string,
  defaultDistanceFt: number
): number | null {
  const time = getMetric(metrics, timeKey);
  if (time === null || time <= 0) return null;

  const distance = getMetric(metrics, distanceKey);
  const dist = distance !== null && distance > 0 ? distance : defaultDistanceFt;

  return dist / time;
}


/**
 * 9U ATHLETIC SKILLS
 *
 * Tests & maxima (points):
 * - 1B Speed (TS1B): (fps - 7) * 3, max 40
 * - 4B Speed (TS4B): (fps - 7) * 3, max 45
 * - Push-ups 30s (APUSH30): raw/2, max 20
 * - Sit-ups 30s (ASIT30): raw/3, max 15
 * - Vertical jump inches (ASPJUMP): raw inches, max 20
 * - SLS Eyes Open (avg of L/R seconds): (avg / 3), max 10
 * - SLS Eyes Closed (avg of L/R seconds): (avg / 2), max 15
 * - MSR Right / Left: each 0–3, total max 6
 * - Toe Touch: 0–6
 * - Deep Squat: 0–9
 *
 * Category max points = 186 (see sheet, col W)
 * Category score = (totalPoints / 186) * 50
 */


const TS1B_MAX_POINTS_9U = 40;
const TS4B_MAX_POINTS_9U = 45;
const SPEED_POINTS_MAX_9U = TS1B_MAX_POINTS_9U + TS4B_MAX_POINTS_9U; // 85

const PUSHUPS_MAX_POINTS_9U = 20; // 40 / 2
const SITUPS_MAX_POINTS_9U = 15;  // 45 / 3
const VJUMP_MAX_POINTS_9U = 20;

const SLS_OPEN_MAX_9U = 10;   // 30s / 3
const SLS_CLOSED_MAX_9U = 15; // 30s / 2

const MSR_TOTAL_MAX_9U = 6;   // 3 + 3
const TOE_TOUCH_MAX_9U = 6;
const DEEP_SQUAT_MAX_9U = 9;

const ATHLETIC_MAX_POINTS_9U =
  TS1B_MAX_POINTS_9U +
  TS4B_MAX_POINTS_9U +
  PUSHUPS_MAX_POINTS_9U +
  SITUPS_MAX_POINTS_9U +
  VJUMP_MAX_POINTS_9U +
  SLS_OPEN_MAX_9U +
  SLS_CLOSED_MAX_9U +
  MSR_TOTAL_MAX_9U +
  TOE_TOUCH_MAX_9U +
  DEEP_SQUAT_MAX_9U; // 186

function compute9UAthleticSkills(metrics: MetricMap) {
  // Raw inputs
  const run1bSeconds = getMetric(metrics, "timed_run_1b");
  const run4bSeconds = getMetric(metrics, "timed_run_4b");

  // Convert to FPS (60ft & 240ft)
  const run1bFps = run1bSeconds ? 60 / run1bSeconds : null;
  const run4bFps = run4bSeconds ? 240 / run4bSeconds : null;

  // Speed points (9U logic: (FPS - 7) * 3)
  const run1bPointsRaw = run1bFps ? (run1bFps - 7) * 3 : null;
  const run4bPointsRaw = run4bFps ? (run4bFps - 7) * 3 : null;

  const run1bPoints = clamp(run1bPointsRaw, 0, TS1B_MAX_POINTS_9U);
  const run4bPoints = clamp(run4bPointsRaw, 0, TS4B_MAX_POINTS_9U);

  const speedPointsTotal = sum([run1bPoints, run4bPoints]);
  const speedScore =
    speedPointsTotal !== null
      ? Number(((speedPointsTotal / SPEED_POINTS_MAX_9U) * 50).toFixed(1))
      : null;

  // Balance: SLS open/closed (avg of L/R)
  const slsOpenRightSec = getMetric(metrics, "sls_eyes_open_right");
  const slsOpenLeftSec = getMetric(metrics, "sls_eyes_open_left");
  const slsClosedRightSec = getMetric(metrics, "sls_eyes_closed_right");
  const slsClosedLeftSec = getMetric(metrics, "sls_eyes_closed_left");

  const slsOpenAvgSeconds = average([slsOpenRightSec, slsOpenLeftSec]);
  const slsClosedAvgSeconds = average([slsClosedRightSec, slsClosedLeftSec]);

  const slsOpenPointsRaw = slsOpenAvgSeconds ? slsOpenAvgSeconds / 3 : null;
  const slsClosedPointsRaw = slsClosedAvgSeconds ? slsClosedAvgSeconds / 2 : null;

  const slsOpenPoints = clamp(slsOpenPointsRaw, 0, SLS_OPEN_MAX_9U);
  const slsClosedPoints = clamp(slsClosedPointsRaw, 0, SLS_CLOSED_MAX_9U);

  // Strength: push-ups & sit-ups
  const pushupsRaw = getMetric(metrics, "apush_30");
  const situpsRaw = getMetric(metrics, "asit_30");

  const pushupsPointsRaw = pushupsRaw !== null ? pushupsRaw / 2 : null;
  const situpsPointsRaw = situpsRaw !== null ? situpsRaw / 3 : null;

  const pushupsPoints = clamp(pushupsPointsRaw, 0, PUSHUPS_MAX_POINTS_9U);
  const situpsPoints = clamp(situpsPointsRaw, 0, SITUPS_MAX_POINTS_9U);

  // Vertical jump
  const vjumpInches = getMetric(metrics, "asp_jump_inches");
  const vjumpPoints = clamp(vjumpInches, 0, VJUMP_MAX_POINTS_9U);

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

  // Mobility: toe touch & deep squat
  const toeTouchRawPoints = getMetric(metrics, "toe_touch");
  const deepSquatRawPoints = getMetric(metrics, "deep_squat");

  const toeTouchPoints = clamp(toeTouchRawPoints, 0, TOE_TOUCH_MAX_9U);
  const deepSquatPoints = clamp(deepSquatRawPoints, 0, DEEP_SQUAT_MAX_9U);

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
      ? Number(((athleticTotalPoints / ATHLETIC_MAX_POINTS_9U) * 50).toFixed(1))
      : null;

  return {
    score: athleticScore,
    max_points: ATHLETIC_MAX_POINTS_9U,
    total_points: athleticTotalPoints,
    breakdown: {
      tests: {
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
      max_points: ATHLETIC_MAX_POINTS_9U,
      total_points: athleticTotalPoints,
    },
  };
}

/**
 * 9U HITTING
 *
 * Metrics:
 * - H10FAST:   m_10_fastball_quality   (0–50 points)
 * - HC10LD:    tee_line_drive_test_10  (0–10 points)
 * - HPTEV:     max_exit_velo_tee (mph) -> points = mph / 5, max 15
 * - HPBS:      max_bat_speed (mph)     -> points = mph / 4, max 15
 *
 * ContactScore = (HC10LD + H10FAST) / 60 * 100
 * PowerScore   = (HPTEV_pts + H10FAST + HPBS_pts) / 80 * 100
 * Hitting category max points = 10 + 15 + 50 + 15 = 90
 * Hitting score (0–50) = (sum of those 4 point components / 90) * 50
 */

const HITTING_CONTACT_MAX_9U = 60;     // HC10LD (10) + H10FAST (50)
const HITTING_POWER_MAX_9U = 80;       // HPTEV(15) + H10FAST(50) + HPBS(15)
const HITTING_CATEGORY_MAX_9U = 90;    // 10 + 15 + 50 + 15

function compute9UHitting(metrics: MetricMap) {
  const fastballRaw = getMetric(metrics, "m_10_fastball_quality"); // H10FAST (0–50)
  const teeLdRaw = getMetric(metrics, "tee_line_drive_test_10");   // HC10LD (0–10)
  const batSpeedMph = getMetric(metrics, "max_bat_speed");         // HPBS
  const exitVeloMph = getMetric(metrics, "max_exit_velo_tee");     // HPTEV

  // Clamp raw tests
  const pitchPoints = clamp(fastballRaw, 0, 50);
  const teeLdPoints = clamp(teeLdRaw, 0, 10);

  const batSpeedPointsRaw = batSpeedMph !== null ? batSpeedMph / 4 : null;
  const exitVeloPointsRaw = exitVeloMph !== null ? exitVeloMph / 5 : null;

  const batSpeedPoints = clamp(batSpeedPointsRaw, 0, 15);
  const exitVeloPoints = clamp(exitVeloPointsRaw, 0, 15);

  // Contact & Power raw points (for % scores)
  const contactRawPoints = sum([teeLdPoints, pitchPoints]);
  const powerRawPoints = sum([exitVeloPoints, pitchPoints, batSpeedPoints]);

  const contactScore =
    contactRawPoints !== null
      ? Number(((contactRawPoints / HITTING_CONTACT_MAX_9U) * 100).toFixed(1))
      : null;

  const powerScore =
    powerRawPoints !== null
      ? Number(((powerRawPoints / HITTING_POWER_MAX_9U) * 100).toFixed(1))
      : null;

  // Category total points used for the 0–50 hitting score
  const hittingTotalPoints = sum([teeLdPoints, exitVeloPoints, pitchPoints, batSpeedPoints]);
  const hittingScore =
    hittingTotalPoints !== null
      ? Number(((hittingTotalPoints / HITTING_CATEGORY_MAX_9U) * 50).toFixed(1))
      : null;

  return {
    score: hittingScore,
    max_points: HITTING_CATEGORY_MAX_9U,
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
      max_points: HITTING_CATEGORY_MAX_9U,
      total_points: hittingTotalPoints,
    },
  };
}

/**
 * 9U THROWING / PITCHING
 *
 * Metrics:
 * - TSPEED45:   max_throwing_speed (mph)
 *     -> tspeed_points = mph / 2 (max 30)
 * - TPITCH1045: m_10_throw_test_45ft (0–30 points)
 * - CB2BT:      cb2bt_seconds (seconds)
 *     -> points = (5 - seconds) * 4, max 15
 * - T80FT:      throw_80ft_target (0–20 points)
 *
 * Throwing category max points = 30 + 30 + 15 + 20 = 95
 * Throwing score (0–50) = totalPoints / 95 * 50
 *
 * Pitching-only metrics:
 * - PITCHSPEED       = TSPEED45 (mph)
 * - PITCHSPEEDSCORE  = tspeed_points / 30 * 100
 * - PITCHACCSCORE    = TPITCH1045_points / 30 * 100
 * - PITCHINGSCORE    = (tspeed_points + TPITCH1045_points)/(30+30) * 100
 *
 * StrikeoutChance (logistic model, 9U):
 *   nS = clamp((speed - 35) / (60 - 35), 0, 1)
 *   dA = accuracyPoints / 30
 *   x  = -2.4 + 0.85 * nS + 0.65 * dA
 *   StrikeoutChance% = 1 / (1 + exp(-x)) * 100
 */

const TSPEED45_MAX_POINTS_9U = 30; // 60 / 2
const TPITCH1045_MAX_POINTS_9U = 30;
const CB2BT_MAX_POINTS_9U = 15;
const T80FT_MAX_POINTS_9U = 20;
const THROWING_MAX_POINTS_9U =
  TSPEED45_MAX_POINTS_9U +
  TPITCH1045_MAX_POINTS_9U +
  CB2BT_MAX_POINTS_9U +
  T80FT_MAX_POINTS_9U; // 95

// Strikeout model constants (9U)
const STRIKE_MIN_SPEED_9U = 35;
const STRIKE_MAX_SPEED_9U = 60;
const STRIKE_BASELINE_9U = -2.4;
const STRIKE_WEIGHT_SPEED_9U = 0.85;
const STRIKE_WEIGHT_ACC_9U = 0.65;

function compute9UThrowing(metrics: MetricMap) {
  const tspeedMph = getMetric(metrics, "max_throwing_speed");
  const tpitchRaw = getMetric(metrics, "m_10_throw_test_45ft");
  const t80Raw = getMetric(metrics, "throw_80ft_target");
  const cb2btSeconds = getMetric(metrics, "cb2bt_seconds");

  const tspeedPointsRaw = tspeedMph !== null ? tspeedMph / 2 : null;
  const tspeedPoints = clamp(tspeedPointsRaw, 0, TSPEED45_MAX_POINTS_9U);

  const tpitchPoints = clamp(tpitchRaw, 0, TPITCH1045_MAX_POINTS_9U);

  const cb2btPointsRaw =
    cb2btSeconds !== null ? (5 - cb2btSeconds) * 4 : null;
  const cb2btPoints = clamp(cb2btPointsRaw, 0, CB2BT_MAX_POINTS_9U);

  const t80Points = clamp(t80Raw, 0, T80FT_MAX_POINTS_9U);

  const throwingTotalPoints = sum([tspeedPoints, tpitchPoints, cb2btPoints, t80Points]);
  const throwingScore =
    throwingTotalPoints !== null
      ? Number(((throwingTotalPoints / THROWING_MAX_POINTS_9U) * 50).toFixed(1))
      : null;

  // Pitching-specific scores
  const pitchSpeedScorePercent =
    tspeedPoints !== null
      ? Number(((tspeedPoints / TSPEED45_MAX_POINTS_9U) * 100).toFixed(1))
      : null;

  const pitchAccScorePercent =
    tpitchPoints !== null
      ? Number(((tpitchPoints / TPITCH1045_MAX_POINTS_9U) * 100).toFixed(1))
      : null;

  const pitchScorePercent =
    tspeedPoints !== null && tpitchPoints !== null
      ? Number(
          (
            ((tspeedPoints + tpitchPoints) /
              (TSPEED45_MAX_POINTS_9U + TPITCH1045_MAX_POINTS_9U)) *
            100
          ).toFixed(1)
        )
      : null;

  // Logistic StrikeoutChance
  let strikeoutChancePercent: number | null = null;
  if (tspeedMph !== null && tpitchPoints !== null) {
    const nSRaw =
      (tspeedMph - STRIKE_MIN_SPEED_9U) /
      (STRIKE_MAX_SPEED_9U - STRIKE_MIN_SPEED_9U);
    const nS = Math.max(0, Math.min(1, nSRaw));
    const dA = tpitchPoints / TPITCH1045_MAX_POINTS_9U; // accuracy as 0–1

    const x =
      STRIKE_BASELINE_9U +
      STRIKE_WEIGHT_SPEED_9U * nS +
      STRIKE_WEIGHT_ACC_9U * dA;

    const logistic = 1 / (1 + Math.exp(-x));
    strikeoutChancePercent = Number((logistic * 100).toFixed(1));
  }

  return {
    score: throwingScore,
    max_points: THROWING_MAX_POINTS_9U,
    total_points: throwingTotalPoints,
    breakdown: {
      tests: {
        t45ft_points: tpitchPoints,
        t80ft_points: t80Points,
        tspeed45_points: tspeedPoints,
        tspeed45_raw_mph: tspeedMph,

        cb2bt_seconds: cb2btSeconds,
        cb2bt_points: cb2btPoints,

        pitch_speed_mph: tspeedMph,
        pitch_speed_score_percent: pitchSpeedScorePercent,
        pitch_acc_score_percent: pitchAccScorePercent,
        pitch_score_percent: pitchScorePercent,
        strike_chance_percent: strikeoutChancePercent,
      },
      max_points: THROWING_MAX_POINTS_9U,
      total_points: throwingTotalPoints,
    },
  };
}

/**
 * 9U CATCHING
 *
 * Differences from 8U:
 * - NO C10X10 ladder test in 9U.
 * - NEW: C5PCS (5 Pitch Catcher Screen), max 10 points.
 * - NEW: C15X15M (15x15 Matrix fly balls), 10 balls, 0/2 points each, max 20.
 *
 * Metrics assumed:
 * - c5pcs_points           (0–10)
 * - c51b_catching_test     (0–15)
 * - c1bst_scoops_test      (0–15)
 * - infield_fly_2b / 3b/ ss (0–6 each)
 * - infield_ld_2b / 3b/ ss  (0–6 each)
 * - c15x15m_points         (0–20)
 *
 * Category max points = 10 + 15 + 15 + 6*3 + 6*3 + 20 = 96
 * Catching score (0–50) = totalPoints / 96 * 50
 */

const C5PCS_MAX_POINTS_9U = 10;
const C51B_MAX_POINTS_9U = 15;
const C1BST_MAX_POINTS_9U = 15;
const CIFF_MAX_POINTS_9U = 6; // per infield fly test (2B/3B/SS)
const CLD_MAX_POINTS_9U = 6;  // per infield LD test (2B/3B/SS)
const C15X15M_MAX_POINTS_9U = 20;

const CATCHING_MAX_POINTS_9U =
  C5PCS_MAX_POINTS_9U +
  C51B_MAX_POINTS_9U +
  C1BST_MAX_POINTS_9U +
  CIFF_MAX_POINTS_9U * 3 +
  CLD_MAX_POINTS_9U * 3 +
  C15X15M_MAX_POINTS_9U; // 96

function compute9UCatching(metrics: MetricMap) {
  const c5pcsRaw = getMetric(metrics, "c5pcs_points");
  const c51bRaw = getMetric(metrics, "c51b_catching_test");
  const c1bstRaw = getMetric(metrics, "c1bst_scoops_test");

  const ciff2bRaw = getMetric(metrics, "infield_fly_2b");
  const ciff3bRaw = getMetric(metrics, "infield_fly_3b");
  const ciffssRaw = getMetric(metrics, "infield_fly_ss");

  const cld2bRaw = getMetric(metrics, "infield_ld_2b");
  const cld3bRaw = getMetric(metrics, "infield_ld_3b");
  const cldssRaw = getMetric(metrics, "infield_ld_ss");

  const c15x15mRaw = getMetric(metrics, "c15x15m_points");

  const c5pcsPoints = clamp(c5pcsRaw, 0, C5PCS_MAX_POINTS_9U);
  const c51bPoints = clamp(c51bRaw, 0, C51B_MAX_POINTS_9U);
  const c1bstPoints = clamp(c1bstRaw, 0, C1BST_MAX_POINTS_9U);

  const ciff2bPoints = clamp(ciff2bRaw, 0, CIFF_MAX_POINTS_9U);
  const ciff3bPoints = clamp(ciff3bRaw, 0, CIFF_MAX_POINTS_9U);
  const ciffssPoints = clamp(ciffssRaw, 0, CIFF_MAX_POINTS_9U);

  const cld2bPoints = clamp(cld2bRaw, 0, CLD_MAX_POINTS_9U);
  const cld3bPoints = clamp(cld3bRaw, 0, CLD_MAX_POINTS_9U);
  const cldssPoints = clamp(cldssRaw, 0, CLD_MAX_POINTS_9U);

  const c15x15mPoints = clamp(c15x15mRaw, 0, C15X15M_MAX_POINTS_9U);

  const catchingTotalPoints = sum([
    c5pcsPoints,
    c51bPoints,
    c1bstPoints,
    ciff2bPoints,
    ciff3bPoints,
    ciffssPoints,
    cld2bPoints,
    cld3bPoints,
    cldssPoints,
    c15x15mPoints,
  ]);

  const catchingScore =
    catchingTotalPoints !== null
      ? Number(((catchingTotalPoints / CATCHING_MAX_POINTS_9U) * 50).toFixed(1))
      : null;

  return {
    score: catchingScore,
    max_points: CATCHING_MAX_POINTS_9U,
    total_points: catchingTotalPoints,
    breakdown: {
      tests: {
        c5pcs_raw_points: c5pcsRaw,
        c5pcs_points: c5pcsPoints,

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

        c15x15m_raw_points: c15x15mRaw,
        c15x15m_points: c15x15mPoints,
      },
      max_points: CATCHING_MAX_POINTS_9U,
      total_points: catchingTotalPoints,
    },
  };
}

/**
 * 9U FIELDING
 *
 * SAME structure as 8U; sheet shows same max values:
 * - RLC Grounders 2B/SS/3B: 0–12 each
 * - SS to First Time: max ~14.5
 *
 * Category max = 12 + 12 + 12 + 14.5 = 50.5
 * Fielding score (0–50) = totalPoints / 50.5 * 50
 */

const RLCG_MAX_POINTS_9U = 12; // per position
const IFSS1BT_MAX_POINTS_9U = 14.5;
const FIELDING_MAX_POINTS_9U =
  RLCG_MAX_POINTS_9U * 3 + IFSS1BT_MAX_POINTS_9U; // 50.5

function computeRlcTotalForPrefix9U(metrics: MetricMap, prefix: string) {
  // prefix examples: "rlc2b", "rlcss", "rlc3b"
  const reps = [1, 2, 3, 4, 5, 6];
  const points: (number | null)[] = [];

  for (const idx of reps) {
    const key = `${prefix}_grounder_${idx}_points`;
    points.push(getMetric(metrics, key));
  }

  const total = sum(points);
  const clampedTotal =
    total !== null ? Math.max(0, Math.min(RLCG_MAX_POINTS_9U, total)) : null;

  return { pointsByRep: points, total: clampedTotal };
}

function compute9UFielding(metrics: MetricMap) {
  const rlc2b = computeRlcTotalForPrefix9U(metrics, "rlc2b");
  const rlcss = computeRlcTotalForPrefix9U(metrics, "rlcss");
  const rlc3b = computeRlcTotalForPrefix9U(metrics, "rlc3b");

  const ifssSeconds = getMetric(metrics, "ifss1bt_seconds");
  let ifssPoints: number | null = null;

  if (ifssSeconds !== null) {
    const raw = (10 - ifssSeconds) * 2;
    ifssPoints = raw <= 0 ? 0 : raw;
    ifssPoints = Math.min(ifssPoints, IFSS1BT_MAX_POINTS_9U);
  }

  const fieldingTotalPoints = sum([
    rlc2b.total,
    rlcss.total,
    rlc3b.total,
    ifssPoints,
  ]);

  const fieldingScore =
    fieldingTotalPoints !== null
      ? Number(((fieldingTotalPoints / FIELDING_MAX_POINTS_9U) * 50).toFixed(1))
      : null;

  return {
    score: fieldingScore,
    max_points: FIELDING_MAX_POINTS_9U,
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
      max_points: FIELDING_MAX_POINTS_9U,
      total_points: fieldingTotalPoints,
    },
  };
}

/**
 * MAIN 9U RATING ENTRYPOINT
 *
 * Same pattern as 5U/6U/7U/8U:
 * - We always compute all categories.
 * - For a given assessment, only one category will have metric values,
 *   so only that category will have non-null total_points.
 * - overall_score = first non-null category score (athletic, hitting, throwing, catching, fielding)
 */

export function compute9URatings(metrics: MetricMap): RatingResult {
  const athletic = compute9UAthleticSkills(metrics);
  const hitting = compute9UHitting(metrics);
  const throwing = compute9UThrowing(metrics);
  const catching = compute9UCatching(metrics);
  const fielding = compute9UFielding(metrics);

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
