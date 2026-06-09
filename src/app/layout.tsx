import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { TauriDesktopGuard } from "@/components/TauriDesktopGuard";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Dictum",
  description:
    "Local voice-to-text for macOS. Whisper on-device, global hotkey, auto-paste.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col overflow-x-hidden bg-background selection:bg-dictum-iris/30 selection:text-white">
        <TauriDesktopGuard />
        {children}
      </body>
    </html>
  );
}
