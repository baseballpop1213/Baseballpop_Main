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

function computeAthleticSkillsScore(metrics: MetricMap): {
  categoryScore: number | null;
  breakdown: {
    total_points: number | null;
    max_points: number;
    tests: {
      run_1b_points: number | null;
      run_4b_points: number | null;
      sls_open_points: number | null;
      sls_closed_points: number | null;
      toe_touch_points: number | null;
      deep_squat_points: number | null;

      run_1b_fps: number | null;
      run_4b_fps: number | null;
      sls_open_right_seconds: number | null;
      sls_open_left_seconds: number | null;
      sls_open_avg_seconds: number | null;
      sls_closed_right_seconds: number | null;
      sls_closed_left_seconds: number | null;
      sls_closed_avg_seconds: number | null;
      toe_touch_raw_points: number | null;
      deep_squat_raw_points: number | null;

      // NEW:
      speed_points_total: number | null;
      speed_score: number | null; // 0–50
    };
  };
} {
  // Raw metrics
  const run1bFpsRaw = metrics["timed_run_1b"];
  const run4bFpsRaw = metrics["timed_run_4b"];

  const slsOpenRightRaw = metrics["sls_eyes_open_right"];
  const slsOpenLeftRaw = metrics["sls_eyes_open_left"];
  const slsClosedRightRaw = metrics["sls_eyes_closed_right"];
  const slsClosedLeftRaw = metrics["sls_eyes_closed_left"];

  const toeTouchRaw = metrics["toe_touch"];
  const deepSquatRaw = metrics["deep_squat"];

  const RUN_1B_MAX_POINTS = 20;     // W5
  const RUN_4B_MAX_POINTS = 25;     // W7
  const SLS_OPEN_MAX_POINTS = 10;   // W11
  const SLS_CLOSED_MAX_POINTS = 15; // W12
  const TOE_TOUCH_MAX_POINTS = 6;   // W14
  const DEEP_SQUAT_MAX_POINTS = 9;  // W15

  const CATEGORY_MAX_POINTS = 85;     // W17
  const CATEGORY_NORMALIZED_MAX = 50; // X17

  const run1bFps =
    run1bFpsRaw == null || typeof run1bFpsRaw !== "number" || Number.isNaN(run1bFpsRaw)
      ? null
      : run1bFpsRaw;

  const run4bFps =
    run4bFpsRaw == null || typeof run4bFpsRaw !== "number" || Number.isNaN(run4bFpsRaw)
      ? null
      : run4bFpsRaw;

  const slsOpenRightSeconds =
    slsOpenRightRaw == null || typeof slsOpenRightRaw !== "number" || Number.isNaN(slsOpenRightRaw)
      ? null
      : slsOpenRightRaw;

  const slsOpenLeftSeconds =
    slsOpenLeftRaw == null || typeof slsOpenLeftRaw !== "number" || Number.isNaN(slsOpenLeftRaw)
      ? null
      : slsOpenLeftRaw;

  const slsClosedRightSeconds =
    slsClosedRightRaw == null || typeof slsClosedRightRaw !== "number" || Number.isNaN(slsClosedRightRaw)
      ? null
      : slsClosedRightRaw;

  const slsClosedLeftSeconds =
    slsClosedLeftRaw == null || typeof slsClosedLeftRaw !== "number" || Number.isNaN(slsClosedLeftRaw)
      ? null
      : slsClosedLeftRaw;

  const toeTouchRawPts =
    toeTouchRaw == null || typeof toeTouchRaw !== "number" || Number.isNaN(toeTouchRaw)
      ? null
      : toeTouchRaw;

  const deepSquatRawPts =
    deepSquatRaw == null || typeof deepSquatRaw !== "number" || Number.isNaN(deepSquatRaw)
      ? null
      : deepSquatRaw;

  function avgSeconds(a: number | null, b: number | null): number | null {
    const vals = [a, b].filter(
      (v): v is number => typeof v === "number" && !Number.isNaN(v)
    );
    if (vals.length === 0) return null;
    const sum = vals.reduce((acc, v) => acc + v, 0);
    return sum / vals.length;
  }

  const slsOpenAvgSeconds = avgSeconds(slsOpenRightSeconds, slsOpenLeftSeconds);
  const slsClosedAvgSeconds = avgSeconds(
    slsClosedRightSeconds,
    slsClosedLeftSeconds
  );

  // Convert to points
  let run1bPoints: number | null = null;
  if (run1bFps != null) {
    const rawPoints = (run1bFps - 7) * 3;
    run1bPoints = clamp(rawPoints, 0, RUN_1B_MAX_POINTS);
  }

  let run4bPoints: number | null = null;
  if (run4bFps != null) {
    const rawPoints = (run4bFps - 7) * 3;
    run4bPoints = clamp(rawPoints, 0, RUN_4B_MAX_POINTS);
  }

  let slsOpenPoints: number | null = null;
  if (slsOpenAvgSeconds != null) {
    const rawPoints = slsOpenAvgSeconds / 3;
    slsOpenPoints = clamp(rawPoints, 0, SLS_OPEN_MAX_POINTS);
  }

  let slsClosedPoints: number | null = null;
  if (slsClosedAvgSeconds != null) {
    const rawPoints = slsClosedAvgSeconds / 2;
    slsClosedPoints = clamp(rawPoints, 0, SLS_CLOSED_MAX_POINTS);
  }

  const toeTouchPoints = clamp(toeTouchRawPts, 0, TOE_TOUCH_MAX_POINTS);
  const deepSquatPoints = clamp(deepSquatRawPts, 0, DEEP_SQUAT_MAX_POINTS);

  const components: number[] = [];
  if (typeof run1bPoints === "number") components.push(run1bPoints);
  if (typeof run4bPoints === "number") components.push(run4bPoints);
  if (typeof slsOpenPoints === "number") components.push(slsOpenPoints);
  if (typeof slsClosedPoints === "number") components.push(slsClosedPoints);
  if (typeof toeTouchPoints === "number") components.push(toeTouchPoints);
  if (typeof deepSquatPoints === "number") components.push(deepSquatPoints);

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

  // NEW – speed-only derived score from run1b + run4b
  let speedPointsTotal: number | null = null;
  let speedScore: number | null = null;
  if (typeof run1bPoints === "number" && typeof run4bPoints === "number") {
    speedPointsTotal = run1bPoints + run4bPoints; // max 20 + 25 = 45
    const SPEED_MAX_POINTS = RUN_1B_MAX_POINTS + RUN_4B_MAX_POINTS;
    const raw = (speedPointsTotal / SPEED_MAX_POINTS) * 50;
    speedScore = Math.round(raw * 10) / 10;
  }

  return {
    categoryScore,
    breakdown: {
      total_points: totalPoints,
      max_points: CATEGORY_MAX_POINTS,
      tests: {
        run_1b_points: run1bPoints,
        run_4b_points: run4bPoints,
        sls_open_points: slsOpenPoints,
        sls_closed_points: slsClosedPoints,
        toe_touch_points: toeTouchPoints,
        deep_squat_points: deepSquatPoints,
        run_1b_fps: run1bFps,
        run_4b_fps: run4bFps,
        sls_open_right_seconds: slsOpenRightSeconds,
        sls_open_left_seconds: slsOpenLeftSeconds,
        sls_open_avg_seconds: slsOpenAvgSeconds,
        sls_closed_right_seconds: slsClosedRightSeconds,
        sls_closed_left_seconds: slsClosedLeftSeconds,
        sls_closed_avg_seconds: slsClosedAvgSeconds,
        toe_touch_raw_points: toeTouchRawPts,
        deep_squat_raw_points: deepSquatRawPts,
        speed_points_total: speedPointsTotal,
        speed_score: speedScore,
      },
    },
  };
}




