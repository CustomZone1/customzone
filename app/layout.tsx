import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Container from "@/components/Container";

export const metadata: Metadata = {
  title: "CustomZone",
  description: "Tournament web app MVP (LocalStorage only)",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen text-zinc-100">
        <Navbar />
        <Container>{children}</Container>
      </body>
    </html>
  );
}
