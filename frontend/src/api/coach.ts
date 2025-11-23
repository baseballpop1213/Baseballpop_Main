// src/api/coach.ts
import api from "./client";

export interface TeamWithRole {
  id: string;
  name: string;
  age_group: string | null;
  level: string | null;
  role: string;
}

export async function getMyTeams(): Promise<TeamWithRole[]> {
  const res = await api.get("/me/teams");
  return res.data;
}