function computeHittingScore(metrics: MetricMap): {
  categoryScore: number | null;
  breakdown: {
    total_points: number | null;
    max_points: number;
    tests: {
      tee_raw: number | null;
      pitch_raw: number | null;
      tee_points: number | null;
      pitch_points: number | null;
      bat_speed_mph: number | null;
      bat_speed_points: number | null;

      // Derived from spreadsheet
      contact_raw_points: number | null;    // H10TEE + H10PITCH points
      contact_score: number | null;         // 0–90 (CONTACTSCORE)
      power_raw_points: number | null;      // H10PITCH + HBSPEED/5 points
      power_score: number | null;           // 0–90 (POWERSCORE)
      strike_chance_percent: number | null; // 0–100 %, based on CONTACTSCORE/90
    };
  };
} {
  // Raw metrics from Supabase
  const teeRaw = metrics["m_10_swing_tee_contact_test"];
  const pitchRaw = metrics["m_10_swing_pitch_matrix"];
  const batSpeedRaw = metrics["max_bat_speed"];

  // Maxes for 5U from sheet
  const TEE_MAX_POINTS = 10;             // H10TEE max
  const PITCH_MAX_POINTS = 20;           // H10PITCH max
  const BATSPEED_POINTS_MAX = 9;         // HBSPEED/5 => 45 mph → 9 points
  const CATEGORY_MAX_POINTS = 39;        // 10 + 20 + 9
  const CATEGORY_NORMALIZED_MAX = 50;    // BPOP Hitting Score scale

  const teeRawPts =
    teeRaw == null || typeof teeRaw !== "number" || Number.isNaN(teeRaw)
      ? null
      : teeRaw;

  const pitchRawPts =
    pitchRaw == null || typeof pitchRaw !== "number" || Number.isNaN(pitchRaw)
      ? null
      : pitchRaw;

  const batSpeedMph =
    batSpeedRaw == null || typeof batSpeedRaw !== "number" || Number.isNaN(batSpeedRaw)
      ? null
      : batSpeedRaw;

  // Clamp raw test points to allowed ranges
  const teePoints = clamp(teeRawPts, 0, TEE_MAX_POINTS);
  const pitchPoints = clamp(pitchRawPts, 0, PITCH_MAX_POINTS);

  let batSpeedPoints: number | null = null;
  if (batSpeedMph != null) {
    const rawPts = batSpeedMph / 5; // HBSPEED/5 for 5U
    batSpeedPoints = clamp(rawPts, 0, BATSPEED_POINTS_MAX);
  }

  // ---------- BPOP Hitting Score (categoryScore, 0–50) ----------

  const components: number[] = [];
  if (typeof teePoints === "number") components.push(teePoints);
  if (typeof pitchPoints === "number") components.push(pitchPoints);
  if (typeof batSpeedPoints === "number") components.push(batSpeedPoints);

  let totalPoints: number | null = null;
  let categoryScore: number | null = null;

  if (components.length > 0) {
    totalPoints = components.reduce((sum, v) => sum + v, 0);
    const ratio =
      CATEGORY_MAX_POINTS > 0 ? totalPoints / CATEGORY_MAX_POINTS : 0;
    const rawScore = ratio * CATEGORY_NORMALIZED_MAX; // 0–50
    categoryScore = Number.isFinite(rawScore)
      ? Math.round(rawScore * 10) / 10
      : null;
  }

  // ---------- CONTACTSCORE (0–90 scale) ----------
  //
  // CONTACTSCORE = ((H10TEE + H10PITCH) / (TEE_MAX + PITCH_MAX)) * 90

  let contactRawPoints: number | null = null;
  let contactScore: number | null = null;

  if (typeof teePoints === "number" && typeof pitchPoints === "number") {
    contactRawPoints = teePoints + pitchPoints; // 0–30
    const maxContact = TEE_MAX_POINTS + PITCH_MAX_POINTS; // 30
    const frac = maxContact > 0 ? contactRawPoints / maxContact : 0;
    const rawContactScore = frac * 90; // 0–90
    contactScore = Math.round(rawContactScore * 10) / 10;
  }

  // ---------- POWERSCORE (0–90 scale) ----------
  //
  // POWERSCORE = ((H10PITCH + (HBSPEED/5)) / (PITCH_MAX + BATSPEED_POINTS_MAX)) * 90

  let powerRawPoints: number | null = null;
  let powerScore: number | null = null;

  if (
    typeof pitchPoints === "number" &&
    typeof batSpeedPoints === "number"
  ) {
    powerRawPoints = pitchPoints + batSpeedPoints; // 0–29
    const maxPower = PITCH_MAX_POINTS + BATSPEED_POINTS_MAX; // 29
    const frac = maxPower > 0 ? powerRawPoints / maxPower : 0;
    const rawPowerScore = frac * 90; // 0–90
    powerScore = Math.round(rawPowerScore * 10) / 10;
  }

  // ---------- STRIKEOUTCHANCE ----------
  //
  // STRIKEOUTCHANCE = 1 - (CONTACTSCORE / 90)
  // We store as a percentage:
  //   strike_chance_percent = (1 - CONTACTSCORE/90) * 100

  let strikeChancePercent: number | null = null;

  if (typeof contactScore === "number") {
    const frac = 1 - contactScore / 90; // 0–1
    let rawPercent = frac * 100;

    // Manual clamp to 0–100 so TS knows it's a number
    if (rawPercent < 0) rawPercent = 0;
    if (rawPercent > 100) rawPercent = 100;

    strikeChancePercent = Math.round(rawPercent * 10) / 10;
  }

  return {
    categoryScore,
    breakdown: {
      total_points: totalPoints,
      max_points: CATEGORY_MAX_POINTS,
      tests: {
        tee_raw: teeRawPts,
        pitch_raw: pitchRawPts,
        tee_points: teePoints,
        pitch_points: pitchPoints,
        bat_speed_mph: batSpeedMph,
        bat_speed_points: batSpeedPoints,

        contact_raw_points: contactRawPoints,
        contact_score: contactScore,      // 0–90
        power_raw_points: powerRawPoints,
        power_score: powerScore,          // 0–90
        strike_chance_percent: strikeChancePercent, // 0–100
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


function computeCatchingScore(metrics: MetricMap): {
  categoryScore: number | null;
  breakdown: {
    total_points: number | null;
    max_points: number;
    tests: {
      c20ft_points: number | null;
      c40ft_points: number | null;
      c20ft_raw_points: number | null;
      c40ft_raw_points: number | null;
    };
  };
} {
  const c20ftRaw = metrics["m_20ft_catching_test"];
  const c40ftRaw = metrics["m_40_ft_catching_test"];

  const C20FT_MAX_POINTS = 10;
  const C40FT_MAX_POINTS = 10;

  const CATEGORY_MAX_POINTS = 20;
  const CATEGORY_NORMALIZED_MAX = 50;

  const c20ftRawPts =
    c20ftRaw == null || typeof c20ftRaw !== "number" || Number.isNaN(c20ftRaw)
      ? null
      : c20ftRaw;

  const c40ftRawPts =
    c40ftRaw == null || typeof c40ftRaw !== "number" || Number.isNaN(c40ftRaw)
      ? null
      : c40ftRaw;

  const c20ftPoints = clamp(c20ftRawPts, 0, C20FT_MAX_POINTS);
  const c40ftPoints = clamp(c40ftRawPts, 0, C40FT_MAX_POINTS);

  const components: number[] = [];
  if (typeof c20ftPoints === "number") components.push(c20ftPoints);
  if (typeof c40ftPoints === "number") components.push(c40ftPoints);

  if (components.length === 0) {
    return {
      categoryScore: null,
      breakdown: {
        total_points: null,
        max_points: CATEGORY_MAX_POINTS,
        tests: {
          c20ft_points: c20ftPoints,
          c40ft_points: c40ftPoints,
          c20ft_raw_points: c20ftRawPts,
          c40ft_raw_points: c40ftRawPts,
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
        c20ft_points: c20ftPoints,
        c40ft_points: c40ftPoints,
        c20ft_raw_points: c20ftRawPts,
        c40ft_raw_points: c40ftRawPts,
      },
    },
  };
}



  function computeFieldingScore(metrics: MetricMap): {
    categoryScore: number | null;
    breakdown: {
      total_points: number | null;
      max_points: number;
      tests: {
        f2b_points: number | null;
        fss_points: number | null;
        f3b_points: number | null;
        fpitcher_points: number | null;
        f2b_raw_points: number | null;
        fss_raw_points: number | null;
        f3b_raw_points: number | null;
        fpitcher_raw_points: number | null;
      };
    };
  } {
    const f2bRaw = metrics["grounders_2b"];
    const fssRaw = metrics["grounders_ss"];
    const f3bRaw = metrics["grounders_3b"];
    const fpitcherRaw = metrics["grounders_pitcher"];

    const F2B_MAX_POINTS = 6;
    const FSS_MAX_POINTS = 6;
    const F3B_MAX_POINTS = 6;
    const FPITCHER_MAX_POINTS = 6;

    const CATEGORY_MAX_POINTS = 24; // 6+6+6+6
    const CATEGORY_NORMALIZED_MAX = 50;

    const f2bRawPts =
      f2bRaw == null || typeof f2bRaw !== "number" || Number.isNaN(f2bRaw)
        ? null
        : f2bRaw;

    const fssRawPts =
      fssRaw == null || typeof fssRaw !== "number" || Number.isNaN(fssRaw)
        ? null
        : fssRaw;

    const f3bRawPts =
      f3bRaw == null || typeof f3bRaw !== "number" || Number.isNaN(f3bRaw)
        ? null
        : f3bRaw;

    const fpitcherRawPts =
      fpitcherRaw == null || typeof fpitcherRaw !== "number" || Number.isNaN(fpitcherRaw)
        ? null
        : fpitcherRaw;

    const f2bPoints = clamp(f2bRawPts, 0, F2B_MAX_POINTS);
    const fssPoints = clamp(fssRawPts, 0, FSS_MAX_POINTS);
    const f3bPoints = clamp(f3bRawPts, 0, F3B_MAX_POINTS);
    const fpitcherPoints = clamp(fpitcherRawPts, 0, FPITCHER_MAX_POINTS);

    const components: number[] = [];
    if (typeof f2bPoints === "number") components.push(f2bPoints);
    if (typeof fssPoints === "number") components.push(fssPoints);
    if (typeof f3bPoints === "number") components.push(f3bPoints);
    if (typeof fpitcherPoints === "number") components.push(fpitcherPoints);

    if (components.length === 0) {
      return {
        categoryScore: null,
        breakdown: {
          total_points: null,
          max_points: CATEGORY_MAX_POINTS,
          tests: {
            f2b_points: f2bPoints,
            fss_points: fssPoints,
            f3b_points: f3bPoints,
            fpitcher_points: fpitcherPoints,
            f2b_raw_points: f2bRawPts,
            fss_raw_points: fssRawPts,
            f3b_raw_points: f3bRawPts,
            fpitcher_raw_points: fpitcherRawPts,
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
          f2b_points: f2bPoints,
          fss_points: fssPoints,
          f3b_points: f3bPoints,
          fpitcher_points: fpitcherPoints,
          f2b_raw_points: f2bRawPts,
          fss_raw_points: fssRawPts,
          f3b_raw_points: f3bRawPts,
          fpitcher_raw_points: fpitcherRawPts,
        },
      },
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
