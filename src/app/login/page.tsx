import { AuthForm } from "@/components/auth-form";

export const metadata = { title: "Anmelden – Haushalt" };

export default function LoginPage() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold text-ink">Haushalt</h1>
        <p className="mt-2 text-sm text-muted">Wer macht was – ohne Diskussion, ohne Vergessen.</p>
      </header>

      <AuthForm />

      <p className="mt-8 text-xs text-muted">
        Beide Personen legen sich je ein eigenes Konto an. Aufgaben, Verlauf und Verteilung sind
        danach für beide gleich sichtbar.
      </p>
    </div>
  );
}
