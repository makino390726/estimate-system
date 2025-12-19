'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useReactToPrint } from 'react-to-print';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

type StaffSummary = {
  staff_id: number;
  staff_name: string | null;
  negotiating_count: number;
  negotiating_amount: number;
  ordered_count: number;
  ordered_amount: number;
  total_deal_count: number;
  total_deal_amount: number;
  closed_count: number;
  closed_amount: number;
  closing_rate: number | null;
  gross_profit_total: number;
  avg_gross_margin: number | null;
};

export default function StaffPlanPage() {
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [rows, setRows] = useState<StaffSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [sortKey, setSortKey] = useState<keyof StaffSummary | null>(null);
  const tableRef = useRef<HTMLDivElement | null>(null);

  // ★ PDF印刷機能
  const handlePrint = useReactToPrint({
    contentRef: tableRef,
    documentTitle: '担当者別実績サマリー',
    pageStyle: `
      @page {
        size: A4 landscape;
        margin: 15mm 10mm 10mm 10mm;
      }
      @media print {
        body {
          margin: 0;
          padding: 0;
          font-size: 11pt;
        }
        table {
          font-size: 11pt;
        }
        th, td {
          padding: 2px 3px !important;
        }
      }
    `,
  });

  const fetchSummary = async () => {
    setLoading(true);
    setErrorMessage('');

    try {
      console.log('RPC呼び出し開始:', { fromDate, toDate });

      const { data, error } = await supabase.rpc(
        'get_staff_performance_summary',
        {
          _from: fromDate || null,
          _to: toDate || null,
        }
      );

      console.log('RPC結果:', { data, error });

      // ★ エラーオブジェクト詳細を出力
      if (error) {
        console.error('エラー詳細:', {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        });
        setErrorMessage(
          `データ取得エラー: ${error.message || 'Unknown error'}`
        );
        setRows([]);
      } else {
        console.log('取得データ件数:', data?.length);
        setRows((data as StaffSummary[]) || []);
      }
    } catch (err) {
      console.error('予期しないエラー:', err);
      setErrorMessage(
        `予期しないエラー: ${err instanceof Error ? err.message : String(err)}`
      );
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ★ 社員コード99と100を除外
  const filteredRows = useMemo(() => {
    return rows.filter(r => r.staff_id !== 99 && r.staff_id !== 100);
  }, [rows]);

  // ★ ソート機能付き表示行
  const displayRows = useMemo(() => {
    let sorted = [...filteredRows];
    if (sortKey) {
      sorted.sort((a, b) => {
        const aVal = a[sortKey];
        const bVal = b[sortKey];

        // null/undefined チェック
        if (aVal == null && bVal == null) return 0;
        if (aVal == null) return 1;
        if (bVal == null) return -1;

        // 数値比較（降順）
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return bVal - aVal;
        }

        // 文字列比較（降順）
        return String(bVal).localeCompare(String(aVal), 'ja');
      });
    }
    return sorted;
  }, [filteredRows, sortKey]);

  // ★ 合計行を計算
  const totalRow = useMemo(() => {
    const total = {
      negotiating_count: 0,
      negotiating_amount: 0,
      ordered_count: 0,
      ordered_amount: 0,
      total_deal_count: 0,
      total_deal_amount: 0,
      closed_count: 0,
      closed_amount: 0,
      gross_profit_total: 0,
    };

    displayRows.forEach(r => {
      total.negotiating_count += r.negotiating_count;
      total.negotiating_amount += r.negotiating_amount;
      total.ordered_count += r.ordered_count;
      total.ordered_amount += r.ordered_amount;
      total.total_deal_count += r.total_deal_count;
      total.total_deal_amount += r.total_deal_amount;
      total.closed_count += r.closed_count;
      total.closed_amount += r.closed_amount;
      total.gross_profit_total += r.gross_profit_total;
    });

    // 成約率（件数ベース）
    const closing_rate = total.total_deal_count > 0
      ? (total.ordered_count / total.total_deal_count) * 100
      : null;

    // ★ 平均粗利率：受注額 + 成約額 をベースに計算
    const avg_gross_margin = (total.ordered_amount + total.closed_amount) > 0
      ? (total.gross_profit_total / (total.ordered_amount + total.closed_amount)) * 100
      : null;

    return {
      ...total,
      closing_rate,
      avg_gross_margin,
    };
  }, [displayRows]);

  // ★ ヘッダクリックで並び替え
  const handleHeaderClick = (key: keyof StaffSummary) => {
    setSortKey(sortKey === key ? null : key);
  };

  // ★ ソート状態を示すマーク
  const getSortMark = (key: keyof StaffSummary): string => {
    return sortKey === key ? ' ▼' : '';
  };

  const thStyle = (key: keyof StaffSummary): React.CSSProperties => ({
    border: '1px solid #ccc',
    padding: 4,
    cursor: 'pointer',
    backgroundColor: sortKey === key ? '#e3f2fd' : '#f5f5f5',
    userSelect: 'none',
  });

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto', fontSize: 14 }}>
      {/* ★ タイトルと戻るボタン */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ marginTop: 0, marginBottom: 0, fontSize: 20, fontWeight: 'bold' }}>
          担当者別 実績サマリー
        </h1>
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

      {/* 日付条件：20pt太字 */}
      <div
        style={{
          margin: '16px 0',
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
          alignItems: 'flex-end',
          fontSize: 20,
          fontWeight: 'bold',
        }}
      >
        <div>
          <label>
            開始日：
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              style={{ marginLeft: 4, fontSize: 20, fontWeight: 'bold' }}
            />
          </label>
        </div>
        <div>
          <label>
            終了日：
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              style={{ marginLeft: 4, fontSize: 20, fontWeight: 'bold' }}
            />
          </label>
        </div>
        <button
          onClick={fetchSummary}
          disabled={loading}
          style={{
            padding: '6px 16px',
            borderRadius: 4,
            border: '1px solid #ccc',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: 20,
            fontWeight: 'bold',
            opacity: loading ? 0.6 : 1,
          }}
        >
          集計
        </button>
        {/* ★ PDF印刷ボタン */}
        <button
          onClick={() => handlePrint()}
          disabled={displayRows.length === 0}
          style={{
            padding: '6px 16px',
            borderRadius: 4,
            border: '1px solid #00bcd4',
            backgroundColor: '#00bcd4',
            color: '#000',
            cursor: displayRows.length === 0 ? 'not-allowed' : 'pointer',
            fontSize: 14,
            fontWeight: 'bold',
            opacity: displayRows.length === 0 ? 0.6 : 1,
          }}
        >
          📄 PDF印刷
        </button>
        {loading && <span style={{ fontSize: 14 }}>集計中…</span>}
      </div>

      {errorMessage && (
        <div style={{ color: 'red', marginBottom: 8, fontSize: 14 }}>{errorMessage}</div>
      )}

      {/* テーブル：14pt */}
      <div style={{ overflowX: 'auto' }} ref={tableRef}>
        {/* ★ PDF表題 */}
        <div style={{ marginBottom: 12, marginTop: 0, textAlign: 'center', paddingTop: '15mm' }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 'bold' }}>
            担当者別営業実績表
          </h2>
        </div>

        <table
          style={{
            minWidth: 1200,
            borderCollapse: 'collapse',
            border: '1px solid #ccc',
            fontSize: 14,
          }}
        >
          <thead>
            <tr>
              <th style={thStyle('staff_name')} onClick={() => handleHeaderClick('staff_name')}>
                担当者{getSortMark('staff_name')}
              </th>
              <th style={thStyle('negotiating_count')} onClick={() => handleHeaderClick('negotiating_count')}>
                商談中件数{getSortMark('negotiating_count')}
              </th>
              <th style={thStyle('negotiating_amount')} onClick={() => handleHeaderClick('negotiating_amount')}>
                商談中金額{getSortMark('negotiating_amount')}
              </th>
              <th style={thStyle('ordered_count')} onClick={() => handleHeaderClick('ordered_count')}>
                受注件数{getSortMark('ordered_count')}
              </th>
              <th style={thStyle('ordered_amount')} onClick={() => handleHeaderClick('ordered_amount')}>
                受注額{getSortMark('ordered_amount')}
              </th>
              <th style={thStyle('total_deal_count')} onClick={() => handleHeaderClick('total_deal_count')}>
                取引総件数{getSortMark('total_deal_count')}
              </th>
              <th style={thStyle('total_deal_amount')} onClick={() => handleHeaderClick('total_deal_amount')}>
                取引総額{getSortMark('total_deal_amount')}
              </th>
              <th style={thStyle('closed_count')} onClick={() => handleHeaderClick('closed_count')}>
                成約件数{getSortMark('closed_count')}
              </th>
              <th style={thStyle('closed_amount')} onClick={() => handleHeaderClick('closed_amount')}>
                成約額{getSortMark('closed_amount')}
              </th>
              <th style={thStyle('closing_rate')} onClick={() => handleHeaderClick('closing_rate')}>
                成約率(件数)%{getSortMark('closing_rate')}
              </th>
              <th style={thStyle('gross_profit_total')} onClick={() => handleHeaderClick('gross_profit_total')}>
                粗利総額{getSortMark('gross_profit_total')}
              </th>
              <th style={thStyle('avg_gross_margin')} onClick={() => handleHeaderClick('avg_gross_margin')}>
                平均粗利率%{getSortMark('avg_gross_margin')}
              </th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map((r) => (
              <tr key={r.staff_id}>
                <td style={{ border: '1px solid #ccc', padding: 4 }}>
                  {r.staff_name ?? '(未設定)'}
                </td>
                <td style={{ border: '1px solid #ccc', padding: 4, textAlign: 'right' }}>
                  {r.negotiating_count}
                </td>
                <td style={{ border: '1px solid #ccc', padding: 4, textAlign: 'right' }}>
                  {r.negotiating_amount.toLocaleString()}
                </td>
                <td style={{ border: '1px solid #ccc', padding: 4, textAlign: 'right' }}>
                  {r.ordered_count}
                </td>
                <td style={{ border: '1px solid #ccc', padding: 4, textAlign: 'right' }}>
                  {r.ordered_amount.toLocaleString()}
                </td>
                <td style={{ border: '1px solid #ccc', padding: 4, textAlign: 'right' }}>
                  {r.total_deal_count}
                </td>
                <td style={{ border: '1px solid #ccc', padding: 4, textAlign: 'right' }}>
                  {r.total_deal_amount.toLocaleString()}
                </td>
                <td style={{ border: '1px solid #ccc', padding: 4, textAlign: 'right' }}>
                  {r.closed_count}
                </td>
                <td style={{ border: '1px solid #ccc', padding: 4, textAlign: 'right' }}>
                  {r.closed_amount.toLocaleString()}
                </td>
                <td style={{ border: '1px solid #ccc', padding: 4, textAlign: 'right' }}>
                  {r.closing_rate != null ? r.closing_rate.toFixed(1) : '-'}
                </td>
                <td style={{ border: '1px solid #ccc', padding: 4, textAlign: 'right' }}>
                  {r.gross_profit_total.toLocaleString()}
                </td>
                <td style={{ border: '1px solid #ccc', padding: 4, textAlign: 'right' }}>
                  {r.avg_gross_margin != null ? r.avg_gross_margin.toFixed(1) : '-'}
                </td>
              </tr>
            ))}

            {/* 合計行 */}
            {displayRows.length > 0 && (
              <tr style={{ backgroundColor: '#fffacd', fontWeight: 'bold' }}>
                <td style={{ border: '1px solid #ccc', padding: 4 }}>合計</td>
                <td style={{ border: '1px solid #ccc', padding: 4, textAlign: 'right' }}>
                  {totalRow.negotiating_count}
                </td>
                <td style={{ border: '1px solid #ccc', padding: 4, textAlign: 'right' }}>
                  {totalRow.negotiating_amount.toLocaleString()}
                </td>
                <td style={{ border: '1px solid #ccc', padding: 4, textAlign: 'right' }}>
                  {totalRow.ordered_count}
                </td>
                <td style={{ border: '1px solid #ccc', padding: 4, textAlign: 'right' }}>
                  {totalRow.ordered_amount.toLocaleString()}
                </td>
                <td style={{ border: '1px solid #ccc', padding: 4, textAlign: 'right' }}>
                  {totalRow.total_deal_count}
                </td>
                <td style={{ border: '1px solid #ccc', padding: 4, textAlign: 'right' }}>
                  {totalRow.total_deal_amount.toLocaleString()}
                </td>
                <td style={{ border: '1px solid #ccc', padding: 4, textAlign: 'right' }}>
                  {totalRow.closed_count}
                </td>
                <td style={{ border: '1px solid #ccc', padding: 4, textAlign: 'right' }}>
                  {totalRow.closed_amount.toLocaleString()}
                </td>
                <td style={{ border: '1px solid #ccc', padding: 4, textAlign: 'right' }}>
                  {totalRow.closing_rate != null ? totalRow.closing_rate.toFixed(1) : '-'}
                </td>
                <td style={{ border: '1px solid #ccc', padding: 4, textAlign: 'right' }}>
                  {totalRow.gross_profit_total.toLocaleString()}
                </td>
                <td style={{ border: '1px solid #ccc', padding: 4, textAlign: 'right' }}>
                  {totalRow.avg_gross_margin != null ? totalRow.avg_gross_margin.toFixed(1) : '-'}
                </td>
              </tr>
            )}

            {displayRows.length === 0 && !loading && (
              <tr>
                <td
                  colSpan={12}
                  style={{ textAlign: 'center', padding: 8, color: '#666' }}
                >
                  該当するデータがありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
