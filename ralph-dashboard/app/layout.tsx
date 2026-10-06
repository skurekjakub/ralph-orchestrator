import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ralph Status",
  description: "Status dashboard for the Ralph AI documentation agent",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-gray-950 text-gray-100 font-mono antialiased min-h-screen">{children}</body>
    </html>
  );
}
