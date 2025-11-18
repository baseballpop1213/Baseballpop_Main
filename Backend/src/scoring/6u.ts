// Backend/src/scoring/6u.ts

import type { MetricMap, RatingResult } from "./5u";

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

function computeAthleticSkillsScore(metrics: MetricMap): {
  categoryScore: number | null;
  breakdown: Record<string, unknown>;
} {
  // ---- CONSTANTS (6U) ----
  const RUN_1B_MAX_POINTS = 30;   // 6U: 1B speed max points
  const RUN_4B_MAX_POINTS = 35;   // 6U: 4B speed max points
  const SLS_OPEN_MAX_POINTS = 10;
  const SLS_CLOSED_MAX_POINTS = 10;
  const TOE_TOUCH_MAX_POINTS = 10;
  const DEEP_SQUAT_MAX_POINTS = 10;

  // Total category "raw" max:
  // 30 (1B) + 35 (4B) + 10 (SLS open) + 10 (toe) + 10 (deep squat) + 10 (SLS closed) = 105
  const CATEGORY_MAX_POINTS = 105;

  // Speed sub-category max (for SPEEDSCORE % → 0–50)
  const SPEED_POINTS_MAX_TOTAL = RUN_1B_MAX_POINTS + RUN_4B_MAX_POINTS; // 65

  // ---- RAW INPUTS FROM METRICS ----
  const run1bRaw = metrics["timed_run_1b"];
  const run4bRaw = metrics["timed_run_4b"];

  const slsOpenRightRaw = metrics["sls_eyes_open_right"];
  const slsOpenLeftRaw = metrics["sls_eyes_open_left"];
  const slsClosedRightRaw = metrics["sls_eyes_closed_right"];
  const slsClosedLeftRaw = metrics["sls_eyes_closed_left"];

  const toeTouchRaw = metrics["toe_touch"];
  const deepSquatRaw = metrics["deep_squat"];

  const run1bFps =
    typeof run1bRaw === "number" && !Number.isNaN(run1bRaw)
      ? run1bRaw
      : null;
  const run4bFps =
    typeof run4bRaw === "number" && !Number.isNaN(run4bRaw)
      ? run4bRaw
      : null;

  const slsOpenRightSeconds =
    typeof slsOpenRightRaw === "number" && !Number.isNaN(slsOpenRightRaw)
      ? slsOpenRightRaw
      : null;
  const slsOpenLeftSeconds =
    typeof slsOpenLeftRaw === "number" && !Number.isNaN(slsOpenLeftRaw)
      ? slsOpenLeftRaw
      : null;

  const slsClosedRightSeconds =
    typeof slsClosedRightRaw === "number" && !Number.isNaN(slsClosedRightRaw)
      ? slsClosedRightRaw
      : null;
  const slsClosedLeftSeconds =
    typeof slsClosedLeftRaw === "number" && !Number.isNaN(slsClosedLeftRaw)
      ? slsClosedLeftRaw
      : null;

  const toeTouchRawPoints =
    typeof toeTouchRaw === "number" && !Number.isNaN(toeTouchRaw)
      ? clamp(toeTouchRaw, 0, TOE_TOUCH_MAX_POINTS)
      : null;

  const deepSquatRawPoints =
    typeof deepSquatRaw === "number" && !Number.isNaN(deepSquatRaw)
      ? clamp(deepSquatRaw, 0, DEEP_SQUAT_MAX_POINTS)
      : null;

  // ---- POINTS: SPEED (1B, 4B) ----
  let run1bPoints: number | null = null;
  if (run1bFps != null) {
    const raw = (run1bFps - 7) * 3;
    run1bPoints = clamp(raw, 0, RUN_1B_MAX_POINTS);
  }

  let run4bPoints: number | null = null;
  if (run4bFps != null) {
    const raw = (run4bFps - 7) * 3;
    run4bPoints = clamp(raw, 0, RUN_4B_MAX_POINTS);
  }

  // ---- POINTS: SLS OPEN / CLOSED ----
  const slsOpenAvgSeconds = average([slsOpenRightSeconds, slsOpenLeftSeconds]);
  let slsOpenPoints: number | null = null;
  if (slsOpenAvgSeconds != null) {
    // Same as 5U: up to 30s = full 10 points
    const raw = (slsOpenAvgSeconds / 30) * SLS_OPEN_MAX_POINTS;
    slsOpenPoints = clamp(raw, 0, SLS_OPEN_MAX_POINTS);
  }

  const slsClosedAvgSeconds = average([
    slsClosedRightSeconds,
    slsClosedLeftSeconds,
  ]);
  let slsClosedPoints: number | null = null;
  if (slsClosedAvgSeconds != null) {
    // Same as 5U: up to 20s = full 10 points
    const raw = (slsClosedAvgSeconds / 20) * SLS_CLOSED_MAX_POINTS;
    slsClosedPoints = clamp(raw, 0, SLS_CLOSED_MAX_POINTS);
  }

  // ---- POINTS: TOE TOUCH / DEEP SQUAT ----
  const toeTouchPoints = toeTouchRawPoints;
  const deepSquatPoints = deepSquatRawPoints;

  // ---- SPEED SCORE (sub-metric) ----
  let speedPointsTotal: number | null = null;
  let speedScore: number | null = null;

  const speedParts: number[] = [];
  let speedMaxUsed = 0;

  if (run1bPoints != null) {
    speedParts.push(run1bPoints);
    speedMaxUsed += RUN_1B_MAX_POINTS;
  }
  if (run4bPoints != null) {
    speedParts.push(run4bPoints);
    speedMaxUsed += RUN_4B_MAX_POINTS;
  }

  if (speedParts.length > 0 && speedMaxUsed > 0) {
    const sum = speedParts.reduce((acc, v) => acc + v, 0);
    speedPointsTotal = sum;
    const ratio = sum / speedMaxUsed; // 0–1
    speedScore = Math.round(ratio * 50 * 10) / 10; // 0–50, 1 decimal
  }

  // ---- TOTAL CATEGORY POINTS ----
  const toSum: Array<number | null> = [
    run1bPoints,
    run4bPoints,
    slsOpenPoints,
    toeTouchPoints,
    deepSquatPoints,
    slsClosedPoints,
  ];

  const present = toSum.filter(
    (v): v is number => typeof v === "number" && !Number.isNaN(v)
  );
  const totalPoints =
    present.length > 0
      ? present.reduce((acc, v) => acc + v, 0)
      : null;

  let categoryScore: number | null = null;
  if (totalPoints != null) {
    const ratio = totalPoints / CATEGORY_MAX_POINTS; // relative to full 105
    const rawScore = ratio * 50; // normalize to 0–50
    categoryScore = Math.round(rawScore * 10) / 10;
  }

  return {
    categoryScore,
    breakdown: {
      max_points: CATEGORY_MAX_POINTS,
      total_points: totalPoints,
      tests: {
        run_1b_fps: run1bFps,
        run_4b_fps: run4bFps,
        speed_score: speedScore,
        speed_points_total: speedPointsTotal,

        run_1b_points: run1bPoints,
        run_4b_points: run4bPoints,

        sls_open_points: slsOpenPoints,
        sls_closed_points: slsClosedPoints,

        toe_touch_points: toeTouchPoints,
        deep_squat_points: deepSquatPoints,

        sls_open_avg_seconds: slsOpenAvgSeconds,
        sls_closed_avg_seconds: slsClosedAvgSeconds,

        sls_open_left_seconds: slsOpenLeftSeconds,
        sls_open_right_seconds: slsOpenRightSeconds,
        sls_closed_left_seconds: slsClosedLeftSeconds,
        sls_closed_right_seconds: slsClosedRightSeconds,

        toe_touch_raw_points: toeTouchRawPoints,
        deep_squat_raw_points: deepSquatRawPoints,
      },
    },
  };
}


