import { promises as fs } from "fs";
import path from "path";
import { pushInboxMessage } from "@/lib/server/inboxStore";

export type WalletTxn = {
  id: string;
  type: "DEBIT" | "CREDIT";
  amount: number;
  note: string;
  createdAt: string;
};

export type AdminTxnStatus = "AVAILABLE" | "CLAIMED";

export type AdminTxn = {
  id: string;
  txnId: string;
  amount: number;
  note: string;
  status: AdminTxnStatus;
  registeredAt: string;
  claimedAt?: string;
  claimedByUserId?: string;
  claimedByUsername?: string;
};

export type WithdrawalStatus = "PENDING" | "PAID";

export type WithdrawalRequest = {
  id: string;
  userId: string;
  username: string;
  amount: number;
  upiId: string;
  status: WithdrawalStatus;
  requestedAt: string;
  processedAt?: string;
  note?: string;
};

export type UserWallet = {
  userId: string;
  balance: number;
  txns: WalletTxn[];
  withdrawals: WithdrawalRequest[];
};

type WalletStoreFile = {
  adminTxns: AdminTxn[];
  userWallets: UserWallet[];
};

const DB_FILE = path.join(process.cwd(), "data", "wallet.db.json");
const MIN_WITHDRAWAL_AMOUNT = 200;

let writeQueue: Promise<void> = Promise.resolve();

function normalizeTxnId(input: string) {
  return input.trim().replace(/\s+/g, "").toLowerCase();
}

function defaultUserWallet(userId: string): UserWallet {
  return {
    userId,
    balance: 0,
    txns: [],
    withdrawals: [],
  };
}

function normalizeWalletTxn(raw: any): WalletTxn {
  const type = String(raw?.type ?? "").toUpperCase() === "DEBIT" ? "DEBIT" : "CREDIT";
  return {
    id: String(raw?.id ?? crypto.randomUUID()),
    type,
    amount: Math.max(0, Number(raw?.amount ?? 0)),
    note: String(raw?.note ?? ""),
    createdAt: String(raw?.createdAt ?? new Date().toISOString()),
  };
}

function normalizeAdminTxn(raw: any): AdminTxn {
  const status = String(raw?.status ?? "").toUpperCase() === "CLAIMED" ? "CLAIMED" : "AVAILABLE";
  return {
    id: String(raw?.id ?? crypto.randomUUID()),
    txnId: String(raw?.txnId ?? ""),
    amount: Math.max(0, Number(raw?.amount ?? 0)),
    note: String(raw?.note ?? ""),
    status,
    registeredAt: String(raw?.registeredAt ?? new Date().toISOString()),
    claimedAt: raw?.claimedAt ? String(raw.claimedAt) : undefined,
    claimedByUserId: raw?.claimedByUserId ? String(raw.claimedByUserId) : undefined,
    claimedByUsername: raw?.claimedByUsername ? String(raw.claimedByUsername) : undefined,
  };
}

function normalizeWithdrawal(raw: any, fallbackUserId = "", fallbackUsername = ""): WithdrawalRequest {
  const status = String(raw?.status ?? "").toUpperCase() === "PAID" ? "PAID" : "PENDING";
  return {
    id: String(raw?.id ?? crypto.randomUUID()),
    userId: String(raw?.userId ?? fallbackUserId),
    username: String(raw?.username ?? fallbackUsername),
    amount: Math.max(0, Number(raw?.amount ?? 0)),
    upiId: String(raw?.upiId ?? ""),
    status,
    requestedAt: String(raw?.requestedAt ?? new Date().toISOString()),
    processedAt: raw?.processedAt ? String(raw.processedAt) : undefined,
    note: raw?.note ? String(raw.note) : undefined,
  };
}

function normalizeUserWallet(raw: any): UserWallet | null {
  const userId = String(raw?.userId ?? "").trim();
  if (!userId) return null;

  const txns = Array.isArray(raw?.txns) ? raw.txns.map(normalizeWalletTxn) : [];
  const withdrawals = Array.isArray(raw?.withdrawals)
    ? raw.withdrawals.map((item: any) =>
        normalizeWithdrawal(item, userId, String(raw?.username ?? ""))
      )
    : [];

  return {
    userId,
    balance: Math.max(0, Number(raw?.balance ?? 0)),
    txns,
    withdrawals,
  };
}

