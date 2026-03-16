"use client"

import * as React from "react"
import { Tabs as TabsPrimitive } from "radix-ui"

const tabsBase: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
}

const tabsListBase: React.CSSProperties = {
  display: 'inline-flex',
  width: 'fit-content',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '16px',
  border: '1px solid color-mix(in srgb, var(--border) 70%, transparent)',
  padding: '6px',
  color: 'var(--muted-foreground)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6)',
  height: '44px',
  backgroundColor: 'color-mix(in srgb, var(--muted) 60%, transparent)',
  backdropFilter: 'blur(4px)',
}

const tabsTriggerBase: React.CSSProperties = {
  position: 'relative',
  display: 'inline-flex',
  height: 'calc(100% - 1px)',
  flex: '1 1 0%',
  userSelect: 'none',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  borderRadius: '12px',
  border: '1px solid transparent',
  padding: '6px 12px',
  fontSize: '14px',
  fontWeight: 600,
  whiteSpace: 'nowrap',
  color: 'color-mix(in srgb, var(--foreground) 60%, transparent)',
  cursor: 'pointer',
  transition: 'transform 120ms cubic-bezier(0.2,0.8,0.2,1), background-color 120ms, color 120ms, border-color 120ms, box-shadow 120ms, opacity 120ms',
}

function Tabs({ style, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root data-slot="tabs" style={{ ...tabsBase, ...style }} {...props} />
}

function TabsList({ style, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List data-slot="tabs-list" style={{ ...tabsListBase, ...style }} {...props} />
}

function TabsTrigger({ style, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return <TabsPrimitive.Trigger data-slot="tabs-trigger" style={{ ...tabsTriggerBase, ...style }} {...props} />
}

function TabsContent({ style, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content data-slot="tabs-content" style={{ flex: '1 1 0%', outline: 'none', ...style }} {...props} />
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
