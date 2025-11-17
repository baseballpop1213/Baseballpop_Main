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
 * Placeholder scoring for 5U Throwing.
 */
function computeThrowingScore(_metrics: MetricMap): {
  categoryScore: number | null;
  breakdown: Record<string, unknown>;
} {
  return {
    categoryScore: null,
    breakdown: {},
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
