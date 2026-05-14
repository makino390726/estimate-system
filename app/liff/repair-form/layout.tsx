import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
    title: '修理依頼フォーム',
    description: 'LINE修理依頼フォーム',
}

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
}

export default function LiffLayout({ children }: { children: React.ReactNode }) {
    return children
}
