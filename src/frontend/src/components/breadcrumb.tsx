"use client";

import Link from "next/link";
import { IconChevronLeft } from "./icons";

interface Crumb {
  label: string;
  href?: string;
  icon?: React.ReactNode;
}

export function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="פירורי לחם" className="mb-6 flex flex-wrap items-center gap-2 text-[13px]">
      {items.map((item, index) => (
        <span key={`${item.label}-${index}`} className="inline-flex items-center gap-2">
          {index > 0 ? <IconChevronLeft size={13} className="text-muted-foreground/70" /> : null}
          {item.href ? (
            <Link
              href={item.href}
              className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/75 px-3 py-1.5 font-semibold text-muted-foreground shadow-[var(--shadow-inset)] transition-colors hover:bg-accent/70 hover:text-foreground"
            >
              {item.icon}{item.label}
            </Link>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/15 bg-primary/[0.08] px-3 py-1.5 font-semibold text-foreground shadow-[var(--shadow-inset)]">
              {item.icon}{item.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}
