// src/pages/Assessments/StartAssessmentPage.tsx
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { getMyTeams, getTeamPlayers } from "../../api/coach";
import type { TeamPlayer } from "../../api/coach";
import {
  startAssessmentSession,
  updateAssessmentSession,
} from "../../api/assessments";
import type { EvalMode } from "../../api/assessments";
import type { TeamWithRole } from "../../api/types";

type SessionMode = "single" | "multi_station";
type ModeUI = "official" | "practice" | "tryout";
type PlayerSelectionMode = "all_roster" | "subset_roster";

interface PreTryoutPlayer {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string | null;
}

// Map team.age_group + evaluation_type → evaluation_templates.id
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

  const templateId = (byAge as Record<string, number>)[evaluationType];
  if (!templateId) {
    throw new Error(
      `No template configured for "${evaluationType}" at age group "${team.age_group}"`
    );
  }

  return templateId;
}

const FULL_YOUTH_SECTIONS = [
  { key: "athletic", label: "Athletic Skills" },
  { key: "hitting", label: "Hitting" },
  { key: "throwing", label: "Throwing" },
  { key: "catching", label: "Catching" },
  { key: "fielding", label: "Fielding" },
] as const;

const FULL_OLDER_SECTIONS = [
  { key: "athletic", label: "Athletic Skills" },
  { key: "hitting", label: "Hitting" },
  { key: "pitching", label: "Pitching" },
  { key: "catcher", label: "Catcher" },
  { key: "firstbase", label: "First Base" },
  { key: "infield", label: "Infield" },
  { key: "outfield", label: "Outfield" },
] as const;

function resolveFullAssessmentSections(team: TeamWithRole) {
  const ageKey = (team.age_group || "").toLowerCase();
  const byAge = TEMPLATE_IDS[ageKey];

  if (!byAge) {
    throw new Error(
      `No templates configured yet for age group "${team.age_group}"`
    );
  }

  const isYouth = ["5u", "6u", "7u", "8u", "9u"].includes(ageKey);
  const sectionDefs = isYouth ? FULL_YOUTH_SECTIONS : FULL_OLDER_SECTIONS;

  return sectionDefs.map((section) => {
    const templateId = (byAge as Record<string, number>)[section.key];

    if (!templateId) {
      throw new Error(
        `No template configured for "${section.key}" at age group "${team.age_group}"`
      );
    }

    return { ...section, templateId };
  });
}

