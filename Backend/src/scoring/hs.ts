// src/scoring/hs.ts
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
/*                             HS ATHLETIC SKILLS                             */
/* -------------------------------------------------------------------------- */
/**
 * High School ATHLETIC
 *
 * Changes vs 14U:
 * - 1B speed max points: 60 (same formula, but distance is now a metric)
 * - 4B speed max points: 65 (same formula, distance metric)
 * - APUSH60 max: 25 (75 / 3)
 * - ASIT60 max: 25 (100 / 4)
 * - New APULL60 (pull-ups in 60 sec), max: 25 (1 pt per rep)
 * - ASPJUMP max: 30 inches
 * - New ASPSCP (seated chest pass): max 30 ft
 * - New ASPSUP (sit-up and throw): max 30 ft
 * - Balance / MSR / mobility screens same as 14U
 */

const TS1B_MAX_POINTS_HS = 60;
const TS4B_MAX_POINTS_HS = 65;
const SPEED_POINTS_MAX_HS = TS1B_MAX_POINTS_HS + TS4B_MAX_POINTS_HS; // 125

const PUSHUPS_MAX_POINTS_HS = 25; // APUSH60 / 3, max 75 reps
const SITUPS_MAX_POINTS_HS = 25;  // ASIT60 / 4, max 100 reps
const PULLUPS_MAX_POINTS_HS = 25; // APULL60, 1 pt per pull-up up to 25

const VJUMP_MAX_POINTS_HS = 30;   // ASPJUMP, inches

const ASPSCP_MAX_POINTS_HS = 30;  // seated chest pass, feet
const ASPSUP_MAX_POINTS_HS = 30;  // sit-up and throw, feet

const SLS_OPEN_MAX_HS = 10;
const SLS_CLOSED_MAX_HS = 15;

const MSR_TOTAL_MAX_HS = 6;
const TOE_TOUCH_MAX_HS = 6;
const DEEP_SQUAT_MAX_HS = 9;

const ATHLETIC_POINTS_MAX_HS =
  SPEED_POINTS_MAX_HS +
  PUSHUPS_MAX_POINTS_HS +
  SITUPS_MAX_POINTS_HS +
  PULLUPS_MAX_POINTS_HS +
  VJUMP_MAX_POINTS_HS +
  ASPSCP_MAX_POINTS_HS +
  ASPSUP_MAX_POINTS_HS +
  SLS_OPEN_MAX_HS +
  SLS_CLOSED_MAX_HS +
  MSR_TOTAL_MAX_HS +
  TOE_TOUCH_MAX_HS +
  DEEP_SQUAT_MAX_HS; // 336

