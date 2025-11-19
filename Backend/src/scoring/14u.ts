// src/scoring/14u.ts
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

/* -------------------------------------------------------------------------- */
/*                              14U ATHLETIC                                  */
/* -------------------------------------------------------------------------- */
/**
 * 14U ATHLETIC
 *
 * Same structure as 13U, but with:
 * - 1B speed max points: 60
 * - 4B speed max points: 65
 * - Vert jump max points: 24
 */

const TS1B_MAX_POINTS_14U = 60;
const TS4B_MAX_POINTS_14U = 65;
const SPEED_POINTS_MAX_14U = TS1B_MAX_POINTS_14U + TS4B_MAX_POINTS_14U; // 125

const PUSHUPS_MAX_POINTS_14U = 20; // APUSH60 / 3, max 60 reps
const SITUPS_MAX_POINTS_14U = 15;  // ASIT60 / 4, max 60 reps
const VJUMP_MAX_POINTS_14U = 24;   // updated

const SLS_OPEN_MAX_14U = 10;
const SLS_CLOSED_MAX_14U = 15;

const MSR_TOTAL_MAX_14U = 6;
const TOE_TOUCH_MAX_14U = 6;
const DEEP_SQUAT_MAX_14U = 9;

const ATHLETIC_POINTS_MAX_14U =
  SPEED_POINTS_MAX_14U +
  PUSHUPS_MAX_POINTS_14U +
  SITUPS_MAX_POINTS_14U +
  VJUMP_MAX_POINTS_14U +
  SLS_OPEN_MAX_14U +
  SLS_CLOSED_MAX_14U +
  MSR_TOTAL_MAX_14U +
  TOE_TOUCH_MAX_14U +
  DEEP_SQUAT_MAX_14U; // 230

