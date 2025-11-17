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
 * Placeholder scoring for 5U-6U Athletic Skills.
 * For now this is a stub; we’ll replace the logic with your Excel formulas.
 */
function computeAthleticSkillsScore(metrics: MetricMap): number | null {
  // Examples of metrics we have available (per Supabase setup):
  // timed_run_1b, timed_run_4b,
  // sls_eyes_open_right, sls_eyes_open_left,
  // sls_eyes_closed_right, sls_eyes_closed_left,
  // toe_touch, deep_squat

  // TODO: implement real logic based on Excel ranges.
  // For now, return null to indicate “not computed yet”.
  return null;
}

/**
 * Placeholder scoring for 5U-6U Hitting.
 */
function computeHittingScore(metrics: MetricMap): number | null {
  // m_10_swing_tee_contact_test
  // m_10_swing_pitch_matrix
  // max_bat_speed

  // TODO: implement real logic based on Excel (e.g., BPOPHITSCORE).
  return null;
}

/**
 * Placeholder scoring for 5U-6U Throwing.
 */
function computeThrowingScore(metrics: MetricMap): number | null {
  // max_throwing_speed
  // max_throwing_speed_small_ball
  // m_10_throw_test_20ft
  // m_10_throw_test_40ft

  // TODO: implement logic based on TSPEED, TSPDSMALL, T20FT, T40FT, etc.
  return null;
}

/**
 * Placeholder scoring for 5U-6U Catching.
 */
function computeCatchingScore(metrics: MetricMap): number | null {
  // m_20ft_catching_test
  // m_40_ft_catching_test

  // TODO: implement logic based on C20FT, C40FT and derived scores in Excel.
  return null;
}

/**
 * Placeholder scoring for 5U-6U Fielding.
 */
function computeFieldingScore(metrics: MetricMap): number | null {
  // grounders_2b, grounders_ss, grounders_3b, grounders_pitcher

  // TODO: implement logic based on FG2B, FGSS, FG3B, FGP etc.
  return null;
}

/**
 * Main scoring function for 5U-6U assessments.
 * This is where we’ll mirror your Excel logic (overall, offense, defense, pitching).
 */
export function compute5U6URatings(metrics: MetricMap): RatingResult {
  const athletic = computeAthleticSkillsScore(metrics);
  const hitting = computeHittingScore(metrics);
  const throwing = computeThrowingScore(metrics);
  const catching = computeCatchingScore(metrics);
  const fielding = computeFieldingScore(metrics);

  // Very rough structure for now:
  // - offense ~ hitting (later + speed)
  // - defense ~ catching + fielding (and maybe throwing)
  // - pitching ~ subset of throwing
  // These are placeholders; the weights will be replaced by your Excel logic.

  const offense = hitting; // TODO: incorporate speed/throwing if desired
  const defense = average([catching, fielding, throwing]);
  const pitching = throwing; // TODO: refine based on pitching-specific parts
  const overall = average([offense, defense, pitching, athletic]);

  const breakdown: Record<string, unknown> = {
    athletic,
    hitting,
    throwing,
    catching,
    fielding,
  };

  return {
    overall_score: overall,
    offense_score: offense,
    defense_score: defense,
    pitching_score: pitching,
    breakdown,
  };
}
