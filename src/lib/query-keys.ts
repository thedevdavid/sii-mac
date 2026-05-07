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
    detailPrefix: (basePath: string) =>
      ["playsets", "detail", basePath] as const,
    active: (basePath: string, profilePath: string) =>
      ["playsets", "active", basePath, profilePath] as const,
    activePrefix: (basePath: string) =>
      ["playsets", "active", basePath] as const,
    drift: (basePath: string, profilePath: string, playsetId: string) =>
      ["playsets", "drift", basePath, profilePath, playsetId] as const,
    driftPrefix: (basePath: string, profilePath?: string) =>
      profilePath !== undefined
        ? (["playsets", "drift", basePath, profilePath] as const)
        : (["playsets", "drift", basePath] as const),
  },
  workshop: {
    metadataFor: (basePath: string, ids: string[]) =>
      ["workshop", "metadata", basePath, ids.slice().sort().join(",")] as const,
  },
  backups: {
    all: () => ["backups"] as const,
  },
  config: {
    game: (basePath: string) => ["config", basePath] as const,
  },
};
