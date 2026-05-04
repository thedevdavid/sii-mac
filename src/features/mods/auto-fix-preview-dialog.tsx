import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/cupertino/alert-dialog";
import { ScrollArea } from "@/components/cupertino/scroll-area";
import {
  IconAlertTriangle,
  IconArrowDown,
  IconArrowUp,
  IconCheck,
  IconChevronDown,
  IconCircleOff,
  IconCloud,
  IconFolder,
  IconInfoCircle,
  IconLock,
} from "@tabler/icons-react";
import type { ModId } from "@/lib/core-types";
import type {
  FullModInfo,
  PlaysetEntry,
  WorkshopMetadataMap,
} from "./types";
import {
  analyzeAndReorder,
  groupForCategories,
  resolveModCategories,
} from "./load-order";
import { parseRecipe, shouldUseLegacyHints } from "./modset-recipe";

interface AutoFixPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entries: PlaysetEntry[];
  modsById: ReadonlyMap<ModId, FullModInfo>;
  workshopMap: WorkshopMetadataMap | undefined;
  onApply: (plannedOrder: ModId[]) => void;
  isBusy?: boolean;
}

const SKIP_REASON_LABELS: Record<string, string> = {
  blank: "Blank line",
  "section-divider": "Section divider",
  "removal-marker": "Removal marker",
  comment: "Comment / too short",
};

/**
 * Auto-fix preview. The dialog parses the textarea live, runs the recipe
 * matcher when the input contains structural cues (sections, alternatives,
 * annotations), and falls back to the legacy "cluster every match" path
 * when the user types a bare hint like `promods`. Diagnostics for unmatched
 * recipe lines, extras, and skipped lines are exposed via expandable
 * disclosures next to the textarea.
 */
