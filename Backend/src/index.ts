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

type BasicRole = "player" | "coach" | "parent" | "assistant" | "admin";

type TeamRole = "coach" | "assistant" | "player" | "parent";
const COACH_ONLY: TeamRole[] = ["coach"];
const COACH_AND_ASSISTANT: TeamRole[] = ["coach", "assistant"];
const ANY_MEMBER: TeamRole[] = ["coach", "assistant", "player", "parent"];

// --- Awards: shared helpers & types ---

type MedalTier = "bronze" | "silver" | "gold" | "platinum";
type TrophyTier = MedalTier;

interface MedalDefinitionRow {
  id: number;
  age_group_label: string | null;
  metric_code: string | null;
  tier: string | null;
  min_percent: number | null;
  name: string | null;
  description?: string | null;
  icon_url?: string | null;
}

interface TrophyDefinitionRow {
  id: number;
  age_group_label: string | null;
  metric_code: string | null; // canonical (bpoprating, offense, etc.)
  tier: string | null;
  name: string | null;
  description?: string | null;
  icon_url?: string | null;
}

interface MedalSummary {
  medal_id: number;
  metric_code: string;
  tier: MedalTier;
  name: string | null;
  min_percent: number | null;
}

interface TrophySummary {
  trophy_id: number;
  metric_code: string;
  tier: TrophyTier;
  name: string | null;
  threshold_percent: number | null;
  team_percent: number | null;
}

type AssessmentKind = "official" | "practice";

const medalDefsCache = new Map<string, MedalDefinitionRow[]>();
const trophyDefsCache = new Map<string, TrophyDefinitionRow[]>();

function normalizeMetricCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const c = raw.trim().toLowerCase();
  if (!c) return null;
  return c;
}

// For trophies: map sheet codes to medal metric codes
function normalizeTrophyMetricCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const c = raw.trim().toLowerCase();
  if (!c) return null;

  if (c === "overall") return "bpoprating";
  // everything else matches medals
  return c;
}

// Helper to safely parse numeric scores that might be strings/null
function parseScore(raw: any): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? raw : null;
  }
  const n = Number.parseFloat(String(raw));
  return Number.isFinite(n) ? n : null;
}


async function getMedalDefinitionsForAge(ageLabel: string): Promise<MedalDefinitionRow[]> {
  if (medalDefsCache.has(ageLabel)) {
    return medalDefsCache.get(ageLabel)!;
  }

  const { data, error } = await supabase
    .from("medal_definitions")
    .select("id, age_group_label, metric_code, tier, min_percent, name, description, icon_url")
    .eq("age_group_label", ageLabel);

  if (error || !data) {
    console.error("Error loading medal_definitions for age", ageLabel, error);
    medalDefsCache.set(ageLabel, []);
    return [];
  }

  const rows = data as MedalDefinitionRow[];
  medalDefsCache.set(ageLabel, rows);
  return rows;
}

async function getTrophyDefinitionsForAge(ageLabel: string): Promise<TrophyDefinitionRow[]> {
  if (trophyDefsCache.has(ageLabel)) {
    return trophyDefsCache.get(ageLabel)!;
  }

  const { data, error } = await supabase
    .from("trophy_definitions")
    .select("id, age_group_label, metric_code, tier, name, description, icon_url")
    .eq("age_group_label", ageLabel);

  if (error || !data) {
    console.error("Error loading trophy_definitions for age", ageLabel, error);
    trophyDefsCache.set(ageLabel, []);
    return [];
  }

  const rows = data as TrophyDefinitionRow[];
  trophyDefsCache.set(ageLabel, rows);
  return rows;
}

// --- Metric → percent mapping (0–1), built on RatingResult & breakdown JSON ---

function safeScoreToPercent(score: unknown): number | null {
  if (score === null || score === undefined) return null;
  const n = typeof score === "number" ? score : Number(score);
  if (!Number.isFinite(n)) return null;
  // All our scores are 0–50
  return n / 50;
}

function getMetricPercentFromRatings(metricCodeRaw: string, ratings: RatingResult): number | null {
  const metric = normalizeMetricCode(metricCodeRaw);
  if (!metric) return null;

  const { overall_score, offense_score, defense_score, pitching_score, breakdown } = ratings;
  const b: any = breakdown || {};
  const derived = b.derived || {};
  const athletic = b.athletic || {};
  const athleticTests = athletic.tests || {};
  const hitting = b.hitting || {};
  const hittingTests = hitting.tests || {};
  const throwing = b.throwing || {};
  const throwingTests = throwing.tests || {};
  const catching = b.catching || {};
  const fielding = b.fielding || {};
  const positionScores = derived.position_scores || {};

  switch (metric) {
    // Overall BPOP rating
    case "bpoprating":
    case "overall":
      return safeScoreToPercent(overall_score);

    // Top-level category scores
    case "offense":
      return safeScoreToPercent(offense_score ?? b.offense?.overall_score);
    case "defense":
      return safeScoreToPercent(defense_score ?? b.defense?.overall_score);
    case "pitching":
      return safeScoreToPercent(pitching_score ?? b.pitching?.overall_score);
    case "athlete":
      return safeScoreToPercent(athletic.overall_score ?? b.athlete?.overall_score);

    // Athletic sub-metrics (0–50)
    case "speed":
      // prefer derived.speed_score if present
      return safeScoreToPercent(derived.speed_score ?? athleticTests.speed_score);
    case "mobility":
      return safeScoreToPercent(athleticTests.mobility_score);
    case "balance":
      return safeScoreToPercent(athleticTests.balance_score);
    case "strength":
      return safeScoreToPercent(athleticTests.strength_score);

    // Hitting sub-metrics
    case "contact":
      return safeScoreToPercent(hittingTests.contact_score ?? hittingTests.contact);
    case "power":
      return safeScoreToPercent(hittingTests.power_score ?? hittingTests.power);

    // Throwing / catching / fielding
    case "throwing":
      return safeScoreToPercent(throwing.overall_score);
    case "catching":
      return safeScoreToPercent(catching.overall_score);
    case "fielding":
      return safeScoreToPercent(fielding.overall_score);

    case "accuracy":
      // Try a few likely paths; adjust if your scoring files differ slightly.
      return safeScoreToPercent(
        throwingTests.accuracy_score ??
          throwingTests.t40_accuracy_score ??
          throwingTests.t60_accuracy_score
      );

    // Position-based medals (use derived.position_scores)
    case "infield":
      return safeScoreToPercent(positionScores.infield_score);
    case "outfield":
      return safeScoreToPercent(positionScores.outfield_score);
    case "catcher":
      return safeScoreToPercent(positionScores.catcher ?? b.catcher?.overall_score);
    case "firstbase":
      return safeScoreToPercent(positionScores.first_base ?? positionScores.firstbase);

    default:
      return null;
  }
}

interface MedalAwardResult {
  potential: MedalSummary[];
  newlyAwarded: MedalSummary[];
}

async function awardMedalsForAssessment(options: {
  kind: AssessmentKind;
  playerId: string;
  assessmentId: number;
  ageLabel: string;
  ratings: RatingResult;
}): Promise<MedalAwardResult> {
  const { kind, playerId, assessmentId, ageLabel, ratings } = options;

  const defs = await getMedalDefinitionsForAge(ageLabel);

  if (!defs.length) {
    return { potential: [], newlyAwarded: [] };
  }

  // Cache metric percents so we only compute once per metric_code
  const percentCache = new Map<string, number | null>();

  const getPercent = (metricCodeRaw: string | null): number | null => {
    const key = normalizeMetricCode(metricCodeRaw || "");
    if (!key) return null;
    if (percentCache.has(key)) return percentCache.get(key)!;
    const p = getMetricPercentFromRatings(key, ratings);
    percentCache.set(key, p);
    return p;
  };

  const potentialDefs: MedalDefinitionRow[] = [];

  for (const def of defs) {
    const metricCode = normalizeMetricCode(def.metric_code);
    const tier = def.tier ? def.tier.toLowerCase() : null;
    const minPercent = def.min_percent;

    if (!metricCode || !tier || minPercent == null) continue;

    const p = getPercent(metricCode);
    if (p == null) continue;

    if (p >= minPercent) {
      potentialDefs.push(def);
    }
  }

  // For practice evals: we DO NOT insert into player_medals, we just return potentials.
  if (kind === "practice") {
    const potentialSummaries: MedalSummary[] = potentialDefs.map((def) => ({
      medal_id: def.id,
      metric_code: normalizeMetricCode(def.metric_code!)!,
      tier: def.tier!.toLowerCase() as MedalTier,
      name: def.name ?? null,
      min_percent: def.min_percent,
    }));

    return {
      potential: potentialSummaries,
      newlyAwarded: [],
    };
  }

  // Official eval: fetch existing official medals for this player
  const { data: existingRows, error: existingError } = await supabase
    .from("player_medals")
    .select("medal_id")
    .eq("player_id", playerId)
    .eq("is_official", true);

  if (existingError) {
    console.error("Error fetching existing player_medals:", existingError);
  }

  const ownedIds = new Set<number>(
    (existingRows || []).map((row: any) => row.medal_id as number)
  );

  const toInsert: any[] = [];
  const newlyAwarded: MedalSummary[] = [];
  const allPotential: MedalSummary[] = [];

  for (const def of potentialDefs) {
    const metricCode = normalizeMetricCode(def.metric_code)!;
    const tier = def.tier!.toLowerCase() as MedalTier;

    const summary: MedalSummary = {
      medal_id: def.id,
      metric_code: metricCode,
      tier,
      name: def.name ?? null,
      min_percent: def.min_percent,
    };

    allPotential.push(summary);

    if (!ownedIds.has(def.id)) {
      // This is a new official medal
      newlyAwarded.push(summary);
      toInsert.push({
        medal_id: def.id,
        player_id: playerId,
        player_assessment_id: assessmentId,
        is_official: true,
        awarded_at: new Date().toISOString(),
      });
    }
  }

  if (toInsert.length > 0) {
    const { error: insertError } = await supabase
      .from("player_medals")
      .insert(toInsert);

    if (insertError) {
      console.error("Error inserting player_medals:", insertError);
    }
  }

  return {
    potential: allPotential,
    newlyAwarded,
  };
}


/**
 * Look up the user's role for a specific team from user_team_roles.
 * Returns null if they have no role on that team.
 */
async function getUserTeamRole(
  userId: string,
  teamId: string
): Promise<TeamRole | null> {
  const { data, error } = await supabase
    .from("user_team_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("team_id", teamId)
    .maybeSingle();

  if (error) {
    console.error("Error fetching user_team_roles:", error);
    return null;
  }

  if (!data || !data.role) return null;
  return data.role as TeamRole;
}

/**
 * Convenience check used inside route handlers.
 * If the user does not have one of the allowed roles for the team, returns a 403.
 * Otherwise returns the role string.
 */
async function assertTeamRoleOr403(
  req: AuthedRequest,
  res: express.Response,
  teamId: string,
  allowed: TeamRole[]
): Promise<TeamRole | null> {
  const userId = req.user!.id;
  const role = await getUserTeamRole(userId, teamId);

  if (!role || !allowed.includes(role)) {
    res.status(403).json({ error: "You do not have permission for this team action." });
    return null;
  }

  return role;
}

/**
 * Find or create a "team" conversation for a given team.
 */
async function getOrCreateTeamConversation(teamId: string, createdBy: string) {
  // 1) Try to find existing team conversation
  const { data: existing, error: existingError } = await supabase
    .from("conversations")
    .select("*")
    .eq("team_id", teamId)
    .eq("type", "team")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existingError) {
    console.error("Error looking up team conversation:", existingError);
    throw existingError;
  }

  if (existing) return existing;

  // 2) Create a new team-wide conversation
  const { data: convo, error: convoError } = await supabase
    .from("conversations")
    .insert([
      {
        type: "team",
        team_id: teamId,
        created_by: createdBy,
        title: null,
      },
    ])
    .select()
    .single();

  if (convoError || !convo) {
    console.error("Error creating team conversation:", convoError);
    throw convoError ?? new Error("Failed to create team conversation");
  }

  // Optionally, add all team members as participants
  // (Assumes user_team_roles has all members for the team.)
  const { data: members, error: membersError } = await supabase
    .from("user_team_roles")
    .select("user_id")
    .eq("team_id", teamId);

  if (membersError) {
    console.error("Error loading team members for conversation:", membersError);
    // non-fatal; we still return the convo
    return convo;
  }

  if (members && members.length > 0) {
    const participants = members.map((m) => ({
      conversation_id: convo.id,
      profile_id: m.user_id,
    }));

    const { error: cpError } = await supabase
      .from("conversation_participants")
      .insert(participants);

    if (cpError) {
      // If you have a unique constraint on (conversation_id, profile_id),
      // this is safe to ignore on conflict.
      console.error("Error inserting conversation participants:", cpError);
    }
  }

  return convo;
}

interface PlayerProfileUpdateRequest {
  height_inches?: number | null;
  weight_lbs?: number | null;
  school?: string | null;
  grade?: string | null; // e.g. "7th", "Freshman", etc.
  bats?: "R" | "L" | "S" | null;
  throws?: "R" | "L" | null;
  home_address?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
}

interface CoachProfileUpdateRequest {
  phone?: string | null;
  organization?: string | null;
  title?: string | null; // e.g. "Head Coach"
  years_experience?: number | null;
  bio?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
}

interface ParentChildLinkCreateRequest {
  child_profile_id: string;
  relationship?: string | null;
}


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
    .maybeSingle();

  if (error) {
    console.error("Error fetching profile:", error);
    return res.status(500).json({ error: error.message });
  }

  if (!data) {
    // Logged-in, but no profile row yet
    return res.status(404).json({ error: "Profile not found" });
  }

  return res.json(data);
});


// List all teams this user is attached to (coach/assistant/player/parent)
app.get("/coach/my-teams", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const userId = req.user!.id;

    // 1) Get all team roles for this user
    const { data: roles, error: rolesError } = await supabase
      .from("user_team_roles")
      .select("team_id, role")
      .eq("user_id", userId);

    if (rolesError) {
      console.error("Error fetching user_team_roles", rolesError);
      return res.status(500).json({ message: "Failed to load teams" });
    }

    if (!roles || roles.length === 0) {
      return res.json({ teams: [] });
    }

    const teamIds = Array.from(new Set(roles.map((r) => r.team_id)));

    // 2) Fetch the corresponding team records
    const { data: teams, error: teamsError } = await supabase
      .from("teams")
      .select("id, name, age_group, level, logo_url, motto")
      .in("id", teamIds);

    if (teamsError) {
      console.error("Error fetching teams", teamsError);
      return res.status(500).json({ message: "Failed to load teams" });
    }

    const teamsById = new Map(teams.map((t) => [t.id, t]));

    // 3) Merge team data with the user's role on that team
    const result = roles
      .map((r) => {
        const t = teamsById.get(r.team_id);
        if (!t) return null;
        return {
          id: t.id,
          name: t.name,
          age_group: t.age_group,
          level: t.level,
          logo_url: t.logo_url,
          motto: t.motto,
          role: r.role, // "coach" | "assistant" | "player" | "parent"
        };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x));

    return res.json({ teams: result });
  } catch (err) {
    console.error("Unexpected error in /coach/my-teams", err);
    return res.status(500).json({ message: "Failed to load teams" });
  }
});


/**
 * Get current user's teams via user_team_roles (2-step query).
 */
app.get("/me/teams", requireAuth, async (req: AuthedRequest, res) => {
  const userId = req.user!.id;

  // 1) Get this user's team roles
  const {
    data: roleRows,
    error: rolesError,
  } = await supabase
    .from("user_team_roles")
    .select("team_id, role")
    .eq("user_id", userId);

  if (rolesError) {
    console.error("Error fetching user_team_roles:", rolesError);
    return res
      .status(500)
      .json({ error: "Failed to load team roles", detail: rolesError.message });
  }

  if (!roleRows || roleRows.length === 0) {
    return res.json([]);
  }

  const teamIds = roleRows.map((r) => r.team_id);

  // 2) Fetch team details for those team_ids
  const {
    data: teamRows,
    error: teamsError,
  } = await supabase
    .from("teams")
    .select("id, name, age_group, level, motto, logo_url")
    .in("id", teamIds);

  if (teamsError) {
    console.error("Error fetching teams:", teamsError);
    return res
      .status(500)
      .json({ error: "Failed to load teams", detail: teamsError.message });
  }

  // Build a map so we can merge role + team data
  const teamMap = new Map<string, any>();
  (teamRows ?? []).forEach((t: any) => {
    teamMap.set(t.id, t);
  });

  const result = roleRows
    .map((row: any) => {
      const team = teamMap.get(row.team_id);
      if (!team) return null;
      return {
        id: team.id,
        name: team.name,
        age_group: team.age_group,
        level: team.level,
        motto: team.motto,
        logo_url: team.logo_url,
        role: row.role,
      };
    })
    .filter(Boolean);

  return res.json(result);
});




/**
 * Get the current user's extended player profile.
 * - Requires: Authorization: Bearer <Supabase access token>
 * - Only works if profiles.role === 'player'
 */
app.get("/me/player-profile", requireAuth, async (req: AuthedRequest, res) => {
  const userId = req.user!.id;

  try {
    // 1) Load base profile
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, role, display_name, first_name, last_name, birthdate, avatar_url, created_at, updated_at")
      .eq("id", userId)
      .single();

    if (profileError || !profile) {
      console.error("Error fetching base profile in GET /me/player-profile:", profileError);
      return res.status(500).json({ error: profileError?.message ?? "Failed to load profile" });
    }

    if (profile.role !== "player") {
      return res.status(403).json({
        error: "This endpoint is only available for player accounts.",
      });
    }

    // 2) Load player-specific profile (may or may not exist yet)
    const { data: playerProfile, error: ppError } = await supabase
      .from("player_profiles")
      .select("*")
      .eq("profile_id", userId)
      .maybeSingle();

    if (ppError) {
      console.error("Error fetching player_profiles in GET /me/player-profile:", ppError);
      return res.status(500).json({ error: ppError.message });
    }

    return res.json({
      profile,
      player_profile: playerProfile, // may be null if not created yet
    });
  } catch (err) {
    console.error("Unexpected error in GET /me/player-profile:", err);
    return res.status(500).json({ error: "Failed to load player profile" });
  }
});

/**
 * Create or update the current player's extended profile in player_profiles.
 *
 * Accepts a subset of high-value fields for now:
 *   - height_inches (number)
 *   - weight_lbs (number)
 *   - school (string)
 *   - grade (string)
 *   - bats ("R" | "L" | "S")
 *   - throws ("R" | "L")
 *   - home_address, city, state, postal_code (strings)
 *
 * You can safely send partials; only provided fields are updated.
 */
app.put("/me/player-profile", requireAuth, async (req: AuthedRequest, res) => {
  const userId = req.user!.id;
  const body = req.body as PlayerProfileUpdateRequest | undefined;

  if (!body || typeof body !== "object") {
    return res.status(400).json({ error: "Request body must be a JSON object." });
  }

  try {
    // 1) Ensure user is a player
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("id", userId)
      .single();

    if (profileError || !profile) {
      console.error("Error fetching profile in PUT /me/player-profile:", profileError);
      return res.status(500).json({ error: profileError?.message ?? "Failed to load profile" });
    }

    if (profile.role !== "player") {
      return res.status(403).json({
        error: "Only player accounts can update a player profile.",
      });
    }

    const updates: any = {};

    // 2) Validate & normalize incoming fields

    if (body.height_inches !== undefined) {
      if (
        body.height_inches === null ||
        (typeof body.height_inches === "number" &&
          Number.isFinite(body.height_inches) &&
          body.height_inches > 0 &&
          body.height_inches < 120)
      ) {
        updates.height_inches = body.height_inches;
      } else {
        return res.status(400).json({
          error: "height_inches must be a positive number under 120, or null.",
        });
      }
    }

    if (body.weight_lbs !== undefined) {
      if (
        body.weight_lbs === null ||
        (typeof body.weight_lbs === "number" &&
          Number.isFinite(body.weight_lbs) &&
          body.weight_lbs > 0 &&
          body.weight_lbs < 400)
      ) {
        updates.weight_lbs = body.weight_lbs;
      } else {
        return res.status(400).json({
          error: "weight_lbs must be a positive number under 400, or null.",
        });
      }
    }

    if (body.school !== undefined) {
      updates.school =
        typeof body.school === "string" && body.school.trim().length > 0
          ? body.school.trim()
          : null;
    }

    if (body.grade !== undefined) {
      updates.grade =
        typeof body.grade === "string" && body.grade.trim().length > 0
          ? body.grade.trim()
          : null;
    }

    if (body.bats !== undefined) {
      if (body.bats === null) {
        updates.batting_hand = null;
      } else if (body.bats === "R" || body.bats === "L" || body.bats === "S") {
        updates.batting_hand = body.bats;
      } else {
        return res.status(400).json({
          error: 'bats must be "R", "L", "S", or null.',
        });
      }
    }

    if (body.throws !== undefined) {
      if (body.throws === null) {
        updates.throwing_hand = null;
      } else if (body.throws === "R" || body.throws === "L") {
        updates.throwing_hand = body.throws;
      } else {
        return res.status(400).json({
          error: 'throws must be "R", "L", or null.',
        });
      }
    }


    if (body.home_address !== undefined) {
      updates.home_address =
        typeof body.home_address === "string" && body.home_address.trim().length > 0
          ? body.home_address.trim()
          : null;
    }

    if (body.city !== undefined) {
      updates.city =
        typeof body.city === "string" && body.city.trim().length > 0
          ? body.city.trim()
          : null;
    }

    if (body.state !== undefined) {
      updates.state =
        typeof body.state === "string" && body.state.trim().length > 0
          ? body.state.trim()
          : null;
    }

    if (body.postal_code !== undefined) {
      updates.postal_code =
        typeof body.postal_code === "string" && body.postal_code.trim().length > 0
          ? body.postal_code.trim()
          : null;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        error: "No valid fields were provided to update.",
      });
    }


    // 3) Check if a player_profiles row already exists
    const { data: existing, error: existingError } = await supabase
      .from("player_profiles")
      .select("profile_id")
      .eq("profile_id", userId)
      .maybeSingle();

    if (existingError) {
      console.error("Error checking existing player_profiles row:", existingError);
      return res.status(500).json({ error: existingError.message });
    }

    let resultRow: any = null;

    if (existing) {
      // Update existing row
      const { data, error } = await supabase
        .from("player_profiles")
        .update(updates)
        .eq("profile_id", userId)
        .select()
        .single();

      if (error) {
        console.error("Error updating player_profiles row:", error);
        return res.status(500).json({ error: error.message });
      }

      resultRow = data;
    } else {
      // Insert new row
      const { data, error } = await supabase
        .from("player_profiles")
        .insert([{ profile_id: userId, ...updates }])
        .select()
        .single();

      if (error) {
        console.error("Error inserting profile_id row:", error);
        return res.status(500).json({ error: error.message });
      }

      resultRow = data;
    }

    return res.json({
      player_profile: resultRow,
    });
  } catch (err) {
    console.error("Unexpected error in PUT /me/player-profile:", err);
    return res.status(500).json({ error: "Failed to save player profile" });
  }
});


/**
 * Update current user's basic profile in the "profiles" table.
 * Fields supported:
 *  - display_name (string, required if present)
 *  - first_name (string | null)
 *  - last_name (string | null)
 *  - avatar_url (string | null)
 *  - birthdate (string in YYYY-MM-DD, optional)
 */
app.patch("/me", requireAuth, async (req: AuthedRequest, res) => {
  const userId = req.user!.id;
  const {
    display_name,
    first_name,
    last_name,
    avatar_url,
    birthdate,
  } = req.body || {};

  const updates: any = {};

  // display_name: optional here, but if provided must be non-empty
  if (typeof display_name === "string") {
    const trimmed = display_name.trim();
    if (!trimmed) {
      return res.status(400).json({
        error: "display_name, if provided, must be a non-empty string.",
      });
    }
    updates.display_name = trimmed;
  }

  if (typeof first_name === "string") {
    updates.first_name = first_name.trim() || null;
  }

  if (typeof last_name === "string") {
    updates.last_name = last_name.trim() || null;
  }

  if (typeof avatar_url === "string") {
    updates.avatar_url = avatar_url.trim() || null;
  }

  if (typeof birthdate === "string") {
    // Simple YYYY-MM-DD sanity check – Supabase will do the actual cast
    const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!isoDateRegex.test(birthdate)) {
      return res.status(400).json({
        error: "birthdate must be a string in YYYY-MM-DD format.",
      });
    }
    updates.birthdate = birthdate;
  }

  
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({
      error: "No valid fields provided to update.",
    });
  }

  // Always bump updated_at server-side
  updates.updated_at = new Date().toISOString();

  try {
    const { data, error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", userId)
      .select()
      .single();

    if (error) {
      console.error("Error updating profile:", error);
      return res.status(500).json({ error: error.message });
    }

    return res.json(data);
  } catch (err) {
    console.error("Unexpected error in PATCH /me:", err);
    return res.status(500).json({ error: "Failed to update profile" });
  }
});



