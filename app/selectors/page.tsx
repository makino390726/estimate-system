'use client'

import Link from 'next/link'
import Image from 'next/image'
import {
  FiFileText,
  FiArchive,
  FiBox,
  FiUsers,
  FiUser,
  FiTrendingUp,
} from 'react-icons/fi'

export default function MasterSelectorPage() {
  return (
    <div className="min-h-screen p-6 sm:p-10">
      <div className="max-w-7xl mx-auto">
        <header className="relative overflow-hidden flex items-center justify-between mb-12 gap-4">
          <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none select-none">
            <Image
              src="/会社ロゴ（スタイリッシュ）.png"
              alt="背景ロゴ"
              width={189}
              height={113}
              className="object-contain"
              style={{ width: '5cm', height: '3cm' }}
              priority
            />
          </div>
          <div className="flex-1 relative z-10" />
          <h1 className="flex-1 relative z-10 text-center text-3xl sm:text-4xl font-bold text-white whitespace-nowrap">
            三州見積書作成システム
          </h1>
          <div className="flex-1 relative z-10 flex justify-end">
            <Image
              src="/会社ロゴ（スタイリッシュ）.png"
              alt="会社ロゴ"
              width={189}
              height={113}
              className="object-contain drop-shadow"
              style={{ width: '5cm', height: '3cm' }}
              priority
            />
          </div>
        </header>

        <div className="selector-grid">
          {/* 見積書作成 */}
          <div className="selector-card">
            <div className="selector-card-header">
              <FiFileText className="icon" />
              <h2>見積書作成</h2>
            </div>
            <p>見積書作成のいた、既設者のと信頼書、仕事数者に不件を探します。</p>
            <div className="selector-card-buttons">
              <Link href="/cases/new" className="selector-button primary">
                見積書作成
              </Link>
            </div>
          </div>

          {/* 案件一覧・承認 */}
          <div className="selector-card">
            <div className="selector-card-header">
              <FiArchive className="icon" />
              <h2>案件一覧・承認</h2>
            </div>
            <p>案件一覧・承認、案件相談限定者計に確認ることができます。</p>
            <div className="selector-card-buttons">
              <Link href="/cases/list" className="selector-button primary">
                案件一覧・承認
              </Link>
            </div>
          </div>

          {/* 商品マスタ */}
          <div className="selector-card">
            <div className="selector-card-header">
              <FiBox className="icon" />
              <h2>商品マスタ</h2>
            </div>
            <p>商品マスタと商品で入り、商品を作成します。</p>
            <div className="selector-card-buttons">
              <Link href="/products" className="selector-button primary">
                商品検索
              </Link>
              <Link href="/products/price_import" className="selector-button primary">
                新規登録
              </Link>
            </div>
          </div>

          {/* 担当者マスタ */}
          <div className="selector-card">
            <div className="selector-card-header">
              <FiUser className="icon" />
              <h2>担当者マスタ</h2>
            </div>
            <p>担当者マスタにようした担当者の名誉番号を設置ができます。</p>
            <div className="selector-card-buttons">
              <Link href="/staffs" className="selector-button primary">
                担当者マスタ
              </Link>
            </div>
          </div>

          {/* 顧客マスタ */}
          <div className="selector-card">
            <div className="selector-card-header">
              <FiUsers className="icon" />
              <h2>顧客マスタ</h2>
            </div>
            <p>顧客マスタは、多長の顧客と作業を許します。</p>
            <div className="selector-card-buttons">
              <Link href="/customers/select" className="selector-button primary">
                顧客マスタ
              </Link>
            </div>
          </div>

          {/* 実績関係出力 */}
          <div className="selector-card">
            <div className="selector-card-header">
              <FiTrendingUp className="icon" />
              <h2>実績関係出力</h2>
            </div>
            <p>実績関係出力やシャートに数置に定置ができます。</p>
            <div className="selector-card-buttons">
              <Link href="/plan" className="selector-button primary">
                実績検索
              </Link>
              <Link href="/plan/staff_performance" className="selector-button primary">
                マスタ更新
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}