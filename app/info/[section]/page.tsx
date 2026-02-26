import Link from "next/link";
import { notFound } from "next/navigation";
import { infoSectionMap, infoSections } from "../sections";

type InfoSectionPageProps = {
  params: Promise<{
    section: string;
  }>;
};

export function generateStaticParams() {
  return infoSections.map((section) => ({ section: section.slug }));
}

export default async function InfoSectionPage({ params }: InfoSectionPageProps) {
  const { section } = await params;
  const selectedSection = infoSectionMap.get(section);

  if (!selectedSection) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 text-zinc-100 sm:space-y-5">
      <section className="rounded-2xl border border-cyan-500/25 bg-gradient-to-br from-cyan-500/10 via-slate-900/70 to-orange-500/10 p-4 sm:p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200/85">Info Center</p>
        <h1 className="mt-2 text-2xl font-bold uppercase tracking-[0.08em] text-white sm:text-3xl">
          {selectedSection.title}
        </h1>
        <p className="mt-2 text-sm text-zinc-300">{selectedSection.description}</p>
      </section>

      <section className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
        <ol className="list-decimal space-y-2 pl-5 text-sm text-zinc-200">
          {selectedSection.points.map((point, pointIndex) => (
            <li key={`${selectedSection.slug}-${pointIndex}`}>{point}</li>
          ))}
        </ol>
      </section>

      <section className="rounded-xl border border-white/10 bg-black/20 p-4">
        <Link
          href="/info"
          className="inline-flex rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-200 hover:bg-white/10"
        >
          Back to Info
        </Link>
      </section>
    </div>
  );
}
