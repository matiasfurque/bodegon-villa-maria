import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bodegon Villa Maria",
  description: "Plataforma de gestion para Bodegon Villa Maria"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
