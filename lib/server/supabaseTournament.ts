import { supabase } from "@/lib/supabaseServer";

export type MatchType = "BR" | "CS";
export type BRMode = "SOLO" | "DUO" | "SQUAD";
export type TournamentStatus = "OPEN" | "FULL" | "COMPLETED";

const BR_MODE_SLOTS: Record<BRMode, number> = {
  SOLO: 48,
  DUO: 26,
  SQUAD: 12,
};

function toInt(value: unknown, fallback = 0) {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.floor(next);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

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

export function inferTeamSize(matchType: MatchType, brModeInput: unknown) {
  if (matchType !== "BR") return 1;
  const brMode = normalizeBrMode(brModeInput);
  if (brMode === "DUO") return 2;
  if (brMode === "SQUAD") return 4;
  return 1;
}

export function normalizeName(value: string) {
  return String(value ?? "").trim().toLowerCase();
}

export function normalizeTeamMembers(
  input: unknown,
  fallbackName = "",
  teamSize = 1
) {
  const source = Array.isArray(input) ? input : [];
  const cleaned = source
    .map((entry) => String(entry ?? "").trim())
    .filter(Boolean);

  if (cleaned.length === 0 && String(fallbackName ?? "").trim()) {
    cleaned.push(String(fallbackName).trim());
  }

  const deduped = cleaned.filter(
    (name, idx) =>
      cleaned.findIndex((candidate) => normalizeName(candidate) === normalizeName(name)) === idx
  );

  return deduped.slice(0, Math.max(1, teamSize));
}

export function bookingContainsName(row: any, normalizedName: string) {
  if (!normalizedName) return false;

  const player = normalizeName(String(row?.player_name ?? row?.playerName ?? ""));
  if (player === normalizedName) return true;

  const members = Array.isArray(row?.team_members)
    ? row.team_members
    : Array.isArray(row?.teamMembers)
      ? row.teamMembers
      : [];

  return members.some((entry: unknown) => normalizeName(String(entry ?? "")) === normalizedName);
}

export function computeTournamentStatus(
  rawStatus: unknown,
  bookedCount: number,
  maxSlots: number
): TournamentStatus {
  const status = String(rawStatus ?? "").toUpperCase();
  if (status === "COMPLETED") return "COMPLETED";
  return bookedCount >= maxSlots ? "FULL" : "OPEN";
}

export function mapTournamentRow(row: any, onlineBookedCountInput?: number) {
  if (!row) return null;

  const matchType = normalizeMatchType(row.match_type ?? row.matchType);
  const brMode = matchType === "BR" ? normalizeBrMode(row.br_mode ?? row.brMode) : null;
  const fixedMaxSlots =
    matchType === "BR" && brMode
      ? BR_MODE_SLOTS[brMode]
      : Math.max(1, toInt(row.max_slots ?? row.maxSlots, 1));

  const manualSoldSlots = clamp(
    toInt(row.manual_sold_slots ?? row.manualSoldSlots, 0),
    0,
    fixedMaxSlots
  );

  const onlineBookedCount =
    typeof onlineBookedCountInput === "number"
      ? Math.max(0, onlineBookedCountInput)
      : Math.max(
          0,
          toInt(row.booked_count ?? row.bookedCount, 0) - manualSoldSlots
        );

  const bookedCount = clamp(onlineBookedCount + manualSoldSlots, 0, fixedMaxSlots);
  const status = computeTournamentStatus(row.status, bookedCount, fixedMaxSlots);

  return {
    id: String(row.id),
    name: String(row.name ?? row.title ?? "Untitled Tournament"),
    game: String(row.game ?? "Free Fire"),
    matchType,
    brMode,
    brPrizeType: matchType === "BR" ? normalizeBrPrizeType(row.br_prize_type ?? row.brPrizeType) : null,
    dateTime: String(row.date_time ?? row.dateTime ?? ""),
    entryFee: Math.max(0, toInt(row.entry_fee ?? row.entryFee, 0)),
    maxSlots: fixedMaxSlots,
    bookedCount,
    manualSoldSlots,
    status,
    prizePool: Math.max(0, toInt(row.prize_pool ?? row.prizePool, 0)),
    winningPrize: Math.max(0, toInt(row.winning_prize ?? row.winningPrize, 0)),
    perKillPrize: Math.max(0, Number(row.per_kill_prize ?? row.perKillPrize ?? 0)),
    formatInfo: String(row.format_info ?? row.formatInfo ?? ""),
    rules: String(row.rules ?? ""),
    additionalInfo: String(row.additional_info ?? row.additionalInfo ?? ""),
    roomPublished: Boolean(row.room_id || row.room_pass),
    room:
      row.room_id || row.room_pass
        ? {
            id: String(row.room_id ?? ""),
            pass: String(row.room_pass ?? ""),
          }
        : undefined,
  };
}

export function mapBookingRow(row: any) {
  const teamSize = Math.max(1, toInt(row?.team_size ?? row?.teamSize, 1));
  const playerName = String(row?.player_name ?? row?.playerName ?? "");
  const teamMembers = normalizeTeamMembers(
    row?.team_members ?? row?.teamMembers,
    playerName,
    teamSize
  );

  return {
    id: String(row?.id ?? crypto.randomUUID()),
    tournamentId: String(row?.tournament_id ?? row?.tournamentId ?? ""),
    userId: String(row?.user_id ?? row?.userId ?? ""),
    username: row?.username ? String(row.username).trim() : undefined,
    playerName: String(playerName || teamMembers[0] || ""),
    teamMembers,
    teamSize,
    slotNumber: Math.max(1, toInt(row?.slot_number ?? row?.slotNumber, 1)),
    createdAt: String(row?.created_at ?? row?.createdAt ?? new Date().toISOString()),
    status: row?.status ? String(row.status) : undefined,
  };
}

export async function getOnlineBookingCountMap(tournamentIds: string[]) {
  const uniqueIds = Array.from(
    new Set(
      (Array.isArray(tournamentIds) ? tournamentIds : [])
        .map((id) => String(id ?? "").trim())
        .filter(Boolean)
    )
  );

  if (uniqueIds.length === 0) return {} as Record<string, number>;

  const { data, error } = await supabase
    .from("bookings")
    .select("tournament_id")
    .in("tournament_id", uniqueIds);

  if (error) throw error;

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    const id = String((row as any)?.tournament_id ?? "");
    if (!id) continue;
    counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
}

export async function getOnlineBookingCount(tournamentId: string) {
  const id = String(tournamentId ?? "").trim();
  if (!id) return 0;

  const { count, error } = await supabase
    .from("bookings")
    .select("id", { head: true, count: "exact" })
    .eq("tournament_id", id);

  if (error) throw error;
  return Math.max(0, Number(count ?? 0));
}

export async function recalcTournamentCounts(tournamentId: string) {
  const id = String(tournamentId ?? "").trim();
  if (!id) return null;

  const { data: tournamentRow, error: tournamentError } = await supabase
    .from("tournaments")
    .select("*")
    .eq("id", id)
    .single();

  if (tournamentError || !tournamentRow) return null;

  const onlineBookedCount = await getOnlineBookingCount(id);
  const maxSlots = Math.max(1, toInt((tournamentRow as any).max_slots, 1));
  const maxManualAllowed = Math.max(0, maxSlots - onlineBookedCount);
  const manualSoldSlots = clamp(
    toInt((tournamentRow as any).manual_sold_slots, 0),
    0,
    maxManualAllowed
  );
  const bookedCount = clamp(onlineBookedCount + manualSoldSlots, 0, maxSlots);
  const status = computeTournamentStatus((tournamentRow as any).status, bookedCount, maxSlots);

  const shouldUpdate =
    toInt((tournamentRow as any).manual_sold_slots, 0) !== manualSoldSlots ||
    toInt((tournamentRow as any).booked_count, 0) !== bookedCount ||
    String((tournamentRow as any).status ?? "").toUpperCase() !== status;

  let nextRow = tournamentRow;
  if (shouldUpdate) {
    const { data: updated, error: updateError } = await supabase
      .from("tournaments")
      .update({
        manual_sold_slots: manualSoldSlots,
        booked_count: bookedCount,
        status,
      })
      .eq("id", id)
      .select("*")
      .single();

    if (!updateError && updated) {
      nextRow = updated;
    }
  }

  return {
    tournament: mapTournamentRow(nextRow, onlineBookedCount),
    onlineBookedCount,
    maxManualAllowed,
  };
}

