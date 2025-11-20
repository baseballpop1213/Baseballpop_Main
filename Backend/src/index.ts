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
import { compute8URatings } from "./scoring/8u";
import { compute9URatings } from "./scoring/9u";
import { compute10URatings } from "./scoring/10u";
import { compute11URatings } from "./scoring/11u";
import { compute12URatings } from "./scoring/12u";
import { compute13URatings } from "./scoring/13u";
import { compute14URatings } from "./scoring/14u";
import { computeHSRatings } from "./scoring/hs";
import { computeCollegeRatings } from "./scoring/coll";
import { computeProRatings } from "./scoring/pro";

import {
  createEvalSession,
  getEvalSession,
  updateEvalSession,
} from "./evalProgress";


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

// Eval session progress (for in-progress evals)
app.post("/eval-sessions", requireAuth, createEvalSession);
app.get("/eval-sessions/:id", requireAuth, getEvalSession);
app.patch("/eval-sessions/:id", requireAuth, updateEvalSession);



type FullEvalCategoryKey =
  | "athletic"
  | "hitting"
  | "throwing"
  | "catching"
  | "fielding"
  | "pitching"
  | "catcher"
  | "first_base"
  | "infield"
  | "outfield";


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

function compute8UPositionScores(
  athletic: CategoryComponent,
  throwing: CategoryComponent,
  catching: CategoryComponent,
  fielding: CategoryComponent
): PositionScores5U {
  const FIELD_MAX = 50;          // category scores are 0–50
  const CATCH_MAX = 50;
  const SPEED_MAX = 50;

  const TSPEED_MAX = 27.5;       // tspeed40_points
  const TPITCH_MAX = 30;         // t40ft_points
  const C51B_MAX = 15;           // c51b_points
  const C1BST_MAX = 15;          // c1bst_points
  const RLC_MAX = 12;            // rlc*_points_total
  const SS1BT_MAX = 14.5;        // ifss1bt_points
  const LADDER_MAX = 25;         // c10x10_points
  const T80_MAX = 20;            // t80ft_points
  const CLD_MAX = 6;             // cld2b_points, cldss_points

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

  const tspeedPoints =
    typeof throwingTests.tspeed40_points === "number"
      ? throwingTests.tspeed40_points
      : null;
  const tpitchPoints =
    typeof throwingTests.t40ft_points === "number"
      ? throwingTests.t40ft_points
      : null;
  const t80ftPoints =
    typeof throwingTests.t80ft_points === "number"
      ? throwingTests.t80ft_points
      : null;

  const ladderPoints =
    typeof catchingTests.c10x10_points === "number"
      ? catchingTests.c10x10_points
      : null;
  const c51bPoints =
    typeof catchingTests.c51b_points === "number"
      ? catchingTests.c51b_points
      : null;
  const c1bstPoints =
    typeof catchingTests.c1bst_points === "number"
      ? catchingTests.c1bst_points
      : null;

  const rlc2bPoints =
    typeof fieldingTests.rlc2b_points_total === "number"
      ? fieldingTests.rlc2b_points_total
      : null;
  const rlcssPoints =
    typeof fieldingTests.rlcss_points_total === "number"
      ? fieldingTests.rlcss_points_total
      : null;
  const rlc3bPoints =
    typeof fieldingTests.rlc3b_points_total === "number"
      ? fieldingTests.rlc3b_points_total
      : null;

  const ifss1btPoints =
    typeof fieldingTests.ifss1bt_points === "number"
      ? fieldingTests.ifss1bt_points
      : null;

  const cld2bPoints =
    typeof catchingTests.cld2b_points === "number"
      ? catchingTests.cld2b_points
      : null;
  const cldssPoints =
    typeof catchingTests.cldss_points === "number"
      ? catchingTests.cldss_points
      : null;

  //
  // Pitcher = TSPEED + TPITCH
  //
  let pitcher: number | null = null;
  if (tspeedPoints != null && tpitchPoints != null) {
    const num = tspeedPoints + tpitchPoints;
    const den = TSPEED_MAX + TPITCH_MAX;
    pitcher = ratioToScore(num, den);
  } else if (throwingScore != null) {
    pitcher = throwingScore;
  }

  //
  // Catcher = CATCHINGSCORE (category catching score)
  //
  const catcherPos: number | null = catchingScore ?? null;

  //
  // 1B = C51B + C1BST
  //
  let firstBase: number | null = null;
  if (c51bPoints != null && c1bstPoints != null) {
    const num = c51bPoints + c1bstPoints;
    const den = C51B_MAX + C1BST_MAX;
    firstBase = ratioToScore(num, den);
  } else if (catchingScore != null) {
    firstBase = catchingScore;
  }

  //
  // 2B: FIELDINGSCORE (2X), CATCHINGSCORE(1X), RLC2B (2X)
  //
  let secondBase: number | null = null;
  if (
    fieldingScore != null &&
    catchingScore != null &&
    rlc2bPoints != null
  ) {
    const num =
      fieldingScore * 2 +
      catchingScore * 1 +
      rlc2bPoints * 2;
    const den =
      FIELD_MAX * 2 + CATCH_MAX * 1 + RLC_MAX * 2;
    secondBase = ratioToScore(num, den);
  }

  //
  // 3B: FIELDINGSCORE(2X), CATCHINGSCORE (1X), RLC3B (2X)
  //
  let thirdBase: number | null = null;
  if (
    fieldingScore != null &&
    catchingScore != null &&
    rlc3bPoints != null
  ) {
    const num =
      fieldingScore * 2 +
      catchingScore * 1 +
      rlc3bPoints * 2;
    const den =
      FIELD_MAX * 2 + CATCH_MAX * 1 + RLC_MAX * 2;
    thirdBase = ratioToScore(num, den);
  }

  //
  // SS: FIELDINGSCORE (2X), CATCHINGSCORE (1X), RLCSS (2X)
  //
  let shortstop: number | null = null;
  if (
    fieldingScore != null &&
    catchingScore != null &&
    rlcssPoints != null
  ) {
    const num =
      fieldingScore * 2 +
      catchingScore * 1 +
      rlcssPoints * 2;
    const den =
      FIELD_MAX * 2 + CATCH_MAX * 1 + RLC_MAX * 2;
    shortstop = ratioToScore(num, den);
  }

  //
  // Pitcher Helper: FIELDINGSCORE (2X), CATCHINGSCORE (1X)
  //
  let pitchersHelper: number | null = null;
  if (fieldingScore != null && catchingScore != null) {
    const num = fieldingScore * 2 + catchingScore * 1;
    const den = FIELD_MAX * 2 + CATCH_MAX * 1;
    pitchersHelper = ratioToScore(num, den);
  }

  //
  // LF: C10X10LD, T80FT, SPEEDSCORE
  //
  let leftField: number | null = null;
  if (ladderPoints != null && t80ftPoints != null && speedScore != null) {
    const num = ladderPoints + t80ftPoints + speedScore;
    const den = LADDER_MAX + T80_MAX + SPEED_MAX;
    leftField = ratioToScore(num, den);
  }

  //
  // RF: C10X10LD, RLCGB2B, CLD2B
  //
  let rightField: number | null = null;
  if (ladderPoints != null && rlc2bPoints != null && cld2bPoints != null) {
    const num = ladderPoints + rlc2bPoints + cld2bPoints;
    const den = LADDER_MAX + RLC_MAX + CLD_MAX;
    rightField = ratioToScore(num, den);
  }

  //
  // CF: C10X10LD, SPEEDSCORE
  //
  let centerField: number | null = null;
  if (ladderPoints != null && speedScore != null) {
    const num = ladderPoints + speedScore;
    const den = LADDER_MAX + SPEED_MAX;
    centerField = ratioToScore(num, den);
  }

  //
  // LC: C10X10LD, RLCGBSS, CLDSS
  //
  let leftCenter: number | null = null;
  if (ladderPoints != null && rlcssPoints != null && cldssPoints != null) {
    const num = ladderPoints + rlcssPoints + cldssPoints;
    const den = LADDER_MAX + RLC_MAX + CLD_MAX;
    leftCenter = ratioToScore(num, den);
  }

  //
  // RC: C10X10LD, SPEEDSCORE
  //
  let rightCenter: number | null = null;
  if (ladderPoints != null && speedScore != null) {
    const num = ladderPoints + speedScore;
    const den = LADDER_MAX + SPEED_MAX;
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

function compute9UPositionScores(
  athletic: CategoryComponent,
  throwing: CategoryComponent,
  catching: CategoryComponent,
  fielding: CategoryComponent
): PositionScores5U {
  // Max values, matching 9U scoring logic
  const FIELD_MAX = 50;          // category score
  const CATCH_MAX = 50;          // category score
  const SPEED_MAX = 50;          // category score

  const TSPEED_MAX = 30;         // tspeed45_points
  const TPITCH_MAX = 30;         // t45ft_points
  const CB2BT_MAX = 15;          // cb2bt_points
  const C5PCS_MAX = 10;          // c5pcs_points
  const C51B_MAX = 15;           // c51b_points
  const C1BST_MAX = 15;          // c1bst_points

  const RLC_MAX = 12;            // rlc*_points_total
  const SS1BT_MAX = 14.5;        // ifss1bt_points

  const T80_MAX = 20;            // t80ft_points
  const C15X15M_MAX = 20;        // c15x15m_points
  const CLD_MAX = 6;             // cld2b_points, cldss_points

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

  const tspeedPoints =
    typeof throwingTests.tspeed45_points === "number"
      ? throwingTests.tspeed45_points
      : null;
  const tpitchPoints =
    typeof throwingTests.t45ft_points === "number"
      ? throwingTests.t45ft_points
      : null;
  const t80ftPoints =
    typeof throwingTests.t80ft_points === "number"
      ? throwingTests.t80ft_points
      : null;
  const cb2btPoints =
    typeof throwingTests.cb2bt_points === "number"
      ? throwingTests.cb2bt_points
      : null;

  const c5pcsPoints =
    typeof catchingTests.c5pcs_points === "number"
      ? catchingTests.c5pcs_points
      : null;
  const c51bPoints =
    typeof catchingTests.c51b_points === "number"
      ? catchingTests.c51b_points
      : null;
  const c1bstPoints =
    typeof catchingTests.c1bst_points === "number"
      ? catchingTests.c1bst_points
      : null;
  const c15x15mPoints =
    typeof catchingTests.c15x15m_points === "number"
      ? catchingTests.c15x15m_points
      : null;

  const rlc2bPoints =
    typeof fieldingTests.rlc2b_points_total === "number"
      ? fieldingTests.rlc2b_points_total
      : null;
  const rlcssPoints =
    typeof fieldingTests.rlcss_points_total === "number"
      ? fieldingTests.rlcss_points_total
      : null;
  const rlc3bPoints =
    typeof fieldingTests.rlc3b_points_total === "number"
      ? fieldingTests.rlc3b_points_total
      : null;

  const ifss1btPoints =
    typeof fieldingTests.ifss1bt_points === "number"
      ? fieldingTests.ifss1bt_points
      : null;

  const cld2bPoints =
    typeof catchingTests.cld2b_points === "number"
      ? catchingTests.cld2b_points
      : null;
  const cldssPoints =
    typeof catchingTests.cldss_points === "number"
      ? catchingTests.cldss_points
      : null;

  //
  // PITCHER
  //
  let pitcher: number | null = null;
  if (tspeedPoints != null && tpitchPoints != null) {
    const num = tspeedPoints + tpitchPoints;
    const den = TSPEED_MAX + TPITCH_MAX;
    pitcher = ratioToScore(num, den);
  } else if (throwingScore != null) {
    // Fallback: use category throwing score if detailed tests are missing
    pitcher = throwingScore;
  }

  //
  // CATCHER
  //
  let catcherPos: number | null = null;
  if (c5pcsPoints != null && cb2btPoints != null) {
    const num = c5pcsPoints + cb2btPoints;
    const den = C5PCS_MAX + CB2BT_MAX;
    catcherPos = ratioToScore(num, den);
  } else if (catchingScore != null) {
    catcherPos = catchingScore;
  }

  //
  // 1B
  // Tests used: C51B, C1BST
  //
  let firstBase: number | null = null;
  if (c51bPoints != null && c1bstPoints != null) {
    const num = c51bPoints + c1bstPoints;
    const den = C51B_MAX + C1BST_MAX;
    firstBase = ratioToScore(num, den);
  } else if (catchingScore != null) {
    firstBase = catchingScore;
  }

  //
  // 2B
  // FIELDINGSCORE (2X), CATCHINGSCORE (1X), RLC2B (2X), SS1BT (1X)
  //
  let secondBase: number | null = null;
  if (
    fieldingScore != null &&
    catchingScore != null &&
    rlc2bPoints != null &&
    ifss1btPoints != null
  ) {
    const num =
      fieldingScore * 2 +
      catchingScore * 1 +
      rlc2bPoints * 2 +
      ifss1btPoints * 1;
    const den =
      FIELD_MAX * 2 + CATCH_MAX * 1 + RLC_MAX * 2 + SS1BT_MAX * 1;
    secondBase = ratioToScore(num, den);
  }

  //
  // 3B
  // FIELDINGSCORE (2X), CATCHINGSCORE (1X), RLC3B (2X), SS1BT (1X)
  //
  let thirdBase: number | null = null;
  if (
    fieldingScore != null &&
    catchingScore != null &&
    rlc3bPoints != null &&
    ifss1btPoints != null
  ) {
    const num =
      fieldingScore * 2 +
      catchingScore * 1 +
      rlc3bPoints * 2 +
      ifss1btPoints * 1;
    const den =
      FIELD_MAX * 2 + CATCH_MAX * 1 + RLC_MAX * 2 + SS1BT_MAX * 1;
    thirdBase = ratioToScore(num, den);
  }

  //
  // SS
  // FIELDINGSCORE (2X), CATCHINGSCORE (1X), RLCSS (2X), SS1BT (1X)
  //
  let shortstop: number | null = null;
  if (
    fieldingScore != null &&
    catchingScore != null &&
    rlcssPoints != null &&
    ifss1btPoints != null
  ) {
    const num =
      fieldingScore * 2 +
      catchingScore * 1 +
      rlcssPoints * 2 +
      ifss1btPoints * 1;
    const den =
      FIELD_MAX * 2 + CATCH_MAX * 1 + RLC_MAX * 2 + SS1BT_MAX * 1;
    shortstop = ratioToScore(num, den);
  }

  //
  // Pitcher Helper
  // FIELDINGSCORE (2X), CATCHINGSCORE (1X)
  //
  let pitchersHelper: number | null = null;
  if (fieldingScore != null && catchingScore != null) {
    const num = fieldingScore * 2 + catchingScore * 1;
    const den = FIELD_MAX * 2 + CATCH_MAX * 1;
    pitchersHelper = ratioToScore(num, den);
  }

  //
  // LF
  // C15X15M, T80FT, SPEEDSCORE
  //
  let leftField: number | null = null;
  if (c15x15mPoints != null && t80ftPoints != null && speedScore != null) {
    const num = c15x15mPoints + t80ftPoints + speedScore;
    const den = C15X15M_MAX + T80_MAX + SPEED_MAX;
    leftField = ratioToScore(num, den);
  }

  //
  // RF
  // C15X15M, RLCGB2B, CLD2B
  //
  let rightField: number | null = null;
  if (c15x15mPoints != null && rlc2bPoints != null && cld2bPoints != null) {
    const num = c15x15mPoints + rlc2bPoints + cld2bPoints;
    const den = C15X15M_MAX + RLC_MAX + CLD_MAX;
    rightField = ratioToScore(num, den);
  }

  //
  // CF
  // C15X15M, SPEEDSCORE
  //
  let centerField: number | null = null;
  if (c15x15mPoints != null && speedScore != null) {
    const num = c15x15mPoints + speedScore;
    const den = C15X15M_MAX + SPEED_MAX;
    centerField = ratioToScore(num, den);
  }

  //
  // LC
  // C15X15M, RLCGBSS, CLDSS
  //
  let leftCenter: number | null = null;
  if (c15x15mPoints != null && rlcssPoints != null && cldssPoints != null) {
    const num = c15x15mPoints + rlcssPoints + cldssPoints;
    const den = C15X15M_MAX + RLC_MAX + CLD_MAX;
    leftCenter = ratioToScore(num, den);
  }

  //
  // RC
  // C15X15M, SPEEDSCORE
  //
  let rightCenter: number | null = null;
  if (c15x15mPoints != null && speedScore != null) {
    const num = c15x15mPoints + speedScore;
    const den = C15X15M_MAX + SPEED_MAX;
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

function compute10UPositionScores(
  athletic: CategoryComponent,
  pitching: CategoryComponent,
  catcher: CategoryComponent,
  firstBase: CategoryComponent,
  infield: CategoryComponent,
  outfield: CategoryComponent
): PositionScores5U {
  const EVAL_MAX = 50;      // all eval categories are 0–50
  const SPEED_MAX = 50;
  const RLC_MAX = 12;       // RLC grounder total per spot
  const SS1BT_MAX = 14.5;   // SS to 1B time points
  const T80_MAX = 20;       // 80 ft throw points
  const OFGBHT_MAX = 14.5;  // OF ground ball home time points

  const athleticTests =
    athletic.breakdown && athletic.breakdown.athletic
      ? athletic.breakdown.athletic.tests || {}
      : {};

  const infieldSection =
    infield.breakdown && (infield.breakdown as any).infield
      ? (infield.breakdown as any).infield
      : null;
  const infieldTests = infieldSection ? infieldSection.tests || {} : {};

  const outfieldSection =
    outfield.breakdown && (outfield.breakdown as any).outfield
      ? (outfield.breakdown as any).outfield
      : null;
  const outfieldTests = outfieldSection ? outfieldSection.tests || {} : {};

  const speedScore =
    typeof athleticTests.speed_score === "number"
      ? athleticTests.speed_score
      : null;

  const pitcherScore =
    typeof pitching.score === "number" ? pitching.score : null;
  const catcherScore =
    typeof catcher.score === "number" ? catcher.score : null;
  const firstBaseScore =
    typeof firstBase.score === "number" ? firstBase.score : null;
  const infieldScoreVal =
    typeof infield.score === "number" ? infield.score : null;
  const outfieldScoreVal =
    typeof outfield.score === "number" ? outfield.score : null;

  const rlc2bPoints =
    typeof infieldTests.rlc2b_points_total === "number"
      ? infieldTests.rlc2b_points_total
      : null;
  const rlc3bPoints =
    typeof infieldTests.rlc3b_points_total === "number"
      ? infieldTests.rlc3b_points_total
      : null;
  const rlcssPoints =
    typeof infieldTests.rlcss_points_total === "number"
      ? infieldTests.rlcss_points_total
      : null;
  const ss1btPoints =
    typeof infieldTests.ifss1bt_points === "number"
      ? infieldTests.ifss1bt_points
      : null;

  const t80ftPoints =
    typeof outfieldTests.t80ft_points === "number"
      ? outfieldTests.t80ft_points
      : null;
  const ofgbhtPoints =
    typeof outfieldTests.ofgbht_points === "number"
      ? outfieldTests.ofgbht_points
      : null;

  // --- Position formulas ---

  // Pitcher = Pitching Eval
  const pitcher = pitcherScore ?? null;

  // Catcher = Catcher Eval
  const catcherPos = catcherScore ?? null;

  // 1B = First Base Eval
  const first_base = firstBaseScore ?? null;

  // 2B = Infield Eval, RLC2B, SS1BT
  let second_base: number | null = null;
  if (infieldScoreVal != null && rlc2bPoints != null && ss1btPoints != null) {
    const num = infieldScoreVal * 2 + rlc2bPoints * 2 + ss1btPoints;
    const den = EVAL_MAX * 2 + RLC_MAX * 2 + SS1BT_MAX;
    second_base = ratioToScore(num, den);
  }

  // 3B = Infield Eval, RLC3B, SS1BT
  let third_base: number | null = null;
  if (infieldScoreVal != null && rlc3bPoints != null && ss1btPoints != null) {
    const num = infieldScoreVal * 2 + rlc3bPoints * 2 + ss1btPoints;
    const den = EVAL_MAX * 2 + RLC_MAX * 2 + SS1BT_MAX;
    third_base = ratioToScore(num, den);
  }

  // SS = Infield Eval, RLCSS, SS1BT
  let shortstop: number | null = null;
  if (infieldScoreVal != null && rlcssPoints != null && ss1btPoints != null) {
    const num = infieldScoreVal * 2 + rlcssPoints * 2 + ss1btPoints;
    const den = EVAL_MAX * 2 + RLC_MAX * 2 + SS1BT_MAX;
    shortstop = ratioToScore(num, den);
  }

  // LF = OF Eval, T80FT
  let left_field: number | null = null;
  if (outfieldScoreVal != null && t80ftPoints != null) {
    const num = outfieldScoreVal + t80ftPoints;
    const den = EVAL_MAX + T80_MAX;
    left_field = ratioToScore(num, den);
  }

  // RF = OF Eval, OFGBHT
  let right_field: number | null = null;
  if (outfieldScoreVal != null && ofgbhtPoints != null) {
    const num = outfieldScoreVal + ofgbhtPoints;
    const den = EVAL_MAX + OFGBHT_MAX;
    right_field = ratioToScore(num, den);
  }

  // CF = OF Eval, SPEEDSCORE
  let center_field: number | null = null;
  if (outfieldScoreVal != null && speedScore != null) {
    const num = outfieldScoreVal + speedScore;
    const den = EVAL_MAX + SPEED_MAX;
    center_field = ratioToScore(num, den);
  }

  // LC = OF Eval, RLCGBSS (we use RLC SS total)
  let left_center: number | null = null;
  if (outfieldScoreVal != null && rlcssPoints != null) {
    const num = outfieldScoreVal + rlcssPoints;
    const den = EVAL_MAX + RLC_MAX;
    left_center = ratioToScore(num, den);
  }

  // RC = OF Eval, SPEEDSCORE
  let right_center: number | null = null;
  if (outfieldScoreVal != null && speedScore != null) {
    const num = outfieldScoreVal + speedScore;
    const den = EVAL_MAX + SPEED_MAX;
    right_center = ratioToScore(num, den);
  }

  // Infield = average of all infield positions
  const infield_score = averageNonNull([
    pitcher,
    catcherPos,
    first_base,
    second_base,
    third_base,
    shortstop,
  ]);

  // Outfield = average of all outfield positions
  const outfield_score = averageNonNull([
    left_field,
    right_field,
    left_center,
    right_center,
    center_field,
  ]);

  // Overall defense = average of all defensive position scores
  const defense_score = averageNonNull([
    pitcher,
    catcherPos,
    first_base,
    second_base,
    third_base,
    shortstop,
    left_field,
    right_field,
    left_center,
    right_center,
    center_field,
  ]);

  return {
    pitcher,
    catcher: catcherPos,
    first_base,
    second_base,
    third_base,
    shortstop,
    pitchers_helper: null, // not used at 10U
    left_field,
    right_field,
    left_center,
    right_center,
    center_field,
    infield_score,
    outfield_score,
    defense_score,
  };
}

function compute12UPositionScores(
  athletic: CategoryComponent,
  pitching: CategoryComponent,
  catcher: CategoryComponent,
  firstBase: CategoryComponent,
  infield: CategoryComponent,
  outfield: CategoryComponent
): PositionScores5U {
  const EVAL_MAX = 50;      // all eval categories are 0–50
  const SPEED_MAX = 50;
  const RLC_MAX = 12;       // RLC grounder total per spot
  const SS1BT_MAX = 14.5;   // SS to 1B time points
  const T100_MAX = 20;      // 100 ft throw points
  const OFGBHT_MAX = 14.5;  // OF ground ball home time points

  const athleticTests =
    athletic.breakdown && athletic.breakdown.athletic
      ? athletic.breakdown.athletic.tests || {}
      : {};

  const infieldSection =
    infield.breakdown && (infield.breakdown as any).infield
      ? (infield.breakdown as any).infield
      : null;
  const infieldTests = infieldSection ? infieldSection.tests || {} : {};

  const outfieldSection =
    outfield.breakdown && (outfield.breakdown as any).outfield
      ? (outfield.breakdown as any).outfield
      : null;
  const outfieldTests = outfieldSection ? outfieldSection.tests || {} : {};

  const speedScore =
    typeof athleticTests.speed_score === "number"
      ? athleticTests.speed_score
      : null;

  const pitcherScore =
    typeof pitching.score === "number" ? pitching.score : null;
  const catcherScore =
    typeof catcher.score === "number" ? catcher.score : null;
  const firstBaseScore =
    typeof firstBase.score === "number" ? firstBase.score : null;
  const infieldScoreVal =
    typeof infield.score === "number" ? infield.score : null;
  const outfieldScoreVal =
    typeof outfield.score === "number" ? outfield.score : null;

  const rlc2bPoints =
    typeof infieldTests.rlc2b_points_total === "number"
      ? infieldTests.rlc2b_points_total
      : null;
  const rlc3bPoints =
    typeof infieldTests.rlc3b_points_total === "number"
      ? infieldTests.rlc3b_points_total
      : null;
  const rlcssPoints =
    typeof infieldTests.rlcss_points_total === "number"
      ? infieldTests.rlcss_points_total
      : null;
  const ss1btPoints =
    typeof infieldTests.ifss1bt_points === "number"
      ? infieldTests.ifss1bt_points
      : null;

  const t100ftPoints =
    typeof outfieldTests.t100ft_points === "number"
      ? outfieldTests.t100ft_points
      : null;
  const ofgbhtPoints =
    typeof outfieldTests.ofgbht_points === "number"
      ? outfieldTests.ofgbht_points
      : null;

  // --- Position formulas (12U+) ---

  // Pitcher = Pitching Eval
  const pitcher = pitcherScore ?? null;

  // Catcher = Catcher Eval
  const catcherPos = catcherScore ?? null;

  // 1B = First Base Eval
  const first_base = firstBaseScore ?? null;

  // 2B = Infield Eval, RLC2B, SS1BT
  let second_base: number | null = null;
  if (infieldScoreVal != null && rlc2bPoints != null && ss1btPoints != null) {
    const num = infieldScoreVal * 2 + rlc2bPoints * 2 + ss1btPoints;
    const den = EVAL_MAX * 2 + RLC_MAX * 2 + SS1BT_MAX;
    second_base = ratioToScore(num, den);
  }

  // 3B = Infield Eval, RLC3B, SS1BT
  let third_base: number | null = null;
  if (infieldScoreVal != null && rlc3bPoints != null && ss1btPoints != null) {
    const num = infieldScoreVal * 2 + rlc3bPoints * 2 + ss1btPoints;
    const den = EVAL_MAX * 2 + RLC_MAX * 2 + SS1BT_MAX;
    third_base = ratioToScore(num, den);
  }

  // SS = Infield Eval, RLCSS, SS1BT
  let shortstop: number | null = null;
  if (infieldScoreVal != null && rlcssPoints != null && ss1btPoints != null) {
    const num = infieldScoreVal * 2 + rlcssPoints * 2 + ss1btPoints;
    const den = EVAL_MAX * 2 + RLC_MAX * 2 + SS1BT_MAX;
    shortstop = ratioToScore(num, den);
  }

  // LF = OF Eval, T100FT
  let left_field: number | null = null;
  if (outfieldScoreVal != null && t100ftPoints != null) {
    const num = outfieldScoreVal + t100ftPoints;
    const den = EVAL_MAX + T100_MAX;
    left_field = ratioToScore(num, den);
  }

  // RF = OF Eval, OFGBHT
  let right_field: number | null = null;
  if (outfieldScoreVal != null && ofgbhtPoints != null) {
    const num = outfieldScoreVal + ofgbhtPoints;
    const den = EVAL_MAX + OFGBHT_MAX;
    right_field = ratioToScore(num, den);
  }

  // CF = OF Eval, SPEEDSCORE
  let center_field: number | null = null;
  if (outfieldScoreVal != null && speedScore != null) {
    const num = outfieldScoreVal + speedScore;
    const den = EVAL_MAX + SPEED_MAX;
    center_field = ratioToScore(num, den);
  }

  // LC = OF Eval, RLCGBSS (RLC SS total)
  let left_center: number | null = null;
  if (outfieldScoreVal != null && rlcssPoints != null) {
    const num = outfieldScoreVal + rlcssPoints;
    const den = EVAL_MAX + RLC_MAX;
    left_center = ratioToScore(num, den);
  }

  // RC = OF Eval, SPEEDSCORE
  let right_center: number | null = null;
  if (outfieldScoreVal != null && speedScore != null) {
    const num = outfieldScoreVal + speedScore;
    const den = EVAL_MAX + SPEED_MAX;
    right_center = ratioToScore(num, den);
  }

  // Infield = average of all infield positions (1B, 2B, 3B, SS)
  const infield_score = averageNonNull([
    first_base,
    second_base,
    third_base,
    shortstop,
  ]);

  // Outfield = average of all outfield positions
  const outfield_score = averageNonNull([
    left_field,
    right_field,
    left_center,
    right_center,
    center_field,
  ]);

  // Overall defense = average of all defensive position scores
  const defense_score = averageNonNull([
    pitcher,
    catcherPos,
    first_base,
    second_base,
    third_base,
    shortstop,
    left_field,
    right_field,
    left_center,
    right_center,
    center_field,
  ]);

  return {
    pitcher,
    catcher: catcherPos,
    first_base,
    second_base,
    third_base,
    shortstop,
    pitchers_helper: null, // not used at 12U
    left_field,
    right_field,
    left_center,
    right_center,
    center_field,
    infield_score,
    outfield_score,
    defense_score,
  };
}

function compute13UPositionScores(
  athletic: CategoryComponent,
  pitching: CategoryComponent,
  catcher: CategoryComponent,
  firstBase: CategoryComponent,
  infield: CategoryComponent,
  outfield: CategoryComponent
): PositionScores5U {
  // 13U uses the same position-score logic as 12U
  return compute12UPositionScores(
    athletic,
    pitching,
    catcher,
    firstBase,
    infield,
    outfield
  );
}

function compute14UPositionScores(
  athletic: CategoryComponent,
  pitching: CategoryComponent,
  catcher: CategoryComponent,
  firstBase: CategoryComponent,
  infield: CategoryComponent,
  outfield: CategoryComponent
): PositionScores5U {
  // 14U uses the same position-score logic as 12U/13U
  return compute12UPositionScores(
    athletic,
    pitching,
    catcher,
    firstBase,
    infield,
    outfield
  );
}


function computeHSPositionScores(
  athletic: CategoryComponent,
  pitching: CategoryComponent,
  catcher: CategoryComponent,
  firstBase: CategoryComponent,
  infield: CategoryComponent,
  outfield: CategoryComponent
): PositionScores5U {
  const EVAL_MAX = 50;      // all eval categories are 0–50
  const SPEED_MAX = 50;
  const RLC_MAX = 12;       // RLC grounder total per spot
  const SS1BT_MAX = 14.5;   // SS to 1B time points
  const T120_MAX = 20;      // 120 ft throw points
  const OFGBHT_MAX = 15;    // OF ground ball home time points (updated max)

  const athleticTests =
    athletic.breakdown && athletic.breakdown.athletic
      ? athletic.breakdown.athletic.tests || {}
      : {};

  const infieldSection =
    infield.breakdown && (infield.breakdown as any).infield
      ? (infield.breakdown as any).infield
      : null;
  const infieldTests = infieldSection ? infieldSection.tests || {} : {};

  const outfieldSection =
    outfield.breakdown && (outfield.breakdown as any).outfield
      ? (outfield.breakdown as any).outfield
      : null;
  const outfieldTests = outfieldSection ? outfieldSection.tests || {} : {};

  const speedScore =
    typeof athleticTests.speed_score === "number"
      ? athleticTests.speed_score
      : null;

  const pitcherScore =
    typeof pitching.score === "number" ? pitching.score : null;
  const catcherScore =
    typeof catcher.score === "number" ? catcher.score : null;
  const firstBaseScore =
    typeof firstBase.score === "number" ? firstBase.score : null;
  const infieldScoreVal =
    typeof infield.score === "number" ? infield.score : null;
  const outfieldScoreVal =
    typeof outfield.score === "number" ? outfield.score : null;

  const rlc2bPoints =
    typeof infieldTests.rlc2b_points_total === "number"
      ? infieldTests.rlc2b_points_total
      : null;
  const rlc3bPoints =
    typeof infieldTests.rlc3b_points_total === "number"
      ? infieldTests.rlc3b_points_total
      : null;
  const rlcssPoints =
    typeof infieldTests.rlcss_points_total === "number"
      ? infieldTests.rlcss_points_total
      : null;
  const ss1btPoints =
    typeof infieldTests.ifss1bt_points === "number"
      ? infieldTests.ifss1bt_points
      : null;

  const t120ftPoints =
    typeof outfieldTests.t120ft_points === "number"
      ? outfieldTests.t120ft_points
      : null;
  const ofgbhtPoints =
    typeof outfieldTests.ofgbht_points === "number"
      ? outfieldTests.ofgbht_points
      : null;

  // --- Position formulas (HS) ---

  // Pitcher = Pitching Eval
  const pitcher = pitcherScore ?? null;

  // Catcher = Catcher Eval
  const catcherPos = catcherScore ?? null;

  // 1B = First Base Eval
  const first_base = firstBaseScore ?? null;

  // 2B = Infield Eval, RLC2B, SS1BT
  let second_base: number | null = null;
  if (infieldScoreVal != null && rlc2bPoints != null && ss1btPoints != null) {
    const num = infieldScoreVal * 2 + rlc2bPoints * 2 + ss1btPoints;
    const den = EVAL_MAX * 2 + RLC_MAX * 2 + SS1BT_MAX;
    second_base = ratioToScore(num, den);
  }

  // 3B = Infield Eval, RLC3B, SS1BT
  let third_base: number | null = null;
  if (infieldScoreVal != null && rlc3bPoints != null && ss1btPoints != null) {
    const num = infieldScoreVal * 2 + rlc3bPoints * 2 + ss1btPoints;
    const den = EVAL_MAX * 2 + RLC_MAX * 2 + SS1BT_MAX;
    third_base = ratioToScore(num, den);
  }

  // SS = Infield Eval, RLCSS, SS1BT
  let shortstop: number | null = null;
  if (infieldScoreVal != null && rlcssPoints != null && ss1btPoints != null) {
    const num = infieldScoreVal * 2 + rlcssPoints * 2 + ss1btPoints;
    const den = EVAL_MAX * 2 + RLC_MAX * 2 + SS1BT_MAX;
    shortstop = ratioToScore(num, den);
  }

  // LF = OF Eval, T120FT
  let left_field: number | null = null;
  if (outfieldScoreVal != null && t120ftPoints != null) {
    const num = outfieldScoreVal + t120ftPoints;
    const den = EVAL_MAX + T120_MAX;
    left_field = ratioToScore(num, den);
  }

  // RF = OF Eval, OFGBHT
  let right_field: number | null = null;
  if (outfieldScoreVal != null && ofgbhtPoints != null) {
    const num = outfieldScoreVal + ofgbhtPoints;
    const den = EVAL_MAX + OFGBHT_MAX;
    right_field = ratioToScore(num, den);
  }

  // CF = OF Eval, SPEEDSCORE
  let center_field: number | null = null;
  if (outfieldScoreVal != null && speedScore != null) {
    const num = outfieldScoreVal + speedScore;
    const den = EVAL_MAX + SPEED_MAX;
    center_field = ratioToScore(num, den);
  }

  // LC = OF Eval, RLCGBSS (RLC SS total)
  let left_center: number | null = null;
  if (outfieldScoreVal != null && rlcssPoints != null) {
    const num = outfieldScoreVal + rlcssPoints;
    const den = EVAL_MAX + RLC_MAX;
    left_center = ratioToScore(num, den);
  }

  // RC = OF Eval, SPEEDSCORE
  let right_center: number | null = null;
  if (outfieldScoreVal != null && speedScore != null) {
    const num = outfieldScoreVal + speedScore;
    const den = EVAL_MAX + SPEED_MAX;
    right_center = ratioToScore(num, den);
  }

  // Infield = average of all infield positions (1B, 2B, 3B, SS)
  const infield_score = averageNonNull([
    first_base,
    second_base,
    third_base,
    shortstop,
  ]);

  // Outfield = average of all outfield positions
  const outfield_score = averageNonNull([
    left_field,
    right_field,
    left_center,
    right_center,
    center_field,
  ]);

  // Overall defense = average of all defensive position scores
  const defense_score = averageNonNull([
    pitcher,
    catcherPos,
    first_base,
    second_base,
    third_base,
    shortstop,
    left_field,
    right_field,
    left_center,
    right_center,
    center_field,
  ]);

  return {
    pitcher,
    catcher: catcherPos,
    first_base,
    second_base,
    third_base,
    shortstop,
    pitchers_helper: null, // not used at HS
    left_field,
    right_field,
    left_center,
    right_center,
    center_field,
    infield_score,
    outfield_score,
    defense_score,
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

  const ageLabel = ageGroup.label;

  // Only 5U–14U + HS + College are implemented with scoring right now
  if (
    ageLabel !== "5U" &&
    ageLabel !== "6U" &&
    ageLabel !== "7U" &&
    ageLabel !== "8U" &&
    ageLabel !== "9U" &&
    ageLabel !== "10U" &&
    ageLabel !== "11U" &&
    ageLabel !== "12U" &&
    ageLabel !== "13U" &&
    ageLabel !== "14U" &&
    ageLabel !== "HS" &&
    ageLabel !== "College" &&
    ageLabel !== "Pro"
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

  let ratings: RatingResult;

  if (ageLabel === "5U") {
    ratings = compute5URatings(metricMap);
  } else if (ageLabel === "6U") {
    ratings = compute6URatings(metricMap);
  } else if (ageLabel === "7U") {
    ratings = compute7URatings(metricMap);
  } else if (ageLabel === "8U") {
    ratings = compute8URatings(metricMap);
  } else if (ageLabel === "9U") {
    ratings = compute9URatings(metricMap);
  } else if (ageLabel === "10U") {
    ratings = compute10URatings(metricMap);
  } else if (ageLabel === "11U") {
    ratings = compute11URatings(metricMap);
  } else if (ageLabel === "12U") {
    ratings = compute12URatings(metricMap);
  } else if (ageLabel === "13U") {
    ratings = compute13URatings(metricMap);
  } else if (ageLabel === "14U") {
    ratings = compute14URatings(metricMap);
  } else if (ageLabel === "HS") {
    ratings = computeHSRatings(metricMap);
  } else if (ageLabel === "College") {
    ratings = computeCollegeRatings(metricMap);
  } else if (ageLabel === "Pro") {
    ratings = computeProRatings(metricMap);
  } else {
    throw new Error(`Unsupported age group: ${ageLabel}`);
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

app.get("/players/:id/evals/8u-full", async (req, res) => {
  const playerId = req.params.id;

  try {
    const [athletic, hitting, throwing, catching, fielding] =
      await Promise.all([
        fetchLatestCategoryRating(playerId, "8U Athletic Skills", "athletic"),
        fetchLatestCategoryRating(playerId, "8U Hitting Skills", "hitting"),
        fetchLatestCategoryRating(playerId, "8U Throwing Skills", "throwing"),
        fetchLatestCategoryRating(playerId, "8U Catching Skills", "catching"),
        fetchLatestCategoryRating(playerId, "8U Fielding Skills", "fielding"),
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

    const positionScores = compute8UPositionScores(
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
      age_group: "8U",
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
    console.error("Error building 8U full eval:", err);
    return res.status(500).json({ error: "Failed to build 8U full eval" });
  }
});

app.get("/players/:playerId/evals/9u-full", async (req, res) => {
  const playerId = req.params.playerId;

  try {
    const [athletic, hitting, throwing, catching, fielding] =
      await Promise.all([
        fetchLatestCategoryRating(playerId, "9U Athletic Skills", "athletic"),
        fetchLatestCategoryRating(playerId, "9U Hitting Skills", "hitting"),
        fetchLatestCategoryRating(
          playerId,
          "9U Throwing & Pitching",
          "throwing"
        ),
        fetchLatestCategoryRating(playerId, "9U Catching Skills", "catching"),
        fetchLatestCategoryRating(playerId, "9U Fielding Skills", "fielding"),
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
      offenseFull =
        Math.round((0.8 * hittingScore + 0.2 * speedScore) * 10) / 10;
    } else if (hittingScore != null) {
      offenseFull = hittingScore;
    }

    const positionScores = compute9UPositionScores(
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
      age_group: "9U",
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
    console.error("Error building 9U full eval:", err);
    return res.status(500).json({ error: "Failed to build 9U full eval" });
  }
});

app.get("/players/:id/evals/10u-full", async (req, res) => {
  const playerId = req.params.id;

  try {
    const [
      athletic,
      hitting,
      pitchingEval,
      catcherEval,
      firstBaseEval,
      infieldEval,
      outfieldEval,
    ] = await Promise.all([
      fetchLatestCategoryRating(playerId, "10U Athletic Skills", "athletic"),
      fetchLatestCategoryRating(playerId, "10U Hitting Skills", "hitting"),
      fetchLatestCategoryRating(playerId, "10U Pitching Eval", "pitching"),
      fetchLatestCategoryRating(playerId, "10U Catcher Eval", "catcher"),
      fetchLatestCategoryRating(playerId, "10U First Base Eval", "first_base"),
      fetchLatestCategoryRating(playerId, "10U Infield Eval", "infield"),
      fetchLatestCategoryRating(playerId, "10U Outfield Eval", "outfield"),
    ]);

    const components = {
      athletic,
      hitting,
      pitching: pitchingEval,
      catcher: catcherEval,
      first_base: firstBaseEval,
      infield: infieldEval,
      outfield: outfieldEval,
    };

    const athleticScore = athletic.score;
    const hittingScore = hitting.score;
    const pitchingScore = pitchingEval.score;
    const catcherScore = catcherEval.score;
    const firstBaseScore = firstBaseEval.score;
    const infieldScore = infieldEval.score;
    const outfieldScore = outfieldEval.score;

    const hittingTests =
      hitting.breakdown && hitting.breakdown.hitting
        ? hitting.breakdown.hitting.tests || {}
        : {};

    const athleticTests =
      athletic.breakdown && athletic.breakdown.athletic
        ? athletic.breakdown.athletic.tests || {}
        : {};

    const pitchingTests =
      pitchingEval.breakdown && (pitchingEval.breakdown as any).pitching
        ? (pitchingEval.breakdown as any).pitching.tests || {}
        : {};

    const contactScore =
      typeof hittingTests.contact_score === "number"
        ? hittingTests.contact_score
        : null;

    const powerScore =
      typeof hittingTests.power_score === "number"
        ? hittingTests.power_score
        : null;

    const speedScore =
      typeof athleticTests.speed_score === "number"
        ? athleticTests.speed_score
        : null;

    const strikeChancePercent =
      typeof pitchingTests.strike_chance_percent === "number"
        ? pitchingTests.strike_chance_percent
        : null;

    // Offense: 80% hitting + 20% speed (when both available)
    let offenseFull: number | null = null;
    if (hittingScore != null && speedScore != null) {
      offenseFull = Math.round((0.8 * hittingScore + 0.2 * speedScore) * 10) / 10;
    } else if (hittingScore != null) {
      offenseFull = hittingScore;
    }

    const positionScores = compute10UPositionScores(
      athletic,
      pitchingEval,
      catcherEval,
      firstBaseEval,
      infieldEval,
      outfieldEval
    );

    const defenseFull = positionScores.defense_score;
    const pitchingFull = pitchingScore ?? null;

    const overallFull = averageNonNull([
      athleticScore,
      hittingScore,
      pitchingScore,
      catcherScore,
      firstBaseScore,
      infieldScore,
      outfieldScore,
    ]);

    const allDates = [
      athletic.performedAt,
      hitting.performedAt,
      pitchingEval.performedAt,
      catcherEval.performedAt,
      firstBaseEval.performedAt,
      infieldEval.performedAt,
      outfieldEval.performedAt,
    ].filter((d): d is string => !!d);

    const lastUpdated =
      allDates.length > 0 ? allDates.sort().slice(-1)[0] : null;

    return res.json({
      player_id: playerId,
      age_group: "10U",
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
        throwing_score: pitchingScore, // keep this field consistent with prior age groups
        catching_score: catcherScore,
        fielding_score: infieldScore, // map "fielding" → infield eval at 10U
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
    console.error("Error building 10U full eval:", err);
    return res.status(500).json({ error: "Failed to build 10U full eval" });
  }
});

app.get("/players/:id/evals/11u-full", async (req, res) => {
  const playerId = req.params.id;

  try {
    const [
      athletic,
      hitting,
      pitchingEval,
      catcherEval,
      firstBaseEval,
      infieldEval,
      outfieldEval,
    ] = await Promise.all([
      fetchLatestCategoryRating(playerId, "11U Athletic Skills", "athletic"),
      fetchLatestCategoryRating(playerId, "11U Hitting Skills", "hitting"),
      fetchLatestCategoryRating(playerId, "11U Pitching Eval", "pitching"),
      fetchLatestCategoryRating(playerId, "11U Catcher Eval", "catcher"),
      fetchLatestCategoryRating(playerId, "11U First Base Eval", "first_base"),
      fetchLatestCategoryRating(playerId, "11U Infield Eval", "infield"),
      fetchLatestCategoryRating(playerId, "11U Outfield Eval", "outfield"),
    ]);

    const components = {
      athletic,
      hitting,
      pitching: pitchingEval,
      catcher: catcherEval,
      first_base: firstBaseEval,
      infield: infieldEval,
      outfield: outfieldEval,
    };

    const athleticScore = athletic.score;
    const hittingScore = hitting.score;
    const pitchingScore = pitchingEval.score;
    const catcherScore = catcherEval.score;
    const firstBaseScore = firstBaseEval.score;
    const infieldScore = infieldEval.score;
    const outfieldScore = outfieldEval.score;

    const hittingTests =
      hitting.breakdown && hitting.breakdown.hitting
        ? hitting.breakdown.hitting.tests || {}
        : {};

    const athleticTests =
      athletic.breakdown && athletic.breakdown.athletic
        ? athletic.breakdown.athletic.tests || {}
        : {};

    const pitchingTests =
      pitchingEval.breakdown && (pitchingEval.breakdown as any).pitching
        ? (pitchingEval.breakdown as any).pitching.tests || {}
        : {};

    const contactScore =
      typeof hittingTests.contact_score === "number"
        ? hittingTests.contact_score
        : null;

    const powerScore =
      typeof hittingTests.power_score === "number"
        ? hittingTests.power_score
        : null;

    const speedScore =
      typeof athleticTests.speed_score === "number"
        ? athleticTests.speed_score
        : null;

    const strikeChancePercent =
      typeof pitchingTests.strike_chance_percent === "number"
        ? pitchingTests.strike_chance_percent
        : null;

    // Offense: 80% hitting + 20% speed (when both available)
    let offenseFull: number | null = null;
    if (hittingScore != null && speedScore != null) {
      offenseFull =
        Math.round((0.8 * hittingScore + 0.2 * speedScore) * 10) / 10;
    } else if (hittingScore != null) {
      offenseFull = hittingScore;
    }

    const positionScores = compute10UPositionScores(
      athletic,
      pitchingEval,
      catcherEval,
      firstBaseEval,
      infieldEval,
      outfieldEval
    );

    const defenseFull = positionScores.defense_score;
    const pitchingFull = pitchingScore ?? null;

    const overallFull = averageNonNull([
      athleticScore,
      hittingScore,
      pitchingScore,
      catcherScore,
      firstBaseScore,
      infieldScore,
      outfieldScore,
    ]);

    const allDates = [
      athletic.performedAt,
      hitting.performedAt,
      pitchingEval.performedAt,
      catcherEval.performedAt,
      firstBaseEval.performedAt,
      infieldEval.performedAt,
      outfieldEval.performedAt,
    ].filter((d): d is string => !!d);

    const lastUpdated =
      allDates.length > 0 ? allDates.sort().slice(-1)[0] : null;

    return res.json({
      player_id: playerId,
      age_group: "11U",
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
        // keep field names consistent with other ages:
        throwing_score: pitchingScore,
        catching_score: catcherScore,
        fielding_score: infieldScore,
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
    console.error("Error building 11U full eval:", err);
    return res.status(500).json({ error: "Failed to build 11U full eval" });
  }
});

app.get("/players/:id/evals/12u-full", async (req, res) => {
  const playerId = req.params.id;

  try {
    const [
      athletic,
      hitting,
      pitchingEval,
      catcherEval,
      firstBaseEval,
      infieldEval,
      outfieldEval,
    ] = await Promise.all([
      fetchLatestCategoryRating(playerId, "12U Athletic Skills", "athletic"),
      fetchLatestCategoryRating(playerId, "12U Hitting Skills", "hitting"),
      fetchLatestCategoryRating(playerId, "12U Pitching Eval", "pitching"),
      fetchLatestCategoryRating(playerId, "12U Catcher Eval", "catcher"),
      fetchLatestCategoryRating(playerId, "12U First Base Eval", "first_base"),
      fetchLatestCategoryRating(playerId, "12U Infield Eval", "infield"),
      fetchLatestCategoryRating(playerId, "12U Outfield Eval", "outfield"),
    ]);

    const components = {
      athletic,
      hitting,
      pitching: pitchingEval,
      catcher: catcherEval,
      first_base: firstBaseEval,
      infield: infieldEval,
      outfield: outfieldEval,
    };

    const athleticScore = athletic.score;
    const hittingScore = hitting.score;
    const pitchingScore = pitchingEval.score;
    const catcherScore = catcherEval.score;
    const firstBaseScore = firstBaseEval.score;
    const infieldScore = infieldEval.score;
    const outfieldScore = outfieldEval.score;

    const hittingTests =
      hitting.breakdown && hitting.breakdown.hitting
        ? hitting.breakdown.hitting.tests || {}
        : {};

    const athleticTests =
      athletic.breakdown && athletic.breakdown.athletic
        ? athletic.breakdown.athletic.tests || {}
        : {};

    const pitchingTests =
      pitchingEval.breakdown && (pitchingEval.breakdown as any).pitching
        ? (pitchingEval.breakdown as any).pitching.tests || {}
        : {};

    const contactScore =
      typeof hittingTests.contact_score === "number"
        ? hittingTests.contact_score
        : null;

    const powerScore =
      typeof hittingTests.power_score === "number"
        ? hittingTests.power_score
        : null;

    const speedScore =
      typeof athleticTests.speed_score === "number"
        ? athleticTests.speed_score
        : null;

    const strikeChancePercent =
      typeof pitchingTests.strike_chance_percent === "number"
        ? pitchingTests.strike_chance_percent
        : null;

    // Offense: 80% hitting + 20% speed (when both available)
    let offenseFull: number | null = null;
    if (hittingScore != null && speedScore != null) {
      offenseFull =
        Math.round((0.8 * hittingScore + 0.2 * speedScore) * 10) / 10;
    } else if (hittingScore != null) {
      offenseFull = hittingScore;
    }

    const positionScores = compute12UPositionScores(
      athletic,
      pitchingEval,
      catcherEval,
      firstBaseEval,
      infieldEval,
      outfieldEval
    );

    const defenseFull = positionScores.defense_score;
    const pitchingFull = pitchingScore ?? null;

    const overallFull = averageNonNull([
      athleticScore,
      hittingScore,
      pitchingScore,
      catcherScore,
      firstBaseScore,
      infieldScore,
      outfieldScore,
    ]);

    const allDates = [
      athletic.performedAt,
      hitting.performedAt,
      pitchingEval.performedAt,
      catcherEval.performedAt,
      firstBaseEval.performedAt,
      infieldEval.performedAt,
      outfieldEval.performedAt,
    ].filter((d): d is string => !!d);

    const lastUpdated =
      allDates.length > 0 ? allDates.sort().slice(-1)[0] : null;

    return res.json({
      player_id: playerId,
      age_group: "12U",
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
        // keep field names consistent with other ages:
        throwing_score: pitchingScore,
        catching_score: catcherScore,
        fielding_score: infieldScore,
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
    console.error("Error building 12U full eval:", err);
    return res.status(500).json({ error: "Failed to build 12U full eval" });
  }
});

app.get("/players/:id/evals/13u-full", async (req, res) => {
  const playerId = req.params.id;

  try {
    const [
      athletic,
      hitting,
      pitchingEval,
      catcherEval,
      firstBaseEval,
      infieldEval,
      outfieldEval,
    ] = await Promise.all([
      fetchLatestCategoryRating(playerId, "13U Athletic Skills", "athletic"),
      fetchLatestCategoryRating(playerId, "13U Hitting Skills", "hitting"),
      fetchLatestCategoryRating(playerId, "13U Pitching Eval", "pitching"),
      fetchLatestCategoryRating(playerId, "13U Catcher Eval", "catcher"),
      fetchLatestCategoryRating(playerId, "13U First Base Eval", "first_base"),
      fetchLatestCategoryRating(playerId, "13U Infield Eval", "infield"),
      fetchLatestCategoryRating(playerId, "13U Outfield Eval", "outfield"),
    ]);

    const components = {
      athletic,
      hitting,
      pitching: pitchingEval,
      catcher: catcherEval,
      first_base: firstBaseEval,
      infield: infieldEval,
      outfield: outfieldEval,
    };

    const athleticScore = athletic.score;
    const hittingScore = hitting.score;
    const pitchingScore = pitchingEval.score;
    const catcherScore = catcherEval.score;
    const firstBaseScore = firstBaseEval.score;
    const infieldScore = infieldEval.score;
    const outfieldScore = outfieldEval.score;

    const hittingTests =
      hitting.breakdown && hitting.breakdown.hitting
        ? hitting.breakdown.hitting.tests || {}
        : {};

    const athleticTests =
      athletic.breakdown && athletic.breakdown.athletic
        ? athletic.breakdown.athletic.tests || {}
        : {};

    const pitchingTests =
      pitchingEval.breakdown && (pitchingEval.breakdown as any).pitching
        ? (pitchingEval.breakdown as any).pitching.tests || {}
        : {};

    const contactScore =
      typeof hittingTests.contact_score === "number"
        ? hittingTests.contact_score
        : null;

    const powerScore =
      typeof hittingTests.power_score === "number"
        ? hittingTests.power_score
        : null;

    const speedScore =
      typeof athleticTests.speed_score === "number"
        ? athleticTests.speed_score
        : null;

    const strikeChancePercent =
      typeof pitchingTests.strike_chance_percent === "number"
        ? pitchingTests.strike_chance_percent
        : null;

    // Offense: 80% hitting + 20% speed (when both available)
    let offenseFull: number | null = null;
    if (hittingScore != null && speedScore != null) {
      offenseFull =
        Math.round((0.8 * hittingScore + 0.2 * speedScore) * 10) / 10;
    } else if (hittingScore != null) {
      offenseFull = hittingScore;
    }

    const positionScores = compute13UPositionScores(
      athletic,
      pitchingEval,
      catcherEval,
      firstBaseEval,
      infieldEval,
      outfieldEval
    );

    const defenseFull = positionScores.defense_score;
    const pitchingFull = pitchingScore ?? null;

    const overallFull = averageNonNull([
      athleticScore,
      hittingScore,
      pitchingScore,
      catcherScore,
      firstBaseScore,
      infieldScore,
      outfieldScore,
    ]);

    const allDates = [
      athletic.performedAt,
      hitting.performedAt,
      pitchingEval.performedAt,
      catcherEval.performedAt,
      firstBaseEval.performedAt,
      infieldEval.performedAt,
      outfieldEval.performedAt,
    ].filter((d): d is string => !!d);

    const lastUpdated =
      allDates.length > 0 ? allDates.sort().slice(-1)[0] : null;

    return res.json({
      player_id: playerId,
      age_group: "13U",
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
        // keep field names consistent with other ages:
        throwing_score: pitchingScore,
        catching_score: catcherScore,
        fielding_score: infieldScore,
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
    console.error("Error building 13U full eval:", err);
    return res.status(500).json({ error: "Failed to build 13U full eval" });
  }
});

app.get("/players/:id/evals/14u-full", async (req, res) => {
  const playerId = req.params.id;

  try {
    const [
      athletic,
      hitting,
      pitchingEval,
      catcherEval,
      firstBaseEval,
      infieldEval,
      outfieldEval,
    ] = await Promise.all([
      fetchLatestCategoryRating(playerId, "14U Athletic Skills", "athletic"),
      fetchLatestCategoryRating(playerId, "14U Hitting Skills", "hitting"),
      fetchLatestCategoryRating(playerId, "14U Pitching Eval", "pitching"),
      fetchLatestCategoryRating(playerId, "14U Catcher Eval", "catcher"),
      fetchLatestCategoryRating(playerId, "14U First Base Eval", "first_base"),
      fetchLatestCategoryRating(playerId, "14U Infield Eval", "infield"),
      fetchLatestCategoryRating(playerId, "14U Outfield Eval", "outfield"),
    ]);

    const components = {
      athletic,
      hitting,
      pitching: pitchingEval,
      catcher: catcherEval,
      first_base: firstBaseEval,
      infield: infieldEval,
      outfield: outfieldEval,
    };

    const athleticScore = athletic.score;
    const hittingScore = hitting.score;
    const pitchingScore = pitchingEval.score;
    const catcherScore = catcherEval.score;
    const firstBaseScore = firstBaseEval.score;
    const infieldScore = infieldEval.score;
    const outfieldScore = outfieldEval.score;

    const hittingTests =
      hitting.breakdown && hitting.breakdown.hitting
        ? hitting.breakdown.hitting.tests || {}
        : {};

    const athleticTests =
      athletic.breakdown && athletic.breakdown.athletic
        ? athletic.breakdown.athletic.tests || {}
        : {};

    const pitchingTests =
      pitchingEval.breakdown && (pitchingEval.breakdown as any).pitching
        ? (pitchingEval.breakdown as any).pitching.tests || {}
        : {};

    const contactScore =
      typeof hittingTests.contact_score === "number"
        ? hittingTests.contact_score
        : null;

    const powerScore =
      typeof hittingTests.power_score === "number"
        ? hittingTests.power_score
        : null;

    const speedScore =
      typeof athleticTests.speed_score === "number"
        ? athleticTests.speed_score
        : null;

    const strikeChancePercent =
      typeof pitchingTests.strike_chance_percent === "number"
        ? pitchingTests.strike_chance_percent
        : null;

    // Offense: 80% hitting + 20% speed (when both available)
    let offenseFull: number | null = null;
    if (hittingScore != null && speedScore != null) {
      offenseFull =
        Math.round((0.8 * hittingScore + 0.2 * speedScore) * 10) / 10;
    } else if (hittingScore != null) {
      offenseFull = hittingScore;
    }

    const positionScores = compute14UPositionScores(
      athletic,
      pitchingEval,
      catcherEval,
      firstBaseEval,
      infieldEval,
      outfieldEval
    );

    const defenseFull = positionScores.defense_score;
    const pitchingFull = pitchingScore ?? null;

    const overallFull = averageNonNull([
      athleticScore,
      hittingScore,
      pitchingScore,
      catcherScore,
      firstBaseScore,
      infieldScore,
      outfieldScore,
    ]);

    const allDates = [
      athletic.performedAt,
      hitting.performedAt,
      pitchingEval.performedAt,
      catcherEval.performedAt,
      firstBaseEval.performedAt,
      infieldEval.performedAt,
      outfieldEval.performedAt,
    ].filter((d): d is string => !!d);

    const lastUpdated =
      allDates.length > 0 ? allDates.sort().slice(-1)[0] : null;

    return res.json({
      player_id: playerId,
      age_group: "14U",
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
        // keep field names consistent with other ages:
        throwing_score: pitchingScore,
        catching_score: catcherScore,
        fielding_score: infieldScore,
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
    console.error("Error building 14U full eval:", err);
    return res.status(500).json({ error: "Failed to build 14U full eval" });
  }
});

app.get("/players/:id/evals/hs-full", async (req, res) => {
  const playerId = req.params.id;

  try {
    const [
      athletic,
      hitting,
      pitchingEval,
      catcherEval,
      firstBaseEval,
      infieldEval,
      outfieldEval,
    ] = await Promise.all([
      fetchLatestCategoryRating(playerId, "HS Athletic Skills", "athletic"),
      fetchLatestCategoryRating(playerId, "HS Hitting Skills", "hitting"),
      fetchLatestCategoryRating(playerId, "HS Pitching Eval", "pitching"),
      fetchLatestCategoryRating(playerId, "HS Catcher Eval", "catcher"),
      fetchLatestCategoryRating(playerId, "HS First Base Eval", "first_base"),
      fetchLatestCategoryRating(playerId, "HS Infield Eval", "infield"),
      fetchLatestCategoryRating(playerId, "HS Outfield Eval", "outfield"),
    ]);

    const components = {
      athletic,
      hitting,
      pitching: pitchingEval,
      catcher: catcherEval,
      first_base: firstBaseEval,
      infield: infieldEval,
      outfield: outfieldEval,
    };

    const athleticScore = athletic.score;
    const hittingScore = hitting.score;
    const pitchingScore = pitchingEval.score;
    const catcherScore = catcherEval.score;
    const firstBaseScore = firstBaseEval.score;
    const infieldScore = infieldEval.score;
    const outfieldScore = outfieldEval.score;

    const hittingTests =
      hitting.breakdown && hitting.breakdown.hitting
        ? hitting.breakdown.hitting.tests || {}
        : {};

    const athleticTests =
      athletic.breakdown && athletic.breakdown.athletic
        ? athletic.breakdown.athletic.tests || {}
        : {};

    const pitchingTests =
      pitchingEval.breakdown && (pitchingEval.breakdown as any).pitching
        ? (pitchingEval.breakdown as any).pitching.tests || {}
        : {};

    const contactScore =
      typeof hittingTests.contact_score === "number"
        ? hittingTests.contact_score
        : null;

    const powerScore =
      typeof hittingTests.power_score === "number"
        ? hittingTests.power_score
        : null;

    const speedScore =
      typeof athleticTests.speed_score === "number"
        ? athleticTests.speed_score
        : null;

    const strikeChancePercent =
      typeof pitchingTests.strike_chance_percent === "number"
        ? pitchingTests.strike_chance_percent
        : null;

    // Offense: 80% hitting + 20% speed (when both available)
    let offenseFull: number | null = null;
    if (hittingScore != null && speedScore != null) {
      offenseFull =
        Math.round((0.8 * hittingScore + 0.2 * speedScore) * 10) / 10;
    } else if (hittingScore != null) {
      offenseFull = hittingScore;
    }

    const positionScores = computeHSPositionScores(
      athletic,
      pitchingEval,
      catcherEval,
      firstBaseEval,
      infieldEval,
      outfieldEval
    );

    const defenseFull = positionScores.defense_score;
    const pitchingFull = pitchingScore ?? null;

    const overallFull = averageNonNull([
      athleticScore,
      hittingScore,
      pitchingScore,
      catcherScore,
      firstBaseScore,
      infieldScore,
      outfieldScore,
    ]);

    const allDates = [
      athletic.performedAt,
      hitting.performedAt,
      pitchingEval.performedAt,
      catcherEval.performedAt,
      firstBaseEval.performedAt,
      infieldEval.performedAt,
      outfieldEval.performedAt,
    ].filter((d): d is string => !!d);

    const lastUpdated =
      allDates.length > 0 ? allDates.sort().slice(-1)[0] : null;

    return res.json({
      player_id: playerId,
      age_group: "HS",
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
        // keep field names consistent with other ages:
        throwing_score: pitchingScore,
        catching_score: catcherScore,
        fielding_score: infieldScore,
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
    console.error("Error building HS full eval:", err);
    return res.status(500).json({ error: "Failed to build HS full eval" });
  }
});

app.get("/players/:id/evals/college-full", async (req, res) => {
  const playerId = req.params.id;

  try {
    const [
      athletic,
      hitting,
      pitchingEval,
      catcherEval,
      firstBaseEval,
      infieldEval,
      outfieldEval,
    ] = await Promise.all([
      fetchLatestCategoryRating(playerId, "College Athletic Skills", "athletic"),
      fetchLatestCategoryRating(playerId, "College Hitting Skills", "hitting"),
      fetchLatestCategoryRating(playerId, "College Pitching Eval", "pitching"),
      fetchLatestCategoryRating(playerId, "College Catcher Eval", "catcher"),
      fetchLatestCategoryRating(playerId, "College First Base Eval", "first_base"),
      fetchLatestCategoryRating(playerId, "College Infield Eval", "infield"),
      fetchLatestCategoryRating(playerId, "College Outfield Eval", "outfield"),
    ]);

    const components = {
      athletic,
      hitting,
      pitching: pitchingEval,
      catcher: catcherEval,
      first_base: firstBaseEval,
      infield: infieldEval,
      outfield: outfieldEval,
    };

    const athleticScore = athletic.score;
    const hittingScore = hitting.score;
    const pitchingScore = pitchingEval.score;
    const catcherScore = catcherEval.score;
    const firstBaseScore = firstBaseEval.score;
    const infieldScore = infieldEval.score;
    const outfieldScore = outfieldEval.score;

    const hittingTests =
      hitting.breakdown && hitting.breakdown.hitting
        ? hitting.breakdown.hitting.tests || {}
        : {};

    const athleticTests =
      athletic.breakdown && athletic.breakdown.athletic
        ? athletic.breakdown.athletic.tests || {}
        : {};

    const pitchingTests =
      pitchingEval.breakdown && (pitchingEval.breakdown as any).pitching
        ? (pitchingEval.breakdown as any).pitching.tests || {}
        : {};

    const contactScore =
      typeof hittingTests.contact_score === "number"
        ? hittingTests.contact_score
        : null;

    const powerScore =
      typeof hittingTests.power_score === "number"
        ? hittingTests.power_score
        : null;

    const speedScore =
      typeof athleticTests.speed_score === "number"
        ? athleticTests.speed_score
        : null;

    const strikeChancePercent =
      typeof pitchingTests.strike_chance_percent === "number"
        ? pitchingTests.strike_chance_percent
        : null;

    // Offense: 80% hitting + 20% speed
    let offenseFull: number | null = null;
    if (hittingScore != null && speedScore != null) {
      offenseFull =
        Math.round((0.8 * hittingScore + 0.2 * speedScore) * 10) / 10;
    } else if (hittingScore != null) {
      offenseFull = hittingScore;
    }

    const positionScores = computeHSPositionScores(
      athletic,
      pitchingEval,
      catcherEval,
      firstBaseEval,
      infieldEval,
      outfieldEval
    );

    const defenseFull = positionScores.defense_score;
    const pitchingFull = pitchingScore ?? null;

    const overallFull = averageNonNull([
      athleticScore,
      hittingScore,
      pitchingScore,
      catcherScore,
      firstBaseScore,
      infieldScore,
      outfieldScore,
    ]);

    const allDates = [
      athletic.performedAt,
      hitting.performedAt,
      pitchingEval.performedAt,
      catcherEval.performedAt,
      firstBaseEval.performedAt,
      infieldEval.performedAt,
      outfieldEval.performedAt,
    ].filter((d): d is string => !!d);

    const lastUpdated =
      allDates.length > 0 ? allDates.sort().slice(-1)[0] : null;

    return res.json({
      player_id: playerId,
      age_group: "College",
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
        throwing_score: pitchingScore,
        catching_score: catcherScore,
        fielding_score: infieldScore,
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
    console.error("Error building College full eval:", err);
    return res.status(500).json({ error: "Failed to build College full eval" });
  }
});

app.get("/players/:id/evals/pro-full", async (req, res) => {
  const playerId = req.params.id;

  try {
    const [
      athletic,
      hitting,
      pitchingEval,
      catcherEval,
      firstBaseEval,
      infieldEval,
      outfieldEval,
    ] = await Promise.all([
      fetchLatestCategoryRating(playerId, "Pro Athletic Skills", "athletic"),
      fetchLatestCategoryRating(playerId, "Pro Hitting Skills", "hitting"),
      fetchLatestCategoryRating(playerId, "Pro Pitching Eval", "pitching"),
      fetchLatestCategoryRating(playerId, "Pro Catcher Eval", "catcher"),
      fetchLatestCategoryRating(playerId, "Pro First Base Eval", "first_base"),
      fetchLatestCategoryRating(playerId, "Pro Infield Eval", "infield"),
      fetchLatestCategoryRating(playerId, "Pro Outfield Eval", "outfield"),
    ]);

    const components = {
      athletic,
      hitting,
      pitching: pitchingEval,
      catcher: catcherEval,
      first_base: firstBaseEval,
      infield: infieldEval,
      outfield: outfieldEval,
    };

    const athleticScore = athletic.score;
    const hittingScore = hitting.score;
    const pitchingScore = pitchingEval.score;
    const catcherScore = catcherEval.score;
    const firstBaseScore = firstBaseEval.score;
    const infieldScore = infieldEval.score;
    const outfieldScore = outfieldEval.score;

    const hittingTests =
      hitting.breakdown && hitting.breakdown.hitting
        ? hitting.breakdown.hitting.tests || {}
        : {};

    const athleticTests =
      athletic.breakdown && athletic.breakdown.athletic
        ? athletic.breakdown.athletic.tests || {}
        : {};

    const pitchingTests =
      pitchingEval.breakdown && (pitchingEval.breakdown as any).pitching
        ? (pitchingEval.breakdown as any).pitching.tests || {}
        : {};

    const contactScore =
      typeof hittingTests.contact_score === "number"
        ? hittingTests.contact_score
        : null;

    const powerScore =
      typeof hittingTests.power_score === "number"
        ? hittingTests.power_score
        : null;

    const speedScore =
      typeof athleticTests.speed_score === "number"
        ? athleticTests.speed_score
        : null;

    const strikeChancePercent =
      typeof pitchingTests.strike_chance_percent === "number"
        ? pitchingTests.strike_chance_percent
        : null;

    // Offense: 80% hitting + 20% speed
    let offenseFull: number | null = null;
    if (hittingScore != null && speedScore != null) {
      offenseFull =
        Math.round((0.8 * hittingScore + 0.2 * speedScore) * 10) / 10;
    } else if (hittingScore != null) {
      offenseFull = hittingScore;
    }

    // Position formulas: same as HS (maxima and calc are the same)
    const positionScores = computeHSPositionScores(
      athletic,
      pitchingEval,
      catcherEval,
      firstBaseEval,
      infieldEval,
      outfieldEval
    );

    const defenseFull = positionScores.defense_score;
    const pitchingFull = pitchingScore ?? null;

    const overallFull = averageNonNull([
      athleticScore,
      hittingScore,
      pitchingScore,
      catcherScore,
      firstBaseScore,
      infieldScore,
      outfieldScore,
    ]);

    const allDates = [
      athletic.performedAt,
      hitting.performedAt,
      pitchingEval.performedAt,
      catcherEval.performedAt,
      firstBaseEval.performedAt,
      infieldEval.performedAt,
      outfieldEval.performedAt,
    ].filter((d): d is string => !!d);

    const lastUpdated =
      allDates.length > 0 ? allDates.sort().slice(-1)[0] : null;

    return res.json({
      player_id: playerId,
      age_group: "Pro",
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
        throwing_score: pitchingScore,
        catching_score: catcherScore,
        fielding_score: infieldScore,
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
    console.error("Error building Pro full eval:", err);
    return res.status(500).json({ error: "Failed to build Pro full eval" });
  }
});

// Get all conversations the current user participates in
app.get("/conversations", requireAuth, async (req: AuthedRequest, res) => {
  const userId = req.user!.id;

  try {
    // 1) Find all conversation_ids where this profile is a participant
    const { data: participantRows, error: cpError } = await supabase
      .from("conversation_participants")
      .select("conversation_id")
      .eq("profile_id", userId);

    if (cpError) {
      console.error("Error fetching conversation_participants:", cpError);
      return res.status(500).json({ error: cpError.message });
    }

    if (!participantRows || participantRows.length === 0) {
      return res.json([]);
    }

    const conversationIds = participantRows.map((r) => r.conversation_id);

    // 2) Load conversations
    const { data: conversations, error: convError } = await supabase
      .from("conversations")
      .select("*")
      .in("id", conversationIds)
      .order("updated_at", { ascending: false });

    if (convError) {
      console.error("Error fetching conversations:", convError);
      return res.status(500).json({ error: convError.message });
    }

    return res.json(conversations ?? []);
  } catch (err) {
    console.error("Unexpected error in GET /conversations:", err);
    return res.status(500).json({ error: "Failed to load conversations" });
  }
});

app.post("/conversations", requireAuth, async (req: AuthedRequest, res) => {
  const userId = req.user!.id;
  const { type, title, team_id, participant_ids } = req.body || {};

  if (!type || typeof type !== "string") {
    return res.status(400).json({ error: "type is required (e.g. 'direct', 'group', 'team')" });
  }

  // Basic guard; you can tighten allowed types later if you want.
  const validTypes = ["direct", "group", "team"];
  if (!validTypes.includes(type)) {
    return res.status(400).json({ error: `type must be one of: ${validTypes.join(", ")}` });
  }

  // Build unique participant set: current user + any additional IDs
  const participants = new Set<string>();
  participants.add(userId);

  if (Array.isArray(participant_ids)) {
    for (const pid of participant_ids) {
      if (typeof pid === "string" && pid !== userId) {
        participants.add(pid);
      }
    }
  }

  if (participants.size < 2 && type === "direct") {
    return res
      .status(400)
      .json({ error: "Direct conversations should include at least 2 participants" });
  }

  try {
    // 1) Create the conversation
    const { data: convo, error: convoError } = await supabase
      .from("conversations")
      .insert([
        {
          type,
          team_id: team_id ?? null,
          created_by: userId,
          title: title ?? null,
        },
      ])
      .select()
      .single();

    if (convoError || !convo) {
      console.error("Error creating conversation:", convoError);
      return res
        .status(500)
        .json({ error: convoError?.message ?? "Failed to create conversation" });
    }

    const conversationId = convo.id as string;

    // 2) Insert participants
    const participantInserts = Array.from(participants).map((pid) => ({
      conversation_id: conversationId,
      profile_id: pid,
    }));

    const { error: cpError } = await supabase
      .from("conversation_participants")
      .insert(participantInserts);

    if (cpError) {
      console.error("Error inserting conversation_participants:", cpError);
      return res.status(500).json({
        error: "Conversation created but failed to add participants",
        conversation_id: conversationId,
      });
    }

    return res.status(201).json(convo);
  } catch (err) {
    console.error("Unexpected error in POST /conversations:", err);
    return res.status(500).json({ error: "Failed to create conversation" });
  }
});

app.get(
  "/conversations/:conversationId/messages",
  requireAuth,
  async (req: AuthedRequest, res) => {
    const userId = req.user!.id;
    const { conversationId } = req.params;

    try {
      // 1) Check membership
      const { data: membership, error: membershipError } = await supabase
        .from("conversation_participants")
        .select("conversation_id")
        .eq("conversation_id", conversationId)
        .eq("profile_id", userId)
        .maybeSingle();

      if (membershipError) {
        console.error("Error checking membership:", membershipError);
        return res.status(500).json({ error: membershipError.message });
      }

      if (!membership) {
        return res.status(403).json({ error: "You are not a participant in this conversation" });
      }

      // 2) Load messages
      const { data: messages, error: messagesError } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      if (messagesError) {
        console.error("Error fetching messages:", messagesError);
        return res.status(500).json({ error: messagesError.message });
      }

      return res.json(messages ?? []);
    } catch (err) {
      console.error("Unexpected error in GET /conversations/:id/messages:", err);
      return res.status(500).json({ error: "Failed to load messages" });
    }
  }
);

app.post(
  "/conversations/:conversationId/messages",
  requireAuth,
  async (req: AuthedRequest, res) => {
    const userId = req.user!.id;
    const { conversationId } = req.params;
    const { content } = req.body || {};

    if (!content || typeof content !== "string" || !content.trim()) {
      return res.status(400).json({ error: "content is required" });
    }

    try {
      // 1) Ensure user is a participant
      const { data: membership, error: membershipError } = await supabase
        .from("conversation_participants")
        .select("conversation_id")
        .eq("conversation_id", conversationId)
        .eq("profile_id", userId)
        .maybeSingle();

      if (membershipError) {
        console.error("Error checking membership:", membershipError);
        return res.status(500).json({ error: membershipError.message });
      }

      if (!membership) {
        return res.status(403).json({ error: "You are not a participant in this conversation" });
      }

      // 2) Insert message
      const { data: message, error: msgError } = await supabase
        .from("messages")
        .insert([
          {
            conversation_id: conversationId,
            sender_id: userId,
            content: content.trim(),
          },
        ])
        .select()
        .single();

      if (msgError || !message) {
        console.error("Error inserting message:", msgError);
        return res
          .status(500)
          .json({ error: msgError?.message ?? "Failed to send message" });
      }

      // 3) Optionally bump conversation updated_at
      await supabase
        .from("conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", conversationId);

      return res.status(201).json(message);
    } catch (err) {
      console.error("Unexpected error in POST /conversations/:id/messages:", err);
      return res.status(500).json({ error: "Failed to send message" });
    }
  }
);



app.listen(port, () => {
  console.log(`BPOP backend listening on port ${port}`);
});
