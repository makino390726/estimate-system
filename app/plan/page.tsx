'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useReactToPrint } from 'react-to-print';
import { supabase } from '@/lib/supabaseClient'; // ← パスは環境に合わせて修正
import Link from 'next/link'

type PlanRow = {
  case_id?: string | null;
  case_no?: string | null;
  subject?: string | null;
  customer_name?: string | null;
  staff_name?: string | null;
  created_date?: string | null;
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
  const [statusFilter, setStatusFilter] = useState<string>('') // ★ 変更: ステータス選択
  const [contractedOnly, setContractedOnly] = useState(false)

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

  // ★ ユニークなステータス一覧を抽出
  const statusList = useMemo(
    () => Array.from(new Set(plan.map(p => p.status).filter(Boolean))),
    [plan]
  )

  // ★ 検索＋ステータスでフィルタ
  const filteredPlans = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    return plan.filter(p => {
      const isExcludedStatus =
        p.status === '商談中' ||
        p.status === '失注' ||
        p.status === '倉庫移動'
      const hitKeyword =
        !kw ||
        p.name?.toLowerCase().includes(kw) ||
        p.status?.toLowerCase().includes(kw)
      const hitStatus = !statusFilter || p.status === statusFilter
      const hitContracted = !contractedOnly || (!isExcludedStatus && !!p.status)
      return hitKeyword && hitStatus && hitContracted
    })
  }, [plan, keyword, statusFilter, contractedOnly])

  const displayPlans = useMemo(() => {
    const rows = [...filteredPlans]
    rows.sort((a, b) => {
      const aProduct = a.id || ''
      const bProduct = b.id || ''
      const productCompare = aProduct.localeCompare(bProduct, 'ja')
      if (productCompare !== 0) return productCompare

      const aCase = a.case_id || ''
      const bCase = b.case_id || ''
      const caseCompare = aCase.localeCompare(bCase, 'ja')
      if (caseCompare !== 0) return caseCompare

      const aDate = a.created_date || ''
      const bDate = b.created_date || ''
      if (aDate === bDate) return 0
      return aDate < bDate ? 1 : -1
    })
    return rows
  }, [filteredPlans])

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ marginTop: 0, marginBottom: 0 }}>製造計画一覧（案件作成日で絞り込み）</h1>
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
          placeholder="キーワード検索"
          className="input-inset"
          style={{ flex: 1, maxWidth: 280 }}
        />
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="input-inset"
          style={{ width: 200 }}
        >
          <option value="">すべてのステータス</option>
          {statusList
            .filter(st => st !== null)  // ★ null を除外
            .map(st => (
              <option key={st} value={st}>{st}</option>
            ))}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <input
            type="checkbox"
            checked={contractedOnly}
            onChange={(e) => setContractedOnly(e.target.checked)}
          />
          成約のみ
        </label>
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
          {toDate ? toDate : '指定なし'}　｜　検索ステータス：
          {statusFilter || 'すべて'}　｜　成約のみ：
          {contractedOnly ? 'はい' : 'いいえ'}
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
              <th style={{ border: '1px solid #ccc', padding: 4, color: '#000' }}>事業名</th>
              <th style={{ border: '1px solid #ccc', padding: 4, color: '#000' }}>ステータス</th>
              <th style={{ border: '1px solid #ccc', padding: 4, color: '#000' }}>単価</th>
              <th style={{ border: '1px solid #ccc', padding: 4, color: '#000' }}>金額</th>
              <th style={{ border: '1px solid #ccc', padding: 4, color: '#000' }}>原価</th>
              <th style={{ border: '1px solid #ccc', padding: 4, color: '#000' }}>粗利額</th>
            </tr>
          </thead>

          <tbody>
            {displayPlans.map((row, idx) => (
              <tr key={`${row.case_id ?? 'case'}-${row.id ?? 'item'}-${idx}`}>
                <td style={{ border: '1px solid #ccc', padding: 4 }}>
                  {row.id}
                </td>
                <td style={{ border: '1px solid #ccc', padding: 4, width: 240, maxWidth: 240 }}>
                  {row.name}
                </td>
                <td style={{ border: '1px solid #ccc', padding: 4 }}>
                  {row.case_no && row.subject ? `${row.case_no} ${row.subject}` : row.subject || '-'}
                </td>
                <td style={{ border: '1px solid #ccc', padding: 4 }}>
                  {row.status === '倉庫移動' ? (
                    <span>
                      {row.source_warehouse_name || '-'} ➡ {row.destination_warehouse_name || '-'}
                    </span>
                  ) : (
                    row.status
                  )}
                </td>
                <td
                  style={{
                    border: '1px solid #ccc',
                    padding: 4,
                    textAlign: 'right',
                  }}
                >
                  {formatNumber(row.unit_price)}
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
                  {formatNumber((row.amount ?? 0) - (row.cost_amount ?? 0))}
                </td>
              </tr>
            ))}

            {displayPlans.length === 0 && !loading && (
              <tr>
                <td
                  colSpan={8}
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
