export type ManufacturingPlanSortRow = {
    id: string
    avg_unit_price: number | null
}

function compareByAvgUnitPriceDesc(a: ManufacturingPlanSortRow, b: ManufacturingPlanSortRow): number {
    const av = a.avg_unit_price
    const bv = b.avg_unit_price
    if (av == null && bv == null) return a.id.localeCompare(b.id, 'ja')
    if (av == null) return 1
    if (bv == null) return -1
    if (av !== bv) return bv - av
    return a.id.localeCompare(b.id, 'ja')
}

export function sortManufacturingPlanRows<T extends ManufacturingPlanSortRow>(rows: T[]): T[] {
    return [...rows].sort(compareByAvgUnitPriceDesc)
}
