import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseServer";
import {
  bookingContainsName,
  inferTeamSize,
  mapBookingRow,
  normalizeName,
  normalizeTeamMembers,
  recalcTournamentCounts,
} from "@/lib/server/supabaseTournament";
import { pushInboxMessage } from "@/lib/server/inboxStore";
import { spendCredits } from "@/lib/server/walletStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ id: string }>;
};

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeBookingNameList(
  inputMembers: unknown,
  fallbackCaptain: string,
  teamSize: number
) {
  return normalizeTeamMembers(inputMembers, fallbackCaptain, teamSize);
}

function hasNameConflict(existingRows: any[], normalizedNames: string[], ignoreBookingId = "") {
  if (!normalizedNames.length) return false;

  return existingRows.some((row) => {
    if (ignoreBookingId && String((row as any).id ?? "") === ignoreBookingId) {
      return false;
    }
    return normalizedNames.some((name) => bookingContainsName(row, name));
  });
}

async function getTournamentRow(tournamentId: string) {
  const { data, error } = await supabase
    .from("tournaments")
    .select("*")
    .eq("id", tournamentId)
    .single();
  if (error || !data) return null;
  return data;
}

export async function GET(req: Request, context: Context) {
  const { id } = await context.params;
  const tournamentId = normalizeText(id);
  if (!tournamentId) {
    return NextResponse.json({ error: "Tournament id is required." }, { status: 400 });
  }

  const url = new URL(req.url);
  const userId = normalizeText(url.searchParams.get("userId"));
  const username = normalizeText(url.searchParams.get("username"));
  const includeAll = url.searchParams.get("all") === "1";

  if (userId || username) {
    let query = supabase
      .from("bookings")
      .select("*")
      .eq("tournament_id", tournamentId);

    if (userId) {
      query = query.eq("user_id", userId);
    } else if (username) {
      query = query.ilike("username", username);
    }

    const { data, error } = await query.order("slot_number", { ascending: true });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const mapped = (data ?? []).map(mapBookingRow);
    if (includeAll) {
      return NextResponse.json({ bookings: mapped });
    }
    return NextResponse.json({ booking: mapped[0] ?? null });
  }

  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .eq("tournament_id", tournamentId)
    .order("slot_number", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ bookings: (data ?? []).map(mapBookingRow) });
}

async function updateTeamMembersMode(tournamentId: string, body: any) {
  const userId = normalizeText(body?.userId);
  const bookingId = normalizeText(body?.bookingId);
  const incomingNames = Array.isArray(body?.teamMembers) ? body.teamMembers : [];

  if (!userId || !bookingId) {
    return NextResponse.json({ error: "Booking not found." }, { status: 400 });
  }

  const tournament = await getTournamentRow(tournamentId);
  if (!tournament) {
    return NextResponse.json({ error: "Tournament not found." }, { status: 404 });
  }

  const { data: existingBooking, error: bookingError } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", bookingId)
    .eq("tournament_id", tournamentId)
    .eq("user_id", userId)
    .single();

  if (bookingError || !existingBooking) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }

  const startMs = new Date(String((tournament as any).date_time ?? "")).getTime();
  if (Number.isFinite(startMs) && Date.now() > startMs - 60 * 60 * 1000) {
    return NextResponse.json(
      { error: "Team names can only be updated up to 1 hour before start." },
      { status: 400 }
    );
  }

  const teamSize = inferTeamSize(
    String((tournament as any).match_type ?? "").toUpperCase() === "CS" ? "CS" : "BR",
    (tournament as any).br_mode
  );
  const nextMembers = normalizeBookingNameList(
    incomingNames,
    String((existingBooking as any).player_name ?? ""),
    teamSize
  );

  if (nextMembers.length === 0) {
    return NextResponse.json({ error: "At least one player name is required." }, { status: 400 });
  }

  const normalizedNames = nextMembers.map(normalizeName).filter(Boolean);
  const { data: allBookings, error: allBookingsError } = await supabase
    .from("bookings")
    .select("*")
    .eq("tournament_id", tournamentId);

  if (allBookingsError) {
    return NextResponse.json({ error: allBookingsError.message }, { status: 500 });
  }

  const hasConflict = hasNameConflict(allBookings ?? [], normalizedNames, bookingId);
  if (hasConflict) {
    return NextResponse.json(
      { error: "One or more team members are already booked in this tournament." },
      { status: 400 }
    );
  }

  const { data: updated, error: updateError } = await supabase
    .from("bookings")
    .update({
      player_name: nextMembers[0],
      team_members: nextMembers,
      team_size: teamSize,
    })
    .eq("id", bookingId)
    .eq("tournament_id", tournamentId)
    .eq("user_id", userId)
    .select("*")
    .single();

  if (updateError || !updated) {
    return NextResponse.json({ error: updateError?.message ?? "Could not update booking." }, { status: 500 });
  }

  return NextResponse.json({ booking: mapBookingRow(updated) });
}

