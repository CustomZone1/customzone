export default function Container({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto max-w-5xl px-3 py-4 text-zinc-100 sm:px-4 sm:py-6">
      {children}
    </main>
  );
}
