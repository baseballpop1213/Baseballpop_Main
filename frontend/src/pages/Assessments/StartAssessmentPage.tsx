// src/pages/Assessments/StartAssessmentPage.tsx
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { getMyTeams } from "../../api/coach";
import type { TeamWithRole } from "../../api/types";
import {
  createEvalSession,
  type EvalMode,
} from "../../api/assessments";

type OlderEvalTypeKey =
  | "full"
  | "athletic"
  | "hitting"
  | "pitching"
  | "catcher"
  | "firstbase"
  | "infield"
  | "outfield";

type YouthEvalTypeKey =
  | "full"
  | "athletic"
  | "hitting"
  | "throwing"
  | "catching"
  | "fielding";

type EvalTypeKey = OlderEvalTypeKey | YouthEvalTypeKey;

interface EvalTypeOption {
  key: EvalTypeKey;
  label: string;
}

const OLDER_EVAL_OPTIONS: EvalTypeOption[] = [
  { key: "full", label: "Full Assessment" },
  { key: "athletic", label: "Athletic Skills Assessment" },
  { key: "hitting", label: "Hitting Assessment" },
  { key: "pitching", label: "Pitching Assessment" },
  { key: "catcher", label: "Catcher Assessment" },
  { key: "firstbase", label: "Firstbase Assessment" },
  { key: "infield", label: "Infield Assessment" },
  { key: "outfield", label: "Outfield Assessment" },
];

const YOUTH_EVAL_OPTIONS: EvalTypeOption[] = [
  { key: "full", label: "Full Assessment" },
  { key: "athletic", label: "Athletic Skills Assessment" },
  { key: "hitting", label: "Hitting Assessment" },
  { key: "throwing", label: "Throwing Assessment" },
  { key: "catching", label: "Catching Assessment" },
  { key: "fielding", label: "Fielding Assessment" },
];

// For now we only wire 10u to template ids.
// Later we can extend this mapping for other age groups.
function resolveTemplateId(
  ageGroup: string | null,
  evalType: EvalTypeKey
): number | null {
  if (!ageGroup) return null;

  const ag = ageGroup.toLowerCase();

  if (ag === "10u") {
    switch (evalType) {
      case "athletic":
        return 36; // 10U Athletic Skills
      case "hitting":
        return 37; // 10U Hitting Skills
      case "pitching":
        return 38; // 10U Pitching Eval
      case "catcher":
        return 39; // 10U Catcher Eval
      case "firstbase":
        return 40; // 10U First Base Eval
      case "infield":
        return 41; // 10U Infield Eval
      case "outfield":
        return 42; // 10U Outfield Eval
      // Full assessment not wired yet – we’ll design that flow later
      default:
        return null;
    }
  }

  // Other age groups can be mapped later
  return null;
}

