/** Brand-specific colors for visual identification. */
const BRAND_COLORS: Record<string, string> = {
  peterbilt: "#c0392b",
  kenworth: "#2471a3",
  freightliner: "#1a5276",
  volvo: "#2c3e50",
  mack: "#b7950b",
  international: "#922b21",
  western_star: "#1b4f72",
  // ETS2 brands
  scania: "#e67e22",
  man: "#7d3c98",
  daf: "#2e86c1",
  iveco: "#148f77",
  renault: "#f1c40f",
  mercedes: "#566573",
};

/** Get a brand accent color, with fallback. */
export function getBrandColor(brand: string | null | undefined): string {
  if (!brand) return "#6b7280";
  const key = brand.toLowerCase().split(/[\s._]+/)[0];
  return BRAND_COLORS[key] ?? "#6b7280";
}

/** Format a brand slug into a display name. */
export function getBrandDisplayName(brand: string | null | undefined): string {
  if (!brand) return "Unknown";
  return brand
    .replace(/[._]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
