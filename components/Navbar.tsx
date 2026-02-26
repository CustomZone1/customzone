"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import {
  getUserSession,
  onUserSessionChange,
  type AuthUser,
} from "@/data/userSession";
import { getInboxShared } from "@/data/inbox";

const navLink =
  "inline-flex h-10 items-center justify-center rounded-xl border px-2 text-[11px] font-semibold uppercase tracking-[0.12em] transition-colors sm:min-w-[8rem] sm:px-3 sm:text-xs";

function getNavLinkClass(active: boolean) {
  if (active) {
    return `${navLink} border-orange-400/45 bg-orange-500/25 text-orange-100`;
  }
  return `${navLink} border-white/10 bg-black/25 text-zinc-300 hover:bg-white/10 hover:text-white`;
}

export default function Navbar() {
  const pathname = usePathname();
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const sync = () => setAuthUser(getUserSession());
    sync();
    return onUserSessionChange(sync);
  }, []);

  useEffect(() => {
    if (!authUser?.id) {
      setUnreadCount(0);
      return;
    }

    let active = true;
    const load = async () => {
      const data = await getInboxShared(authUser.id, 40);
      if (!active) return;
      setUnreadCount(Number(data.unreadCount ?? 0));
    };

    load();
    const timer = window.setInterval(load, 10000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [authUser?.id]);

  const tournamentsActive =
    pathname === "/" ||
    (pathname.startsWith("/tournaments/") && !pathname.startsWith("/tournaments/wallet"));
  const walletActive = pathname.startsWith("/tournaments/wallet");
  const infoActive = pathname.startsWith("/info");
  const inboxActive = pathname.startsWith("/inbox");

  return (
    <nav data-cz-navbar className="border-b border-white/10 bg-black/45 backdrop-blur-xl">
      <div className="mx-auto max-w-5xl px-3 py-3 sm:px-4 sm:py-3.5">
        <div className="flex items-start justify-between gap-3">
          <Link href="/" className="group min-w-0">
            <p className="truncate text-base font-bold uppercase tracking-[0.14em] text-white sm:text-lg">
              CustomZone
            </p>
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-orange-300/80 transition group-hover:text-orange-200">
              Free Fire Arena
            </p>
          </Link>

          <div className="flex shrink-0 items-center gap-2">
            {authUser ? (
              <>
                <span className="hidden max-w-[14rem] truncate rounded-full border border-emerald-400/30 bg-emerald-500/15 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-100 sm:inline-flex">
                  @{authUser.username}
                </span>
                <Link
                  href="/inbox"
                  aria-label="Inbox"
                  className={`relative inline-flex h-9 w-9 items-center justify-center rounded-lg border transition ${
                    inboxActive
                      ? "border-orange-400/45 bg-orange-500/25 text-orange-100"
                      : "border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10"
                  }`}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4"
                    aria-hidden
                  >
                    <path
                      d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5v-9Z"
                      stroke="currentColor"
                      strokeWidth="1.6"
                    />
                    <path
                      d="m4.8 7 6.38 5.1a1.3 1.3 0 0 0 1.64 0L19.2 7"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  {unreadCount > 0 ? (
                    <span className="absolute -right-1 -top-1 inline-flex min-h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  ) : null}
                </Link>
              </>
            ) : (
              <Link
                href="/auth"
                className="rounded-lg border border-orange-400/40 bg-orange-500/20 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-orange-100 hover:bg-orange-500/30 sm:text-[11px]"
              >
                Login
              </Link>
            )}
          </div>
        </div>

        <div
          data-cz-nav-tabs
          className="mt-3 rounded-2xl border border-white/10 bg-white/[0.04] p-1.5 sm:flex sm:items-center sm:justify-end sm:rounded-xl sm:bg-transparent sm:p-0"
        >
          <div className="grid grid-cols-3 gap-1.5 sm:flex sm:items-center sm:gap-2">
            <Link href="/" className={getNavLinkClass(tournamentsActive)}>
              Tournaments
            </Link>
            <Link href="/tournaments/wallet" className={getNavLinkClass(walletActive)}>
              Wallet
            </Link>
            <Link href="/info" className={getNavLinkClass(infoActive)}>
              Info
            </Link>
          </div>
        </div>

        {authUser ? (
          <p className="mt-2 truncate text-[10px] uppercase tracking-wide text-emerald-200/80 sm:hidden">
            Signed in as @{authUser.username}
          </p>
        ) : (
          <p className="mt-2 text-[10px] uppercase tracking-wide text-zinc-400 sm:hidden">
            Login to book slots faster
          </p>
        )}
      </div>
    </nav>
  );
}
