import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { supabase } from "@/lib/supabaseServer";
import {
  applyReferralOnSignup,
  findUserByReferralCode,
  generateUniqueReferralCode,
  normalizeReferralCodeInput,
  pushOwnReferralCodeInbox,
} from "@/lib/server/referralStore";

export type PublicUser = {
  id: string;
  username: string;
  createdAt: string;
};

type UserRow = {
  id: string;
  username: string;
  username_lower: string;
  password_salt: string;
  password_hash: string;
  referral_code?: string | null;
  referred_by_user_id?: string | null;
  created_at: string;
};

export type CreateUserResult =
  | { ok: true; user: PublicUser }
  | {
      ok: false;
      code: "INVALID_USERNAME" | "INVALID_PASSWORD" | "USERNAME_TAKEN";
      reason: string;
      suggestion?: string;
    };

export type LoginUserResult =
  | { ok: true; user: PublicUser }
  | { ok: false; code: "INVALID_CREDENTIALS"; reason: string };

const USERNAME_REGEX = /^[a-z0-9_]{4,24}$/i;
const MIN_PASSWORD_LENGTH = 6;

function toPublicUser(row: Pick<UserRow, "id" | "username" | "created_at">): PublicUser {
  return {
    id: String(row.id),
    username: String(row.username),
    createdAt: String(row.created_at),
  };
}

function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

function sanitizeUsername(value: string) {
  return normalizeUsername(value).replace(/[^a-z0-9_]/g, "");
}

function validateUsername(username: string) {
  const trimmed = username.trim();
  if (!trimmed) {
    return { ok: false as const, reason: "Username is required." };
  }
  if (!USERNAME_REGEX.test(trimmed)) {
    return {
      ok: false as const,
      reason: "Use 4-24 characters: letters, numbers, underscore (_).",
    };
  }
  return { ok: true as const };
}

function validatePassword(password: string) {
  if (!password) {
    return { ok: false as const, reason: "Password is required." };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false as const,
      reason: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }
  return { ok: true as const };
}

function hashPassword(password: string, salt: string) {
  return scryptSync(password, salt, 64).toString("hex");
}

function passwordsMatch(password: string, salt: string, storedHash: string) {
  const calculated = hashPassword(password, salt);
  try {
    return timingSafeEqual(
      Buffer.from(calculated, "hex"),
      Buffer.from(storedHash, "hex")
    );
  } catch {
    return false;
  }
}

function tokenizeUsername(base: string) {
  return base.match(/[a-z]+|\d+|_+/g) ?? [base];
}

