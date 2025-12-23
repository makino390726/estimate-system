'use client'
import React, { forwardRef } from 'react'

export type PrintRow = {
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

export type PrintSection = { id: number; name: string }

export type PrintPurchaseOrderProps = {
  printRef: React.RefObject<HTMLDivElement | null>
  supplierName: string
  orderNo: string
  orderDate: string
  department?: string
  subject: string
  purchaserName?: string
  discount: number
  taxRate: number
  subtotal: number
  subtotalAfterDiscount: number
  taxAmount: number
  totalAmount: number
  layoutType: 'vertical' | 'horizontal'
  rows: PrintRow[]
  sections: PrintSection[]
  MAX_ROWS_PER_PAGE: number
  approvalStamps: {
    staff: boolean
    manager: boolean
    director: boolean
    president: boolean
  }
  stampUrls?: {
    staff: string | null
    manager: string | null
    director: string | null
    president: string | null
  }
}

const PrintPurchaseOrder = forwardRef<HTMLDivElement, PrintPurchaseOrderProps>((props, ref) => {
  const {
    layoutType,
    orderNo,
    orderDate,
    department,
    supplierName,
    subject,
    purchaserName,
    rows,
    sections = [],
    discount = 0,
    approvalStamps,
    stampUrls,
    MAX_ROWS_PER_PAGE,
  } = props

  const subtotal = rows.reduce((sum, row) => sum + (row.amount || 0), 0)
  const taxRate = 0.1
  const subtotalAfterDiscount = subtotal - discount
  const taxAmount = Math.floor(subtotalAfterDiscount * taxRate)
  const totalAmount = subtotalAfterDiscount + taxAmount

  const toWareki = (dateStr: string): string => {
    if (!dateStr) return ''

    const date = new Date(dateStr)
    const year = date.getFullYear()
    const month = date.getMonth() + 1
    const day = date.getDate()

    let era = ''
    let warekiYear = 0

    if (year >= 2019) {
      era = '令和'
      warekiYear = year - 2018
    } else if (year >= 1989) {
      era = '平成'
      warekiYear = year - 1988
    } else if (year >= 1926) {
      era = '昭和'
      warekiYear = year - 1925
    }

    return `${era}${warekiYear}年${month}月${day}日`
  }

  return (
    <div ref={ref} style={{ backgroundColor: '#fff', color: '#000' }}>
      <style>
        {`
          @media print {
            * {
              color: #000 !important;
              background-color: transparent !important;
              text-shadow: none !important;
            }
          }
        `}
      </style>

      <div
        style={{
          width: '210mm',
          minHeight: '297mm',
          padding: '15mm 20mm',
          boxSizing: 'border-box',
          fontFamily: 'MS Gothic, "Hiragino Sans", "Yu Gothic", sans-serif',
          fontSize: 12,
          color: '#000',
        }}
      >
        {/* ヘッダー */}
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <h1 style={{ fontSize: 24, margin: '0 0 10px 0', fontWeight: 'bold' }}>
            発 注 書
          </h1>
          <div style={{ fontSize: 12, marginBottom: 5 }}>
            発注番号: {orderNo || '未採番'} / 発注日: {toWareki(orderDate)}
          </div>
        </div>

        {/* 件名 */}
        <div style={{ marginBottom: 20, fontSize: 13 }}>
          <strong>件名:</strong> {subject}
        </div>

        {/* 合計金額 */}
        <div
          style={{
            marginBottom: 20,
            padding: 10,
            border: '2px solid #000',
            backgroundColor: '#f0f0f0',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 'bold' }}>
            ご請求金額: {totalAmount.toLocaleString()} 円（税込）
          </div>
        </div>

        {/* 明細テーブル */}
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            marginBottom: 20,
            border: '1px solid #000',
          }}
        >
          <thead>
            <tr style={{ backgroundColor: '#e0e0e0' }}>
              <th style={{ border: '1px solid #000', padding: 5, fontSize: 11, width: '40%' }}>
                品名・規格
              </th>
              <th style={{ border: '1px solid #000', padding: 5, fontSize: 11, width: '10%' }}>
                数量
              </th>
              <th style={{ border: '1px solid #000', padding: 5, fontSize: 11, width: '10%' }}>
                単位
              </th>
              <th style={{ border: '1px solid #000', padding: 5, fontSize: 11, width: '15%' }}>
                単価
              </th>
              <th style={{ border: '1px solid #000', padding: 5, fontSize: 11, width: '15%' }}>
                金額
              </th>
              <th style={{ border: '1px solid #000', padding: 5, fontSize: 11, width: '10%' }}>
                備考
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                <td style={{ border: '1px solid #000', padding: 5, fontSize: 10 }}>
                  {row.item_name}
                  {row.spec && (
                    <>
                      <br />
                      <span style={{ fontSize: 9, color: '#666' }}>{row.spec}</span>
                    </>
                  )}
                </td>
                <td style={{ border: '1px solid #000', padding: 5, fontSize: 10, textAlign: 'right' }}>
                  {row.quantity}
                </td>
                <td style={{ border: '1px solid #000', padding: 5, fontSize: 10, textAlign: 'center' }}>
                  {row.unit}
                </td>
                <td style={{ border: '1px solid #000', padding: 5, fontSize: 10, textAlign: 'right' }}>
                  {row.unit_price?.toLocaleString() || '-'}
                </td>
                <td style={{ border: '1px solid #000', padding: 5, fontSize: 10, textAlign: 'right' }}>
                  {row.amount.toLocaleString()}
                </td>
                <td style={{ border: '1px solid #000', padding: 5, fontSize: 9 }}>
                  {row.remarks || ''}
                </td>
              </tr>
            ))}

            {/* 空行埋め */}
            {Array.from({ length: Math.max(0, 10 - rows.length) }).map((_, i) => (
              <tr key={`empty-${i}`}>
                <td style={{ border: '1px solid #000', padding: 5, height: 20 }}>&nbsp;</td>
                <td style={{ border: '1px solid #000', padding: 5 }}>&nbsp;</td>
                <td style={{ border: '1px solid #000', padding: 5 }}>&nbsp;</td>
                <td style={{ border: '1px solid #000', padding: 5 }}>&nbsp;</td>
                <td style={{ border: '1px solid #000', padding: 5 }}>&nbsp;</td>
                <td style={{ border: '1px solid #000', padding: 5 }}>&nbsp;</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td
                colSpan={4}
                style={{
                  border: '1px solid #000',
                  padding: 5,
                  textAlign: 'right',
                  fontWeight: 'bold',
                }}
              >
                小計
              </td>
              <td
                style={{
                  border: '1px solid #000',
                  padding: 5,
                  textAlign: 'right',
                  fontWeight: 'bold',
                }}
              >
                {subtotal.toLocaleString()}
              </td>
              <td style={{ border: '1px solid #000', padding: 5 }}>&nbsp;</td>
            </tr>
            {discount > 0 && (
              <tr>
                <td
                  colSpan={4}
                  style={{
                    border: '1px solid #000',
                    padding: 5,
                    textAlign: 'right',
                    fontWeight: 'bold',
                  }}
                >
                  値引
                </td>
                <td
                  style={{
                    border: '1px solid #000',
                    padding: 5,
                    textAlign: 'right',
                    fontWeight: 'bold',
                    color: 'red',
                  }}
                >
                  -{discount.toLocaleString()}
                </td>
                <td style={{ border: '1px solid #000', padding: 5 }}>&nbsp;</td>
              </tr>
            )}
            <tr>
              <td
                colSpan={4}
                style={{
                  border: '1px solid #000',
                  padding: 5,
                  textAlign: 'right',
                  fontWeight: 'bold',
                }}
              >
                消費税（{(taxRate * 100).toFixed(0)}%）
              </td>
              <td
                style={{
                  border: '1px solid #000',
                  padding: 5,
                  textAlign: 'right',
                  fontWeight: 'bold',
                }}
              >
                {taxAmount.toLocaleString()}
              </td>
              <td style={{ border: '1px solid #000', padding: 5 }}>&nbsp;</td>
            </tr>
            <tr>
              <td
                colSpan={4}
                style={{
                  border: '2px solid #000',
                  padding: 8,
                  textAlign: 'right',
                  fontWeight: 'bold',
                  fontSize: 13,
                  backgroundColor: '#f0f0f0',
                }}
              >
                合計金額
              </td>
              <td
                style={{
                  border: '2px solid #000',
                  padding: 8,
                  textAlign: 'right',
                  fontWeight: 'bold',
                  fontSize: 13,
                  backgroundColor: '#f0f0f0',
                }}
              >
                {totalAmount.toLocaleString()}
              </td>
              <td
                style={{
                  border: '2px solid #000',
                  padding: 5,
                  backgroundColor: '#f0f0f0',
                }}
              >
                &nbsp;
              </td>
            </tr>
          </tfoot>
        </table>

        {/* 追加情報なし（支払条件削除済み） */}

        {/* 発注元情報 */}
        <div
          style={{
            marginTop: 30,
            padding: 10,
            border: '1px solid #000',
            backgroundColor: '#fafafa',
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 'bold', marginBottom: 5 }}>
            発注元:
          </div>
          <div style={{ fontSize: 11 }}>
            {supplierName || '（発注先未設定）'}
            {purchaserName && (
              <>
                <br />
                発注者: {purchaserName}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
})

PrintPurchaseOrder.displayName = 'PrintPurchaseOrder'

export default PrintPurchaseOrder