export default function StartAssessmentPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();

  const [teams, setTeams] = useState<TeamWithRole[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [teamsError, setTeamsError] = useState<string | null>(null);

  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [evaluationType, setEvaluationType] = useState<string>("");
  const [modeUI, setModeUI] = useState<ModeUI>("official");
  const [sessionMode, setSessionMode] = useState<SessionMode>("single");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Roster selection
  const [roster, setRoster] = useState<TeamPlayer[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [playerSelectionMode, setPlayerSelectionMode] =
    useState<PlayerSelectionMode>("all_roster");
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);

  // Pre-session tryout players (for Tryout mode)
  const [preTryoutPlayers, setPreTryoutPlayers] = useState<PreTryoutPlayer[]>(
    []
  );
  const [selectedPreTryoutIds, setSelectedPreTryoutIds] = useState<string[]>(
    []
  );
  const [preTryoutFirstName, setPreTryoutFirstName] = useState("");
  const [preTryoutLastName, setPreTryoutLastName] = useState("");
  const [preTryoutEmail, setPreTryoutEmail] = useState("");
  const [preTryoutPhone, setPreTryoutPhone] = useState("");
  const [preTryoutError, setPreTryoutError] = useState<string | null>(null);

  // Load teams on mount
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

  // Load roster whenever selectedTeamId changes
  useEffect(() => {
    if (!selectedTeamId) {
      setRoster([]);
      setSelectedPlayerIds([]);
      return;
    }

    let isCancelled = false;

    async function loadRoster() {
      setRosterLoading(true);
      setRosterError(null);

      try {
        const players = await getTeamPlayers(selectedTeamId);
        if (isCancelled) return;

        setRoster(players || []);

        const activeIds = (players || [])
          .filter((p) => p.status === "active")
          .map((p) => p.player_id);

        setSelectedPlayerIds(activeIds);
        setPlayerSelectionMode("all_roster");
      } catch (err) {
        console.error("Error loading team roster:", err);
        if (isCancelled) return;

        setRoster([]);
        setSelectedPlayerIds([]);
        setRosterError("Failed to load team roster.");
      } finally {
        if (!isCancelled) {
          setRosterLoading(false);
        }
      }
    }

    loadRoster();

    return () => {
      isCancelled = true;
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

  const playerSelectionDisabled =
    !selectedTeam || rosterLoading || !!rosterError;

  function handleAddPreTryoutPlayer() {
    if (!preTryoutFirstName.trim() || !preTryoutLastName.trim()) {
      setPreTryoutError("First and last name are required.");
      return;
    }

    if (!preTryoutEmail.trim()) {
      setPreTryoutError(
        "Email is required so we can send tryout results and app access."
      );
      return;
    }

    setPreTryoutError(null);

    const newPlayer: PreTryoutPlayer = {
      id:
        (globalThis as any).crypto?.randomUUID?.() ??
        `pretryout_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      first_name: preTryoutFirstName.trim(),
      last_name: preTryoutLastName.trim(),
      email: preTryoutEmail.trim(),
      phone: preTryoutPhone.trim() || null,
    };

    setPreTryoutPlayers((prev) => [...prev, newPlayer]);
    setSelectedPreTryoutIds((prev) => [...prev, newPlayer.id]);

    setPreTryoutFirstName("");
    setPreTryoutLastName("");
    setPreTryoutEmail("");
    setPreTryoutPhone("");
  }

  function handleRemovePreTryoutPlayer(id: string) {
    setPreTryoutPlayers((prev) => prev.filter((p) => p.id !== id));
    setSelectedPreTryoutIds((prev) => prev.filter((pid) => pid !== id));
  }

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
        const fullSections =
          evaluationType === "full"
            ? resolveFullAssessmentSections(selectedTeam)
            : null;

        const templateId = fullSections?.[0]?.templateId
          ? fullSections[0].templateId
          : resolveTemplateId(selectedTeam, evaluationType);

        // Decide which team players are included in this session.
        let playerIds: string[] = [];

        const activeRosterIds = roster
          .filter((p) => p.status === "active")
          .map((p) => p.player_id);

        if (playerSelectionMode === "subset_roster") {
          if (modeUI !== "tryout") {
            if (!selectedPlayerIds.length && activeRosterIds.length > 0) {
              setSubmitError(
                "Select at least one player or switch to 'All active players'."
              );
              setSubmitting(false);
              return;
            }
          }
          playerIds = selectedPlayerIds;
        } else {
          playerIds = activeRosterIds;
        }

        if (modeUI === "tryout" && playerIds.length === 0) {
          // pure external tryout is OK
        }

        const apiMode: EvalMode =
          modeUI === "practice"
            ? "practice"
            : modeUI === "tryout"
            ? "tryout"
            : "official";

        const res = await startAssessmentSession({
          team_id: selectedTeam.id,
          template_id: templateId,
          evaluation_type: evaluationType,
          mode: apiMode,
          session_mode: sessionMode,
          player_ids: playerIds,
        });

        const existingData = (res as any).session_data || {};

        let nextSessionData: any = {
          ...existingData,
          evaluation_type: evaluationType,
          session_mode: sessionMode,
        };

        if (fullSections && fullSections.length > 0) {
          nextSessionData = {
            ...nextSessionData,
            full_sections: fullSections.map((section) => ({
              key: section.key,
              label: section.label,
              template_id: section.templateId,
            })),
            active_full_section:
              (existingData as any).active_full_section || fullSections[0].key,
          };
        }

        if (modeUI === "tryout") {
          const existingTryouts: PreTryoutPlayer[] = Array.isArray(
            (existingData as any).tryout_players
          )
            ? (existingData as any).tryout_players
            : [];

          const selectedTryoutPlayers = preTryoutPlayers.filter((p) =>
            selectedPreTryoutIds.includes(p.id)
          );

          nextSessionData = {
            ...nextSessionData,
            tryout_mode: true,
            tryout_players: [...existingTryouts, ...selectedTryoutPlayers],
          };
        }

        if (nextSessionData !== existingData) {
          try {
            await updateAssessmentSession(res.id, {
              session_data: nextSessionData,
            });
          } catch (err) {
            console.error("Failed to update session metadata:", err);
          }
        }

        navigate(`/assessments/${res.id}`);
      } catch (err: any) {
        console.error("Failed to start assessment:", err);
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
                {evalOptions.find((o) => o.value === evaluationType)
                  ?.description}
              </p>
            )}
          </div>

          {/* Players / Tryout section */}
          {selectedTeam && (
            <div className="rounded-lg border border-slate-700 bg-slate-900/80 p-3 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-semibold text-slate-100">
                    {modeUI === "tryout"
                      ? "Players in this tryout"
                      : "Players in this assessment"}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {modeUI === "tryout"
                      ? "Select any team players who will participate and add new tryout players. You can add more later from the session page."
                      : "Choose whether to evaluate the full roster or just a subset of players."}
                  </p>
                </div>
                {rosterLoading && (
                  <span className="text-[11px] text-slate-400">Loading…</span>
                )}
              </div>

              {rosterError && (
                <p className="text-[11px] text-red-300">{rosterError}</p>
              )}

              {/* Team roster selection */}
              <div className="flex flex-col sm:flex-row gap-3 text-xs">
                <label className="flex-1 flex items-start gap-2">
                  <input
                    type="radio"
                    className="mt-0.5"
                    name="playerSelectionMode"
                    value="all_roster"
                    disabled={playerSelectionDisabled}
                    checked={playerSelectionMode === "all_roster"}
                    onChange={() => setPlayerSelectionMode("all_roster")}
                  />
                  <span>
                    <span className="font-medium text-slate-100">
                      All active players on this team
                      {modeUI === "tryout" && " (optional)"}
                    </span>
                    <span className="block text-[11px] text-slate-400">
                      Everyone currently on the roster will be included in this
                      session.
                    </span>
                  </span>
                </label>

                <label className="flex-1 flex items-start gap-2">
                  <input
                    type="radio"
                    className="mt-0.5"
                    name="playerSelectionMode"
                    value="subset_roster"
                    disabled={playerSelectionDisabled || roster.length === 0}
                    checked={playerSelectionMode === "subset_roster"}
                    onChange={() => setPlayerSelectionMode("subset_roster")}
                  />
                  <span>
                    <span className="font-medium text-slate-100">
                      Select specific team players
                      {modeUI === "tryout" && " (optional)"}
                    </span>
                    <span className="block text-[11px] text-slate-400">
                      Use when only part of the roster is present (illness,
                      travel, etc.).
                    </span>
                  </span>
                </label>
              </div>

              {playerSelectionMode === "subset_roster" && (
                <div className="mt-2 rounded-md border border-slate-700 bg-slate-950/50 max-h-48 overflow-y-auto">
                  {roster.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-slate-500">
                      No players on this team yet.
                    </p>
                  ) : (
                    <ul className="divide-y divide-slate-800 text-xs">
                      {roster.map((tp) => {
                        const profile: any = (tp as any).profiles || {};
                        const name =
                          profile.display_name ||
                          [profile.first_name, profile.last_name]
                            .filter(Boolean)
                            .join(" ") ||
                          "Unnamed player";
                        const jersey =
                          tp.jersey_number != null
                            ? `#${tp.jersey_number}`
                            : "";
                        const id = tp.player_id;
                        const checked = selectedPlayerIds.includes(id);

                        return (
                          <li
                            key={id}
                            className="flex items-center justify-between px-3 py-1.5"
                          >
                            <label className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                className="h-3 w-3"
                                checked={checked}
                                onChange={(ev) => {
                                  const isChecked = ev.target.checked;
                                  setSelectedPlayerIds((prev) => {
                                    const next = new Set(prev);
                                    if (isChecked) {
                                      next.add(id);
                                    } else {
                                      next.delete(id);
                                    }
                                    return Array.from(next);
                                  });
                                }}
                              />
                              <span className="text-slate-100">
                                {jersey && (
                                  <span className="text-slate-400 mr-1">
                                    {jersey}
                                  </span>
                                )}
                                {name}
                              </span>
                            </label>
                            <span className="text-[10px] uppercase tracking-wide text-slate-500">
                              {tp.status}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}

              {/* Pre-session tryout players (only when tryout mode) */}
              {modeUI === "tryout" && (
                <div className="mt-3 space-y-2 border-t border-slate-700 pt-2">
                  <h4 className="text-[11px] font-semibold text-slate-100">
                    New tryout players (not yet on your roster)
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    Add players who have RSVP&apos;d or signed up for this
                    tryout. You can add more later from the session page.
                  </p>

                  {preTryoutError && (
                    <p className="text-[11px] text-red-300">
                      {preTryoutError}
                    </p>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
                    <div className="space-y-1">
                      <label className="block text-[11px] text-slate-200">
                        First name
                      </label>
                      <input
                        className="w-full rounded-md bg-slate-950 border border-slate-700 px-2 py-1 text-xs"
                        value={preTryoutFirstName}
                        onChange={(e) =>
                          setPreTryoutFirstName(e.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-[11px] text-slate-200">
                        Last name
                      </label>
                      <input
                        className="w-full rounded-md bg-slate-950 border border-slate-700 px-2 py-1 text-xs"
                        value={preTryoutLastName}
                        onChange={(e) =>
                          setPreTryoutLastName(e.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-[11px] text-slate-200">
                        Email (required)
                      </label>
                      <input
                        className="w-full rounded-md bg-slate-950 border border-slate-700 px-2 py-1 text-xs"
                        value={preTryoutEmail}
                        onChange={(e) => setPreTryoutEmail(e.target.value)}
                        type="email"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-[11px] text-slate-200">
                        Phone (optional)
                      </label>
                      <div className="flex gap-2">
                        <input
                          className="w-full rounded-md bg-slate-950 border border-slate-700 px-2 py-1 text-xs"
                          value={preTryoutPhone}
                          onChange={(e) => setPreTryoutPhone(e.target.value)}
                          type="tel"
                        />
                        <button
                          type="button"
                          onClick={handleAddPreTryoutPlayer}
                          className="shrink-0 inline-flex items-center px-3 py-1.5 rounded-md bg-amber-400 text-slate-900 font-semibold text-[11px]"
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  </div>

                  {preTryoutPlayers.length > 0 && (
                    <div className="border-t border-slate-700 pt-2">
                      <h5 className="text-[11px] font-semibold text-slate-200 mb-1">
                        Added tryout players
                      </h5>
                      <ul className="space-y-1 text-[11px]">
                        {preTryoutPlayers.map((p) => {
                          const checked = selectedPreTryoutIds.includes(p.id);
                          return (
                            <li
                              key={p.id}
                              className="flex items-center justify-between"
                            >
                              <label className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  className="h-3 w-3"
                                  checked={checked}
                                  onChange={(e) => {
                                    const isChecked = e.target.checked;
                                    setSelectedPreTryoutIds((prev) => {
                                      const next = new Set(prev);
                                      if (isChecked) {
                                        next.add(p.id);
                                      } else {
                                        next.delete(p.id);
                                      }
                                      return Array.from(next);
                                    });
                                  }}
                                />
                                <span className="text-slate-100">
                                  {p.first_name} {p.last_name}
                                  <span className="text-slate-400 ml-1">
                                    · {p.email}
                                  </span>
                                  {p.phone && (
                                    <span className="text-slate-400 ml-1">
                                      · {p.phone}
                                    </span>
                                  )}
                                </span>
                              </label>
                              <button
                                type="button"
                                onClick={() =>
                                  handleRemovePreTryoutPlayer(p.id)
                                }
                                className="text-[10px] text-slate-400 hover:text-red-300"
                              >
                                Remove
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
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
            <div className="grid grid-cols-3 gap-2 text-xs">
              <button
                type="button"
                onClick={() => setModeUI("official")}
                className={`rounded-md border px-2 py-1 text-left ${
                  modeUI === "official"
                    ? "border-emerald-400 bg-emerald-500/10 text-emerald-300"
                    : "border-slate-600 bg-slate-900 text-slate-200"
                }`}
              >
                <div className="font-semibold">Official</div>
                <div className="text-[11px] text-slate-400">
                  Team-based eval. Medals / trophies can be earned.
                </div>
              </button>
              <button
                type="button"
                onClick={() => setModeUI("practice")}
                className={`rounded-md border px-2 py-1 text-left ${
                  modeUI === "practice"
                    ? "border-emerald-400 bg-emerald-500/10 text-emerald-300"
                    : "border-slate-600 bg-slate-900 text-slate-200"
                }`}
              >
                <div className="font-semibold">Practice</div>
                <div className="text-[11px] text-slate-400">
                  For training days, ghost medals only.
                </div>
              </button>
              <button
                type="button"
                onClick={() => setModeUI("tryout")}
                className={`rounded-md border px-2 py-1 text-left ${
                  modeUI === "tryout"
                    ? "border-amber-400 bg-amber-500/10 text-amber-300"
                    : "border-slate-600 bg-slate-900 text-slate-200"
                }`}
              >
                <div className="font-semibold">Tryout</div>
                <div className="text-[11px] text-slate-400">
                  Official tryout eval. You can add non-roster players.
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
