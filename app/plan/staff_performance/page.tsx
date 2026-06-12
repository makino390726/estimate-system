'use client';

import { useState, useEffect, useMemo, useRef, Suspense } from 'react';
import { useReactToPrint } from 'react-to-print';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  computeStaffPerformanceTotals,
  fetchStaffPerformanceSummary,
  type StaffSummary,
} from '@/lib/staffPerformanceSummary';

function StaffPerformancePageContent() {
  const searchParams = useSearchParams();
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [rows, setRows] = useState<StaffSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [sortKey, setSortKey] = useState<keyof StaffSummary | null>(null);
  const tableRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setFromDate(searchParams.get('from') || '');
    setToDate(searchParams.get('to') || '');
  }, [searchParams]);

  const handlePrint = useReactToPrint({
    contentRef: tableRef,
    documentTitle: `担当者別実績サマリー_${fromDate || '開始未指定'}_${toDate || '終了未指定'}`,
    pageStyle: `
      @page {
        size: A4 landscape;
        margin: 15mm 10mm 10mm 10mm;
      }
      @media print {
        body { margin: 0; padding: 0; font-size: 11pt; }
        table { font-size: 11pt; }
        th, td { padding: 2px 3px !important; }
      }
    `,
  });

  const fetchSummary = async () => {
    setLoading(true);
    setErrorMessage('');

    try {
      const data = await fetchStaffPerformanceSummary(fromDate || undefined, toDate || undefined);
      setRows(data);
    } catch (err) {
      console.error('集計エラー:', err);
      setErrorMessage(err instanceof Error ? err.message : '予期しないエラーが発生しました');
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dashboardHref = `/plan/staff_performance/dashboard${
    fromDate || toDate
      ? `?from=${encodeURIComponent(fromDate)}&to=${encodeURIComponent(toDate)}`
      : ''
  }`;

  const displayRows = useMemo(() => {
    let sorted = [...rows];

    if (sortKey) {
      sorted.sort((a, b) => {
        const aVal = a[sortKey];
        const bVal = b[sortKey];

        if (aVal == null && bVal == null) return 0;
        if (aVal == null) return 1;
        if (bVal == null) return -1;

        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return bVal - aVal;
        }

        return String(bVal).localeCompare(String(aVal), 'ja');
      });
    }
    return sorted;
  }, [rows, sortKey]);

  const totalRow = useMemo(() => computeStaffPerformanceTotals(displayRows), [displayRows]);

  const handleHeaderClick = (key: keyof StaffSummary) => {
    setSortKey(sortKey === key ? null : key);
  };

  const getSortMark = (key: keyof StaffSummary): string => {
    return sortKey === key ? ' ▼' : '';
  };

  const thStyle = (key: keyof StaffSummary): React.CSSProperties => ({
    border: '1px solid #ccc',
    padding: 4,
    cursor: 'pointer',
    backgroundColor: sortKey === key ? '#e3f2fd' : '#f5f5f5',
    userSelect: 'none',
    color: '#000',
  });

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto', fontSize: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ marginTop: 0, marginBottom: 0, fontSize: 20, fontWeight: 'bold' }}>
          担当者別 実績サマリー
        </h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href={dashboardHref}>
            <button
              style={{
                padding: '8px 16px',
                borderRadius: 4,
                border: '1px solid #2563eb',
                backgroundColor: '#3b82f6',
                color: '#fff',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: 14,
              }}
            >
              成績ダッシュボード
            </button>
          </Link>
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
      </div>

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
          onClick={() => void fetchSummary()}
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
        <Link href={dashboardHref}>
          <button
            disabled={displayRows.length === 0}
            style={{
              padding: '6px 16px',
              borderRadius: 4,
              border: '1px solid #2563eb',
              backgroundColor: '#dbeafe',
              color: '#1e3a8a',
              cursor: displayRows.length === 0 ? 'not-allowed' : 'pointer',
              fontSize: 14,
              fontWeight: 'bold',
              opacity: displayRows.length === 0 ? 0.6 : 1,
            }}
          >
            ダッシュボード展開
          </button>
        </Link>
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
          PDF印刷
        </button>
        {loading && <span style={{ fontSize: 14 }}>集計中…</span>}
      </div>

      {errorMessage && (
        <div style={{ color: 'red', marginBottom: 8, fontSize: 14 }}>{errorMessage}</div>
      )}

      <div style={{ overflowX: 'auto' }} ref={tableRef}>
        <div style={{ marginBottom: 12, marginTop: 0, textAlign: 'center', paddingTop: '15mm' }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 'bold' }}>
            担当者別営業実績表
          </h2>
        </div>

        <table
          style={{
            minWidth: 1320,
            borderCollapse: 'collapse',
            border: '1px solid #ccc',
            fontSize: 14,
          }}
        >
          <thead>
            <tr>
              <th style={thStyle('staff_name')} onClick={() => handleHeaderClick('staff_name')}>
                担当者名{getSortMark('staff_name')}
              </th>
              <th style={thStyle('total_count')} onClick={() => handleHeaderClick('total_count')}>
                取扱件数{getSortMark('total_count')}
              </th>
              <th style={thStyle('total_amount')} onClick={() => handleHeaderClick('total_amount')}>
                取扱額{getSortMark('total_amount')}
              </th>
              <th style={thStyle('negotiating_count')} onClick={() => handleHeaderClick('negotiating_count')}>
                商談中件数{getSortMark('negotiating_count')}
              </th>
              <th style={thStyle('negotiating_amount')} onClick={() => handleHeaderClick('negotiating_amount')}>
                商談中金額{getSortMark('negotiating_amount')}
              </th>
              <th style={thStyle('lost_count')} onClick={() => handleHeaderClick('lost_count')}>
                失注件数{getSortMark('lost_count')}
              </th>
              <th style={thStyle('lost_amount')} onClick={() => handleHeaderClick('lost_amount')}>
                失注額{getSortMark('lost_amount')}
              </th>
              <th style={thStyle('contracted_count')} onClick={() => handleHeaderClick('contracted_count')}>
                成約件数{getSortMark('contracted_count')}
              </th>
              <th style={thStyle('contracted_amount')} onClick={() => handleHeaderClick('contracted_amount')}>
                成約額{getSortMark('contracted_amount')}
              </th>
              <th style={thStyle('contract_rate')} onClick={() => handleHeaderClick('contract_rate')}>
                成約率(%)%{getSortMark('contract_rate')}
              </th>
              <th style={thStyle('gross_profit_total')} onClick={() => handleHeaderClick('gross_profit_total')}>
                粗利額{getSortMark('gross_profit_total')}
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
                  {r.total_count}
                </td>
                <td style={{ border: '1px solid #ccc', padding: 4, textAlign: 'right' }}>
                  {r.total_amount.toLocaleString()}
                </td>
                <td style={{ border: '1px solid #ccc', padding: 4, textAlign: 'right' }}>
                  {r.negotiating_count}
                </td>
                <td style={{ border: '1px solid #ccc', padding: 4, textAlign: 'right' }}>
                  {r.negotiating_amount.toLocaleString()}
                </td>
                <td style={{ border: '1px solid #ccc', padding: 4, textAlign: 'right' }}>
                  {r.lost_count}
                </td>
                <td style={{ border: '1px solid #ccc', padding: 4, textAlign: 'right' }}>
                  {r.lost_amount.toLocaleString()}
                </td>
                <td style={{ border: '1px solid #ccc', padding: 4, textAlign: 'right' }}>
                  {r.contracted_count}
                </td>
                <td style={{ border: '1px solid #ccc', padding: 4, textAlign: 'right' }}>
                  {r.contracted_amount.toLocaleString()}
                </td>
                <td style={{ border: '1px solid #ccc', padding: 4, textAlign: 'right' }}>
                  {r.contract_rate != null ? r.contract_rate.toFixed(1) : '-'}
                </td>
                <td style={{ border: '1px solid #ccc', padding: 4, textAlign: 'right' }}>
                  {r.gross_profit_total.toLocaleString()}
                </td>
                <td style={{ border: '1px solid #ccc', padding: 4, textAlign: 'right' }}>
                  {r.avg_gross_margin != null ? r.avg_gross_margin.toFixed(1) : '-'}
                </td>
              </tr>
            ))}

            {displayRows.length > 0 && (
              <tr style={{ backgroundColor: '#fffacd', fontWeight: 'bold', color: '#000' }}>
                <td style={{ border: '1px solid #ccc', padding: 4 }}>合計</td>
                <td style={{ border: '1px solid #ccc', padding: 4, textAlign: 'right' }}>
                  {totalRow.total_count}
                </td>
                <td style={{ border: '1px solid #ccc', padding: 4, textAlign: 'right' }}>
                  {totalRow.total_amount.toLocaleString()}
                </td>
                <td style={{ border: '1px solid #ccc', padding: 4, textAlign: 'right' }}>
                  {totalRow.negotiating_count}
                </td>
                <td style={{ border: '1px solid #ccc', padding: 4, textAlign: 'right' }}>
                  {totalRow.negotiating_amount.toLocaleString()}
                </td>
                <td style={{ border: '1px solid #ccc', padding: 4, textAlign: 'right' }}>
                  {totalRow.lost_count}
                </td>
                <td style={{ border: '1px solid #ccc', padding: 4, textAlign: 'right' }}>
                  {totalRow.lost_amount.toLocaleString()}
                </td>
                <td style={{ border: '1px solid #ccc', padding: 4, textAlign: 'right' }}>
                  {totalRow.contracted_count}
                </td>
                <td style={{ border: '1px solid #ccc', padding: 4, textAlign: 'right' }}>
                  {totalRow.contracted_amount.toLocaleString()}
                </td>
                <td style={{ border: '1px solid #ccc', padding: 4, textAlign: 'right' }}>
                  {totalRow.contract_rate != null ? totalRow.contract_rate.toFixed(1) : '-'}
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

export default function StaffPlanPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>読み込み中…</div>}>
      <StaffPerformancePageContent />
    </Suspense>
  );
}
