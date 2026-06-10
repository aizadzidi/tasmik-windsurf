import * as React from "react"
import { cn } from "@/lib/utils"

type SwitchProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> & {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
};

export function Switch({ checked, onCheckedChange, className, disabled, ...props }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className={cn(
        "inline-flex w-11 h-6 rounded-full border border-gray-300 bg-white transition relative focus:outline-none",
        checked ? "bg-primary/80 border-primary" : "bg-gray-200 border-gray-300",
        disabled ? "cursor-not-allowed opacity-60" : "",
        className
      )}
      onClick={() => onCheckedChange(!checked)}
      {...props}
    >
      <span
        className={cn(
          "inline-block w-5 h-5 bg-white rounded-full shadow transform transition",
          checked ? "translate-x-5" : "translate-x-0"
        )}
      />
    </button>
  )
}
