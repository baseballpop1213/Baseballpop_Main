// src/pages/Assessments/StartAssessmentPage.tsx
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { getMyTeams, getTeamPlayers } from "../../api/coach";
import type { TeamPlayer } from "../../api/coach";
import { startAssessmentSession } from "../../api/assessments";
import type { TeamWithRole } from "../../api/types";

type Mode = "official" | "practice";
type SessionMode = "single" | "multi_station";

// Map team.age_group + evaluation_type → evaluation_templates.id
// Based on the template list you pasted.
const TEMPLATE_IDS: Record<string, Record<string, number>> = {
  // 5U–9U use: athletic, hitting, throwing, catching, fielding
  "5u": {
    athletic: 1,
    hitting: 2,
    throwing: 3,
    catching: 4,
    fielding: 5,
  },
  "6u": {
    athletic: 16,
    hitting: 17,
    throwing: 18,
    catching: 19,
    fielding: 20,
  },
  "7u": {
    athletic: 21,
    hitting: 22,
    throwing: 23,
    catching: 24,
    fielding: 25,
  },
  "8u": {
    athletic: 26,
    hitting: 27,
    throwing: 28,
    catching: 29,
    fielding: 30,
  },
  "9u": {
    athletic: 31,
    hitting: 32,
    // "9U Throwing & Pitching"
    throwing: 33,
    catching: 34,
    fielding: 35,
  },

  // 10U–pro use: athletic, hitting, pitching, catcher, firstbase, infield, outfield
  "10u": {
    athletic: 36,
    hitting: 37,
    pitching: 38,
    catcher: 39,
    firstbase: 40,
    infield: 41,
    outfield: 42,
  },
  "11u": {
    athletic: 43,
    hitting: 44,
    pitching: 45,
    catcher: 46,
    firstbase: 47,
    infield: 48,
    outfield: 49,
  },
  "12u": {
    athletic: 50,
    hitting: 51,
    pitching: 52,
    catcher: 53,
    firstbase: 54,
    infield: 55,
    outfield: 56,
  },
  "13u": {
    athletic: 57,
    hitting: 58,
    pitching: 59,
    catcher: 60,
    firstbase: 61,
    infield: 62,
    outfield: 63,
  },
  "14u": {
    athletic: 64,
    hitting: 65,
    pitching: 66,
    catcher: 67,
    firstbase: 68,
    infield: 69,
    outfield: 70,
  },
  high_school: {
    athletic: 71,
    hitting: 72,
    pitching: 73,
    catcher: 74,
    firstbase: 75,
    infield: 76,
    outfield: 77,
  },
  college: {
    athletic: 78,
    hitting: 79,
    pitching: 80,
    catcher: 81,
    firstbase: 82,
    infield: 83,
    outfield: 84,
  },
  pro: {
    athletic: 85,
    hitting: 86,
    pitching: 87,
    catcher: 88,
    firstbase: 89,
    infield: 90,
    outfield: 91,
  },
};

// Helper to map team + evaluation_type → template_id
function resolveTemplateId(team: TeamWithRole, evaluationType: string): number {
  const ageKey = (team.age_group || "").toLowerCase();
  const byAge = TEMPLATE_IDS[ageKey];

  if (!byAge) {
    throw new Error(
      `No templates configured yet for age group "${team.age_group}"`
    );
  }

  if (evaluationType === "full") {
    // We don't have explicit "Full Assessment" templates in the list you sent,
    // so for now we treat this as "not wired yet".
    throw new Error(
      'Full Assessment templates are not wired yet. Please pick a specific section (Athletic, Hitting, etc.).'
    );
  }

  const templateId = (byAge as Record<string, number>)[evaluationType];
  if (!templateId) {
    throw new Error(
      `No template configured for "${evaluationType}" at age group "${team.age_group}"`
    );
  }

  return templateId;
}