function compute14UAthleticSkills(metrics: MetricMap) {
  // Speed: 1B & 4B ((fps - 7) * 3), using time + distance (with defaults)
  const run1bSeconds = getMetric(metrics, "timed_run_1b");
  const run4bSeconds = getMetric(metrics, "timed_run_4b");
  const run1bDistanceFt = getMetric(metrics, "timed_run_1b_distance_ft");
  const run4bDistanceFt = getMetric(metrics, "timed_run_4b_distance_ft");

  const run1bFps = getFps(metrics, "timed_run_1b", "timed_run_1b_distance_ft", 60);
  const run4bFps = getFps(metrics, "timed_run_4b", "timed_run_4b_distance_ft", 240);

  const run1bPointsRaw = run1bFps ? (run1bFps - 7) * 3 : null;
  const run4bPointsRaw = run4bFps ? (run4bFps - 7) * 3 : null;

  const run1bPoints = clamp(run1bPointsRaw, 0, TS1B_MAX_POINTS_14U);
  const run4bPoints = clamp(run4bPointsRaw, 0, TS4B_MAX_POINTS_14U);

  const speedPointsTotal = sum([run1bPoints, run4bPoints]);
  const speedScore =
    speedPointsTotal !== null
      ? Number(((speedPointsTotal / SPEED_POINTS_MAX_14U) * 50).toFixed(1))
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

  const slsOpenPoints = clamp(slsOpenPointsRaw, 0, SLS_OPEN_MAX_14U);
  const slsClosedPoints = clamp(slsClosedPointsRaw, 0, SLS_CLOSED_MAX_14U);

  // Strength: push-ups & sit-ups (60s versions)
  const pushupsRaw = getMetric(metrics, "apush_60");
  const situpsRaw = getMetric(metrics, "asit_60");

  const pushupsPointsRaw = pushupsRaw !== null ? pushupsRaw / 3 : null;
  const situpsPointsRaw = situpsRaw !== null ? situpsRaw / 4 : null;

  const pushupsPoints = clamp(pushupsPointsRaw, 0, PUSHUPS_MAX_POINTS_14U);
  const situpsPoints = clamp(situpsPointsRaw, 0, SITUPS_MAX_POINTS_14U);

  // Vertical jump
  const vjumpInches = getMetric(metrics, "asp_jump_inches");
  const vjumpPoints = clamp(vjumpInches, 0, VJUMP_MAX_POINTS_14U);

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
      ? Math.max(0, Math.min(MSR_TOTAL_MAX_14U, msrPointsTotal))
      : null;

  // Mobility: toe touch & deep squat
  const toeTouchRawPoints = getMetric(metrics, "toe_touch");
  const deepSquatRawPoints = getMetric(metrics, "deep_squat");

  const toeTouchPoints = clamp(toeTouchRawPoints, 0, TOE_TOUCH_MAX_14U);
  const deepSquatPoints = clamp(deepSquatRawPoints, 0, DEEP_SQUAT_MAX_14U);

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
      ? Number(((athleticTotalPoints / ATHLETIC_POINTS_MAX_14U) * 50).toFixed(1))
      : null;

  return {
    score: athleticScore,
    max_points: ATHLETIC_POINTS_MAX_14U,
    total_points: athleticTotalPoints,
    breakdown: {
      tests: {
        // Speed raw + derived
        run_1b_seconds: run1bSeconds,
        run_1b_distance_ft: run1bDistanceFt,
        run_4b_seconds: run4bSeconds,
        run_4b_distance_ft: run4bDistanceFt,

        run_1b_fps: run1bFps,
        run_4b_fps: run4bFps,
        run_1b_points: run1bPoints,
        run_4b_points: run4bPoints,
        speed_points_total: speedPointsTotal,
        speed_score: speedScore,

        // Strength
        pushups_60_raw: pushupsRaw,
        situps_60_raw: situpsRaw,
        pushups_60_points: pushupsPoints,
        situps_60_points: situpsPoints,

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
      max_points: ATHLETIC_POINTS_MAX_14U,
      total_points: athleticTotalPoints,
    },
  };
}

/* -------------------------------------------------------------------------- */
/*                               14U HITTING                                  */
/* -------------------------------------------------------------------------- */
/**
 * 14U HITTING
 *
 * Same as 13U:
 * - HC10LD   (tee LD)              max 10
 * - HPTEV    (max EV off tee mph)  points = mph / 5, max 15
 * - H10FAST  (10 fastball matrix)  points 0–50
 * - H5VSPD   (5 varied-speed)      points 0–25
 * - HPBS     (max bat speed mph)   points = mph / 4, max 18
 */

const TEE_LD_MAX_POINTS_14U = 10;   // HC10LD
const PITCH_QUALITY_MAX_POINTS_14U = 50;  // H10FAST
const EXIT_VELO_MAX_POINTS_14U = 15;      // HPTEV
const BAT_SPEED_MAX_POINTS_14U = 18;      // HPBS
const VARIED_SPEED_MAX_POINTS_14U = 25;   // H5VSPD

const CONTACT_POINTS_MAX_14U = 85; // 10 + 50 + 25
const POWER_POINTS_MAX_14U = 83;   // 15 + 50 + 18
const HITTING_POINTS_MAX_14U = 118;

function compute14UHitting(metrics: MetricMap) {
  const fastballRaw = getMetric(metrics, "m_10_fastball_quality");
  const teeLdRaw = getMetric(metrics, "tee_line_drive_test_10");
  const exitVeloMph = getMetric(metrics, "max_exit_velo_tee");
  const batSpeedMph = getMetric(metrics, "max_bat_speed");
  const variedSpeedRaw = getMetric(metrics, "m_5_varied_speed_quality");

  const pitchPoints = clamp(fastballRaw, 0, PITCH_QUALITY_MAX_POINTS_14U);
  const teeLdPoints = clamp(teeLdRaw, 0, TEE_LD_MAX_POINTS_14U);
  const variedSpeedPoints = clamp(
    variedSpeedRaw,
    0,
    VARIED_SPEED_MAX_POINTS_14U
  );

  const exitVeloPointsRaw = exitVeloMph !== null ? exitVeloMph / 5 : null;
  const batSpeedPointsRaw = batSpeedMph !== null ? batSpeedMph / 4 : null;

  const exitVeloPoints = clamp(
    exitVeloPointsRaw,
    0,
    EXIT_VELO_MAX_POINTS_14U
  );
  const batSpeedPoints = clamp(
    batSpeedPointsRaw,
    0,
    BAT_SPEED_MAX_POINTS_14U
  );

  const contactRawPoints = sum([teeLdPoints, pitchPoints, variedSpeedPoints]);
  const powerRawPoints = sum([exitVeloPoints, pitchPoints, batSpeedPoints]);

  const contactScore =
    contactRawPoints !== null
      ? Number(((contactRawPoints / CONTACT_POINTS_MAX_14U) * 100).toFixed(1))
      : null;

  const powerScore =
    powerRawPoints !== null
      ? Number(((powerRawPoints / POWER_POINTS_MAX_14U) * 100).toFixed(1))
      : null;

  const hittingTotalPoints = sum([
    teeLdPoints,
    pitchPoints,
    exitVeloPoints,
    batSpeedPoints,
    variedSpeedPoints,
  ]);

  const hittingScore =
    hittingTotalPoints !== null
      ? Number(
          ((hittingTotalPoints / HITTING_POINTS_MAX_14U) * 50).toFixed(1)
        )
      : null;

  return {
    score: hittingScore,
    max_points: HITTING_POINTS_MAX_14U,
    total_points: hittingTotalPoints,
    breakdown: {
      tests: {
        pitch_raw: fastballRaw,
        tee_ld_raw: teeLdRaw,
        exit_velo_mph: exitVeloMph,
        bat_speed_mph: batSpeedMph,
        varied_speed_raw: variedSpeedRaw,

        pitch_points: pitchPoints,
        tee_ld_points: teeLdPoints,
        exit_velo_points: exitVeloPoints,
        bat_speed_points: batSpeedPoints,
        varied_speed_points: variedSpeedPoints,

        contact_raw_points: contactRawPoints,
        power_raw_points: powerRawPoints,
        contact_score: contactScore,
        power_score: powerScore,

        strike_chance_percent: null,
      },
      max_points: HITTING_POINTS_MAX_14U,
      total_points: hittingTotalPoints,
    },
  };
}

/* -------------------------------------------------------------------------- */
/*                               14U PITCHING                                 */
/* -------------------------------------------------------------------------- */
/**
 * 14U PITCHING
 *
 * TSPEED (max_throwing_speed) + TPITCH2060 (m_20_throw_test_60ft)
 *
 * Parameters:
 *   baseline = -3
 *   a_s = 1.1
 *   a_a = 0.95
 *   minSpeed = 50 mph
 *   maxSpeed = 80 mph
 */

const PITCH_TSPEED_POINTS_MAX_14U = 40; // 80 / 2
const PITCH_ACC_POINTS_MAX_14U = 60;    // TPITCH2060
const PITCH_POINTS_MAX_14U =
  PITCH_TSPEED_POINTS_MAX_14U + PITCH_ACC_POINTS_MAX_14U; // 100

const STRIKE_BASELINE_14U = -3;
const STRIKE_WEIGHT_SPEED_14U = 1.1;
const STRIKE_WEIGHT_ACC_14U = 0.95;
const STRIKE_MIN_SPEED_14U = 50;
const STRIKE_MAX_SPEED_14U = 80;

function compute14UPitching(metrics: MetricMap) {
  const tspeedMph = getMetric(metrics, "max_throwing_speed");
  const tpitchRaw = getMetric(metrics, "m_20_throw_test_60ft");

  const tspeedPointsRaw = tspeedMph !== null ? tspeedMph / 2 : null;
  const tspeedPoints = clamp(tspeedPointsRaw, 0, PITCH_TSPEED_POINTS_MAX_14U);

  const tpitchPoints = clamp(tpitchRaw, 0, PITCH_ACC_POINTS_MAX_14U);

  const pitchingTotalPoints = sum([tspeedPoints, tpitchPoints]);

  const pitchingScore =
    pitchingTotalPoints !== null
      ? Number(((pitchingTotalPoints / PITCH_POINTS_MAX_14U) * 50).toFixed(1))
      : null;

  const pitchSpeedScorePercent =
    tspeedPoints !== null
      ? Number(
          ((tspeedPoints / PITCH_TSPEED_POINTS_MAX_14U) * 100).toFixed(1)
        )
      : null;

  const pitchAccScorePercent =
    tpitchPoints !== null
      ? Number(
          ((tpitchPoints / PITCH_ACC_POINTS_MAX_14U) * 100).toFixed(1)
        )
      : null;

  const pitchScorePercent =
    tspeedPoints !== null && tpitchPoints !== null
      ? Number(
          (
            ((tspeedPoints + tpitchPoints) / PITCH_POINTS_MAX_14U) *
            100
          ).toFixed(1)
        )
      : null;

  let strikeoutChancePercent: number | null = null;
  if (tspeedMph !== null && tpitchPoints !== null) {
    const nSRaw =
      (tspeedMph - STRIKE_MIN_SPEED_14U) /
      (STRIKE_MAX_SPEED_14U - STRIKE_MIN_SPEED_14U);
    const nS = Math.max(0, Math.min(1, nSRaw));
    const dA = tpitchPoints / PITCH_ACC_POINTS_MAX_14U;

    const x =
      STRIKE_BASELINE_14U +
      STRIKE_WEIGHT_SPEED_14U * nS +
      STRIKE_WEIGHT_ACC_14U * dA;

    const logistic = 1 / (1 + Math.exp(-x));
    strikeoutChancePercent = Number((logistic * 100).toFixed(1));
  }

  return {
    score: pitchingScore,
    max_points: PITCH_POINTS_MAX_14U,
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
      max_points: PITCH_POINTS_MAX_14U,
      total_points: pitchingTotalPoints,
    },
  };
}

