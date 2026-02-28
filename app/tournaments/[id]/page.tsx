"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

import {
  getTournamentById,
  type Tournament,
} from "@/data/tournaments";

import {
  addBookingShared,
  type Booking,
  getUserBookingsShared,
  updateBookingTeamMembersShared,
} from "@/data/bookings";
import { getRoomInfoShared, type RoomInfo } from "@/data/rooms";
import {
  getWallet,
  claimCreditsByTxnId,
  requestWithdrawal,
  UPI_RECEIVER_ID,
} from "@/data/wallet";
import {
  getUserSession,
  onUserSessionChange,
  type AuthUser,
} from "@/data/userSession";

/**
 * ✅ IMPORTANT:
 * Some earlier code versions accidentally used `dataTime` instead of `dateTime`.
 * This helper reads whichever exists without breaking TypeScript.
 */
function getTournamentStart(t: Tournament): string {
  const anyT = t as any;
  return (
    anyT.dateTime ??
    anyT.dataTime ??
    anyT.startTime ??
    anyT.start ??
    ""
  );
}

function formatDateTime(v: string) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMoney(v: number) {
  return `Rs ${Number(v || 0).toLocaleString("en-IN")}`;
}

function getDefaultFormatInfo(t: Tournament) {
  if (t.matchType === "CS") {
    const slots = Number((t as any).maxSlots ?? 0);
    if (slots === 2) return "cs - body";
    if (slots > 2) return "cs - tournament";
    return "Clash Squad custom room format.";
  }
  if (t.brMode === "SQUAD") {
    return "BR Squad: 12 teams, 4 players per team.";
  }
  if (t.brMode === "DUO") {
    return "BR Duo: 26 teams, 2 players per team.";
  }
  return "BR Solo: 48 players.";
}

function getDefaultRules(t: Tournament) {
  if (t.matchType === "CS") {
    return [
      "Use only your registered in-game name.",
      "Be present in room before match start.",
      "Follow fair-play. No hacks or exploits.",
      "Admin decision is final in disputes.",
    ];
  }
  return [
    "Register with your exact in-game name.",
    "Join room on time; late join may be disqualified.",
    "No teaming, hacks, or unfair play.",
    "Admin decision is final for all match results.",
  ];
}

const BR_PRIZE_OPTIONS: Array<{ key: "PER_KILL" | "BOOYAH" | "BOTH"; label: string }> = [
  { key: "PER_KILL", label: "Per Kill" },
  { key: "BOOYAH", label: "Booyah" },
  { key: "BOTH", label: "Both" },
];

function computeStatus(t: Tournament): Tournament["status"] {
  const bookedCount = (t as any).bookedCount ?? 0;
  const maxSlots = (t as any).maxSlots ?? 0;

  if (t.status === "COMPLETED") return "COMPLETED";
  if (maxSlots > 0 && bookedCount >= maxSlots) return "FULL";
  return "OPEN";
}

function StatusBadge({ status }: { status: Tournament["status"] }) {
  const base =
    "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium";

  if (status === "OPEN")
    return (
      <span className={`${base} border-emerald-500/30 bg-emerald-500/10 text-emerald-200`}>
        OPEN
      </span>
    );

  if (status === "FULL")
    return (
      <span className={`${base} border-amber-500/30 bg-amber-500/10 text-amber-200`}>
        FULL
      </span>
    );

  return (
    <span className={`${base} border-zinc-500/30 bg-zinc-500/10 text-zinc-200`}>
      COMPLETED
    </span>
  );
}

/**
 * Room details storage:
 * Admin side usually stores room info in LocalStorage.
 * We read it here by tournamentId.
 *
 * If your rooms.ts uses a different key format, tell me and I’ll align it.
 */
