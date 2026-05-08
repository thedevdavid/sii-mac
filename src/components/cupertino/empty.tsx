import {
  Empty as ShadcnEmpty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
  EmptyMedia,
} from "@/components/ui/empty";
import { cn } from "@/lib/utils";

/**
 * Cupertino-styled Empty state. Wraps the shadcn Empty primitive and adds
 * the macOS aesthetic — softer dashed border, generous padding, and the SF
 * font cascade picked up via Tailwind's `font-sans` (set globally in
 * `index.css`). Same API as the underlying primitive.
 */
function Empty({ className, ...props }: React.ComponentProps<typeof ShadcnEmpty>) {
  return (
    <ShadcnEmpty
      className={cn(
        "border border-dashed border-border/60 bg-muted/20 py-10",
        className,
      )}
      {...props}
    />
  );
}

export {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
  EmptyMedia,
};
