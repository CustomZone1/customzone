import Link from "next/link";
import { infoSections } from "./sections";

export default function InfoPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-4 text-zinc-100 sm:space-y-5">
      <section className="rounded-2xl border border-cyan-500/25 bg-gradient-to-br from-cyan-500/10 via-slate-900/70 to-orange-500/10 p-4 sm:p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200/85">Info Center</p>
        <h1 className="mt-2 text-2xl font-bold uppercase tracking-[0.08em] text-white sm:text-3xl">
          CustomZone Guide
        </h1>
        <p className="mt-2 text-sm text-zinc-300">
          Tap any section below to view the full details.
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        {infoSections.map((section) => (
          <Link
            key={section.slug}
            href={`/info/${section.slug}`}
            className="block rounded-xl border border-white/10 bg-white/[0.04] p-4 transition hover:bg-white/[0.08]"
          >
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-orange-100">
              {section.title}
            </h2>
            <p className="mt-2 text-sm text-zinc-300">{section.description}</p>
            <p className="mt-3 text-xs uppercase tracking-wide text-zinc-400">Click to open</p>
          </Link>
        ))}
      </section>

      <section className="rounded-xl border border-white/10 bg-black/20 p-4">
        <p className="text-sm text-zinc-300">
          Please follow these guidelines to avoid penalties or payout issues.
        </p>
        <Link
          href="/"
          className="mt-3 inline-flex rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-200 hover:bg-white/10"
        >
          Back to Tournaments
        </Link>
      </section>
    </div>
  );
}