function computeHSAthleticSkills(metrics: MetricMap) {
  // Speed: 1B & 4B with configurable basepath distances
  const run1bSeconds = getMetric(metrics, "timed_run_1b");
  const run4bSeconds = getMetric(metrics, "timed_run_4b");

  // Optional distances (ft). If not provided, we default to 60ft / 240ft
  const run1bDistanceFt = getMetric(metrics, "timed_run_1b_distance_ft");
  const run4bDistanceFt = getMetric(metrics, "timed_run_4b_distance_ft");

  let run1bFps: number | null = null;
  if (run1bSeconds !== null && run1bSeconds > 0) {
    const dist = run1bDistanceFt ?? 60;
    run1bFps = dist / run1bSeconds;
  }

  let run4bFps: number | null = null;
  if (run4bSeconds !== null && run4bSeconds > 0) {
    const dist = run4bDistanceFt ?? 240;
    run4bFps = dist / run4bSeconds;
  }

  const run1bPointsRaw = run1bFps !== null ? (run1bFps - 7) * 3 : null;
  const run4bPointsRaw = run4bFps !== null ? (run4bFps - 7) * 3 : null;

  const run1bPoints = clamp(run1bPointsRaw, 0, TS1B_MAX_POINTS_HS);
  const run4bPoints = clamp(run4bPointsRaw, 0, TS4B_MAX_POINTS_HS);

  const speedPointsTotal = sum([run1bPoints, run4bPoints]);
  const speedScore =
    speedPointsTotal !== null
      ? Number(((speedPointsTotal / SPEED_POINTS_MAX_HS) * 50).toFixed(1))
      : null;

  // Balance: SLS open/closed
  const slsOpenRightSec = getMetric(metrics, "sls_eyes_open_right");
  const slsOpenLeftSec = getMetric(metrics, "sls_eyes_open_left");
  const slsClosedRightSec = getMetric(metrics, "sls_eyes_closed_right");
  const slsClosedLeftSec = getMetric(metrics, "sls_eyes_closed_left");

  const slsOpenAvgSeconds = average([slsOpenRightSec, slsOpenLeftSec]);
  const slsClosedAvgSeconds = average([slsClosedRightSec, slsClosedLeftSec]);

  const slsOpenPointsRaw =
    slsOpenAvgSeconds !== null ? slsOpenAvgSeconds / 3 : null;
  const slsClosedPointsRaw =
    slsClosedAvgSeconds !== null ? slsClosedAvgSeconds / 2 : null;

  const slsOpenPoints = clamp(slsOpenPointsRaw, 0, SLS_OPEN_MAX_HS);
  const slsClosedPoints = clamp(slsClosedPointsRaw, 0, SLS_CLOSED_MAX_HS);

  // Strength: push-ups, sit-ups, pull-ups (60s versions)
  const pushupsRaw = getMetric(metrics, "apush_60");
  const situpsRaw = getMetric(metrics, "asit_60");
  const pullupsRaw = getMetric(metrics, "apull_60");

  const pushupsPointsRaw = pushupsRaw !== null ? pushupsRaw / 3 : null;
  const situpsPointsRaw = situpsRaw !== null ? situpsRaw / 4 : null;
  const pullupsPointsRaw = pullupsRaw !== null ? pullupsRaw : null;

  const pushupsPoints = clamp(pushupsPointsRaw, 0, PUSHUPS_MAX_POINTS_HS);
  const situpsPoints = clamp(situpsPointsRaw, 0, SITUPS_MAX_POINTS_HS);
  const pullupsPoints = clamp(pullupsPointsRaw, 0, PULLUPS_MAX_POINTS_HS);

  // Vertical jump
  const vjumpInches = getMetric(metrics, "asp_jump_inches");
  const vjumpPoints = clamp(vjumpInches, 0, VJUMP_MAX_POINTS_HS);

  // Power tests: seated chest pass (ASPSCP) and sit-up throw (ASPSUP)
  const aspscpDistanceFt = getMetric(metrics, "aspscp_distance_ft");
  const aspscpMedBallWeight = getMetric(metrics, "aspscp_med_ball_weight"); // lbs or kg
  const aspscpPoints = clamp(aspscpDistanceFt, 0, ASPSCP_MAX_POINTS_HS);

  const aspsupDistanceFt = getMetric(metrics, "aspsup_distance_ft");
  const aspsupMedBallWeight = getMetric(metrics, "aspsup_med_ball_weight"); // lbs or kg
  const aspsupPoints = clamp(aspsupDistanceFt, 0, ASPSUP_MAX_POINTS_HS);

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
      ? Math.max(0, Math.min(MSR_TOTAL_MAX_HS, msrPointsTotal))
      : null;

  // Mobility: toe touch & deep squat
  const toeTouchRawPoints = getMetric(metrics, "toe_touch");
  const deepSquatRawPoints = getMetric(metrics, "deep_squat");

  const toeTouchPoints = clamp(toeTouchRawPoints, 0, TOE_TOUCH_MAX_HS);
  const deepSquatPoints = clamp(deepSquatRawPoints, 0, DEEP_SQUAT_MAX_HS);

  const athleticTotalPoints = sum([
    run1bPoints,
    run4bPoints,
    pushupsPoints,
    situpsPoints,
    pullupsPoints,
    vjumpPoints,
    aspscpPoints,
    aspsupPoints,
    slsOpenPoints,
    slsClosedPoints,
    msrPointsClamped,
    toeTouchPoints,
    deepSquatPoints,
  ]);

  const athleticScore =
    athleticTotalPoints !== null
      ? Number(((athleticTotalPoints / ATHLETIC_POINTS_MAX_HS) * 50).toFixed(1))
      : null;

  return {
    score: athleticScore,
    max_points: ATHLETIC_POINTS_MAX_HS,
    total_points: athleticTotalPoints,
    breakdown: {
      tests: {
        // Speed
        run_1b_distance_ft: run1bDistanceFt,
        run_4b_distance_ft: run4bDistanceFt,
        run_1b_seconds: run1bSeconds,
        run_4b_seconds: run4bSeconds,
        run_1b_fps: run1bFps,
        run_4b_fps: run4bFps,
        run_1b_points: run1bPoints,
        run_4b_points: run4bPoints,
        speed_points_total: speedPointsTotal,
        speed_score: speedScore,

        // Strength
        pushups_60_raw: pushupsRaw,
        situps_60_raw: situpsRaw,
        pullups_60_raw: pullupsRaw,
        pushups_60_points: pushupsPoints,
        situps_60_points: situpsPoints,
        pullups_60_points: pullupsPoints,

        // Vertical jump
        vjump_inches_raw: vjumpInches,
        vjump_points: vjumpPoints,

        // Power (med ball tests)
        aspscp_distance_ft: aspscpDistanceFt,
        aspscp_med_ball_weight: aspscpMedBallWeight,
        aspscp_points: aspscpPoints,
        aspsup_distance_ft: aspsupDistanceFt,
        aspsup_med_ball_weight: aspsupMedBallWeight,
        aspsup_points: aspsupPoints,

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
      max_points: ATHLETIC_POINTS_MAX_HS,
      total_points: athleticTotalPoints,
    },
  };
}

/* -------------------------------------------------------------------------- */
/*                               HS HITTING                                   */
/* -------------------------------------------------------------------------- */
/**
 * HS HITTING
 *
 * - HC10LD   (tee LD)                 max 10
 * - HPTEV    (max EV off tee mph)     points = mph / 5, max 24
 * - H10FAST  (10 fastball matrix)     points 0–50
 * - H5VSPD   (5 varied-speed)         points 0–25
 * - HBSPEED  (max bat speed mph)      points = mph / 4, max 25
 * - H5CBPD   (5 curveball test)       points 0–25 (same style as H5VSPD)
 *
 * Contact and power scores:
 * - Contact uses: HC10LD + H10FAST + H5VSPD + H5CBPD
 * - Power uses:   HPTEV + H10FAST + HBSPEED
 */

const TEE_LD_MAX_POINTS_HS = 10;         // HC10LD
const PITCH_QUALITY_MAX_POINTS_HS = 50;  // H10FAST
const EXIT_VELO_MAX_POINTS_HS = 24;      // HPTEV
const BAT_SPEED_MAX_POINTS_HS = 25;      // HBSPEED
const VARIED_SPEED_MAX_POINTS_HS = 25;   // H5VSPD
const CURVEBALL_MAX_POINTS_HS = 25;      // H5CBPD

const CONTACT_POINTS_MAX_HS =  // 10 + 50 + 25 + 25
  TEE_LD_MAX_POINTS_HS +
  PITCH_QUALITY_MAX_POINTS_HS +
  VARIED_SPEED_MAX_POINTS_HS +
  CURVEBALL_MAX_POINTS_HS; // 110

const POWER_POINTS_MAX_HS =   // 24 + 50 + 25
  EXIT_VELO_MAX_POINTS_HS +
  PITCH_QUALITY_MAX_POINTS_HS +
  BAT_SPEED_MAX_POINTS_HS; // 99

const HITTING_POINTS_MAX_HS =
  TEE_LD_MAX_POINTS_HS +
  PITCH_QUALITY_MAX_POINTS_HS +
  EXIT_VELO_MAX_POINTS_HS +
  BAT_SPEED_MAX_POINTS_HS +
  VARIED_SPEED_MAX_POINTS_HS +
  CURVEBALL_MAX_POINTS_HS; // 159

function computeHSHitting(metrics: MetricMap) {
  const fastballRaw = getMetric(metrics, "m_10_fastball_quality");
  const teeLdRaw = getMetric(metrics, "tee_line_drive_test_10");
  const exitVeloMph = getMetric(metrics, "max_exit_velo_tee");
  const batSpeedMph = getMetric(metrics, "max_bat_speed");
  const variedSpeedRaw = getMetric(metrics, "m_5_varied_speed_quality");
  const curveballRaw = getMetric(metrics, "m_5_curveball_quality"); // new

  const pitchPoints = clamp(fastballRaw, 0, PITCH_QUALITY_MAX_POINTS_HS);
  const teeLdPoints = clamp(teeLdRaw, 0, TEE_LD_MAX_POINTS_HS);
  const variedSpeedPoints = clamp(
    variedSpeedRaw,
    0,
    VARIED_SPEED_MAX_POINTS_HS
  );
  const curveballPoints = clamp(curveballRaw, 0, CURVEBALL_MAX_POINTS_HS);

  const exitVeloPointsRaw = exitVeloMph !== null ? exitVeloMph / 5 : null;
  const batSpeedPointsRaw = batSpeedMph !== null ? batSpeedMph / 4 : null;

  const exitVeloPoints = clamp(
    exitVeloPointsRaw,
    0,
    EXIT_VELO_MAX_POINTS_HS
  );
  const batSpeedPoints = clamp(
    batSpeedPointsRaw,
    0,
    BAT_SPEED_MAX_POINTS_HS
  );

  const contactRawPoints = sum([
    teeLdPoints,
    pitchPoints,
    variedSpeedPoints,
    curveballPoints,
  ]);

  const powerRawPoints = sum([exitVeloPoints, pitchPoints, batSpeedPoints]);

  const contactScore =
    contactRawPoints !== null
      ? Number(((contactRawPoints / CONTACT_POINTS_MAX_HS) * 100).toFixed(1))
      : null;

  const powerScore =
    powerRawPoints !== null
      ? Number(((powerRawPoints / POWER_POINTS_MAX_HS) * 100).toFixed(1))
      : null;

  const hittingTotalPoints = sum([
    teeLdPoints,
    pitchPoints,
    exitVeloPoints,
    batSpeedPoints,
    variedSpeedPoints,
    curveballPoints,
  ]);

  const hittingScore =
    hittingTotalPoints !== null
      ? Number(
          ((hittingTotalPoints / HITTING_POINTS_MAX_HS) * 50).toFixed(1)
        )
      : null;

  return {
    score: hittingScore,
    max_points: HITTING_POINTS_MAX_HS,
    total_points: hittingTotalPoints,
    breakdown: {
      tests: {
        pitch_raw: fastballRaw,
        tee_ld_raw: teeLdRaw,
        exit_velo_mph: exitVeloMph,
        bat_speed_mph: batSpeedMph,
        varied_speed_raw: variedSpeedRaw,
        curveball_raw: curveballRaw,

        pitch_points: pitchPoints,
        tee_ld_points: teeLdPoints,
        exit_velo_points: exitVeloPoints,
        bat_speed_points: batSpeedPoints,
        varied_speed_points: variedSpeedPoints,
        curveball_points: curveballPoints,

        contact_raw_points: contactRawPoints,
        power_raw_points: powerRawPoints,
        contact_score: contactScore,
        power_score: powerScore,

        strike_chance_percent: null,
      },
      max_points: HITTING_POINTS_MAX_HS,
      total_points: hittingTotalPoints,
    },
  };
}

/* -------------------------------------------------------------------------- */
/*                               HS PITCHING                                  */
/* -------------------------------------------------------------------------- */
/**
 * HS PITCHING
 *
 * TSPEED (max_throwing_speed) + TPITCH2060 (m_20_throw_test_60ft)
 *
 * Parameters:
 *   baseline = -3.25
 *   a_s = 1.2
 *   a_a = 1.0
 *   a_p = 0.25  (weight on number of additional pitches)
 *   a_aa = 0.6  (weight on additional pitch accuracy)
 *
 *   minSpeed = 55 mph
 *   maxSpeed = 95 mph
 *
 * Additional pitch tests:
 *   - TPITCH5AP1, TPITCH5AP2, ... (dynamic count)
 *   - Each is a total points value 0–15
 *   - We detect any metric keys that start with "tpitch5ap"
 *   - For pitching category totals we compute the average additional pitch
 *     points and a percent score based on / 15.
 */

const PITCH_TSPEED_POINTS_MAX_HS = 47.5; // 95 / 2
const PITCH_ACC_POINTS_MAX_HS = 60;      // TPITCH2060
const PITCH_POINTS_MAX_HS =
  PITCH_TSPEED_POINTS_MAX_HS + PITCH_ACC_POINTS_MAX_HS; // 107.5

const ADDITIONAL_PITCH_POINTS_MAX_HS = 15;

const STRIKE_BASELINE_HS = -3.25;
const STRIKE_WEIGHT_SPEED_HS = 1.2;
const STRIKE_WEIGHT_ACC_HS = 1.0;
const STRIKE_WEIGHT_P_HS = 0.25;
const STRIKE_WEIGHT_AP_ACC_HS = 0.6;
const STRIKE_MIN_SPEED_HS = 55;
const STRIKE_MAX_SPEED_HS = 95;

function computeHSPitching(metrics: MetricMap) {
  const tspeedMph = getMetric(metrics, "max_throwing_speed");
  const tpitchRaw = getMetric(metrics, "m_20_throw_test_60ft");

  const tspeedPointsRaw = tspeedMph !== null ? tspeedMph / 2 : null;
  const tspeedPoints = clamp(
    tspeedPointsRaw,
    0,
    PITCH_TSPEED_POINTS_MAX_HS
  );

  const tpitchPoints = clamp(tpitchRaw, 0, PITCH_ACC_POINTS_MAX_HS);

  // Discover additional pitch tests: tpitch5ap1, tpitch5ap2, ...
  const additionalPitchPoints: number[] = [];
  const additionalPitchKeys: string[] = [];

  for (const key of Object.keys(metrics as any)) {
    const lower = key.toLowerCase();
    if (!lower.startsWith("tpitch5ap")) continue;

    const raw = getMetric(metrics, key);
    if (raw === null) continue;

    const clamped = clamp(raw, 0, ADDITIONAL_PITCH_POINTS_MAX_HS);
    if (clamped === null) continue;

    additionalPitchKeys.push(key);
    additionalPitchPoints.push(clamped);
  }

  const additionalPitchTestsCount = additionalPitchPoints.length;

  let additionalPitchAveragePoints: number | null = null;
  if (additionalPitchTestsCount > 0) {
    const total = sum(additionalPitchPoints);
    if (total !== null) {
      additionalPitchAveragePoints = total / additionalPitchTestsCount;
    }
  }

  const additionalPitchAccuracyNormalized =
    additionalPitchAveragePoints !== null
      ? Math.max(
          0,
          Math.min(
            1,
            additionalPitchAveragePoints / ADDITIONAL_PITCH_POINTS_MAX_HS
          )
        )
      : 0;

  const additionalPitchScorePercent =
    additionalPitchAveragePoints !== null
      ? Number(
          (
            (additionalPitchAveragePoints / ADDITIONAL_PITCH_POINTS_MAX_HS) *
            100
          ).toFixed(1)
        )
      : null;

  const pitchingTotalPoints = sum([tspeedPoints, tpitchPoints]);

  const pitchingScore =
    pitchingTotalPoints !== null
      ? Number(
          ((pitchingTotalPoints / PITCH_POINTS_MAX_HS) * 50).toFixed(1)
        )
      : null;

  const pitchSpeedScorePercent =
    tspeedPoints !== null
      ? Number(
          (
            (tspeedPoints / PITCH_TSPEED_POINTS_MAX_HS) *
            100
          ).toFixed(1)
        )
      : null;

  const pitchAccScorePercent =
    tpitchPoints !== null
      ? Number(
          ((tpitchPoints / PITCH_ACC_POINTS_MAX_HS) * 100).toFixed(1)
        )
      : null;

  const pitchScorePercent =
    tspeedPoints !== null && tpitchPoints !== null
      ? Number(
          (
            ((tspeedPoints + tpitchPoints) / PITCH_POINTS_MAX_HS) *
            100
          ).toFixed(1)
        )
      : null;

  let strikeoutChancePercent: number | null = null;
  if (tspeedMph !== null && tpitchPoints !== null) {
    const nSRaw =
      (tspeedMph - STRIKE_MIN_SPEED_HS) /
      (STRIKE_MAX_SPEED_HS - STRIKE_MIN_SPEED_HS);
    const nS = Math.max(0, Math.min(1, nSRaw));

    const accNorm =
      tpitchPoints !== null
        ? Math.max(0, Math.min(1, tpitchPoints / PITCH_ACC_POINTS_MAX_HS))
        : 0;

    const P = additionalPitchTestsCount;
    const AA = additionalPitchAccuracyNormalized;

    const x =
      STRIKE_BASELINE_HS +
      STRIKE_WEIGHT_SPEED_HS * nS +
      STRIKE_WEIGHT_ACC_HS * accNorm +
      STRIKE_WEIGHT_P_HS * P +
      STRIKE_WEIGHT_AP_ACC_HS * AA;

    const logistic = 1 / (1 + Math.exp(-x));
    strikeoutChancePercent = Number((logistic * 100).toFixed(1));
  }

  return {
    score: pitchingScore,
    max_points: PITCH_POINTS_MAX_HS,
    total_points: pitchingTotalPoints,
    breakdown: {
      tests: {
        pitch_speed_mph: tspeedMph,
        tspeed_points: tspeedPoints,
        tpitch_points: tpitchPoints,

        pitch_speed_score_percent: pitchSpeedScorePercent,
        pitch_acc_score_percent: pitchAccScorePercent,
        pitch_score_percent: pitchScorePercent,

        additional_pitch_keys: additionalPitchKeys,
        additional_pitch_points: additionalPitchPoints,
        additional_pitch_tests_count: additionalPitchTestsCount,
        additional_pitch_average_points: additionalPitchAveragePoints,
        additional_pitch_score_percent: additionalPitchScorePercent,

        strike_chance_percent: strikeoutChancePercent,
      },
      max_points: PITCH_POINTS_MAX_HS,
      total_points: pitchingTotalPoints,
    },
  };
}

/* -------------------------------------------------------------------------- */
/*                               HS CATCHER                                   */
/* -------------------------------------------------------------------------- */
/**
 * HS CATCHER
 *
 * - C20PCS max: 40 (20 pitch/catch sequence)
 * - CT2BT max: 15
 * - CTTT2B max: 15
 */

const C20PCS_POINTS_MAX_HS = 40;
const CT2BT_POINTS_MAX_HS = 15;
const CTTT2B_POINTS_MAX_HS = 15;
const CATCHER_POINTS_MAX_HS =
  C20PCS_POINTS_MAX_HS + CT2BT_POINTS_MAX_HS + CTTT2B_POINTS_MAX_HS; // 70

function computeHSCatcher(metrics: MetricMap) {
  const c20pcsRaw = getMetric(metrics, "c20pcs_points");
  const ct2btSeconds = getMetric(metrics, "ct2bt_seconds");
  const cttt2bRaw = getMetric(metrics, "cttt2b_points");

  const c20pcsPoints = clamp(c20pcsRaw, 0, C20PCS_POINTS_MAX_HS);

  let ct2btPoints: number | null = null;
  if (ct2btSeconds !== null) {
    const raw = (5 - ct2btSeconds) * 4;
    ct2btPoints = raw <= 0 ? 0 : raw;
    if (ct2btPoints > CT2BT_POINTS_MAX_HS) {
      ct2btPoints = CT2BT_POINTS_MAX_HS;
    }
  }

  const cttt2bPoints = clamp(cttt2bRaw, 0, CTTT2B_POINTS_MAX_HS);

  const catcherTotalPoints = sum([c20pcsPoints, ct2btPoints, cttt2bPoints]);

  const catcherScore =
    catcherTotalPoints !== null
      ? Number(((catcherTotalPoints / CATCHER_POINTS_MAX_HS) * 50).toFixed(1))
      : null;

  return {
    score: catcherScore,
    max_points: CATCHER_POINTS_MAX_HS,
    total_points: catcherTotalPoints,
    breakdown: {
      tests: {
        c20pcs_raw_points: c20pcsRaw,
        c20pcs_points: c20pcsPoints,
        ct2bt_seconds: ct2btSeconds,
        ct2bt_points: ct2btPoints,
        cttt2b_raw_points: cttt2bRaw,
        cttt2b_points: cttt2bPoints,
      },
      max_points: CATCHER_POINTS_MAX_HS,
      total_points: catcherTotalPoints,
    },
  };
}

/* -------------------------------------------------------------------------- */
/*                             HS FIRST BASE                                  */
/* -------------------------------------------------------------------------- */
/**
 * HS FIRST BASE
 * Same screens and calculations as 14U.
 */

const C101B_POINTS_MAX_HS = 30;
const C1BST_POINTS_MAX_HS = 15;
const RLC_POINTS_MAX_HS = 12;
const FBFLY_POINTS_MAX_HS = 6;
const FBLD_POINTS_MAX_HS = 6;
const FIRSTBASE_POINTS_MAX_HS =
  C101B_POINTS_MAX_HS +
  C1BST_POINTS_MAX_HS +
  RLC_POINTS_MAX_HS +
  FBFLY_POINTS_MAX_HS +
  FBLD_POINTS_MAX_HS; // 69

function computeRlcTotalForPrefixHS(metrics: MetricMap, prefix: string) {
  const reps = [1, 2, 3, 4, 5, 6];
  const points: (number | null)[] = [];

  for (const i of reps) {
    const key = `${prefix}_grounder_${i}_points`;
    points.push(getMetric(metrics, key));
  }

  const totalRaw = sum(points);
  const total =
    totalRaw !== null
      ? Math.max(0, Math.min(RLC_POINTS_MAX_HS, totalRaw))
      : null;

  return { pointsByRep: points, total };
}

function computeHSFirstBase(metrics: MetricMap) {
  const c101bRaw = getMetric(metrics, "c101b_catching_test");
  const c1bstRaw = getMetric(metrics, "c1bst_scoops_test");

  const c101bPoints = clamp(c101bRaw, 0, C101B_POINTS_MAX_HS);
  const c1bstPoints = clamp(c1bstRaw, 0, C1BST_POINTS_MAX_HS);

  const rlc1b = computeRlcTotalForPrefixHS(metrics, "rlc1b");

  const fbFlyRaw = getMetric(metrics, "fbfly_points");
  const fbLdRaw = getMetric(metrics, "fbld_points");

  const fbFlyPoints = clamp(fbFlyRaw, 0, FBFLY_POINTS_MAX_HS);
  const fbLdPoints = clamp(fbLdRaw, 0, FBLD_POINTS_MAX_HS);

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
          ((firstBaseTotalPoints / FIRSTBASE_POINTS_MAX_HS) * 50).toFixed(1)
        )
      : null;

  return {
    score: firstBaseScore,
    max_points: FIRSTBASE_POINTS_MAX_HS,
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
      max_points: FIRSTBASE_POINTS_MAX_HS,
      total_points: firstBaseTotalPoints,
    },
  };
}

