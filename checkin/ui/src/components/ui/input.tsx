import * as React from "react"

const inputBase: React.CSSProperties = {
  height: '36px',
  width: '100%',
  minWidth: 0,
  borderRadius: '12px',
  border: '1px solid color-mix(in srgb, var(--input) 90%, transparent)',
  backgroundColor: 'color-mix(in srgb, var(--background) 75%, transparent)',
  padding: '4px 12px',
  fontSize: '14px',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.72), 0 12px 26px -24px rgba(15,23,42,0.45)',
  backdropFilter: 'blur(4px)',
  transition: 'color 150ms, box-shadow 150ms, border-color 150ms, background-color 150ms',
  outline: 'none',
}

function Input({ style, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      style={{ ...inputBase, ...style }}
      {...props}
    />
  )
}

export { Input }
