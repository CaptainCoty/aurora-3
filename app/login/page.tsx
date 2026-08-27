import LoginForm from "./LoginForm";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-lg border border-panelBorder bg-panel p-8">
        <div className="mb-6 text-center">
          <h1 className="font-mono text-xl font-semibold tracking-wide text-ink">
            AURORA <span className="text-accent">3.0</span>
          </h1>
          <p className="mt-1 text-xs text-muted">KLAX private terminal</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
