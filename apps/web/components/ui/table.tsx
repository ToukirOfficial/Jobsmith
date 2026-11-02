"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * On phones each row becomes a small card: the first cell is the title and every other cell is
 * shown with its column heading beside it (copied from the header row into `data-label`).
 * Pass `stack={false}` for tables that should scroll sideways instead.
 */
function Table({ className, stack = true, ...props }: React.ComponentProps<"table"> & { stack?: boolean }) {
  const ref = React.useRef<HTMLTableElement>(null)
  React.useEffect(() => {
    const table = ref.current
    if (!table || !stack) return
    const label = () => {
      const heads = [...table.querySelectorAll<HTMLTableCellElement>("thead tr:first-child th")].map((th) => th.textContent?.trim() ?? "")
      for (const row of table.querySelectorAll<HTMLTableRowElement>("tbody tr")) {
        let col = 0
        for (const cell of row.cells) {
          const text = heads[col] ?? ""
          if (cell.dataset.label !== text) cell.dataset.label = text
          // A cell showing only a dash adds nothing to a phone card, so it's left out there.
          const blank = /^[—–-]?$/.test(cell.textContent?.trim() ?? "") && !cell.querySelector("a, button, input, img, svg")
          if (blank !== ("blank" in cell.dataset)) {
            if (blank) cell.dataset.blank = ""
            else delete cell.dataset.blank
          }
          col += cell.colSpan
        }
      }
    }
    label()
    const observer = new MutationObserver(label)
    observer.observe(table, { childList: true, subtree: true, characterData: true })
    return () => observer.disconnect()
  }, [stack])
  return (
    <div
      data-slot="table-container"
      className="relative w-full overflow-x-auto"
    >
      <table
        ref={ref}
        data-slot="table"
        data-stack={stack ? "" : undefined}
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b border-border transition-colors hover:bg-canvas/70 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-11 bg-canvas/80 px-3 text-left align-middle text-xs font-semibold whitespace-nowrap text-muted-foreground first:rounded-l-md last:rounded-r-md [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "px-3 py-3 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
