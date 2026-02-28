"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { getAllTournaments, type Tournament } from "@/data/tournaments";

function formatDateTime(v: string) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "Date TBD";
  const datePart = d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
  const timePart = d.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  return `${datePart}, ${timePart}`;
}

function formatMoney(v: number) {
  return `Rs ${Number(v || 0).toLocaleString("en-IN")}`;
}

function StatusBadge({ status }: { status: Tournament["status"] }) {
  const base =
    "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider";

  if (status === "OPEN")
    return (
      <span className={`${base} border-emerald-400/35 bg-emerald-500/15 text-emerald-200`}>
        OPEN
      </span>
    );

  if (status === "FULL")
    return (
      <span className={`${base} border-orange-400/35 bg-orange-500/15 text-orange-200`}>
        FULL
      </span>
    );

  return (
    <span className={`${base} border-zinc-500/30 bg-zinc-700/20 text-zinc-200`}>
      COMPLETED
    </span>
  );
}

function getSlotsLeft(t: Tournament) {
  return Math.max(0, t.maxSlots - t.bookedCount);
}

function getFillPercent(t: Tournament) {
  if (t.maxSlots <= 0) return 0;
  return Math.min(100, Math.round((t.bookedCount / t.maxSlots) * 100));
}

function getModeBadgeLabel(t: Tournament) {
  if (t.matchType === "BR") {
    const mode = String(t.brMode ?? "SOLO").toLowerCase();
    return mode.charAt(0).toUpperCase() + mode.slice(1);
  }
  return "Clash Squad";
}

function getStartMs(dateTime: string) {
  const ms = new Date(dateTime).getTime();
  return Number.isFinite(ms) ? ms : Number.NaN;
}

function getUrgentState(t: Tournament) {
  const startMs = getStartMs(t.dateTime);
  if (!Number.isFinite(startMs) || t.status !== "OPEN") {
    return {
      urgent: false,
      label: "",
    };
  }

  const now = Date.now();
  const elapsedMs = now - startMs;
  if (elapsedMs < 0 || elapsedMs > 20 * 60 * 1000) {
    return {
      urgent: false,
      label: "",
    };
  }

  const mins = Math.max(1, Math.floor(elapsedMs / 60000));
  return {
    urgent: true,
    label: mins <= 1 ? "Match started now. Join quickly." : `Match started ${mins} min ago. Join quickly.`,
  };
}

