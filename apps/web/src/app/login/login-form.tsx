"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { safeNextPath } from "@/lib/safe-next";

export function LoginForm({ next }: { next: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    const { error } = await authClient.signIn.email({
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      rememberMe: true,
    });
    setPending(false);
    if (error) {
      setError(
        error.status === 429
          ? "시도가 너무 많습니다. 1분 뒤 다시 시도하세요."
          : "이메일 또는 비밀번호가 올바르지 않습니다.",
      );
      return;
    }
    window.location.assign(safeNextPath(next));
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div>
        <label htmlFor="email" className="label">
          이메일
        </label>
        <input id="email" name="email" type="email" autoComplete="username" required className="field" />
      </div>
      <div>
        <label htmlFor="password" className="label">
          비밀번호
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="field"
        />
      </div>
      {error ? (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-[10px] bg-accent px-4 py-2.5 text-[15px] font-semibold text-white hover:bg-accent-strong disabled:opacity-60"
      >
        {pending ? "확인 중…" : "로그인"}
      </button>
      <p className="text-xs text-ink-subtle">
        계정이 없다면 서버에서 <code className="font-mono">pnpm owner:create</code>를 실행하세요.
      </p>
    </form>
  );
}
