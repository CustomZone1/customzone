import { NextResponse } from "next/server";

import {
  claimCreditsByTxnId,
  getUserWallet,
  requestWithdrawal,
  spendCredits,
} from "@/lib/server/walletStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseBody<T = any>(req: Request): Promise<T | null> {
  return req
    .json()
    .then((value) => value as T)
    .catch(() => null);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const userId = String(url.searchParams.get("userId") ?? "").trim();
  if (!userId) {
    return NextResponse.json({ error: "userId is required." }, { status: 400 });
  }

  const wallet = await getUserWallet(userId);
  return NextResponse.json({ wallet });
}

export async function POST(req: Request) {
  const body = await parseBody(req);
  const mode = String((body as any)?.mode ?? "").toLowerCase();
  const userId = String((body as any)?.userId ?? "").trim();
  const username = String((body as any)?.username ?? "").trim();

  if (!userId) {
    return NextResponse.json({ error: "userId is required." }, { status: 400 });
  }

  if (mode === "claim") {
    const txnId = String((body as any)?.txnId ?? "");
    const result = await claimCreditsByTxnId(userId, username, txnId);
    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: 400 });
    }
    return NextResponse.json({ wallet: result.wallet, amount: result.amount });
  }

  if (mode === "spend") {
    const amount = Number((body as any)?.amount ?? 0);
    const note = String((body as any)?.note ?? "");
    const result = await spendCredits(userId, amount, note);
    if (!result.ok) {
      return NextResponse.json({ error: result.reason, wallet: result.wallet }, { status: 400 });
    }
    return NextResponse.json({ wallet: result.wallet });
  }

  if (mode === "withdraw") {
    const upiId = String((body as any)?.upiId ?? "");
    const amount = Number((body as any)?.amount ?? 0);
    const result = await requestWithdrawal(userId, username, upiId, amount);
    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: 400 });
    }
    return NextResponse.json({ wallet: result.wallet, request: result.request });
  }

  return NextResponse.json({ error: "Invalid wallet mode." }, { status: 400 });
}
