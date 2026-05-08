import {
  Alert as ReuiAlert,
  AlertTitle,
  AlertDescription,
  AlertAction,
} from "@/components/reui/alert";
import { cn } from "@/lib/utils";

/**
 * Cupertino-styled Alert. Wraps the reui Alert (variant tokens — default,
 * destructive, info, success, warning, invert — plus the grid layout for
 * title + description + action) and adds the macOS-style elevation: subtler
 * shadow, slightly larger radius, frosted bg layer that matches our other
 * cupertino surfaces (popover/menubar/dropdown).
 */
function Alert({
  className,
  ...props
}: React.ComponentProps<typeof ReuiAlert>) {
  return (
    <ReuiAlert
      className={cn(
        "rounded-lg shadow-sm backdrop-blur-md backdrop-saturate-150",
        className,
      )}
      {...props}
    />
  );
}

export { Alert, AlertTitle, AlertDescription, AlertAction };
