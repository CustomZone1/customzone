import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseServer";

type Context = {
  params: { id: string };
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: Context) {
  const tournamentId = params.id;

  // Fetch tournament from Supabase
  const { data, error } = await supabase
    .from("tournaments")
    .select("*")
    .eq("id", tournamentId)
    .single();

  if (error) {
    return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  }

  return NextResponse.json({ tournament: data });
}