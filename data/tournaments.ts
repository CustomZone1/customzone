export type TournamentStatus = "OPEN" | "FULL" | "COMPLETED";
export type MatchType = "BR" | "CS";
export type BRMode = "SOLO" | "DUO" | "SQUAD";
export type BRPrizeType = "PER_KILL" | "BOOYAH" | "BOTH";

export const BR_MODE_SLOT_MAP: Record<BRMode, number> = {
  SOLO: 48,
  DUO: 26,
  SQUAD: 12,
};

export type Tournament = {
  id: string;
  game: string;
  matchType: MatchType;
  brMode?: BRMode | null;
  brPrizeType?: BRPrizeType | null;
  roomPublished?: boolean;
  manualSoldSlots?: number;
  formatInfo?: string;
  rules?: string;
  prizePool?: number;
  winningPrize?: number;
  perKillPrize?: number;
  additionalInfo?: string;
  name: string;
  dateTime: string;
  entryFee: number;
  maxSlots: number;
  bookedCount: number;
  status: TournamentStatus;
  room?: { id?: string; pass?: string };
};

function inferBrMode(rawMode: unknown, maxSlots: number): BRMode {
  const mode = String(rawMode ?? "").toUpperCase();
  if (mode === "DUO" || mode === "SQUAD" || mode === "SOLO") return mode as BRMode;
  if (maxSlots === 26) return "DUO";
  if (maxSlots === 12 || maxSlots === 13) return "SQUAD";
  return "SOLO";
}

function normalizeBrPrizeType(raw: unknown): BRPrizeType {
  const value = String(raw ?? "").toUpperCase();
  if (value === "PER_KILL" || value === "BOOYAH" || value === "BOTH") {
    return value as BRPrizeType;
  }
  return "BOTH";
}

function normalizePrizeValues(
  matchType: MatchType,
  brPrizeType: BRPrizeType | null,
  rawWinningPrize: unknown,
  rawPerKillPrize: unknown,
  rawPrizePool: unknown
) {
  const fallbackPrizePool = Math.max(0, Number(rawPrizePool ?? 0));
  const hasWinningPrize =
    rawWinningPrize !== undefined &&
    rawWinningPrize !== null &&
    Number.isFinite(Number(rawWinningPrize));
  const hasPerKillPrize =
    rawPerKillPrize !== undefined &&
    rawPerKillPrize !== null &&
    Number.isFinite(Number(rawPerKillPrize));

  if (matchType !== "BR") {
    const winningPrize = hasWinningPrize
      ? Math.max(0, Number(rawWinningPrize))
      : fallbackPrizePool;
    return {
      winningPrize,
      perKillPrize: 0,
      prizePool: winningPrize,
    };
  }

  let winningPrize = hasWinningPrize ? Math.max(0, Number(rawWinningPrize)) : 0;
  let perKillPrize = hasPerKillPrize ? Math.max(0, Number(rawPerKillPrize)) : 0;

  // Backward compatibility for older tournaments that stored only prizePool.
  if (!hasWinningPrize && !hasPerKillPrize) {
    if (brPrizeType === "PER_KILL") {
      winningPrize = 0;
      perKillPrize = fallbackPrizePool / 50;
    } else {
      winningPrize = fallbackPrizePool;
      perKillPrize = 0;
    }
  }

  if (brPrizeType === "PER_KILL") winningPrize = 0;
  if (brPrizeType === "BOOYAH") perKillPrize = 0;

  return {
    winningPrize,
    perKillPrize,
    prizePool: Math.max(0, winningPrize + 50 * perKillPrize),
  };
}

function normalizeTournament(t: any): Tournament {
  const rawType = String(t?.matchType ?? "").toUpperCase();
  const matchType: MatchType =
    rawType === "BR" || rawType === "CS"
      ? (rawType as MatchType)
      : String(t?.game ?? "").toUpperCase().includes("CS")
        ? "CS"
        : "BR";

  const rawMaxSlots = Math.max(1, Number(t?.maxSlots ?? 1));
  const brMode = matchType === "BR" ? inferBrMode(t?.brMode, rawMaxSlots) : null;
  const brPrizeType = matchType === "BR" ? normalizeBrPrizeType(t?.brPrizeType) : null;
  const prizeValues = normalizePrizeValues(
    matchType,
    brPrizeType,
    t?.winningPrize,
    t?.perKillPrize,
    t?.prizePool
  );
  const maxSlots =
    matchType === "BR" && brMode ? BR_MODE_SLOT_MAP[brMode] : rawMaxSlots;
  const manualSoldSlots = Math.max(
    0,
    Math.min(maxSlots, Number(t?.manualSoldSlots ?? t?.offlineSoldSlots ?? 0))
  );
  const bookedCount = Math.max(0, Number(t?.bookedCount ?? 0));
  const statusRaw = String(t?.status ?? "").toUpperCase();
  const status: TournamentStatus =
    statusRaw === "COMPLETED"
      ? "COMPLETED"
      : bookedCount >= maxSlots
        ? "FULL"
        : "OPEN";

  return {
    id: String(t?.id ?? crypto.randomUUID()),
    game: String(t?.game ?? "Free Fire"),
    matchType,
    brMode,
    brPrizeType,
    roomPublished: Boolean(t?.roomPublished ?? t?.room?.id ?? t?.room?.pass),
    manualSoldSlots,
    formatInfo: String(t?.formatInfo ?? ""),
    rules: String(t?.rules ?? ""),
    prizePool: prizeValues.prizePool,
    winningPrize: prizeValues.winningPrize,
    perKillPrize: prizeValues.perKillPrize,
    additionalInfo: String(t?.additionalInfo ?? ""),
    name: String(t?.name ?? "Untitled Tournament"),
    dateTime: String(t?.dateTime ?? t?.dataTime ?? ""),
    entryFee: Number(t?.entryFee ?? 0),
    maxSlots,
    bookedCount: Math.min(bookedCount, maxSlots),
    status,
    room: t?.room ? { id: t.room.id, pass: t.room.pass } : undefined,
  };
}

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

export function getBrModeSlots(mode: BRMode): number {
  return BR_MODE_SLOT_MAP[mode];
}

export async function getAllTournaments(): Promise<Tournament[]> {
  const data = await parseResponse<{ tournaments: Tournament[] }>(
    await fetch("/api/tournaments", { cache: "no-store" })
  );
  return (data.tournaments ?? []).map(normalizeTournament);
}

export async function getTournamentById(id: string): Promise<Tournament | null> {
  try {
    const data = await parseResponse<{ tournament: Tournament }>(
      await fetch(`/api/tournaments/${id}`, { cache: "no-store" })
    );
    return normalizeTournament(data.tournament);
  } catch {
    return null;
  }
}

export async function createTournament(input: {
  game: string;
  matchType: MatchType;
  brMode?: BRMode | null;
  brPrizeType?: BRPrizeType | null;
  formatInfo?: string;
  rules?: string;
  prizePool?: number;
  winningPrize?: number;
  perKillPrize?: number;
  additionalInfo?: string;
  name: string;
  dateTime: string;
  entryFee: number;
  maxSlots: number;
}): Promise<Tournament> {
  const data = await parseResponse<{ tournament: Tournament }>(
    await fetch("/api/tournaments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
  );
  return normalizeTournament(data.tournament);
}

export async function incrementTournamentBooking(id: string): Promise<void> {
  await parseResponse<{ tournament: Tournament }>(
    await fetch(`/api/tournaments/${id}/book`, {
      method: "POST",
    })
  );
}