/**
 * REAL scoring for 6U Hitting.
 *
 * 6U sheet (AR column):
 *  - AR18 = 10 (max tee points)
 *  - AR19 = 20 (max pitch points)
 *  - AR20 = 10 (max bat speed points, HBSPEED/5 capped at 10)
 *  - AR23 = 40 (TOTAL_POINTS max)
 *  - X23  = 50 (category normalized max is 50)
 *
 * CONTACTSCORE_6U (%):
 *   based on (tee_points + pitch_points) vs (TEE_MAX_POINTS + PITCH_MAX_POINTS)
 *
 * POWERSCORE_6U (%):
 *   based on (pitch_points + bat_speed_points) vs (PITCH_MAX_POINTS + HBSPEED_MAX_POINTS)
 *
 * STRIKEOUTCHANCE_6U (%):
 *   uses your "divide by 90" idea:
 *     strike = (1 - CONTACTSCORE/90) * 100, clamped to [0,100]
 */
function computeHittingScore(metrics: MetricMap): {
  categoryScore: number | null;
  breakdown: {
    total_points: number | null;
    max_points: number;
    tests: {
      tee_points: number | null;
      pitch_points: number | null;
      bat_speed_points: number | null;
      tee_raw: number | null;
      pitch_raw: number | null;
      bat_speed_mph: number | null;

      contact_raw_points: number | null;
      contact_score: number | null; // %
      power_raw_points: number | null;
      power_score: number | null;   // %
      strike_chance_percent: number | null;
    };
  };
} {
  const teeRaw = metrics["m_10_swing_tee_contact_test"];
  const pitchRaw = metrics["m_10_swing_pitch_matrix"];
  const batSpeedRaw = metrics["max_bat_speed"];

  const TEE_MAX_POINTS = 10;
  const PITCH_MAX_POINTS = 20;
  const HBSPEED_MAX_POINTS = 10; // 50 mph -> 10 points

  const CATEGORY_MAX_POINTS = 40; // AR23
  const CATEGORY_NORMALIZED_MAX = 50;

  // Base points
  const teePoints = clamp(teeRaw, 0, TEE_MAX_POINTS);
  const pitchPoints = clamp(pitchRaw, 0, PITCH_MAX_POINTS);

  const batSpeedMph =
    batSpeedRaw == null || typeof batSpeedRaw !== "number" || Number.isNaN(batSpeedRaw)
      ? null
      : batSpeedRaw;

  let batSpeedPoints: number | null = null;
  if (batSpeedMph != null) {
    const rawPoints = batSpeedMph / 5;
    const clamped = clamp(rawPoints, 0, HBSPEED_MAX_POINTS);
    batSpeedPoints = clamped;
  }

  // Contact & Power raw points
  const hasTee = typeof teePoints === "number";
  const hasPitch = typeof pitchPoints === "number";
  const hasBat = typeof batSpeedPoints === "number";

  const contactRawPoints =
    hasTee || hasPitch
      ? (hasTee ? teePoints! : 0) + (hasPitch ? pitchPoints! : 0)
      : null;
  const contactMaxPoints = TEE_MAX_POINTS + PITCH_MAX_POINTS; // 30

  let contactScore: number | null = null;
  if (contactRawPoints != null && contactMaxPoints > 0) {
    const ratio = contactRawPoints / contactMaxPoints;
    const pct = Math.max(0, Math.min(1, ratio)) * 100;
    contactScore = Math.round(pct * 10) / 10; // 1 decimal %
  }

  const powerRawPoints =
    hasPitch || hasBat
      ? (hasPitch ? pitchPoints! : 0) + (hasBat ? batSpeedPoints! : 0)
      : null;
  const powerMaxPoints = PITCH_MAX_POINTS + HBSPEED_MAX_POINTS; // 30

  let powerScore: number | null = null;
  if (powerRawPoints != null && powerMaxPoints > 0) {
    const ratio = powerRawPoints / powerMaxPoints;
    const pct = Math.max(0, Math.min(1, ratio)) * 100;
    powerScore = Math.round(pct * 10) / 10; // 1 decimal %
  }

  // Strikeout chance (%), using your (1 - CONTACTSCORE/90) model
  let strikeChancePercent: number | null = null;
  if (contactScore != null) {
    const clampedContact = Math.max(0, Math.min(100, contactScore));
    const rawStrike = (1 - clampedContact / 90) * 100;
    const clampedStrike = Math.max(0, Math.min(100, rawStrike));
    strikeChancePercent = Math.round(clampedStrike * 10) / 10;
  }

  // Category total & normalized score
  const components: number[] = [];
  if (typeof teePoints === "number") components.push(teePoints);
  if (typeof pitchPoints === "number") components.push(pitchPoints);
  if (typeof batSpeedPoints === "number") components.push(batSpeedPoints);

  if (components.length === 0) {
    return {
      categoryScore: null,
      breakdown: {
        total_points: null,
        max_points: CATEGORY_MAX_POINTS,
        tests: {
          tee_points: teePoints,
          pitch_points: pitchPoints,
          bat_speed_points: batSpeedPoints,
          tee_raw: teeRaw ?? null,
          pitch_raw: pitchRaw ?? null,
          bat_speed_mph: batSpeedMph,

          contact_raw_points: contactRawPoints,
          contact_score: contactScore,
          power_raw_points: powerRawPoints,
          power_score: powerScore,
          strike_chance_percent: strikeChancePercent,
        },
      },
    };
  }

  const totalPoints = components.reduce((sum, v) => sum + v, 0);
  const ratio = CATEGORY_MAX_POINTS > 0 ? totalPoints / CATEGORY_MAX_POINTS : 0;
  const rawCategoryScore = ratio * CATEGORY_NORMALIZED_MAX;
  const categoryScore = Number.isFinite(rawCategoryScore)
    ? Math.round(rawCategoryScore * 10) / 10
    : null;

  return {
    categoryScore,
    breakdown: {
      total_points: totalPoints,
      max_points: CATEGORY_MAX_POINTS,
      tests: {
        tee_points: teePoints,
        pitch_points: pitchPoints,
        bat_speed_points: batSpeedPoints,
        tee_raw: teeRaw ?? null,
        pitch_raw: pitchRaw ?? null,
        bat_speed_mph: batSpeedMph,

        contact_raw_points: contactRawPoints,
        contact_score: contactScore,
        power_raw_points: powerRawPoints,
        power_score: powerScore,
        strike_chance_percent: strikeChancePercent,
      },
    },
  };
}

