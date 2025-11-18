import "dotenv/config";
import express from "express";
import cors from "cors";
import { supabase } from "./supabaseClient";
import { requireAuth, AuthedRequest } from "./middleware/auth";
import {
  compute5URatings,
  MetricMap,
  RatingResult,
} from "./scoring/5u";
import { compute6URatings } from "./scoring/6u";
import { compute7URatings } from "./scoring/7u";

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

/**
 * Health check
 */
app.get("/", (_req, res) => {
  res.json({ status: "ok", service: "BPOP backend" });
});

/**
 * Get current user's profile from the "profiles" table.
 * Requires Authorization: Bearer <Supabase access token>
 */
app.get("/me", requireAuth, async (req: AuthedRequest, res) => {
  const userId = req.user!.id;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (error) {
    console.error("Error fetching profile:", error);
    return res.status(500).json({ error: error.message });
  }

  return res.json(data);
});

type FullEvalCategoryKey =
  | "athletic"
  | "hitting"
  | "throwing"
  | "catching"
  | "fielding";

interface CategoryComponent {
  category: FullEvalCategoryKey;
  templateName: string;
  assessmentId: number | null;
  ratingId: number | null;
  performedAt: string | null;
  score: number | null; // 0–50 normalized category score
  breakdown: any | null;
}

interface PositionScores5U {
  pitcher: number | null;
  catcher: number | null;
  first_base: number | null;
  second_base: number | null;
  third_base: number | null;
  shortstop: number | null;
  pitchers_helper: number | null;
  left_field: number | null;
  right_field: number | null;
  left_center: number | null;
  right_center: number | null;
  center_field: number | null;
  infield_score: number | null;
  outfield_score: number | null;
  defense_score: number | null;
}

function averageNonNull(values: Array<number | null | undefined>): number | null {
  const valid = values.filter(
    (v): v is number => typeof v === "number" && !Number.isNaN(v)
  );
  if (valid.length === 0) return null;
  const sum = valid.reduce((acc, v) => acc + v, 0);
  return Math.round((sum / valid.length) * 10) / 10;
}

function ratioToScore(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return NaN;
  }
  const ratio = Math.max(0, Math.min(1, numerator / denominator));
  return Math.round(ratio * 50 * 10) / 10; // 0–50, 1 decimal
}

/**
 * Get the latest assessment + rating for a player for a given template name.
 */
async function fetchLatestCategoryRating(
  playerId: string,
  templateName: string,
  category: FullEvalCategoryKey
): Promise<CategoryComponent> {
  const { data: tmpl, error: tmplErr } = await supabase
    .from("assessment_templates")
    .select("id")
    .eq("name", templateName)
    .maybeSingle();

  if (tmplErr || !tmpl) {
    console.error(`Template lookup failed for ${templateName}`, tmplErr);
    return {
      category,
      templateName,
      assessmentId: null,
      ratingId: null,
      performedAt: null,
      score: null,
      breakdown: null,
    };
  }

  const templateId = tmpl.id;

  const { data: assessment, error: assessErr } = await supabase
    .from("player_assessments")
    .select("id, performed_at")
    .eq("player_id", playerId)
    .eq("template_id", templateId)
    .order("performed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (assessErr || !assessment) {
    return {
      category,
      templateName,
      assessmentId: null,
      ratingId: null,
      performedAt: null,
      score: null,
      breakdown: null,
    };
  }

  const { data: rating, error: ratingErr } = await supabase
    .from("player_ratings")
    .select("id, overall_score, breakdown, created_at")
    .eq("player_assessment_id", assessment.id) // ✅ use the existing foreign key
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (ratingErr || !rating) {
    console.error(`Rating not found for assessment ${assessment.id}`, ratingErr);
    return {
      category,
      templateName,
      assessmentId: assessment.id,
      ratingId: null,
      performedAt: assessment.performed_at,
      score: null,
      breakdown: null,
    };
  }

  const numericScore =
    rating.overall_score != null ? parseFloat(String(rating.overall_score)) : null;

  return {
    category,
    templateName,
    assessmentId: assessment.id,
    ratingId: rating.id,
    performedAt: assessment.performed_at,
    score: Number.isFinite(numericScore) ? numericScore : null,
    breakdown: rating.breakdown,
  };
  }

/**
 * 5U position scores based on category scores + key tests.
 */
