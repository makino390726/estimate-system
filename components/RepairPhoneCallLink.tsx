'use client'

import { collectRepairPhoneEntries, toTelHref } from '@/lib/repairPhoneLink'

const linkStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 6,
    padding: '10px 16px',
    background: '#166534',
    color: '#fff',
    borderRadius: 10,
    fontSize: 16,
    fontWeight: 700,
    textDecoration: 'none',
    border: '1px solid #22c55e',
    WebkitTapHighlightColor: 'transparent',
}

const rowStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 8,
    marginTop: 10,
    marginBottom: 4,
}

type Props = {
    customerPhone?: string | null
    customerMobile?: string | null
    /** 一覧カード内では Link 遷移を止める */
    stopPropagation?: boolean
    className?: string
}

export function RepairPhoneCallLinks({
    customerPhone,
    customerMobile,
    stopPropagation = false,
    className,
}: Props) {
    const entries = collectRepairPhoneEntries(customerPhone, customerMobile)
    if (entries.length === 0) return null

    const stop = (e: React.MouseEvent | React.PointerEvent) => {
        if (stopPropagation) e.stopPropagation()
    }

    return (
        <div className={className} style={rowStyle}>
            {entries.map((entry) => {
                const href = toTelHref(entry.number)
                if (!href) return null
                return (
                    <a
                        key={`${entry.label}-${entry.number}`}
                        href={href}
                        style={linkStyle}
                        onClick={stop}
                        onPointerDown={stop}
                    >
                        <span aria-hidden>📞</span>
                        <span>
                            {entry.label}: {entry.number}
                        </span>
                    </a>
                )
            })}
        </div>
    )
}
