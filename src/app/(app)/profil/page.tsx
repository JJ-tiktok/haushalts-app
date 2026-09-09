import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { ProfileForm } from "@/components/profile-form";
import { PushToggle } from "@/components/push-toggle";
import { CalendarSubscription } from "@/components/calendar-subscription";
import { signOut } from "@/lib/actions";
import { pushIsConfigured } from "@/lib/push";
import { getCurrentProfile, getMyPushDeviceCount, getProfiles } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function ProfilPage() {
  const [me, profiles, pushDevices] = await Promise.all([
    getCurrentProfile(),
    getProfiles(),
    getMyPushDeviceCount(),
  ]);
  if (!me) redirect("/login");

  // Absolute Adresse für das Kalender-Abo aus dem Request ableiten.
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  const protokoll =
    headerList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protokoll}://${host}`;

  const andere = profiles.filter((p) => p.id !== me.id);

  return (
    <div className="space-y-8">
      <header className="flex items-center gap-3">
        <Avatar profile={me} size="lg" />
        <div>
          <h1 className="text-2xl font-semibold text-ink">{me.display_name}</h1>
          <p className="text-sm text-muted">Dein Profil</p>
        </div>
      </header>

      <ProfileForm profile={me} />

      <PushToggle deviceCount={pushDevices} serverReady={pushIsConfigured()} />

      <CalendarSubscription origin={origin} token={me.calendar_token} />

      <section>
        <h2 className="mb-3 text-sm font-semibold text-ink">Haushalt</h2>
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          {[me, ...andere].map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-4 py-3">
              <Avatar profile={p} size="sm" />
              <span className="flex-1 text-sm text-ink">{p.display_name}</span>
              {p.away_until && (
                <span className="text-xs text-muted">
                  abwesend bis {p.away_until.split("-").reverse().join(".")}
                </span>
              )}
            </li>
          ))}
        </ul>
        {andere.length === 0 && (
          <p className="mt-2 text-xs text-muted">
            Die zweite Person registriert sich einfach selbst auf der Anmeldeseite.
          </p>
        )}
      </section>

      <form action={signOut}>
        <button
          type="submit"
          className="w-full rounded-xl border border-border py-2.5 text-sm font-medium text-muted"
        >
          Abmelden
        </button>
      </form>
    </div>
  );
}
