'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { IconType } from 'react-icons'
import { FiArrowLeft, FiBarChart2, FiLayers, FiRepeat, FiUsers } from 'react-icons/fi'
import { SALES_ANALYSIS_GROUPS } from '@/lib/salesAnalysisMenu'

const GROUP_LOOK: Record<string, { icon: IconType; tone: string }> = {
  経営ダッシュボード: { icon: FiBarChart2, tone: 'blue' },
  年度比較分析: { icon: FiRepeat, tone: 'violet' },
  詳細分析: { icon: FiLayers, tone: 'teal' },
  '営業・顧客分析': { icon: FiUsers, tone: 'amber' },
}

export default function SalesAnalysisLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="sa-shell">
      <aside className="sa-side">
        <div className="sa-side-head">
          <p className="sa-kicker">SALES ANALYSIS</p>
          <h1>売上分析</h1>
          <Link href="/selectors" className="sa-back">
            <FiArrowLeft aria-hidden="true" />
            メニューへ戻る
          </Link>
        </div>
        <nav className="sa-nav" aria-label="売上分析メニュー">
          {SALES_ANALYSIS_GROUPS.map((group) => {
            const look = GROUP_LOOK[group.title]
            const Icon = look?.icon
            return (
              <div key={group.title} className={`sa-nav-group sa-tone-${look?.tone || 'blue'}`}>
                <p className="sa-nav-label">
                  <span className="sa-nav-icon" aria-hidden="true">
                    {Icon ? <Icon /> : null}
                  </span>
                  {group.title}
                </p>
                {group.items.map((item) => {
                  const href = `/plan/sales-analysis/${item.id}`
                  const active = pathname === href
                  return (
                    <Link
                      key={item.id}
                      href={href}
                      className={active ? 'sa-nav-link is-active' : 'sa-nav-link'}
                      aria-current={active ? 'page' : undefined}
                      title={item.description}
                    >
                      {item.label}
                    </Link>
                  )
                })}
              </div>
            )
          })}
        </nav>
      </aside>
      <main className="sa-main">{children}</main>
    </div>
  )
}
