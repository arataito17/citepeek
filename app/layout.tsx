import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Citepeek — 引用の先を、その場で読む",
  description: "PDFの引用番号からアブストラクトと無料の日本語訳へ。DOIで照合し、ブラウザやMac・GPUサーバーで翻訳する論文リーダー。",
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
    <html lang="ja">
      <body className="antialiased">{children}</body>
    </html>
  );
}
