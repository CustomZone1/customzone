"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { hasAdminSession } from "@/data/adminSession";

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Allow the login page itself
    if (pathname === "/admin/login") {
      setReady(true);
      return;
    }

    // Check session from LocalStorage (client only)
    const ok = hasAdminSession();
    if (!ok) {
      router.replace("/admin/login");
      return;
    }

    setReady(true);
  }, [pathname, router]);

  // Prevent flashing admin UI before we check session
  if (!ready) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-200">
        Checking admin access…
      </div>
    );
  }

  return <>{children}</>;
}
