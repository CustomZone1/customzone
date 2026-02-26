import { promises as fs } from "fs";
import path from "path";

import type {
  BRMode,
  BRPrizeType,
  MatchType,
  Tournament,
  TournamentStatus,
} from "@/data/tournaments";
import { findUserById, findUsersByIds } from "@/lib/server/userStore";
import { pushInboxMessage } from "@/lib/server/inboxStore";

export type BookingRecord = {
  id: string;
  tournamentId: string;
  userId: string;
  username?: string;
  playerName: string;
  teamMembers: string[];
  teamSize: number;
  slotNumber: number;
  createdAt: string;
};

const DB_FILE = path.join(process.cwd(), "data", "tournaments.db.json");

type TournamentStoreFile = {
  tournaments: Tournament[];
  bookings: BookingRecord[];
};

const BR_MODE_SLOTS: Record<BRMode, number> = {
  SOLO: 48,
  DUO: 26,
  SQUAD: 12,
};

let writeQueue: Promise<void> = Promise.resolve();

function normalizeStatus(raw: unknown): TournamentStatus {
  const v = String(raw ?? "").toUpperCase();
  if (v === "FULL" || v === "COMPLETED" || v === "OPEN") return v as TournamentStatus;
  return "OPEN";
}

function normalizeMatchType(raw: unknown): MatchType {
  const v = String(raw ?? "").toUpperCase();
  return v === "CS" ? "CS" : "BR";
}