type PublicRole = "player" | "parent" | "coach";

app.post("/accounts/basic", requireAuth, async (req: AuthedRequest, res) => {
  const userId = req.user!.id;
  const { role, display_name, first_name, last_name } = req.body || {};

  const allowedRoles: PublicRole[] = ["player", "parent", "coach"];

  if (
    !role ||
    typeof role !== "string" ||
    !allowedRoles.includes(role as PublicRole) // cast fixes TS error
  ) {
    return res.status(400).json({
      error: "Invalid role. Must be one of: player, parent, coach.",
    });
  }

  if (!display_name || typeof display_name !== "string" || !display_name.trim()) {
    return res.status(400).json({
      error: "display_name is required and must be a non-empty string.",
    });
  }

  const payload: any = {
    id: userId,
    role, // "player" | "parent" | "coach"
    display_name: display_name.trim(),
  };

  if (typeof first_name === "string") {
    payload.first_name = first_name.trim() || null;
  }

  if (typeof last_name === "string") {
    payload.last_name = last_name.trim() || null;
  }

  try {
    const { data, error } = await supabase
      .from("profiles")
      .upsert(payload)
      .select()
      .single();

    if (error) {
      console.error("Error upserting basic profile:", error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error("Unexpected error in POST /accounts/basic:", err);
    return res.status(500).json({ error: "Failed to create/update basic account" });
  }
});


/**
 * Get the current user's extended coach profile.
 * - Requires: Authorization: Bearer <Supabase access token>
 * - Only works if profiles.role is 'coach' or 'assistant'
 */
app.get("/me/coach-profile", requireAuth, async (req: AuthedRequest, res) => {
  const userId = req.user!.id;

  try {
    // 1) Load base profile
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, role, display_name, first_name, last_name, avatar_url, created_at, updated_at")
      .eq("id", userId)
      .single();

    if (profileError || !profile) {
      console.error("Error fetching base profile in GET /me/coach-profile:", profileError);
      return res.status(500).json({ error: profileError?.message ?? "Failed to load profile" });
    }

    if (profile.role !== "coach" && profile.role !== "assistant") {
      return res.status(403).json({
        error: "This endpoint is only available for coach/assistant accounts.",
      });
    }

    // 2) Load coach-specific profile (may or may not exist yet)
    const { data: coachProfile, error: cpError } = await supabase
      .from("coach_profiles")
      .select("*")
      .eq("profile_id", userId)
      .maybeSingle();

    if (cpError) {
      console.error("Error fetching coach_profiles in GET /me/coach-profile:", cpError);
      return res.status(500).json({ error: cpError.message });
    }

    return res.json({
      profile,
      coach_profile: coachProfile, // may be null if not created yet
    });
  } catch (err) {
    console.error("Unexpected error in GET /me/coach-profile:", err);
    return res.status(500).json({ error: "Failed to load coach profile" });
  }
});

/**
 * Get the current user's extended coach profile.
 * - Requires: Authorization: Bearer <Supabase access token>
 * - Only works if profiles.role is 'coach' or 'assistant'
 */
app.get("/me/coach-profile", requireAuth, async (req: AuthedRequest, res) => {
  const userId = req.user!.id;

  try {
    // 1) Load base profile
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, role, display_name, first_name, last_name, avatar_url, created_at, updated_at")
      .eq("id", userId)
      .single();

    if (profileError || !profile) {
      console.error("Error fetching base profile in GET /me/coach-profile:", profileError);
      return res.status(500).json({ error: profileError?.message ?? "Failed to load profile" });
    }

    if (profile.role !== "coach" && profile.role !== "assistant") {
      return res.status(403).json({
        error: "This endpoint is only available for coach/assistant accounts.",
      });
    }

    // 2) Load coach-specific profile (may or may not exist yet)
    const { data: coachProfile, error: cpError } = await supabase
      .from("coach_profiles")
      .select("*")
      .eq("profile_id", userId)
      .maybeSingle();

    if (cpError) {
      console.error("Error fetching coach_profiles in GET /me/coach-profile:", cpError);
      return res.status(500).json({ error: cpError.message });
    }

    return res.json({
      profile,
      coach_profile: coachProfile, // may be null if not created yet
    });
  } catch (err) {
    console.error("Unexpected error in GET /me/coach-profile:", err);
    return res.status(500).json({ error: "Failed to load coach profile" });
  }
});

/**
 * Create or update the current coach's extended profile in coach_profiles.
 *
 * Accepts:
 *  - phone (string)
 *  - organization (string)
 *  - title (string)
 *  - years_experience (number)
 *  - bio (string)
 *  - city, state, postal_code (strings)
 *
 * You can safely send partials; only provided fields are updated.
 */
app.put("/me/coach-profile", requireAuth, async (req: AuthedRequest, res) => {
  const userId = req.user!.id;
  const body = req.body as CoachProfileUpdateRequest | undefined;

  if (!body || typeof body !== "object") {
    return res.status(400).json({ error: "Request body must be a JSON object." });
  }

  try {
    // 1) Ensure user is a coach/assistant
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("id", userId)
      .single();

    if (profileError || !profile) {
      console.error("Error fetching profile in PUT /me/coach-profile:", profileError);
      return res.status(500).json({ error: profileError?.message ?? "Failed to load profile" });
    }

    if (profile.role !== "coach" && profile.role !== "assistant") {
      return res.status(403).json({
        error: "Only coach/assistant accounts can update a coach profile.",
      });
    }

    const updates: any = {};

    if (body.phone !== undefined) {
      updates.phone =
        typeof body.phone === "string" && body.phone.trim().length > 0
          ? body.phone.trim()
          : null;
    }

    if (body.organization !== undefined) {
      updates.organization =
        typeof body.organization === "string" && body.organization.trim().length > 0
          ? body.organization.trim()
          : null;
    }

    if (body.title !== undefined) {
      updates.title =
        typeof body.title === "string" && body.title.trim().length > 0
          ? body.title.trim()
          : null;
    }

    if (body.years_experience !== undefined) {
      if (
        body.years_experience === null ||
        (typeof body.years_experience === "number" &&
          Number.isFinite(body.years_experience) &&
          body.years_experience >= 0 &&
          body.years_experience < 80)
      ) {
        updates.years_experience = body.years_experience;
      } else {
        return res.status(400).json({
          error: "years_experience must be a non-negative number under 80, or null.",
        });
      }
    }

    if (body.bio !== undefined) {
      updates.bio =
        typeof body.bio === "string" && body.bio.trim().length > 0
          ? body.bio.trim()
          : null;
    }

    if (body.city !== undefined) {
      updates.city =
        typeof body.city === "string" && body.city.trim().length > 0
          ? body.city.trim()
          : null;
    }

    if (body.state !== undefined) {
      updates.state =
        typeof body.state === "string" && body.state.trim().length > 0
          ? body.state.trim()
          : null;
    }

    if (body.postal_code !== undefined) {
      updates.postal_code =
        typeof body.postal_code === "string" && body.postal_code.trim().length > 0
          ? body.postal_code.trim()
          : null;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        error: "No valid fields were provided to update.",
      });
    }

    updates.updated_at = new Date().toISOString();

    // 2) Check if a coach_profiles row already exists
    const { data: existing, error: existingError } = await supabase
      .from("coach_profiles")
      .select("profile_id")
      .eq("profile_id", userId)
      .maybeSingle();

    if (existingError) {
      console.error("Error checking existing coach_profiles row:", existingError);
      return res.status(500).json({ error: existingError.message });
    }

    let resultRow: any = null;

    if (existing) {
      // Update existing row
      const { data, error } = await supabase
        .from("coach_profiles")
        .update(updates)
        .eq("profile_id", userId)
        .select()
        .single();

      if (error) {
        console.error("Error updating coach_profiles row:", error);
        return res.status(500).json({ error: error.message });
      }

      resultRow = data;
    } else {
      // Insert new row
      const { data, error } = await supabase
        .from("coach_profiles")
        .insert([{ profile_id: userId, ...updates }])
        .select()
        .single();

      if (error) {
        console.error("Error inserting coach_profiles row:", error);
        return res.status(500).json({ error: error.message });
      }

      resultRow = data;
    }

    return res.json({
      coach_profile: resultRow,
    });
  } catch (err) {
    console.error("Unexpected error in PUT /me/coach-profile:", err);
    return res.status(500).json({ error: "Failed to save coach profile" });
  }
});

/**
 * List all children (player profiles) linked to the current parent.
 * - Requires: parent account (profiles.role === 'parent')
 */
app.get("/me/children", requireAuth, async (req: AuthedRequest, res) => {
  const userId = req.user!.id;

  try {
    // Ensure user is a parent
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("id", userId)
      .single();

    if (profileError || !profile) {
      console.error("Error fetching profile in GET /me/children:", profileError);
      return res.status(500).json({ error: profileError?.message ?? "Failed to load profile" });
    }

    if (profile.role !== "parent") {
      return res.status(403).json({ error: "This endpoint is only available for parent accounts." });
    }

    // Fetch links
    const { data: links, error: linksError } = await supabase
      .from("parent_child_links")
      .select("id, child_profile_id, relationship")
      .eq("parent_profile_id", userId);

    if (linksError) {
      console.error("Error fetching parent_child_links in GET /me/children:", linksError);
      return res.status(500).json({ error: linksError.message });
    }

    if (!links || links.length === 0) {
      return res.json([]);
    }

    const childIds = links.map((l) => l.child_profile_id);

    // Load child profiles (players)
    const { data: children, error: childrenError } = await supabase
      .from("profiles")
      .select("id, role, display_name, first_name, last_name, birthdate, avatar_url")
      .in("id", childIds);

    if (childrenError) {
      console.error("Error fetching child profiles in GET /me/children:", childrenError);
      return res.status(500).json({ error: childrenError.message });
    }

    // Index children by id for easy join
    const childrenById = new Map<string, any>();
    (children || []).forEach((c) => {
      childrenById.set(c.id, c);
    });

    const result = links.map((link) => ({
      link_id: link.id,
      relationship: link.relationship,
      child: childrenById.get(link.child_profile_id) || null,
    }));

    return res.json(result);
  } catch (err) {
    console.error("Unexpected error in GET /me/children:", err);
    return res.status(500).json({ error: "Failed to load children" });
  }
});

/**
 * Link the current parent account to an existing player profile.
 * Body:
 *  - child_profile_id: string (UUID of the child's profile)
 *  - relationship: string | null (optional, e.g. "Father")
 */
app.post("/me/children", requireAuth, async (req: AuthedRequest, res) => {
  const userId = req.user!.id;
  const body = req.body as ParentChildLinkCreateRequest | undefined;

  if (!body || typeof body !== "object" || !body.child_profile_id) {
    return res.status(400).json({ error: "child_profile_id is required." });
  }

  try {
    // Ensure user is a parent
    const { data: parentProfile, error: parentError } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("id", userId)
      .single();

    if (parentError || !parentProfile) {
      console.error("Error fetching parent profile in POST /me/children:", parentError);
      return res.status(500).json({ error: parentError?.message ?? "Failed to load parent profile" });
    }

    if (parentProfile.role !== "parent") {
      return res.status(403).json({ error: "Only parent accounts can create parent-child links." });
    }

    // Ensure child exists and is a player
    const { data: childProfile, error: childError } = await supabase
      .from("profiles")
      .select("id, role, display_name, first_name, last_name")
      .eq("id", body.child_profile_id)
      .single();

    if (childError || !childProfile) {
      console.error("Error fetching child profile in POST /me/children:", childError);
      return res.status(404).json({ error: "Child profile not found." });
    }

    if (childProfile.role !== "player") {
      return res.status(400).json({ error: "child_profile_id must refer to a player account." });
    }

    const relationship =
      typeof body.relationship === "string" && body.relationship.trim().length > 0
        ? body.relationship.trim()
        : null;

    // Upsert-like behavior: unique (parent_profile_id, child_profile_id)
    const { data: link, error: linkError } = await supabase
      .from("parent_child_links")
      .upsert(
        [
          {
            parent_profile_id: userId,
            child_profile_id: body.child_profile_id,
            relationship,
          },
        ],
        {
          onConflict: "parent_profile_id,child_profile_id",
        }
      )
      .select()
      .single();

    if (linkError || !link) {
      console.error("Error inserting/upserting parent_child_links in POST /me/children:", linkError);
      return res.status(500).json({ error: linkError?.message ?? "Failed to create link" });
    }

    return res.status(201).json({
      link,
      child: childProfile,
    });
  } catch (err) {
    console.error("Unexpected error in POST /me/children:", err);
    return res.status(500).json({ error: "Failed to create parent-child link" });
  }
});

/**
 * Remove the parent ↔ child link for the given child profile id.
 */
app.delete("/me/children/:childProfileId", requireAuth, async (req: AuthedRequest, res) => {
  const userId = req.user!.id;
  const { childProfileId } = req.params;

  try {
    // Ensure user is a parent
    const { data: parentProfile, error: parentError } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("id", userId)
      .single();

    if (parentError || !parentProfile) {
      console.error("Error fetching parent profile in DELETE /me/children/:childProfileId:", parentError);
      return res.status(500).json({ error: parentError?.message ?? "Failed to load parent profile" });
    }

    if (parentProfile.role !== "parent") {
      return res.status(403).json({ error: "Only parent accounts can remove parent-child links." });
    }

    const { error: deleteError } = await supabase
      .from("parent_child_links")
      .delete()
      .eq("parent_profile_id", userId)
      .eq("child_profile_id", childProfileId);

    if (deleteError) {
      console.error("Error deleting parent_child_links row:", deleteError);
      return res.status(500).json({ error: deleteError.message });
    }

    return res.status(204).send();
  } catch (err) {
    console.error("Unexpected error in DELETE /me/children/:childProfileId:", err);
    return res.status(500).json({ error: "Failed to remove parent-child link" });
  }
});

/**
 * List all events for a team.
 * Any team member can view.
 */
app.get("/teams/:teamId/events", requireAuth, async (req: AuthedRequest, res) => {
  const { teamId } = req.params;

  const role = await assertTeamRoleOr403(req, res, teamId, ANY_MEMBER);
  if (!role) return;

  try {
    const { data, error } = await supabase
      .from("events")
      .select("*")
      .eq("team_id", teamId)
      .order("start_at", { ascending: true });

    if (error) {
      console.error("Error fetching events:", error);
      return res.status(500).json({ error: error.message });
    }

    return res.json(data ?? []);
  } catch (err) {
    console.error("Unexpected error in GET /teams/:teamId/events:", err);
    return res.status(500).json({ error: "Failed to load events" });
  }
});

/**
 * Create a new team event (practice, game, etc.)
 * Coaches and Assistants can create events.
 */