function WalletHubPage({ authUser }: { authUser: AuthUser }) {
  const [txnId, setTxnId] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | null>(null);
  const [showWithdrawPanel, setShowWithdrawPanel] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawUpi, setWithdrawUpi] = useState("");
  const [withdrawMsg, setWithdrawMsg] = useState("");
  const [withdrawType, setWithdrawType] = useState<"success" | "error" | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [wallet, setWallet] = useState<Awaited<ReturnType<typeof getWallet>>>({
    userId: authUser.id,
    balance: 0,
    txns: [],
    withdrawals: [],
  });

  function refresh() {
    setRefreshTick((v) => v + 1);
  }

  useEffect(() => {
    let active = true;
    (async () => {
      const next = await getWallet(authUser.id);
      if (!active) return;
      setWallet(next);
    })();

    return () => {
      active = false;
    };
  }, [authUser.id, refreshTick]);

  async function onSubmitTxn() {
    setMessage("");
    setMessageType(null);
    const res = await claimCreditsByTxnId(authUser.id, authUser.username, txnId);
    if (!res.ok) {
      setMessage(res.reason);
      setMessageType("error");
      return;
    }
    setTxnId("");
    setWallet(res.wallet);
    setMessage(`${formatMoney(res.amount)} added to wallet.`);
    setMessageType("success");
    refresh();
  }

  async function onRequestWithdrawal() {
    setWithdrawMsg("");
    setWithdrawType(null);
    const amount = Number(withdrawAmount);
    if (!Number.isFinite(amount) || amount < 200) {
      setWithdrawMsg("Minimum withdrawal is Rs 200.");
      setWithdrawType("error");
      return;
    }
    if (amount > wallet.balance) {
      setWithdrawMsg("Not enough balance.");
      setWithdrawType("error");
      return;
    }

    const res = await requestWithdrawal(authUser.id, authUser.username, withdrawUpi, amount);
    if (!res.ok) {
      setWithdrawMsg(res.reason);
      setWithdrawType("error");
      return;
    }
    setWallet(res.wallet);
    setWithdrawMsg(
      `Withdrawal request submitted for ${formatMoney(amount)}. Amount debited from wallet.`
    );
    setWithdrawType("success");
    setWithdrawAmount("");
    setWithdrawUpi("");
    refresh();
  }

  return (
    <div className="mx-auto max-w-3xl px-3 py-6 text-zinc-100 sm:px-4 sm:py-8">
      <div className="flex items-center justify-between gap-3">
        <Link href="/" className="text-sm text-zinc-300 hover:text-white">
          Back to tournaments
        </Link>
        <button
          type="button"
          onClick={() => setShowWithdrawPanel((v) => !v)}
          className="rounded-lg border border-emerald-400/35 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/25"
        >
          {showWithdrawPanel ? "Close" : "Withdraw"}
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:gap-4">
        <div className="rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/15 to-cyan-500/10 p-4">
          <p className="text-xs uppercase tracking-wider text-emerald-100/80">Wallet Balance</p>
          <p className="mt-1 text-3xl font-bold text-white">{formatMoney(wallet.balance)}</p>
          <p className="mt-1 text-xs text-emerald-100/80">All balances are in Rs (INR).</p>
        </div>

        {showWithdrawPanel ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <h2 className="text-lg font-semibold text-white">Withdraw</h2>
            <p className="mt-1 text-sm text-zinc-300">
              Minimum withdrawal is Rs 200. Enter amount and UPI ID to submit request.
            </p>

            <div className="mt-3 grid gap-2 sm:grid-cols-[180px_1fr_auto] sm:items-end">
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-amber-200/90">
                  Amount (Rs)
                </span>
                <input
                  type="number"
                  min={200}
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  placeholder="Min 200"
                  className="w-full rounded-lg border border-amber-400/45 bg-amber-500/10 px-3 py-2 text-zinc-100 placeholder:text-amber-100/55 focus:border-amber-300/80 focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-cyan-200/90">
                  UPI ID
                </span>
                <input
                  value={withdrawUpi}
                  onChange={(e) => setWithdrawUpi(e.target.value)}
                  placeholder="example@bank"
                  className="w-full rounded-lg border border-cyan-400/45 bg-cyan-500/10 px-3 py-2 text-zinc-100 placeholder:text-cyan-100/55 focus:border-cyan-300/80 focus:outline-none"
                />
              </label>
              <button
                type="button"
                onClick={onRequestWithdrawal}
                className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-zinc-200 hover:bg-white/10 sm:h-[42px]"
              >
                Request
              </button>
            </div>

            {withdrawMsg ? (
              <p
                className={`mt-2 rounded-md border px-3 py-2 text-sm ${
                  withdrawType === "error"
                    ? "border-red-500/30 bg-red-500/10 text-red-200"
                    : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                }`}
              >
                {withdrawMsg}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <h1 className="text-xl font-semibold text-white">Top-up Wallet</h1>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-white/15 bg-black/20 px-3 py-1 text-zinc-200">1. Pay UPI</span>
            <span className="rounded-full border border-white/15 bg-black/20 px-3 py-1 text-zinc-200">2. Paste Txn ID</span>
            <span className="rounded-full border border-white/15 bg-black/20 px-3 py-1 text-zinc-200">3. Claim Rs</span>
          </div>
          <div className="mt-3 rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-3">
            <p className="text-xs text-cyan-100/90">UPI ID</p>
            <p className="text-sm font-semibold text-cyan-50">{UPI_RECEIVER_ID}</p>
          </div>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              value={txnId}
              onChange={(e) => setTxnId(e.target.value)}
              placeholder="Paste transaction ID"
              className="w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-zinc-100 placeholder:text-zinc-500"
            />
            <button
              type="button"
              onClick={onSubmitTxn}
              className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-200"
            >
              Claim Rs
            </button>
          </div>
          <p className="mt-2 text-xs text-zinc-400">Admin must register this transaction first.</p>
          {message ? (
            <p
              className={`mt-2 rounded-md border px-3 py-2 text-sm ${
                messageType === "error"
                  ? "border-red-500/30 bg-red-500/10 text-red-200"
                  : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
              }`}
            >
              {message}
            </p>
          ) : null}
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <h2 className="text-lg font-semibold text-white">Wallet History</h2>
          <p className="mt-1 text-sm text-zinc-300">
            Open a separate page to view all wallet entries.
          </p>
          <Link
            href="/tournaments/wallet-history"
            className="mt-3 inline-flex rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-200 hover:bg-white/10"
          >
            View Wallet History
          </Link>
        </div>
      </div>
    </div>
  );
}

function WalletHistoryPage({ authUser }: { authUser: AuthUser }) {
  const [refreshTick, setRefreshTick] = useState(0);
  const [wallet, setWallet] = useState<Awaited<ReturnType<typeof getWallet>>>({
    userId: authUser.id,
    balance: 0,
    txns: [],
    withdrawals: [],
  });

  function refresh() {
    setRefreshTick((v) => v + 1);
  }

  useEffect(() => {
    let active = true;
    (async () => {
      const next = await getWallet(authUser.id);
      if (!active) return;
      setWallet(next);
    })();

    return () => {
      active = false;
    };
  }, [authUser.id, refreshTick]);

  return (
    <div className="mx-auto max-w-3xl px-3 py-6 text-zinc-100 sm:px-4 sm:py-8">
      <Link href="/tournaments/wallet" className="text-sm text-zinc-300 hover:text-white">
        Back to wallet
      </Link>

      <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-white">Wallet History</h1>
            <p className="mt-1 text-xs text-zinc-400">{wallet.txns.length} entries</p>
          </div>
          <button
            type="button"
            onClick={refresh}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-200 hover:bg-white/10"
          >
            Refresh
          </button>
        </div>

        {wallet.txns.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-400">No wallet transactions yet.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {wallet.txns.map((txn) => (
              <div key={txn.id} className="rounded-lg border border-white/10 bg-zinc-950/50 p-3">
                <p
                  className={`text-sm font-semibold ${
                    txn.type === "CREDIT" ? "text-emerald-200" : "text-amber-200"
                  }`}
                >
                  {txn.type === "CREDIT" ? "Added" : "Debited"} - {formatMoney(txn.amount)}
                </p>
                <p className="mt-1 text-xs text-zinc-300">{txn.note}</p>
                <p className="mt-1 text-xs text-zinc-400">{formatDateTime(txn.createdAt)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AuthRequiredCard({ title, message }: { title: string; message: string }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 text-zinc-100">
      <div className="rounded-xl border border-white/10 bg-white/5 p-6">
        <h1 className="text-xl font-semibold text-white">{title}</h1>
        <p className="mt-2 text-sm text-zinc-300">{message}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/auth"
            className="rounded-lg border border-orange-400/45 bg-orange-500/20 px-3 py-2 text-sm font-semibold text-orange-100 hover:bg-orange-500/30"
          >
            Login / Sign Up
          </Link>
          <Link
            href="/"
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200 hover:bg-white/10"
          >
            Back to tournaments
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function TournamentDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const tournamentId = params?.id;
  const showBookingStep = searchParams.get("step") === "book";
  const isWalletRoute = tournamentId === "wallet";
  const isWalletHistoryRoute = tournamentId === "wallet-history";
  const isWalletFlowRoute = isWalletRoute || isWalletHistoryRoute;
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const [loading, setLoading] = useState(true);
  const [tournament, setTournament] = useState<Tournament | null>(null);

  const [teamNames, setTeamNames] = useState<string[]>([""]);
  const [wallet, setWallet] = useState(0);
  const topBackLinkRef = useRef<HTMLAnchorElement | null>(null);

  const [myBooking, setMyBooking] = useState<Booking | null>(null);
  const [myBookings, setMyBookings] = useState<Booking[]>([]);
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [roomAccessAllowed, setRoomAccessAllowed] = useState(false);

  const [error, setError] = useState<string>("");
  const [roomCopyMsg, setRoomCopyMsg] = useState("");
  const [teamSaveMsg, setTeamSaveMsg] = useState("");
  const [teamSaveType, setTeamSaveType] = useState<"success" | "error" | null>(null);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [bookingBusy, setBookingBusy] = useState(false);

  function scrollPastNavTabs() {
    const tabs = document.querySelector<HTMLElement>("[data-cz-nav-tabs]");
    if (!tabs) return false;
    const targetY = Math.max(0, window.scrollY + tabs.getBoundingClientRect().bottom + 1);
    window.scrollTo(0, targetY);
    return true;
  }

  useEffect(() => {
    const sync = () => {
      setAuthUser(getUserSession());
      setAuthReady(true);
    };

    sync();
    return onUserSessionChange(sync);
  }, []);

  useEffect(() => {
    if (!tournamentId || isWalletFlowRoute || loading) return;

    const frame = window.requestAnimationFrame(() => {
      const hasBookedFromAccount = myBookings.length > 0 || roomAccessAllowed;
      const roomReady = roomAccessAllowed && Boolean(room?.roomId || room?.roomPassword);
      if (hasBookedFromAccount && roomReady) {
        if (scrollPastNavTabs()) return;
      }

      if (topBackLinkRef.current) {
        topBackLinkRef.current.scrollIntoView({ block: "start" });
      } else {
        window.scrollTo(0, 0);
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [tournamentId, showBookingStep, isWalletFlowRoute, loading]);

  useEffect(() => {
    setShowRulesModal(false);
  }, [tournamentId, showBookingStep, isWalletFlowRoute]);

  // ✅ Load everything once per tournamentId (prevents flicker loops)
  useEffect(() => {
    if (!tournamentId || isWalletFlowRoute) return;

    let active = true;
    setLoading(true);
    setError("");
    setMyBooking(null);
    setMyBookings([]);
    setTeamSaveMsg("");
    setTeamSaveType(null);
    setRoom(null);
    setRoomAccessAllowed(false);

    (async () => {
      const t = await getTournamentById(tournamentId);
      if (!active) return;
      setTournament(t ?? null);

      let nextWallet = 0;
      if (authUser) {
        const w = await getWallet(authUser.id);
        if (!active) return;
        nextWallet = w.balance;
      }

      if (!active) return;
      setWallet(nextWallet);
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [tournamentId, isWalletFlowRoute, authUser]);

  // ✅ Re-check booking when user types name (only when name is valid)
  useEffect(() => {
    if (!tournamentId || isWalletFlowRoute) return;

    if (!authUser) {
      setMyBooking(null);
      setMyBookings([]);
      return;
    }

    let active = true;

    (async () => {
      const mine = await getUserBookingsShared(
        tournamentId,
        authUser.id,
        authUser.username
      );
      if (!active) return;
      const existing = mine[0] ?? null;
      setMyBookings(mine);
      setMyBooking(existing ?? null);
      if (existing) {
        setTeamNames((prev) => {
          const base = [...prev];
          const members = Array.isArray(existing.teamMembers) ? existing.teamMembers : [existing.playerName];
          const targetSize = Math.max(1, base.length);
          const next = base.slice(0, targetSize);
          for (let i = 0; i < Math.min(targetSize, members.length); i += 1) {
            next[i] = members[i] ?? "";
          }
          return next;
        });
      }
    })();

    return () => {
      active = false;
    };
  }, [tournamentId, isWalletFlowRoute, authUser]);

  useEffect(() => {
    if (!tournamentId || isWalletFlowRoute) return;

    let active = true;
    const loadRoom = async () => {
      if (!authUser?.id) {
        if (active) {
          setRoom(null);
          setRoomAccessAllowed(false);
        }
        return;
      }

      const data = await getRoomInfoShared(tournamentId, {
        userId: authUser.id,
        username: authUser.username,
      });
      if (!active) return;
      setRoom(data.room ?? null);
      setRoomAccessAllowed(Boolean(data.access));

      const roomReady = Boolean(data.access) && Boolean(data.room?.roomId || data.room?.roomPassword);
      if (roomReady) {
        window.requestAnimationFrame(() => {
          if (!active) return;
          scrollPastNavTabs();
        });
      }
    };

    loadRoom();
    const timer = window.setInterval(loadRoom, 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [tournamentId, isWalletFlowRoute, authUser]);

  const status = useMemo(() => {
    if (!tournament) return "OPEN" as Tournament["status"];
    return computeStatus(tournament);
  }, [tournament]);

  const bookedCount = useMemo(() => {
    if (!tournament) return 0;
    return (tournament as any).bookedCount ?? 0;
  }, [tournament]);

  const maxSlots = useMemo(() => {
    if (!tournament) return 0;
    return (tournament as any).maxSlots ?? 0;
  }, [tournament]);

  const slotsLeft = useMemo(() => {
    if (!tournament) return 0;
    return Math.max(0, maxSlots - bookedCount);
  }, [bookedCount, maxSlots, tournament]);

  const teamSize = useMemo(() => {
    if (!tournament) return 1;
    if (tournament.matchType === "BR") {
      if (tournament.brMode === "DUO") return 2;
      if (tournament.brMode === "SQUAD") return 4;
      return 1;
    }
    return 1;
  }, [tournament]);

  const booked = myBookings.length > 0;
  const hasAccountBooking = booked || roomAccessAllowed;
  const mySlotNumber = myBooking?.slotNumber ?? null;
  const myBookedSlotsLabel = myBookings.map((b) => `#${b.slotNumber}`).join(", ");
  const myBookedSlotsCountLabel = booked ? String(myBookings.length) : mySlotNumber ? "1" : "-";
  const myBookedSlotsDisplayLabel = myBookedSlotsLabel || (mySlotNumber ? `#${mySlotNumber}` : "-");
  const teamNamesFilled = teamNames.map((n) => n.trim()).filter(Boolean);

  useEffect(() => {
    setTeamNames((prev) => {
      const next = [...prev];
      while (next.length < teamSize) next.push("");
      return next.slice(0, teamSize);
    });
  }, [teamSize]);

  async function refreshWallet() {
    if (!authUser) {
      setWallet(0);
      return;
    }
    const w = await getWallet(authUser.id);
    setWallet(w.balance);
  }

  async function refreshTournament() {
    if (!tournamentId || isWalletFlowRoute) return;
    const t = await getTournamentById(tournamentId);
    setTournament(t ?? null);
  }

  async function onBookSlot() {
    if (bookingBusy) return;
    setError("");
    setTeamSaveMsg("");
    setTeamSaveType(null);

    if (!tournamentId || !tournament) return;
    if (Boolean((tournament as any).roomPublished)) {
      setError("Booking is closed because Room ID and Password are already published.");
      return;
    }
    if (!authUser) {
      setError("Please login first to book a slot.");
      return;
    }

    const members = teamNames.map((n) => n.trim()).filter(Boolean);
    const captainName = members[0] ?? "";
    if (!captainName) {
      setError("Please enter at least one in-game name.");
      return;
    }

    // prevent overbooking
    if (status !== "OPEN" || slotsLeft <= 0) {
      setError("This tournament is full.");
      return;
    }

    const fee = Number((tournament as any).entryFee ?? 0);
    if (fee > 0 && wallet < fee) {
      setError("Not enough wallet balance.");
      return;
    }

    setBookingBusy(true);
    try {
      const result = await addBookingShared(
        tournamentId,
        authUser.id,
        captainName,
        members,
        teamSize,
        authUser.username
      );
      if (!result.ok) {
        setError(result.reason || "Booking failed.");
        if (result.booking) {
          setMyBooking(result.booking);
        }
        return;
      }
      const booking = result.booking;

      // refresh state
      await refreshWallet();
      await refreshTournament();
      const mine = await getUserBookingsShared(
        tournamentId,
        authUser.id,
        authUser.username
      );
      setMyBookings(mine);
      setMyBooking(mine[0] ?? booking ?? null);
      setTeamNames(Array.from({ length: teamSize }, () => ""));
      const roomData = await getRoomInfoShared(tournamentId, {
        userId: authUser.id,
        username: authUser.username,
      });
      setRoom(roomData.room ?? null);
      setRoomAccessAllowed(Boolean(roomData.access));
    } catch (e: any) {
      setError(e?.message || "Booking failed. Try again.");
    } finally {
      setBookingBusy(false);
    }
  }

  async function onSaveTeamMembers() {
    setTeamSaveMsg("");
    setTeamSaveType(null);

    if (!tournamentId || !myBooking || !tournament) return;

    const startMs = new Date(getTournamentStart(tournament)).getTime();
    const hasValidStart = Number.isFinite(startMs);
    const cutoffMs = hasValidStart ? startMs - 60 * 60 * 1000 : Number.NaN;
    if (hasValidStart && Date.now() > cutoffMs) {
      setTeamSaveMsg("Team names can only be updated up to 1 hour before start.");
      setTeamSaveType("error");
      return;
    }

    const members = teamNames.map((n) => n.trim()).filter(Boolean);
    if (members.length === 0) {
      setTeamSaveMsg("Please enter at least one in-game name.");
      setTeamSaveType("error");
      return;
    }

    if (!authUser) {
      setTeamSaveMsg("Please login first.");
      setTeamSaveType("error");
      return;
    }

    const res = await updateBookingTeamMembersShared(
      tournamentId,
      authUser.id,
      myBooking.id,
      members
    );
    if (!res.ok) {
      setTeamSaveMsg(res.reason || "Could not save names.");
      setTeamSaveType("error");
      return;
    }

    setMyBooking(res.booking ?? myBooking);
    setTeamSaveMsg("Team names updated.");
    setTeamSaveType("success");
  }

  async function copyRoomField(value: string, label: string) {
    const clean = String(value ?? "").trim();
    if (!clean) return;
    try {
      await navigator.clipboard.writeText(clean);
      setRoomCopyMsg(`${label} copied.`);
    } catch {
      setRoomCopyMsg(`Could not copy ${label.toLowerCase()}.`);
    }
  }

  const roomDetailsAvailable = roomAccessAllowed && Boolean(room?.roomId || room?.roomPassword);
  const roomDetailsPanel = (
    <div
      className={`rounded-xl border p-4 ${
        roomDetailsAvailable
          ? "border-orange-400/40 bg-gradient-to-br from-orange-500/20 via-amber-500/15 to-red-500/10"
          : "border-white/10 bg-white/5"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-white">Room Details</h2>
        {roomDetailsAvailable ? (
          <span className="rounded-full border border-orange-300/50 bg-orange-500/20 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-orange-50">
            JOIN QUICKLY
          </span>
        ) : null}
      </div>
      <p className={`mt-1 text-xs ${roomDetailsAvailable ? "text-orange-100/85" : "text-zinc-400"}`}>
        Status auto-refreshes every 5 seconds.
      </p>

      {!authUser ? (
        <p className="mt-2 text-sm text-zinc-300">
          Login to access room details after booking.
        </p>
      ) : !hasAccountBooking ? (
        <p className="mt-2 text-sm text-zinc-300">
          Book at least one slot from this account to unlock Room ID and Password.
        </p>
      ) : !roomAccessAllowed ? (
        <p className="mt-2 text-sm text-zinc-300">
          Checking room access...
        </p>
      ) : !room || (!room.roomId && !room.roomPassword) ? (
        <p className="mt-2 text-sm text-zinc-300">
          Room details are not added yet by admin. Refresh in a few seconds.
        </p>
      ) : (
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div className="rounded-lg border border-orange-300/35 bg-black/20 p-3">
            <p className="text-[11px] uppercase tracking-wide text-orange-100/85">Room ID</p>
            <p className="mt-1 break-all text-lg font-bold text-white">{room.roomId || "-"}</p>
            <button
              type="button"
              onClick={() => copyRoomField(room.roomId || "", "Room ID")}
              className="mt-2 rounded-md border border-orange-300/40 bg-orange-500/15 px-2.5 py-1 text-[11px] font-semibold text-orange-50 hover:bg-orange-500/25"
            >
              Copy Room ID
            </button>
          </div>
          <div className="rounded-lg border border-orange-300/35 bg-black/20 p-3">
            <p className="text-[11px] uppercase tracking-wide text-orange-100/85">Password</p>
            <p className="mt-1 break-all text-lg font-bold text-white">{room.roomPassword || "-"}</p>
            <button
              type="button"
              onClick={() => copyRoomField(room.roomPassword || "", "Password")}
              className="mt-2 rounded-md border border-orange-300/40 bg-orange-500/15 px-2.5 py-1 text-[11px] font-semibold text-orange-50 hover:bg-orange-500/25"
            >
              Copy Password
            </button>
          </div>
          {roomCopyMsg ? <p className="sm:col-span-2 text-xs text-emerald-200">{roomCopyMsg}</p> : null}
        </div>
      )}
    </div>
  );

  if (isWalletFlowRoute && !authReady) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 text-zinc-200">
        Loading...
      </div>
    );
  }

  if (isWalletRoute) {
    if (!authUser) {
      return (
        <AuthRequiredCard
          title="Wallet Login Required"
          message="Please login or create an account to access wallet features."
        />
      );
    }
    return <WalletHubPage authUser={authUser} />;
  }
  if (isWalletHistoryRoute) {
    if (!authUser) {
      return (
        <AuthRequiredCard
          title="Wallet History Login Required"
          message="Please login or create an account to view wallet history."
        />
      );
    }
    return <WalletHistoryPage authUser={authUser} />;
  }
  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 text-zinc-200">
        Loading...
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 text-zinc-200">
        <div className="rounded-xl border border-white/10 bg-white/5 p-6">
          <p className="text-lg font-semibold">Tournament not found</p>
          <p className="mt-2 text-sm text-zinc-300">
            This tournament may have been deleted from LocalStorage.
          </p>
          <Link
            href="/"
            className="mt-4 inline-block rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
          >
            Back to tournaments
          </Link>
        </div>
      </div>
    );
  }

  const start = getTournamentStart(tournament);
  const startMs = new Date(start).getTime();
  const hasValidStartTime = Number.isFinite(startMs);
  const teamUpdateCutoffMs = hasValidStartTime ? startMs - 60 * 60 * 1000 : Number.NaN;
  const canEditTeamNames = booked && teamSize > 1 && (!hasValidStartTime || Date.now() <= teamUpdateCutoffMs);
  const teamMissingCount = Math.max(0, teamSize - teamNamesFilled.length);
  const formatInfo =
    tournament.matchType === "CS"
      ? getDefaultFormatInfo(tournament)
      : (tournament.formatInfo ?? "").trim() || getDefaultFormatInfo(tournament);
  const winningPrize = Number((tournament as any).winningPrize ?? tournament.prizePool ?? 0);
  const perKillPrize = Number((tournament as any).perKillPrize ?? 0);
  const rulesList = (tournament.rules ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const rulesToShow = rulesList.length > 0 ? rulesList : getDefaultRules(tournament);
  const brPrizeType =
    tournament.matchType === "BR"
      ? (String(tournament.brPrizeType ?? "BOTH") as "PER_KILL" | "BOOYAH" | "BOTH")
      : null;
  const roomPublished = Boolean((tournament as any).roomPublished);
  const isCaseThree = hasAccountBooking && roomDetailsAvailable;
  const bookPageHref = `/tournaments/${tournament.id}?step=book`;
  const bookActionHref = authUser ? bookPageHref : "/auth";
  const entryFee = Number((tournament as any).entryFee ?? 0);
  const entryLineLabel = tournament.matchType === "CS" ? "Entry Fee" : "Entry";
  const entryFeeSuffix =
    tournament.matchType === "CS"
      ? " (per squad)"
      : tournament.brMode === "DUO"
        ? " (per duo)"
        : tournament.brMode === "SQUAD"
          ? " (per squad)"
          : "";
  const mySlotsSummaryCard = hasAccountBooking ? (
    <div className="rounded-xl border border-emerald-400/40 bg-emerald-500/15 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-100/85">
        Your Booking
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg border border-emerald-300/30 bg-black/20 px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-emerald-100/70">
            Slots Booked
          </p>
          <p className="mt-1 text-lg font-semibold text-emerald-50">{myBookedSlotsCountLabel}</p>
        </div>
        <div className="rounded-lg border border-emerald-300/30 bg-black/20 px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-emerald-100/70">
            Your Slots
          </p>
          <p className="mt-1 text-sm font-semibold text-emerald-50">{myBookedSlotsDisplayLabel}</p>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div
      className={`mx-auto max-w-3xl px-4 pb-10 text-zinc-100 ${
        isCaseThree ? "pt-1 sm:pt-1" : "pt-2 sm:pt-3"
      }`}
    >
      {!isCaseThree ? (
        <Link
          ref={topBackLinkRef}
          href="/"
          className="text-sm text-zinc-300 hover:text-white"
        >
          {"\u2190"} Back to tournaments
        </Link>
      ) : null}

      <div
        className={`${isCaseThree ? "mt-2" : "mt-6"} rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-6`}
      >
        {hasAccountBooking ? (
          <div className="flex items-center justify-between gap-3">
            {isCaseThree ? (
              <Link href="/" className="text-sm text-zinc-300 hover:text-white">
                {"\u2190"} Back to tournaments
              </Link>
            ) : (
              <StatusBadge status={status} />
            )}
            <button
              type="button"
              onClick={() => setShowRulesModal(true)}
              className="inline-flex whitespace-nowrap rounded-lg border border-orange-400/45 bg-orange-500/20 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-orange-100 hover:bg-orange-500/30"
            >
              Read Rules
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
            <div className="min-w-0">
              <p className="text-xs text-zinc-400">{(tournament as any).game ?? "Game"}</p>
              <h1 className="mt-1 text-2xl font-semibold leading-tight">
                {(tournament as any).name ?? "Tournament"}
              </h1>

              <div className="mt-4 space-y-1 text-sm text-zinc-300">
                <div>Start: <span className="text-white">{formatDateTime(start)}</span></div>
                <div>
                  {entryLineLabel}:{" "}
                  <span className="text-white">
                    {entryFee} Rs{entryFeeSuffix}
                  </span>
                </div>
                <div>
                  Slots:{" "}
                  <span className="text-white">
                    {bookedCount} / {maxSlots}
                  </span>{" "}
                  <span className="text-zinc-400">({slotsLeft} left)</span>
                </div>
              </div>
            </div>

            <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:flex-col sm:items-end sm:text-right">
              <StatusBadge status={status} />
              <button
                type="button"
                onClick={() => setShowRulesModal(true)}
                className="inline-flex whitespace-nowrap rounded-lg border border-orange-400/45 bg-orange-500/20 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-orange-100 hover:bg-orange-500/30"
              >
                Read Rules
              </button>
            </div>
          </div>
        )}

        {!showBookingStep ? (
          <div className="mt-6 space-y-4 pb-20 sm:pb-0">
            {hasAccountBooking && roomDetailsAvailable ? (
              <div className="cz-urgent-card">{roomDetailsPanel}</div>
            ) : null}

            {mySlotsSummaryCard}

            {tournament.matchType === "BR" ? (
              <>
                {brPrizeType === "BOOYAH" || brPrizeType === "BOTH" ? (
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-wide text-zinc-400">Booyah Prize</p>
                    <p className="mt-1 text-lg font-semibold text-emerald-200">
                      {winningPrize > 0 ? formatMoney(winningPrize) : "To be announced"}
                    </p>
                  </div>
                ) : null}

                {brPrizeType === "PER_KILL" || brPrizeType === "BOTH" ? (
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-wide text-zinc-400">Per Kill Prize</p>
                    <p className="mt-1 text-lg font-semibold text-emerald-200">
                      {perKillPrize > 0 ? formatMoney(perKillPrize) : "To be announced"}
                    </p>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-wide text-zinc-400">Winning Prize</p>
                <p className="mt-1 text-lg font-semibold text-emerald-200">
                  {winningPrize > 0 ? formatMoney(winningPrize) : "To be announced"}
                </p>
              </div>
            )}

            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-wide text-zinc-400">Format</p>
              <p className="mt-1 text-sm text-zinc-100">{formatInfo}</p>
            </div>

            {brPrizeType ? (
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-wide text-zinc-400">Prize Type</p>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {BR_PRIZE_OPTIONS.map((opt) => (
                    <div
                      key={opt.key}
                      className={`rounded-lg border px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wide ${
                        brPrizeType === opt.key
                          ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-100"
                          : "border-white/10 bg-black/20 text-zinc-300"
                      }`}
                    >
                      {opt.label}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {!roomPublished ? (
              <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+0.5rem)] z-20 -mx-1 rounded-xl bg-gradient-to-t from-[#090a10]/95 via-[#090a10]/80 to-transparent p-1 sm:static sm:mx-0 sm:bg-none sm:p-0">
                {status === "OPEN" && slotsLeft > 0 ? (
                  <Link
                    href={bookActionHref}
                    className="flex w-full items-center justify-center rounded-xl border border-orange-400/40 bg-orange-500/25 px-4 py-4 text-base font-bold uppercase tracking-wide text-orange-50 hover:bg-orange-500/35"
                  >
                    {authUser ? (hasAccountBooking ? "BOOK AGAIN" : "BOOK SLOT") : "Login to Book"}
                  </Link>
                ) : (
                  <div className="rounded-xl border border-amber-500/40 bg-amber-500/15 px-4 py-4 text-center text-sm font-semibold text-amber-100">
                    Slots are currently full
                  </div>
                )}
              </div>
            ) : null}
          </div>
        ) : (
          <>
        <div className="mt-6 flex justify-end">
          <Link
            href={`/tournaments/${tournament.id}`}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-200 hover:bg-white/10"
          >
            View Match Info
          </Link>
        </div>

        {hasAccountBooking && roomDetailsAvailable ? (
          <div className="mt-4 cz-urgent-card">{roomDetailsPanel}</div>
        ) : null}
        {/* Booking */}
        <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4">
          <h2 className="text-lg font-semibold text-white">Book a slot</h2>
          {!authUser ? (
            <div className="mt-3 rounded-lg border border-orange-500/35 bg-orange-500/15 p-3 text-sm text-orange-100">
              Login required to book a slot.
              <Link
                href="/auth"
                className="ml-2 inline-flex rounded-md border border-orange-400/45 bg-orange-500/20 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-orange-50 hover:bg-orange-500/30"
              >
                Login
              </Link>
            </div>
          ) : null}

          {mySlotsSummaryCard}

          <div className="mt-4 space-y-2">
            <label className="block text-sm text-zinc-300">
              {teamSize === 1 ? "Player Name" : `Team Members (${teamSize})`}
            </label>
            {Array.from({ length: teamSize }).map((_, idx) => (
              <input
                key={`member-${idx}`}
                value={teamNames[idx] ?? ""}
                onChange={(e) =>
                  setTeamNames((prev) => {
                    const next = [...prev];
                    while (next.length < teamSize) next.push("");
                    next[idx] = e.target.value;
                    return next.slice(0, teamSize);
                  })
                }
                disabled={!authUser}
                placeholder={`In-game name ${idx + 1}${idx === 0 ? " (captain)" : ""}`}
                className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-white/20 disabled:cursor-not-allowed disabled:opacity-60"
              />
            ))}
          </div>

          {tournament.matchType === "CS" || teamSize > 1 ? (
            <p className="mt-2 text-xs text-zinc-400">
              {tournament.matchType === "CS"
                ? "Entry fee is per squad for CS matches."
                : tournament.brMode === "DUO"
                  ? "Entry fee is per duo. You can book with fewer names now and fill remaining names later (up to 1 hour before start)."
                  : "Entry fee is per squad. You can book with fewer names now and fill remaining names later (up to 1 hour before start)."}
            </p>
          ) : null}

          <div className="mt-3 flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-3 py-2">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-zinc-400">Wallet Balance</p>
              <p className="text-sm font-semibold text-white">{formatMoney(wallet)}</p>
            </div>
            <Link
              href={authUser ? "/tournaments/wallet" : "/auth"}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-200 hover:bg-white/10"
            >
              {authUser ? "Add Money" : "Login"}
            </Link>
          </div>

          {error ? (
            <p className="mt-2 text-sm text-red-300">{error}</p>
          ) : null}

          {booked && teamSize > 1 ? (
            <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3 text-xs text-zinc-300">
              {teamMissingCount > 0 ? (
                <p>{teamMissingCount} member(s) still missing for this team slot.</p>
              ) : (
                <p>All team member names are filled.</p>
              )}
              {hasValidStartTime ? (
                <p className="mt-1 text-zinc-400">
                  Team edit cutoff: {formatDateTime(new Date(teamUpdateCutoffMs).toISOString())}
                </p>
              ) : null}
              {teamSaveMsg ? (
                <p
                  className={`mt-2 ${
                    teamSaveType === "error" ? "text-red-300" : "text-emerald-300"
                  }`}
                >
                  {teamSaveMsg}
                </p>
              ) : null}
              <button
                type="button"
                onClick={onSaveTeamMembers}
                disabled={!canEditTeamNames}
                className="mt-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Save Team Names
              </button>
            </div>
          ) : null}

          {!roomPublished ? (
            <button
              onClick={onBookSlot}
              disabled={bookingBusy || !authUser || status !== "OPEN" || slotsLeft <= 0}
              className={`mt-4 w-full rounded-lg px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${
                hasAccountBooking
                  ? "border border-orange-400/45 bg-orange-500/25 text-orange-50 hover:bg-orange-500/35"
                  : "bg-white text-black hover:bg-zinc-200"
              }`}
            >
              {bookingBusy
                ? "Booking..."
                : !authUser
                ? "Login Required"
                : hasAccountBooking
                  ? "BOOK AGAIN"
                  : teamSize > 1
                    ? "Book Team Slot"
                    : "Book Slot"}
            </button>
          ) : null}
        </div>

          </>
        )}

        {showRulesModal ? (
          <>
            <button
              type="button"
              aria-label="Close rules"
              onClick={() => setShowRulesModal(false)}
              className="fixed inset-0 z-40 bg-black/70"
            />
            <div className="fixed inset-x-0 bottom-0 z-50 p-3 sm:inset-0 sm:flex sm:items-center sm:justify-center">
              <div className="max-h-[75vh] w-full overflow-auto rounded-2xl border border-white/10 bg-[#11131b] shadow-[0_20px_50px_rgba(0,0,0,0.55)] sm:max-w-xl">
                <div className="sticky top-0 flex items-center justify-between border-b border-white/10 bg-[#11131b]/95 px-4 py-3 backdrop-blur">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-100">Rules</h3>
                  <button
                    type="button"
                    onClick={() => setShowRulesModal(false)}
                    className="rounded-md border border-white/10 px-2 py-1 text-xs text-zinc-200 hover:bg-white/10"
                  >
                    Close
                  </button>
                </div>
                <div className="space-y-2 p-4 text-sm text-zinc-200">
                  {rulesToShow.map((rule, idx) => (
                    <p key={`modal-rule-${idx}`}>{idx + 1}. {rule}</p>
                  ))}
                </div>
              </div>
            </div>
          </>
        ) : null}

        {/* Small helper */}
        <div className="mt-6 text-xs text-zinc-400">
          If anything looks stuck, refresh once. (MVP LocalStorage)
        </div>
      </div>
    </div>
  );
}
