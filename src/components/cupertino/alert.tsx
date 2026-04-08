import {
  Alert as ShadcnAlert,
  AlertTitle,
  AlertDescription,
  AlertAction,
} from "@/components/ui/alert"
import { cn } from "@/lib/utils"

function Alert({
  className,
  ...props
}: React.ComponentProps<typeof ShadcnAlert>) {
  return (
    <ShadcnAlert
      className={cn("shadow-sm", className)}
      {...props}
    />
  )
}

export { Alert, AlertTitle, AlertDescription, AlertAction }
