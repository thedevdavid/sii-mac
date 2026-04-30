import React from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useProfileDetail } from "@/hooks/use-profiles";
import { ScrollArea } from "@/components/cupertino/scroll-area";
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Empty,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { IconArrowsExchange } from "@tabler/icons-react";
import { calculateLevel } from "@/lib/level-calc";
import { getBrandDisplayName } from "@/lib/truck-brands";
import {
  gameDisplayName,
  installSourceLabel,
  ProfilePathSchema,
  type Game,
  type GameInstallation,
  type ProfilePath,
} from "@/lib/core-types";
import type { ProfileDetail, ProfileSummary } from "@/features/profiles/types";
import { format } from "date-fns";

interface ProfileCompareProps {
  installations: GameInstallation[];
  profilesByInstallation: Map<string, ProfileSummary[]>;
}

function formatTs(ts: string | null | undefined): string {
  if (ts == null) return "—";
  return format(new Date(ts), "PPp");
}

function DiffRow({
  label,
  valueA,
  valueB,
}: {
  label: string;
  valueA: React.ReactNode;
  valueB: React.ReactNode;
}) {
  const aStr = String(valueA ?? "—");
  const bStr = String(valueB ?? "—");
  const isDiff = aStr !== bStr;

  return (
    <div
      className={`grid grid-cols-[1fr_1fr_1fr] items-center gap-2 rounded px-2 py-1.5 text-xs ${isDiff ? "bg-primary/5" : ""}`}
    >
      <span className={`font-medium ${isDiff ? "text-primary" : "text-muted-foreground"}`}>
        {label}
      </span>
      <span className="text-right">{valueA ?? "—"}</span>
      <span className="text-right">{valueB ?? "—"}</span>
    </div>
  );
}

function NumericDiffRow({
  label,
  a,
  b,
  prefix = "",
  suffix = "",
}: {
  label: string;
  a: number | null | undefined;
  b: number | null | undefined;
  prefix?: string;
  suffix?: string;
}) {
  const aVal = a ?? 0;
  const bVal = b ?? 0;
  const diff = bVal - aVal;
  const diffStr =
    diff > 0 ? `+${diff.toLocaleString()}` : diff < 0 ? diff.toLocaleString() : "";

  return (
    <DiffRow
      label={label}
      valueA={a != null ? `${prefix}${a.toLocaleString()}${suffix}` : "—"}
      valueB={
        b != null ? (
          <span>
            {prefix}{b.toLocaleString()}{suffix}
            {diffStr && (
              <span className={`ml-1 text-[10px] ${diff > 0 ? "text-green-500" : "text-red-500"}`}>
                ({diffStr})
              </span>
            )}
          </span>
        ) : "—"
      }
    />
  );
}

