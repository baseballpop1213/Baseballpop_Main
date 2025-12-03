// src/api/events.ts
import api from "./client";
import type { Profile } from "./types";

export type RSVPStatus = "invited" | "going" | "maybe" | "declined";

export interface EventRecord {
  id: string;
  team_id: string;
  created_by: string;
  title: string;
  description: string | null;
  event_type: string | null;
  start_at: string;
  end_at: string | null;
  is_all_day: boolean;
  location: string | null;
  attachment_url?: string | null;
  created_at?: string;
  updated_at?: string;
  my_rsvp_status?: RSVPStatus;
}

export interface EventAttendee {
  event_id: string;
  profile_id: string;
  rsvp_status: RSVPStatus;
  profiles: Profile;
}

export interface EventWithAttendees extends EventRecord {
  attendees_by_role?: Record<string, EventAttendee[]>;
}

export async function listTeamEvents(teamId: string): Promise<EventWithAttendees[]> {
  const res = await api.get(`/teams/${teamId}/events`);
  return res.data as EventWithAttendees[];
}

export async function getEvent(eventId: string): Promise<EventWithAttendees> {
  const res = await api.get(`/events/${eventId}`);
  return res.data as EventWithAttendees;
}

export async function createEvent(teamId: string, payload: Partial<EventRecord>): Promise<EventRecord> {
  const res = await api.post(`/teams/${teamId}/events`, payload);
  return res.data as EventRecord;
}

export async function updateEvent(eventId: string, payload: Partial<EventRecord>): Promise<EventWithAttendees> {
  const res = await api.patch(`/events/${eventId}`, payload);
  return res.data as EventWithAttendees;
}

export async function rsvpEvent(eventId: string, status: RSVPStatus): Promise<void> {
  await api.post(`/events/${eventId}/rsvp`, { status });
}

export async function listMyEvents(): Promise<{ attending: EventRecord[]; invites: EventRecord[] }> {
  const res = await api.get("/me/events");
  return res.data as { attending: EventRecord[]; invites: EventRecord[] };
}
