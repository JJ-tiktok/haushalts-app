import Link from "next/link";
import { TaskForm } from "@/components/task-form";
import { createTask } from "@/lib/actions";

export default function NeueAufgabePage() {
  return (
    <div className="space-y-6">
      <header>
        <Link href="/aufgaben" className="text-sm font-medium text-accent">
          ← Aufgaben
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-ink">Neue Aufgabe</h1>
      </header>

      <TaskForm action={createTask} />
    </div>
  );
}
