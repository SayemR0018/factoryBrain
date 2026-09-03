import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "THALAMUS — Business Brain for Bangladesh SMEs",
  description: "Understands your business, then assembles the AI that runs it.",
  applicationName: "THALAMUS",
  icons: {
    icon: [
      { url: "/Thalamus_logo.png", type: "image/png", sizes: "any" }
    ],
    apple: [{ url: "/Thalamus_logo.png" }]
  }
};

/* Inline script that applies the saved theme before React hydrates so
   there is no flash. The same `thalamus:*` localStorage keys are used
   for app state, so we only need to read the dedicated theme key. */
const themeBootstrap = `
(function() {
  try {
    var stored = window.localStorage.getItem('thalamus:theme');
    var sys = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    var theme = stored === 'light' || stored === 'dark' ? stored : (stored === 'system' ? sys : 'dark');
    var root = document.documentElement;
    if (theme === 'light') {
      root.classList.add('light');
      root.classList.remove('dark');
    } else {
      root.classList.add('dark');
      root.classList.remove('light');
    }
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
        <meta name="theme-color" content="#0B0E14" />
      </head>
      <body>{children}</body>
    </html>
  );
}