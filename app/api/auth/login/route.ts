import { NextResponse } from "next/server";

import { loginUserAccount } from "@/lib/server/userStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const username = String(body?.username ?? "");
    const password = String(body?.password ?? "");

    const result = await loginUserAccount({ username, password });
    if (result.ok === false) {
      return NextResponse.json({ error: result.reason }, { status: 401 });
    }

    return NextResponse.json({ user: result.user });
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