/* -------------------------------------------------------------------------- */
/*                               14U CATCHER                                  */
/* -------------------------------------------------------------------------- */
/**
 * 14U CATCHER
 *
 * Same structure and maxima as 13U:
 * - C10PCS max: 20
 * - CT2BT max: 15
 * - CTTT2B max: 15
 */

const C10PCS_POINTS_MAX_14U = 20;
const CT2BT_POINTS_MAX_14U = 15;
const CTTT2B_POINTS_MAX_14U = 15;
const CATCHER_POINTS_MAX_14U =
  C10PCS_POINTS_MAX_14U + CT2BT_POINTS_MAX_14U + CTTT2B_POINTS_MAX_14U; // 50

function compute14UCatcher(metrics: MetricMap) {
  const c10pcsRaw = getMetric(metrics, "c10pcs_points");
  const ct2btSeconds = getMetric(metrics, "ct2bt_seconds");
  const cttt2bRaw = getMetric(metrics, "cttt2b_points");

  const c10pcsPoints = clamp(c10pcsRaw, 0, C10PCS_POINTS_MAX_14U);

  let ct2btPoints: number | null = null;
  if (ct2btSeconds !== null) {
    const raw = (5 - ct2btSeconds) * 4;
    ct2btPoints = raw <= 0 ? 0 : raw;
    if (ct2btPoints > CT2BT_POINTS_MAX_14U) {
      ct2btPoints = CT2BT_POINTS_MAX_14U;
    }
  }

  const cttt2bPoints = clamp(cttt2bRaw, 0, CTTT2B_POINTS_MAX_14U);

  const catcherTotalPoints = sum([c10pcsPoints, ct2btPoints, cttt2bPoints]);

  const catcherScore =
    catcherTotalPoints !== null
      ? Number(((catcherTotalPoints / CATCHER_POINTS_MAX_14U) * 50).toFixed(1))
      : null;

  return {
    score: catcherScore,
    max_points: CATCHER_POINTS_MAX_14U,
    total_points: catcherTotalPoints,
    breakdown: {
      tests: {
        c10pcs_raw_points: c10pcsRaw,
        c10pcs_points: c10pcsPoints,
        ct2bt_seconds: ct2btSeconds,
        ct2bt_points: ct2btPoints,
        cttt2b_raw_points: cttt2bRaw,
        cttt2b_points: cttt2bPoints,
      },
      max_points: CATCHER_POINTS_MAX_14U,
      total_points: catcherTotalPoints,
    },
  };
}

