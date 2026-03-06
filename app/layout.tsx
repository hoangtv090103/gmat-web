import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import "@/lib/fontawesome";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "GMAT Focus Edition Simulator",
  description:
    "Practice for the GMAT Focus Edition with realistic exam simulation, question bank import, deep analytics, and performance tracking.",
  keywords: [
    "GMAT",
    "exam simulator",
    "practice",
    "Focus Edition",
    "test prep",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} font-sans antialiased`}>
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