app.post("/teams/:teamId/events", requireAuth, async (req: AuthedRequest, res) => {
  const userId = req.user!.id;
  const { teamId } = req.params;
  const {
    title,
    description,
    event_type,
    start_at,
    end_at,
    is_all_day,
    location,
  } = req.body || {};

  const role = await assertTeamRoleOr403(req, res, teamId, COACH_AND_ASSISTANT);
  if (!role) return;

  if (!title || typeof title !== "string") {
    return res.status(400).json({ error: "title is required." });
  }

  if (!start_at) {
    return res.status(400).json({ error: "start_at is required." });
  }

  try {
    const payload: any = {
      team_id: teamId,
      created_by: userId,
      title: title.trim(),
      description: description ?? null,
      event_type: event_type ?? null,
      start_at,
      end_at: end_at ?? null,
      is_all_day: !!is_all_day,
      location: location ?? null,
    };

    const { data, error } = await supabase
      .from("events")
      .insert([payload])
      .select()
      .single();

    if (error) {
      console.error("Error inserting event:", error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(201).json(data);
  } catch (err) {
    console.error("Unexpected error in POST /teams/:teamId/events:", err);
    return res.status(500).json({ error: "Failed to create event" });
  }
});

type TeamLevel =
  | "recreational"
  | "aa"
  | "aaa"
  | "majors"
  | "hs_scholastic"
  | "ncaa"
  | "college_summer"
  | "pro";

function getAgeBucketCoreFraction(ageLabelRaw: string): number {
  const ageLabel = (ageLabelRaw || "").toUpperCase();

  if (["5U", "6U", "7U"].includes(ageLabel)) return 0.30;        // youth_early
  if (["8U", "9U", "10U"].includes(ageLabel)) return 0.40;       // youth_mid
  if (["11U", "12U", "13U"].includes(ageLabel)) return 0.50;     // youth_late
  if (["14U", "HS"].includes(ageLabel)) return 0.60;             // hs
  if (["COLLEGE", "COLLEGIATE", "NCAA"].includes(ageLabel)) return 0.70;
  if (["PRO"].includes(ageLabel)) return 0.70;

  return 0.50;
}

function getLevelDelta(levelRaw: string | null | undefined): number {
  const level = (levelRaw || "").toLowerCase() as TeamLevel;

  switch (level) {
    case "recreational":
      return -0.10;
    case "aa":
      return -0.05;
    case "aaa":
      return 0.0;
    case "majors":
      return 0.05;
    case "hs_scholastic":
      return 0.05;
    case "college_summer":
      return 0.10;
    case "ncaa":
      return 0.10;
    case "pro":
      return 0.20;
    default:
      return 0.0;
  }
}

function getCoreFraction(ageLabel: string, levelRaw: string | null | undefined): number {
  const base = getAgeBucketCoreFraction(ageLabel);
  const delta = getLevelDelta(levelRaw);
  const raw = base + delta;
  const rMin = 0.25;
  const rMax = 0.95;
  return Math.max(rMin, Math.min(rMax, raw));
}

function computeTeamPercentForMetric(
  percents: number[],
  ageLabel: string,
  levelRaw: string | null | undefined
): number | null {
  if (!percents.length) return null;

  const r = getCoreFraction(ageLabel, levelRaw);
  const N = percents.length;
  const K = Math.max(1, Math.ceil(r * N));

  const sorted = [...percents].sort((a, b) => b - a);
  const topK = sorted.slice(0, K);
  const sum = topK.reduce((acc, v) => acc + v, 0);

  return sum / topK.length;
}

app.get(
  "/teams/:teamId/trophies",
  requireAuth,
  async (req: AuthedRequest, res) => {
    const { teamId } = req.params;

    // Only team members can view trophies (coach/assistant/player/parent)
    const role = await assertTeamRoleOr403(req, res, teamId, ANY_MEMBER);
    if (!role) return;

    try {
      // 1) Load trophies for this team
      const { data: rows, error: trophiesError } = await supabase
        .from("team_trophies")
        .select("*")
        .eq("team_id", teamId)
        .order("awarded_at", { ascending: true });

      if (trophiesError) {
        console.error("Error fetching team_trophies:", trophiesError);
        return res.status(500).json({ error: "Failed to load team trophies." });
      }

      if (!rows || rows.length === 0) {
        return res.status(200).json({
          team_id: teamId,
          trophies: [],
        });
      }

      // 2) Fetch trophy definitions
      const trophyIds = Array.from(
        new Set(
          rows
            .map((row: any) => row.trophy_id as number | null)
            .filter((id): id is number => id != null)
        )
      );

      let defsById: Record<number, any> = {};
      if (trophyIds.length > 0) {
        const { data: defs, error: defsError } = await supabase
          .from("trophy_definitions")
          .select(
            "id, name, description, icon_url, age_group_label, metric_code, tier"
          )
          .in("id", trophyIds);

        if (defsError) {
          console.error("Error fetching trophy_definitions:", defsError);
        } else if (defs) {
          defsById = Object.fromEntries(
            (defs as any[]).map((d) => [d.id as number, d])
          );
        }
      }

      // 3) Merge rows + definitions
      const trophies = rows.map((row: any) => {
        const def = defsById[row.trophy_id as number] || null;
        return {
          id: row.id,
          trophy_id: row.trophy_id,
          team_id: row.team_id,
          awarded_at: row.awarded_at,
          definition: def,
        };
      });

      return res.status(200).json({
        team_id: teamId,
        trophies,
      });
    } catch (err) {
      console.error("Unexpected error in GET /teams/:teamId/trophies:", err);
      return res
        .status(500)
        .json({ error: "Failed to load team trophies (internal error)." });
    }
  }
);



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

type CoreMetricCode =
  | "bpoprating"
  | "offense"
  | "defense"
  | "pitching"
  | "athletic";

interface StatsMetricSummary {
  code: CoreMetricCode;
  label: string;
  score: number | null; // 0–50 team avg
  percent: number | null; // 0–100 team avg percent
  sample_size: number; // players contributing
}

interface TeamStatsOverview {
  team_id: string;
  team_name: string | null;
  age_group_label: string | null;
  level: string | null;
  metrics: StatsMetricSummary[];
}

interface PlayerStatsOverview {
  player_id: string;
  team_id: string | null;
  age_group_label: string | null;
  latest_assessment_id: number | null;
  metrics: StatsMetricSummary[];
}

// ---------------------------------------------------------------------------
// Offense drilldown types
// ---------------------------------------------------------------------------

type OffenseMetricCode =
  | "offense"
  | "contact"
  | "power"
  | "speed"
  | "strikechance";

interface OffenseDrilldownMetric {
  code: OffenseMetricCode;
  label: string;
  /**
   * For offense/contact/power/speed:
   *   - 0–50 score (same scale as BPOP)
   * For strikechance:
   *   - 0–1 fraction (frontend shows percent)
   */
  team_average: number | null;
  /** Number of players contributing a non‑null value */
  player_count: number;
}

interface OffenseDrilldownPlayerMetrics {
  player_id: string;
  player_name: string | null;
  jersey_number: number | null;
  hitting_score: number | null;
  contact_score: number | null;
  power_score: number | null;
  speed_score: number | null;
  /** 0–1 StrikeChance (frontend shows K%) */
  strike_chance: number | null;
}

interface OffenseTestPlayerRow {
  player_id: string;
  player_name: string | null;
  jersey_number: number | null;

  /**
   * Primary numeric value used for charts / tables:
   *  - contact tests → points
   *  - power tests   → mph
   *  - speed tests   → feet per second
   */
  value: number | null;

  /** Raw MPH for power tests (bat speed / exit velo). */
  raw_mph?: number | null;

  /**
   * Extra raw data for speed tests only (run_1b / run_4b).
   * These stay undefined for non‑speed tests.
   */
  raw_seconds?: number | null;
  raw_distance_ft?: number | null;
}

interface OffenseTestBreakdown {
  id: string;            // e.g. "tee_ld_points"
  label: string;         // will be humanized on the frontend via metricMeta
  submetric: OffenseMetricCode;

  /**
   * Average of per_player[*].value on the same scale as that value:
   *  - contact tests → points
   *  - power tests   → mph
   *  - speed tests   → feet per second
   */
  team_average: number | null;

  player_count: number;
  per_player: OffenseTestPlayerRow[];

  /**
   * Additional aggregates for speed tests (1B / 4B).
   * Left undefined for other tests.
   */
  team_avg_seconds?: number | null;
  team_avg_feet_per_second?: number | null;
  base_path_feet?: number | null;

  /** Team-average raw MPH for power tests (bat speed / exit velo). */
  team_avg_mph?: number | null;
}


type OffenseTestsByMetric = Record<OffenseMetricCode, OffenseTestBreakdown[]>;

interface TeamOffenseDrilldown {
  team_id: string;
  team_name: string | null;
  age_group_label: string | null;
  level: string | null;
  metrics: OffenseDrilldownMetric[];
  players: OffenseDrilldownPlayerMetrics[];
  tests_by_metric: OffenseTestsByMetric;
}

/**
 * Minimal shape we need to build per‑test breakdowns from ratings.
 */
interface PlayerWithRatingForOffense {
  player_id: string;
  player_name: string | null;
  jersey_number: number | null;
  // Parsed player_ratings.breakdown JSON (or null)
  rating_breakdown: any | null;
}

interface OffenseTestDef {
  id: string;                 // internal id, matches StatsPage mapping keys
  submetric: OffenseMetricCode;
  source: "hitting" | "athletic";
  field: string;              // key inside `tests` for the points-based score
  label: string;
  /**
   * For power tests: metric_key for the raw MPH metric in assessment_metrics /
   * player_assessment_values (e.g. "max_bat_speed").
   */
  raw_metric_key?: string;
  /**
   * For speed tests: metric_keys for raw time (seconds) and distance (feet).
   */
  time_metric_key?: string;
  distance_metric_key?: string;
}

// We deliberately omit raw "speed_points_total" / "contact_raw_points" etc.
const OFFENSE_TEST_DEFS: OffenseTestDef[] = [
  // CONTACT – from breakdown.hitting.tests (points only)
  {
    id: "tee_ld_points",
    submetric: "contact",
    source: "hitting",
    field: "tee_ld_points",
    label: "Tee line drive (10 swings) points",
  },
  {
    id: "pitch_points",
    submetric: "contact",
    source: "hitting",
    field: "pitch_points",
    label: "Fastball quality (10 pitches) points",
  },
  {
    id: "curveball_points",
    submetric: "contact",
    source: "hitting",
    field: "curveball_points",
    label: "Curveball quality (5 pitches) points",
  },
  {
    id: "varied_speed_points",
    submetric: "contact",
    source: "hitting",
    field: "varied_speed_points",
    label: "Varied speed quality (5 pitches) points",
  },

  // POWER – points live in breakdown.hitting.tests.*, but value should be MPH
  {
    id: "bat_speed_points",
    submetric: "power",
    source: "hitting",
    field: "bat_speed_points",
    label: "Max bat speed (MPH)",
    raw_metric_key: "max_bat_speed",
  },
  {
    id: "exit_velo_points",
    submetric: "power",
    source: "hitting",
    field: "exit_velo_points",
    label: "Max exit velo (MPH, tee)",
    raw_metric_key: "max_exit_velo_tee",
  },

  // SPEED – points in breakdown.athletic.tests.*, raw time/distance from metrics
  {
    id: "run_1b_points",
    submetric: "speed",
    source: "athletic",
    field: "run_1b_points",
    label: "Home to 1B",
    time_metric_key: "timed_run_1b",
    distance_metric_key: "timed_run_1b_distance_ft",
  },
  {
    id: "run_4b_points",
    submetric: "speed",
    source: "athletic",
    field: "run_4b_points",
    label: "Home to home",
    time_metric_key: "timed_run_4b",
    distance_metric_key: "timed_run_4b_distance_ft",
  },
];


interface PlayerForOffenseTests {
  player_id: string;
  player_name: string | null;
  jersey_number: number | null;
  hitting: any | null;
  athletic: any | null;
  /**
   * Raw assessment metrics merged from the underlying hitting / athletic
   * assessment rows for this player. Keys are metric_key values from
   * assessment_metrics (e.g. "max_bat_speed", "timed_run_1b").
   */
  rawMetrics?: Record<string, number> | null;
}


/**
 * Build test‑level breakdowns (contact / power / speed) for a team
 * from the raw player_ratings rows plus basic player identity info.
 *
 * ratingRows should be the raw rows from player_ratings for this team
 * (we'll internally pick the latest row per player that actually has
 * hitting / athletic tests).
 *
 * rawMetricsByAssessmentId is optional; when provided, it should map a
 * player_assessment_id to a map of metric_key → numeric value. This lets
 * us surface:
 *   - Power tests as MPH (max_bat_speed / max_exit_velo_tee)
 *   - Speed tests as ft/s + underlying seconds / basepath
 */
function buildOffenseTestBreakdownsForTeam(
  ratingRows: any[],
  playersBasic: {
    player_id: string;
    player_name: string | null;
    jersey_number: number | null;
  }[],
  rawMetricsByAssessmentId?: Map<number, Record<string, number>>,
  options?: {
    evalScope?: TeamEvalScope;
    playerAssessmentIdsByPlayer?: Map<string, number[]>;
  }
): OffenseTestsByMetric {
  const result: OffenseTestsByMetric = {
    offense: [],
    contact: [],
    power: [],
    speed: [],
    strikechance: [],
  };

  const isNumber = (v: any): v is number =>
    typeof v === "number" && Number.isFinite(v);

  const avg = (values: (number | null | undefined)[]): number | null => {
    const nums = values.filter(isNumber);
    if (!nums.length) return null;
    const sum = nums.reduce((acc, v) => acc + v, 0);
    return sum / nums.length;
  };

  const coerceNumber = (raw: any): number | null => {
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
    if (typeof raw === "string") {
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  };

  const parseBreakdown = (row: any): any => {
    let b = row?.breakdown;
    if (!b) return {};
    if (typeof b === "string") {
      try {
        b = JSON.parse(b);
      } catch {
        b = {};
      }
    }
    return b && typeof b === "object" ? b : {};
  };

  // Latest hitting / athletic breakdown per player (by created_at),
  // keeping track of which player_assessment_id they came from so we
  // can look up raw metrics (mph, seconds, distance) later.
  const hittingByPlayer = new Map<
    string,
    { created_at: string | null; breakdown: any; assessment_id: number | null }
  >();
  const athleticByPlayer = new Map<
    string,
    { created_at: string | null; breakdown: any; assessment_id: number | null }
  >();

  for (const row of ratingRows ?? []) {
    const playerId = row.player_id as string | null;
    if (!playerId) continue;

    const breakdown = parseBreakdown(row);
    const hittingTests = breakdown?.hitting?.tests ?? {};
    const athleticTests =
      breakdown?.athletic?.tests ?? breakdown?.athlete?.tests ?? {};

    const hasHittingTest = Object.values(hittingTests).some(isNumber);
    const hasSpeedTest = Object.values(athleticTests).some(isNumber);
    const createdAt = row.created_at as string | null;
    const assessmentId =
      (row as any).assessment_id != null
        ? Number((row as any).assessment_id)
        : null;

    if (hasHittingTest) {
      const existing = hittingByPlayer.get(playerId);
      if (
        !existing ||
        (createdAt &&
          (!existing.created_at ||
            new Date(createdAt).getTime() >
              new Date(existing.created_at).getTime()))
      ) {
        hittingByPlayer.set(playerId, {
          created_at: createdAt,
          breakdown,
          assessment_id: assessmentId,
        });
      }
    }

    if (hasSpeedTest) {
      const existing = athleticByPlayer.get(playerId);
      if (
        !existing ||
        (createdAt &&
          (!existing.created_at ||
            new Date(createdAt).getTime() >
              new Date(existing.created_at).getTime()))
      ) {
        athleticByPlayer.set(playerId, {
          created_at: createdAt,
          breakdown,
          assessment_id: assessmentId,
        });
      }
    }
  }

  const playersForTests: PlayerForOffenseTests[] = [];

  for (const pb of playersBasic) {
    const hittingSource = hittingByPlayer.get(pb.player_id);
    const athleticSource = athleticByPlayer.get(pb.player_id);

    if (!hittingSource && !athleticSource) {
      continue; // no test data at all for this player
    }

    const assessmentIdsForPlayer =
      options?.playerAssessmentIdsByPlayer?.get(pb.player_id) ?? [];

    // Merge raw metrics from the underlying assessment rows for this player.
    // For all-star scope, pick the BEST raw metric across all available
    // assessments for that player (max MPH, fastest ft/s). For other scopes we
    // default to the first available assessment id for that player, which will
    // align with the rating rows used for this drilldown.
    let mergedRaw: Record<string, number> | null = null;

    const getBucket = (assessmentId: number | null | undefined) => {
      if (!rawMetricsByAssessmentId || assessmentId == null) return null;
      return rawMetricsByAssessmentId.get(assessmentId) ?? null;
    };

    const useAssessmentOrder = assessmentIdsForPlayer.length
      ? assessmentIdsForPlayer
      : [hittingSource?.assessment_id, athleticSource?.assessment_id].filter(
          (v): v is number => typeof v === "number"
        );

    if (options?.evalScope === "all_star" && useAssessmentOrder.length) {
      const best: Record<string, number> = {};

      for (const aid of useAssessmentOrder) {
        const bucket = getBucket(aid);
        if (!bucket) continue;
        for (const [key, rawVal] of Object.entries(bucket)) {
          const v = typeof rawVal === "number" && Number.isFinite(rawVal)
            ? (rawVal as number)
            : null;
          if (v == null) continue;
          if (!(key in best) || v > best[key]) {
            best[key] = v;
          }
        }
      }

      mergedRaw = Object.keys(best).length ? best : null;
    } else {
      for (const aid of useAssessmentOrder) {
        const bucket = getBucket(aid);
        if (!bucket) continue;
        if (!mergedRaw) {
          mergedRaw = { ...bucket };
        } else {
          const target = mergedRaw as Record<string, number>;
          for (const [key, value] of Object.entries(bucket)) {
            if (
              typeof value === "number" &&
              Number.isFinite(value) &&
              !(key in target)
            ) {
              target[key] = value;
            }
          }
        }

        if (mergedRaw) break; // Non all-star scopes only need the first match
      }
    }

    playersForTests.push({
      player_id: pb.player_id,
      player_name: pb.player_name,
      jersey_number: pb.jersey_number,
      hitting: hittingSource?.breakdown?.hitting ?? null,
      athletic:
        athleticSource?.breakdown?.athletic ??
        athleticSource?.breakdown?.athlete ??
        null,
      rawMetrics: mergedRaw,
    });
  }

  for (const def of OFFENSE_TEST_DEFS) {
    const per_player: OffenseTestPlayerRow[] = playersForTests.map((p) => {
      const src = def.source === "hitting" ? p.hitting : p.athletic;
      const tests =
        src && typeof src === "object"
          ? src.tests ?? src
          : {};
      const rawPoints = (tests as any)[def.field];

      const assessmentIds =
        options?.playerAssessmentIdsByPlayer?.get(p.player_id) ?? [];

      let value: number | null = null;
      let raw_seconds: number | null | undefined;
      let raw_distance_ft: number | null | undefined;
      let raw_mph: number | null | undefined;

      const pickPowerMetric = (): number | null => {
        if (!rawMetricsByAssessmentId || !def.raw_metric_key) return null;
        let best: number | null = null;

        const consider = (aid: number | null | undefined) => {
          if (aid == null) return;
          const bucket = rawMetricsByAssessmentId?.get(aid);
          const rawVal = bucket ? bucket[def.raw_metric_key!] : null;
          if (typeof rawVal !== "number" || !Number.isFinite(rawVal)) return;
          if (best === null || rawVal > best) {
            best = rawVal;
          }
        };

        if (assessmentIds.length) {
          assessmentIds.forEach(consider);
        } else {
          consider(hittingByPlayer.get(p.player_id)?.assessment_id ?? null);
        }

        return best;
      };

      const pickSpeedMetric = (): {
        fps: number;
        seconds: number | null;
        distance: number | null;
      } | null => {
        if (
          !rawMetricsByAssessmentId ||
          !def.time_metric_key ||
          !def.distance_metric_key
        ) {
          return null;
        }

        let best: {
          fps: number;
          seconds: number | null;
          distance: number | null;
        } | null = null;

        const consider = (aid: number | null | undefined) => {
          if (aid == null) return;
          const bucket = rawMetricsByAssessmentId?.get(aid);
          if (!bucket) return;

          const secRaw = bucket[def.time_metric_key!];
          const distRaw = bucket[def.distance_metric_key!];

          const seconds =
            typeof secRaw === "number" && Number.isFinite(secRaw) && secRaw > 0
              ? (secRaw as number)
              : null;
          const distanceFt =
            typeof distRaw === "number" &&
            Number.isFinite(distRaw) &&
            distRaw > 0
              ? (distRaw as number)
              : null;

          if (seconds != null && distanceFt != null) {
            const fps = distanceFt / seconds;
            if (!best || fps > best.fps) {
              best = { fps, seconds, distance: distanceFt };
            }
          }
        };

        if (assessmentIds.length) {
          assessmentIds.forEach(consider);
        } else {
          consider(athleticByPlayer.get(p.player_id)?.assessment_id ?? null);
        }

        return best;
      };

      if (def.raw_metric_key) {
        raw_mph = pickPowerMetric();
        value = raw_mph ?? coerceNumber(rawPoints);
      } else if (def.time_metric_key && def.distance_metric_key) {
        const picked = pickSpeedMetric();
        if (picked) {
          value = picked.fps;
          raw_seconds = picked.seconds;
          raw_distance_ft = picked.distance;
        } else if (p.rawMetrics) {
          // Fall back to whatever raw metrics we merged earlier
          const secRaw = p.rawMetrics[def.time_metric_key];
          const distRaw = p.rawMetrics[def.distance_metric_key];

          const seconds =
            typeof secRaw === "number" && Number.isFinite(secRaw) && secRaw > 0
              ? (secRaw as number)
              : null;
          const distanceFt =
            typeof distRaw === "number" &&
            Number.isFinite(distRaw) &&
            distRaw > 0
              ? (distRaw as number)
              : null;

          raw_seconds = seconds;
          raw_distance_ft = distanceFt;

          if (seconds != null && distanceFt != null) {
            value = distanceFt / seconds;
          }
        }

        if (value === null) {
          value = coerceNumber(rawPoints);
        }
      } else {
        // CONTACT tests (and any other fallback): just use the points value
        value = coerceNumber(rawPoints);
      }

      const row: OffenseTestPlayerRow = {
        player_id: p.player_id,
        player_name: p.player_name,
        jersey_number: p.jersey_number,
        value,
      } as OffenseTestPlayerRow;

      if (raw_seconds !== undefined) {
        row.raw_seconds = raw_seconds;
      }
      if (raw_distance_ft !== undefined) {
        row.raw_distance_ft = raw_distance_ft;
      }
      if (raw_mph !== undefined) {
        row.raw_mph = raw_mph;
      }

      return row;
    });

    const team_average = avg(per_player.map((p) => p.value));
    const player_count = per_player.filter((p) => p.value != null).length;

    if (!player_count) continue;

    const breakdown: OffenseTestBreakdown = {
      id: def.id,
      label: def.label,
      submetric: def.submetric,
      team_average,
      player_count,
      per_player,
    };

    // For speed tests, also compute extra aggregates (seconds / basepath).
    if (def.time_metric_key && def.distance_metric_key) {
      const secondsList = per_player
        .map((p) => p.raw_seconds)
        .filter(isNumber);
      const distanceList = per_player
        .map((p) => p.raw_distance_ft)
        .filter(isNumber);

      const team_avg_seconds = avg(secondsList);
      const base_path_feet =
        distanceList.length > 0
          ? Math.max(...distanceList)
          : null;

      let team_avg_feet_per_second: number | null = null;
      if (
        team_avg_seconds != null &&
        base_path_feet != null &&
        team_avg_seconds > 0
      ) {
        team_avg_feet_per_second = base_path_feet / team_avg_seconds;
      }

      breakdown.team_avg_seconds = team_avg_seconds;
      breakdown.team_avg_feet_per_second = team_avg_feet_per_second;
      breakdown.base_path_feet = base_path_feet;
    }

    if (def.raw_metric_key) {
      const rawMphValues = per_player
        .map((p) => p.raw_mph)
        .filter(isNumber);
      breakdown.team_avg_mph = avg(rawMphValues);
    }

    result[def.submetric].push(breakdown);
  }

  (Object.keys(result) as OffenseMetricCode[]).forEach((metric) => {
    result[metric].sort((a, b) => a.label.localeCompare(b.label));
  });

  return result;
}


/**
 * Optional: build the same test‑level structure from an array of
 * PlayerWithRatingForOffense (not currently used in computeTeamOffenseDrilldown,
 * but you can keep it for future player‑centric drilldowns).
 */
function buildOffenseTestBreakdownsForPlayers(
  players: PlayerWithRatingForOffense[]
): OffenseTestsByMetric {
  const result: OffenseTestsByMetric = {
    offense: [],
    contact: [],
    power: [],
    speed: [],
    strikechance: [],
  };

  const isNumber = (v: any): v is number =>
    typeof v === "number" && Number.isFinite(v);

  for (const def of OFFENSE_TEST_DEFS) {
    const per_player: OffenseTestPlayerRow[] = players.map((p) => {
      const breakdown = p.rating_breakdown ?? {};
      const tests =
        def.source === "hitting"
          ? breakdown?.hitting?.tests ?? {}
          : breakdown?.athletic?.tests ?? breakdown?.athlete?.tests ?? {};

      let raw = (tests as any)[def.field];

      if (Array.isArray(raw)) {
        raw = null;
      }

      let value: number | null = null;
      if (typeof raw === "number" && Number.isFinite(raw)) {
        value = raw;
      } else if (typeof raw === "string") {
        const parsed = Number(raw);
        value = Number.isFinite(parsed) ? parsed : null;
      }

      return {
        player_id: p.player_id,
        player_name: p.player_name,
        jersey_number: p.jersey_number,
        value,
      };
    });

    const numericValues = per_player
      .map((r) => (isNumber(r.value) ? r.value : null))
      .filter((v): v is number => v !== null);

    if (!numericValues.length) continue;

    const sum = numericValues.reduce((acc, v) => acc + v, 0);
    const team_average = sum / numericValues.length;

    const breakdown: OffenseTestBreakdown = {
      id: def.id,
      label: def.label,
      submetric: def.submetric,
      team_average,
      player_count: numericValues.length,
      per_player,
    };

    result[def.submetric].push(breakdown);
  }

  (Object.keys(result) as OffenseMetricCode[]).forEach((metric) => {
    result[metric].sort((a, b) => a.label.localeCompare(b.label));
  });

  return result;
}



// ---------------------------------------------------------------------------
// Team stats overview (for StatsPage)
// ---------------------------------------------------------------------------

type TeamEvalScope = "latest_eval" | "all_star" | "specific" | null;

interface TeamEvalSelection {
  evalScope?: TeamEvalScope;
  assessmentDate?: string | null;
}

interface TeamAssessmentMeta {
  byAssessmentId: Map<number, string>;
  orderedDates: string[]; // ISO strings, most recent first
  latestDate: string | null;
}

function normalizeIsoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

async function loadTeamAssessmentMeta(
  teamId: string
): Promise<TeamAssessmentMeta> {
  const byAssessmentId = new Map<number, string>();

  const { data, error } = await supabase
    .from("player_assessments")
    .select("id, performed_at, created_at")
    .eq("team_id", teamId)
    .eq("kind", "official")
    .order("performed_at", { ascending: false });

  if (error || !data) {
    console.error("Error loading assessments for team stats:", error);
    return { byAssessmentId, orderedDates: [], latestDate: null };
  }

  const dates: string[] = [];

  for (const row of data as any[]) {
    const normalized =
      normalizeIsoDate(row.performed_at) || normalizeIsoDate(row.created_at);
    if (!normalized) continue;
    byAssessmentId.set(row.id as number, normalized);
    dates.push(normalized);
  }

  const orderedDates = Array.from(new Set(dates)).sort(
    (a, b) => new Date(b).getTime() - new Date(a).getTime()
  );

  return {
    byAssessmentId,
    orderedDates,
    latestDate: orderedDates[0] ?? null,
  };
}

function getAssessmentDateForRatingRow(
  row: { assessment_id?: any; player_assessment_id?: any; created_at?: any },
  meta: TeamAssessmentMeta
): string | null {
  const candidates = [row.player_assessment_id, row.assessment_id];

  for (const id of candidates) {
    if (typeof id === "number" && meta.byAssessmentId.has(id)) {
      return meta.byAssessmentId.get(id)!;
    }
  }

  return normalizeIsoDate(row.created_at);
}

function resolveLatestAssessmentDate(
  meta: TeamAssessmentMeta,
  ratingRows: TeamRatingRow[]
): string | null {
  if (meta.latestDate) return meta.latestDate;

  const dates = ratingRows
    .map((row) => getAssessmentDateForRatingRow(row, meta))
    .filter((d): d is string => !!d);

  if (!dates.length) return null;

  return dates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
}

function mergeBestValues(a: any, b: any): any {
  if (a === null || a === undefined) return b;
  if (b === null || b === undefined) return a;

  if (typeof a === "number" && typeof b === "number") {
    return Math.max(a, b);
  }

  if (
    typeof a === "object" &&
    typeof b === "object" &&
    !Array.isArray(a) &&
    !Array.isArray(b)
  ) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    const result: Record<string, any> = {};
    for (const key of keys) {
      result[key] = mergeBestValues((a as any)[key], (b as any)[key]);
    }
    return result;
  }

  return a ?? b;
}

function mergeBestBreakdowns(breakdowns: any[]): any {
  let merged: any = {};

  for (const raw of breakdowns) {
    let parsed = raw;
    if (typeof parsed === "string") {
      try {
        parsed = JSON.parse(parsed);
      } catch {
        parsed = {};
      }
    }
    if (!parsed || typeof parsed !== "object") continue;
    merged = mergeBestValues(merged, parsed);
  }

  return merged;
}

function toNumberOrNull(value: any): number | null {
  if (value === null || value === undefined) return null;
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : null;
}

function maxNumeric(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v !== null && !Number.isNaN(v));
  if (!nums.length) return null;
  return Math.max(...nums);
}

type TeamRatingRow = {
  id: number;
  player_id: string;
  age_group_id: number | string | null;
  player_assessment_id?: number | null;
  assessment_id: number | null;
  overall_score: string | number | null;
  offense_score: string | number | null;
  defense_score: string | number | null;
  pitching_score: string | number | null;
  created_at: string | null;
  breakdown: any;
};

function buildAllStarRows(
  rows: TeamRatingRow[]
): TeamRatingRow[] {
  const byPlayer = new Map<string, TeamRatingRow[]>();

  for (const row of rows) {
    if (!row.player_id) continue;
    const arr = byPlayer.get(row.player_id) ?? [];
    arr.push(row);
    byPlayer.set(row.player_id, arr);
  }

  const combined: TeamRatingRow[] = [];

  for (const [, playerRows] of byPlayer.entries()) {
    if (!playerRows.length) continue;
    const sorted = [...playerRows].sort((a, b) => {
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
      return bTime - aTime;
    });

    const mergedBreakdown = mergeBestBreakdowns(
      sorted.map((r) => r.breakdown ?? {})
    );

    const bestOverall = maxNumeric(
      sorted.map((r) => toNumberOrNull(r.overall_score))
    );

    const bestOffense = maxNumeric(
      sorted.map((r) => toNumberOrNull(r.offense_score))
    );

    const bestDefense = maxNumeric(
      sorted.map((r) => toNumberOrNull(r.defense_score))
    );

    const bestPitching = maxNumeric(
      sorted.map((r) => toNumberOrNull(r.pitching_score))
    );

    combined.push({
      ...sorted[0],
      overall_score: bestOverall ?? sorted[0].overall_score,
      offense_score: bestOffense ?? sorted[0].offense_score,
      defense_score: bestDefense ?? sorted[0].defense_score,
      pitching_score: bestPitching ?? sorted[0].pitching_score,
      breakdown: mergedBreakdown,
    });
  }

  return combined;
}

async function computeTeamStatsOverview(
  teamId: string,
  options: TeamEvalSelection = {}
): Promise<TeamStatsOverview | null> {
  // 1) Load the team – use age_group and alias it to age_group_label so
  //    we don't rely on a non-existent age_group_label column.
  const { data: teamRow, error: teamErr } = await supabase
    .from("teams")
    .select("id, name, age_group_label:age_group, level")
    .eq("id", teamId)
    .maybeSingle();

  if (teamErr) {
    console.error("Error fetching team for stats overview:", teamErr);
    return null;
  }
  if (!teamRow) {
    return null;
  }

  // 2) Load all ratings for this team
  const { data: ratingRows, error: ratingErr } = await supabase
    .from("player_ratings")
    .select(
      `
      id,
      player_id,
      age_group_id,
      player_assessment_id,
      assessment_id,
      overall_score,
      offense_score,
      defense_score,
      pitching_score,
      created_at,
      breakdown
    `
    )
    .eq("team_id", teamId)
    .order("created_at", { ascending: false });

  if (ratingErr) {
    console.error("Error fetching player_ratings for team stats:", ratingErr);
    return null;
  }

  if (!ratingRows || ratingRows.length === 0) {
    // No ratings yet – return an empty metrics array so the frontend can
    // render a "no data" state rather than blowing up.
    return {
      team_id: teamRow.id,
      team_name: teamRow.name ?? null,
      age_group_label: (teamRow as any).age_group_label ?? null,
      level: (teamRow as any).level ?? null,
      metrics: [],
    };
  }

  // 3) Optionally filter to a single age_group_id if present on the rows.
  //    (We no longer depend on a team-level age_group_id column.)
  let filteredRows = ratingRows as TeamRatingRow[];

  const distinctAgeGroupIds = Array.from(
    new Set(
      filteredRows
        .map((r) => r.age_group_id)
        .filter((v) => v !== null && v !== undefined)
        .map((v) => String(v))
    )
  );

  const ageGroupId =
    distinctAgeGroupIds.length === 1 ? distinctAgeGroupIds[0] : null;

  if (ageGroupId) {
    filteredRows = filteredRows.filter(
      (row) => String(row.age_group_id) === ageGroupId
    );
  }

  const assessmentMeta = await loadTeamAssessmentMeta(teamId);
  const normalizedAssessmentDate = normalizeIsoDate(options.assessmentDate);

  let targetAssessmentDate: string | null = null;
  if (options.evalScope === "latest_eval") {
    targetAssessmentDate = resolveLatestAssessmentDate(
      assessmentMeta,
      filteredRows
    );
  } else if (
    (options.evalScope === "specific" || normalizedAssessmentDate) &&
    normalizedAssessmentDate
  ) {
    targetAssessmentDate = normalizedAssessmentDate;
  }

  if (targetAssessmentDate) {
    const filteredByDate = filteredRows.filter((row) => {
      const performedAt = getAssessmentDateForRatingRow(row, assessmentMeta);
      if (!performedAt) return false;
      return normalizeIsoDate(performedAt) === targetAssessmentDate;
    });

    if (filteredByDate.length > 0) {
      filteredRows = filteredByDate;
    }
  }

  if (!filteredRows.length) {
    return {
      team_id: teamRow.id,
      team_name: teamRow.name ?? null,
      age_group_label: (teamRow as any).age_group_label ?? null,
      level: (teamRow as any).level ?? null,
      metrics: [],
    };
  }

  // 4) Determine which rows to use: all-star aggregate or latest per player
  let rows: TeamRatingRow[] = [];

  if (options.evalScope === "all_star") {
    rows = buildAllStarRows(filteredRows);
  } else {
    const latestByPlayer = new Map<string, TeamRatingRow>();

    for (const row of filteredRows) {
      const playerId = row.player_id;
      const existing = latestByPlayer.get(playerId);

      if (!existing) {
        latestByPlayer.set(playerId, row);
        continue;
      }

      const existingTime = existing.created_at
        ? new Date(existing.created_at).getTime()
        : 0;
      const rowTime = row.created_at ? new Date(row.created_at).getTime() : 0;

      if (rowTime > existingTime) {
        latestByPlayer.set(playerId, row);
      }
    }

    rows = Array.from(latestByPlayer.values());
  }

  if (!rows.length) {
    return {
      team_id: teamRow.id,
      team_name: teamRow.name ?? null,
      age_group_label: (teamRow as any).age_group_label ?? null,
      level: (teamRow as any).level ?? null,
      metrics: [],
    };
  }

  // 5) Build metrics (BPOP rating + offense/defense/pitching/athletic)

  const metricDefs: { code: CoreMetricCode; label: string }[] = [
    { code: "bpoprating", label: "BPOP Rating" },
    { code: "offense", label: "Offense" },
    { code: "defense", label: "Defense" },
    { code: "pitching", label: "Pitching" },
    { code: "athletic", label: "Athletic" },
  ];

  const metrics: StatsMetricSummary[] = metricDefs.map((def) => {
    let values: number[] = [];
    let percents: (number | null)[] = [];

    const ratingLikeRows: RatingResult[] = rows.map((row) => ({
      age_group_id: row.age_group_id,
      overall_score: parseScore(row.overall_score),
      offense_score: parseScore(row.offense_score),
      defense_score: parseScore(row.defense_score),
      pitching_score: parseScore(row.pitching_score),
      breakdown: row.breakdown || null,
    }));

    switch (def.code) {
      case "bpoprating": {
        values = ratingLikeRows
          .map((r) => r.overall_score)
          .filter((v): v is number => v != null && !Number.isNaN(v));

        const avgScore = averageNonNull(values);
        const percent =
          avgScore != null ? Math.round((avgScore / 50) * 100) : null;

        return {
          code: def.code,
          label: def.label,
          score: avgScore != null ? Number(avgScore.toFixed(1)) : null,
          percent,
          sample_size: values.length,
        };
      }

      case "offense": {
        const offenseScores = ratingLikeRows
          .map((r) => r.offense_score)
          .filter((v): v is number => v != null && !Number.isNaN(v));

        const avgScore = averageNonNull(offenseScores);

        const offensePercents = ratingLikeRows.map((r) =>
          getMetricPercentFromRatings("offense", r)
        );
        const avgPercent = averageNonNull(
          offensePercents.filter(
            (p): p is number => p != null && !Number.isNaN(p)
          )
        );

        return {
          code: def.code,
          label: def.label,
          score: avgScore != null ? Number(avgScore.toFixed(1)) : null,
          percent: avgPercent != null ? Math.round(avgPercent) : null,
          sample_size: offenseScores.length,
        };
      }

      case "defense": {
        const defenseScores = ratingLikeRows
          .map((r) => r.defense_score)
          .filter((v): v is number => v != null && !Number.isNaN(v));

        const avgScore = averageNonNull(defenseScores);

        const defensePercents = ratingLikeRows.map((r) =>
          getMetricPercentFromRatings("defense", r)
        );
        const avgPercent = averageNonNull(
          defensePercents.filter(
            (p): p is number => p != null && !Number.isNaN(p)
          )
        );

        return {
          code: def.code,
          label: def.label,
          score: avgScore != null ? Number(avgScore.toFixed(1)) : null,
          percent: avgPercent != null ? Math.round(avgPercent) : null,
          sample_size: defenseScores.length,
        };
      }

      case "pitching": {
        const pitchingScores = ratingLikeRows
          .map((r) => r.pitching_score)
          .filter((v): v is number => v != null && !Number.isNaN(v));

        const avgScore = averageNonNull(pitchingScores);

        const pitchingPercents = ratingLikeRows.map((r) =>
          getMetricPercentFromRatings("pitching", r)
        );
        const avgPercent = averageNonNull(
          pitchingPercents.filter(
            (p): p is number => p != null && !Number.isNaN(p)
          )
        );

        return {
          code: def.code,
          label: def.label,
          score: avgScore != null ? Number(avgScore.toFixed(1)) : null,
          percent: avgPercent != null ? Math.round(avgPercent) : null,
          sample_size: pitchingScores.length,
        };
      }

      case "athletic": {
        const athleticPercents = ratingLikeRows.map((r) =>
          getMetricPercentFromRatings("athletic", r)
        );

        const avgPercent = averageNonNull(
          athleticPercents.filter(
            (p): p is number => p != null && !Number.isNaN(p)
          )
        );

        const avgScore =
          avgPercent != null ? (avgPercent / 100) * 50 : null;

        return {
          code: def.code,
          label: def.label,
          score: avgScore != null ? Number(avgScore.toFixed(1)) : null,
          percent: avgPercent != null ? Math.round(avgPercent) : null,
          sample_size: athleticPercents.filter(
            (p): p is number => p != null && !Number.isNaN(p)
          ).length,
        };
      }

      default:
        return {
          code: def.code,
          label: def.label,
          score: null,
          percent: null,
          sample_size: 0,
        };
    }
  });

  return {
    team_id: teamRow.id,
    team_name: teamRow.name ?? null,
    age_group_label: (teamRow as any).age_group_label ?? null,
    level: (teamRow as any).level ?? null,
    metrics,
  };
}

async function computeTeamOffenseDrilldown(
  teamId: string,
  options: TeamEvalSelection = {}
): Promise<TeamOffenseDrilldown | null> {
  // 1) Load team meta
  const { data: teamRow, error: teamError } = await supabase
    .from("teams")
    // age_group_label is an alias of age_group so we don't depend on a separate column
    .select("id, name, age_group_label:age_group, level")
    .eq("id", teamId)
    .maybeSingle();

  if (teamError) {
    console.error("computeTeamOffenseDrilldown: error loading team:", teamError);
    return null;
  }
  if (!teamRow) {
    return null;
  }

  // 2) Load offense ratings for this team
  const { data: ratingRows, error: ratingsError } = await supabase
    .from("player_ratings")
    .select(
      "id, player_id, team_id, age_group_id, player_assessment_id, assessment_id, overall_score, offense_score, defense_score, pitching_score, created_at, breakdown"
    )
    .eq("team_id", teamId)
    .order("created_at", { ascending: false });

  if (ratingsError) {
    console.error(
      "computeTeamOffenseDrilldown: error loading player_ratings:",
      ratingsError
    );
    return null;
  }

  // If literally no ratings, return an empty-but-valid payload
  if (!ratingRows || ratingRows.length === 0) {
    return {
      team_id: teamRow.id,
      team_name: teamRow.name ?? null,
      age_group_label: (teamRow as any).age_group_label ?? null,
      level: (teamRow as any).level ?? null,
      metrics: [],
      players: [],
      tests_by_metric: {
        offense: [],
        contact: [],
        power: [],
        speed: [],
        strikechance: [],
      },
    };
  }

  let filteredRows = ratingRows as TeamRatingRow[];

  const assessmentMeta = await loadTeamAssessmentMeta(teamId);
  const normalizedAssessmentDate = normalizeIsoDate(options.assessmentDate);

  let targetAssessmentDate: string | null = null;
  if (options.evalScope === "latest_eval") {
    targetAssessmentDate = resolveLatestAssessmentDate(
      assessmentMeta,
      filteredRows
    );
  } else if (
    (options.evalScope === "specific" || normalizedAssessmentDate) &&
    normalizedAssessmentDate
  ) {
    targetAssessmentDate = normalizedAssessmentDate;
  }

  if (targetAssessmentDate) {
    const filteredByDate = filteredRows.filter((row) => {
      const performedAt = getAssessmentDateForRatingRow(row, assessmentMeta);
      if (!performedAt) return false;
      return normalizeIsoDate(performedAt) === targetAssessmentDate;
    });

    if (filteredByDate.length > 0) {
      filteredRows = filteredByDate;
    }
  }

  if (!filteredRows.length) {
    return {
      team_id: teamRow.id,
      team_name: teamRow.name ?? null,
      age_group_label: (teamRow as any).age_group_label ?? null,
      level: (teamRow as any).level ?? null,
      metrics: [],
      players: [],
      tests_by_metric: {
        offense: [],
        contact: [],
        power: [],
        speed: [],
        strikechance: [],
      },
    };
  }

  let latestRows: TeamRatingRow[] = [];

  if (options.evalScope === "all_star") {
    latestRows = buildAllStarRows(filteredRows);
  } else {
    const latestByPlayer = new Map<string, TeamRatingRow>();

    for (const raw of filteredRows as TeamRatingRow[]) {
      const playerId = raw.player_id;
      if (!playerId) continue;

      const existing = latestByPlayer.get(playerId);
      if (!existing) {
        latestByPlayer.set(playerId, raw);
        continue;
      }

      const existingCreated = existing.created_at
        ? new Date(existing.created_at).getTime()
        : 0;
      const rowCreated = raw.created_at
        ? new Date(raw.created_at).getTime()
        : 0;

      if (rowCreated > existingCreated) {
        latestByPlayer.set(playerId, raw);
      }
    }

    latestRows = Array.from(latestByPlayer.values());
  }

  if (!latestRows.length) {
    return {
      team_id: teamRow.id,
      team_name: teamRow.name ?? null,
      age_group_label: (teamRow as any).age_group_label ?? null,
      level: (teamRow as any).level ?? null,
      metrics: [],
      players: [],
      tests_by_metric: {
        offense: [],
        contact: [],
        power: [],
        speed: [],
        strikechance: [],
      },
    };
  }

  const playerAssessmentIdsByPlayer = new Map<string, number[]>();
  const sourceRowsForRawMetrics =
    options.evalScope === "all_star" ? filteredRows : latestRows;

  for (const row of sourceRowsForRawMetrics ?? []) {
    const pid = row.player_id;
    if (!pid) continue;

    const assessmentId =
      (row as any).player_assessment_id ?? (row as any).assessment_id;

    if (typeof assessmentId !== "number") continue;

    const list = playerAssessmentIdsByPlayer.get(pid) ?? [];
    if (!list.includes(assessmentId)) {
      list.push(assessmentId);
      playerAssessmentIdsByPlayer.set(pid, list);
    }
  }

  // 4) Convert ratings → batting metrics (hitting/contact/power/speed/strikeChance)
  const metricsByPlayerId = new Map<string, BattingPlayerMetrics>();
  const ratingRowByPlayer = new Map<string, TeamRatingRow>();

  for (const ratingRow of latestRows) {
    const playerId = ratingRow.player_id;
    if (!playerId) continue;
    ratingRowByPlayer.set(playerId, ratingRow);
    const metrics = getBattingMetricsFromRating(ratingRow);
    if (!metrics) continue;

    metricsByPlayerId.set(playerId, metrics);
  }

  if (!metricsByPlayerId.size) {
    return {
      team_id: teamRow.id,
      team_name: teamRow.name ?? null,
      age_group_label: (teamRow as any).age_group_label ?? null,
      level: (teamRow as any).level ?? null,
      metrics: [],
      players: [],
      tests_by_metric: {
        offense: [],
        contact: [],
        power: [],
        speed: [],
        strikechance: [],
      },
    };
  }

  const playerIds = Array.from(metricsByPlayerId.keys());
  const battingMetrics = Array.from(metricsByPlayerId.values());

  // 5) Load player names / jersey numbers for these players
  const nameByPlayer: Record<string, string | null> = {};
  const jerseyByPlayer: Record<string, number | null> = {};

  if (playerIds.length > 0) {
    const { data: playerRows, error: playersError } = await supabase
      .from("players")
      .select("id, full_name, jersey_number")
      .in("id", playerIds);

    if (playersError) {
      console.error(
        "computeTeamOffenseDrilldown: error loading players:",
        playersError
      );
    } else if (playerRows) {
      for (const row of playerRows as any[]) {
        const pid = row.id as string;
        nameByPlayer[pid] = (row.full_name as string) ?? null;
        jerseyByPlayer[pid] =
          row.jersey_number != null ? Number(row.jersey_number) : null;
      }
    }
  }

  const toFixedOrNull = (
    val: number | null | undefined,
    decimals = 1
  ): number | null => {
    if (val == null || Number.isNaN(val)) return null;
    return Number(val.toFixed(decimals));
  };

  // Build per-test breakdowns (contact / power / speed) using ALL ratingRows,
  // reusing the nameByPlayer / jerseyByPlayer maps.
  const playersForTests = playerIds.map((playerId) => ({
    player_id: playerId,
    player_name:
      nameByPlayer[playerId] ??
      `Player ${playerId.slice(0, 8)}…`,
    jersey_number: jerseyByPlayer[playerId] ?? null,
  }));

  // --- Load raw metrics for power / speed tests (MPH, seconds, distance ft) ---

  // Collect all assessment_ids present in these rating rows so we can look up
  // the underlying player_assessment_values for just those assessments.
  const assessmentIds = Array.from(
    new Set(
      Array.from(playerAssessmentIdsByPlayer.values())
        .flat()
        .filter((id): id is number => typeof id === "number")
    )
  );

  let rawMetricsByAssessmentId:
    | Map<number, Record<string, number>>
    | undefined;

  if (assessmentIds.length > 0) {
    const OFFENSE_RAW_METRIC_KEYS = [
      "max_bat_speed",
      "max_exit_velo_tee",
      "timed_run_1b",
      "timed_run_4b",
      "timed_run_1b_distance_ft",
      "timed_run_4b_distance_ft",
    ];

    const { data: metricRows, error: metricsError } = await supabase
      .from("assessment_metrics")
      .select("id, metric_key")
      .in("metric_key", OFFENSE_RAW_METRIC_KEYS);

    if (metricsError) {
      console.error(
        "computeTeamOffenseDrilldown: error loading assessment_metrics for raw offense tests:",
        metricsError
      );
    } else if (metricRows && metricRows.length > 0) {
      const metricKeyById = new Map<number, string>();
      const metricIds: number[] = [];

      for (const row of metricRows as any[]) {
        const mid = row.id as number;
        const key = (row.metric_key as string) ?? null;
        if (!key) continue;
        metricKeyById.set(mid, key);
        metricIds.push(mid);
      }

      if (metricIds.length > 0) {
        const { data: valueRows, error: valuesError } = await supabase
          .from("player_assessment_values")
          .select("player_assessment_id, metric_id, value_numeric")
          .in("player_assessment_id", assessmentIds)
          .in("metric_id", metricIds);

        if (valuesError) {
          console.error(
            "computeTeamOffenseDrilldown: error loading player_assessment_values for raw offense tests:",
            valuesError
          );
        } else if (valueRows) {
          rawMetricsByAssessmentId = new Map();

          for (const row of valueRows as any[]) {
            const assessmentId = row.player_assessment_id as number | null;
            const metricId = row.metric_id as number | null;
            const value = row.value_numeric as number | null;

            if (
              assessmentId == null ||
              metricId == null ||
              value == null ||
              Number.isNaN(value)
            ) {
              continue;
            }

            const key = metricKeyById.get(metricId);
            if (!key) continue;

            let bucket = rawMetricsByAssessmentId.get(assessmentId);
            if (!bucket) {
              bucket = {};
              rawMetricsByAssessmentId.set(assessmentId, bucket);
            }
            bucket[key] = value;
          }
        }
      }
    }
  }

  const tests_by_metric = buildOffenseTestBreakdownsForTeam(
    latestRows ?? [],
    playersForTests,
    rawMetricsByAssessmentId,
    {
      evalScope: options.evalScope ?? null,
      playerAssessmentIdsByPlayer,
    }
  );

  
  // 6) Build per-player metrics rows for the frontend
  const players: OffenseDrilldownPlayerMetrics[] = playerIds.map((playerId) => {
    const m = metricsByPlayerId.get(playerId)!;
    const displayName =
      nameByPlayer[playerId] ??
      `Player ${playerId.slice(0, 8)}…`;
    const jersey = jerseyByPlayer[playerId] ?? null;

    return {
      player_id: playerId,
      player_name: displayName,
      jersey_number: jersey,
      hitting_score: toFixedOrNull(m.hittingScore, 1),
      contact_score: toFixedOrNull(m.contactScore, 1),
      power_score: toFixedOrNull(m.powerScore, 1),
      speed_score: toFixedOrNull(m.speedScore, 1),
      // keep StrikeChance as 0–1; frontend will convert to %
      strike_chance: toFixedOrNull(m.strikeChance, 3),
    };
  });

  const isNumber = (v: any): v is number =>
    typeof v === "number" && !Number.isNaN(v);

  const avg = (values: (number | null | undefined)[]): number | null => {
    const nums = values.filter(isNumber);
    if (!nums.length) return null;
    const sum = nums.reduce((acc, v) => acc + v, 0);
    return Number((sum / nums.length).toFixed(3));
  };

  const offenseScores = battingMetrics.map((m) => m.hittingScore);
  const contactScores = battingMetrics.map((m) => m.contactScore);
  const powerScores = battingMetrics.map((m) => m.powerScore);
  const speedScores = battingMetrics.map((m) => m.speedScore);
  const strikeChances = battingMetrics.map((m) => m.strikeChance);

  const offenseAvg = avg(offenseScores);
  const contactAvg = avg(contactScores);
  const powerAvg = avg(powerScores);
  const speedAvg = avg(speedScores);
  const strikeAvg = avg(strikeChances);

  const metrics: OffenseDrilldownMetric[] = [
    {
      code: "offense",
      label: "Offense score",
      team_average: offenseAvg,
      player_count: offenseScores.filter(isNumber).length,
    },
    {
      code: "contact",
      label: "Contact score",
      team_average: contactAvg,
      player_count: contactScores.filter(isNumber).length,
    },
    {
      code: "power",
      label: "Power score",
      team_average: powerAvg,
      player_count: powerScores.filter(isNumber).length,
    },
    {
      code: "speed",
      label: "Speed score",
      team_average: speedAvg,
      player_count: speedScores.filter(isNumber).length,
    },
    {
      code: "strikechance",
      label: "Strikeout chance (lower is better)",
      // still 0–1 here; frontend will format as percent
      team_average: strikeAvg,
      player_count: strikeChances.filter(isNumber).length,
    },
  ];

  // 7) Build per-test drilldowns from the same ratings breakdown JSON
  const perTestInput: PlayerWithRatingForOffense[] = [];

  for (const playerId of playerIds) {
    const ratingRow = ratingRowByPlayer.get(playerId);
    if (!ratingRow) continue;

    let breakdown: any = ratingRow.breakdown ?? null;
    if (typeof breakdown === "string") {
      try {
        breakdown = JSON.parse(breakdown);
      } catch {
        breakdown = null;
      }
    }

    perTestInput.push({
      player_id: playerId,
      player_name: nameByPlayer[playerId] ?? null,
      jersey_number: jerseyByPlayer[playerId] ?? null,
      rating_breakdown: breakdown,
    });
  }

  return {
    team_id: teamRow.id,
    team_name: teamRow.name ?? null,
    age_group_label: (teamRow as any).age_group_label ?? null,
    level: (teamRow as any).level ?? null,
    metrics,
    players,
    tests_by_metric,
  };
}


async function computePlayerStatsOverview(
  playerId: string
): Promise<PlayerStatsOverview | null> {
  const { data: rows, error } = await supabase
    .from("player_ratings")
    .select(
      "id, player_id, team_id, age_group_id, assessment_id, created_at, overall_score, offense_score, defense_score, pitching_score, breakdown"
    )
    .eq("player_id", playerId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    console.error("computePlayerStatsOverview: error loading ratings:", error);
    return null;
  }

  const row = rows && rows[0];
  if (!row) {
    return {
      player_id: playerId,
      team_id: null,
      age_group_label: null,
      latest_assessment_id: null,
      metrics: [],
    };
  }

  // If you want to join age_groups for label, do it here; for now we leave null.
  const overall = parseScore(row.overall_score);
  const offense = parseScore(row.offense_score);
  const defense = parseScore(row.defense_score);
  const pitching = parseScore(row.pitching_score);
  const breakdown = (row as any).breakdown ?? null;

  const ratingLike: RatingResult = {
    overall_score: overall,
    offense_score: offense,
    defense_score: defense,
    pitching_score: pitching,
    breakdown,
  };

  const metricDefs: { code: CoreMetricCode; label: string }[] = [
    { code: "bpoprating", label: "BPOP Rating" },
    { code: "offense", label: "Offense Score" },
    { code: "defense", label: "Defense Score" },
    { code: "pitching", label: "Pitching Score" },
    { code: "athletic", label: "Athletic Score" },
  ];

  const metrics: StatsMetricSummary[] = [];

  for (const def of metricDefs) {
    let score: number | null = null;
    let percent: number | null = null;

    switch (def.code) {
      case "bpoprating":
        score = overall;
        percent =
          overall !== null && overall !== undefined
            ? (overall / 50) * 100
            : null;
        break;
      case "offense":
        score = offense;
        percent = getMetricPercentFromRatings("offense", ratingLike);
        break;
      case "defense":
        score = defense;
        percent = getMetricPercentFromRatings("defense", ratingLike);
        break;
      case "pitching":
        score = pitching;
        percent = getMetricPercentFromRatings("pitching", ratingLike);
        break;
      case "athletic":
        percent = getMetricPercentFromRatings("athletic", ratingLike);
        score =
          percent !== null && percent !== undefined
            ? (percent / 100) * 50
            : null;
        break;
    }

    metrics.push({
      code: def.code,
      label: def.label,
      score:
        score !== null && score !== undefined && !Number.isNaN(score)
          ? Number(score.toFixed(1))
          : null,
      percent:
        percent !== null && percent !== undefined && !Number.isNaN(percent)
          ? Number(percent.toFixed(1))
          : null,
      sample_size: score !== null || percent !== null ? 1 : 0,
    });
  }

  return {
    player_id: playerId,
    team_id: row.team_id as string | null,
    age_group_label: null, // can be populated via join later if desired
    latest_assessment_id: row.assessment_id ?? null,
    metrics,
  };
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

// Position codes must match breakdown.derived.position_scores keys
type PositionCode =
  | "pitcher"
  | "pitchers_helper"
  | "catcher"
  | "first_base"
  | "second_base"
  | "third_base"
  | "shortstop"
  | "left_field"
  | "right_field"
  | "center_field"
  | "left_center"
  | "right_center";

type FieldingSetup = "nine_player" | "ten_player_four_of";
type PitchingSetup = "coach_pitch_helper" | "player_pitch";

interface OptimizeLineupRequest {
  age_group_label: string;              // e.g. "8U"
  fielding_setup: FieldingSetup;
  pitching_setup: PitchingSetup;        // 5U–7U default = "coach_pitch_helper"
  hierarchy_id?: string;                // UUID from position_hierarchies
  custom_positions?: PositionCode[];    // optional override
  available_player_ids: string[];       // subset of team players
  locked?: Record<PositionCode, string>; // { position: player_id }
  save_lineup?: boolean;
  lineup_name?: string;
}

interface PlayerWithRatings {
  player_id: string;
  display_name: string;
  jersey_number: number | null;
  overall_score: number | null;
  offense_score: number | null;
  defense_score: number | null;
  pitching_score: number | null;
  position_scores: Record<string, any>;
  speed_score: number | null;
  infield_score: number | null;
  outfield_score: number | null;
}

interface Assignment {
  position: PositionCode;
  player_id: string;
  player_name: string;
  jersey_number: number | null;
  position_score: number | null;
  speed_score: number | null;
  locked: boolean;
}

function toNumberOrNull(val: any): number | null {
  if (val === null || val === undefined) return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

function getPositionScore(p: PlayerWithRatings, pos: PositionCode): number | null {
  const raw = (p.position_scores as any)?.[pos];
  if (typeof raw === "number") return raw;
  return toNumberOrNull(raw);
}

function optimizeLineupAssignments(
  players: PlayerWithRatings[],
  positionsToFill: PositionCode[],
  locks: Record<PositionCode, string | undefined>
): Assignment[] {
  const assigned = new Map<PositionCode, PlayerWithRatings>();
  const usedPlayerIds = new Set<string>();

  // 1) Pre-assign locked
  for (const pos of positionsToFill) {
    const lockedPlayerId = locks[pos];
    if (!lockedPlayerId) continue;
    const player = players.find((p) => p.player_id === lockedPlayerId);
    if (!player) continue;
    assigned.set(pos, player);
    usedPlayerIds.add(player.player_id);
  }

  // 2) Greedy by hierarchy order with SPEEDSCORE tiebreaker
  for (const pos of positionsToFill) {
    if (assigned.has(pos)) continue;

    const candidates = players.filter((p) => !usedPlayerIds.has(p.player_id));
    if (candidates.length === 0) break;

    candidates.sort((a, b) => {
      const aPos = getPositionScore(a, pos) ?? -9999;
      const bPos = getPositionScore(b, pos) ?? -9999;
      if (bPos !== aPos) return bPos - aPos;

      const aSpeed = a.speed_score ?? -9999;
      const bSpeed = b.speed_score ?? -9999;
      if (bSpeed !== aSpeed) return bSpeed - aSpeed;

      const aOverall = a.overall_score ?? -9999;
      const bOverall = b.overall_score ?? -9999;
      return bOverall - aOverall;
    });

    const best = candidates[0];
    if (!best) continue;

    assigned.set(pos, best);
    usedPlayerIds.add(best.player_id);
  }

  // 3) Build assignments
  const assignments: Assignment[] = [];
  for (const pos of positionsToFill) {
    const player = assigned.get(pos);
    if (!player) continue;
    assignments.push({
      position: pos,
      player_id: player.player_id,
      player_name: player.display_name,
      jersey_number: player.jersey_number,
      position_score: getPositionScore(player, pos),
      speed_score: player.speed_score,
      locked: locks[pos] === player.player_id,
    });
  }

  return assignments;
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


// ---- Pitching optimization types ----

type PitcherRole = "starter" | "relief" | "closer";

type PitchingTier = "PRO" | "YOUTH" | "LITTLE";

interface PitchingPlayerMetrics {
  playerId: string;
  bpopPitcherRating: number;
  pitchScore: number;
  pitchSpeedScore: number;
  pitchAccScore: number;
  addPitches: number;
  addPitchAccScore: number;
  strikeoutChance: number; // 0–1
}

interface PitchingRotationSlotResult {
  slot_id: string; // 'ACE','SP2','SP3',...
  player_id: string;
  locked: boolean;
  bpop_pitcher_rating: number;
  pitch_score: number;
  pitch_speed_score: number;
  pitch_acc_score: number;
  add_pitches: number;
  add_pitch_acc_score: number;
  strikeout_chance: number;
}

interface PitchingBullpenSlotResult {
  slot_id: string; // 'RP1','RP2','RP3','CLOSER',...
  player_id: string;
  locked: boolean;
  role: PitcherRole;
  score: number; // relief or closer score used for ranking
  bpop_pitcher_rating: number;
  pitch_score: number;
  pitch_speed_score: number;
  pitch_acc_score: number;
  add_pitches: number;
  add_pitch_acc_score: number;
  strikeout_chance: number;
}

interface PitchingOptimizeRequest {
  num_starters?: number;             // default 5 for PRO tier
  base_configuration_id?: number;    // use saved config as starting point

  player_ids?: string[];             // optional explicit list, otherwise all team pitchers
  excluded_player_ids?: string[];    // temporarily remove (pitch count, injury, etc.)

  // Optional per-call overrides
  locked_rotation?: Record<string, string>; // { "ACE": playerId, "SP2": playerId }
  locked_bullpen?: Record<string, string>;  // { "RP1": playerId, "CLOSER": playerId }
}

interface PitchingOptimizeResponse {
  team_id: string;
  age_group_label: string | null;
  tier: PitchingTier;
  num_starters: number | null;
  base_configuration_id: number | null;
  rotation: PitchingRotationSlotResult[];
  bullpen: PitchingBullpenSlotResult[] | null; // null for younger tiers
  pitchers: PitchingPlayerMetrics[];           // raw metrics for table views
}

//age tier helper for pitching optimization

function pitchingAgeTier(ageGroupLabel: string | null): PitchingTier {
  if (!ageGroupLabel) return "YOUTH";
  const norm = ageGroupLabel.toLowerCase();

  // Treat these as PRO tier
  if (norm.includes("pro")) return "PRO";
  if (norm.includes("college")) return "PRO";
  if (norm === "highschool" || norm === "high_school" || norm === "hs") return "PRO";

  // Try numeric age like "10U"
  const m = norm.match(/^(\d+)\s*u$/);
  if (m) {
    const age = parseInt(m[1], 10);
    if (age <= 7) return "LITTLE";
    return "YOUTH"; // 8U–14U
  }

  return "YOUTH";
}

function getPitchingMetricsFromRating(row: any): PitchingPlayerMetrics | null {
  const playerId = row.player_id as string | undefined;
  if (!playerId) return null;

  const breakdown = (row.breakdown ?? {}) as any;
  const pitching = breakdown.pitching ?? breakdown.pitch ?? {};

  const pitchScoreRaw =
    typeof row.pitching_score === "number"
      ? row.pitching_score
      : typeof pitching.pitch_score === "number"
      ? pitching.pitch_score
      : 0;

  const pitchSpeedRaw =
    pitching.pitch_speed_score ??
    pitching.speed_score ??
    pitching.velocity_score ??
    0;

  const pitchAccRaw =
    pitching.pitch_acc_score ??
    pitching.accuracy_score ??
    pitching.command_score ??
    0;

  const addPitchesRaw =
    typeof pitching.additional_pitches === "number"
      ? pitching.additional_pitches
      : typeof pitching.add_pitches === "number"
      ? pitching.add_pitches
      : 0;

  const addPitchAccRaw =
    pitching.additional_pitch_accuracy_score ??
    pitching.add_pitch_acc_score ??
    0;

  let strikeoutChanceRaw =
    pitching.strikeout_chance ??
    pitching.k_chance ??
    pitching.strikeout_prob ??
    0;

  // Normalize strikeout chance to [0,1]
  if (strikeoutChanceRaw > 1) {
    strikeoutChanceRaw = strikeoutChanceRaw / 100;
  }
  const strikeoutChance = Math.max(0, Math.min(1, Number(strikeoutChanceRaw) || 0));

  return {
    playerId,
    bpopPitcherRating: Number(pitchScoreRaw) || 0,
    pitchScore: Number(pitchScoreRaw) || 0,
    pitchSpeedScore: Number(pitchSpeedRaw) || 0,
    pitchAccScore: Number(pitchAccRaw) || 0,
    addPitches: Number(addPitchesRaw) || 0,
    addPitchAccScore: Number(addPitchAccRaw) || 0,
    strikeoutChance,
  };
}

function computeReliefScoreStrong(metrics: PitchingPlayerMetrics): number {
  // RP1–RP2
  return 0.7 * metrics.pitchAccScore + 0.3 * metrics.pitchSpeedScore;
}

function computeReliefScoreBalanced(metrics: PitchingPlayerMetrics): number {
  // RP3+
  return 0.6 * metrics.pitchAccScore + 0.4 * metrics.pitchSpeedScore;
}

function computeCloserScore(metrics: PitchingPlayerMetrics): number {
  // 0.4 * PITCHACCSCORE + 0.4 * PITCHSPEEDSCORE + 0.2 * STRIKEOUTCHANCE
  return (
    0.4 * metrics.pitchAccScore +
    0.4 * metrics.pitchSpeedScore +
    0.2 * metrics.strikeoutChance
  );
}

interface LoadedPitchingConfig {
  id: number;
  slots: {
    slot_id: string;
    player_id: string;
    role: PitcherRole;
    locked: boolean;
  }[];
}

async function loadPitchingConfiguration(
  configId: number
): Promise<LoadedPitchingConfig | null> {
  const { data: config, error: configError } = await supabase
    .from("pitching_configurations")
    .select("id")
    .eq("id", configId)
    .maybeSingle();

  if (configError) {
    console.error("Error loading pitching_configurations:", configError);
    return null;
  }
  if (!config) return null;

  const { data: slots, error: slotsError } = await supabase
    .from("pitching_configuration_slots")
    .select("slot_id, player_id, role, locked")
    .eq("configuration_id", configId);

  if (slotsError) {
    console.error("Error loading pitching_configuration_slots:", slotsError);
    return null;
  }

  return {
    id: config.id as number,
    slots: (slots || []).map((s: any) => ({
      slot_id: s.slot_id as string,
      player_id: s.player_id as string,
      role: (s.role as PitcherRole) || "starter",
      locked: !!s.locked,
    })),
  };
}




// ---- Batting order types ----

type BattingOrderStyleCode = "bpop_balanced" | "top_down" | "bpop_top6_balanced";
type BattingOrderType = "NINE" | "TEN" | "CONTINUOUS";

interface BattingOrderSlotConfig {
  spot: number;        // batting order position (1–N)
  priority: number;    // selection priority (1 = pick first, etc.)
  wCS: number;         // weight for Contact Score
  wPS: number;         // weight for Power Score
  wSS: number;         // weight for Speed Score
  wSC: number;         // weight for Strike Chance penalty (we subtract this)
}

interface BattingOrderStyleConfig {
  style: BattingOrderStyleCode;
  orderType: BattingOrderType;
  ageGroupLabel: string; // e.g. "9U", "10U"
  slots: BattingOrderSlotConfig[];
}

// Metrics we’ll use per player when optimizing
interface BattingPlayerMetrics {
  playerId: string;
  hittingScore: number;   // main offense score (0–50)
  contactScore: number;   // 0–50
  powerScore: number;     // 0–50
  speedScore: number;     // 0–50
  strikeChance: number;   // 0–1
}

// Response shape for each lineup slot
interface BattingOrderSlotResult {
  batting_order: number;
  player_id: string;
  locked: boolean;
  composite_score: number;
  hitting_score: number;
  contact_score: number;
  power_score: number;
  speed_score: number;
  strike_chance: number;
}

// Request body shape for optimization
interface BattingOrderOptimizeRequest {
  style: BattingOrderStyleCode;
  order_type: BattingOrderType;
  dh_mode?: "pitcher_hits" | "use_dh";
  dh_pitcher_player_id?: string | null;
  player_ids?: string[];                    // optional: explicit list; otherwise team roster
  locked_slots?: Record<string, string>;    // { "3": "<player_uuid>", "5": "<player_uuid>" }
}

interface BattingOrderOptimizeResponse {
  team_id: string;
  age_group_label: string | null;
  style: BattingOrderStyleCode;
  order_type: BattingOrderType;
  dh_mode: "pitcher_hits" | "use_dh";
  dh_pitcher_player_id: string | null;
  lineup: BattingOrderSlotResult[];
  team_averages: {
    hitting_score: number | null;
    contact_score: number | null;
    power_score: number | null;
    speed_score: number | null;
    strike_chance: number | null;
  };
  players_considered: BattingPlayerMetrics[];
}

// ---- Batting order style configs ----
// NOTE: These are structured to match your spreadsheet, but with simple
// default weights. You can later replace the numbers for each age group / slot
// with the exact ones from BPOP_batting_order.xlsx.

const DEFAULT_BATTING_ORDER_CONFIGS: BattingOrderStyleConfig[] = (() => {
  const makeSlots = (
    orderType: BattingOrderType,
    weightsBySpot: Array<Pick<BattingOrderSlotConfig, "wCS" | "wPS" | "wSS" | "wSC">>
  ): BattingOrderSlotConfig[] => {
    return weightsBySpot.map((w, idx) => ({
      spot: idx + 1,
      priority: idx + 1,
      ...w,
    }));
  };

  // Helper to share same scheme across age groups for now
  const ageGroups = ["5U", "6U", "7U", "8U", "9U", "10U", "11U", "12U", "13U", "14U"];

  const configs: BattingOrderStyleConfig[] = [];

  for (const age of ageGroups) {
    // BPOP Balanced: contact + speed heavy, fewer Ks
    configs.push(
      {
        style: "bpop_balanced",
        orderType: "NINE",
        ageGroupLabel: age,
        slots: makeSlots("NINE", [
          { wCS: 0.6, wPS: 0.15, wSS: 0.15, wSC: 0.3 }, // 1
          { wCS: 0.6, wPS: 0.15, wSS: 0.15, wSC: 0.3 }, // 2
          { wCS: 0.55, wPS: 0.25, wSS: 0.1, wSC: 0.3 }, // 3
          { wCS: 0.5, wPS: 0.3, wSS: 0.1, wSC: 0.3 },   // 4
          { wCS: 0.5, wPS: 0.3, wSS: 0.1, wSC: 0.3 },   // 5
          { wCS: 0.5, wPS: 0.25, wSS: 0.15, wSC: 0.3 }, // 6
          { wCS: 0.5, wPS: 0.2, wSS: 0.2, wSC: 0.3 },   // 7
          { wCS: 0.55, wPS: 0.15, wSS: 0.1, wSC: 0.3 }, // 8
          { wCS: 0.6, wPS: 0.15, wSS: 0.1, wSC: 0.3 },  // 9
        ]),
      },
      {
        style: "bpop_balanced",
        orderType: "TEN",
        ageGroupLabel: age,
        slots: makeSlots("TEN", [
          { wCS: 0.6,  wPS: 0.15, wSS: 0.15, wSC: 0.3 }, // 1
          { wCS: 0.6,  wPS: 0.15, wSS: 0.15, wSC: 0.3 }, // 2
          { wCS: 0.55, wPS: 0.25, wSS: 0.1,  wSC: 0.3 }, // 3
          { wCS: 0.5,  wPS: 0.3,  wSS: 0.1,  wSC: 0.3 }, // 4
          { wCS: 0.5,  wPS: 0.3,  wSS: 0.1,  wSC: 0.3 }, // 5
          { wCS: 0.5,  wPS: 0.25, wSS: 0.15, wSC: 0.3 }, // 6
          { wCS: 0.5,  wPS: 0.2,  wSS: 0.2,  wSC: 0.3 }, // 7
          { wCS: 0.55, wPS: 0.15, wSS: 0.1,  wSC: 0.3 }, // 8
          { wCS: 0.6,  wPS: 0.15, wSS: 0.1,  wSC: 0.3 }, // 9
          { wCS: 0.55, wPS: 0.15, wSS: 0.15, wSC: 0.3 }, // 10
        ]),
      },
      {
        style: "bpop_balanced",
        orderType: "CONTINUOUS",
        ageGroupLabel: age,
        // For continuous, treat all 1–12 spots with same weights (like your sheet's 1–12 row)
        slots: makeSlots("CONTINUOUS", Array.from({ length: 12 }, () => ({
          wCS: 0.6,
          wPS: 0.15,
          wSS: 0.05,
          wSC: 0.3,
        }))),
      }
    );

    // Top Down: prioritize biggest bats early (power + contact)
    configs.push(
      {
        style: "top_down",
        orderType: "NINE",
        ageGroupLabel: age,
        slots: makeSlots("NINE", Array.from({ length: 9 }, (_, i) => ({
          wCS: 0.4,
          wPS: 0.4,
          wSS: 0.1,
          wSC: 0.3,
        }))),
      },
      {
        style: "top_down",
        orderType: "TEN",
        ageGroupLabel: age,
        slots: makeSlots("TEN", Array.from({ length: 10 }, (_, i) => ({
          wCS: 0.4,
          wPS: 0.4,
          wSS: 0.1,
          wSC: 0.3,
        }))),
      },
      {
        style: "top_down",
        orderType: "CONTINUOUS",
        ageGroupLabel: age,
        slots: makeSlots("CONTINUOUS", Array.from({ length: 12 }, () => ({
          wCS: 0.4,
          wPS: 0.4,
          wSS: 0.1,
          wSC: 0.3,
        }))),
      }
    );

    // BPOP Top6 Balanced: first six highly optimized, rest generic
    configs.push(
      {
        style: "bpop_top6_balanced",
        orderType: "NINE",
        ageGroupLabel: age,
        slots: makeSlots("NINE", [
          { wCS: 0.6,  wPS: 0.15, wSS: 0.15, wSC: 0.3 }, // 1
          { wCS: 0.6,  wPS: 0.15, wSS: 0.15, wSC: 0.3 }, // 2
          { wCS: 0.55, wPS: 0.25, wSS: 0.1,  wSC: 0.3 }, // 3
          { wCS: 0.5,  wPS: 0.3,  wSS: 0.1,  wSC: 0.3 }, // 4
          { wCS: 0.5,  wPS: 0.3,  wSS: 0.1,  wSC: 0.3 }, // 5
          { wCS: 0.5,  wPS: 0.25, wSS: 0.15, wSC: 0.3 }, // 6
          { wCS: 0.5,  wPS: 0.2,  wSS: 0.2,  wSC: 0.3 }, // 7
          { wCS: 0.5,  wPS: 0.2,  wSS: 0.2,  wSC: 0.3 }, // 8
          { wCS: 0.5,  wPS: 0.2,  wSS: 0.2,  wSC: 0.3 }, // 9
        ]),
      },
      {
        style: "bpop_top6_balanced",
        orderType: "TEN",
        ageGroupLabel: age,
        slots: makeSlots("TEN", [
          { wCS: 0.6,  wPS: 0.15, wSS: 0.15, wSC: 0.3 },
          { wCS: 0.6,  wPS: 0.15, wSS: 0.15, wSC: 0.3 },
          { wCS: 0.55, wPS: 0.25, wSS: 0.1,  wSC: 0.3 },
          { wCS: 0.5,  wPS: 0.3,  wSS: 0.1,  wSC: 0.3 },
          { wCS: 0.5,  wPS: 0.3,  wSS: 0.1,  wSC: 0.3 },
          { wCS: 0.5,  wPS: 0.25, wSS: 0.15, wSC: 0.3 },
          { wCS: 0.5,  wPS: 0.2,  wSS: 0.2,  wSC: 0.3 },
          { wCS: 0.5,  wPS: 0.2,  wSS: 0.2,  wSC: 0.3 },
          { wCS: 0.5,  wPS: 0.2,  wSS: 0.2,  wSC: 0.3 },
          { wCS: 0.5,  wPS: 0.2,  wSS: 0.2,  wSC: 0.3 },
        ]),
      },
      {
        style: "bpop_top6_balanced",
        orderType: "CONTINUOUS",
        ageGroupLabel: age,
        slots: makeSlots("CONTINUOUS", Array.from({ length: 12 }, (_, i) => ({
          wCS: i < 6 ? 0.6 : 0.5,
          wPS: i < 6 ? 0.2 : 0.15,
          wSS: 0.15,
          wSC: 0.3,
        }))),
      }
    );
  }

  return configs;
})();

function getDefaultBattingOrderConfig(
  style: BattingOrderStyleCode,
  orderType: BattingOrderType,
  ageGroupLabel: string | null
): BattingOrderStyleConfig | null {
  const age = ageGroupLabel || "10U";
  const exact = DEFAULT_BATTING_ORDER_CONFIGS.find(
    (c) => c.style === style && c.orderType === orderType && c.ageGroupLabel === age
  );
  if (exact) return exact;

  const fallback = DEFAULT_BATTING_ORDER_CONFIGS.find(
    (c) => c.style === style && c.orderType === orderType
  );
  return fallback || null;
}



// ratingRow is one row from player_ratings with breakdown json
function getBattingMetricsFromRating(
  ratingRow: any
): BattingPlayerMetrics | null {
  const playerId = ratingRow.player_id as string | undefined;
  if (!playerId) return null;

  const hittingScoreRaw = ratingRow.offense_score as number | null;

  // Normalize breakdown into a plain object
  let breakdown: any = ratingRow.breakdown ?? {};
  if (typeof breakdown === "string") {
    try {
      breakdown = JSON.parse(breakdown);
    } catch {
      breakdown = {};
    }
  }

  const hittingTests =
    (breakdown?.hitting?.tests as Record<string, any> | undefined) ??
    (breakdown?.hitting as Record<string, any> | undefined) ??
    {};

  const athleticTests =
    (breakdown?.athletic?.tests as Record<string, any> | undefined) ??
    (breakdown?.athlete?.tests as Record<string, any> | undefined) ??
    (breakdown?.athletic as Record<string, any> | undefined) ??
    (breakdown?.athlete as Record<string, any> | undefined) ??
    {};

  const toNumber = (value: any, fallback: number): number => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const n = Number(value);
      if (Number.isFinite(n)) return n;
    }
    return fallback;
  };

  // Contact / power from hitting tests
  const contactRaw =
    hittingTests.contact_score ??
    breakdown?.offense?.contact_score ??
    breakdown?.contact_score;

  const powerRaw =
    hittingTests.power_score ??
    breakdown?.offense?.power_score ??
    breakdown?.power_score;

  // Speed from athletic tests (11u+ template has speed_score here)
  const speedRaw =
    athleticTests.speed_score ??
    breakdown?.hitting?.speed_score ??
    breakdown?.athletic?.speed_score ??
    breakdown?.athlete?.speed_score ??
    breakdown?.running?.speed_score;

  const contact = toNumber(contactRaw, hittingScoreRaw ?? 0);
  const power = toNumber(powerRaw, hittingScoreRaw ?? 0);
  const speed = toNumber(speedRaw, 0);

  // StrikeChance (hitter) = explicit percent if present, else derived from contact
  const strikeChance =
    typeof hittingTests.strike_chance_percent === "number"
      ? hittingTests.strike_chance_percent / 100
      : Math.max(0, Math.min(1, 1 - contact / 90));

  return {
    playerId,
    hittingScore: toNumber(hittingScoreRaw, 0),
    contactScore: contact,
    powerScore: power,
    speedScore: speed,
    // keep 0–1, frontend multiplies by 100
    strikeChance:
      typeof strikeChance === "number" && Number.isFinite(strikeChance)
        ? strikeChance
        : 0,
  };
}



function computeSlotCompositeScore(
  metrics: BattingPlayerMetrics,
  slot: BattingOrderSlotConfig
): number {
  // wCS + wPS + wSS - wSC * StrikeChance
  return (
    slot.wCS * metrics.contactScore +
    slot.wPS * metrics.powerScore +
    slot.wSS * metrics.speedScore -
    slot.wSC * metrics.strikeChance
  );
}

function optimizeBattingOrderGreedy(
  players: BattingPlayerMetrics[],
  config: BattingOrderStyleConfig,
  lockedSlots: Record<number, string> // batting_order -> player_id
): BattingOrderSlotResult[] {
  const slots = [...config.slots].sort((a, b) => a.priority - b.priority);
  const availableMap = new Map<string, BattingPlayerMetrics>();
  for (const p of players) {
    availableMap.set(p.playerId, p);
  }

  // Remove any locked players from availability
  for (const playerId of Object.values(lockedSlots)) {
    availableMap.delete(playerId);
  }

  const resultBySpot = new Map<number, BattingOrderSlotResult>();

  for (const slot of slots) {
    const spot = slot.spot;
    const lockedPlayerId = lockedSlots[spot];

    if (lockedPlayerId) {
      // Just use the locked player (if we still have metrics)
      const metrics = players.find((p) => p.playerId === lockedPlayerId);
      if (!metrics) continue;

      resultBySpot.set(spot, {
        batting_order: spot,
        player_id: lockedPlayerId,
        locked: true,
        composite_score: computeSlotCompositeScore(metrics, slot),
        hitting_score: metrics.hittingScore,
        contact_score: metrics.contactScore,
        power_score: metrics.powerScore,
        speed_score: metrics.speedScore,
        strike_chance: metrics.strikeChance,
      });

      continue;
    }

    // Choose the best available player for this slot
    let best: BattingPlayerMetrics | null = null;
    let bestScore = -Infinity;

    for (const metrics of availableMap.values()) {
      const score = computeSlotCompositeScore(metrics, slot);
      if (score > bestScore) {
        bestScore = score;
        best = metrics;
      }
    }

    if (!best) {
      // no players left, leave slot empty
      continue;
    }

    resultBySpot.set(spot, {
      batting_order: spot,
      player_id: best.playerId,
      locked: false,
      composite_score: bestScore,
      hitting_score: best.hittingScore,
      contact_score: best.contactScore,
      power_score: best.powerScore,
      speed_score: best.speedScore,
      strike_chance: best.strikeChance,
    });

    // remove from pool
    availableMap.delete(best.playerId);
  }

  // Return in batting_order order
  return Array.from(resultBySpot.values()).sort(
    (a, b) => a.batting_order - b.batting_order
  );
}

async function loadBattingOrderConfigFromDb(
  style: BattingOrderStyleCode,
  orderType: BattingOrderType,
  ageGroupLabel: string | null
): Promise<BattingOrderStyleConfig | null> {
  const age = ageGroupLabel || "10U";

  const { data, error } = await supabase
    .from("batting_order_weights")
    .select(
      "position_start, position_end, priority, w_cs, w_ps, w_ss, w_sc"
    )
    .eq("style_code", style)
    .eq("order_type", orderType)
    .eq("age_group_label", age)
    .order("priority", { ascending: true })
    .order("position_start", { ascending: true });

  if (error) {
    console.error("Error loading batting_order_weights:", error);
    return null;
  }

  if (!data || data.length === 0) {
    return null;
  }

  const slots: BattingOrderSlotConfig[] = [];

  for (const row of data as any[]) {
    const start = row.position_start as number;
    const end = row.position_end as number;
    const prio = row.priority as number;

    const wCS = Number(row.w_cs);
    const wPS = Number(row.w_ps);
    const wSS = Number(row.w_ss);
    const wSC = Number(row.w_sc);

    for (let spot = start; spot <= end; spot++) {
      slots.push({
        spot,
        priority: prio,
        wCS,
        wPS,
        wSS,
        wSC,
      });
    }
  }

  // Ensure deterministic order: by priority then spot
  slots.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.spot - b.spot;
  });

  return {
    style,
    orderType,
    ageGroupLabel: age,
    slots,
  };
}



