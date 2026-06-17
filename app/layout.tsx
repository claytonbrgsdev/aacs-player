import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL('https://claytonbrgsdev.github.io/aacs-player/'),
  title: 'A.S.A. Player',
  description: 'Audio Scope Analyzer — oscilloscope, spectrum and CHU visualizer for Azulbic tracks.',
  applicationName: 'A.S.A. Player',
  openGraph: {
    title: 'A.S.A. Player',
    description: 'Audio Scope Analyzer — oscilloscope, spectrum and CHU visualizer for Azulbic tracks.',
    url: 'https://claytonbrgsdev.github.io/aacs-player/',
    siteName: 'A.S.A. Player',
    images: [
      {
        url: 'https://claytonbrgsdev.github.io/aacs-player/og-image.png',
        width: 1200,
        height: 630,
        alt: 'A.S.A. Player interface with oscilloscope, spectrum analyzer and CHU monitor',
      },
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'A.S.A. Player',
    description: 'Audio Scope Analyzer — oscilloscope, spectrum and CHU visualizer for Azulbic tracks.',
    images: ['https://claytonbrgsdev.github.io/aacs-player/og-image.png'],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <head>
        <style>{`
html {
  font-family: ${GeistSans.style.fontFamily};
  --font-sans: ${GeistSans.variable};
  --font-mono: ${GeistMono.variable};
}
        `}</style>
      </head>
      <body>{children}</body>
    </html>
  )
}
