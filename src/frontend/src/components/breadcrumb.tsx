"use client";

import Link from "next/link";
import { IconChevronLeft } from "./icons";

interface Crumb {
  label: string;
  href?: string;
}

export function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="פירורי לחם" className="flex items-center gap-1.5 text-[13px] mb-6">
      {items.map((item, index) => (
        <span key={`${item.label}-${index}`} className="inline-flex items-center gap-1.5">
          {index > 0 ? <IconChevronLeft size={13} className="opacity-50" /> : null}
          {item.href ? (
            <Link href={item.href} className="font-semibold hover:underline" style={{ color: "var(--text-3)" }}>
              {item.label}
            </Link>
          ) : (
            <span className="font-semibold" style={{ color: "var(--text-2)" }}>{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
