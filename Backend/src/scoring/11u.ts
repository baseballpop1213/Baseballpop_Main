// src/scoring/11u.ts
import type { MetricMap, RatingResult } from "./5u";

/**
 * Helpers
 */
function clamp(
  value: number | null | undefined,
  min: number,
  max: number
): number | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function sum(values: Array<number | null | undefined>): number | null {
  const nums = values.filter(
    (v): v is number =>
      v !== null && v !== undefined && !Number.isNaN(v as number)
  );
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0);
}

function average(values: Array<number | null | undefined>): number | null {
  const total = sum(values);
  if (total === null) return null;
  const count = values.filter(
    (v) => v !== null && v !== undefined && !Number.isNaN(v as number)
  ).length;
  if (count === 0) return null;
  return total / count;
}

function getMetric(metrics: MetricMap, key: string): number | null {
  const v = (metrics as any)[key];
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/* -------------------------------------------------------------------------- */
/*                              11U ATHLETIC                                  */
/* -------------------------------------------------------------------------- */
/**
 * 11U ATHLETIC
 *
 * - 1B Speed max: 45
 * - 4B Speed max: 45
 * - Push-ups: 20  (40/2)
 * - Sit-ups: 15   (45/2)
 * - Vert jump: 20
 * - SLS: same maxima as 9U (using same numeric values as 10U)
 * - Mobility (MSR, Toe touch, Deep squat): same as 9U (same numeric as 10U)
 */

const TS1B_MAX_POINTS_11U = 45;
const TS4B_MAX_POINTS_11U = 45;
const SPEED_POINTS_MAX_11U = TS1B_MAX_POINTS_11U + TS4B_MAX_POINTS_11U; // 90

const PUSHUPS_MAX_POINTS_11U = 20;
const SITUPS_MAX_POINTS_11U = 15;
const VJUMP_MAX_POINTS_11U = 20;

const SLS_OPEN_MAX_11U = 10;
const SLS_CLOSED_MAX_11U = 15;

const MSR_TOTAL_MAX_11U = 6;
const TOE_TOUCH_MAX_11U = 6;
const DEEP_SQUAT_MAX_11U = 9;

const ATHLETIC_POINTS_MAX_11U =
  SPEED_POINTS_MAX_11U +
  PUSHUPS_MAX_POINTS_11U +
  SITUPS_MAX_POINTS_11U +
  VJUMP_MAX_POINTS_11U +
  SLS_OPEN_MAX_11U +
  SLS_CLOSED_MAX_11U +
  MSR_TOTAL_MAX_11U +
  TOE_TOUCH_MAX_11U +
  DEEP_SQUAT_MAX_11U; // 191

function compute11UAthleticSkills(metrics: MetricMap) {
  // Speed: 1B & 4B ((fps - 7) * 3), same structure
  const run1bSeconds = getMetric(metrics, "timed_run_1b");
  const run4bSeconds = getMetric(metrics, "timed_run_4b");

  const run1bFps = run1bSeconds ? 60 / run1bSeconds : null;
  const run4bFps = run4bSeconds ? 240 / run4bSeconds : null;

  const run1bPointsRaw = run1bFps ? (run1bFps - 7) * 3 : null;
  const run4bPointsRaw = run4bFps ? (run4bFps - 7) * 3 : null;

  const run1bPoints = clamp(run1bPointsRaw, 0, TS1B_MAX_POINTS_11U);
  const run4bPoints = clamp(run4bPointsRaw, 0, TS4B_MAX_POINTS_11U);

  const speedPointsTotal = sum([run1bPoints, run4bPoints]);
  const speedScore =
    speedPointsTotal !== null
      ? Number(((speedPointsTotal / SPEED_POINTS_MAX_11U) * 50).toFixed(1))
      : null;

  // Balance: SLS open/closed
  const slsOpenRightSec = getMetric(metrics, "sls_eyes_open_right");
  const slsOpenLeftSec = getMetric(metrics, "sls_eyes_open_left");
  const slsClosedRightSec = getMetric(metrics, "sls_eyes_closed_right");
  const slsClosedLeftSec = getMetric(metrics, "sls_eyes_closed_left");

  const slsOpenAvgSeconds = average([slsOpenRightSec, slsOpenLeftSec]);
  const slsClosedAvgSeconds = average([slsClosedRightSec, slsClosedLeftSec]);

  const slsOpenPointsRaw = slsOpenAvgSeconds ? slsOpenAvgSeconds / 3 : null;
  const slsClosedPointsRaw = slsClosedAvgSeconds ? slsClosedAvgSeconds / 2 : null;

  const slsOpenPoints = clamp(slsOpenPointsRaw, 0, SLS_OPEN_MAX_11U);
  const slsClosedPoints = clamp(slsClosedPointsRaw, 0, SLS_CLOSED_MAX_11U);

  // Strength: push-ups & sit-ups
  const pushupsRaw = getMetric(metrics, "apush_30");
  const situpsRaw = getMetric(metrics, "asit_30");

  const pushupsPointsRaw = pushupsRaw !== null ? pushupsRaw / 2 : null;
  const situpsPointsRaw = situpsRaw !== null ? situpsRaw / 3 : null;

  const pushupsPoints = clamp(pushupsPointsRaw, 0, PUSHUPS_MAX_POINTS_11U);
  const situpsPoints = clamp(situpsPointsRaw, 0, SITUPS_MAX_POINTS_11U);

  // Vertical jump
  const vjumpInches = getMetric(metrics, "asp_jump_inches");
  const vjumpPoints = clamp(vjumpInches, 0, VJUMP_MAX_POINTS_11U);

  // MSR
  const msrRightRaw = getMetric(metrics, "msr_right");
  const msrLeftRaw = getMetric(metrics, "msr_left");

  const msrSidePoints = (deg: number | null): number | null => {
    if (deg === null) return null;
    if (deg > 180) return 3;
    if (deg === 180) return 1;
    return 0;
  };

  const msrRightPoints = msrSidePoints(msrRightRaw);
  const msrLeftPoints = msrSidePoints(msrLeftRaw);
  const msrPointsTotal = sum([msrRightPoints, msrLeftPoints]);
  const msrPointsClamped =
    msrPointsTotal !== null
      ? Math.max(0, Math.min(MSR_TOTAL_MAX_11U, msrPointsTotal))
      : null;

  // Mobility: toe touch & deep squat
  const toeTouchRawPoints = getMetric(metrics, "toe_touch");
  const deepSquatRawPoints = getMetric(metrics, "deep_squat");

  const toeTouchPoints = clamp(toeTouchRawPoints, 0, TOE_TOUCH_MAX_11U);
  const deepSquatPoints = clamp(deepSquatRawPoints, 0, DEEP_SQUAT_MAX_11U);

  const athleticTotalPoints = sum([
    run1bPoints,
    run4bPoints,
    pushupsPoints,
    situpsPoints,
    vjumpPoints,
    slsOpenPoints,
    slsClosedPoints,
    msrPointsClamped,
    toeTouchPoints,
    deepSquatPoints,
  ]);

  const athleticScore =
    athleticTotalPoints !== null
      ? Number(((athleticTotalPoints / ATHLETIC_POINTS_MAX_11U) * 50).toFixed(1))
      : null;

  return {
    score: athleticScore,
    max_points: ATHLETIC_POINTS_MAX_11U,
    total_points: athleticTotalPoints,
    breakdown: {
      tests: {
        // Speed
        run_1b_fps: run1bFps,
        run_4b_fps: run4bFps,
        run_1b_points: run1bPoints,
        run_4b_points: run4bPoints,
        speed_points_total: speedPointsTotal,
        speed_score: speedScore,

        // Strength
        pushups_30_raw: pushupsRaw,
        situps_30_raw: situpsRaw,
        pushups_30_points: pushupsPoints,
        situps_30_points: situpsPoints,

        // Vertical jump
        vjump_inches_raw: vjumpInches,
        vjump_points: vjumpPoints,

        // Balance
        sls_open_right_seconds: slsOpenRightSec,
        sls_open_left_seconds: slsOpenLeftSec,
        sls_open_avg_seconds: slsOpenAvgSeconds,
        sls_open_points: slsOpenPoints,

        sls_closed_right_seconds: slsClosedRightSec,
        sls_closed_left_seconds: slsClosedLeftSec,
        sls_closed_avg_seconds: slsClosedAvgSeconds,
        sls_closed_points: slsClosedPoints,

        // MSR
        msr_right_raw: msrRightRaw,
        msr_left_raw: msrLeftRaw,
        msr_right_points: msrRightPoints,
        msr_left_points: msrLeftPoints,
        msr_points_total: msrPointsClamped,

        // Mobility
        toe_touch_raw_points: toeTouchRawPoints,
        toe_touch_points: toeTouchPoints,
        deep_squat_raw_points: deepSquatRawPoints,
        deep_squat_points: deepSquatPoints,
      },
      max_points: ATHLETIC_POINTS_MAX_11U,
      total_points: athleticTotalPoints,
    },
  };
}

/* -------------------------------------------------------------------------- */
/*                               11U HITTING                                  */
/* -------------------------------------------------------------------------- */
/**
 * Same structure as 10U with:
 * - HPTEV max: 15 (75/5)
 * - H10FAST max: 50
 * - HPBS max: 18 (72/4)
 */

const TEE_LD_MAX_POINTS_11U = 10; // HC10LD
const PITCH_QUALITY_MAX_POINTS_11U = 50; // H10FAST
const EXIT_VELO_MAX_POINTS_11U = 15; // HPTEV
const BAT_SPEED_MAX_POINTS_11U = 18; // HPBS

const CONTACT_POINTS_MAX_11U = 60; // tee LD + fastball quality
const POWER_POINTS_MAX_11U = 83; // EV + pitch + bat speed
const HITTING_POINTS_MAX_11U = 93; // full category

function compute11UHitting(metrics: MetricMap) {
  const fastballRaw = getMetric(metrics, "m_10_fastball_quality");
  const teeLdRaw = getMetric(metrics, "tee_line_drive_test_10");
  const exitVeloMph = getMetric(metrics, "max_exit_velo_tee");
  const batSpeedMph = getMetric(metrics, "max_bat_speed");

  const pitchPoints = clamp(fastballRaw, 0, PITCH_QUALITY_MAX_POINTS_11U);
  const teeLdPoints = clamp(teeLdRaw, 0, TEE_LD_MAX_POINTS_11U);

  const exitVeloPointsRaw = exitVeloMph !== null ? exitVeloMph / 5 : null;
  const batSpeedPointsRaw = batSpeedMph !== null ? batSpeedMph / 4 : null;

  const exitVeloPoints = clamp(exitVeloPointsRaw, 0, EXIT_VELO_MAX_POINTS_11U);
  const batSpeedPoints = clamp(batSpeedPointsRaw, 0, BAT_SPEED_MAX_POINTS_11U);

  const contactRawPoints = sum([teeLdPoints, pitchPoints]);
  const powerRawPoints = sum([exitVeloPoints, pitchPoints, batSpeedPoints]);

  const contactScore =
    contactRawPoints !== null
      ? Number(((contactRawPoints / CONTACT_POINTS_MAX_11U) * 100).toFixed(1))
      : null;

  const powerScore =
    powerRawPoints !== null
      ? Number(((powerRawPoints / POWER_POINTS_MAX_11U) * 100).toFixed(1))
      : null;

  const hittingTotalPoints = sum([
    teeLdPoints,
    pitchPoints,
    exitVeloPoints,
    batSpeedPoints,
  ]);

  const hittingScore =
    hittingTotalPoints !== null
      ? Number(((hittingTotalPoints / HITTING_POINTS_MAX_11U) * 50).toFixed(1))
      : null;

  return {
    score: hittingScore,
    max_points: HITTING_POINTS_MAX_11U,
    total_points: hittingTotalPoints,
    breakdown: {
      tests: {
        pitch_raw: fastballRaw,
        tee_ld_raw: teeLdRaw,
        exit_velo_mph: exitVeloMph,
        bat_speed_mph: batSpeedMph,

        pitch_points: pitchPoints,
        tee_ld_points: teeLdPoints,
        exit_velo_points: exitVeloPoints,
        bat_speed_points: batSpeedPoints,

        contact_raw_points: contactRawPoints,
        power_raw_points: powerRawPoints,
        contact_score: contactScore,
        power_score: powerScore,

        strike_chance_percent: null,
      },
      max_points: HITTING_POINTS_MAX_11U,
      total_points: hittingTotalPoints,
    },
  };
}

/* -------------------------------------------------------------------------- */
/*                               11U PITCHING                                 */
/* -------------------------------------------------------------------------- */
/**
 * 11U PITCHING
 * Uses TSPEED (max_throwing_speed) + TPITCH@50 ft (m_10_throw_test_50ft)
 *
 * Parameters:
 *   baseline = -2.75
 *   a_s = 0.95
 *   a_a = 0.75
 *   minSpeed = 42 mph
 *   maxSpeed = 68.5 mph
 */

const PITCH_TSPEED_POINTS_MAX_11U = 34.25; // 68.5 / 2
const PITCH_ACC_POINTS_MAX_11U = 30;
const PITCH_POINTS_MAX_11U =
  PITCH_TSPEED_POINTS_MAX_11U + PITCH_ACC_POINTS_MAX_11U; // 64.25

const STRIKE_BASELINE_11U = -2.75;
const STRIKE_WEIGHT_SPEED_11U = 0.95;
const STRIKE_WEIGHT_ACC_11U = 0.75;
const STRIKE_MIN_SPEED_11U = 42;
const STRIKE_MAX_SPEED_11U = 68.5;

function compute11UPitching(metrics: MetricMap) {
  const tspeedMph = getMetric(metrics, "max_throwing_speed");
  const tpitchRaw = getMetric(metrics, "m_10_throw_test_50ft");

  const tspeedPointsRaw = tspeedMph !== null ? tspeedMph / 2 : null;
  const tspeedPoints = clamp(tspeedPointsRaw, 0, PITCH_TSPEED_POINTS_MAX_11U);

  const tpitchPoints = clamp(tpitchRaw, 0, PITCH_ACC_POINTS_MAX_11U);

  const pitchingTotalPoints = sum([tspeedPoints, tpitchPoints]);

  const pitchingScore =
    pitchingTotalPoints !== null
      ? Number(((pitchingTotalPoints / PITCH_POINTS_MAX_11U) * 50).toFixed(1))
      : null;

  const pitchSpeedScorePercent =
    tspeedPoints !== null
      ? Number(
          ((tspeedPoints / PITCH_TSPEED_POINTS_MAX_11U) * 100).toFixed(1)
        )
      : null;

  const pitchAccScorePercent =
    tpitchPoints !== null
      ? Number(
          ((tpitchPoints / PITCH_ACC_POINTS_MAX_11U) * 100).toFixed(1)
        )
      : null;

  const pitchScorePercent =
    tspeedPoints !== null && tpitchPoints !== null
      ? Number(
          (
            ((tspeedPoints + tpitchPoints) / PITCH_POINTS_MAX_11U) *
            100
          ).toFixed(1)
        )
      : null;

  let strikeoutChancePercent: number | null = null;
  if (tspeedMph !== null && tpitchPoints !== null) {
    const nSRaw =
      (tspeedMph - STRIKE_MIN_SPEED_11U) /
      (STRIKE_MAX_SPEED_11U - STRIKE_MIN_SPEED_11U);
    const nS = Math.max(0, Math.min(1, nSRaw));
    const dA = tpitchPoints / PITCH_ACC_POINTS_MAX_11U;

    const x =
      STRIKE_BASELINE_11U +
      STRIKE_WEIGHT_SPEED_11U * nS +
      STRIKE_WEIGHT_ACC_11U * dA;

    const logistic = 1 / (1 + Math.exp(-x));
    strikeoutChancePercent = Number((logistic * 100).toFixed(1));
  }

  return {
    score: pitchingScore,
    max_points: PITCH_POINTS_MAX_11U,
    total_points: pitchingTotalPoints,
    breakdown: {
      tests: {
        pitch_speed_mph: tspeedMph,
        tspeed_points: tspeedPoints,
        tpitch_points: tpitchPoints,

        pitch_speed_score_percent: pitchSpeedScorePercent,
        pitch_acc_score_percent: pitchAccScorePercent,
        pitch_score_percent: pitchScorePercent,
        strike_chance_percent: strikeoutChancePercent,
      },
      max_points: PITCH_POINTS_MAX_11U,
      total_points: pitchingTotalPoints,
    },
  };
}

/* -------------------------------------------------------------------------- */
/*                               11U CATCHER                                  */
/* -------------------------------------------------------------------------- */
/**
 * 11U CATCHER (CT2BT + C10PCS)
 * Same maxima as 10U:
 * - C10PCS max: 20
 * - CT2BT max: 15
 */

const C10PCS_POINTS_MAX_11U = 20;
const CT2BT_POINTS_MAX_11U = 15;
const CATCHER_POINTS_MAX_11U =
  C10PCS_POINTS_MAX_11U + CT2BT_POINTS_MAX_11U; // 35

function compute11UCatcher(metrics: MetricMap) {
  const c10pcsRaw = getMetric(metrics, "c10pcs_points");
  const ct2btSeconds = getMetric(metrics, "ct2bt_seconds");

  const c10pcsPoints = clamp(c10pcsRaw, 0, C10PCS_POINTS_MAX_11U);

  let ct2btPoints: number | null = null;
  if (ct2btSeconds !== null) {
    const raw = (5 - ct2btSeconds) * 4; // same structure as CB2BT
    ct2btPoints = raw <= 0 ? 0 : raw;
    if (ct2btPoints > CT2BT_POINTS_MAX_11U) {
      ct2btPoints = CT2BT_POINTS_MAX_11U;
    }
  }

  const catcherTotalPoints = sum([c10pcsPoints, ct2btPoints]);

  const catcherScore =
    catcherTotalPoints !== null
      ? Number(((catcherTotalPoints / CATCHER_POINTS_MAX_11U) * 50).toFixed(1))
      : null;

  return {
    score: catcherScore,
    max_points: CATCHER_POINTS_MAX_11U,
    total_points: catcherTotalPoints,
    breakdown: {
      tests: {
        c10pcs_raw_points: c10pcsRaw,
        c10pcs_points: c10pcsPoints,
        ct2bt_seconds: ct2btSeconds,
        ct2bt_points: ct2btPoints,
      },
      max_points: CATCHER_POINTS_MAX_11U,
      total_points: catcherTotalPoints,
    },
  };
}

/* -------------------------------------------------------------------------- */
/*                              11U FIRST BASE                                */
/* -------------------------------------------------------------------------- */
/**
 * 11U FIRST BASE
 * Same maxima as 10U:
 * - C101B: 0–30
 * - C1BST: 0–15
 */

const C101B_POINTS_MAX_11U = 30;
const C1BST_POINTS_MAX_11U = 15;
const FIRSTBASE_POINTS_MAX_11U =
  C101B_POINTS_MAX_11U + C1BST_POINTS_MAX_11U; // 45

function compute11UFirstBase(metrics: MetricMap) {
  const c101bRaw = getMetric(metrics, "c101b_catching_test");
  const c1bstRaw = getMetric(metrics, "c1bst_scoops_test");

  const c101bPoints = clamp(c101bRaw, 0, C101B_POINTS_MAX_11U);
  const c1bstPoints = clamp(c1bstRaw, 0, C1BST_POINTS_MAX_11U);

  const firstBaseTotalPoints = sum([c101bPoints, c1bstPoints]);

  const firstBaseScore =
    firstBaseTotalPoints !== null
      ? Number(((firstBaseTotalPoints / FIRSTBASE_POINTS_MAX_11U) * 50).toFixed(1))
      : null;

  return {
    score: firstBaseScore,
    max_points: FIRSTBASE_POINTS_MAX_11U,
    total_points: firstBaseTotalPoints,
    breakdown: {
      tests: {
        c101b_raw_points: c101bRaw,
        c101b_points: c101bPoints,
        c1bst_raw_points: c1bstRaw,
        c1bst_points: c1bstPoints,
      },
      max_points: FIRSTBASE_POINTS_MAX_11U,
      total_points: firstBaseTotalPoints,
    },
  };
}

/* -------------------------------------------------------------------------- */
/*                               11U INFIELD                                  */
/* -------------------------------------------------------------------------- */
/**
 * 11U INFIELD
 * Same maxima as 10U:
 * RLC(2B/3B/SS) + IF flies/LDs + SS1BT
 */

const RLC_POINTS_MAX_11U = 12; // per position
const IF_FLY_POINTS_MAX_11U = 6; // each IF fly / LD
const IFSS1BT_POINTS_MAX_11U = 14.5;
const INFIELD_POINTS_MAX_11U = 86.5;

function computeRlcTotalForPrefix11U(metrics: MetricMap, prefix: string) {
  const reps = [1, 2, 3, 4, 5, 6];
  const points: (number | null)[] = [];

  for (const i of reps) {
    const key = `${prefix}_grounder_${i}_points`;
    points.push(getMetric(metrics, key));
  }

  const totalRaw = sum(points);
  const total =
    totalRaw !== null
      ? Math.max(0, Math.min(RLC_POINTS_MAX_11U, totalRaw))
      : null;

  return { pointsByRep: points, total };
}

function timeTo14_5Points11U(seconds: number | null): number | null {
  if (seconds === null) return null;
  const raw = (10 - seconds) * 2;
  if (raw <= 0) return 0;
  return raw > IFSS1BT_POINTS_MAX_11U ? IFSS1BT_POINTS_MAX_11U : raw;
}

function compute11UInfield(metrics: MetricMap) {
  const rlc2b = computeRlcTotalForPrefix11U(metrics, "rlc2b");
  const rlc3b = computeRlcTotalForPrefix11U(metrics, "rlc3b");
  const rlcss = computeRlcTotalForPrefix11U(metrics, "rlcss");

  const iff2bRaw = getMetric(metrics, "infield_fly_2b");
  const iff3bRaw = getMetric(metrics, "infield_fly_3b");
  const iffssRaw = getMetric(metrics, "infield_fly_ss");

  const ild2bRaw = getMetric(metrics, "infield_ld_2b");
  const ild3bRaw = getMetric(metrics, "infield_ld_3b");
  const ildssRaw = getMetric(metrics, "infield_ld_ss");

  const iff2bPoints = clamp(iff2bRaw, 0, IF_FLY_POINTS_MAX_11U);
  const iff3bPoints = clamp(iff3bRaw, 0, IF_FLY_POINTS_MAX_11U);
  const iffssPoints = clamp(iffssRaw, 0, IF_FLY_POINTS_MAX_11U);

  const ild2bPoints = clamp(ild2bRaw, 0, IF_FLY_POINTS_MAX_11U);
  const ild3bPoints = clamp(ild3bRaw, 0, IF_FLY_POINTS_MAX_11U);
  const ildssPoints = clamp(ildssRaw, 0, IF_FLY_POINTS_MAX_11U);

  const ifss1btSeconds = getMetric(metrics, "ifss1bt_seconds");
  const ifss1btPoints = timeTo14_5Points11U(ifss1btSeconds);

  const infieldTotalPoints = sum([
    rlc2b.total,
    rlc3b.total,
    rlcss.total,
    iff2bPoints,
    iff3bPoints,
    iffssPoints,
    ild2bPoints,
    ild3bPoints,
    ildssPoints,
    ifss1btPoints,
  ]);

  const infieldScore =
    infieldTotalPoints !== null
      ? Number(((infieldTotalPoints / INFIELD_POINTS_MAX_11U) * 50).toFixed(1))
      : null;

  return {
    score: infieldScore,
    max_points: INFIELD_POINTS_MAX_11U,
    total_points: infieldTotalPoints,
    breakdown: {
      tests: {
        rlc2b_rep_points: rlc2b.pointsByRep,
        rlc2b_points_total: rlc2b.total,

        rlc3b_rep_points: rlc3b.pointsByRep,
        rlc3b_points_total: rlc3b.total,

        rlcss_rep_points: rlcss.pointsByRep,
        rlcss_points_total: rlcss.total,

        infield_fly_2b_raw: iff2bRaw,
        infield_fly_3b_raw: iff3bRaw,
        infield_fly_ss_raw: iffssRaw,
        infield_fly_2b_points: iff2bPoints,
        infield_fly_3b_points: iff3bPoints,
        infield_fly_ss_points: iffssPoints,

        infield_ld_2b_raw: ild2bRaw,
        infield_ld_3b_raw: ild3bRaw,
        infield_ld_ss_raw: ildssRaw,
        infield_ld_2b_points: ild2bPoints,
        infield_ld_3b_points: ild3bPoints,
        infield_ld_ss_points: ildssPoints,

        ifss1bt_seconds: ifss1btSeconds,
        ifss1bt_points: ifss1btPoints,
      },
      max_points: INFIELD_POINTS_MAX_11U,
      total_points: infieldTotalPoints,
    },
  };
}

/* -------------------------------------------------------------------------- */
/*                               11U OUTFIELD                                 */
/* -------------------------------------------------------------------------- */
/**
 * 11U OUTFIELD
 * Same maxima as 10U:
 * C20X20M + T80FT + OFGBHT time
 */

const C20X20M_POINTS_MAX_11U = 20;
const T80FT_POINTS_MAX_11U = 20;
const OFGBHT_POINTS_MAX_11U = 14.5;
const OUTFIELD_POINTS_MAX_11U = 54.5;

function compute11UOutfield(metrics: MetricMap) {
  const c20x20mRaw = getMetric(metrics, "c20x20m_points");
  const t80Raw = getMetric(metrics, "throw_80ft_target");
  const ofgbhtSeconds = getMetric(metrics, "ofgbht_seconds");

  const c20x20mPoints = clamp(c20x20mRaw, 0, C20X20M_POINTS_MAX_11U);
  const t80Points = clamp(t80Raw, 0, T80FT_POINTS_MAX_11U);

  let ofgbhtPoints: number | null = null;
  if (ofgbhtSeconds !== null) {
    const raw = (10 - ofgbhtSeconds) * 2;
    if (raw <= 0) ofgbhtPoints = 0;
    else ofgbhtPoints = raw > OFGBHT_POINTS_MAX_11U ? OFGBHT_POINTS_MAX_11U : raw;
  }

  const outfieldTotalPoints = sum([c20x20mPoints, t80Points, ofgbhtPoints]);

  const outfieldScore =
    outfieldTotalPoints !== null
      ? Number(
          ((outfieldTotalPoints / OUTFIELD_POINTS_MAX_11U) * 50).toFixed(1)
        )
      : null;

  return {
    score: outfieldScore,
    max_points: OUTFIELD_POINTS_MAX_11U,
    total_points: outfieldTotalPoints,
    breakdown: {
      tests: {
        c20x20m_raw_points: c20x20mRaw,
        c20x20m_points: c20x20mPoints,
        t80ft_raw_points: t80Raw,
        t80ft_points: t80Points,
        ofgbht_seconds: ofgbhtSeconds,
        ofgbht_points: ofgbhtPoints,
      },
      max_points: OUTFIELD_POINTS_MAX_11U,
      total_points: outfieldTotalPoints,
    },
  };
}

/* -------------------------------------------------------------------------- */
/*                          MAIN 11U RATING ENTRYPOINT                        */
/* -------------------------------------------------------------------------- */

export function compute11URatings(metrics: MetricMap): RatingResult {
  const athletic = compute11UAthleticSkills(metrics);
  const hitting = compute11UHitting(metrics);
  const pitching = compute11UPitching(metrics);
  const catcher = compute11UCatcher(metrics);
  const firstbase = compute11UFirstBase(metrics);
  const infield = compute11UInfield(metrics);
  const outfield = compute11UOutfield(metrics);

  const overallScore =
    athletic.score ??
    hitting.score ??
    pitching.score ??
    catcher.score ??
    firstbase.score ??
    infield.score ??
    outfield.score ??
    null;

  const offenseScore = hitting.score ?? athletic.score ?? null;

  const defenseScore =
    infield.score ??
    outfield.score ??
    firstbase.score ??
    catcher.score ??
    pitching.score ??
    null;

  const pitchingScore = pitching.score ?? null;

  return {
    overall_score: overallScore,
    offense_score: offenseScore,
    defense_score: defenseScore,
    pitching_score: pitchingScore,
    breakdown: {
      athletic: athletic.breakdown,
      hitting: hitting.breakdown,
      pitching: pitching.breakdown,
      catcher: catcher.breakdown,
      firstbase: firstbase.breakdown,
      infield: infield.breakdown,
      outfield: outfield.breakdown,
    },
  };
}
