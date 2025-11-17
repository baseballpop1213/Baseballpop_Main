// Backend/src/scoring/5u.ts

export type MetricMap = Record<string, number | null | undefined>;

export interface RatingResult {
  overall_score: number | null;
  offense_score: number | null;
  defense_score: number | null;
  pitching_score: number | null;
  breakdown: Record<string, unknown>;
}

/**
 * Helper: average of numbers, ignoring null/undefined.
 * Returns null if there are no valid numbers.
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
 * Returns null if the input is null/undefined/NaN.
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
 * Placeholder scoring for 5U Athletic Skills.
 * TODO: implement based on spreadsheet.
 */
function computeAthleticSkillsScore(_metrics: MetricMap): {
  categoryScore: number | null;
  breakdown: Record<string, unknown>;
} {
  return {
    categoryScore: null,
    breakdown: {},
  };
}

/**
 * REAL scoring for 5U Hitting.
 *
 * Inputs:
 *  - m_10_swing_tee_contact_test: total points (H10TEE), 0–10
 *  - m_10_swing_pitch_matrix: total points (H10PITCH), 0–20
 *  - max_bat_speed: raw mph (HBSPEED)
 *
 * 5U sheet:
 *  - W18 = 10 (max tee points)
 *  - W19 = 20 (max pitch points)
 *  - W20 = 9  (max bat speed points, HBSPEED / 5 capped)
 *  - W23 = 39 (total max points)
 *  - X23 = 50 (category max)
 *  - HITSCORE = (TOTAL_POINTS / 39) * 50
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
      // future: contact_score, power_score, etc.
    };
  };
} {
  const teeRaw = metrics["m_10_swing_tee_contact_test"];
  const pitchRaw = metrics["m_10_swing_pitch_matrix"];
  const batSpeedRaw = metrics["max_bat_speed"];

  const TEE_MAX_POINTS = 10;
  const PITCH_MAX_POINTS = 20;
  const HBSPEED_MAX_POINTS = 9; // 45 mph -> 9 points

  const CATEGORY_MAX_POINTS = 39; // W23
  const CATEGORY_NORMALIZED_MAX = 50; // X23

  const teePoints = clamp(teeRaw, 0, TEE_MAX_POINTS);
  const pitchPoints = clamp(pitchRaw, 0, PITCH_MAX_POINTS);

  const batSpeedMph =
    batSpeedRaw == null || typeof batSpeedRaw !== "number" || Number.isNaN(batSpeedRaw)
      ? null
      : batSpeedRaw;

  let batSpeedPoints: number | null = null;
  if (batSpeedMph != null) {
    const rawPoints = batSpeedMph / 5; // same conversion as sheet
    const clamped = clamp(rawPoints, 0, HBSPEED_MAX_POINTS);
    batSpeedPoints = clamped;
  }

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
        },
      },
    };
  }

  const totalPoints = components.reduce((sum, v) => sum + v, 0);
  const ratio =
    CATEGORY_MAX_POINTS > 0 ? totalPoints / CATEGORY_MAX_POINTS : 0;
  const rawCategoryScore = ratio * CATEGORY_NORMALIZED_MAX;
  const categoryScore =
    Number.isFinite(rawCategoryScore)
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
      },
    },
  };
}

/**
 * REAL scoring for 5U Throwing.
 *
 * Inputs (from Supabase metrics):
 *  - max_throwing_speed: TSPEED20, best mph
 *  - max_throwing_speed_small_ball: TSPDSMALL, best mph with small ball
 *  - m_10_throw_test_20ft: T20FT, total points (0–10)
 *  - m_10_throw_test_40ft: T40FT, total points (0–10)
 *
 * 5U sheet:
 *  - TSPEED20 points = TSPEED20 / 4, capped at W24 = 40/4 = 10
 *  - TSPDSMALL points = TSPDSMALL / 5, capped at W25 = 50/5 = 10
 *  - T20FT points = T20FT, capped at 10
 *  - T40FT points = T40FT, capped at 10
 *  - W29 = 40 (total max points)
 *  - X29 = 50 (category max)
 *  - THROWSCORE_5U = (TOTAL_POINTS / 40) * 50
 */
