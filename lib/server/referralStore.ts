import { supabase } from "@/lib/supabaseServer";
import { pushInboxMessage } from "@/lib/server/inboxStore";

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

function normalizeMode(value: unknown): ReferralRewardMode {
  const mode = String(value ?? "").toUpperCase();
  if (mode === "REFERRER" || mode === "NEW_USER" || mode === "BOTH") {
    return mode as ReferralRewardMode;
  }
  return "BOTH";
}

function normalizeCode(input: string) {
  return String(input ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function toAmount(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, n);
}

function toSettingsRow(row: any): ReferralSettings {
  return {
    rewardAmount: toAmount(row?.reward_amount),
    rewardMode: normalizeMode(row?.reward_mode),
    active: Boolean(row?.active),
    updatedAt: row?.updated_at ? String(row.updated_at) : undefined,
  };
}

async function ensureSettingsRow() {
  const { data, error } = await supabase
    .from("referral_settings")
    .select("*")
    .eq("id", true)
    .maybeSingle();

  if (!error && data) return data;

  const { data: inserted, error: insertError } = await supabase
    .from("referral_settings")
    .upsert(
      {
        id: true,
        reward_amount: DEFAULT_SETTINGS.rewardAmount,
        reward_mode: DEFAULT_SETTINGS.rewardMode,
        active: DEFAULT_SETTINGS.active,
      },
      { onConflict: "id" }
    )
    .select("*")
    .single();

  if (insertError || !inserted) {
    throw new Error(insertError?.message ?? "Could not initialize referral settings.");
  }

  return inserted;
}

async function ensureWalletBalanceRow(userId: string) {
  const { data: existing, error: existingError } = await supabase
    .from("wallet_balance")
    .select("user_id, balance")
    .eq("user_id", userId)
    .maybeSingle();

  if (existingError) throw new Error(existingError.message);
  if (existing) return existing;

  const { data, error } = await supabase
    .from("wallet_balance")
    .insert({
      user_id: userId,
      balance: 0,
      updated_at: new Date().toISOString(),
    })
    .select("user_id, balance")
    .single();

  if (error || !data) {
    const duplicate = String(error?.message ?? "").toLowerCase().includes("duplicate");
    if (duplicate) {
      const { data: afterRace, error: raceError } = await supabase
        .from("wallet_balance")
        .select("user_id, balance")
        .eq("user_id", userId)
        .maybeSingle();
      if (raceError || !afterRace) {
        throw new Error(raceError?.message ?? "Could not initialize wallet.");
      }
      return afterRace;
    }
    throw new Error(error?.message ?? "Could not initialize wallet.");
  }

  return data;
}

async function creditWalletWithLedger(userId: string, amount: number, note: string) {
  const walletRow = await ensureWalletBalanceRow(userId);
  const current = toAmount((walletRow as any)?.balance);
  const next = current + amount;

  const { error: updateError } = await supabase
    .from("wallet_balance")
    .update({
      balance: next,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  if (updateError) throw new Error(updateError.message);

  const { error: ledgerError } = await supabase.from("wallet_ledger").insert({
    user_id: userId,
    type: "CREDIT",
    amount,
    note,
    created_at: new Date().toISOString(),
  });

  if (ledgerError) throw new Error(ledgerError.message);
}

function referralCodeCandidate(username: string, salt: string) {
  const base = String(username ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 5)
    .padEnd(5, "X");
  return `${base}${salt}`.slice(0, 10);
}

export async function generateUniqueReferralCode(username: string) {
  for (let i = 0; i < 50; i += 1) {
    const salt = Math.floor(1000 + Math.random() * 9000).toString();
    const code = referralCodeCandidate(username, salt);

    const { data, error } = await supabase
      .from("users")
      .select("id")
      .eq("referral_code", code)
      .maybeSingle();

    if (error) {
      // If column not yet present in DB, fallback and let caller continue without referral code.
      if (String(error.message ?? "").toLowerCase().includes("column")) return "";
      throw new Error(error.message);
    }

    if (!data) return code;
  }

  return "";
}

export async function getReferralSettings(): Promise<ReferralSettings> {
  try {
    const row = await ensureSettingsRow();
    return toSettingsRow(row);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function updateReferralSettings(input: {
  rewardAmount: number;
  rewardMode: ReferralRewardMode;
  active: boolean;
}) {
  const rewardAmount = Math.max(0, toAmount(input.rewardAmount));
  const rewardMode = normalizeMode(input.rewardMode);
  const active = Boolean(input.active);

  const { data, error } = await supabase
    .from("referral_settings")
    .upsert(
      {
        id: true,
        reward_amount: rewardAmount,
        reward_mode: rewardMode,
        active,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    )
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Could not update referral settings.");
  }

  return toSettingsRow(data);
}

export async function findUserByReferralCode(codeInput: string) {
  const code = normalizeCode(codeInput);
  if (!code) return null;

  const { data, error } = await supabase
    .from("users")
    .select("id, username, referral_code")
    .eq("referral_code", code)
    .maybeSingle();

  if (error || !data) return null;
  return {
    id: String((data as any).id),
    username: String((data as any).username ?? ""),
    referralCode: String((data as any).referral_code ?? ""),
  };
}

export async function pushOwnReferralCodeInbox(userId: string, codeInput: string) {
  const code = normalizeCode(codeInput);
  if (!code) return;
  await pushInboxMessage(userId, {
    type: "SYSTEM",
    title: "Your Referral Code",
    message: `Share this code with friends: ${code}`,
  });
}

export async function applyReferralOnSignup(input: {
  newUserId: string;
  newUsername: string;
  newUserReferralCode: string;
  referredByUserId?: string | null;
  referredByCode?: string | null;
}) {
  const newUserId = String(input.newUserId ?? "").trim();
  const referrerId = String(input.referredByUserId ?? "").trim();
  const referredByCode = normalizeCode(String(input.referredByCode ?? ""));
  if (!newUserId) return;

  if (!referrerId || referrerId === newUserId) return;

  const settings = await getReferralSettings();
  if (!settings.active || settings.rewardAmount <= 0) return;

  const reward = settings.rewardAmount;

  const shouldRewardReferrer =
    settings.rewardMode === "REFERRER" || settings.rewardMode === "BOTH";
  const shouldRewardNewUser =
    settings.rewardMode === "NEW_USER" || settings.rewardMode === "BOTH";

  try {
    if (shouldRewardReferrer) {
      await creditWalletWithLedger(
        referrerId,
        reward,
        `Referral reward for inviting @${input.newUsername}`
      );
    }

    if (shouldRewardNewUser) {
      await creditWalletWithLedger(
        newUserId,
        reward,
        `Referral signup bonus (${referredByCode || "code"})`
      );
    }

    const { error: eventError } = await supabase.from("referral_events").insert({
      referrer_user_id: referrerId,
      referred_user_id: newUserId,
      referred_user_username: input.newUsername,
      referred_user_code: input.newUserReferralCode || null,
      used_referral_code: referredByCode || null,
      reward_amount: reward,
      reward_mode: settings.rewardMode,
      created_at: new Date().toISOString(),
    });

    if (eventError) {
      // Non-fatal, rewards already applied.
    }

    if (shouldRewardReferrer) {
      await pushInboxMessage(referrerId, {
        type: "WALLET",
        title: "Referral Reward Added",
        message:
          `You earned Rs ${reward} for referring @${input.newUsername}.\n` +
          `Current mode: ${settings.rewardMode}`,
      });
    }

    if (shouldRewardNewUser) {
      await pushInboxMessage(newUserId, {
        type: "WALLET",
        title: "Referral Bonus Added",
        message:
          `You received Rs ${reward} signup bonus using referral code ${referredByCode || ""}.`,
      });
    }
  } catch {
    // Do not fail signup for referral credit issues.
  }
}

export function normalizeReferralCodeInput(input: string) {
  return normalizeCode(input);
}

