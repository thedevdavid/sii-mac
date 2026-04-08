import { useProfileDetail } from "@/hooks/use-profiles";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Save } from "lucide-react";
import type { ProfileSummary } from "@/lib/types";

interface ProfileSavesProps {
  profile: ProfileSummary;
}

export function ProfileSaves({ profile }: ProfileSavesProps) {
  const { data: detail, isLoading } = useProfileDetail(profile.path);

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      </div>
    );
  }

  if (!detail) return null;

  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 p-6">
        <h2 className="text-xl font-semibold">
          Saves ({detail.saves.length})
        </h2>
        {detail.saves.length === 0 ? (
          <p className="py-12 text-center text-muted-foreground">
            No saves found for this profile
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {detail.saves.map((save) => (
              <Card key={save.path}>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <Save className="size-4 shrink-0 text-muted-foreground" />
                    <CardTitle className="truncate text-sm">
                      {save.name}
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  {save.last_modified && (
                    <p className="text-xs text-muted-foreground">
                      {save.last_modified}
                    </p>
                  )}
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {save.directory_name}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
