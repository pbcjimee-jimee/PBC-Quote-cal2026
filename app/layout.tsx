import type { Metadata, Viewport } from "next";
import { InstallGuidanceProvider } from "@/components/pwa/install-guidance";
import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register";
import "./globals.css";

export const metadata: Metadata = {
  title: "PBC Quote Calculator",
  description: "Internal quote automation for PBC",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "PBC Quotes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0b66d8",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <InstallGuidanceProvider>{children}</InstallGuidanceProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
