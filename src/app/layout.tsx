import type { Metadata } from 'next'
import { IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google'
import './globals.css'

const sans = IBM_Plex_Sans({
  variable: '--fuente-sans',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
})

const mono = IBM_Plex_Mono({
  variable: '--fuente-mono',
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'INPOL',
    template: '%s · INPOL',
  },
  description: 'Plataforma de gestión social e inteligencia política.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-MX" className={`${sans.variable} ${mono.variable} h-full`}>
      <body className="min-h-full">{children}</body>
    </html>
  )
}
