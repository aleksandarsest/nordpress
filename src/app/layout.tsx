import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { getSettings } from "@/lib/options";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSettings();
  return {
    title: { default: settings.title, template: `%s – ${settings.title}` },
    description: settings.tagline,
    robots: settings.blogPublic ? undefined : { index: false, follow: false },
    alternates: {
      types: {
        "application/rss+xml": [{ url: "/feed", title: settings.title }],
      },
    },
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Cached, so the shell stays static; translated posts set their own lang
  const { defaultLanguage } = await getSettings();
  return (
    <html
      lang={defaultLanguage}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