function compute5UPositionScores(
  athletic: CategoryComponent,
  throwing: CategoryComponent,
  catching: CategoryComponent,
  fielding: CategoryComponent
): PositionScores5U {
  const FIELD_MAX = 50;
  const CATCH_MAX = 50;
  const SPEED_MAX = 50;
  const GROUND_MAX = 6;   // 2B / 3B / SS / P grounders max points
  const T40_MAX = 10;     // 10-throw 40 ft max points

  const athleticTests =
    athletic.breakdown && athletic.breakdown.athletic
      ? athletic.breakdown.athletic.tests || {}
      : {};

  const throwingTests =
    throwing.breakdown && throwing.breakdown.throwing
      ? throwing.breakdown.throwing.tests || {}
      : {};

  const catchingTests =
    catching.breakdown && catching.breakdown.catching
      ? catching.breakdown.catching.tests || {}
      : {};

  const fieldingTests =
    fielding.breakdown && fielding.breakdown.fielding
      ? fielding.breakdown.fielding.tests || {}
      : {};

  const fieldingScore =
    typeof fielding.score === "number" ? fielding.score : null;
  const catchingScore =
    typeof catching.score === "number" ? catching.score : null;
  const throwingScore =
    typeof throwing.score === "number" ? throwing.score : null;

  const speedScore =
    typeof athleticTests.speed_score === "number"
      ? athleticTests.speed_score
      : null;

  const f2bPoints =
    typeof fieldingTests.f2b_points === "number"
      ? fieldingTests.f2b_points
      : null;
  const f3bPoints =
    typeof fieldingTests.f3b_points === "number"
      ? fieldingTests.f3b_points
      : null;
  const fssPoints =
    typeof fieldingTests.fss_points === "number"
      ? fieldingTests.fss_points
      : null;
  const fpitcherPoints =
    typeof fieldingTests.fpitcher_points === "number"
      ? fieldingTests.fpitcher_points
      : null;

  const t40ftPoints =
    typeof throwingTests.t40ft_points === "number"
      ? throwingTests.t40ft_points
      : null;

  // Pitcher = Throwing score
  const pitcher = throwingScore ?? null;

  // Catcher = Catching score
  const catcherPos = catchingScore ?? null;

  // 1B = (2 * Catching + 1 * Fielding) / (2*CATCH_MAX + FIELD_MAX)
  let firstBase: number | null = null;
  if (catchingScore != null && fieldingScore != null) {
    const num = 2 * catchingScore + fieldingScore;
    const den = 2 * CATCH_MAX + FIELD_MAX;
    firstBase = ratioToScore(num, den);
  }

  // 2B
  let secondBase: number | null = null;
  if (fieldingScore != null && catchingScore != null && f2bPoints != null) {
    const num = fieldingScore * 2 + catchingScore * 1 + f2bPoints * 2;
    const den = FIELD_MAX * 2 + CATCH_MAX * 1 + GROUND_MAX * 2;
    secondBase = ratioToScore(num, den);
  }

  // 3B
  let thirdBase: number | null = null;
  if (fieldingScore != null && catchingScore != null && f3bPoints != null) {
    const num = fieldingScore * 2 + catchingScore * 1 + f3bPoints * 2;
    const den = FIELD_MAX * 2 + CATCH_MAX * 1 + GROUND_MAX * 2;
    thirdBase = ratioToScore(num, den);
  }

  // SS
  let shortstop: number | null = null;
  if (fieldingScore != null && catchingScore != null && fssPoints != null) {
    const num = fieldingScore * 2 + catchingScore * 1 + fssPoints * 2;
    const den = FIELD_MAX * 2 + CATCH_MAX * 1 + GROUND_MAX * 2;
    shortstop = ratioToScore(num, den);
  }

  // Pitcher's Helper
  let pitchersHelper: number | null = null;
  if (fieldingScore != null && catchingScore != null && fpitcherPoints != null) {
    const num = fieldingScore * 2 + catchingScore * 1 + fpitcherPoints * 2;
    const den = FIELD_MAX * 2 + CATCH_MAX * 1 + GROUND_MAX * 2;
    pitchersHelper = ratioToScore(num, den);
  }

  // LF = (CATCHINGSCORE + T40FT) / (CATCH_MAX + T40_MAX)
  let leftField: number | null = null;
  if (catchingScore != null && t40ftPoints != null) {
    const num = catchingScore + t40ftPoints;
    const den = CATCH_MAX + T40_MAX;
    leftField = ratioToScore(num, den);
  }

  // RF = (CATCHINGSCORE + 2B GROUNDERS) / (CATCH_MAX + GROUND_MAX)
  let rightField: number | null = null;
  if (catchingScore != null && f2bPoints != null) {
    const num = catchingScore + f2bPoints;
    const den = CATCH_MAX + GROUND_MAX;
    rightField = ratioToScore(num, den);
  }

  // CF = (CATCHINGSCORE + SPEEDSCORE) / (CATCH_MAX + SPEED_MAX)
  let centerField: number | null = null;
  if (catchingScore != null && speedScore != null) {
    const num = catchingScore + speedScore;
    const den = CATCH_MAX + SPEED_MAX;
    centerField = ratioToScore(num, den);
  }

  // LC = (CATCHINGSCORE + SS GROUNDERS) / (CATCH_MAX + GROUND_MAX)
  let leftCenter: number | null = null;
  if (catchingScore != null && fssPoints != null) {
    const num = catchingScore + fssPoints;
    const den = CATCH_MAX + GROUND_MAX;
    leftCenter = ratioToScore(num, den);
  }

  // RC = (CATCHINGSCORE + SPEEDSCORE) / (CATCH_MAX + SPEED_MAX)
  let rightCenter: number | null = null;
  if (catchingScore != null && speedScore != null) {
    const num = catchingScore + speedScore;
    const den = CATCH_MAX + SPEED_MAX;
    rightCenter = ratioToScore(num, den);
  }

  const infieldScore = averageNonNull([
    catcherPos,
    firstBase,
    secondBase,
    thirdBase,
    shortstop,
    pitchersHelper,
  ]);

  const outfieldScore = averageNonNull([
    leftField,
    rightField,
    leftCenter,
    rightCenter,
    centerField,
  ]);

  const defenseScore = averageNonNull([
    pitcher,
    catcherPos,
    firstBase,
    secondBase,
    thirdBase,
    shortstop,
    pitchersHelper,
    leftField,
    rightField,
    leftCenter,
    rightCenter,
    centerField,
  ]);

  return {
    pitcher,
    catcher: catcherPos,
    first_base: firstBase,
    second_base: secondBase,
    third_base: thirdBase,
    shortstop,
    pitchers_helper: pitchersHelper,
    left_field: leftField,
    right_field: rightField,
    left_center: leftCenter,
    right_center: rightCenter,
    center_field: centerField,
    infield_score: infieldScore,
    outfield_score: outfieldScore,
    defense_score: defenseScore,
  };
}