export function AutoFixPreviewDialog({
  open,
  onOpenChange,
  entries,
  modsById,
  workshopMap,
  onApply,
  isBusy,
}: AutoFixPreviewDialogProps) {
  const [hintsText, setHintsText] = useState("");

  if (!open) {
    return (
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent />
      </AlertDialog>
    );
  }

  const parsed = parseRecipe(hintsText);
  const useLegacy = shouldUseLegacyHints(parsed);

  const legacyHints = useLegacy
    ? parsed.lines.map((l) => l.candidates[0])
    : [];

  const reorderInput = useLegacy
    ? ({ kind: "legacy", hints: legacyHints } as const)
    : ({ kind: "recipe", recipe: parsed } as const);

  const { plannedOrder, matched } = analyzeAndReorder(
    entries,
    modsById,
    workshopMap,
    reorderInput,
  );

  const oldPositionById = new Map<ModId, number>();
  const lockedById = new Map<ModId, boolean>();
  const fallbackNameById = new Map<ModId, string>();
  let lockedCount = 0;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    oldPositionById.set(e.mod_id, i);
    lockedById.set(e.mod_id, e.locked);
    fallbackNameById.set(e.mod_id, e.display_name);
    if (e.locked) lockedCount++;
  }

  const movedCount = plannedOrder.reduce((acc, modId, newIdx) => {
    const old = oldPositionById.get(modId);
    return old === undefined || old === newIdx ? acc : acc + 1;
  }, 0);

  const resolveName = (mod: FullModInfo | undefined, modId: ModId): string => {
    if (mod?.workshop_id) {
      const ws = workshopMap?.[mod.workshop_id];
      if (ws?.title) return ws.title;
    }
    return mod?.display_name ?? fallbackNameById.get(modId) ?? modId;
  };

  const recipeLineByModId = new Map<ModId, number>();
  if (matched) {
    for (const m of matched.matches) {
      recipeLineByModId.set(m.modId, m.lineNumber);
    }
  }

  const matchedCount = matched?.matches.length ?? 0;
  const unmatchedCount = matched?.unmatchedLines.length ?? 0;
  const extrasCount = matched?.extras.length ?? 0;
  const skippedCount = parsed.skipped.length;

  const textareaRows = Math.max(
    3,
    Math.min(12, hintsText.split("\n").length + 1),
  );

  const close = () => {
    setHintsText("");
    onOpenChange(false);
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setHintsText("");
        onOpenChange(next);
      }}
    >
      <AlertDialogContent size="xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Auto-fix loading order</AlertDialogTitle>
          <AlertDialogDescription>
            {movedCount > 0
              ? `${movedCount} of ${plannedOrder.length} mod${plannedOrder.length === 1 ? "" : "s"} will move.`
              : "Already in recommended order."}
            {lockedCount > 0
              ? ` ${lockedCount} locked stay in place.`
              : ""}{" "}
            Equal-priority mods keep their existing relative order.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,22rem)_1fr]">
          {/* Left column — recipe input + diagnostics */}
          <div className="flex min-w-0 flex-col gap-2">
            <div className="space-y-1">
              <label
                className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
                htmlFor="auto-fix-hints"
              >
                Recipe / hints
              </label>
              <textarea
                id="auto-fix-hints"
                value={hintsText}
                onChange={(e) => setHintsText(e.target.value)}
                rows={textareaRows}
                placeholder={
                  "e.g.\nProMods Canada\nRealistic Brutal Weather\nSCS Trailer Pack"
                }
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 font-mono text-[11px] outline-none focus:border-primary"
                spellCheck={false}
              />
              <p className="text-[10px] text-muted-foreground">
                Paste a recipe from GMC, ProMods, or MLog — or list mods one
                per line. Sections, optional/recommended notes, and
                &quot;or&quot; alternatives are handled automatically.
              </p>
            </div>

            {matched && (
              <div className="rounded-md border border-border bg-muted/20 p-2 text-[11px]">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <StatChip
                    icon={
                      <IconCheck className="size-3 text-emerald-500" />
                    }
                    label={`${matchedCount} matched`}
                  />
                  <StatChip
                    icon={
                      <IconAlertTriangle className="size-3 text-amber-500" />
                    }
                    label={`${unmatchedCount} unmatched`}
                  />
                  <StatChip
                    icon={
                      <IconInfoCircle className="size-3 text-sky-500" />
                    }
                    label={`${extrasCount} extras`}
                  />
                  <StatChip
                    icon={
                      <IconCircleOff className="size-3 text-muted-foreground" />
                    }
                    label={`${skippedCount} skipped`}
                  />
                </div>

                {unmatchedCount > 0 && (
                  <Disclosure summary={`Unmatched (${unmatchedCount})`}>
                    <ul className="mt-1 space-y-1.5">
                      {matched.unmatchedLines.map((u) => (
                        <li
                          key={u.line.lineNumber}
                          className="rounded border border-border/60 bg-background/40 p-1.5"
                        >
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-[10px] tabular-nums text-muted-foreground">
                              L{u.line.lineNumber + 1}
                            </span>
                            <span className="truncate font-mono text-[10px]">
                              {u.line.raw.trim()}
                            </span>
                          </div>
                          {u.tried.length > 0 && (
                            <div className="mt-0.5 text-[10px] text-muted-foreground">
                              Tried:{" "}
                              {u.tried
                                .map(
                                  (t) =>
                                    `${t.name} (${t.score.toFixed(2)})`,
                                )
                                .join(", ")}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </Disclosure>
                )}

                {extrasCount > 0 && (
                  <Disclosure summary={`Extras (${extrasCount})`}>
                    <ul className="mt-1 space-y-1">
                      {matched.extras.map((modId) => {
                        const mod = modsById.get(modId);
                        const group = groupForCategories(
                          mod ? resolveModCategories(mod, workshopMap) : [],
                        );
                        return (
                          <li
                            key={modId}
                            className="flex items-center justify-between gap-2 truncate text-[10px]"
                          >
                            <span className="truncate">
                              {resolveName(mod, modId)}
                            </span>
                            <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">
                              {group.label}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </Disclosure>
                )}

                {skippedCount > 0 && (
                  <Disclosure summary={`Skipped (${skippedCount})`}>
                    <ul className="mt-1 space-y-1">
                      {parsed.skipped.map((s) => (
                        <li
                          key={s.lineNumber}
                          className="flex items-baseline gap-1.5 text-[10px]"
                        >
                          <span className="tabular-nums text-muted-foreground">
                            L{s.lineNumber + 1}
                          </span>
                          <span className="truncate font-mono">
                            {s.raw.trim() || "(blank)"}
                          </span>
                          <span className="ml-auto shrink-0 rounded bg-muted px-1 py-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">
                            {SKIP_REASON_LABELS[s.reason] ?? s.reason}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </Disclosure>
                )}
              </div>
            )}
          </div>

          {/* Right column — planned order */}
          <div className="overflow-hidden rounded-md border border-border">
            <div className="grid grid-cols-[3rem_1fr_5rem_8rem_4.5rem] items-center gap-3 border-b border-border bg-muted/40 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              <span className="text-right">#</span>
              <span>Mod</span>
              <span>Source</span>
              <span>Group</span>
              <span className="text-right">Move</span>
            </div>
            <ScrollArea className="h-[55vh]">
              <ol className="divide-y divide-border">
                {plannedOrder.map((modId, newIdx) => {
                  const oldIdx = oldPositionById.get(modId);
                  const moved = oldIdx !== undefined && oldIdx !== newIdx;
                  const locked = lockedById.get(modId) ?? false;
                  const mod = modsById.get(modId);
                  const group = groupForCategories(
                    mod ? resolveModCategories(mod, workshopMap) : [],
                  );
                  const displayName = resolveName(mod, modId);
                  const source = mod?.source;
                  const recipeLine = recipeLineByModId.get(modId);
                  const movedDelta =
                    moved && oldIdx !== undefined ? newIdx - oldIdx : 0;

                  return (
                    <li
                      key={modId}
                      className="grid grid-cols-[3rem_1fr_5rem_8rem_4.5rem] items-center gap-3 px-3 py-1.5 text-xs hover:bg-muted/30"
                    >
                      <span className="flex flex-col items-end text-right tabular-nums text-muted-foreground">
                        <span>{newIdx + 1}</span>
                        {recipeLine !== undefined && (
                          <span className="text-[9px] font-medium text-sky-500">
                            L{recipeLine + 1}
                          </span>
                        )}
                      </span>
                      <div className="flex min-w-0 items-center gap-1.5">
                        {locked && (
                          <IconLock
                            className="size-3 shrink-0 text-amber-500"
                            aria-label="Locked"
                          />
                        )}
                        <span
                          className="truncate font-medium"
                          title={displayName}
                        >
                          {displayName}
                        </span>
                      </div>
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        {source === "workshop" ? (
                          <>
                            <IconCloud className="size-3" />
                            Workshop
                          </>
                        ) : source === "local" ? (
                          <>
                            <IconFolder className="size-3" />
                            Local
                          </>
                        ) : (
                          "—"
                        )}
                      </span>
                      <span
                        className="truncate text-muted-foreground"
                        title={group.description}
                      >
                        {group.label}
                      </span>
                      <span className="flex items-center justify-end gap-1 tabular-nums text-muted-foreground">
                        {moved &&
                          (movedDelta < 0 ? (
                            <>
                              <IconArrowUp className="size-3 text-emerald-500" />
                              {Math.abs(movedDelta)}
                            </>
                          ) : (
                            <>
                              <IconArrowDown className="size-3 text-sky-500" />
                              {movedDelta}
                            </>
                          ))}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </ScrollArea>
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isBusy} onClick={close}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              onApply(plannedOrder);
              setHintsText("");
            }}
            disabled={isBusy || movedCount === 0}
          >
            Apply
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function StatChip({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px]">
      {icon}
      {label}
    </span>
  );
}

function Disclosure({
  summary,
  children,
}: {
  summary: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group mt-1.5 border-t border-border/60 pt-1.5">
      <summary className="flex cursor-pointer list-none items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground">
        <IconChevronDown className="size-3 transition-transform group-open:rotate-0 -rotate-90" />
        {summary}
      </summary>
      {children}
    </details>
  );
}
