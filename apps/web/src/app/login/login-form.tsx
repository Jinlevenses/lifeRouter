"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { safeNextPath } from "@/lib/safe-next";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

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
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup className="gap-4">
        <Field className="gap-1.5">
          <FieldLabel htmlFor="email">이메일</FieldLabel>
          <Input id="email" name="email" type="email" autoComplete="username" required />
        </Field>
        <Field className="gap-1.5">
          <FieldLabel htmlFor="password">비밀번호</FieldLabel>
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </Field>
        {error ? (
          <Alert variant="destructive" className="border-destructive/30 bg-destructive/5">
            <AlertCircle aria-hidden />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <Button type="submit" size="lg" disabled={pending} className="w-full">
          {pending ? <Spinner /> : null}
          {pending ? "확인 중…" : "로그인"}
        </Button>
        <FieldDescription className="text-xs">
          계정이 없다면 서버에서 <code className="font-mono">pnpm owner:create</code>를 실행하세요.
        </FieldDescription>
      </FieldGroup>
    </form>
  );
}