function compute7UPositionScores(
  athletic: CategoryComponent,
  throwing: CategoryComponent,
  catching: CategoryComponent,
  fielding: CategoryComponent
): PositionScores5U {
  const FIELD_MAX = 50;
  const CATCH_MAX = 50;
  const SPEED_MAX = 50;
  const T40_MAX = 10;   // 10-throw 40 ft max points
  const GROUND_MAX = 12; // new RLC max (6 reps × 2 pts)
  const C51B_MAX = 15;  // 5 throws, 3 pts each

  const athleticTests =
    athletic.breakdown && athletic.breakdown.athletic
      ? athletic.breakdown.athletic.tests || {}
      : {};

  const throwingTests =
    throwing.breakdown && throwing.breakdown.throwing
      ? throwing.breakdown.throwing.tests || {}
      : {};

  const catchingTests =
    catching.breakdown && catching.breakdown.catching
      ? catching.breakdown.catching.tests || {}
      : {};

  const fieldingSection =
    fielding.breakdown && fielding.breakdown.fielding
      ? fielding.breakdown.fielding
      : null;

  const fieldingScore =
    typeof fielding.score === "number" ? fielding.score : null;
  const catchingScore =
    typeof catching.score === "number" ? catching.score : null;
  const throwingScore =
    typeof throwing.score === "number" ? throwing.score : null;

  const speedScore =
    typeof athleticTests.speed_score === "number"
      ? athleticTests.speed_score
      : null;

  const c51bPoints =
    typeof catchingTests.c51b_points === "number"
      ? catchingTests.c51b_points
      : null;

  const t40ftPoints =
    typeof throwingTests.t40ft_points === "number"
      ? throwingTests.t40ft_points
      : null;

  const rlcTotal =
    fieldingSection && typeof (fieldingSection as any).total_points === "number"
      ? (fieldingSection as any).total_points as number
      : null;

  // Pitcher = Throwing score
  const pitcher = throwingScore ?? null;

  // Catcher = Catching score
  const catcherPos = catchingScore ?? null;

  // 1B = (C51B * 3 + CatchingScore) / (3*C51B_MAX + CATCH_MAX) → 0–50
  let firstBase: number | null = null;
  if (catchingScore != null && c51bPoints != null) {
    const num = c51bPoints * 3 + catchingScore;
    const den = C51B_MAX * 3 + CATCH_MAX; // 45 + 50 = 95
    firstBase = ratioToScore(num, den);
  }

  // 2B / 3B / SS / PH:
  // same weighting pattern as 5U/6U:
  // (2*Fielding + 1*Catching + 2*Grounders) / (2*FIELD_MAX + CATCH_MAX + 2*GROUND_MAX)
  function infieldSpotFromRLC(): number | null {
    if (fieldingScore == null || catchingScore == null || rlcTotal == null) {
      return null;
    }
    const num = fieldingScore * 2 + catchingScore * 1 + rlcTotal * 2;
    const den = FIELD_MAX * 2 + CATCH_MAX * 1 + GROUND_MAX * 2;
    return ratioToScore(num, den);
  }

  const secondBase = infieldSpotFromRLC();
  const thirdBase = infieldSpotFromRLC();
  const shortstop = infieldSpotFromRLC();
  const pitchersHelper = infieldSpotFromRLC();

  // Outfield:
  // For now we keep the same structure as 5U/6U,
  // still using CatchingScore + T40 / RLC / Speed.
  // (Later we can swap CatchingScore → C10X10LD when that test is wired.)

  // LF = (CatchingScore + T40FT) / (CATCH_MAX + T40_MAX)
  let leftField: number | null = null;
  if (catchingScore != null && t40ftPoints != null) {
    const num = catchingScore + t40ftPoints;
    const den = CATCH_MAX + T40_MAX;
    leftField = ratioToScore(num, den);
  }

  // RF = (CatchingScore + RLC) / (CATCH_MAX + GROUND_MAX)
  let rightField: number | null = null;
  if (catchingScore != null && rlcTotal != null) {
    const num = catchingScore + rlcTotal;
    const den = CATCH_MAX + GROUND_MAX;
    rightField = ratioToScore(num, den);
  }

  // CF = (CatchingScore + SpeedScore) / (CATCH_MAX + SPEED_MAX)
  let centerField: number | null = null;
  if (catchingScore != null && speedScore != null) {
    const num = catchingScore + speedScore;
    const den = CATCH_MAX + SPEED_MAX;
    centerField = ratioToScore(num, den);
  }

  // LC = (CatchingScore + RLC) / (CATCH_MAX + GROUND_MAX)
  let leftCenter: number | null = null;
  if (catchingScore != null && rlcTotal != null) {
    const num = catchingScore + rlcTotal;
    const den = CATCH_MAX + GROUND_MAX;
    leftCenter = ratioToScore(num, den);
  }

  // RC = (CatchingScore + SpeedScore) / (CATCH_MAX + SPEED_MAX)
  let rightCenter: number | null = null;
  if (catchingScore != null && speedScore != null) {
    const num = catchingScore + speedScore;
    const den = CATCH_MAX + SPEED_MAX;
    rightCenter = ratioToScore(num, den);
  }

  const infieldScore = averageNonNull([
    catcherPos,
    firstBase,
    secondBase,
    thirdBase,
    shortstop,
    pitchersHelper,
  ]);

  const outfieldScore = averageNonNull([
    leftField,
    rightField,
    leftCenter,
    rightCenter,
    centerField,
  ]);

  const defenseScore = averageNonNull([
    pitcher,
    catcherPos,
    firstBase,
    secondBase,
    thirdBase,
    shortstop,
    pitchersHelper,
    leftField,
    rightField,
    leftCenter,
    rightCenter,
    centerField,
  ]);

  return {
    pitcher,
    catcher: catcherPos,
    first_base: firstBase,
    second_base: secondBase,
    third_base: thirdBase,
    shortstop,
    pitchers_helper: pitchersHelper,
    left_field: leftField,
    right_field: rightField,
    left_center: leftCenter,
    right_center: rightCenter,
    center_field: centerField,
    infield_score: infieldScore,
    outfield_score: outfieldScore,
    defense_score: defenseScore,
  };
}


