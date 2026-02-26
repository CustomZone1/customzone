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

type InboxPayload = {
  messages: InboxMessage[];
  unreadCount: number;
};

async function parseResponse<T>(res: Response): Promise<T> {
  let payload: any = null;
  try {
    payload = await res.json();
  } catch {
    payload = {};
  }

  if (!res.ok) {
    throw new Error(String(payload?.error ?? `Request failed (${res.status})`));
  }

  return payload as T;
}

export async function getInboxShared(userId: string, limit = 100): Promise<InboxPayload> {
  const uid = String(userId ?? "").trim();
  if (!uid) return { messages: [], unreadCount: 0 };

  try {
    return await parseResponse<InboxPayload>(
      await fetch(
        `/api/inbox?userId=${encodeURIComponent(uid)}&limit=${encodeURIComponent(String(limit))}`,
        { cache: "no-store" }
      )
    );
  } catch {
    return { messages: [], unreadCount: 0 };
  }
}

export async function markInboxMessageReadShared(userId: string, messageId: string) {
  const uid = String(userId ?? "").trim();
  const mid = String(messageId ?? "").trim();
  if (!uid || !mid) return { ok: false as const, reason: "Invalid request." };

  try {
    const data = await parseResponse<{ message: InboxMessage }>(
      await fetch("/api/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "mark-read", userId: uid, messageId: mid }),
      })
    );
    return { ok: true as const, message: data.message };
  } catch (error: any) {
    return { ok: false as const, reason: String(error?.message ?? "Could not update message.") };
  }
}

export async function markAllInboxReadShared(userId: string) {
  const uid = String(userId ?? "").trim();
  if (!uid) return { ok: false as const, reason: "Invalid request." };

  try {
    const data = await parseResponse<{ ok: true; updated: number }>(
      await fetch("/api/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "mark-all-read", userId: uid }),
      })
    );
    return { ok: true as const, updated: data.updated };
  } catch (error: any) {
    return { ok: false as const, reason: String(error?.message ?? "Could not update inbox.") };
  }
}