function computeThrowingScore(metrics: MetricMap): {
  categoryScore: number | null;
  breakdown: {
    max_points: number;
    total_points: number | null;
    tests: {
      t20ft_points: number | null;
      t40ft_points: number | null;
      tspeed20_points: number | null;
      tspdsmall_points: number | null;
      t20ft_raw_points: number | null;
      t40ft_raw_points: number | null;
      tspeed20_raw_mph: number | null;
      tspdsmall_raw_mph: number | null;
    };
  };
} {
  // ---- CONSTANTS (6U Throwing) ----
  const T20FT_MAX_POINTS = 10;
  const T40FT_MAX_POINTS = 10;
  const TSPEED20_MAX_POINTS = 10;
  const TSPD_SMALL_MAX_POINTS = 10;

  const TSPEED20_MAX_MPH_6U = 45; // 6U: TSPEED20 mph cap
  const TSPD_SMALL_MAX_MPH = 50;  // 6U: small ball cap (same as 5U)

  const CATEGORY_MAX_POINTS = 40;      // 10 + 10 + 10 + 10
  const CATEGORY_NORMALIZED_MAX = 50;  // normalize to 0–50

  // ---- RAW INPUTS ----
  const tspeed20Raw = metrics["max_throwing_speed"];
  const tspeedSmallRaw = metrics["max_throwing_speed_small_ball"];
  const t20ftRaw = metrics["m_10_throw_test_20ft"];
  const t40ftRaw = metrics["m_10_throw_test_40ft"];

  const tspeed20Mph =
    typeof tspeed20Raw === "number" && !Number.isNaN(tspeed20Raw)
      ? tspeed20Raw
      : null;

  const tspeedSmallMph =
    typeof tspeedSmallRaw === "number" && !Number.isNaN(tspeedSmallRaw)
      ? tspeedSmallRaw
      : null;

  const t20ftRawPoints =
    typeof t20ftRaw === "number" && !Number.isNaN(t20ftRaw)
      ? t20ftRaw
      : null;

  const t40ftRawPoints =
    typeof t40ftRaw === "number" && !Number.isNaN(t40ftRaw)
      ? t40ftRaw
      : null;

  // ---- POINTS: 10-THROW TESTS ----
  const t20ftPoints =
    t20ftRawPoints != null ? clamp(t20ftRawPoints, 0, T20FT_MAX_POINTS) : null;

  const t40ftPoints =
    t40ftRawPoints != null ? clamp(t40ftRawPoints, 0, T40FT_MAX_POINTS) : null;

  // ---- POINTS: SPEED (mph → points) ----
  let tspeed20Points: number | null = null;
  if (tspeed20Mph != null) {
    const rawPoints = (tspeed20Mph / TSPEED20_MAX_MPH_6U) * TSPEED20_MAX_POINTS;
    tspeed20Points = clamp(rawPoints, 0, TSPEED20_MAX_POINTS);
  }

  let tspdsmallPoints: number | null = null;
  if (tspeedSmallMph != null) {
    const rawPoints =
      (tspeedSmallMph / TSPD_SMALL_MAX_MPH) * TSPD_SMALL_MAX_POINTS;
    tspdsmallPoints = clamp(rawPoints, 0, TSPD_SMALL_MAX_POINTS);
  }

  // ---- TOTAL CATEGORY POINTS ----
  const parts: Array<number | null> = [
    t20ftPoints,
    t40ftPoints,
    tspeed20Points,
    tspdsmallPoints,
  ];

  const present = parts.filter(
    (v): v is number => typeof v === "number" && !Number.isNaN(v)
  );

  const totalPoints =
    present.length > 0
      ? present.reduce((acc, v) => acc + v, 0)
      : null;

  let categoryScore: number | null = null;
  if (totalPoints != null) {
    const ratio = totalPoints / CATEGORY_MAX_POINTS; // 0–1
    const rawScore = ratio * CATEGORY_NORMALIZED_MAX;
    categoryScore = Math.round(rawScore * 10) / 10; // 0–50
  }

  return {
    categoryScore,
    breakdown: {
      max_points: CATEGORY_MAX_POINTS,
      total_points: totalPoints,
      tests: {
        t20ft_points: t20ftPoints,
        t40ft_points: t40ftPoints,
        tspeed20_points: tspeed20Points,
        tspdsmall_points: tspdsmallPoints,
        t20ft_raw_points: t20ftRawPoints,
        t40ft_raw_points: t40ftRawPoints,
        tspeed20_raw_mph: tspeed20Mph,
        tspdsmall_raw_mph: tspeedSmallMph,
      },
    },
  };
}


