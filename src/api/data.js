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
    // 应付金额：货款扣完售后/费用/关税后的到手口径（后端就绪前为 null，前端不展示）。
    payableAmount: nullableNum(row.payable_amount ?? row.payableAmount),
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
    variety: row.variety ?? '',
    grade: row.grade ?? row.grade_raw ?? row.gradeRaw ?? '',
    gradeRaw: row.grade_raw ?? row.gradeRaw ?? '',
    specRaw: row.spec_raw ?? row.specRaw ?? '',
    headCount: row.head_count ?? row.piece_count ?? row.headCount ?? '',
    specKg: row.spec_kg ?? row.specKg ?? '',
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
    // 应付金额（后端列表就绪前为 null，前端保留销售金额为主数字）。
    payableAmount: nullableNum(row.payable_amount ?? row.payableAmount),
    confirmedAt: row.confirmed_at ?? row.confirmedAt ?? '',
    gradeQuantities: row.grade_quantities ?? row.gradeQuantities ?? {},
    recordCount: num(row.record_count ?? row.recordCount),
    // settlement-comparison 候选项携带的同期排名（ADR：同期所有结算单中的名次）。
    rank: row.rank && typeof row.rank === 'object' ? {
      salesQuantity: row.rank.sales_quantity ?? null,
      salesAmount: row.rank.sales_amount ?? null,
      weightedAvgPrice: row.rank.weighted_avg_price ?? null,
    } : null,
  }
}

function normalizeSeriesSettlementItem(row = {}) {
  const item = normalizeSettlementItem(row)
  const grades = Array.isArray(row.grades) ? row.grades : []
  const gradeQuantities = {}
  const rawAmountShares = row.grade_amount_shares ?? row.gradeAmountShares ?? {}
  const gradeAmountShares = {}
  for (const [grade, share] of Object.entries(rawAmountShares)) {
    const value = nullableNum(share)
    if (value !== null) gradeAmountShares[String(grade).toUpperCase()] = value
  }
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
        amountShare: nullableNum(gradeRow.amount_share ?? gradeRow.amountShare)
          ?? gradeAmountShares[grade]
          ?? null,
      }
    })
    .filter(Boolean)
  return { ...item, gradeQuantities, gradeAmountShares, _gradeRows: gradeRows }
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
    brand: body.brand ?? '',
    country: body.country ?? '',
    market: body.market ?? '',
    sourceType: body.source_type ?? body.sourceType ?? '',
    fruitType: body.fruit_type ?? body.fruitType ?? '榴莲',
    arrivalDate: body.arrival_date ?? body.arrivalDate ?? '',
    arrivalQuantity: nullableNum(body.arrival_quantity ?? body.arrivalQuantity),
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
    // 号别阶梯：详情接口的 grade_details（后端 ADR-013 桶口径）。
    gradeLadder: normalizeGradeLadder(body.grade_details ?? body.gradeDetails),
  }
}

