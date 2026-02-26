export type RoomInfo = {
  tournamentId: string;
  roomId: string;
  roomPassword: string;
  updatedAt: string; // ISO string
};

function normalizeRoomPayload(tournamentId: string, raw: any): RoomInfo | null {
  if (!raw) return null;
  return {
    tournamentId,
    roomId: String(raw.roomId ?? ""),
    roomPassword: String(raw.roomPassword ?? ""),
    updatedAt: String(raw.updatedAt ?? new Date().toISOString()),
  };
}

const KEY = "cz_rooms_v1";

function readAll(): Record<string, RoomInfo> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, RoomInfo>;
  } catch {
    return {};
  }
}

function writeAll(map: Record<string, RoomInfo>) {
  localStorage.setItem(KEY, JSON.stringify(map));
}

export function getRoomInfo(tournamentId: string): RoomInfo | null {
  const map = readAll();
  return map[tournamentId] ?? null;
}

export function setRoomInfo(
  tournamentId: string,
  roomId: string,
  roomPassword: string
) {
  const map = readAll();
  map[tournamentId] = {
    tournamentId,
    roomId,
    roomPassword,
    updatedAt: new Date().toISOString(),
  };
  writeAll(map);
}

export function clearRoomInfo(tournamentId: string) {
  const map = readAll();
  delete map[tournamentId];
  writeAll(map);
}

export async function getRoomInfoShared(
  tournamentId: string,
  options?: { userId?: string; username?: string }
) {
  try {
    const query = new URLSearchParams();
    query.set("room", "1");
    if (options?.userId) query.set("userId", options.userId);
    if (options?.username) query.set("username", options.username);

    const response = await fetch(`/api/tournaments/${tournamentId}?${query.toString()}`, {
      cache: "no-store",
    });

    if (!response.ok) {
      let reason = "Could not fetch room details.";
      try {
        const payload = (await response.json()) as { error?: string };
        reason = payload?.error || reason;
      } catch {
        // ignore
      }
      return {
        room: null,
        locked: false,
        unlockAt: undefined,
        access: false,
        reason,
      };
    }

    const data = (await response.json()) as {
      room: any;
      locked?: boolean;
      unlockAt?: string;
      access?: boolean;
    };

    const room = normalizeRoomPayload(tournamentId, data.room);
    if (room) {
      const map = readAll();
      map[tournamentId] = room;
      writeAll(map);
    }
    return {
      room,
      locked: Boolean(data.locked),
      unlockAt: data.unlockAt,
      access: data.access ?? Boolean(room || data.locked),
      reason: "",
    };
  } catch {
    return {
      room: null,
      locked: false,
      unlockAt: undefined,
      access: false,
      reason: "Could not fetch room details.",
    };
  }
}

export async function setRoomInfoShared(
  tournamentId: string,
  roomId: string,
  roomPassword: string
) {
  const res = await fetch(`/api/tournaments/${tournamentId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roomId, roomPassword }),
  });
  const payload = (await res.json()) as { room?: any; error?: string };
  if (!res.ok) {
    throw new Error(payload.error || `Request failed (${res.status})`);
  }

  const room = normalizeRoomPayload(tournamentId, payload.room);
  if (room) setRoomInfo(tournamentId, room.roomId, room.roomPassword);
  return room;
}

export async function clearRoomInfoShared(tournamentId: string) {
  const res = await fetch(`/api/tournaments/${tournamentId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clear: true }),
  });
  if (!res.ok) {
    let reason = `Request failed (${res.status})`;
    try {
      const payload = (await res.json()) as { error?: string };
      if (payload.error) reason = payload.error;
    } catch {
      // ignore
    }
    throw new Error(reason);
  }
  clearRoomInfo(tournamentId);
}
