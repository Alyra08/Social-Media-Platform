import type { Metadata, Viewport } from "next";
import { Anton, Cormorant_Garamond, Mrs_Saint_Delafield, Nunito_Sans } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["300", "400"], style: ["normal", "italic"], variable: "--font-cormorant" });
const nunito = Nunito_Sans({ subsets: ["latin"], weight: ["400", "700", "800"], variable: "--font-nunito" });
const anton = Anton({ subsets: ["latin"], weight: "400", variable: "--font-anton" });
const delafield = Mrs_Saint_Delafield({ subsets: ["latin"], weight: "400", variable: "--font-delafield" });
const brolia = localFont({ src: "./BroliaRegular.otf", variable: "--font-brolia" });

export const metadata: Metadata = {
  title: "SBF Studio",
  description: "Simply Being Female editorial intelligence and social media studio.",
};

export const viewport: Viewport = { themeColor: "#F6DDF1" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU" className={`${cormorant.variable} ${nunito.variable} ${anton.variable} ${delafield.variable} ${brolia.variable}`}>
      <body>{children}</body>
    </html>
  );
}
