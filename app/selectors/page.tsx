'use client'

import Link from 'next/link'

export default function MasterSelectorPage() {
  const buttonStyle = {
    backgroundColor: '#00bcd4',
    color: '#000',
    padding: '10px 16px',
    borderRadius: 4,
    border: 'none',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontSize: 14,
  }

  return (
    <div style={{ padding: 24, maxWidth: 980, margin: '0 auto' }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ marginTop: 0, fontSize: 45, fontWeight: 'bold' }}>三州見積書作成システム</h1>
        <p style={{ color: '#070707ff', marginTop: 4, marginBottom: 20 }}>
          商品・担当者・顧客の各マスタ選択画面、および見積書作成・案件一覧画面へ移動します。
        </p>
      </div>

      <div className="selector-grid" style={{ marginTop: 20 }}>
        <Link href="/cases/new" className="selector-card">
          <div style={{ backgroundColor: '#1e3a8a', padding: 20, borderRadius: 8, color: '#fff' }}>
            <h2 style={{ marginTop: 0, color: '#fff' }}>見積書作成</h2>
            <p>案件登録・見積書作成を行います</p>
            <button style={{ ...buttonStyle, marginTop: 8 }}>見積書作成へ</button>
          </div>
        </Link>

        <Link href="/cases/list" className="selector-card">
          <div style={{ backgroundColor: '#1e3a8a', padding: 20, borderRadius: 8, color: '#fff' }}>
            <h2 style={{ marginTop: 0, color: '#fff' }}>案件一覧・承認</h2>
            <p>案件を一覧表示・承認・削除します</p>
            <button style={{ ...buttonStyle, marginTop: 8 }}>案件一覧へ</button>
          </div>
        </Link>

        <Link href="/products" className="selector-card">
          <div style={{ backgroundColor: '#1e3a8a', padding: 20, borderRadius: 8, color: '#fff' }}>
            <h2 style={{ marginTop: 0, color: '#fff' }}>商品マスタ</h2>
            <p>商品を検索・選択／修正／削除します</p>
            <button style={{ ...buttonStyle, marginTop: 8 }}>商品一覧へ</button>
          </div>
        </Link>

        <Link href="/staffs" className="selector-card">
          <div style={{ backgroundColor: '#1e3a8a', padding: 20, borderRadius: 8, color: '#fff' }}>
            <h2 style={{ marginTop: 0, color: '#fff' }}>担当者マスタ</h2>
            <p>担当者を検索・選択／修正／削除します</p>
            <button style={{ ...buttonStyle, marginTop: 8 }}>担当者一覧へ</button>
          </div>
        </Link>

        <Link href="/customers/select" className="selector-card">
          <div style={{ backgroundColor: '#1e3a8a', padding: 20, borderRadius: 8, color: '#fff' }}>
            <h2 style={{ marginTop: 0, color: '#fff' }}>顧客マスタ</h2>
            <p>顧客を検索・選択／新規登録／修正／削除します</p>
            <button style={{ ...buttonStyle, marginTop: 8 }}>顧客検索へ</button>
          </div>
        </Link>

        {/* ★ 6番目：実績関係出力 */}
        <div className="selector-card">
          <div style={{ backgroundColor: '#1e3a8a', padding: 20, borderRadius: 8, color: '#fff' }}>
            <h2 style={{ marginTop: 0, color: '#fff' }}>実績関係出力</h2>
            <p>製造計画・担当者別実績の表示</p>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <Link href="/plan" style={{ flex: 1 }}>
                <button style={{ ...buttonStyle, width: '100%' }}>製造計画書</button>
              </Link>
              <Link href="/plan/staff_performance" style={{ flex: 1 }}>
                <button style={{ ...buttonStyle, width: '100%' }}>担当者別実績書</button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}