import * as React from "react"
import { Slot } from "radix-ui"

const buttonBase: React.CSSProperties = {
  display: 'inline-flex',
  flexShrink: 0,
  userSelect: 'none',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  borderRadius: '6px',
  border: '1px solid transparent',
  fontSize: '14px',
  fontWeight: 500,
  whiteSpace: 'nowrap',
  outline: 'none',
  cursor: 'pointer',
  transition: 'transform 75ms ease-out, background-color 75ms ease-out, color 75ms ease-out, border-color 75ms ease-out, box-shadow 75ms ease-out, opacity 75ms ease-out',
}

const variantStyles: Record<string, React.CSSProperties> = {
  default: {
    backgroundColor: 'var(--primary)',
    color: 'var(--primary-foreground)',
    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
  },
  destructive: {
    backgroundColor: 'var(--destructive)',
    color: 'white',
    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
  },
  outline: {
    borderColor: 'var(--input)',
    backgroundColor: 'var(--background)',
    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
  },
  secondary: {
    backgroundColor: 'var(--secondary)',
    color: 'var(--secondary-foreground)',
    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  link: {
    height: 'auto',
    border: 'none',
    padding: 0,
    color: 'var(--primary)',
    textUnderlineOffset: '4px',
  },
}

const sizeStyles: Record<string, React.CSSProperties> = {
  default: { height: '36px', padding: '8px 16px' },
  xs: { height: '28px', gap: '4px', padding: '4px 10px', fontSize: '12px' },
  sm: { height: '32px', gap: '6px', padding: '4px 12px' },
  lg: { height: '40px', padding: '8px 20px' },
  icon: { width: '36px', height: '36px', padding: '0' },
  "icon-xs": { width: '28px', height: '28px', padding: '0' },
  "icon-sm": { width: '32px', height: '32px', padding: '0' },
  "icon-lg": { width: '40px', height: '40px', padding: '0' },
}

function Button({
  variant = "default",
  size = "default",
  asChild = false,
  style,
  ...props
}: React.ComponentProps<"button"> & {
  variant?: string
  size?: string
  asChild?: boolean
}) {
  const Comp = asChild ? Slot.Root : "button"
  return (
    <Comp
      {...(!asChild ? { type: "button" as const } : {})}
      data-slot="button"
      data-variant={variant}
      data-size={size}
      style={{
        ...buttonBase,
        ...(variantStyles[variant || 'default'] || variantStyles.default),
        ...(sizeStyles[size || 'default'] || sizeStyles.default),
        ...style,
      }}
      {...props}
    />
  )
}

export { Button }
