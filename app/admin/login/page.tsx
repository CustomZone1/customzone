"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ADMIN_PASSWORD } from "@/data/constants";
import { setAdminSession } from "@/data/adminSession";

export default function AdminLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (password === ADMIN_PASSWORD) {
      setAdminSession();
      router.replace("/admin");
      return;
    }

    setError("Wrong password");
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Admin Login</h1>
        <p className="mt-1 text-sm text-zinc-300">
          Enter the admin password to continue.
        </p>
      </div>

      <form
        onSubmit={onSubmit}
        className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4"
      >
        <label className="block text-sm text-zinc-200">
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-2 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-zinc-100 outline-none focus:border-white/20"
            placeholder="Enter password"
          />
        </label>

        {error ? <p className="text-sm text-red-300">{error}</p> : null}

        <button
          type="submit"
          className="w-full rounded-lg bg-white px-3 py-2 text-sm font-medium text-zinc-950 hover:bg-zinc-200"
        >
          Login
        </button>
      </form>
    </div>
  );
}