/**
 * Create an assessment (official or practice) + store raw values.
 * Then, if the template belongs to the 5U or 6U+ age group, compute ratings.
 *
 * - Only authenticated users can create assessments.
 * - If kind === "official", only COACHES for that team can perform it.
 */
app.post("/assessments", requireAuth, async (req: AuthedRequest, res) => {
  const authedUserId = req.user!.id;
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

  if (kind !== "official" && kind !== "practice") {
    return res.status(400).json({ error: 'kind must be "official" or "practice"' });
  }

  // If official, require team_id and coach role
  if (kind === "official") {
    if (!team_id) {
      return res.status(400).json({
        error: "team_id is required for official evaluations.",
      });
    }

    const role = await assertTeamRoleOr403(req, res, team_id, COACH_ONLY);
    if (!role) return; // response already sent (403)
  }

  // For both official and practice, performed_by is always the authed user
  const performerId: string | null = authedUserId;

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

// 9) Award player medals
let medalResult: MedalAwardResult | null = null;
try {
  medalResult = await awardMedalsForAssessment({
    kind,
    playerId: player_id,
    assessmentId,
    ageLabel,
    ratings,
  });
} catch (err) {
  console.error("Error awarding medals for assessment", assessmentId, err);
}

// 10) If this is an OFFICIAL team eval, recalc team trophies
let teamTrophyResult: TeamTrophyRecalcResult | null = null;
if (kind === "official" && team_id) {
  try {
    teamTrophyResult = await recalcTeamTrophiesForTeam(team_id);
  } catch (err) {
    console.error(
      "Error recalculating team trophies after official assessment",
      assessmentId,
      err
    );
  }
}

return res.status(201).json({
  assessment_id: assessmentId,
  ratings_inserted: true,
  medals_potential: medalResult?.potential ?? [],
  medals_awarded: medalResult?.newlyAwarded ?? [],
  team_trophies_potential: teamTrophyResult?.trophies_potential ?? [],
  team_trophies_awarded: teamTrophyResult?.trophies_awarded ?? [],
});
});


