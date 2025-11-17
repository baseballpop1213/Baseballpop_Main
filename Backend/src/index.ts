import "dotenv/config";
import express from "express";
import cors from "cors";
import { supabase } from "./supabaseClient";
import { requireAuth, AuthedRequest } from "./middleware/auth";
import {
  compute5U6URatings,
  MetricMap,
  RatingResult,
} from "./scoring/5u6u";

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

/**
 * Create an assessment (official or practice) + store raw values.
 * Then, if the template belongs to the 5U-6U age group, compute ratings
 * and write to player_ratings.
 *
 * Expected JSON body:
 * {
 *   "player_id": "<uuid>",
 *   "team_id": <bigint | null>,
 *   "template_id": <bigint>,
 *   "kind": "official" | "practice",
 *   "values": [
 *     { "metric_id": <bigint>, "value_numeric": 12.3, "value_text": null },
 *     ...
 *   ]
 * }
 */
app.post("/assessments", requireAuth, async (req: AuthedRequest, res) => {
  const performerId = req.user!.id;
  const {
    player_id,
    team_id,
    template_id,
    kind, // 'official' or 'practice'
    values,
  } = req.body;

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

  // 3) Determine if this template is part of the 5U-6U age group
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

  const is5U6U = ageGroup.label === "5U-6U";

  // If not 5U-6U, we’re done for now (no ratings yet)
  if (!is5U6U) {
    return res.status(201).json({ assessment_id: assessmentId });
  }

  // 4) For 5U-6U: load metric definitions (id -> metric_key)
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

  // 7) Compute ratings for 5U-6U using scoring module
  let ratings: RatingResult;
  try {
    ratings = compute5U6URatings(metricMap);
  } catch (err) {
    console.error("Error computing 5U-6U ratings:", err);
    // Don’t block the assessment just because scoring failed
    return res.status(201).json({ assessment_id: assessmentId });
  }

  // 8) Insert into player_ratings
  const { error: ratingsError } = await supabase.from("player_ratings").insert([
    {
      player_assessment_id: assessmentId,
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

app.listen(port, () => {
  console.log(`BPOP backend listening on port ${port}`);
});
