// Backend/src/scoring/5u6u.ts

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
 * Normalize a value to [0, 1] given a max.
 */
function normalize(value: number | null, max: number): number | null {
  if (value == null) return null;
  if (max <= 0) return null;
  return value / max;
}

/**
 * Placeholder scoring for 5U-6U Athletic Skills.
 * TODO: implement based on spreadsheet.
 */
function computeAthleticSkillsScore(_metrics: MetricMap): number | null {
  return null;
}

/**
 * REAL scoring for 5U-6U Hitting.
 *
 * Inputs (from Supabase metrics):
 *  - m_10_swing_tee_contact_test: 0–20 points (10 swings total)
 *  - m_10_swing_pitch_matrix: 0–20 points (10 swings total)
 *  - max_bat_speed: raw mph
 *
 * For 5U:
 *  - Age-calibrated max bat speed for 100% score = 45 mph.
 *  - Category total normalized to 0–50 points.
 */
function computeHittingScore(metrics: MetricMap): number | null {
  const teeRaw = metrics["m_10_swing_tee_contact_test"];
  const pitchRaw = metrics["m_10_swing_pitch_matrix"];
  const batSpeedRaw = metrics["max_bat_speed"];

  // Clamp to expected ranges from the spec
  const teePoints = clamp(teeRaw, 0, 20);   // 0–20 total points
  const pitchPoints = clamp(pitchRaw, 0, 20); // 0–20 total points

  // For 5U scoring: treat 45 mph as "perfect".
  // If they swing faster than 45, we still cap the score at the 5U max.
  const BAT_SPEED_5U_MAX = 45;
  const batSpeed = clamp(batSpeedRaw, 0, BAT_SPEED_5U_MAX);

  // Normalize each component to [0, 1]
  const teeScore = normalize(teePoints, 20);
  const pitchScore = normalize(pitchPoints, 20);
  const batSpeedScore = normalize(batSpeed, BAT_SPEED_5U_MAX);

  // Average all available components (ignore missing/null)
  const components = [teeScore, pitchScore, batSpeedScore].filter(
    (v): v is number => typeof v === "number" && !Number.isNaN(v)
  );
  if (components.length === 0) return null;

  const avg = components.reduce((sum, v) => sum + v, 0) / components.length;

  // Scale to category max (50 points total for Hitting in the spec)
  const CATEGORY_MAX = 50;
  const rawScore = avg * CATEGORY_MAX;

  // Round to 1 decimal place for nicer display
  const finalScore = Math.round(rawScore * 10) / 10;
  return finalScore;
}

/**
 * Placeholder scoring for 5U-6U Throwing.
 * TODO: implement based on spreadsheet.
 */
function computeThrowingScore(_metrics: MetricMap): number | null {
  return null;
}

/**
 * Placeholder scoring for 5U-6U Catching.
 * TODO: implement based on spreadsheet.
 */
function computeCatchingScore(_metrics: MetricMap): number | null {
  return null;
}

/**
 * Placeholder scoring for 5U-6U Fielding.
 * TODO: implement based on spreadsheet.
 */
function computeFieldingScore(_metrics: MetricMap): number | null {
  return null;
}

/**
 * Main scoring function for 5U-6U assessments.
 * For now:
 *  - offense_score = hitting score
 *  - overall_score = average of available category scores
 *    (currently mostly hitting, until we implement others)
 */
export function compute5U6URatings(metrics: MetricMap): RatingResult {
  const athletic = computeAthleticSkillsScore(metrics);
  const hitting = computeHittingScore(metrics);
  const throwing = computeThrowingScore(metrics);
  const catching = computeCatchingScore(metrics);
  const fielding = computeFieldingScore(metrics);

  const offense = hitting; // for 5U-6U, offense = hitting for now
  const defense = average([catching, fielding, throwing]);
  const pitching = throwing; // later we may split pitching-specific
  const overall = average([athletic, offense, defense, pitching]);

  const breakdown: Record<string, unknown> = {
    athletic,
    hitting,
    throwing,
    catching,
    fielding,
  };

  return {
    overall_score: overall ?? hitting ?? null, // fallback to hitting if others null
    offense_score: offense,
    defense_score: defense,
    pitching_score: pitching,
    breakdown,
  };
}