interface TeamTrophyRecalcResult {
  team_id: string;
  age_group_label: string;
  level: string | null;
  trophies_potential: TrophySummary[];
  trophies_awarded: TrophySummary[];
  message?: string;
}

async function recalcTeamTrophiesForTeam(teamId: string): Promise<TeamTrophyRecalcResult | null> {
  try {
    // 1) Load team info (age_group + level)
    const { data: team, error: teamError } = await supabase
      .from("teams")
      .select("id, age_group, level")
      .eq("id", teamId)
      .maybeSingle();

    if (teamError) {
      console.error("Error fetching team in trophies helper:", teamError);
      return null;
    }
    if (!team) {
      console.warn("Team not found in trophies helper:", teamId);
      return null;
    }

    const ageLabel = String(team.age_group); // e.g. "9U"
    const teamLevel = team.level ? String(team.level) : null;

    // 2) Resolve age_group_id (if present)
    let ageGroupId: number | null = null;
    {
      const { data: ageRow, error: ageError } = await supabase
        .from("age_groups")
        .select("id, label")
        .eq("label", ageLabel)
        .maybeSingle();

      if (ageError) {
        console.error("Error fetching age_group for team trophies:", ageError);
      } else if (ageRow) {
        ageGroupId = ageRow.id as number;
      }
    }

    // 3) Trophy definitions for this age group
    const trophyDefs = await getTrophyDefinitionsForAge(ageLabel);
    if (!trophyDefs.length) {
      return {
        team_id: teamId,
        age_group_label: ageLabel,
        level: teamLevel,
        trophies_potential: [],
        trophies_awarded: [],
        message: "No trophy definitions found for this age group.",
      };
    }

    // 4) Medal defs (for thresholds)
    const medalDefs = await getMedalDefinitionsForAge(ageLabel);

    function getThresholdPercent(metricCode: string, tier: TrophyTier): number | null {
      const targetMetric = normalizeMetricCode(metricCode);
      if (!targetMetric) return null;

      const def = medalDefs.find((m) => {
        const mc = normalizeMetricCode(m.metric_code);
        const mtier = m.tier ? m.tier.toLowerCase() : null;
        return mc === targetMetric && mtier === tier;
      });

      return def?.min_percent ?? null;
    }

    // 5) All official assessments for this team
    const { data: assessments, error: assessmentsError } = await supabase
      .from("player_assessments")
      .select("id, player_id")
      .eq("team_id", teamId)
      .eq("kind", "official");

    if (assessmentsError) {
      console.error("Error fetching official assessments for team trophies:", assessmentsError);
      return null;
    }

    if (!assessments || assessments.length === 0) {
      return {
        team_id: teamId,
        age_group_label: ageLabel,
        level: teamLevel,
        trophies_potential: [],
        trophies_awarded: [],
        message: "No official assessments found for this team.",
      };
    }

    const assessmentIds = Array.from(new Set(assessments.map((a) => a.id as number)));
    if (assessmentIds.length === 0) {
      return {
        team_id: teamId,
        age_group_label: ageLabel,
        level: teamLevel,
        trophies_potential: [],
        trophies_awarded: [],
        message: "No official assessments found for this team.",
      };
    }

    // 6) Player ratings for those assessments (prefer matching age_group_id)
    let ratingsQuery = supabase
      .from("player_ratings")
      .select(
        "player_id, assessment_id, overall_score, offense_score, defense_score, pitching_score, breakdown, created_at"
      )
      .eq("team_id", teamId)
      .in("assessment_id", assessmentIds);

    if (ageGroupId !== null) {
      ratingsQuery = ratingsQuery.eq("age_group_id", ageGroupId);
    }

    const { data: ratingRows, error: ratingsError } = await ratingsQuery;

    if (ratingsError) {
      console.error("Error fetching player_ratings for team trophies:", ratingsError);
      return null;
    }

    if (!ratingRows || ratingRows.length === 0) {
      return {
        team_id: teamId,
        age_group_label: ageLabel,
        level: teamLevel,
        trophies_potential: [],
        trophies_awarded: [],
        message: "No ratings found for this team.",
      };
    }

    // 7) Latest rating per player
    interface RatingRow {
      player_id: string;
      assessment_id: number;
      overall_score: number | null;
      offense_score: number | null;
      defense_score: number | null;
      pitching_score: number | null;
      breakdown: any;
      created_at: string | null;
    }

    const latestByPlayer = new Map<string, RatingRow>();

    for (const row of ratingRows as RatingRow[]) {
      const playerId = row.player_id;
      const existing = latestByPlayer.get(playerId);
      if (!existing) {
        latestByPlayer.set(playerId, row);
        continue;
      }
      const prevTs = existing.created_at || "";
      const currTs = row.created_at || "";
      if (currTs > prevTs) {
        latestByPlayer.set(playerId, row);
      }
    }

    if (latestByPlayer.size === 0) {
      return {
        team_id: teamId,
        age_group_label: ageLabel,
        level: teamLevel,
        trophies_potential: [],
        trophies_awarded: [],
        message: "No latest ratings per player could be resolved.",
      };
    }

    // 8) Metric codes we care about (from trophy defs)
    const metricCodesNeeded = new Set<string>();
    for (const def of trophyDefs) {
      const metric = normalizeMetricCode(def.metric_code);
      if (metric) metricCodesNeeded.add(metric);
    }

    // 9) Build per-metric percent arrays
    const percentsByMetric = new Map<string, number[]>();
    for (const mc of metricCodesNeeded) {
      percentsByMetric.set(mc, []);
    }

    for (const row of latestByPlayer.values()) {
      const ratingLike: RatingResult = {
        overall_score: row.overall_score ?? null,
        offense_score: row.offense_score ?? null,
        defense_score: row.defense_score ?? null,
        pitching_score: row.pitching_score ?? null,
        breakdown: row.breakdown ?? null,
      };

      for (const mc of metricCodesNeeded) {
        const p = getMetricPercentFromRatings(mc, ratingLike);
        if (p != null) {
          const arr = percentsByMetric.get(mc);
          if (arr) arr.push(p);
        }
      }
    }

    // 10) Existing team trophies
    const { data: existingTrophies, error: existingError } = await supabase
      .from("team_trophies")
      .select("trophy_id")
      .eq("team_id", teamId);

    if (existingError) {
      console.error("Error fetching existing team_trophies:", existingError);
    }

    const ownedTrophyIds = new Set<number>(
      (existingTrophies || []).map((r: any) => r.trophy_id as number)
    );

    const trophiesPotential: TrophySummary[] = [];
    const trophiesAwarded: TrophySummary[] = [];
    const toInsert: any[] = [];

    // 11) Evaluate each trophy
    for (const def of trophyDefs) {
      const metricCode = normalizeMetricCode(def.metric_code);
      const rawTier = def.tier ? def.tier.toLowerCase() : null;
      if (!metricCode || !rawTier) continue;
      const tier = rawTier as TrophyTier;

      const percents = percentsByMetric.get(metricCode) || [];
      if (!percents.length) continue;

      const teamPercent = computeTeamPercentForMetric(percents, ageLabel, teamLevel);
      if (teamPercent == null) continue;

      const threshold = getThresholdPercent(metricCode, tier);
      if (threshold == null) continue;

      const summary: TrophySummary = {
        trophy_id: def.id,
        metric_code: metricCode,
        tier,
        name: def.name ?? null,
        threshold_percent: threshold,
        team_percent: teamPercent,
      };

      if (teamPercent >= threshold) {
        trophiesPotential.push(summary);

        if (!ownedTrophyIds.has(def.id)) {
          trophiesAwarded.push(summary);
          toInsert.push({
            trophy_id: def.id,
            team_id: teamId,
            awarded_at: new Date().toISOString(),
          });
        }
      }
    }

    // 12) Insert any newly earned team trophies
    if (toInsert.length > 0) {
      const { error: insertError } = await supabase
        .from("team_trophies")
        .insert(toInsert);
      if (insertError) {
        console.error("Error inserting new team_trophies:", insertError);
      }
    }

    return {
      team_id: teamId,
      age_group_label: ageLabel,
      level: teamLevel,
      trophies_potential: trophiesPotential,
      trophies_awarded: trophiesAwarded,
    };
  } catch (err) {
    console.error("Unexpected error in recalcTeamTrophiesForTeam:", err);
    return null;
  }
}