function ComparisonGrid({
  detailA,
  detailB,
  gameA,
  gameB,
}: {
  detailA: ProfileDetail;
  detailB: ProfileDetail;
  gameA: Game;
  gameB: Game;
}) {
  const xpA = detailA.cached_experience ?? detailA.experience_points ?? 0;
  const xpB = detailB.cached_experience ?? detailB.experience_points ?? 0;
  const levelA = calculateLevel(xpA, gameA);
  const levelB = calculateLevel(xpB, gameB);

  const modsA = new Set(detailA.active_mods?.map((m) => m.id) ?? []);
  const modsB = new Set(detailB.active_mods?.map((m) => m.id) ?? []);
  const modsOnlyA = (detailA.active_mods ?? []).filter((m) => !modsB.has(m.id));
  const modsOnlyB = (detailB.active_mods ?? []).filter((m) => !modsA.has(m.id));
  const modsShared = (detailA.active_mods ?? []).filter((m) => modsB.has(m.id));

  return (
    <div className="space-y-4">
      {/* Headers */}
      <div className="grid grid-cols-[1fr_1fr_1fr] gap-2 text-xs font-medium text-muted-foreground">
        <span>Field</span>
        <span className="text-right">Profile A</span>
        <span className="text-right">Profile B</span>
      </div>

      {/* Player */}
      <div className="rounded-lg border p-2">
        <h4 className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Player
        </h4>
        <NumericDiffRow label="Money" a={detailA.money} b={detailB.money} prefix="$" />
        <NumericDiffRow label="Experience" a={xpA} b={xpB} />
        <DiffRow label="Level" valueA={levelA.level} valueB={levelB.level} />
        <NumericDiffRow label="Distance" a={detailA.cached_distance} b={detailB.cached_distance} />
        <NumericDiffRow label="Saves" a={detailA.save_count} b={detailB.save_count} />
      </div>

      {/* Vehicle */}
      <div className="rounded-lg border p-2">
        <h4 className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Vehicle & World
        </h4>
        <DiffRow
          label="Truck"
          valueA={getBrandDisplayName(detailA.brand)}
          valueB={getBrandDisplayName(detailB.brand)}
        />
        <DiffRow
          label="Map"
          valueA={detailA.map_path?.includes("usa") ? "USA" : detailA.map_path ? "Europe" : "—"}
          valueB={detailB.map_path?.includes("usa") ? "USA" : detailB.map_path ? "Europe" : "—"}
        />
      </div>

      {/* Profile Info */}
      <div className="rounded-lg border p-2">
        <h4 className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Profile
        </h4>
        <DiffRow label="Company" valueA={detailA.company_name} valueB={detailB.company_name} />
        <DiffRow label="WoT" valueA={detailA.online_user_name} valueB={detailB.online_user_name} />
        <DiffRow label="Created" valueA={formatTs(detailA.creation_time)} valueB={formatTs(detailB.creation_time)} />
        <DiffRow label="Version" valueA={detailA.version ? `v${detailA.version}` : "—"} valueB={detailB.version ? `v${detailB.version}` : "—"} />
        <DiffRow label="Modified" valueA={detailA.last_modified} valueB={detailB.last_modified} />
      </div>

      {/* Mods diff */}
      <div className="rounded-lg border p-2">
        <h4 className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Mods ({(detailA.active_mods?.length ?? 0)} vs {(detailB.active_mods?.length ?? 0)})
        </h4>
        <div className="space-y-1 text-xs">
          {modsShared.length > 0 && (
            <p className="text-muted-foreground">{modsShared.length} shared mods</p>
          )}
          {modsOnlyA.length > 0 && (
            <div>
              <p className="font-medium text-red-500">Only in Profile A ({modsOnlyA.length}):</p>
              {modsOnlyA.map((m) => (
                <p key={m.id} className="ml-2 text-muted-foreground">{m.display_name}</p>
              ))}
            </div>
          )}
          {modsOnlyB.length > 0 && (
            <div>
              <p className="font-medium text-green-500">Only in Profile B ({modsOnlyB.length}):</p>
              {modsOnlyB.map((m) => (
                <p key={m.id} className="ml-2 text-muted-foreground">{m.display_name}</p>
              ))}
            </div>
          )}
          {modsOnlyA.length === 0 && modsOnlyB.length === 0 && modsShared.length > 0 && (
            <p className="text-muted-foreground">Identical mod lists</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function ProfileCompare({
  installations,
  profilesByInstallation,
}: ProfileCompareProps) {
  // Selection state lives in the URL so it survives navigation, deep-linking,
  // and browser history. Derived game labels come from the same source.
  const { pathA = "", pathB = "" } = useSearch({ from: "/compare" });
  const navigate = useNavigate({ from: "/compare" });

  // Raw search-param strings need re-branding because the router erases the
  // brand when round-tripping through `undefined` → `string`.
  const brandedA: ProfilePath | undefined = pathA
    ? ProfilePathSchema.parse(pathA)
    : undefined;
  const brandedB: ProfilePath | undefined = pathB
    ? ProfilePathSchema.parse(pathB)
    : undefined;

  const { data: detailA, isLoading: loadingA } = useProfileDetail(brandedA);
  const { data: detailB, isLoading: loadingB } = useProfileDetail(brandedB);

  const allProfiles: {
    profile: ProfileSummary;
    installation: GameInstallation;
  }[] = [];
  for (const inst of installations) {
    const profiles = profilesByInstallation.get(inst.base_path) ?? [];
    for (const p of profiles) {
      allProfiles.push({ profile: p, installation: inst });
    }
  }

  const gameA: Game =
    allProfiles.find((p) => p.profile.path === pathA)?.installation.game ?? "ats";
  const gameB: Game =
    allProfiles.find((p) => p.profile.path === pathB)?.installation.game ?? "ats";

  function handleSelectA(path: string) {
    navigate({ search: (prev) => ({ ...prev, pathA: path || undefined }) });
  }

  function handleSelectB(path: string) {
    navigate({ search: (prev) => ({ ...prev, pathB: path || undefined }) });
  }

  const renderProfileOptions = () =>
    installations.map((inst) => {
      const profiles = profilesByInstallation.get(inst.base_path) ?? [];
      return (
        <optgroup
          key={inst.base_path}
          label={`${gameDisplayName(inst.game)} (${installSourceLabel(inst.source)})`}
        >
          {profiles.map((p) => (
            <option key={p.path} value={p.path}>
              {p.name}
              {p.company_name ? ` — ${p.company_name}` : ""}
            </option>
          ))}
        </optgroup>
      );
    });

  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 p-5">
        <h2 className="text-sm font-semibold">Compare Profiles</h2>

        {/* Profile selectors */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
          <div className="space-y-1">
            <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Profile A
            </label>
            <NativeSelect
              value={pathA}
              onChange={(e) => handleSelectA(e.target.value)}
              className="w-full"
            >
              <option value="">Select profile...</option>
              {renderProfileOptions()}
            </NativeSelect>
          </div>

          <IconArrowsExchange className="mb-1 size-5 text-muted-foreground" />

          <div className="space-y-1">
            <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Profile B
            </label>
            <NativeSelect
              value={pathB}
              onChange={(e) => handleSelectB(e.target.value)}
              className="w-full"
            >
              <option value="">Select profile...</option>
              {renderProfileOptions()}
            </NativeSelect>
          </div>
        </div>

        {/* Comparison content */}
        {!pathA && !pathB ? (
          <Empty>
            <EmptyMedia>
              <IconArrowsExchange className="size-6 text-muted-foreground" />
            </EmptyMedia>
            <EmptyTitle>Select two profiles</EmptyTitle>
            <EmptyDescription>
              Choose profiles to compare using the dropdowns above.
            </EmptyDescription>
          </Empty>
        ) : (loadingA || loadingB) ? (
          <div className="space-y-3">
            <Skeleton className="h-40 rounded-lg" />
            <Skeleton className="h-40 rounded-lg" />
          </div>
        ) : detailA && detailB ? (
          <ComparisonGrid detailA={detailA} detailB={detailB} gameA={gameA} gameB={gameB} />
        ) : (
          <p className="py-8 text-center text-xs text-muted-foreground">
            {!pathA ? "Select Profile A" : !pathB ? "Select Profile B" : "Could not load profile data"}
          </p>
        )}
      </div>
    </ScrollArea>
  );
}