function computeThrowingScore(metrics: MetricMap): {
  categoryScore: number | null;
  breakdown: {
    total_points: number | null;
    max_points: number;
    tests: {
      tspeed20_points: number | null;
      tspdsmall_points: number | null;
      t20ft_points: number | null;
      t40ft_points: number | null;
      tspeed20_raw_mph: number | null;
      tspdsmall_raw_mph: number | null;
      t20ft_raw_points: number | null;
      t40ft_raw_points: number | null;
    };
  };
} {
  const tspeed20Raw = metrics["max_throwing_speed"];
  const tspeedSmallRaw = metrics["max_throwing_speed_small_ball"];
  const t20ftRaw = metrics["m_10_throw_test_20ft"];
  const t40ftRaw = metrics["m_10_throw_test_40ft"];

  // Per-test max points for 5U Throwing
  const TSPEED20_MAX_POINTS = 10;   // W24 = 40/4
  const TSPDSMALL_MAX_POINTS = 10;  // W25 = 50/5
  const T20FT_MAX_POINTS = 10;      // W26
  const T40FT_MAX_POINTS = 10;      // W27

  // Category totals (row 29)
  const CATEGORY_MAX_POINTS = 40;   // W29 = 10 + 10 + 10 + 10
  const CATEGORY_NORMALIZED_MAX = 50; // X29

  // Raw values
  const tspeed20Mph =
    tspeed20Raw == null || typeof tspeed20Raw !== "number" || Number.isNaN(tspeed20Raw)
      ? null
      : tspeed20Raw;

  const tspeedSmallMph =
    tspeedSmallRaw == null || typeof tspeedSmallRaw !== "number" || Number.isNaN(tspeedSmallRaw)
      ? null
      : tspeedSmallRaw;

  const t20ftRawPts =
    t20ftRaw == null || typeof t20ftRaw !== "number" || Number.isNaN(t20ftRaw)
      ? null
      : t20ftRaw;

  const t40ftRawPts =
    t40ftRaw == null || typeof t40ftRaw !== "number" || Number.isNaN(t40ftRaw)
      ? null
      : t40ftRaw;

  // Convert to points, mirroring sheet logic
  // TSPEED20 points = mph / 4, capped at TSPEED20_MAX_POINTS
  let tspeed20Points: number | null = null;
  if (tspeed20Mph != null) {
    const rawPoints = tspeed20Mph / 4;
    tspeed20Points = clamp(rawPoints, 0, TSPEED20_MAX_POINTS);
  }

  // TSPDSMALL points = mph / 5, capped at TSPDSMALL_MAX_POINTS
  let tspeedSmallPoints: number | null = null;
  if (tspeedSmallMph != null) {
    const rawPoints = tspeedSmallMph / 5;
    tspeedSmallPoints = clamp(rawPoints, 0, TSPDSMALL_MAX_POINTS);
  }

  // 10 Throw tests use raw points directly, capped at 10
  const t20ftPoints = clamp(t20ftRawPts, 0, T20FT_MAX_POINTS);
  const t40ftPoints = clamp(t40ftRawPts, 0, T40FT_MAX_POINTS);

  const components: number[] = [];
  if (typeof tspeed20Points === "number") components.push(tspeed20Points);
  if (typeof tspeedSmallPoints === "number") components.push(tspeedSmallPoints);
  if (typeof t20ftPoints === "number") components.push(t20ftPoints);
  if (typeof t40ftPoints === "number") components.push(t40ftPoints);

  if (components.length === 0) {
    return {
      categoryScore: null,
      breakdown: {
        total_points: null,
        max_points: CATEGORY_MAX_POINTS,
        tests: {
          tspeed20_points: tspeed20Points,
          tspdsmall_points: tspeedSmallPoints,
          t20ft_points: t20ftPoints,
          t40ft_points: t40ftPoints,
          tspeed20_raw_mph: tspeed20Mph,
          tspdsmall_raw_mph: tspeedSmallMph,
          t20ft_raw_points: t20ftRawPts,
          t40ft_raw_points: t40ftRawPts,
        },
      },
    };
  }

  const totalPoints = components.reduce((sum, v) => sum + v, 0);

  const ratio =
    CATEGORY_MAX_POINTS > 0 ? totalPoints / CATEGORY_MAX_POINTS : 0;
  const rawCategoryScore = ratio * CATEGORY_NORMALIZED_MAX;
  const categoryScore =
    Number.isFinite(rawCategoryScore)
      ? Math.round(rawCategoryScore * 10) / 10
      : null;

  return {
    categoryScore,
    breakdown: {
      total_points: totalPoints,
      max_points: CATEGORY_MAX_POINTS,
      tests: {
        tspeed20_points: tspeed20Points,
        tspdsmall_points: tspeedSmallPoints,
        t20ft_points: t20ftPoints,
        t40ft_points: t40ftPoints,
        tspeed20_raw_mph: tspeed20Mph,
        tspdsmall_raw_mph: tspeedSmallMph,
        t20ft_raw_points: t20ftRawPts,
        t40ft_raw_points: t40ftRawPts,
      },
    },
  };
}


/**
 * Placeholder scoring for 5U Catching.
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
 * Placeholder scoring for 5U Fielding.
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
 * Main scoring for 5U assessments.
 */
export function compute5URatings(metrics: MetricMap): RatingResult {
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

  const offense = hitting; // for now
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