function computeCatchingScore(metrics: MetricMap): {
  categoryScore: number | null;
  breakdown: {
    max_points: number;
    total_points: number | null;
    tests: {
      c20ft_points: number | null;
      c40ft_points: number | null;
      c20ft_raw_points: number | null;
      c40ft_raw_points: number | null;
    };
  };
} {
  const C20FT_MAX_POINTS = 10;
  const C40FT_MAX_POINTS = 10;

  const CATEGORY_MAX_POINTS = 20;      // 10 + 10
  const CATEGORY_NORMALIZED_MAX = 50;  // normalize to 0–50

  // ---- RAW INPUTS ----
  const c20Raw = metrics["m_20ft_catching_test"];
  const c40Raw = metrics["m_40_ft_catching_test"];

  const c20RawPoints =
    typeof c20Raw === "number" && !Number.isNaN(c20Raw) ? c20Raw : null;

  const c40RawPoints =
    typeof c40Raw === "number" && !Number.isNaN(c40Raw) ? c40Raw : null;

  // ---- POINTS ----
  const c20ftPoints =
    c20RawPoints != null ? clamp(c20RawPoints, 0, C20FT_MAX_POINTS) : null;

  const c40ftPoints =
    c40RawPoints != null ? clamp(c40RawPoints, 0, C40FT_MAX_POINTS) : null;

  // ---- TOTAL POINTS ----
  const parts: Array<number | null> = [c20ftPoints, c40ftPoints];

  const present = parts.filter(
    (v): v is number => typeof v === "number" && !Number.isNaN(v)
  );

  const totalPoints =
    present.length > 0
      ? present.reduce((acc, v) => acc + v, 0)
      : null;

  let categoryScore: number | null = null;
  if (totalPoints != null) {
    const ratio = totalPoints / CATEGORY_MAX_POINTS; // 0–1
    const rawScore = ratio * CATEGORY_NORMALIZED_MAX;
    categoryScore = Math.round(rawScore * 10) / 10; // 0–50
  }

  return {
    categoryScore,
    breakdown: {
      max_points: CATEGORY_MAX_POINTS,
      total_points: totalPoints,
      tests: {
        c20ft_points: c20ftPoints,
        c40ft_points: c40ftPoints,
        c20ft_raw_points: c20RawPoints,
        c40ft_raw_points: c40RawPoints,
      },
    },
  };
}


