import type { Metadata, Viewport } from "next";
import { Providers } from "@/components/app/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "LifeRoute", template: "%s · LifeRoute" },
  description: "나만의 하루·계획·자산·노트 관리",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "LifeRoute", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#F7F8FA",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-dvh">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
