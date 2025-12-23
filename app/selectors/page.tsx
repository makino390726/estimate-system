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
  FiShoppingCart,
  FiHome,
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
            <p>見積書作成の画面です、縦・横の様式選択、過去案件からの作成等が出来ます。</p>
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
            <p>案件一覧・承認、見積書の進捗（ステータス）、明細表示から承認依頼も行えます。</p>
            <div className="selector-card-buttons">
              <Link href="/cases/list" className="selector-button primary">
                案件一覧・承認
              </Link>
            </div>
          </div>

          {/* 注文書作成・確認 */}
          <div className="selector-card">
            <div className="selector-card-header">
              <FiShoppingCart className="icon" />
              <h2>注文書作成・確認</h2>
            </div>
            <p>注文書の新規作成及び、注文ステータスの案件を確認できます。</p>
            <div className="selector-card-buttons">
              <Link href="/cases/new/order" className="selector-button primary">
                注文書作成
              </Link>
              <Link href="/cases/orders" className="selector-button primary">
                注文受付確認
              </Link>
            </div>
          </div>

          {/* 商品マスタ */}
          <div className="selector-card">
            <div className="selector-card-header">
              <FiBox className="icon" />
              <h2>商品マスタ</h2>
            </div>
            <p>商品マスタの新規登録及び、価格等の変更に伴う更新作業を行います。</p>
            <div className="selector-card-buttons">
              <Link href="/products" className="selector-button primary">
                商品検索
              </Link>
              <Link href="/products/price_import" className="selector-button primary">
                マスタ取込
              </Link>
            </div>
          </div>

          {/* 担当者マスタ */}
          <div className="selector-card">
            <div className="selector-card-header">
              <FiUser className="icon" />
              <h2>担当者マスタ</h2>
            </div>
            <p>担当者の新規登録、印章登録、承認経路を設定する画面です。</p>
            <div className="selector-card-buttons">
              <Link href="/staffs" className="selector-button primary">
                担当者マスタ
              </Link>
            </div>
          </div>

          {/* 倉庫マスタ */}
          <div className="selector-card">
            <div className="selector-card-header">
              <FiHome className="icon" />
              <h2>倉庫マスタ</h2>
            </div>
            <p>倉庫ID（担当者ID）と名称（担当者名＋倉庫）を登録・更新・削除します。</p>
            <div className="selector-card-buttons">
              <Link href="/wfrehouses" className="selector-button primary">
                倉庫登録
              </Link>
              <Link href="/warehouses/stock" className="selector-button primary">
                在庫一覧
              </Link>
            </div>
          </div>

          {/* 顧客マスタ */}
          <div className="selector-card">
            <div className="selector-card-header">
              <FiUsers className="icon" />
              <h2>顧客マスタ</h2>
            </div>
            <p>顧客マスタの新規登録及び登録された顧客情報の更新作業を行う画面です。</p>
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
            <p>各担当者別実績表を、期間、担当者別に出力、製造計画書は受注案件の商品をPDFで出力できます。</p>
            <div className="selector-card-buttons">
              <Link href="/plan" className="selector-button primary">
                製造計画一覧
              </Link>
              <Link href="/plan/staff_performance" className="selector-button primary">
                担当者別実績表
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}