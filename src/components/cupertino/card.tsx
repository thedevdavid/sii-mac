import * as React from "react"
import {
  Card as ShadcnCard,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardContent,
  CardFooter,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"

function Card({
  className,
  ...props
}: React.ComponentProps<typeof ShadcnCard>) {
  return (
    <ShadcnCard
      className={cn(
        // macOS: border + subtle shadow instead of ring
        "border border-border shadow-sm ring-0",
        className,
      )}
      {...props}
    />
  )
}

export { Card, CardHeader, CardTitle, CardDescription, CardAction, CardContent, CardFooter }
