import * as React from "react"
import { cn } from "@/lib/utils"

export function Select({ value, onValueChange, children, className, ...props }: {
  value: string
  onValueChange: (v: string) => void
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("relative", className)} {...props}>
      {React.Children.map(children, child => {
        if (React.isValidElement(child) && child.type === SelectTrigger) {
          return React.cloneElement(child, { value, onValueChange })
        }
        return child
      })}
    </div>
  )
}

export function SelectTrigger({ value, onValueChange, children, ...props }: {
  value: string
  onValueChange: (v: string) => void
  children: React.ReactNode
  className?: string
}) {
  const [open, setOpen] = React.useState(false)
  return (
    <button
      type="button"
      className="w-full border px-3 py-2 rounded bg-white flex items-center justify-between"
      onClick={() => setOpen(o => !o)}
      {...props}
    >
      <span>{children || value}</span>
      <span className="ml-2">▼</span>
    </button>
  )
}

export function SelectContent({ children, ...props }: { children: React.ReactNode }) {
  return (
    <div className="absolute z-10 mt-1 w-full bg-white border rounded shadow" {...props}>
      {children}
    </div>
  )
}

export function SelectItem({ value, children, onSelect, ...props }: {
  value: string
  children: React.ReactNode
  onSelect?: (value: string) => void
}) {
  return (
    <div
      className="px-3 py-2 hover:bg-gray-100 cursor-pointer"
      onClick={() => onSelect?.(value)}
      {...props}
    >
      {children}
    </div>
  )
}

export function SelectValue({ placeholder }: { placeholder?: string }) {
  return <span className="text-muted-foreground">{placeholder}</span>
}
