import * as React from "react"
import { Input as ShadcnInput } from "@/components/ui/input"
import { cn } from "@/lib/utils"

function Input({
  className,
  ...props
}: React.ComponentProps<typeof ShadcnInput>) {
  return (
    <ShadcnInput
      className={cn(
        // macOS text fields: opaque bg, subtle inset shadow, blue focus ring
        "bg-background shadow-[inset_0_0.0625rem_0.125rem_oklch(0_0_0/6%)] focus-visible:ring-primary/30 dark:bg-card",
        className,
      )}
      {...props}
    />
  )
}

export { Input }
