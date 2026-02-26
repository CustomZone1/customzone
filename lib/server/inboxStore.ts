import { promises as fs } from "fs";
import path from "path";

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

type InboxStoreFile = {
  messages: InboxMessage[];
};

const DB_FILE = path.join(process.cwd(), "data", "inbox.db.json");
const DEFAULT_LIMIT = 100;
const HARD_LIMIT = 300;

let writeQueue: Promise<void> = Promise.resolve();

function normalizeType(raw: unknown): InboxMessageType {
  const value = String(raw ?? "").toUpperCase();
  if (value === "ROOM" || value === "WALLET" || value === "RESULT" || value === "SYSTEM") {
    return value as InboxMessageType;
  }
  return "SYSTEM";
}

function normalizeMessage(raw: any): InboxMessage | null {
  const userId = String(raw?.userId ?? "").trim();
  if (!userId) return null;

  return {
    id: String(raw?.id ?? crypto.randomUUID()),
    userId,
    type: normalizeType(raw?.type),
    title: String(raw?.title ?? "").trim() || "Update",
    message: String(raw?.message ?? "").trim(),
    createdAt: String(raw?.createdAt ?? new Date().toISOString()),
    readAt: raw?.readAt ? String(raw.readAt) : undefined,
  };
}

async function ensureStoreFile() {
  try {
    await fs.access(DB_FILE);
  } catch {
    const initial: InboxStoreFile = { messages: [] };
    await fs.writeFile(DB_FILE, JSON.stringify(initial, null, 2), "utf8");
  }
}

async function readStore(): Promise<InboxStoreFile> {
  await ensureStoreFile();
  const raw = await fs.readFile(DB_FILE, "utf8");
  try {
    const parsed = JSON.parse(raw) as Partial<InboxStoreFile>;
    const messages = Array.isArray(parsed?.messages)
      ? parsed.messages.map(normalizeMessage).filter(Boolean) as InboxMessage[]
      : [];
    return { messages };
  } catch {
    return { messages: [] };
  }
}

async function writeStore(data: InboxStoreFile) {
  await ensureStoreFile();
  await fs.writeFile(DB_FILE, JSON.stringify(data, null, 2), "utf8");
}

function withWriteLock<T>(operation: () => Promise<T>): Promise<T> {
  const next = writeQueue.then(operation, operation);
  writeQueue = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

function sortNewest(messages: InboxMessage[]) {
  return [...messages].sort((a, b) => {
    const aTime = new Date(a.createdAt).getTime();
    const bTime = new Date(b.createdAt).getTime();
    return bTime - aTime;
  });
}

export async function getInbox(userIdInput: string, limitInput = DEFAULT_LIMIT) {
  const userId = String(userIdInput ?? "").trim();
  if (!userId) return { messages: [], unreadCount: 0 };

  const limit = Math.max(1, Math.min(HARD_LIMIT, Math.floor(Number(limitInput || DEFAULT_LIMIT))));
  const store = await readStore();
  const mine = sortNewest(store.messages.filter((entry) => entry.userId === userId)).slice(0, limit);
  const unreadCount = mine.filter((entry) => !entry.readAt).length;
  return { messages: mine, unreadCount };
}

export async function pushInboxMessage(
  userIdInput: string,
  input: { type?: InboxMessageType; title: string; message: string }
) {
  return withWriteLock(async () => {
    const userId = String(userIdInput ?? "").trim();
    if (!userId) return null;

    const next: InboxMessage = {
      id: crypto.randomUUID(),
      userId,
      type: normalizeType(input.type),
      title: String(input.title ?? "").trim() || "Update",
      message: String(input.message ?? "").trim(),
      createdAt: new Date().toISOString(),
    };

    const store = await readStore();
    store.messages.unshift(next);
    await writeStore(store);
    return next;
  });
}

export async function pushInboxMessageMany(
  userIdsInput: string[],
  input: { type?: InboxMessageType; title: string; message: string }
) {
  return withWriteLock(async () => {
    const userIds = Array.from(
      new Set(
        (Array.isArray(userIdsInput) ? userIdsInput : [])
          .map((userId) => String(userId ?? "").trim())
          .filter(Boolean)
      )
    );
    if (userIds.length === 0) return [];

    const now = new Date().toISOString();
    const type = normalizeType(input.type);
    const title = String(input.title ?? "").trim() || "Update";
    const message = String(input.message ?? "").trim();
    const next = userIds.map((userId) => ({
      id: crypto.randomUUID(),
      userId,
      type,
      title,
      message,
      createdAt: now,
    } satisfies InboxMessage));

    const store = await readStore();
    store.messages.unshift(...next);
    await writeStore(store);
    return next;
  });
}

export async function markInboxMessageRead(userIdInput: string, messageIdInput: string) {
  return withWriteLock(async () => {
    const userId = String(userIdInput ?? "").trim();
    const messageId = String(messageIdInput ?? "").trim();
    if (!userId || !messageId) return null;

    const store = await readStore();
    const idx = store.messages.findIndex(
      (entry) => entry.id === messageId && entry.userId === userId
    );
    if (idx === -1) return null;

    if (!store.messages[idx].readAt) {
      store.messages[idx] = {
        ...store.messages[idx],
        readAt: new Date().toISOString(),
      };
      await writeStore(store);
    }
    return store.messages[idx];
  });
}

export async function markAllInboxRead(userIdInput: string) {
  return withWriteLock(async () => {
    const userId = String(userIdInput ?? "").trim();
    if (!userId) return { updated: 0 };

    const store = await readStore();
    let updated = 0;
    const readAt = new Date().toISOString();
    store.messages = store.messages.map((entry) => {
      if (entry.userId !== userId || entry.readAt) return entry;
      updated += 1;
      return { ...entry, readAt };
    });

    if (updated > 0) {
      await writeStore(store);
    }
    return { updated };
  });
}
