'use client'

import React from 'react'

interface ResponsiveTableProps {
  headers: string[]
  rows: (string | React.ReactNode)[][]
  onRowClick?: (rowIndex: number) => void
  mobileCardFormat?: (row: (string | React.ReactNode)[], headers: string[]) => React.ReactNode
}

export default function ResponsiveTable({
  headers,
  rows,
  onRowClick,
  mobileCardFormat,
}: ResponsiveTableProps) {
  return (
    <>
      {/* デスクトップ版テーブル */}
      <div style={{ display: 'none' }} className="desktop-table-container">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
            <thead>
              <tr>
                {headers.map((header, idx) => (
                  <th
                    key={idx}
                    style={{
                      border: '1px solid #334155',
                      padding: '8px 12px',
                      backgroundColor: '#1e293b',
                      textAlign: 'left',
                      fontSize: 12,
                      color: '#e2e8f0',
                      fontWeight: 'bold',
                    }}
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIdx) => (
                <tr
                  key={rowIdx}
                  onClick={() => onRowClick?.(rowIdx)}
                  style={{ cursor: onRowClick ? 'pointer' : 'default' }}
                >
                  {row.map((cell, cellIdx) => (
                    <td
                      key={cellIdx}
                      style={{
                        border: '1px solid #334155',
                        padding: '8px 12px',
                        fontSize: 12,
                        color: '#cbd5e1',
                      }}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* モバイル版カードリスト */}
      <div style={{ display: 'none' }} className="mobile-card-container">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {rows.map((row, rowIdx) => (
            <div
              key={rowIdx}
              onClick={() => onRowClick?.(rowIdx)}
              style={{
                border: '1px solid #334155',
                borderRadius: 8,
                padding: 12,
                backgroundColor: '#1e293b',
                cursor: onRowClick ? 'pointer' : 'default',
              }}
            >
              {mobileCardFormat ? (
                mobileCardFormat(row, headers)
              ) : (
                <div style={{ display: 'grid', gap: 8 }}>
                  {row.map((cell, cellIdx) => (
                    <div key={cellIdx} style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 8 }}>
                      <span style={{ color: '#94a3b8', fontSize: 12, fontWeight: 'bold' }}>
                        {headers[cellIdx]}:
                      </span>
                      <span style={{ color: '#cbd5e1', fontSize: 13 }}>{cell}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @media (min-width: 769px) {
          .desktop-table-container {
            display: block !important;
          }
          .mobile-card-container {
            display: none !important;
          }
        }
        @media (max-width: 768px) {
          .desktop-table-container {
            display: none !important;
          }
          .mobile-card-container {
            display: block !important;
          }
        }
      `}</style>
    </>
  )
}
