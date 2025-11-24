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

  function handleValueChange(
    metricId: number,
    playerId: string,
    raw: string
  ) {
    if (!sessionData || isFinalized) return;

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
          gridColumns.length === 0 && (
            <p className="text-xs text-slate-400">
              No players available for this session yet.
            </p>
          )}

        {!loadingTemplate &&
          !templateError &&
          metrics.length > 0 &&
          gridColumns.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full text-[11px] border border-slate-700 rounded-lg overflow-hidden">
                <thead className="bg-slate-800/80">
                  <tr>
                    <th className="text-left px-2 py-1 border-b border-slate-700">
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
                  {metrics.map((m) => {
                    const metricKey = (m as any).metric_key as string | undefined;
                    const meta = metricKey ? getMetricMeta(metricKey) : undefined;

                    const displayName =
                      meta?.shortLabel ||
                      meta?.displayName ||
                      (m as any).label ||
                      metricKey ||
                      "Metric";

                    const detailLineParts: string[] = [];

                    if (meta?.group) {
                      detailLineParts.push(meta.group);
                    }
                    if (meta?.code) {
                      detailLineParts.push(`Code: ${meta.code}`);
                    }
                    if ((m as any).unit) {
                      detailLineParts.push(`Unit: ${(m as any).unit}`);
                    }
                    if (meta?.unitHint && !detailLineParts.some((p) => p.includes("Unit"))) {
                      // Nice little extra: show unit hint if we haven’t already shown unit from DB
                      detailLineParts.push(meta.unitHint);
                    }

                    return (
                      <tr key={m.id} className="border-b border-slate-800">
                        <td className="align-top px-2 py-2">
                          <div className="font-medium text-slate-100">
                            {displayName}
                          </div>
                          {detailLineParts.length > 0 && (
                            <div className="text-[10px] text-slate-500 mt-0.5">
                              {detailLineParts.join(" · ")}
                            </div>
                          )}
                          {meta?.instructions && (
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              {meta.instructions}
                            </div>
                          )}
                        </td>
                        {gridColumns.map((col) => {
                          const playerId = col.id;
                          const perPlayer =
                            (sessionData.values as any)?.[playerId] || {};
                          const v = perPlayer[m.id];
                          const value =
                            v?.value_numeric ?? (v?.value_text ?? "");

                          return (
                            <td
                              key={playerId}
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
                  })}
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
              gridColumns.length === 0
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
