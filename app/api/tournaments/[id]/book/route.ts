import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseServer";

import {
  updateBookingTeamMembers,
  listTournamentBookings,
  listUserBookings,
  findUserBooking,
} from "@/lib/server/tournamentStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ id: string }>;
};

export async function GET(req: Request, context: Context) {
  // Keep existing JSON-based GET for now (safe)
  const { id } = await context.params;
  const url = new URL(req.url);
  const userId = String(url.searchParams.get("userId") ?? "").trim();
  const username = String(url.searchParams.get("username") ?? "").trim();
  const includeAll = url.searchParams.get("all") === "1";

  if (userId || username) {
    if (includeAll) {
      const bookings = await listUserBookings(id, userId, username);
      return NextResponse.json({ bookings });
    }
    const booking = await findUserBooking(id, userId, username);
    return NextResponse.json({ booking });
  }

  const bookings = await listTournamentBookings(id);
  return NextResponse.json({ bookings });
}

export async function POST(req: Request, context: Context) {
  const { id: tournamentId } = await context.params;

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  const mode = String(body?.mode ?? "").toLowerCase();
  const userId = String(body?.userId ?? "").trim();
  const username = String(body?.username ?? "").trim();

  // Keep team update on JSON for now
  if (mode === "update-team") {
    if (!userId) {
      return NextResponse.json({ error: "userId is required." }, { status: 400 });
    }
    const bookingId = String(body?.bookingId ?? "").trim();
    const teamMembers = Array.isArray(body?.teamMembers)
      ? body.teamMembers.map((v: any) => String(v ?? ""))
      : [];
    const result = await updateBookingTeamMembers(
      tournamentId,
      userId,
      bookingId,
      teamMembers
    );
    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: 400 });
    }
    return NextResponse.json({ booking: result.booking });
  }

  // New booking (MIGRATED TO SUPABASE)
  const playerName = String(body?.playerName ?? "").trim();

  if (!playerName) {
    return NextResponse.json(
      { error: "Invalid booking request. playerName and userId are required." },
      { status: 400 }
    );
  }

  if (!userId) {
    return NextResponse.json({ error: "userId is required." }, { status: 400 });
  }

  const teamMembers = Array.isArray(body?.teamMembers)
    ? body.teamMembers.map((v: any) => String(v ?? "").trim()).filter(Boolean)
    : [];

  const { data, error } = await supabase.rpc("book_tournament", {
    p_user_id: userId,
    p_tournament_id: tournamentId,
    p_player_name: playerName,
    p_team_members: teamMembers,
    p_username: username || null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data?.ok) {
    const code = String(data?.code ?? "BOOKING_FAILED");

    const message =
      code === "INSUFFICIENT_BALANCE"
        ? "Insufficient wallet balance."
        : code === "SOLD_OUT"
        ? "This tournament is full."
        : code === "TEAM_MEMBER_ALREADY_BOOKED"
        ? "One or more team members are already booked in this tournament."
        : code === "BOOKING_CLOSED_ROOM_PUBLISHED"
        ? "Booking is closed because Room ID and Password are already published."
        : code === "TOURNAMENT_NOT_FOUND"
        ? "Tournament not found."
        : "Booking failed.";

    return NextResponse.json({ error: message, code }, { status: 400 });
  }

  return NextResponse.json({
    booking: {
      id: data.bookingId,
      tournamentId,
      userId,
      username: username || undefined,
      playerName,
      teamMembers: teamMembers.length ? teamMembers : [playerName],
      slotNumber: data.slotNumber,
    },
    tournament: { id: tournamentId },
  });
}