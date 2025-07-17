import * as React from "react"
import { cn } from "@/lib/utils"

const RadioGroupContext = React.createContext<{
  value: string
  setValue: (value: string) => void
} | null>(null)

export function RadioGroup({ value, onValueChange, className, children, ...props }: {
  value: string
  onValueChange: (value: string) => void
  className?: string
  children: React.ReactNode
}) {
  return (
    <RadioGroupContext.Provider value={{ value, setValue: onValueChange }}>
      <div role="radiogroup" className={cn("flex gap-2", className)} {...props}>
        {children}
      </div>
    </RadioGroupContext.Provider>
  )
}

export function RadioGroupItem({ value, className, children, ...props }: {
  value: string
  className?: string
  children?: React.ReactNode
}) {
  const ctx = React.useContext(RadioGroupContext)
  if (!ctx) throw new Error("RadioGroupItem must be used within a RadioGroup")
  const checked = ctx.value === value
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      className={cn(
        "px-3 py-1 rounded border border-gray-300 bg-white hover:bg-gray-100",
        checked && "border-primary bg-primary/10",
        className
      )}
      onClick={() => ctx.setValue(value)}
      {...props}
    >
      {children}
    </button>
  )
}
