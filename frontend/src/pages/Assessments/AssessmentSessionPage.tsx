// src/pages/Assessments/AssessmentSessionPage.tsx
import { useEffect, useMemo, useState, Fragment, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import {
  getAssessmentSession,
  getTemplateWithMetrics,
  updateAssessmentSession,
  createAssessment,
  type EvalSession,
  type EvalSessionData,
  type AssessmentTemplate,
  type AssessmentMetric,
  type EvalMode,
} from "../../api/assessments";
import { getMetricMeta } from "../../config/metricMeta";
import api from "../../api/client";

interface TeamPlayerRow {
  player_id: string;
  status?: string | null;
  jersey_number?: number | null;
  is_primary_team?: boolean | null;
  created_at?: string;
  updated_at?: string;
  profiles?: {
    id: string;
    display_name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
  } | null;
}

interface TryoutPlayerSession {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
}

interface FullSectionConfig {
  key: string;
  label: string;
  template_id: number;
}

interface GridColumn {
  id: string;
  kind: "roster" | "tryout";
  name: string;
  jerseyLabel?: string | null;
}

// --- Hitting matrix helpers -------------------------------------------------

type HittingSwingOption = {
  code: string;
  label: string;
  points: number;
};

// Metric keys that use the per-swing matrix UI
const HITTING_MATRIX_METRIC_KEYS = {
  fastball: "m_10_fastball_quality",       // H10FAST – 10 swings
  youthPitch: "m_10_swing_pitch_matrix",   // H10PITCH – 10 swings (youth)
  youthTee: "m_10_swing_tee_contact_test", // H10TEE – 10 swings (youth tee)
  varSpeed: "m_5_varied_speed_quality",    // H5VAR – 5 swings
  curveball: "m_5_curveball_quality",      // H5CB – 5 swings
} as const;

type HittingMatrixKey = keyof typeof HITTING_MATRIX_METRIC_KEYS;

// How many swings each matrix test should show
const HITTING_SWING_COUNTS: Record<HittingMatrixKey, number> = {
  fastball: 10,
  youthPitch: 10,
  youthTee: 10,
  varSpeed: 5,
  curveball: 5,
};

const HITTING_MATRIX_OPTIONS: Record<HittingMatrixKey, HittingSwingOption[]> = {
  // Older ages – full 0–5 matrix (fastballs, varied speed, curveball)
  fastball: [
    { code: "miss", label: "Miss (0)", points: 0 },
    { code: "foul", label: "Foul / foul tip (1)", points: 1 },
    { code: "weak", label: "Weak infield contact (1)", points: 1 },
    { code: "gb", label: "GB past infielders (2)", points: 2 },
    { code: "hgb", label: "Hard ground ball (3)", points: 3 },
    { code: "fly", label: "Fly ball (3)", points: 3 },
    { code: "gap", label: "Hard gap / line drive (4)", points: 4 },
    { code: "hr", label: "No-doubt home run (5)", points: 5 },
  ],

  // Youth pitch matrix – simple 0/1/2 scoring
  youthPitch: [
    { code: "miss", label: "Miss (0)", points: 0 },
    { code: "foul", label: "Foul tip (1)", points: 1 },
    { code: "contact", label: "Contact / ball in play (2)", points: 2 },
  ],

  // Youth tee matrix – simple 0/1/2 scoring
  youthTee: [
    { code: "miss", label: "Miss (0)", points: 0 },
    { code: "foul", label: "Foul / mishit (1)", points: 1 },
    { code: "contact", label: "Good contact (2)", points: 2 },
  ],

  // 5-pitch varied speed – same rubric as fastball matrix
  varSpeed: [
    { code: "miss", label: "Miss (0)", points: 0 },
    { code: "foul", label: "Foul / foul tip (1)", points: 1 },
    { code: "weak", label: "Weak infield contact (1)", points: 1 },
    { code: "gb", label: "GB past infielders (2)", points: 2 },
    { code: "hgb", label: "Hard ground ball (3)", points: 3 },
    { code: "fly", label: "Fly ball (3)", points: 3 },
    { code: "gap", label: "Hard gap / line drive (4)", points: 4 },
    { code: "hr", label: "No-doubt home run (5)", points: 5 },
  ],

  // 5-pitch curveball – same rubric as fastball matrix
  curveball: [
    { code: "miss", label: "Miss (0)", points: 0 },
    { code: "foul", label: "Foul / foul tip (1)", points: 1 },
    { code: "weak", label: "Weak infield contact (1)", points: 1 },
    { code: "gb", label: "GB past infielders (2)", points: 2 },
    { code: "hgb", label: "Hard ground ball (3)", points: 3 },
    { code: "fly", label: "Fly ball (3)", points: 3 },
    { code: "gap", label: "Hard gap / line drive (4)", points: 4 },
    { code: "hr", label: "No-doubt home run (5)", points: 5 },
  ],
};

// --- Pitching command matrix helpers ---------------------------------------

// Pitch count per pitching command metric
const PITCH_MATRIX_CONFIG: Record<string, { pitchCount: number }> = {
  // 10U–11U: 10 pitches @ 50 ft
  m_10_throw_test_50ft: { pitchCount: 10 },

  // 12U+: 20 pitches @ 60'6"
  m_20_throw_test_60ft: { pitchCount: 20 },

  // Additional 5‑pitch matrices (HS / College / Pro)
  tpitch5ap1: { pitchCount: 5 },
  tpitch5ap2: { pitchCount: 5 },
  tpitch5ap3: { pitchCount: 5 },
  tpitch5ap4: { pitchCount: 5 },
  tpitch5ap5: { pitchCount: 5 },
};

const ADDITIONAL_PITCH_METRIC_KEYS = new Set<string>([
  "tpitch5ap1",
  "tpitch5ap2",
  "tpitch5ap3",
  "tpitch5ap4",
  "tpitch5ap5",
]);



// Options for each pitch: same 0/1/3 rubric across command tests
const PITCH_COMMAND_OPTIONS: HittingSwingOption[] = [
  { code: "miss", label: "Miss (0)", points: 0 },
  { code: "target", label: "Hit target (1)", points: 1 },
  { code: "section", label: "Hit called section (3)", points: 3 },
];

const ADDITIONAL_PITCH_TYPE_OPTIONS = [
  { value: "fastball", label: "Fastball" },
  { value: "changeup", label: "Changeup" },
  { value: "curveball", label: "Curveball" },
  { value: "slider", label: "Slider" },
  { value: "cutter", label: "Cutter" },
  { value: "sinker", label: "Sinker" },
  { value: "splitter", label: "Splitter" },
  { value: "knuckleball", label: "Knuckleball" },
  { value: "other", label: "Other / Misc." },
];

// --- Catcher matrix helpers ----------------------------------------------

// Options per pitch for catcher screen tests (C10PCS / C20PCS)
const CATCHER_SCREEN_OPTIONS: HittingSwingOption[] = [
  { code: "miss", label: "Miss / passed ball (0)", points: 0 },
  { code: "block", label: "Block in front (1)", points: 1 },
  { code: "catch", label: "Clean catch / scoop (2)", points: 2 },
];

// Options per throw for Target Throws to 2B (CTTT2B)
const CATCHER_TTT2B_OPTIONS: HittingSwingOption[] = [
  { code: "nocatch", label: "No catch (0)", points: 0 },
  { code: "miss", label: "Missed target (1)", points: 1 },
  { code: "hit", label: "Hit target (3)", points: 3 },
];

// How many pitches/throws each catcher matrix test should show
const CATCHER_MATRIX_CONFIG: Record<
  string,
  { pitchCount: number; kind: "screens" | "ttt2b" }
> = {
  // Catcher screens – 10 or 20 pitches depending on age group
  c10pcs_points: { pitchCount: 10, kind: "screens" },
  c20pcs_points: { pitchCount: 20, kind: "screens" },

  // Target throws to 2B – 5 throws
  cttt2b_points: { pitchCount: 5, kind: "ttt2b" },
};


// Athletic Skills tabs → metric keys that belong to each block
const ATHLETIC_BLOCKS =
  ["speed", "strength", "power", "balance", "mobility"] as const;

type AthleticBlock = (typeof ATHLETIC_BLOCKS)[number];

const ATHLETIC_METRIC_KEYS: Record<AthleticBlock, Set<string>> = {
  speed: new Set<string>(["timed_run_1b", "timed_run_4b"]),
  strength: new Set<string>([
    "apush_60",
    "asit_60",
    "apush_30",
    "asit_30",
    "apull_60",
  ]),
  power: new Set<string>([
    "asp_jump_inches",
    "aspscp_distance_ft",
    "aspsup_distance_ft",
  ]),
  balance: new Set<string>([
    "sls_eyes_open_right",
    "sls_eyes_open_left",
    "sls_eyes_closed_right",
    "sls_eyes_closed_left",
  ]),
  mobility: new Set<string>(["msr_right", "msr_left", "toe_touch", "deep_squat"]),
};

// Helper metrics that should not render as standalone grid rows
const ATHLETIC_HELPER_METRIC_KEYS = new Set<string>([
  "timed_run_1b_distance_ft",
  "timed_run_4b_distance_ft",
]);

// Hitting tab grouping: which metrics belong to "tee" vs "live"
const HITTING_TEE_METRIC_KEYS = new Set<string>([
  "max_bat_speed",
  "max_exit_velo_tee",
  "tee_line_drive_test_10",
  "m_10_swing_tee_contact_test",
]);

const HITTING_LIVE_METRIC_KEYS = new Set<string>([
  "m_10_swing_pitch_matrix",
  "m_10_fastball_quality",
  "m_5_varied_speed_quality",
  "m_5_curveball_quality",
]);

const HITTING_SECTIONS = ["tee", "live"] as const;
type HittingSection = (typeof HITTING_SECTIONS)[number];

// First Base (1B) matrix configuration (10U–Pro)
// These mirror the hitting / pitching matrix tests:
// - C101B: 10 throws to 1B (Miss / Block / Catch)
// - C1BST: 10 scoops (Miss / Block / Catch)
// - FBFly: 3 fly balls (Miss / Catch)
// - FBLD: 3 line drives (Miss / Catch)

const FIRSTBASE_MATRIX_METRIC_KEYS = {
  catching: "c101b_catching_test",
  scoops: "c1bst_scoops_test",
  fly: "fbfly_points",
  lineDrive: "fbld_points",
} as const;

type FirstBaseMatrixKey = keyof typeof FIRSTBASE_MATRIX_METRIC_KEYS;

const FIRSTBASE_REP_COUNTS: Record<FirstBaseMatrixKey, number> = {
  catching: 10,
  scoops: 5,
  fly: 3,
  lineDrive: 3,
};

const FIRSTBASE_MATRIX_OPTIONS: Record<
  FirstBaseMatrixKey,
  HittingSwingOption[]
> = {
  catching: [
    { code: "miss", label: "Miss (0)", points: 0 },
    { code: "block", label: "Block (1)", points: 1 },
    { code: "catch", label: "Catch on bag (3)", points: 3 },
  ],
  scoops: [
    { code: "miss", label: "Miss (0)", points: 0 },
    { code: "block", label: "Block (1)", points: 1 },
    { code: "catch", label: "Scoop / catch on bag (3)", points: 3 },
  ],
  fly: [
    { code: "miss", label: "Miss (0)", points: 0 },
    { code: "catch", label: "Catch (2)", points: 2 },
  ],
  lineDrive: [
    { code: "miss", label: "Miss (0)", points: 0 },
    { code: "catch", label: "Catch (2)", points: 2 },
  ],
};

// Outfield matrix configuration (10U–Pro)
type OutfieldMatrixKind = "fly_matrix" | "throw_test";

const OUTFIELD_MATRIX_CONFIG: Record<
  string,
  { repCount: number; kind: OutfieldMatrixKind }
> = {
  c20x20m_points: { repCount: 10, kind: "fly_matrix" },
  c30x30m_points: { repCount: 10, kind: "fly_matrix" },
  throw_80ft_target: { repCount: 5, kind: "throw_test" },
  throw_100ft_target: { repCount: 5, kind: "throw_test" },
  throw_120ft_target: { repCount: 5, kind: "throw_test" },
};

const OUTFIELD_FLY_OPTIONS: HittingSwingOption[] = [
  { code: "miss", label: "Miss (0)", points: 0 },
  { code: "catch", label: "Catch (2)", points: 2 },
];

const OUTFIELD_THROW_OPTIONS: HittingSwingOption[] = [
  { code: "short_gt_10", label: ">10 ft short (0)", points: 0 },
  {
    code: "short_lt_10_miss",
    label: "<10 ft short – misses target (1)",
    points: 1,
  },
  {
    code: "short_lt_10_bounce",
    label: "<10 ft short – bounces into target (2)",
    points: 2,
  },
  {
    code: "at_or_past_miss",
    label: "At/past target – misses (3)",
    points: 3,
  },
  { code: "hit_target", label: "Hits target (4)", points: 4 },
];


// Infield (2B / SS / 3B) – fly balls & line drives: 3 reps, 0/2 scoring
const INFIELD_CATCH_MATRIX_KEYS = {
  fly2b: "infield_fly_2b",
  flySs: "infield_fly_ss",
  fly3b: "infield_fly_3b",
  ld2b: "infield_ld_2b",
  ldSs: "infield_ld_ss",
  ld3b: "infield_ld_3b",
} as const;

type InfieldCatchMatrixKey = keyof typeof INFIELD_CATCH_MATRIX_KEYS;

const INFIELD_CATCH_REP_COUNTS: Record<InfieldCatchMatrixKey, number> = {
  fly2b: 3,
  flySs: 3,
  fly3b: 3,
  ld2b: 3,
  ldSs: 3,
  ld3b: 3,
};

const INFIELD_CATCH_MATRIX_OPTIONS: Record<
  InfieldCatchMatrixKey,
  HittingSwingOption[]
> = {
  fly2b: [
    { code: "miss", label: "Miss (0)", points: 0 },
    { code: "catch", label: "Catch (2)", points: 2 },
  ],
  flySs: [
    { code: "miss", label: "Miss (0)", points: 0 },
    { code: "catch", label: "Catch (2)", points: 2 },
  ],
  fly3b: [
    { code: "miss", label: "Miss (0)", points: 0 },
    { code: "catch", label: "Catch (2)", points: 2 },
  ],
  ld2b: [
    { code: "miss", label: "Miss (0)", points: 0 },
    { code: "catch", label: "Catch (2)", points: 2 },
  ],
  ldSs: [
    { code: "miss", label: "Miss (0)", points: 0 },
    { code: "catch", label: "Catch (2)", points: 2 },
  ],
  ld3b: [
    { code: "miss", label: "Miss (0)", points: 0 },
    { code: "catch", label: "Catch (2)", points: 2 },
  ],
};


function parseMatrixValueText(
  raw: unknown,
  expectedCount: number
): { swings: string[]; pitchType: string | null; format: "array" | "object" } {
  const max = Math.max(1, expectedCount);
  const swings = new Array<string>(max).fill("");
  let pitchType: string | null = null;
  let format: "array" | "object" = "array";

  if (typeof raw === "string" && raw.trim() !== "") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (let i = 0; i < Math.min(parsed.length, max); i++) {
          swings[i] = String(parsed[i] ?? "");
        }
      } else if (parsed && typeof parsed === "object") {
        format = "object";
        const asAny = parsed as any;
        if (Array.isArray(asAny.swings)) {
          for (let i = 0; i < Math.min(asAny.swings.length, max); i++) {
            swings[i] = String(asAny.swings[i] ?? "");
          }
        }

        if (
          typeof asAny.pitchType === "string" &&
          asAny.pitchType.trim() !== ""
        ) {
          pitchType = asAny.pitchType;
        }
      }
    } catch {
      // ignore parse errors; leave defaults
    }
  }

  return { swings, pitchType, format };
}

function computeMatrixTotal(
  swings: string[],
  options: { code: string; points: number }[]
): number {
  const pointsMap = new Map<string, number>();
  options.forEach((opt) => pointsMap.set(opt.code, opt.points));

  return swings.reduce((sum, code) => {
    if (!code) return sum;
    return sum + (pointsMap.get(code) ?? 0);
  }, 0);
}


function formatPlayerName(profile?: TeamPlayerRow["profiles"] | null): string {
  if (!profile) return "Unknown player";

  if (profile.display_name) return profile.display_name;

  const parts = [profile.first_name, profile.last_name].filter(Boolean);
  if (parts.length > 0) return parts.join(" ");

  return profile.email || "Unknown player";
}

