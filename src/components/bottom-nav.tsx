"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "Heute", icon: HomeIcon },
  { href: "/dashboard", label: "Woche", icon: WeekIcon },
  { href: "/einkauf", label: "Einkauf", icon: CartIcon },
  { href: "/aufgaben", label: "Aufgaben", icon: ListIcon },
  { href: "/verlauf", label: "Verlauf", icon: ChartIcon },
  { href: "/profil", label: "Profil", icon: UserIcon },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Hauptnavigation"
    >
      <ul className="mx-auto flex max-w-lg">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-1 px-1 py-2.5 text-[10.5px] font-medium whitespace-nowrap transition-colors ${
                  active ? "text-accent" : "text-muted"
                }`}
              >
                <Icon active={active} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

type IconProps = { active: boolean };

function base(active: boolean) {
  return {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: active ? 2.2 : 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
}

function HomeIcon({ active }: IconProps) {
  return (
    <svg {...base(active)}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5.5 9.5V20a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.5" />
    </svg>
  );
}

function WeekIcon({ active }: IconProps) {
  return (
    <svg {...base(active)}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18" />
      <path d="M8 3v4M16 3v4" />
      <path d="M9 14h6" />
    </svg>
  );
}

function CartIcon({ active }: IconProps) {
  return (
    <svg {...base(active)}>
      <path d="M2.5 4h2l2.2 10.2a1.5 1.5 0 0 0 1.5 1.2h7.9a1.5 1.5 0 0 0 1.5-1.2L19 7H5.2" />
      <circle cx="9" cy="19.5" r="1.3" />
      <circle cx="16.5" cy="19.5" r="1.3" />
    </svg>
  );
}

function ListIcon({ active }: IconProps) {
  return (
    <svg {...base(active)}>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="m3.5 6 1.2 1.2L7 5" />
      <path d="m3.5 12 1.2 1.2L7 11" />
      <path d="m3.5 18 1.2 1.2L7 17" />
    </svg>
  );
}

function ChartIcon({ active }: IconProps) {
  return (
    <svg {...base(active)}>
      <path d="M4 20V10" />
      <path d="M10 20V4" />
      <path d="M16 20v-7" />
      <path d="M22 20H2" />
    </svg>
  );
}

function UserIcon({ active }: IconProps) {
  return (
    <svg {...base(active)}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </svg>
  );
}
