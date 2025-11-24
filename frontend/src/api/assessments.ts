// src/api/assessments.ts
import api from "./client";

// Shared eval types

export type EvalMode = "official" | "practice" | "tryout";
export type EvalSessionMode = "single" | "multi_station";

// Values for a single (player, metric) pair stored in session_data.values
export interface SessionValue {
  value_numeric: number | null;
  value_text: string | null;
}

// Shape of eval_sessions.session_data in the backend
export interface EvalSessionData {
  // The players in this session (supplied by FE or auto-populated by BE)
  player_ids?: string[];

  // values[player_id][metric_id] = { value_numeric, value_text }
  values?: {
    [playerId: string]: {
      [metricId: number]: SessionValue;
    };
  };

  // Optional: which metrics have been fully completed
  completed_metric_ids?: number[];

  // Copied from the session creation payload
  evaluation_type?: string | null;
  session_mode?: EvalSessionMode;

  // Future expansion
  [key: string]: any;
}

// Eval session row returned from /eval-sessions
export interface EvalSession {
  id: string;
  team_id: string | null;
  template_id: number;
  mode: EvalMode;
  status?: string;
  session_mode: EvalSessionMode | null;
  evaluation_type?: string | null;
  session_data?: EvalSessionData;
  started_at?: string;
  created_at?: string;
  updated_at?: string;
  finalized_at?: string | null;
  // Any other columns are fine – they will just be present on this object
  [key: string]: any;
}

interface StartSessionPayload {
  team_id: string;
  template_id: number;
  evaluation_type: string;
  mode: EvalMode;
  session_mode: EvalSessionMode;
  player_ids?: string[];
}

// POST /eval-sessions
export async function startAssessmentSession(
  payload: StartSessionPayload
): Promise<EvalSession> {
  const res = await api.post("/eval-sessions", payload);
  // Backend returns a single eval_sessions row as an object
  return res.data as EvalSession;
}

// GET /eval-sessions/:id
export async function getAssessmentSession(id: string): Promise<EvalSession> {
  const res = await api.get(`/eval-sessions/${id}`);
  return res.data as EvalSession;
}

export interface UpdateSessionPayload {
  session_data?: EvalSessionData;
  status?: string;
}

// PATCH /eval-sessions/:id
export async function updateAssessmentSession(
  id: string,
  payload: UpdateSessionPayload
): Promise<EvalSession> {
  const res = await api.patch(`/eval-sessions/${id}`, payload);
  return res.data as EvalSession;
}

// ---- Template + metrics (will be used by the session page) ----

export interface AssessmentTemplate {
  id: number;
  name: string;
  description?: string | null;
  age_group_id: number;
  category: string | null;
  is_active: boolean;
}

export interface AssessmentMetric {
  id: number;
  template_id: number;
  metric_key: string;
  label: string;
  unit: string | null;
  sort_order: number | null;
}

export async function getTemplateWithMetrics(
  templateId: number
): Promise<{ template: AssessmentTemplate; metrics: AssessmentMetric[] }> {
  const res = await api.get(`/assessment-templates/${templateId}`);
  return res.data;
}

// ---- Player assessments (used when finalizing a session) ----

export interface AssessmentValueInput {
  metric_id: number;
  value_numeric?: number | null;
  value_text?: string | null;
}

export interface CreateAssessmentPayload {
  player_id: string;
  team_id: string | null;
  template_id: number;
  kind: EvalMode; // 'official' | 'practice'
  values: AssessmentValueInput[];
}

export interface AssessmentCreationResult {
  assessment_id: number;
  ratings_inserted?: boolean;
  medals_potential?: any[];
  medals_awarded?: any[];
  team_trophies_potential?: any[];
  team_trophies_awarded?: any[];
  [key: string]: any;
}

export async function createAssessment(
  payload: CreateAssessmentPayload
): Promise<AssessmentCreationResult> {
  const res = await api.post("/assessments", payload);
  return res.data as AssessmentCreationResult;
}