/* -------------------------------------------------------------------------- */
/*                              14U FIRST BASE                                */
/* -------------------------------------------------------------------------- */

const C101B_POINTS_MAX_14U = 30;
const C1BST_POINTS_MAX_14U = 15;
const RLC_POINTS_MAX_14U = 12;
const FBFLY_POINTS_MAX_14U = 6;
const FBLD_POINTS_MAX_14U = 6;
const FIRSTBASE_POINTS_MAX_14U =
  C101B_POINTS_MAX_14U +
  C1BST_POINTS_MAX_14U +
  RLC_POINTS_MAX_14U +
  FBFLY_POINTS_MAX_14U +
  FBLD_POINTS_MAX_14U; // 69

function computeRlcTotalForPrefix14U(metrics: MetricMap, prefix: string) {
  const reps = [1, 2, 3, 4, 5, 6];
  const points: (number | null)[] = [];

  for (const i of reps) {
    const key = `${prefix}_grounder_${i}_points`;
    points.push(getMetric(metrics, key));
  }

  const totalRaw = sum(points);
  const total =
    totalRaw !== null
      ? Math.max(0, Math.min(RLC_POINTS_MAX_14U, totalRaw))
      : null;

  return { pointsByRep: points, total };
}

function compute14UFirstBase(metrics: MetricMap) {
  const c101bRaw = getMetric(metrics, "c101b_catching_test");
  const c1bstRaw = getMetric(metrics, "c1bst_scoops_test");

  const c101bPoints = clamp(c101bRaw, 0, C101B_POINTS_MAX_14U);
  const c1bstPoints = clamp(c1bstRaw, 0, C1BST_POINTS_MAX_14U);

  const rlc1b = computeRlcTotalForPrefix14U(metrics, "rlc1b");

  const fbFlyRaw = getMetric(metrics, "fbfly_points");
  const fbLdRaw = getMetric(metrics, "fbld_points");

  const fbFlyPoints = clamp(fbFlyRaw, 0, FBFLY_POINTS_MAX_14U);
  const fbLdPoints = clamp(fbLdRaw, 0, FBLD_POINTS_MAX_14U);

  const firstBaseTotalPoints = sum([
    c101bPoints,
    c1bstPoints,
    rlc1b.total,
    fbFlyPoints,
    fbLdPoints,
  ]);

  const firstBaseScore =
    firstBaseTotalPoints !== null
      ? Number(
          ((firstBaseTotalPoints / FIRSTBASE_POINTS_MAX_14U) * 50).toFixed(1)
        )
      : null;

  return {
    score: firstBaseScore,
    max_points: FIRSTBASE_POINTS_MAX_14U,
    total_points: firstBaseTotalPoints,
    breakdown: {
      tests: {
        c101b_raw_points: c101bRaw,
        c101b_points: c101bPoints,
        c1bst_raw_points: c1bstRaw,
        c1bst_points: c1bstPoints,

        rlc1b_rep_points: rlc1b.pointsByRep,
        rlc1b_points_total: rlc1b.total,

        fb_fly_raw_points: fbFlyRaw,
        fb_fly_points: fbFlyPoints,
        fb_ld_raw_points: fbLdRaw,
        fb_ld_points: fbLdPoints,
      },
      max_points: FIRSTBASE_POINTS_MAX_14U,
      total_points: firstBaseTotalPoints,
    },
  };
}

