import { NextResponse } from "next/server";

import { createUserAccount } from "@/lib/server/userStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const username = String(body?.username ?? "");
    const password = String(body?.password ?? "");
    const confirmPassword = String(body?.confirmPassword ?? "");

    if (!password || !confirmPassword) {
      return NextResponse.json(
        { error: "Password and confirm password are required." },
        { status: 400 }
      );
    }

    if (password !== confirmPassword) {
      return NextResponse.json(
        { error: "Password and confirm password do not match." },
        { status: 400 }
      );
    }

    const result = await createUserAccount({ username, password });
    if (result.ok === false) {
      const status = result.code === "USERNAME_TAKEN" ? 409 : 400;
      return NextResponse.json(
        {
          error: result.reason,
          suggestion: result.suggestion,
          code: result.code,
        },
        { status }
      );
    }

    return NextResponse.json({ user: result.user }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
