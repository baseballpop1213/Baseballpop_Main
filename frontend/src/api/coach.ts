// src/api/coach.ts
import api from "./client";
import type { TeamWithRole } from "./types";

export async function getMyTeams(): Promise<TeamWithRole[]> {
  const res = await api.get<{ teams: TeamWithRole[] }>("/coach/my-teams");
  // Handle both shapes gracefully (just in case older data exists)
  return res.data.teams ?? (res.data as any);
}
