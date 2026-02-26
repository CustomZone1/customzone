import { NextResponse } from "next/server";

import {
  adminCreditWallet,
  getAdminWalletOverview,
  markWithdrawalPaid,
  registerIncomingPayment,
} from "@/lib/server/walletStore";
import { findUserByUsername } from "@/lib/server/userStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseBody<T = any>(req: Request): Promise<T | null> {
  return req
    .json()
    .then((value) => value as T)
    .catch(() => null);
}

export async function GET() {
  const overview = await getAdminWalletOverview();
  return NextResponse.json(overview);
}

export async function POST(req: Request) {
  const body = await parseBody(req);
  const mode = String((body as any)?.mode ?? "").toLowerCase();

  if (mode === "register-payment") {
    const txnId = String((body as any)?.txnId ?? "");
    const amount = Number((body as any)?.amount ?? 0);
    const note = String((body as any)?.note ?? "");
    const result = await registerIncomingPayment(txnId, amount, note);
    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: 400 });
    }
    return NextResponse.json({ entry: result.entry });
  }

  if (mode === "mark-withdrawal-paid") {
    const requestId = String((body as any)?.requestId ?? "");
    const result = await markWithdrawalPaid(requestId);
    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: 400 });
    }
    return NextResponse.json({ request: result.request });
  }

  if (mode === "credit-prize") {
    const username = String((body as any)?.username ?? "").trim();
    const amount = Number((body as any)?.amount ?? 0);
    const note = String((body as any)?.note ?? "").trim();

    if (!username) {
      return NextResponse.json({ error: "Username is required." }, { status: 400 });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "Amount must be greater than 0." }, { status: 400 });
    }

    const user = await findUserByUsername(username);
    if (!user) {
      return NextResponse.json(
        { error: "Username not found. Ask player to create account first." },
        { status: 404 }
      );
    }

    const result = await adminCreditWallet(
      user.id,
      amount,
      note || `Prize sent by admin to @${user.username}`
    );
    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: 400 });
    }

    return NextResponse.json({
      user,
      wallet: result.wallet,
      txn: result.txn,
    });
  }

  return NextResponse.json({ error: "Invalid admin wallet mode." }, { status: 400 });
}
