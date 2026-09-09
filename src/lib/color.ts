/** Auswahl an Profilfarben, die auf hellem und dunklem Grund funktionieren. */
export const PROFILE_COLORS = [
  "#3f6b5a",
  "#2f6f9f",
  "#7a4fa3",
  "#b0503c",
  "#c08a1e",
  "#4d7a2f",
  "#a8446e",
  "#4a5568",
] as const;

/** Relative Helligkeit nach WCAG. */
function luminance(hex: string): number {
  const value = hex.replace("#", "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((c) => c + c)
          .join("")
      : value;

  const channels = [0, 2, 4].map((i) => {
    const c = parseInt(full.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** Schwarz oder Weiß – je nachdem, was auf der Farbe besser lesbar ist. */
export function readableInk(hex: string): string {
  try {
    return luminance(hex) > 0.45 ? "#15130f" : "#ffffff";
  } catch {
    return "#ffffff";
  }
}

/** Dieselbe Farbe als dezenter Flächenton. */
export function tint(hex: string, alpha = 0.14): string {
  const value = hex.replace("#", "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((c) => c + c)
          .join("")
      : value;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** "Anna Beispiel" -> "AB", "Jonas" -> "JO" */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
