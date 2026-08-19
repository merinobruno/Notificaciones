import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Notificaciones laborales | Senderos de Raza",
  description:
    "Revisá fichadas y generá notificaciones laborales en formato Word.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es-AR">
      <body>{children}</body>
    </html>
  );
}
