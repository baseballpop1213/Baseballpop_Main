// src/pages/Assessments/AssessmentSessionPage.tsx
import { useEffect, useMemo, useState } from "react";
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

    const id = sessionId; // now narrowed to string

    let cancelled = false;

    async function loadSession() {
      setLoadingSession(true);
      setSessionError(null);

      try {
        const data = await getAssessmentSession(id);
        if (!cancelled) {
          setSession(data);
          setSessionData(
            data.session_data ?? {
              player_ids: [],
              values: {},
              completed_metric_ids: [],
              evaluation_type: data.evaluation_type ?? null,
              session_mode: data.session_mode ?? "single",
            }
          );
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

  // Which player IDs are explicitly marked as part of this session
  const participantIds = useMemo(() => {
    const ids = sessionData?.player_ids;
    if (Array.isArray(ids) && ids.length > 0) {
      return new Set<string>(ids as string[]);
    }
    // If we don't have an explicit list yet, treat "everyone on roster" as in the session.
    return null;
  }, [sessionData?.player_ids]);

  // The player IDs we will show as columns in the grid
  const gridPlayerIds = useMemo(() => {
    if (participantIds) {
      return Array.from(participantIds);
    }
    if (players.length > 0) {
      return players.map((p) => p.player_id);
    }
    return [];
  }, [participantIds, players]);

  function handleValueChange(
    playerId: string,
    metricId: number,
    rawValue: string
  ) {
    if (isFinalized) return; // don't allow edits after finalization

    const trimmed = rawValue.trim();
    const parsed =
      trimmed === "" ? null : Number.isNaN(Number(trimmed)) ? null : Number(trimmed);

    setSessionData((prev) => {
      if (!prev) return prev;

      const nextValues = { ...(prev.values || {}) };
      const perPlayer = { ...(nextValues[playerId] || {}) };
      perPlayer[metricId] = {
        value_numeric: parsed,
        value_text: null,
      };
      nextValues[playerId] = perPlayer;

      setDirty(true);
      return {
        ...prev,
        values: nextValues,
      };
    });
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
      // If player_ids is empty, default to "everyone currently in the grid"
      const playerIdsToSave =
        sessionData.player_ids && sessionData.player_ids.length > 0
          ? sessionData.player_ids
          : gridPlayerIds;

      const payload: { session_data: EvalSessionData } = {
        session_data: {
          ...sessionData,
          player_ids: playerIdsToSave,
        },
      };

      const updated = await updateAssessmentSession(session.id, payload);
      setSession(updated);
      setSessionData(
        updated.session_data ?? {
          ...sessionData,
          player_ids: playerIdsToSave,
        }
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
      const playersInSession =
        sessionData.player_ids && sessionData.player_ids.length > 0
          ? sessionData.player_ids
          : gridPlayerIds;

      if (!playersInSession || playersInSession.length === 0) {
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

      // For each player with at least one value, create a player_assessment
      for (const playerId of playersInSession) {
        const perMetricValues = valuesByPlayer[playerId] || {};
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
          // No values for this player; skip creating an assessment
          continue;
        }

        const result = await createAssessment({
          player_id: playerId,
          team_id: session.team_id ?? null,
          template_id: session.template_id,
          kind: session.mode as EvalMode,
          values: valueArray,
        });

        if (result && typeof result.assessment_id === "number") {
          assessmentsByPlayer[playerId] = result.assessment_id;
          createdCount += 1;
        }
      }

      if (!createdCount) {
        setFinalizeError(
          "No assessment records were created. Make sure you've entered at least one score for at least one player."
        );
        return;
      }

      // Now mark the session as finalized and store which metrics were completed
      const finalizedSessionData: EvalSessionData = {
        ...sessionData,
        player_ids: playersInSession,
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
      setSessionData(updated.session_data ?? finalizedSessionData);
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

  const effectiveSessionMode =
    session.session_mode ?? sessionData.session_mode ?? "single";

  const effectiveEvalType =
    session.evaluation_type ?? sessionData.evaluation_type ?? null;

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
        {effectiveEvalType && (
          <p className="text-xs text-slate-400 mt-1">
            Evaluation type: {effectiveEvalType}
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

      {/* Players in this session */}
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
                : true;

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

      {/* Metrics × players grid */}
      <section className="rounded-xl bg-slate-900/70 border border-slate-700 p-3 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-100">
            Enter assessment results
          </h3>
          <div className="flex items-center gap-3 text-[11px]">
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

        {loadingTemplate && (
          <p className="text-xs text-slate-400">Loading metrics…</p>
        )}

        {templateError && (
          <p className="text-xs text-red-400">{templateError}</p>
        )}

        {!loadingTemplate && !templateError && metrics.length === 0 && (
          <p className="text-xs text-slate-400">
            No metrics defined for this template yet.
          </p>
        )}

        {!loadingTemplate &&
          !templateError &&
          metrics.length > 0 &&
          gridPlayerIds.length === 0 && (
            <p className="text-xs text-slate-400">
              No players available for this session yet.
            </p>
          )}

        {!loadingTemplate &&
          !templateError &&
          metrics.length > 0 &&
          gridPlayerIds.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full text-[11px] border border-slate-700 rounded-lg overflow-hidden">
                <thead className="bg-slate-800/80">
                  <tr>
                    <th className="text-left px-2 py-1 border-b border-slate-700">
                      Metric
                    </th>
                    {gridPlayerIds.map((playerId) => {
                      const p = players.find((row) => row.player_id === playerId);
                      const name = formatPlayerName(p?.profiles);
                      return (
                        <th
                          key={playerId}
                          className="text-center px-2 py-1 border-b border-slate-700"
                        >
                          <div className="font-medium">{name}</div>
                          <div className="text-[10px] text-slate-400">
                            #{p?.jersey_number ?? "—"}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {metrics.map((m) => (
                    <tr
                      key={m.id}
                      className="odd:bg-slate-900 even:bg-slate-900/60"
                    >
                      <td className="px-2 py-1 border-b border-slate-800 align-top">
                        <div className="font-medium text-slate-100">
                          {m.label}
                        </div>
                        {m.unit && (
                          <div className="text-[10px] text-slate-500">
                            ({m.unit})
                          </div>
                        )}
                      </td>
                      {gridPlayerIds.map((playerId) => {
                        const currentValue =
                          sessionData.values?.[playerId]?.[m.id]
                            ?.value_numeric ?? null;

                        return (
                          <td
                            key={playerId}
                            className="px-1 py-1 border-b border-slate-800 text-center align-top"
                          >
                            <input
                              type="number"
                              className="w-16 rounded bg-slate-800 border border-slate-600 px-1 py-0.5 text-[11px]"
                              value={currentValue ?? ""}
                              disabled={isFinalized || finalizing}
                              onChange={(e) =>
                                handleValueChange(
                                  playerId,
                                  m.id,
                                  e.target.value
                                )
                              }
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

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
            className="inline-flex items-center px-3 py-1.5 rounded-md bg-slate-700 text-slate-100 text-xs font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saving ? "Saving…" : "Save progress"}
          </button>
          <button
            type="button"
            onClick={handleFinalize}
            disabled={
              finalizing ||
              loadingTemplate ||
              isFinalized ||
              metrics.length === 0 ||
              gridPlayerIds.length === 0
            }
            className="inline-flex items-center px-3 py-1.5 rounded-md bg-emerald-500 text-slate-900 text-xs font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
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