function sortByNewest<T extends { requestedAt?: string; registeredAt?: string }>(items: T[]) {
  return [...items].sort((a, b) => {
    const aTime = new Date(String(a.requestedAt ?? a.registeredAt ?? 0)).getTime();
    const bTime = new Date(String(b.requestedAt ?? b.registeredAt ?? 0)).getTime();
    return bTime - aTime;
  });
}

async function ensureStoreFile() {
  try {
    await fs.access(DB_FILE);
  } catch {
    const initial: WalletStoreFile = { adminTxns: [], userWallets: [] };
    await fs.writeFile(DB_FILE, JSON.stringify(initial, null, 2), "utf8");
  }
}

async function readStore(): Promise<WalletStoreFile> {
  await ensureStoreFile();
  const raw = await fs.readFile(DB_FILE, "utf8");
  try {
    const parsed = JSON.parse(raw) as Partial<WalletStoreFile>;
    const adminTxns = Array.isArray(parsed?.adminTxns)
      ? parsed.adminTxns.map(normalizeAdminTxn)
      : [];
    const userWallets = Array.isArray(parsed?.userWallets)
      ? parsed.userWallets.map(normalizeUserWallet).filter(Boolean) as UserWallet[]
      : [];

    return { adminTxns, userWallets };
  } catch {
    return { adminTxns: [], userWallets: [] };
  }
}

