import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getOwnerSession } from "@liferoute/server/auth";
import { getDb } from "@liferoute/server/db";
import { loadWorkspace } from "@liferoute/server";
import { AppShell } from "@/components/shell/app-shell";
import { ToastProvider } from "@/components/app/toast";
import { WorkspaceProvider } from "@/lib/workspace";

export const dynamic = "force-dynamic";

/** Every page behind this layout requires the owner session (authorization, not just the proxy hint). */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getOwnerSession(await headers());
  if (!session) redirect("/login");
  const workspace = await loadWorkspace(getDb());
  return (
    <ToastProvider>
      <WorkspaceProvider initial={workspace}>
        <AppShell ownerName={session.name || session.email}>{children}</AppShell>
      </WorkspaceProvider>
    </ToastProvider>
  );
}