/**
 * Create an assessment (official or practice) + store raw values.
 * Then, if the template belongs to the 5U or 6U age group, compute ratings
 * and write to player_ratings.
 *
 * TEMP: no auth required on this route while we wire up scoring.
 *
 * Expected JSON body:
 * {
 *   "player_id": "<uuid>",
 *   "team_id": <bigint | null>,
 *   "template_id": <bigint>,
 *   "kind": "official" | "practice",
 *   "performed_by": "<uuid | null>",
 *   "values": [
 *     { "metric_id": <bigint>, "value_numeric": 12.3, "value_text": null },
 *     ...
 *   ]
 * }
 */
app.post("/assessments", async (req: AuthedRequest, res) => {
  const {
    player_id,
    team_id,
    template_id,
    kind, // 'official' or 'practice'
    values,
    performed_by,
  } = req.body;

  // For now, allow performed_by to come from the body (test only)
  const performerId: string | null = performed_by || null;

  if (!player_id || !template_id || !kind) {
    return res.status(400).json({
      error: "player_id, template_id, and kind are required",
    });
  }

  // 1) Create assessment session
  const { data: assessment, error: assessmentError } = await supabase
    .from("player_assessments")
    .insert([
      {
        player_id,
        team_id,
        template_id,
        kind,
        performed_by: performerId,
      },
    ])
    .select()
    .single();

  if (assessmentError || !assessment) {
    console.error("Error creating player_assessments:", assessmentError);
    return res
      .status(500)
      .json({ error: assessmentError?.message ?? "Unknown error" });
  }

  const assessmentId = assessment.id;

  // 2) Insert metric values
  const valuesToInsert = (values || []).map((v: any) => ({
    player_assessment_id: assessmentId,
    metric_id: v.metric_id,
    value_numeric:
      typeof v.value_numeric === "number" ? v.value_numeric : null,
    value_text:
      typeof v.value_text === "string" && v.value_text.length > 0
        ? v.value_text
        : null,
  }));

  if (valuesToInsert.length > 0) {
    const { error: valuesError } = await supabase
      .from("player_assessment_values")
      .insert(valuesToInsert);

    if (valuesError) {
      console.error("Error inserting player_assessment_values:", valuesError);
      return res.status(500).json({ error: valuesError.message });
    }
  }

  // 3) Determine which age group this template belongs to
  const { data: template, error: templateError } = await supabase
    .from("assessment_templates")
    .select("id, age_group_id")
    .eq("id", template_id)
    .single();

  if (templateError || !template) {
    console.error("Error fetching assessment_templates:", templateError);
    // We still created the assessment + values; return that info
    return res.status(201).json({ assessment_id: assessmentId });
  }

  const { data: ageGroup, error: ageGroupError } = await supabase
    .from("age_groups")
    .select("id, label")
    .eq("id", template.age_group_id)
    .single();

  if (ageGroupError || !ageGroup) {
    console.error("Error fetching age_groups:", ageGroupError);
    return res.status(201).json({ assessment_id: assessmentId });
  }

  // Only 5U, 6U, 7U are implemented with scoring right now
  if (
    ageGroup.label !== "5U" &&
    ageGroup.label !== "6U" &&
    ageGroup.label !== "7U"
  ) {
    return res.status(201).json({ assessment_id: assessmentId });
  }

  // 4) Load metric definitions (id -> metric_key) for this template
  const { data: metricDefs, error: metricsError } = await supabase
    .from("assessment_metrics")
    .select("id, metric_key, template_id")
    .eq("template_id", template_id);

  if (metricsError || !metricDefs) {
    console.error("Error fetching assessment_metrics:", metricsError);
    return res.status(201).json({ assessment_id: assessmentId });
  }

  const metricIdToKey = new Map<number, string>();
  for (const m of metricDefs as any[]) {
    metricIdToKey.set(m.id as number, m.metric_key as string);
  }

  // 5) Load the stored values for this assessment
  const { data: storedValues, error: storedValuesError } = await supabase
    .from("player_assessment_values")
    .select("metric_id, value_numeric")
    .eq("player_assessment_id", assessmentId);

  if (storedValuesError || !storedValues) {
    console.error(
      "Error fetching player_assessment_values for scoring:",
      storedValuesError
    );
    return res.status(201).json({ assessment_id: assessmentId });
  }

  // 6) Build MetricMap keyed by metric_key
  const metricMap: MetricMap = {};
  for (const row of storedValues as any[]) {
    const key = metricIdToKey.get(row.metric_id as number);
    if (!key) continue;
    const val = row.value_numeric;
    if (typeof val === "number" && !Number.isNaN(val)) {
      metricMap[key] = val;
    } else {
      metricMap[key] = null;
    }
  }

  // 7) Compute ratings using age-specific scoring
  let ratings: RatingResult;
  try {
    if (ageGroup.label === "5U") {
      ratings = compute5URatings(metricMap);
    } else if (ageGroup.label === "6U") {
      ratings = compute6URatings(metricMap);
    } else if (ageGroup.label === "7U") {
      ratings = compute7URatings(metricMap);
    } else {
      // Shouldn't happen given the earlier check
      return res.status(201).json({ assessment_id: assessmentId });
    }
  } catch (err) {
    console.error(`Error computing ${ageGroup.label} ratings:`, err);
    // Don’t block the assessment just because scoring failed
    return res.status(201).json({ assessment_id: assessmentId });
  }

  // 8) Insert into player_ratings
  const { error: ratingsError } = await supabase.from("player_ratings").insert([
    {
      player_assessment_id: assessmentId,
      assessment_id: assessmentId, // extra column you added, fine
      player_id,
      team_id,
      age_group_id: ageGroup.id,
      overall_score: ratings.overall_score,
      offense_score: ratings.offense_score,
      defense_score: ratings.defense_score,
      pitching_score: ratings.pitching_score,
      breakdown: ratings.breakdown,
    },
  ]);

  if (ratingsError) {
    console.error("Error inserting player_ratings:", ratingsError);
    // Still return success for the assessment creation
    return res.status(201).json({ assessment_id: assessmentId });
  }

  return res.status(201).json({
    assessment_id: assessmentId,
    ratings_inserted: true,
  });
});


