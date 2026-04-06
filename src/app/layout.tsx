import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: "#7c3aed",
};

export const metadata: Metadata = {
  title: "AlKhayr Class",
  description: "Islamic school management system for tracking student Quran memorization progress (Tasmik) and conducting assessments",
  manifest: "/manifest.json",
  icons: {
    icon: [
      {
        url: '/logo-akademi.png',
        sizes: '32x32',
        type: 'image/png',
      },
      {
        url: '/logo-akademi.png',
        sizes: '16x16',
        type: 'image/png',
      },
    ],
    apple: '/logo-akademi.png',
    shortcut: '/logo-akademi.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ServiceWorkerRegistrar />
        {children}
      </body>
    </html>
  );
}
