export type ReferralRewardMode = "REFERRER" | "NEW_USER" | "BOTH";

export type ReferralSettings = {
  rewardAmount: number;
  rewardMode: ReferralRewardMode;
  active: boolean;
  updatedAt?: string;
};

const DEFAULT_SETTINGS: ReferralSettings = {
  rewardAmount: 0,
  rewardMode: "BOTH",
  active: false,
};

async function parseResponse<T>(res: Response): Promise<T> {
  let payload: any = null;
  try {
    payload = await res.json();
  } catch {
    payload = {};
  }

  if (!res.ok) {
    throw new Error(String(payload?.error ?? `Request failed (${res.status})`));
  }

  return payload as T;
}

export async function getReferralSettingsShared(): Promise<ReferralSettings> {
  try {
    const data = await parseResponse<{ settings: ReferralSettings }>(
      await fetch("/api/referral/admin", { cache: "no-store" })
    );
    return data.settings ?? DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function updateReferralSettingsShared(input: {
  rewardAmount: number;
  rewardMode: ReferralRewardMode;
  active: boolean;
}) {
  try {
    const data = await parseResponse<{ settings: ReferralSettings }>(
      await fetch("/api/referral/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
    );
    return { ok: true as const, settings: data.settings };
  } catch (error: any) {
    return {
      ok: false as const,
      reason: String(error?.message ?? "Could not update referral settings."),
    };
  }
}

