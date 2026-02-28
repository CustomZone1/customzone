export type Booking = {
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

const KEY = "customzone_bookings";

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function normalizeName(v: string) {
  return v.trim().toLowerCase();
}

function normalizeTeamMembers(input: unknown, fallbackName = "", teamSize = 1) {
  const source = Array.isArray(input) ? input : [];
  const cleaned = source
    .map((v) => String(v ?? "").trim())
    .filter(Boolean);

  if (cleaned.length === 0 && fallbackName.trim()) {
    cleaned.push(fallbackName.trim());
  }

  const deduped = cleaned.filter(
    (name, idx) => cleaned.findIndex((n) => normalizeName(n) === normalizeName(name)) === idx
  );

  return deduped.slice(0, Math.max(1, teamSize));
}

function normalizeBooking(raw: any): Booking {
  const inferredSize = Math.max(1, Number(raw?.teamSize ?? 0) || 0, Array.isArray(raw?.teamMembers) ? raw.teamMembers.length : 0, 1);
  const members = normalizeTeamMembers(raw?.teamMembers, String(raw?.playerName ?? ""), inferredSize);

  return {
    id: String(raw?.id ?? crypto.randomUUID()),
    tournamentId: String(raw?.tournamentId ?? ""),
    userId: String(raw?.userId ?? ""),
    username: raw?.username ? String(raw.username).trim() : undefined,
    playerName: String(raw?.playerName ?? members[0] ?? ""),
    teamMembers: members,
    teamSize: inferredSize,
    slotNumber: Math.max(1, Number(raw?.slotNumber ?? 1)),
    createdAt: String(raw?.createdAt ?? new Date().toISOString()),
  };
}

export function getBookings(): Booking[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(KEY);
  const data = safeParse<any[]>(raw, []);
  const list = Array.isArray(data) ? data : [];
  return list.map(normalizeBooking);
}

function setBookings(bookings: Booking[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(bookings));
}

function getNextSlotNumber(tournamentId: string, bookings: Booking[]) {
  const maxSlot = bookings
    .filter((b) => b.tournamentId === tournamentId)
    .reduce((max, b) => Math.max(max, Number(b.slotNumber) || 0), 0);
  return maxSlot + 1;
}

export function addBooking(
  idOrObj:
    | string
    | {
        tournamentId: string;
        userId?: string;
        username?: string;
        playerName: string;
        createdAt?: string;
        slotNumber?: number;
        teamMembers?: string[];
        teamSize?: number;
      },
  playerName?: string
) {
  const bookings = getBookings();

  if (typeof idOrObj === "object") {
    const tid = String(idOrObj.tournamentId ?? "");
    const userId = String(idOrObj.userId ?? "");
    const username = String(idOrObj.username ?? "").trim();
    const name = String(idOrObj.playerName ?? "").trim();
    if (!tid || !name) return;

    const teamSize = Math.max(1, Number(idOrObj.teamSize ?? 1));
    const members = normalizeTeamMembers(idOrObj.teamMembers, name, teamSize);

    bookings.push({
      id: crypto.randomUUID(),
      tournamentId: tid,
      userId,
      username: username || undefined,
      playerName: members[0] ?? name,
      teamMembers: members,
      teamSize,
      slotNumber:
        Number.isFinite(Number(idOrObj.slotNumber)) && Number(idOrObj.slotNumber) > 0
          ? Number(idOrObj.slotNumber)
          : getNextSlotNumber(tid, bookings),
      createdAt: idOrObj.createdAt ?? new Date().toISOString(),
    });
    setBookings(bookings);
    return;
  }

  const tid = String(idOrObj ?? "");
  const name = String(playerName ?? "").trim();
  if (!tid || !name) return;

  bookings.push({
    id: crypto.randomUUID(),
    tournamentId: tid,
    userId: "",
    playerName: name,
    teamMembers: [name],
    teamSize: 1,
    slotNumber: getNextSlotNumber(tid, bookings),
    createdAt: new Date().toISOString(),
  });
  setBookings(bookings);
}

export function getTournamentBookings(tournamentId: string): Booking[] {
  return getBookings()
    .filter((b) => b.tournamentId === tournamentId)
    .sort((a, b) => a.slotNumber - b.slotNumber);
}

export function getUserBooking(tournamentId: string, userId: string): Booking | null {
  const uid = String(userId ?? "").trim();
  if (!uid) return null;
  return (
    getBookings().find(
      (b) => b.tournamentId === tournamentId && String(b.userId ?? "").trim() === uid
    ) ?? null
  );
}

export function getUserBookings(tournamentId: string, userId: string): Booking[] {
  const uid = String(userId ?? "").trim();
  if (!uid) return [];
  return getBookings()
    .filter((b) => b.tournamentId === tournamentId && String(b.userId ?? "").trim() === uid)
    .sort((a, b) => a.slotNumber - b.slotNumber);
}

export function hasBooking(tournamentId: string, userId?: string): boolean {
  const bookings = getBookings();

  if (!userId) {
    return bookings.some((b) => b.tournamentId === tournamentId);
  }

  const uid = String(userId ?? "").trim();
  return bookings.some(
    (b) => b.tournamentId === tournamentId && String(b.userId ?? "").trim() === uid
  );
}

async function parseResponse<T>(res: Response): Promise<T> {
  const payload = (await res.json()) as T;
  if (!res.ok) {
    throw payload;
  }
  return payload;
}

export async function getTournamentBookingsShared(tournamentId: string): Promise<Booking[]> {
  try {
    const data = await parseResponse<{ bookings: Booking[] }>(
      await fetch(`/api/tournaments/${tournamentId}/book`, { cache: "no-store" })
    );
    return (data.bookings ?? []).map(normalizeBooking).sort((a, b) => a.slotNumber - b.slotNumber);
  } catch {
    return [];
  }
}

export async function getUserBookingShared(
  tournamentId: string,
  userId: string,
  usernameInput = ""
): Promise<Booking | null> {
  const uid = String(userId ?? "").trim();
  const username = String(usernameInput ?? "").trim();
  if (!uid && !username) return null;

  try {
    const query = new URLSearchParams();
    if (uid) query.set("userId", uid);
    if (username) query.set("username", username);
    const data = await parseResponse<{ booking: Booking | null }>(
      await fetch(`/api/tournaments/${tournamentId}/book?${query.toString()}`, {
        cache: "no-store",
      })
    );
    return data.booking ? normalizeBooking(data.booking) : null;
  } catch {
    return null;
  }
}

export async function getUserBookingsShared(
  tournamentId: string,
  userId: string,
  usernameInput = ""
): Promise<Booking[]> {
  const uid = String(userId ?? "").trim();
  const username = String(usernameInput ?? "").trim();
  if (!uid && !username) return [];

  try {
    const query = new URLSearchParams();
    if (uid) query.set("userId", uid);
    if (username) query.set("username", username);
    query.set("all", "1");
    const data = await parseResponse<{ bookings: Booking[] }>(
      await fetch(`/api/tournaments/${tournamentId}/book?${query.toString()}`, {
        cache: "no-store",
      })
    );
    return (data.bookings ?? []).map(normalizeBooking).sort((a, b) => a.slotNumber - b.slotNumber);
  } catch {
    return [];
  }
}

export async function hasBookingShared(tournamentId: string, userId?: string): Promise<boolean> {
  if (!userId) {
    const bookings = await getTournamentBookingsShared(tournamentId);
    return bookings.length > 0;
  }
  return Boolean(await getUserBookingShared(tournamentId, userId));
}

export async function addBookingShared(
  tournamentId: string,
  userId: string,
  playerName: string,
  teamMembers: string[] = [playerName],
  teamSize = Math.max(1, teamMembers.length || 1),
  usernameInput = ""
) {
  const uid = String(userId ?? "").trim();
  if (!uid) {
    return { ok: false as const, reason: "Login required." };
  }
  const username = String(usernameInput ?? "").trim();

  const captain = playerName.trim();
  if (!captain) {
    return { ok: false as const, reason: "Player name is required." };
  }

  const members = normalizeTeamMembers(teamMembers, captain, teamSize);

  try {
    const res = await fetch(`/api/tournaments/${tournamentId}/book`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: uid,
        username,
        playerName: captain,
        teamMembers: members,
        teamSize,
      }),
    });

    let payload: { booking?: Booking | null; error?: string } = {};
    try {
      payload = (await res.json()) as { booking?: Booking | null; error?: string };
    } catch {
      payload = {};
    }

    if (res.ok && payload.booking) {
      return { ok: true as const, booking: normalizeBooking(payload.booking) };
    }

    if (!res.ok && payload.error) {
      return {
        ok: false as const,
        reason: payload.error,
        booking: payload.booking ? normalizeBooking(payload.booking) : undefined,
      };
    }

    throw new Error(`Request failed (${res.status})`);
  } catch (e: any) {
    const reason = String(e?.message ?? "Booking failed.");
    return { ok: false as const, reason };
  }
}

export async function updateBookingTeamMembersShared(
  tournamentId: string,
  userId: string,
  bookingId: string,
  teamMembers: string[]
) {
  const uid = String(userId ?? "").trim();
  if (!uid) {
    return { ok: false as const, reason: "Login required." };
  }

  const id = bookingId.trim();
  if (!id) {
    return { ok: false as const, reason: "Booking not found." };
  }

  try {
    const res = await fetch(`/api/tournaments/${tournamentId}/book`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "update-team", userId: uid, bookingId: id, teamMembers }),
    });

    let payload: { booking?: Booking | null; error?: string } = {};
    try {
      payload = (await res.json()) as { booking?: Booking | null; error?: string };
    } catch {
      payload = {};
    }

    if (res.ok && payload.booking) {
      return { ok: true as const, booking: normalizeBooking(payload.booking) };
    }

    return { ok: false as const, reason: payload.error || `Request failed (${res.status})` };
  } catch (e: any) {
    return { ok: false as const, reason: String(e?.message ?? "Could not update team names.") };
  }
}
