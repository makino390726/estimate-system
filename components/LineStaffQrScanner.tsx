'use client'

import { useEffect, useId, useRef, useState } from 'react'
type Props = {
    /** 読み取り成功時。true を返すとカメラを停止 */
    onScan: (decoded: string) => boolean | void
}

export default function LineStaffQrScanner({ onScan }: Props) {
    const domId = useId().replace(/:/g, '')
    const scannerRef = useRef<import('html5-qrcode').Html5Qrcode | null>(null)
    const lastDecodedRef = useRef('')
    const [active, setActive] = useState(false)
    const [starting, setStarting] = useState(false)

    const stopScanner = async () => {
        const scanner = scannerRef.current
        scannerRef.current = null
        if (!scanner) return
        try {
            if (scanner.isScanning) await scanner.stop()
        } catch { /* ignore */ }
        try {
            scanner.clear()
        } catch { /* ignore */ }
    }

    useEffect(() => {
        return () => {
            void stopScanner()
        }
    }, [])

    const startScanner = async () => {
        setStarting(true)
        try {
            const { Html5Qrcode } = await import('html5-qrcode')
            await stopScanner()
            const scanner = new Html5Qrcode(domId)
            scannerRef.current = scanner
            await scanner.start(
                { facingMode: 'environment' },
                { fps: 8, qrbox: { width: 220, height: 220 } },
                (decoded) => {
                    if (decoded === lastDecodedRef.current) return
                    lastDecodedRef.current = decoded
                    const stop = onScan(decoded)
                    if (stop) {
                        void stopScanner()
                        setActive(false)
                    }
                },
                () => { /* frame miss */ },
            )
            setActive(true)
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : 'カメラを起動できませんでした'
            onScan(message)
            setActive(false)
        } finally {
            setStarting(false)
        }
    }

    const handleToggle = () => {
        if (active) {
            void stopScanner()
            setActive(false)
            lastDecodedRef.current = ''
            return
        }
        lastDecodedRef.current = ''
        void startScanner()
    }

    return (
        <div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                <button
                    type="button"
                    onClick={handleToggle}
                    disabled={starting}
                    style={{
                        padding: '8px 14px',
                        borderRadius: 8,
                        border: '1px solid #334155',
                        background: active ? '#7f1d1d' : '#1e40af',
                        color: '#f8fafc',
                        cursor: 'pointer',
                        fontSize: 13,
                        fontWeight: 600,
                    }}
                >
                    {starting ? '起動中…' : active ? 'カメラを停止' : 'QR を読み取る'}
                </button>
            </div>
            <div
                id={domId}
                style={{
                    width: '100%',
                    maxWidth: 320,
                    minHeight: active ? 260 : 0,
                    overflow: 'hidden',
                    borderRadius: 12,
                    border: active ? '1px solid #334155' : 'none',
                    background: '#0f172a',
                }}
            />
        </div>
    )
}