export async function POST(req: Request, context: Context) {
  const { id } = await context.params;
  const tournamentId = normalizeText(id);
  if (!tournamentId) {
    return NextResponse.json({ error: "Tournament id is required." }, { status: 400 });
  }

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  const mode = normalizeText(body?.mode).toLowerCase();
  if (mode === "update-team") {
    return updateTeamMembersMode(tournamentId, body);
  }

  const userId = normalizeText(body?.userId);
  const username = normalizeText(body?.username);
  const playerName = normalizeText(body?.playerName);

  if (!userId || !playerName) {
    return NextResponse.json(
      { error: "Invalid booking request. playerName and userId are required." },
      { status: 400 }
    );
  }

  const tournament = await getTournamentRow(tournamentId);
  if (!tournament) {
    return NextResponse.json({ error: "Tournament not found." }, { status: 404 });
  }

  const matchType =
    String((tournament as any).match_type ?? "").toUpperCase() === "CS" ? "CS" : "BR";
  const teamSize = inferTeamSize(matchType, (tournament as any).br_mode);
  const members = normalizeBookingNameList(body?.teamMembers, playerName, teamSize);
  if (members.length === 0) {
    return NextResponse.json({ error: "At least one player name is required." }, { status: 400 });
  }

  const { data: existingBookings, error: existingError } = await supabase
    .from("bookings")
    .select("*")
    .eq("tournament_id", tournamentId)
    .order("slot_number", { ascending: true });

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }

  const normalizedNames = members.map(normalizeName).filter(Boolean);
  const conflict = hasNameConflict(existingBookings ?? [], normalizedNames);
  if (conflict) {
    return NextResponse.json(
      {
        error: "One or more team members are already booked in this tournament.",
        code: "PLAYER_ALREADY_BOOKED",
      },
      { status: 400 }
    );
  }

  const tournamentStatus = String((tournament as any).status ?? "").toUpperCase();
  const maxSlots = Math.max(1, Number((tournament as any).max_slots ?? 1));
  const manualSold = Math.max(0, Number((tournament as any).manual_sold_slots ?? 0));
  const onlineBookedCount = (existingBookings ?? []).length;
  const totalBooked = Math.min(maxSlots, onlineBookedCount + manualSold);
  const roomPublished = Boolean((tournament as any).room_id || (tournament as any).room_pass);
  const entryFee = Math.max(0, Number((tournament as any).entry_fee ?? 0));

  if (tournamentStatus === "COMPLETED" || totalBooked >= maxSlots) {
    return NextResponse.json({ error: "This tournament is full.", code: "TOURNAMENT_FULL" }, { status: 400 });
  }

  if (roomPublished) {
    return NextResponse.json(
      {
        error: "Booking is closed because Room ID and Password are already published.",
        code: "ROOM_PUBLISHED",
      },
      { status: 400 }
    );
  }

  const currentMaxSlot = (existingBookings ?? []).reduce(
    (max, row) => Math.max(max, Number((row as any).slot_number ?? 0)),
    0
  );
  const nextSlot = Math.max(1, currentMaxSlot + 1);

  const { data: insertedBooking, error: insertError } = await supabase
    .from("bookings")
    .insert({
      tournament_id: tournamentId,
      user_id: userId,
      username: username || null,
      player_name: members[0],
      team_members: members,
      team_size: teamSize,
      slot_number: nextSlot,
      status: "CONFIRMED",
    })
    .select("*")
    .single();

  if (insertError || !insertedBooking) {
    return NextResponse.json({ error: insertError?.message ?? "Booking failed." }, { status: 500 });
  }

  if (entryFee > 0) {
    const spend = await spendCredits(
      userId,
      entryFee,
      `Entry fee - ${String((tournament as any).name ?? "Tournament")}`
    );
    if (!spend.ok) {
      const { error: rollbackError } = await supabase
        .from("bookings")
        .delete()
        .eq("id", String((insertedBooking as any).id ?? ""))
        .eq("tournament_id", tournamentId);
      await recalcTournamentCounts(tournamentId);
      if (rollbackError) {
        return NextResponse.json(
          { error: "Booking payment failed and rollback failed. Contact admin." },
          { status: 500 }
        );
      }
      return NextResponse.json(
        { error: spend.reason || "Not enough wallet balance.", code: "WALLET_DEBIT_FAILED" },
        { status: 400 }
      );
    }
  }

  const recalc = await recalcTournamentCounts(tournamentId);
  if (!recalc) {
    return NextResponse.json({ error: "Could not refresh tournament counts." }, { status: 500 });
  }

  try {
    await pushInboxMessage(userId, {
      type: "SYSTEM",
      title: `Slot Booked: ${String((tournament as any).name ?? "Tournament")}`,
      message:
        "Best of luck for your match.\n" +
        "Please play fair and follow all tournament rules.\n" +
        `Slot No: #${nextSlot}\n` +
        `In-game name(s): ${members.join(", ")}`,
    });
  } catch {
    // Booking has already been saved.
  }

  return NextResponse.json({
    booking: mapBookingRow(insertedBooking),
    tournament: recalc.tournament,
  });
}
