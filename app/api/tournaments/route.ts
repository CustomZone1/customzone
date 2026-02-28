import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseServer";
import {
  mapTournamentRow,
  getOnlineBookingCountMap,
  type BRMode,
  type MatchType,
} from "@/lib/server/supabaseTournament";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BR_MODE_SLOT_MAP: Record<BRMode, number> = {
  SOLO: 48,
  DUO: 26,
  SQUAD: 12,
};

function normalizeMatchType(value: unknown): MatchType {
  return String(value ?? "").toUpperCase() === "CS" ? "CS" : "BR";
}

function normalizeBrMode(value: unknown): BRMode {
  const mode = String(value ?? "").toUpperCase();
  if (mode === "DUO" || mode === "SQUAD") return mode;
  return "SOLO";
}

function normalizeBrPrizeType(value: unknown): "PER_KILL" | "BOOYAH" | "BOTH" {
  const next = String(value ?? "").toUpperCase();
  if (next === "PER_KILL" || next === "BOOYAH") return next;
  return "BOTH";
}

function toInt(value: unknown, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.floor(n);
}

function normalizePrizeValues(
  matchType: MatchType,
  brPrizeType: "PER_KILL" | "BOOYAH" | "BOTH",
  winningPrizeInput: unknown,
  perKillPrizeInput: unknown,
  prizePoolInput: unknown
) {
  const safeWinning = Math.max(0, Number(winningPrizeInput ?? 0));
  const safePerKill = Math.max(0, Number(perKillPrizeInput ?? 0));
  const fallbackPool = Math.max(0, Number(prizePoolInput ?? 0));

  if (matchType !== "BR") {
    return {
      winningPrize: safeWinning || fallbackPool,
      perKillPrize: 0,
      prizePool: safeWinning || fallbackPool,
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
      winningPrize: safeWinning || fallbackPool,
      perKillPrize: 0,
      prizePool: safeWinning || fallbackPool,
    };
  }

  return {
    winningPrize: safeWinning,
    perKillPrize: safePerKill,
    prizePool: safeWinning + safePerKill * 50,
  };
}

export async function GET() {
  const { data, error } = await supabase
    .from("tournaments")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Supabase tournaments error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = data ?? [];
  const countsByTournament = await getOnlineBookingCountMap(rows.map((row) => String((row as any).id ?? "")));
  const tournaments = rows.map((row) =>
    mapTournamentRow(row, countsByTournament[String((row as any).id ?? "")] ?? 0)
  );

  return NextResponse.json({ tournaments });
}

export async function POST(req: Request) {
  let body: any = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  const name = String(body?.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "Tournament name is required." }, { status: 400 });
  }

  const matchType = normalizeMatchType(body?.matchType);
  const brMode = matchType === "BR" ? normalizeBrMode(body?.brMode) : null;
  const brPrizeType = matchType === "BR" ? normalizeBrPrizeType(body?.brPrizeType) : "BOTH";
  const maxSlots =
    matchType === "BR" && brMode
      ? BR_MODE_SLOT_MAP[brMode]
      : Math.max(1, toInt(body?.maxSlots, 1));

  const prizeValues = normalizePrizeValues(
    matchType,
    brPrizeType,
    body?.winningPrize,
    body?.perKillPrize,
    body?.prizePool
  );

  const payload = {
    game: String(body?.game ?? "Free Fire").trim() || "Free Fire",
    match_type: matchType,
    br_mode: brMode,
    br_prize_type: matchType === "BR" ? brPrizeType : null,
    name,
    date_time: String(body?.dateTime ?? "").trim(),
    entry_fee: Math.max(0, toInt(body?.entryFee, 0)),
    max_slots: maxSlots,
    booked_count: 0,
    manual_sold_slots: 0,
    status: "OPEN",
    prize_pool: Math.max(0, Number(prizeValues.prizePool ?? 0)),
    winning_prize: Math.max(0, Number(prizeValues.winningPrize ?? 0)),
    per_kill_prize: Math.max(0, Number(prizeValues.perKillPrize ?? 0)),
    format_info: String(body?.formatInfo ?? ""),
    rules: String(body?.rules ?? ""),
    additional_info: String(body?.additionalInfo ?? ""),
    room_id: null,
    room_pass: null,
  };

  const { data, error } = await supabase
    .from("tournaments")
    .insert(payload)
    .select("*")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Could not create tournament." }, { status: 500 });
  }

  return NextResponse.json({ tournament: mapTournamentRow(data, 0) }, { status: 201 });
}