// 号别阶梯：后端 grade_details.buckets + insights（ADR-013 口径，数字全部后端算好）。
function normalizeGradeLadder(detail) {
  if (!detail || typeof detail !== 'object') return null
  const buckets = (Array.isArray(detail.buckets) ? detail.buckets : [])
    .map((row) => ({
      label: row.label ?? '',
      grade: String(row.grade ?? '').toUpperCase(),
      fruitType: row.fruit_type ?? row.fruitType ?? '',
      salesQuantity: num(row.sales_quantity ?? row.salesQuantity),
      salesAmount: num(row.sales_amount ?? row.salesAmount),
      weightedAvgPrice: nullableNum(row.weighted_avg_price ?? row.weightedAvgPrice),
      quantityShare: nullableNum(row.quantity_share ?? row.quantityShare),
      amountShare: nullableNum(row.amount_share ?? row.amountShare),
      qualityMarks: Array.isArray(row.quality_marks) ? row.quality_marks : [],
    }))
    .sort((a, b) => (b.weightedAvgPrice ?? -Infinity) - (a.weightedAvgPrice ?? -Infinity))
  const insights = detail.insights ?? {}
  const crossGaps = (Array.isArray(insights['同号别跨结算单价格差']) ? insights['同号别跨结算单价格差'] : [])
    .map((row) => ({
      label: row['号别'] ?? '',
      topMerchant: row['最高价商号'] ?? '',
      topPrice: nullableNum(row['最高每件均价']),
      topQuantity: num(row['最高价件数']),
      bottomMerchant: row['最低价商号'] ?? '',
      bottomPrice: nullableNum(row['最低每件均价']),
      bottomQuantity: num(row['最低价件数']),
      diff: nullableNum(row['相差']),
    }))
    .filter((row) => row.label && row.diff !== null)
    .sort((a, b) => b.diff - a.diff)
  const gradeGaps = (Array.isArray(insights['同级号别价格差']) ? insights['同级号别价格差'] : [])
    .map((row) => ({
      grade: String(row['大等级'] ?? '').toUpperCase(),
      topLabel: row['最贵号别'] ?? '',
      topPrice: nullableNum(row['最贵每件均价']),
      bottomLabel: row['最便宜号别'] ?? '',
      bottomPrice: nullableNum(row['最便宜每件均价']),
      diff: nullableNum(row['相差']),
    }))
    .filter((row) => row.grade && row.diff !== null)
  const unrecognized = detail.unrecognized ?? {}
  return {
    buckets,
    crossGaps,
    gradeGaps,
    unrecognizedQuantity: num(unrecognized.sales_quantity),
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
      amountShare: gradeRow.amountShare,
    })),
  )
  return {
    settlements,
    series: Array.isArray(body.series) ? body.series : [],
    total: normalizeMetrics(body.total?.total ?? body.total ?? {}),
    gradeDetails,
    gradeLadder: normalizeGradeLadder(body.grade_details ?? body.gradeDetails),
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

export async function fetchFilterOptions(filters = {}) {
  const body = await api.filterOptions(filters)
  const normalize = (rows, countKey) =>
    (Array.isArray(rows) ? rows : [])
      .filter((row) => row?.name)
      .map((row) => ({ name: String(row.name), count: Number(row[countKey] ?? 0) }))
  return {
    brands: normalize(body.brands, 'settlement_count'),
    countries: normalize(body.countries, 'settlement_count'),
    markets: normalize(body.markets, 'settlement_count'),
    years: Array.isArray(body.years) ? body.years.map(Number).filter(Number.isFinite) : [],
    months: Array.isArray(body.months)
      ? body.months.map(String).filter((month) => /^\d{4}-\d{2}$/.test(month))
      : [],
  }
}

export async function fetchGradeBreakdown(filters = {}) {
  const body = await api.gradeBreakdown(filters)
  const marketBrandContainers = Array.isArray(body.market_brand_containers)
    ? body.market_brand_containers
    : []
  return {
    grades: normalizeGrades(body.grades ?? body.grade_summary),
    records: Array.isArray(body.records ?? body.sale_records)
      ? (body.records ?? body.sale_records).map(normalizeRecord)
      : [],
    marketBrandContainers: marketBrandContainers.map((row) => ({
      market: row.market ?? '未标注市场',
      brand: row.brand ?? '',
      containerCount: num(row.container_count ?? row.containerCount),
    })),
    // 市场维度金额（后端 market_sales）：回答「下一柜发哪个市场」。
    marketSales: (Array.isArray(body.market_sales) ? body.market_sales : []).map((row) => ({
      market: row.market ?? '未标注市场',
      salesQuantity: num(row.sales_quantity),
      salesAmount: num(row.sales_amount),
      weightedAvgPrice: nullableNum(row.weighted_avg_price),
    })),
  }
}

function normalizeSpecItem(row = {}) {
  return {
    pieceCount: row.piece_count ?? row.pieceCount ?? null,
    specKg: row.spec_kg ?? row.specKg ?? null,
    salesQuantity: num(row.sales_quantity ?? row.salesQuantity),
    salesAmount: num(row.sales_amount ?? row.salesAmount),
    weightedAvgPrice: nullableNum(row.weighted_avg_price ?? row.weightedAvgPrice),
    quantityShare: nullableNum(row.quantity_share ?? row.quantityShare),
  }
}

export async function fetchGradeSpecBreakdown(filters = {}) {
  const body = await api.gradeSpecBreakdown(filters)
  const grades = Array.isArray(body.grades) ? body.grades : []
  return grades.map((row) => ({
    grade: row.grade ?? '',
    label: gradeLabel(row.grade ?? ''),
    color: gradeColor(row.grade ?? ''),
    total: normalizeMetrics(row.total ?? {}),
    specs: (Array.isArray(row.specs) ? row.specs : []).map(normalizeSpecItem),
  }))
}

export async function fetchSettlementOptions(filters = {}) {
  const body = await api.settlementComparison({ ...filters, includeAllSettlements: true })
  return Array.isArray(body.settlements) ? body.settlements.map(normalizeSettlementItem) : []
}

function normalizePagination(row) {
  if (!row || typeof row !== 'object') return null
  return {
    total: num(row.total),
    page: num(row.page),
    pageSize: num(row.page_size ?? row.pageSize),
    pages: num(row.pages),
  }
}

export async function fetchSettlements(filters = {}) {
  const body = await api.settlements(filters)
  return {
    settlements: Array.isArray(body.settlements) ? body.settlements.map(normalizeSettlementItem) : [],
    pagination: normalizePagination(body.pagination),
    dateRange: body.date_range ?? body.dateRange ?? null,
    brandTotals: Array.isArray(body.brand_totals ?? body.brandTotals) ? body.brand_totals ?? body.brandTotals : [],
  }
}

export async function fetchSettlementDetail(merchantNo, filters = {}) {
  const body = await api.settlementDetail(merchantNo, filters)
  return normalizeSettlementDetail(body, merchantNo)
}

// 结算单复核视图（后端二次确认页同款只读数据）：逐条售后与费用明细。
function normalizeReviewPayload(body) {
  const payload = body?.payload ?? {}
  const toNum = (value) => {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return {
    afterSales: (Array.isArray(payload.after_sales) ? payload.after_sales : []).map((row) => ({
      content: row.content ?? '',
      summary: row.summary ?? '',
      amount: toNum(row.amount),
    })),
    fees: (Array.isArray(payload.fees) ? payload.fees : []).map((row) => ({
      name: row.name ?? '',
      amount: toNum(row.amount),
      isCustom: Boolean(row.is_custom),
    })),
  }
}

export async function fetchSettlementReview(merchantNo) {
  const body = await api.settlementReview(merchantNo)
  return normalizeReviewPayload(body)
}

export async function fetchSeriesComparison(merchantNos, filters = {}) {
  const body = await api.seriesComparison(merchantNos, filters)
  return normalizeSeriesComparison(body)
}

export async function fetchSeriesAnalysis(merchantNos, filters = {}) {
  return api.seriesAnalysis(merchantNos, filters)
}

export async function fetchSettlementAnalysis(merchantNo, filters = {}) {
  return api.settlementAnalysis(merchantNo, filters)
}

export async function fetchGradeDetailAnalysis(merchantNos, filters = {}) {
  return api.gradeDetailAnalysis(merchantNos, filters)
}

// ── 站内通知 ────────────────────────────
function normalizeNotification(row = {}) {
  return {
    id: row.id,
    title: row.title ?? '',
    content: row.content ?? '',
    type: row.notification_type ?? '',
    priority: row.priority ?? '',
    publishAt: row.publish_at ?? row.publishAt ?? '',
    isRead: Boolean(row.is_read ?? row.isRead),
    readAt: row.read_at ?? row.readAt ?? '',
  }
}

export async function fetchNotifications(filters = {}) {
  const body = await api.notifications(filters)
  return {
    items: (Array.isArray(body.items) ? body.items : []).map(normalizeNotification),
    unreadCount: Number(body.unread_count ?? 0),
  }
}

export async function fetchUnreadCount() {
  const body = await api.notificationUnreadCount()
  return Number(body.unread_count ?? 0)
}

export async function markNotificationRead(id) {
  return normalizeNotification(await api.readNotification(id))
}

export async function markAllNotificationsRead() {
  return api.readAllNotifications()
}

// ── 忘记密码 ────────────────────────────
export function sendResetCode(email) {
  return api.forgotPasswordSendCode(email)
}

export async function verifyResetCode(payload) {
  const body = await api.forgotPasswordVerifyCode(payload)
  return { resetToken: body.reset_token ?? body.resetToken ?? '' }
}

export function resetPassword(payload) {
  return api.forgotPasswordReset(payload)
}
