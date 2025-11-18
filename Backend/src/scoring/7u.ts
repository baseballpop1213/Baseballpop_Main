// Backend/src/scoring/7u.ts

import type { MetricMap, RatingResult } from "./5u";
import { compute6UAthleticSkillsScore } from "./6u";


/**
 * Helper: average of numbers, ignoring null/undefined.
 */
function average(values: Array<number | null | undefined>): number | null {
  const nums = values.filter(
    (v): v is number => typeof v === "number" && !Number.isNaN(v)
  );
  if (nums.length === 0) return null;
  const sum = nums.reduce((acc, v) => acc + v, 0);
  return sum / nums.length;
}

/**
 * Clamp a numeric value between [min, max].
 */
function clamp(
  value: number | null | undefined,
  min: number,
  max: number
): number | null {
  if (value == null || typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * 7U Athletic Skills scoring.
 *
 * Uses the 6U athletic logic for:
 *  - Speed (1B / 4B -> speed_points_total, speed_score)
 *  - Balance (SLS open / closed)
 *  - Toe touch / deep squat
 *
 * Then adds:
 *  - APUSH30 (apush_30): points = raw / 2, max 20
 *  - ASIT30 (asit_30):  points = raw / 3, max 15
 *  - MSR Right/Left (msr_right / msr_left):
 *      > 180° => 3 points
 *      = 180° => 1 point
 *      < 180° => 0 points
 *
 * Category is normalized to 0–50 based on total max points:
 *   SPEED:            65
 *   SLS open:         10
 *   SLS closed:       15
 *   Toe touch:        5
 *   Deep squat:       10
 *   Push-ups (APUSH): 20
 *   Sit-ups (ASIT):   15
 *   MSR total:        6  (3 per side)
 *   --------------------------------
 *   CATEGORY_MAX      146
 */
function computeAthleticSkillsScore(
  metrics: MetricMap
): {
  categoryScore: number | null;
  breakdown: Record<string, unknown>;
} {
  // 1) Start from 6U logic to get all base points
  const base = compute6UAthleticSkillsScore(metrics);
  const athletic = (base.breakdown || {}) as any;
  const baseTests = athletic.tests || {};

  // Existing components from 6U
  const speedPointsTotal =
    typeof baseTests.speed_points_total === "number"
      ? baseTests.speed_points_total
      : null;
  const slsOpenPoints =
    typeof baseTests.sls_open_points === "number"
      ? baseTests.sls_open_points
      : null;
  const slsClosedPoints =
    typeof baseTests.sls_closed_points === "number"
      ? baseTests.sls_closed_points
      : null;
  const toeTouchPoints =
    typeof baseTests.toe_touch_points === "number"
      ? baseTests.toe_touch_points
      : null;
  const deepSquatPoints =
    typeof baseTests.deep_squat_points === "number"
      ? baseTests.deep_squat_points
      : null;

  // 2) New 7U raw values
  const pushupsRaw = metrics["apush_30"];
  const situpsRaw = metrics["asit_30"];
  const msrRightRaw = metrics["msr_right"];
  const msrLeftRaw = metrics["msr_left"];

  // 3) Constants from your sheet (Column W)
  const SPEED_MAX_POINTS = 65;  // 1B 30 + 4B 35
  const SLS_OPEN_MAX = 10;
  const SLS_CLOSED_MAX = 15;
  const TOE_TOUCH_MAX = 5;
  const DEEP_SQUAT_MAX = 10;
  const APUSH_MAX_POINTS = 20;  // 40 / 2
  const ASIT_MAX_POINTS = 15;   // 45 / 3
  const MSR_PER_SIDE_MAX = 3;

  const CATEGORY_MAX_POINTS =
    SPEED_MAX_POINTS +
    SLS_OPEN_MAX +
    SLS_CLOSED_MAX +
    TOE_TOUCH_MAX +
    DEEP_SQUAT_MAX +
    APUSH_MAX_POINTS +
    ASIT_MAX_POINTS +
    2 * MSR_PER_SIDE_MAX; // = 146

  // 4) Strength scoring: push-ups & sit-ups
  let pushupsPoints: number | null = null;
  if (typeof pushupsRaw === "number" && !Number.isNaN(pushupsRaw)) {
    pushupsPoints = clamp(pushupsRaw / 2, 0, APUSH_MAX_POINTS);
  }

  let situpsPoints: number | null = null;
  if (typeof situpsRaw === "number" && !Number.isNaN(situpsRaw)) {
    situpsPoints = clamp(situpsRaw / 3, 0, ASIT_MAX_POINTS);
  }

  // 5) MSR scoring helper
  const calcMsrSidePoints = (
    raw: number | null | undefined
  ): number | null => {
    if (raw == null || typeof raw !== "number" || Number.isNaN(raw)) {
      return null;
    }
    if (raw > 180) return 3;
    if (raw === 180) return 1;
    return 0;
  };

  const msrRightPoints = calcMsrSidePoints(msrRightRaw);
  const msrLeftPoints = calcMsrSidePoints(msrLeftRaw);

  const msrComponents: number[] = [];
  if (typeof msrRightPoints === "number") msrComponents.push(msrRightPoints);
  if (typeof msrLeftPoints === "number") msrComponents.push(msrLeftPoints);

  const msrPointsTotal =
    msrComponents.length > 0
      ? msrComponents.reduce((sum, v) => sum + v, 0)
      : null;

  // 6) Build the list of components that count toward the category
  const totalComponents: number[] = [];
  const addIfNumber = (v: unknown) => {
    if (typeof v === "number" && !Number.isNaN(v)) {
      totalComponents.push(v);
    }
  };

  addIfNumber(speedPointsTotal);
  addIfNumber(slsOpenPoints);
  addIfNumber(slsClosedPoints);
  addIfNumber(toeTouchPoints);
  addIfNumber(deepSquatPoints);
  addIfNumber(pushupsPoints);
  addIfNumber(situpsPoints);
  addIfNumber(msrPointsTotal);

  let totalPoints: number | null = null;
  let categoryScore: number | null = null;

  if (totalComponents.length > 0) {
    const sum = totalComponents.reduce((s, v) => s + v, 0);
    totalPoints = sum;
    const ratio =
      CATEGORY_MAX_POINTS > 0 ? sum / CATEGORY_MAX_POINTS : 0;
    const rawScore = ratio * 50; // normalize to 0–50
    categoryScore = Number.isFinite(rawScore)
      ? Math.round(rawScore * 10) / 10
      : null;
  }

  // 7) Merge tests: keep all base tests (including speed_score) and append new ones
  const mergedTests = {
    ...baseTests,
    pushups_30_raw: pushupsRaw ?? null,
    pushups_30_points: pushupsPoints,
    situps_30_raw: situpsRaw ?? null,
    situps_30_points: situpsPoints,
    msr_right_raw: msrRightRaw ?? null,
    msr_left_raw: msrLeftRaw ?? null,
    msr_right_points: msrRightPoints,
    msr_left_points: msrLeftPoints,
    msr_points_total: msrPointsTotal,
  };

  return {
    categoryScore,
    breakdown: {
      ...athletic,
      tests: mergedTests,
      max_points: CATEGORY_MAX_POINTS,
      total_points: totalPoints,
    },
  };
}


/**
 * 7U HITTING
 *
 * New tests:
 *  - m_10_swing_pitch_matrix       = H10PITCH
 *  - max_bat_speed                 = HPBS (mph)
 *  - max_exit_velo_tee             = HPTEV (mph)
 *  - tee_line_drive_test_10        = HC10LD
 *
 * CONTACTSCORE%  = (HC10LD + H10PITCH) / (maxHC10LD + maxH10PITCH) * 100
 * POWERSCORE%    = (HPTEV_pts + H10PITCH + HPBS_pts) / (maxHPTEV_pts + maxH10PITCH + maxHPBS_pts) * 100
 * STRIKECHANCE%  = (1 - (CONTACTSCORE% / 90)) * 100   (then clamped 0–100)
 *
 * Category HITTING SCORE (0–50):
 *   - We use all 4 point buckets:
 *       HC10LD_pts, H10PITCH_pts, HPBS_pts, HPTEV_pts
 *   - Map their total to a 0–50 score.
 *
 * NOTE: The per-test max point values here are best-guess defaults.
 * You can adjust them to match your 7U sheet (column W) without changing the logic.
 */
function computeHittingScore(metrics: MetricMap): {
  categoryScore: number | null;
  breakdown: {
    total_points: number | null;
    max_points: number;
    tests: {
      // raw inputs
      pitch_raw: number | null;
      bat_speed_mph: number | null;
      exit_velo_mph: number | null;
      tee_ld_raw: number | null;

      // point values
      pitch_points: number | null;
      bat_speed_points: number | null;
      exit_velo_points: number | null;
      tee_ld_points: number | null;

      // derived hitting metrics
      contact_score: number | null;           // %
      power_score: number | null;            // %
      strike_chance_percent: number | null;  // %
      contact_raw_points: number | null;
      power_raw_points: number | null;
    };
  };
} {
  // Raw values
  const pitchRaw = metrics["m_10_swing_pitch_matrix"];
  const batSpeedRaw = metrics["max_bat_speed"];
  const exitVeloRaw = metrics["max_exit_velo_tee"];
  const teeLdRaw = metrics["tee_line_drive_test_10"];

  // 🔢 Per-test max points (you can tweak these to match your spreadsheet)
  const PITCH_MAX_POINTS = 20;        // H10PITCH — same as 5U/6U
  const TEE_LD_MAX_POINTS = 20;       // HC10LD — best guess, update as needed
  const BAT_SPEED_MAX_POINTS = 10;    // HPBS points (HBSPEED/5 capped)
  const EXIT_VELO_MAX_POINTS = 10;    // HPTEV points (EV/5 capped)

  const CATEGORY_MAX_POINTS =
    PITCH_MAX_POINTS + TEE_LD_MAX_POINTS + BAT_SPEED_MAX_POINTS + EXIT_VELO_MAX_POINTS;
  const CATEGORY_NORMALIZED_MAX = 50;

  // Core points
  const pitchPoints = clamp(pitchRaw, 0, PITCH_MAX_POINTS);
  const teeLdPoints = clamp(teeLdRaw, 0, TEE_LD_MAX_POINTS);

  const batSpeedMph =
    batSpeedRaw == null || typeof batSpeedRaw !== "number" || Number.isNaN(batSpeedRaw)
      ? null
      : batSpeedRaw;

  const exitVeloMph =
    exitVeloRaw == null || typeof exitVeloRaw !== "number" || Number.isNaN(exitVeloRaw)
      ? null
      : exitVeloRaw;

  let batSpeedPoints: number | null = null;
  if (batSpeedMph != null) {
    const rawPoints = batSpeedMph / 5; // 5 mph per point → 50 mph = 10 pts
    batSpeedPoints = clamp(rawPoints, 0, BAT_SPEED_MAX_POINTS);
  }

  let exitVeloPoints: number | null = null;
  if (exitVeloMph != null) {
    const rawPoints = exitVeloMph / 5; // same scaling assumption as bat speed
    exitVeloPoints = clamp(rawPoints, 0, EXIT_VELO_MAX_POINTS);
  }

  // Total points for category score
  const components: number[] = [];
  if (typeof pitchPoints === "number") components.push(pitchPoints);
  if (typeof teeLdPoints === "number") components.push(teeLdPoints);
  if (typeof batSpeedPoints === "number") components.push(batSpeedPoints);
  if (typeof exitVeloPoints === "number") components.push(exitVeloPoints);

  let totalPoints: number | null = null;
  let categoryScore: number | null = null;

  if (components.length > 0) {
    totalPoints = components.reduce((sum, v) => sum + v, 0);
    const ratio =
      CATEGORY_MAX_POINTS > 0 ? totalPoints / CATEGORY_MAX_POINTS : 0;
    const rawCategoryScore = ratio * CATEGORY_NORMALIZED_MAX;
    categoryScore = Number.isFinite(rawCategoryScore)
      ? Math.round(rawCategoryScore * 10) / 10
      : null;
  }

  // CONTACTSCORE%
  let contactRawPoints: number | null = null;
  let contactScorePercent: number | null = null;
  const CONTACT_MAX_SUM = TEE_LD_MAX_POINTS + PITCH_MAX_POINTS;

  if (teeLdPoints != null && pitchPoints != null) {
    contactRawPoints = teeLdPoints + pitchPoints;
    if (CONTACT_MAX_SUM > 0) {
      const perc = (contactRawPoints / CONTACT_MAX_SUM) * 100;
      contactScorePercent = Math.round(perc * 10) / 10;
    }
  }

  // POWERSCORE%
  let powerRawPoints: number | null = null;
  let powerScorePercent: number | null = null;
  const POWER_MAX_SUM = EXIT_VELO_MAX_POINTS + PITCH_MAX_POINTS + BAT_SPEED_MAX_POINTS;

  if (
    exitVeloPoints != null &&
    pitchPoints != null &&
    batSpeedPoints != null
  ) {
    powerRawPoints = exitVeloPoints + pitchPoints + batSpeedPoints;
    if (POWER_MAX_SUM > 0) {
      const perc = (powerRawPoints / POWER_MAX_SUM) * 100;
      powerScorePercent = Math.round(perc * 10) / 10;
    }
  }

  // STRIKEOUT CHANCE%
  let strikeChancePercent: number | null = null;
  if (contactScorePercent != null) {
    // From your earlier 5U/6U logic:
    // STRIKEOUTCHANCE = (1 - (CONTACTSCORE / 90)) * 100
    let raw = (1 - contactScorePercent / 90) * 100;
    if (!Number.isFinite(raw)) {
      raw = 0;
    }
    // clamp to [0,100]
    if (raw < 0) raw = 0;
    if (raw > 100) raw = 100;
    strikeChancePercent = Math.round(raw * 10) / 10;
  }

  return {
    categoryScore,
    breakdown: {
      total_points: totalPoints,
      max_points: CATEGORY_MAX_POINTS,
      tests: {
        // raw inputs
        pitch_raw: pitchRaw ?? null,
        bat_speed_mph: batSpeedMph,
        exit_velo_mph: exitVeloMph,
        tee_ld_raw: teeLdRaw ?? null,

        // points
        pitch_points: pitchPoints,
        bat_speed_points: batSpeedPoints,
        exit_velo_points: exitVeloPoints,
        tee_ld_points: teeLdPoints,

        // derived
        contact_score: contactScorePercent,
        power_score: powerScorePercent,
        strike_chance_percent: strikeChancePercent,
        contact_raw_points: contactRawPoints,
        power_raw_points: powerRawPoints,
      },
    },
  };
}

function computeThrowingScore(metrics: MetricMap): {
  categoryScore: number | null;
  breakdown: Record<string, unknown>;
} {
  // Raw inputs from metrics
  const t20Raw = metrics["m_10_throw_test_20ft"];          // 10-throw accuracy at 20 ft
  const t40Raw = metrics["m_10_throw_test_40ft"];          // 10-throw accuracy at 40 ft
  const speedRaw = metrics["max_throwing_speed"];          // pitch speed (40 ft) in MPH
  const smallBallRaw = metrics["max_throwing_speed_small_ball"]; // small-ball speed in MPH

  // Maxima (column W-style assumptions, consistent with 5U/6U style)
  const T20FT_MAX_POINTS = 10;
  const T40FT_MAX_POINTS = 10;
  const TSPEED40_MAX_POINTS = 10;
  const TSPEED_SMALL_MAX_POINTS = 10;

  const CATEGORY_MAX_POINTS = 40;      // 10 + 10 + 10 + 10
  const CATEGORY_NORMALIZED_MAX = 50;  // scale to 0–50 like other categories

  // Accuracy points
  const t20ftPoints = clamp(t20Raw, 0, T20FT_MAX_POINTS);
  const t40ftPoints = clamp(t40Raw, 0, T40FT_MAX_POINTS);

  // Pitch speed (40 ft) → points
  const tspeed40Mph =
    speedRaw == null || typeof speedRaw !== "number" || Number.isNaN(speedRaw)
      ? null
      : speedRaw;

  let tspeed40Points: number | null = null;
  if (tspeed40Mph != null) {
    // Same style as younger ages: mph / 4.5, capped at 10 pts (~45 mph → 10 pts)
    const rawPoints = tspeed40Mph / 4.5;
    tspeed40Points = clamp(rawPoints, 0, TSPEED40_MAX_POINTS);
  }

  // Small-ball speed → points
  const smallBallMph =
    smallBallRaw == null ||
    typeof smallBallRaw !== "number" ||
    Number.isNaN(smallBallRaw)
      ? null
      : smallBallRaw;

  let smallBallPoints: number | null = null;
  if (smallBallMph != null) {
    // Same style as younger ages: mph / 5, capped at 10 pts (~50 mph → 10 pts)
    const rawPoints = smallBallMph / 5;
    smallBallPoints = clamp(rawPoints, 0, TSPEED_SMALL_MAX_POINTS);
  }

  // Aggregate throwing points for the category score
  const components: number[] = [];
  if (typeof t20ftPoints === "number") components.push(t20ftPoints);
  if (typeof t40ftPoints === "number") components.push(t40ftPoints);
  if (typeof tspeed40Points === "number") components.push(tspeed40Points);
  if (typeof smallBallPoints === "number") components.push(smallBallPoints);

  let totalPoints: number | null = null;
  let categoryScore: number | null = null;

  if (components.length > 0) {
    totalPoints = components.reduce((sum, v) => sum + v, 0);
    const ratio =
      CATEGORY_MAX_POINTS > 0 ? totalPoints / CATEGORY_MAX_POINTS : 0;
    const rawCategoryScore = ratio * CATEGORY_NORMALIZED_MAX;
    categoryScore = Number.isFinite(rawCategoryScore)
      ? Math.round(rawCategoryScore * 10) / 10
      : null;
  }

  // 🎯 Pitching-specific percentages (these are your PITCHINGSCORE, etc.)

  // PITCHINGSCORE = (TSPEED40 + T40FT) / (max of those tests)
  let pitchScorePercent: number | null = null;
  let pitchSpeedScorePercent: number | null = null;
  let pitchAccScorePercent: number | null = null;

  const speedPointsForPitch = tspeed40Points ?? 0;
  const accPointsForPitch = t40ftPoints ?? 0;
  const pitchDen = TSPEED40_MAX_POINTS + T40FT_MAX_POINTS; // 10 + 10 = 20

  if (pitchDen > 0 && (speedPointsForPitch > 0 || accPointsForPitch > 0)) {
    const pitchRatio = (speedPointsForPitch + accPointsForPitch) / pitchDen;
    pitchScorePercent = Math.round(pitchRatio * 1000) / 10; // 1 decimal (%)
  }

  // PITCHSPEEDSCORE = TSPEED40 / max score for that test
  if (tspeed40Points != null && TSPEED40_MAX_POINTS > 0) {
    const ratio = tspeed40Points / TSPEED40_MAX_POINTS;
    pitchSpeedScorePercent = Math.round(ratio * 1000) / 10;
  }

  // PITCHACCSCORE = T40FT / max score for that test
  if (t40ftPoints != null && T40FT_MAX_POINTS > 0) {
    const ratio = t40ftPoints / T40FT_MAX_POINTS;
    pitchAccScorePercent = Math.round(ratio * 1000) / 10;
  }

  const breakdown: Record<string, unknown> = {
    max_points: CATEGORY_MAX_POINTS,
    total_points: totalPoints,
    tests: {
      // core throwing tests
      t20ft_points: t20ftPoints,
      t40ft_points: t40ftPoints,
      tspeed40_points: tspeed40Points,
      tspdsmall_points: smallBallPoints,

      t20ft_raw_points: t20Raw ?? null,
      t40ft_raw_points: t40Raw ?? null,
      tspeed40_raw_mph: tspeed40Mph,
      tspdsmall_raw_mph: smallBallMph,

      // new pitching metrics
      pitch_score_percent: pitchScorePercent,          // PITCHINGSCORE (%)
      pitch_speed_score_percent: pitchSpeedScorePercent, // PITCHSPEEDSCORE (%)
      pitch_acc_score_percent: pitchAccScorePercent,     // PITCHACCSCORE (%)
      pitch_speed_mph: tspeed40Mph,                   // raw PITCHSPEED
    },
  };

  return {
    categoryScore,
    breakdown,
  };
}


/**
 * 7U CATCHING – placeholder
 */
function computeCatchingScore(_metrics: MetricMap): {
  categoryScore: number | null;
  breakdown: Record<string, unknown>;
} {
  return {
    categoryScore: null,
    breakdown: {},
  };
}

/**
 * 7U FIELDING – placeholder
 * (Later we’ll use the new R/L/C grounders + position formulas.)
 */
function computeFieldingScore(_metrics: MetricMap): {
  categoryScore: number | null;
  breakdown: Record<string, unknown>;
} {
  return {
    categoryScore: null,
    breakdown: {},
  };
}

/**
 * Main scoring for 7U assessments.
 *
 * For now:
 *  - Hitting is fully wired (including CONTACTSCORE, POWERSCORE, STRIKECHANCE).
 *  - Athletic / Throwing / Catching / Fielding return null scores.
 *  - Overall falls back to the hitting score when others are missing.
 */
export function compute7URatings(metrics: MetricMap): RatingResult {
  const athleticResult = computeAthleticSkillsScore(metrics);
  const hittingResult = computeHittingScore(metrics);
  const throwingResult = computeThrowingScore(metrics);
  const catchingResult = computeCatchingScore(metrics);
  const fieldingResult = computeFieldingScore(metrics);

  const athletic = athleticResult.categoryScore;
  const hitting = hittingResult.categoryScore;
  const throwing = throwingResult.categoryScore;
  const catching = catchingResult.categoryScore;
  const fielding = fieldingResult.categoryScore;

  const offense = hitting;
  const defense = average([catching, fielding, throwing]);
  const pitching = throwing;
  const overall = average([athletic, offense, defense, pitching]);

  const breakdown: Record<string, unknown> = {
    athletic: athleticResult.breakdown,
    hitting: hittingResult.breakdown,
    throwing: throwingResult.breakdown,
    catching: catchingResult.breakdown,
    fielding: fieldingResult.breakdown,
  };

  return {
    // if overall is null but we at least have a hitting score, use hitting
    overall_score: overall ?? hitting ?? null,
    offense_score: offense,
    defense_score: defense,
    pitching_score: pitching,
    breakdown,
  };
}
