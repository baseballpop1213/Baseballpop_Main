// src/pages/Assessments/AssessmentSessionPage.tsx
import { useEffect, useMemo, useState, Fragment } from "react";
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


// Options for each pitch: same 0/1/3 rubric across command tests
const PITCH_COMMAND_OPTIONS: HittingSwingOption[] = [
  { code: "miss", label: "Miss (0)", points: 0 },
  { code: "target", label: "Hit target (1)", points: 1 },
  { code: "section", label: "Hit called section (3)", points: 3 },
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

  // Load template + metrics for this session
  useEffect(() => {
    if (!session?.template_id) return;

    const templateId = session.template_id;
    let cancelled = false;

    async function loadTemplate() {
      setLoadingTemplate(true);
      setTemplateError(null);

      try {
        const data = await getTemplateWithMetrics(templateId);
        if (!cancelled) {
          setTemplate(data.template);
          setMetrics(data.metrics || []);
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
  }, [session?.template_id]);

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

  const effectiveEvalType =
    session?.evaluation_type ?? (sessionData as any)?.evaluation_type ?? null;

  // Athletic Skills: which section is active in the grid tabs
  const [activeAthleticBlock, setActiveAthleticBlock] = useState<
    "speed" | "strength" | "power" | "balance" | "mobility"
  >("speed");

  // Hitting: Tee vs Live section in the grid tabs
  const [activeHittingSection, setActiveHittingSection] = useState<
    "tee" | "live"
  >("tee");

  // First Base (1B): Catching vs Fielding section
  const [activeFirstBaseSection, setActiveFirstBaseSection] = useState<
    "catching" | "fielding"
  >("catching");

  
  // Pitching: which “additional pitch” matrices are visible in the grid
  // (we always show any that already have data; this just controls which
  // empty slots are revealed by the "Add another pitch type" button)
  const [visibleExtraPitchMatrices, setVisibleExtraPitchMatrices] = useState<
    string[]
  >([]);


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

  
  // For Athletic Skills, Hitting, and First Base, show only the metrics for the active block/tab
  const visibleGroupedMetrics = useMemo(() => {
    let groups = groupedMetrics.map((g) => ({
      ...g,
      metrics: [...g.metrics],
    }));

    if (effectiveEvalType === "athletic") {
      // For Athletic Skills, hide BASEDIST helper metrics and only show the active block
      const speedKeys = new Set([
        "m_10_30yd_dash",
        "m_10_60yd_dash",
        "m_10_home_to_1st",
      ]);

      const strengthKeys = new Set([
        "apush_60",
        "asit_60",
        "apush_30",
        "asit_30",
      ]);

      const powerKeys = new Set([
        "bs_swing_velocity",
        "bs_medball_put",
        "bs_medball_throw",
      ]);

      const mobilityKeys = new Set([
        "msr1",
        "msr2",
        "msr3",
        "deep_squat",
        "single_leg_squat_left",
        "single_leg_squat_right",
      ]);

      groups = groups
        .map((group) => {
          const filtered = group.metrics.filter((m) => {
            const metricKey = (m as any).metric_key as string | undefined;
            if (!metricKey) return true;

            // Drop "BASEDIST" helper metrics from the UI
            if (metricKey.toLowerCase().includes("basedist")) {
              return false;
            }

            if (activeAthleticBlock === "speed") {
              return speedKeys.has(metricKey);
            }
            if (activeAthleticBlock === "strength") {
              return strengthKeys.has(metricKey);
            }
            if (activeAthleticBlock === "power") {
              return powerKeys.has(metricKey);
            }
            if (activeAthleticBlock === "mobility") {
              return mobilityKeys.has(metricKey);
            }

            // Fallback: include anything else
            return true;
          });

          return {
            ...group,
            metrics: filtered,
          };
        })
        .filter((g) => g.metrics.length > 0);
    } else if (effectiveEvalType === "hitting") {
      // For Hitting, split metrics into Tee Work vs Live Pitching
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

            // If we haven't explicitly categorized the metric, show it on both tabs
            if (!inTee && !inLive) {
              return true;
            }

            return activeHittingSection === "tee" ? inTee : inLive;
          });

          return {
            ...group,
            metrics: filtered,
          };
        })
        .filter((g) => g.metrics.length > 0);
    } else if (effectiveEvalType === "firstbase" && hasFirstBaseFieldingGroup) {
      // For First Base evals that actually have Fielding metrics, split into "Catching" and "Fielding" tabs
      const allowedLabels =
        activeFirstBaseSection === "catching"
          ? ["First Base – Catching"]
          : ["First Base – Fielding"];

      const allowedLower = allowedLabels.map((s) => s.toLowerCase());

      groups = groups.filter((g) =>
        allowedLower.includes(g.label.toLowerCase())
      );
    }

    return groups;
  }, [
    groupedMetrics,
    effectiveEvalType,
    activeAthleticBlock,
    activeHittingSection,
    activeFirstBaseSection,
    hasFirstBaseFieldingGroup,
  ]);


  // Overall progress: how many metrics have at least one value for any player
  const metricsCompletion = useMemo(() => {
    if (!metrics.length || !gridColumns.length || !sessionData) {
      return { metricsWithAnyValue: 0, totalMetrics: metrics.length };
    }

    const values = sessionData.values || {};
    let metricsWithAnyValue = 0;

    for (const m of metrics) {
      const metricId = m.id;
      let hasValue = false;

      for (const col of gridColumns) {
        const perPlayer = (values as any)[col.id] || {};
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
          hasValue = true;
          break;
        }
      }

      if (hasValue) {
        metricsWithAnyValue += 1;
      }
    }

    return { metricsWithAnyValue, totalMetrics: metrics.length };
  }, [metrics, gridColumns, sessionData]);

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

    const metric = metrics.find(
      (m) => (m as any).metric_key === "ct2bt_seconds"
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
  // Hitting matrix: per-swing quality tests (H10FAST, H10PITCH, H10TEE, H5VAR, H5CB)
  function handleHittingMatrixSwingChange(
    metricId: number,
    playerId: string,
    swingIndex: number,
    swingCode: string,
    options: HittingSwingOption[],
    swingCount: number
  ) {
    if (!sessionData || isFinalized) return;

    const maxSwings = swingCount > 0 ? swingCount : 10;

    const idx =
      swingIndex < 0
        ? 0
        : swingIndex >= maxSwings
        ? maxSwings - 1
        : swingIndex;

    const pointsMap = new Map<string, number>();
    for (const opt of options) {
      pointsMap.set(opt.code, opt.points);
    }

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

      // Start with an empty swing array for this test
      let swings: string[] = new Array(maxSwings).fill("");

      if (
        existing?.value_text &&
        typeof existing.value_text === "string" &&
        existing.value_text.trim() !== ""
      ) {
        try {
          const parsed = JSON.parse(existing.value_text);
          if (Array.isArray(parsed)) {
            for (let i = 0; i < Math.min(parsed.length, maxSwings); i++) {
              swings[i] = String(parsed[i] ?? "");
            }
          }
        } catch {
          // ignore parse errors; treat as fresh
        }
      }

      // Update the selected swing
      swings[idx] = swingCode;

      // Compute total score and check if we have any non-empty swings
      let total = 0;
      let hasAny = false;
      for (const code of swings) {
        if (!code) continue;
        hasAny = true;
        total += pointsMap.get(code) ?? 0;
      }

      if (!hasAny) {
        // Clear the metric if all swings are blank
        byPlayer[metricId] = {
          value_numeric: null,
          value_text: null,
        };
      } else {
        byPlayer[metricId] = {
          value_numeric: total,
          value_text: JSON.stringify(swings),
        };
      }

      values[playerId] = byPlayer;
      base.values = values;

      return base;
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

      if (!metrics.length) {
        setFinalizeError(
          "No metrics are defined for this template. Cannot finalize."
        );
        return;
      }

      const valuesByPlayer = sessionData.values || {};
      const assessmentsByPlayer: Record<string, number> = {};
      let createdCount = 0;

      // Only create player_assessment records for roster players
      for (const playerId of rosterIds) {
        const perMetricValues = (valuesByPlayer as any)[playerId] || {};
        const valueArray = metrics
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
          template_id: session.template_id,
          kind: session.mode as EvalMode,
          values: valueArray,
        });

        if (result && typeof (result as any).assessment_id === "number") {
          assessmentsByPlayer[playerId] = (result as any).assessment_id;
          createdCount += 1;
        }
      }

      if (!createdCount && !isTryoutSession) {
        setFinalizeError(
          "No assessment records were created. Make sure you've entered at least one score for at least one player."
        );
        return;
      }

      const finalizedSessionData: EvalSessionData = {
        ...sessionData,
        player_ids: rosterIds,
        completed_metric_ids: metrics.map((m) => m.id),
        assessments_by_player: {
          ...(sessionData as any).assessments_by_player,
          ...assessmentsByPlayer,
        },
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

        {effectiveEvalType === "athletic" && (
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
            <span className="text-slate-400">Section:</span>
            {(
              ["speed", "strength", "power", "balance", "mobility"] as const
            ).map((block) => {
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

        {effectiveEvalType === "hitting" && (
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
            <span className="text-slate-400">Section:</span>
            {(["tee", "live"] as const).map((section) => {
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

        {effectiveEvalType === "catcher" && (
          <div className="mt-2 space-y-1 text-[11px]">
            <div className="font-semibold text-slate-200">
              Catcher Throw to 2B timer (CT2BT)
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
              
                  const rows: React.ReactNode[] = [];


                  // Group header row (Speed / Strength / Balance / Mobility / Hitting / etc.)
                  if (group.label !== "Other") {
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

                  // Helper for a generic metric row (used for non-special metrics)
              const pushDefaultRow = (m: AssessmentMetric) => {
                const metricKey = (m as any).metric_key as string | undefined;
                const meta = metricKey ? getMetricMeta(metricKey) : undefined;

                rows.push(
                  <tr key={`${group.key}-${m.id}`} className="border-b border-slate-800">
                    <td className="align-top px-2 py-1">
                      <div className="font-medium text-slate-100">
                        {meta?.displayName || (m as any).label || `Metric ${m.id}`}
                      </div>
                      {meta?.instructions && (
                        <div className="text-[10px] text-slate-500 mt-0.5">
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

                      // Select-style metrics (e.g. MSR, Toe Touch) – generic path
                      if (
                        meta?.inputType === "select" &&
                        meta.options &&
                        meta.options.length > 0
                      ) {
                        const selectValue =
                          numericValue !== null &&
                          numericValue !== undefined &&
                          !Number.isNaN(numericValue)
                            ? String(numericValue)
                            : textValue != null
                            ? String(textValue)
                            : "";

                        return (
                          <td
                            key={commonKey}
                            className="px-2 py-1 align-top text-center"
                          >
                            <select
                              className="w-full max-w-[7rem] rounded-md bg-slate-950 border border-slate-700 px-1 py-0.5 text-[11px]"
                              value={selectValue}
                              onChange={(e) =>
                                handleValueChange(m.id, playerId, e.target.value)
                              }
                              disabled={isFinalized}
                            >
                              <option value="">Select…</option>
                              {meta.options.map((opt) => (
                                <option
                                  key={String(opt.value)}
                                  value={String(opt.value)}
                                >
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          </td>
                        );
                      }

                      const value = numericValue ?? (textValue ?? "");

                      return (
                        <td
                          key={commonKey}
                          className="px-2 py-1 align-top text-center"
                        >
                          <input
                            type="number"
                            className="w-full max-w-[5rem] rounded-md bg-slate-950 border border-slate-700 px-1 py-0.5 text-[11px] text-center"
                            value={value === null ? "" : value}
                            onChange={(e) =>
                              handleValueChange(m.id, playerId, e.target.value)
                            }
                            disabled={isFinalized}
                            step={meta?.step ?? undefined}
                            min={meta?.min ?? undefined}
                            max={meta?.max ?? undefined}
                            placeholder={meta?.placeholder}
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              };

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

                // Which metric_keys are "additional pitch" 5-pitch matrices
                const extraPitchKeys = new Set<string>([
                  "tpitch5ap1",
                  "tpitch5ap2",
                  "tpitch5ap3",
                  "tpitch5ap4",
                  "tpitch5ap5",
                ]);

                const metricHasAnyValue = (metric: AssessmentMetric) => {
                  if (!sessionData?.values) return false;
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
                };

                const isExtraMetricVisible = (metric: AssessmentMetric) => {
                  const metricKey = (metric as any).metric_key as string | undefined;
                  if (!metricKey) return false;
                  return (
                    visibleExtraPitchMatrices.includes(metricKey) ||
                    metricHasAnyValue(metric)
                  );
                };

                const pushPitchMatrixRow = (metric: AssessmentMetric) => {
                  const metricKey = (metric as any).metric_key as string | undefined;
                  const config = metricKey ? PITCH_MATRIX_CONFIG[metricKey] : undefined;
                  if (!config) {
                    // e.g. max_throwing_speed stays as a simple numeric row
                    return pushDefaultRow(metric);
                  }

                  usedIds.add(metric.id);

                  const meta = metricKey ? getMetricMeta(metricKey) : undefined;
                  const pitchCount = config.pitchCount;
                  const displayName =
                    meta?.displayName || (metric as any).label || "Pitching Matrix";

                  const description =
                    meta?.instructions ||
                    "For each pitch, mark Miss (0), Hit target (1), or Hit called section (3). The total score is calculated automatically.";

                  const options = PITCH_COMMAND_OPTIONS;
                  const pointsMap = new Map<string, number>();
                  options.forEach((opt) => pointsMap.set(opt.code, opt.points));

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
                        const storedText = v?.value_text;
                        const numericValue = v?.value_numeric;

                        const pitchCountSafe = Math.max(1, pitchCount);
                        let pitches: string[] = new Array(pitchCountSafe).fill("");

                        if (
                          typeof storedText === "string" &&
                          storedText.trim() !== ""
                        ) {
                          try {
                            const parsed = JSON.parse(storedText);
                            if (Array.isArray(parsed)) {
                              for (
                                let i = 0;
                                i < Math.min(parsed.length, pitchCountSafe);
                                i++
                              ) {
                                pitches[i] = String(parsed[i] ?? "");
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
                            : pitches.reduce((sum, code) => {
                                if (!code) return sum;
                                return sum + (pointsMap.get(code) ?? 0);
                              }, 0);

                        return (
                          <td
                            key={`${metric.id}-${playerId}`}
                            className="px-2 py-2 align-top"
                          >
                            <div className="flex flex-col gap-1">
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
                                          pitchCountSafe
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
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                };

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

                // First, render the main command matrices (10/20-pitch fastball tests, etc.)
                baseCommandMetrics.forEach((m) => pushPitchMatrixRow(m));

                // "Add another pitch type" control row (only if there are optional extra matrices)
                if (extraPitchMetrics.length > 0) {
                  const nextHiddenExtra = extraPitchMetrics.find(
                    (m) => !isExtraMetricVisible(m)
                  );

                  const handleAddExtraPitchMatrix = () => {
                    if (!nextHiddenExtra) return;
                    const metricKey = (nextHiddenExtra as any)
                      .metric_key as string | undefined;
                    if (!metricKey) return;

                    setVisibleExtraPitchMatrices((prev) =>
                      prev.includes(metricKey) ? prev : [...prev, metricKey]
                    );
                  };

                  rows.push(
                    <tr
                      key={`${group.key}-add-extra-pitch`}
                      className="border-b border-slate-800 bg-slate-950/40"
                    >
                      <td
                        colSpan={1 + gridColumns.length}
                        className="px-2 py-2 align-top"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-[10px] text-slate-400">
                            Optional: track additional pitch types (change-up, slider,
                            cutter, etc.). Add up to {extraPitchMetrics.length} extra
                            pitch matrices per pitcher.
                          </div>
                          <button
                            type="button"
                            onClick={handleAddExtraPitchMatrix}
                            disabled={!nextHiddenExtra || isFinalized}
                            className={[
                              "px-2 py-0.5 rounded-md border text-[11px]",
                              !nextHiddenExtra || isFinalized
                                ? "border-slate-700 text-slate-500 bg-slate-900 cursor-not-allowed opacity-60"
                                : "border-emerald-500/80 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20",
                            ].join(" ")}
                          >
                            {nextHiddenExtra
                              ? "Add another pitch type"
                              : "All additional pitch slots added"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                }

                // Now render any extra pitch matrices that are visible (either clicked on or already have values)
                extraPitchMetrics.forEach((m) => {
                  if (isExtraMetricVisible(m)) {
                    pushPitchMatrixRow(m);
                  }
                });

                // Any remaining non-extra metrics fall back to the generic renderer
                const remaining = group.metrics.filter((m) => {
                  const metricKey = (m as any).metric_key as string | undefined;
                  if (metricKey && extraPitchKeys.has(metricKey)) {
                    // extra pitch metrics are either rendered above or intentionally hidden
                    return false;
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
