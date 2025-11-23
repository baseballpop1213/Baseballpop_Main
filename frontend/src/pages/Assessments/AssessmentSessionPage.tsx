// src/pages/Assessments/AssessmentSessionPage.tsx
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  getEvalSessionById,
  type EvalSession,
} from "../../api/assessments";

export default function AssessmentSessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();

  const [session, setSession] = useState<EvalSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setError("Missing session id in URL.");
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await getEvalSessionById(sessionId);
        if (!cancelled) {
          setSession(data);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(
            err?.response?.data?.message ||
              err?.message ||
              "Failed to load session."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  if (loading) {
    return (
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">
          Assessment session
        </h2>
        <p className="text-sm text-slate-300">Loading session…</p>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">
          Assessment session
        </h2>
        <p className="text-sm text-red-400">
          {error || "Session not found."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="space-y-1">
        <h2 className="text-xl font-semibold">Assessment session</h2>
        <p className="text-sm text-slate-300">
          Session ID:{" "}
          <span className="font-mono">{session.id}</span>
        </p>
        <p className="text-xs text-slate-400">
          Team ID:{" "}
          <span className="font-mono">
            {session.team_id || "none"}
          </span>
        </p>
        <p className="text-xs text-slate-400">
          Template ID:{" "}
          <span className="font-mono">{session.template_id}</span>
        </p>
        <p className="text-xs text-slate-400">
          Mode:{" "}
          <span className="font-mono">{session.mode}</span> · Status:{" "}
          <span className="font-mono">{session.status}</span>
        </p>
      </section>

      <section className="space-y-2">
        <p className="text-sm text-slate-300">
          This is the bare session shell. Next, we’ll plug in:
        </p>
        <ul className="list-disc list-inside text-sm text-slate-300">
          <li>Section tabs (Athletic, Hitting, etc.)</li>
          <li>
            Drill-first flow (each test for all players, then next
            test)
          </li>
          <li>Per-section and per-drill progress bars</li>
          <li>Later: multi-coach station locks</li>
        </ul>
      </section>
    </div>
  );
}
