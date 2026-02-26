"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { getAllTournaments, type Tournament } from "@/data/tournaments";
import { getTournamentBookingsShared, type Booking } from "@/data/bookings";

function formatDateTime(v: string) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString();
}

export default function AdminTournamentsPage() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [bookingsByTournament, setBookingsByTournament] = useState<Record<string, Booking[]>>({});
  const [manualSoldInputs, setManualSoldInputs] = useState<Record<string, string>>({});
  const [savingManualId, setSavingManualId] = useState<string>("");
  const [deletingId, setDeletingId] = useState<string>("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      const all = await getAllTournaments();
      if (!active) return;
      setTournaments(all);
      setManualSoldInputs((prev) => {
        const next = { ...prev };
        for (const tournament of all) {
          if (typeof next[tournament.id] === "undefined") {
            next[tournament.id] = String(Number(tournament.manualSoldSlots ?? 0));
          }
        }
        return next;
      });
    };

    load();
    const timer = window.setInterval(load, 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (tournaments.length === 0) {
      setBookingsByTournament({});
      return;
    }

    let active = true;
    const load = async () => {
      const rows = await Promise.all(
        tournaments.map(async (t) => {
          const bookings = await getTournamentBookingsShared(t.id);
          return [t.id, bookings] as const;
        })
      );
      if (!active) return;

      const next: Record<string, Booking[]> = {};
      rows.forEach(([id, bookings]) => {
        next[id] = bookings;
      });
      setBookingsByTournament(next);
    };

    load();
    const timer = window.setInterval(load, 5000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [tournaments]);

  async function onDeleteTournament(id: string, name: string) {
    const ok = window.confirm(`Delete tournament "${name}"? This cannot be undone.`);
    if (!ok) return;

    setMessage("");
    setDeletingId(id);

    try {
      const res = await fetch(`/api/tournaments/${id}`, { method: "DELETE" });
      if (!res.ok) {
        let err = "Could not delete tournament.";
        try {
          const payload = (await res.json()) as { error?: string };
          if (payload?.error) err = payload.error;
        } catch {
          // ignore
        }
        setMessage(err);
        return;
      }

      setTournaments((prev) => prev.filter((t) => t.id !== id));
      setBookingsByTournament((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setMessage("Tournament deleted.");
    } catch {
      setMessage("Could not delete tournament.");
    } finally {
      setDeletingId("");
    }
  }

  async function onSaveManualSoldSlots(tournament: Tournament) {
    setMessage("");
    setSavingManualId(tournament.id);

    try {
      const nextManualSoldSlots = Number(manualSoldInputs[tournament.id] ?? 0);
      if (!Number.isFinite(nextManualSoldSlots) || nextManualSoldSlots < 0) {
        setMessage("Manual sold slots must be 0 or more.");
        return;
      }

      const res = await fetch(`/api/tournaments/${tournament.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manualSoldSlots: nextManualSoldSlots }),
      });

      const payload = (await res.json()) as {
        tournament?: Tournament;
        onlineBookedCount?: number;
        maxManualAllowed?: number;
        error?: string;
      };

      if (!res.ok || !payload.tournament) {
        setMessage(payload.error || "Could not update sold slots.");
        return;
      }

      setTournaments((prev) =>
        prev.map((item) => (item.id === tournament.id ? payload.tournament! : item))
      );
      setManualSoldInputs((prev) => ({
        ...prev,
        [tournament.id]: String(Number(payload.tournament?.manualSoldSlots ?? 0)),
      }));
      setMessage(
        `Updated sold slots for "${tournament.name}". Online: ${payload.onlineBookedCount ?? 0}, physical allowed max: ${payload.maxManualAllowed ?? 0}.`
      );
    } catch {
      setMessage("Could not update sold slots.");
    } finally {
      setSavingManualId("");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Admin Tournaments</h1>
          <p className="mt-1 text-sm text-zinc-300">Manage tournaments shared across all devices.</p>
          {message ? <p className="mt-2 text-sm text-zinc-200">{message}</p> : null}
        </div>

        <Link
          href="/admin/tournaments/new"
          className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-zinc-950 hover:bg-zinc-200"
        >
          + Create Tournament
        </Link>
      </div>

      {tournaments.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="text-zinc-200">No tournaments found.</p>
          <p className="mt-1 text-sm text-zinc-300">Create your first tournament to see it here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tournaments.map((t) => (
            <div key={t.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-zinc-300">
                    {t.game} - {t.matchType}
                    {t.matchType === "BR" && t.brMode ? ` - ${t.brMode}` : ""}
                  </p>
                  <h2 className="text-lg font-semibold text-white">{t.name}</h2>

                  <div className="mt-2 space-y-1 text-sm text-zinc-300">
                    <div>
                      Start: <span className="text-white font-medium">{formatDateTime(t.dateTime)}</span>
                    </div>
                    <div>
                      Slots: <span className="text-white font-medium">{t.bookedCount} / {t.maxSlots}</span>
                      {"  "}- Entry: <span className="text-white font-medium">Rs {t.entryFee}</span>
                    </div>
                    <div>
                      Online booked:{" "}
                      <span className="text-white font-medium">
                        {(bookingsByTournament[t.id] ?? []).length}
                      </span>
                      {"  "}- Physical sold:{" "}
                      <span className="text-white font-medium">{Number(t.manualSoldSlots ?? 0)}</span>
                    </div>
                  </div>

                  <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
                    <p className="text-xs uppercase tracking-wide text-zinc-400">
                      Physical Sold Slots (Offline)
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        value={manualSoldInputs[t.id] ?? String(Number(t.manualSoldSlots ?? 0))}
                        onChange={(e) =>
                          setManualSoldInputs((prev) => ({
                            ...prev,
                            [t.id]: e.target.value,
                          }))
                        }
                        className="w-28 rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
                      />
                      <button
                        type="button"
                        onClick={() => onSaveManualSoldSlots(t)}
                        disabled={savingManualId === t.id}
                        className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {savingManualId === t.id ? "Saving..." : "Save Physical Sold"}
                      </button>
                    </div>
                    <p className="mt-2 text-xs text-zinc-400">
                      Total sold shown to users = online booked + physical sold.
                    </p>
                  </div>

                  <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
                    <p className="text-xs uppercase tracking-wide text-zinc-400">
                      Slot Booking Map
                    </p>
                    {(bookingsByTournament[t.id] ?? []).length === 0 ? (
                      <p className="mt-2 text-sm text-zinc-400">No bookings yet.</p>
                    ) : (
                      <div className="mt-2 space-y-2">
                        {(bookingsByTournament[t.id] ?? []).map((b) => (
                          <div
                            key={`${b.tournamentId}-${b.slotNumber}-${b.playerName}`}
                            className="rounded-md border border-white/10 bg-zinc-950/40 p-2 text-sm"
                          >
                            <p className="font-semibold text-zinc-100">Slot #{b.slotNumber}</p>
                            <p className="mt-1 text-zinc-200">
                              In-game names: {(b.teamMembers ?? [b.playerName]).join(", ")}
                              {(b.teamSize ?? 1) > (b.teamMembers?.length ?? 0)
                                ? ` (${(b.teamSize ?? 1) - (b.teamMembers?.length ?? 0)} missing)`
                                : ""}
                            </p>
                            <p className="mt-1 text-zinc-300">
                              Booked by account:{" "}
                              <span className="font-medium text-emerald-200">
                                {b.username
                                  ? `@${b.username}`
                                  : b.userId
                                    ? b.userId
                                    : "Not linked (legacy booking)"}
                              </span>
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/tournaments/${t.id}`}
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200 hover:bg-white/10"
                  >
                    View
                  </Link>

                  <Link
                    href={`/admin/tournaments/${t.id}/room`}
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200 hover:bg-white/10"
                  >
                    Edit Room
                  </Link>

                  <button
                    type="button"
                    onClick={() => onDeleteTournament(t.id, t.name)}
                    disabled={deletingId === t.id}
                    className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {deletingId === t.id ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
