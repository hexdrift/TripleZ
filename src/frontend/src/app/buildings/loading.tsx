export default function BuildingsLoading() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-48 animate-pulse rounded bg-muted" />
      <div className="overflow-hidden rounded-xl border border-border/70 bg-gradient-to-br from-card via-card to-background/80 p-7">
        <div className="space-y-2">
          <div className="h-7 w-40 animate-pulse rounded bg-muted" />
          <div className="h-5 w-64 animate-pulse rounded bg-muted" />
        </div>
      </div>
      <section className="grid grid-cols-5 gap-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border/70 bg-card p-5">
            <div className="h-4 w-16 animate-pulse rounded bg-muted" />
            <div className="mt-2 h-8 w-12 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </section>
    </div>
  );
}
