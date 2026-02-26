export const UPI_RECEIVER_ID = "9522202995@fam";

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

export type Wallet = {
  userId: string;
  balance: number;
  txns: WalletTxn[];
  withdrawals: WithdrawalRequest[];
};

export type AdminWalletOverview = {
  adminTxns: AdminTxn[];
  pendingWithdrawals: WithdrawalRequest[];
  totalUserBalance: number;
};

function defaultWallet(userId: string): Wallet {
  return { userId, balance: 0, txns: [], withdrawals: [] };
}

async function parseResponse<T>(res: Response): Promise<T> {
  let payload: any = null;
  try {
    payload = await res.json();
  } catch {
    payload = {};
  }

  if (!res.ok) {
    const message = String(payload?.error ?? `Request failed (${res.status})`);
    throw new Error(message);
  }

  return payload as T;
}

export async function getWallet(userId: string): Promise<Wallet> {
  const uid = String(userId ?? "").trim();
  if (!uid) return defaultWallet("");
  try {
    const data = await parseResponse<{ wallet: Wallet }>(
      await fetch(`/api/wallet?userId=${encodeURIComponent(uid)}`, { cache: "no-store" })
    );
    return data.wallet ?? defaultWallet(uid);
  } catch {
    return defaultWallet(uid);
  }
}

export async function claimCreditsByTxnId(
  userId: string,
  username: string,
  txnId: string
) {
  try {
    const data = await parseResponse<{ wallet: Wallet; amount: number }>(
      await fetch("/api/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "claim",
          userId,
          username,
          txnId,
        }),
      })
    );
    return { ok: true as const, wallet: data.wallet, amount: data.amount };
  } catch (error: any) {
    return { ok: false as const, reason: String(error?.message ?? "Could not claim wallet balance.") };
  }
}

export async function spendCredits(userId: string, amount: number, note: string) {
  try {
    const data = await parseResponse<{ wallet: Wallet }>(
      await fetch("/api/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "spend",
          userId,
          amount,
          note,
        }),
      })
    );
    return { ok: true as const, wallet: data.wallet };
  } catch (error: any) {
    const reason = String(error?.message ?? "Could not debit wallet balance.");
    return { ok: false as const, reason, wallet: defaultWallet(String(userId ?? "")) };
  }
}

export async function requestWithdrawal(
  userId: string,
  username: string,
  upiId: string,
  amount: number
) {
  try {
    const data = await parseResponse<{ wallet: Wallet; request: WithdrawalRequest }>(
      await fetch("/api/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "withdraw",
          userId,
          username,
          upiId,
          amount,
        }),
      })
    );
    return { ok: true as const, wallet: data.wallet, request: data.request };
  } catch (error: any) {
    return {
      ok: false as const,
      reason: String(error?.message ?? "Could not submit withdrawal request."),
    };
  }
}

export async function getAdminWalletOverview() {
  try {
    return await parseResponse<AdminWalletOverview>(
      await fetch("/api/wallet/admin", { cache: "no-store" })
    );
  } catch {
    return {
      adminTxns: [],
      pendingWithdrawals: [],
      totalUserBalance: 0,
    } satisfies AdminWalletOverview;
  }
}

export async function registerIncomingPayment(txnId: string, amount: number, note = "") {
  try {
    const data = await parseResponse<{ entry: AdminTxn }>(
      await fetch("/api/wallet/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "register-payment",
          txnId,
          amount,
          note,
        }),
      })
    );
    return { ok: true as const, entry: data.entry };
  } catch (error: any) {
    return {
      ok: false as const,
      reason: String(error?.message ?? "Could not register transaction."),
    };
  }
}

export async function markWithdrawalPaid(requestId: string) {
  try {
    const data = await parseResponse<{ request: WithdrawalRequest }>(
      await fetch("/api/wallet/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "mark-withdrawal-paid",
          requestId,
        }),
      })
    );
    return { ok: true as const, request: data.request };
  } catch (error: any) {
    return {
      ok: false as const,
      reason: String(error?.message ?? "Could not mark request as paid."),
    };
  }
}

export async function creditPrizeToUser(
  username: string,
  amount: number,
  note = ""
) {
  try {
    const data = await parseResponse<{
      user: { id: string; username: string };
      wallet: Wallet;
      txn: WalletTxn;
    }>(
      await fetch("/api/wallet/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "credit-prize",
          username,
          amount,
          note,
        }),
      })
    );
    return { ok: true as const, ...data };
  } catch (error: any) {
    return {
      ok: false as const,
      reason: String(error?.message ?? "Could not send prize amount."),
    };
  }
}