export default function HomePage() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedType, setSelectedType] = useState<"BR" | "CS">("BR");
  const queueRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const all = await getAllTournaments();
      if (!active) return;
      setTournaments(all);
      setLoaded(true);
    };

    load();
    const timer = window.setInterval(load, 10000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const stats = useMemo(() => {
    const total = tournaments.length;
    const open = tournaments.filter((t) => t.status === "OPEN").length;
    const full = tournaments.filter((t) => t.status === "FULL").length;
    const totalSlots = tournaments.reduce((acc, t) => acc + t.maxSlots, 0);
    const bookedSlots = tournaments.reduce((acc, t) => acc + t.bookedCount, 0);
    return { total, open, full, totalSlots, bookedSlots };
  }, [tournaments]);

  const filteredTournaments = useMemo(
    () => tournaments.filter((t) => t.matchType === selectedType),
    [tournaments, selectedType]
  );
  const hasAny = stats.total > 0;
  const hasAnyForType = filteredTournaments.length > 0;

  function scrollToQueue() {
    queueRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <section className="relative overflow-hidden rounded-2xl border border-orange-500/25 bg-gradient-to-br from-[#181018] via-[#110e15] to-[#1b0b06] p-4 shadow-[0_20px_45px_rgba(0,0,0,0.45)] sm:p-6">
        <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-orange-500/30 blur-3xl sm:h-52 sm:w-52" />
        <div className="pointer-events-none absolute -bottom-20 -left-12 h-36 w-36 rounded-full bg-cyan-400/20 blur-3xl sm:h-44 sm:w-44" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-orange-400/60 to-transparent" />

        <div className="relative flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-orange-200/90">
              Free Fire Battleground
            </p>
            <h1 className="mt-1 text-2xl font-bold uppercase tracking-[0.06em] text-white sm:text-3xl md:text-4xl">
              Tournaments
            </h1>
            <p className="mt-1 max-w-xl text-sm text-zinc-300">
              Drop in fast. Track slots. Lock your match.
            </p>
          </div>

          <button
            type="button"
            onClick={scrollToQueue}
            className="inline-flex w-full items-center justify-center rounded-lg border border-orange-400/40 bg-orange-500/20 px-3.5 py-2 text-sm font-semibold text-orange-50 transition hover:bg-orange-500/30 md:w-auto"
          >
            Join Now
          </button>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <article className="rounded-xl border border-fuchsia-500/30 bg-fuchsia-500/10 p-3">
          <p className="text-[11px] uppercase tracking-wider text-fuchsia-200/90">Total</p>
          <p className="mt-1 text-xl font-bold text-fuchsia-100 sm:text-2xl">{stats.total}</p>
          <p className="mt-1 text-[11px] text-fuchsia-200/80">All</p>
        </article>
        <article className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
          <p className="text-[11px] uppercase tracking-wider text-emerald-300/90">Open</p>
          <p className="mt-1 text-xl font-bold text-emerald-200 sm:text-2xl">{stats.open}</p>
          <p className="mt-1 text-[11px] text-emerald-200/80">Join now</p>
        </article>
        <article className="rounded-xl border border-orange-500/30 bg-orange-500/10 p-3">
          <p className="text-[11px] uppercase tracking-wider text-orange-300/90">Full</p>
          <p className="mt-1 text-xl font-bold text-orange-200 sm:text-2xl">{stats.full}</p>
          <p className="mt-1 text-[11px] text-orange-200/80">Locked</p>
        </article>
        <article className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3">
          <p className="text-[11px] uppercase tracking-wider text-cyan-300/90">Booked</p>
          <p className="mt-1 text-xl font-bold text-cyan-200 sm:text-2xl">
            {stats.bookedSlots}/{stats.totalSlots}
          </p>
          <p className="mt-1 text-[11px] text-cyan-200/80">Slots</p>
        </article>
      </section>

      <section ref={queueRef} className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-bold uppercase tracking-wide text-white sm:text-lg">Live Queue</h2>
          <p className="text-xs text-zinc-400 sm:text-sm">
            {loaded ? `${filteredTournaments.length} in ${selectedType}` : "Loading..."}
          </p>
        </div>
        <div className="inline-flex w-full rounded-lg border border-white/10 bg-black/35 p-1">
            <button
              type="button"
              onClick={() => setSelectedType("BR")}
              className={`flex-1 rounded-md px-4 py-1.5 text-sm font-medium transition ${
                selectedType === "BR"
                  ? "bg-orange-500/25 text-orange-100"
                  : "text-zinc-300 hover:bg-white/10"
              }`}
            >
              BR
            </button>
            <button
              type="button"
              onClick={() => setSelectedType("CS")}
              className={`flex-1 rounded-md px-4 py-1.5 text-sm font-medium transition ${
                selectedType === "CS"
                  ? "bg-cyan-500/20 text-cyan-100"
                  : "text-zinc-300 hover:bg-white/10"
              }`}
            >
              CS
            </button>
        </div>

        {!hasAnyForType ? (
          <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-6 text-center">
            <p className="text-base font-semibold text-zinc-200">No {selectedType} tournaments available</p>
            <p className="mt-2 text-sm text-zinc-400">
              Create a {selectedType} tournament from Admin to populate this section.
            </p>
            <Link
              href="/admin/tournaments/new"
              className="mt-4 inline-flex items-center rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-zinc-200 transition hover:bg-white/10"
            >
              Go to Admin Create
            </Link>
          </div>
        ) : (
          <div className="grid gap-3">
            {filteredTournaments.map((t) => {
              const slotsLeft = getSlotsLeft(t);
              const fillPercent = getFillPercent(t);
              const winningPrize = Number((t as any).winningPrize ?? 0);
              const perKillPrize = Number((t as any).perKillPrize ?? 0);
              const prizePool =
                t.matchType === "BR"
                  ? Math.max(0, winningPrize + 50 * perKillPrize)
                  : Math.max(0, Number(t.prizePool ?? winningPrize));
              const roomPublished = Boolean((t as any).roomPublished);
              const urgentState = getUrgentState(t);
              const tone =
                t.matchType === "BR"
                  ? {
                      border: "border-orange-500/25 hover:border-orange-400/45",
                      glow: "from-orange-500/20 to-red-500/10",
                      bar: "from-orange-400 to-red-400",
                      type: "text-orange-200",
                    }
                  : {
                      border: "border-cyan-500/25 hover:border-cyan-400/45",
                      glow: "from-cyan-500/20 to-sky-500/10",
                      bar: "from-cyan-400 to-blue-400",
                      type: "text-cyan-200",
                    };

              return (
                <Link
                  key={t.id}
                  href={`/tournaments/${t.id}`}
                  className={`group block rounded-xl border bg-black/35 p-4 transition hover:bg-black/50 sm:rounded-2xl sm:p-5 ${tone.border} ${
                    urgentState.urgent ? "cz-urgent-card" : ""
                  }`}
                >
                  <div className={`mb-3 h-px w-full bg-gradient-to-r ${tone.glow}`} />
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <p className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-400">
                        {t.game}
                      </p>
                      <h3 className="mt-1 text-lg font-semibold text-white transition group-hover:text-zinc-100 sm:text-xl">
                        {t.name}
                      </h3>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <div className="inline-flex items-center gap-2 rounded-lg border border-yellow-300/40 bg-gradient-to-r from-yellow-500/20 to-amber-500/20 px-3 py-1.5">
                          <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-yellow-100/90">
                            Prize Pool
                          </span>
                          <span className="text-sm font-extrabold text-yellow-100 sm:text-base">
                            {prizePool > 0 ? formatMoney(prizePool) : "TBA"}
                          </span>
                        </div>
                        <span
                          className={`inline-flex items-center rounded-lg border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] ${tone.type} border-current/35 bg-black/25`}
                        >
                          {getModeBadgeLabel(t)}
                        </span>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2">
                          <p className="text-[10px] uppercase tracking-wider text-zinc-400">Time</p>
                          <p className="mt-1 text-sm font-semibold text-zinc-100 sm:text-[15px]">
                            {formatDateTime(t.dateTime)}
                          </p>
                        </div>
                        <div className="rounded-lg border border-orange-300/35 bg-gradient-to-r from-orange-500/20 to-amber-500/20 p-2">
                          <p className="text-[10px] uppercase tracking-wider text-orange-200/90">Entry Fee</p>
                          <p className="mt-1 text-sm font-extrabold text-orange-100 sm:text-[15px]">
                            {t.entryFee} Rs
                          </p>
                        </div>
                        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2">
                          <p className="text-[10px] uppercase tracking-wider text-zinc-400">Slots</p>
                          <p className="mt-1 text-sm font-semibold text-zinc-100 sm:text-[15px]">
                            {t.bookedCount}/{t.maxSlots}
                          </p>
                        </div>
                        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2">
                          <p className="text-[10px] uppercase tracking-wider text-zinc-400">Remaining</p>
                          <p className="mt-1 text-sm font-semibold text-zinc-100 sm:text-[15px]">
                            {slotsLeft}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center justify-between gap-3 md:flex-col md:items-end">
                      <StatusBadge status={t.status} />
                      {roomPublished ? (
                        <span className="inline-flex items-center rounded-full border border-emerald-400/35 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-100">
                          ID & PASS GIVEN
                        </span>
                      ) : null}
                      <p className="hidden text-xs text-zinc-400 md:block">Tap to view details</p>
                    </div>
                  </div>

                  {urgentState.urgent ? (
                    <div className="mt-3 rounded-lg border border-orange-300/45 bg-gradient-to-r from-orange-500/20 to-red-500/15 px-3 py-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-orange-100">
                        Join Quickly
                      </p>
                      <p className="mt-1 text-xs text-orange-50/95">{urgentState.label}</p>
                    </div>
                  ) : null}

                  <div className="mt-3">
                    <div className="mb-2 flex items-center justify-between text-xs text-zinc-400">
                      <span>Capacity</span>
                      <span>{fillPercent}% filled</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-white/10">
                      <div
                        className={`h-full rounded-full bg-gradient-to-r transition-all duration-500 ${tone.bar}`}
                        style={{ width: `${fillPercent}%` }}
                      />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

      </section>

      {false && (!hasAny ? (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="text-zinc-200">No tournaments yet.</p>
          <p className="mt-1 text-sm text-zinc-300">
            Go to Admin → Create to add your first tournament.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {tournaments.map((t) => (
            <Link
              key={t.id}
              href={`/tournaments/${t.id}`}
              className="block rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-white/10"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm text-zinc-300">{t.game}</p>
                  <h2 className="text-lg font-semibold text-white">{t.name}</h2>

                  <div className="mt-3 space-y-1 text-sm text-zinc-300">
                    <div>
                      Start:{" "}
                      <span className="text-white font-medium">
                        {formatDateTime(t.dateTime)}
                      </span>
                    </div>
                    <div>
                      Entry:{" "}
                      <span className="text-white font-medium">
                        {t.entryFee} Rs
                      </span>
                    </div>
                    <div>
                      Slots:{" "}
                      <span className="text-white font-medium">
                        {t.bookedCount} / {t.maxSlots}
                      </span>
                    </div>
                  </div>
                </div>

                <StatusBadge status={t.status} />
              </div>
            </Link>
          ))}
        </div>
      ))}
    </div>
  );
}
