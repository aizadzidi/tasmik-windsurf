import * as React from "react"
import { cn } from "@/lib/utils"

export function Tabs({ defaultValue, children, className }: {
  defaultValue: string
  children: React.ReactNode
  className?: string
}) {
  const [value, setValue] = React.useState(defaultValue)
  return (
    <div className={cn("flex flex-col", className)}>
      {React.Children.map(children, child => {
        if (React.isValidElement(child) && child.type === TabsList) {
          return React.cloneElement(child as React.ReactElement<any>, { value, setValue })
        }
        return child
      })}
    </div>
  )
}

export function TabsList({ value, setValue, children }: {
  value: string
  setValue: (v: string) => void
  children: React.ReactNode
}) {
  return (
    <div className="flex gap-2 border-b pb-1">
      {React.Children.map(children, child => {
        if (React.isValidElement(child) && child.type === TabsTrigger) {
          return React.cloneElement(child as React.ReactElement<any>, { value, setValue })
        }
        return child
      })}
    </div>
  )
}

export function TabsTrigger({ value: triggerValue, value, setValue, children, asChild, ...props }: {
  value: string
  setValue?: (v: string) => void
  children: React.ReactNode
  asChild?: boolean
}) {
  const isActive = value === triggerValue
  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<any>, {
      className: cn((children as any).props.className, isActive ? "font-bold border-b-2 border-primary" : "text-muted-foreground"),
      onClick: () => setValue?.(triggerValue),
    })
  }
  return (
    <button
      type="button"
      className={cn(
        "px-4 py-2",
        isActive ? "font-bold border-b-2 border-primary" : "text-muted-foreground"
      )}
      onClick={() => setValue?.(triggerValue)}
      {...props}
    >
      {children}
    </button>
  )
}
