// evalProgress.ts
import { Response } from "express";
import { supabase } from "./supabaseClient";
import { AuthedRequest } from "./middleware/auth";

interface EvalSessionData {
  player_ids?: string[];
  // values[player_id][metric_id] = { value_numeric, value_text }
  values?: {
    [playerId: string]: {
      [metricId: string]: {
        value_numeric: number | null;
        value_text: string | null;
      };
    };
  };
  completed_metric_ids?: number[];
  // allow future expansion
  [key: string]: any;
}

/**
 * POST /eval-sessions
 * Body:
 * {
 *   "team_id": "<uuid | null>",
 *   "template_id": <number>,
 *   "mode": "official" | "practice" | "tryout" | ...,
 *   "player_ids": ["<uuid>", ...]
 * }
 */
export async function createEvalSession(req: AuthedRequest, res: Response) {
  try {
    const {
      team_id,
      template_id,
      mode,
      player_ids,
      evaluation_type,
      session_mode,
    } = req.body;


    if (!template_id) {
      return res.status(400).json({ error: "template_id is required" });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const sessionData = {
      player_ids,
      values: {},
      completed_metric_ids: [],
      evaluation_type: evaluation_type || null,
      session_mode: session_mode || "single", // "single" | "multi_station"
    };


    const { data, error } = await supabase
      .from("eval_sessions")
      .insert({
        team_id,
        template_id,
        mode,
        created_by: userId,
        session_data: sessionData,
      })
      .select("*")
      .single();

    if (error) {
      console.error("Error creating eval session:", error);
      return res.status(400).json({ error: error.message });
    }

    return res.status(201).json(data);
  } catch (err) {
    console.error("Unhandled error in createEvalSession:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * GET /eval-sessions/:id
 */
export async function getEvalSession(req: AuthedRequest, res: Response) {
  try {
    const sessionId = req.params.id;
    if (!sessionId) {
      return res.status(400).json({ error: "Session id is required" });
    }

    const { data, error } = await supabase
      .from("eval_sessions")
      .select("*")
      .eq("id", sessionId)
      .single();

    if (error) {
      console.error("Error fetching eval session:", error);
      return res.status(404).json({ error: error.message });
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error("Unhandled error in getEvalSession:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * PATCH /eval-sessions/:id
 * Body:
 * {
 *   "session_data": { ... },   // full replacement of session_data
 *   "status": "in_progress" | "finalized" | "cancelled" | ...
 * }
 */
export async function updateEvalSession(req: AuthedRequest, res: Response) {
  try {
    const sessionId = req.params.id;
    if (!sessionId) {
      return res.status(400).json({ error: "Session id is required" });
    }

    const { session_data, status } = req.body ?? {};

    if (typeof session_data === "undefined" && typeof status === "undefined") {
      return res.status(400).json({ error: "Nothing to update" });
    }

    const update: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (typeof session_data !== "undefined") {
      update.session_data = session_data;
    }
    if (typeof status !== "undefined") {
      update.status = status;
      if (status === "finalized") {
        update.finalized_at = new Date().toISOString();
      }
    }

    const { data, error } = await supabase
      .from("eval_sessions")
      .update(update)
      .eq("id", sessionId)
      .select("*")
      .single();

    if (error) {
      console.error("Error updating eval session:", error);
      return res.status(400).json({ error: error.message });
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error("Unhandled error in updateEvalSession:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
