import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const r = await fetch(process.env.SUPABASE_URL!, { method: "GET" });
    return NextResponse.json({
      ok: true,
      status: r.status,
      contentType: r.headers.get("content-type"),
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}