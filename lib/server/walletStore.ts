import { supabase } from "@/lib/supabaseServer";
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

const MIN_WITHDRAWAL_AMOUNT = 200;

function normalizeTxnId(input: string) {
  return input.trim().replace(/\s+/g, "").toLowerCase();
}

function toAmount(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, n);
}

function defaultUserWallet(userId: string): UserWallet {
  return {
    userId,
    balance: 0,
    txns: [],
    withdrawals: [],
  };
}

function mapWalletTxn(row: any): WalletTxn {
  const type = String(row?.type ?? "").toUpperCase() === "DEBIT" ? "DEBIT" : "CREDIT";
  return {
    id: String(row?.id ?? crypto.randomUUID()),
    type,
    amount: toAmount(row?.amount),
    note: String(row?.note ?? ""),
    createdAt: String(row?.created_at ?? new Date().toISOString()),
  };
}

function mapAdminTxn(row: any): AdminTxn {
  return {
    id: String(row?.id ?? crypto.randomUUID()),
    txnId: String(row?.txn_id ?? row?.txnId ?? ""),
    amount: toAmount(row?.amount),
    note: String(row?.note ?? ""),
    status: String(row?.status ?? "").toUpperCase() === "CLAIMED" ? "CLAIMED" : "AVAILABLE",
    registeredAt: String(row?.registered_at ?? new Date().toISOString()),
    claimedAt: row?.claimed_at ? String(row.claimed_at) : undefined,
    claimedByUserId: row?.claimed_by_user_id ? String(row.claimed_by_user_id) : undefined,
    claimedByUsername: row?.claimed_by_username ? String(row.claimed_by_username) : undefined,
  };
}

function mapWithdrawal(row: any): WithdrawalRequest {
  return {
    id: String(row?.id ?? crypto.randomUUID()),
    userId: String(row?.user_id ?? ""),
    username: String(row?.username ?? "player"),
    amount: toAmount(row?.amount),
    upiId: String(row?.upi_id ?? ""),
    status: String(row?.status ?? "").toUpperCase() === "PAID" ? "PAID" : "PENDING",
    requestedAt: String(row?.requested_at ?? new Date().toISOString()),
    processedAt: row?.processed_at ? String(row.processed_at) : undefined,
    note: row?.note ? String(row.note) : undefined,
  };
}

