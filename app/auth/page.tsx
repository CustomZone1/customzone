"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { getUserSession, setUserSession, type AuthUser } from "@/data/userSession";

type AuthMode = "login" | "signup";

type AuthResponse = {
  user?: AuthUser;
  error?: string;
  suggestion?: string;
};

export default function AuthPage() {
  const router = useRouter();

  const [mode, setMode] = useState<AuthMode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [suggestion, setSuggestion] = useState("");

  useEffect(() => {
    const existing = getUserSession();
    if (existing) {
      router.replace("/");
    }
  }, [router]);

  function resetMessages() {
    setError("");
    setSuggestion("");
  }

  function switchMode(next: AuthMode) {
    setMode(next);
    resetMessages();
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    resetMessages();

    const trimmedUsername = username.trim();
    if (!trimmedUsername) {
      setError("Username is required.");
      return;
    }
    if (!password) {
      setError("Password is required.");
      return;
    }
    if (mode === "signup" && !confirmPassword) {
      setError("Confirm password is required.");
      return;
    }

    setBusy(true);
    try {
      const endpoint = mode === "signup" ? "/api/auth/signup" : "/api/auth/login";
      const body =
        mode === "signup"
          ? { username: trimmedUsername, password, confirmPassword, referralCode: referralCode.trim() }
          : { username: trimmedUsername, password };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const payload = (await res.json()) as AuthResponse;
      if (!res.ok) {
        setError(payload.error || "Request failed.");
        if (payload.suggestion) {
          setSuggestion(payload.suggestion);
        }
        return;
      }

      if (!payload.user) {
        setError("Invalid server response.");
        return;
      }

      setUserSession(payload.user);
      router.replace("/");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md py-8 sm:py-10">
      <div className="rounded-2xl border border-orange-500/25 bg-gradient-to-br from-[#171019] via-[#110f15] to-[#1b0b08] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.45)] sm:p-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-orange-200/90">
          Account Access
        </p>
        <h1 className="mt-1 text-2xl font-bold uppercase tracking-[0.08em] text-white">
          {mode === "login" ? "Login" : "Create Account"}
        </h1>
        <p className="mt-2 text-sm text-zinc-300">
          Sign in with username and password. No email or phone required.
        </p>

        <div className="mt-4 inline-flex w-full rounded-lg border border-white/10 bg-black/35 p-1">
          <button
            type="button"
            onClick={() => switchMode("login")}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-semibold transition ${
              mode === "login"
                ? "bg-orange-500/25 text-orange-100"
                : "text-zinc-300 hover:bg-white/10"
            }`}
          >
            Login
          </button>
          <button
            type="button"
            onClick={() => switchMode("signup")}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-semibold transition ${
              mode === "signup"
                ? "bg-cyan-500/20 text-cyan-100"
                : "text-zinc-300 hover:bg-white/10"
            }`}
          >
            Sign Up
          </button>
        </div>

        <form onSubmit={onSubmit} className="mt-4 space-y-3">
          <label className="block text-sm text-zinc-200">
            Username
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
              className="mt-2 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-white/20"
              autoComplete="username"
            />
          </label>

          <label className="block text-sm text-zinc-200">
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="mt-2 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-white/20"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
            />
          </label>

          {mode === "signup" ? (
            <label className="block text-sm text-zinc-200">
              Confirm Password
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter password"
                className="mt-2 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-white/20"
                autoComplete="new-password"
              />
            </label>
          ) : null}

          {mode === "signup" ? (
            <label className="block text-sm text-zinc-200">
              Referral Code (optional)
              <input
                value={referralCode}
                onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                placeholder="Enter referral code"
                className="mt-2 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-white/20"
                autoComplete="off"
              />
            </label>
          ) : null}

          {error ? (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {error}
              {suggestion ? (
                <button
                  type="button"
                  onClick={() => setUsername(suggestion)}
                  className="ml-2 rounded-md border border-red-400/35 bg-red-500/20 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-red-100 hover:bg-red-500/30"
                >
                  Use {suggestion}
                </button>
              ) : null}
            </div>
          ) : null}

          {mode === "signup" ? (
            <p className="text-xs text-zinc-400">
              Username must be unique. Allowed: letters, numbers, underscore. Length 4-24.
            </p>
          ) : null}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-white px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy
              ? "Please wait..."
              : mode === "login"
                ? "Login"
                : "Create Account"}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-zinc-400">
          <Link href="/" className="text-zinc-300 hover:text-white">
            Back to tournaments
          </Link>
        </p>
      </div>
    </div>
  );
}
