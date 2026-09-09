import { ShoppingList } from "@/components/shopping-list";
import { getDoneShoppingItems, getProfiles, getShoppingItems } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function EinkaufPage() {
  const [open, done, profiles] = await Promise.all([
    getShoppingItems(),
    getDoneShoppingItems(),
    getProfiles(),
  ]);

  const profileMap = Object.fromEntries(
    profiles.map((p) => [p.id, { display_name: p.display_name, color: p.color }]),
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-ink">Einkauf</h1>
        <p className="mt-1 text-sm text-muted">
          Was fehlt, kommt sofort drauf. Beide sehen die Liste live.
        </p>
      </header>

      <ShoppingList open={open} done={done} profiles={profileMap} />
    </div>
  );
}