export default function AssessmentSessionPage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId;

  const [session, setSession] = useState<EvalSession | null>(null);
  const [sessionData, setSessionData] = useState<EvalSessionData | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);

  const [players, setPlayers] = useState<TeamPlayerRow[]>([]);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [playersError, setPlayersError] = useState<string | null>(null);

  const [template, setTemplate] = useState<AssessmentTemplate | null>(null);
  const [metrics, setMetrics] = useState<AssessmentMetric[]>([]);
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [templateCache, setTemplateCache] = useState<
    Record<number, { template: AssessmentTemplate; metrics: AssessmentMetric[] }>
  >({});
  const [activeFullSection, setActiveFullSection] = useState<string | null>(
    null
  );

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const [finalizing, setFinalizing] = useState(false);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);
  const [finalizeSuccess, setFinalizeSuccess] = useState<string | null>(null);

  // Load the eval session itself
  useEffect(() => {
    if (!sessionId) {
      setSessionError("Missing session id in URL.");
      setLoadingSession(false);
      return;
    }

    const id = sessionId;

    let cancelled = false;

    async function loadSession() {
      setLoadingSession(true);
      setSessionError(null);

      try {
        const data = await getAssessmentSession(id);
        if (!cancelled) {
          setSession(data);
          const sd: EvalSessionData =
            (data as any).session_data ?? {
              player_ids: [],
              values: {},
              completed_metric_ids: [],
              evaluation_type: data.evaluation_type ?? null,
              session_mode: data.session_mode ?? "single",
            };
          setSessionData(sd);
        }
      } catch (err: any) {
        if (!cancelled) {
          setSessionError(
            err?.response?.data?.error ||
              err?.response?.data?.message ||
              err?.message ||
              "Failed to load assessment session"
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingSession(false);
        }
      }
    }

    loadSession();

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // Load team roster once we know which team this session is for
  useEffect(() => {
    if (!session?.team_id) return;

    const teamId = session.team_id;
    let cancelled = false;

    async function loadPlayers() {
      setLoadingPlayers(true);
      setPlayersError(null);

      try {
        const res = await api.get(`/teams/${teamId}/players`);
        if (!cancelled) {
          setPlayers(res.data as TeamPlayerRow[]);
        }
      } catch (err: any) {
        if (!cancelled) {
          setPlayersError(
            err?.response?.data?.error ||
              err?.response?.data?.message ||
              err?.message ||
              "Failed to load team roster"
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingPlayers(false);
        }
      }
    }

    loadPlayers();

    return () => {
      cancelled = true;
    };
  }, [session?.team_id]);

  const isFinalized = session?.status === "finalized";
  const isTryoutSession =
    session?.mode === "tryout" || (sessionData as any)?.tryout_mode === true;

  const [quickTryoutFirstName, setQuickTryoutFirstName] = useState("");
  const [quickTryoutLastName, setQuickTryoutLastName] = useState("");
  const [quickTryoutEmail, setQuickTryoutEmail] = useState("");
  const [quickTryoutPhone, setQuickTryoutPhone] = useState("");
  const [quickTryoutError, setQuickTryoutError] = useState<string | null>(null);
  const [addingTryout, setAddingTryout] = useState(false);

  // Tryout players stored on the session_data
  const tryoutPlayers: TryoutPlayerSession[] = useMemo(() => {
    const raw = (sessionData as any)?.tryout_players;
    if (Array.isArray(raw)) {
      return raw as TryoutPlayerSession[];
    }
    return [];
  }, [sessionData]);

  // Which roster player IDs are explicitly marked as part of this session
  const participantIds = useMemo(() => {
    const ids = sessionData?.player_ids;

    if (Array.isArray(ids)) {
      if (isTryoutSession) {
        // For tryout sessions, take the array literally (empty means no roster players)
        return new Set<string>(ids as string[]);
      }

      if (ids.length > 0) {
        return new Set<string>(ids as string[]);
      }
    }

    // Non-tryout + no explicit player_ids → treat "everyone on roster" as in-session
    return null;
  }, [sessionData?.player_ids, isTryoutSession]);

  // Columns for the metric grid: roster players (in session) + tryout players
  const gridColumns = useMemo<GridColumn[]>(() => {
    let rosterIds: string[] = [];

    if (players.length) {
      if (participantIds) {
        rosterIds = players
          .filter((p) => participantIds.has(p.player_id))
          .map((p) => p.player_id);
      } else if (!isTryoutSession) {
        rosterIds = players.map((p) => p.player_id);
      } else {
        rosterIds = [];
      }
    }

    const rosterColumns: GridColumn[] = rosterIds.map((id) => {
      const row = players.find((p) => p.player_id === id);
      const profile = row?.profiles;
      const name = formatPlayerName(profile);
      const jersey =
        row?.jersey_number != null ? `#${row.jersey_number}` : "—";
      return {
        id,
        kind: "roster",
        name,
        jerseyLabel: jersey,
      };
    });

    const tryoutColumns: GridColumn[] = tryoutPlayers.map((tp) => {
      const baseName = `${tp.first_name ?? ""} ${tp.last_name ?? ""}`.trim();
      const name = baseName || tp.email || "Tryout player";
      return {
        id: tp.id,
        kind: "tryout",
        name,
        jerseyLabel: "—",
      };
    });

    return [...rosterColumns, ...tryoutColumns];
  }, [players, participantIds, tryoutPlayers, isTryoutSession]);

  const effectiveSessionMode =
    (session?.session_mode as string | null) ??
    (sessionData as any)?.session_mode ??
    "single";

  const sessionEvalType =
    session?.evaluation_type ?? (sessionData as any)?.evaluation_type ?? null;

  const fullSections: FullSectionConfig[] = useMemo(() => {
    if (sessionEvalType !== "full") return [];

    const raw = (sessionData as any)?.full_sections;
    if (!Array.isArray(raw)) return [];

    return raw
      .map((item) => {
        const templateId = Number((item as any).template_id);
        if (!templateId || Number.isNaN(templateId)) return null;

        const key = (item as any).key as string | undefined;
        const label = ((item as any).label as string | undefined) || key;

        if (!key) return null;

        return {
          key,
          label: label || key,
          template_id: templateId,
        } as FullSectionConfig;
      })
      .filter((item): item is FullSectionConfig => Boolean(item));
  }, [sessionEvalType, sessionData]);

  useEffect(() => {
    if (sessionEvalType !== "full") {
      setActiveFullSection(null);
      return;
    }

    const preferred = (sessionData as any)?.active_full_section as
      | string
      | undefined;
    const fallback = fullSections[0]?.key ?? null;

    setActiveFullSection((prev) => preferred || prev || fallback);
  }, [sessionEvalType, sessionData, fullSections]);

  const activeFullSectionConfig = useMemo(() => {
    if (sessionEvalType !== "full") return null;

    const activeKey =
      activeFullSection || (sessionData as any)?.active_full_section || null;

    if (activeKey) {
      const found = fullSections.find((s) => s.key === activeKey);
      if (found) return found;
    }

    return fullSections[0] ?? null;
  }, [sessionEvalType, activeFullSection, sessionData, fullSections]);

  const effectiveEvalType =
    sessionEvalType === "full"
      ? activeFullSectionConfig?.key || null
      : sessionEvalType;

  const activeTemplateId =
    sessionEvalType === "full"
      ? activeFullSectionConfig?.template_id ?? session?.template_id
      : session?.template_id;

  // Load template + metrics for the active section
  useEffect(() => {
    const templateId = activeTemplateId;
    if (templateId == null) return;
    const resolvedTemplateId: number = templateId;

    const cached = templateCache[resolvedTemplateId];
    if (cached) {
      setTemplate(cached.template);
      setMetrics(cached.metrics);
      return;
    }

    let cancelled = false;

    async function loadTemplate() {
      setLoadingTemplate(true);
      setTemplateError(null);

      try {
        const data = await getTemplateWithMetrics(resolvedTemplateId);
        if (!cancelled) {
          setTemplate(data.template);
          setMetrics(data.metrics || []);
          setTemplateCache((prev) => ({
            ...prev,
            [resolvedTemplateId]: {
              template: data.template,
              metrics: data.metrics || [],
            },
          }));
        }
      } catch (err: any) {
        if (!cancelled) {
          setTemplateError(
            err?.response?.data?.error ||
              err?.response?.data?.message ||
              err?.message ||
              "Failed to load assessment template"
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingTemplate(false);
        }
      }
    }

    loadTemplate();

    return () => {
      cancelled = true;
    };
  }, [activeTemplateId, templateCache]);

  // Prefetch the other templates in a full assessment so we can show per-section
  // progress and switch tabs instantly.
  useEffect(() => {
    if (sessionEvalType !== "full") return;
    if (!fullSections.length) return;

    const missing = fullSections
      .map((s) => s.template_id)
      .filter((id) => id && !templateCache[id]);

    if (!missing.length) return;

    let cancelled = false;

    (async () => {
      for (const templateId of missing) {
        try {
          const data = await getTemplateWithMetrics(templateId);
          if (cancelled) return;

          setTemplateCache((prev) => {
            if (prev[templateId]) return prev;
            return {
              ...prev,
              [templateId]: {
                template: data.template,
                metrics: data.metrics || [],
              },
            };
          });
        } catch (err) {
          if (!cancelled) {
            console.error(
              `Failed to prefetch template ${templateId}:`,
              err
            );
          }
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionEvalType, fullSections, templateCache]);

  // Athletic Skills: which section is active in the grid tabs
  const [activeAthleticBlock, setActiveAthleticBlock] =
    useState<AthleticBlock>(ATHLETIC_BLOCKS[0]);

  // Hitting: Tee vs Live section in the grid tabs
  const [activeHittingSection, setActiveHittingSection] = useState<
    HittingSection
  >("tee");

  // First Base (1B): Catching vs Fielding section
  const [activeFirstBaseSection, setActiveFirstBaseSection] = useState<
    "catching" | "fielding"
  >("catching");

  // Infield: Fielding vs Catching section
  const [activeInfieldSection, setActiveInfieldSection] = useState<
    "fielding" | "catching"
  >("fielding");


  // Key: playerId → array of additional pitch metric_keys (tpitch5ap1–tpitch5ap5)
  // that are currently "turned on" for that player. We still always show any
  // matrices that already have data in sessionData, even if they aren't in this map.
  const [visibleExtraPitchMatrices, setVisibleExtraPitchMatrices] = useState<
    Record<string, string[]>
  >({});

  const visibleExtraPitchMetricKeySet = useMemo(() => {
    const s = new Set<string>();
    Object.values(visibleExtraPitchMatrices).forEach((arr) => {
      arr.forEach((key) => s.add(key));
    });
    return s;
  }, [visibleExtraPitchMatrices]);


  const availableAthleticBlocks = useMemo(() => {
    if (effectiveEvalType !== "athletic") return [] as AthleticBlock[];
    if (!metrics.length) return [] as AthleticBlock[];

    const metricKeys = new Set(
      metrics
        .map((m) => (m as any).metric_key as string | undefined)
        .filter((k): k is string => Boolean(k))
    );

    return ATHLETIC_BLOCKS.filter((block) =>
      Array.from(ATHLETIC_METRIC_KEYS[block]).some(
        (key) =>
          metricKeys.has(key) && !ATHLETIC_HELPER_METRIC_KEYS.has(key)
      )
    );
  }, [effectiveEvalType, metrics]);

  useEffect(() => {
    if (effectiveEvalType !== "athletic") return;
    if (!availableAthleticBlocks.length) return;

    setActiveAthleticBlock((prev) =>
      availableAthleticBlocks.includes(prev)
        ? prev
        : availableAthleticBlocks[0]
    );
  }, [effectiveEvalType, availableAthleticBlocks]);

  const availableHittingSections = useMemo(() => {
    if (effectiveEvalType !== "hitting") return [] as HittingSection[];
    if (!metrics.length) return [] as HittingSection[];

    const hittingMetricKeys = metrics
      .map((m) => (m as any).metric_key as string | undefined)
      .filter((k): k is string => Boolean(k));

    const hasTee = hittingMetricKeys.some((k) =>
      HITTING_TEE_METRIC_KEYS.has(k)
    );
    const hasLive = hittingMetricKeys.some((k) =>
      HITTING_LIVE_METRIC_KEYS.has(k)
    );
    const hasUncategorized = hittingMetricKeys.some(
      (k) =>
        !HITTING_TEE_METRIC_KEYS.has(k) && !HITTING_LIVE_METRIC_KEYS.has(k)
    );

    const sections: HittingSection[] = [];
    if (hasTee || hasUncategorized) sections.push("tee");
    if (hasLive || hasUncategorized) sections.push("live");

    return sections;
  }, [effectiveEvalType, metrics]);

  useEffect(() => {
    if (effectiveEvalType !== "hitting") return;
    if (!availableHittingSections.length) return;

    setActiveHittingSection((prev) =>
      availableHittingSections.includes(prev)
        ? prev
        : availableHittingSections[0]
    );
  }, [effectiveEvalType, availableHittingSections]);


  // Group metrics by logical group (Speed, Strength, Power, Balance, Mobility, etc.)
  const groupedMetrics = useMemo(() => {
    if (!metrics.length) return [];

    type Group = {
      key: string;
      label: string;
      metrics: AssessmentMetric[];
    };

    const map = new Map<string, Group>();

    for (const m of metrics) {
      const metricKey = (m as any).metric_key as string | undefined;
      const meta = metricKey ? getMetricMeta(metricKey) : undefined;
      const rawGroup = (meta?.group || "Other").trim();
      const key = rawGroup || "Other";
      const label = rawGroup || "Other";

      let group = map.get(key);
      if (!group) {
        group = { key, label, metrics: [] };
        map.set(key, group);
      }
      group.metrics.push(m);
    }

    const groups = Array.from(map.values()).sort((a, b) =>
      a.label.localeCompare(b.label)
    );
    return groups;
  }, [metrics]);

  // First Base: does this template actually have Fielding metrics?
  const hasFirstBaseFieldingGroup = useMemo(
    () =>
      groupedMetrics.some((g) => {
        const lower = g.label.toLowerCase();
        return lower.startsWith("first base") && lower.includes("field");
      }),
    [groupedMetrics]
  );

  // Infield: do we have a Fielding group (so tabs make sense)?
  const hasInfieldFieldingGroup = useMemo(
    () =>
      groupedMetrics.some((g) => {
        const lower = g.label.toLowerCase();
        return lower.startsWith("infield") && lower.includes("field");
      }),
    [groupedMetrics]
  );
  
  // For Athletic Skills, Hitting, First Base, and Infield, show only the metrics
  // for the active block/tab, while keeping all other eval types unchanged.
  const visibleGroupedMetrics = useMemo(() => {
    // Clone so we can mutate safely
    let groups = groupedMetrics.map((g) => ({
      ...g,
      metrics: [...g.metrics],
    }));

    // -------------------------------
    // ATHLETIC SKILLS
    // -------------------------------
    if (effectiveEvalType === "athletic") {
      const activeAthleticTab = availableAthleticBlocks.includes(
        activeAthleticBlock
      )
        ? activeAthleticBlock
        : availableAthleticBlocks[0];

      if (!activeAthleticTab) {
        return groups;
      }

      const helperKeysToHide = ATHLETIC_HELPER_METRIC_KEYS;
      const blockKeys = ATHLETIC_METRIC_KEYS[activeAthleticTab];

      groups = groups
        .map((group) => {
          const filtered = group.metrics.filter((m) => {
            const metricKey = (m as any).metric_key as string | undefined;
            if (metricKey && helperKeysToHide.has(metricKey)) {
              return false;
            }

            // Show only metrics for the active Athletic section
            return metricKey ? blockKeys.has(metricKey) : false;
          });

          return {
            ...group,
            metrics: filtered,
          };
        })
        .filter((g) => g.metrics.length > 0);

      return groups;
    }

    // -------------------------------
    // HITTING – Tee vs Live tabs
    // -------------------------------
    if (effectiveEvalType === "hitting") {
      const activeHittingTab = availableHittingSections.includes(
        activeHittingSection
      )
        ? activeHittingSection
        : availableHittingSections[0];

      if (!activeHittingTab) {
        return groups;
      }

      groups = groups
        .map((group) => {
          const isHittingGroupLocal =
            group.label.toLowerCase().startsWith("hitting");
          if (!isHittingGroupLocal) return group;

          const filtered = group.metrics.filter((m) => {
            const metricKey = (m as any).metric_key as string | undefined;
            if (!metricKey) return true;

            const inTee = HITTING_TEE_METRIC_KEYS.has(metricKey);
            const inLive = HITTING_LIVE_METRIC_KEYS.has(metricKey);

            // If we haven't explicitly categorized the metric, show on both tabs
            if (!inTee && !inLive) {
              return true;
            }

            return activeHittingTab === "tee" ? inTee : inLive;
          });

          return {
            ...group,
            metrics: filtered,
          };
        })
        .filter((g) => g.metrics.length > 0);

      return groups;
    }

    // PITCHING – keep all command metrics so the "Add another pitch type" control
    // can surface optional matrices even before they have values. Visibility for
    // individual extra matrices is handled later in the pitching renderer.
    if (effectiveEvalType === "pitching") {
      return groups;
    }


    // -------------------------------
    // FIRST BASE – Catching vs Fielding tabs
    // -------------------------------
    if (effectiveEvalType === "firstbase" && hasFirstBaseFieldingGroup) {
      const allowedLabels =
        activeFirstBaseSection === "catching"
          ? ["First Base – Catching"]
          : ["First Base – Fielding"];

      const allowedLower = allowedLabels.map((s) => s.toLowerCase());

      groups = groups.filter((g) =>
        allowedLower.includes(g.label.toLowerCase())
      );

      return groups;
    }

    // -------------------------------
    // INFIELD – Fielding vs Catching tabs
    // -------------------------------
    if (effectiveEvalType === "infield" && hasInfieldFieldingGroup) {
      const allowedLabels =
        activeInfieldSection === "fielding"
          ? ["Infield – Fielding"]
          : ["Infield – Catching"];

      const allowedLower = allowedLabels.map((s) => s.toLowerCase());

      groups = groups.filter((g) =>
        allowedLower.includes(g.label.toLowerCase())
      );

      return groups;
    }

    // Any other eval type → show all groups as‑is
    return groups;
  }, [
    groupedMetrics,
    effectiveEvalType,
    activeAthleticBlock,
    availableAthleticBlocks,
    activeHittingSection,
    availableHittingSections,
    activeFirstBaseSection,
    hasFirstBaseFieldingGroup,
    activeInfieldSection,
    hasInfieldFieldingGroup,
  ]);


  const visibleMetricsForProgress = useMemo(() => {
    const all = visibleGroupedMetrics.reduce<AssessmentMetric[]>(
      (acc, group) => {
        acc.push(...group.metrics);
        return acc;
      },
      []
    );

    return all;
  }, [visibleGroupedMetrics, effectiveEvalType]);

  const pitchMetricHasAnyValue = useCallback(
    (metric: AssessmentMetric) => {
      if (!sessionData?.values || !gridColumns.length) return false;

      const metricId = metric.id;
      const values = sessionData.values as any;

      for (const col of gridColumns) {
        const perPlayer = values[col.id] || {};
        const v = perPlayer[metricId];
        const numeric = v?.value_numeric;
        const text = v?.value_text;

        if (
          (numeric !== null &&
            numeric !== undefined &&
            !Number.isNaN(numeric)) ||
          (text !== null &&
            text !== undefined &&
            String(text).trim() !== "")
        ) {
          return true;
        }
      }

      return false;
    },
    [sessionData?.values, gridColumns]
  );

  const computeMetricsCompletion = useCallback(
    (metricList: AssessmentMetric[], evalTypeOverride?: string | null) => {
      const evalType = evalTypeOverride ?? effectiveEvalType;

      let metricsWithAnyValue = 0;
      let totalMetrics = 0;

      for (const m of metricList) {
        const metricKey = (m as any).metric_key as string | undefined;

        // For pitching, ignore hidden, untouched additional pitch matrices so they
        // don’t count against progress.
        if (
          evalType === "pitching" &&
          metricKey &&
          ADDITIONAL_PITCH_METRIC_KEYS.has(metricKey) &&
          !visibleExtraPitchMetricKeySet.has(metricKey) &&
          !pitchMetricHasAnyValue(m)
        ) {
          // Extra pitch matrix that is neither visible for any player nor has
          // any values anywhere → ignore for progress.
          continue;
        }

        totalMetrics += 1;

        if (pitchMetricHasAnyValue(m)) {
          metricsWithAnyValue += 1;
        }
      }

      return { metricsWithAnyValue, totalMetrics };
    },
    [effectiveEvalType, visibleExtraPitchMetricKeySet, pitchMetricHasAnyValue]
  );



  // Overall progress for the active tab
  const metricsCompletion = useMemo(
    () => computeMetricsCompletion(visibleMetricsForProgress),
    [visibleMetricsForProgress, computeMetricsCompletion]
  );

  const fullProgress = useMemo(() => {
    if (sessionEvalType !== "full") return null;
    if (!fullSections.length) return null;

    let totalMetricsWithAnyValue = 0;
    let totalMetrics = 0;

    const perSection = fullSections.map((section) => {
      const cached = templateCache[section.template_id];
      const sectionMetrics =
        cached?.metrics ||
        (section.template_id === activeTemplateId ? metrics : []);

      if (!sectionMetrics || sectionMetrics.length === 0) {
        return {
          ...section,
          metricsWithAnyValue: 0,
          totalMetrics: 0,
        };
      }

      // Use the section key (e.g. "athletic", "hitting", "pitching") so
      // pitching sections still get the "ignore hidden extra pitch" behaviour.
      const { metricsWithAnyValue, totalMetrics: sectionTotal } =
        computeMetricsCompletion(sectionMetrics, section.key);

      totalMetricsWithAnyValue += metricsWithAnyValue;
      totalMetrics += sectionTotal;

      return {
        ...section,
        metricsWithAnyValue,
        totalMetrics: sectionTotal,
      };
    });

    return {
      perSection,
      totals: {
        metricsWithAnyValue: totalMetricsWithAnyValue,
        totalMetrics,
      },
    };
  }, [
    sessionEvalType,
    fullSections,
    templateCache,
    activeTemplateId,
    metrics,
    computeMetricsCompletion,
  ]);


  function handleSelectFullSection(key: string) {
    if (sessionEvalType !== "full") return;
    setSessionData((prev) => {
      if (!prev) return prev;
      return { ...prev, active_full_section: key } as EvalSessionData;
    });
    setActiveFullSection(key);
    setDirty(true);
  }

  // Speed block helpers: base path length + stopwatch for 1B / 4B speed
  const speedMetricKeys = {
    run1b: "timed_run_1b",
    run4b: "timed_run_4b",
    run1bDist: "timed_run_1b_distance_ft",
    run4bDist: "timed_run_4b_distance_ft",
  } as const;

  const speedMetricsByKey = useMemo(() => {
    const map: Record<string, AssessmentMetric | undefined> = {};
    const allowedKeys = Object.values(speedMetricKeys) as string[];

    for (const m of metrics) {
      const metricKey = (m as any).metric_key as string | undefined;
      if (metricKey && allowedKeys.includes(metricKey)) {
        map[metricKey] = m;
      }
    }
    return map;
  }, [metrics]);

  // Balance & Mobility metric keys (adjust to match your DB metric_key values if needed)
  // Balance & Mobility metric keys (adjust to match your DB metric_key values if needed)
  const BALANCE_KEYS = {
    slsEyesOpenRight: "sls_eyes_open_right",
    slsEyesOpenLeft: "sls_eyes_open_left",
    slsEyesClosedRight: "sls_eyes_closed_right",
    slsEyesClosedLeft: "sls_eyes_closed_left",
  } as const;

  const MOBILITY_KEYS = {
    msrRight: "msr_right",
    msrLeft: "msr_left",
  } as const;




  const basePathFeet: number | null =
    (sessionData as any)?.base_path_distance_ft ?? null;

  function handleBasePathChange(raw: string) {
    if (!sessionData) return;

    const trimmed = raw.trim();
    const numeric =
      trimmed === "" ? null : Number.parseFloat(trimmed.replace(",", "."));
    const safe =
      numeric === null || Number.isNaN(numeric) || numeric <= 0 ? null : numeric;

    setSessionData((prev) => {
      const base: EvalSessionData =
        (prev ?? sessionData) as EvalSessionData;
      const next: EvalSessionData = {
        ...base,
        values: { ...(base.values || {}) },
      };

      (next as any).base_path_distance_ft = safe ?? undefined;

      // Also populate the hidden distance metrics so the backend has them
      if (safe && speedMetricsByKey[speedMetricKeys.run1bDist]) {
        const m1 = speedMetricsByKey[speedMetricKeys.run1bDist]!;
        const m4 = speedMetricsByKey[speedMetricKeys.run4bDist];

        for (const col of gridColumns) {
          const pid = col.id;
          const perPlayer = { ...((next.values as any)[pid] || {}) };
          perPlayer[m1.id] = {
            value_numeric: safe,
            value_text: null,
          };
          if (m4) {
            perPlayer[m4.id] = {
              value_numeric: safe * 4,
              value_text: null,
            };
          }
          (next.values as any)[pid] = perPlayer;
        }
      }

      return next;
    });

    setDirty(true);
  }

  const [speedTimerMetricKey, setSpeedTimerMetricKey] = useState<
    (typeof speedMetricKeys)["run1b"] | (typeof speedMetricKeys)["run4b"]
  >(speedMetricKeys.run1b);
  const [speedTimerRunning, setSpeedTimerRunning] = useState(false);
  const [speedTimerMs, setSpeedTimerMs] = useState(0);
  const [strengthTimerRunning, setStrengthTimerRunning] = useState(false);
  const [strengthTimerMs, setStrengthTimerMs] = useState(0);

  const [balanceTimerRunning, setBalanceTimerRunning] = useState(false);
  const [balanceTimerMs, setBalanceTimerMs] = useState(0);

  const [ct2btTimerRunning, setCt2btTimerRunning] = useState(false);
  const [ct2btTimerMs, setCt2btTimerMs] = useState(0);

  const [ifss1btTimerRunning, setIfss1btTimerRunning] = useState(false);
  const [ifss1btTimerMs, setIfss1btTimerMs] = useState(0);
  const [ofgbhtTimerRunning, setOfgbhtTimerRunning] = useState(false);
  const [ofgbhtTimerMs, setOfgbhtTimerMs] = useState(0);

  
  useEffect(() => {
    if (!speedTimerRunning) return;

    const start = performance.now() - speedTimerMs;
    const id = window.setInterval(() => {
      setSpeedTimerMs(performance.now() - start);
    }, 30);

    return () => {
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speedTimerRunning]);

  // Simple stopwatch for Catcher Throw to 2B (CT2BT)
  useEffect(() => {
    if (!ct2btTimerRunning) return;

    const start = performance.now() - ct2btTimerMs;
    const id = window.setInterval(() => {
      setCt2btTimerMs(performance.now() - start);
    }, 30);

    return () => {
      window.clearInterval(id);
    };
  }, [ct2btTimerRunning, ct2btTimerMs]);

  // Simple stopwatch for SS to 1B throw (IFSS1BT)
  useEffect(() => {
    if (!ifss1btTimerRunning) return;

    const start = performance.now() - ifss1btTimerMs;
    const id = window.setInterval(() => {
      setIfss1btTimerMs(performance.now() - start);
    }, 30);

    return () => {
      window.clearInterval(id);
    };
  }, [ifss1btTimerRunning, ifss1btTimerMs]);

  // Simple stopwatch for Outfield Ground Ball → Home Time (OFGBHT)
  useEffect(() => {
    if (!ofgbhtTimerRunning) return;

    const start = performance.now() - ofgbhtTimerMs;
    const id = window.setInterval(() => {
      setOfgbhtTimerMs(performance.now() - start);
    }, 30);

    return () => {
      window.clearInterval(id);
    };
  }, [ofgbhtTimerRunning, ofgbhtTimerMs]);


  
  const strengthDurationMs = useMemo(() => {
    // If this athletic template uses 30-second strength tests (11U and below),
    // we look for the 30s metric keys. Otherwise default to 60 seconds.
    const keys = metrics.map(
      (m) => (m as any).metric_key as string | undefined
    );

    const has30SecondStrength = keys.some(
      (k) => k === "apush_30" || k === "asit_30"
    );

    return has30SecondStrength ? 30000 : 60000;
  }, [metrics]);

  const strengthSecondsRemaining = Math.max(
    0,
    Math.round((strengthDurationMs - strengthTimerMs) / 1000)
  );

  const balanceSecondsRemaining = Math.max(
    0,
    Math.round((30000 - balanceTimerMs) / 1000)
  );
  
  
  // Countdown for Strength block (60s for Pro–12U, 30s for 11U and below)
  useEffect(() => {
    if (!strengthTimerRunning) return;

    const duration = strengthDurationMs;
    const start = performance.now() - strengthTimerMs;
    const id = window.setInterval(() => {
      const elapsed = performance.now() - start;

      if (elapsed >= duration) {
        setStrengthTimerMs(duration);
        setStrengthTimerRunning(false);
        window.clearInterval(id);
        try {
          (window as any).navigator?.vibrate?.(200);
        } catch {
          // ignore if vibration isn't supported
        }
        return;
      }

      setStrengthTimerMs(elapsed);
    }, 50);

    return () => {
      window.clearInterval(id);
    };
  }, [strengthTimerRunning, strengthTimerMs, strengthDurationMs]);

  // 30-second countdown for Balance (SLS) block
  useEffect(() => {
    if (!balanceTimerRunning) return;

    const start = performance.now() - balanceTimerMs;
    const id = window.setInterval(() => {
      const elapsed = performance.now() - start;

      if (elapsed >= 30000) {
        setBalanceTimerMs(30000);
        setBalanceTimerRunning(false);
        window.clearInterval(id);
        try {
          (window as any).navigator?.vibrate?.(200);
        } catch {
          // ignore if vibration isn't supported
        }
        return;
      }

      setBalanceTimerMs(elapsed);
    }, 50);

    return () => {
      window.clearInterval(id);
    };
  }, [balanceTimerRunning, balanceTimerMs]);

  
  const speedTimerSeconds =
    Math.round((speedTimerMs / 1000) * 100) / 100 || 0;
  const ct2btTimerSeconds =
    Math.round((ct2btTimerMs / 1000) * 100) / 100 || 0;
  const ifss1btTimerSeconds =
    Math.round((ifss1btTimerMs / 1000) * 100) / 100 || 0;
  const ofgbhtTimerSeconds =
    Math.round((ofgbhtTimerMs / 1000) * 100) / 100 || 0;

  // CT2BT / CB2BT – used in 9U Throwing and 10U+ Catcher
  const hasCt2btMetric = useMemo(
    () =>
      metrics.some((m) => {
        const key = (m as any).metric_key as string | undefined;
        return key === "ct2bt_seconds" || key === "cb2bt_seconds";
      }),
    [metrics]
  );

  // IFSS1BT – SS to 1B throw timer (used in older Infield + 8U–9U Fielding)
  const hasIfss1btMetric = useMemo(
    () =>
      metrics.some(
        (m) => (m as any).metric_key === "ifss1bt_seconds"
      ),
    [metrics]
  );

  
  function handleSpeedTimerStart() {
    setSpeedTimerMs(0);
    setSpeedTimerRunning(true);
  }

  function handleSpeedTimerReset() {
    setSpeedTimerRunning(false);
    setSpeedTimerMs(0);
  }

  function handleSpeedTimerStopAndFill() {
    setSpeedTimerRunning(false);
    const seconds =
      Math.round((speedTimerMs / 1000) * 100) / 100 || speedTimerSeconds;

    if (!sessionData || !metrics.length || !gridColumns.length) return;

    const targetKey = speedTimerMetricKey;
    const metric = metrics.find(
      (m) => (m as any).metric_key === targetKey
    );
    if (!metric) return;

    const metricId = metric.id;
    const values = (sessionData.values || {}) as any;

    let targetPlayerId: string | null = null;
    for (const col of gridColumns) {
      const pid = col.id;
      const perPlayer = values[pid] || {};
      const v = perPlayer[metricId];
      const numeric = v?.value_numeric;
      const text = v?.value_text;

      if (
        (numeric === null ||
          numeric === undefined ||
          Number.isNaN(numeric)) &&
        (!text || String(text).trim() === "")
      ) {
        targetPlayerId = pid;
        break;
      }
    }

    if (!targetPlayerId && gridColumns.length > 0) {
      targetPlayerId = gridColumns[0].id;
    }

    if (targetPlayerId) {
      // Reuse the same helper that all inputs use
      handleValueChange(metricId, targetPlayerId, seconds.toFixed(2));
    }
  }


  function handleStrengthTimerStart() {
    setStrengthTimerMs(0);
    setStrengthTimerRunning(true);
  }

  function handleStrengthTimerReset() {
    setStrengthTimerRunning(false);
    setStrengthTimerMs(0);
  }

  function handleBalanceTimerStart() {
    setBalanceTimerMs(0);
    setBalanceTimerRunning(true);
  }

  function handleBalanceTimerReset() {
    setBalanceTimerRunning(false);
    setBalanceTimerMs(0);
  }

  function handleCt2btTimerStart() {
    setCt2btTimerMs(0);
    setCt2btTimerRunning(true);
  }

  function handleCt2btTimerReset() {
    setCt2btTimerRunning(false);
    setCt2btTimerMs(0);
  }

  function handleCt2btTimerStopAndFill() {
    setCt2btTimerRunning(false);
    const seconds =
      Math.round((ct2btTimerMs / 1000) * 100) / 100 || ct2btTimerSeconds;

    if (!sessionData || !metrics.length || !gridColumns.length) return;

    // Support both ct2bt_seconds (10U+ Catcher templates)
    // and cb2bt_seconds (9U Throwing template)
    const metric = metrics.find((m) => {
      const key = (m as any).metric_key as string | undefined;
      return key === "ct2bt_seconds" || key === "cb2bt_seconds";
    });
    if (!metric) return;

    const metricId = metric.id;
    const values = (sessionData.values || {}) as any;

    let targetPlayerId: string | null = null;
    for (const col of gridColumns) {
      const pid = col.id;
      const perPlayer = values[pid] || {};
      const v = perPlayer[metricId];
      const numeric = v?.value_numeric;
      const text = v?.value_text;

      if (
        (numeric === null ||
          numeric === undefined ||
          Number.isNaN(numeric)) &&
        (!text || String(text).trim() === "")
      ) {
        targetPlayerId = pid;
        break;
      }
    }

    if (!targetPlayerId && gridColumns.length > 0) {
      targetPlayerId = gridColumns[0].id;
    }

    if (targetPlayerId) {
      handleValueChange(metricId, targetPlayerId, seconds.toFixed(2));
    }
  }

  function handleIfss1btTimerStart() {
    setIfss1btTimerMs(0);
    setIfss1btTimerRunning(true);
  }

  function handleIfss1btTimerReset() {
    setIfss1btTimerRunning(false);
    setIfss1btTimerMs(0);
  }

  function handleIfss1btTimerStopAndFill() {
    setIfss1btTimerRunning(false);
    const seconds =
      Math.round((ifss1btTimerMs / 1000) * 100) / 100 || ifss1btTimerSeconds;

    if (!sessionData || !metrics.length || !gridColumns.length) return;

    const metric = metrics.find(
      (m) => (m as any).metric_key === "ifss1bt_seconds"
    );
    if (!metric) return;

    const metricId = metric.id;
    const values = (sessionData.values || {}) as any;

    let targetPlayerId: string | null = null;
    for (const col of gridColumns) {
      const pid = col.id;
      const perPlayer = values[pid] || {};
      const v = perPlayer[metricId];
      const numeric = v?.value_numeric;
      const text = v?.value_text;

      if (
        (numeric === null ||
          numeric === undefined ||
          Number.isNaN(numeric)) &&
        (!text || String(text).trim() === "")
      ) {
        targetPlayerId = pid;
        break;
      }
    }

    if (!targetPlayerId && gridColumns.length > 0) {
      targetPlayerId = gridColumns[0].id;
    }

    if (targetPlayerId) {
      handleValueChange(metricId, targetPlayerId, seconds.toFixed(2));
    }
  }

  const handleOfgbhtTimerStart = () => {
    setOfgbhtTimerMs(0);
    setOfgbhtTimerRunning(true);
  };

  const handleOfgbhtTimerReset = () => {
    setOfgbhtTimerRunning(false);
    setOfgbhtTimerMs(0);
  };

  const handleOfgbhtTimerStopAndFill = () => {
    setOfgbhtTimerRunning(false);

    const seconds =
      Math.round((ofgbhtTimerMs / 1000) * 100) / 100 || ofgbhtTimerSeconds;
    const rounded = Math.round(seconds * 100) / 100;

    // Find the OFGBHT metric
    const metric = metrics.find(
      (m) => (m as any).metric_key === "ofgbht_seconds"
    );
    if (!metric || gridColumns.length === 0) return;

    if (!sessionData) return;

    const values = (sessionData.values || {}) as any;

    // Fill the first player column that doesn't have a value yet
    for (const col of gridColumns) {
      const playerId = col.id;
      const perPlayer = values[playerId] || {};
      const v = perPlayer[metric.id];

      const hasValue =
        v &&
        (typeof v.value_numeric === "number" ||
          (v.value_text ?? "").toString().trim() !== "");

      if (!hasValue) {
        // metricId first, then playerId
        handleValueChange(metric.id, playerId, rounded.toString());
        return;
      }
    }

    // Fallback: overwrite first column if everything is filled
    const fallbackPlayerId = gridColumns[0]?.id;
    if (fallbackPlayerId && sessionData) {
      handleValueChange(metric.id, fallbackPlayerId, rounded.toString());
    }

  };

  
  // keep your existing handleValueChange(...) function below this

  
  function handleValueChange(
    metricId: number,
    playerId: string,
    raw: string
  ) {
    if (!sessionData || isFinalized) return;

    // Look up the metric so we can special-case deep squat
    const metric = metrics.find((m) => m.id === metricId);
    const metricKey = metric?.metric_key;

    // Special-case: Full Overhead Deep Squat (multi-select → score)
    if (metricKey === "deep_squat") {
      const code = raw as "full" | "arms" | "pelvis" | "ankles";

      setSessionData((prev) => {
        const base: EvalSessionData =
          prev ?? {
            player_ids: sessionData.player_ids ?? [],
            values: {},
            completed_metric_ids: sessionData.completed_metric_ids ?? [],
            evaluation_type: effectiveEvalType,
            session_mode: effectiveSessionMode as any,
          };

        const values = { ...(base.values || {}) } as {
          [playerId: string]: {
            [metricId: number]: { value_numeric: number | null; value_text: string | null };
          };
        };

        const byPlayer = { ...(values[playerId] || {}) };
        const existing = byPlayer[metricId];
        let selected: string[] = [];

        // Restore existing selections from value_text (JSON string)
        if (existing?.value_text && typeof existing.value_text === "string") {
          try {
            const parsed = JSON.parse(existing.value_text);
            if (Array.isArray(parsed)) {
              selected = parsed.filter((c: any) =>
                ["full", "arms", "pelvis", "ankles"].includes(String(c))
              );
            }
          } catch {
            // ignore parse errors
          }
        }

        // Toggle logic
        if (code === "full") {
          if (selected.includes("full")) {
            // unselect full
            selected = [];
          } else {
            // selecting full clears others
            selected = ["full"];
          }
        } else {
          // toggling one of the compensations
          selected = selected.filter((c) => c !== "full");
          if (selected.includes(code)) {
            selected = selected.filter((c) => c !== code);
          } else {
            selected = [...selected, code];
          }
        }

        // Compute score based on selection
        let score: number | null = null;
        if (selected.includes("full")) {
          selected = ["full"];
          score = 9;
        } else {
          const count = selected.length;
          if (count === 0) {
            score = null;
          } else if (count === 1) {
            score = 6;
          } else if (count === 2) {
            score = 3;
          } else {
            score = 0;
          }
        }

        byPlayer[metricId] = {
          value_numeric: score,
          value_text:
            selected.length > 0 ? JSON.stringify(selected) : null,
        };

        return {
          ...base,
          values: {
            ...values,
            [playerId]: byPlayer,
          },
        };
      });

      setDirty(true);
      return;
    }

    // Default path: numeric / simple text values
    const numeric =
      raw === "" || raw === null ? null : Number.parseFloat(raw);
    const safeNumeric =
      numeric !== null && Number.isNaN(numeric) ? null : numeric;

    setSessionData((prev) => {
      const base: EvalSessionData =
        prev ?? {
          player_ids: sessionData.player_ids ?? [],
          values: {},
          completed_metric_ids: sessionData.completed_metric_ids ?? [],
          evaluation_type: effectiveEvalType,
          session_mode: effectiveSessionMode as any,
        };

      const values = { ...(base.values || {}) } as EvalSessionData["values"];
      const byPlayer = { ...(values?.[playerId] || {}) };

      byPlayer[metricId] = {
        value_numeric: safeNumeric,
        value_text: null,
      };

      return {
        ...base,
        values: {
          ...values,
          [playerId]: byPlayer,
        },
      };
    });

    setDirty(true);
  }

  // Helper for select-style metrics that are pure text (e.g. RLC 1B direction)
  function handleTextValueChange(
    metricId: number,
    playerId: string,
    text: string | null
  ) {
    if (!sessionData || isFinalized) return;

    setSessionData((prev) => {
      const base: EvalSessionData =
        prev ?? {
          player_ids: sessionData.player_ids ?? [],
          values: {},
          completed_metric_ids: sessionData.completed_metric_ids ?? [],
          evaluation_type: effectiveEvalType,
          session_mode: effectiveSessionMode as any,
        };

      const values = { ...(base.values || {}) } as EvalSessionData["values"];
      const byPlayer = { ...(values?.[playerId] || {}) };

      byPlayer[metricId] = {
        value_numeric: null,
        value_text: text && text.trim() !== "" ? text : null,
      };

      return {
        ...base,
        values: {
          ...values,
          [playerId]: byPlayer,
        },
      };
    });

    setDirty(true);
  }

  

  // Hitting matrix: per-swing quality tests (H10FAST, H10PITCH, H10TEE, H5VAR, H5CB)
  // Also reused for catcher screens, youth grounders, youth catching matrices, infield fly/LD, etc.
  function handleHittingMatrixSwingChange(
    metricId: number,
    playerId: string,
    swingIndex: number,
    swingCode: string,
    options: { code: string; label: string; points: number }[],
    swingCount: number,
    opts?: { pitchType?: string | null; forceObject?: boolean }
  ) {
    if (!sessionData || isFinalized) return;

    const maxSwings = swingCount > 0 ? swingCount : 10;

    const idx =
      swingIndex < 0
        ? 0
        : swingIndex >= maxSwings
        ? maxSwings - 1
        : swingIndex;

    setSessionData((prev) => {
      const base: EvalSessionData =
        prev ?? {
          player_ids: sessionData.player_ids ?? [],
          values: {},
          completed_metric_ids: sessionData.completed_metric_ids ?? [],
          evaluation_type: effectiveEvalType,
          session_mode: effectiveSessionMode as any,
        };

      // Shallow-clone the values map so we don't mutate state in place
      const values = { ...(base.values || {}) } as any;
      const byPlayer = { ...(values[playerId] || {}) };
      const existing = byPlayer[metricId];

      const parsed = parseMatrixValueText(existing?.value_text, maxSwings);
      const swings: string[] = [...parsed.swings];
      const optsPitchTypeProvided =
        opts && Object.prototype.hasOwnProperty.call(opts, "pitchType");
      const normalizedPitchType = optsPitchTypeProvided
        ? opts?.pitchType && opts.pitchType.trim() !== ""
          ? opts.pitchType.trim()
          : null
        : parsed.pitchType;
      const keepObjectFormat =
        opts?.forceObject || parsed.format === "object" || optsPitchTypeProvided;

      // Update the selected swing
      swings[idx] = swingCode;

      const hasAny = swings.some((code) => code && code.trim() !== "");
      const total = hasAny ? computeMatrixTotal(swings, options) : 0;

      const shouldPersist = hasAny || normalizedPitchType;
      const valueText = shouldPersist
        ? JSON.stringify(
            keepObjectFormat || normalizedPitchType
              ? { swings, pitchType: normalizedPitchType }
              : swings
          )
        : null;

      const nextMetricValue = shouldPersist
        ? {
            value_numeric: hasAny ? total : null,
            value_text: valueText,
          }
        : {
            value_numeric: null,
            value_text: null,
          };

      const nextByPlayer = {
        ...byPlayer,
        [metricId]: nextMetricValue,
      };

      // IMPORTANT: return a *new* sessionData object so React re-renders
      return {
        ...base,
        values: {
          ...values,
          [playerId]: nextByPlayer,
        },
      };
    });

    setDirty(true);
  }

  function handlePitchMatrixTypeChange(
    metricId: number,
    playerId: string,
    pitchCount: number,
    nextType: string
  ) {
    if (!sessionData || isFinalized) return;

    const normalizedType = nextType?.trim() || null;
    const pitchCountSafe = Math.max(1, pitchCount);

    setSessionData((prev) => {
      const base: EvalSessionData =
        prev ?? {
          player_ids: sessionData.player_ids ?? [],
          values: {},
          completed_metric_ids: sessionData.completed_metric_ids ?? [],
          evaluation_type: effectiveEvalType,
          session_mode: effectiveSessionMode as any,
        };

      const values = { ...(base.values || {}) } as any;
      const byPlayer = { ...(values[playerId] || {}) };
      const existing = byPlayer[metricId];

      const parsed = parseMatrixValueText(existing?.value_text, pitchCountSafe);
      const swings = [...parsed.swings];
      const hasAny = swings.some((code) => code && code.trim() !== "");
      const total = hasAny ? computeMatrixTotal(swings, PITCH_COMMAND_OPTIONS) : 0;
      const shouldPersist = hasAny || normalizedType;

      const nextValue = shouldPersist
        ? {
            value_numeric: hasAny ? total : null,
            value_text: JSON.stringify({
              swings,
              pitchType: normalizedType,
            }),
          }
        : { value_numeric: null, value_text: null };

      byPlayer[metricId] = nextValue;
      values[playerId] = byPlayer;

      return {
        ...base,
        values,
      };
    });

    setDirty(true);
  }

  function handleRemoveExtraPitchMatrix(
    metricId: number,
    metricKey: string,
    playerId: string
  ) {
    if (!sessionData || isFinalized) return;

    // Clear this metric only for the selected player
    setSessionData((prev) => {
      if (!prev) return prev;

      const values = { ...(prev.values || {}) } as any;
      const byPlayer = { ...(values[playerId] || {}) };

      if (!byPlayer[metricId]) {
        return prev;
      }

      delete byPlayer[metricId];

      if (Object.keys(byPlayer).length === 0) {
        delete values[playerId];
      } else {
        values[playerId] = byPlayer;
      }

      return {
        ...prev,
        values,
      };
    });

    // Remove this extra pitch matrix from this player's visible extras
    setVisibleExtraPitchMatrices((prev) => {
      const existing = prev[playerId];
      if (!existing) return prev;

      const filtered = existing.filter((key) => key !== metricKey);
      if (filtered.length === existing.length) return prev;

      const next = { ...prev };
      if (filtered.length === 0) {
        delete next[playerId];
      } else {
        next[playerId] = filtered;
      }
      return next;
    });

    setDirty(true);
  }



  
  async function handleAddTryoutPlayerInSession() {
    if (!session || !sessionData) return;
    if (!isTryoutSession || isFinalized) return;

    setQuickTryoutError(null);

    const first = quickTryoutFirstName.trim();
    const last = quickTryoutLastName.trim();
    const email = quickTryoutEmail.trim();
    const phone = quickTryoutPhone.trim();

    if (!email) {
      setQuickTryoutError("Email is required to add a tryout player.");
      return;
    }

    if (!first && !last) {
      setQuickTryoutError("Please enter at least a first or last name.");
      return;
    }

    const newPlayer: TryoutPlayerSession = {
      id:
        (globalThis as any).crypto?.randomUUID?.() ??
        `tryout_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      first_name: first || null,
      last_name: last || null,
      email,
      phone: phone || null,
    };

    const existing =
      Array.isArray((sessionData as any).tryout_players)
        ? ((sessionData as any).tryout_players as TryoutPlayerSession[])
        : [];

    const nextTryoutPlayers = [...existing, newPlayer];

    const nextSessionData: EvalSessionData = {
      ...sessionData,
      tryout_players: nextTryoutPlayers as any,
    };

    setAddingTryout(true);
    try {
      const updated = await updateAssessmentSession(session.id, {
        session_data: nextSessionData,
      });

      const updatedData =
        ((updated as any).session_data as EvalSessionData) ??
        nextSessionData;

      setSession(updated);
      setSessionData(updatedData);

      setQuickTryoutFirstName("");
      setQuickTryoutLastName("");
      setQuickTryoutEmail("");
      setQuickTryoutPhone("");
      setQuickTryoutError(null);
    } catch (err: any) {
      setQuickTryoutError(
        err?.response?.data?.error ||
          err?.response?.data?.message ||
          err?.message ||
          "Failed to add tryout player."
      );
    } finally {
      setAddingTryout(false);
    }
  }

  async function handleSave() {
    if (!session || !sessionData) return;
    if (isFinalized) return;

    setSaving(true);
    setSaveError(null);
    setSaveSuccess(null);
    setFinalizeError(null);
    setFinalizeSuccess(null);

    try {
      let playerIdsToSave: string[] | undefined = sessionData.player_ids;

      if (!Array.isArray(playerIdsToSave)) {
        if (isTryoutSession) {
          // Keep as empty array for pure external tryouts
          playerIdsToSave = [];
        } else {
          const rosterIds = gridColumns
            .filter((c) => c.kind === "roster")
            .map((c) => c.id);
          playerIdsToSave = rosterIds;
        }
      }

      const payload: { session_data: EvalSessionData } = {
        session_data: {
          ...sessionData,
          player_ids: playerIdsToSave,
        },
      };

      const updated = await updateAssessmentSession(session.id, payload);
      setSession(updated);
      setSessionData(
        ((updated as any).session_data as EvalSessionData) ??
          payload.session_data
      );
      setDirty(false);
      setSaveSuccess("Progress saved");
      setTimeout(() => setSaveSuccess(null), 2000);
    } catch (err: any) {
      setSaveError(
        err?.response?.data?.error ||
          err?.response?.data?.message ||
          err?.message ||
          "Failed to save session"
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleFinalize() {
    if (!session || !sessionData) return;

    setFinalizing(true);
    setFinalizeError(null);
    setFinalizeSuccess(null);
    setSaveError(null);
    setSaveSuccess(null);

    try {
      const rosterColumns = gridColumns.filter((c) => c.kind === "roster");
      const rosterIds = rosterColumns.map((c) => c.id);

      if (!rosterIds.length && !isTryoutSession) {
        setFinalizeError(
          "No players available for this session yet. Add players to the team roster before finalizing."
        );
        return;
      }

      const sectionsToFinalize =
        sessionEvalType === "full" && fullSections.length
          ? fullSections
          : [
              {
                key: effectiveEvalType || "assessment",
                label: template?.name || "Assessment",
                template_id: session?.template_id ?? activeTemplateId,
              },
            ];

      const metricsByTemplate = new Map<number, AssessmentMetric[]>();

      for (const section of sectionsToFinalize) {
        const cached = templateCache[section.template_id];
        const list = cached?.metrics ||
          (section.template_id === activeTemplateId ? metrics : []);
        if (list && list.length) {
          metricsByTemplate.set(section.template_id, list);
        }
      }

      if (!metricsByTemplate.size) {
        setFinalizeError(
          "No metrics are defined for this template. Cannot finalize."
        );
        return;
      }

      const missingTemplates = sectionsToFinalize.filter(
        (section) => !(metricsByTemplate.get(section.template_id)?.length)
      );

      if (missingTemplates.length) {
        setFinalizeError(
          "Load each assessment section before finalizing so we know which metrics to save."
        );
        return;
      }

      const valuesByPlayer = sessionData.values || {};
      const assessmentsByPlayer: Record<string, number> = {};
      const assessmentsBySection: Record<string, Record<string, number>> =
        {};
      let createdCount = 0;

      // Only create player_assessment records for roster players
      for (const section of sectionsToFinalize) {
        const sectionMetrics = metricsByTemplate.get(section.template_id) || [];
        if (!sectionMetrics.length) continue;

        for (const playerId of rosterIds) {
          const perMetricValues = (valuesByPlayer as any)[playerId] || {};
          const valueArray = sectionMetrics
            .map((m) => {
              const v = perMetricValues[m.id];
              const numeric = v?.value_numeric ?? null;
              const text = v?.value_text ?? null;

              if (
                numeric === null &&
                (text === null || String(text).trim() === "")
              ) {
                return null;
              }

              return {
                metric_id: m.id,
                value_numeric: numeric,
                value_text: text,
              };
            })
            .filter((v) => v !== null) as {
            metric_id: number;
            value_numeric: number | null;
            value_text: string | null;
          }[];

          if (!valueArray.length) {
            continue;
          }

          const result = await createAssessment({
            player_id: playerId,
            team_id: session.team_id ?? null,
            template_id: section.template_id,
            kind: session.mode as EvalMode,
            values: valueArray,
          });

          if (result && typeof (result as any).assessment_id === "number") {
            assessmentsByPlayer[playerId] = (result as any).assessment_id;
            const sectionKey = section.key || String(section.template_id);
            assessmentsBySection[sectionKey] =
              assessmentsBySection[sectionKey] || {};
            assessmentsBySection[sectionKey][playerId] = (
              result as any
            ).assessment_id;
            createdCount += 1;
          }
        }
      }

      if (!createdCount && !isTryoutSession) {
        setFinalizeError(
          "No assessment records were created. Make sure you've entered at least one score for at least one player."
        );
        return;
      }

      const allMetricIds: number[] = [];
      metricsByTemplate.forEach((list) => {
        list.forEach((m) => allMetricIds.push(m.id));
      });

      const finalizedSessionData: EvalSessionData = {
        ...sessionData,
        player_ids: rosterIds,
        completed_metric_ids: Array.from(new Set(allMetricIds)),
        assessments_by_player: {
          ...(sessionData as any).assessments_by_player,
          ...assessmentsByPlayer,
        },
        assessments_by_section:
          sessionEvalType === "full"
            ? {
                ...(sessionData as any).assessments_by_section,
                ...assessmentsBySection,
              }
            : (sessionData as any).assessments_by_section,
      };

      const updated = await updateAssessmentSession(session.id, {
        session_data: finalizedSessionData,
        status: "finalized",
      });

      setSession(updated);
      setSessionData(
        ((updated as any).session_data as EvalSessionData) ??
          finalizedSessionData
      );
      setDirty(false);
      setFinalizeSuccess(
        `Finalized ${createdCount} player assessment${
          createdCount === 1 ? "" : "s"
        }.`
      );
    } catch (err: any) {
      setFinalizeError(
        err?.response?.data?.error ||
          err?.response?.data?.message ||
          err?.message ||
          "Failed to finalize session"
      );
    } finally {
      setFinalizing(false);
    }
  }

  if (loadingSession) {
    return <p className="text-sm text-slate-300">Loading session…</p>;
  }

  if (sessionError) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-red-400">{sessionError}</p>
        <Link
          to="/assessments/start"
          className="text-xs text-emerald-400 underline"
        >
          Back to start
        </Link>
      </div>
    );
  }

  if (!session || !sessionData) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-slate-300">Session not found.</p>
        <Link
          to="/assessments/start"
          className="text-xs text-emerald-400 underline"
        >
          Back to start
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Session header */}
      <section>
        <h2 className="text-xl font-semibold">Assessment session</h2>
        <p className="text-sm text-slate-300">
          Session ID:{" "}
          <span className="font-mono text-xs bg-slate-900/80 px-1 py-0.5 rounded">
            {session.id}
          </span>
        </p>
        <p className="text-xs text-slate-400 mt-1">
          Mode: {session.mode} · Session mode: {effectiveSessionMode}
        </p>
        {sessionEvalType === "full" && activeFullSectionConfig && (
          <p className="text-xs text-slate-400 mt-1">
            Full assessment · Current section: {activeFullSectionConfig.label}
          </p>
        )}
        {effectiveEvalType === "athletic" && (
          <p className="text-xs text-slate-400 mt-1">
            Athletic skills battery: speed, agility, strength, power, balance,
            and mobility.
          </p>
        )}
        {template && (
          <p className="text-xs text-slate-400 mt-1">
            Template: {template.name}
          </p>
        )}
        {session.status && (
          <p className="text-xs text-slate-400 mt-1">
            Status:{" "}
            <span
              className={
                session.status === "finalized"
                  ? "text-emerald-300"
                  : "text-amber-300"
              }
            >
              {session.status}
            </span>
          </p>
        )}
      </section>

      {sessionEvalType === "full" && fullSections.length > 0 && (
        <section className="rounded-xl bg-slate-900/70 border border-slate-700 p-3 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-slate-100">
                Full assessment overview
              </h3>
              <p className="text-[11px] text-slate-400 max-w-3xl">
                Use the tabs below to move between sections. Each tab contains
                the same metrics you would see when running that individual
                assessment from the dashboard.
              </p>
            </div>

            {fullProgress && fullProgress.totals.totalMetrics > 0 && (
              <div className="min-w-[14rem] w-full md:w-auto">
                <div className="flex items-center justify-between text-[11px] text-slate-300 mb-1">
                  <span>Overall progress</span>
                  <span>
                    {fullProgress.totals.metricsWithAnyValue}/
                    {fullProgress.totals.totalMetrics} metrics started
                  </span>
                </div>
                <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-emerald-400"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.round(
                          (fullProgress.totals.metricsWithAnyValue /
                            fullProgress.totals.totalMetrics) *
                            100
                        )
                      )}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {(fullProgress?.perSection ||
              fullSections.map((s) => ({
                ...s,
                metricsWithAnyValue: 0,
                totalMetrics: 0,
              }))
            ).map((section) => {
              const isActive = effectiveEvalType === section.key;
              const percent = section.totalMetrics
                ? Math.round(
                    (section.metricsWithAnyValue / section.totalMetrics) * 100
                  )
                : 0;

              return (
                <button
                  key={section.key}
                  type="button"
                  onClick={() => handleSelectFullSection(section.key)}
                  className={`min-w-[10rem] rounded-lg border px-3 py-2 text-left text-slate-100 transition ${
                    isActive
                      ? "border-emerald-400 bg-emerald-500/10"
                      : "border-slate-700 bg-slate-800/70 hover:bg-slate-800"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold">
                      {section.label}
                    </span>
                    <span className="text-[10px] text-slate-300">
                      {percent}%
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] text-slate-400">
                    {section.totalMetrics
                      ? `${section.metricsWithAnyValue}/${section.totalMetrics} metrics started`
                      : "No metrics loaded yet"}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Players in this session (roster) */}
      <section className="rounded-xl bg-slate-900/70 border border-slate-700 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-100">
            Players in this session
          </h3>
          {players.length > 0 && (
            <span className="text-[11px] text-slate-400">
              {players.length} players on roster
            </span>
          )}
        </div>

        {loadingPlayers && (
          <p className="text-xs text-slate-400">Loading roster…</p>
        )}

        {playersError && (
          <p className="text-xs text-red-400">{playersError}</p>
        )}

        {!loadingPlayers && !playersError && players.length === 0 && (
          <p className="text-xs text-slate-400">
            No players found on this team yet.
          </p>
        )}

        {!loadingPlayers && !playersError && players.length > 0 && (
          <ul className="divide-y divide-slate-800">
            {players.map((row) => {
              const inSession = participantIds
                ? participantIds.has(row.player_id)
                : !isTryoutSession; // non-tryout default: everyone in; tryout default: nobody

              const name = formatPlayerName(row.profiles);

              return (
                <li
                  key={row.player_id}
                  className="flex items-center justify-between py-1.5"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-6 text-xs text-slate-300 text-right">
                      {row.jersey_number ?? "—"}
                    </span>
                    <div>
                      <div className="text-xs font-medium text-slate-100">
                        {name}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {row.status || "active"}
                      </div>
                    </div>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] ${
                      inSession
                        ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/40"
                        : "bg-slate-800 text-slate-300 border border-slate-600"
                    }`}
                  >
                    {inSession ? "In this session" : "Not in session"}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Tryout players section */}
      {isTryoutSession && (
        <section className="rounded-xl bg-slate-900/70 border border-slate-700 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-100">
              Tryout players for this session
            </h3>
            {tryoutPlayers.length > 0 && (
              <span className="text-[11px] text-slate-400">
                {tryoutPlayers.length} tryout player
                {tryoutPlayers.length === 1 ? "" : "s"}
              </span>
            )}
          </div>

          {!isFinalized && (
            <div className="mt-1 space-y-2">
              <p className="text-[11px] text-slate-400">
                Late arrival? Quickly add them to this tryout. Email is required
                so we can share results and app access.
              </p>
              {quickTryoutError && (
                <p className="text-[11px] text-red-400">{quickTryoutError}</p>
              )}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-2 items-end text-xs">
                <div>
                  <label className="block text-[11px] text-slate-300 mb-0.5">
                    First name
                  </label>
                  <input
                    type="text"
                    className="w-full rounded-md bg-slate-950 border border-slate-700 px-2 py-1 text-[11px]"
                    value={quickTryoutFirstName}
                    onChange={(e) => setQuickTryoutFirstName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-300 mb-0.5">
                    Last name
                  </label>
                  <input
                    type="text"
                    className="w-full rounded-md bg-slate-950 border border-slate-700 px-2 py-1 text-[11px]"
                    value={quickTryoutLastName}
                    onChange={(e) => setQuickTryoutLastName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-300 mb-0.5">
                    Email<span className="text-red-400">*</span>
                  </label>
                  <input
                    type="email"
                    className="w-full rounded-md bg-slate-950 border border-slate-700 px-2 py-1 text-[11px]"
                    value={quickTryoutEmail}
                    onChange={(e) => setQuickTryoutEmail(e.target.value)}
                    placeholder="player@example.com"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-300 mb-0.5">
                    Phone
                  </label>
                  <input
                    type="tel"
                    className="w-full rounded-md bg-slate-950 border border-slate-700 px-2 py-1 text-[11px]"
                    value={quickTryoutPhone}
                    onChange={(e) => setQuickTryoutPhone(e.target.value)}
                    placeholder="optional"
                  />
                </div>
                <div className="flex md:justify-end">
                  <button
                    type="button"
                    onClick={handleAddTryoutPlayerInSession}
                    disabled={addingTryout}
                    className="w-full md:w-auto inline-flex items-center justify-center px-3 py-1.5 rounded-md bg-emerald-500 text-slate-900 text-xs font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {addingTryout ? "Adding…" : "Add to tryout"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {tryoutPlayers.length === 0 ? (
            <p className="text-xs text-slate-400">
              No tryout players have been added to this session yet.
            </p>
          ) : (
            <ul className="divide-y divide-slate-800 text-xs mt-2">
              {tryoutPlayers.map((tp) => {
                const name = `${tp.first_name ?? ""} ${
                  tp.last_name ?? ""
                }`.trim();
                return (
                  <li
                    key={tp.id}
                    className="flex items-center justify-between py-1.5"
                  >
                    <div className="flex flex-col">
                      <span className="font-medium text-slate-100">
                        {name || tp.email || "Tryout player"}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {tp.email}
                        {tp.phone && ` · ${tp.phone}`}
                      </span>
                    </div>
                    <span className="text-[10px] uppercase tracking-wide text-amber-300">
                      Tryout
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

 
      {/* Metrics × players grid */}
      <section className="rounded-xl bg-slate-900/70 border border-slate-700 p-3 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-100">
            Enter assessment results
          </h3>
          <div className="flex items-center gap-3 text-[11px]">
            {metricsCompletion.totalMetrics > 0 && (
              <span className="text-slate-400">
                {metricsCompletion.metricsWithAnyValue}/
                {metricsCompletion.totalMetrics} metrics started
              </span>
            )}
            {dirty && !isFinalized && (
              <span className="text-amber-300">Unsaved changes</span>
            )}
            {saveSuccess && (
              <span className="text-emerald-300">{saveSuccess}</span>
            )}
            {finalizeSuccess && (
              <span className="text-emerald-300">{finalizeSuccess}</span>
            )}
          </div>
        </div>

        {effectiveEvalType === "athletic" &&
          availableAthleticBlocks.length > 0 && (
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
            <span className="text-slate-400">Section:</span>
            {availableAthleticBlocks.map((block) => {
              const labelMap: Record<
                (typeof block),
                string
              > = {
                speed: "Speed",
                strength: "Strength",
                power: "Power",
                balance: "Balance",
                mobility: "Mobility",
              };
              const isActive = activeAthleticBlock === block;
              return (
                <button
                  key={block}
                  type="button"
                  onClick={() => setActiveAthleticBlock(block)}
                  className={[
                    "px-2 py-0.5 rounded-full border text-[11px]",
                    isActive
                      ? "border-emerald-400/80 bg-emerald-500/10 text-emerald-200"
                      : "border-slate-600 bg-slate-800/60 text-slate-200 hover:bg-slate-700",
                  ].join(" ")}
                >
                  {labelMap[block]}
                </button>
              );
            })}
          </div>
        )}

        {effectiveEvalType === "hitting" &&
          availableHittingSections.length > 0 && (
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
            <span className="text-slate-400">Section:</span>
            {availableHittingSections.map((section) => {
              const isActive = activeHittingSection === section;
              const label = section === "tee" ? "Tee Work" : "Live Pitching";
              return (
                <button
                  key={section}
                  type="button"
                  onClick={() => setActiveHittingSection(section)}
                  className={[
                    "px-2 py-0.5 rounded-full border text-[11px]",
                    isActive
                      ? "border-emerald-400 bg-emerald-500/10 text-emerald-200"
                      : "border-slate-600 bg-slate-900 text-slate-200 hover:bg-slate-800",
                  ].join(" ")}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}

        {effectiveEvalType === "firstbase" && hasFirstBaseFieldingGroup && (
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
            <span className="text-slate-400">Section:</span>
            {(["catching", "fielding"] as const).map((section) => {
              const isActive = activeFirstBaseSection === section;
              const label = section === "catching" ? "Catching" : "Fielding";
              return (
                <button
                  key={section}
                  type="button"
                  onClick={() => setActiveFirstBaseSection(section)}
                  className={[
                    "px-2 py-0.5 rounded-full border text-[11px]",
                    isActive
                      ? "border-emerald-400 bg-emerald-500/10 text-emerald-200"
                      : "border-slate-600 bg-slate-900 text-slate-200 hover:bg-slate-800",
                  ].join(" ")}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}

        {effectiveEvalType === "infield" && hasInfieldFieldingGroup && (
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
            <span className="text-slate-400">Section:</span>
            {(["fielding", "catching"] as const).map((section) => {
              const isActive = activeInfieldSection === section;
              const label = section === "fielding" ? "Fielding" : "Catching";
              return (
                <button
                  key={section}
                  type="button"
                  onClick={() => setActiveInfieldSection(section)}
                  className={[
                    "px-2 py-0.5 rounded-full border text-[11px]",
                    isActive
                      ? "border-emerald-400 bg-emerald-500/10 text-emerald-200"
                      : "border-slate-600 bg-slate-900 text-slate-200 hover:bg-slate-800",
                  ].join(" ")}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}

        
        {effectiveEvalType === "athletic" &&
          activeAthleticBlock === "speed" && (
           
            <div className="mt-2 space-y-3 text-[11px]">
              <div className="space-y-1">
                <div className="font-semibold text-slate-200">
                  Base length
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={40}
                    max={90}
                    step={1}
                    className="w-24 rounded-md bg-slate-950 border border-slate-700 px-2 py-1 text-[11px] text-slate-100"
                    value={basePathFeet ?? ""}
                    onChange={(e) => handleBasePathChange(e.target.value)}
                    disabled={isFinalized}
                    placeholder="ft"
                  />
                  <span className="text-slate-400">
                    feet (home → 1B)
                  </span>
                </div>
                <p className="text-[10px] text-slate-500">
                  This drives the 1B and 4B base-path distance metrics
                  behind the scenes. 4B distance is always 4× this value.
                </p>
              </div>

              <div className="space-y-1">
                <div className="font-semibold text-slate-200">
                  Stopwatch
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] text-slate-400 mr-1">
                    Target:
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setSpeedTimerMetricKey(speedMetricKeys.run1b)
                    }
                    className={[
                      "px-2 py-0.5 rounded-full border text-[10px]",
                      speedTimerMetricKey === speedMetricKeys.run1b
                        ? "border-emerald-400/80 bg-emerald-500/10 text-emerald-200"
                        : "border-slate-600 bg-slate-800/60 text-slate-200 hover:bg-slate-700",
                    ].join(" ")}
                  >
                    1B Speed
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setSpeedTimerMetricKey(speedMetricKeys.run4b)
                    }
                    className={[
                      "px-2 py-0.5 rounded-full border text-[10px]",
                      speedTimerMetricKey === speedMetricKeys.run4b
                        ? "border-emerald-400/80 bg-emerald-500/10 text-emerald-200"
                        : "border-slate-600 bg-slate-800/60 text-slate-200 hover:bg-slate-700",
                    ].join(" ")}
                  >
                    4B Speed
                  </button>
                </div>
                <div className="mt-1 flex items-center gap-3">
                  <div className="text-lg font-mono tabular-nums text-slate-50">
                    {speedTimerSeconds.toFixed(2)}s
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {!speedTimerRunning ? (
                      <button
                        type="button"
                        onClick={handleSpeedTimerStart}
                        className="px-2 py-0.5 rounded-md border border-emerald-500/70 bg-emerald-500/10 text-[11px] text-emerald-200"
                        disabled={isFinalized}
                      >
                        Start
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleSpeedTimerStopAndFill}
                        className="px-2 py-0.5 rounded-md border border-amber-400/70 bg-amber-500/10 text-[11px] text-amber-200"
                        disabled={isFinalized}
                      >
                        Stop &amp; fill next
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleSpeedTimerReset}
                      className="px-2 py-0.5 rounded-md border border-slate-600 bg-slate-800/70 text-[11px] text-slate-200"
                    >
                      Reset
                    </button>
                  </div>
                </div>
                <p className="text-[10px] text-slate-500">
                  When you stop, the time is written into the next empty
                  cell for the selected sprint metric.
                </p>
              </div>
            </div>
          )}

        {effectiveEvalType === "athletic" &&
          activeAthleticBlock === "strength" && (
            <div className="mt-2 space-y-1 text-[11px]">
              <div className="font-semibold text-slate-200">
                {strengthDurationMs / 1000}-second strength timer
              </div>
              <div className="flex items-center gap-3">
                <div className="text-lg font-mono tabular-nums text-slate-50">
                  {strengthSecondsRemaining}s
                </div>
                <div className="flex flex-wrap gap-1">
                  {!strengthTimerRunning ? (
                    <button
                      type="button"
                      onClick={handleStrengthTimerStart}
                      className="px-2 py-0.5 rounded-md border border-emerald-500/70 bg-emerald-500/10 text-[11px] text-emerald-200"
                      disabled={isFinalized}
                    >
                      Start {strengthDurationMs / 1000}s
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setStrengthTimerRunning(false)}
                      className="px-2 py-0.5 rounded-md border border-amber-400/70 bg-amber-500/10 text-[11px] text-amber-200"
                    >
                      Stop
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleStrengthTimerReset}
                    className="px-2 py-0.5 rounded-md border border-slate-600 bg-slate-800/70 text-[11px] text-slate-200"
                  >
                    Reset
                  </button>
                </div>
              </div>
              <p className="text-[10px] text-slate-500">
                Use this when running timed push-up, sit-up, or pull-up tests.
                The duration matches the current age-group template
                (30 seconds for 11U and younger, 60 seconds for older players).
              </p>
            </div>
          )}


        {effectiveEvalType === "athletic" &&
          activeAthleticBlock === "balance" && (
            <div className="mt-2 space-y-1 text-[11px]">
              <div className="font-semibold text-slate-200">
                30-second SLS timer
              </div>
              <div className="flex items-center gap-3">
                <div className="text-lg font-mono tabular-nums text-slate-50">
                  {balanceSecondsRemaining}s
                </div>
                <div className="flex flex-wrap gap-1">
                  {!balanceTimerRunning ? (
                    <button
                      type="button"
                      onClick={handleBalanceTimerStart}
                      className="px-2 py-0.5 rounded-md border border-emerald-500/70 bg-emerald-500/10 text-[11px] text-emerald-200"
                      disabled={isFinalized}
                    >
                      Start 30s
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setBalanceTimerRunning(false)}
                      className="px-2 py-0.5 rounded-md border border-amber-400/70 bg-amber-500/10 text-[11px] text-amber-200"
                    >
                      Stop
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleBalanceTimerReset}
                    className="px-2 py-0.5 rounded-md border border-slate-600 bg-slate-800/70 text-[11px] text-slate-200"
                  >
                    Reset
                  </button>
                </div>
              </div>
              <p className="text-[10px] text-slate-500">
                Use this when timing single-leg stance (SLS) eyes open or closed.
                Start when the player is stable, stop when they lose balance, and
                enter the seconds held into the R/L fields in the Balance grid.
              </p>
            </div>
          )}
       

        {hasCt2btMetric && (
          <div className="mt-2 space-y-1 text-[11px]">
            <div className="font-semibold text-slate-200">
              Catcher Throw to 2B Time (CT2BT)
            </div>
            <div className="flex items-center gap-3">
              <div className="text-lg font-mono tabular-nums text-slate-50">
                {ct2btTimerSeconds.toFixed(2)}s
              </div>
              <div className="flex flex-wrap gap-1">
                {!ct2btTimerRunning ? (
                  <button
                    type="button"
                    onClick={handleCt2btTimerStart}
                    className="px-2 py-0.5 rounded-md border border-emerald-500/70 bg-emerald-500/10 text-[11px] text-emerald-200"
                    disabled={isFinalized}
                  >
                    Start
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleCt2btTimerStopAndFill}
                    className="px-2 py-0.5 rounded-md border border-amber-400/70 bg-amber-500/10 text-[11px] text-amber-200"
                    disabled={isFinalized}
                  >
                    Stop &amp; fill next
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleCt2btTimerReset}
                  className="px-2 py-0.5 rounded-md border border-slate-600 bg-slate-800/70 text-[11px] text-slate-200"
                >
                  Reset
                </button>
              </div>
            </div>
            <p className="text-[10px] text-slate-500">
              Time from when the pitch crosses the plate until the ball reaches
              2B. When you stop, the time is written into the next empty CT2BT
              cell in the grid.
            </p>
          </div>
        )}


        {hasIfss1btMetric && (
          <div className="mt-2 space-y-1 text-[11px]">
            <div className="font-semibold text-slate-200">
              SS to 1B timer (IFSS1BT)
            </div>
            <div className="flex items-center gap-3">
              <div className="text-lg font-mono tabular-nums text-slate-50">
                {ifss1btTimerSeconds.toFixed(2)}s
              </div>
              <div className="flex flex-wrap gap-1">
                {!ifss1btTimerRunning ? (
                  <button
                    type="button"
                    onClick={handleIfss1btTimerStart}
                    className="px-2 py-0.5 rounded-md border border-emerald-500/70 bg-emerald-500/10 text-[11px] text-emerald-200"
                    disabled={isFinalized}
                  >
                    Start
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleIfss1btTimerStopAndFill}
                    className="px-2 py-0.5 rounded-md border border-amber-400/70 bg-amber-500/10 text-[11px] text-amber-200"
                    disabled={isFinalized}
                  >
                    Stop &amp; fill next
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleIfss1btTimerReset}
                  className="px-2 py-0.5 rounded-md border border-slate-600 bg-slate-800/70 text-[11px] text-slate-200"
                >
                  Reset
                </button>
              </div>
            </div>
            <p className="text-[10px] text-slate-500">
              Time from when the ball leaves the bat or machine at shortstop
              until it reaches first base. When you stop, the time is written
              into the next empty IFSS1BT cell in the grid.
            </p>
          </div>
        )}

        {effectiveEvalType === "outfield" && (
          <div className="mt-2 space-y-1 text-[11px]">
            <div className="font-semibold text-slate-200">
              Outfield Ground Ball → Home timer (OFGBHT)
            </div>
            <div className="flex items-center gap-3">
              <div className="text-lg font-mono tabular-nums text-slate-50">
                {ofgbhtTimerSeconds.toFixed(2)}s
              </div>
              <div className="flex flex-wrap gap-1">
                {!ofgbhtTimerRunning ? (
                  <button
                    type="button"
                    onClick={handleOfgbhtTimerStart}
                    className="px-2 py-0.5 rounded-md border border-emerald-500/70 bg-emerald-500/10 text-[11px] text-emerald-200"
                    disabled={isFinalized}
                  >
                    Start
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleOfgbhtTimerStopAndFill}
                    className="px-2 py-0.5 rounded-md border border-amber-400/70 bg-amber-500/10 text-[11px] text-amber-200"
                    disabled={isFinalized}
                  >
                    Stop &amp; fill next
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleOfgbhtTimerReset}
                  className="px-2 py-0.5 rounded-md border border-slate-600 bg-slate-800/70 text-[11px] text-slate-200"
                >
                  Reset
                </button>
              </div>
            </div>
            <p className="text-[10px] text-slate-500">
              Time from when the ground ball is hit/sent to when the ball reaches
              the area around home plate. When you stop, the time is written into
              the next empty OFGBHT cell in the grid.
            </p>
          </div>
        )}

        
        <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-950/40">
          {loadingTemplate && (
            <div className="p-4 text-xs text-slate-400">
              Loading assessment template…
            </div>
          )}

          {!loadingTemplate && templateError && (
            <div className="p-4 text-xs text-red-400 whitespace-pre-line">
              {templateError}
            </div>
          )}
          
          {!loadingTemplate && visibleGroupedMetrics.length === 0 && (
            <div className="p-4 text-xs text-slate-400">
              No metrics found for this session.
            </div>
          )}
          {!loadingTemplate && visibleGroupedMetrics.length > 0 && (
            <table className="min-w-full text-[11px]">
              <thead className="bg-slate-900/80">
                <tr>
                  <th className="text-left px-2 py-1 border-b border-slate-700 w-[32%]">
                    Metric
                  </th>
                  {gridColumns.map((col) => (
                    <th
                      key={col.id}
                      className="text-center px-2 py-1 border-b border-slate-700"
                    >
                      <div className="font-medium">{col.name}</div>
                      <div className="text-[10px] text-slate-400">
                        {col.jerseyLabel ?? "—"}
                      </div>
                      {col.kind === "tryout" && (
                        <div className="text-[10px] text-amber-300">
                          Tryout
                        </div>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleGroupedMetrics.map((group) => {
                  const labelLower = group.label.toLowerCase();
                  const isBalance = labelLower === "balance";
                  const isMobility = labelLower === "mobility";
                  const isHittingGroup = labelLower.startsWith("hitting");
                  const isPitchCommandGroup =
                    labelLower.includes("pitching") && labelLower.includes("command");
                  const isFirstBaseCatchingGroup =
                    labelLower.startsWith("first base") && labelLower.includes("catch");
                  const isFirstBaseFieldingGroup =
                    labelLower.startsWith("first base") && labelLower.includes("field");
                  const isFirstBaseGroup = isFirstBaseCatchingGroup || isFirstBaseFieldingGroup;
                  const isCatcherGroup = labelLower.startsWith("catcher");
                  const isInfieldCatchingGroup =
                    labelLower.startsWith("infield") &&
                    labelLower.includes("catch");
                  const isInfieldFieldingGroup =
                    labelLower.startsWith("infield") &&
                    labelLower.includes("field");
                  const isInfieldGroup =
                    isInfieldCatchingGroup || isInfieldFieldingGroup;
              // Youth 5U–9U “simple” evals (Throwing / Catching / Fielding) –
              // we don’t show sub-group headers like “Outfield”, “Throwing”, etc.
                  const isYouthSimpleEval =
                    effectiveEvalType === "throwing" ||
                    effectiveEvalType === "catching" ||
                    effectiveEvalType === "fielding";
              
                  const rows: React.ReactNode[] = [];


                // Group header row (Speed / Strength / Balance / Mobility / Hitting / etc.)
                if (!isYouthSimpleEval && group.label !== "Other") {
                  rows.push(
                    <tr className="bg-slate-800/60" key={`${group.key}-header`}>
                      <td
                        colSpan={1 + gridColumns.length}
                        className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-300 border-b border-slate-700"
                      >
                        {group.label}
                      </td>
                    </tr>
                  );
                }

              // Generic metric row helper (used for most metrics)
              const pushDefaultRow = (m: AssessmentMetric) => {
                const metricKey = (m as any).metric_key as string | undefined;
                const meta = metricKey ? getMetricMeta(metricKey) : undefined;

                // -------------------------------------------------------------------
                // SPECIAL LAYOUT: TSPDSMALL (max_throwing_speed_small_ball)
                // Needs a ball-type select + mph field per player.
                // -------------------------------------------------------------------
                if (metricKey === "max_throwing_speed_small_ball") {
                  const displayName =
                    meta?.shortLabel ||
                    meta?.displayName ||
                    (m as any).label ||
                    "Max throwing speed – small ball";

                  rows.push(
                    <tr key={`metric-${m.id}`} className="border-b border-slate-800">
                      <td className="align-top px-2 py-2">
                        <div className="font-medium text-slate-100">{displayName}</div>
                        {meta?.instructions && (
                          <div className="mt-0.5 text-[10px] text-slate-400">
                            {meta.instructions}
                          </div>
                        )}
                      </td>
                      {gridColumns.map((col) => {
                        const playerId = col.id;
                        const perPlayer =
                          (sessionData?.values as any)?.[playerId] || {};
                        const v = perPlayer[m.id];

                        const numericValue = v?.value_numeric as number | null | undefined;
                        const ballTypeValue =
                          typeof v?.value_text === "string" ? v.value_text : "";

                        const cellKey = `${m.id}-${playerId}`;

                        const updateBallType = (nextType: string) => {
                          if (isFinalized) return;

                          setSessionData((prev) => {
                            const base: EvalSessionData =
                              prev ??
                              sessionData ?? {
                                player_ids: [],
                                values: {},
                                completed_metric_ids: [],
                                evaluation_type: effectiveEvalType,
                                session_mode: effectiveSessionMode,
                              };

                            const values = { ...(base.values || {}) } as any;
                            const byPlayer = { ...(values[playerId] || {}) };
                            const existing = byPlayer[m.id] || {
                              value_numeric: null,
                              value_text: null,
                            };

                            byPlayer[m.id] = {
                              value_numeric:
                                typeof existing.value_numeric === "number"
                                  ? existing.value_numeric
                                  : null,
                              value_text: nextType || null,
                            };

                            values[playerId] = byPlayer;
                            return { ...base, values };
                          });

                          setDirty(true);
                        };

                        const updateSpeed = (raw: string) => {
                          if (isFinalized) return;

                          setSessionData((prev) => {
                            const base: EvalSessionData =
                              prev ??
                              sessionData ?? {
                                player_ids: [],
                                values: {},
                                completed_metric_ids: [],
                                evaluation_type: effectiveEvalType,
                                session_mode: effectiveSessionMode,
                              };

                            const values = { ...(base.values || {}) } as any;
                            const byPlayer = { ...(values[playerId] || {}) };
                            const existing = byPlayer[m.id] || {
                              value_numeric: null,
                              value_text: null,
                            };

                            const trimmed = raw.trim();
                            let numeric: number | null = null;
                            if (trimmed !== "") {
                              const parsed = Number.parseFloat(trimmed);
                              numeric = Number.isNaN(parsed) ? null : parsed;
                            }

                            byPlayer[m.id] = {
                              value_numeric: numeric,
                              value_text:
                                typeof existing.value_text === "string"
                                  ? existing.value_text
                                  : null,
                            };

                            values[playerId] = byPlayer;
                            return { ...base, values };
                          });

                          setDirty(true);
                        };

                        return (
                          <td
                            key={cellKey}
                            className="px-2 py-1 align-top text-center text-xs"
                          >
                            <div className="flex flex-col gap-1 items-stretch">
                              <select
                                className="w-full max-w-[8rem] rounded-md border border-slate-700 bg-slate-950 px-1 py-0.5 text-[11px]"
                                value={ballTypeValue}
                                disabled={isFinalized}
                                onChange={(e) => updateBallType(e.target.value)}
                              >
                                <option value="">Ball type…</option>
                                <option value="small_baseball">
                                  Small baseball (7.2")
                                </option>
                                <option value="tennis_ball">Tennis ball</option>
                                <option value="racquetball">Racquetball</option>
                                <option value="other">Other</option>
                              </select>

                              <input
                                type="number"
                                inputMode="decimal"
                                className="w-full max-w-[7rem] rounded-md border border-slate-700 bg-slate-950 px-1 py-0.5 text-[11px]"
                                placeholder={meta?.placeholder ?? "mph"}
                                step={meta?.step ?? 0.1}
                                min={meta?.min}
                                max={meta?.max}
                                disabled={isFinalized}
                                value={
                                  numericValue === null ||
                                  numericValue === undefined ||
                                  Number.isNaN(numericValue)
                                    ? ""
                                    : String(numericValue)
                                }
                                onChange={(e) => updateSpeed(e.target.value)}
                              />
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );

                  return;
                }

                // -------------------------------------------------------------------
                // Default rendering for all other metrics (your existing logic)
                // -------------------------------------------------------------------
                const displayName =
                  meta?.shortLabel ||
                  meta?.displayName ||
                  (m as any).label ||
                  metricKey ||
                  "Metric";

                const detailLineParts: string[] = [];

                if (meta?.group) detailLineParts.push(meta.group);
                if (meta?.code) detailLineParts.push(`Code: ${meta.code}`);
                if ((m as any).unit) detailLineParts.push(`Unit: ${(m as any).unit}`);
                if (
                  meta?.unitHint &&
                  !detailLineParts.some((p) => p.toLowerCase().includes("unit"))
                ) {
                  detailLineParts.push(meta.unitHint);
                }

                rows.push(
                  <tr key={`metric-${m.id}`} className="border-b border-slate-800">
                    <td className="align-top px-2 py-2">
                      <div className="font-medium text-slate-100">{displayName}</div>
                      {detailLineParts.length > 0 && (
                        <div className="mt-0.5 text-[10px] text-slate-400">
                          {detailLineParts.join(" · ")}
                        </div>
                      )}
                      {meta?.instructions && (
                        <div className="mt-0.5 text-[10px] text-slate-400">
                          {meta.instructions}
                        </div>
                      )}
                    </td>
                    {gridColumns.map((col) => {
                      const playerId = col.id;
                      const perPlayer =
                        (sessionData?.values as any)?.[playerId] || {};
                      const v = perPlayer[m.id];
                      const numericValue = v?.value_numeric;
                      const textValue = v?.value_text;
                      const commonKey = `${m.id}-${playerId}`;

                      // If the metric is configured as a select, use options UI
                      if (meta?.inputType === "select" && meta.options?.length) {
                        const selectValue =
                          typeof textValue === "string" && textValue.trim() !== ""
                            ? textValue
                            : typeof numericValue === "number"
                            ? String(numericValue)
                            : "";

                        return (
                          <td
                            key={commonKey}
                            className="px-2 py-1 align-top text-center text-xs"
                          >
                            <select
                              className="w-full max-w-[7rem] rounded-md border border-slate-700 bg-slate-950 px-1 py-0.5 text-[11px]"
                              value={selectValue}
                              disabled={isFinalized}
                              onChange={(e) =>
                                handleValueChange(m.id, playerId, e.target.value)
                              }
                            >
                              <option value="">—</option>
                              {meta.options.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          </td>
                        );
                      }

                      const value = numericValue ?? (textValue ?? "");

                      const inputType: "number" | "text" =
                       meta?.inputType === "text" ? "text" : "number";

                      return (
                        <td
                          key={commonKey}
                          className="px-2 py-1 align-top text-center text-xs"
                        >
                          <input
                            type={inputType}
                            inputMode={
                              inputType === "number" ? "decimal" : "text"
                            }
                            className="w-full max-w-[7rem] rounded-md border border-slate-700 bg-slate-950 px-1 py-0.5 text-[11px]"
                            placeholder={meta?.placeholder}
                            step={meta?.step}
                            min={meta?.min}
                            max={meta?.max}
                            disabled={isFinalized}
                            value={
                              value === null || value === undefined
                                ? ""
                                : String(value)
                            }
                            onChange={(e) =>
                              handleValueChange(m.id, playerId, e.target.value)
                            }
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              };


              // Special layout: Outfield eval → fly ball matrix + throw accuracy matrix
              if (effectiveEvalType === "outfield") {
                const pushOutfieldMatrixRow = (
                  metric: AssessmentMetric,
                  cfg: { repCount: number; kind: OutfieldMatrixKind }
                ) => {
                  const metricKey = (metric as any).metric_key as
                    | string
                    | undefined;

                  const meta = metricKey ? getMetricMeta(metricKey) : undefined;
                  const displayName =
                    meta?.shortLabel ||
                    meta?.displayName ||
                    (metric as any).label ||
                    metricKey ||
                    "Outfield test";

                  const options =
                    cfg.kind === "fly_matrix"
                      ? OUTFIELD_FLY_OPTIONS
                      : OUTFIELD_THROW_OPTIONS;

                  const repCountSafe = cfg.repCount;

                  rows.push(
                    <tr
                      key={`${group.key}-outfield-${metric.id}`}
                      className="border-b border-slate-800"
                    >
                      <td className="align-top px-2 py-2">
                        <div className="font-medium text-slate-100">
                          {displayName}
                        </div>
                        {meta?.instructions && (
                          <div className="mt-0.5 text-[10px] text-slate-500">
                            {meta.instructions}
                          </div>
                        )}
                      </td>

                      {gridColumns.map((col) => {
                        const playerId = col.id;
                        const perPlayer =
                          (sessionData.values as any)?.[playerId] || {};
                        const cell = perPlayer[metric.id];

                        const storedText = cell?.value_text;
                        const numericValue = cell?.value_numeric;

                        let codes: string[] = [];
                        if (
                          typeof storedText === "string" &&
                          storedText.trim() !== ""
                        ) {
                          try {
                            const parsed = JSON.parse(storedText);
                            if (Array.isArray(parsed)) {
                              codes = parsed.map((c) => String(c));
                            }
                          } catch {
                            // ignore bad JSON
                          }
                        }

                        if (codes.length < repCountSafe) {
                          codes = [
                            ...codes,
                            ...Array(repCountSafe - codes.length).fill(""),
                          ];
                        } else if (codes.length > repCountSafe) {
                          codes = codes.slice(0, repCountSafe);
                        }

                        const displayTotal =
                          typeof numericValue === "number"
                            ? numericValue
                            : undefined;

                        return (
                          <td
                            key={`${group.key}-outfield-${metric.id}-${playerId}`}
                            className="px-2 py-2 align-top text-center"
                          >
                            <div className="flex flex-col gap-1 items-center">
                              <div className="flex flex-wrap gap-2 justify-center">
                                {codes.map((code, idx) => (
                                  <div
                                    key={`${metric.id}-${playerId}-${idx}`}
                                    className="flex flex-col gap-0.5"
                                  >
                                    <div className="text-[10px] text-slate-400 text-center">
                                      Rep {idx + 1}
                                    </div>
                                    <select
                                      className="w-full rounded border border-slate-700 bg-slate-900 px-1 py-0.5 text-[10px]"
                                      value={code}
                                      disabled={isFinalized}
                                      onChange={(e) =>
                                        handleHittingMatrixSwingChange(
                                          metric.id,
                                          playerId,
                                          idx,
                                          e.target.value,
                                          options,
                                          repCountSafe
                                        )
                                      }
                                    >
                                      <option value="">—</option>
                                      {options.map((opt) => (
                                        <option key={opt.code} value={opt.code}>
                                          {opt.label}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                ))}
                              </div>
                              <div className="text-[10px] text-slate-400 text-center">
                                Score:{" "}
                                <span className="font-mono">
                                  {displayTotal ?? "—"}
                                </span>
                              </div>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                };

                // For Outfield sessions, render any matrix-style metrics via the Outfield matrix UI
                group.metrics.forEach((m) => {
                  const metricKey = (m as any).metric_key as
                    | string
                    | undefined;

                  if (!metricKey) {
                    pushDefaultRow(m);
                    return;
                  }

                  const cfg = OUTFIELD_MATRIX_CONFIG[metricKey];
                  if (cfg) {
                    pushOutfieldMatrixRow(m, cfg);
                  } else {
                    // OFGBHT and any other numeric metrics fall back to the generic row
                    pushDefaultRow(m);
                  }
                });

                return <Fragment key={group.key}>{rows}</Fragment>;
              }

              
              // Special layout: Balance → SLS Eyes Open/Closed (R/L)
              // Special layout: Balance → SLS Eyes Open/Closed (R/L)
              if (isBalance) {
                const byKey = new Map<string, AssessmentMetric>();
                group.metrics.forEach((m) => {
                  const metricKey = (m as any).metric_key as string | undefined;
                  if (metricKey) {
                    byKey.set(metricKey, m);
                  }
                });

                const openRight = byKey.get(BALANCE_KEYS.slsEyesOpenRight);
                const openLeft = byKey.get(BALANCE_KEYS.slsEyesOpenLeft);
                const closedRight = byKey.get(BALANCE_KEYS.slsEyesClosedRight);
                const closedLeft = byKey.get(BALANCE_KEYS.slsEyesClosedLeft);

                const usedIds = new Set<number>();
                if (openRight) usedIds.add(openRight.id);
                if (openLeft) usedIds.add(openLeft.id);
                if (closedRight) usedIds.add(closedRight.id);
                if (closedLeft) usedIds.add(closedLeft.id);

                const renderBalanceCell = (
                  playerId: string,
                  mRight?: AssessmentMetric,
                  mLeft?: AssessmentMetric
                ) => {
                  const renderSide = (
                    mSide: AssessmentMetric | undefined,
                    label: "R" | "L"
                  ) => {
                    if (!mSide) {
                      return (
                        <div className="flex-1 text-[10px] text-slate-500 mt-1 text-center">
                          —
                        </div>
                      );
                    }

                    const perPlayer =
                      (sessionData?.values as any)?.[playerId] || {};
                    const v = perPlayer[mSide.id];
                    const numericValue = v?.value_numeric;
                    const textValue = v?.value_text;
                    const value = numericValue ?? (textValue ?? "");

                    return (
                      <div className="flex-1">
                        <div className="text-[10px] text-slate-400 mb-0.5">
                          {label}
                        </div>
                        <input
                          type="number"
                          className="w-full max-w-[5rem] rounded-md bg-slate-950 border border-slate-700 px-1 py-0.5 text-[11px] text-center"
                          value={value === null ? "" : value}
                          onChange={(e) =>
                            handleValueChange(mSide.id, playerId, e.target.value)
                          }
                          disabled={isFinalized}
                          min={0}
                          max={30}
                          step={0.1}
                        />
                      </div>
                    );
                  };

                  return (
                    <div className="flex gap-2 justify-center">
                      {renderSide(mRight, "R")}
                      {renderSide(mLeft, "L")}
                    </div>
                  );
                };

                if (openRight || openLeft) {
                  rows.push(
                    <tr
                      key={`${group.key}-sls-open`}
                      className="border-b border-slate-800"
                    >
                      <td className="align-top px-2 py-2">
                        <div className="font-medium text-slate-100">
                          SLS Eyes Open
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          Single-leg stance, eyes open. Record max seconds up to
                          30s for each leg (right and left).
                        </div>
                      </td>
                      {gridColumns.map((col) => (
                        <td
                          key={`${group.key}-sls-open-${col.id}`}
                          className="px-2 py-1 align-top text-center"
                        >
                          {renderBalanceCell(col.id, openRight, openLeft)}
                        </td>
                      ))}
                    </tr>
                  );
                }

                if (closedRight || closedLeft) {
                  rows.push(
                    <tr
                      key={`${group.key}-sls-closed`}
                      className="border-b border-slate-800"
                    >
                      <td className="align-top px-2 py-2">
                        <div className="font-medium text-slate-100">
                          SLS Eyes Closed
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          Single-leg stance, eyes closed. Record max seconds up
                          to 30s for each leg (right and left).
                        </div>
                      </td>
                      {gridColumns.map((col) => (
                        <td
                          key={`${group.key}-sls-closed-${col.id}`}
                          className="px-2 py-1 align-top text-center"
                        >
                          {renderBalanceCell(col.id, closedRight, closedLeft)}
                        </td>
                      ))}
                    </tr>
                  );
                }

                // Any other Balance metrics (if present) fall back to generic rows
                const remainingBalanceMetrics = group.metrics.filter(
                  (m) => !usedIds.has(m.id)
                );
                remainingBalanceMetrics.forEach((m) => pushDefaultRow(m));

                return <Fragment key={group.key}>{rows}</Fragment>;
              }


              // Special layout: Mobility → MSR R/L + Toe Touch
              // Special layout: Mobility → MSR R/L + Toe Touch
              // Special layout: Mobility → MSR (R/L) + Deep Squat + generic for others
              if (isMobility) {
                const byKey = new Map<string, AssessmentMetric>();
                group.metrics.forEach((m) => {
                  const metricKey = (m as any).metric_key as string | undefined;
                  if (metricKey) {
                    byKey.set(metricKey, m);
                  }
                });

                const msrRight = byKey.get(MOBILITY_KEYS.msrRight);
                const msrLeft = byKey.get(MOBILITY_KEYS.msrLeft);
                const deepSquatMetric = byKey.get("deep_squat");

                const usedIds = new Set<number>();
                if (msrRight) usedIds.add(msrRight.id);
                if (msrLeft) usedIds.add(msrLeft.id);
                if (deepSquatMetric) usedIds.add(deepSquatMetric.id);

                const renderMobilitySelectCell = (
                  playerId: string,
                  mSide?: AssessmentMetric,
                  label?: "R" | "L"
                ) => {
                  if (!mSide) {
                    return (
                      <div className="flex-1 text-[10px] text-slate-500 mt-1 text-center">
                        —
                      </div>
                    );
                  }

                  const metricKey = (mSide as any).metric_key as string | undefined;
                  const meta = metricKey ? getMetricMeta(metricKey) : undefined;

                  const perPlayer =
                    (sessionData?.values as any)?.[playerId] || {};
                  const v = perPlayer[mSide.id];

                  const numericValue = v?.value_numeric;
                  const textValue = v?.value_text;

                  const selectValue =
                    numericValue !== null &&
                    numericValue !== undefined &&
                    !Number.isNaN(numericValue)
                      ? String(numericValue)
                      : textValue != null
                      ? String(textValue)
                      : "";

                  return (
                    <div className="flex-1">
                      {label && (
                        <div className="text-[10px] text-slate-400 mb-0.5">
                          {label}
                        </div>
                      )}
                      <select
                        className="w-full max-w-[7rem] rounded-md bg-slate-950 border border-slate-700 px-1 py-0.5 text-[11px]"
                        value={selectValue}
                        onChange={(e) =>
                          handleValueChange(mSide.id, playerId, e.target.value)
                        }
                        disabled={isFinalized}
                      >
                        <option value="">Select…</option>
                        {meta?.options?.map((opt) => (
                          <option
                            key={String(opt.value)}
                            value={String(opt.value)}
                          >
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                };

         
                
                if (msrRight || msrLeft) {
                  rows.push(
                    <tr
                      key={`${group.key}-msr`}
                      className="border-b border-slate-800"
                    >
                      <td className="align-top px-2 py-2">
                        <div className="font-medium text-slate-100">
                          Rotation (MSR)
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          Multi-segment rotation with bat across shoulders.
                          Select the option that best matches how far the player
                          turns for each side.
                        </div>
                      </td>
                      {gridColumns.map((col) => (
                        <td
                          key={`${group.key}-msr-${col.id}`}
                          className="px-2 py-1 align-top text-center"
                        >
                          <div className="flex gap-2 justify-center">
                            {renderMobilitySelectCell(col.id, msrRight, "R")}
                            {renderMobilitySelectCell(col.id, msrLeft, "L")}
                          </div>
                        </td>
                      ))}
                    </tr>
                  );
                }

                // Deep squat pill-button multi-select row if present
                if (deepSquatMetric) {
                  const meta = getMetricMeta("deep_squat");
                  const displayName =
                    meta?.displayName ??
                    meta?.shortLabel ??
                    "Full Overhead Deep Squat";
                  const instructions = meta?.instructions;

                  const optionDefs = [
                    {
                      code: "full" as const,
                      label: "Full Overhead Deep Squat",
                    },
                    {
                      code: "arms" as const,
                      label: "Arms move forward",
                    },
                    {
                      code: "pelvis" as const,
                      label: "Pelvis not below knees",
                    },
                    {
                      code: "ankles" as const,
                      label: "Ankles flare",
                    },
                  ];

                  rows.push(
                    <tr
                      key={`${group.key}-deep-squat`}
                      className="border-b border-slate-800"
                    >
                      <td className="align-top px-2 py-2">
                        <div className="font-medium text-slate-100">
                          {displayName}
                        </div>
                        {instructions && (
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            {instructions}
                          </div>
                        )}
                      </td>

                      {gridColumns.map((col) => {
                        const playerId = col.id;
                        const perPlayer =
                          (sessionData?.values as any)?.[playerId] || {};
                        const v = perPlayer[deepSquatMetric.id];
                        const numericValue = v?.value_numeric;
                        const textValue = v?.value_text;

                        let selected: string[] = [];

                        if (
                          typeof textValue === "string" &&
                          textValue.trim() !== ""
                        ) {
                          try {
                            const parsed = JSON.parse(textValue);
                            if (Array.isArray(parsed)) {
                              selected = parsed.filter((c: any) =>
                                ["full", "arms", "pelvis", "ankles"].includes(
                                  String(c)
                                )
                              );
                            }
                          } catch {
                            // ignore parse errors
                          }
                        } else if (typeof numericValue === "number") {
                          if (numericValue === 9) {
                            selected = ["full"];
                          }
                        }

                        return (
                          <td
                            key={`${group.key}-deep-squat-${col.id}`}
                            className="px-2 py-1 align-top text-center"
                          >
                            <div className="flex flex-col gap-1 items-center">
                              <div className="flex flex-wrap gap-1 justify-center">
                                {optionDefs.map((opt) => {
                                  const isSelected = selected.includes(
                                    opt.code
                                  );
                                  return (
                                    <button
                                      key={opt.code}
                                      type="button"
                                      onClick={() =>
                                        handleValueChange(
                                          deepSquatMetric.id,
                                          playerId,
                                          opt.code
                                        )
                                      }
                                      disabled={isFinalized}
                                      className={[
                                        "px-2 py-0.5 rounded-full border text-[10px]",
                                        isSelected
                                          ? "border-emerald-400 bg-emerald-500/10 text-emerald-200"
                                          : "border-slate-600 bg-slate-900 text-slate-200",
                                      ].join(" ")}
                                    >
                                      {opt.label}
                                    </button>
                                  );
                                })}
                              </div>
                              <div className="text-[10px] text-slate-400">
                                Score:{" "}
                                <span className="font-mono">
                                  {numericValue ?? "—"}
                                </span>
                              </div>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                }

                // Any other Mobility metrics (e.g. Toe Touch) use default rendering
                const remainingMobilityMetrics = group.metrics.filter(
                  (m) => !usedIds.has(m.id)
                );
                remainingMobilityMetrics.forEach((m) => pushDefaultRow(m));

                return <Fragment key={group.key}>{rows}</Fragment>;
              }

              // Special layout: Youth Catching (5U–9U)
              // Handles:
              // - C20FT / C40FT (m_20ft_catching_test, m_40_ft_catching_test)
              // - C51B / C1BST (c51b_catching_test, c1bst_scoops_test)
              // - CIFFLD2B/SS/3B (infield_fly_ld_2b/ss/3b)
              // - CIFF / CLD 2B/SS/3B (infield_fly_*, infield_ld_*)
              // - C5PCS (c5pcs_points)
              // - C15X15M (c15x15m_points)
              // - Ladders: C5X5LD / 10X10 Ladder (c5x5_fly_ball_ladder_level, c10x10_fly_ball_ladder_level)
              if (effectiveEvalType === "catching") {
                const usedIds = new Set<number>();

                const YOUTH_CATCH_MATRIX_CONFIG: Record<
                  string,
                  {
                    repCount: number;
                    options: HittingSwingOption[];
                    defaultLabel: string;
                    defaultDescription: string;
                  }
                > = {
                  // 5U–6U: 20 ft / 40 ft catching tests
                  m_20ft_catching_test: {
                    repCount: 5,
                    options: [
                      { code: "miss", label: "Miss (0)", points: 0 },
                      {
                        code: "glove",
                        label: "Glove touched ball (1)",
                        points: 1,
                      },
                      { code: "catch", label: "Catch (2)", points: 2 },
                    ],
                    defaultLabel: "20 ft Catching Test (C20FT)",
                    defaultDescription:
                      "Throw 5 balls to the player from 20 ft. 0 = miss, 1 = glove touched the ball, 2 = clean catch. Max score 10.",
                  },
                  m_40_ft_catching_test: {
                    repCount: 5,
                    options: [
                      { code: "miss", label: "Miss (0)", points: 0 },
                      {
                        code: "glove",
                        label: "Glove touched ball (1)",
                        points: 1,
                      },
                      { code: "catch", label: "Catch (2)", points: 2 },
                    ],
                    defaultLabel: "40 ft Catching Test (C40FT)",
                    defaultDescription:
                      "Throw 5 balls to the player from 40 ft. 0 = miss, 1 = glove touched the ball, 2 = clean catch. Max score 10.",
                  },

                  // 7U–9U: 1B catching & scoops
                  c51b_catching_test: {
                    repCount: 5,
                    options: [
                      { code: "miss", label: "Miss (0)", points: 0 },
                      {
                        code: "block",
                        label: "Blocked ball (1)",
                        points: 1,
                      },
                      {
                        code: "catch",
                        label: "Catch with foot on bag (3)",
                        points: 3,
                      },
                    ],
                    defaultLabel: "1B Catching Test (C51B)",
                    defaultDescription:
                      "5 throws to 1B from SS. 0 = missed catch that gets by, 1 = blocked ball, 3 = catch with foot on the bag. Max score 15.",
                  },
                  c1bst_scoops_test: {
                    repCount: 5,
                    options: [
                      { code: "miss", label: "Miss (0)", points: 0 },
                      {
                        code: "block",
                        label: "Blocked ball (1)",
                        points: 1,
                      },
                      {
                        code: "catch",
                        label: "Scooped / caught on bag (3)",
                        points: 3,
                      },
                    ],
                    defaultLabel: "1B Scoops Test (C1BST)",
                    defaultDescription:
                      "5 short-hop throws for the 1B to scoop. 0 = miss that gets by, 1 = blocked ball, 3 = scoop/catch with foot on the bag. Max score 15.",
                  },
                  
                  // 7U: combined infield fly + light LD
                  infield_fly_ld_2b: {
                    repCount: 3,
                    options: [
                      { code: "miss", label: "Miss (0)", points: 0 },
                      { code: "catch", label: "Catch (2)", points: 2 },
                    ],
                    defaultLabel: "Infield Fly/LD – 2B (CIFFLD2B)",
                    defaultDescription:
                      "3 infield fly balls or light line drives to 2B within ~20 ft. 0 = miss, 2 = catch. Max score 6.",
                  },
                  infield_fly_ld_ss: {
                    repCount: 3,
                    options: [
                      { code: "miss", label: "Miss (0)", points: 0 },
                      { code: "catch", label: "Catch (2)", points: 2 },
                    ],
                    defaultLabel: "Infield Fly/LD – SS (CIFFLDSS)",
                    defaultDescription:
                      "3 infield fly balls or light line drives to SS within ~20 ft. 0 = miss, 2 = catch. Max score 6.",
                  },
                  infield_fly_ld_3b: {
                    repCount: 3,
                    options: [
                      { code: "miss", label: "Miss (0)", points: 0 },
                      { code: "catch", label: "Catch (2)", points: 2 },
                    ],
                    defaultLabel: "Infield Fly/LD – 3B (CIFFLD3B)",
                    defaultDescription:
                      "3 infield fly balls or light line drives to 3B within ~20 ft. 0 = miss, 2 = catch. Max score 6.",
                  },

                  // 8U–9U: infield fly & line drives
                  infield_fly_2b: {
                    repCount: 3,
                    options: [
                      { code: "miss", label: "Miss (0)", points: 0 },
                      { code: "catch", label: "Catch (2)", points: 2 },
                    ],
                    defaultLabel: "Infield Fly – 2B (CIFF2B)",
                    defaultDescription:
                      "3 infield fly balls to 2B within ~20 ft. 0 = miss, 2 = catch. Max score 6.",
                  },
                  infield_fly_ss: {
                    repCount: 3,
                    options: [
                      { code: "miss", label: "Miss (0)", points: 0 },
                      { code: "catch", label: "Catch (2)", points: 2 },
                    ],
                    defaultLabel: "Infield Fly – SS (CIFFSS)",
                    defaultDescription:
                      "3 infield fly balls to SS within ~20 ft. 0 = miss, 2 = catch. Max score 6.",
                  },
                  infield_fly_3b: {
                    repCount: 3,
                    options: [
                      { code: "miss", label: "Miss (0)", points: 0 },
                      { code: "catch", label: "Catch (2)", points: 2 },
                    ],
                    defaultLabel: "Infield Fly – 3B (CIFF3B)",
                    defaultDescription:
                      "3 infield fly balls to 3B within ~20 ft. 0 = miss, 2 = catch. Max score 6.",
                  },
                  infield_ld_2b: {
                    repCount: 3,
                    options: [
                      { code: "miss", label: "Miss (0)", points: 0 },
                      { code: "catch", label: "Catch (2)", points: 2 },
                    ],
                    defaultLabel: "Infield Line Drives – 2B (CLD2B)",
                    defaultDescription:
                      "3 line drives to 2B inside ~10 ft. 0 = miss, 2 = catch. Max score 6.",
                  },
                  infield_ld_ss: {
                    repCount: 3,
                    options: [
                      { code: "miss", label: "Miss (0)", points: 0 },
                      { code: "catch", label: "Catch (2)", points: 2 },
                    ],
                    defaultLabel: "Infield Line Drives – SS (CLDSS)",
                    defaultDescription:
                      "3 line drives to SS inside ~10 ft. 0 = miss, 2 = catch. Max score 6.",
                  },
                  infield_ld_3b: {
                    repCount: 3,
                    options: [
                      { code: "miss", label: "Miss (0)", points: 0 },
                      { code: "catch", label: "Catch (2)", points: 2 },
                    ],
                    defaultLabel: "Infield Line Drives – 3B (CLD3B)",
                    defaultDescription:
                      "3 line drives to 3B inside ~10 ft. 0 = miss, 2 = catch. Max score 6.",
                  },

                  // 9U: 5‑pitch catcher screen
                  c5pcs_points: {
                    repCount: 5,
                    options: [
                      { code: "passed", label: "Passed ball (0)", points: 0 },
                      {
                        code: "block",
                        label: "Blocked ball in front (1)",
                        points: 1,
                      },
                      { code: "catch", label: "Catch (2)", points: 2 },
                      { code: "scoop", label: "Scoop (2)", points: 2 },
                    ],
                    defaultLabel: "5‑Pitch Catcher Screen (C5PCS)",
                    defaultDescription:
                      "5‑pitch catcher screen: 3 strikes, 1 ball out of the zone, 1 in the dirt. 0 = passed ball, 1 = blocked ball that stays in front, 2 = catch or scoop. Max score 10.",
                  },

                  // 9U: 15×15 catching matrix
                  c15x15m_points: {
                    repCount: 10,
                    options: [
                      { code: "miss", label: "Miss (0)", points: 0 },
                      { code: "catch", label: "Catch (2)", points: 2 },
                    ],
                    defaultLabel: "15×15 Catching Matrix (C15X15M)",
                    defaultDescription:
                      "Set up a 15‑yard radius around the player and hit 10 fly balls from about 80 ft. 0 = miss, 2 = catch. Max score 20.",
                  },
                };

                const pushYouthCatchMatrixRow = (
                  metric: AssessmentMetric,
                  config: {
                    repCount: number;
                    options: HittingSwingOption[];
                    defaultLabel: string;
                    defaultDescription: string;
                  }
                ) => {
                  const metricKey = (metric as any)
                    .metric_key as string | undefined;

                  const meta = metricKey ? getMetricMeta(metricKey) : undefined;
                  const displayName =
                    meta?.displayName ||
                    (metric as any).label ||
                    config.defaultLabel;
                  const description =
                    meta?.instructions || config.defaultDescription;

                  const repCount = config.repCount;
                  const options = config.options;

                  const pointsMap = new Map<string, number>();
                  options.forEach((opt) => pointsMap.set(opt.code, opt.points));

                  rows.push(
                    <tr
                      key={`yc-${group.key}-${metric.id}`}
                      className="border-b border-slate-800"
                    >
                      <td className="align-top px-2 py-2">
                        <div className="font-medium text-slate-100">
                          {displayName}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          {description}
                        </div>
                      </td>
                      {gridColumns.map((col) => {
                        const playerId = col.id;
                        const perPlayer =
                          (sessionData?.values as any)?.[playerId] || {};
                        const v = perPlayer[metric.id];

                        const rawText = (v?.value_text ?? "") as string;
                        let reps: string[] = Array(repCount).fill("");
                        if (rawText && typeof rawText === "string") {
                          try {
                            const parsed = JSON.parse(rawText);
                            if (Array.isArray(parsed)) {
                              reps = reps.map(
                                (existing, idx) =>
                                  (parsed[idx] ?? existing) as string
                              );
                            }
                          } catch {
                            // ignore parse errors
                          }
                        }

                        const numericValue =
                          typeof v?.value_numeric === "number" &&
                          !Number.isNaN(v.value_numeric)
                            ? v.value_numeric
                            : reps.reduce(
                                (sum, code) => sum + (pointsMap.get(code) ?? 0),
                                0
                              );

                        return (
                          <td
                            key={`yc-${group.key}-${metric.id}-${playerId}`}
                            className="px-2 py-2 align-top"
                          >
                            <div className="flex flex-col gap-1">
                              <div
                                className={`grid gap-1 ${
                                  repCount <= 5 ? "grid-cols-5" : "grid-cols-5"
                                }`}
                              >
                                {reps.map((code, idx) => (
                                  <div
                                    key={`yc-${group.key}-${metric.id}-${playerId}-${idx}`}
                                    className="flex flex-col gap-0.5"
                                  >
                                    <div className="text-[10px] text-slate-400 text-center">
                                      Rep {idx + 1}
                                    </div>
                                    <select
                                      className="w-full rounded border border-slate-700 bg-slate-900 px-1 py-0.5 text-[10px]"
                                      value={code}
                                      disabled={isFinalized}
                                      onChange={(e) =>
                                        handleHittingMatrixSwingChange(
                                          metric.id,
                                          playerId,
                                          idx,
                                          e.target.value,
                                          options,
                                          repCount
                                        )
                                      }
                                    >
                                      <option value="">—</option>
                                      {options.map((opt) => (
                                        <option
                                          key={opt.code}
                                          value={opt.code}
                                        >
                                          {opt.label}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                ))}
                              </div>
                              <div className="text-[10px] text-slate-400 text-center">
                                Score:{" "}
                                <span className="font-mono">
                                  {numericValue ?? "—"}
                                </span>
                              </div>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                };

                const pushLadderRow = (
                  metric: AssessmentMetric,
                  kind: "5x5" | "10x10"
                ) => {
                  const metricKey = (metric as any)
                    .metric_key as string | undefined;
                  const meta = metricKey ? getMetricMeta(metricKey) : undefined;

                  const displayName =
                    meta?.displayName ||
                    (metric as any).label ||
                    (kind === "5x5"
                      ? "Catching Ladder – 5 yards (C5X5LD)"
                      : "Catching Ladder – 10 yards (10X10 Ladder)");

                  const description =
                    meta?.instructions ||
                    (kind === "5x5"
                      ? "Record the highest level reached in the 5×5 catching ladder (Levels 1–6)."
                      : "Record the highest level reached in the 10×10 catching ladder (Levels 1–6).");

                  rows.push(
                    <tr
                      key={`yc-ladder-${group.key}-${metric.id}`}
                      className="border-b border-slate-800"
                    >
                      <td className="align-top px-2 py-2">
                        <div className="font-medium text-slate-100">
                          {displayName}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          {description}
                        </div>
                      </td>
                      {gridColumns.map((col) => {
                        const playerId = col.id;
                        const perPlayer =
                          (sessionData?.values as any)?.[playerId] || {};
                        const v = perPlayer[metric.id];
                        const numericValue = v?.value_numeric as
                          | number
                          | null
                          | undefined;

                        // Always keep the select's value as a string
                        const selected =
                          typeof numericValue === "number" && !Number.isNaN(numericValue)
                            ? String(numericValue)
                            : "";

                        return (
                          <td
                            key={`yc-ladder-${group.key}-${metric.id}-${playerId}`}
                            className="px-2 py-2 align-top text-center"
                          >
                            <div className="flex flex-col items-center gap-1">
                              <select
                                className="w-full max-w-[120px] rounded border border-slate-700 bg-slate-900 px-1 py-0.5 text-[10px]"
                                value={selected}
                                disabled={isFinalized}
                                onChange={(e) =>
                                  handleValueChange(
                                    metric.id,
                                    playerId,
                                    e.target.value          // ⬅️ no `|| null`
                                  )
                                }
                              >
                                <option value="">Select level</option>
                                <option value="1">Level 1</option>
                                <option value="2">Level 2</option>
                                <option value="3">Level 3</option>
                                <option value="4">Level 4</option>
                                <option value="5">Level 5</option>
                                <option value="6">Level 6</option>
                              </select>
                              <div className="text-[10px] text-slate-400">
                                Level:{" "}
                                <span className="font-mono">
                                  {numericValue ?? "—"}
                                </span>
                              </div>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                };

                // Walk the group's metrics and render with the youth catching layouts
                for (const metric of group.metrics) {
                  const metricKey = (metric as any)
                    .metric_key as string | undefined;

                  if (!metricKey) {
                    pushDefaultRow(metric);
                    continue;
                  }

                  if (
                    metricKey === "c5x5_fly_ball_ladder_level" ||
                    metricKey === "c10x10_fly_ball_ladder_level"
                  ) {
                    usedIds.add(metric.id);
                    pushLadderRow(
                      metric,
                      metricKey === "c5x5_fly_ball_ladder_level"
                        ? "5x5"
                        : "10x10"
                    );
                    continue;
                  }

                  const config = YOUTH_CATCH_MATRIX_CONFIG[metricKey];
                  if (config) {
                    usedIds.add(metric.id);
                    pushYouthCatchMatrixRow(metric, config);
                    continue;
                  }

                  // Anything else in a Catching eval falls back to generic rendering
                  pushDefaultRow(metric);
                }

                return <Fragment key={group.key}>{rows}</Fragment>;
              }

              // Special layout: Youth Fielding (5U–6U simple grounders FG2B/FG3B/FGSS/FGP)
              // These use metric_keys: grounders_2b, grounders_ss, grounders_3b, grounders_pitcher
              if (effectiveEvalType === "fielding") {
                const byKey = new Map<string, AssessmentMetric>();
                for (const m of group.metrics) {
                  const metricKey = (m as any).metric_key as string | undefined;
                  if (metricKey) {
                    byKey.set(metricKey, m);
                  }
                }

                type GrounderKey =
                  | "grounders_2b"
                  | "grounders_ss"
                  | "grounders_3b"
                  | "grounders_pitcher";

                const grounderConfigs: Record<
                  GrounderKey,
                  { defaultLabel: string; defaultDescription: string }
                > = {
                  grounders_2b: {
                    defaultLabel: "Grounders – 2B (FG2B)",
                    defaultDescription:
                      "Hit 3 ground balls to the player at 2B. 0 = didn’t field, 1 = fielded but missed the target at 1B, 2 = fielded cleanly and hit the target at 1B.",
                  },
                  grounders_ss: {
                    defaultLabel: "Grounders – SS (FGSS)",
                    defaultDescription:
                      "Hit 3 ground balls to the player at shortstop. 0 = didn’t field, 1 = fielded but missed the target at 1B, 2 = fielded cleanly and hit the target at 1B.",
                  },
                  grounders_3b: {
                    defaultLabel: "Grounders – 3B (FG3B)",
                    defaultDescription:
                      "Hit 3 ground balls to the player at 3B. 0 = didn’t field, 1 = fielded but missed the target at 1B, 2 = fielded cleanly and hit the target at 1B.",
                  },
                  grounders_pitcher: {
                    defaultLabel: "Grounders – P (FGP)",
                    defaultDescription:
                      "Hit 3 ground balls to the player on the mound. 0 = didn’t field, 1 = fielded but missed the target at 1B, 2 = fielded cleanly and hit the target at 1B.",
                  },
                };

                const usedIds = new Set<number>();

                const options: HittingSwingOption[] = [
                  { code: "miss", label: "Didn’t field (0)", points: 0 },
                  {
                    code: "field_miss",
                    label: "Fielded, missed target (1)",
                    points: 1,
                  },
                  {
                    code: "field_hit",
                    label: "Fielded & hit target (2)",
                    points: 2,
                  },
                ];

                const repCount = 3;

                const pushYouthGroundersRow = (metricKey: GrounderKey) => {
                  const metric = byKey.get(metricKey);
                  if (!metric) return;

                  usedIds.add(metric.id);

                  const mk = (metric as any).metric_key as string | undefined;
                  const meta = mk ? getMetricMeta(mk) : undefined;
                  const cfg = grounderConfigs[metricKey];

                  const displayName =
                    meta?.displayName ||
                    (metric as any).label ||
                    cfg.defaultLabel;
                  const description =
                    meta?.instructions || cfg.defaultDescription;

                  const pointsMap = new Map<string, number>();
                  options.forEach((opt) => pointsMap.set(opt.code, opt.points));

                  rows.push(
                    <tr
                      key={`${group.key}-youth-grounders-${metric.id}`}
                      className="border-b border-slate-800"
                    >
                      <td className="align-top px-2 py-2">
                        <div className="font-medium text-slate-100">
                          {displayName}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          {description}
                        </div>
                      </td>

                      {gridColumns.map((col) => {
                        const playerId = col.id;
                        const perPlayer =
                          (sessionData?.values as any)?.[playerId] || {};
                        const v = perPlayer[metric.id];
                        const storedText = v?.value_text as
                          | string
                          | null
                          | undefined;
                        const numericValue = v?.value_numeric as
                          | number
                          | null
                          | undefined;

                        let events: string[] = new Array(repCount).fill("");

                        if (
                          typeof storedText === "string" &&
                          storedText.trim() !== ""
                        ) {
                          try {
                            const parsed = JSON.parse(storedText);
                            if (Array.isArray(parsed)) {
                              for (
                                let i = 0;
                                i < Math.min(parsed.length, repCount);
                                i++
                              ) {
                                events[i] = String(parsed[i] ?? "");
                              }
                            }
                          } catch {
                            // ignore parse errors
                          }
                        }

                        const displayTotal =
                          typeof numericValue === "number" &&
                          !Number.isNaN(numericValue)
                            ? numericValue
                            : events.reduce(
                                (sum, code) => sum + (pointsMap.get(code) ?? 0),
                                0
                              );

                        return (
                          <td
                            key={`${metric.id}-${playerId}`}
                            className="px-2 py-2 align-top text-center"
                          >
                            <div className="flex flex-col gap-1 items-center">
                              <div className="grid grid-cols-3 gap-1">
                                {Array.from({ length: repCount }).map((_, idx) => {
                                  const code = events[idx] || "";
                                  return (
                                    <div
                                      key={`${metric.id}-${playerId}-rep-${idx}`}
                                      className="flex flex-col items-stretch"
                                    >
                                      <div className="text-[9px] text-slate-500 mb-0.5">
                                        Rep {idx + 1}
                                      </div>
                                      <select
                                        className="w-full rounded-md bg-slate-950 border border-slate-700 px-1 py-0.5 text-[11px]"
                                        value={code}
                                        onChange={(e) =>
                                          handleHittingMatrixSwingChange(
                                            metric.id,
                                            playerId,
                                            idx,
                                            e.target.value,
                                            options,
                                            repCount
                                          )
                                        }
                                        disabled={isFinalized}
                                      >
                                        <option value="">—</option>
                                        {options.map((opt) => (
                                          <option
                                            key={opt.code}
                                            value={opt.code}
                                          >
                                            {opt.label}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                  );
                                })}
                              </div>
                              <div className="mt-1 text-[10px] text-slate-400">
                                Total:{" "}
                                <span className="font-mono text-slate-100">
                                  {displayTotal ?? "—"}
                                </span>
                              </div>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                };

                // Order: 2B, SS, 3B, P — only rows whose metrics actually exist will render
                (
                  [
                    "grounders_2b",
                    "grounders_ss",
                    "grounders_3b",
                    "grounders_pitcher",
                  ] as GrounderKey[]
                ).forEach((key) => pushYouthGroundersRow(key));

                // Only take over rendering for this group if we actually found any of the youth grounder metrics
                if (usedIds.size > 0) {
                  return <Fragment key={group.key}>{rows}</Fragment>;
                }
              }


              
              // Special layout: Catcher → screen matrices + Target Throws to 2B
              if (isCatcherGroup) {
                const usedIds = new Set<number>();

                const pushCatcherMatrixRow = (metric: AssessmentMetric) => {
                  const metricKey = (metric as any).metric_key as
                    | string
                    | undefined;
                  const config = metricKey
                    ? CATCHER_MATRIX_CONFIG[metricKey]
                    : undefined;

                  // If we don't recognize this metric as a catcher matrix, fall back to the generic row
                  if (!config) {
                    pushDefaultRow(metric);
                    return;
                  }

                  usedIds.add(metric.id);

                  const meta = metricKey ? getMetricMeta(metricKey) : undefined;
                  const pitchCount = config.pitchCount;
                  const options =
                    config.kind === "screens"
                      ? CATCHER_SCREEN_OPTIONS
                      : CATCHER_TTT2B_OPTIONS;

                  const displayName =
                    meta?.displayName ||
                    (metric as any).label ||
                    "Catcher test";

                  const description =
                    meta?.instructions ||
                    (config.kind === "screens"
                      ? "For each pitch: Miss/passed ball = 0, Block in front = 1, Catch or scoop = 2. The total score is calculated automatically."
                      : "For each throw: No catch = 0, Missed target = 1, Hit target = 3. The total score is calculated automatically.");

                  const pointsMap = new Map<string, number>();
                  options.forEach((opt) => pointsMap.set(opt.code, opt.points));

                  rows.push(
                    <tr
                      key={`${group.key}-catcher-matrix-${metric.id}`}
                      className="border-b border-slate-800"
                    >
                      <td className="align-top px-2 py-2">
                        <div className="font-medium text-slate-100">
                          {displayName}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          {description}
                        </div>
                      </td>

                      {gridColumns.map((col) => {
                        const playerId = col.id;
                        const perPlayer =
                          (sessionData?.values as any)?.[playerId] || {};
                        const v = perPlayer[metric.id];
                        const storedText = v?.value_text;
                        const numericValue = v?.value_numeric;

                        let events: string[] = new Array(pitchCount).fill("");

                        if (
                          typeof storedText === "string" &&
                          storedText.trim() !== ""
                        ) {
                          try {
                            const parsed = JSON.parse(storedText);
                            if (Array.isArray(parsed)) {
                              for (
                                let i = 0;
                                i < Math.min(parsed.length, pitchCount);
                                i++
                              ) {
                                events[i] = String(parsed[i] ?? "");
                              }
                            }
                          } catch {
                            // ignore parse errors
                          }
                        }

                        const displayTotal =
                          typeof numericValue === "number"
                            ? numericValue
                            : events.reduce(
                                (sum, code) => sum + (pointsMap.get(code) ?? 0),
                                0
                              );

                        return (
                          <td
                            key={`${group.key}-catcher-matrix-${metric.id}-${playerId}`}
                            className="px-2 py-1 align-top text-center"
                          >
                            <div className="flex flex-col gap-1">
                              <div
                                className={
                                  pitchCount <= 10
                                    ? "grid grid-cols-2 gap-1"
                                    : "grid grid-cols-5 gap-1"
                                }
                              >
                                {Array.from({ length: pitchCount }).map(
                                  (_, idx) => {
                                    const code = events[idx] || "";
                                    return (
                                      <div
                                        key={`${metric.id}-${playerId}-catch-${idx}`}
                                        className="flex flex-col items-stretch"
                                      >
                                        <div className="text-[9px] text-slate-500 mb-0.5">
                                          {config.kind === "screens"
                                            ? `Pitch ${idx + 1}`
                                            : `Throw ${idx + 1}`}
                                        </div>
                                        <select
                                          className="w-full rounded-md bg-slate-950 border border-slate-700 px-1 py-0.5 text-[11px]"
                                          value={code}
                                          onChange={(e) =>
                                            handleHittingMatrixSwingChange(
                                              metric.id,
                                              playerId,
                                              idx,
                                              e.target.value,
                                              options,
                                              pitchCount
                                            )
                                          }
                                          disabled={isFinalized}
                                        >
                                          <option value="">—</option>
                                          {options.map((opt) => (
                                            <option
                                              key={opt.code}
                                              value={opt.code}
                                            >
                                              {opt.label}
                                            </option>
                                          ))}
                                        </select>
                                      </div>
                                    );
                                  }
                                )}
                              </div>
                              <div className="text-[10px] text-slate-400">
                                Total:{" "}
                                <span className="font-mono">
                                  {displayTotal || "—"}
                                </span>
                              </div>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                };

                // Render all catcher metrics in this group
                group.metrics.forEach((m) => pushCatcherMatrixRow(m));

                return <Fragment key={group.key}>{rows}</Fragment>;
              }



              // Special layout: Pitching command → 10/20-pitch matrices + optional 5‑pitch extras
              if (isPitchCommandGroup) {
                const usedIds = new Set<number>();
                const extraPitchKeys = ADDITIONAL_PITCH_METRIC_KEYS;

                // Split base command metrics vs optional extra pitch types
                const baseCommandMetrics: AssessmentMetric[] = [];
                const extraPitchMetrics: AssessmentMetric[] = [];

                for (const m of group.metrics) {
                  const metricKey = (m as any).metric_key as string | undefined;
                  if (metricKey && extraPitchKeys.has(metricKey)) {
                    extraPitchMetrics.push(m);
                  } else {
                    baseCommandMetrics.push(m);
                  }
                }

                // Per‑player: which extra pitch metric_keys are "in use"
                // (from UI state OR existing values in sessionData)
                const perPlayerExtraKeys: Record<string, Set<string>> = {};
                const perPlayerExtraCounts: Record<string, number> = {};

                for (const col of gridColumns) {
                  const playerId = col.id;
                  const fromState = visibleExtraPitchMatrices[playerId] ?? [];
                  const combined = new Set<string>(fromState);

                  if (sessionData?.values) {
                    const perPlayerValues = (sessionData.values as any)[playerId] || {};
                    for (const metric of extraPitchMetrics) {
                      const metricKey = (metric as any).metric_key as string | undefined;
                      if (!metricKey) continue;

                      const v = perPlayerValues[metric.id];
                      const numeric = v?.value_numeric;
                      const text = v?.value_text;

                      if (
                        (numeric !== null &&
                          numeric !== undefined &&
                          !Number.isNaN(numeric)) ||
                        (text !== null &&
                          text !== undefined &&
                          String(text).trim() !== "")
                      ) {
                        combined.add(metricKey);
                      }
                    }
                  }

                  perPlayerExtraKeys[playerId] = combined;
                  perPlayerExtraCounts[playerId] = combined.size;
                }

                // Any extra metric that is used by at least one player
                const activeExtraMetricKeys = new Set<string>();
                Object.values(perPlayerExtraKeys).forEach((set) => {
                  set.forEach((key) => activeExtraMetricKeys.add(key));
                });

                const pushPitchMatrixRow = (metric: AssessmentMetric) => {
                  const metricKey = (metric as any).metric_key as string | undefined;
                  const config = metricKey ? PITCH_MATRIX_CONFIG[metricKey] : undefined;

                  if (!config) {
                    // e.g. max_throwing_speed stays as a simple numeric row
                    return pushDefaultRow(metric);
                  }

                  const isExtraPitchMatrix =
                    metricKey && extraPitchKeys.has(metricKey);

                  // If this is an extra metric and no player is using it, don't render the row
                  if (
                    isExtraPitchMatrix &&
                    metricKey &&
                    !activeExtraMetricKeys.has(metricKey)
                  ) {
                    return;
                  }

                  usedIds.add(metric.id);

                  const meta = metricKey ? getMetricMeta(metricKey) : undefined;
                  const pitchCount = config.pitchCount;
                  const options = PITCH_COMMAND_OPTIONS;

                  const displayName =
                    meta?.displayName || (metric as any).label || "Pitching Matrix";

                  const description =
                    meta?.instructions ||
                    "For each pitch, mark Miss (0), Hit target (1), or Hit called section (3). The total score is calculated automatically.";

                  rows.push(
                    <tr
                      key={`${group.key}-pitch-matrix-${metric.id}`}
                      className="border-b border-slate-800"
                    >
                      <td className="align-top px-2 py-2">
                        <div className="font-medium text-slate-100">{displayName}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          {description}
                        </div>
                      </td>

                      {gridColumns.map((col) => {
                        const playerId = col.id;
                        const perPlayer =
                          (sessionData?.values as any)?.[playerId] || {};
                        const v = perPlayer[metric.id];
                        const numericValue = v?.value_numeric;
                        const textValue = v?.value_text;

                        const hasAnyValue =
                          (numericValue !== null &&
                            numericValue !== undefined &&
                            !Number.isNaN(numericValue)) ||
                          (textValue !== null &&
                            textValue !== undefined &&
                            String(textValue).trim() !== "");

                        const isActiveForPlayer =
                          !isExtraPitchMatrix ||
                          (metricKey &&
                            (perPlayerExtraKeys[playerId]?.has(metricKey) ||
                              hasAnyValue));

                        // Extra matrix, but this player hasn't added it → show placeholder
                        if (isExtraPitchMatrix && !isActiveForPlayer) {
                          return (
                            <td
                              key={`${metric.id}-${playerId}`}
                              className="px-2 py-2 align-top text-center text-[10px] text-slate-500"
                            >
                              <span className="opacity-60">—</span>
                            </td>
                          );
                        }

                        const pitchCountSafe = Math.max(1, pitchCount);
                        const parsedMatrix = parseMatrixValueText(
                          v?.value_text,
                          pitchCountSafe
                        );
                        const pitches = parsedMatrix.swings;
                        const pitchType = parsedMatrix.pitchType;
                        const keepObjectFormat =
                          parsedMatrix.format === "object" || !!isExtraPitchMatrix;

                        const displayTotal =
                          typeof numericValue === "number" &&
                          !Number.isNaN(numericValue)
                            ? numericValue
                            : computeMatrixTotal(pitches, options);

                      return (
                        <td
                          key={`${metric.id}-${playerId}`}
                          className="px-2 py-2 align-top"
                        >
                          <div className="flex flex-col gap-1">
                            {isExtraPitchMatrix && (
                              <div className="mb-1 flex flex-wrap items-center gap-2 text-[10px] text-slate-400">
                                <span>Pitch type:</span>
                                <select
                                  className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-slate-100"
                                  value={pitchType ?? ""}
                                  onChange={(e) =>
                                    handlePitchMatrixTypeChange(
                                      metric.id,
                                      playerId,
                                      pitchCountSafe,
                                      e.target.value
                                    )
                                  }
                                  disabled={isFinalized}
                                >
                                  <option value="">Select</option>
                                  {ADDITIONAL_PITCH_TYPE_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}
                            <div className="grid grid-cols-5 gap-1">
                              {pitches.map((code, idx) => (
                                <div
                                  key={`${metric.id}-${playerId}-pitch-${idx}`}
                                  className="flex flex-col items-stretch"
                                >
                                  <div className="text-[9px] text-slate-500 mb-0.5">
                                    Pitch {idx + 1}
                                  </div>
                                  <select
                                    className="w-full rounded-md bg-slate-950 border border-slate-700 px-1 py-0.5 text-[11px]"
                                    value={code}
                                    onChange={(e) =>
                                      handleHittingMatrixSwingChange(
                                        metric.id,
                                        playerId,
                                        idx,
                                        e.target.value,
                                        options,
                                        pitchCountSafe,
                                        {
                                          pitchType,
                                          forceObject: keepObjectFormat,
                                        }
                                      )
                                    }
                                    disabled={isFinalized}
                                  >
                                    <option value="">—</option>
                                    {options.map((opt) => (
                                      <option key={opt.code} value={opt.code}>
                                        {opt.label}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              ))}
                            </div>
                            <div className="mt-1 text-[10px] text-slate-400">
                              Total:{" "}
                              <span className="font-mono text-slate-100">
                                {displayTotal ?? "—"}
                              </span>
                            </div>
                            {isExtraPitchMatrix && metricKey && (
                              <div className="mt-1 flex justify-center">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleRemoveExtraPitchMatrix(metric.id, metricKey, playerId)
                                  }
                                  disabled={isFinalized}
                                  className="rounded-md border border-red-500/60 bg-red-500/10 px-2 py-0.5 text-[10px] text-red-200 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  Remove pitch
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      );

                      })}
                    </tr>
                  );
                };

                // Per‑player "Add pitch type" handler
                const handleAddExtraPitchForPlayer = (playerId: string) => {
                  if (isFinalized) return;

                  const already = perPlayerExtraKeys[playerId] || new Set<string>();

                  const nextMetric = extraPitchMetrics.find((m) => {
                    const metricKey = (m as any).metric_key as string | undefined;
                    return metricKey && !already.has(metricKey);
                  });

                  if (!nextMetric) return;

                  const nextKey = (nextMetric as any)
                    .metric_key as string | undefined;
                  if (!nextKey) return;

                  setVisibleExtraPitchMatrices((prev) => {
                    const current = prev[playerId] ?? [];
                    if (current.includes(nextKey)) return prev;
                    return {
                      ...prev,
                      [playerId]: [...current, nextKey],
                    };
                  });
                };

                // 1) Base command matrices (10/20 pitches)
                baseCommandMetrics.forEach((m) => pushPitchMatrixRow(m));

                // 2) Per‑player "Add pitch" row (only if the template has extras)
                if (extraPitchMetrics.length > 0) {
                  rows.push(
                    <tr
                      key={`${group.key}-add-extra-pitch`}
                      className="border-b border-slate-800 bg-slate-950/40"
                    >
                      <td className="px-2 py-2 align-top">
                        <div className="text-[10px] text-slate-400">
                          Optional: track additional pitch types (change-up, slider,
                          cutter, etc.). Each player can have up to{" "}
                          {extraPitchMetrics.length} extra pitch matrices.
                        </div>
                      </td>
                      {gridColumns.map((col) => {
                        const playerId = col.id;
                        const used = perPlayerExtraCounts[playerId] ?? 0;
                        const max = extraPitchMetrics.length;
                        const disabled = isFinalized || used >= max;

                        return (
                          <td
                            key={`${group.key}-add-extra-pitch-${playerId}`}
                            className="px-2 py-2 text-center align-top"
                          >
                            <button
                              type="button"
                              onClick={() => handleAddExtraPitchForPlayer(playerId)}
                              disabled={disabled}
                              className={[
                                "px-2 py-0.5 rounded-md border text-[11px]",
                                disabled
                                  ? "border-slate-700 text-slate-500 bg-slate-900 cursor-not-allowed opacity-60"
                                  : "border-emerald-500/80 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20",
                              ].join(" ")}
                            >
                              {used === 0 ? "Add pitch" : "Add another"}
                            </button>
                            <div className="mt-1 text-[10px] text-slate-400">
                              {used}/{max} added
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                }

                // 3) Extra matrices that are active for at least one player
                extraPitchMetrics.forEach((m) => {
                  const metricKey = (m as any).metric_key as string | undefined;
                  if (!metricKey) return;
                  if (!activeExtraMetricKeys.has(metricKey)) return;
                  pushPitchMatrixRow(m);
                });

                // 4) Any remaining metrics fall back to generic rendering
                const remaining = group.metrics.filter((m) => {
                  const metricKey = (m as any).metric_key as string | undefined;
                  if (metricKey && extraPitchKeys.has(metricKey)) {
                    return false; // handled above
                  }
                  return !usedIds.has(m.id);
                });
                remaining.forEach((m) => pushDefaultRow(m));

                return <Fragment key={group.key}>{rows}</Fragment>;
              }



              // Special layout: First Base (1B) – Catching & Fielding
              if (isFirstBaseGroup) {
                const usedIds = new Set<number>();

                const byKey = new Map<string, AssessmentMetric>();
                for (const m of group.metrics) {
                  const metricKey = (m as any).metric_key as string | undefined;
                  if (metricKey) byKey.set(metricKey, m);
                }

                const findFirstBaseKeyForMetric = (
                  metric: AssessmentMetric
                ): FirstBaseMatrixKey | undefined => {
                  const metricKey = (metric as any).metric_key as string | undefined;
                  if (!metricKey) return undefined;
                  const entry = (Object.entries(
                    FIRSTBASE_MATRIX_METRIC_KEYS
                  ) as [FirstBaseMatrixKey, string][]).find(
                    ([, key]) => key === metricKey
                  );
                  return entry?.[0];
                };

                const pushFirstBaseMatrixRow = (metric: AssessmentMetric) => {
                  const fbKey = findFirstBaseKeyForMetric(metric);
                  if (!fbKey) {
                    return pushDefaultRow(metric);
                  }

                  usedIds.add(metric.id);

                  const metricKey = (metric as any).metric_key as string | undefined;
                  const meta = metricKey ? getMetricMeta(metricKey) : undefined;
                  const repCount = FIRSTBASE_REP_COUNTS[fbKey] ?? 10;
                  const options = FIRSTBASE_MATRIX_OPTIONS[fbKey] ?? [];
                  const pointsMap = new Map<string, number>();
                  options.forEach((opt) => pointsMap.set(opt.code, opt.points));

                  const displayName =
                    meta?.displayName || (metric as any).label || "1B Test";

                  const description =
                    meta?.instructions ||
                    "Score each rep using the buttons below. Total score is calculated automatically.";

                  const gridColsClass =
                    repCount <= 3 ? "grid-cols-3" : "grid-cols-5";

                  rows.push(
                    <tr
                      key={`${group.key}-firstbase-matrix-${metric.id}`}
                      className="border-b border-slate-800"
                    >
                      <td className="align-top px-2 py-2">
                        <div className="font-medium text-slate-100">
                          {displayName}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          {description}
                        </div>
                      </td>
                      {gridColumns.map((col) => {
                        const playerId = col.id;
                        const perPlayer =
                          (sessionData?.values as any)?.[playerId] || {};
                        const v = perPlayer[metric.id];
                        const storedText = v?.value_text;
                        const numericValue = v?.value_numeric;

                        const repCountSafe = repCount > 0 ? repCount : 10;
                        let reps: string[] = new Array(repCountSafe).fill("");

                        if (
                          typeof storedText === "string" &&
                          storedText.trim() !== ""
                        ) {
                          try {
                            const parsed = JSON.parse(storedText);
                            if (Array.isArray(parsed)) {
                              for (
                                let i = 0;
                                i < Math.min(parsed.length, repCountSafe);
                                i++
                              ) {
                                reps[i] = String(parsed[i] ?? "");
                              }
                            }
                          } catch {
                            // ignore parse errors
                          }
                        }

                        const displayTotal =
                          typeof numericValue === "number" &&
                          !Number.isNaN(numericValue)
                            ? numericValue
                            : reps.reduce((sum, code) => {
                                if (!code) return sum;
                                return sum + (pointsMap.get(code) ?? 0);
                              }, 0);

                        return (
                          <td
                            key={`${metric.id}-${playerId}`}
                            className="px-2 py-2 align-top"
                          >
                            <div className="flex flex-col gap-1">
                              <div className={`grid ${gridColsClass} gap-1`}>
                                {reps.map((code, idx) => (
                                  <div
                                    key={`${metric.id}-${playerId}-${idx}`}
                                    className="flex flex-col gap-0.5"
                                  >
                                    <div className="text-[10px] text-slate-400 text-center">
                                      Rep {idx + 1}
                                    </div>
                                    <select
                                      className="w-full rounded border border-slate-700 bg-slate-900 px-1 py-0.5 text-[10px]"
                                      value={code}
                                      disabled={isFinalized}
                                      onChange={(e) =>
                                        handleHittingMatrixSwingChange(
                                          metric.id,
                                          playerId,
                                          idx,
                                          e.target.value,
                                          options,
                                          repCountSafe
                                        )
                                      }
                                    >
                                      <option value="">—</option>
                                      {options.map((opt) => (
                                        <option key={opt.code} value={opt.code}>
                                          {opt.label}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                ))}
                              </div>
                              <div className="text-[10px] text-slate-400 text-center">
                                Score:{" "}
                                <span className="font-mono">
                                  {displayTotal ?? "—"}
                                </span>
                              </div>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                };

                if (isFirstBaseCatchingGroup) {
                  const catchingMetric = byKey.get(
                    FIRSTBASE_MATRIX_METRIC_KEYS.catching
                  );
                  const scoopsMetric = byKey.get(
                    FIRSTBASE_MATRIX_METRIC_KEYS.scoops
                  );

                  if (catchingMetric) pushFirstBaseMatrixRow(catchingMetric);
                  if (scoopsMetric) pushFirstBaseMatrixRow(scoopsMetric);
                }

                if (isFirstBaseFieldingGroup) {
                  // RLC Grounders (6 reps, direction + result)
                  const grounders: {
                    repIndex: number;
                    directionMetric?: AssessmentMetric;
                    pointsMetric?: AssessmentMetric;
                  }[] = [];

                  for (let i = 1; i <= 6; i++) {
                    const dir = byKey.get(`rlc1b_grounder_${i}_direction`);
                    const pts = byKey.get(`rlc1b_grounder_${i}_points`);
                    if (dir || pts) {
                      if (dir) usedIds.add(dir.id);
                      if (pts) usedIds.add(pts.id);
                      grounders.push({
                        repIndex: i,
                        directionMetric: dir,
                        pointsMetric: pts,
                      });
                    }
                  }

                  if (grounders.length > 0) {
                    rows.push(
                      <tr
                        key={`${group.key}-rlc1b-grounders`}
                        className="border-b border-slate-800"
                      >
                        <td className="align-top px-2 py-2">
                          <div className="font-medium text-slate-100">
                            RLC Grounders – 1B (6 reps)
                          </div>
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            Hit 6 ground balls: 2 center, 2 right, 2 left. Score
                            each rep: 0 = didn&apos;t field; 2 = fielded clean and
                            ran to 1B. Direction is stored for reporting only.
                          </div>
                        </td>
                        {gridColumns.map((col) => {
                          const playerId = col.id;
                          const perPlayer =
                            (sessionData?.values as any)?.[playerId] || {};

                          return (
                            <td
                              key={`${group.key}-rlc1b-${playerId}`}
                              className="px-2 py-2 align-top"
                            >
                              <div className="flex flex-col gap-1">
                                {grounders.map((g) => {
                                  const dirMetric = g.directionMetric;
                                  const ptsMetric = g.pointsMetric;

                                  const dirValue =
                                    dirMetric &&
                                    perPlayer[dirMetric.id]?.value_text;
                                  const ptsValue =
                                    ptsMetric &&
                                    perPlayer[ptsMetric.id]?.value_numeric;

                                  return (
                                    <div
                                      key={`${group.key}-rlc1b-${playerId}-${g.repIndex}`}
                                      className="flex flex-wrap items-center gap-1"
                                    >
                                      <span className="text-[10px] text-slate-400 w-10">
                                        Rep {g.repIndex}
                                      </span>
                                      {dirMetric && (
                                        <select
                                          className="rounded border border-slate-700 bg-slate-900 px-1 py-0.5 text-[10px]"
                                          disabled={isFinalized}
                                          value={dirValue ?? ""}
                                          onChange={(e) =>
                                            handleTextValueChange(
                                              dirMetric.id,
                                              playerId,
                                              e.target.value || null
                                            )
                                          }
                                        >
                                          <option value="">Dir</option>
                                          <option value="center">Center</option>
                                          <option value="right">Right</option>
                                          <option value="left">Left</option>
                                        </select>
                                      )}
                                      {ptsMetric && (
                                        <select
                                          className="rounded border border-slate-700 bg-slate-900 px-1 py-0.5 text-[10px]"
                                          disabled={isFinalized}
                                          value={
                                            typeof ptsValue === "number"
                                              ? String(ptsValue)
                                              : ""
                                          }
                                          onChange={(e) =>
                                            handleValueChange(
                                              ptsMetric.id,
                                              playerId,
                                              e.target.value
                                            )
                                          }
                                        >
                                          <option value="">Result</option>
                                          <option value="0">
                                            Didn&apos;t field (0)
                                          </option>
                                          <option value="2">
                                            Fielded &amp; to 1B (2)
                                          </option>
                                        </select>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  }

                  const fbflyMetric = byKey.get(FIRSTBASE_MATRIX_METRIC_KEYS.fly);
                  const fbldMetric = byKey.get(
                    FIRSTBASE_MATRIX_METRIC_KEYS.lineDrive
                  );

                  if (fbflyMetric) {
                    usedIds.add(fbflyMetric.id);
                    pushFirstBaseMatrixRow(fbflyMetric);
                  }
                  if (fbldMetric) {
                    usedIds.add(fbldMetric.id);
                    pushFirstBaseMatrixRow(fbldMetric);
                  }
                }

                // Any remaining First Base metrics fall back to generic rendering
                const remainingFirstBaseMetrics = group.metrics.filter(
                  (m) => !usedIds.has(m.id)
                );
                remainingFirstBaseMetrics.forEach((m) => pushDefaultRow(m));

                return <Fragment key={group.key}>{rows}</Fragment>;
              }

              // Special layout: Infield – Fielding & Catching
              if (isInfieldGroup) {
                const usedIds = new Set<number>();

                const byKey = new Map<string, AssessmentMetric>();
                for (const m of group.metrics) {
                  const metricKey = (m as any)
                    .metric_key as string | undefined;
                  if (metricKey) byKey.set(metricKey, m);
                }

                // -----------------------
                // Fielding: RLCG 2B / SS / 3B
                // -----------------------
                if (isInfieldFieldingGroup) {
                  const renderRlcGrounders = (
                    prefix: string,
                    label: string
                  ) => {
                    type RlcGrounderSpec = {
                      directionMetric?: AssessmentMetric;
                      pointsMetric?: AssessmentMetric;
                      repIndex: number;
                    };

                    const grounders: RlcGrounderSpec[] = [];

                    for (let rep = 1; rep <= 6; rep++) {
                      const dirMetric = byKey.get(
                        `${prefix}_${rep}_direction`
                      );
                      const ptsMetric = byKey.get(
                        `${prefix}_${rep}_points`
                      );

                      if (!dirMetric && !ptsMetric) continue;

                      if (dirMetric) usedIds.add(dirMetric.id);
                      if (ptsMetric) usedIds.add(ptsMetric.id);

                      grounders.push({
                        directionMetric: dirMetric,
                        pointsMetric: ptsMetric,
                        repIndex: rep,
                      });
                    }

                    if (grounders.length === 0) return;

                    rows.push(
                      <tr
                        key={`${group.key}-${prefix}`}
                        className="border-b border-slate-800"
                      >
                        <td className="align-top px-2 py-2">
                          <div className="font-medium text-slate-100">
                            {label}
                          </div>
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            Hit 6 ground balls to the infielder. Two should be
                            at the player, two should require moving to the
                            right, and two to the left. The player should not
                            know the direction in advance.
                          </div>
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            Score each rep: 0 = Didn&apos;t field, 1 = Fielded
                            but missed target, 2 = Fielded and hit target at
                            1B. Max score per position is 12 points.
                          </div>
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            Distance / exit velo guidelines: 10U–11U ≈ 45&nbsp;
                            mph &amp; 10&nbsp;ft; 12U–14U ≈ 55&nbsp;mph &amp;
                            20&nbsp;ft; HS–Pro ≈ 65&nbsp;mph &amp; 30&nbsp;ft.
                          </div>
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            Direction is stored for reporting and doesn&apos;t
                            affect the score.
                          </div>
                        </td>
                        {gridColumns.map((col) => {
                          const playerId = col.id;
                          const perPlayer =
                            (sessionData?.values as any)?.[playerId] || {};

                          let totalPoints = 0;

                          return (
                            <td
                              key={`${group.key}-${prefix}-${playerId}`}
                              className="px-2 py-2 align-top"
                            >
                              <div className="flex flex-col gap-1">
                                {grounders.map((g) => {
                                  const dirMetric = g.directionMetric;
                                  const ptsMetric = g.pointsMetric;
                                  const rawDir =
                                    dirMetric &&
                                    perPlayer[dirMetric.id]?.value_text;
                                  const numericPoints =
                                    ptsMetric &&
                                    perPlayer[ptsMetric.id]?.value_numeric;

                                  if (
                                    typeof numericPoints === "number" &&
                                    !Number.isNaN(numericPoints)
                                  ) {
                                    totalPoints += numericPoints;
                                  }

                                  return (
                                    <div
                                      key={`${group.key}-${prefix}-${playerId}-${g.repIndex}`}
                                      className="flex flex-wrap items-center gap-1"
                                    >
                                      <span className="text-[10px] text-slate-400 w-10">
                                        Rep {g.repIndex}
                                      </span>
                                      {dirMetric && (
                                        <select
                                          className="rounded border border-slate-700 bg-slate-900 px-1 py-0.5 text-[10px]"
                                          disabled={isFinalized}
                                          value={rawDir ?? ""}
                                          onChange={(e) =>
                                            handleTextValueChange(
                                              dirMetric.id,
                                              playerId,
                                              e.target.value || null
                                            )
                                          }
                                        >
                                          <option value="">Dir</option>
                                          <option value="center">
                                            Center
                                          </option>
                                          <option value="right">
                                            Right
                                          </option>
                                          <option value="left">Left</option>
                                        </select>
                                      )}
                                      {ptsMetric && (
                                        <select
                                          className="rounded border border-slate-700 bg-slate-900 px-1 py-0.5 text-[10px]"
                                          disabled={isFinalized}
                                          value={
                                            typeof numericPoints === "number"
                                              ? String(numericPoints)
                                              : ""
                                          }
                                          onChange={(e) =>
                                            handleValueChange(
                                              ptsMetric.id,
                                              playerId,
                                              e.target.value
                                            )
                                          }
                                        >
                                          <option value="">Result</option>
                                          <option value="0">
                                            Didn&apos;t field (0)
                                          </option>
                                          <option value="1">
                                            Fielded / missed target (1)
                                          </option>
                                          <option value="2">
                                            Fielded &amp; hit target (2)
                                          </option>
                                        </select>
                                      )}
                                    </div>
                                  );
                                })}
                                <div className="mt-1 text-[10px] text-slate-400">
                                  Score:{" "}
                                  <span className="font-mono">
                                    {totalPoints || "—"}
                                  </span>
                                </div>
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  };

                  renderRlcGrounders(
                    "rlc2b_grounder",
                    "RLC Grounders – 2B (6 reps)"
                  );
                  renderRlcGrounders(
                    "rlcss_grounder",
                    "RLC Grounders – SS (6 reps)"
                  );
                  renderRlcGrounders(
                    "rlc3b_grounder",
                    "RLC Grounders – 3B (6 reps)"
                  );
                  renderRlcGrounders(
                      "rlcp_grounder",
                      "RLC Grounders – P (6 reps)"
                  );
                }

                // -----------------------
                // Catching: CIFF / CLD
                // -----------------------
                if (isInfieldCatchingGroup) {
                  const infieldKeyForMetric = (
                    metric: AssessmentMetric
                  ): InfieldCatchMatrixKey | undefined => {
                    const metricKey = (metric as any)
                      .metric_key as string | undefined;
                    if (!metricKey) return undefined;
                    const entry = (
                      Object.entries(
                        INFIELD_CATCH_MATRIX_KEYS
                      ) as [InfieldCatchMatrixKey, string][]
                    ).find(([, key]) => key === metricKey);
                    return entry?.[0];
                  };

                  const pushInfieldCatchMatrixRow = (
                    metric: AssessmentMetric
                  ) => {
                    const infKey = infieldKeyForMetric(metric);
                    if (!infKey) {
                      return pushDefaultRow(metric);
                    }

                    usedIds.add(metric.id);

                    const metricKey = (metric as any)
                      .metric_key as string | undefined;
                    const meta = metricKey ? getMetricMeta(metricKey) : undefined;
                    const repCount = INFIELD_CATCH_REP_COUNTS[infKey] ?? 3;
                    const options = INFIELD_CATCH_MATRIX_OPTIONS[infKey] ?? [];
                    const pointsMap = new Map<string, number>();
                    options.forEach((opt) =>
                      pointsMap.set(opt.code, opt.points)
                    );

                    const displayName =
                      meta?.displayName ||
                      (metric as any).label ||
                      "Infield Catching Test";

                    const description =
                      meta?.instructions ||
                      "Hit 3 balls to this position. 0 points for a miss and 2 points for a catch. Total score is calculated automatically.";

                    rows.push(
                      <tr
                        key={`${group.key}-infield-catch-${metric.id}`}
                        className="border-b border-slate-800"
                      >
                        <td className="align-top px-2 py-2">
                          <div className="font-medium text-slate-100">
                            {displayName}
                          </div>
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            {description}
                          </div>
                        </td>
                        {gridColumns.map((col) => {
                          const playerId = col.id;
                          const perPlayer =
                            (sessionData?.values as any)?.[playerId] || {};
                          const v = perPlayer[metric.id];

                          const numericValue = v?.value_numeric;
                          const textValue = v?.value_text;

                          let events: string[] = [];
                          if (typeof textValue === "string" && textValue) {
                            try {
                              const parsed = JSON.parse(textValue);
                              if (Array.isArray(parsed)) {
                                events = parsed.map((s) => String(s));
                              }
                            } catch {
                              // ignore malformed
                            }
                          }

                          while (events.length < repCount) {
                            events.push("");
                          }
                          if (events.length > repCount) {
                            events = events.slice(0, repCount);
                          }

                          const total =
                            typeof numericValue === "number" &&
                            !Number.isNaN(numericValue)
                              ? numericValue
                              : events.reduce(
                                  (sum, code) =>
                                    sum + (pointsMap.get(code) ?? 0),
                                  0
                                );

                          return (
                            <td
                              key={`${group.key}-infcatch-${metric.id}-${playerId}`}
                              className="px-2 py-2 align-top"
                            >
                              <div className="flex flex-col gap-1">
                                <div className="grid grid-cols-3 gap-1">
                                  {events.map((code, repIndex) => (
                                    <button
                                      key={`${group.key}-infcatch-${metric.id}-${playerId}-${repIndex}`}
                                      type="button"
                                      className={[
                                        "px-1 py-0.5 rounded text-[10px] border",
                                        code === "catch"
                                          ? "border-emerald-400 bg-emerald-500/10 text-emerald-100"
                                          : code === "miss"
                                          ? "border-rose-400 bg-rose-500/10 text-rose-100"
                                          : "border-slate-700 bg-slate-900 text-slate-200",
                                      ].join(" ")}
                                      disabled={isFinalized}
                                      onClick={() => {
                                        const nextCode =
                                          code === "catch"
                                            ? "miss"
                                            : code === "miss"
                                            ? ""
                                            : "catch";
                                        handleHittingMatrixSwingChange(
                                          metric.id,
                                          playerId,
                                          repIndex,
                                          nextCode,
                                          options,
                                          repCount
                                        );
                                      }}
                                    >
                                      Rep {repIndex + 1}:{" "}
                                      {code === "catch"
                                        ? "Catch (2)"
                                        : code === "miss"
                                        ? "Miss (0)"
                                        : "—"}
                                    </button>
                                  ))}
                                </div>
                                <div className="mt-1 text-[10px] text-slate-400">
                                  Score:{" "}
                                  <span className="font-mono">
                                    {total || "—"}
                                  </span>
                                </div>
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  };

                  // Order: fly balls 2B/SS/3B, then line drives 2B/SS/3B
                  const fly2b = byKey.get(INFIELD_CATCH_MATRIX_KEYS.fly2b);
                  const flySs = byKey.get(INFIELD_CATCH_MATRIX_KEYS.flySs);
                  const fly3b = byKey.get(INFIELD_CATCH_MATRIX_KEYS.fly3b);
                  const ld2b = byKey.get(INFIELD_CATCH_MATRIX_KEYS.ld2b);
                  const ldSs = byKey.get(INFIELD_CATCH_MATRIX_KEYS.ldSs);
                  const ld3b = byKey.get(INFIELD_CATCH_MATRIX_KEYS.ld3b);

                  if (fly2b) pushInfieldCatchMatrixRow(fly2b);
                  if (flySs) pushInfieldCatchMatrixRow(flySs);
                  if (fly3b) pushInfieldCatchMatrixRow(fly3b);
                  if (ld2b) pushInfieldCatchMatrixRow(ld2b);
                  if (ldSs) pushInfieldCatchMatrixRow(ldSs);
                  if (ld3b) pushInfieldCatchMatrixRow(ld3b);
                }

                // Any remaining Infield metrics fall back to generic rendering
                const remainingInfieldMetrics = group.metrics.filter(
                  (m) => !usedIds.has(m.id)
                );
                remainingInfieldMetrics.forEach((m) => pushDefaultRow(m));

                return <Fragment key={group.key}>{rows}</Fragment>;
              }


              // Special layout: Hitting → per-swing matrices + generic rows
              // Special layout: Hitting → per-swing matrices + generic rows
              if (isHittingGroup) {
                const byKey = new Map<string, AssessmentMetric>();
                group.metrics.forEach((m) => {
                  const metricKey = (m as any).metric_key as string | undefined;
                  if (metricKey) {
                    byKey.set(metricKey, m);
                  }
                });

                const fastballMetric = byKey.get(HITTING_MATRIX_METRIC_KEYS.fastball);
                const youthPitchMetric = byKey.get(HITTING_MATRIX_METRIC_KEYS.youthPitch);
                const youthTeeMetric = byKey.get(HITTING_MATRIX_METRIC_KEYS.youthTee);
                const varSpeedMetric = byKey.get(HITTING_MATRIX_METRIC_KEYS.varSpeed);
                const curveballMetric = byKey.get(HITTING_MATRIX_METRIC_KEYS.curveball);

                const usedIds = new Set<number>();
                if (fastballMetric) usedIds.add(fastballMetric.id);
                if (youthPitchMetric) usedIds.add(youthPitchMetric.id);
                if (youthTeeMetric) usedIds.add(youthTeeMetric.id);
                if (varSpeedMetric) usedIds.add(varSpeedMetric.id);
                if (curveballMetric) usedIds.add(curveballMetric.id);

                const pushMatrixRow = (
                  metric: AssessmentMetric,
                  swingSetKey: keyof typeof HITTING_MATRIX_METRIC_KEYS
                ) => {
                  const metricKey = (metric as any).metric_key as string | undefined;
                  const meta = metricKey ? getMetricMeta(metricKey) : undefined;
                  const options = HITTING_MATRIX_OPTIONS[swingSetKey] ?? [];
                  const pointsMap = new Map<string, number>();
                  options.forEach((opt) => pointsMap.set(opt.code, opt.points));

                  const swingCount = HITTING_SWING_COUNTS[swingSetKey] ?? 10;

                  const displayName =
                    meta?.displayName || (metric as any).label || "Hitting Matrix";

                  const description =
                    meta?.instructions ||
                    "Select the outcome of each swing. The total score is calculated automatically.";

                  rows.push(
                    <tr
                      key={`${group.key}-hit-matrix-${metric.id}`}
                      className="border-b border-slate-800"
                    >
                      <td className="align-top px-2 py-2">
                        <div className="font-medium text-slate-100">{displayName}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          {description}
                        </div>
                      </td>

                      {gridColumns.map((col) => {
                        const playerId = col.id;
                        const perPlayer = (sessionData?.values as any)?.[playerId] || {};
                        const v = perPlayer[metric.id];
                        const storedText = v?.value_text;
                        const numericValue = v?.value_numeric;

                        let swings: string[] = new Array(swingCount).fill("");

                        if (typeof storedText === "string" && storedText.trim() !== "") {
                          try {
                            const parsed = JSON.parse(storedText);
                            if (Array.isArray(parsed)) {
                              for (
                                let i = 0;
                                i < Math.min(parsed.length, swingCount);
                                i++
                              ) {
                                swings[i] = String(parsed[i] ?? "");
                              }
                            }
                          } catch {
                            // ignore parse errors
                          }
                        }

                        const displayTotal =
                          typeof numericValue === "number"
                            ? numericValue
                            : swings.reduce(
                                (sum, code) => sum + (pointsMap.get(code) ?? 0),
                                0
                              );

                        return (
                          <td
                            key={`${group.key}-hit-matrix-${metric.id}-${playerId}`}
                            className="px-2 py-1 align-top text-center"
                          >
                            <div className="flex flex-col gap-1">
                              <div className="grid grid-cols-2 gap-1">
                                {Array.from({ length: swingCount }).map((_, idx) => {
                                  const code = swings[idx] || "";
                                  return (
                                    <div
                                      key={`${metric.id}-${playerId}-swing-${idx}`}
                                      className="flex flex-col items-stretch"
                                    >
                                      <div className="text-[9px] text-slate-500 mb-0.5">
                                        Swing {idx + 1}
                                      </div>
                                      <select
                                        className="w-full rounded-md bg-slate-950 border border-slate-700 px-1 py-0.5 text-[11px]"
                                        value={code}
                                        onChange={(e) =>
                                          handleHittingMatrixSwingChange(
                                            metric.id,
                                            playerId,
                                            idx,
                                            e.target.value,
                                            options,
                                            swingCount
                                          )
                                        }
                                        disabled={isFinalized}
                                      >
                                        <option value="">—</option>
                                        {options.map((opt) => (
                                          <option key={opt.code} value={opt.code}>
                                            {opt.label}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                  );
                                })}
                              </div>
                              <div className="text-[10px] text-slate-400">
                                Total:{" "}
                                <span className="font-mono">{displayTotal || "—"}</span>
                              </div>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                };

                if (fastballMetric) pushMatrixRow(fastballMetric, "fastball");
                if (youthPitchMetric) pushMatrixRow(youthPitchMetric, "youthPitch");
                if (youthTeeMetric) pushMatrixRow(youthTeeMetric, "youthTee");
                if (varSpeedMetric) pushMatrixRow(varSpeedMetric, "varSpeed");
                if (curveballMetric) pushMatrixRow(curveballMetric, "curveball");

                // Any other Hitting metrics (bat speed, exit velo, tee LD, etc.) use default rendering
                const remainingHittingMetrics = group.metrics.filter(
                  (m) => !usedIds.has(m.id)
                );
                remainingHittingMetrics.forEach((m) => pushDefaultRow(m));

                return <Fragment key={group.key}>{rows}</Fragment>;
              }


              // Default: generic numeric / select rows
              group.metrics.forEach((m) => pushDefaultRow(m));
              return <Fragment key={group.key}>{rows}</Fragment>;
              })}
              </tbody>


            </table>
          )}
        </div>

        {saveError && (
          <p className="text-xs text-red-400 whitespace-pre-line">
            {saveError}
          </p>
        )}
        {finalizeError && (
          <p className="text-xs text-red-400 whitespace-pre-line">
            {finalizeError}
          </p>
        )}

        <div className="pt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !dirty || isFinalized}
            className="inline-flex items-center px-3 py-1.5 rounded-md border border-slate-600 bg-slate-800 text-slate-100 text-xs font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saving ? "Saving…" : "Save progress"}
          </button>
          <button
            type="button"
            onClick={handleFinalize}
            disabled={
              finalizing ||
              isFinalized ||
              metrics.length === 0 ||
              gridColumns.length === 0
            }
            className="inline-flex items-center px-3 py-1.5 rounded-md border border-emerald-500/80 bg-emerald-500/10 text-emerald-200 text-xs font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {finalizing
              ? "Finalizing…"
              : isFinalized
              ? "Session finalized"
              : "Finalize session & create assessments"}
          </button>
        </div>
      </section>


      {/* Debug: raw session JSON */}
      <section className="rounded-xl bg-slate-900/70 border border-slate-700 p-3 text-xs text-slate-300">
        <div className="font-semibold mb-1">Raw session data (debug)</div>
        <pre className="text-[10px] whitespace-pre-wrap break-all">
          {JSON.stringify({ session, sessionData }, null, 2)}
        </pre>
      </section>
    </div>
  );
}
