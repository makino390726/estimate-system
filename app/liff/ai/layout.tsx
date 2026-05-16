import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
    title: 'AI診断',
    description: 'LINE AI診断（修理ナレッジ）',
}

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
}

export default function LiffAiLayout({ children }: { children: React.ReactNode }) {
    return children
}
