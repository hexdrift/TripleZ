import * as React from "react"

const cardBase: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '24px',
  borderRadius: '24px',
  border: '1px solid color-mix(in srgb, var(--border) 80%, transparent)',
  backgroundColor: 'var(--card)',
  padding: '24px 0',
  color: 'var(--card-foreground)',
  boxShadow: 'var(--shadow-card)',
  backdropFilter: 'blur(24px)',
  transition: 'box-shadow 200ms ease-out',
}

function Card({ style, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card" style={{ ...cardBase, ...style }} {...props} />
}

function CardHeader({ style, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      style={{ display: 'grid', gridAutoRows: 'min-content', gridTemplateRows: 'auto auto', alignItems: 'start', gap: '8px', padding: '0 24px', ...style }}
      {...props}
    />
  )
}

function CardTitle({ style, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-title" style={{ lineHeight: 1, fontWeight: 600, ...style }} {...props} />
}

function CardDescription({ style, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-description" style={{ fontSize: '14px', color: 'var(--muted-foreground)', ...style }} {...props} />
}

function CardAction({ style, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      style={{ gridColumnStart: 2, gridRow: 'span 2', gridRowStart: 1, alignSelf: 'start', justifySelf: 'end', ...style }}
      {...props}
    />
  )
}

function CardContent({ style, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-content" style={{ padding: '0 24px', ...style }} {...props} />
}

function CardFooter({ style, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-footer" style={{ display: 'flex', alignItems: 'center', padding: '0 24px', ...style }} {...props} />
}

export { Card, CardHeader, CardFooter, CardTitle, CardAction, CardDescription, CardContent }
