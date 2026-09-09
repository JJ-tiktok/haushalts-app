import { BottomNav } from "@/components/bottom-nav";
import { RealtimeRefresh } from "@/components/realtime-refresh";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <main className="flex-1 px-4 pt-6 pb-28">{children}</main>
      <BottomNav />
      <RealtimeRefresh />
    </div>
  );
}
