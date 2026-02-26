import { NextResponse } from "next/server";

import {
  deleteTournamentRecord,
  findRoomAccessBooking,
  findTournamentById,
  listTournamentBookings,
  setTournamentManualSoldSlots,
  setTournamentRoom,
} from "@/lib/server/tournamentStore";
import { pushInboxMessageMany } from "@/lib/server/inboxStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ id: string }>;
};

function toRoomPayload(
  tournamentId: string,
  room?: { id?: string; pass?: string }
) {
  if (!room) return null;
  return {
    tournamentId,
    roomId: String(room.id ?? ""),
    roomPassword: String(room.pass ?? ""),
    updatedAt: new Date().toISOString(),
  };
}

export async function GET(req: Request, context: Context) {
  const { id } = await context.params;
  const tournament = await findTournamentById(id);
  if (!tournament) {
    return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  }

  const url = new URL(req.url);
  const wantsRoom = url.searchParams.get("room") === "1";
  if (wantsRoom) {
    const userId = String(url.searchParams.get("userId") ?? "").trim();
    const username = String(url.searchParams.get("username") ?? "").trim();
    if (!userId && !username) {
      return NextResponse.json(
        { error: "user identity is required." },
        { status: 400 }
      );
    }

    const booking = await findRoomAccessBooking(id, userId, username);
    if (!booking) {
      return NextResponse.json(
        { error: "Only booked players can access room details." },
        { status: 403 }
      );
    }

    return NextResponse.json({
      room: toRoomPayload(id, tournament.room),
      locked: false,
      access: true,
    });
  }

  const { room: _room, ...safeTournament } = tournament;
  return NextResponse.json({
    tournament: {
      ...safeTournament,
      roomPublished: Boolean(tournament.room?.id || tournament.room?.pass),
    },
  });
}

export async function PATCH(req: Request, context: Context) {
  const { id } = await context.params;

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  const clear = Boolean(body?.clear);
  if (clear) {
    const next = await setTournamentRoom(id, null);
    if (!next) {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }
    return NextResponse.json({ room: null, ok: true });
  }

  if (body && Object.prototype.hasOwnProperty.call(body, "manualSoldSlots")) {
    const requestedSoldSlots = Number(body?.manualSoldSlots ?? 0);
    if (!Number.isFinite(requestedSoldSlots) || requestedSoldSlots < 0) {
      return NextResponse.json(
        { error: "manualSoldSlots must be 0 or more." },
        { status: 400 }
      );
    }

    const result = await setTournamentManualSoldSlots(id, requestedSoldSlots);
    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: 404 });
    }

    const { room: _room, ...safeTournament } = result.tournament;
    return NextResponse.json({
      tournament: {
        ...safeTournament,
        roomPublished: Boolean(result.tournament.room?.id || result.tournament.room?.pass),
      },
      onlineBookedCount: result.onlineBookedCount,
      maxManualAllowed: result.maxManualAllowed,
      ok: true,
    });
  }

  const roomId = String(body?.roomId ?? "").trim();
  const roomPassword = String(body?.roomPassword ?? "").trim();
  if (!roomId || !roomPassword) {
    return NextResponse.json(
      { error: "Room ID and Room Password are required." },
      { status: 400 }
    );
  }

  const next = await setTournamentRoom(id, { id: roomId, pass: roomPassword });
  if (!next) {
    return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  }

  const bookings = await listTournamentBookings(id);
  const userIds = Array.from(
    new Set(
      bookings
        .map((booking) => String(booking.userId ?? "").trim())
        .filter(Boolean)
    )
  );
  if (userIds.length > 0) {
    try {
      await pushInboxMessageMany(userIds, {
        type: "ROOM",
        title: `Room ID & Password Live: ${next.name}`,
        message:
          `You booked this tournament.\n` +
          `Tournament: ${next.name}\n` +
          `Room ID: ${roomId}\n` +
          `Password: ${roomPassword}\n` +
          `Join quickly, match is about to start.`,
      });
    } catch {
      // ignore inbox failures, room update already saved
    }
  }

  return NextResponse.json({
    room: toRoomPayload(id, next.room),
    ok: true,
  });
}

export async function DELETE(_req: Request, context: Context) {
  const { id } = await context.params;
  const deleted = await deleteTournamentRecord(id);
  if (!deleted) {
    return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
