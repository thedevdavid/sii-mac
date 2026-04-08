import { Button as ShadcnButton, buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type ButtonProps = React.ComponentProps<typeof ShadcnButton>

function Button({ className, variant, ...props }: ButtonProps) {
  const macosClasses = cn(
    // Subtle pressed feedback on all variants
    "active:not-aria-[haspopup]:scale-[0.98]",
    // Variant-specific macOS styling
    variant === "default" &&
      "bg-gradient-to-b from-primary/90 to-primary shadow-sm active:from-primary active:to-primary/90",
    variant === "outline" && "shadow-sm",
    className,
  )

  return <ShadcnButton variant={variant} className={macosClasses} {...props} />
}

export { Button, buttonVariants }
export type { ButtonProps }
