import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aurora 3.0",
  description: "KLAX weather prediction and trading decision support (private).",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-void font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
