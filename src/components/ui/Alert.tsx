import * as React from "react"
import { cn } from "@/lib/utils"
import { AlertTriangle, Info, CheckCircle, XCircle } from "lucide-react"

const variantIcons = {
  info: Info,
  warning: AlertTriangle,
  success: CheckCircle,
  error: XCircle,
}

type AlertVariant = keyof typeof variantIcons

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: AlertVariant
  title?: string
}

const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant = "info", title, children, ...props }, ref) => {
    const Icon = variantIcons[variant]
    return (
      <div
        ref={ref}
        className={cn(
          "flex items-start gap-3 rounded-lg border px-4 py-3 shadow bg-white/90 backdrop-blur-md",
          {
            "border-blue-400 text-blue-900": variant === "info",
            "border-yellow-400 text-yellow-900": variant === "warning",
            "border-green-400 text-green-900": variant === "success",
            "border-red-400 text-red-900": variant === "error",
          },
          className
        )}
        {...props}
      >
        <Icon className="h-5 w-5 mt-1 flex-shrink-0" />
        <div>
          {title && <div className="font-semibold mb-1">{title}</div>}
          <div>{children}</div>
        </div>
      </div>
    )
  }
)
Alert.displayName = "Alert"

export { Alert }
