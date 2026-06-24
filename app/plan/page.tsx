'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useReactToPrint } from 'react-to-print';
import Link from 'next/link'
import { sortManufacturingPlanRows } from '@/lib/manufacturingPlanSort'

type ManufacturingPlanRow = {
  id: string;
  name: string | null;
  spec: string | null;
  product_codes: string[];
  total_quantity: number;
  amount: number;
  cost_amount: number;
  avg_unit_price: number | null;
  is_unregistered: boolean;
  detail_count: number;
};

type PlanGroupBy = 'code' | 'name_spec';

type PlanMeta = {
  caseCount: number;
  detailCount: number;
  unlinkedDetailCount: number;
  groupBy: PlanGroupBy;
  source: 'rpc' | 'app';
};

export default function PlanPage() {
  const formatNumber = (value?: number | null) => {
    if (value == null || Number.isNaN(value)) return '-'
    return Number(value).toLocaleString('ja-JP')
  }
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [rows, setRows] = useState<ManufacturingPlanRow[]>([]);
  const [meta, setMeta] = useState<PlanMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [linking, setLinking] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [keyword, setKeyword] = useState('')
  const [groupBy, setGroupBy] = useState<PlanGroupBy>('name_spec')

  const tableRef = useRef<HTMLDivElement | null>(null);
  const handlePrint = useReactToPrint({
    contentRef: tableRef,
    documentTitle: '見積・製造計画検討一覧表',
  });

  const fetchPlan = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    setStatusMessage('');

    try {
      const params = new URLSearchParams();
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);
      params.set('groupBy', groupBy);

      const res = await fetch(`/api/plan/manufacturing-summary?${params.toString()}`);
      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || 'データ取得に失敗しました');
      }

      setRows((json.rows || []) as ManufacturingPlanRow[]);
      setMeta(json.meta || null);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      console.error('製造計画集計エラー:', message);
      setErrorMessage('データ取得中にエラーが発生しました');
      setRows([]);
      setMeta(null);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, groupBy]);

  useEffect(() => {
    fetchPlan();
  }, [fetchPlan]);

  const filteredRows = useMemo((): ManufacturingPlanRow[] => {
    const kw = keyword.trim().toLowerCase()
    const list = !kw
      ? rows
      : rows.filter((r) => {
          const idHit = r.id.toLowerCase().includes(kw)
          const nameHit = (r.name ?? '').toLowerCase().includes(kw)
          const specHit = (r.spec ?? '').toLowerCase().includes(kw)
          const codeHit = (r.product_codes || []).some((c) => c.toLowerCase().includes(kw))
          return idHit || nameHit || specHit || codeHit
        })
    return sortManufacturingPlanRows(list)
  }, [rows, keyword])

  const runBulkLink = async (dryRun: boolean) => {
    setLinking(true);
    setStatusMessage('');
    setErrorMessage('');
    try {
      const res = await fetch('/api/plan/link-unregistered-products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || '紐づけに失敗しました');
      }

      if (dryRun) {
        const sample = (json.samples || [])
          .slice(0, 5)
          .map((s: { unregistered_product: string; product_name: string; product_id: string }) =>
            `・${s.unregistered_product} → ${s.product_name}（${s.product_id}）`,
          )
          .join('\n');
        setStatusMessage(`紐づけ候補 ${json.matched}件 / 未一致 ${json.skipped}件（全未登録 ${json.scanned}件）`);
        const proceed = confirm(
          `マスタ一致が見つかった明細: ${json.matched}件 / 全未登録: ${json.scanned}件\n` +
            (sample ? `\n例:\n${sample}\n\n` : '\n') +
            'この内容で商品マスタに一括紐づけしますか？',
        );
        if (!proceed) return;

        const res2 = await fetch('/api/plan/link-unregistered-products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dryRun: false }),
        });
        const json2 = await res2.json();
        if (!res2.ok || !json2.ok) {
          throw new Error(json2.error || '紐づけに失敗しました');
        }
        setStatusMessage(
          `一括紐づけ完了: 更新 ${json2.updated}件 / 候補 ${json2.matched}件 / 未一致 ${json2.skipped}件 / 失敗 ${json2.failed}件`,
        );
        await fetchPlan();
        return;
      }

      setStatusMessage(
        `一括紐づけ完了: 更新 ${json.updated}件 / 候補 ${json.matched}件 / 未一致 ${json.skipped}件 / 失敗 ${json.failed}件`,
      );
      await fetchPlan();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setErrorMessage(message);
    } finally {
      setLinking(false);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ marginTop: 0, marginBottom: 0 }}>製造計画一覧（商品名・規格で集計）</h1>
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

      {meta && meta.unlinkedDetailCount > 0 && (
        <div
          style={{
            marginBottom: 12,
            padding: '10px 14px',
            borderRadius: 6,
            background: 'rgba(251, 191, 36, 0.12)',
            border: '1px solid rgba(251, 191, 36, 0.35)',
            fontSize: 13,
          }}
        >
          商品マスタ未紐づけの明細が <strong>{meta.unlinkedDetailCount}件</strong> あります。
          未登録のまま「未登録」行として集計に含めています。
          <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              disabled={linking || loading}
              onClick={() => runBulkLink(true)}
              style={{
                padding: '6px 12px',
                borderRadius: 4,
                border: '1px solid #d97706',
                background: '#f59e0b',
                color: '#111',
                cursor: linking || loading ? 'not-allowed' : 'pointer',
                fontWeight: 'bold',
              }}
            >
              {linking ? '処理中…' : '未登録明細をマスタに一括紐づけ'}
            </button>
            <Link href="/cases/code-mapping">
              <button
                type="button"
                style={{
                  padding: '6px 12px',
                  borderRadius: 4,
                  border: '1px solid #64748b',
                  background: 'transparent',
                  color: 'inherit',
                  cursor: 'pointer',
                }}
              >
                コード置換画面で個別修正
              </button>
            </Link>
          </div>
        </div>
      )}

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
          disabled={loading}
          style={{
            padding: '6px 16px',
            borderRadius: 4,
            border: '1px solid #ccc',
            cursor: loading ? 'not-allowed' : 'pointer',
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
      {statusMessage && (
        <div style={{ color: '#16a34a', marginBottom: 8 }}>{statusMessage}</div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
          集計単位：
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as PlanGroupBy)}
            style={{ padding: '4px 8px' }}
          >
            <option value="name_spec">商品名または規格が類似（類似品込み）</option>
            <option value="code">商品コード</option>
          </select>
        </label>
        <input
          value={keyword}
          onChange={e => setKeyword(e.target.value)}
          placeholder="商品コード / 商品名 / 規格で検索"
          className="input-inset"
          style={{ flex: 1, maxWidth: 280 }}
        />
        {meta && (
          <span style={{ fontSize: 12, color: '#94a3b8' }}>
            商品 {rows.length} 種 / 明細 {meta.detailCount} 行
            {meta.source === 'rpc' ? '（DB集計）' : ''}
          </span>
        )}
      </div>

      <div ref={tableRef} style={{ paddingTop: '20mm' }}>
        <h2 style={{ textAlign: 'center', margin: '8px 0 8px' }}>
          見積・製造計画検討一覧表
        </h2>
        <div style={{ textAlign: 'center', marginBottom: 12, fontSize: 13, color: '#333' }}>
          検索日：
          {fromDate ? fromDate : '指定なし'} ～
          {toDate ? toDate : '指定なし'}　｜　対象：全ステータス　｜　集計：
          {groupBy === 'name_spec' ? '商品名または規格が類似（類似品込み）' : '商品コード'}
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
              <th style={{ border: '1px solid #ccc', padding: 4, color: '#000', width: 200 }}>商品名</th>
              <th style={{ border: '1px solid #ccc', padding: 4, color: '#000', width: 160 }}>規格</th>
              <th style={{ border: '1px solid #ccc', padding: 4, color: '#000' }}>数量</th>
              <th style={{ border: '1px solid #ccc', padding: 4, color: '#000' }}>平均単価</th>
              <th style={{ border: '1px solid #ccc', padding: 4, color: '#000' }}>売上合計</th>
              <th style={{ border: '1px solid #ccc', padding: 4, color: '#000' }}>原価合計</th>
              <th style={{ border: '1px solid #ccc', padding: 4, color: '#000' }}>粗利合計</th>
            </tr>
          </thead>

          <tbody>
            {filteredRows.map((row) => {
              const codes = row.product_codes?.length ? row.product_codes : (row.is_unregistered ? [] : [row.id])
              const codeLabel =
                codes.length === 0
                  ? '（未登録）'
                  : codes.length === 1
                    ? codes[0]
                    : `${codes[0]} 他${codes.length - 1}件`

              return (
              <tr key={`${row.id}-${row.name}-${row.spec}`}>
                <td style={{ border: '1px solid #ccc', padding: 4 }}>
                  {codeLabel}
                </td>
                <td style={{ border: '1px solid #ccc', padding: 4, width: 200, maxWidth: 200 }}>
                  {row.name}
                  {row.is_unregistered && (
                    <span style={{ marginLeft: 6, fontSize: 11, color: '#b45309' }}>未紐づけ</span>
                  )}
                </td>
                <td style={{ border: '1px solid #ccc', padding: 4, width: 160, maxWidth: 160 }}>
                  {row.spec || '—'}
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
              )
            })}

            {filteredRows.length === 0 && !loading && (
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
