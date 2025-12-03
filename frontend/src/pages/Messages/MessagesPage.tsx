// src/pages/Messages/MessagesPage.tsx
import { useEffect, useMemo, useState } from "react";
import {
  addMessageAttachments,
  createConversation,
  getConversationMessages,
  getTeamMembers,
  leaveConversation,
  listConversations,
  sendMessage,
  sendTeamMessage,
  type Conversation,
  type ConversationMessage,
  type TeamMemberRow,
} from "../../api/messaging";
import { getMyTeams } from "../../api/coach";
import type { TeamWithRole } from "../../api/types";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../supabaseClient";

function displayName(profile?: { display_name?: string | null; first_name?: string | null; last_name?: string | null }) {
  if (!profile) return "Unknown";
  if (profile.display_name) return profile.display_name;
  const parts = [profile.first_name, profile.last_name].filter(Boolean).join(" ");
  return parts || "Unknown";
}

function roleAllowsMember(currentRole: string | undefined, memberRole: string) {
  if (!currentRole) return false;
  if (currentRole === "player" || currentRole === "parent") {
    return ["player", "coach", "assistant"].includes(memberRole);
  }
  if (currentRole === "assistant") {
    return ["player", "parent", "assistant", "coach"].includes(memberRole);
  }
  // Coaches/admins can see everyone on their teams
  return true;
}

function conversationLabel(convo: Conversation, currentUserId?: string | null) {
  if (convo.title) return convo.title;
  const others = (convo.participants || []).filter((p) => p.id !== currentUserId);
  if (others.length === 0) return "Conversation";
  return others.map((p) => displayName(p)).join(", ");
}

