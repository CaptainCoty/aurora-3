"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (res.status === 429) {
        setError("Too many attempts. Try again later.");
        return;
      }

      if (!res.ok) {
        setError("Incorrect password.");
        return;
      }

      router.push("/outcomes");
      router.refresh();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="password" className="mb-1 block text-xs text-muted">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded border border-panelBorder bg-void px-3 py-2 font-mono text-sm text-ink outline-none focus:border-accent"
        />
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}

      <button
        type="submit"
        disabled={submitting || password.length === 0}
        className="w-full rounded bg-accentDim px-3 py-2 text-sm font-medium text-white transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? "Verifying..." : "Enter"}
      </button>
    </form>
  );
}