app.get("/players/:playerId/evals/5u-full", async (req, res) => {
  const playerId = req.params.playerId;

    try {
      const [athletic, hitting, throwing, catching, fielding] =
        await Promise.all([
          fetchLatestCategoryRating(playerId, "5U Athletic Skills", "athletic"),
          fetchLatestCategoryRating(playerId, "5U Hitting Skills", "hitting"),
          fetchLatestCategoryRating(playerId, "5U Throwing Skills", "throwing"),
          fetchLatestCategoryRating(playerId, "5U Catching Skills", "catching"),
          fetchLatestCategoryRating(playerId, "5U Fielding Skills", "fielding"),
        ]);

      const components = { athletic, hitting, throwing, catching, fielding };

      const athleticScore = athletic.score;
      const hittingScore = hitting.score;
      const throwingScore = throwing.score;
      const catchingScore = catching.score;
      const fieldingScore = fielding.score;

      const hittingTests =
        hitting.breakdown && hitting.breakdown.hitting
          ? hitting.breakdown.hitting.tests || {}
          : {};

      const athleticTests =
        athletic.breakdown && athletic.breakdown.athletic
          ? athletic.breakdown.athletic.tests || {}
          : {};

      const contactScore =
        typeof hittingTests.contact_score === "number"
          ? hittingTests.contact_score
          : null;
      const powerScore =
        typeof hittingTests.power_score === "number"
          ? hittingTests.power_score
          : null;
      const strikeChancePercent =
        typeof hittingTests.strike_chance_percent === "number"
          ? hittingTests.strike_chance_percent
          : null;

      const speedScore =
        typeof athleticTests.speed_score === "number"
          ? athleticTests.speed_score
          : null;

      // Offense: 80% Hitting + 20% Speed (when both available)
      let offenseFull: number | null = null;
      if (hittingScore != null && speedScore != null) {
        offenseFull = Math.round((0.8 * hittingScore + 0.2 * speedScore) * 10) / 10;
      } else if (hittingScore != null) {
        offenseFull = hittingScore;
      }

      const positionScores = compute5UPositionScores(
        athletic,
        throwing,
        catching,
        fielding
      );

      const defenseFull = positionScores.defense_score;
      const pitchingFull = throwingScore ?? null;

      const overallFull = averageNonNull([
        athleticScore,
        hittingScore,
        throwingScore,
        catchingScore,
        fieldingScore,
      ]);

      const allDates = [
        athletic.performedAt,
        hitting.performedAt,
        throwing.performedAt,
        catching.performedAt,
        fielding.performedAt,
      ].filter((d): d is string => !!d);

      const lastUpdated =
        allDates.length > 0 ? allDates.sort().slice(-1)[0] : null;

      return res.json({
        player_id: playerId,
        age_group: "5U",
        last_updated: lastUpdated,
        components,
        aggregates: {
          overall_full_eval_score: overallFull,
          offense_full_eval_score: offenseFull,
          offense_hitting_component: hittingScore,
          offense_speed_component: speedScore,
          defense_full_eval_score: defenseFull,
          pitching_full_eval_score: pitchingFull,
          athletic_score: athleticScore,
          hitting_score: hittingScore,
          throwing_score: throwingScore,
          catching_score: catchingScore,
          fielding_score: fieldingScore,
          derived: {
            contact_score: contactScore,
            power_score: powerScore,
            strike_chance_percent: strikeChancePercent,
            speed_score: speedScore,
            position_scores: positionScores,
          },
        },
      });
    } catch (err) {
      console.error("Error building 5U full eval:", err);
      return res.status(500).json({ error: "Failed to build 5U full eval" });
    }
  }
);

