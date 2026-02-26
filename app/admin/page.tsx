"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { clearAdminSession } from "@/data/adminSession";
import {
  creditPrizeToUser,
  getAdminWalletOverview,
  markWithdrawalPaid,
  registerIncomingPayment,
} from "@/data/wallet";

function formatDateTime(v: string) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString();
}

export default function AdminPage() {
  const router = useRouter();

  const [txnId, setTxnId] = useState("");
  const [amount, setAmount] = useState<number>(0);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [winnerUsername, setWinnerUsername] = useState("");
  const [winnerAmount, setWinnerAmount] = useState<number>(0);
  const [winnerNote, setWinnerNote] = useState("");
  const [winnerMessage, setWinnerMessage] = useState("");
  const [refreshTick, setRefreshTick] = useState(0);
  const [overview, setOverview] = useState<Awaited<ReturnType<typeof getAdminWalletOverview>>>({
    adminTxns: [],
    pendingWithdrawals: [],
    totalUserBalance: 0,
  });

  const recentRegistered = overview.adminTxns.slice(0, 20);
  const pendingWithdrawals = overview.pendingWithdrawals;

  useEffect(() => {
    let active = true;
    (async () => {
      const next = await getAdminWalletOverview();
      if (!active) return;
      setOverview(next);
    })();

    return () => {
      active = false;
    };
  }, [refreshTick]);

  function logout() {
    clearAdminSession();
    router.replace("/admin/login");
  }

  function refreshWalletState() {
    setRefreshTick((v) => v + 1);
  }

  async function onRegisterTransaction() {
    setMessage("");
    const res = await registerIncomingPayment(txnId, Number(amount), note);
    if (!res.ok) {
      setMessage(res.reason);
      return;
    }

    setMessage(`Registered ${txnId} for Rs ${amount}.`);
    setTxnId("");
    setAmount(0);
    setNote("");
    refreshWalletState();
  }

  async function onMarkWithdrawalPaid(requestId: string) {
    setMessage("");
    const res = await markWithdrawalPaid(requestId);
    if (!res.ok) {
      setMessage(res.reason);
      return;
    }

    setMessage("Withdrawal marked as paid.");
    refreshWalletState();
  }

  async function onCreditWinnerPrize() {
    setWinnerMessage("");
    const username = winnerUsername.trim();
    if (!username) {
      setWinnerMessage("Username is required.");
      return;
    }

    const res = await creditPrizeToUser(username, Number(winnerAmount), winnerNote);
    if (!res.ok) {
      setWinnerMessage(res.reason);
      return;
    }

    setWinnerMessage(`Prize sent: Rs ${res.txn.amount} to @${res.user.username}.`);
    setWinnerUsername("");
    setWinnerAmount(0);
    setWinnerNote("");
    refreshWalletState();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>

        <button
          onClick={logout}
          className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-zinc-200 hover:bg-white/5"
        >
          Logout
        </button>
      </div>

      <p className="text-sm text-zinc-300">
        Admin area (password protected, LocalStorage session).
      </p>

      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <p className="text-sm text-zinc-200">
          Use the actions below to create tournaments and upload room credentials.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href="/admin/tournaments/new"
            className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-200"
          >
            Create Tournament
          </Link>
          <Link
            href="/admin/tournaments"
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200 hover:bg-white/10"
          >
            List Tournaments
          </Link>
        </div>
        <p className="mt-3 text-xs text-zinc-400">
          To upload room ID/password: open List Tournaments, then click Edit Room on the target tournament.
        </p>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <h2 className="text-lg font-semibold text-white">Register Incoming UPI Payment</h2>
        <p className="mt-1 text-sm text-zinc-300">
          Enter transaction ID and amount you received. Users can then claim wallet balance using the same transaction ID.
          A transaction ID can be used only once.
        </p>
        <p className="mt-2 text-sm text-zinc-300">
          Total user wallet balance: Rs {overview.totalUserBalance}
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-sm text-zinc-300">Transaction ID</label>
            <input
              value={txnId}
              onChange={(e) => setTxnId(e.target.value)}
              className="mt-2 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-zinc-100"
              placeholder="Enter transaction ID"
            />
          </div>
          <div>
            <label className="text-sm text-zinc-300">Amount (Rs)</label>
            <input
              type="number"
              value={amount}
              min={0}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="mt-2 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-zinc-100"
              placeholder="Enter amount"
            />
          </div>
        </div>

        <div className="mt-3">
          <label className="text-sm text-zinc-300">Admin note (optional)</label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="mt-2 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-zinc-100"
            placeholder="Verification note"
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onRegisterTransaction}
            className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-200"
          >
            Register Transaction
          </button>
        </div>

        {message ? <p className="mt-3 text-sm text-zinc-200">{message}</p> : null}

        <div className="mt-4">
          <h3 className="text-sm font-semibold text-white">Recent Registered Transactions</h3>
          {recentRegistered.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-400">No transactions registered yet.</p>
          ) : (
            <div className="mt-2 space-y-2">
              {recentRegistered.map((entry) => (
                <div
                  key={entry.id}
                  className="w-full rounded-lg border border-white/10 bg-black/20 p-3 text-left"
                >
                  <p className="text-sm text-white">
                    {entry.txnId} - Rs {entry.amount}
                  </p>
                  <p className="mt-1 text-xs text-zinc-400">
                    Registered: {formatDateTime(entry.registeredAt)} - Status: {entry.status}
                  </p>
                  {entry.claimedByUsername ? (
                    <p className="mt-1 text-xs text-zinc-500">
                      Claimed by: @{entry.claimedByUsername}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <h2 className="text-lg font-semibold text-white">Send Winner Prize</h2>
        <p className="mt-1 text-sm text-zinc-300">
          Use this when match results are decided outside the app. Enter winner username and prize amount.
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-sm text-zinc-300">Winner Username</label>
            <input
              value={winnerUsername}
              onChange={(e) => setWinnerUsername(e.target.value)}
              className="mt-2 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-zinc-100"
              placeholder="Enter username"
            />
          </div>
          <div>
            <label className="text-sm text-zinc-300">Prize Amount (Rs)</label>
            <input
              type="number"
              value={winnerAmount}
              min={0}
              onChange={(e) => setWinnerAmount(Number(e.target.value))}
              className="mt-2 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-zinc-100"
              placeholder="Enter amount"
            />
          </div>
        </div>

        <div className="mt-3">
          <label className="text-sm text-zinc-300">Note (optional)</label>
          <input
            value={winnerNote}
            onChange={(e) => setWinnerNote(e.target.value)}
            className="mt-2 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-zinc-100"
            placeholder="e.g. Sunday Tournament Winner Prize"
          />
        </div>

        <div className="mt-4">
          <button
            type="button"
            onClick={onCreditWinnerPrize}
            className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-200"
          >
            Send Prize
          </button>
        </div>

        {winnerMessage ? <p className="mt-3 text-sm text-zinc-200">{winnerMessage}</p> : null}
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <h2 className="text-lg font-semibold text-white">Withdrawal Requests</h2>
        <p className="mt-1 text-sm text-zinc-300">
          Users request withdrawal from wallet. Pay to their UPI and then mark as paid.
        </p>

        {pendingWithdrawals.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-400">No pending withdrawals.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {pendingWithdrawals.map((req) => (
              <div key={req.id} className="rounded-lg border border-white/10 bg-black/20 p-3">
                <p className="text-sm text-white">
                  @{req.username} ({req.upiId}) - Rs {req.amount}
                </p>
                <p className="mt-1 text-xs text-zinc-400">
                  Requested: {formatDateTime(req.requestedAt)}
                </p>
                <button
                  type="button"
                  onClick={() => onMarkWithdrawalPaid(req.id)}
                  className="mt-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-200 hover:bg-white/10"
                >
                  Mark Paid
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
