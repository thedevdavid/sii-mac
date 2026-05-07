import { type ReactNode } from "react";
import { z } from "zod";
import { Button } from "@/components/cupertino/button";
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/cupertino/dialog";
import { useAppForm } from "@/lib/form";

const PlaysetNameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name cannot be empty")
    .max(128, "Name cannot exceed 128 characters"),
});

export interface PlaysetNameFormProps {
  title: string;
  description: ReactNode;
  fieldLabel: string;
  fieldId: string;
  initialValue: string;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (name: string) => void | Promise<void>;
  validateName?: (trimmed: string) => string | undefined;
}

export function PlaysetNameForm({
  title,
  description,
  fieldLabel,
  fieldId,
  initialValue,
  submitLabel,
  onCancel,
  onSubmit,
  validateName,
}: PlaysetNameFormProps) {
  const form = useAppForm({
    defaultValues: { name: initialValue },
    validators: {
      onChange: ({ value }) => {
        const result = PlaysetNameSchema.safeParse(value);
        if (!result.success) {
          return { fields: { name: result.error.issues[0]?.message } };
        }
        const customError = validateName?.(value.name.trim());
        if (customError) return { fields: { name: customError } };
        return undefined;
      },
    },
    onSubmit: async ({ value }) => {
      await onSubmit(value.name.trim());
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        form.handleSubmit();
      }}
      className="space-y-4"
    >
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <form.AppField name="name">
        {(field) => (
          <field.TextField
            id={fieldId}
            label={fieldLabel}
            inputProps={{ autoFocus: true, maxLength: 128 }}
          />
        )}
      </form.AppField>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <form.AppForm>
          <form.SubmitButton label={submitLabel} />
        </form.AppForm>
      </DialogFooter>
    </form>
  );
}