app.get("/players/:playerId/evals/6u-full", async (req, res) => {
  const playerId = req.params.playerId;

  try {
    const [athletic, hitting, throwing, catching, fielding] =
      await Promise.all([
        fetchLatestCategoryRating(playerId, "6U Athletic Skills", "athletic"),
        fetchLatestCategoryRating(playerId, "6U Hitting Skills", "hitting"),
        fetchLatestCategoryRating(playerId, "6U Throwing Skills", "throwing"),
        fetchLatestCategoryRating(playerId, "6U Catching Skills", "catching"),
        fetchLatestCategoryRating(playerId, "6U Fielding Skills", "fielding"),
      ]);

    const components = { athletic, hitting, throwing, catching, fielding };

    const athleticScore = athletic.score;
    const hittingScore = hitting.score;
    const throwingScore = throwing.score;
    const catchingScore = catching.score;
    const fieldingScore = fielding.score;

    const hittingTests =
      hitting.breakdown && hitting.breakdown.hitting
        ? hitting.breakdown.hitting.tests || {}
        : {};

    const athleticTests =
      athletic.breakdown && athletic.breakdown.athletic
        ? athletic.breakdown.athletic.tests || {}
        : {};

    const contactScore =
      typeof hittingTests.contact_score === "number"
        ? hittingTests.contact_score
        : null;
    const powerScore =
      typeof hittingTests.power_score === "number"
        ? hittingTests.power_score
        : null;
    const strikeChancePercent =
      typeof hittingTests.strike_chance_percent === "number"
        ? hittingTests.strike_chance_percent
        : null;

    const speedScore =
      typeof athleticTests.speed_score === "number"
        ? athleticTests.speed_score
        : null;

    // Offense: 80% Hitting + 20% Speed (when both available)
    let offenseFull: number | null = null;
    if (hittingScore != null && speedScore != null) {
      offenseFull = Math.round((0.8 * hittingScore + 0.2 * speedScore) * 10) / 10;
    } else if (hittingScore != null) {
      offenseFull = hittingScore;
    }

    const positionScores = compute5UPositionScores(
      athletic,
      throwing,
      catching,
      fielding
    );

    const defenseFull = positionScores.defense_score;
    const pitchingFull = throwingScore ?? null;

    const overallFull = averageNonNull([
      athleticScore,
      hittingScore,
      throwingScore,
      catchingScore,
      fieldingScore,
    ]);

    const allDates = [
      athletic.performedAt,
      hitting.performedAt,
      throwing.performedAt,
      catching.performedAt,
      fielding.performedAt,
    ].filter((d): d is string => !!d);

    const lastUpdated =
      allDates.length > 0 ? allDates.sort().slice(-1)[0] : null;

    return res.json({
      player_id: playerId,
      age_group: "6U",
      last_updated: lastUpdated,
      components,
      aggregates: {
        overall_full_eval_score: overallFull,
        offense_full_eval_score: offenseFull,
        offense_hitting_component: hittingScore,
        offense_speed_component: speedScore,
        defense_full_eval_score: defenseFull,
        pitching_full_eval_score: pitchingFull,
        athletic_score: athleticScore,
        hitting_score: hittingScore,
        throwing_score: throwingScore,
        catching_score: catchingScore,
        fielding_score: fieldingScore,
        derived: {
          contact_score: contactScore,
          power_score: powerScore,
          strike_chance_percent: strikeChancePercent,
          speed_score: speedScore,
          position_scores: positionScores,
        },
      },
    });
  } catch (err) {
    console.error("Error building 6U full eval:", err);
    return res.status(500).json({ error: "Failed to build 6U full eval" });
  }
});

