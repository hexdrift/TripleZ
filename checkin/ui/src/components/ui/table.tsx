"use client"

import * as React from "react"

function Table({ style, ...props }: React.ComponentProps<"table">) {
  return (
    <div data-slot="table-container" style={{ position: 'relative', width: '100%', overflowX: 'auto' }}>
      <table
        data-slot="table"
        style={{ width: '100%', captionSide: 'bottom', fontSize: '14px', ...style }}
        {...props}
      />
    </div>
  )
}

function TableHeader({ style, ...props }: React.ComponentProps<"thead">) {
  return <thead data-slot="table-header" style={{ backgroundColor: 'transparent', ...style }} {...props} />
}

function TableBody({ style, ...props }: React.ComponentProps<"tbody">) {
  return <tbody data-slot="table-body" style={style} {...props} />
}

function TableFooter({ style, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      style={{
        borderTop: '1px solid color-mix(in srgb, var(--border) 70%, transparent)',
        backgroundColor: 'color-mix(in srgb, var(--muted) 50%, transparent)',
        fontWeight: 500,
        ...style,
      }}
      {...props}
    />
  )
}

function TableRow({ style, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      style={{
        borderBottom: '1px solid color-mix(in srgb, var(--border) 60%, transparent)',
        transition: 'background-color 100ms',
        ...style,
      }}
      {...props}
    />
  )
}

function TableHead({ style, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      style={{
        height: '48px',
        padding: '0 8px',
        textAlign: 'start',
        verticalAlign: 'middle',
        fontSize: '12px',
        fontWeight: 600,
        whiteSpace: 'nowrap',
        color: 'var(--muted-foreground)',
        ...style,
      }}
      {...props}
    />
  )
}

function TableCell({ style, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      style={{ padding: '10px', verticalAlign: 'middle', whiteSpace: 'nowrap', ...style }}
      {...props}
    />
  )
}

function TableCaption({ style, ...props }: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      style={{ marginTop: '16px', fontSize: '14px', color: 'var(--muted-foreground)', ...style }}
      {...props}
    />
  )
}

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption }
