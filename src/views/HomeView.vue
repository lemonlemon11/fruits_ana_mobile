<script setup>
import { computed, onActivated, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { fetchFilterOptions, fetchGradeBreakdown, fetchGradeSpecBreakdown, fetchOverview, fetchTrend, fetchUnreadCount } from '../api/data'
import { compactMoney, gradeLabel, money, number, percent, price, signedPercent } from '../utils/format'

const router = useRouter()
const loading = ref(true)
const error = ref('')
const overview = ref(null)
const trend = ref([])
const selectedDate = ref('')
const specGrades = ref([])
const specError = ref('')
const showFilters = ref(false)
const brand = ref('')
const country = ref('')
const market = ref('')
const dateMode = ref('month')
const selectedMonth = ref('')
const selectedYear = ref('')
const rangeStart = ref('')
const rangeEnd = ref('')
const showRangeCal = ref(false)
const brandOptions = ref([])
const countryOptions = ref([])
const marketOptions = ref([])
const monthOptions = ref([])
const yearOptions = ref([])
const marketBrandContainers = ref([])
const marketSalesRows = ref([])
const filterLoading = ref(false)
const filterError = ref('')
const aiOpen = ref(false)
const specSheet = ref(false)
const activeGradeNo = ref('')
const unreadCount = ref(0)

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
// 经营异常提醒条暂时下线，需要时改回 true 即可恢复。
const SHOW_ANOMALY_STRIP = false
const GRADE_CARD_COLORS = { A: 'var(--accent-3)', B: '#B8860B' }

const total = computed(() => overview.value?.total ?? {})
const grades = computed(() => overview.value?.grades ?? [])
const settlements = computed(() => overview.value?.settlements ?? [])

// ── 经营异常提醒（overview.operating_anomalies）──
const operatingAnomalies = computed(() =>
  Array.isArray(overview.value?.operatingAnomalies) ? overview.value.operatingAnomalies : [],
)
const anomaliesOpen = ref(false)

// 异常条目直接带数值（均价/占比/销量 vs 基准），不必点进详情才有口径。
function anomalyNums(item) {
  const metric = Number(item?.metric)
  const baseline = Number(item?.baseline)
  if (!Number.isFinite(metric) || !Number.isFinite(baseline)) return ''
  if (item?.type === 'low_weighted_avg_price') {
    return `本单 ${price(metric)}/件 · 同期基准 ${price(baseline)}/件`
  }
  if (item?.type === 'grade_share_deviation') {
    return `本单 ${percent(metric)} · 同期基准 ${percent(baseline)}`
  }
  return `当日 ${number(metric)} 件 · 中位基准 ${number(baseline)} 件`
}

// 果类动态：结算单 fruit_type 去重；无数据时如实提示，不再硬编码果类。
const fruitTypeLabel = computed(() => {
  const types = [...new Set(
    (settlements.value ?? [])
      .map((item) => item?.fruit_type)
      .filter(Boolean),
  )]
  if (types.length === 1) return types[0]
  return types.length > 1 ? '多果类' : ''
})
const settlementCount = computed(() => {
  const data = overview.value
  if (!data) return 0
  // settlements 数组存在时直接以它为准（筛选后可能为空）；仅旧响应缺字段时才回落。
  if (Array.isArray(data.settlements)) return data.settlements.length
  const issue = data.issueCounts ?? {}
  const explicit = Number(issue.settlement_count ?? issue.settlementCount)
  if (Number.isFinite(explicit) && explicit) return explicit
  return Object.values(issue).reduce((sum, value) => sum + Number(value || 0), 0)
})

// ── 时间快捷筛选：年/月/日范围三种口径，选中即换算为起止日期传给全部接口 ──
function monthRange(monthText) {
  if (!/^\d{4}-\d{2}$/.test(String(monthText ?? ''))) return { startDate: '', endDate: '' }
  const [year, mon] = String(monthText).split('-').map(Number)
  const start = new Date(year, mon - 1, 1)
  const end = new Date(year, mon, 0)
  const pad = (value) => String(value).padStart(2, '0')
  return {
    startDate: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`,
    endDate: `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`,
  }
}

function monthChipLabel(monthText) {
  const [year, mon] = String(monthText).split('-').map(Number)
  return year === new Date().getFullYear() ? `${mon}月` : `${year}年${mon}月`
}

// 日范围只填一侧时按单日处理；起止倒置时自动交换。
function rangeOfDates(startText, endText) {
  if (!startText && !endText) return { startDate: '', endDate: '' }
  const start = startText || endText
  const end = endText || startText
  return start <= end
    ? { startDate: start, endDate: end }
    : { startDate: end, endDate: start }
}

const activeDateRange = computed(() => {
  if (selectedYear.value) {
    const year = Number(selectedYear.value)
    if (Number.isFinite(year)) return { startDate: `${year}-01-01`, endDate: `${year}-12-31` }
  }
  if (selectedMonth.value) return monthRange(selectedMonth.value)
  if (rangeStart.value || rangeEnd.value) return rangeOfDates(rangeStart.value, rangeEnd.value)
  // 默认口径：只看最新销售日当天。
  if (autoDay.value) return { startDate: autoDay.value, endDate: autoDay.value }
  return { startDate: '', endDate: '' }
})

const dateScopeLabel = computed(() => {
  if (selectedYear.value) return `${selectedYear.value}年`
  if (selectedMonth.value) return monthChipLabel(selectedMonth.value)
  if (rangeStart.value || rangeEnd.value) {
    const { startDate, endDate } = rangeOfDates(rangeStart.value, rangeEnd.value)
    return startDate === endDate ? startDate.slice(5) : `${startDate.slice(5)}~${endDate.slice(5)}`
  }
  return ''
})

const activeFilters = computed(() => ({
  brand: brand.value,
  country: country.value,
  market: market.value,
  startDate: activeDateRange.value.startDate,
  endDate: activeDateRange.value.endDate,
}))
const hasActiveFilters = computed(() =>
  Boolean(
    brand.value || country.value || market.value
    || selectedYear.value || selectedMonth.value || rangeStart.value || rangeEnd.value,
  ),
)

const filterScopeText = computed(() =>
  [
    dateScopeLabel.value || (autoDay.value ? `${autoDay.value.slice(5)} 当天` : ''),
    brand.value,
    country.value,
    market.value,
  ]
    .filter(Boolean)
    .join(' · '),
)
const hasFilterOptions = computed(() =>
  brandOptions.value.length > 0
  || countryOptions.value.length > 0
  || marketOptions.value.length > 0
  || monthOptions.value.length > 0
  || yearOptions.value.length > 0,
)

// 日历可选范围：下限取数据最早年份的年初，上限取今天（数据无未来日期）。
const calMinDate = computed(() => {
  const years = yearOptions.value.map(Number).filter(Number.isFinite)
  const earliest = years.length ? Math.min(...years) : new Date().getFullYear() - 3
  return new Date(earliest, 0, 1)
})
const calMaxDate = computed(() => new Date())

const rangeDefaultDate = computed(() => {
  const parse = (text) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(text ?? ''))
    return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null
  }
  // 无已选范围时定位到当月，避免日历默认落在数据最早月份。
  if (!rangeStart.value) {
    const now = new Date()
    return [now, now]
  }
  const start = parse(rangeStart.value)
  const end = parse(rangeEnd.value) ?? start
  return start && end ? [start, end] : null
})

// ── 默认口径状态：最新销售日当天（未选任何时间筛选时）──
const autoDay = ref('')
const isDefaultDayScope = computed(() =>
  !selectedYear.value && !selectedMonth.value && !rangeStart.value && !rangeEnd.value,
)

// ── Hero（销售情况）：销售金额 + 销售柜数 两项突出展示 ──
const heroScopeText = computed(() => {
  if (dateScopeLabel.value) return dateScopeLabel.value
  return autoDay.value ? `最新销售日 ${autoDay.value.slice(5)}` : '最近一月'
})

const amountFullText = computed(() => {
  const value = Number(total.value.salesAmount ?? 0)
  return value ? money(value) : ''
})

function weekdayOf(dateText) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateText ?? ''))
  if (!match) return ''
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return Number.isNaN(date.getTime()) ? '' : WEEKDAYS[date.getDay()]
}

const trendItems = computed(() => {
  const items = (Array.isArray(trend.value) ? trend.value : [])
    .map((row) => ({
      date: row.sale_date ?? row.saleDate ?? '',
      amount: Number(row.sales_amount ?? row.salesAmount ?? 0),
      quantity: Number(row.sales_quantity ?? row.salesQuantity ?? 0),
      avgPrice: row.weighted_avg_price ?? row.weightedAvgPrice ?? null,
      containers: Number(row.container_count ?? row.containerCount ?? 0),
    }))
    .filter((row) => row.date)
  return items.map((row) => ({
    ...row,
    dateLabel: formatTrendDate(row.date),
    weekday: weekdayOf(row.date),
  }))
})

const monthDelta = computed(() => {
  const items = trendItems.value
  if (items.length < 2) return null
  const first = Number(items[0].avgPrice)
  const last = Number(items[items.length - 1].avgPrice)
  if (!Number.isFinite(first) || !Number.isFinite(last) || !first) return null
  const text = signedPercent((last - first) / first)
  return text === null ? null : { text, up: last >= first }
})

// 期初措辞：默认/按月窗口首点即月初；按年或自定义区间时说「期初」。
const periodStartWord = computed(() =>
  selectedYear.value || rangeStart.value || rangeEnd.value ? '期初' : '月初',
)

// 筛选后整体空态：无销量、无结算单、无趋势时给引导，替代四格 0 值。
const isResultEmpty = computed(() =>
  overview.value !== null
  && Number(total.value.salesQuantity ?? 0) === 0
  && settlements.value.length === 0
  && trendItems.value.length === 0,
)

const monthLabel = computed(() => {
  if (dateScopeLabel.value) return dateScopeLabel.value
  const last = trendItems.value[trendItems.value.length - 1]
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(last?.date ?? ''))
  return match ? `${Number(match[2])}月` : ''
})

const selectedPoint = computed(() => {
  const items = chartItems.value
  if (!items.length) return null
  const selected = selectedDate.value
  const hit = items.find((item) =>
    item.kind === 'month' ? selected.startsWith(item.date.slice(0, 7)) : item.date === selected,
  )
  if (hit) return hit
  return [...items].reverse().find((item) => item.quantity > 0) ?? items[items.length - 1]
})

// ── 走势图数据量保护：区间太长（按年/跨多月）时聚合为最多 72 段，
// 否则 (360-4-(n-1)*5)/n 的柱宽在 n>71 时为负，柱体不渲染。──
// ── 趋势聚合：窗口 ≤62 天按日（默认月窗/月度筛选）；更长（按年/跨多月
// 区间）按日历月聚合，符合业务口径。──
const MAX_DAILY_BARS = 62
const chartItems = computed(() => {
  const items = trendItems.value
  if (!items.length) return []
  const dayMs = 86400000
  // 口径看请求窗口而非数据跨度：按年/跨多月窗口即使数据只覆盖一两个月也按月展示。
  const winStart = chartWindow.value.startDate || items[0].date
  const winEnd = chartWindow.value.endDate || items[items.length - 1].date
  const windowDays = Math.round((new Date(winEnd) - new Date(winStart)) / dayMs) + 1
  if (windowDays <= MAX_DAILY_BARS) return items.map((row) => ({ ...row, kind: 'day' }))

  // 按日历月聚合，窗口内无数据的月份补零柱。
  const byMonth = new Map()
  for (const row of items) {
    const key = String(row.date).slice(0, 7)
    const entry = byMonth.get(key) ?? { quantity: 0, amount: 0, weighted: 0, containers: 0, count: 0 }
    entry.quantity += row.quantity
    entry.amount += row.amount
    entry.weighted += Number(row.avgPrice ?? 0) * row.quantity
    entry.containers += row.containers || 0
    entry.count += 1
    byMonth.set(key, entry)
  }
  const buckets = []
  const cursor = new Date(`${winStart.slice(0, 7)}-01T00:00:00`)
  const end = new Date(`${winEnd.slice(0, 7)}-01T00:00:00`)
  while (cursor <= end) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`
    const agg = byMonth.get(key)
    const quantity = agg?.quantity ?? 0
    const lastDay = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()
    buckets.push({
      date: `${key}-${String(lastDay).padStart(2, '0')}`,
      dateLabel: `${cursor.getMonth() + 1}月`,
      spanLabel: `${cursor.getFullYear()}年${cursor.getMonth() + 1}月`,
      kind: 'month',
      amount: agg?.amount ?? 0,
      quantity,
      avgPrice: agg && quantity ? agg.weighted / quantity : null,
      containers: agg?.containers ?? 0,
      span: agg?.count ?? 0,
    })
    cursor.setMonth(cursor.getMonth() + 1)
  }
  return buckets
})
const chartMonthly = computed(() => chartItems.value.some((item) => item.kind === 'month'))

const readoutTitle = computed(() => {
  const point = selectedPoint.value
  if (!point) return ''
  if (point.kind === 'month') return `${point.spanLabel} · 月度销售`
  return `${point.dateLabel}${point.weekday ? ' ' + point.weekday : ''} 当日销售`
})

const trendChart = computed(() => {
  const items = chartItems.value
  if (!items.length) return null

  const width = 360
  const height = 150
  const padTop = 8
  const padBottom = 6
  const n = items.length
  // 段数多时收窄间距，保证柱宽至少 1.5。
  const gap = n > 40 ? 1.5 : 5
  const barWidth = Math.max(1.5, (width - 4 - (n - 1) * gap) / n)
  const maxAmount = Math.max(1, ...items.map((row) => row.amount))
  const barMax = height - padBottom - padTop - 14

  const bars = items.map((row, index) => {
    const barHeight = Math.max(3, (row.amount / maxAmount) * barMax)
    return {
      date: row.date,
      x: Number((2 + index * (barWidth + gap)).toFixed(1)),
      y: Number((height - padBottom - barHeight).toFixed(1)),
      width: Number(barWidth.toFixed(1)),
      height: Number(barHeight.toFixed(1)),
      selected: row.date === selectedPoint.value?.date,
    }
  })

  const axisIndexes = [...new Set([0, Math.floor((n - 1) / 2), n - 1])]

  return { bars, axisIndexes }
})

function selectDay(date) {
  selectedDate.value = date
}

// ── 拖动选日期：横向拖动/点按选最近柱体；纵向滑动仍滚动页面。──
const chartSvg = ref(null)
let scrubbing = false
function scrubIndex(evt) {
  const svg = chartSvg.value
  if (!svg || !trendChart.value) return -1
  const rect = svg.getBoundingClientRect()
  if (!rect.width) return -1
  const x = ((evt.clientX - rect.left) / rect.width) * 360
  let best = -1
  let bestDist = Infinity
  trendChart.value.bars.forEach((bar, index) => {
    const dist = Math.abs(bar.x + bar.width / 2 - x)
    if (dist < bestDist) {
      bestDist = dist
      best = index
    }
  })
  return best
}
function applyScrub(evt) {
  const index = scrubIndex(evt)
  if (index >= 0) selectDay(chartItems.value[index].date)
}
function onScrubStart(evt) {
  scrubbing = true
  evt.target.setPointerCapture?.(evt.pointerId)
  applyScrub(evt)
}
function onScrubMove(evt) {
  if (scrubbing) applyScrub(evt)
}
function onScrubEnd() {
  scrubbing = false
}

function formatTrendDate(value) {
  const text = String(value ?? '')
  return text.length > 10 ? text.slice(5) : text
}

// ── 等级行情 ────────────────────────────
const sortedGrades = computed(() =>
  [...grades.value].sort((a, b) => Number(b.quantityShare ?? 0) - Number(a.quantityShare ?? 0)),
)
// ADR-049：等级行情只展示 A/B 主力等级；AB/OTHER 不单独出卡，数量并入价差洞察。
const cardGrades = computed(() =>
  sortedGrades.value.filter((row) => row.grade !== 'AB' && row.grade !== 'OTHER'),
)
const hiddenGrades = computed(() =>
  sortedGrades.value.filter((row) => row.grade === 'AB' || row.grade === 'OTHER'),
)

function specInfoOf(grade) {
  return specGrades.value.find((row) => row.grade === grade) ?? null
}

function topSpecDesc(grade) {
  const specs = specInfoOf(grade)?.specs ?? []
  if (!specs.length) return ''
  const top = specs[0]
  const head = top.pieceCount ? `${top.pieceCount}头` : '未标注头数'
  const kg = top.specKg ? `${top.specKg}kg` : '未标注公斤'
  return `主力 ${head}·${kg}`
}

// 卡片用紧凑规格：仅「3头 · 10kg」，描述性前缀去掉以免与等级名重复。
function specShortDesc(grade) {
  const specs = specInfoOf(grade)?.specs ?? []
  if (!specs.length) return ''
  const top = specs[0]
  const head = top.pieceCount ? `${top.pieceCount}头` : ''
  const kg = top.specKg ? `${top.specKg}kg` : ''
  return [head, kg].filter(Boolean).join(' · ') || '规格未标注'
}

function gradeCardPrice(row) {
  const spec = specInfoOf(row.grade)
  return spec?.total?.weightedAvgPrice ?? row.weightedAvgPrice ?? null
}

function gradeContainers(grade) {
  return settlements.value.filter((item) =>
    (item.grades ?? []).some((row) => row.grade === grade && Number(row.sales_quantity ?? row.salesQuantity ?? 0) > 0),
  ).length
}

const gradeInsightHtml = computed(() => {
  const [top, second] = cardGrades.value
  let note = ''
  if (top && second) {
    const topPrice = gradeCardPrice(top)
    const secondPrice = gradeCardPrice(second)
    if (topPrice && secondPrice) {
      const diff = topPrice - secondPrice
      const pct = (diff / secondPrice) * 100
      note += `价差洞察：${top.label}均价比${second.label}高 <b>¥${Math.abs(diff).toFixed(1)}/件</b>（${diff >= 0 ? '+' : '-'}${Math.abs(pct).toFixed(1)}%）`
      const topSpec = topSpecDesc(top.grade)
      const secondSpec = topSpecDesc(second.grade)
      if (topSpec && secondSpec) note += `，${top.label} ${topSpec}，${second.label} ${secondSpec}`
      note += '。'
    }
  }
  const hiddenQty = hiddenGrades.value.reduce((sum, row) => sum + Number(row.salesQuantity ?? 0), 0)
  if (hiddenQty > 0) {
    const hasAb = hiddenGrades.value.some((row) => row.grade === 'AB' && row.salesQuantity > 0)
    const hasOther = hiddenGrades.value.some((row) => row.grade === 'OTHER' && row.salesQuantity > 0)
    const scope = hasAb && hasOther ? 'AB/其他等级' : hasAb ? 'AB 等级' : '其他等级'
    note += `另有${scope} ${number(hiddenQty)} 件未计入上表。`
  }
  return note
})

function openGradeSpecs(grade) {
  activeGradeNo.value = grade
  specSheet.value = true
}

const activeSpecGrade = computed(() =>
  specGrades.value.find((row) => row.grade === activeGradeNo.value) ?? null,
)

function specTag(row) {
  const head = row.pieceCount ? `${row.pieceCount} 头` : '未标注头数'
  const kg = row.specKg ? `${row.specKg} kg` : '未标注公斤'
  return `${head} · ${kg}`
}

// ── 最新柜 ──────────────────────────────
const latestSettlements = computed(() => settlements.value.slice(0, 6))

// ── 市场销售：金额/均价（market_sales）+ 柜数与品牌构成（market_brand_containers）──
const marketSales = computed(() => {
  const salesByMarket = new Map(marketSalesRows.value.map((row) => [row.market, row]))
  const byMarket = new Map()
  for (const row of marketBrandContainers.value) {
    const name = row.market || '未标注市场'
    const entry = byMarket.get(name) ?? { market: name, containerCount: 0, brands: [] }
    entry.containerCount += Number(row.containerCount ?? 0)
    if (row.brand) entry.brands.push({ brand: row.brand, containerCount: Number(row.containerCount ?? 0) })
    byMarket.set(name, entry)
  }
  for (const name of salesByMarket.keys()) {
    if (!byMarket.has(name)) byMarket.set(name, { market: name, containerCount: 0, brands: [] })
  }
  const merged = [...byMarket.values()].map((row) => {
    const sales = salesByMarket.get(row.market) ?? {}
    return {
      ...row,
      salesAmount: sales.salesAmount ?? 0,
      salesQuantity: sales.salesQuantity ?? 0,
      avgPrice: sales.weightedAvgPrice ?? null,
    }
  })
  const hasAmount = merged.some((row) => row.salesAmount > 0)
  merged.sort((a, b) => (hasAmount
    ? b.salesAmount - a.salesAmount || b.containerCount - a.containerCount
    : b.containerCount - a.containerCount))
  const maxAmount = Math.max(1, ...merged.map((row) => row.salesAmount))
  const maxCount = Math.max(1, ...merged.map((row) => row.containerCount))
  return merged.map((row) => {
    const brands = [...row.brands].sort((a, b) => b.containerCount - a.containerCount)
    const brandTotal = brands.reduce((sum, item) => sum + item.containerCount, 0)
    return {
      ...row,
      brands: brands.map((item) => ({ ...item, share: brandTotal ? item.containerCount / brandTotal : 0 })),
      share: hasAmount ? row.salesAmount / maxAmount : row.containerCount / maxCount,
    }
  })
})

function settlePills(item) {
  return (item.grades ?? [])
    .filter((row) => Number(row.sales_quantity ?? 0) > 0)
    .sort((a, b) => Number(b.sales_quantity) - Number(a.sales_quantity))
    .slice(0, 2)
    .map((row) => ({ grade: row.grade, label: gradeLabel(row.grade), cls: String(row.grade).toLowerCase() }))
}

function goDetail(merchantNo) {
  router.push(`/settlement/${merchantNo}`)
}

function goSettlements() {
  router.push('/settlements')
}

// ── AI 经营摘要（本地规则生成，不依赖后端）──
const aiSummaryHtml = computed(() => {
  if (!overview.value) return ''
  const parts = []

  const avg = total.value.weightedAvgPrice
  if (avg !== null && avg !== undefined) {
    let text = `本期整体均价 <b>¥${Number(avg).toFixed(1)}/件</b>`
    if (monthDelta.value) {
      const pct = monthDelta.value.text.replace(/^[+]/, '')
      text += `，较${periodStartWord.value}${monthDelta.value.up ? '上涨' : '下跌'} ${pct}`
    }
    parts.push(`${text}。`)
  }

  const [g1, g2] = cardGrades.value
  if (g1) {
    const spec1 = specInfoOf(g1.grade)
    const price1 = gradeCardPrice(g1)
    let text = `${g1.label} <b>${gradeContainers(g1.grade)} 柜</b>全量产出`
    if (price1 !== null) text += `、均价 <b>¥${price1.toFixed(1)}</b>`
    const top = spec1?.specs?.[0]
    if (top) {
      text += `，主力规格 ${top.pieceCount ?? '未标注'}头·${top.specKg ?? '未标注'}kg（${number(top.salesQuantity)} 件、占${g1.label} ${percent(top.quantityShare)}）`
    }
    if (price1 !== null) text += `，是本期均价的${price1 >= (avg ?? 0) ? '主要支撑' : '拖累因素'}`
    parts.push(`${text}。`)
  }

  const busyDays = [...trendItems.value].sort((a, b) => b.amount - a.amount).slice(0, 2)
  if (busyDays.length === 2) {
    const qty = busyDays[0].quantity + busyDays[1].quantity
    parts.push(`${busyDays[0].dateLabel} 与 ${busyDays[1].dateLabel} 两个放货日集中出货 ${number(qty)} 件。`)
  }

  if (g2) {
    const spec2 = specInfoOf(g2.grade)
    const price2 = gradeCardPrice(g2)
    let text = `${g2.label}均价${price2 !== null ? ` ¥${price2.toFixed(1)}` : '暂无'}`
    const second = spec2?.specs?.[0]
    if (second) text += `，主力规格 ${second.pieceCount ?? '未标注'}头·${second.specKg ?? '未标注'}kg`
    const price1 = g1 ? gradeCardPrice(g1) : null
    if (price1 !== null && price2 !== null) {
      text += `；${g1?.label ?? ''}/${g2.label}价差 ¥${Math.abs(price1 - price2).toFixed(1)}/件，建议保持分级出货节奏`
    }
    parts.push(`${text}。`)
  }

  return parts.join('')
})

// ── 趋势图窗口：默认口径展示最新销售日所在整月（可拖动选日）；其余口径跟日期筛选。──
const chartWindow = computed(() => {
  if (isDefaultDayScope.value && autoDay.value) {
    const match = /^(\d{4})-(\d{2})/.exec(autoDay.value)
    if (match) return monthRange(`${match[1]}-${match[2]}`)
  }
  return activeDateRange.value
})

// ── 数据加载 ────────────────────────────
// 请求序号守卫：筛选弹层内连点会被 filter-busy 之外并发触发多个 loadData，
// 只让最后一次请求的结果生效，旧响应直接丢弃。
let dataRequestSeq = 0
let optionsRequestSeq = 0

async function loadData({ silent = false } = {}) {
  const seq = ++dataRequestSeq
  if (silent) {
    filterLoading.value = true
  } else {
    loading.value = true
  }
  if (seq === dataRequestSeq) {
    error.value = ''
    filterError.value = ''
  }
  try {
    const filters = activeFilters.value
    // 默认单日口径下总览只看当天，但走势图取整月窗口保留趋势上下文，
    // 否则柱状图只剩一根柱、日环比也算不出来。
    const trendFilters = isDefaultDayScope.value && autoDay.value
      ? { ...filters, startDate: `${autoDay.value.slice(0, 7)}-01`, endDate: autoDay.value }
      : filters
    const [overviewData, trendData, specData, gradeData] = await Promise.all([
      fetchOverview(filters),
      fetchTrend(trendFilters),
      fetchGradeSpecBreakdown(filters),
      fetchGradeBreakdown({ ...filters, includeRecords: false }),
    ])
    if (seq !== dataRequestSeq) return
    overview.value = overviewData
    trend.value = trendData
    specGrades.value = specData
    marketBrandContainers.value = gradeData.marketBrandContainers ?? []
    marketSalesRows.value = gradeData.marketSales ?? []
    specError.value = ''
    const items = Array.isArray(trendData) ? trendData.filter((row) => row?.sale_date ?? row.saleDate) : []
    if (items.length) {
      const last = items[items.length - 1]
      selectedDate.value = last.sale_date ?? last.saleDate ?? ''
    }
  } catch (err) {
    if (seq !== dataRequestSeq) return
    if (silent) {
      filterError.value = err?.message || '筛选数据加载失败，当前仍显示上次数据'
    } else {
      error.value = err?.message || '数据加载失败'
    }
  } finally {
    if (seq === dataRequestSeq) {
      loading.value = false
      filterLoading.value = false
    }
  }
}

async function loadFilterOptions() {
  const seq = ++optionsRequestSeq
  try {
    const options = await fetchFilterOptions(activeDateRange.value)
    if (seq !== optionsRequestSeq) return
    brandOptions.value = options.brands
    countryOptions.value = options.countries
    marketOptions.value = options.markets
    monthOptions.value = options.months
    yearOptions.value = options.years
  } catch {
    if (seq !== optionsRequestSeq) return
    brandOptions.value = []
    countryOptions.value = []
    marketOptions.value = []
    monthOptions.value = []
    yearOptions.value = []
  }
}

// 时间三种口径互斥：改日期窗口后品牌/国家/市场选项跟随窗口，一并重取。
function applyDateWindow() {
  loadData({ silent: true })
  loadFilterOptions()
}

function clearOtherDateKinds(keep) {
  if (keep !== 'month') selectedMonth.value = ''
  if (keep !== 'year') selectedYear.value = ''
  if (keep !== 'range') {
    rangeStart.value = ''
    rangeEnd.value = ''
  }
}

function selectFilter(kind, value) {
  if (kind === 'month' || kind === 'year') {
    const target = kind === 'month' ? selectedMonth : selectedYear
    const hadOtherKind = Boolean(
      (kind !== 'month' && selectedMonth.value)
      || (kind !== 'year' && selectedYear.value)
      || (rangeStart.value || rangeEnd.value),
    )
    clearOtherDateKinds(kind)
    // 点已选中的值且没有清掉其他口径残留时不重复刷新。
    if (target.value === value && !hadOtherKind) return
    target.value = value
    applyDateWindow()
    return
  }
  const target = kind === 'brand' ? brand : kind === 'country' ? country : market
  if (target.value === value) return
  target.value = value
  loadData({ silent: true })
}

function switchDateMode(mode) {
  if (dateMode.value === mode) return
  dateMode.value = mode
  // 切口径即切意图：清掉其他口径的残留选择，避免「月 tab 高亮全部、实际仍按年过滤」。
  const hadStaleWindow = Boolean(
    (mode !== 'month' && selectedMonth.value)
    || (mode !== 'year' && selectedYear.value)
    || (mode !== 'range' && (rangeStart.value || rangeEnd.value)),
  )
  clearOtherDateKinds(mode)
  if (hadStaleWindow) applyDateWindow()
}

function onRangeConfirm(dates) {
  const [start, end] = dates
  const pad = (value) => String(value).padStart(2, '0')
  const fmt = (date) =>
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  clearOtherDateKinds('range')
  rangeStart.value = fmt(start)
  rangeEnd.value = fmt(end)
  showRangeCal.value = false
  applyDateWindow()
}

function clearRange() {
  if (!rangeStart.value && !rangeEnd.value) return
  rangeStart.value = ''
  rangeEnd.value = ''
  applyDateWindow()
}

function resetFilters() {
  if (!hasActiveFilters.value) return
  brand.value = ''
  country.value = ''
  market.value = ''
  selectedMonth.value = ''
  selectedYear.value = ''
  rangeStart.value = ''
  rangeEnd.value = ''
  loadData({ silent: true })
  // 日期窗口回到默认，品牌/国家/市场选项计数需要跟着回默认窗口。
  loadFilterOptions()
}

// 默认只看最新销售日：先取趋势定日期，再按当天口径加载各模块。
async function resolveAutoDay() {
  try {
    const trendData = await fetchTrend({})
    const items = Array.isArray(trendData) ? trendData.filter((row) => row?.sale_date ?? row.saleDate) : []
    if (items.length) {
      const last = items[items.length - 1]
      autoDay.value = last.sale_date ?? last.saleDate ?? ''
    }
  } catch {
    // 拿不到就回落后端默认窗口（最近一月）
  }
}

onMounted(async () => {
  await resolveAutoDay()
  loadData()
  loadFilterOptions()
  loadUnread()
})

// ── 下拉刷新：市场里单手用的本能手势 ──
const refreshing = ref(false)
async function onRefresh() {
  try {
    if (isDefaultDayScope.value) await resolveAutoDay()
    await Promise.all([loadData({ silent: true }), loadFilterOptions(), loadUnread()])
  } finally {
    refreshing.value = false
  }
}

onActivated(() => {
  // 从消息页返回时刷新角标。
  loadUnread()
})

async function loadUnread() {
  try {
    unreadCount.value = await fetchUnreadCount()
  } catch {
    unreadCount.value = 0
  }
}

function goNotifications() {
  router.push('/notifications')
}
</script>

<template>
  <div class="page home-page">
    <header class="home-head">
      <div class="head-row">
        <div class="head-brand">
          <div class="head-title">销售总览</div>
          <div v-if="fruitTypeLabel" class="head-sub">{{ fruitTypeLabel }}</div>
        </div>
        <div class="head-actions">
          <button v-if="monthLabel" class="head-month mono" type="button" @click="showFilters = true">{{ monthLabel }} ▾</button>
          <button class="head-bell" type="button" aria-label="消息通知" @click="goNotifications">
            <van-icon name="bell" />
            <span v-if="unreadCount" class="bell-badge mono">{{ unreadCount > 99 ? '99+' : unreadCount }}</span>
          </button>
        </div>
      </div>
    </header>

    <main class="home-main">
      <div v-if="loading" class="app-card state-card">
        <van-loading color="var(--accent)" size="22" vertical>正在加载销售数据</van-loading>
      </div>

      <div v-else-if="error" class="app-card state-card">
        <van-empty image="error" description="销售数据加载失败">
          <p class="error-text muted">{{ error }}</p>
          <van-button type="primary" size="small" round @click="loadData">重新加载</van-button>
        </van-empty>
      </div>

      <template v-else>
        <van-pull-refresh v-model="refreshing" class="home-pull" @refresh="onRefresh">
        <div class="home-content" :class="{ 'filter-busy': filterLoading }">
          <section v-if="isResultEmpty" class="app-card state-card">
            <van-empty image="search" description="当前筛选暂无销售数据">
              <p class="muted empty-guide">试试放宽时间范围，或清除品牌 / 国家 / 市场筛选</p>
              <van-button type="primary" size="small" round @click="resetFilters">重置筛选</van-button>
            </van-empty>
          </section>

          <template v-else>
          <section class="app-card hero" aria-label="销售情况">
            <div class="hero-scope-row">
              <span class="hero-scope-label">销售情况</span>
              <span class="hero-scope mono">{{ heroScopeText }}</span>
            </div>
            <div class="hero-main-row">
              <div class="hero-primary">
                <span class="hero-label">销售金额</span>
                <strong class="hero-value mono">{{ compactMoney(total.salesAmount) }}</strong>
                <span v-if="amountFullText" class="hero-full mono">{{ amountFullText }}</span>
              </div>
              <div class="hero-side">
                <span class="hero-label">总柜数</span>
                <strong class="hero-value mono">{{ number(settlementCount) }}<i> 柜</i></strong>
              </div>
            </div>
          </section>

          <section v-if="SHOW_ANOMALY_STRIP && operatingAnomalies.length" class="anomaly-strip" :class="{ open: anomaliesOpen }">
            <button class="anomaly-strip-head" type="button" @click="anomaliesOpen = !anomaliesOpen">
              <span class="anomaly-warn-dot">!</span>
              <b>经营异常提醒</b>
              <span class="anomaly-strip-count mono">{{ operatingAnomalies.length }} 项</span>
              <span class="anomaly-strip-arrow">▾</span>
            </button>
            <div class="anomaly-strip-body">
              <component
                :is="item.merchant_no ? 'button' : 'div'"
                v-for="(item, index) in operatingAnomalies"
                :key="`home-anomaly-${index}`"
                class="anomaly-strip-item"
                :class="{ static: !item.merchant_no }"
                :type="item.merchant_no ? 'button' : undefined"
                @click="item.merchant_no ? goDetail(item.merchant_no) : null"
              >
                <span class="asi-main">
                  <b v-if="item.merchant_no">{{ item.merchant_no_normalized || item.merchant_no }}</b>
                  <b v-else>{{ item.sale_date ? `${String(item.sale_date).slice(5)} 当日` : '整体范围' }}</b>
                  <small>{{ item.reason }}</small>
                  <small v-if="anomalyNums(item)" class="asi-nums mono">{{ anomalyNums(item) }}</small>
                </span>
                <span v-if="item.merchant_no" class="asi-chev">›</span>
              </component>
            </div>
          </section>

          <div v-if="hasFilterOptions" class="filter-compact" aria-label="销售日期、品牌、国家与市场筛选">
            <button
              class="filter-trigger"
              :class="{ active: hasActiveFilters }"
              type="button"
              @click="showFilters = true"
            >
              <van-icon name="filter-o" />
              <span class="filter-trigger-text">{{ filterScopeText || '销售日期 · 品牌 · 国家 · 市场' }}</span>
              <span class="filter-caret">▾</span>
            </button>
            <button
              v-if="hasActiveFilters"
              class="filter-reset"
              type="button"
              @click="resetFilters"
            >重置</button>
          </div>

          <template v-if="marketSales.length">
            <h2 class="section-title market-sec-title">
              <span>市场销售分析</span>
              <span class="sec-more muted">
                <template v-if="market">品牌构成 · {{ market }}</template>
                <template v-else>柜数统计 · 品牌构成</template>
              </span>
            </h2>
            <section class="app-card market-card" aria-label="市场销售">
              <div
                v-for="(row, index) in marketSales"
                :key="`market-${row.market}`"
                class="market-row"
              >
                <span class="market-rank mono" :class="{ top: index < 3 }">{{ index + 1 }}</span>
                <div class="market-main">
                  <div class="market-line1">
                    <b class="market-name">{{ row.market }}</b>
                    <span class="market-side">
                      <span v-if="row.salesAmount" class="market-amount mono">{{ compactMoney(row.salesAmount) }}</span>
                      <span class="market-count mono">{{ number(row.containerCount) }} 柜</span>
                    </span>
                  </div>
                  <div class="market-bar">
                    <i :style="{ width: `${Math.min(100, Math.max(2, row.share * 100))}%` }"></i>
                  </div>
                  <div v-if="row.avgPrice !== null || row.salesQuantity" class="market-stats mono">
                    <template v-if="row.avgPrice !== null">每件均价 {{ price(row.avgPrice) }}</template>
                    <template v-if="row.avgPrice !== null && row.salesQuantity"> · </template>
                    <template v-if="row.salesQuantity">{{ number(row.salesQuantity) }} 件</template>
                  </div>
                  <div class="market-brands">
                    <span
                      v-for="item in row.brands"
                      :key="`mb-${row.market}-${item.brand}`"
                      class="market-brand"
                    >{{ item.brand }} <i class="mono">{{ item.containerCount }} 柜 · {{ percent(item.share) }}</i></span>
                  </div>
                </div>
              </div>
            </section>
          </template>

          <h2 class="section-title trend-sec-title">
            <span>销售金额趋势</span>
            <span class="sec-more muted">
              <template v-if="filterScopeText">{{ filterScopeText }} · </template>{{ chartMonthly ? `按月聚合 · ${chartItems.length} 个月` : `按日 · ${chartItems.length} 天` }} · 拖动或点击柱体查看
            </span>
          </h2>
          <section class="app-card chart-card">
            <div class="chart-head">
              <span class="chart-legend">
                <span><i class="legend-bar"></i>销售金额</span>
              </span>
            </div>

            <div v-if="selectedPoint" class="day-readout">
              <div class="dr-left">
                <span class="dr-date mono">{{ readoutTitle }}</span>
                <span class="dr-sub mono">{{ number(selectedPoint.quantity) }} 件<template v-if="selectedPoint.containers"> · {{ number(selectedPoint.containers) }} 柜</template></span>
              </div>
              <div class="dr-right">
                <div class="dr-amt mono">{{ compactMoney(selectedPoint.amount) }}</div>
              </div>
            </div>

            <svg
              v-if="trendChart"
              ref="chartSvg"
              class="chart-svg"
              viewBox="0 0 360 150"
              role="img"
              aria-label="销售金额趋势图,拖动或点击柱体查看明细"
              style="touch-action: pan-y"
            >
              <rect
                v-for="(bar, index) in trendChart.bars"
                :key="`bar-${bar.date}-${index}`"
                class="bar-rect"
                :x="bar.x"
                :y="bar.y"
                :width="bar.width"
                :height="bar.height"
                :rx="bar.selected ? 3 : 2.5"
                :fill="bar.selected ? '#16794F' : 'rgba(22,121,79,.28)'"
              />
              <line
                v-if="trendChart.selectedX !== null"
                class="scrub-line"
                :x1="trendChart.selectedX"
                y1="4"
                :x2="trendChart.selectedX"
                y2="140"
              ></line>
              <rect
                class="scrub-surface"
                x="0"
                y="0"
                width="360"
                height="150"
                @pointerdown.prevent="onScrubStart"
                @pointermove="onScrubMove"
                @pointerup="onScrubEnd"
                @pointercancel="onScrubEnd"
              ></rect>
            </svg>
            <div v-if="trendChart" class="chart-axis mono">
              <span v-for="index in trendChart.axisIndexes" :key="`axis-${index}`">
                {{ chartItems[index]?.dateLabel }}
              </span>
            </div>
            <p v-else class="muted empty-note">暂无趋势数据</p>
          </section>

          <h2 class="section-title grade-sec-title">
            <span>等级行情</span>
            <span class="sec-more muted">每件均价 · 点击看规格明细</span>
          </h2>
          <template v-if="cardGrades.length">
            <button
              v-for="row in cardGrades"
              :key="row.grade"
              class="grade-card"
              type="button"
              @click="openGradeSpecs(row.grade)"
            >
              <span class="grade-badge" :class="{ idle: !row.salesQuantity }" :style="{ background: row.color }">
                {{ row.grade }}
              </span>
              <span class="grade-info">
                <span class="grade-line1">
                  <b class="grade-name">{{ row.label }}</b>
                  <span v-if="row.salesQuantity" class="grade-spec">{{ specShortDesc(row.grade) }}</span>
                  <b
                    v-if="row.salesQuantity"
                    class="grade-price mono"
                    :style="GRADE_CARD_COLORS[row.grade] ? { color: GRADE_CARD_COLORS[row.grade] } : undefined"
                  >{{ gradeCardPrice(row) !== null ? price(gradeCardPrice(row)) : '—' }}<i>/件</i></b>
                  <span v-else class="grade-price-empty">暂无销售</span>
                </span>
                <span v-if="row.salesQuantity" class="grade-line2">
                  <span class="grade-bar">
                    <i :style="{ width: `${Math.min(100, Math.max(0, (row.quantityShare ?? 0) * 100))}%`, background: row.color }"></i>
                  </span>
                  <span class="grade-stats mono">{{ percent(row.quantityShare) }} · {{ compactMoney(row.salesAmount) }}</span>
                </span>
              </span>
              <span class="grade-chev">›</span>
            </button>
            <p v-if="gradeInsightHtml" class="grade-note" v-html="gradeInsightHtml"></p>
            <p class="tap-hint">点击等级卡查看分规格销售明细 ↓</p>
          </template>
          <p v-else class="muted empty-note">暂无等级数据</p>

          <template v-if="latestSettlements.length">
            <h2 class="section-title settle-sec-title">
              <span>最新柜 · 结算单</span>
              <button class="sec-more sec-link" type="button" @click="goSettlements">全部 {{ settlements.length }} 柜 ›</button>
            </h2>
            <div class="scroll-row">
              <button
                v-for="item in latestSettlements"
                :key="item.merchant_no ?? item.order_no"
                class="settle-card"
                type="button"
                @click="goDetail(item.merchant_no)"
              >
                <span class="m">商号 {{ item.merchant_no_normalized ?? item.merchant_no ?? '—' }}</span>
                <span class="c">柜 {{ item.container_no ?? '—' }}</span>
                <span class="amt mono">{{ compactMoney(item.total?.sales_amount) }}</span>
                <span class="g">
                  <span
                    v-for="pill in settlePills(item)"
                    :key="`${item.merchant_no}-${pill.grade}`"
                    class="grade-pill"
                    :class="`pill-${pill.cls}`"
                  >{{ pill.label }}</span>
                </span>
              </button>
            </div>
          </template>

          <section class="ai-card" :class="{ open: aiOpen }">
            <button class="ai-head" type="button" @click="aiOpen = !aiOpen">
              <span class="ai-dot"></span>
              <b>经营速览</b>
              <small>规则生成</small>
              <span class="ai-arrow">▾</span>
            </button>
            <div class="ai-body">
              <div class="ai-body-in" v-html="aiSummaryHtml || '暂无可分析的摘要数据。'"></div>
            </div>
          </section>

          <div class="src-chip">
            <i></i>
            <span>数据 · 实时接口 /api/analytics</span>
          </div>
          </template>
        </div>
        </van-pull-refresh>
      </template>
    </main>

    <van-popup
      v-model:show="showFilters"
      position="bottom"
      round
      safe-area-inset-bottom
      class="filter-popup"
    >
      <div class="fd-head">
        <span class="fd-title">筛选</span>
        <span class="muted">销售日期 · 品牌 · 国家 · 市场</span>
      </div>
      <div class="fd-body">
        <div v-if="monthOptions.length || yearOptions.length" class="fd-group">
          <div class="fd-group-title fd-title-row">
            销售日期
            <div class="fd-mode-tabs">
              <button class="fd-mode-tab" :class="{ active: dateMode === 'month' }" type="button" @click="switchDateMode('month')">按月</button>
              <button class="fd-mode-tab" :class="{ active: dateMode === 'year' }" type="button" @click="switchDateMode('year')">按年</button>
              <button class="fd-mode-tab" :class="{ active: dateMode === 'range' }" type="button" @click="switchDateMode('range')">按日</button>
            </div>
          </div>
          <div v-if="dateMode === 'month'" class="fd-chips">
            <button class="filter-chip" :disabled="filterLoading" :class="{ active: !selectedMonth }" type="button" @click="selectFilter('month', '')">全部</button>
            <button
              v-for="item in monthOptions"
              :key="`month-${item}`"
              class="filter-chip"
              :disabled="filterLoading"
              :class="{ active: selectedMonth === item }"
              type="button"
              @click="selectFilter('month', item)"
            >{{ monthChipLabel(item) }}</button>
          </div>
          <div v-else-if="dateMode === 'year'" class="fd-chips">
            <button class="filter-chip" :disabled="filterLoading" :class="{ active: !selectedYear }" type="button" @click="selectFilter('year', '')">全部</button>
            <button
              v-for="item in yearOptions"
              :key="`year-${item}`"
              class="filter-chip"
              :disabled="filterLoading"
              :class="{ active: String(selectedYear) === String(item) }"
              type="button"
              @click="selectFilter('year', String(item))"
            >{{ item }}年</button>
          </div>
          <div v-else class="range-picker">
            <button
              class="range-trigger"
              :class="{ active: rangeStart || rangeEnd }"
              type="button"
              @click="showRangeCal = true"
            >
              <van-icon name="calendar-o" />
              <span class="mono">{{ rangeStart || '开始日期' }} ~ {{ rangeEnd || '结束日期' }}</span>
            </button>
            <button
              v-if="rangeStart || rangeEnd"
              class="range-clear"
              type="button"
              @click="clearRange"
            >清空</button>
            <p class="range-hint muted">支持单日与起止范围，选择后自动应用</p>
          </div>
        </div>
        <div v-if="brandOptions.length" class="fd-group">
          <div class="fd-group-title">品牌</div>
          <div class="fd-chips">
            <button class="filter-chip" :disabled="filterLoading" :class="{ active: !brand }" type="button" @click="selectFilter('brand', '')">全部</button>
            <button
              v-for="item in brandOptions"
              :key="`brand-${item.name}`"
              class="filter-chip"
              :disabled="filterLoading"
              :class="{ active: brand === item.name }"
              type="button"
              @click="selectFilter('brand', item.name)"
            >
              <span>{{ item.name }}</span>
              <span class="filter-chip-count mono">{{ item.count }}</span>
            </button>
          </div>
        </div>
        <div v-if="countryOptions.length" class="fd-group">
          <div class="fd-group-title">国家</div>
          <div class="fd-chips">
            <button class="filter-chip" :disabled="filterLoading" :class="{ active: !country }" type="button" @click="selectFilter('country', '')">全部</button>
            <button
              v-for="item in countryOptions"
              :key="`country-${item.name}`"
              class="filter-chip"
              :disabled="filterLoading"
              :class="{ active: country === item.name }"
              type="button"
              @click="selectFilter('country', item.name)"
            >
              <span>{{ item.name }}</span>
              <span class="filter-chip-count mono">{{ item.count }}</span>
            </button>
          </div>
        </div>
        <div v-if="marketOptions.length" class="fd-group">
          <div class="fd-group-title">市场</div>
          <div class="fd-chips">
            <button class="filter-chip" :disabled="filterLoading" :class="{ active: !market }" type="button" @click="selectFilter('market', '')">全部</button>
            <button
              v-for="item in marketOptions"
              :key="`market-${item.name}`"
              class="filter-chip"
              :disabled="filterLoading"
              :class="{ active: market === item.name }"
              type="button"
              @click="selectFilter('market', item.name)"
            >
              <span>{{ item.name }}</span>
              <span class="filter-chip-count mono">{{ item.count }}</span>
            </button>
          </div>
        </div>
        <p v-if="filterError" class="filter-error">{{ filterError }}</p>
      </div>
      <div class="fd-footer">
        <van-button size="large" round plain class="fd-reset-btn" @click="resetFilters">重置</van-button>
        <van-button size="large" round type="primary" @click="showFilters = false">完成</van-button>
      </div>
    </van-popup>

    <van-calendar
      v-model:show="showRangeCal"
      title="选择日期范围"
      type="range"
      allow-same-day
      :min-date="calMinDate"
      :max-date="calMaxDate"
      :default-date="rangeDefaultDate"
      @confirm="onRangeConfirm"
    />

    <van-popup
      v-model:show="specSheet"
      position="bottom"
      round
      safe-area-inset-bottom
      class="spec-popup"
    >
      <div class="spec-head">
        <span class="spec-badge" :style="{ background: activeSpecGrade?.color ?? 'var(--text-3)' }">
          {{ activeGradeNo || '·' }}
        </span>
        <div class="spec-head-text">
          <b>{{ activeSpecGrade?.label ?? gradeLabel(activeGradeNo) }}</b>
          <small>分规格销售明细 · 头数 / 公斤</small>
        </div>
        <button class="spec-close" type="button" @click="specSheet = false">✕</button>
      </div>

      <div v-if="activeSpecGrade" class="spec-summary">
        <div><span>柜数</span><b class="mono">{{ gradeContainers(activeSpecGrade.grade) }} 柜</b></div>
        <div><span>总件数</span><b class="mono">{{ number(activeSpecGrade.total.salesQuantity) }}</b></div>
        <div><span>每件均价</span><b class="mono">{{ activeSpecGrade.total.weightedAvgPrice !== null ? price(activeSpecGrade.total.weightedAvgPrice) : '—' }}</b></div>
      </div>

      <div class="spec-body">
        <p v-if="!activeSpecGrade || !activeSpecGrade.specs.length" class="spec-empty muted">
          该等级本期暂无规格销售明细
        </p>
        <div
          v-for="(row, index) in activeSpecGrade?.specs ?? []"
          :key="`${row.pieceCount}-${row.specKg}-${index}`"
          class="spec-row"
        >
          <div class="spec-line1">
            <span class="spec-tag mono">{{ specTag(row) }}</span>
            <span class="spec-price mono">{{ row.weightedAvgPrice !== null ? price(row.weightedAvgPrice) : '—' }}/件</span>
            <span class="spec-qty mono">{{ number(row.salesQuantity) }}<i> 件</i></span>
          </div>
          <div class="spec-line2">
            <div class="spec-bar">
              <i :style="{ width: `${Math.min(100, Math.max(1, (row.quantityShare ?? 0) * 100))}%`, background: activeSpecGrade?.color }"></i>
            </div>
            <span class="spec-share mono">占比 {{ percent(row.quantityShare) }}</span>
            <span class="spec-amt mono">{{ compactMoney(row.salesAmount) }}</span>
          </div>
        </div>
      </div>
    </van-popup>
  </div>
</template>

<style scoped>
.home-page { padding-top: 0; }
.home-main { padding-bottom: 8px; }
.state-card { min-height: 220px; }
.error-text { margin: -4px 0 12px; text-align: center; }

/* ── 深绿头部 ─────────────────────────── */
.home-head {
  margin: 0 -16px;
  padding: calc(14px + env(safe-area-inset-top)) 16px 58px;
  background: linear-gradient(160deg, var(--navy) 0%, #0e4730 100%);
  color: #ffffff;
}
.head-row { display: flex; align-items: center; justify-content: space-between; }
.head-brand { display: flex; align-items: baseline; gap: 8px; }
.head-title { font-size: 19px; font-weight: 700; letter-spacing: 0.02em; }
.head-sub { font-size: 12px; color: rgba(255, 255, 255, 0.55); }
.head-month {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 30px;
  padding: 0 12px;
  color: #ffffff;
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 999px;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease;
}
.head-month:active { background: rgba(255, 255, 255, 0.22); }
.head-actions { display: flex; align-items: center; gap: 8px; }
.head-bell {
  position: relative;
  flex: none;
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  color: #ffffff;
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 50%;
  font-size: 15px;
  cursor: pointer;
  transition: background 0.15s ease;
}
.head-bell:active { background: rgba(255, 255, 255, 0.22); }
.bell-badge {
  position: absolute;
  top: -5px;
  right: -7px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  display: grid;
  place-items: center;
  color: #ffffff;
  background: #ee5a52;
  border-radius: 8px;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
}
/* 上浮叠加改挂在下拉刷新容器上：van-pull-refresh 自带 overflow:hidden 会裁掉
   子元素的内层负边距，直接给 .hero -46px 会被裁出绿边压卡。 */
.home-head + .home-main .home-pull {
  position: relative;
  z-index: 1;
  margin-top: -46px;
}

/* ── 销售情况主卡：销售金额 + 总柜数 两项大字突出 ── */
.home-pull { min-height: 60vh; }
.hero-scope-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}
.hero-scope-label { color: var(--text-2); font-size: 13px; font-weight: 700; letter-spacing: 0.04em; }
.hero-scope {
  padding: 3px 9px;
  color: var(--accent-deep);
  background: var(--accent-soft);
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}
.hero-main-row { display: flex; align-items: stretch; margin-top: 10px; }
.hero-primary { flex: 1.5; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.hero-side {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-left: 14px;
  margin-left: 14px;
  border-left: 1px solid var(--line);
}
.hero-label { color: var(--text-3); font-size: 11.5px; }
.hero-value {
  color: var(--text);
  font-size: 30px;
  font-weight: 800;
  line-height: 1.1;
  letter-spacing: -0.02em;
  white-space: nowrap;
}
.hero-value i { margin-left: 2px; color: var(--text-3); font-size: 13px; font-style: normal; font-weight: 500; }
.hero-full { color: var(--text-3); font-size: 11px; }

/* ── 经营异常提醒条 ───────────────────── */
.anomaly-strip {
  overflow: hidden;
  margin: 0 2px 10px;
  background: #fdf6ec;
  border-radius: 12px;
}
.anomaly-strip-head {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 8px;
  min-height: 42px;
  padding: 0 13px;
  background: transparent;
  border: 0;
  text-align: left;
}
.anomaly-warn-dot {
  flex: none;
  width: 17px;
  height: 17px;
  display: grid;
  place-items: center;
  color: #ffffff;
  background: #e0a83c;
  border-radius: 50%;
  font-size: 11px;
  font-weight: 800;
}
.anomaly-strip-head b { color: #8a5a16; font-size: 13px; }
.anomaly-strip-count {
  padding: 1px 7px;
  color: #b25e09;
  background: rgba(224, 168, 60, 0.16);
  border-radius: 5px;
  font-size: 10.5px;
  font-weight: 700;
}
.anomaly-strip-arrow { margin-left: auto; color: #b8944f; font-size: 11px; transition: transform 0.2s; }
.anomaly-strip.open .anomaly-strip-arrow { transform: rotate(180deg); }
.anomaly-strip-body { max-height: 0; overflow: hidden; transition: max-height 0.25s ease; }
.anomaly-strip.open .anomaly-strip-body { max-height: 360px; }
.anomaly-strip-item {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 8px;
  padding: 8px 13px;
  background: transparent;
  border: 0;
  border-top: 1px solid rgba(224, 168, 60, 0.25);
  text-align: left;
}
.anomaly-strip-item:active { background: rgba(224, 168, 60, 0.12); }
.anomaly-strip-item.static { cursor: default; }
.anomaly-strip-item.static:active { background: transparent; }
.asi-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.asi-main b { color: var(--text); font-size: 12.5px; }
.asi-main small { overflow: hidden; color: var(--text-2); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.asi-main .asi-nums { color: #b25e09; font-weight: 600; }
.asi-chev { flex: none; color: #b8944f; font-size: 12px; }

/* ── 分区标题 ─────────────────────────── */
.grade-sec-title,
.trend-sec-title,
.settle-sec-title { margin: 14px 2px 10px; }
.sec-more { font-size: 12px; font-weight: 400; }
.sec-link {
  padding: 0;
  color: var(--text-3);
  background: transparent;
  border: 0;
  font-size: 12px;
  white-space: nowrap;
}
.empty-note { padding: 10px 0 2px; text-align: center; }
.empty-guide { margin: -6px 0 12px; }

/* ── 等级行情卡 ───────────────────────── */
.grade-card {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 12px;
  min-height: 44px;
  margin-bottom: 10px;
  padding: 14px 16px;
  background: var(--panel);
  border: 0;
  border-radius: 14px;
  box-shadow: 0 1px 2px rgba(26, 46, 34, 0.05), 0 10px 28px rgba(26, 46, 34, 0.06);
  text-align: left;
  transition: transform 0.15s ease;
}
.grade-card:active { transform: scale(0.985); }
.grade-badge {
  flex: none;
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  color: #ffffff;
  border-radius: 12px;
  font-size: 19px;
  font-weight: 800;
}
.grade-badge.idle { opacity: 0.55; }
.grade-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 10px; }
.grade-line1 { display: flex; align-items: baseline; gap: 8px; }
.grade-name { flex: none; color: var(--text); font-size: 15px; font-weight: 700; }
.grade-spec { flex: 1; min-width: 0; overflow: hidden; color: var(--text-3); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.grade-price { flex: none; color: var(--text); font-size: 20px; font-weight: 800; letter-spacing: -0.01em; white-space: nowrap; }
.grade-price i { margin-left: 1px; color: var(--text-3); font-size: 10.5px; font-style: normal; font-weight: 500; }
.grade-price-empty { flex: none; margin-left: auto; color: var(--text-3); font-size: 12px; }
.grade-line2 { display: flex; align-items: center; gap: 8px; }
.grade-bar { flex: 1; height: 5px; overflow: hidden; display: flex; background: #eef2ef; border-radius: 3px; }
.grade-bar i { height: 100%; }
.grade-stats { flex: none; color: var(--text-3); font-size: 11px; white-space: nowrap; }
.grade-chev { flex: none; margin-left: -4px; color: #aab6ae; font-size: 13px; }
.grade-note {
  margin: 2px 0 0;
  padding: 10px 14px;
  color: var(--text-2);
  background: var(--accent-soft);
  border-radius: 10px;
  font-size: 11.5px;
  line-height: 1.6;
}
.grade-note :deep(b) { color: var(--accent-deep); font-weight: 700; }
.tap-hint { margin: 2px 0 0; color: #a9b4ac; font-size: 11px; text-align: center; }

/* ── 销售金额趋势 ────────────────────── */
.chart-card { padding: 14px 16px 10px; }
.chart-head { display: flex; align-items: center; justify-content: flex-end; margin-bottom: 8px; }
.chart-legend { display: flex; gap: 10px; color: var(--text-3); font-size: 11px; }
.chart-legend i { display: inline-block; width: 9px; height: 9px; margin-right: 4px; vertical-align: -1px; border-radius: 3px; }
.legend-bar { background: rgba(22, 121, 79, 0.3); }
.day-readout {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
  padding: 10px 13px;
  background: var(--accent-soft);
  border-radius: 10px;
}
.dr-left { display: flex; flex-direction: column; gap: 3px; }
.dr-date { color: var(--accent-deep); font-size: 12px; font-weight: 700; }
.dr-sub { color: var(--text-3); font-size: 11px; }
.dr-right { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; text-align: right; }
.dr-amt { color: var(--accent-deep); font-size: 19px; font-weight: 700; }
.chart-svg { display: block; width: 100%; height: auto; aspect-ratio: 360 / 150; overflow: visible; }
.scrub-surface { fill: transparent; cursor: pointer; }
.scrub-line { stroke: var(--accent); stroke-width: 1; stroke-dasharray: 3 3; opacity: 0.8; }
.chart-axis {
  display: flex;
  justify-content: space-between;
  padding: 4px 2px 0;
  color: var(--text-3);
  font-size: 11px;
}

/* ── 市场销售 ─────────────────────────── */
.market-sec-title { margin: 14px 2px 10px; }
.market-card { padding: 6px 16px 10px; }
.market-row { display: flex; gap: 10px; padding: 11px 0; }
.market-row + .market-row { border-top: 1px solid var(--line); }
.market-rank {
  flex: none; width: 20px; padding-top: 2px;
  color: var(--text-3); font-size: 13px; font-weight: 700; text-align: center;
}
.market-rank.top { color: var(--accent); }
.market-main { flex: 1; min-width: 0; }
.market-line1 { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.market-side { display: inline-flex; flex: none; align-items: baseline; gap: 8px; }
.market-amount { color: var(--text); font-size: 14px; font-weight: 800; }
.market-stats { margin-top: 6px; color: var(--text-2); font-size: 11px; }
.market-name { overflow: hidden; color: var(--text); font-size: 14px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
.market-count { flex: none; color: var(--text-2); font-size: 12px; font-weight: 700; }
.market-bar { height: 5px; margin-top: 7px; overflow: hidden; display: flex; background: #eef2ef; border-radius: 3px; }
.market-bar i { display: block; height: 100%; background: var(--accent); border-radius: 3px; opacity: 0.75; }
.market-brands { display: flex; flex-wrap: wrap; gap: 5px 6px; margin-top: 7px; }
.market-brand {
  display: inline-flex; align-items: baseline; gap: 4px;
  padding: 2px 7px; color: var(--text-2); background: var(--bg-soft);
  border-radius: 5px; font-size: 11px; font-weight: 600;
}
.market-brand i { color: var(--text-3); font-size: 10px; font-style: normal; font-weight: 400; }

/* ── 最新柜横滑 ───────────────────────── */
.scroll-row {
  display: flex;
  gap: 10px;
  margin: 0 -16px;
  padding: 2px 16px 6px;
  overflow-x: auto;
  scrollbar-width: none;
}
.scroll-row::-webkit-scrollbar { display: none; }
.settle-card {
  flex: none;
  display: flex;
  width: 150px;
  flex-direction: column;
  align-items: stretch;
  padding: 12px 13px 11px;
  background: var(--panel);
  border: 0;
  border-radius: 10px;
  box-shadow: 0 1px 2px rgba(26, 46, 34, 0.05), 0 10px 28px rgba(26, 46, 34, 0.06);
  text-align: left;
}
.settle-card .m { color: var(--text); font-size: 15px; font-weight: 800; }
.settle-card .c {
  overflow: hidden;
  margin-top: 2px;
  color: var(--text-3);
  font-size: 10.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.settle-card .amt { margin-top: 8px; color: var(--text); font-size: 17px; font-weight: 700; }
.settle-card .g { display: flex; gap: 4px; margin-top: 7px; }
.grade-pill { padding: 2px 6px; border-radius: 5px; font-size: 10px; font-weight: 700; }
.pill-a { color: #2e9e6b; background: rgba(46, 158, 107, 0.12); }
.pill-b { color: #b8860b; background: rgba(224, 168, 60, 0.14); }
.grade-pill:not(.pill-a):not(.pill-b) { color: var(--text-2); background: var(--bg-soft); }

/* ── AI 经营摘要 ──────────────────────── */
.ai-card {
  overflow: hidden;
  margin-bottom: 4px;
  background: var(--panel);
  border-radius: 14px;
  box-shadow: 0 1px 2px rgba(26, 46, 34, 0.05), 0 10px 28px rgba(26, 46, 34, 0.06);
}
.ai-head {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 8px;
  min-height: 48px;
  padding: 0 16px;
  background: transparent;
  border: 0;
  text-align: left;
}
.ai-dot { flex: none; width: 8px; height: 8px; background: var(--accent); border-radius: 50%; }
.ai-head b { color: var(--text); font-size: 14px; }
.ai-head small {
  margin-left: 2px;
  padding: 2px 7px;
  color: var(--accent);
  background: var(--accent-soft);
  border-radius: 5px;
  font-size: 10px;
}
.ai-arrow { margin-left: auto; color: var(--text-3); font-size: 12px; transition: transform 0.2s; }
.ai-card.open .ai-arrow { transform: rotate(180deg); }
.ai-body { max-height: 0; overflow: hidden; transition: max-height 0.25s ease; color: #3d4c43; font-size: 13px; line-height: 1.75; }
.ai-card.open .ai-body { max-height: 70vh; overflow-y: auto; }
.ai-body-in { padding: 0 16px 14px; }
.ai-body-in :deep(b) { color: var(--accent-deep); }

/* ── 数据源标识 ───────────────────────── */
.src-chip {
  display: flex;
  width: max-content;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin: 4px auto 0;
  color: var(--text-3);
  font-size: 10.5px;
}
.src-chip i { width: 6px; height: 6px; background: var(--up); border-radius: 50%; }

/* ── 筛选 ─────────────────────────────── */
.filter-compact {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 2px 10px;
}
.filter-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  max-width: 100%;
  padding: 0 12px;
  color: var(--text-2);
  background: var(--panel);
  border: 0;
  border-radius: 999px;
  box-shadow: 0 1px 2px rgba(26, 46, 34, 0.05), 0 6px 16px rgba(26, 46, 34, 0.05);
  font-size: 12px;
  white-space: nowrap;
}
.filter-trigger.active {
  color: var(--accent);
  background: var(--accent-soft);
}
.filter-trigger-text {
  overflow: hidden;
  min-width: 0;
  max-width: 200px;
  text-overflow: ellipsis;
  font-weight: 600;
}
.filter-caret { flex: none; color: var(--text-3); font-size: 11px; }
.filter-reset {
  flex: none;
  min-height: 32px;
  padding: 0 12px;
  color: var(--text-3);
  background: transparent;
  border: 0;
  font-size: 12px;
  white-space: nowrap;
}
.filter-popup { display: flex; flex-direction: column; }
.fd-head { display: flex; align-items: center; justify-content: space-between; padding: 16px 18px 6px; }
.fd-title { color: var(--text); font-size: 16px; font-weight: 700; }
.fd-body { max-height: 52vh; overflow-y: auto; padding: 6px 18px 12px; }
.fd-group + .fd-group { margin-top: 14px; }
.fd-group-title {
  margin-bottom: 9px;
  color: var(--text-3);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
}
.fd-title-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 9px; }
.fd-mode-tabs {
  display: inline-flex;
  gap: 3px;
  padding: 2px;
  background: var(--bg-soft);
  border-radius: 8px;
}
.fd-mode-tab {
  min-height: 24px;
  padding: 0 10px;
  color: var(--text-3);
  background: transparent;
  border: 0;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
}
.fd-mode-tab.active { color: #ffffff; background: var(--accent); }
.range-picker { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.range-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 0 12px;
  color: var(--text-2);
  background: var(--bg-soft);
  border: 0;
  border-radius: 8px;
  font-size: 12px;
  white-space: nowrap;
}
.range-trigger.active { color: var(--accent); background: var(--accent-soft); font-weight: 600; }
.range-clear {
  min-height: 32px;
  padding: 0 10px;
  color: var(--text-3);
  background: transparent;
  border: 0;
  font-size: 12px;
  white-space: nowrap;
}
.range-hint { flex-basis: 100%; margin: 0; font-size: 10.5px; }
.fd-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.fd-footer {
  display: flex;
  gap: 10px;
  padding: 8px 16px calc(12px + env(safe-area-inset-bottom));
}
.fd-footer .van-button { flex: 1; margin: 0; }
.filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 30px;
  padding: 0 11px;
  color: var(--text-2);
  background: var(--bg-soft);
  border: 0;
  border-radius: 8px;
  font-size: 12px;
  white-space: nowrap;
}
.filter-chip.active { color: #ffffff; background: var(--accent); }
.filter-chip:disabled { opacity: 0.45; }
.filter-chip-count { color: var(--text-3); font-size: 11px; }
.filter-chip.active .filter-chip-count { color: rgba(255, 255, 255, 0.85); }
.filter-error { margin: 12px 0 0; color: var(--down); font-size: 11px; }
.filter-busy { opacity: 0.55; pointer-events: none; transition: opacity 0.15s ease; }

/* ── 规格明细抽屉 ─────────────────────── */
.spec-popup { max-height: 74vh; display: flex; flex-direction: column; }
.spec-head { display: flex; align-items: center; gap: 10px; padding: 16px 18px 8px; }
.spec-badge {
  flex: none; width: 36px; height: 36px; display: grid; place-items: center;
  color: #ffffff; border-radius: 10px; font-size: 17px; font-weight: 800;
}
.spec-head-text { flex: 1; min-width: 0; }
.spec-head-text b { display: block; color: var(--text); font-size: 16px; }
.spec-head-text small { display: block; margin-top: 2px; color: var(--text-3); font-size: 11px; }
.spec-close {
  flex: none; width: 32px; height: 32px;
  color: var(--text-3);
  background: #f0f4f1;
  border: 0;
  border-radius: 50%;
  font-size: 15px;
}
.spec-summary {
  display: flex; margin: 8px 18px 4px; padding: 10px 0;
  border-top: 1px solid var(--line); border-bottom: 1px solid var(--line);
}
.spec-summary > div { flex: 1; text-align: center; }
.spec-summary > div + div { border-left: 1px solid var(--line); }
.spec-summary span { display: block; margin-bottom: 4px; color: var(--text-3); font-size: 11px; }
.spec-summary b { color: var(--text); font-size: 15px; font-weight: 700; }
.spec-body { flex: 1; min-height: 0; overflow-y: auto; padding: 4px 18px calc(16px + env(safe-area-inset-bottom)); }
.spec-row { padding: 12px 0; border-bottom: 1px solid var(--line); }
.spec-row:last-of-type { border-bottom: 0; }
.spec-line1 { display: flex; align-items: center; gap: 8px; }
.spec-tag {
  padding: 3px 8px; color: var(--accent-deep); background: var(--accent-soft);
  border-radius: 6px; font-size: 11px; font-weight: 700; white-space: nowrap;
}
.spec-price { margin-left: auto; color: var(--text); font-size: 14px; font-weight: 700; white-space: nowrap; }
.spec-qty { color: var(--text-2); font-size: 14px; font-weight: 700; white-space: nowrap; }
.spec-qty i { color: var(--text-3); font-size: 10.5px; font-style: normal; font-weight: 400; }
.spec-line2 { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
.spec-bar { flex: 1; height: 5px; overflow: hidden; background: #eef2ef; border-radius: 3px; }
.spec-bar i { display: block; height: 100%; border-radius: 3px; }
.spec-share { color: var(--text-3); font-size: 11px; white-space: nowrap; }
.spec-amt { color: var(--text-3); font-size: 11px; white-space: nowrap; }
.spec-empty { padding: 34px 0 40px; text-align: center; }
</style>
