import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Voxel Game",
  description: "Isometric voxel builder",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body style={{ width: "100%", height: "100%", overflow: "hidden" }}>
        {children}
      </body>
    </html>
  );
}