/* -------------------------------------------------------------------------- */
/*                               HS INFIELD                                   */
/* -------------------------------------------------------------------------- */
/**
 * HS INFIELD
 *
 * Same screens and calculations as 14U.
 */

const IF_FLY_POINTS_MAX_HS = 6;
const IFSS1BT_POINTS_MAX_HS = 14.5;
const INFIELD_POINTS_MAX_HS = 86.5;

function timeTo14_5PointsHS(seconds: number | null): number | null {
  if (seconds === null) return null;
  const raw = (10 - seconds) * 2;
  if (raw <= 0) return 0;
  return raw > IFSS1BT_POINTS_MAX_HS ? IFSS1BT_POINTS_MAX_HS : raw;
}

function computeHSInfield(metrics: MetricMap) {
  const rlc2b = computeRlcTotalForPrefixHS(metrics, "rlc2b");
  const rlc3b = computeRlcTotalForPrefixHS(metrics, "rlc3b");
  const rlcss = computeRlcTotalForPrefixHS(metrics, "rlcss");

  const iff2bRaw = getMetric(metrics, "infield_fly_2b");
  const iff3bRaw = getMetric(metrics, "infield_fly_3b");
  const iffssRaw = getMetric(metrics, "infield_fly_ss");

  const ild2bRaw = getMetric(metrics, "infield_ld_2b");
  const ild3bRaw = getMetric(metrics, "infield_ld_3b");
  const ildssRaw = getMetric(metrics, "infield_ld_ss");

  const iff2bPoints = clamp(iff2bRaw, 0, IF_FLY_POINTS_MAX_HS);
  const iff3bPoints = clamp(iff3bRaw, 0, IF_FLY_POINTS_MAX_HS);
  const iffssPoints = clamp(iffssRaw, 0, IF_FLY_POINTS_MAX_HS);

  const ild2bPoints = clamp(ild2bRaw, 0, IF_FLY_POINTS_MAX_HS);
  const ild3bPoints = clamp(ild3bRaw, 0, IF_FLY_POINTS_MAX_HS);
  const ildssPoints = clamp(ildssRaw, 0, IF_FLY_POINTS_MAX_HS);

  const ifss1btSeconds = getMetric(metrics, "ifss1bt_seconds");
  const ifss1btPoints = timeTo14_5PointsHS(ifss1btSeconds);

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
      ? Number(((infieldTotalPoints / INFIELD_POINTS_MAX_HS) * 50).toFixed(1))
      : null;

  return {
    score: infieldScore,
    max_points: INFIELD_POINTS_MAX_HS,
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
      max_points: INFIELD_POINTS_MAX_HS,
      total_points: infieldTotalPoints,
    },
  };
}

