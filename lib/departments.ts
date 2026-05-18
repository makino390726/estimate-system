/** 担当者マスタの部署（staffs.department） */
export const DEPARTMENTS = [
    '管理部',
    '企画部',
    '南九州営業所',
    '沖縄出張所',
    '中九州営業所',
    '福岡営業所',
    '東日本出張所',
    '東北出張所',
    '製造部',
    '技術部',
] as const

export type DepartmentName = (typeof DEPARTMENTS)[number]
