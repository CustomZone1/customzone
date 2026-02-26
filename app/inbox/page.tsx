"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  clearUserSession,
  getUserSession,
  onUserSessionChange,
  type AuthUser,
} from "@/data/userSession";
import {
  getInboxShared,
  markAllInboxReadShared,
  type InboxMessage,
  type InboxMessageType,
} from "@/data/inbox";

function formatDateTime(v: string) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function messageTypeClass(type: InboxMessageType) {
  if (type === "ROOM") {
    return "border-orange-400/45 bg-orange-500/20 text-orange-100";
  }
  if (type === "WALLET") {
    return "border-cyan-400/45 bg-cyan-500/20 text-cyan-100";
  }
  if (type === "RESULT") {
    return "border-emerald-400/45 bg-emerald-500/20 text-emerald-100";
  }
  return "border-white/15 bg-white/10 text-zinc-200";
}

function AuthRequiredCard() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 text-zinc-100">
      <div className="rounded-xl border border-white/10 bg-white/5 p-6">
        <h1 className="text-xl font-semibold text-white">Inbox Login Required</h1>
        <p className="mt-2 text-sm text-zinc-300">
          Please login or create an account to access your inbox.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/auth"
            className="rounded-lg border border-orange-400/45 bg-orange-500/20 px-3 py-2 text-sm font-semibold text-orange-100 hover:bg-orange-500/30"
          >
            Login / Sign Up
          </Link>
          <Link
            href="/"
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200 hover:bg-white/10"
          >
            Back to tournaments
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function InboxPage() {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [refreshTick, setRefreshTick] = useState(0);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const sortedMessages = useMemo(
    () =>
      [...messages].sort((a, b) => {
        const aTime = new Date(a.createdAt).getTime();
        const bTime = new Date(b.createdAt).getTime();
        return bTime - aTime;
      }),
    [messages]
  );

  useEffect(() => {
    const sync = () => {
      setAuthUser(getUserSession());
      setAuthReady(true);
    };

    sync();
    return onUserSessionChange(sync);
  }, []);

  useEffect(() => {
    if (!authUser?.id) {
      setMessages([]);
      setUnreadCount(0);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setMessage("");

    const load = async () => {
      const data = await getInboxShared(authUser.id, 120);
      if (!active) return;
      setMessages(data.messages ?? []);
      setUnreadCount(Number(data.unreadCount ?? 0));
      setLoading(false);
    };

    load();
    const timer = window.setInterval(load, 10000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [authUser?.id, refreshTick]);

  async function onMarkAllRead() {
    if (!authUser?.id) return;
    setMessage("");
    const result = await markAllInboxReadShared(authUser.id);
    if (!result.ok) {
      setMessage(result.reason || "Could not update inbox.");
      return;
    }
    setMessage(result.updated > 0 ? "All messages marked as read." : "No unread messages.");
    setRefreshTick((v) => v + 1);
  }

  function onLogout() {
    clearUserSession();
  }

  if (!authReady) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 text-zinc-200">
        Loading...
      </div>
    );
  }

  if (!authUser) {
    return <AuthRequiredCard />;
  }

  return (
    <div className="mx-auto max-w-3xl px-3 py-6 text-zinc-100 sm:px-4 sm:py-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Inbox</h1>
          <p className="mt-1 text-xs text-zinc-400">
            {unreadCount} unread - one-way updates from CustomZone
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setRefreshTick((v) => v + 1)}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-200 hover:bg-white/10"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={onMarkAllRead}
            className="rounded-lg border border-cyan-400/35 bg-cyan-500/15 px-3 py-1.5 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/25"
          >
            Mark All Read
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-200 hover:bg-white/10"
          >
            Logout
          </button>
        </div>
      </div>

      {message ? <p className="mt-3 text-sm text-zinc-200">{message}</p> : null}

      {loading ? (
        <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-300">
          Loading inbox...
        </div>
      ) : sortedMessages.length === 0 ? (
        <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-300">
          No messages yet.
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {sortedMessages.map((entry) => (
            <div
              key={entry.id}
              className={`rounded-xl border p-3 ${
                entry.readAt ? "border-white/10 bg-white/[0.03]" : "border-orange-400/25 bg-orange-500/10"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span
                    className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${messageTypeClass(entry.type)}`}
                  >
                    {entry.type}
                  </span>
                  <h2 className="mt-2 text-sm font-semibold text-white">{entry.title}</h2>
                </div>
                <p className="text-[11px] text-zinc-400">{formatDateTime(entry.createdAt)}</p>
              </div>
              <p className="mt-2 whitespace-pre-line text-sm text-zinc-200">{entry.message}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