export default function MessagesPage() {
  const { profile } = useAuth();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sendLoading, setSendLoading] = useState(false);
  const [messageText, setMessageText] = useState("");
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);

  const [teams, setTeams] = useState<TeamWithRole[]>([]);
  const [teamMembers, setTeamMembers] = useState<Record<string, TeamMemberRow[]>>({});

  const [composeTeamId, setComposeTeamId] = useState<string>("");
  const [composeParticipants, setComposeParticipants] = useState<string[]>([]);
  const [composeTitle, setComposeTitle] = useState("");
  const [composeInitialMessage, setComposeInitialMessage] = useState("");
  const [composeLoading, setComposeLoading] = useState(false);

  const [broadcastTeamIds, setBroadcastTeamIds] = useState<string[]>([]);
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [broadcastLoading, setBroadcastLoading] = useState(false);

  const isCoach = profile?.role === "coach";
  const isAssistant = profile?.role === "assistant";

  useEffect(() => {
    async function bootstrap() {
      setLoadingConversations(true);
      try {
        const [convos, myTeams] = await Promise.all([
          listConversations(),
          getMyTeams().catch(() => [] as TeamWithRole[]),
        ]);
        setConversations(convos);
        setTeams(myTeams);
        if (!selectedConversationId && convos.length > 0) {
          setSelectedConversationId(convos[0].id);
        }
        if (!composeTeamId && myTeams.length > 0) {
          setComposeTeamId(myTeams[0].id);
          loadTeamMembers(myTeams[0].id);
        }
      } finally {
        setLoadingConversations(false);
      }
    }
    bootstrap();
    // We intentionally load the initial messaging state once on mount
    // to avoid spamming the API with repeated bootstrap calls.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    async function loadMessages() {
      if (!selectedConversationId) return;
      setLoadingMessages(true);
      try {
        const data = await getConversationMessages(selectedConversationId);
        setMessages(data);
      } finally {
        setLoadingMessages(false);
      }
    }
    loadMessages();
  }, [selectedConversationId]);

  async function refreshConversations() {
    setLoadingConversations(true);
    try {
      const convos = await listConversations();
      setConversations(convos);
    } finally {
      setLoadingConversations(false);
    }
  }

  async function handleSendMessage() {
    if (!selectedConversationId || !messageText.trim()) return;
    setSendLoading(true);
    try {
      const message = await sendMessage(selectedConversationId, messageText.trim());

      if (attachmentFiles.length > 0) {
        const uploads = await Promise.all(
          attachmentFiles.map(async (file) => {
            const path = `${selectedConversationId}/${message.id}-${Date.now()}-${file.name}`;
            const { error: uploadError } = await supabase.storage
              .from("message-attachments")
              .upload(path, file, {
                contentType: file.type,
                cacheControl: "3600",
                upsert: false,
              });

            if (uploadError) {
              throw uploadError;
            }

            const publicUrl = supabase.storage
              .from("message-attachments")
              .getPublicUrl(path).data.publicUrl;

            return {
              url: publicUrl,
              type: file.type || "attachment",
            };
          })
        );

        await addMessageAttachments(message.id, uploads);
      }

      setMessageText("");
      setAttachmentFiles([]);
      const data = await getConversationMessages(selectedConversationId);
      setMessages(data);
      await refreshConversations();
    } catch (err) {
      console.error("Error sending message", err);
    } finally {
      setSendLoading(false);
    }
  }

  async function loadTeamMembers(teamId: string) {
    if (!teamId || teamMembers[teamId]) return;
    try {
      const members = await getTeamMembers(teamId);
      setTeamMembers((prev) => ({ ...prev, [teamId]: members }));
    } catch (err) {
      console.error("Failed to load team members", err);
    }
  }

  const filteredMembers = useMemo(() => {
    if (!composeTeamId) return [] as TeamMemberRow[];
    const members = teamMembers[composeTeamId] ?? [];
    return members.filter(
      (m) =>
        m.user_id !== profile?.id && roleAllowsMember(profile?.role, m.role)
    );
  }, [composeTeamId, profile?.id, profile?.role, teamMembers]);

  async function handleCreateConversation() {
    if (!composeTeamId || composeParticipants.length === 0) return;
    setComposeLoading(true);
    try {
      const type = composeParticipants.length > 1 ? "group" : "direct";
      const convo = await createConversation({
        type,
        title: composeTitle || null,
        team_id: composeTeamId,
        participant_ids: composeParticipants,
      });

      if (composeInitialMessage.trim()) {
        await sendMessage(convo.id, composeInitialMessage.trim());
      }

      await refreshConversations();
      setSelectedConversationId(convo.id);
      setComposeParticipants([]);
      setComposeInitialMessage("");
      setComposeTitle("");
    } catch (err) {
      console.error("Failed to create conversation", err);
    } finally {
      setComposeLoading(false);
    }
  }

  async function handleBroadcast() {
    if (broadcastTeamIds.length === 0 || !broadcastMessage.trim()) return;
    setBroadcastLoading(true);
    try {
      for (const teamId of broadcastTeamIds) {
        await sendTeamMessage(teamId, broadcastMessage.trim());
      }
      await refreshConversations();
      setBroadcastMessage("");
    } catch (err) {
      console.error("Failed to send broadcast", err);
    } finally {
      setBroadcastLoading(false);
    }
  }

  async function handleLeaveConversation(conversationId: string) {
    try {
      await leaveConversation(conversationId);
      await refreshConversations();
      if (selectedConversationId === conversationId) {
        setSelectedConversationId(null);
        setMessages([]);
      }
    } catch (err) {
      console.error("Failed to leave conversation", err);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 xl:flex-row">
        <div className="flex-1 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow-lg">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xl font-semibold">Messages</h2>
            <button
              className="rounded-lg bg-slate-800 px-3 py-1 text-xs font-semibold hover:bg-slate-700"
              onClick={refreshConversations}
              disabled={loadingConversations}
            >
              Refresh
            </button>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm">New chat</h3>
                <span className="text-[10px] uppercase tracking-wide text-slate-400">
                  Team-only for players/parents/assistants
                </span>
              </div>
              <div className="mt-2 space-y-2 text-sm">
                <div>
                  <label className="text-xs text-slate-300">Team</label>
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800/80 p-2 text-sm"
                    value={composeTeamId}
                    onChange={(e) => {
                      const teamId = e.target.value;
                      setComposeTeamId(teamId);
                      setComposeParticipants([]);
                      if (teamId) loadTeamMembers(teamId);
                    }}
                  >
                    <option value="">Select team</option>
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name} ({team.role})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-300">Recipients</label>
                  <div className="mt-1 max-h-44 overflow-auto rounded-lg border border-slate-800 bg-slate-900/60 p-2 text-sm">
                    {composeTeamId ? (
                      filteredMembers.length > 0 ? (
                        filteredMembers.map((member) => (
                          <label
                            key={`${member.team_id}-${member.user_id}`}
                            className="flex items-center gap-2 rounded px-2 py-1 hover:bg-slate-800"
                          >
                            <input
                              type="checkbox"
                              className="h-4 w-4"
                              checked={composeParticipants.includes(member.user_id)}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setComposeParticipants((prev) => {
                                  if (checked) return Array.from(new Set([...prev, member.user_id]));
                                  return prev.filter((id) => id !== member.user_id);
                                });
                              }}
                            />
                            <span>
                              {displayName(member.profiles)}
                              <span className="ml-2 text-xs text-slate-400">{member.role}</span>
                            </span>
                          </label>
                        ))
                      ) : (
                        <div className="text-xs text-slate-400">No eligible teammates.</div>
                      )
                    ) : (
                      <div className="text-xs text-slate-400">Select a team to load members.</div>
                    )}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-300">Chat title (optional)</label>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800/80 p-2 text-sm"
                    value={composeTitle}
                    onChange={(e) => setComposeTitle(e.target.value)}
                    placeholder="Intra-squad chat"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-300">First message</label>
                  <textarea
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800/80 p-2 text-sm"
                    rows={2}
                    value={composeInitialMessage}
                    onChange={(e) => setComposeInitialMessage(e.target.value)}
                    placeholder="Kick things off with a message"
                  />
                </div>
                <button
                  className="w-full rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-emerald-400 disabled:opacity-50"
                  onClick={handleCreateConversation}
                  disabled={composeLoading || !composeTeamId || composeParticipants.length === 0}
                >
                  {composeLoading ? "Creating..." : "Start chat"}
                </button>
              </div>
            </div>

            {(isCoach || isAssistant) && (
              <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm">Team broadcast</h3>
                  <span className="text-[10px] uppercase tracking-wide text-slate-400">
                    Coach/assistant
                  </span>
                </div>
                <div className="mt-2 space-y-2 text-sm">
                  <div>
                  <label className="text-xs text-slate-300">Team(s)</label>
                  {isCoach ? (
                    <select
                      multiple
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800/80 p-2 text-sm"
                      value={broadcastTeamIds}
                      onChange={(e) => {
                        const options = Array.from(e.target.selectedOptions).map((o) => o.value);
                        setBroadcastTeamIds(options);
                      }}
                    >
                      {teams.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name} ({team.role})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <select
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800/80 p-2 text-sm"
                      value={broadcastTeamIds[0] ?? ""}
                      onChange={(e) => setBroadcastTeamIds(e.target.value ? [e.target.value] : [])}
                    >
                      <option value="">Select team</option>
                      {teams.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name} ({team.role})
                        </option>
                      ))}
                    </select>
                  )}
                    {!isCoach && (
                      <p className="mt-1 text-[11px] text-slate-400">
                        Assistants send to one team at a time.
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="text-xs text-slate-300">Announcement</label>
                    <textarea
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800/80 p-2 text-sm"
                      rows={3}
                      value={broadcastMessage}
                      onChange={(e) => setBroadcastMessage(e.target.value)}
                      placeholder="Game-day update for your teams"
                    />
                  </div>
                  <button
                    className="w-full rounded-lg bg-blue-500 px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-blue-400 disabled:opacity-50"
                    onClick={handleBroadcast}
                    disabled={
                      broadcastLoading ||
                      broadcastTeamIds.length === 0 ||
                      !broadcastMessage.trim()
                    }
                  >
                    {broadcastLoading ? "Sending..." : "Send to team(s)"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px,1fr]">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-3">
          <h3 className="text-sm font-semibold text-slate-200">Your conversations</h3>
          <div className="mt-2 space-y-2 overflow-auto">
            {loadingConversations && <div className="text-xs text-slate-400">Loading...</div>}
            {!loadingConversations && conversations.length === 0 && (
              <div className="text-xs text-slate-400">No conversations yet.</div>
            )}
            {conversations.map((convo) => {
              const isSelected = convo.id === selectedConversationId;
              return (
                <div
                  key={convo.id}
                  className={`rounded-xl border px-3 py-2 text-sm transition hover:border-emerald-400/60 ${
                    isSelected
                      ? "border-emerald-500 bg-emerald-500/10"
                      : "border-slate-800 bg-slate-950/40"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <button
                      className="text-left font-semibold"
                      onClick={() => setSelectedConversationId(convo.id)}
                    >
                      {conversationLabel(convo, profile?.id)}
                    </button>
                    <div className="flex items-center gap-2">
                      {(profile?.role === "player" || profile?.role === "parent") && (
                        <button
                          className="text-[11px] text-red-400 underline"
                          onClick={() => handleLeaveConversation(convo.id)}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-slate-400">
                    {convo.last_message?.content ? convo.last_message.content : "No messages yet"}
                  </div>
                  {convo.updated_at && (
                    <div className="text-[10px] text-slate-500">
                      Updated {new Date(convo.updated_at).toLocaleString()}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          {selectedConversationId ? (
            <div className="flex h-full flex-col">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-lg font-semibold">
                  {conversationLabel(
                    conversations.find((c) => c.id === selectedConversationId) ||
                      ({} as Conversation),
                    profile?.id
                  )}
                </h3>
                {(profile?.role === "player" || profile?.role === "parent") && (
                  <button
                    className="text-xs text-red-400 underline"
                    onClick={() => handleLeaveConversation(selectedConversationId)}
                  >
                    Leave chat
                  </button>
                )}
              </div>

              <div className="flex-1 space-y-2 overflow-auto rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                {loadingMessages && <div className="text-xs text-slate-400">Loading messages...</div>}
                {!loadingMessages && messages.length === 0 && (
                  <div className="text-xs text-slate-400">No messages yet.</div>
                )}
                {messages.map((msg) => (
                  <div key={msg.id} className="rounded-lg bg-slate-800/60 p-2 text-sm">
                    <div className="flex items-center justify-between text-xs text-slate-300">
                      <span>
                        {displayName(
                          conversations
                            .find((c) => c.id === selectedConversationId)
                            ?.participants.find((p) => p.id === msg.sender_id)
                        )}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {new Date(msg.created_at).toLocaleString()}
                      </span>
                    </div>
                    <div className="mt-1 whitespace-pre-wrap text-slate-100">{msg.content}</div>
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className="mt-2 space-y-1 text-xs">
                        {msg.attachments.map((att) => (
                          <a
                            key={att.id}
                            className="block rounded bg-slate-900/70 px-2 py-1 text-emerald-300 underline"
                            href={att.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {att.type || "attachment"}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="mt-3 space-y-2 rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                <label className="text-xs text-slate-300">Reply</label>
                <textarea
                  className="w-full rounded-lg border border-slate-700 bg-slate-800/80 p-2 text-sm"
                  rows={3}
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  placeholder="Type your message"
                />
                <input
                  type="file"
                  multiple
                  className="text-xs"
                  onChange={(e) => setAttachmentFiles(Array.from(e.target.files ?? []))}
                />
                <button
                  className="rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-emerald-400 disabled:opacity-50"
                  onClick={handleSendMessage}
                  disabled={sendLoading || !messageText.trim()}
                >
                  {sendLoading ? "Sending..." : "Send"}
                </button>
              </div>
            </div>
          ) : (
            <div className="text-sm text-slate-400">Select a conversation to start messaging.</div>
          )}
        </div>
      </div>
    </div>
  );
}
