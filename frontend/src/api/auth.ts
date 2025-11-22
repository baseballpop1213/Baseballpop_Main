// src/api/auth.ts
import api from "./client";
import type { Profile } from "./types";

export async function getMe(): Promise<Profile | null> {
  try {
    const res = await api.get<Profile>("/me");
    return res.data;
  } catch (err: any) {
    // 401/403/etc will land here
    console.error("Error fetching /me:", err?.response?.data || err);
    return null;
  }
}

