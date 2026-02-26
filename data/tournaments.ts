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

const KEY = "customzone_tournaments";

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

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

function loadLocalAll(): Tournament[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(KEY);
  const data = safeParse<any[]>(raw, []);
  const list = Array.isArray(data) ? data : [];
  return list.map(normalizeTournament);
}

function saveLocalAll(tournaments: Tournament[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(tournaments));
}

async function parseResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    throw new Error(`Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

export function getBrModeSlots(mode: BRMode): number {
  return BR_MODE_SLOT_MAP[mode];
}

export async function getAllTournaments(): Promise<Tournament[]> {
  try {
    const data = await parseResponse<{ tournaments: Tournament[] }>(
      await fetch("/api/tournaments", { cache: "no-store" })
    );
    const normalized = (data.tournaments ?? []).map(normalizeTournament);
    saveLocalAll(normalized);
    return normalized;
  } catch {
    return loadLocalAll();
  }
}

export async function getTournamentById(id: string): Promise<Tournament | null> {
  try {
    const data = await parseResponse<{ tournament: Tournament }>(
      await fetch(`/api/tournaments/${id}`, { cache: "no-store" })
    );
    return normalizeTournament(data.tournament);
  } catch {
    const all = loadLocalAll();
    return all.find((t) => t.id === id) ?? null;
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
  try {
    const data = await parseResponse<{ tournament: Tournament }>(
      await fetch("/api/tournaments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
    );
    return normalizeTournament(data.tournament);
  } catch {
    // Fallback for offline/dev mode
    const all = loadLocalAll();
    const maxSlots =
      input.matchType === "BR"
        ? getBrModeSlots(inferBrMode(input.brMode, Number(input.maxSlots || 0)))
        : Math.max(1, Number(input.maxSlots || 1));
    const brMode = input.matchType === "BR" ? inferBrMode(input.brMode, maxSlots) : null;
    const brPrizeType =
      input.matchType === "BR" ? normalizeBrPrizeType(input.brPrizeType) : null;
    const prizeValues = normalizePrizeValues(
      input.matchType,
      brPrizeType,
      input.winningPrize,
      input.perKillPrize,
      input.prizePool
    );
    const t: Tournament = {
      id: crypto.randomUUID(),
      game: input.game,
      matchType: input.matchType,
      brMode,
      brPrizeType,
      roomPublished: false,
      manualSoldSlots: 0,
      formatInfo: String(input.formatInfo ?? ""),
      rules: String(input.rules ?? ""),
      prizePool: prizeValues.prizePool,
      winningPrize: prizeValues.winningPrize,
      perKillPrize: prizeValues.perKillPrize,
      additionalInfo: String(input.additionalInfo ?? ""),
      name: input.name,
      dateTime: input.dateTime,
      entryFee: Number(input.entryFee),
      maxSlots,
      bookedCount: 0,
      status: "OPEN",
    };
    all.unshift(t);
    saveLocalAll(all);
    return t;
  }
}

export async function incrementTournamentBooking(id: string): Promise<void> {
  try {
    await parseResponse<{ tournament: Tournament }>(
      await fetch(`/api/tournaments/${id}/book`, {
        method: "POST",
      })
    );
    return;
  } catch {
    const all = loadLocalAll();
    const idx = all.findIndex((t) => t.id === id);
    if (idx === -1) return;

    const t = all[idx];
    const nextBooked = Math.min(t.maxSlots, (t.bookedCount ?? 0) + 1);
    let nextStatus: TournamentStatus = t.status;
    if (t.status !== "COMPLETED") {
      nextStatus = nextBooked >= t.maxSlots ? "FULL" : "OPEN";
    }
    all[idx] = { ...t, bookedCount: nextBooked, status: nextStatus };
    saveLocalAll(all);
  }
}
