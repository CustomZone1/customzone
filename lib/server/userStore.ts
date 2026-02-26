import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { promises as fs } from "fs";
import path from "path";

export type PublicUser = {
  id: string;
  username: string;
  createdAt: string;
};

type UserRecord = PublicUser & {
  usernameLower: string;
  passwordSalt: string;
  passwordHash: string;
};

type UserStoreFile = {
  users: UserRecord[];
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

const DB_FILE = path.join(process.cwd(), "data", "users.db.json");
const USERNAME_REGEX = /^[a-z0-9_]{4,24}$/i;
const MIN_PASSWORD_LENGTH = 6;

let writeQueue: Promise<void> = Promise.resolve();

function toPublicUser(user: UserRecord): PublicUser {
  return {
    id: user.id,
    username: user.username,
    createdAt: user.createdAt,
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

  const lettersOnly = tokens.filter((t) => /^[a-z]+$/.test(t)).join("");
  const digitsOnly = tokens.filter((t) => /^\d+$/.test(t)).join("");
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

async function ensureStoreFile() {
  try {
    await fs.access(DB_FILE);
  } catch {
    const initial: UserStoreFile = { users: [] };
    await fs.writeFile(DB_FILE, JSON.stringify(initial, null, 2), "utf8");
  }
}

async function readStore(): Promise<UserStoreFile> {
  await ensureStoreFile();
  const raw = await fs.readFile(DB_FILE, "utf8");
  try {
    const parsed = JSON.parse(raw) as Partial<UserStoreFile>;
    const users = Array.isArray(parsed?.users) ? parsed.users : [];
    return {
      users: users
        .map((user) => {
          const username = String(user?.username ?? "").trim();
          const usernameLower = normalizeUsername(String(user?.usernameLower ?? username));
          const passwordSalt = String(user?.passwordSalt ?? "");
          const passwordHash = String(user?.passwordHash ?? "");
          if (!username || !usernameLower || !passwordSalt || !passwordHash) return null;
          return {
            id: String(user?.id ?? crypto.randomUUID()),
            username,
            usernameLower,
            passwordSalt,
            passwordHash,
            createdAt: String(user?.createdAt ?? new Date().toISOString()),
          } satisfies UserRecord;
        })
        .filter(Boolean) as UserRecord[],
    };
  } catch {
    return { users: [] };
  }
}

async function writeStore(data: UserStoreFile) {
  await ensureStoreFile();
  await fs.writeFile(DB_FILE, JSON.stringify(data, null, 2), "utf8");
}

function withWriteLock<T>(operation: () => Promise<T>): Promise<T> {
  const next = writeQueue.then(operation, operation);
  writeQueue = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

export async function createUserAccount(input: {
  username: string;
  password: string;
}): Promise<CreateUserResult> {
  const username = String(input.username ?? "").trim();
  const password = String(input.password ?? "");

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

  return withWriteLock(async () => {
    const store = await readStore();
    const usernameLower = normalizeUsername(username);
    const takenSet = new Set(store.users.map((u) => u.usernameLower));
    const existing = store.users.find((u) => u.usernameLower === usernameLower);
    if (existing) {
      return {
        ok: false,
        code: "USERNAME_TAKEN",
        reason: "Username already taken.",
        suggestion: suggestAvailableUsername(username, takenSet),
      };
    }

    const salt = randomBytes(16).toString("hex");
    const passwordHash = hashPassword(password, salt);
    const user: UserRecord = {
      id: crypto.randomUUID(),
      username,
      usernameLower,
      passwordSalt: salt,
      passwordHash,
      createdAt: new Date().toISOString(),
    };

    store.users.push(user);
    await writeStore(store);

    return {
      ok: true,
      user: toPublicUser(user),
    };
  });
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

  const store = await readStore();
  const user = store.users.find((u) => u.usernameLower === username);
  if (!user) {
    return {
      ok: false,
      code: "INVALID_CREDENTIALS",
      reason: "Invalid username or password.",
    };
  }

  const ok = passwordsMatch(password, user.passwordSalt, user.passwordHash);
  if (!ok) {
    return {
      ok: false,
      code: "INVALID_CREDENTIALS",
      reason: "Invalid username or password.",
    };
  }

  return {
    ok: true,
    user: toPublicUser(user),
  };
}

export async function findUserByUsername(usernameInput: string): Promise<PublicUser | null> {
  const username = normalizeUsername(String(usernameInput ?? ""));
  if (!username) return null;

  const store = await readStore();
  const user = store.users.find((entry) => entry.usernameLower === username);
  return user ? toPublicUser(user) : null;
}

export async function findUserById(userIdInput: string): Promise<PublicUser | null> {
  const userId = String(userIdInput ?? "").trim();
  if (!userId) return null;

  const store = await readStore();
  const user = store.users.find((entry) => entry.id === userId);
  return user ? toPublicUser(user) : null;
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

  const wanted = new Set(ids);
  const store = await readStore();
  const result: Record<string, PublicUser> = {};

  for (const user of store.users) {
    if (!wanted.has(user.id)) continue;
    result[user.id] = toPublicUser(user);
  }

  return result;
}

export async function listPublicUsers(): Promise<PublicUser[]> {
  const store = await readStore();
  return store.users.map(toPublicUser);
}
