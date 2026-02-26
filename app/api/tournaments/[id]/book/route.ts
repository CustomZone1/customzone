import { NextResponse } from "next/server";

import {
  createBookingAndIncrement,
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
  const { id } = await context.params;

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  const mode = String(body?.mode ?? "").toLowerCase();
  const userId = String(body?.userId ?? "").trim();
  const username = String(body?.username ?? "").trim();
  if (mode === "update-team") {
    if (!userId) {
      return NextResponse.json({ error: "userId is required." }, { status: 400 });
    }
    const bookingId = String(body?.bookingId ?? "").trim();
    const teamMembers = Array.isArray(body?.teamMembers) ? body.teamMembers.map((v: any) => String(v ?? "")) : [];
    const result = await updateBookingTeamMembers(id, userId, bookingId, teamMembers);
    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: 400 });
    }
    return NextResponse.json({ booking: result.booking });
  }

  const playerName = String(body?.playerName ?? "").trim();
  if (playerName) {
    if (!userId) {
      return NextResponse.json({ error: "userId is required." }, { status: 400 });
    }
    const teamMembers = Array.isArray(body?.teamMembers) ? body.teamMembers.map((v: any) => String(v ?? "")) : [];
    const result = await createBookingAndIncrement(id, userId, playerName, teamMembers, username);
    if (!result.ok) {
      return NextResponse.json({ error: result.reason, booking: result.booking ?? null }, { status: 400 });
    }
    return NextResponse.json({ booking: result.booking, tournament: result.tournament });
  }

  return NextResponse.json(
    { error: "Invalid booking request. playerName and userId are required." },
    { status: 400 }
  );
}
