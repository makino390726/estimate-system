import type { Metadata, Viewport } from 'next'
import './repair-mobile.css'

export const metadata: Metadata = {
    title: '修理対応',
    description: '現場スタッフ向け修理案件対応',
}

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    themeColor: '#0f172a',
}

export default function RepairMobileLayout({ children }: { children: React.ReactNode }) {
    return <div className="repair-mobile-root">{children}</div>
}
