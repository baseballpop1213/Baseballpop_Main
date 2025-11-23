// src/api/assessments.ts
import api from "./client";

export type EvalMode = "official" | "practice";

export interface EvalSession {
  id: string;
  team_id: string | null;
  template_id: number;
  mode: EvalMode;
  status: string;
  created_at: string;
  created_by: string;
  session_data: any;
}

export interface CreateEvalSessionPayload {
  team_id: string | null;
  template_id: number;
  mode: EvalMode;
  // player_ids optional for now; backend tolerates undefined
  player_ids?: string[];
}

/**
 * Creates a new eval session via POST /eval-sessions
 */
export async function createEvalSession(
  payload: CreateEvalSessionPayload
): Promise<EvalSession> {
  const res = await api.post("/eval-sessions", payload);
  return res.data;
}

/**
 * Loads a single eval session by id via GET /eval-sessions/:id
 */
export async function getEvalSessionById(
  sessionId: string
): Promise<EvalSession> {
  const res = await api.get(`/eval-sessions/${sessionId}`);
  return res.data;
}
