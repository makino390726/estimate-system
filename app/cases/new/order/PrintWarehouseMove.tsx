'use client'
import React, { forwardRef } from 'react'

export type WarehouseMoveRow = {
  product_id: string
  item_name: string
  spec: string
  unit: string
  quantity: number
  unit_price: number | null
  amount: number
  cost_price: number
  section_id: number | null
  remarks?: string
  unregistered_product?: string
}

export type PrintWarehouseMoveProps = {
  printRef: React.RefObject<HTMLDivElement | null>
  orderNo: string
  orderDate: string
  department?: string
  subject: string
  purchaserName?: string
  rows: WarehouseMoveRow[]
  warehouseId?: string
  warehouseName?: string
  destinationWarehouse?: string
  staffStampUrl?: string
}

const PrintWarehouseMove = forwardRef<HTMLDivElement, PrintWarehouseMoveProps>(
  (
    {
      orderNo,
      orderDate,
      department = '',
      subject = '',
      purchaserName = '',
      rows,
      warehouseId = '',
      warehouseName = '',
      destinationWarehouse = '',
      staffStampUrl,
    },
    ref
  ) => {
    return (
      <div ref={ref}>
        <div
          style={{
            padding: '20mm',
            fontFamily: 'Arial, sans-serif',
            fontSize: '12px',
            width: '210mm',
            minHeight: '297mm',
            margin: '0 auto',
            backgroundColor: '#fff',
            position: 'relative',
            pageBreakAfter: 'always',
          }}
        >
          {/* ヘッダー */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
            <div>
              <div style={{ fontSize: '20px', fontWeight: 'bold' }}>倉庫移動伝票</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '14px' }}>
                <strong>No:</strong> {orderNo}
              </div>
              <div style={{ fontSize: '14px' }}>
                <strong>日付:</strong> {orderDate}
              </div>
            </div>
          </div>

          {/* 基本情報テーブル */}
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              marginBottom: '20px',
              border: '1px solid #000',
            }}
          >
            <tbody>
              <tr>
                <td
                  style={{
                    border: '1px solid #000',
                    padding: '8px',
                    width: '20%',
                    fontWeight: 'bold',
                    backgroundColor: '#f0f0f0',
                  }}
                >
                  部門
                </td>
                <td style={{ border: '1px solid #000', padding: '8px', width: '30%' }}>
                  {department}
                </td>
                <td
                  style={{
                    border: '1px solid #000',
                    padding: '8px',
                    width: '20%',
                    fontWeight: 'bold',
                    backgroundColor: '#f0f0f0',
                  }}
                >
                  担当者
                </td>
                <td style={{ border: '1px solid #000', padding: '8px', width: '30%' }}>
                  {purchaserName}
                </td>
              </tr>
              <tr>
                <td
                  style={{
                    border: '1px solid #000',
                    padding: '8px',
                    width: '20%',
                    fontWeight: 'bold',
                    backgroundColor: '#f0f0f0',
                  }}
                >
                  移動先倉庫
                </td>
                <td style={{ border: '1px solid #000', padding: '8px', width: '30%' }}>
                  {destinationWarehouse}
                </td>
                <td
                  style={{
                    border: '1px solid #000',
                    padding: '8px',
                    width: '20%',
                    fontWeight: 'bold',
                    backgroundColor: '#f0f0f0',
                  }}
                >
                  移動元倉庫
                </td>
                <td style={{ border: '1px solid #000', padding: '8px', width: '30%' }}>
                  {warehouseName}
                </td>
              </tr>
              <tr>
                <td
                  style={{
                    border: '1px solid #000',
                    padding: '8px',
                    fontWeight: 'bold',
                    backgroundColor: '#f0f0f0',
                  }}
                >
                  摘要
                </td>
                <td
                  colSpan={3}
                  style={{
                    border: '1px solid #000',
                    padding: '8px',
                    minHeight: '30px',
                  }}
                >
                  {subject}
                </td>
              </tr>
              <tr>
                <td
                  style={{
                    border: '1px solid #000',
                    padding: '8px',
                    fontWeight: 'bold',
                    backgroundColor: '#f0f0f0',
                  }}
                >
                  備考
                </td>
                <td
                  colSpan={3}
                  style={{
                    border: '1px solid #000',
                    padding: '8px',
                    minHeight: '50px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <span>担当者: {purchaserName || '-'}</span>
                    {staffStampUrl ? (
                      <img
                        src={staffStampUrl}
                        alt="担当者印"
                        style={{ height: '40px', width: '40px', objectFit: 'contain' }}
                      />
                    ) : (
                      <span style={{ color: '#888' }}>印未登録</span>
                    )}
                  </div>
                </td>
              </tr>
            </tbody>
          </table>

          {/* 明細テーブル */}
          <div style={{ marginBottom: '20px' }}>
            <div
              style={{
                fontWeight: 'bold',
                marginBottom: '10px',
                fontSize: '14px',
              }}
            >
              移動品名
            </div>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                border: '1px solid #000',
              }}
            >
              <thead>
                <tr style={{ backgroundColor: '#f0f0f0' }}>
                  <th
                    style={{
                      border: '1px solid #000',
                      padding: '8px',
                      textAlign: 'left',
                      fontWeight: 'bold',
                      width: '40%',
                    }}
                  >
                    品名
                  </th>
                  <th
                    style={{
                      border: '1px solid #000',
                      padding: '8px',
                      textAlign: 'left',
                      fontWeight: 'bold',
                      width: '20%',
                    }}
                  >
                    規格
                  </th>
                  <th
                    style={{
                      border: '1px solid #000',
                      padding: '8px',
                      textAlign: 'center',
                      fontWeight: 'bold',
                      width: '10%',
                    }}
                  >
                    単位
                  </th>
                  <th
                    style={{
                      border: '1px solid #000',
                      padding: '8px',
                      textAlign: 'right',
                      fontWeight: 'bold',
                      width: '15%',
                    }}
                  >
                    数量
                  </th>
                  <th
                    style={{
                      border: '1px solid #000',
                      padding: '8px',
                      textAlign: 'left',
                      fontWeight: 'bold',
                      width: '15%',
                    }}
                  >
                    摘要
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.length > 0 ? (
                  rows.map((row, idx) => (
                    <tr key={idx}>
                      <td
                        style={{
                          border: '1px solid #000',
                          padding: '8px',
                          minHeight: '30px',
                        }}
                      >
                        {row.item_name || row.unregistered_product || ''}
                      </td>
                      <td
                        style={{
                          border: '1px solid #000',
                          padding: '8px',
                        }}
                      >
                        {row.spec}
                      </td>
                      <td
                        style={{
                          border: '1px solid #000',
                          padding: '8px',
                          textAlign: 'center',
                        }}
                      >
                        {row.unit}
                      </td>
                      <td
                        style={{
                          border: '1px solid #000',
                          padding: '8px',
                          textAlign: 'right',
                        }}
                      >
                        {row.quantity}
                      </td>
                      <td
                        style={{
                          border: '1px solid #000',
                          padding: '8px',
                        }}
                      >
                        {row.remarks || ''}
                      </td>
                    </tr>
                  ))
                ) : (
                  <>
                    {Array.from({ length: 8 }).map((_, idx) => (
                      <tr key={`empty-${idx}`}>
                        <td style={{ border: '1px solid #000', padding: '8px', height: '30px' }}></td>
                        <td style={{ border: '1px solid #000', padding: '8px' }}></td>
                        <td style={{ border: '1px solid #000', padding: '8px' }}></td>
                        <td style={{ border: '1px solid #000', padding: '8px' }}></td>
                        <td style={{ border: '1px solid #000', padding: '8px' }}></td>
                      </tr>
                    ))}
                  </>
                )}
              </tbody>
            </table>
          </div>

          {/* 署名欄 */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-around',
              marginTop: '30px',
              paddingTop: '20px',
              borderTop: '1px solid #000',
            }}
          >
            <div style={{ textAlign: 'center', width: '20%' }}>
              <div style={{ fontSize: '11px', marginBottom: '40px' }}>発行者</div>
              <div style={{ height: '60px', border: '1px solid #ccc' }}></div>
              <div style={{ fontSize: '11px', marginTop: '5px' }}>印</div>
            </div>
            <div style={{ textAlign: 'center', width: '20%' }}>
              <div style={{ fontSize: '11px', marginBottom: '40px' }}>確認者</div>
              <div style={{ height: '60px', border: '1px solid #ccc' }}></div>
              <div style={{ fontSize: '11px', marginTop: '5px' }}>印</div>
            </div>
            <div style={{ textAlign: 'center', width: '20%' }}>
              <div style={{ fontSize: '11px', marginBottom: '40px' }}>承認者</div>
              <div style={{ height: '60px', border: '1px solid #ccc' }}></div>
              <div style={{ fontSize: '11px', marginTop: '5px' }}>印</div>
            </div>
          </div>
        </div>
      </div>
    )
  }
)

PrintWarehouseMove.displayName = 'PrintWarehouseMove'

export default PrintWarehouseMove
