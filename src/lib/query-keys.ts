/** Centralized query key factory for all TanStack Query cache operations. */
export const queryKeys = {
  installations: {
    all: () => ["installations"] as const,
  },
  profiles: {
    list: (profilesPath: string) => ["profiles", profilesPath] as const,
    detail: (profilePath: string) => ["profiles", "detail", profilePath] as const,
    contents: (profilePath: string) => ["profiles", "contents", profilePath] as const,
  },
  saves: {
    data: (savePath: string) => ["saves", savePath] as const,
  },
  mods: {
    scan: (basePath: string) => ["mods", basePath] as const,
  },
  playsets: {
    list: (basePath: string) => ["playsets", "list", basePath] as const,
    detail: (basePath: string, playsetId: string) =>
      ["playsets", "detail", basePath, playsetId] as const,
    active: (profilePath: string) => ["playsets", "active", profilePath] as const,
    drift: (profilePath: string, playsetId: string) =>
      ["playsets", "drift", profilePath, playsetId] as const,
  },
  workshop: {
    metadata: (basePath: string) => ["workshop", "metadata", basePath] as const,
  },
  backups: {
    all: () => ["backups"] as const,
  },
  config: {
    game: (basePath: string) => ["config", basePath] as const,
  },
};
