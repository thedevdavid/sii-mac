import * as React from "react"
import { Textarea as ShadcnTextarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

function Textarea({
  className,
  ...props
}: React.ComponentProps<typeof ShadcnTextarea>) {
  return (
    <ShadcnTextarea
      className={cn(
        "bg-background shadow-[inset_0_0.0625rem_0.125rem_oklch(0_0_0/6%)] focus-visible:ring-primary/30 dark:bg-card",
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