/* -------------------------------------------------------------------------- */
/*                               14U INFIELD                                  */
/* -------------------------------------------------------------------------- */

const IF_FLY_POINTS_MAX_14U = 6;
const IFSS1BT_POINTS_MAX_14U = 14.5;
const INFIELD_POINTS_MAX_14U = 86.5;

function timeTo14_5Points14U(seconds: number | null): number | null {
  if (seconds === null) return null;
  const raw = (10 - seconds) * 2;
  if (raw <= 0) return 0;
  return raw > IFSS1BT_POINTS_MAX_14U ? IFSS1BT_POINTS_MAX_14U : raw;
}

function compute14UInfield(metrics: MetricMap) {
  const rlc2b = computeRlcTotalForPrefix14U(metrics, "rlc2b");
  const rlc3b = computeRlcTotalForPrefix14U(metrics, "rlc3b");
  const rlcss = computeRlcTotalForPrefix14U(metrics, "rlcss");

  const iff2bRaw = getMetric(metrics, "infield_fly_2b");
  const iff3bRaw = getMetric(metrics, "infield_fly_3b");
  const iffssRaw = getMetric(metrics, "infield_fly_ss");

  const ild2bRaw = getMetric(metrics, "infield_ld_2b");
  const ild3bRaw = getMetric(metrics, "infield_ld_3b");
  const ildssRaw = getMetric(metrics, "infield_ld_ss");

  const iff2bPoints = clamp(iff2bRaw, 0, IF_FLY_POINTS_MAX_14U);
  const iff3bPoints = clamp(iff3bRaw, 0, IF_FLY_POINTS_MAX_14U);
  const iffssPoints = clamp(iffssRaw, 0, IF_FLY_POINTS_MAX_14U);

  const ild2bPoints = clamp(ild2bRaw, 0, IF_FLY_POINTS_MAX_14U);
  const ild3bPoints = clamp(ild3bRaw, 0, IF_FLY_POINTS_MAX_14U);
  const ildssPoints = clamp(ildssRaw, 0, IF_FLY_POINTS_MAX_14U);

  const ifss1btSeconds = getMetric(metrics, "ifss1bt_seconds");
  const ifss1btPoints = timeTo14_5Points14U(ifss1btSeconds);

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
      ? Number(((infieldTotalPoints / INFIELD_POINTS_MAX_14U) * 50).toFixed(1))
      : null;

  return {
    score: infieldScore,
    max_points: INFIELD_POINTS_MAX_14U,
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
      max_points: INFIELD_POINTS_MAX_14U,
      total_points: infieldTotalPoints,
    },
  };
}

