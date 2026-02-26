"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createTournament,
  getBrModeSlots,
  type BRMode,
  type BRPrizeType,
} from "@/data/tournaments";

function toISOFromDateAndTime(dateValue: string, timeValue: string) {
  if (!dateValue || !timeValue) return "";
  const localDateTime = `${dateValue}T${timeValue}`;
  const d = new Date(localDateTime);
  return Number.isNaN(d.getTime()) ? localDateTime : d.toISOString();
}

function buildDefaultFormatInfo(matchType: "BR" | "CS", brMode: BRMode, maxSlots: number) {
  if (matchType === "CS") {
    if (maxSlots === 2) return "cs - body";
    if (maxSlots > 2) return "cs - tournament";
    return "Clash Squad custom room format.";
  }
  if (brMode === "SQUAD") {
    return "BR Squad: 12 teams, 4 players per team.";
  }
  if (brMode === "DUO") {
    return "BR Duo: 26 teams, 2 players per team.";
  }
  return "BR Solo: 48 players.";
}

function computePrizeValues(
  matchType: "BR" | "CS",
  brPrizeType: BRPrizeType,
  winningPrizeInput: number,
  perKillPrizeInput: number
) {
  const safeWinning = Math.max(0, Number(winningPrizeInput || 0));
  const safePerKill = Math.max(0, Number(perKillPrizeInput || 0));

  if (matchType !== "BR") {
    return {
      winningPrize: safeWinning,
      perKillPrize: 0,
      prizePool: safeWinning,
    };
  }

  if (brPrizeType === "PER_KILL") {
    return {
      winningPrize: 0,
      perKillPrize: safePerKill,
      prizePool: safePerKill * 50,
    };
  }

  if (brPrizeType === "BOOYAH") {
    return {
      winningPrize: safeWinning,
      perKillPrize: 0,
      prizePool: safeWinning,
    };
  }

  return {
    winningPrize: safeWinning,
    perKillPrize: safePerKill,
    prizePool: safeWinning + safePerKill * 50,
  };
}

