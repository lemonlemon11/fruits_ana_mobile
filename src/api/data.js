import { api } from './client'
import { gradeColor, gradeLabel } from '../utils/format'

const GRADES = ['A', 'B', 'AB', 'C', 'D', 'E', 'F', 'OTHER']

function num(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function nullableNum(value) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeMetrics(row = {}) {
  const salesQuantity = num(row.sales_quantity ?? row.salesQuantity ?? row.quantity)
  const salesAmount = num(row.sales_amount ?? row.salesAmount ?? row.amount)
  return {
    salesQuantity,
    salesAmount,
    weightedAvgPrice:
      nullableNum(row.weighted_avg_price ?? row.weightedAvgPrice)
      ?? (salesQuantity ? salesAmount / salesQuantity : null),
  }
}

function normalizeGrades(rows = []) {
  const present = GRADES.filter((grade) =>
    rows.some((row) => String(row.grade ?? '').toUpperCase() === grade),
  )
  return present.map((grade) => {
    const matches = rows.filter((row) => String(row.grade ?? '').toUpperCase() === grade)
    const salesQuantity = matches.reduce((sum, row) => sum + num(row.sales_quantity ?? row.quantity), 0)
    const salesAmount = matches.reduce((sum, row) => sum + num(row.sales_amount ?? row.amount), 0)
    const weightedAvgPrice =
      nullableNum(matches[0]?.weighted_avg_price)
      ?? (salesQuantity ? salesAmount / salesQuantity : null)
    const explicitShare = matches.reduce((total, row) => {
      const value = nullableNum(row.quantity_share ?? row.quantityShare)
      return value === null ? total : (total ?? 0) + value
    }, null)
    return {
      grade,
      label: gradeLabel(grade),
      color: gradeColor(grade),
      salesQuantity,
      salesAmount,
      weightedAvgPrice,
      quantityShare: explicitShare,
    }
  })
}

function normalizeOverview(body) {
  const grades = normalizeGrades(body.grades ?? body.grade_summary)
  const totalRaw = body.total ?? body.summary ?? {}
  const total = normalizeMetrics(totalRaw)
  if (!total.salesQuantity) {
    total.salesQuantity = grades.reduce((sum, row) => sum + row.salesQuantity, 0)
  }
  if (!total.salesAmount) {
    total.salesAmount = grades.reduce((sum, row) => sum + row.salesAmount, 0)
  }
  if (total.weightedAvgPrice === null && total.salesQuantity) {
    total.weightedAvgPrice = total.salesAmount / total.salesQuantity
  }

  return {
    total,
    grades: grades.map((row) => ({
      ...row,
      quantityShare: row.quantityShare ?? (total.salesQuantity ? row.salesQuantity / total.salesQuantity : null),
    })),
    settlements: Array.isArray(body.settlements) ? body.settlements : [],
    trend: Array.isArray(body.trend) ? body.trend : [],
    issueCounts: body.issue_counts ?? body.issueCounts ?? {},
    operatingAnomalies: Array.isArray(body.operating_anomalies ?? body.operatingAnomalies)
      ? (body.operating_anomalies ?? body.operatingAnomalies)
      : [],
  }
}

function normalizeRecord(row = {}) {
  return {
    id: row.id,
    saleDate: row.sale_date ?? row.saleDate ?? '',
    fruitType: row.fruit_type ?? row.fruitType ?? '榴莲',
    grade: row.grade ?? row.grade_raw ?? row.gradeRaw ?? '',
    gradeRaw: row.grade_raw ?? row.gradeRaw ?? '',
    specRaw: row.spec_raw ?? row.specRaw ?? '',
    headCount: row.head_count ?? row.piece_count ?? row.headCount ?? '',
    quantity: num(row.quantity),
    unitPrice: num(row.unit_price ?? row.unitPrice),
    amount: num(row.amount),
    remark: row.remark ?? '',
    salesRegion: row.sales_region ?? row.salesRegion ?? '',
  }
}

function normalizeSettlementItem(row = {}) {
  const total = row.total ?? {}
  const salesQuantity = num(row.total_quantity ?? row.totalQuantity ?? total.sales_quantity ?? total.salesQuantity)
  const salesAmount = num(row.sales_amount ?? row.salesAmount ?? total.sales_amount ?? total.salesAmount)
  const averagePrice = nullableNum(
    row.average_price
    ?? row.averagePrice
    ?? total.weighted_avg_price
    ?? total.weightedAvgPrice,
  )
  return {
    merchantNo: row.merchant_no ?? row.merchantNo ?? '',
    merchantNoNormalized: row.merchant_no_normalized ?? row.merchantNoNormalized ?? '',
    orderNo: row.order_no ?? row.orderNo ?? '',
    orderNoNormalized: row.order_no_normalized ?? row.orderNoNormalized ?? '',
    brand: row.brand ?? '',
    fruitType: row.fruit_type ?? row.fruitType ?? '',
    series: row.series ?? '',
    containerNo: row.container_no ?? row.containerNo ?? '',
    vehicleNo: row.vehicle_no ?? row.vehicleNo ?? '',
    arrivalDate: row.arrival_date ?? row.arrivalDate ?? '',
    saleDateStart: row.sale_date_start ?? row.start_date ?? row.startDate ?? '',
    saleDateEnd: row.sale_date_end ?? row.end_date ?? row.endDate ?? '',
    salesAmount,
    totalQuantity: salesQuantity,
    averagePrice:
      averagePrice ?? (salesQuantity ? salesAmount / salesQuantity : null),
    confirmedAt: row.confirmed_at ?? row.confirmedAt ?? '',
    gradeQuantities: row.grade_quantities ?? row.gradeQuantities ?? {},
    recordCount: num(row.record_count ?? row.recordCount),
  }
}

function normalizeSeriesSettlementItem(row = {}) {
  const item = normalizeSettlementItem(row)
  const grades = Array.isArray(row.grades) ? row.grades : []
  const gradeQuantities = {}
  const gradeRows = grades
    .map((gradeRow) => {
      const grade = String(gradeRow?.grade ?? '').toUpperCase()
      if (!grade) return null
      const quantity = num(
        gradeRow.sales_quantity ?? gradeRow.salesQuantity ?? gradeRow.quantity,
      )
      const amount = num(
        gradeRow.sales_amount ?? gradeRow.salesAmount ?? gradeRow.amount,
      )
      gradeQuantities[grade] = quantity
      return {
        grade,
        salesQuantity: quantity,
        salesAmount: amount,
        weightedAvgPrice:
          nullableNum(gradeRow.weighted_avg_price ?? gradeRow.weightedAvgPrice)
          ?? (quantity ? amount / quantity : null),
        quantityShare: nullableNum(gradeRow.quantity_share ?? gradeRow.quantityShare),
      }
    })
    .filter(Boolean)
  return { ...item, gradeQuantities, _gradeRows: gradeRows }
}

function normalizeSettlementDetail(body, merchantNo) {
  const overview = normalizeOverview(body)
  const period = body.sales_period ?? body.salesPeriod ?? {}
  const settlement = body.settlement ?? body.settlement_summary ?? body.summary_detail ?? {}
  return {
    ...overview,
    merchantNo: body.merchant_no ?? body.merchantNo ?? merchantNo,
    merchantNoNormalized: body.merchant_no_normalized ?? body.merchantNoNormalized ?? '',
    orderNo: body.order_no ?? body.orderNo ?? '',
    orderNoNormalized: body.order_no_normalized ?? body.orderNoNormalized ?? '',
    containerNo: body.container_no ?? body.containerNo ?? '',
    vehicleNo: body.vehicle_no ?? body.vehicleNo ?? '',
    fruitType: body.fruit_type ?? body.fruitType ?? '榴莲',
    arrivalDate: body.arrival_date ?? body.arrivalDate ?? '',
    startDate: period.start_date ?? period.startDate ?? '',
    endDate: period.end_date ?? period.endDate ?? '',
    settlement: {
      afterSalesAmount: nullableNum(settlement.after_sales_amount ?? settlement.after_sale_amount ?? settlement.afterSalesAmount),
      goodsAmount: nullableNum(settlement.goods_amount ?? settlement.goodsAmount),
      feeAmount: nullableNum(settlement.fee_amount ?? settlement.feeAmount ?? settlement.expense_amount),
      customsTax: nullableNum(settlement.customs_tax ?? settlement.customsTax ?? settlement.customs_amount),
      payableAmount: nullableNum(settlement.payable_amount ?? settlement.payableAmount),
    },
    records: Array.isArray(body.records ?? body.sale_records) ? (body.records ?? body.sale_records).map(normalizeRecord) : [],
  }
}

function normalizeSeriesComparison(body) {
  const settlements = Array.isArray(body.settlements)
    ? body.settlements.map(normalizeSeriesSettlementItem)
    : []
  const gradeDetails = settlements.flatMap((settlement, index) =>
    (settlement._gradeRows ?? []).map((gradeRow) => ({
      merchantNo: settlement.merchantNo,
      merchantNoNormalized: settlement.merchantNoNormalized,
      orderNo: settlement.orderNo,
      orderNoNormalized: settlement.orderNoNormalized,
      index,
      grade: gradeRow.grade,
      weightedAvgPrice: gradeRow.weightedAvgPrice,
      salesQuantity: gradeRow.salesQuantity,
      quantityShare: gradeRow.quantityShare,
    })),
  )
  return {
    settlements,
    series: Array.isArray(body.series) ? body.series : [],
    total: normalizeMetrics(body.total?.total ?? body.total ?? {}),
    gradeDetails,
  }
}

export async function fetchLogin(payload) {
  const body = await api.login(payload)
  return normalizeUser(body.user ?? body)
}

export async function fetchMe() {
  const body = await api.me()
  return normalizeUser(body.user ?? body)
}

export async function fetchLogout() {
  return api.logout()
}

export function normalizeUser(user = {}) {
  return {
    id: user.id,
    displayName: user.display_name ?? user.displayName ?? '',
    email: user.email ?? '',
    permissions: Array.isArray(user.permissions) ? user.permissions : [],
    menus: Array.isArray(user.menus) ? user.menus : [],
  }
}

export async function fetchOverview(filters = {}) {
  const body = await api.overview(filters)
  return normalizeOverview(body)
}

export async function fetchTrend(filters = {}) {
  const body = await api.trend(filters)
  return Array.isArray(body.trend) ? body.trend : []
}

export async function fetchGradeBreakdown(filters = {}) {
  const body = await api.gradeBreakdown(filters)
  return {
    grades: normalizeGrades(body.grades ?? body.grade_summary),
    records: Array.isArray(body.records ?? body.sale_records)
      ? (body.records ?? body.sale_records).map(normalizeRecord)
      : [],
  }
}

export async function fetchSettlementOptions(filters = {}) {
  const body = await api.settlementComparison({ ...filters, includeAllSettlements: true })
  return Array.isArray(body.settlements) ? body.settlements.map(normalizeSettlementItem) : []
}

export async function fetchSettlements(filters = {}) {
  const body = await api.settlements(filters)
  return {
    settlements: Array.isArray(body.settlements) ? body.settlements.map(normalizeSettlementItem) : [],
    pagination: body.pagination ?? null,
    dateRange: body.date_range ?? body.dateRange ?? null,
    brandTotals: Array.isArray(body.brand_totals ?? body.brandTotals) ? body.brand_totals ?? body.brandTotals : [],
  }
}

export async function fetchSettlementDetail(merchantNo, filters = {}) {
  const body = await api.settlementDetail(merchantNo, filters)
  return normalizeSettlementDetail(body, merchantNo)
}

export async function fetchSeriesComparison(merchantNos, filters = {}) {
  const body = await api.seriesComparison(merchantNos, filters)
  return normalizeSeriesComparison(body)
}

export async function fetchSeriesAnalysis(merchantNos, filters = {}) {
  return api.seriesAnalysis(merchantNos, filters)
}
