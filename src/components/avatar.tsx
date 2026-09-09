import type { Profile } from "@/lib/database.types";
import { initials, readableInk } from "@/lib/color";

const SIZES = {
  sm: "h-6 w-6 text-[10px]",
  md: "h-9 w-9 text-xs",
  lg: "h-12 w-12 text-sm",
} as const;

export function Avatar({
  profile,
  size = "md",
}: {
  profile: Pick<Profile, "display_name" | "color">;
  size?: keyof typeof SIZES;
}) {
  return (
    <span
      className={`${SIZES[size]} inline-flex shrink-0 items-center justify-center rounded-full font-semibold tracking-wide`}
      style={{ backgroundColor: profile.color, color: readableInk(profile.color) }}
      aria-hidden
    >
      {initials(profile.display_name)}
    </span>
  );
}

export function PersonChip({
  profile,
  label,
}: {
  profile: Pick<Profile, "display_name" | "color">;
  label?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: profile.color }}
        aria-hidden
      />
      <span className="text-sm font-medium">{label ?? profile.display_name}</span>
    </span>
  );
}