/* -------------------------------------------------------------------------- */
/*                               HS OUTFIELD                                  */
/* -------------------------------------------------------------------------- */
/**
 * HS OUTFIELD
 *
 * - C30X30M replaces C20X20M, same type, max 20
 * - T120FT replaces T100FT, same calc, max 20
 * - OFGBHT same test, new max 15
 */

const C30X30M_POINTS_MAX_HS = 20;
const T120FT_POINTS_MAX_HS = 20;
const OFGBHT_POINTS_MAX_HS = 15;
const OUTFIELD_POINTS_MAX_HS =
  C30X30M_POINTS_MAX_HS + T120FT_POINTS_MAX_HS + OFGBHT_POINTS_MAX_HS; // 55

function computeHSOutfield(metrics: MetricMap) {
  const c30x30mRaw = getMetric(metrics, "c30x30m_points");
  const t120Raw = getMetric(metrics, "throw_120ft_target");
  const ofgbhtSeconds = getMetric(metrics, "ofgbht_seconds");

  const c30x30mPoints = clamp(c30x30mRaw, 0, C30X30M_POINTS_MAX_HS);
  const t120Points = clamp(t120Raw, 0, T120FT_POINTS_MAX_HS);

  let ofgbhtPoints: number | null = null;
  if (ofgbhtSeconds !== null) {
    const raw = (10 - ofgbhtSeconds) * 2;
    if (raw <= 0) ofgbhtPoints = 0;
    else ofgbhtPoints =
      raw > OFGBHT_POINTS_MAX_HS ? OFGBHT_POINTS_MAX_HS : raw;
  }

  const outfieldTotalPoints = sum([c30x30mPoints, t120Points, ofgbhtPoints]);

  const outfieldScore =
    outfieldTotalPoints !== null
      ? Number(
          ((outfieldTotalPoints / OUTFIELD_POINTS_MAX_HS) * 50).toFixed(1)
        )
      : null;

  return {
    score: outfieldScore,
    max_points: OUTFIELD_POINTS_MAX_HS,
    total_points: outfieldTotalPoints,
    breakdown: {
      tests: {
        c30x30m_raw_points: c30x30mRaw,
        c30x30m_points: c30x30mPoints,
        t120ft_raw_points: t120Raw,
        t120ft_points: t120Points,
        ofgbht_seconds: ofgbhtSeconds,
        ofgbht_points: ofgbhtPoints,
      },
      max_points: OUTFIELD_POINTS_MAX_HS,
      total_points: outfieldTotalPoints,
    },
  };
}

/* -------------------------------------------------------------------------- */
/*                          MAIN HS RATING ENTRYPOINT                         */
/* -------------------------------------------------------------------------- */

export function computeHSRatings(metrics: MetricMap): RatingResult {
  const athletic = computeHSAthleticSkills(metrics);
  const hitting = computeHSHitting(metrics);
  const pitching = computeHSPitching(metrics);
  const catcher = computeHSCatcher(metrics);
  const firstbase = computeHSFirstBase(metrics);
  const infield = computeHSInfield(metrics);
  const outfield = computeHSOutfield(metrics);

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
