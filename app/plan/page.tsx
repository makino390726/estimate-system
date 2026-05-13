'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useReactToPrint } from 'react-to-print';
import { supabase } from '@/lib/supabaseClient'; // ← パスは環境に合わせて修正
import Link from 'next/link'

type PlanRow = {
  id: string;
  name: string | null;
  status: string | null;
  total_quantity: number;
  unit_price?: number | null;
  amount?: number | null;
  cost_amount?: number | null;
  source_warehouse_name?: string | null;
  destination_warehouse_name?: string | null;
};

type AggregatedProductRow = {
  id: string
  name: string | null
  total_quantity: number
  amount: number
  cost_amount: number
  avg_unit_price: number | null
}

export default function PlanPage() {
  const formatNumber = (value?: number | null) => {
    if (value == null || Number.isNaN(value)) return '-'
    return Number(value).toLocaleString('ja-JP')
  }
  const [fromDate, setFromDate] = useState<string>(''); // YYYY-MM-DD
  const [toDate, setToDate] = useState<string>('');     // YYYY-MM-DD
  const [plan, setPlan] = useState<PlanRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [keyword, setKeyword] = useState('')

  const tableRef = useRef<HTMLDivElement | null>(null);
  const handlePrint = useReactToPrint({
    contentRef: tableRef,
    documentTitle: '見積・製造計画検討一覧表',  // ★ 変更
  });

  const fetchPlan = async () => {
    setLoading(true);
    setErrorMessage('');

    const { data, error } = await supabase.rpc(
      'get_manufacturing_plan_by_date',
      {
        _from: fromDate || null, // null → 全期間
        _to: toDate || null,
      }
    );

    if (error) {
      console.error('製造計画集計エラー:', error);
      setErrorMessage('データ取得中にエラーが発生しました');
      setPlan([]);
    } else {
      console.log('plan sample:', data?.[0])
      setPlan((data || []) as PlanRow[]);
    }

    setLoading(false);
  };

  // 初回表示（全期間）
  useEffect(() => {
    fetchPlan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const aggregatedProducts = useMemo((): AggregatedProductRow[] => {
    const kw = keyword.trim().toLowerCase()

    const isExcludedStatus = (status: string | null) =>
      status === '商談中' || status === '失注' || status === '倉庫移動'

    const targetRows = plan.filter(r => !isExcludedStatus(r.status))

    const map = new Map<string, AggregatedProductRow>()
    for (const r of targetRows) {
      const code = r.id
      if (!code) continue

      const prev = map.get(code)
      const qty = Number(r.total_quantity ?? 0) || 0
      const amount = Number(r.amount ?? 0) || 0
      const cost = Number(r.cost_amount ?? 0) || 0
      const name = r.name ?? null

      if (!prev) {
        map.set(code, {
          id: code,
          name,
          total_quantity: qty,
          amount,
          cost_amount: cost,
          avg_unit_price: null,
        })
      } else {
        prev.total_quantity += qty
        prev.amount += amount
        prev.cost_amount += cost
        if (!prev.name && name) prev.name = name
      }
    }

    const rows = Array.from(map.values()).map(row => {
      const avg =
        row.total_quantity > 0 ? row.amount / row.total_quantity : null
      return { ...row, avg_unit_price: avg }
    })

    const filtered = !kw
      ? rows
      : rows.filter(r => {
          const idHit = r.id.toLowerCase().includes(kw)
          const nameHit = (r.name ?? '').toLowerCase().includes(kw)
          return idHit || nameHit
        })

    filtered.sort((a, b) => {
      if (a.amount !== b.amount) return b.amount - a.amount
      return a.id.localeCompare(b.id, 'ja')
    })
    return filtered
  }, [plan, keyword])

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ marginTop: 0, marginBottom: 0 }}>製造計画一覧（売れている商品を商品コードで集計）</h1>
        {/* ★ メニューへ戻るボタン */}
        <Link href="/selectors">
          <button
            style={{
              padding: '8px 16px',
              borderRadius: 4,
              border: '1px solid #15803d',
              backgroundColor: '#16a34a',
              color: '#fff',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: 14,
            }}
          >
            メニューへ戻る
          </button>
        </Link>
      </div>

      {/* 日付指定エリア */}
      <div
        style={{
          margin: '16px 0',
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
          alignItems: 'flex-end',
        }}
      >
        <div>
          <label style={{ fontSize: 14 }}>
            開始日：
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              style={{ marginLeft: 4 }}
            />
          </label>
        </div>
        <div>
          <label style={{ fontSize: 14 }}>
            終了日：
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              style={{ marginLeft: 4 }}
            />
          </label>
        </div>

        <button
          onClick={fetchPlan}
          style={{
            padding: '6px 16px',
            borderRadius: 4,
            border: '1px solid #ccc',
            cursor: 'pointer',
          }}
        >
          検索
        </button>

        <button
          onClick={handlePrint}
          style={{
            padding: '6px 16px',
            borderRadius: 4,
            border: '1px solid #00bcd4',
            backgroundColor: '#00bcd4',
            color: '#000',
            cursor: 'pointer',
          }}
        >
          PDFプレビュー
        </button>

        {loading && <span>読み込み中…</span>}
      </div>

      {errorMessage && (
        <div style={{ color: 'red', marginBottom: 8 }}>{errorMessage}</div>
      )}

      {/* 検索フィルタ */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input
          value={keyword}
          onChange={e => setKeyword(e.target.value)}
          placeholder="商品コード or 商品名で検索"
          className="input-inset"
          style={{ flex: 1, maxWidth: 280 }}
        />
      </div>

      {/* 製造計画テーブル（印刷対象をラップ） */}
      <div ref={tableRef} style={{ paddingTop: '20mm' }}> {/* ★ 上余白 20mm */}
        {/* ★ PDF表題 */}
        <h2 style={{ textAlign: 'center', margin: '8px 0 8px' }}>
          見積・製造計画検討一覧表
        </h2>
        {/* ★ 検索条件表示 */}
        <div style={{ textAlign: 'center', marginBottom: 12, fontSize: 13, color: '#333' }}>
          検索日：
          {fromDate ? fromDate : '指定なし'} ～
          {toDate ? toDate : '指定なし'}　｜　対象：成約（商談中/失注/倉庫移動は除外）
        </div>

        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            border: '1px solid #ccc',
            fontSize: 13,
          }}
        >
          <thead>
            <tr style={{ backgroundColor: '#f5f5f5' }}>
              <th style={{ border: '1px solid #ccc', padding: 4, color: '#000' }}>商品コード</th>
              <th style={{ border: '1px solid #ccc', padding: 4, color: '#000', width: 240 }}>商品名</th>
              <th style={{ border: '1px solid #ccc', padding: 4, color: '#000' }}>数量</th>
              <th style={{ border: '1px solid #ccc', padding: 4, color: '#000' }}>平均単価</th>
              <th style={{ border: '1px solid #ccc', padding: 4, color: '#000' }}>売上合計</th>
              <th style={{ border: '1px solid #ccc', padding: 4, color: '#000' }}>原価合計</th>
              <th style={{ border: '1px solid #ccc', padding: 4, color: '#000' }}>粗利合計</th>
            </tr>
          </thead>

          <tbody>
            {aggregatedProducts.map((row) => (
              <tr key={row.id}>
                <td style={{ border: '1px solid #ccc', padding: 4 }}>
                  {row.id}
                </td>
                <td style={{ border: '1px solid #ccc', padding: 4, width: 240, maxWidth: 240 }}>
                  {row.name}
                </td>
                <td
                  style={{
                    border: '1px solid #ccc',
                    padding: 4,
                    textAlign: 'right',
                  }}
                >
                  {formatNumber(row.total_quantity)}
                </td>
                <td
                  style={{
                    border: '1px solid #ccc',
                    padding: 4,
                    textAlign: 'right',
                  }}
                >
                  {formatNumber(row.avg_unit_price)}
                </td>
                <td
                  style={{
                    border: '1px solid #ccc',
                    padding: 4,
                    textAlign: 'right',
                  }}
                >
                  {formatNumber(row.amount)}
                </td>
                <td
                  style={{
                    border: '1px solid #ccc',
                    padding: 4,
                    textAlign: 'right',
                  }}
                >
                  {formatNumber(row.cost_amount)}
                </td>
                <td
                  style={{
                    border: '1px solid #ccc',
                    padding: 4,
                    textAlign: 'right',
                  }}
                >
                  {formatNumber(row.amount - row.cost_amount)}
                </td>
              </tr>
            ))}

            {aggregatedProducts.length === 0 && !loading && (
              <tr>
                <td
                  colSpan={7}
                  style={{ textAlign: 'center', padding: 8, color: '#666' }}
                >
                  該当データがありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
