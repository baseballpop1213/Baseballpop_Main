// src/api/messaging.ts
import api from "./client";
import type { Profile } from "./types";

export interface ConversationParticipant extends Profile {}

export interface ConversationMessageAttachment {
  id: string;
  message_id: string;
  url: string;
  type: string | null;
  created_at: string;
}

export interface ConversationMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  attachments?: ConversationMessageAttachment[];
}

export interface Conversation {
  id: string;
  type: string;
  title: string | null;
  team_id: string | null;
  created_by: string;
  updated_at: string;
  participants: ConversationParticipant[];
  last_message?: ConversationMessage | null;
}

export interface TeamMemberRow {
  team_id: string;
  user_id: string;
  role: string;
  profiles: Profile;
}

export async function listConversations(): Promise<Conversation[]> {
  const res = await api.get<Conversation[]>("/conversations");
  return res.data;
}

export async function getConversationMessages(
  conversationId: string
): Promise<ConversationMessage[]> {
  const res = await api.get<ConversationMessage[]>(
    `/conversations/${conversationId}/messages`
  );
  return res.data;
}

export async function createConversation(payload: {
  type: "direct" | "group" | "team";
  title?: string | null;
  team_id?: string | null;
  participant_ids: string[];
}): Promise<Conversation> {
  const res = await api.post<Conversation>("/conversations", payload);
  return res.data;
}

export async function sendMessage(
  conversationId: string,
  content: string
): Promise<ConversationMessage> {
  const res = await api.post<ConversationMessage>(
    `/conversations/${conversationId}/messages`,
    { content }
  );
  return res.data;
}

export async function sendTeamMessage(
  teamId: string,
  content: string
): Promise<{ conversation: Conversation; message: ConversationMessage }> {
  const res = await api.post(`/teams/${teamId}/messages`, { content });
  return res.data as any;
}

export async function getTeamMembers(teamId: string): Promise<TeamMemberRow[]> {
  const res = await api.get<{ team_id: string; members: TeamMemberRow[] }>(
    `/teams/${teamId}/members`
  );
  return res.data.members;
}

export async function leaveConversation(conversationId: string): Promise<void> {
  await api.delete(`/conversations/${conversationId}/participants/me`);
}

export async function addMessageAttachments(
  messageId: string,
  attachments: { url: string; type: string | null }[]
): Promise<ConversationMessageAttachment[]> {
  const res = await api.post(`/messages/${messageId}/attachments`, {
    attachments,
  });
  return res.data as ConversationMessageAttachment[];
}