export default function CreateTournamentPage() {
  const router = useRouter();

  const [game, setGame] = useState("Free Fire");
  const [matchType, setMatchType] = useState<"BR" | "CS">("BR");
  const [brMode, setBrMode] = useState<BRMode>("SOLO");
  const [brPrizeType, setBrPrizeType] = useState<BRPrizeType>("BOTH");
  const [name, setName] = useState("");
  const [matchDate, setMatchDate] = useState("");
  const [matchTime, setMatchTime] = useState("");
  const [entryFee, setEntryFee] = useState<number>(10);
  const [maxSlots, setMaxSlots] = useState<number>(getBrModeSlots("SOLO"));
  const [winningPrize, setWinningPrize] = useState<number>(0);
  const [perKillPrize, setPerKillPrize] = useState<number>(0);
  const [rules, setRules] = useState("");
  const [additionalInfo, setAdditionalInfo] = useState("");

  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dateInputRef = useRef<HTMLInputElement | null>(null);
  const timeInputRef = useRef<HTMLInputElement | null>(null);

  function onSelectMatchType(nextType: "BR" | "CS") {
    setMatchType(nextType);
    if (nextType === "BR") {
      setMaxSlots(getBrModeSlots(brMode));
    } else {
      setMaxSlots(100);
    }
  }

  function onSelectBrMode(nextMode: BRMode) {
    setBrMode(nextMode);
    if (matchType === "BR") {
      setMaxSlots(getBrModeSlots(nextMode));
    }
  }

  function openPicker(ref: React.RefObject<HTMLInputElement | null>) {
    const input = ref.current;
    if (!input) return;
    try {
      if ("showPicker" in input && typeof input.showPicker === "function") {
        input.showPicker();
        return;
      }
    } catch {
      // Fallback below.
    }
    input.focus();
    input.click();
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    const n = name.trim();
    if (!n) return setMsg("Tournament name is required.");
    if (!matchDate || !matchTime) return setMsg("Date and time are required.");
    if (!Number.isFinite(entryFee) || entryFee < 0) return setMsg("Entry fee must be 0 or more.");
    if (!Number.isFinite(maxSlots) || maxSlots <= 0) return setMsg("Max slots must be at least 1.");
    if (matchType !== "BR" || brPrizeType !== "PER_KILL") {
      if (!Number.isFinite(winningPrize) || winningPrize < 0) {
        return setMsg("Winning prize must be 0 or more.");
      }
    }
    if (matchType === "BR" && brPrizeType !== "BOOYAH") {
      if (!Number.isFinite(perKillPrize) || perKillPrize < 0) {
        return setMsg("Per-kill prize must be 0 or more.");
      }
    }

    const prizeValues = computePrizeValues(
      matchType,
      brPrizeType,
      Number(winningPrize),
      Number(perKillPrize)
    );

    setBusy(true);
    try {
      const t = await createTournament({
        game: game.trim() || "Free Fire",
        matchType,
        brMode: matchType === "BR" ? brMode : null,
        brPrizeType: matchType === "BR" ? brPrizeType : null,
        formatInfo: buildDefaultFormatInfo(matchType, brMode, Number(maxSlots)),
        rules: rules.trim(),
        winningPrize: prizeValues.winningPrize,
        perKillPrize: prizeValues.perKillPrize,
        prizePool: prizeValues.prizePool,
        additionalInfo: additionalInfo.trim(),
        name: n,
        dateTime: toISOFromDateAndTime(matchDate, matchTime),
        entryFee: Number(entryFee),
        maxSlots: Number(maxSlots),
      });

      router.push(`/tournaments/${t.id}`);
    } catch {
      setMsg("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-white">
          Create Tournament
        </h1>
        <p className="mt-1 text-sm text-zinc-300">
          Admin-only. Shared across all devices.
        </p>
      </div>

      <form
        onSubmit={onSubmit}
        className="max-w-2xl rounded-xl border border-white/10 bg-white/5 p-4 space-y-4"
      >
        <label className="block text-sm text-zinc-200">
          Match Type
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onSelectMatchType("BR")}
              className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                matchType === "BR"
                  ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-100"
                  : "border-white/10 bg-zinc-950 text-zinc-200 hover:bg-white/10"
              }`}
            >
              BR
            </button>
            <button
              type="button"
              onClick={() => onSelectMatchType("CS")}
              className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                matchType === "CS"
                  ? "border-cyan-400/60 bg-cyan-500/20 text-cyan-100"
                  : "border-white/10 bg-zinc-950 text-zinc-200 hover:bg-white/10"
              }`}
            >
              CS
            </button>
          </div>
        </label>

        {matchType === "BR" ? (
          <div className="space-y-4">
            <label className="block text-sm text-zinc-200">
              BR Type
              <div className="mt-2 grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => onSelectBrMode("SOLO")}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                    brMode === "SOLO"
                      ? "border-orange-400/60 bg-orange-500/20 text-orange-100"
                      : "border-white/10 bg-zinc-950 text-zinc-200 hover:bg-white/10"
                  }`}
                >
                  Solo
                </button>
                <button
                  type="button"
                  onClick={() => onSelectBrMode("DUO")}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                    brMode === "DUO"
                      ? "border-orange-400/60 bg-orange-500/20 text-orange-100"
                      : "border-white/10 bg-zinc-950 text-zinc-200 hover:bg-white/10"
                  }`}
                >
                  Duo
                </button>
                <button
                  type="button"
                  onClick={() => onSelectBrMode("SQUAD")}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                    brMode === "SQUAD"
                      ? "border-orange-400/60 bg-orange-500/20 text-orange-100"
                      : "border-white/10 bg-zinc-950 text-zinc-200 hover:bg-white/10"
                  }`}
                >
                  Squad
                </button>
              </div>
              <p className="mt-2 text-xs text-zinc-400">
                Slots are auto-set for BR: Solo 48, Duo 26, Squad 12.
              </p>
            </label>

            <label className="block text-sm text-zinc-200">
              BR Prize Mode
              <div className="mt-2 grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setBrPrizeType("PER_KILL")}
                  className={`rounded-lg border px-3 py-2 text-xs font-semibold uppercase tracking-wide transition ${
                    brPrizeType === "PER_KILL"
                      ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-100"
                      : "border-white/10 bg-zinc-950 text-zinc-200 hover:bg-white/10"
                  }`}
                >
                  Per Kill
                </button>
                <button
                  type="button"
                  onClick={() => setBrPrizeType("BOOYAH")}
                  className={`rounded-lg border px-3 py-2 text-xs font-semibold uppercase tracking-wide transition ${
                    brPrizeType === "BOOYAH"
                      ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-100"
                      : "border-white/10 bg-zinc-950 text-zinc-200 hover:bg-white/10"
                  }`}
                >
                  Booyah
                </button>
                <button
                  type="button"
                  onClick={() => setBrPrizeType("BOTH")}
                  className={`rounded-lg border px-3 py-2 text-xs font-semibold uppercase tracking-wide transition ${
                    brPrizeType === "BOTH"
                      ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-100"
                      : "border-white/10 bg-zinc-950 text-zinc-200 hover:bg-white/10"
                  }`}
                >
                  Both
                </button>
              </div>
            </label>
          </div>
        ) : null}

        <label className="block text-sm text-zinc-200">
          Game
          <input
            value={game}
            onChange={(e) => setGame(e.target.value)}
            className="mt-2 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-zinc-100"
            placeholder="Free Fire"
          />
        </label>

        <label className="block text-sm text-zinc-200">
          Tournament Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-2 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-zinc-100"
            placeholder="e.g. Fight For Cash"
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm text-zinc-200">
            Match Date
            <div className="mt-2 flex gap-2">
              <input
                ref={dateInputRef}
                type="date"
                value={matchDate}
                onChange={(e) => setMatchDate(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-zinc-100"
              />
              <button
                type="button"
                onClick={() => openPicker(dateInputRef)}
                className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-200 hover:bg-white/10"
              >
                Calendar
              </button>
            </div>
          </label>

          <label className="block text-sm text-zinc-200">
            Match Time
            <div className="mt-2 flex gap-2">
              <input
                ref={timeInputRef}
                type="time"
                value={matchTime}
                onChange={(e) => setMatchTime(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-zinc-100"
              />
              <button
                type="button"
                onClick={() => openPicker(timeInputRef)}
                className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-200 hover:bg-white/10"
              >
                Time
              </button>
            </div>
          </label>
        </div>

        <label className="block text-sm text-zinc-200">
          Entry Fee (Rs)
          <input
            type="number"
            value={entryFee}
            onChange={(e) => setEntryFee(Number(e.target.value))}
            className="mt-2 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-zinc-100"
            min={0}
          />
        </label>

        <label className="block text-sm text-zinc-200">
          Max Slots {matchType === "BR" ? "(auto)" : ""}
          <input
            type="number"
            value={maxSlots}
            onChange={(e) => setMaxSlots(Number(e.target.value))}
            className="mt-2 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-zinc-100"
            min={1}
            disabled={matchType === "BR"}
          />
        </label>
        {(() => {
          const prizeValues = computePrizeValues(
            matchType,
            brPrizeType,
            Number(winningPrize),
            Number(perKillPrize)
          );
          return (
            <div className="space-y-3">
              {matchType !== "BR" || brPrizeType !== "PER_KILL" ? (
                <label className="block text-sm text-zinc-200">
                  Winning Prize (Booyah) (Rs)
                  <input
                    type="number"
                    value={winningPrize}
                    onChange={(e) => setWinningPrize(Number(e.target.value))}
                    className="mt-2 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-zinc-100"
                    min={0}
                  />
                </label>
              ) : null}

              {matchType === "BR" && brPrizeType !== "BOOYAH" ? (
                <label className="block text-sm text-zinc-200">
                  Per Kill Prize (y) (Rs)
                  <input
                    type="number"
                    value={perKillPrize}
                    onChange={(e) => setPerKillPrize(Number(e.target.value))}
                    className="mt-2 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-zinc-100"
                    min={0}
                  />
                </label>
              ) : null}

              <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 p-3">
                <p className="text-xs uppercase tracking-wide text-amber-100/85">
                  Prize Pool (Auto for Home Card)
                </p>
                <p className="mt-1 text-lg font-semibold text-amber-100">
                  Rs {prizeValues.prizePool.toLocaleString("en-IN")}
                </p>
                <p className="mt-1 text-xs text-amber-100/80">
                  Formula: x + 50y, where x = winning prize and y = per-kill prize.
                </p>
              </div>
            </div>
          );
        })()}

        <label className="block text-sm text-zinc-200">
          Rules (optional)
          <textarea
            value={rules}
            onChange={(e) => setRules(e.target.value)}
            rows={3}
            className="mt-2 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-zinc-100"
            placeholder="One rule per line"
          />
        </label>

        <label className="block text-sm text-zinc-200">
          Additional Info (optional)
          <textarea
            value={additionalInfo}
            onChange={(e) => setAdditionalInfo(e.target.value)}
            rows={3}
            className="mt-2 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-zinc-100"
            placeholder="Any extra details for players"
          />
        </label>

        {msg && (
          <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-zinc-200">
            {msg}
          </div>
        )}

        <button
          disabled={busy}
          className={`w-full rounded-lg px-4 py-2 text-sm font-medium ${
            busy
              ? "bg-white/10 text-zinc-400 cursor-not-allowed"
              : "bg-white text-zinc-950 hover:bg-zinc-200"
          }`}
        >
          {busy ? "Creating…" : "Create Tournament"}
        </button>
      </form>
    </div>
  );
}
