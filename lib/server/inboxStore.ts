import { supabase } from "@/lib/supabaseServer";

export type InboxMessageType = "ROOM" | "WALLET" | "RESULT" | "SYSTEM";

export type InboxMessage = {
  id: string;
  userId: string;
  type: InboxMessageType;
  title: string;
  message: string;
  createdAt: string;
  readAt?: string;
};

const DEFAULT_LIMIT = 100;
const HARD_LIMIT = 300;

function normalizeType(raw: unknown): InboxMessageType {
  const value = String(raw ?? "").toUpperCase();
  if (value === "ROOM" || value === "WALLET" || value === "RESULT" || value === "SYSTEM") {
    return value as InboxMessageType;
  }
  return "SYSTEM";
}

function mapInboxRow(row: any): InboxMessage {
  return {
    id: String(row?.id ?? crypto.randomUUID()),
    userId: String(row?.user_id ?? ""),
    type: normalizeType(row?.type),
    title: String(row?.title ?? "").trim() || "Update",
    message: String(row?.message ?? "").trim(),
    createdAt: String(row?.created_at ?? new Date().toISOString()),
    readAt: row?.read_at ? String(row.read_at) : undefined,
  };
}

export async function getInbox(userIdInput: string, limitInput = DEFAULT_LIMIT) {
  const userId = String(userIdInput ?? "").trim();
  if (!userId) return { messages: [], unreadCount: 0 };

  const limit = Math.max(1, Math.min(HARD_LIMIT, Math.floor(Number(limitInput || DEFAULT_LIMIT))));

  const [messagesRes, unreadRes] = await Promise.all([
    supabase
      .from("inbox_messages")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("inbox_messages")
      .select("id", { head: true, count: "exact" })
      .eq("user_id", userId)
      .is("read_at", null),
  ]);

  const messages = messagesRes.error ? [] : (messagesRes.data ?? []).map(mapInboxRow);
  const unreadCount = unreadRes.error ? 0 : Number(unreadRes.count ?? 0);

  return { messages, unreadCount };
}

export async function pushInboxMessage(
  userIdInput: string,
  input: { type?: InboxMessageType; title: string; message: string }
) {
  const userId = String(userIdInput ?? "").trim();
  if (!userId) return null;

  const { data, error } = await supabase
    .from("inbox_messages")
    .insert({
      user_id: userId,
      type: normalizeType(input.type),
      title: String(input.title ?? "").trim() || "Update",
      message: String(input.message ?? "").trim(),
      created_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error || !data) return null;
  return mapInboxRow(data);
}

export async function pushInboxMessageMany(
  userIdsInput: string[],
  input: { type?: InboxMessageType; title: string; message: string }
) {
  const userIds = Array.from(
    new Set(
      (Array.isArray(userIdsInput) ? userIdsInput : [])
        .map((userId) => String(userId ?? "").trim())
        .filter(Boolean)
    )
  );
  if (userIds.length === 0) return [];

  const now = new Date().toISOString();
  const payload = userIds.map((userId) => ({
    user_id: userId,
    type: normalizeType(input.type),
    title: String(input.title ?? "").trim() || "Update",
    message: String(input.message ?? "").trim(),
    created_at: now,
  }));

  const { data, error } = await supabase
    .from("inbox_messages")
    .insert(payload)
    .select("*");

  if (error || !data) return [];
  return (data ?? []).map(mapInboxRow);
}

export async function markInboxMessageRead(userIdInput: string, messageIdInput: string) {
  const userId = String(userIdInput ?? "").trim();
  const messageId = String(messageIdInput ?? "").trim();
  if (!userId || !messageId) return null;

  const { data: current, error: currentError } = await supabase
    .from("inbox_messages")
    .select("*")
    .eq("id", messageId)
    .eq("user_id", userId)
    .maybeSingle();

  if (currentError || !current) return null;
  if ((current as any).read_at) return mapInboxRow(current);

  const { data, error } = await supabase
    .from("inbox_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("id", messageId)
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error || !data) return null;
  return mapInboxRow(data);
}

export async function markAllInboxRead(userIdInput: string) {
  const userId = String(userIdInput ?? "").trim();
  if (!userId) return { updated: 0 };

  const { data, error } = await supabase
    .from("inbox_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("read_at", null)
    .select("id");

  if (error) return { updated: 0 };
  return { updated: (data ?? []).length };
}