/* -------------------------------------------------------------------------- */
/*                               14U OUTFIELD                                 */
/* -------------------------------------------------------------------------- */

const C20X20M_POINTS_MAX_14U = 20;
const T100FT_POINTS_MAX_14U = 20;
const OFGBHT_POINTS_MAX_14U = 14.5;
const OUTFIELD_POINTS_MAX_14U = 54.5;

function compute14UOutfield(metrics: MetricMap) {
  const c20x20mRaw = getMetric(metrics, "c20x20m_points");
  const t100Raw = getMetric(metrics, "throw_100ft_target");
  const ofgbhtSeconds = getMetric(metrics, "ofgbht_seconds");

  const c20x20mPoints = clamp(c20x20mRaw, 0, C20X20M_POINTS_MAX_14U);
  const t100Points = clamp(t100Raw, 0, T100FT_POINTS_MAX_14U);

  let ofgbhtPoints: number | null = null;
  if (ofgbhtSeconds !== null) {
    const raw = (10 - ofgbhtSeconds) * 2;
    if (raw <= 0) ofgbhtPoints = 0;
    else ofgbhtPoints =
      raw > OFGBHT_POINTS_MAX_14U ? OFGBHT_POINTS_MAX_14U : raw;
  }

  const outfieldTotalPoints = sum([c20x20mPoints, t100Points, ofgbhtPoints]);

  const outfieldScore =
    outfieldTotalPoints !== null
      ? Number(
          ((outfieldTotalPoints / OUTFIELD_POINTS_MAX_14U) * 50).toFixed(1)
        )
      : null;

  return {
    score: outfieldScore,
    max_points: OUTFIELD_POINTS_MAX_14U,
    total_points: outfieldTotalPoints,
    breakdown: {
      tests: {
        c20x20m_raw_points: c20x20mRaw,
        c20x20m_points: c20x20mPoints,
        t100ft_raw_points: t100Raw,
        t100ft_points: t100Points,
        ofgbht_seconds: ofgbhtSeconds,
        ofgbht_points: ofgbhtPoints,
      },
      max_points: OUTFIELD_POINTS_MAX_14U,
      total_points: outfieldTotalPoints,
    },
  };
}

/* -------------------------------------------------------------------------- */
/*                          MAIN 14U RATING ENTRYPOINT                        */
/* -------------------------------------------------------------------------- */

export function compute14URatings(metrics: MetricMap): RatingResult {
  const athletic = compute14UAthleticSkills(metrics);
  const hitting = compute14UHitting(metrics);
  const pitching = compute14UPitching(metrics);
  const catcher = compute14UCatcher(metrics);
  const firstbase = compute14UFirstBase(metrics);
  const infield = compute14UInfield(metrics);
  const outfield = compute14UOutfield(metrics);

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
