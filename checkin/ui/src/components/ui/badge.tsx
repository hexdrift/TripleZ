import * as React from "react"
import { Slot } from "radix-ui"

const badgeBase: React.CSSProperties = {
  display: 'inline-flex',
  width: 'fit-content',
  flexShrink: 0,
  alignItems: 'center',
  justifyContent: 'center',
  gap: '4px',
  overflow: 'hidden',
  borderRadius: '9999px',
  padding: '4px 10px',
  fontSize: '12px',
  fontWeight: 600,
  whiteSpace: 'nowrap',
  transition: 'color 150ms, box-shadow 150ms, background-color 150ms, border-color 150ms',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.55)',
}

const variants: Record<string, React.CSSProperties> = {
  default: {
    border: '1px solid color-mix(in srgb, var(--primary) 20%, transparent)',
    backgroundColor: 'var(--primary)',
    color: 'var(--primary-foreground)',
  },
  secondary: {
    border: '1px solid color-mix(in srgb, var(--border) 60%, transparent)',
    backgroundColor: 'var(--secondary)',
    color: 'var(--secondary-foreground)',
  },
  destructive: {
    border: '1px solid color-mix(in srgb, var(--destructive) 20%, transparent)',
    backgroundColor: 'var(--destructive)',
    color: 'white',
  },
  outline: {
    border: '1px solid color-mix(in srgb, var(--border) 70%, transparent)',
    backgroundColor: 'color-mix(in srgb, var(--background) 70%, transparent)',
    color: 'var(--foreground)',
  },
  ghost: {
    border: '1px solid transparent',
    backgroundColor: 'transparent',
  },
}

function Badge({
  style,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> & {
  variant?: string
  asChild?: boolean
}) {
  const Comp = asChild ? Slot.Root : "span"
  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      style={{ ...badgeBase, ...(variants[variant || 'default'] || variants.default), ...style }}
      {...props}
    />
  )
}

export { Badge }