function dedupeList(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function buildSuggestionCandidates(inputUsername: string) {
  const sanitized = sanitizeUsername(inputUsername);
  const tokens = tokenizeUsername(sanitized).filter(Boolean);

  const candidates: string[] = [];

  if (tokens.length >= 2) {
    candidates.push([...tokens].reverse().join(""));
    candidates.push([...tokens.slice(1), tokens[0]].join(""));
  }

  if (tokens.length >= 3) {
    const first = tokens[0] ?? "";
    const middle = tokens[1] ?? "";
    const last = tokens[2] ?? "";
    candidates.push(`${last}${middle}${first}`);
  }

  const lettersOnly = tokens.filter((token) => /^[a-z]+$/.test(token)).join("");
  const digitsOnly = tokens.filter((token) => /^\d+$/.test(token)).join("");
  if (lettersOnly && digitsOnly) {
    candidates.push(`${digitsOnly}${lettersOnly}`);
    candidates.push(`${lettersOnly}${digitsOnly}`);
  }

  if (sanitized.includes("_")) {
    candidates.push(sanitized.replace(/_+/g, ""));
  } else {
    candidates.push(`${sanitized}_ff`);
  }

  candidates.push(`${sanitized}ff`);
  candidates.push(`${sanitized}01`);
  candidates.push(`${sanitized}21`);
  candidates.push(`${sanitized}99`);

  return dedupeList(
    candidates
      .map(sanitizeUsername)
      .filter((candidate) => candidate.length >= 4 && candidate.length <= 24)
  );
}

function suggestAvailableUsername(inputUsername: string, taken: Set<string>) {
  const base = sanitizeUsername(inputUsername) || "player";
  const candidates = buildSuggestionCandidates(base);

  for (const candidate of candidates) {
    if (!taken.has(candidate) && USERNAME_REGEX.test(candidate)) {
      return candidate;
    }
  }

  for (let i = 1; i < 10_000; i += 1) {
    const suffix = String(i);
    const root = base.slice(0, Math.max(1, 24 - suffix.length));
    const next = `${root}${suffix}`;
    if (!taken.has(next) && USERNAME_REGEX.test(next)) {
      return next;
    }
  }

  return `player${Date.now().toString().slice(-5)}`;
}

async function getTakenUsernames() {
  const { data, error } = await supabase
    .from("users")
    .select("username_lower");

  if (error) return new Set<string>();
  return new Set(
    (data ?? [])
      .map((row) => String((row as any).username_lower ?? "").trim())
      .filter(Boolean)
  );
}

export async function createUserAccount(input: {
  username: string;
  password: string;
  referralCode?: string;
}): Promise<CreateUserResult> {
  const username = String(input.username ?? "").trim();
  const password = String(input.password ?? "");
  const referralCodeInput = normalizeReferralCodeInput(String(input.referralCode ?? ""));

  const usernameValidation = validateUsername(username);
  if (!usernameValidation.ok) {
    return {
      ok: false,
      code: "INVALID_USERNAME",
      reason: usernameValidation.reason,
    };
  }

  const passwordValidation = validatePassword(password);
  if (!passwordValidation.ok) {
    return {
      ok: false,
      code: "INVALID_PASSWORD",
      reason: passwordValidation.reason,
    };
  }

  const usernameLower = normalizeUsername(username);
  const { data: existing, error: existingError } = await supabase
    .from("users")
    .select("id")
    .eq("username_lower", usernameLower)
    .maybeSingle();

  if (existingError) {
    return {
      ok: false,
      code: "INVALID_USERNAME",
      reason: "Could not create account right now.",
    };
  }

  if (existing) {
    const taken = await getTakenUsernames();
    return {
      ok: false,
      code: "USERNAME_TAKEN",
      reason: "Username already taken.",
      suggestion: suggestAvailableUsername(username, taken),
    };
  }

  const passwordSalt = randomBytes(16).toString("hex");
  const passwordHash = hashPassword(password, passwordSalt);
  let ownReferralCode = "";
  try {
    ownReferralCode = await generateUniqueReferralCode(username);
  } catch {
    ownReferralCode = "";
  }

  let referredByUserId: string | null = null;
  if (referralCodeInput) {
    const referrer = await findUserByReferralCode(referralCodeInput);
    if (referrer) {
      referredByUserId = referrer.id;
    }
  }
  let data: any = null;
  let error: any = null;

  ({ data, error } = await supabase
    .from("users")
    .insert({
      username,
      password_salt: passwordSalt,
      password_hash: passwordHash,
      referral_code: ownReferralCode || null,
      referred_by_user_id: referredByUserId,
    })
    .select("id, username, created_at, referral_code")
    .single());

  if (error) {
    const missingReferralColumns =
      String(error.message ?? "").toLowerCase().includes("referral_code") ||
      String(error.message ?? "").toLowerCase().includes("referred_by_user_id");
    if (missingReferralColumns) {
      ({ data, error } = await supabase
        .from("users")
        .insert({
          username,
          password_salt: passwordSalt,
          password_hash: passwordHash,
        })
        .select("id, username, created_at")
        .single());
      ownReferralCode = "";
      referredByUserId = null;
    }
  }

  if (error || !data) {
    const duplicate = String(error?.message ?? "").toLowerCase().includes("duplicate");
    if (duplicate) {
      const taken = await getTakenUsernames();
      return {
        ok: false,
        code: "USERNAME_TAKEN",
        reason: "Username already taken.",
        suggestion: suggestAvailableUsername(username, taken),
      };
    }

    return {
      ok: false,
      code: "INVALID_USERNAME",
      reason: "Could not create account right now.",
    };
  }

  const createdUser = toPublicUser(data as Pick<UserRow, "id" | "username" | "created_at">);
  const createdReferralCode = String((data as any)?.referral_code ?? ownReferralCode ?? "").trim();
  if (createdReferralCode) {
    await pushOwnReferralCodeInbox(createdUser.id, createdReferralCode);
  }

  if (referredByUserId && referredByUserId !== createdUser.id) {
    await applyReferralOnSignup({
      newUserId: createdUser.id,
      newUsername: createdUser.username,
      newUserReferralCode: createdReferralCode,
      referredByUserId,
      referredByCode: referralCodeInput,
    });
  }

  return {
    ok: true,
    user: createdUser,
  };
}

export async function loginUserAccount(input: {
  username: string;
  password: string;
}): Promise<LoginUserResult> {
  const username = normalizeUsername(String(input.username ?? ""));
  const password = String(input.password ?? "");

  if (!username || !password) {
    return {
      ok: false,
      code: "INVALID_CREDENTIALS",
      reason: "Invalid username or password.",
    };
  }

  const { data, error } = await supabase
    .from("users")
    .select("id, username, created_at, password_salt, password_hash")
    .eq("username_lower", username)
    .maybeSingle();

  if (error || !data) {
    return {
      ok: false,
      code: "INVALID_CREDENTIALS",
      reason: "Invalid username or password.",
    };
  }

  const row = data as Pick<
    UserRow,
    "id" | "username" | "created_at" | "password_salt" | "password_hash"
  >;

  const ok = passwordsMatch(password, row.password_salt, row.password_hash);
  if (!ok) {
    return {
      ok: false,
      code: "INVALID_CREDENTIALS",
      reason: "Invalid username or password.",
    };
  }

  return {
    ok: true,
    user: toPublicUser(row),
  };
}

export async function findUserByUsername(usernameInput: string): Promise<PublicUser | null> {
  const usernameLower = normalizeUsername(String(usernameInput ?? ""));
  if (!usernameLower) return null;

  const { data, error } = await supabase
    .from("users")
    .select("id, username, created_at")
    .eq("username_lower", usernameLower)
    .maybeSingle();

  if (error || !data) return null;
  return toPublicUser(data as Pick<UserRow, "id" | "username" | "created_at">);
}

export async function findUserById(userIdInput: string): Promise<PublicUser | null> {
  const userId = String(userIdInput ?? "").trim();
  if (!userId) return null;

  const { data, error } = await supabase
    .from("users")
    .select("id, username, created_at")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return null;
  return toPublicUser(data as Pick<UserRow, "id" | "username" | "created_at">);
}

export async function findUsersByIds(userIdsInput: string[]): Promise<Record<string, PublicUser>> {
  const ids = Array.from(
    new Set(
      (Array.isArray(userIdsInput) ? userIdsInput : [])
        .map((id) => String(id ?? "").trim())
        .filter(Boolean)
    )
  );
  if (ids.length === 0) return {};

  const { data, error } = await supabase
    .from("users")
    .select("id, username, created_at")
    .in("id", ids);

  if (error || !data) return {};

  const usersById: Record<string, PublicUser> = {};
  for (const row of data ?? []) {
    const publicUser = toPublicUser(row as Pick<UserRow, "id" | "username" | "created_at">);
    usersById[publicUser.id] = publicUser;
  }
  return usersById;
}

export async function listPublicUsers(): Promise<PublicUser[]> {
  const { data, error } = await supabase
    .from("users")
    .select("id, username, created_at")
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  return (data ?? []).map((row) =>
    toPublicUser(row as Pick<UserRow, "id" | "username" | "created_at">)
  );
}
