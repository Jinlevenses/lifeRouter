import type { Metadata } from "next";
import { Route } from "lucide-react";
import { safeNextPath } from "@/lib/safe-next";
import { AuroraText } from "@/components/ui/aurora-text";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { DotPattern } from "@/components/ui/dot-pattern";
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
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4">
      <DotPattern
        width={22}
        height={22}
        className="text-primary/25 [mask-image:radial-gradient(520px_circle_at_center,white,transparent)]"
      />
      <Card className="relative w-full max-w-sm gap-6 shadow-lg">
        <CardHeader className="gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-teal-500 text-primary-foreground shadow-sm">
            <Route className="size-5" aria-hidden />
          </span>
          <div>
            <p className="text-sm font-semibold tracking-wide">
              <AuroraText colors={["#0f766e", "#14b8a6", "#1d4ed8", "#0f766e"]} speed={0.6}>
                LifeRoute
              </AuroraText>
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">로그인</h1>
          </div>
          <CardDescription>이 서비스는 소유자 한 명만 사용합니다.</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm next={safeNext} />
        </CardContent>
      </Card>
    </main>
  );
}