export default function StartAssessmentPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();

  const [teams, setTeams] = useState<TeamWithRole[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [teamsError, setTeamsError] = useState<string | null>(null);

  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [assessmentType, setAssessmentType] = useState<EvalTypeKey | "">("");
  const [mode, setMode] = useState<EvalMode>("official");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Load teams once (same as the Dashboard)
  useEffect(() => {
    let cancelled = false;

    async function loadTeams() {
      setLoadingTeams(true);
      setTeamsError(null);
      try {
        const data = await getMyTeams();
        if (!cancelled) {
          setTeams(data);
        }
      } catch (err: any) {
        if (!cancelled) {
          setTeamsError(
            err?.response?.data?.message ||
              err?.message ||
              "Failed to load teams"
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingTeams(false);
        }
      }
    }

    loadTeams();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedTeam = useMemo(
    () => teams.find((t) => t.id === selectedTeamId) || null,
    [teams, selectedTeamId]
  );

  const isYouthAgeGroup = useMemo(() => {
    if (!selectedTeam?.age_group) return false;
    const ag = selectedTeam.age_group.toLowerCase();
    return ["5u", "6u", "7u", "8u", "9u"].includes(ag);
  }, [selectedTeam]);

  const availableEvalOptions = useMemo<EvalTypeOption[]>(() => {
    if (!selectedTeam) return [];
    return isYouthAgeGroup ? YOUTH_EVAL_OPTIONS : OLDER_EVAL_OPTIONS;
  }, [selectedTeam, isYouthAgeGroup]);

  // When team/eval options change, default the assessment type
  useEffect(() => {
    if (availableEvalOptions.length === 0) {
      setAssessmentType("");
      return;
    }
    if (!assessmentType) {
      setAssessmentType(availableEvalOptions[0].key);
    } else if (
      !availableEvalOptions.some((opt) => opt.key === assessmentType)
    ) {
      setAssessmentType(availableEvalOptions[0].key);
    }
  }, [availableEvalOptions, assessmentType]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    if (!selectedTeam) {
      setSubmitError("Please select a team.");
      return;
    }
    if (!assessmentType) {
      setSubmitError("Please select an assessment type.");
      return;
    }

    const templateId = resolveTemplateId(
      selectedTeam.age_group,
      assessmentType
    );

    if (!templateId) {
      setSubmitError(
        "This team / assessment combination isn’t wired to templates yet. For now, try 10U Hitting/Athletic/Pitching/etc."
      );
      return;
    }

    try {
      setSubmitting(true);

      const session = await createEvalSession({
        team_id: selectedTeam.id,
        template_id: templateId,
        mode,
        // player_ids: later we can pass real team player IDs here
      });

      // For debugging if needed:
      // console.log("Created eval session:", session);

      navigate(`/assessments/${session.id}`);
    } catch (err: any) {
      setSubmitError(
        err?.response?.data?.message ||
          err?.message ||
          "Failed to create assessment session."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="space-y-1">
        <h2 className="text-xl font-semibold">Start a new assessment</h2>
        <p className="text-sm text-slate-300">
          Set up an evaluation session for your team. You can choose the
          assessment type, mode, and whether this is a single-coach or
          multi-coach station setup (later).
        </p>
        <p className="text-xs text-slate-400">
          Running as:{" "}
          <span className="font-semibold">
            {profile?.display_name || "Unknown"}
          </span>
        </p>
      </section>

      <form
        onSubmit={handleSubmit}
        className="space-y-6 rounded-xl bg-slate-900/70 border border-slate-700 p-4"
      >
        {/* Team selection */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-100">
            Team
          </label>
          {loadingTeams && (
            <p className="text-xs text-slate-400">Loading your teams…</p>
          )}
          {teamsError && (
            <p className="text-xs text-red-400">{teamsError}</p>
          )}
          <select
            className="w-full rounded-md bg-slate-950/70 border border-slate-700 px-3 py-2 text-sm text-slate-100"
            value={selectedTeamId}
            onChange={(e) => setSelectedTeamId(e.target.value)}
          >
            <option value="">Select a team…</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}{" "}
                {team.age_group && team.level
                  ? `(${team.age_group} · ${team.level})`
                  : ""}
              </option>
            ))}
          </select>
          {selectedTeam && (
            <p className="text-xs text-slate-400">
              Age group:{" "}
              <span className="font-mono">{selectedTeam.age_group}</span>{" "}
              (
              {isYouthAgeGroup
                ? "5U–9U options"
                : "10U–pro options"}
              )
            </p>
          )}
        </div>

        {/* Assessment type */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-100">
            Assessment type
          </label>
          {availableEvalOptions.length === 0 && (
            <p className="text-xs text-slate-400">
              Select a team to see available assessment types.
            </p>
          )}
          {availableEvalOptions.length > 0 && (
            <select
              className="w-full rounded-md bg-slate-950/70 border border-slate-700 px-3 py-2 text-sm text-slate-100"
              value={assessmentType}
              onChange={(e) =>
                setAssessmentType(e.target.value as EvalTypeKey)
              }
            >
              {availableEvalOptions.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  {opt.label}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Mode */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-100">
            Mode
          </label>
          <div className="flex flex-col gap-2 text-sm text-slate-200">
            <label className="inline-flex items-start gap-2">
              <input
                type="radio"
                className="mt-0.5"
                name="mode"
                value="official"
                checked={mode === "official"}
                onChange={() => setMode("official")}
              />
              <span>
                <span className="font-semibold">Official</span>{" "}
                <span className="text-slate-400">
                  (awards count, medals / trophies can be earned)
                </span>
              </span>
            </label>
            <label className="inline-flex items-start gap-2">
              <input
                type="radio"
                className="mt-0.5"
                name="mode"
                value="practice"
                checked={mode === "practice"}
                onChange={() => setMode("practice")}
              />
              <span>
                <span className="font-semibold">Practice</span>{" "}
                <span className="text-slate-400">
                  (for training days, ghost medals only)
                </span>
              </span>
            </label>
          </div>
        </div>

        {/* Session mode note (for later multi-coach) */}
        <div className="space-y-1">
          <p className="text-xs text-slate-400">
            Multi-coach station mode (Athletic, Hitting, Pitching
            stations, etc.) will be wired into this session later —
            for now, starting an assessment creates a single session
            you can run from this device.
          </p>
        </div>

        {submitError && (
          <p className="text-xs text-red-400">{submitError}</p>
        )}

        <div>
          <button
            type="submit"
            disabled={submitting || !selectedTeam || !assessmentType}
            className="inline-flex items-center rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-emerald-400 disabled:opacity-40"
          >
            {submitting ? "Starting…" : "Start assessment"}
          </button>
        </div>
      </form>
    </div>
  );
}
