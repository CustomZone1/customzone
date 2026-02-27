import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ id: string }>;
};

function mapBooking(row: any) {
  return {
    id: row.id,
    tournamentId: row.tournament_id,
    userId: row.user_id,
    username: row.username ?? undefined,
    playerName: row.player_name ?? "",
    teamMembers: Array.isArray(row.team_members) ? row.team_members : [],
    teamSize: Number(row.team_size ?? 1),
    slotNumber: Number(row.slot_number ?? 0),
    createdAt: row.created_at,
    status: row.status ?? undefined,
  };
}

export async function GET(req: Request, context: Context) {
  const { id } = await context.params;

  const url = new URL(req.url);
  const userId = String(url.searchParams.get("userId") ?? "").trim();
  const username = String(url.searchParams.get("username") ?? "").trim();
  const includeAll = url.searchParams.get("all") === "1";

  // If userId/username provided, return their booking (or list if all=1)
  if (userId || username) {
    let q = supabase.from("bookings").select("*").eq("tournament_id", id);

    if (userId) q = q.eq("user_id", userId);
    if (!userId && username) q = q.ilike("username", username); // fallback

    q = q.order("slot_number", { ascending: true });

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const mapped = (data ?? []).map(mapBooking);

    if (includeAll) return NextResponse.json({ bookings: mapped });
    return NextResponse.json({ booking: mapped[0] ?? null });
  }

  // Admin / general list
  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .eq("tournament_id", id)
    .order("slot_number", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ bookings: (data ?? []).map(mapBooking) });
}

export async function POST(req: Request, context: Context) {
  const { id: tournamentId } = await context.params;

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  const userId = String(body?.userId ?? "").trim();
  const username = String(body?.username ?? "").trim();
  const playerName = String(body?.playerName ?? "").trim();

  if (!userId || !playerName) {
    return NextResponse.json(
      { error: "Invalid booking request. playerName and userId are required." },
      { status: 400 }
    );
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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (!data?.ok) {
    const code = String(data?.code ?? "BOOKING_FAILED");
    return NextResponse.json({ error: code, code }, { status: 400 });
  }

  // Important: return bookingId/slot so frontend can continue
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