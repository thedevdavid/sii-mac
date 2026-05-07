import {
  createFormHook,
  createFormHookContexts,
  useStore,
} from "@tanstack/react-form";
import { Input } from "@/components/cupertino/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/cupertino/button";
import { IconLoader2 } from "@tabler/icons-react";
import type { ComponentProps, ReactNode } from "react";

export const { fieldContext, formContext, useFieldContext, useFormContext } =
  createFormHookContexts();

interface BaseFieldProps {
  label?: ReactNode;
  description?: ReactNode;
  className?: string;
}

function formatFieldError(err: unknown): string {
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}

function FieldShell({
  label,
  description,
  htmlFor,
  className,
  children,
  errorMessage,
}: BaseFieldProps & {
  htmlFor?: string;
  children: ReactNode;
  errorMessage: string | null;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      {label !== undefined && (
        <Label htmlFor={htmlFor} className="text-xs">
          {label}
        </Label>
      )}
      {children}
      {description !== undefined && !errorMessage && (
        <p className="text-[10px] text-muted-foreground">{description}</p>
      )}
      {errorMessage && (
        <p className="text-[10px] text-destructive">{errorMessage}</p>
      )}
    </div>
  );
}

function TextField({
  label,
  description,
  className,
  id,
  inputProps,
}: BaseFieldProps & {
  id?: string;
  inputProps?: Omit<ComponentProps<typeof Input>, "value" | "onChange" | "onBlur" | "id">;
}) {
  const field = useFieldContext<string>();
  const error = field.state.meta.errors[0];
  return (
    <FieldShell
      label={label}
      description={description}
      htmlFor={id ?? field.name}
      className={className}
      errorMessage={error ? formatFieldError(error) : null}
    >
      <Input
        id={id ?? field.name}
        value={field.state.value}
        onChange={(e) => field.handleChange(e.target.value)}
        onBlur={field.handleBlur}
        {...inputProps}
      />
    </FieldShell>
  );
}

function NumberField({
  label,
  description,
  className,
  id,
  min,
  max,
  step,
  placeholder,
}: BaseFieldProps & {
  id?: string;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
}) {
  const field = useFieldContext<number>();
  const error = field.state.meta.errors[0];
  return (
    <FieldShell
      label={label}
      description={description}
      htmlFor={id ?? field.name}
      className={className}
      errorMessage={error ? formatFieldError(error) : null}
    >
      <Input
        id={id ?? field.name}
        type="number"
        value={field.state.value}
        onChange={(e) => field.handleChange(Number(e.target.value))}
        onBlur={field.handleBlur}
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
      />
    </FieldShell>
  );
}

function SubmitButton({
  label,
  pendingLabel,
  size = "sm",
}: {
  label: ReactNode;
  pendingLabel?: ReactNode;
  size?: ComponentProps<typeof Button>["size"];
}) {
  const form = useFormContext();
  // Two scalar selectors — never construct an array/object inside a useStore
  // selector or the default Object.is comparison spins forever.
  const canSubmit = useStore(form.store, (s) => s.canSubmit);
  const isSubmitting = useStore(form.store, (s) => s.isSubmitting);
  return (
    <Button type="submit" size={size} disabled={!canSubmit || isSubmitting}>
      {isSubmitting && <IconLoader2 className="mr-1.5 size-3 animate-spin" />}
      {isSubmitting && pendingLabel ? pendingLabel : label}
    </Button>
  );
}

export const { useAppForm, withForm } = createFormHook({
  fieldComponents: { TextField, NumberField },
  formComponents: { SubmitButton },
  fieldContext,
  formContext,
});
