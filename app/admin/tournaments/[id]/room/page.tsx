"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { getTournamentById } from "@/data/tournaments";
import {
  clearRoomInfoShared,
  setRoomInfoShared,
} from "@/data/rooms";

export default function AdminEditRoomPage() {
  const params = useParams();
  const id = useMemo(() => String(params?.id || ""), [params]);

  const [loading, setLoading] = useState(true);
  const [tournamentName, setTournamentName] = useState<string | null>(null);
  const [tournamentGame, setTournamentGame] = useState<string | null>(null);

  const [roomId, setRoomId] = useState("");
  const [roomPassword, setRoomPassword] = useState("");
  const [savedMsg, setSavedMsg] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);

    (async () => {
      const t = await getTournamentById(id);
      if (!active) return;
      setTournamentName(t?.name ?? null);
      setTournamentGame(t?.game ?? null);
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [id]);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSavedMsg("");

    const rid = roomId.trim();
    const rpw = roomPassword.trim();

    if (!rid || !rpw) {
      setSavedMsg("Please enter both Room ID and Password.");
      return;
    }

    try {
      await setRoomInfoShared(id, rid, rpw);
      setSavedMsg("Saved");
    } catch (e: any) {
      setSavedMsg(String(e?.message ?? "Could not save room details."));
    }
  }

  async function onClear() {
    try {
      await clearRoomInfoShared(id);
      setRoomId("");
      setRoomPassword("");
      setSavedMsg("Cleared");
    } catch (e: any) {
      setSavedMsg(String(e?.message ?? "Could not clear room details."));
    }
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-zinc-200">
        Loading tournament...
      </div>
    );
  }

  if (!tournamentName) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-zinc-200">
        Tournament not found.{" "}
        <Link className="underline" href="/admin/tournaments">
          Back
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Edit Room</h1>
          <p className="mt-1 text-sm text-zinc-300">
            {tournamentName} - {tournamentGame ?? "Free Fire"}
          </p>
        </div>

        <div className="flex gap-2">
          <Link
            href="/admin/tournaments"
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200 hover:bg-white/10"
          >
            Back
          </Link>
          <Link
            href={`/tournaments/${id}`}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200 hover:bg-white/10"
          >
            View Public Page
          </Link>
        </div>
      </div>

      <form
        onSubmit={onSave}
        className="max-w-xl space-y-4 rounded-xl border border-white/10 bg-white/5 p-4"
      >
        <div>
          <label className="text-sm text-zinc-300">Room ID</label>
          <input
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            className="mt-2 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-white placeholder:text-zinc-600 outline-none focus:border-white/20"
            placeholder="e.g. 123456789"
          />
        </div>

        <div>
          <label className="text-sm text-zinc-300">Room Password</label>
          <input
            value={roomPassword}
            onChange={(e) => setRoomPassword(e.target.value)}
            className="mt-2 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-white placeholder:text-zinc-600 outline-none focus:border-white/20"
            placeholder="e.g. 7777"
          />
        </div>

        {savedMsg ? <div className="text-sm text-emerald-200">{savedMsg}</div> : null}

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-zinc-950 hover:bg-zinc-200"
          >
            Save Room
          </button>

          <button
            type="button"
            onClick={onClear}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200 hover:bg-white/10"
          >
            Clear
          </button>
        </div>
      </form>

      <div className="text-sm text-zinc-400">
        Room details are synced from server. Booked players can view them on the tournament page
        as soon as you save Room ID and Password.
      </div>
    </div>
  );
}
