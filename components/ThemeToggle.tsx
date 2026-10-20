'use client'

import { useEffect, useState } from 'react'

export const THEME_STORAGE_KEY = 'sanshu-color-theme'

export type AppTheme = 'dark' | 'light'

export function applyTheme(theme: AppTheme) {
  document.documentElement.setAttribute('data-theme', theme)
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // ignore
  }
}

export function readStoredTheme(): AppTheme {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<AppTheme>('dark')

  useEffect(() => {
    const stored = readStoredTheme()
    setTheme(stored)
    applyTheme(stored)
  }, [])

  const toggle = () => {
    const next: AppTheme = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    applyTheme(next)
  }

  const isLight = theme === 'light'

  return (
    <button
      type="button"
      onClick={toggle}
      className="theme-toggle-btn"
      aria-pressed={isLight}
      title={isLight ? 'ダークモードに切替' : '通常モードに切替'}
    >
      {isLight ? '🌙 ダークモード' : '☀️ 通常モード'}
    </button>
  )
}
