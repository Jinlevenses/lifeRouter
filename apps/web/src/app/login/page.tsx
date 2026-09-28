import type { Metadata } from "next";
import { safeNextPath } from "@/lib/safe-next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "로그인" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next } = await searchParams;
  // Only same-origin paths are allowed as a post-login destination.
  const safeNext = safeNextPath(next);
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="card w-full max-w-sm p-6 sm:p-8">
        <div className="mb-6">
          <p className="text-sm font-semibold tracking-wide text-accent">LifeRoute</p>
          <h1 className="mt-1 text-xl font-bold">로그인</h1>
          <p className="mt-1 text-sm text-ink-muted">이 서비스는 소유자 한 명만 사용합니다.</p>
        </div>
        <LoginForm next={safeNext} />
      </div>
    </main>
  );
}
