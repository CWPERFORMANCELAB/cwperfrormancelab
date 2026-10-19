import type { Metadata, Viewport } from "next";
import { Inter, Inter_Tight } from "next/font/google";
import { business } from "@config/business";
import { RevealObserver } from "@/components/reveal";
import { token } from "@/lib/theme-tokens";
import { siteUrl } from "@/lib/url";
import "./globals.css";

// Brand fonts are set via --brand-font-* in config/theme.css; these load the faces they reference.
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
const tight = Inter_Tight({ variable: "--font-tight", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: business.seo.defaultTitle, template: business.seo.titleTemplate },
  description: business.description,
  keywords: [...business.seo.keywords],
  applicationName: business.name,
  openGraph: {
    type: "website",
    locale: "en_GB",
    siteName: business.name,
    title: business.seo.defaultTitle,
    description: business.description,
    images: [{ url: "/brand/og-image.png", width: 1200, height: 630, alt: business.name }],
  },
  twitter: { card: "summary_large_image", images: ["/brand/og-image.png"] },
  icons: {
    icon: [
      { url: "/brand/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/favicon-48.png", sizes: "48x48", type: "image/png" },
      { url: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/brand/apple-touch-icon.png",
  },
  formatDetection: { telephone: true, address: true },
};

export const viewport: Viewport = {
  themeColor: token("ink"),
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-GB" suppressHydrationWarning className={`${inter.variable} ${tight.variable} antialiased`}>
      <head>
        {/* Enables reveal animations only when JS runs, so content is never hidden without it. */}
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
      </head>
      <body className="min-h-dvh font-sans">
        {children}
        <RevealObserver />
      </body>
    </html>
  );
}
