import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "RAG Demo",
  description: "Ask questions over your own documents, answered with citations.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