async function getBalanceRow(userId: string) {
  const { data, error } = await supabase
    .from("wallet_balance")
    .select("user_id, balance, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

async function ensureBalanceRow(userIdInput: string) {
  const userId = String(userIdInput ?? "").trim();
  if (!userId) throw new Error("Login required.");

  const existing = await getBalanceRow(userId);
  if (existing) return existing;

  const now = new Date().toISOString();
  const { error: insertError } = await supabase
    .from("wallet_balance")
    .insert({
      user_id: userId,
      balance: 0,
      updated_at: now,
    });

  // Ignore possible race duplicate and re-read.
  if (insertError) {
    const duplicate = String(insertError.message ?? "").toLowerCase().includes("duplicate");
    if (!duplicate) throw new Error(insertError.message);
  }

  const afterInsert = await getBalanceRow(userId);
  if (!afterInsert) throw new Error("Could not initialize wallet.");
  return afterInsert;
}

async function updateBalance(userId: string, nextBalance: number) {
  const { error } = await supabase
    .from("wallet_balance")
    .update({
      balance: Math.max(0, nextBalance),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  if (error) throw new Error(error.message);
}

async function insertLedgerTxn(input: {
  userId: string;
  type: "DEBIT" | "CREDIT";
  amount: number;
  note: string;
  createdAt?: string;
}) {
  const { data, error } = await supabase
    .from("wallet_ledger")
    .insert({
      user_id: input.userId,
      type: input.type,
      amount: input.amount,
      note: input.note,
      created_at: input.createdAt ?? new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Could not write wallet history.");
  return mapWalletTxn(data);
}

export async function getUserWallet(userIdInput: string): Promise<UserWallet> {
  const userId = String(userIdInput ?? "").trim();
  if (!userId) return defaultUserWallet("");

  const [balanceRes, txnsRes, withdrawalsRes] = await Promise.all([
    supabase
      .from("wallet_balance")
      .select("balance")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("wallet_ledger")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    supabase
      .from("wallet_withdrawals")
      .select("*")
      .eq("user_id", userId)
      .order("requested_at", { ascending: false }),
  ]);

  const balance =
    !balanceRes.error && balanceRes.data ? toAmount((balanceRes.data as any).balance) : 0;
  const txns = txnsRes.error ? [] : (txnsRes.data ?? []).map(mapWalletTxn);
  const withdrawals = withdrawalsRes.error ? [] : (withdrawalsRes.data ?? []).map(mapWithdrawal);

  return {
    userId,
    balance,
    txns,
    withdrawals,
  };
}

export async function getAdminWalletOverview() {
  const [adminTxnsRes, pendingWithdrawalsRes, balancesRes] = await Promise.all([
    supabase
      .from("wallet_admin_txns")
      .select("*")
      .order("registered_at", { ascending: false }),
    supabase
      .from("wallet_withdrawals")
      .select("*")
      .eq("status", "PENDING")
      .order("requested_at", { ascending: false }),
    supabase
      .from("wallet_balance")
      .select("balance"),
  ]);

  const adminTxns = adminTxnsRes.error ? [] : (adminTxnsRes.data ?? []).map(mapAdminTxn);
  const pendingWithdrawals =
    pendingWithdrawalsRes.error ? [] : (pendingWithdrawalsRes.data ?? []).map(mapWithdrawal);
  const totalUserBalance = balancesRes.error
    ? 0
    : (balancesRes.data ?? []).reduce((sum, row) => sum + toAmount((row as any).balance), 0);

  return {
    adminTxns,
    pendingWithdrawals,
    totalUserBalance,
  };
}

export async function registerIncomingPayment(
  txnIdInput: string,
  amountInput: number,
  adminNote = ""
) {
  const normalizedTxnId = normalizeTxnId(String(txnIdInput ?? ""));
  const amount = Number(amountInput);

  if (!normalizedTxnId) {
    return { ok: false as const, reason: "Transaction ID is required." };
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false as const, reason: "Amount must be greater than 0." };
  }

  const { data: existing, error: existingError } = await supabase
    .from("wallet_admin_txns")
    .select("id")
    .eq("txn_id_normalized", normalizedTxnId)
    .maybeSingle();

  if (existingError) {
    return { ok: false as const, reason: existingError.message };
  }
  if (existing) {
    return {
      ok: false as const,
      reason: "This transaction ID already exists in the system.",
    };
  }

  const { data, error } = await supabase
    .from("wallet_admin_txns")
    .insert({
      txn_id: String(txnIdInput ?? "").trim(),
      amount: Number(amount),
      note: String(adminNote ?? "").trim() || "Registered by admin",
      status: "AVAILABLE",
      registered_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error || !data) {
    return { ok: false as const, reason: error?.message ?? "Could not register transaction." };
  }

  return { ok: true as const, entry: mapAdminTxn(data) };
}

export async function claimCreditsByTxnId(
  userIdInput: string,
  usernameInput: string,
  txnIdInput: string
) {
  const userId = String(userIdInput ?? "").trim();
  const username = String(usernameInput ?? "").trim();
  const normalizedTxnId = normalizeTxnId(String(txnIdInput ?? ""));

  if (!userId) {
    return { ok: false as const, reason: "Login required." };
  }
  if (!normalizedTxnId) {
    return { ok: false as const, reason: "Transaction ID is required." };
  }

  const { data: entryRow, error: entryError } = await supabase
    .from("wallet_admin_txns")
    .select("*")
    .eq("txn_id_normalized", normalizedTxnId)
    .maybeSingle();

  if (entryError) {
    return { ok: false as const, reason: entryError.message };
  }
  if (!entryRow) {
    return {
      ok: false as const,
      reason: "Transaction ID not registered by admin yet.",
    };
  }

  const entry = mapAdminTxn(entryRow);
  if (entry.status === "CLAIMED") {
    return { ok: false as const, reason: "This transaction ID has already been used." };
  }

  const claimedAt = new Date().toISOString();
  const { data: claimedRow, error: claimError } = await supabase
    .from("wallet_admin_txns")
    .update({
      status: "CLAIMED",
      claimed_at: claimedAt,
      claimed_by_user_id: userId,
      claimed_by_username: username || null,
    })
    .eq("id", entry.id)
    .eq("status", "AVAILABLE")
    .select("*")
    .maybeSingle();

  if (claimError) {
    return { ok: false as const, reason: claimError.message };
  }
  if (!claimedRow) {
    return { ok: false as const, reason: "This transaction ID has already been used." };
  }

  try {
    const balanceRow = await ensureBalanceRow(userId);
    const currentBalance = toAmount((balanceRow as any).balance);
    const nextBalance = currentBalance + entry.amount;
    await updateBalance(userId, nextBalance);
    await insertLedgerTxn({
      userId,
      type: "CREDIT",
      amount: entry.amount,
      note: `UPI deposit claimed (Txn ID: ${entry.txnId})`,
      createdAt: claimedAt,
    });
  } catch (error: any) {
    return {
      ok: false as const,
      reason: String(error?.message ?? "Could not update wallet."),
    };
  }

  const wallet = await getUserWallet(userId);
  try {
    await pushInboxMessage(userId, {
      type: "WALLET",
      title: "Deposit Added",
      message:
        `Your deposit has been verified and added.\n` +
        `Amount: Rs ${entry.amount}\n` +
        `Txn ID: ${entry.txnId}`,
    });
  } catch {
    // Ignore inbox failure, wallet update already saved.
  }

  return { ok: true as const, amount: entry.amount, wallet };
}

export async function spendCredits(userIdInput: string, amountInput: number, noteInput: string) {
  const userId = String(userIdInput ?? "").trim();
  const amount = Number(amountInput);
  const note = String(noteInput ?? "").trim() || "Debit";

  if (!userId) {
    return {
      ok: false as const,
      reason: "Login required.",
      wallet: defaultUserWallet(""),
    };
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return {
      ok: false as const,
      reason: "Amount must be greater than 0.",
      wallet: await getUserWallet(userId),
    };
  }

  try {
    const balanceRow = await ensureBalanceRow(userId);
    const currentBalance = toAmount((balanceRow as any).balance);
    if (currentBalance < amount) {
      return {
        ok: false as const,
        reason: "Not enough balance.",
        wallet: await getUserWallet(userId),
      };
    }

    await updateBalance(userId, currentBalance - amount);
    await insertLedgerTxn({
      userId,
      type: "DEBIT",
      amount,
      note,
    });
  } catch (error: any) {
    return {
      ok: false as const,
      reason: String(error?.message ?? "Could not debit wallet."),
      wallet: await getUserWallet(userId),
    };
  }

  return { ok: true as const, wallet: await getUserWallet(userId) };
}

export async function adminCreditWallet(
  userIdInput: string,
  amountInput: number,
  noteInput: string
) {
  const userId = String(userIdInput ?? "").trim();
  const amount = Number(amountInput);
  const note = String(noteInput ?? "").trim() || "Admin prize payout";

  if (!userId) {
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

  let txn: WalletTxn;
  try {
    const balanceRow = await ensureBalanceRow(userId);
    const currentBalance = toAmount((balanceRow as any).balance);
    await updateBalance(userId, currentBalance + amount);
    txn = await insertLedgerTxn({
      userId,
      type: "CREDIT",
      amount,
      note,
    });
  } catch (error: any) {
    return {
      ok: false as const,
      reason: String(error?.message ?? "Could not credit wallet."),
    };
  }

  try {
    await pushInboxMessage(userId, {
      type: "RESULT",
      title: "Prize Added",
      message: `${note}\nAmount: Rs ${amount}`,
    });
  } catch {
    // Ignore inbox failure, wallet update already saved.
  }

  return {
    ok: true as const,
    wallet: await getUserWallet(userId),
    txn,
  };
}

export async function requestWithdrawal(
  userIdInput: string,
  usernameInput: string,
  upiIdInput: string,
  amountInput: number
) {
  const userId = String(userIdInput ?? "").trim();
  const username = String(usernameInput ?? "").trim() || "player";
  const upiId = String(upiIdInput ?? "").trim();
  const amount = Number(amountInput);

  if (!userId) {
    return { ok: false as const, reason: "Login required." };
  }
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
  if (!upiId) {
    return { ok: false as const, reason: "UPI ID is required." };
  }
  if (!upiId.includes("@")) {
    return {
      ok: false as const,
      reason: "Enter a valid UPI ID (example: name@bank).",
    };
  }

  let request: WithdrawalRequest;
  try {
    const balanceRow = await ensureBalanceRow(userId);
    const currentBalance = toAmount((balanceRow as any).balance);
    if (currentBalance < amount) {
      return {
        ok: false as const,
        reason: "Not enough balance.",
      };
    }

    const now = new Date().toISOString();
    await updateBalance(userId, currentBalance - amount);

    const { data: withdrawalRow, error: withdrawalError } = await supabase
      .from("wallet_withdrawals")
      .insert({
        user_id: userId,
        username,
        amount,
        upi_id: upiId,
        status: "PENDING",
        requested_at: now,
        note: "Awaiting admin payout",
      })
      .select("*")
      .single();

    if (withdrawalError || !withdrawalRow) {
      throw new Error(withdrawalError?.message ?? "Could not create withdrawal.");
    }

    await insertLedgerTxn({
      userId,
      type: "DEBIT",
      amount,
      note: `Withdrawal request of Rs ${amount} submitted to ${upiId}`,
      createdAt: now,
    });

    request = mapWithdrawal(withdrawalRow);
  } catch (error: any) {
    return {
      ok: false as const,
      reason: String(error?.message ?? "Could not submit withdrawal request."),
    };
  }

  try {
    await pushInboxMessage(userId, {
      type: "WALLET",
      title: "Withdrawal Requested",
      message:
        `Rs ${amount} debited from wallet.\n` +
        `UPI: ${upiId}\n` +
        `Please wait for a while for admin to verify your withdrawal.`,
    });
  } catch {
    // Ignore inbox failure, withdrawal already saved.
  }

  return {
    ok: true as const,
    request,
    wallet: await getUserWallet(userId),
  };
}

export async function markWithdrawalPaid(requestIdInput: string) {
  const requestId = String(requestIdInput ?? "").trim();
  if (!requestId) {
    return { ok: false as const, reason: "Request not found." };
  }

  const { data: currentRow, error: currentError } = await supabase
    .from("wallet_withdrawals")
    .select("*")
    .eq("id", requestId)
    .maybeSingle();

  if (currentError) {
    return { ok: false as const, reason: currentError.message };
  }
  if (!currentRow) {
    return { ok: false as const, reason: "Request not found." };
  }

  const current = mapWithdrawal(currentRow);
  if (current.status === "PAID") {
    return { ok: false as const, reason: "Request already marked paid." };
  }

  const processedAt = new Date().toISOString();
  const { data: updatedRow, error: updateError } = await supabase
    .from("wallet_withdrawals")
    .update({
      status: "PAID",
      processed_at: processedAt,
    })
    .eq("id", requestId)
    .eq("status", "PENDING")
    .select("*")
    .maybeSingle();

  if (updateError) {
    return { ok: false as const, reason: updateError.message };
  }
  if (!updatedRow) {
    return { ok: false as const, reason: "Request already marked paid." };
  }

  const updated = mapWithdrawal(updatedRow);
  try {
    await pushInboxMessage(updated.userId, {
      type: "WALLET",
      title: "Withdrawal Paid",
      message: `Rs ${updated.amount} has been marked paid by admin.\nUPI: ${updated.upiId}`,
    });
  } catch {
    // Ignore inbox failure, withdrawal update already saved.
  }

  return { ok: true as const, request: updated };
}