function normalizeBrMode(raw: unknown, maxSlots: number): BRMode {
  const v = String(raw ?? "").toUpperCase();
  if (v === "DUO" || v === "SQUAD" || v === "SOLO") return v as BRMode;
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

function normalizePlayerName(v: string) {
  return v.trim().toLowerCase();
}

function bookingContainsName(booking: BookingRecord, normalizedName: string) {
  if (!normalizedName) return false;
  if (normalizePlayerName(booking.playerName) === normalizedName) return true;
  return booking.teamMembers.some((member) => normalizePlayerName(member) === normalizedName);
}

function normalizeTeamMembers(
  members: unknown,
  fallbackFirstName = "",
  teamSize = 1
) {
  const source = Array.isArray(members) ? members : [];
  const cleaned = source
    .map((v) => String(v ?? "").trim())
    .filter(Boolean);

  if (cleaned.length === 0 && fallbackFirstName.trim()) {
    cleaned.push(fallbackFirstName.trim());
  }

  const deduped = cleaned.filter(
    (name, idx) =>
      cleaned.findIndex((n) => normalizePlayerName(n) === normalizePlayerName(name)) === idx
  );
  return deduped.slice(0, Math.max(1, teamSize));
}

function getTeamSizeForTournament(t: Tournament) {
  if (t.matchType !== "BR") return 1;
  if (t.brMode === "DUO") return 2;
  if (t.brMode === "SQUAD") return 4;
  return 1;
}

function normalizeTournament(raw: any): Tournament {
  const matchType = normalizeMatchType(raw?.matchType);
  const maxSlots = Number(raw?.maxSlots ?? 0);
  const brMode = matchType === "BR" ? normalizeBrMode(raw?.brMode, maxSlots) : null;
  const brPrizeType = matchType === "BR" ? normalizeBrPrizeType(raw?.brPrizeType) : null;
  const prizeValues = normalizePrizeValues(
    matchType,
    brPrizeType,
    raw?.winningPrize,
    raw?.perKillPrize,
    raw?.prizePool
  );
  const bookedCount = Math.max(0, Number(raw?.bookedCount ?? 0));
  const fixedMaxSlots = matchType === "BR" && brMode ? BR_MODE_SLOTS[brMode] : Math.max(1, maxSlots || 1);
  const fixedBookedCount = Math.min(bookedCount, fixedMaxSlots);
  const manualSoldSlots = Math.max(
    0,
    Math.min(
      fixedMaxSlots,
      Number(raw?.manualSoldSlots ?? raw?.offlineSoldSlots ?? 0)
    )
  );

  return {
    id: String(raw?.id ?? crypto.randomUUID()),
    game: String(raw?.game ?? "Free Fire"),
    matchType,
    brMode,
    brPrizeType,
    manualSoldSlots,
    formatInfo: String(raw?.formatInfo ?? ""),
    rules: String(raw?.rules ?? ""),
    prizePool: prizeValues.prizePool,
    winningPrize: prizeValues.winningPrize,
    perKillPrize: prizeValues.perKillPrize,
    additionalInfo: String(raw?.additionalInfo ?? ""),
    name: String(raw?.name ?? "Untitled Tournament"),
    dateTime: String(raw?.dateTime ?? raw?.dataTime ?? ""),
    entryFee: Number(raw?.entryFee ?? 0),
    maxSlots: fixedMaxSlots,
    bookedCount: fixedBookedCount,
    status:
      normalizeStatus(raw?.status) === "COMPLETED"
        ? "COMPLETED"
        : fixedBookedCount >= fixedMaxSlots
          ? "FULL"
          : "OPEN",
    room: raw?.room ? { id: raw.room.id, pass: raw.room.pass } : undefined,
  };
}

function normalizeBooking(raw: any): BookingRecord {
  const teamSize = Math.max(1, Number(raw?.teamSize ?? 1));
  const playerName = String(raw?.playerName ?? "");
  const teamMembers = normalizeTeamMembers(raw?.teamMembers, playerName, teamSize);
  const tournamentId = String(raw?.tournamentId ?? "");
  const userId = String(raw?.userId ?? "").trim();
  const slotNumber = Math.max(1, Number(raw?.slotNumber ?? 1));
  const fallbackId = `${tournamentId}:${slotNumber}:${normalizePlayerName(playerName || teamMembers[0] || "team")}`;

  return {
    id: String(raw?.id ?? fallbackId),
    tournamentId,
    userId,
    username: raw?.username ? String(raw.username).trim() : undefined,
    playerName: playerName || teamMembers[0] || "",
    teamMembers,
    teamSize,
    slotNumber,
    createdAt: String(raw?.createdAt ?? new Date().toISOString()),
  };
}

async function resolveBookingUsername(booking: BookingRecord) {
  if (booking.username || !booking.userId) return booking;
  const user = await findUserById(booking.userId);
  if (!user) return booking;
  return {
    ...booking,
    username: user.username,
  };
}

async function resolveBookingUsernames(bookings: BookingRecord[]) {
  const missingUserIds = Array.from(
    new Set(
      bookings
        .filter((booking) => !booking.username && booking.userId)
        .map((booking) => booking.userId)
    )
  );

  if (missingUserIds.length === 0) return bookings;

  const usersById = await findUsersByIds(missingUserIds);
  return bookings.map((booking) => {
    if (booking.username || !booking.userId) return booking;
    const user = usersById[booking.userId];
    if (!user) return booking;
    return {
      ...booking,
      username: user.username,
    };
  });
}

async function ensureStoreFile() {
  try {
    await fs.access(DB_FILE);
  } catch {
    const initial: TournamentStoreFile = { tournaments: [], bookings: [] };
    await fs.writeFile(DB_FILE, JSON.stringify(initial, null, 2), "utf8");
  }
}

async function readStore(): Promise<TournamentStoreFile> {
  await ensureStoreFile();
  const raw = await fs.readFile(DB_FILE, "utf8");
  try {
    const parsed = JSON.parse(raw) as Partial<TournamentStoreFile>;
    const rawTournaments = Array.isArray(parsed?.tournaments) ? parsed.tournaments : [];
    const rawBookings = Array.isArray(parsed?.bookings) ? parsed.bookings : [];
    const bookings = rawBookings.map(normalizeBooking);
    const onlineCountByTournament = bookings.reduce<Record<string, number>>((acc, booking) => {
      acc[booking.tournamentId] = (acc[booking.tournamentId] ?? 0) + 1;
      return acc;
    }, {});
    const tournaments = rawTournaments.map((item) => {
      const normalized = normalizeTournament(item);
      const onlineCount = onlineCountByTournament[normalized.id] ?? 0;
      const manualSoldSlots = Math.max(
        0,
        Math.min(normalized.maxSlots, Number(normalized.manualSoldSlots ?? 0))
      );
      const bookedCount = Math.min(normalized.maxSlots, onlineCount + manualSoldSlots);
      const status: TournamentStatus =
        normalized.status === "COMPLETED"
          ? "COMPLETED"
          : bookedCount >= normalized.maxSlots
            ? "FULL"
            : "OPEN";
      return {
        ...normalized,
        manualSoldSlots,
        bookedCount,
        status,
      } satisfies Tournament;
    });

    return {
      tournaments,
      bookings,
    };
  } catch {
    return { tournaments: [], bookings: [] };
  }
}

async function writeStore(data: TournamentStoreFile) {
  await ensureStoreFile();
  await fs.writeFile(DB_FILE, JSON.stringify(data, null, 2), "utf8");
}

function withWriteLock<T>(operation: () => Promise<T>): Promise<T> {
  const next = writeQueue.then(operation, operation);
  writeQueue = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

export async function listTournaments() {
  const store = await readStore();
  return store.tournaments;
}

export async function findTournamentById(id: string) {
  const store = await readStore();
  return store.tournaments.find((t) => t.id === id) ?? null;
}

export async function deleteTournamentRecord(id: string) {
  return withWriteLock(async () => {
    const store = await readStore();
    const idx = store.tournaments.findIndex((t) => t.id === id);
    if (idx === -1) return false;

    store.tournaments.splice(idx, 1);
    store.bookings = store.bookings.filter((b) => b.tournamentId !== id);
    await writeStore(store);
    return true;
  });
}

export async function createTournamentRecord(input: {
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
}) {
  return withWriteLock(async () => {
    const store = await readStore();
    const matchType = normalizeMatchType(input.matchType);
    const brMode = matchType === "BR" ? normalizeBrMode(input.brMode, Number(input.maxSlots || 0)) : null;
    const brPrizeType =
      matchType === "BR" ? normalizeBrPrizeType(input.brPrizeType) : null;
    const prizeValues = normalizePrizeValues(
      matchType,
      brPrizeType,
      input.winningPrize,
      input.perKillPrize,
      input.prizePool
    );
    const maxSlots =
      matchType === "BR" && brMode ? BR_MODE_SLOTS[brMode] : Math.max(1, Number(input.maxSlots || 1));

    const record: Tournament = {
      id: crypto.randomUUID(),
      game: String(input.game || "Free Fire"),
      matchType,
      brMode,
      brPrizeType,
      manualSoldSlots: 0,
      formatInfo: String(input.formatInfo ?? ""),
      rules: String(input.rules ?? ""),
      prizePool: prizeValues.prizePool,
      winningPrize: prizeValues.winningPrize,
      perKillPrize: prizeValues.perKillPrize,
      additionalInfo: String(input.additionalInfo ?? ""),
      name: String(input.name || "Untitled Tournament"),
      dateTime: String(input.dateTime || ""),
      entryFee: Number(input.entryFee || 0),
      maxSlots,
      bookedCount: 0,
      status: "OPEN",
    };

    store.tournaments.unshift(record);
    await writeStore(store);
    return record;
  });
}

export async function listTournamentBookings(tournamentId: string) {
  const store = await readStore();
  const bookings = store.bookings
    .filter((b) => b.tournamentId === tournamentId)
    .sort((a, b) => a.slotNumber - b.slotNumber);
  return resolveBookingUsernames(bookings);
}

export async function listUserBookings(
  tournamentId: string,
  userId: string,
  usernameInput?: string
) {
  const normalizedUserId = String(userId ?? "").trim();
  const normalizedUsername = normalizePlayerName(String(usernameInput ?? ""));
  if (!normalizedUserId && !normalizedUsername) return [];

  const store = await readStore();
  const bookings = store.bookings
    .filter((b) => {
      if (b.tournamentId !== tournamentId) return false;
      if (normalizedUserId && b.userId === normalizedUserId) return true;
      if (!normalizedUsername) return false;

      const bookingUsername = normalizePlayerName(String(b.username ?? ""));
      if (bookingUsername && bookingUsername === normalizedUsername) return true;

      // Legacy fallback: older bookings may have no userId but keep player/team names.
      return !String(b.userId ?? "").trim() && bookingContainsName(b, normalizedUsername);
    })
    .sort((a, b) => a.slotNumber - b.slotNumber);
  return resolveBookingUsernames(bookings);
}

export async function findPlayerBooking(tournamentId: string, playerName: string) {
  const normalized = normalizePlayerName(playerName);
  if (!normalized) return null;

  const store = await readStore();
  return (
    store.bookings.find(
      (b) =>
        b.tournamentId === tournamentId &&
        bookingContainsName(b, normalized)
    ) ?? null
  );
}

export async function findUserBooking(
  tournamentId: string,
  userId: string,
  usernameInput?: string
) {
  const bookings = await listUserBookings(tournamentId, userId, usernameInput);
  return bookings[0] ?? null;
}

export async function findRoomAccessBooking(
  tournamentId: string,
  userId: string,
  username?: string
) {
  const normalizedUserId = String(userId ?? "").trim();
  const normalizedUsername = normalizePlayerName(String(username ?? ""));
  const store = await readStore();

  if (normalizedUserId) {
    const byUserId =
      store.bookings.find(
        (b) => b.tournamentId === tournamentId && b.userId === normalizedUserId
      ) ?? null;
    if (byUserId) return resolveBookingUsername(byUserId);
  }

  if (!normalizedUsername) return null;

  return (
    store.bookings.find(
      (b) =>
        b.tournamentId === tournamentId &&
        !String(b.userId ?? "").trim() &&
        bookingContainsName(b, normalizedUsername)
    ) ?? null
  );
}

export async function createBookingAndIncrement(
  tournamentId: string,
  userId: string,
  playerName: string,
  teamMembersInput?: string[],
  usernameInput?: string
) {
  return withWriteLock(async () => {
    const normalizedUserId = String(userId ?? "").trim();
    const normalizedUsername = String(usernameInput ?? "").trim();
    if (!normalizedUserId) {
      return { ok: false as const, reason: "Login required." };
    }

    const store = await readStore();
    const idx = store.tournaments.findIndex((t) => t.id === tournamentId);
    if (idx === -1) {
      return { ok: false as const, reason: "Tournament not found." };
    }

    const current = store.tournaments[idx];
    const teamSize = getTeamSizeForTournament(current);
    const names = normalizeTeamMembers(
      teamMembersInput && teamMembersInput.length > 0 ? teamMembersInput : [playerName],
      "",
      teamSize
    );
    if (names.length === 0) {
      return { ok: false as const, reason: "At least one player name is required." };
    }
    const captainName = names[0];
    const normalizedNames = names.map(normalizePlayerName).filter(Boolean);

    const existing = store.bookings.find(
      (b) =>
        b.tournamentId === tournamentId &&
        normalizedNames.some((name) => bookingContainsName(b, name))
    );
    if (existing) {
      return {
        ok: false as const,
        reason: "One or more team members are already booked in this tournament.",
        booking: existing,
      };
    }

    if (current.status === "COMPLETED" || current.bookedCount >= current.maxSlots) {
      return { ok: false as const, reason: "This tournament is full." };
    }

    if (current.room?.id || current.room?.pass) {
      return {
        ok: false as const,
        reason: "Booking is closed because Room ID and Password are already published.",
      };
    }

    const nextSlot = Math.max(1, Number(current.bookedCount) + 1);
    const accountUser = await findUserById(normalizedUserId);
    const bookingUsername = accountUser?.username || normalizedUsername;

    const booking: BookingRecord = {
      id: crypto.randomUUID(),
      tournamentId,
      userId: normalizedUserId,
      username: bookingUsername || undefined,
      playerName: captainName,
      teamMembers: names,
      teamSize,
      slotNumber: nextSlot,
      createdAt: new Date().toISOString(),
    };
    store.bookings.push(booking);

    const bookedCount = Math.min(current.maxSlots, current.bookedCount + 1);
    const status: TournamentStatus = bookedCount >= current.maxSlots ? "FULL" : "OPEN";

    const tournament = { ...current, bookedCount, status };
    store.tournaments[idx] = tournament;
    await writeStore(store);

    try {
      await pushInboxMessage(normalizedUserId, {
        type: "SYSTEM",
        title: `Slot Booked: ${current.name}`,
        message:
          `Best of luck for your match.\n` +
          `Please play fair and follow all tournament rules.\n` +
          `Slot No: #${booking.slotNumber}\n` +
          `In-game name(s): ${booking.teamMembers.join(", ")}`,
      });
    } catch {
      // ignore inbox failures, booking already saved
    }

    return { ok: true as const, booking, tournament };
  });
}

export async function updateBookingTeamMembers(
  tournamentId: string,
  userId: string,
  bookingId: string,
  teamMembersInput: string[]
) {
  return withWriteLock(async () => {
    const normalizedUserId = String(userId ?? "").trim();
    if (!normalizedUserId) {
      return { ok: false as const, reason: "Login required." };
    }

    const store = await readStore();
    const tournament = store.tournaments.find((t) => t.id === tournamentId);
    if (!tournament) {
      return { ok: false as const, reason: "Tournament not found." };
    }

    const idx = store.bookings.findIndex(
      (b) =>
        b.tournamentId === tournamentId &&
        b.id === bookingId &&
        b.userId === normalizedUserId
    );
    if (idx === -1) {
      return { ok: false as const, reason: "Booking not found." };
    }

    const startMs = new Date(tournament.dateTime).getTime();
    const hasValidStart = Number.isFinite(startMs);
    const cutoffMs = hasValidStart ? startMs - 60 * 60 * 1000 : Number.NaN;
    if (hasValidStart && Date.now() > cutoffMs) {
      return { ok: false as const, reason: "Team names can only be updated up to 1 hour before start." };
    }

    const teamSize = getTeamSizeForTournament(tournament);
    const current = store.bookings[idx];
    const nextMembers = normalizeTeamMembers(teamMembersInput, current.playerName, teamSize);
    if (nextMembers.length === 0) {
      return { ok: false as const, reason: "At least one player name is required." };
    }
    const normalizedNames = nextMembers.map(normalizePlayerName).filter(Boolean);
    const hasConflict = store.bookings.some((b, bIdx) => {
      if (bIdx === idx || b.tournamentId !== tournamentId) return false;
      return normalizedNames.some((name) => bookingContainsName(b, name));
    });
    if (hasConflict) {
      return {
        ok: false as const,
        reason: "One or more team members are already booked in this tournament.",
      };
    }

    const next: BookingRecord = {
      ...current,
      playerName: nextMembers[0],
      teamMembers: nextMembers,
      teamSize,
    };
    store.bookings[idx] = next;
    await writeStore(store);
    return { ok: true as const, booking: next };
  });
}

export async function incrementBookingCount(id: string) {
  return withWriteLock(async () => {
    const store = await readStore();
    const idx = store.tournaments.findIndex((t) => t.id === id);
    if (idx === -1) return null;

    const current = store.tournaments[idx];
    const bookedCount = Math.min(current.maxSlots, current.bookedCount + 1);
    const status: TournamentStatus =
      current.status === "COMPLETED"
        ? "COMPLETED"
        : bookedCount >= current.maxSlots
          ? "FULL"
          : "OPEN";

    const next = { ...current, bookedCount, status };
    store.tournaments[idx] = next;
    await writeStore(store);
    return next;
  });
}

export async function setTournamentRoom(
  id: string,
  room: { id: string; pass: string } | null
) {
  return withWriteLock(async () => {
    const store = await readStore();
    const idx = store.tournaments.findIndex((t) => t.id === id);
    if (idx === -1) return null;

    const current = store.tournaments[idx];
    const next: Tournament = room
      ? { ...current, room: { id: room.id, pass: room.pass } }
      : { ...current, room: undefined };

    store.tournaments[idx] = next;
    await writeStore(store);
    return next;
  });
}

export async function setTournamentManualSoldSlots(
  id: string,
  requestedSoldSlots: number
) {
  return withWriteLock(async () => {
    const store = await readStore();
    const idx = store.tournaments.findIndex((t) => t.id === id);
    if (idx === -1) return { ok: false as const, reason: "Tournament not found." };

    const current = store.tournaments[idx];
    const onlineBookedCount = store.bookings.filter((b) => b.tournamentId === id).length;
    const maxManualAllowed = Math.max(0, current.maxSlots - onlineBookedCount);
    const nextManualSoldSlots = Math.max(
      0,
      Math.min(maxManualAllowed, Math.floor(Number(requestedSoldSlots || 0)))
    );
    const nextBookedCount = Math.min(current.maxSlots, onlineBookedCount + nextManualSoldSlots);
    const nextStatus: TournamentStatus =
      current.status === "COMPLETED"
        ? "COMPLETED"
        : nextBookedCount >= current.maxSlots
          ? "FULL"
          : "OPEN";

    const next: Tournament = {
      ...current,
      manualSoldSlots: nextManualSoldSlots,
      bookedCount: nextBookedCount,
      status: nextStatus,
    };

    store.tournaments[idx] = next;
    await writeStore(store);
    return {
      ok: true as const,
      tournament: next,
      onlineBookedCount,
      maxManualAllowed,
    };
  });
}