export default function StartAssessmentPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();

  const [teams, setTeams] = useState<TeamWithRole[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [teamsError, setTeamsError] = useState<string | null>(null);

  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [evaluationType, setEvaluationType] = useState<string>("");
  const [mode, setMode] = useState<Mode>("official");
  const [sessionMode, setSessionMode] = useState<SessionMode>("single");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Roster / player selection for this session
  const [teamPlayers, setTeamPlayers] = useState<TeamPlayer[]>([]);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [playersError, setPlayersError] = useState<string | null>(null);
  const [playerSelectionMode, setPlayerSelectionMode] =
    useState<"all" | "some">("all");
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);

  // Load teams on mount (same as Dashboard)
  useEffect(() => {
    let cancelled = false;

    async function load() {
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

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  // Load players when team selection changes
  useEffect(() => {
    if (!selectedTeamId) {
      setTeamPlayers([]);
      setSelectedPlayerIds([]);
      return;
    }

    let cancelled = false;

    async function loadPlayers() {
      setLoadingPlayers(true);
      setPlayersError(null);
      try {
        const data = await getTeamPlayers(selectedTeamId);
        if (!cancelled) {
          setTeamPlayers(data);
          // By default, include all players on the roster in the session.
          setSelectedPlayerIds(data.map((p) => p.player_id));
        }
      } catch (err: any) {
        if (!cancelled) {
          setPlayersError(
            err?.response?.data?.message ||
              err?.response?.data?.error ||
              err?.message ||
              "Failed to load team players"
          );
          setTeamPlayers([]);
          setSelectedPlayerIds([]);
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
  }, [selectedTeamId]);

  const selectedTeam = useMemo(
    () => teams.find((t) => t.id === selectedTeamId) || null,
    [teams, selectedTeamId]
  );

  const isYouth =
    selectedTeam?.age_group &&
    ["5u", "6u", "7u", "8u", "9u"].includes(
      selectedTeam.age_group.toLowerCase()
    );

  // Eval options depend on age group
  const evalOptions = useMemo(() => {
    if (!selectedTeam) return [];

    if (isYouth) {
      // 5u–9u
      return [
        {
          value: "full",
          label: "Full Assessment",
          description: "All BPOP stations for this age group.",
        },
        {
          value: "athletic",
          label: "Athletic Skills Assessment",
          description: "Speed, agility, strength, balance, mobility.",
        },
        {
          value: "hitting",
          label: "Hitting Assessment",
          description: "Contact, power, swing mechanics.",
        },
        {
          value: "throwing",
          label: "Throwing Assessment",
          description: "Arm strength & throwing mechanics.",
        },
        {
          value: "catching",
          label: "Catching Assessment",
          description: "Receiving & catching fundamentals.",
        },
        {
          value: "fielding",
          label: "Fielding Assessment",
          description: "Ground balls, fly balls, and fielding skills.",
        },
      ];
    }

    // 10u – pro
    return [
      {
        value: "full",
        label: "Full Assessment",
        description: "All BPOP stations for this age group.",
      },
      {
        value: "athletic",
        label: "Athletic Skills Assessment",
        description: "Speed, agility, strength, balance, mobility.",
      },
      {
        value: "hitting",
        label: "Hitting Assessment",
        description: "Contact, power, approach, and swing mechanics.",
      },
      {
        value: "pitching",
        label: "Pitching Assessment",
        description: "Pitch quality, command, and pitchability.",
      },
      {
        value: "catcher",
        label: "Catcher Assessment",
        description: "Receiving, blocking, and throwing.",
      },
      {
        value: "firstbase",
        label: "First Base Assessment",
        description: "Receiving, footwork, and pick plays.",
      },
      {
        value: "infield",
        label: "Infield Assessment",
        description: "Range, hands, and throwing from the dirt.",
      },
      {
        value: "outfield",
        label: "Outfield Assessment",
        description: "Reads, routes, and throwing from the grass.",
      },
    ];
  }, [selectedTeam, isYouth]);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!selectedTeam) {
      setSubmitError("Please select a team.");
      return;
    }
    if (!evaluationType) {
      setSubmitError("Please choose an assessment type.");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    (async () => {
      try {
        const templateId = resolveTemplateId(selectedTeam, evaluationType);

        // Determine which players should be included in this session
        const allPlayerIds = teamPlayers.map((p) => p.player_id);
        let playerIdsToUse: string[] = [];

        if (allPlayerIds.length > 0) {
          if (playerSelectionMode === "all") {
            playerIdsToUse = allPlayerIds;
          } else {
            playerIdsToUse = selectedPlayerIds;
            if (!playerIdsToUse || playerIdsToUse.length === 0) {
              setSubmitError(
                'Please select at least one player or choose "All players".'
              );
              setSubmitting(false);
              return;
            }
          }
        } else {
          // No players on the roster yet – start a session with an empty list
          playerIdsToUse = [];
        }

        const res = await startAssessmentSession({
          team_id: selectedTeam.id,
          template_id: templateId,
          evaluation_type: evaluationType,
          mode,
          session_mode: sessionMode,
          player_ids: playerIdsToUse,
        });

        // Navigate to /assessments/:sessionId
        navigate(`/assessments/${res.id}`);
      } catch (err: any) {
        const msg =
          err?.message ||
          err?.response?.data?.message ||
          err?.response?.data?.error ||
          "Failed to start assessment";
        setSubmitError(msg);
      } finally {
        setSubmitting(false);
      }
    })();
  }

  return (
    <div className="space-y-6 max-w-xl">
      <section className="space-y-1">
        <h2 className="text-xl font-semibold">Start a new assessment</h2>
        <p className="text-sm text-slate-300">
          Set up an evaluation session for your team. You can choose the
          assessment type, mode, and whether this is a single-coach or
          multi-coach station setup.
        </p>
      </section>

      <section className="rounded-xl bg-slate-900/70 border border-slate-700 p-4 space-y-4">
        <p className="text-xs text-slate-400">
          Running as:{" "}
          <span className="font-semibold text-slate-200">
            {profile?.display_name ||
              [profile?.first_name, profile?.last_name]
                .filter(Boolean)
                .join(" ") ||
              profile?.email ||
              "Coach"}
          </span>
        </p>

        <form className="space-y-4" onSubmit={handleSubmit}>
          {/* Team selection */}
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-200">
              Team
            </label>
            {loadingTeams && (
              <p className="text-xs text-slate-400">Loading your teams…</p>
            )}
            {teamsError && (
              <p className="text-xs text-red-400">{teamsError}</p>
            )}
            {!loadingTeams && !teamsError && (
              <select
                className="w-full rounded-md bg-slate-800 border border-slate-600 text-sm px-2 py-1.5"
                value={selectedTeamId}
                onChange={(e) => {
                  setSelectedTeamId(e.target.value);
                  setEvaluationType("");
                }}
              >
                <option value="">Select a team…</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                    {team.age_group ? ` (${team.age_group}` : ""}
                    {team.level ? ` · ${team.level}` : ""}
                    {team.age_group ? ")" : ""}
                  </option>
                ))}
              </select>
            )}
            {selectedTeam && (
              <p className="text-[11px] text-slate-400 mt-1">
                Age group:{" "}
                <span className="font-mono">{selectedTeam.age_group}</span>{" "}
                ({isYouth ? "5U–9U options" : "10U–pro options"})
              </p>
            )}
          </div>

          {/* Assessment type */}
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-200">
              Assessment type
            </label>
            {!selectedTeam && (
              <p className="text-xs text-slate-500">
                Select a team to see available assessment types.
              </p>
            )}
            {selectedTeam && (
              <select
                className="w-full rounded-md bg-slate-800 border border-slate-600 text-sm px-2 py-1.5"
                value={evaluationType}
                onChange={(e) => setEvaluationType(e.target.value)}
              >
                <option value="">Select assessment type…</option>
                {evalOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            )}
            {selectedTeam && evaluationType && (
              <p className="text-[11px] text-slate-400 mt-1">
                {evalOptions.find((o) => o.value === evaluationType)?.description}
              </p>
            )}
          </div>

          {/* Player selection */}
          {selectedTeam && (
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-200">
                Players in this assessment
              </label>

              {loadingPlayers && (
                <p className="text-xs text-slate-400">
                  Loading team players…
                </p>
              )}
              {playersError && (
                <p className="text-xs text-red-400">{playersError}</p>
              )}

              {!loadingPlayers &&
                !playersError &&
                teamPlayers.length === 0 && (
                  <p className="text-xs text-slate-500">
                    This team doesn’t have any players on the roster yet. You
                    can still start a session now and link players later.
                  </p>
                )}

              {teamPlayers.length > 0 && (
                <div className="space-y-2">
                  <div className="flex gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setPlayerSelectionMode("all");
                        setSelectedPlayerIds(
                          teamPlayers.map((p) => p.player_id)
                        );
                      }}
                      className={`flex-1 rounded-md border px-2 py-1 text-left ${
                        playerSelectionMode === "all"
                          ? "border-emerald-400 bg-emerald-500/10 text-emerald-300"
                          : "border-slate-600 bg-slate-900 text-slate-200"
                      }`}
                    >
                      <div className="font-semibold">All players</div>
                      <div className="text-[11px] text-slate-400">
                        Include every player on this roster in the session.
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPlayerSelectionMode("some")}
                      className={`flex-1 rounded-md border px-2 py-1 text-left ${
                        playerSelectionMode === "some"
                          ? "border-emerald-400 bg-emerald-500/10 text-emerald-300"
                          : "border-slate-600 bg-slate-900 text-slate-200"
                      }`}
                    >
                      <div className="font-semibold">Select players</div>
                      <div className="text-[11px] text-slate-400">
                        Choose a subset (e.g. only players at today’s eval).
                      </div>
                    </button>
                  </div>

                  {playerSelectionMode === "some" && (
                    <div className="max-h-40 overflow-y-auto rounded-md border border-slate-700 bg-slate-900/70 p-2 space-y-1">
                      {teamPlayers.map((p) => {
                        const profile = (p as any).profiles || {};
                        const name =
                          profile.display_name ||
                          [profile.first_name, profile.last_name]
                            .filter(Boolean)
                            .join(" ") ||
                          profile.email ||
                          "Player";

                        const checked = selectedPlayerIds.includes(p.player_id);

                        return (
                          <label
                            key={p.player_id}
                            className="flex items-center gap-2 text-xs text-slate-200"
                          >
                            <input
                              type="checkbox"
                              className="h-3 w-3 rounded border-slate-500 bg-slate-900"
                              checked={checked}
                              onChange={(e) => {
                                const { checked } = e.target;
                                setSelectedPlayerIds((prev) => {
                                  if (checked) {
                                    return Array.from(
                                      new Set([...prev, p.player_id])
                                    );
                                  }
                                  return prev.filter(
                                    (id) => id !== p.player_id
                                  );
                                });
                              }}
                            />
                            <span className="flex-1 truncate">
                              {name}
                              {p.jersey_number != null && (
                                <span className="text-[10px] text-slate-400 ml-1">
                                  #{p.jersey_number}
                                </span>
                              )}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}

                  {playerSelectionMode === "some" &&
                    !loadingPlayers &&
                    selectedPlayerIds.length === 0 && (
                      <p className="text-[11px] text-amber-300">
                        No players selected. Either check at least one player or
                        switch back to "All players".
                      </p>
                    )}
                </div>
              )}
            </div>
          )}

          {/* Mode */}
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-200">
              Mode
            </label>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => setMode("official")}
                className={`rounded-md border px-2 py-1 text-left ${
                  mode === "official"
                    ? "border-emerald-400 bg-emerald-500/10 text-emerald-300"
                    : "border-slate-600 bg-slate-900 text-slate-200"
                }`}
              >
                <div className="font-semibold">Official</div>
                <div className="text-[11px] text-slate-400">
                  Awards count, medals / trophies can be earned.
                </div>
              </button>
              <button
                type="button"
                onClick={() => setMode("practice")}
                className={`rounded-md border px-2 py-1 text-left ${
                  mode === "practice"
                    ? "border-emerald-400 bg-emerald-500/10 text-emerald-300"
                    : "border-slate-600 bg-slate-900 text-slate-200"
                }`}
              >
                <div className="font-semibold">Practice</div>
                <div className="text-[11px] text-slate-400">
                  For training days, ghost medals only.
                </div>
              </button>
            </div>
          </div>

          {/* Session mode */}
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-200">
              Session mode
            </label>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => setSessionMode("single")}
                className={`rounded-md border px-2 py-1 text-left ${
                  sessionMode === "single"
                    ? "border-emerald-400 bg-emerald-500/10 text-emerald-300"
                    : "border-slate-600 bg-slate-900 text-slate-200"
                }`}
              >
                <div className="font-semibold">Single coach</div>
                <div className="text-[11px] text-slate-400">
                  One coach runs all sections on this device.
                </div>
              </button>
              <button
                type="button"
                onClick={() => setSessionMode("multi_station")}
                className={`rounded-md border px-2 py-1 text-left ${
                  sessionMode === "multi_station"
                    ? "border-emerald-400 bg-emerald-500/10 text-emerald-300"
                    : "border-slate-600 bg-slate-900 text-slate-200"
                }`}
              >
                <div className="font-semibold">Multi-coach stations</div>
                <div className="text-[11px] text-slate-400">
                  Multiple coaches each run one section at separate stations.
                </div>
              </button>
            </div>
          </div>

          {submitError && (
            <p className="text-xs text-red-400 whitespace-pre-line">
              {submitError}
            </p>
          )}

          <div className="pt-2">
            <button
              type="submit"
              disabled={
                submitting || !selectedTeam || !evaluationType || loadingTeams
              }
              className="inline-flex items-center px-3 py-1.5 rounded-md bg-emerald-500 text-slate-900 text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting ? "Starting…" : "Start assessment"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