app.get("/players/:playerId/evals/7u-full", async (req, res) => {
  const playerId = req.params.playerId;

  try {
    const [athletic, hitting, throwing, catching, fielding] =
      await Promise.all([
        fetchLatestCategoryRating(playerId, "7U Athletic Skills", "athletic"),
        fetchLatestCategoryRating(playerId, "7U Hitting Skills", "hitting"),
        fetchLatestCategoryRating(playerId, "7U Throwing Skills", "throwing"),
        fetchLatestCategoryRating(playerId, "7U Catching Skills", "catching"),
        fetchLatestCategoryRating(playerId, "7U Fielding Skills", "fielding"),
      ]);

    const components = { athletic, hitting, throwing, catching, fielding };

    const athleticScore = athletic.score;
    const hittingScore = hitting.score;
    const throwingScore = throwing.score;
    const catchingScore = catching.score;
    const fieldingScore = fielding.score;

    const hittingTests =
      hitting.breakdown && hitting.breakdown.hitting
        ? hitting.breakdown.hitting.tests || {}
        : {};

    const athleticTests =
      athletic.breakdown && athletic.breakdown.athletic
        ? athletic.breakdown.athletic.tests || {}
        : {};

    const contactScore =
      typeof hittingTests.contact_score === "number"
        ? hittingTests.contact_score
        : null;
    const powerScore =
      typeof hittingTests.power_score === "number"
        ? hittingTests.power_score
        : null;
    const strikeChancePercent =
      typeof hittingTests.strike_chance_percent === "number"
        ? hittingTests.strike_chance_percent
        : null;

    const speedScore =
      typeof athleticTests.speed_score === "number"
        ? athleticTests.speed_score
        : null;

    // Offense: 80% hitting + 20% speed
    let offenseFull: number | null = null;
    if (hittingScore != null && speedScore != null) {
      offenseFull = Math.round((0.8 * hittingScore + 0.2 * speedScore) * 10) / 10;
    } else if (hittingScore != null) {
      offenseFull = hittingScore;
    }

    const positionScores = compute7UPositionScores(
      athletic,
      throwing,
      catching,
      fielding
    );

    const defenseFull = positionScores.defense_score;
    const pitchingFull = throwingScore ?? null;

    const overallFull = averageNonNull([
      athleticScore,
      hittingScore,
      throwingScore,
      catchingScore,
      fieldingScore,
    ]);

    const allDates = [
      athletic.performedAt,
      hitting.performedAt,
      throwing.performedAt,
      catching.performedAt,
      fielding.performedAt,
    ].filter((d): d is string => !!d);

    const lastUpdated =
      allDates.length > 0 ? allDates.sort().slice(-1)[0] : null;

    return res.json({
      player_id: playerId,
      age_group: "7U",
      last_updated: lastUpdated,
      components,
      aggregates: {
        overall_full_eval_score: overallFull,
        offense_full_eval_score: offenseFull,
        offense_hitting_component: hittingScore,
        offense_speed_component: speedScore,
        defense_full_eval_score: defenseFull,
        pitching_full_eval_score: pitchingFull,
        athletic_score: athleticScore,
        hitting_score: hittingScore,
        throwing_score: throwingScore,
        catching_score: catchingScore,
        fielding_score: fieldingScore,
        derived: {
          contact_score: contactScore,
          power_score: powerScore,
          strike_chance_percent: strikeChancePercent,
          speed_score: speedScore,
          position_scores: positionScores,
        },
      },
    });
  } catch (err) {
    console.error("Error building 7U full eval:", err);
    return res.status(500).json({ error: "Failed to build 7U full eval" });
  }
});


app.listen(port, () => {
  console.log(`BPOP backend listening on port ${port}`);
});