function computeFieldingScore(metrics: MetricMap): {
  categoryScore: number | null;
  breakdown: {
    max_points: number;
    total_points: number | null;
    tests: {
      f2b_points: number | null;
      f3b_points: number | null;
      fss_points: number | null;
      fpitcher_points: number | null;
      f2b_raw_points: number | null;
      f3b_raw_points: number | null;
      fss_raw_points: number | null;
      fpitcher_raw_points: number | null;
    };
  };
} {
  // Assuming same rubric maxes as 5U; adjust if your 6U AR column differs
  const F2B_MAX_POINTS = 6;
  const FSS_MAX_POINTS = 6;
  const F3B_MAX_POINTS = 6;
  const FPITCHER_MAX_POINTS = 6;

  const CATEGORY_MAX_POINTS =
    F2B_MAX_POINTS + FSS_MAX_POINTS + F3B_MAX_POINTS + FPITCHER_MAX_POINTS; // 24
  const CATEGORY_NORMALIZED_MAX = 50;

  // ---- RAW INPUTS ----
  const f2bRaw = metrics["grounders_2b"];
  const fssRaw = metrics["grounders_ss"];
  const f3bRaw = metrics["grounders_3b"];
  const fpitcherRaw = metrics["grounders_pitcher"];

  const f2bRawPoints =
    typeof f2bRaw === "number" && !Number.isNaN(f2bRaw) ? f2bRaw : null;

  const fssRawPoints =
    typeof fssRaw === "number" && !Number.isNaN(fssRaw) ? fssRaw : null;

  const f3bRawPoints =
    typeof f3bRaw === "number" && !Number.isNaN(f3bRaw) ? f3bRaw : null;

  const fpitcherRawPoints =
    typeof fpitcherRaw === "number" && !Number.isNaN(fpitcherRaw)
      ? fpitcherRaw
      : null;

  // ---- POINTS (clamped to rubric max) ----
  const f2bPoints =
    f2bRawPoints != null ? clamp(f2bRawPoints, 0, F2B_MAX_POINTS) : null;

  const fssPoints =
    fssRawPoints != null ? clamp(fssRawPoints, 0, FSS_MAX_POINTS) : null;

  const f3bPoints =
    f3bRawPoints != null ? clamp(f3bRawPoints, 0, F3B_MAX_POINTS) : null;

  const fpitcherPoints =
    fpitcherRawPoints != null
      ? clamp(fpitcherRawPoints, 0, FPITCHER_MAX_POINTS)
      : null;

  // ---- TOTAL POINTS ----
  const parts: Array<number | null> = [
    f2bPoints,
    fssPoints,
    f3bPoints,
    fpitcherPoints,
  ];

  const present = parts.filter(
    (v): v is number => typeof v === "number" && !Number.isNaN(v)
  );

  const totalPoints =
    present.length > 0
      ? present.reduce((acc, v) => acc + v, 0)
      : null;

  let categoryScore: number | null = null;
  if (totalPoints != null) {
    const ratio =
      CATEGORY_MAX_POINTS > 0 ? totalPoints / CATEGORY_MAX_POINTS : 0;
    const rawScore = ratio * CATEGORY_NORMALIZED_MAX;
    categoryScore = Math.round(rawScore * 10) / 10; // 0–50
  }

  return {
    categoryScore,
    breakdown: {
      max_points: CATEGORY_MAX_POINTS,
      total_points: totalPoints,
      tests: {
        f2b_points: f2bPoints,
        f3b_points: f3bPoints,
        fss_points: fssPoints,
        fpitcher_points: fpitcherPoints,
        f2b_raw_points: f2bRawPoints,
        f3b_raw_points: f3bRawPoints,
        fss_raw_points: fssRawPoints,
        fpitcher_raw_points: fpitcherRawPoints,
      },
    },
  };
}


/**
 * Main scoring for 6U assessments.
 */
export function compute6URatings(metrics: MetricMap): RatingResult {
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
    overall_score: overall ?? hitting ?? null,
    offense_score: offense,
    defense_score: defense,
    pitching_score: pitching,
    breakdown,
  };
}
