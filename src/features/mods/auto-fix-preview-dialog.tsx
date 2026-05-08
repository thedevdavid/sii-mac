import { useState } from "react";
import {
  Sortable,
  SortableItem,
  SortableItemHandle,
} from "@/components/reui/sortable";
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
import { Textarea } from "@/components/cupertino/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/cupertino/button";
import {
  IconAlertTriangle,
  IconArrowDown,
  IconArrowUp,
  IconCheck,
  IconChevronDown,
  IconCircleOff,
  IconCloud,
  IconFolder,
  IconGripVertical,
  IconInfoCircle,
  IconLock,
  IconRefresh,
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
  // User-edited override over the auto-computed order. Null means "follow the
  // recipe" — typing in the recipe textarea resets back to null so the planned
  // order recomputes. Once the user drags a row, we capture the current order
  // here and any further drags edit it directly.
  const [userOrder, setUserOrder] = useState<ModId[] | null>(null);

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

  const { plannedOrder: autoPlannedOrder, matched } = analyzeAndReorder(
    entries,
    modsById,
    workshopMap,
    reorderInput,
  );

  // The order shown and applied. If the user dragged, their edits take over;
  // otherwise we follow the analyzer.
  const plannedOrder: ModId[] =
    userOrder && userOrder.length === autoPlannedOrder.length
      ? userOrder
      : autoPlannedOrder;
  const userEdited = userOrder !== null;

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
    setUserOrder(null);
    onOpenChange(false);
  };

  const handleSortableChange = (next: ModId[]) => {
    // Refuse moves that would shift a locked entry. The reui Sortable's
    // per-item `disabled` prop already blocks dragging the locked rows, but
    // a keyboard reorder could still try to move them past each other.
    const before = plannedOrder;
    if (next.length !== before.length) return;
    const lockedShifted = before.some(
      (id, i) => lockedById.get(id) && id !== next[i],
    );
    if (lockedShifted) return;
    setUserOrder(next);
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setHintsText("");
          setUserOrder(null);
        }
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
            Equal-priority mods keep their existing relative order. Drag a row
            on the right to override the planned order.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* Scrollable body — the dialog itself is height-bounded by
            cupertino AlertDialogContent. This wrapper absorbs any overflow
            from accordions, long mod lists, or pasted recipes. Header and
            footer stay pinned outside this region. */}
        <div className="-mx-4 grid min-h-0 grid-cols-1 gap-4 overflow-y-auto px-4 md:grid-cols-[minmax(0,22rem)_1fr]">
          {/* Left column — recipe input + diagnostics */}
          <div className="flex min-w-0 flex-col gap-2">
            <div className="space-y-1">
              <Label
                htmlFor="auto-fix-hints"
                className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
              >
                Recipe / hints
              </Label>
              <Textarea
                id="auto-fix-hints"
                value={hintsText}
                onChange={(e) => {
                  setHintsText(e.target.value);
                  // Editing the recipe re-runs the analyzer; drop any manual
                  // overrides so the user sees the fresh planned order.
                  setUserOrder(null);
                }}
                rows={textareaRows}
                placeholder={
                  "e.g.\nProMods Canada\nRealistic Brutal Weather\nSCS Trailer Pack"
                }
                /* `field-sizing-fixed` overrides the shadcn default
                   `field-sizing-content`, which makes the textarea grow
                   unboundedly with pasted content. With it fixed, `rows` and
                   `max-h` constrain the height and the internal scrollbar
                   kicks in for long recipes. */
                className="field-sizing-fixed max-h-72 overflow-y-auto font-mono text-[11px]"
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

          {/* Right column — planned order. Drag a row by its grip to override
              the analyzer's order; locked rows refuse drags. */}
          <div className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-md border border-border">
            <div className="flex items-center justify-between border-b border-border bg-muted/40 px-3 py-1.5">
              <div className="grid flex-1 grid-cols-[1.25rem_3rem_1fr_5rem_8rem_4.5rem] items-center gap-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                <span />
                <span className="text-right">#</span>
                <span>Mod</span>
                <span>Source</span>
                <span>Group</span>
                <span className="text-right">Move</span>
              </div>
              {userEdited && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="-my-1 h-6 gap-1 px-1.5 text-[10px] uppercase tracking-wider"
                  onClick={() => setUserOrder(null)}
                  disabled={isBusy}
                  title="Discard manual edits and re-run the analyzer"
                >
                  <IconRefresh className="size-3" />
                  Reset
                </Button>
              )}
            </div>
            <ScrollArea className="h-[55vh]">
              <Sortable
                value={plannedOrder}
                getItemValue={(id) => id}
                onValueChange={handleSortableChange}
                render={<ol className="divide-y divide-border" />}
              >
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
                    <SortablePlannedRow
                      key={modId}
                      modId={modId}
                      newIdx={newIdx}
                      recipeLine={recipeLine}
                      locked={locked}
                      displayName={displayName}
                      source={source}
                      groupLabel={group.label}
                      groupDescription={group.description}
                      moved={moved}
                      movedDelta={movedDelta}
                    />
                  );
                })}
              </Sortable>
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
              setUserOrder(null);
            }}
            disabled={isBusy || (movedCount === 0 && !userEdited)}
          >
            Apply
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

interface SortablePlannedRowProps {
  modId: ModId;
  newIdx: number;
  recipeLine: number | undefined;
  locked: boolean;
  displayName: string;
  source: FullModInfo["source"] | undefined;
  groupLabel: string;
  groupDescription: string;
  moved: boolean;
  movedDelta: number;
}

function SortablePlannedRow({
  modId,
  newIdx,
  recipeLine,
  locked,
  displayName,
  source,
  groupLabel,
  groupDescription,
  moved,
  movedDelta,
}: SortablePlannedRowProps) {
  return (
    <SortableItem
      value={modId}
      disabled={locked}
      render={<li />}
      className="grid grid-cols-[1.75rem_3rem_1fr_5rem_8rem_4.5rem] items-center gap-3 px-3 py-1.5 text-xs hover:bg-muted/30"
    >
      <SortableItemHandle
        cursor={false}
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={locked}
            aria-label={
              locked ? "Locked — cannot reorder" : "Drag to reorder"
            }
            title={locked ? "Locked — cannot reorder" : "Drag to reorder"}
            className="size-7 touch-none cursor-grab active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-30"
          />
        }
      >
        <IconGripVertical className="size-3.5" />
      </SortableItemHandle>
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
        <span className="truncate font-medium" title={displayName}>
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
        title={groupDescription}
      >
        {groupLabel}
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
    </SortableItem>
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
      <summary className="flex list-none items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground">
        <IconChevronDown className="size-3 transition-transform group-open:rotate-0 -rotate-90" />
        {summary}
      </summary>
      {children}
    </details>
  );
}