async function writeStore(data: WalletStoreFile) {
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

function findOrCreateUserWallet(store: WalletStoreFile, userId: string): UserWallet {
  const normalizedUserId = String(userId ?? "").trim();
  let wallet = store.userWallets.find((w) => w.userId === normalizedUserId);
  if (!wallet) {
    wallet = defaultUserWallet(normalizedUserId);
    store.userWallets.push(wallet);
  }
  return wallet;
}

export async function getUserWallet(userId: string): Promise<UserWallet> {
  const normalizedUserId = String(userId ?? "").trim();
  if (!normalizedUserId) return defaultUserWallet("");

  const store = await readStore();
  const wallet = store.userWallets.find((w) => w.userId === normalizedUserId);
  return wallet ? wallet : defaultUserWallet(normalizedUserId);
}

export async function getAdminWalletOverview() {
  const store = await readStore();
  const pendingWithdrawals = sortByNewest(
    store.userWallets.flatMap((wallet) =>
      wallet.withdrawals.filter((w) => w.status === "PENDING")
    )
  );
  const totalUserBalance = store.userWallets.reduce((sum, wallet) => sum + wallet.balance, 0);
  return {
    adminTxns: sortByNewest(store.adminTxns),
    pendingWithdrawals,
    totalUserBalance,
  };
}

export async function registerIncomingPayment(
  txnIdInput: string,
  amount: number,
  adminNote = ""
) {
  return withWriteLock(async () => {
    const store = await readStore();
    const normalizedTxnId = normalizeTxnId(txnIdInput);

    if (!normalizedTxnId) {
      return { ok: false as const, reason: "Transaction ID is required." };
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return { ok: false as const, reason: "Amount must be greater than 0." };
    }

    const duplicate = store.adminTxns.find(
      (entry) => normalizeTxnId(entry.txnId) === normalizedTxnId
    );
    if (duplicate) {
      return {
        ok: false as const,
        reason: "This transaction ID already exists in the system.",
      };
    }

    const registered: AdminTxn = {
      id: crypto.randomUUID(),
      txnId: txnIdInput.trim(),
      amount: Number(amount),
      note: adminNote.trim() || "Registered by admin",
      status: "AVAILABLE",
      registeredAt: new Date().toISOString(),
    };

    store.adminTxns.unshift(registered);
    await writeStore(store);
    return { ok: true as const, entry: registered };
  });
}

export async function claimCreditsByTxnId(
  userId: string,
  username: string,
  txnIdInput: string
) {
  return withWriteLock(async () => {
    const normalizedUserId = String(userId ?? "").trim();
    const normalizedUsername = String(username ?? "").trim();
    if (!normalizedUserId) {
      return { ok: false as const, reason: "Login required." };
    }

    const normalizedTxnId = normalizeTxnId(txnIdInput);
    if (!normalizedTxnId) {
      return { ok: false as const, reason: "Transaction ID is required." };
    }

    const store = await readStore();
    const idx = store.adminTxns.findIndex(
      (entry) => normalizeTxnId(entry.txnId) === normalizedTxnId
    );
    if (idx === -1) {
      return {
        ok: false as const,
        reason: "Transaction ID not registered by admin yet.",
      };
    }

    const entry = store.adminTxns[idx];
    if (entry.status === "CLAIMED") {
      return { ok: false as const, reason: "This transaction ID has already been used." };
    }

    const claimedAt = new Date().toISOString();
    const updatedEntry: AdminTxn = {
      ...entry,
      status: "CLAIMED",
      claimedAt,
      claimedByUserId: normalizedUserId,
      claimedByUsername: normalizedUsername || entry.claimedByUsername,
    };
    store.adminTxns[idx] = updatedEntry;

    const wallet = findOrCreateUserWallet(store, normalizedUserId);
    wallet.balance += Number(entry.amount);
    wallet.txns.unshift({
      id: crypto.randomUUID(),
      type: "CREDIT",
      amount: Number(entry.amount),
      note: `UPI deposit claimed (Txn ID: ${entry.txnId})`,
      createdAt: claimedAt,
    });

    await writeStore(store);
    try {
      await pushInboxMessage(normalizedUserId, {
        type: "WALLET",
        title: "Deposit Added",
        message:
          `Your deposit has been verified and added.\n` +
          `Amount: Rs ${entry.amount}\n` +
          `Txn ID: ${entry.txnId}`,
      });
    } catch {
      // ignore inbox failures, wallet update already saved
    }
    return { ok: true as const, amount: entry.amount, wallet };
  });
}

export async function spendCredits(userId: string, amount: number, note: string) {
  return withWriteLock(async () => {
    const normalizedUserId = String(userId ?? "").trim();
    if (!normalizedUserId) {
      return { ok: false as const, reason: "Login required.", wallet: defaultUserWallet("") };
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return {
        ok: false as const,
        reason: "Amount must be greater than 0.",
        wallet: defaultUserWallet(normalizedUserId),
      };
    }

    const store = await readStore();
    const wallet = findOrCreateUserWallet(store, normalizedUserId);
    if (wallet.balance < amount) {
      return { ok: false as const, reason: "Not enough balance.", wallet };
    }

    wallet.balance -= amount;
    wallet.txns.unshift({
      id: crypto.randomUUID(),
      type: "DEBIT",
      amount,
      note: String(note ?? "").trim() || "Debit",
      createdAt: new Date().toISOString(),
    });

    await writeStore(store);
    return { ok: true as const, wallet };
  });
}

export async function adminCreditWallet(
  userId: string,
  amount: number,
  note: string
) {
  return withWriteLock(async () => {
    const normalizedUserId = String(userId ?? "").trim();
    if (!normalizedUserId) {
      return {
        ok: false as const,
        reason: "Valid user is required.",
      };
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return {
        ok: false as const,
        reason: "Amount must be greater than 0.",
      };
    }

    const store = await readStore();
    const wallet = findOrCreateUserWallet(store, normalizedUserId);
    const creditedAt = new Date().toISOString();
    const cleanNote = String(note ?? "").trim() || "Admin prize payout";

    wallet.balance += Number(amount);
    const txn: WalletTxn = {
      id: crypto.randomUUID(),
      type: "CREDIT",
      amount: Number(amount),
      note: cleanNote,
      createdAt: creditedAt,
    };
    wallet.txns.unshift(txn);

    await writeStore(store);
    try {
      await pushInboxMessage(normalizedUserId, {
        type: "RESULT",
        title: "Prize Added",
        message: `${cleanNote}\nAmount: Rs ${amount}`,
      });
    } catch {
      // ignore inbox failures, wallet update already saved
    }
    return {
      ok: true as const,
      wallet,
      txn,
    };
  });
}

export async function requestWithdrawal(
  userId: string,
  username: string,
  upiIdInput: string,
  amountInput: number
) {
  return withWriteLock(async () => {
    const normalizedUserId = String(userId ?? "").trim();
    const normalizedUsername = String(username ?? "").trim();
    if (!normalizedUserId) {
      return { ok: false as const, reason: "Login required." };
    }
    const amount = Number(amountInput);
    if (!Number.isFinite(amount) || amount <= 0) {
      return { ok: false as const, reason: "Enter a valid withdrawal amount." };
    }
    if (!Number.isInteger(amount)) {
      return { ok: false as const, reason: "Withdrawal amount must be a whole number." };
    }
    if (amount < MIN_WITHDRAWAL_AMOUNT) {
      return {
        ok: false as const,
        reason: `Minimum withdrawal is Rs ${MIN_WITHDRAWAL_AMOUNT}.`,
      };
    }

    const upiId = String(upiIdInput ?? "").trim();
    if (!upiId) {
      return { ok: false as const, reason: "UPI ID is required." };
    }
    if (!upiId.includes("@")) {
      return {
        ok: false as const,
        reason: "Enter a valid UPI ID (example: name@bank).",
      };
    }

    const store = await readStore();
    const wallet = findOrCreateUserWallet(store, normalizedUserId);
    if (wallet.balance < amount) {
      return {
        ok: false as const,
        reason: "Not enough balance.",
      };
    }

    const now = new Date().toISOString();
    const request: WithdrawalRequest = {
      id: crypto.randomUUID(),
      userId: normalizedUserId,
      username: normalizedUsername || "player",
      amount,
      upiId,
      status: "PENDING",
      requestedAt: now,
      note: "Awaiting admin payout",
    };

    wallet.balance -= amount;
    wallet.withdrawals.unshift(request);
    wallet.txns.unshift({
      id: crypto.randomUUID(),
      type: "DEBIT",
      amount,
      note: `Withdrawal request of Rs ${amount} submitted to ${upiId}`,
      createdAt: now,
    });

    await writeStore(store);
    try {
      await pushInboxMessage(normalizedUserId, {
        type: "WALLET",
        title: "Withdrawal Requested",
        message:
          `Rs ${amount} debited from wallet.\n` +
          `UPI: ${upiId}\n` +
          `Please wait for a while for admin to verify your withdrawal.`,
      });
    } catch {
      // ignore inbox failures, wallet update already saved
    }
    return { ok: true as const, request, wallet };
  });
}

export async function markWithdrawalPaid(requestId: string) {
  return withWriteLock(async () => {
    const targetId = String(requestId ?? "").trim();
    if (!targetId) {
      return { ok: false as const, reason: "Request not found." };
    }

    const store = await readStore();

    for (const wallet of store.userWallets) {
      const idx = wallet.withdrawals.findIndex((request) => request.id === targetId);
      if (idx === -1) continue;

      const current = wallet.withdrawals[idx];
      if (current.status === "PAID") {
        return { ok: false as const, reason: "Request already marked paid." };
      }

      const processedAt = new Date().toISOString();
      const updated: WithdrawalRequest = {
        ...current,
        status: "PAID",
        processedAt,
      };
      wallet.withdrawals[idx] = updated;
      await writeStore(store);
      try {
        await pushInboxMessage(updated.userId, {
          type: "WALLET",
          title: "Withdrawal Paid",
          message: `Rs ${updated.amount} has been marked paid by admin.\nUPI: ${updated.upiId}`,
        });
      } catch {
        // ignore inbox failures, withdrawal update already saved
      }
      return { ok: true as const, request: updated };
    }

    return { ok: false as const, reason: "Request not found." };
  });
}
