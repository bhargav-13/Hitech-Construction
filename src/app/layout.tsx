import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { SessionGuard } from "@/components/SessionGuard";
import { WebLocationReporter } from "@/components/WebLocationReporter";
import { TenderAnalysisSync } from "@/components/tender/TenderAnalysisSync";
import { GlobalFilePreview } from "@/components/GlobalFilePreview";
import { ChecklistPopupGate } from "@/components/task/ChecklistPopupGate";
import { TrialGate } from "@/components/TrialGate";
import { BRAND_ICON, BRAND_NAME, WHITE_LABEL } from "@/lib/brand";

// Inter — the workhorse UI typeface used across production ERP / SaaS dashboards.
const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: BRAND_NAME,
  description: WHITE_LABEL ? "Construction management platform" : `${BRAND_NAME} internal management platform`,
  icons: { icon: BRAND_ICON },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="h-full">
        <SessionGuard />
        <WebLocationReporter />
        <TenderAnalysisSync />
        {children}
        <GlobalFilePreview />
        <ChecklistPopupGate />
        <TrialGate />
      </body>
    </html>
  );
}
