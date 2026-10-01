import type { Metadata, Viewport } from 'next'
import './globals.css'

/**
 * Absolute base for the canonical and Open Graph URLs: social crawlers ignore a
 * relative URL. Resolved from the deployment when there is one, overridable with
 * `NEXT_PUBLIC_SITE_URL` for a custom domain.
 */
const SITE =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : 'http://localhost:5190')

/*
 * The meta are in Spanish, the app's only language for now: social crawlers (X,
 * Slack, Discord) don't run JavaScript, so the shared preview is always the served
 * HTML's. The tab title and `lang` are then kept in step client-side by `src/i18n`.
 *
 * No preview image yet.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: 'Sol de Mayo',
  description:
    'El Sol de Mayo de la flag argentina, vivo: rayos en 3D que giran con la cara y 16 expresiones dibujadas con los trazos del sol oficial.',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    title: 'Sol de Mayo',
    description:
      'El Sol de Mayo de la flag argentina, vivo: rayos en 3D y 16 expresiones dibujadas con los trazos del sol oficial.',
    siteName: 'Sol de Mayo',
    locale: 'es_AR',
    url: '/'
  },
  twitter: { card: 'summary' },
  icons: {
    /*
     * The `.ico` first and the SVG after: at equal relevance browsers keep the LAST
     * one, and we want the vector one when it's understood. The `.ico` is still
     * needed: Safari only reads SVG favicons from version 26. It embeds 16, 32 and
     * 48, each rendered from the SVG. The SVG follows `prefers-color-scheme`.
     */
    icon: [
      { url: '/favicon.ico', sizes: '16x16 32x32 48x48' },
      { url: '/favicon.svg', type: 'image/svg+xml' }
    ],
    // iOS flattens transparency to black: this one is opaque, on #f9f9f9
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }]
  }
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f9f9f9' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0c' }
  ]
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    // `lang` is rewritten on startup by `src/i18n`, hence the hydration warning opt-out
    <html lang="es-AR" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  )
}
