import { NextResponse } from "next/server";

import {
  getInbox,
  markAllInboxRead,
  markInboxMessageRead,
} from "@/lib/server/inboxStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseBody<T = any>(req: Request): Promise<T | null> {
  return req
    .json()
    .then((value) => value as T)
    .catch(() => null);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const userId = String(url.searchParams.get("userId") ?? "").trim();
  const limit = Number(url.searchParams.get("limit") ?? 100);

  if (!userId) {
    return NextResponse.json({ error: "userId is required." }, { status: 400 });
  }

  const data = await getInbox(userId, limit);
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const body = await parseBody(req);
  const mode = String((body as any)?.mode ?? "").toLowerCase();
  const userId = String((body as any)?.userId ?? "").trim();
  if (!userId) {
    return NextResponse.json({ error: "userId is required." }, { status: 400 });
  }

  if (mode === "mark-read") {
    const messageId = String((body as any)?.messageId ?? "").trim();
    if (!messageId) {
      return NextResponse.json({ error: "messageId is required." }, { status: 400 });
    }
    const message = await markInboxMessageRead(userId, messageId);
    if (!message) {
      return NextResponse.json({ error: "Message not found." }, { status: 404 });
    }
    return NextResponse.json({ message });
  }

  if (mode === "mark-all-read") {
    const result = await markAllInboxRead(userId);
    return NextResponse.json({ ok: true, updated: result.updated });
  }

  return NextResponse.json({ error: "Invalid inbox mode." }, { status: 400 });
}
