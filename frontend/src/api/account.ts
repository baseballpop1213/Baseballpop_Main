// src/api/account.ts
import api from "./client";
import type {
  Profile,
  PlayerProfile,
  CoachProfile,
  ParentChildLink,
  CreateAccountPayload,
  UpdateBasicProfilePayload,
  UpsertPlayerProfilePayload,
  UpsertCoachProfilePayload,
} from "./types";

export async function createBasicAccount(payload: CreateAccountPayload) {
  const res = await api.post<Profile>("/accounts/basic", payload);
  return res.data;
}

export async function updateBasicProfile(payload: UpdateBasicProfilePayload) {
  const res = await api.patch<Profile>("/me", payload);
  return res.data;
}

export async function getPlayerProfile() {
  const res = await api.get<{ profile: Profile; player_profile: PlayerProfile | null }>(
    "/me/player-profile"
  );
  return res.data;
}

export async function upsertPlayerProfile(payload: UpsertPlayerProfilePayload) {
  const res = await api.put<{ profile: Profile; player_profile: PlayerProfile }>(
    "/me/player-profile",
    payload
  );
  return res.data;
}

export async function getCoachProfile() {
  const res = await api.get<{ profile: Profile; coach_profile: CoachProfile | null }>(
    "/me/coach-profile"
  );
  return res.data;
}

export async function upsertCoachProfile(payload: UpsertCoachProfilePayload) {
  const res = await api.put<{ profile: Profile; coach_profile: CoachProfile }>(
    "/me/coach-profile",
    payload
  );
  return res.data;
}

export async function getParentChildren() {
  const res = await api.get<ParentChildLink[]>("/me/children");
  return res.data;
}

export async function addParentChildLink(child_profile_id: string, relationship?: string) {
  const res = await api.post("/me/children", {
    child_profile_id,
    relationship: relationship?.trim() || null,
  });
  return res.data as { link: ParentChildLink; child: Profile };
}

export async function removeParentChildLink(childProfileId: string) {
  await api.delete(`/me/children/${childProfileId}`);
}

