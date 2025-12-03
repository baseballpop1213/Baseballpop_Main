// src/pages/Events/EventsPage.tsx
import { useEffect, useMemo, useState } from "react";
import { createEvent, listMyEvents, listTeamEvents, rsvpEvent, updateEvent } from "../../api/events";
import type { EventRecord, EventWithAttendees, RSVPStatus } from "../../api/events";
import { getMyTeams } from "../../api/coach";
import type { TeamWithRole } from "../../api/types";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../supabaseClient";

function formatDateTimeLabel(value?: string | null) {
  if (!value) return "TBD";
  const date = new Date(value);
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function displayName(profile?: { display_name?: string | null; first_name?: string | null; last_name?: string | null }) {
  if (!profile) return "Unknown";
  if (profile.display_name) return profile.display_name;
  const parts = [profile.first_name, profile.last_name].filter(Boolean).join(" ");
  return parts || "Unknown";
}

function toDateInput(value?: string | null) {
  if (!value) return "";
  const d = new Date(value);
  return d.toISOString().slice(0, 10);
}

function toTimeInput(value?: string | null) {
  if (!value) return "";
  const d = new Date(value);
  return d.toISOString().slice(11, 16);
}

function combineDateTime(date: string, time: string) {
  const iso = time ? `${date}T${time}:00` : `${date}T00:00:00`;
  return new Date(iso).toISOString();
}

const RSVP_CHOICES: { label: string; value: RSVPStatus }[] = [
  { label: "Going", value: "going" },
  { label: "Maybe", value: "maybe" },
  { label: "Declined", value: "declined" },
];

interface MyEventsState {
  attending: EventRecord[];
  invites: EventRecord[];
}

export default function EventsPage() {
  const { profile } = useAuth();
  const canManage = useMemo(
    () => ["coach", "assistant", "admin"].includes(profile?.role ?? ""),
    [profile?.role]
  );

  const [teams, setTeams] = useState<TeamWithRole[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [events, setEvents] = useState<EventWithAttendees[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [myEvents, setMyEvents] = useState<MyEventsState>({ attending: [], invites: [] });
  const [loadingMyEvents, setLoadingMyEvents] = useState(false);

  const [createForm, setCreateForm] = useState({
    title: "",
    description: "",
    date: "",
    time: "",
    endTime: "",
    location: "",
    attachmentFile: null as File | null,
  });
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
    date: "",
    time: "",
    endTime: "",
    location: "",
    attachmentUrl: "",
    attachmentFile: null as File | null,
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [rsvpLoadingId, setRsvpLoadingId] = useState<string | null>(null);

  useEffect(() => {
    async function bootstrap() {
      const myTeams = await getMyTeams().catch(() => [] as TeamWithRole[]);
      setTeams(myTeams);
      if (myTeams.length > 0) {
        setSelectedTeamId(myTeams[0].id);
      }
    }
    bootstrap();
  }, []);

  useEffect(() => {
    if (!selectedTeamId) return;
    loadEvents(selectedTeamId);
  }, [selectedTeamId]);

  useEffect(() => {
    loadMyEvents();
  }, [profile?.id]);

  async function loadEvents(teamId: string) {
    setLoadingEvents(true);
    try {
      const data = await listTeamEvents(teamId);
      setEvents(data);
    } catch (err) {
      console.error("Failed to load events", err);
    } finally {
      setLoadingEvents(false);
    }
  }

  async function loadMyEvents() {
    setLoadingMyEvents(true);
    try {
      const data = await listMyEvents();
      setMyEvents(data);
    } catch (err) {
      console.error("Failed to load my events", err);
    } finally {
      setLoadingMyEvents(false);
    }
  }

  async function uploadAttachment(teamId: string, file: File) {
    const path = `events/${teamId}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage
      .from("event-attachments")
      .upload(path, file, {
        cacheControl: "3600",
        upsert: true,
        contentType: file.type,
      });

    if (error) throw error;
    const { data: urlData } = supabase.storage
      .from("event-attachments")
      .getPublicUrl(path);
    return urlData.publicUrl;
  }

  async function handleCreateEvent() {
    if (!selectedTeamId || !createForm.title.trim() || !createForm.date) return;
    setCreating(true);
    try {
      const start_at = combineDateTime(createForm.date, createForm.time);
      const end_at = createForm.endTime ? combineDateTime(createForm.date, createForm.endTime) : null;

      let attachment_url: string | undefined;
      if (createForm.attachmentFile) {
        attachment_url = await uploadAttachment(selectedTeamId, createForm.attachmentFile);
      }

      await createEvent(selectedTeamId, {
        title: createForm.title.trim(),
        description: createForm.description.trim() || null,
        start_at,
        end_at,
        location: createForm.location.trim() || null,
        attachment_url: attachment_url ?? null,
        event_type: null,
        is_all_day: false,
      });

      setCreateForm({
        title: "",
        description: "",
        date: "",
        time: "",
        endTime: "",
        location: "",
        attachmentFile: null,
      });
      await loadEvents(selectedTeamId);
      await loadMyEvents();
    } catch (err) {
      console.error("Failed to create event", err);
    } finally {
      setCreating(false);
    }
  }

  function beginEdit(event: EventWithAttendees) {
    setEditingId(event.id);
    setEditForm({
      title: event.title ?? "",
      description: event.description ?? "",
      date: toDateInput(event.start_at),
      time: toTimeInput(event.start_at),
      endTime: toTimeInput(event.end_at),
      location: event.location ?? "",
      attachmentUrl: event.attachment_url ?? "",
      attachmentFile: null,
    });
  }

  async function handleUpdateEvent() {
    if (!editingId) return;
    setSavingEdit(true);
    try {
      const currentEvent = events.find((e) => e.id === editingId);
      const baseDate = editForm.date || toDateInput(currentEvent?.start_at);
      const start_at = baseDate ? combineDateTime(baseDate, editForm.time) : undefined;
      const end_at = editForm.endTime && baseDate ? combineDateTime(baseDate, editForm.endTime) : undefined;

      let attachment_url = editForm.attachmentUrl || undefined;
      if (editForm.attachmentFile && selectedTeamId) {
        attachment_url = await uploadAttachment(selectedTeamId, editForm.attachmentFile);
      }

      const payload: Partial<EventRecord> = {
        title: editForm.title.trim(),
        description: editForm.description.trim(),
        start_at,
        end_at,
        location: editForm.location.trim(),
        attachment_url: attachment_url ?? null,
      };

      await updateEvent(editingId, payload);
      setEditingId(null);
      await loadEvents(selectedTeamId);
      await loadMyEvents();
    } catch (err) {
      console.error("Failed to update event", err);
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleRsvp(eventId: string, status: RSVPStatus) {
    setRsvpLoadingId(eventId);
    try {
      await rsvpEvent(eventId, status);
      await loadEvents(selectedTeamId);
      await loadMyEvents();
    } catch (err) {
      console.error("Failed to save RSVP", err);
    } finally {
      setRsvpLoadingId(null);
    }
  }

  function renderAttendees(event: EventWithAttendees) {
    const grouped = event.attendees_by_role || {};
    const roles = ["coach", "assistant", "player", "parent", "admin"];

    return (
      <div className="space-y-2 text-xs">
        {roles.map((role) => {
          const list = grouped[role] || [];
          if (!list.length) return null;
          return (
            <div key={`${event.id}-${role}`} className="rounded-lg bg-slate-800/60 p-2">
              <div className="text-[11px] font-semibold uppercase text-slate-300">{role}s</div>
              <div className="flex flex-wrap gap-2">
                {list.map((att) => (
                  <span
                    key={att.profile_id}
                    className="rounded-full bg-slate-900 px-2 py-1 text-[11px] text-slate-200"
                  >
                    {displayName(att.profiles)} {att.rsvp_status !== "invited" && `(${att.rsvp_status})`}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Events</h2>
          <p className="text-sm text-slate-300">Create, update, and RSVP to team events.</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <label className="text-slate-400">Team</label>
          <select
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
            value={selectedTeamId}
            onChange={(e) => setSelectedTeamId(e.target.value)}
          >
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name} ({team.role})
              </option>
            ))}
          </select>
        </div>
      </div>

      {canManage && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow-lg">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Create event</h3>
            <span className="text-xs text-slate-400">Coaches, assistants, and admins only</span>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-xs uppercase text-slate-400">Title</label>
              <input
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                value={createForm.title}
                onChange={(e) => setCreateForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Practice, Game vs Tigers, etc."
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs uppercase text-slate-400">Date</label>
              <input
                type="date"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                value={createForm.date}
                onChange={(e) => setCreateForm((f) => ({ ...f, date: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs uppercase text-slate-400">Start time</label>
              <input
                type="time"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                value={createForm.time}
                onChange={(e) => setCreateForm((f) => ({ ...f, time: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs uppercase text-slate-400">End time (optional)</label>
              <input
                type="time"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                value={createForm.endTime}
                onChange={(e) => setCreateForm((f) => ({ ...f, endTime: e.target.value }))}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-xs uppercase text-slate-400">Location</label>
              <input
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                value={createForm.location}
                onChange={(e) => setCreateForm((f) => ({ ...f, location: e.target.value }))}
                placeholder="Field 1, 123 Park Ave"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-xs uppercase text-slate-400">Details</label>
              <textarea
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                rows={3}
                value={createForm.description}
                onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Notes, what to bring, etc."
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs uppercase text-slate-400">Attachment (optional)</label>
              <input
                type="file"
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, attachmentFile: e.target.files?.[0] ?? null }))
                }
                className="text-sm text-slate-300"
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-emerald-400 disabled:opacity-60"
              onClick={handleCreateEvent}
              disabled={creating || !createForm.title.trim() || !createForm.date}
            >
              {creating ? "Saving..." : "Create event"}
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Team events</h3>
            {loadingEvents && <span className="text-xs text-slate-400">Loading...</span>}
          </div>
          {events.length === 0 && !loadingEvents && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-300">
              No events yet for this team.
            </div>
          )}

          {events.map((event) => {
            const mapUrl = event.location
              ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`
              : null;
            const editing = editingId === event.id;

            return (
              <div key={event.id} className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-lg">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-lg font-semibold">{event.title}</h4>
                      <span className="rounded-full bg-slate-800 px-2 py-1 text-[11px] text-slate-300">
                        {event.my_rsvp_status ?? "invited"}
                      </span>
                    </div>
                    <div className="text-sm text-slate-300">{formatDateTimeLabel(event.start_at)}</div>
                    {event.end_at && (
                      <div className="text-xs text-slate-400">Ends {formatDateTimeLabel(event.end_at)}</div>
                    )}
                    {event.location && (
                      <div className="text-sm text-slate-200">
                        Location: {event.location}
                        {mapUrl && (
                          <a className="ml-2 text-emerald-400 underline" href={mapUrl} target="_blank" rel="noreferrer">
                            Open map
                          </a>
                        )}
                      </div>
                    )}
                    {event.description && (
                      <p className="text-sm text-slate-200">{event.description}</p>
                    )}
                    {event.attachment_url && (
                      <a
                        className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-400 underline"
                        href={event.attachment_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View attachment
                      </a>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {RSVP_CHOICES.map((choice) => (
                      <button
                        key={choice.value}
                        className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                          event.my_rsvp_status === choice.value
                            ? "bg-emerald-500 text-slate-900"
                            : "bg-slate-800 text-slate-200 hover:bg-slate-700"
                        }`}
                        disabled={rsvpLoadingId === event.id}
                        onClick={() => handleRsvp(event.id, choice.value)}
                      >
                        {choice.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-3 border-t border-slate-800 pt-3">
                  <div className="text-xs font-semibold text-slate-400">Attendees</div>
                  {renderAttendees(event)}
                </div>

                {canManage && (
                  <div className="mt-3 border-t border-slate-800 pt-3">
                    {editing ? (
                      <div className="space-y-2">
                        <div className="grid gap-2 md:grid-cols-2">
                          <input
                            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                            value={editForm.title}
                            onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                          />
                          <input
                            type="date"
                            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                            value={editForm.date}
                            onChange={(e) => setEditForm((f) => ({ ...f, date: e.target.value }))}
                          />
                          <input
                            type="time"
                            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                            value={editForm.time}
                            onChange={(e) => setEditForm((f) => ({ ...f, time: e.target.value }))}
                          />
                          <input
                            type="time"
                            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                            value={editForm.endTime}
                            onChange={(e) => setEditForm((f) => ({ ...f, endTime: e.target.value }))}
                            placeholder="End time"
                          />
                          <input
                            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm md:col-span-2"
                            value={editForm.location}
                            onChange={(e) => setEditForm((f) => ({ ...f, location: e.target.value }))}
                            placeholder="Location"
                          />
                          <textarea
                            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm md:col-span-2"
                            rows={3}
                            value={editForm.description}
                            onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                          />
                          <div className="text-xs text-slate-400 md:col-span-2">
                            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                              <div className="flex items-center gap-2">
                                <span>Attachment:</span>
                                {editForm.attachmentUrl && (
                                  <a
                                    className="text-emerald-400 underline"
                                    href={editForm.attachmentUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    Current file
                                  </a>
                                )}
                              </div>
                              <input
                                type="file"
                                onChange={(e) =>
                                  setEditForm((f) => ({ ...f, attachmentFile: e.target.files?.[0] ?? null }))
                                }
                                className="text-xs"
                              />
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            className="rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-slate-900 hover:bg-emerald-400 disabled:opacity-60"
                            onClick={handleUpdateEvent}
                            disabled={savingEdit}
                          >
                            {savingEdit ? "Saving..." : "Save changes"}
                          </button>
                          <button
                            className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-100"
                            onClick={() => setEditingId(null)}
                            disabled={savingEdit}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        className="mt-2 rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-700"
                        onClick={() => beginEdit(event)}
                      >
                        Edit event
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="space-y-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">My invites</h3>
              {loadingMyEvents && <span className="text-xs text-slate-400">Loading...</span>}
            </div>
            {myEvents.invites.length === 0 && !loadingMyEvents && (
              <div className="text-sm text-slate-300">No pending invites.</div>
            )}
            <div className="space-y-2">
              {myEvents.invites.map((evt) => (
                <div key={evt.id} className="rounded-xl bg-slate-800/70 p-3 text-sm">
                  <div className="font-semibold">{evt.title}</div>
                  <div className="text-slate-300">{formatDateTimeLabel(evt.start_at)}</div>
                  <div className="mt-2 flex gap-2">
                    {RSVP_CHOICES.map((choice) => (
                      <button
                        key={choice.value}
                        className={`rounded px-2 py-1 text-[11px] font-semibold ${
                          evt.my_rsvp_status === choice.value
                            ? "bg-emerald-500 text-slate-900"
                            : "bg-slate-700 text-slate-100"
                        }`}
                        onClick={() => handleRsvp(evt.id, choice.value)}
                      >
                        {choice.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <h3 className="text-lg font-semibold">My events</h3>
            {myEvents.attending.length === 0 && !loadingMyEvents && (
              <div className="text-sm text-slate-300">No RSVP'd events yet.</div>
            )}
            <div className="space-y-2">
              {myEvents.attending.map((evt) => (
                <div key={evt.id} className="rounded-xl bg-slate-800/70 p-3 text-sm">
                  <div className="font-semibold">{evt.title}</div>
                  <div className="text-slate-300">{formatDateTimeLabel(evt.start_at)}</div>
                  <div className="text-xs text-slate-400">Status: {evt.my_rsvp_status}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
