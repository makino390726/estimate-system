'use client'
import React, { forwardRef } from 'react'

export type PrintRow = {
  product_id: string
  item_name: string
  spec: string
  unit: string
  quantity: number
  unit_price: number
  amount: number
  cost_price: number
  section_id: number | null
}

export type PrintSection = { id: number; name: string }

export type PrintEstimateProps = {
  printRef: React.RefObject<HTMLDivElement | null>
  customerName: string
  estimateNo: string
  estimateDate: string  // ★ 追加
  subject: string
  deliveryPlace: string
  deliveryDeadline: string
  deliveryTerms: string
  validityText: string
  paymentTerms: string
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

const PrintEstimate = forwardRef<HTMLDivElement, PrintEstimateProps>((props, ref) => {
  const {
    layoutType,
    estimateNo,
    estimateDate,
    customerName,
    subject,
    deliveryPlace,
    deliveryDeadline,
    deliveryTerms,
    validityText,
    paymentTerms,
    rows,
    sections = [],
    discount = 0,
    approvalStamps,
    stampUrls,
    MAX_ROWS_PER_PAGE, // ★ propsから取得
  } = props

  // ★ 金額計算を追加
  const subtotal = rows.reduce((sum, row) => sum + (row.amount || 0), 0)
  const taxRate = 0.1
  const subtotalAfterDiscount = subtotal - discount
  const taxAmount = Math.floor(subtotalAfterDiscount * taxRate)
  const totalAmount = subtotalAfterDiscount + taxAmount

  // ★ 和暦変換関数を追加
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

  // =========================
  // 横様式
  // =========================
  if (layoutType === 'horizontal') {
    const MAX_ROWS = 27
    const BODY_ROWS = MAX_ROWS - 1

    // 明細ページのセル共通スタイル
    const detailCell: React.CSSProperties = {
      border: '1px solid #000',
      padding: '4px',
      fontSize: 11,
      lineHeight: 1.2,
      height: '15mm',
    }
    const detailCellCenter: React.CSSProperties = { ...detailCell, textAlign: 'center' }
    const detailCellRight: React.CSSProperties = { ...detailCell, textAlign: 'right' }
    const detailCellBoldRight: React.CSSProperties = { ...detailCellRight, fontWeight: 'bold' }
    const detailCellBold: React.CSSProperties = { ...detailCell, fontWeight: 'bold' }

    // セクションごとにグループ化
    const sectionGroups: { section: PrintSection | null; rows: PrintRow[]; subtotal: number }[] = []
    let currentSectionId: number | null = null
    let currentGroup: PrintRow[] = []

    rows.forEach((row) => {
      if (row.section_id !== currentSectionId) {
        if (currentGroup.length > 0) {
          const sectionSubtotal = currentGroup.reduce((sum, r) => sum + r.amount, 0)
          sectionGroups.push({
            section: sections.find((s) => s.id === currentSectionId) || null,
            rows: currentGroup,
            subtotal: sectionSubtotal,
          })
        }
        currentSectionId = row.section_id
        currentGroup = [row]
      } else {
        currentGroup.push(row)
      }
    })

    if (currentGroup.length > 0) {
      const sectionSubtotal = currentGroup.reduce((sum, r) => sum + r.amount, 0)
      sectionGroups.push({
        section: sections.find((s) => s.id === currentSectionId) || null,
        rows: currentGroup,
        subtotal: sectionSubtotal,
      })
    }

    // セクション合計ページ
    const sectionPages: React.ReactElement[] = []

    const SUMMARY_FOOTER_ROWS = 5
    const FIXED_SPACER_ROWS = 1
    const availableSectionRows = BODY_ROWS - SUMMARY_FOOTER_ROWS - FIXED_SPACER_ROWS

    let visibleSectionGroups = sectionGroups
    if (sectionGroups.length > availableSectionRows) {
      const head = sectionGroups.slice(0, availableSectionRows - 1)
      const tail = sectionGroups.slice(availableSectionRows - 1)
      const othersSubtotal = tail.reduce((s, g) => s + g.subtotal, 0)
      const othersCount = tail.length
      visibleSectionGroups = [
        ...head,
        {
          section: { id: -1, name: `その他 ${othersCount} セクション` },
          rows: [],
          subtotal: othersSubtotal,
        },
      ]
    }

    const fillerRowsCount = Math.max(
      0,
      BODY_ROWS - (visibleSectionGroups.length + FIXED_SPACER_ROWS + SUMMARY_FOOTER_ROWS),
    )

    sectionPages.push(
      <div
        key="section-0"
        style={{
          width: '297mm',
          minHeight: '210mm',
          padding: '10mm 15mm',
          boxSizing: 'border-box',
          fontFamily: 'MS Gothic, "Hiragino Sans", "Yu Gothic", sans-serif',
          fontSize: 11,
          pageBreakAfter: 'always',
        }}
      >
        <table style={{ width: '100%', border: '1px solid #000', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#c8e6c8' }}>
              <th style={{ border: '1px solid #000', padding: '4px', width: 200, fontSize: 11 }}>商品名・規格</th>
              <th style={{ border: '1px solid #000', padding: '4px', width: 60, fontSize: 11 }}>数量</th>
              <th style={{ border: '1px solid #000', padding: '4px', width: 50, fontSize: 11 }}>単位</th>
              <th style={{ border: '1px solid #000', padding: '4px', width: 90, fontSize: 11 }}>単　　価</th>
              <th style={{ border: '1px solid #000', padding: '4px', width: 100, fontSize: 11 }}>金　　額</th>
              <th style={{ border: '1px solid #000', padding: '4px', width: 80, fontSize: 11 }}>備　　考</th>
            </tr>
          </thead>
          <tbody>
            {visibleSectionGroups.map((group, idx) => (
              <tr key={idx}>
                <td style={{ border: '1px solid #000', padding: '4px', fontSize: 11, fontWeight: 'bold' }}>
                  {group.section?.name || 'セクション名なし'}
                </td>
                <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center', fontSize: 11 }}>
                  1
                </td>
                <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center', fontSize: 11 }}>
                  式
                </td>
                <td style={{ border: '1px solid #000', padding: '4px', fontSize: 11 }}>&nbsp;</td>
                <td
                  style={{
                    border: '1px solid #000',
                    padding: '4px',
                    textAlign: 'right',
                    fontSize: 11,
                    fontWeight: 'bold',
                  }}
                >
                  {group.subtotal.toLocaleString()}
                </td>
                <td style={{ border: '1px solid #000', padding: '4px', fontSize: 11 }}>&nbsp;</td>
              </tr>
            ))}

            {/* スペーサー */}
            <tr>
              <td style={{ border: '1px solid #000', padding: '4px', fontSize: 11 }}>&nbsp;</td>
              <td style={{ border: '1px solid #000', padding: '4px', fontSize: 11 }}>&nbsp;</td>
              <td style={{ border: '1px solid #000', padding: '4px', fontSize: 11 }}>&nbsp;</td>
              <td style={{ border: '1px solid #000', padding: '4px', fontSize: 11 }}>&nbsp;</td>
              <td style={{ border: '1px solid #000', padding: '4px', fontSize: 11 }}>&nbsp;</td>
              <td style={{ border: '1px solid #000', padding: '4px', fontSize: 11 }}>&nbsp;</td>
            </tr>

            {/* 埋め行 */}
            {Array.from({ length: fillerRowsCount }).map((_, idx) => (
              <tr key={`filler-${idx}`}>
                <td style={{ border: '1px solid #000', padding: '4px', fontSize: 11 }}>&nbsp;</td>
                <td style={{ border: '1px solid #000', padding: '4px', fontSize: 11 }}>&nbsp;</td>
                <td style={{ border: '1px solid #000', padding: '4px', fontSize: 11 }}>&nbsp;</td>
                <td style={{ border: '1px solid #000', padding: '4px', fontSize: 11 }}>&nbsp;</td>
                <td style={{ border: '1px solid #000', padding: '4px', fontSize: 11 }}>&nbsp;</td>
                <td style={{ border: '1px solid #000', padding: '4px', fontSize: 11 }}>&nbsp;</td>
              </tr>
            ))}

            {/* 値引きが0の場合は空白行を2行追加 */}
            {discount === 0 && (
              <>
                <tr>
                  <td style={{ border: '1px solid #000', padding: '4px', fontSize: 11 }}>&nbsp;</td>
                  <td style={{ border: '1px solid #000', padding: '4px', fontSize: 11 }}>&nbsp;</td>
                  <td style={{ border: '1px solid #000', padding: '4px', fontSize: 11 }}>&nbsp;</td>
                  <td style={{ border: '1px solid #000', padding: '4px', fontSize: 11 }}>&nbsp;</td>
                  <td style={{ border: '1px solid #000', padding: '4px', fontSize: 11 }}>&nbsp;</td>
                  <td style={{ border: '1px solid #000', padding: '4px', fontSize: 11 }}>&nbsp;</td>
                </tr>
                <tr>
                  <td style={{ border: '1px solid #000', padding: '4px', fontSize: 11 }}>&nbsp;</td>
                  <td style={{ border: '1px solid #000', padding: '4px', fontSize: 11 }}>&nbsp;</td>
                  <td style={{ border: '1px solid #000', padding: '4px', fontSize: 11 }}>&nbsp;</td>
                  <td style={{ border: '1px solid #000', padding: '4px', fontSize: 11 }}>&nbsp;</td>
                  <td style={{ border: '1px solid #000', padding: '4px', fontSize: 11 }}>&nbsp;</td>
                  <td style={{ border: '1px solid #000', padding: '4px', fontSize: 11 }}>&nbsp;</td>
                </tr>
              </>
            )}

            {/* 小計〜合計 */}
            <tr>
              <td
                colSpan={4}
                style={{
                  border: '1px solid #000',
                  padding: '6px',
                  textAlign: 'right',
                  fontWeight: 'bold',
                  fontSize: 11,
                }}
              >
                小　　計
              </td>
              <td
                style={{
                  border: '1px solid #000',
                  padding: '6px',
                  textAlign: 'right',
                  fontWeight: 'bold',
                  fontSize: 11,
                }}
              >
                {subtotal.toLocaleString()} 円
              </td>
              <td style={{ border: '1px solid #000', padding: '4px', fontSize: 11 }}>&nbsp;</td>
            </tr>

            <tr>
              <td
                colSpan={4}
                style={{
                  border: '1px solid #000',
                  padding: '6px',
                  textAlign: 'right',
                  fontWeight: 'bold',
                  fontSize: 11,
                }}
              >
                出精値引き
              </td>
              <td
                style={{
                  border: '1px solid #000',
                  padding: '6px',
                  textAlign: 'right',
                  fontWeight: 'bold',
                  fontSize: 11,
                  color: discount > 0 ? 'red' : 'inherit',
                }}
              >
                {discount > 0 ? `-${discount.toLocaleString()} 円` : '0 円'}
              </td>
              <td style={{ border: '1px solid #000', padding: '4px', fontSize: 11 }}>&nbsp;</td>
            </tr>

            <tr>
              <td
                colSpan={4}
                style={{
                  border: '1px solid #000',
                  padding: '6px',
                  textAlign: 'right',
                  fontWeight: 'bold',
                  fontSize: 11,
                }}
              >
                値引後小計
              </td>
              <td
                style={{
                  border: '1px solid #000',
                  padding: '6px',
                  textAlign: 'right',
                  fontWeight: 'bold',
                  fontSize: 11,
                }}
              >
                {subtotalAfterDiscount.toLocaleString()} 円
              </td>
              <td style={{ border: '1px solid #000', padding: '4px', fontSize: 11 }}>&nbsp;</td>
            </tr>

            <tr>
              <td
                colSpan={4}
                style={{
                  border: '1px solid #000',
                  padding: '6px',
                  textAlign: 'right',
                  fontWeight: 'bold',
                  fontSize: 11,
                }}
              >
                消費税（{(taxRate * 100).toFixed(0)}%）
              </td>
              <td
                style={{
                  border: '1px solid #000',
                  padding: '6px',
                  textAlign: 'right',
                  fontWeight: 'bold',
                  fontSize: 11,
                }}
              >
                {taxAmount.toLocaleString()} 円
              </td>
              <td style={{ border: '1px solid #000', padding: '4px', fontSize: 11 }}>&nbsp;</td>
            </tr>

            <tr>
              <td
                colSpan={4}
                style={{
                  border: '2px solid #000',
                  padding: '8px',
                  textAlign: 'right',
                  fontWeight: 'bold',
                  fontSize: 12,
                  backgroundColor: '#f0f0f0',
                }}
              >
                合　　　計
              </td>
              <td
                style={{
                  border: '2px solid #000',
                  padding: '8px',
                  textAlign: 'right',
                  fontWeight: 'bold',
                  fontSize: 12,
                  backgroundColor: '#f0f0f0',
                }}
              >
                {totalAmount.toLocaleString()} 円
              </td>
              <td
                style={{
                  border: '2px solid #000',
                  padding: '4px',
                  fontSize: 11,
                  backgroundColor: '#f0f0f0',
                }}
              >
                &nbsp;
              </td>
            </tr>
          </tbody>
        </table>
      </div>,
    )

    // 明細ページ
    const detailPages: React.ReactElement[] = []
    const DETAIL_BODY_ROWS = 17

    sectionGroups.forEach((group, groupIndex) => {
      const sectionNumber = groupIndex + 1
      const requiredRows = 1 + group.rows.length + 1
      const emptyRowsCount = Math.max(0, DETAIL_BODY_ROWS - requiredRows)

      detailPages.push(
        <div
          key={`detail-${groupIndex}`}
          style={{
            width: '297mm',
            minHeight: '210mm',
            padding: '20mm 15mm 10mm 15mm',
            boxSizing: 'border-box',
            fontFamily: 'MS Gothic, "Hiragino Sans", "Yu Gothic", sans-serif',
            fontSize: 11,
            pageBreakAfter: groupIndex < sectionGroups.length - 1 ? 'always' : 'auto',
          }}
        >
          <table style={{ width: '100%', border: '1px solid #000', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#c8e6c8' }}>
                <th style={{ border: '1px solid #000', padding: '4px', width: 200, fontSize: 11 }}>商品名・規格</th>
                <th style={{ border: '1px solid #000', padding: '4px', width: 60, fontSize: 11 }}>数量</th>
                <th style={{ border: '1px solid #000', padding: '4px', width: 50, fontSize: 11 }}>単位</th>
                <th style={{ border: '1px solid #000', padding: '4px', width: 90, fontSize: 11 }}>単　　価</th>
                <th style={{ border: '1px solid #000', padding: '4px', width: 100, fontSize: 11 }}>金　　額</th>
                <th style={{ border: '1px solid #000', padding: '4px', width: 80, fontSize: 11 }}>備　　考</th>
              </tr>
            </thead>
            <tbody>
              {/* セクション見出し */}
              <tr>
                <td style={{ border: '1px solid #000', padding: '4px', fontSize: 11, fontWeight: 'bold', backgroundColor: '#f5f5f5' }}>
                  {`${sectionNumber}. ${group.section?.name || 'セクション名なし'}`}
                </td>
                <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center', fontSize: 11, backgroundColor: '#f5f5f5' }}>
                  1
                </td>
                <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center', fontSize: 11, backgroundColor: '#f5f5f5' }}>
                  式
                </td>
                <td style={{ border: '1px solid #000', padding: '4px', fontSize: 11, backgroundColor: '#f5f5f5' }}>&nbsp;</td>
                <td style={{ border: '1px solid #000', padding: '4px', fontSize: 11, backgroundColor: '#f5f5f5' }}>&nbsp;</td>
                <td style={{ border: '1px solid #000', padding: '4px', fontSize: 11, backgroundColor: '#f5f5f5' }}>&nbsp;</td>
              </tr>

              {/* 明細 */}
              {group.rows.map((row, idx) => (
                <tr key={idx}>
                  <td style={{ border: '1px solid #000', padding: '4px', fontSize: 11 }}>
                    {row.spec ? `${row.item_name}・${row.spec}` : row.item_name}
                  </td>
                  <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center', fontSize: 11 }}>
                    {row.quantity ? row.quantity.toLocaleString() : ''}
                  </td>
                  <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center', fontSize: 11 }}>
                    {row.unit}
                  </td>
                  <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'right', fontSize: 11 }}>
                    {row.unit_price ? row.unit_price.toLocaleString() : ''}
                  </td>
                  <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'right', fontSize: 11 }}>
                    {row.amount ? row.amount.toLocaleString() : ''}
                  </td>
                  <td style={{ border: '1px solid #000', padding: '4px', fontSize: 11 }}>&nbsp;</td>
                </tr>
              ))}

              {/* 埋め行 */}
              {Array.from({ length: emptyRowsCount }).map((_, idx) => (
                <tr key={`empty-${idx}`}>
                  <td style={{ border: '1px solid #000', padding: '4px', fontSize: 11 }}>&nbsp;</td>
                  <td style={{ border: '1px solid #000', padding: '4px', fontSize: 11 }}>&nbsp;</td>
                  <td style={{ border: '1px solid #000', padding: '4px', fontSize: 11 }}>&nbsp;</td>
                  <td style={{ border: '1px solid #000', padding: '4px', fontSize: 11 }}>&nbsp;</td>
                  <td style={{ border: '1px solid #000', padding: '4px', fontSize: 11 }}>&nbsp;</td>
                  <td style={{ border: '1px solid #000', padding: '4px', fontSize: 11 }}>&nbsp;</td>
                </tr>
              ))}

              {/* セクション合計 */}
              <tr>
                <td
                  colSpan={4}
                  style={{ border: '1px solid #000', padding: '4px', fontSize: 11, fontWeight: 'bold', textAlign: 'right' }}
                >
                  合計
                </td>
                <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'right', fontSize: 11, fontWeight: 'bold' }}>
                  {group.subtotal.toLocaleString()}
                </td>
                <td style={{ border: '1px solid #000', padding: '4px', fontSize: 11 }}>&nbsp;</td>
              </tr>
            </tbody>
          </table>
        </div>,
      )
    })

    // 横様式の戻り値：表紙＋セクション合計＋明細
    return (
      <div ref={ref} style={{ backgroundColor: '#fff' }}>
        {/* 表紙ページ */}
        <div
          style={{
            width: '297mm',
            height: '210mm',
            padding: '20mm 15mm 10mm 15mm', // 10mm 15mm → 20mm 15mm 10mm 15mm に変更（上を20mmに）
            boxSizing: 'border-box',
            fontFamily: 'MS Gothic, "Hiragino Sans", "Yu Gothic", sans-serif',
            fontSize: 10,
            position: 'relative',
            pageBreakAfter: 'always',
          }}
        >
          <div
            style={{
              border: '2px solid #000',
              width: '100%',
              height: '100%',
              padding: '10mm',
              boxSizing: 'border-box',
            }}
          >
            <div style={{ textAlign: 'center', marginBottom: '8mm', position: 'relative' }}>
              <h1
                style={{
                  fontSize: 30,
                  margin: 0,
                  letterSpacing: 10,
                  borderBottom: '2px solid #000',
                  display: 'inline-block',
                  paddingBottom: 6,
                }}
              >
                御　見　積　書
              </h1>
              <div style={{ position: 'absolute', top: 0, right: 0, fontSize: 14 }}></div>
            </div>

            {/* ★ 作成日・見積番号（縦配置・右詰） */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-end',
                marginBottom: 3, // 6 → 3 に変更（-3mm）
                fontSize: 11,
                gap: '3mm',
              }}
            >
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontWeight: 'bold', marginRight: '5mm' }}>作成日</span>
                <span>{toWareki(estimateDate)}</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontWeight: 'bold', marginRight: '5mm' }}>見積番号</span>
                <span>{estimateNo || '未採番'}</span>
              </div>
            </div>

            <div style={{ marginBottom: '2mm' }}> {/* 6mm → 2mm に変更（-4mm） */}
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 'bold',
                  borderBottom: '2px solid #000',
                  display: 'inline-block',
                  minWidth: '200px',
                  paddingBottom: 4,
                }}
              >
                {customerName}　御中
              </div>
            </div>

            {/* 横様式：得意先＋社名・承認印 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}> {/* 3 → 2 に変更（-1mm） */}
              {/* 左：空白（顧客名は上で表示済み） */}
              <div style={{ width: '48%' }}>
              </div>

              {/* 右：社名・代表者 */}
              <div style={{ width: '48%', textAlign: 'right', position: 'relative' }}>
                {/* 社印（背景） */}
                <div
                  style={{
                    position: 'absolute',
                    top: -10,
                    right: 5,
                    opacity: 0.6,
                    zIndex: 0,
                    pointerEvents: 'none',
                  }}
                >
                  <img
                    src="/company-seal.png"
                    alt="社印"
                    style={{
                      width: 100,
                      height: 100,
                      objectFit: 'contain',
                    }}
                  />
                </div>

                {/* 社名・代表者 */}
                <div style={{ position: 'relative', zIndex: 1, lineHeight: 1.4 }}>
                  <div style={{ fontSize: 22, fontWeight: 'bold', marginTop: '2mm' }}>三州産業株式会社</div> {/* 3mm → 2mm に変更（-1mm） */}
                  <div style={{ fontSize: 16, fontWeight: 'bold', marginTop: '0.5mm' }}>代表取締役社長　竹之内　浩樹</div> {/* 1mm → 0.5mm に変更（-0.5mm） */}
                </div>
              </div>
            </div>

            {/* 本社住所 */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 2 }}> {/* 3 → 2 に変更（-1mm） */}
              <div style={{ width: '48%', textAlign: 'right', fontSize: 14, marginTop: '1mm', position: 'relative', zIndex: 1 }}> {/* 2mm → 1mm に変更（-1mm） */}
                <div>本社　鹿児島市南栄4丁目11番地2</div>
              </div>
            </div>

            {/* 総金額・注記文・付帯事項 + 営業所・承認印 */}
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-start', marginTop: '1mm', gap: '5mm' }}> {/* justifyContent: 'space-between' → 'center' に変更、gap: '5mm' のまま */}
              {/* 左側：総金額・注記文・付帯事項 */}
              <div style={{ width: '50%' }}> {/* 60% → 50% に変更 */}
                {/* 総金額 */}
                <div style={{ display: 'inline-block', borderBottom: '2px solid #000', paddingBottom: 0 }}>
                  <table style={{ borderCollapse: 'collapse' }}>
                    <tbody>
                      <tr>
                        <td style={{ fontSize: 14, fontWeight: 'bold', padding: 0, paddingRight: 10 }}>総金額</td>
                        <td style={{ fontSize: 20, fontWeight: 'bold', textAlign: 'right', padding: 0 }}>
                          {totalAmount.toLocaleString()}
                        </td>
                        <td style={{ fontSize: 12, fontWeight: 'bold', padding: 0, paddingLeft: 5, whiteSpace: 'nowrap' }}>
                          円(消費税込み)
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* 注記文 */}
                <div style={{ fontSize: 12, marginTop: '1mm', lineHeight: 1.2 }}>
                  <div>　御照会賜りました物品上記の通り御見積申し上げます。</div>
                  <div>　何卒ご用命下さるようお願い申し上げます。</div>
                </div>

                {/* 付帯事項 */}
                <div style={{ marginTop: '2mm', fontSize: 12 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <tbody>
                      {[
                        ['件　　　名', subject],
                        ['受 渡 場 所', deliveryPlace],
                        ['受 渡 期 限', deliveryDeadline],
                        ['受 渡 条 件', deliveryTerms],
                        ['有 効 期 限', validityText],
                        ['御支払条件', paymentTerms],
                      ].map(([label, value], index) => (
                        <tr key={index}>
                          <td style={{ padding: '1mm 5mm 1mm 0', width: 90, whiteSpace: 'nowrap' }}>
                            {label}
                          </td>
                          <td style={{ padding: 0, borderBottom: '1px solid #000', width: '60mm', verticalAlign: 'bottom' }}>
                            {value}
                          </td>
                          <td style={{ width: 'auto' }} />
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 右側：営業所一覧・承認印 */}
              <div style={{ width: '35%', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', fontSize: 12 }}> {/* 38% → 35% に変更 */}
                {/* 代表電話 */}
                <div style={{ margin: 0, padding: 0, lineHeight: 1 }}>代表電話　099-269-1821</div>

                {/* 営業所一覧 */}
                <div style={{ marginTop: '1mm', padding: 0 }}>
                  {[
                    ['南九州営業所', '099-269-1821'],
                    ['中九州営業所', '096-380-5522'],
                    ['西九州営業所', '0942-43-4691'],
                    ['東日本営業所', '0299-57-6722'],
                    ['沖縄出張所', '098-987-1966'],
                    ['東北出張所', '0178-32-6525'],
                  ].map(([name, tel], index) => (
                    <div key={index} style={{ display: 'flex', alignItems: 'center', margin: '1.5mm 0' }}>
                      <div style={{ width: '4mm', height: '4mm', border: '1px solid #000', marginRight: '2mm' }} />
                      <div style={{ lineHeight: 1.3, whiteSpace: 'nowrap' }}>
                        {name}　{tel}
                      </div>
                    </div>
                  ))}
                </div>

                {/* 承認印（4枠） */}
                <div style={{ marginTop: '1.5mm', alignSelf: 'flex-end' }}>
                  <table style={{ border: '1px solid #000', borderCollapse: 'collapse', fontSize: 8 }}>
                    <thead>
                      <tr>
                        {['社長', '専務', '所属長', '担当'].map((t) => (
                          <th key={t} style={{ border: '1px solid #000', padding: '2px 6px', backgroundColor: '#fff', width: 47, height: 22 }}>
                            {t}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={{ border: '1px solid #000', padding: 0, width: 37, height: 32, position: 'relative' }}>
                          {approvalStamps.president && stampUrls?.president && (
                            <img
                              src={stampUrls.president}
                              alt="社長印"
                              style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', maxWidth: '90%', maxHeight: '90%', objectFit: 'contain' }}
                              onError={(e) => { e.currentTarget.style.display = 'none' }}
                            />
                          )}
                        </td>
                        <td style={{ border: '1px solid #000', padding: 0, width: 37, height: 32, position: 'relative' }}>
                          {approvalStamps.director && stampUrls?.director && (
                            <img
                              src={stampUrls.director}
                              alt="専務印"
                              style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', maxWidth: '90%', maxHeight: '90%', objectFit: 'contain' }}
                              onError={(e) => { e.currentTarget.style.display = 'none' }}
                            />
                          )}
                        </td>
                        <td style={{ border: '1px solid #000', padding: 0, width: 37, height: 32, position: 'relative' }}>
                          {approvalStamps.manager && stampUrls?.manager && (
                            <img
                              src={stampUrls.manager}
                              alt="所属長印"
                              style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', maxWidth: '90%', maxHeight: '90%', objectFit: 'contain' }}
                              onError={(e) => { e.currentTarget.style.display = 'none' }}
                            />
                          )}
                        </td>
                        <td style={{ border: '1px solid #000', padding: 0, width: 37, height: 32, position: 'relative' }}>
                          {approvalStamps.staff && stampUrls?.staff && (
                            <img
                              src={stampUrls.staff}
                              alt="担当印"
                              style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', maxWidth: '90%', maxHeight: '90%', objectFit: 'contain' }}
                              onError={(e) => { e.currentTarget.style.display = 'none' }}
                            />
                          )}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* ★ 明細テーブル（25行固定） */}
            {/* 横様式の表紙には明細テーブルは不要なため削除 */}

            {/* 表紙ページには明細テーブルを表示しない */}
          </div>
        </div>

        {/* セクション合計ページ */}
        {sectionPages}

        {/* 明細ページ */}
        {detailPages}
      </div>
    )
  }

  // =========================
  // 縦様式
  // =========================
  const DATA_ROWS_PER_PAGE = MAX_ROWS_PER_PAGE || 20 // ★ propsから使用、デフォルト20
  const pages: PrintRow[][] = []
  for (let i = 0; i < rows.length; i += DATA_ROWS_PER_PAGE) {
    pages.push(rows.slice(i, i + DATA_ROWS_PER_PAGE))
  }
  if (pages.length === 0) {
    pages.push([])
  }

  return (
    <div ref={ref} style={{ backgroundColor: '#fff' }}>
      {pages.map((pageRows, pageIndex) => {
        const isLast = pageIndex === pages.length - 1
        const emptyCount = Math.max(0, DATA_ROWS_PER_PAGE - pageRows.length)

        return (
          <div
            key={pageIndex}
            style={{
              width: '210mm',
              minHeight: '297mm',
              padding: '8mm 15mm',
              boxSizing: 'border-box',
              fontFamily: 'MS Gothic, "Hiragino Sans", "Yu Gothic", sans-serif',
              fontSize: 10,
              backgroundColor: '#fff',
              position: 'relative',
              pageBreakAfter: isLast ? 'auto' : 'always',
            }}
          >
            {/* タイトル */}
            <div style={{ textAlign: 'center', marginBottom: 4 }}>
              <h1 style={{ fontSize: 28, margin: 0, letterSpacing: 8 }}>御 見 積 書</h1>
            </div>

            {/* ★ 作成日・見積番号（縦配置・右詰） */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-end',
                marginBottom: 2,
                fontSize: 11,
                gap: '1mm',
              }}
            >
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontWeight: 'bold', marginRight: '5mm' }}>作成日</span>
                <span>{toWareki(estimateDate)}</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontWeight: 'bold', marginRight: '5mm' }}>見積番号</span>
                <span>{estimateNo || '未採番'}</span>
              </div>
            </div>

            {/* 得意先＋社名・承認印 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
              {/* 左：御中 */}
              <div style={{ width: '48%' }}>
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 'bold',
                    borderBottom: '2px solid #000',
                    display: 'inline-block',
                    minWidth: '180px',
                    paddingBottom: 2,
                  }}
                >
                  {customerName}　　　様
                </div>
              </div>

              {/* 右：社名・代表者 */}
              <div style={{ width: '48%', textAlign: 'right', position: 'relative' }}>
                {/* 社印（背景） */}
                <div
                  style={{
                    position: 'absolute',
                    top: -8,
                    right: 5,
                    opacity: 0.6,
                    zIndex: 0,
                    pointerEvents: 'none',
                  }}
                >
                  <img
                    src="/company-seal.png"
                    alt="社印"
                    style={{
                      width: 100,
                      height: 100,
                      objectFit: 'contain',
                    }}
                  />
                </div>

                {/* 社名・代表者 */}
                <div style={{ position: 'relative', zIndex: 1, lineHeight: 1.3 }}>
                  <div style={{ fontSize: 18, fontWeight: 'bold', marginTop: '1mm' }}>三州産業株式会社</div>
                  <div style={{ fontSize: 14, fontWeight: 'bold', marginTop: '0.5mm' }}>代表取締役社長　竹之内　浩樹</div>
                </div>
              </div>
            </div>

            {/* 本社住所 */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 2 }}>
              <div style={{ width: '48%', textAlign: 'right', fontSize: 12, marginTop: '0.5mm', position: 'relative', zIndex: 1 }}>
                <div>本社　鹿児島市南栄4丁目11番地2</div>
              </div>
            </div>

            {/* 総金額・注記文・付帯事項 + 営業所・承認印 */}
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-start', marginTop: '1mm', gap: '5mm' }}>
              {/* 左側：総金額・注記文・付帯事項 */}
              <div style={{ width: '50%' }}>
                {/* 総金額 */}
                <div style={{ display: 'inline-block', borderBottom: '2px solid #000', paddingBottom: 0 }}>
                  <table style={{ borderCollapse: 'collapse' }}>
                    <tbody>
                      <tr>
                        <td style={{ fontSize: 14, fontWeight: 'bold', padding: 0, paddingRight: 10 }}>総金額</td>
                        <td style={{ fontSize: 20, fontWeight: 'bold', textAlign: 'right', padding: 0 }}>
                          {totalAmount.toLocaleString()}
                        </td>
                        <td style={{ fontSize: 12, fontWeight: 'bold', padding: 0, paddingLeft: 5, whiteSpace: 'nowrap' }}>
                          円(消費税込み)
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* 注記文 */}
                <div style={{ fontSize: 12, marginTop: '1mm', lineHeight: 1.2 }}>
                  <div>　御照会賜りました物品上記の通り御見積申し上げます。</div>
                  <div>　何卒ご用命下さるようお願い申し上げます。</div>
                </div>

                {/* 付帯事項 */}
                <div style={{ marginTop: '2mm', fontSize: 12 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <tbody>
                      {[
                        ['件　　　名', subject],
                        ['受 渡 場 所', deliveryPlace],
                        ['受 渡 期 限', deliveryDeadline],
                        ['受 渡 条 件', deliveryTerms],
                        ['有 効 期 限', validityText],
                        ['御支払条件', paymentTerms],
                      ].map(([label, value], index) => (
                        <tr key={index}>
                          <td style={{ padding: '1mm 5mm 1mm 0', width: 90, whiteSpace: 'nowrap' }}>
                            {label}
                          </td>
                          <td style={{ padding: 0, borderBottom: '1px solid #000', width: '60mm', verticalAlign: 'bottom' }}>
                            {value}
                          </td>
                          <td style={{ width: 'auto' }} />
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 右側：営業所一覧・承認印 */}
              <div style={{ width: '35%', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', fontSize: 12 }}>
                {/* 代表電話 */}
                <div style={{ margin: 0, padding: 0, lineHeight: 1 }}>代表電話　099-269-1821</div>

                {/* 営業所一覧 */}
                <div style={{ marginTop: '1mm', padding: 0 }}>
                  {[
                    ['南九州営業所', '099-269-1821'],
                    ['中九州営業所', '096-380-5522'],
                    ['西九州営業所', '0942-43-4691'],
                    ['東日本営業所', '0299-57-6722'],
                    ['沖縄出張所', '098-987-1966'],
                    ['東北出張所', '0178-32-6525'],
                  ].map(([name, tel], index) => (
                    <div key={index} style={{ display: 'flex', alignItems: 'center', margin: '1.5mm 0' }}>
                      <div style={{ width: '4mm', height: '4mm', border: '1px solid #000', marginRight: '2mm' }} />
                      <div style={{ lineHeight: 1.3, whiteSpace: 'nowrap' }}>
                        {name}　{tel}
                      </div>
                    </div>
                  ))}
                </div>

                {/* 承認印（4枠） */}
                <div style={{ marginTop: '1.5mm', alignSelf: 'flex-end' }}>
                  <table style={{ border: '1px solid #000', borderCollapse: 'collapse', fontSize: 8 }}>
                    <thead>
                      <tr>
                        {['社長', '専務', '所属長', '担当'].map((t) => (
                          <th key={t} style={{ border: '1px solid #000', padding: '2px 6px', backgroundColor: '#fff', width: 47, height: 22 }}>
                            {t}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={{ border: '1px solid #000', padding: 0, width: 37, height: 32, position: 'relative' }}>
                          {approvalStamps.president && stampUrls?.president && (
                            <img
                              src={stampUrls.president}
                              alt="社長印"
                              style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', maxWidth: '90%', maxHeight: '90%', objectFit: 'contain' }}
                              onError={(e) => { e.currentTarget.style.display = 'none' }}
                            />
                          )}
                        </td>
                        <td style={{ border: '1px solid #000', padding: 0, width: 37, height: 32, position: 'relative' }}>
                          {approvalStamps.director && stampUrls?.director && (
                            <img
                              src={stampUrls.director}
                              alt="専務印"
                              style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', maxWidth: '90%', maxHeight: '90%', objectFit: 'contain' }}
                              onError={(e) => { e.currentTarget.style.display = 'none' }}
                            />
                          )}
                        </td>
                        <td style={{ border: '1px solid #000', padding: 0, width: 37, height: 32, position: 'relative' }}>
                          {approvalStamps.manager && stampUrls?.manager && (
                            <img
                              src={stampUrls.manager}
                              alt="所属長印"
                              style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', maxWidth: '90%', maxHeight: '90%', objectFit: 'contain' }}
                              onError={(e) => { e.currentTarget.style.display = 'none' }}
                            />
                          )}
                        </td>
                        <td style={{ border: '1px solid #000', padding: 0, width: 37, height: 32, position: 'relative' }}>
                          {approvalStamps.staff && stampUrls?.staff && (
                            <img
                              src={stampUrls.staff}
                              alt="担当印"
                              style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', maxWidth: '90%', maxHeight: '90%', objectFit: 'contain' }}
                              onError={(e) => { e.currentTarget.style.display = 'none' }}
                            />
                          )}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* 明細テーブル（20行固定） */}
            <table
              style={{
                width: '100%',
                border: '1px solid #000',
                borderCollapse: 'collapse',
                fontSize: 10,
                marginTop: '3mm',
                marginBottom: '2mm',
              }}
            >
              <thead>
                <tr style={{ backgroundColor: '#c8e6c8' }}>
                  <th style={{ border: '1px solid #000', padding: '2px', width: 250, height: '6mm' }}>品　　　名　・　規　　　格</th>
                  <th style={{ border: '1px solid #000', padding: '2px', width: 45, height: '6mm' }}>数 量</th>
                  <th style={{ border: '1px solid #000', padding: '2px', width: 35, height: '6mm' }}>単位</th>
                  <th style={{ border: '1px solid #000', padding: '2px', width: 70, height: '6mm' }}>単　　価</th>
                  <th style={{ border: '1px solid #000', padding: '2px', width: 80, height: '6mm' }}>金　　額</th>
                  <th style={{ border: '1px solid #000', padding: '2px', width: 50, height: '6mm' }}>備　　考</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row, idx) => (
                  <tr key={idx}>
                    <td style={{ border: '1px solid #000', padding: '2px 3px', fontSize: 10, height: '6mm' }}>
                      {row.item_name}
                      {row.spec && (
                        <>
                          <span style={{ display: 'inline-block', width: '5mm' }} />
                          {row.spec}
                        </>
                      )}
                    </td>
                    <td style={{ border: '1px solid #000', padding: '2px 3px', textAlign: 'right', fontSize: 10, height: '6mm' }}>
                      {row.quantity ? row.quantity.toLocaleString() : ''}
                    </td>
                    <td style={{ border: '1px solid #000', padding: '2px 3px', textAlign: 'center', fontSize: 10, height: '6mm' }}>{row.unit}</td>
                    <td style={{ border: '1px solid #000', padding: '2px 3px', textAlign: 'right', fontSize: 10, height: '6mm' }}>
                      {row.unit_price ? row.unit_price.toLocaleString() : ''}
                    </td>
                    <td style={{ border: '1px solid #000', padding: '2px 3px', textAlign: 'right', fontSize: 10, height: '6mm' }}>
                      {row.amount ? row.amount.toLocaleString() : ''}
                    </td>
                    <td style={{ border: '1px solid #000', padding: '2px 3px', fontSize: 10, height: '6mm' }}>&nbsp;</td>
                  </tr>
                ))}

                {Array.from({ length: emptyCount }).map((_, idx) => (
                  <tr key={`empty-${idx}`}>
                    <td style={{ border: '1px solid #000', padding: '2px 3px', fontSize: 10, height: '6mm' }}>&nbsp;</td>
                    <td style={{ border: '1px solid #000', padding: '2px 3px', fontSize: 10, height: '6mm' }}>&nbsp;</td>
                    <td style={{ border: '1px solid #000', padding: '2px 3px', fontSize: 10, height: '6mm' }}>&nbsp;</td>
                    <td style={{ border: '1px solid #000', padding: '2px 3px', fontSize: 10, height: '6mm' }}>&nbsp;</td>
                    <td style={{ border: '1px solid #000', padding: '2px 3px', fontSize: 10, height: '6mm' }}>&nbsp;</td>
                    <td style={{ border: '1px solid #000', padding: '2px 3px', fontSize: 10, height: '6mm' }}>&nbsp;</td>
                  </tr>
                ))}

                {discount === 0 && (
                  <>
                    <tr>
                      <td style={{ border: '1px solid #000', padding: '2px 3px', fontSize: 10, height: '6mm' }}>&nbsp;</td>
                      <td style={{ border: '1px solid #000', padding: '2px 3px', fontSize: 10, height: '6mm' }}>&nbsp;</td>
                      <td style={{ border: '1px solid #000', padding: '2px 3px', fontSize: 10, height: '6mm' }}>&nbsp;</td>
                      <td style={{ border: '1px solid #000', padding: '2px 3px', fontSize: 10, height: '6mm' }}>&nbsp;</td>
                      <td style={{ border: '1px solid #000', padding: '2px 3px', fontSize: 10, height: '6mm' }}>&nbsp;</td>
                      <td style={{ border: '1px solid #000', padding: '2px 3px', fontSize: 10, height: '6mm' }}>&nbsp;</td>
                    </tr>
                    <tr>
                      <td style={{ border: '1px solid #000', padding: '2px 3px', fontSize: 10, height: '6mm' }}>&nbsp;</td>
                      <td style={{ border: '1px solid #000', padding: '2px 3px', fontSize: 10, height: '6mm' }}>&nbsp;</td>
                      <td style={{ border: '1px solid #000', padding: '2px 3px', fontSize: 10, height: '6mm' }}>&nbsp;</td>
                      <td style={{ border: '1px solid #000', padding: '2px 3px', fontSize: 10, height: '6mm' }}>&nbsp;</td>
                      <td style={{ border: '1px solid #000', padding: '2px 3px', fontSize: 10, height: '6mm' }}>&nbsp;</td>
                      <td style={{ border: '1px solid #000', padding: '2px 3px', fontSize: 10, height: '6mm' }}>&nbsp;</td>
                    </tr>
                  </>
                )}

                <tr>
                  <td style={{ border: '1px solid #000', padding: '4px 8px', textAlign: 'center', fontWeight: 'bold', fontSize: 10, height: '6mm' }}>
                    小　　　計
                  </td>
                  <td style={{ border: '1px solid #000', padding: '2px 3px', fontSize: 10, height: '6mm' }}>&nbsp;</td>
                  <td style={{ border: '1px solid #000', padding: '2px 3px', fontSize: 10, height: '6mm' }}>&nbsp;</td>
                  <td style={{ border: '1px solid #000', padding: '2px 3px', fontSize: 10, height: '6mm' }}>&nbsp;</td>
                  <td style={{ border: '1px solid #000', padding: '4px 8px', textAlign: 'right', fontWeight: 'bold', fontSize: 10, height: '6mm' }}>
                    {isLast ? subtotal.toLocaleString() : ''}
                  </td>
                  <td style={{ border: '1px solid #000', padding: '2px 3px', height: '6mm' }}>&nbsp;</td>
                </tr>

                {discount > 0 && (
                  <>
                    <tr>
                      <td style={{ border: '1px solid #000', padding: '4px 8px', textAlign: 'center', fontWeight: 'bold', fontSize: 10, height: '6mm' }}>
                        出精値引き
                      </td>
                      <td style={{ border: '1px solid #000', padding: '2px 3px', fontSize: 10, height: '6mm' }}>&nbsp;</td>
                      <td style={{ border: '1px solid #000', padding: '2px 3px', fontSize: 10, height: '6mm' }}>&nbsp;</td>
                      <td style={{ border: '1px solid #000', padding: '2px 3px', fontSize: 10, height: '6mm' }}>&nbsp;</td>
                      <td style={{ border: '1px solid #000', padding: '4px 8px', textAlign: 'right', fontWeight: 'bold', fontSize: 10, height: '6mm' }}>
                        {isLast ? discount.toLocaleString() : ''}
                      </td>
                      <td style={{ border: '1px solid #000', padding: '2px 3px', height: '6mm' }}>&nbsp;</td>
                    </tr>

                    <tr>
                      <td style={{ border: '1px solid #000', padding: '4px 8px', textAlign: 'center', fontWeight: 'bold', fontSize: 10, height: '6mm' }}>
                        値引後小計
                      </td>
                      <td style={{ border: '1px solid #000', padding: '2px 3px', fontSize: 10, height: '6mm' }}>&nbsp;</td>
                      <td style={{ border: '1px solid #000', padding: '2px 3px', fontSize: 10, height: '6mm' }}>&nbsp;</td>
                      <td style={{ border: '1px solid #000', padding: '2px 3px', fontSize: 10, height: '6mm' }}>&nbsp;</td>
                      <td style={{ border: '1px solid #000', padding: '4px 8px', textAlign: 'right', fontWeight: 'bold', fontSize: 10, height: '6mm' }}>
                        {isLast ? subtotalAfterDiscount.toLocaleString() : ''}
                      </td>
                      <td style={{ border: '1px solid #000', padding: '2px 3px', height: '6mm' }}>&nbsp;</td>
                    </tr>
                  </>
                )}

                <tr>
                  <td style={{ border: '1px solid #000', padding: '4px 8px', textAlign: 'center', fontWeight: 'bold', fontSize: 10, height: '6mm' }}>
                    消 費 税（{(taxRate * 100).toFixed(0)}%）
                  </td>
                  <td style={{ border: '1px solid #000', padding: '2px 3px', fontSize: 10, height: '6mm' }}>&nbsp;</td>
                  <td style={{ border: '1px solid #000', padding: '2px 3px', fontSize: 10, height: '6mm' }}>&nbsp;</td>
                  <td style={{ border: '1px solid #000', padding: '2px 3px', fontSize: 10, height: '6mm' }}>&nbsp;</td>
                  <td style={{ border: '1px solid #000', padding: '4px 8px', textAlign: 'right', fontWeight: 'bold', fontSize: 10, height: '6mm' }}>
                    {isLast ? taxAmount.toLocaleString() : ''}
                  </td>
                  <td style={{ border: '1px solid #000', padding: '2px 3px', height: '6mm' }}>&nbsp;</td>
                </tr>

                <tr>
                  <td style={{ border: '2px solid #000', padding: '4px 8px', textAlign: 'center', fontWeight: 'bold', fontSize: 11, height: '6mm' }}>
                    合　　　計
                  </td>
                  <td style={{ border: '2px solid #000', padding: '2px 3px', backgroundColor: '#f0f0f0', fontSize: 10, height: '6mm' }}>&nbsp;</td>
                  <td style={{ border: '2px solid #000', padding: '2px 3px', backgroundColor: '#f0f0f0', fontSize: 10, height: '6mm' }}>&nbsp;</td>
                  <td style={{ border: '2px solid #000', padding: '2px 3px', backgroundColor: '#f0f0f0', fontSize: 10, height: '6mm' }}>&nbsp;</td>
                  <td style={{ border: '2px solid #000', padding: '4px 8px', textAlign: 'right', fontWeight: 'bold', fontSize: 11, backgroundColor: '#f0f0f0', height: '6mm' }}>
                    {isLast ? totalAmount.toLocaleString() : ''}
                  </td>
                  <td style={{ border: '2px solid #000', padding: '2px 3px', backgroundColor: '#f0f0f0', fontSize: 10, height: '6mm' }}>&nbsp;</td>
                </tr>
              </tbody>
            </table>
          </div>
        )
      })}
    </div>
  )
})

PrintEstimate.displayName = 'PrintEstimate'
export default PrintEstimate