app.get(
  "/players/:playerId/medals",
  requireAuth,
  async (req: AuthedRequest, res) => {
    const { playerId } = req.params;

    try {
      // 1) Load official medals for the player
      const { data: medalRows, error: medalError } = await supabase
        .from("player_medals")
        .select("*")
        .eq("player_id", playerId)
        .eq("is_official", true)
        .order("awarded_at", { ascending: true });

      if (medalError) {
        console.error("Error fetching player_medals:", medalError);
        return res.status(500).json({ error: "Failed to load player medals." });
      }

      if (!medalRows || medalRows.length === 0) {
        return res.status(200).json({
          player_id: playerId,
          medals: [],
        });
      }

      // 2) Fetch the medal definitions for the medals this player owns
      const medalIds = Array.from(
        new Set(
          medalRows
            .map((row: any) => row.medal_id as number | null)
            .filter((id): id is number => id != null)
        )
      );

      let defsById: Record<number, any> = {};
      if (medalIds.length > 0) {
        const { data: defs, error: defsError } = await supabase
          .from("medal_definitions")
          .select(
            "id, name, description, category, icon_url, age_group_label, metric_code, tier, min_percent"
          )
          .in("id", medalIds);

        if (defsError) {
          console.error("Error fetching medal_definitions:", defsError);
        } else if (defs) {
          defsById = Object.fromEntries(
            (defs as any[]).map((d) => [d.id as number, d])
          );
        }
      }

      // 3) Merge rows + definitions for a nice response shape
      const medals = medalRows.map((row: any) => {
        const def = defsById[row.medal_id as number] || null;
        return {
          id: row.id,
          medal_id: row.medal_id,
          player_id: row.player_id,
          player_assessment_id: row.player_assessment_id,
          is_official: row.is_official,
          awarded_at: row.awarded_at,
          definition: def,
        };
      });

      return res.status(200).json({
        player_id: playerId,
        medals,
      });
    } catch (err) {
      console.error("Unexpected error in GET /players/:playerId/medals:", err);
      return res
        .status(500)
        .json({ error: "Failed to load player medals (internal error)." });
    }
  }
);



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

// Team stats overview
app.get("/teams/:teamId/stats/overview", async (req, res) => {
  const teamId = req.params.teamId;

  if (!teamId) {
    return res.status(400).json({ error: "Missing teamId" });
  }

  const evalScopeRaw = req.query.eval_scope;
  const assessmentDateRaw = req.query.assessment_date;

  const evalScope =
    typeof evalScopeRaw === "string" &&
    ["latest_eval", "all_star", "specific"].includes(evalScopeRaw)
      ? (evalScopeRaw as "latest_eval" | "all_star" | "specific")
      : null;

  const assessmentDate =
    typeof assessmentDateRaw === "string" && assessmentDateRaw
      ? assessmentDateRaw
      : null;

  try {
    const overview = await computeTeamStatsOverview(teamId, {
      evalScope,
      assessmentDate,
    });
    if (!overview) {
      return res.status(404).json({ error: "Team not found or no ratings." });
    }
    return res.status(200).json(overview);
  } catch (err) {
    console.error(
      "Unexpected error in GET /teams/:teamId/stats/overview:",
      err
    );
    return res.status(500).json({ error: "Failed to load team stats." });
  }
});

// Team stats evaluation options
app.get("/teams/:teamId/stats/evaluations", async (req, res) => {
  const teamId = req.params.teamId;

  if (!teamId) {
    return res.status(400).json({ error: "Missing teamId" });
  }

  try {
    const meta = await loadTeamAssessmentMeta(teamId);

    const evaluations = meta.orderedDates.map((iso) => ({
      id: iso,
      performed_at: iso,
      label: iso,
    }));

    return res.status(200).json({ team_id: teamId, evaluations });
  } catch (err) {
    console.error(
      "Unexpected error in GET /teams/:teamId/stats/evaluations:",
      err
    );
    return res.status(500).json({ error: "Failed to load team evaluations." });
  }
});

app.get(
  "/teams/:teamId/stats/offense",
  requireAuth,
  async (req: AuthedRequest, res) => {
    const { teamId } = req.params;

    if (!teamId) {
      return res.status(400).json({ error: "Missing teamId" });
    }

    const evalScopeRaw = req.query.eval_scope;
    const assessmentDateRaw = req.query.assessment_date;

    const evalScope =
      typeof evalScopeRaw === "string" &&
      ["latest_eval", "all_star", "specific"].includes(evalScopeRaw)
        ? (evalScopeRaw as "latest_eval" | "all_star" | "specific")
        : null;

    const assessmentDate =
      typeof assessmentDateRaw === "string" && assessmentDateRaw
        ? assessmentDateRaw
        : null;

    const role = await assertTeamRoleOr403(
      req,
      res,
      teamId,
      COACH_AND_ASSISTANT
    );
    if (!role) return;

    try {
      const drilldown = await computeTeamOffenseDrilldown(teamId, {
        evalScope,
        assessmentDate,
      });
      if (!drilldown) {
        return res
          .status(404)
          .json({ error: "Team not found or no offense ratings." });
      }

      return res.status(200).json(drilldown);
    } catch (err) {
      console.error(
        "Unexpected error in GET /teams/:teamId/stats/offense:",
        err
      );
      return res
        .status(500)
        .json({ error: "Failed to load offense drilldown for team." });
    }
  }
);


// Player stats overview
app.get("/players/:playerId/stats/overview", async (req, res) => {
  const playerId = req.params.playerId;

  if (!playerId) {
    return res.status(400).json({ error: "Missing playerId" });
  }

  try {
    const overview = await computePlayerStatsOverview(playerId);
    if (!overview) {
      return res
        .status(404)
        .json({ error: "Player not found or no ratings." });
    }
    return res.status(200).json(overview);
  } catch (err) {
    console.error(
      "Unexpected error in GET /players/:playerId/stats/overview:",
      err
    );
    return res.status(500).json({ error: "Failed to load player stats." });
  }
});

// Get the full team roster (team_players joined to profiles).
// Any member of the team (coach, assistant, player, parent) can view.
app.get("/teams/:teamId/players", requireAuth, async (req: AuthedRequest, res) => {
  const { teamId } = req.params;

  // Must at least be on the team in some role
  const role = await assertTeamRoleOr403(req, res, teamId, ANY_MEMBER);
  if (!role) return;

  try {
    const { data: teamPlayers, error } = await supabase
      .from("team_players")
      .select(
        "player_id, status, jersey_number, is_primary_team, created_at, updated_at"
      )
      .eq("team_id", teamId);

    if (error) {
      console.error("Error fetching team_players:", error);
      return res.status(500).json({ error: error.message });
    }

    const rows = teamPlayers ?? [];
    const playerIds = rows.map((row: any) => row.player_id).filter(Boolean);

    // Manually fetch profiles so we don't rely on Supabase's implicit embedding.
    let profilesById: Record<string, any> = {};
    if (playerIds.length > 0) {
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("*")
        .in("id", playerIds);

      if (profilesError) {
        console.error("Error fetching profiles for team players:", profilesError);
        // We'll still return the roster, just without embedded profile data.
      } else if (profiles) {
        profilesById = Object.fromEntries(
          profiles.map((p: any) => [p.id, p])
        );
      }
    }

    const rowsWithProfiles = rows.map((row: any) => ({
      ...row,
      profiles: profilesById[row.player_id] ?? null,
    }));

    return res.json(rowsWithProfiles);
  } catch (err) {
    console.error("Unexpected error in GET /teams/:teamId/players:", err);
    return res.status(500).json({ error: "Failed to load team roster" });
  }
});


// Get a single assessment template and its metrics
app.get(
  "/assessment-templates/:id",
  requireAuth,
  async (req: AuthedRequest, res) => {
    const { id } = req.params;
    const templateId = Number(id);

    if (!Number.isFinite(templateId)) {
      return res.status(400).json({ error: "Invalid template id" });
    }

    try {
      const { data: template, error: templateError } = await supabase
        .from("assessment_templates")
        .select("*")
        .eq("id", templateId)
        .single();

      if (templateError) {
        console.error("Error fetching assessment_template:", templateError);
        return res.status(500).json({ error: templateError.message });
      }

      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }

      const { data: metrics, error: metricsError } = await supabase
        .from("assessment_metrics")
        .select("*")
        .eq("template_id", templateId)
        .order("sort_order", { ascending: true });

      if (metricsError) {
        console.error("Error fetching assessment_metrics:", metricsError);
        return res.status(500).json({ error: metricsError.message });
      }

      return res.json({
        template,
        metrics: metrics ?? [],
      });
    } catch (err) {
      console.error(
        "Unexpected error in GET /assessment-templates/:id:",
        err
      );
      return res
        .status(500)
        .json({ error: "Failed to load assessment template" });
    }
  }
);


/**
 * Add a player to the team roster.
 * Coaches only.
 */
