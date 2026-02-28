import { NextResponse } from "next/server";
import {
  getReferralSettings,
  updateReferralSettings,
  type ReferralRewardMode,
} from "@/lib/server/referralStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseBody<T = any>(req: Request): Promise<T | null> {
  return req
    .json()
    .then((value) => value as T)
    .catch(() => null);
}

export async function GET() {
  const settings = await getReferralSettings();
  return NextResponse.json({ settings });
}

export async function POST(req: Request) {
  const body = await parseBody(req);
  const rewardAmount = Number((body as any)?.rewardAmount ?? 0);
  const rewardMode = String((body as any)?.rewardMode ?? "BOTH") as ReferralRewardMode;
  const active = Boolean((body as any)?.active);

  if (!Number.isFinite(rewardAmount) || rewardAmount < 0) {
    return NextResponse.json({ error: "Reward amount must be 0 or more." }, { status: 400 });
  }

  if (rewardMode !== "REFERRER" && rewardMode !== "NEW_USER" && rewardMode !== "BOTH") {
    return NextResponse.json({ error: "Invalid reward mode." }, { status: 400 });
  }

  try {
    const settings = await updateReferralSettings({
      rewardAmount,
      rewardMode,
      active,
    });
    return NextResponse.json({ settings });
  } catch (error: any) {
    return NextResponse.json(
      { error: String(error?.message ?? "Could not update referral settings.") },
      { status: 500 }
    );
  }
}

