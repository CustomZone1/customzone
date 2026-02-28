import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseServer";
import {
  mapTournamentRow,
  getOnlineBookingCount,
} from "@/lib/server/supabaseTournament";

type Context = {
  params: Promise<{ id: string }>;
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toInt(value: unknown, fallback = 0) {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.floor(next);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

async function getTournamentRow(tournamentId: string) {
  const { data, error } = await supabase
    .from("tournaments")
    .select("*")
    .eq("id", tournamentId)
    .single();

  if (error || !data) {
    return null;
  }
  return data;
}

async function hasRoomAccess(tournamentId: string, userIdInput: string, usernameInput: string) {
  const userId = String(userIdInput ?? "").trim();
  const username = String(usernameInput ?? "").trim();

  if (userId) {
    const { data, error } = await supabase
      .from("bookings")
      .select("id")
      .eq("tournament_id", tournamentId)
      .eq("user_id", userId)
      .limit(1);
    if (!error && data && data.length > 0) return true;
  }

  if (username) {
    const { data, error } = await supabase
      .from("bookings")
      .select("id")
      .eq("tournament_id", tournamentId)
      .ilike("username", username)
      .limit(1);
    if (!error && data && data.length > 0) return true;
  }

  return false;
}

export async function GET(req: Request, context: Context) {
  const { id } = await context.params;
  const tournamentId = String(id ?? "").trim();
  if (!tournamentId) {
    return NextResponse.json({ error: "Tournament id is required." }, { status: 400 });
  }

  const row = await getTournamentRow(tournamentId);
  if (!row) {
    return NextResponse.json({ error: "Tournament not found." }, { status: 404 });
  }

  const url = new URL(req.url);
  const wantsRoom = url.searchParams.get("room") === "1";

  if (!wantsRoom) {
    const onlineBookedCount = await getOnlineBookingCount(tournamentId);
    return NextResponse.json({
      tournament: mapTournamentRow(row, onlineBookedCount),
    });
  }

  const userId = String(url.searchParams.get("userId") ?? "").trim();
  const username = String(url.searchParams.get("username") ?? "").trim();
  const roomPublished = Boolean((row as any).room_id || (row as any).room_pass);

  if (!userId && !username) {
    return NextResponse.json({
      room: null,
      locked: roomPublished,
      unlockAt: undefined,
      access: false,
    });
  }

  const access = await hasRoomAccess(tournamentId, userId, username);
  if (!access) {
    return NextResponse.json({
      room: null,
      locked: roomPublished,
      unlockAt: undefined,
      access: false,
    });
  }

  const room =
    roomPublished
      ? {
          roomId: String((row as any).room_id ?? ""),
          roomPassword: String((row as any).room_pass ?? ""),
          updatedAt: String((row as any).updated_at ?? (row as any).created_at ?? new Date().toISOString()),
        }
      : null;

  return NextResponse.json({
    room,
    locked: false,
    unlockAt: undefined,
    access: true,
  });
}

export async function PATCH(req: Request, context: Context) {
  const { id } = await context.params;
  const tournamentId = String(id ?? "").trim();
  if (!tournamentId) {
    return NextResponse.json({ error: "Tournament id is required." }, { status: 400 });
  }

  const current = await getTournamentRow(tournamentId);
  if (!current) {
    return NextResponse.json({ error: "Tournament not found." }, { status: 404 });
  }

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  const hasManualSold = typeof body?.manualSoldSlots !== "undefined";
  const wantsClearRoom = body?.clear === true;
  const hasRoomFields =
    typeof body?.roomId !== "undefined" || typeof body?.roomPassword !== "undefined";

  if (!hasManualSold && !wantsClearRoom && !hasRoomFields) {
    return NextResponse.json({ error: "No updatable fields provided." }, { status: 400 });
  }

  if (hasManualSold) {
    const onlineBookedCount = await getOnlineBookingCount(tournamentId);
    const maxSlots = Math.max(1, toInt((current as any).max_slots, 1));
    const maxManualAllowed = Math.max(0, maxSlots - onlineBookedCount);
    const requested = toInt(body?.manualSoldSlots, 0);
    const nextManualSold = clamp(requested, 0, maxManualAllowed);
    const nextBookedCount = clamp(onlineBookedCount + nextManualSold, 0, maxSlots);
    const currentStatus = String((current as any).status ?? "").toUpperCase();
    const nextStatus =
      currentStatus === "COMPLETED"
        ? "COMPLETED"
        : nextBookedCount >= maxSlots
          ? "FULL"
          : "OPEN";

    const { data, error } = await supabase
      .from("tournaments")
      .update({
        manual_sold_slots: nextManualSold,
        booked_count: nextBookedCount,
        status: nextStatus,
      })
      .eq("id", tournamentId)
      .select("*")
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "Could not update sold slots." }, { status: 500 });
    }

    return NextResponse.json({
      tournament: mapTournamentRow(data, onlineBookedCount),
      onlineBookedCount,
      maxManualAllowed,
    });
  }

  if (wantsClearRoom) {
    const { data, error } = await supabase
      .from("tournaments")
      .update({
        room_id: null,
        room_pass: null,
      })
      .eq("id", tournamentId)
      .select("*")
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "Could not clear room details." }, { status: 500 });
    }

    return NextResponse.json({
      room: null,
      tournament: mapTournamentRow(data),
    });
  }

  const roomId = String(body?.roomId ?? "").trim();
  const roomPassword = String(body?.roomPassword ?? "").trim();
  if (!roomId || !roomPassword) {
    return NextResponse.json(
      { error: "Both Room ID and Room Password are required." },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("tournaments")
    .update({
      room_id: roomId,
      room_pass: roomPassword,
    })
    .eq("id", tournamentId)
    .select("*")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Could not update room details." }, { status: 500 });
  }

  return NextResponse.json({
    room: {
      roomId: String((data as any).room_id ?? ""),
      roomPassword: String((data as any).room_pass ?? ""),
      updatedAt: String((data as any).updated_at ?? (data as any).created_at ?? new Date().toISOString()),
    },
    tournament: mapTournamentRow(data),
  });
}

export async function DELETE(_req: Request, context: Context) {
  const { id } = await context.params;
  const tournamentId = String(id ?? "").trim();
  if (!tournamentId) {
    return NextResponse.json({ error: "Tournament id is required." }, { status: 400 });
  }

  const current = await getTournamentRow(tournamentId);
  if (!current) {
    return NextResponse.json({ error: "Tournament not found." }, { status: 404 });
  }

  // Keep this explicit even if DB FK cascade exists.
  const { error: bookingsDeleteError } = await supabase
    .from("bookings")
    .delete()
    .eq("tournament_id", tournamentId);

  if (bookingsDeleteError) {
    return NextResponse.json({ error: bookingsDeleteError.message }, { status: 500 });
  }

  const { error: tournamentDeleteError } = await supabase
    .from("tournaments")
    .delete()
    .eq("id", tournamentId);

  if (tournamentDeleteError) {
    return NextResponse.json({ error: tournamentDeleteError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