app.post("/teams/:teamId/players", requireAuth, async (req: AuthedRequest, res) => {
  const { teamId } = req.params;
  const { player_id, status, jersey_number, is_primary_team } = req.body || {};

  const role = await assertTeamRoleOr403(req, res, teamId, COACH_ONLY);
  if (!role) return;

  if (!player_id || typeof player_id !== "string") {
    return res.status(400).json({ error: "player_id is required." });
  }

  try {
    const insertPayload: any = {
      team_id: teamId,
      player_id,
    };

    if (status !== undefined) insertPayload.status = status;
    if (jersey_number !== undefined) insertPayload.jersey_number = jersey_number;
    if (is_primary_team !== undefined) insertPayload.is_primary_team = !!is_primary_team;

    const { data, error } = await supabase
      .from("team_players")
      .insert([insertPayload])
      .select()
      .single();

    if (error) {
      console.error("Error inserting team_players:", error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(201).json(data);
  } catch (err) {
    console.error("Unexpected error in POST /teams/:teamId/players:", err);
    return res.status(500).json({ error: "Failed to add player to team" });
  }
});

/**
 * Update a player's status/jersey/etc. on the team.
 * Coaches only.
 */
app.patch(
  "/teams/:teamId/players/:playerId",
  requireAuth,
  async (req: AuthedRequest, res) => {
    const { teamId, playerId } = req.params;
    const { status, jersey_number, is_primary_team } = req.body || {};

    const role = await assertTeamRoleOr403(req, res, teamId, COACH_ONLY);
    if (!role) return;

    const updates: any = {};
    if (status !== undefined) updates.status = status;
    if (jersey_number !== undefined) updates.jersey_number = jersey_number;
    if (is_primary_team !== undefined) updates.is_primary_team = !!is_primary_team;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No valid fields to update." });
    }

    try {
      const { data, error } = await supabase
        .from("team_players")
        .update(updates)
        .eq("team_id", teamId)
        .eq("player_id", playerId)
        .select()
        .single();

      if (error) {
        console.error("Error updating team_players:", error);
        return res.status(500).json({ error: error.message });
      }

      return res.json(data);
    } catch (err) {
      console.error("Unexpected error in PATCH /teams/:teamId/players/:playerId:", err);
      return res.status(500).json({ error: "Failed to update team player" });
    }
  }
);

/**
 * Remove a player from the team roster.
 * Coaches only.
 */
app.delete(
  "/teams/:teamId/players/:playerId",
  requireAuth,
  async (req: AuthedRequest, res) => {
    const { teamId, playerId } = req.params;

    const role = await assertTeamRoleOr403(req, res, teamId, COACH_ONLY);
    if (!role) return;

    try {
      const { error } = await supabase
        .from("team_players")
        .delete()
        .eq("team_id", teamId)
        .eq("player_id", playerId);

      if (error) {
        console.error("Error deleting team_players row:", error);
        return res.status(500).json({ error: error.message });
      }

      return res.status(204).send();
    } catch (err) {
      console.error("Unexpected error in DELETE /teams/:teamId/players/:playerId:", err);
      return res.status(500).json({ error: "Failed to remove player from team" });
    }
  }
);


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

// List attachments for a given message
app.get(
  "/messages/:messageId/attachments",
  requireAuth,
  async (req: AuthedRequest, res) => {
    const userId = req.user!.id;
    const { messageId } = req.params;

    try {
      // Optional membership check: ensure this user can see the message
      // (RLS will also enforce this, but this gives nicer errors)
      const { data: msg, error: msgError } = await supabase
        .from("messages")
        .select("conversation_id, sender_id")
        .eq("id", messageId)
        .maybeSingle();

      if (msgError) {
        console.error("Error fetching message for attachments:", msgError);
        return res.status(500).json({ error: msgError.message });
      }

      if (!msg) {
        return res.status(404).json({ error: "Message not found" });
      }

      // Ensure user is a participant in that conversation
      const { data: membership, error: membershipError } = await supabase
        .from("conversation_participants")
        .select("conversation_id")
        .eq("conversation_id", msg.conversation_id)
        .eq("profile_id", userId)
        .maybeSingle();

      if (membershipError) {
        console.error("Error checking membership:", membershipError);
        return res.status(500).json({ error: membershipError.message });
      }

      if (!membership) {
        return res.status(403).json({ error: "You are not a participant in this conversation" });
      }

      // Now fetch attachments
      const { data: attachments, error: attachError } = await supabase
        .from("message_attachments")
        .select("*")
        .eq("message_id", messageId)
        .order("created_at", { ascending: true });

      if (attachError) {
        console.error("Error fetching message_attachments:", attachError);
        return res.status(500).json({ error: attachError.message });
      }

      return res.json(attachments ?? []);
    } catch (err) {
      console.error("Unexpected error in GET /messages/:messageId/attachments:", err);
      return res.status(500).json({ error: "Failed to load attachments" });
    }
  }
);

// Add one or more attachments to a message
app.post(
  "/messages/:messageId/attachments",
  requireAuth,
  async (req: AuthedRequest, res) => {
    const userId = req.user!.id;
    const { messageId } = req.params;
    const { attachments } = req.body || {};

    if (!Array.isArray(attachments) || attachments.length === 0) {
      return res.status(400).json({
        error: "attachments must be a non-empty array of { url, type }",
      });
    }

    try {
      // 1) Fetch the message to verify it exists and who sent it
      const { data: msg, error: msgError } = await supabase
        .from("messages")
        .select("conversation_id, sender_id")
        .eq("id", messageId)
        .maybeSingle();

      if (msgError) {
        console.error("Error fetching message for attachment insert:", msgError);
        return res.status(500).json({ error: msgError.message });
      }

      if (!msg) {
        return res.status(404).json({ error: "Message not found" });
      }

      // 2) Ensure user is at least a participant in the conversation
      const { data: membership, error: membershipError } = await supabase
        .from("conversation_participants")
        .select("conversation_id")
        .eq("conversation_id", msg.conversation_id)
        .eq("profile_id", userId)
        .maybeSingle();

      if (membershipError) {
        console.error("Error checking membership for attachments:", membershipError);
        return res.status(500).json({ error: membershipError.message });
      }

      if (!membership) {
        return res.status(403).json({ error: "You are not a participant in this conversation" });
      }

      // 3) (Optional) If you want to restrict uploads to *only* the sender of the message:
      // if (msg.sender_id !== userId) {
      //   return res.status(403).json({ error: "Only the sender can add attachments to this message" });
      // }

      // 4) Build rows to insert
      const rowsToInsert = attachments
        .filter(
          (a: any) =>
            a &&
            typeof a.url === "string" &&
            a.url.trim().length > 0 &&
            typeof a.type === "string"
        )
        .map((a: any) => ({
          message_id: messageId,
          url: a.url.trim(),
          type: a.type, // must match your enum type; otherwise Postgres will error
        }));

      if (rowsToInsert.length === 0) {
        return res.status(400).json({
          error: "No valid attachments found. Each must have a non-empty url and a type.",
        });
      }

      const { data: inserted, error: insertError } = await supabase
        .from("message_attachments")
        .insert(rowsToInsert)
        .select();

      if (insertError) {
        console.error("Error inserting message_attachments:", insertError);
        return res.status(500).json({ error: insertError.message });
      }

      return res.status(201).json(inserted);
    } catch (err) {
      console.error("Unexpected error in POST /messages/:messageId/attachments:", err);
      return res.status(500).json({ error: "Failed to add attachments" });
    }
  }
);

// Delete a single attachment by id (only the message sender can delete)
app.delete(
  "/attachments/:attachmentId",
  requireAuth,
  async (req: AuthedRequest, res) => {
    const userId = req.user!.id;
    const { attachmentId } = req.params;

    try {
      // 1) Load attachment + its message
      const { data: attachment, error: attachError } = await supabase
        .from("message_attachments")
        .select("id, message_id")
        .eq("id", attachmentId)
        .maybeSingle();

      if (attachError) {
        console.error("Error fetching attachment for delete:", attachError);
        return res.status(500).json({ error: attachError.message });
      }

      if (!attachment) {
        return res.status(404).json({ error: "Attachment not found" });
      }

      const { data: msg, error: msgError } = await supabase
        .from("messages")
        .select("sender_id")
        .eq("id", attachment.message_id)
        .maybeSingle();

      if (msgError) {
        console.error("Error fetching message for attachment delete:", msgError);
        return res.status(500).json({ error: msgError.message });
      }

      if (!msg) {
        return res.status(404).json({ error: "Parent message not found" });
      }

      if (msg.sender_id !== userId) {
        return res.status(403).json({ error: "Only the message sender can delete this attachment" });
      }

      // 2) Delete
      const { error: deleteError } = await supabase
        .from("message_attachments")
        .delete()
        .eq("id", attachmentId);

      if (deleteError) {
        console.error("Error deleting attachment:", deleteError);
        return res.status(500).json({ error: deleteError.message });
      }

      return res.status(204).send();
    } catch (err) {
      console.error("Unexpected error in DELETE /attachments/:attachmentId:", err);
      return res.status(500).json({ error: "Failed to delete attachment" });
    }
  }
);

/**
 * Send a broadcast message to the team's main conversation.
 * Coaches and Assistants only.
 */
app.post(
  "/teams/:teamId/messages",
  requireAuth,
  async (req: AuthedRequest, res) => {
    const userId = req.user!.id;
    const { teamId } = req.params;
    const { content } = req.body || {};

    const role = await assertTeamRoleOr403(req, res, teamId, COACH_AND_ASSISTANT);
    if (!role) return;

    if (!content || typeof content !== "string" || !content.trim()) {
      return res.status(400).json({ error: "content is required." });
    }

    try {
      const convo = await getOrCreateTeamConversation(teamId, userId);

      // Make sure sender is a participant
      const { data: existingParticipant, error: epError } = await supabase
        .from("conversation_participants")
        .select("conversation_id")
        .eq("conversation_id", convo.id)
        .eq("profile_id", userId)
        .maybeSingle();

      if (epError) {
        console.error("Error checking sender participation:", epError);
      } else if (!existingParticipant) {
        await supabase
          .from("conversation_participants")
          .insert([{ conversation_id: convo.id, profile_id: userId }]);
      }

      // Insert message
      const { data: message, error: msgError } = await supabase
        .from("messages")
        .insert([
          {
            conversation_id: convo.id,
            sender_id: userId,
            content: content.trim(),
          },
        ])
        .select()
        .single();

      if (msgError) {
        console.error("Error inserting message:", msgError);
        return res.status(500).json({ error: msgError.message });
      }

      // Update conversation's updated_at for ordering
      await supabase
        .from("conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", convo.id);

      return res.status(201).json({
        conversation: convo,
        message,
      });
    } catch (err) {
      console.error("Unexpected error in POST /teams/:teamId/messages:", err);
      return res.status(500).json({ error: "Failed to send team message" });
    }
  }
);

app.get(
  "/teams/:teamId/stats/offense-drilldown",
  requireAuth,
  async (req: AuthedRequest, res) => {
    const { teamId } = req.params;

    const role = await assertTeamRoleOr403(
      req,
      res,
      teamId,
      COACH_AND_ASSISTANT
    );
    if (!role) return;

    const evalScopeRaw = req.query.eval_scope;
    const assessmentDateRaw = req.query.assessment_date;

    const evalScope =
      typeof evalScopeRaw === "string" &&
      ["latest_eval", "all_star", "specific"].includes(evalScopeRaw)
        ? (evalScopeRaw as "latest_eval" | "all_star" | "specific")
        : null;

    const assessmentDate =
      typeof assessmentDateRaw === "string" && assessmentDateRaw
        ? assessmentDateRaw
        : null;

    try {
      const payload = await computeTeamOffenseDrilldown(teamId, {
        evalScope,
        assessmentDate,
      });

      if (!payload) {
        return res
          .status(404)
          .json({ error: "Team not found or no offense ratings." });
      }

      return res.json(payload);
    } catch (err) {
      console.error("Unexpected error in offense drilldown:", err);
      return res
        .status(500)
        .json({ error: "Failed to load team offense breakdown." });
    }
  }
);


app.post(
  "/teams/:teamId/trophies/recalculate",
  requireAuth,
  async (req: AuthedRequest, res) => {
    const { teamId } = req.params;

    // Enforce team role (coach/assistant)
    const role = await assertTeamRoleOr403(req, res, teamId, COACH_AND_ASSISTANT);
    if (!role) return;

    try {
      const result = await recalcTeamTrophiesForTeam(teamId);
      if (!result) {
        return res
          .status(500)
          .json({ error: "Failed to recalculate team trophies." });
      }

      return res.status(200).json(result);
    } catch (err) {
      console.error("Error in /teams/:teamId/trophies/recalculate:", err);
      return res
        .status(500)
        .json({ error: "Failed to recalculate team trophies." });
    }
  }
);




app.post(
  "/teams/:teamId/lineups/optimize",
  requireAuth,
  async (req: AuthedRequest, res) => {
    const authedUserId = req.user!.id;
    const teamId = req.params.teamId;

    const body = req.body as OptimizeLineupRequest;

    if (!body.age_group_label || !body.fielding_setup || !body.pitching_setup) {
      return res.status(400).json({
        error: "age_group_label, fielding_setup, and pitching_setup are required",
      });
    }

    if (!Array.isArray(body.available_player_ids) || body.available_player_ids.length === 0) {
      return res.status(400).json({
        error: "available_player_ids must be a non-empty array",
      });
    }

    // 1) Auth: coach/assistant for this team
    const role = await assertTeamRoleOr403(req, res, teamId, COACH_ONLY);
    if (!role) return;

    // 2) Ensure players are active members of the team
    const { data: members, error: membersError } = await supabase
      .from("team_members")
      .select("player_id")
      .eq("team_id", teamId)
      .eq("is_active", true);

    if (membersError) {
      console.error("Error fetching team_members:", membersError);
      return res.status(500).json({ error: "Failed to load team members" });
    }

    const activeSet = new Set<string>((members || []).map((m: any) => m.player_id));
    const eligiblePlayerIds = body.available_player_ids.filter((id) =>
      activeSet.has(id)
    );

    if (eligiblePlayerIds.length === 0) {
      return res.status(400).json({
        error: "No available_player_ids are active members of this team",
      });
    }

    // 3) Resolve age_group_id from label
    const { data: ageGroup, error: ageGroupError } = await supabase
      .from("age_groups")
      .select("id, label")
      .eq("label", body.age_group_label)
      .maybeSingle();

    if (ageGroupError || !ageGroup) {
      console.error("Error fetching age_groups:", ageGroupError);
      return res.status(400).json({
        error: `Unknown age_group_label: ${body.age_group_label}`,
      });
    }

    const ageGroupId = ageGroup.id;

    // 4) Load hierarchy (or use custom positions)
    let hierarchy: any | null = null;
    let positions: PositionCode[] | null = null;

    if (body.custom_positions && body.custom_positions.length > 0) {
      positions = body.custom_positions;
    } else if (body.hierarchy_id) {
      const { data: h, error: hError } = await supabase
        .from("position_hierarchies")
        .select("id, age_group_label, fielding_setup, name, positions")
        .eq("id", body.hierarchy_id)
        .maybeSingle();

      if (hError || !h) {
        console.error("Error fetching position_hierarchies by id:", hError);
        return res.status(400).json({ error: "Invalid hierarchy_id" });
      }

      if (h.age_group_label !== body.age_group_label) {
        return res.status(400).json({
          error: "Hierarchy age_group_label does not match request age_group_label",
        });
      }
      if (h.fielding_setup !== body.fielding_setup) {
        return res.status(400).json({
          error: "Hierarchy fielding_setup does not match request fielding_setup",
        });
      }

      hierarchy = h;
      positions = (h.positions || []) as PositionCode[];
    } else {
      // Default: system "Standard" hierarchy for this age group + fielding setup
      const { data: h, error: hError } = await supabase
        .from("position_hierarchies")
        .select("id, age_group_label, fielding_setup, name, positions")
        .eq("age_group_label", body.age_group_label)
        .eq("fielding_setup", body.fielding_setup)
        .eq("is_system", true)
        .ilike("name", "%Standard%")
        .limit(1)
        .maybeSingle();

      if (hError || !h) {
        console.error("No default Standard hierarchy found:", hError);
        return res.status(400).json({
          error:
            "No default Standard position hierarchy found for this age group and fielding setup",
        });
      }

      hierarchy = h;
      positions = (h.positions || []) as PositionCode[];
    }

    if (!positions || positions.length === 0) {
      return res.status(400).json({ error: "No positions defined for this hierarchy" });
    }

    // 5) Apply pitching_setup: if player_pitch, drop pitchers_helper
    let positionsToFill = positions.slice();
    if (body.pitching_setup === "player_pitch") {
      positionsToFill = positionsToFill.filter((p) => p !== "pitchers_helper");
    }

    // 6) Load latest ratings for each eligible player on this team & age group
    const { data: ratingsRows, error: ratingsError } = await supabase
      .from("player_ratings")
      .select(
        "player_id, team_id, age_group_id, overall_score, offense_score, defense_score, pitching_score, breakdown, created_at"
      )
      .in("player_id", eligiblePlayerIds)
      .eq("team_id", teamId)
      .eq("age_group_id", ageGroupId)
      .order("created_at", { ascending: false });

    if (ratingsError) {
      console.error("Error fetching player_ratings:", ratingsError);
      return res.status(500).json({ error: "Failed to load player ratings" });
    }

    const latestByPlayer = new Map<string, any>();
    for (const row of ratingsRows || []) {
      const pid = row.player_id as string;
      if (!latestByPlayer.has(pid)) {
        latestByPlayer.set(pid, row);
      }
    }

    // 7) Load profile + jersey info
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, display_name, first_name, last_name")
      .in("id", eligiblePlayerIds);

    if (profilesError) {
      console.error("Error fetching profiles:", profilesError);
      return res.status(500).json({ error: "Failed to load player profiles" });
    }

    const profilesById = new Map<string, any>(
      (profiles || []).map((p: any) => [p.id, p])
    );

    const { data: teamPlayers, error: teamPlayersError } = await supabase
      .from("team_players")
      .select("player_id, jersey_number")
      .in("player_id", eligiblePlayerIds)
      .eq("team_id", teamId);

    if (teamPlayersError) {
      console.error("Error fetching team_players:", teamPlayersError);
      return res.status(500).json({ error: "Failed to load team player data" });
    }

    const teamPlayersById = new Map<string, any>(
      (teamPlayers || []).map((tp: any) => [tp.player_id, tp])
    );

    // 8) Build PlayerWithRatings list
    const players: PlayerWithRatings[] = [];

    for (const playerId of eligiblePlayerIds) {
      const profile = profilesById.get(playerId);
      const ratingRow = latestByPlayer.get(playerId);
      const tp = teamPlayersById.get(playerId);

      const breakdown = (ratingRow?.breakdown as any) || {};
      const derived = breakdown.derived || {};
      const positionScores = derived.position_scores || {};

      const displayName =
        profile?.display_name ||
        [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") ||
        "Player";

      players.push({
        player_id: playerId,
        display_name: displayName,
        jersey_number: tp?.jersey_number ?? null,
        overall_score: toNumberOrNull(ratingRow?.overall_score),
        offense_score: toNumberOrNull(ratingRow?.offense_score),
        defense_score: toNumberOrNull(ratingRow?.defense_score),
        pitching_score: toNumberOrNull(ratingRow?.pitching_score),
        position_scores: positionScores,
        speed_score: toNumberOrNull(derived.speed_score),
        infield_score: toNumberOrNull(positionScores.infield_score),
        outfield_score: toNumberOrNull(positionScores.outfield_score),
      });
    }

    // 9) Run optimization (SPEEDSCORE tie-breaker)
    const locks = (body.locked || {}) as Record<PositionCode, string | undefined>;

    const assignments = optimizeLineupAssignments(
      players,
      positionsToFill as PositionCode[],
      locks
    );

    const assignedPlayerIds = new Set(assignments.map((a) => a.player_id));

    const unslotted_players = players
      .filter((p) => !assignedPlayerIds.has(p.player_id))
      .map((p) => ({
        player_id: p.player_id,
        player_name: p.display_name,
        jersey_number: p.jersey_number,
      }));

    // 10) Position averages (for the positions we care about in this setup)
    const uniquePositions = Array.from(new Set(positionsToFill)) as PositionCode[];
    const position_averages: Record<string, number | null> = {};

    for (const pos of uniquePositions) {
      const vals: number[] = [];
      for (const p of players) {
        const s = getPositionScore(p, pos);
        if (typeof s === "number") vals.push(s);
      }
      if (vals.length === 0) {
        position_averages[pos] = null;
      } else {
        const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
        position_averages[pos] = Number(avg.toFixed(1));
      }
    }

    // 11) Team aggregates (use players involved in this optimization)
    const team_aggregates = {
      offense: averageNonNull(players.map((p) => p.offense_score)),
      defense: averageNonNull(players.map((p) => p.defense_score)),
      pitching: averageNonNull(players.map((p) => p.pitching_score)),
      infield: averageNonNull(players.map((p) => p.infield_score)),
      outfield: averageNonNull(players.map((p) => p.outfield_score)),
      overall: averageNonNull(players.map((p) => p.overall_score)),
    };

    // 12) Optionally save lineup
    let saved_lineup_id: string | undefined;

    if (body.save_lineup) {
      if (!body.lineup_name || body.lineup_name.trim().length === 0) {
        return res.status(400).json({
          error: "lineup_name is required when save_lineup is true",
        });
      }

      const { data: lineup, error: lineupError } = await supabase
        .from("team_lineups")
        .insert([
          {
            team_id: teamId,
            age_group_label: body.age_group_label,
            fielding_setup: body.fielding_setup,
            pitching_setup: body.pitching_setup,
            hierarchy_id: hierarchy?.id ?? null,
            name: body.lineup_name.trim(),
            created_by: authedUserId,
          },
        ])
        .select("id")
        .single();

      if (lineupError || !lineup) {
        console.error("Error inserting team_lineups:", lineupError);
        return res.status(500).json({ error: "Failed to save lineup" });
      }

      saved_lineup_id = lineup.id;

      const slotsToInsert = assignments.map((a) => ({
        lineup_id: saved_lineup_id,
        player_id: a.player_id,
        position: a.position,
        batting_order: null,
      }));

      const { error: slotsError } = await supabase
        .from("team_lineup_slots")
        .insert(slotsToInsert);

      if (slotsError) {
        console.error("Error inserting team_lineup_slots:", slotsError);
        // we still return the optimization results, just without saved lineup
      }
    }

    return res.json({
      team_id: teamId,
      age_group: body.age_group_label,
      fielding_setup: body.fielding_setup,
      pitching_setup: body.pitching_setup,
      hierarchy_used: {
        id: hierarchy?.id ?? null,
        name: hierarchy?.name ?? (body.custom_positions ? "Custom" : null),
        positions: positionsToFill,
      },
      assignments,
      unslotted_players,
      position_averages,
      team_aggregates,
      saved_lineup_id,
    });
  }
);


app.post(
  "/teams/:teamId/batting-order/optimize",
  requireAuth,
  async (req: AuthedRequest, res) => {
    const { teamId } = req.params;
    const body = req.body as BattingOrderOptimizeRequest;

    // Only coaches/assistants can run the optimizer
    const role = await assertTeamRoleOr403(req, res, teamId, COACH_AND_ASSISTANT);
    if (!role) return;

    const {
      style,
      order_type,
      dh_mode = "pitcher_hits",
      dh_pitcher_player_id = null,
      player_ids,
      locked_slots,
    } = body;

    if (!style || !order_type) {
      return res.status(400).json({ error: "style and order_type are required" });
    }

    try {
      // 1) Load team to get age_group
      const { data: team, error: teamError } = await supabase
        .from("teams")
        .select("id, age_group")
        .eq("id", teamId)
        .maybeSingle();

      if (teamError) {
        console.error("Error fetching team for batting order:", teamError);
        return res.status(500).json({ error: "Failed to load team." });
      }

      if (!team) {
        return res.status(404).json({ error: "Team not found." });
      }

      const ageGroupLabel: string | null = team.age_group
        ? String(team.age_group)
        : null;

      // 2) Determine lineup size
      let lineupSize = 9;
      if (order_type === "TEN") lineupSize = 10;
      if (order_type === "CONTINUOUS") lineupSize = 99; // effectively "all available"

      // 3) Figure out which players to consider
      let candidatePlayerIds: string[] = [];

      if (player_ids && player_ids.length > 0) {
        candidatePlayerIds = Array.from(new Set(player_ids));
      } else {
        // fallback: all players on the team
        const { data: teamPlayers, error: teamPlayersError } = await supabase
          .from("team_players")
          .select("player_id")
          .eq("team_id", teamId);

        if (teamPlayersError) {
          console.error("Error fetching team_players for batting order:", teamPlayersError);
          return res
            .status(500)
            .json({ error: "Failed to load team players." });
        }

        candidatePlayerIds = Array.from(
          new Set((teamPlayers || []).map((tp: any) => tp.player_id as string))
        );
      }

      // Apply DH mode: if using DH, remove pitcher from candidate hitters
      let effectivePlayerIds = [...candidatePlayerIds];
      if (dh_mode === "use_dh" && dh_pitcher_player_id) {
        effectivePlayerIds = effectivePlayerIds.filter(
          (id) => id !== dh_pitcher_player_id
        );
      }

      if (effectivePlayerIds.length === 0) {
        return res.status(200).json({
          team_id: teamId,
          age_group_label: ageGroupLabel,
          style,
          order_type,
          dh_mode,
          dh_pitcher_player_id,
          lineup: [],
          team_averages: {
            hitting_score: null,
            contact_score: null,
            power_score: null,
            speed_score: null,
            strike_chance: null,
          },
          players_considered: [],
        } as BattingOrderOptimizeResponse);
      }

      // If not continuous, cap the number of hitters
      if (order_type !== "CONTINUOUS" && effectivePlayerIds.length > lineupSize) {
        // keep as many as we need; frontend can decide which subset to send if desired
        effectivePlayerIds = effectivePlayerIds.slice(0, lineupSize);
      }

      // 4) Resolve age_group_id (for ratings)
      let ageGroupId: number | null = null;
      if (ageGroupLabel) {
        const { data: ageRow, error: ageError } = await supabase
          .from("age_groups")
          .select("id, label")
          .eq("label", ageGroupLabel)
          .maybeSingle();

        if (ageError) {
          console.error("Error fetching age_group for batting order:", ageError);
        } else if (ageRow) {
          ageGroupId = ageRow.id as number;
        }
      }

      // 5) Load latest ratings for these players on this team / age group
      let ratingsQuery = supabase
        .from("player_ratings")
        .select(
          "player_id, team_id, age_group_id, overall_score, offense_score, defense_score, pitching_score, breakdown, created_at"
        )
        .eq("team_id", teamId)
        .in("player_id", effectivePlayerIds);

      if (ageGroupId !== null) {
        ratingsQuery = ratingsQuery.eq("age_group_id", ageGroupId);
      }

      const { data: ratingRows, error: ratingsError } = await ratingsQuery;

      if (ratingsError) {
        console.error("Error fetching player_ratings for batting order:", ratingsError);
        return res.status(500).json({ error: "Failed to load player ratings." });
      }

      if (!ratingRows || ratingRows.length === 0) {
        return res.status(200).json({
          team_id: teamId,
          age_group_label: ageGroupLabel,
          style,
          order_type,
          dh_mode,
          dh_pitcher_player_id,
          lineup: [],
          team_averages: {
            hitting_score: null,
            contact_score: null,
            power_score: null,
            speed_score: null,
            strike_chance: null,
          },
          players_considered: [],
          message: "No ratings found for selected players.",
        } as BattingOrderOptimizeResponse & { message: string });
      }

      interface RatingRow {
        player_id: string;
        created_at: string | null;
        offense_score: number | null;
        defense_score: number | null;
        overall_score: number | null;
        pitching_score: number | null;
        breakdown: any;
      }

      // Keep latest rating per player
      const latestByPlayer = new Map<string, RatingRow>();
      for (const row of ratingRows as RatingRow[]) {
        const pid = row.player_id;
        const existing = latestByPlayer.get(pid);
        if (!existing) {
          latestByPlayer.set(pid, row);
          continue;
        }
        const prevTs = existing.created_at || "";
        const currTs = row.created_at || "";
        if (currTs > prevTs) {
          latestByPlayer.set(pid, row);
        }
      }

      const battingMetrics: BattingPlayerMetrics[] = [];
      for (const row of latestByPlayer.values()) {
        const metrics = getBattingMetricsFromRating(row);
        if (metrics) {
          battingMetrics.push(metrics);
        }
      }

      if (battingMetrics.length === 0) {
        return res.status(200).json({
          team_id: teamId,
          age_group_label: ageGroupLabel,
          style,
          order_type,
          dh_mode,
          dh_pitcher_player_id,
          lineup: [],
          team_averages: {
            hitting_score: null,
            contact_score: null,
            power_score: null,
            speed_score: null,
            strike_chance: null,
          },
          players_considered: [],
          message: "No usable batting metrics for selected players.",
        } as BattingOrderOptimizeResponse & { message: string });
      }

      // 6) Get style config (DB first, then fallback to in-code defaults)
      let config = await loadBattingOrderConfigFromDb(style, order_type, ageGroupLabel);

      if (!config) {
        config = getDefaultBattingOrderConfig(style, order_type, ageGroupLabel);
      }

      if (!config) {
        return res.status(400).json({
          error: `No batting order config found for style=${style}, order_type=${order_type}, age_group=${ageGroupLabel}`,
        });
      }


      // Trim config slots to actual lineupSize if needed
      const slotsForUse =
        order_type === "CONTINUOUS"
          ? config.slots.slice(0, Math.min(config.slots.length, battingMetrics.length))
          : config.slots.slice(0, Math.min(lineupSize, config.slots.length));

      const configForUse: BattingOrderStyleConfig = {
        ...config,
        slots: slotsForUse,
      };

      // 7) Process locked slots
      const lockedSlotsNumeric: Record<number, string> = {};
      if (locked_slots) {
        for (const [key, playerId] of Object.entries(locked_slots)) {
          const pos = parseInt(key, 10);
          if (!Number.isNaN(pos)) {
            lockedSlotsNumeric[pos] = playerId;
          }
        }
      }

      // 8) Run greedy optimizer
      const lineup = optimizeBattingOrderGreedy(
        battingMetrics,
        configForUse,
        lockedSlotsNumeric
      );

      // 9) Compute team averages over players actually in the lineup
      const playersInLineup = new Set(lineup.map((s) => s.player_id));
      const metricsInLineup = battingMetrics.filter((m) =>
        playersInLineup.has(m.playerId)
      );

      const avg = (arr: number[]): number | null =>
        arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

      const team_averages = {
        hitting_score: avg(metricsInLineup.map((m) => m.hittingScore)),
        contact_score: avg(metricsInLineup.map((m) => m.contactScore)),
        power_score: avg(metricsInLineup.map((m) => m.powerScore)),
        speed_score: avg(metricsInLineup.map((m) => m.speedScore)),
        strike_chance: avg(metricsInLineup.map((m) => m.strikeChance)),
      };

      const response: BattingOrderOptimizeResponse = {
        team_id: teamId,
        age_group_label: ageGroupLabel,
        style,
        order_type,
        dh_mode,
        dh_pitcher_player_id: dh_mode === "use_dh" ? dh_pitcher_player_id : null,
        lineup,
        team_averages,
        players_considered: battingMetrics,
      };

      return res.status(200).json(response);
    } catch (err) {
      console.error("Unexpected error in POST /teams/:teamId/batting-order/optimize:", err);
      return res
        .status(500)
        .json({ error: "Failed to optimize batting order." });
    }
  }
);


app.get(
  "/teams/:teamId/pitching/configurations",
  requireAuth,
  async (req: AuthedRequest, res) => {
    const { teamId } = req.params;

    // Anyone on staff can view
    const role = await assertTeamRoleOr403(req, res, teamId, COACH_AND_ASSISTANT);
    if (!role) return;

    try {
      const { data: configs, error } = await supabase
        .from("pitching_configurations")
        .select("id, name, is_default, created_by, created_at, updated_at")
        .eq("team_id", teamId)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Error fetching pitching_configurations:", error);
        return res.status(500).json({ error: "Failed to load pitching configurations." });
      }

      if (!configs || configs.length === 0) {
        return res.status(200).json([]);
      }

      // Optionally include slots for each config
      const configIds = configs.map((c: any) => c.id as number);

      const { data: slots, error: slotsError } = await supabase
        .from("pitching_configuration_slots")
        .select("configuration_id, slot_id, player_id, role, locked, order_index")
        .in("configuration_id", configIds)
        .order("order_index", { ascending: true });

      if (slotsError) {
        console.error("Error fetching pitching_configuration_slots:", slotsError);
        return res.status(500).json({ error: "Failed to load configuration slots." });
      }

      const slotsByConfig = new Map<number, any[]>();
      for (const s of slots || []) {
        const cid = s.configuration_id as number;
        if (!slotsByConfig.has(cid)) slotsByConfig.set(cid, []);
        slotsByConfig.get(cid)!.push({
          slot_id: s.slot_id,
          player_id: s.player_id,
          role: s.role,
          locked: s.locked,
          order_index: s.order_index,
        });
      }

      const result = configs.map((c: any) => ({
        id: c.id,
        name: c.name,
        is_default: c.is_default,
        created_by: c.created_by,
        created_at: c.created_at,
        updated_at: c.updated_at,
        slots: slotsByConfig.get(c.id as number) || [],
      }));

      return res.status(200).json(result);
    } catch (err) {
      console.error("Unexpected error in GET /teams/:teamId/pitching/configurations:", err);
      return res.status(500).json({ error: "Failed to load pitching configurations." });
    }
  }
);

interface CreatePitchingConfigRequest {
  name: string;
  is_default?: boolean;
  slots?: {
    slot_id: string;
    player_id: string;
    role: PitcherRole;
    locked?: boolean;
    order_index?: number;
  }[];
}

app.post(
  "/teams/:teamId/pitching/configurations",
  requireAuth,
  async (req: AuthedRequest, res) => {
    const { teamId } = req.params;
    const body = req.body as CreatePitchingConfigRequest;

    const role = await assertTeamRoleOr403(req, res, teamId, COACH_AND_ASSISTANT);
    if (!role) return;

    if (!body.name) {
      return res.status(400).json({ error: "name is required" });
    }

    const userId = req.user!.id;

    try {
      // Insert configuration
      const { data: inserted, error: insertError } = await supabase
        .from("pitching_configurations")
        .insert({
          team_id: teamId,
          name: body.name,
          is_default: !!body.is_default,
          created_by: userId,
        })
        .select("id, is_default")
        .maybeSingle();

      if (insertError || !inserted) {
        console.error("Error inserting pitching_configurations:", insertError);
        return res.status(500).json({ error: "Failed to create configuration." });
      }

      const configId = inserted.id as number;

      // If default, clear existing default for team
      if (inserted.is_default) {
        await supabase
          .from("pitching_configurations")
          .update({ is_default: false })
          .eq("team_id", teamId)
          .neq("id", configId);
      }

      // Insert slots, if any
      if (body.slots && body.slots.length > 0) {
        const slotsPayload = body.slots.map((s, index) => ({
          configuration_id: configId,
          slot_id: s.slot_id,
          player_id: s.player_id,
          role: s.role,
          locked: s.locked ?? true,
          order_index: s.order_index ?? index,
        }));

        const { error: slotsError } = await supabase
          .from("pitching_configuration_slots")
          .insert(slotsPayload);

        if (slotsError) {
          console.error("Error inserting pitching_configuration_slots:", slotsError);
          return res
            .status(500)
            .json({ error: "Configuration created, but failed to insert slots." });
        }
      }

      const loaded = await loadPitchingConfiguration(configId);
      return res.status(201).json(loaded);
    } catch (err) {
      console.error("Unexpected error in POST /teams/:teamId/pitching/configurations:", err);
      return res.status(500).json({ error: "Failed to create pitching configuration." });
    }
  }
);


interface UpdatePitchingConfigRequest {
  name?: string;
  is_default?: boolean;
  slots?: {
    slot_id: string;
    player_id: string;
    role: PitcherRole;
    locked?: boolean;
    order_index?: number;
  }[];
}

app.put(
  "/teams/:teamId/pitching/configurations/:configId",
  requireAuth,
  async (req: AuthedRequest, res) => {
    const { teamId, configId } = req.params;
    const body = req.body as UpdatePitchingConfigRequest;

    const role = await assertTeamRoleOr403(req, res, teamId, COACH_AND_ASSISTANT);
    if (!role) return;

    const idNum = Number(configId);
    if (!Number.isFinite(idNum)) {
      return res.status(400).json({ error: "Invalid configuration id" });
    }

    try {
      const updates: any = { updated_at: new Date().toISOString() };
      if (typeof body.name === "string") updates.name = body.name;
      if (typeof body.is_default === "boolean") updates.is_default = body.is_default;

      if (Object.keys(updates).length > 1) {
        const { error: updateError } = await supabase
          .from("pitching_configurations")
          .update(updates)
          .eq("id", idNum)
          .eq("team_id", teamId);

        if (updateError) {
          console.error("Error updating pitching_configurations:", updateError);
          return res.status(500).json({ error: "Failed to update configuration." });
        }

        if (body.is_default === true) {
          await supabase
            .from("pitching_configurations")
            .update({ is_default: false })
            .eq("team_id", teamId)
            .neq("id", idNum);
        }
      }

      if (body.slots) {
        // Replace existing slots
        const { error: delError } = await supabase
          .from("pitching_configuration_slots")
          .delete()
          .eq("configuration_id", idNum);

        if (delError) {
          console.error("Error deleting old slots:", delError);
          return res.status(500).json({ error: "Failed to replace slots." });
        }

        const slotsPayload = body.slots.map((s, index) => ({
          configuration_id: idNum,
          slot_id: s.slot_id,
          player_id: s.player_id,
          role: s.role,
          locked: s.locked ?? true,
          order_index: s.order_index ?? index,
        }));

        const { error: slotsError } = await supabase
          .from("pitching_configuration_slots")
          .insert(slotsPayload);

        if (slotsError) {
          console.error("Error inserting new slots:", slotsError);
          return res.status(500).json({ error: "Failed to insert new slots." });
        }
      }

      const loaded = await loadPitchingConfiguration(idNum);
      return res.status(200).json(loaded);
    } catch (err) {
      console.error(
        "Unexpected error in PUT /teams/:teamId/pitching/configurations/:configId:",
        err
      );
      return res.status(500).json({ error: "Failed to update pitching configuration." });
    }
  }
);

app.post(
  "/teams/:teamId/pitching/optimize",
  requireAuth,
  async (req: AuthedRequest, res) => {
    const { teamId } = req.params;
    const body = req.body as PitchingOptimizeRequest;

    const role = await assertTeamRoleOr403(req, res, teamId, COACH_AND_ASSISTANT);
    if (!role) return;

    try {
      // 1) Load team to get age_group
      const { data: team, error: teamError } = await supabase
        .from("teams")
        .select("id, age_group")
        .eq("id", teamId)
        .maybeSingle();

      if (teamError) {
        console.error("Error fetching team for pitching optimize:", teamError);
        return res.status(500).json({ error: "Failed to load team." });
      }
      if (!team) {
        return res.status(404).json({ error: "Team not found." });
      }

      const ageGroupLabel: string | null = team.age_group
        ? String(team.age_group)
        : null;

      const tier = pitchingAgeTier(ageGroupLabel);

      // 2) Determine candidate pitcher IDs
      let candidatePlayerIds: string[] = [];

      if (body.player_ids && body.player_ids.length > 0) {
        candidatePlayerIds = Array.from(new Set(body.player_ids));
      } else {
        // fallback: all players on the team; frontend can pre-filter to pitchers if desired
        const { data: teamPlayers, error: teamPlayersError } = await supabase
          .from("team_players")
          .select("player_id")
          .eq("team_id", teamId)
          .eq("is_primary_team", true);

        if (teamPlayersError) {
          console.error(
            "Error fetching team_players for pitching optimize:",
            teamPlayersError
          );
          return res
            .status(500)
            .json({ error: "Failed to load team players." });
        }

        candidatePlayerIds = Array.from(
          new Set((teamPlayers || []).map((tp: any) => tp.player_id as string))
        );
      }

      const excludedSet = new Set<string>(body.excluded_player_ids || []);
      candidatePlayerIds = candidatePlayerIds.filter((id) => !excludedSet.has(id));

      if (candidatePlayerIds.length === 0) {
        const empty: PitchingOptimizeResponse = {
          team_id: teamId,
          age_group_label: ageGroupLabel,
          tier,
          num_starters: null,
          base_configuration_id: body.base_configuration_id ?? null,
          rotation: [],
          bullpen: tier === "PRO" ? [] : null,
          pitchers: [],
        };
        return res.status(200).json(empty);
      }

      // 3) Resolve age_group_id for ratings (if possible)
      let ageGroupId: number | null = null;
      if (ageGroupLabel) {
        const { data: ageRow, error: ageError } = await supabase
          .from("age_groups")
          .select("id, label")
          .eq("label", ageGroupLabel)
          .maybeSingle();

        if (ageError) {
          console.error("Error fetching age_group for pitching optimize:", ageError);
        } else if (ageRow) {
          ageGroupId = ageRow.id as number;
        }
      }

      // 4) Load latest ratings for these players
      let ratingsQuery = supabase
        .from("player_ratings")
        .select(
          "player_id, team_id, age_group_id, overall_score, offense_score, defense_score, pitching_score, breakdown, created_at"
        )
        .eq("team_id", teamId)
        .in("player_id", candidatePlayerIds);

      if (ageGroupId !== null) {
        ratingsQuery = ratingsQuery.eq("age_group_id", ageGroupId);
      }

      const { data: ratingRows, error: ratingsError } = await ratingsQuery;

      if (ratingsError) {
        console.error("Error fetching player_ratings for pitching optimize:", ratingsError);
        return res.status(500).json({ error: "Failed to load player ratings." });
      }

      if (!ratingRows || ratingRows.length === 0) {
        const empty: PitchingOptimizeResponse = {
          team_id: teamId,
          age_group_label: ageGroupLabel,
          tier,
          num_starters: null,
          base_configuration_id: body.base_configuration_id ?? null,
          rotation: [],
          bullpen: tier === "PRO" ? [] : null,
          pitchers: [],
        };
        return res.status(200).json(empty);
      }

      interface RatingRow {
        player_id: string;
        created_at: string | null;
        pitching_score: number | null;
        breakdown: any;
      }

      const latestByPlayer = new Map<string, RatingRow>();
      for (const row of ratingRows as RatingRow[]) {
        const pid = row.player_id;
        const existing = latestByPlayer.get(pid);
        if (!existing) {
          latestByPlayer.set(pid, row);
          continue;
        }
        const prevTs = existing.created_at || "";
        const currTs = row.created_at || "";
        if (currTs > prevTs) {
          latestByPlayer.set(pid, row);
        }
      }

      const pitchingMetrics: PitchingPlayerMetrics[] = [];
      for (const row of latestByPlayer.values()) {
        const metrics = getPitchingMetricsFromRating(row);
        if (metrics) {
          pitchingMetrics.push(metrics);
        }
      }

      if (pitchingMetrics.length === 0) {
        const empty: PitchingOptimizeResponse = {
          team_id: teamId,
          age_group_label: ageGroupLabel,
          tier,
          num_starters: null,
          base_configuration_id: body.base_configuration_id ?? null,
          rotation: [],
          bullpen: tier === "PRO" ? [] : null,
          pitchers: [],
        };
        return res.status(200).json(empty);
      }

      // Ensure metrics are only for candidatePlayerIds (exclude any weird extra rows)
      const candidateSet = new Set(candidatePlayerIds);
      const metricsFiltered = pitchingMetrics.filter((m) =>
        candidateSet.has(m.playerId)
      );

      if (metricsFiltered.length === 0) {
        const empty: PitchingOptimizeResponse = {
          team_id: teamId,
          age_group_label: ageGroupLabel,
          tier,
          num_starters: null,
          base_configuration_id: body.base_configuration_id ?? null,
          rotation: [],
          bullpen: tier === "PRO" ? [] : null,
          pitchers: [],
        };
        return res.status(200).json(empty);
      }

      // 5) Load base configuration & build lock maps
      const baseConfigId = body.base_configuration_id ?? null;
      const baseConfig = baseConfigId
        ? await loadPitchingConfiguration(baseConfigId)
        : null;

      const lockedRotationFromConfig: Record<string, string> = {};
      const lockedBullpenFromConfig: Record<string, string> = {};

      if (baseConfig) {
        for (const slot of baseConfig.slots) {
          if (!slot.locked) continue;
          const slotId = slot.slot_id.toUpperCase();
          if (slotId === "ACE" || slotId.startsWith("SP")) {
            lockedRotationFromConfig[slotId] = slot.player_id;
          } else if (slotId.startsWith("RP") || slotId === "CLOSER") {
            lockedBullpenFromConfig[slotId] = slot.player_id;
          }
        }
      }

      // Merge per-call overrides
      const lockedRotation: Record<string, string> = { ...lockedRotationFromConfig };
      if (body.locked_rotation) {
        for (const [slotId, playerId] of Object.entries(body.locked_rotation)) {
          lockedRotation[slotId.toUpperCase()] = playerId;
        }
      }

      const lockedBullpen: Record<string, string> = { ...lockedBullpenFromConfig };
      if (body.locked_bullpen) {
        for (const [slotId, playerId] of Object.entries(body.locked_bullpen)) {
          lockedBullpen[slotId.toUpperCase()] = playerId;
        }
      }

      // 6) Branch by tier
      if (tier !== "PRO") {
        // YOUTH / LITTLE: single ranked list by BPOP PITCHER RATING
        const sorted = [...metricsFiltered].sort(
          (a, b) => b.bpopPitcherRating - a.bpopPitcherRating
        );

        const rotation: PitchingRotationSlotResult[] = sorted.map((m, index) => ({
          slot_id: `P${index + 1}`,
          player_id: m.playerId,
          locked: false,
          bpop_pitcher_rating: m.bpopPitcherRating,
          pitch_score: m.pitchScore,
          pitch_speed_score: m.pitchSpeedScore,
          pitch_acc_score: m.pitchAccScore,
          add_pitches: m.addPitches,
          add_pitch_acc_score: m.addPitchAccScore,
          strikeout_chance: m.strikeoutChance,
        }));

        const response: PitchingOptimizeResponse = {
          team_id: teamId,
          age_group_label: ageGroupLabel,
          tier,
          num_starters: null,
          base_configuration_id: baseConfigId,
          rotation,
          bullpen: null,
          pitchers: metricsFiltered,
        };

        return res.status(200).json(response);
      }

      // PRO tier: full rotation + bullpen
      const numStartersRequested = body.num_starters && body.num_starters > 0
        ? body.num_starters
        : 5;

      // Build rotation slot IDs: ACE, SP2, SP3,...
      const rotationSlotIds: string[] = [];
      if (numStartersRequested > 0) rotationSlotIds.push("ACE");
      for (let i = 2; i <= numStartersRequested; i++) {
        rotationSlotIds.push(`SP${i}`);
      }

      const available = new Map<string, PitchingPlayerMetrics>();
      for (const m of metricsFiltered) {
        if (!excludedSet.has(m.playerId)) {
          available.set(m.playerId, m);
        }
      }

      const rotationResults = new Map<string, PitchingRotationSlotResult>();

      // First, assign locked rotation players
      for (const slotId of rotationSlotIds) {
        const lockedPlayerId = lockedRotation[slotId];
        if (!lockedPlayerId) continue;
        const metrics = available.get(lockedPlayerId);
        if (!metrics) continue; // excluded or not found

        rotationResults.set(slotId, {
          slot_id: slotId,
          player_id: lockedPlayerId,
          locked: true,
          bpop_pitcher_rating: metrics.bpopPitcherRating,
          pitch_score: metrics.pitchScore,
          pitch_speed_score: metrics.pitchSpeedScore,
          pitch_acc_score: metrics.pitchAccScore,
          add_pitches: metrics.addPitches,
          add_pitch_acc_score: metrics.addPitchAccScore,
          strikeout_chance: metrics.strikeoutChance,
        });

        available.delete(lockedPlayerId);
      }

      // Then fill remaining rotation slots by BPOP PITCHER RATING
      for (const slotId of rotationSlotIds) {
        if (rotationResults.has(slotId)) continue;

        let best: PitchingPlayerMetrics | null = null;
        let bestScore = -Infinity;
        for (const metrics of available.values()) {
          if (metrics.bpopPitcherRating > bestScore) {
            bestScore = metrics.bpopPitcherRating;
            best = metrics;
          }
        }

        if (!best) break;

        rotationResults.set(slotId, {
          slot_id: slotId,
          player_id: best.playerId,
          locked: false,
          bpop_pitcher_rating: best.bpopPitcherRating,
          pitch_score: best.pitchScore,
          pitch_speed_score: best.pitchSpeedScore,
          pitch_acc_score: best.pitchAccScore,
          add_pitches: best.addPitches,
          add_pitch_acc_score: best.addPitchAccScore,
          strikeout_chance: best.strikeoutChance,
        });

        available.delete(best.playerId);
      }

      // Bullpen: RP1..RPn + CLOSER
      const bullpenResults: PitchingBullpenSlotResult[] = [];

      // 1) Closer
      const lockedCloserId = lockedBullpen["CLOSER"];
      if (lockedCloserId) {
        const metrics = available.get(lockedCloserId);
        if (metrics) {
          bullpenResults.push({
            slot_id: "CLOSER",
            player_id: lockedCloserId,
            locked: true,
            role: "closer",
            score: computeCloserScore(metrics),
            bpop_pitcher_rating: metrics.bpopPitcherRating,
            pitch_score: metrics.pitchScore,
            pitch_speed_score: metrics.pitchSpeedScore,
            pitch_acc_score: metrics.pitchAccScore,
            add_pitches: metrics.addPitches,
            add_pitch_acc_score: metrics.addPitchAccScore,
            strikeout_chance: metrics.strikeoutChance,
          });
          available.delete(lockedCloserId);
        }
      } else {
        // Choose best closer by closer score
        let best: PitchingPlayerMetrics | null = null;
        let bestScore = -Infinity;
        for (const m of available.values()) {
          const score = computeCloserScore(m);
          if (score > bestScore) {
            bestScore = score;
            best = m;
          }
        }

        if (best) {
          bullpenResults.push({
            slot_id: "CLOSER",
            player_id: best.playerId,
            locked: false,
            role: "closer",
            score: bestScore,
            bpop_pitcher_rating: best.bpopPitcherRating,
            pitch_score: best.pitchScore,
            pitch_speed_score: best.pitchSpeedScore,
            pitch_acc_score: best.pitchAccScore,
            add_pitches: best.addPitches,
            add_pitch_acc_score: best.addPitchAccScore,
            strikeout_chance: best.strikeoutChance,
          });
          available.delete(best.playerId);
        }
      }

      // 2) Relief pitchers: RP1..RPn
      const remaining = Array.from(available.values());

      // Assign RP1 & RP2 via strong relief score first
      remaining.sort(
        (a, b) => computeReliefScoreStrong(b) - computeReliefScoreStrong(a)
      );

      let rpIndex = 1;

      const assignRpSlot = (slotId: string, metrics: PitchingPlayerMetrics, locked: boolean) => {
        const scoreBase =
          rpIndex <= 2
            ? computeReliefScoreStrong(metrics)
            : computeReliefScoreBalanced(metrics);

        bullpenResults.push({
          slot_id: slotId,
          player_id: metrics.playerId,
          locked,
          role: "relief",
          score: scoreBase,
          bpop_pitcher_rating: metrics.bpopPitcherRating,
          pitch_score: metrics.pitchScore,
          pitch_speed_score: metrics.pitchSpeedScore,
          pitch_acc_score: metrics.pitchAccScore,
          add_pitches: metrics.addPitches,
          add_pitch_acc_score: metrics.addPitchAccScore,
          strikeout_chance: metrics.strikeoutChance,
        });
      };

      // First handle any locked RP slots (RP1, RP2, RP3,...)
      const availableMap = new Map<string, PitchingPlayerMetrics>();
      for (const m of remaining) {
        availableMap.set(m.playerId, m);
      }

      // Collect all RP slot IDs that might be locked
      const rpLockedEntries = Object.entries(lockedBullpen).filter(([slotId]) =>
        slotId.startsWith("RP")
      );
      rpLockedEntries.sort((a, b) => {
        const ai = parseInt(a[0].substring(2) || "0", 10);
        const bi = parseInt(b[0].substring(2) || "0", 10);
        return ai - bi;
      });

      for (const [slotId, playerId] of rpLockedEntries) {
        const metrics = availableMap.get(playerId);
        if (!metrics) continue;
        rpIndex = parseInt(slotId.substring(2) || "1", 10) || rpIndex;
        assignRpSlot(slotId, metrics, true);
        availableMap.delete(playerId);
      }

      // Now fill remaining RP slots with remaining pitchers
      const remainingRps = Array.from(availableMap.values());

      // Re-sort by strong score, assign sequential RP slots
      remainingRps.sort(
        (a, b) => computeReliefScoreStrong(b) - computeReliefScoreStrong(a)
      );

      for (const m of remainingRps) {
        const slotId = `RP${rpIndex}`;
        assignRpSlot(slotId, m, false);
        rpIndex++;
      }

      // Build rotation array in slot order
      const rotationArray: PitchingRotationSlotResult[] = rotationSlotIds
        .map((slotId) => rotationResults.get(slotId))
        .filter((x): x is PitchingRotationSlotResult => !!x);

      const response: PitchingOptimizeResponse = {
        team_id: teamId,
        age_group_label: ageGroupLabel,
        tier,
        num_starters: rotationSlotIds.length,
        base_configuration_id: baseConfigId,
        rotation: rotationArray,
        bullpen: bullpenResults,
        pitchers: metricsFiltered,
      };

      return res.status(200).json(response);
    } catch (err) {
      console.error("Unexpected error in POST /teams/:teamId/pitching/optimize:", err);
      return res.status(500).json({ error: "Failed to optimize pitching." });
    }
  }
);



app.listen(port, () => {
  console.log(`BPOP backend listening on port ${port}`);
});
