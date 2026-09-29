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
const selectedMonth = ref('')
const brandOptions = ref([])
const countryOptions = ref([])
const marketOptions = ref([])
const monthOptions = ref([])
const marketBrandContainers = ref([])
const filterLoading = ref(false)
const filterError = ref('')
const aiOpen = ref(false)
const specSheet = ref(false)
const activeGradeNo = ref('')
const unreadCount = ref(0)

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const GRADE_DESC = { A: '优质主力', B: '次级果' }
const GRADE_CARD_COLORS = { A: 'var(--accent-3)', B: '#B8860B' }

const total = computed(() => overview.value?.total ?? {})
const grades = computed(() => overview.value?.grades ?? [])
const settlements = computed(() => overview.value?.settlements ?? [])

// ── 经营异常提醒（overview.operating_anomalies）──
const operatingAnomalies = computed(() =>
  Array.isArray(overview.value?.operatingAnomalies) ? overview.value.operatingAnomalies : [],
)
const anomaliesOpen = ref(false)

// 果类动态：结算单 fruit_type 去重；空数据回退榴莲。
const fruitTypeLabel = computed(() => {
  const types = [...new Set(
    (settlements.value ?? [])
      .map((item) => item?.fruit_type)
      .filter(Boolean),
  )]
  if (types.length === 1) return types[0]
  return types.length > 1 ? '多果类' : '榴莲'
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

// ── 月份快捷筛选：选中月换算为起止日期，随筛选传给全部接口 ──
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

const activeMonthRange = computed(() => monthRange(selectedMonth.value))
const activeFilters = computed(() => ({
  brand: brand.value,
  country: country.value,
  market: market.value,
  startDate: activeMonthRange.value.startDate,
  endDate: activeMonthRange.value.endDate,
}))
const hasActiveFilters = computed(() =>
  Boolean(brand.value || country.value || market.value || selectedMonth.value),
)

const filterScopeText = computed(() =>
  [
    selectedMonth.value ? monthChipLabel(selectedMonth.value) : '',
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
  || monthOptions.value.length > 0,
)

const subMetrics = computed(() => [
  { label: '销售金额', value: compactMoney(total.value.salesAmount) },
  { label: '销售数量', value: `${number(total.value.salesQuantity)} 件` },
  { label: '在售柜数', value: `${number(settlementCount.value)} 柜` },
])

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

const monthLabel = computed(() => {
  if (selectedMonth.value) return monthChipLabel(selectedMonth.value)
  const last = trendItems.value[trendItems.value.length - 1]
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(last?.date ?? ''))
  return match ? `${Number(match[2])}月` : ''
})

const selectedPoint = computed(() => {
  const items = trendItems.value
  if (!items.length) return null
  return items.find((item) => item.date === selectedDate.value) ?? items[items.length - 1]
})

const selectedBarIndex = computed(() =>
  trendItems.value.findIndex((item) => item.date === selectedPoint.value?.date),
)

const dayDelta = computed(() => {
  const index = selectedBarIndex.value
  if (index <= 0) return null
  const prev = trendItems.value[index - 1].amount
  const current = trendItems.value[index].amount
  if (!prev) return null
  const text = signedPercent((current - prev) / prev)
  return text === null ? null : { text, up: current >= prev }
})

const trendChart = computed(() => {
  const items = trendItems.value
  if (!items.length) return null

  const width = 360
  const height = 150
  const padTop = 8
  const padBottom = 6
  const gap = 5
  const n = items.length
  const barWidth = (width - 4 - (n - 1) * gap) / n
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

  const prices = items.map((row) => Number(row.avgPrice ?? 0)).filter((value) => Number.isFinite(value))
  const priceMin = prices.length ? Math.min(...prices) : 0
  const priceMax = prices.length ? Math.max(...prices) : 1
  const lineSpan = height - padBottom - padTop - 26
  const linePoints = items.map((row, index) => {
    const value = Number(row.avgPrice ?? 0)
    const normalized = (value - priceMin) / (priceMax - priceMin || 1)
    return {
      date: row.date,
      x: Number((2 + index * (barWidth + gap) + barWidth / 2).toFixed(1)),
      y: Number((height - padBottom - 10 - normalized * lineSpan).toFixed(1)),
      selected: row.date === selectedPoint.value?.date,
    }
  })
  const linePath = linePoints.length
    ? `M ${linePoints.map((point) => `${point.x} ${point.y}`).join(' L ')}`
    : ''

  const axisIndexes = [...new Set([0, Math.floor((n - 1) / 2), n - 1])]

  return { bars, linePoints, linePath, axisIndexes }
})

function selectDay(date) {
  selectedDate.value = date
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

// ── 市场销售：市场柜数排行 + 品牌构成（数据源 grade-breakdown）──
const marketSales = computed(() => {
  const byMarket = new Map()
  for (const row of marketBrandContainers.value) {
    const name = row.market || '未标注市场'
    const entry = byMarket.get(name) ?? { market: name, containerCount: 0, brands: [] }
    entry.containerCount += Number(row.containerCount ?? 0)
    if (row.brand) entry.brands.push({ brand: row.brand, containerCount: Number(row.containerCount ?? 0) })
    byMarket.set(name, entry)
  }
  const rows = [...byMarket.values()].sort((a, b) => b.containerCount - a.containerCount)
  const maxCount = Math.max(1, ...rows.map((row) => row.containerCount))
  return rows.map((row) => {
    const brands = [...row.brands].sort((a, b) => b.containerCount - a.containerCount)
    const brandTotal = brands.reduce((sum, item) => sum + item.containerCount, 0)
    return {
      ...row,
      brands: brands.map((item) => ({ ...item, share: brandTotal ? item.containerCount / brandTotal : 0 })),
      share: row.containerCount / maxCount,
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
      text += `，较月初${monthDelta.value.up ? '上涨' : '下跌'} ${pct}`
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

// ── 数据加载 ────────────────────────────
async function loadData({ silent = false } = {}) {
  if (silent) {
    filterLoading.value = true
  } else {
    loading.value = true
  }
  error.value = ''
  filterError.value = ''
  try {
    const filters = activeFilters.value
    const [overviewData, trendData, specData, gradeData] = await Promise.all([
      fetchOverview(filters),
      fetchTrend(filters),
      fetchGradeSpecBreakdown(filters),
      fetchGradeBreakdown({ ...filters, includeRecords: false }),
    ])
    overview.value = overviewData
    trend.value = trendData
    specGrades.value = specData
    marketBrandContainers.value = gradeData.marketBrandContainers ?? []
    specError.value = ''
    const items = Array.isArray(trendData) ? trendData.filter((row) => row?.sale_date ?? row.saleDate) : []
    if (items.length) {
      const last = items[items.length - 1]
      selectedDate.value = last.sale_date ?? last.saleDate ?? ''
    }
  } catch (err) {
    if (silent) {
      filterError.value = err?.message || '筛选数据加载失败，当前仍显示上次数据'
    } else {
      error.value = err?.message || '数据加载失败'
    }
  } finally {
    loading.value = false
    filterLoading.value = false
  }
}

async function loadFilterOptions() {
  try {
    const options = await fetchFilterOptions(activeMonthRange.value)
    brandOptions.value = options.brands
    countryOptions.value = options.countries
    marketOptions.value = options.markets
    monthOptions.value = options.months
  } catch {
    brandOptions.value = []
    countryOptions.value = []
    marketOptions.value = []
    monthOptions.value = []
  }
}

function selectFilter(kind, value) {
  if (kind === 'month') {
    if (selectedMonth.value === value) return
    selectedMonth.value = value
    loadData({ silent: true })
    // 品牌/国家/市场选项跟随月份窗口，切月后重取。
    loadFilterOptions()
    return
  }
  const target = kind === 'brand' ? brand : kind === 'country' ? country : market
  if (target.value === value) return
  target.value = value
  loadData({ silent: true })
}

function resetFilters() {
  if (!hasActiveFilters.value) return
  brand.value = ''
  country.value = ''
  market.value = ''
  selectedMonth.value = ''
  loadData({ silent: true })
}

onMounted(() => {
  loadData()
  loadFilterOptions()
  loadUnread()
})

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
          <div class="head-sub">{{ fruitTypeLabel }}</div>
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
        <div class="home-content" :class="{ 'filter-busy': filterLoading }">
          <section class="app-card hero" aria-label="核心指标">
            <div class="hero-label-row">
              <span class="hero-label">整体均价</span>
              <span class="hero-tag">本页重点指标</span>
            </div>
            <div class="hero-value-row">
              <strong class="hero-value mono">{{ Number(total.weightedAvgPrice ?? 0).toFixed(2) }}</strong>
              <span class="hero-unit">元/件</span>
              <span v-if="monthDelta" class="trend-badge" :class="monthDelta.up ? 'up' : 'down'">
                {{ monthDelta.up ? '▲' : '▼' }} {{ monthDelta.text }}
              </span>
              <span v-if="monthDelta" class="hero-delta-scope">较月初</span>
            </div>
            <div class="hero-subs">
              <div v-for="metric in subMetrics" :key="metric.label" class="hero-sub">
                <span class="hero-sub-label">{{ metric.label }}</span>
                <span class="hero-sub-value mono">{{ metric.value }}</span>
              </div>
            </div>
          </section>

          <section v-if="operatingAnomalies.length" class="anomaly-strip" :class="{ open: anomaliesOpen }">
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
                </span>
                <span v-if="item.merchant_no" class="asi-chev">›</span>
              </component>
            </div>
          </section>

          <div v-if="hasFilterOptions" class="filter-compact" aria-label="月份、品牌、国家与市场筛选">
            <button
              class="filter-trigger"
              :class="{ active: hasActiveFilters }"
              type="button"
              @click="showFilters = true"
            >
              <van-icon name="filter-o" />
              <span class="filter-trigger-text">{{ filterScopeText || '月份 · 品牌 · 国家 · 市场' }}</span>
              <span class="filter-caret">▾</span>
            </button>
            <button
              v-if="hasActiveFilters"
              class="filter-reset"
              type="button"
              @click="resetFilters"
            >重置</button>
          </div>

          <h2 class="section-title grade-sec-title">
            <span>等级行情</span>
            <span class="sec-more muted">柜数与均价 · 点击看规格明细</span>
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
                <span class="grade-name">
                  <b>{{ row.label }}</b>
                  <small>{{ row.salesQuantity ? [GRADE_DESC[row.grade], topSpecDesc(row.grade)].filter(Boolean).join(' · ') : '本期暂无销售' }}</small>
                </span>
                <span class="grade-meta">
                  <span class="containers">
                    <span>柜数</span>
                    <b class="mono">{{ gradeContainers(row.grade) }}<i> 柜</i></b>
                  </span>
                  <span class="grade-price">
                    <span>均价</span>
                    <b
                      v-if="row.salesQuantity"
                      class="mono"
                      :style="GRADE_CARD_COLORS[row.grade] ? { color: GRADE_CARD_COLORS[row.grade] } : undefined"
                    >{{ gradeCardPrice(row) !== null ? price(gradeCardPrice(row)) : '—' }}</b>
                    <b v-else class="price-empty">暂无销售</b>
                  </span>
                </span>
                <span class="grade-foot">
                  <span class="grade-bar">
                    <i :style="{ width: `${Math.min(100, Math.max(0, (row.quantityShare ?? 0) * 100))}%`, background: row.color }"></i>
                  </span>
                  <span class="grade-share mono">
                    {{ row.salesQuantity ? `销量占比 ${percent(row.quantityShare)} · ${compactMoney(row.salesAmount)}` : '—' }}
                  </span>
                </span>
              </span>
              <span class="grade-chev">›</span>
            </button>
            <p v-if="gradeInsightHtml" class="grade-note" v-html="gradeInsightHtml"></p>
            <p class="tap-hint">点击等级卡查看分规格销售明细 ↓</p>
          </template>
          <p v-else class="muted empty-note">暂无等级数据</p>

          <h2 class="section-title trend-sec-title">
            <span>每日走势</span>
            <span class="sec-more muted">
              <template v-if="filterScopeText">{{ filterScopeText }} · </template>近 {{ trendItems.length }} 天 · 点击柱体看明细
            </span>
          </h2>
          <section class="app-card chart-card">
            <div class="chart-head">
              <span class="chart-title">销售额 × 均价</span>
              <span class="chart-legend">
                <span><i class="legend-bar"></i>销售额</span>
                <span><i class="legend-line"></i>均价</span>
              </span>
            </div>

            <div v-if="selectedPoint" class="day-readout">
              <div class="dr-left">
                <span class="dr-date mono">{{ selectedPoint.dateLabel }}<template v-if="selectedPoint.weekday"> {{ selectedPoint.weekday }}</template> 当日销售</span>
                <span class="dr-sub mono">{{ number(selectedPoint.quantity) }} 件<template v-if="selectedPoint.containers"> · {{ number(selectedPoint.containers) }} 柜</template> · 均价 {{ selectedPoint.avgPrice !== null ? price(selectedPoint.avgPrice) : '—' }}/件</span>
              </div>
              <div class="dr-right">
                <div class="dr-amt mono">{{ compactMoney(selectedPoint.amount) }}</div>
                <span v-if="dayDelta" class="dr-badge mono" :class="dayDelta.up ? 'up' : 'down'">
                  {{ dayDelta.up ? '▲' : '▼' }} {{ dayDelta.text.replace(/^[+-]/, '') }}
                </span>
              </div>
            </div>

            <svg
              v-if="trendChart"
              class="chart-svg"
              viewBox="0 0 360 150"
              role="img"
              aria-label="每日销售额柱状与均价折线,点击柱体查看当日明细"
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
              <path class="avg-line" :d="trendChart.linePath"></path>
              <circle
                v-for="(point, index) in trendChart.linePoints"
                :key="`dot-${point.date}-${index}`"
                class="avg-dot"
                :cx="point.x"
                :cy="point.y"
                :r="point.selected ? 3.8 : 2"
                :fill="point.selected ? '#16794F' : '#ffffff'"
              />
              <rect
                v-for="(bar, index) in trendChart.bars"
                :key="`tap-${bar.date}-${index}`"
                class="bar-tap"
                :x="Math.max(0, bar.x - 2)"
                y="0"
                :width="bar.width + 4"
                :height="150"
                @click="selectDay(bar.date)"
              />
            </svg>
            <div v-if="trendChart" class="chart-axis mono">
              <span v-for="index in trendChart.axisIndexes" :key="`axis-${index}`">
                {{ trendItems[index]?.dateLabel }}
              </span>
            </div>
            <p v-else class="muted empty-note">暂无趋势数据</p>
          </section>

          <template v-if="marketSales.length">
            <h2 class="section-title market-sec-title">
              <span>市场销售</span>
              <span class="sec-more muted">
                <template v-if="market">品牌构成 · {{ market }}</template>
                <template v-else>市场柜数排行 · 品牌构成</template>
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
                    <span class="market-count mono">{{ number(row.containerCount) }} 柜</span>
                  </div>
                  <div class="market-bar">
                    <i :style="{ width: `${Math.min(100, Math.max(2, row.share * 100))}%` }"></i>
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
              <b>AI 经营摘要</b>
              <small>可选</small>
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
        </div>
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
        <span class="muted">月份 · 品牌 · 国家 · 市场</span>
      </div>
      <div class="fd-body">
        <div v-if="monthOptions.length" class="fd-group">
          <div class="fd-group-title">月份</div>
          <div class="fd-chips">
            <button class="filter-chip" :class="{ active: !selectedMonth }" type="button" @click="selectFilter('month', '')">全部</button>
            <button
              v-for="item in monthOptions"
              :key="`month-${item}`"
              class="filter-chip"
              :class="{ active: selectedMonth === item }"
              type="button"
              @click="selectFilter('month', item)"
            >{{ monthChipLabel(item) }}</button>
          </div>
        </div>
        <div v-if="brandOptions.length" class="fd-group">
          <div class="fd-group-title">品牌</div>
          <div class="fd-chips">
            <button class="filter-chip" :class="{ active: !brand }" type="button" @click="selectFilter('brand', '')">全部</button>
            <button
              v-for="item in brandOptions"
              :key="`brand-${item.name}`"
              class="filter-chip"
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
            <button class="filter-chip" :class="{ active: !country }" type="button" @click="selectFilter('country', '')">全部</button>
            <button
              v-for="item in countryOptions"
              :key="`country-${item.name}`"
              class="filter-chip"
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
            <button class="filter-chip" :class="{ active: !market }" type="button" @click="selectFilter('market', '')">全部</button>
            <button
              v-for="item in marketOptions"
              :key="`market-${item.name}`"
              class="filter-chip"
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
.home-head + .home-main .hero { margin-top: -46px; }

/* ── 均价主角卡 ───────────────────────── */
.hero-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.hero-label { color: var(--text-2); font-size: 13px; font-weight: 600; letter-spacing: 0.04em; }
.hero-tag {
  padding: 3px 8px;
  color: var(--accent);
  background: var(--accent-soft);
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
}
.hero-value-row {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px;
  margin-top: 8px;
}
.hero-value {
  color: var(--text);
  font-size: 40px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.02em;
}
.hero-unit { color: var(--text-2); font-size: 13px; }
.hero-delta-scope { color: var(--text-3); font-size: 11px; }
.hero-subs {
  display: flex;
  margin-top: 16px;
  padding-top: 13px;
  border-top: 1px solid var(--line);
}
.hero-sub { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.hero-sub + .hero-sub { padding-left: 14px; border-left: 1px solid var(--line); }
.hero-sub-label { color: var(--text-3); font-size: 11px; }
.hero-sub-value { color: var(--text); font-size: 16px; font-weight: 700; }

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
.grade-info { flex: 1; min-width: 0; }
.grade-name { display: flex; align-items: baseline; gap: 8px; }
.grade-name b { color: var(--text); font-size: 15px; font-weight: 700; }
.grade-name small { overflow: hidden; color: var(--text-3); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.grade-meta { display: flex; align-items: baseline; gap: 12px; margin-top: 7px; }
.containers { display: flex; flex-direction: column; gap: 2px; }
.containers span { color: var(--text-3); font-size: 10px; }
.containers b { color: var(--text); font-size: 19px; font-weight: 700; }
.containers b i { color: var(--text-3); font-size: 11px; font-style: normal; font-weight: 500; }
.grade-price { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; margin-left: auto; text-align: right; }
.grade-price span { color: var(--text-3); font-size: 10px; }
.grade-price b { color: var(--text); font-size: 21px; font-weight: 700; }
.grade-price b.price-empty { color: var(--text-3); font-size: 15px; font-weight: 500; }
.grade-foot { display: flex; align-items: center; gap: 8px; margin-top: 9px; }
.grade-bar { flex: 1; height: 5px; overflow: hidden; display: flex; background: #eef2ef; border-radius: 3px; }
.grade-bar i { height: 100%; }
.grade-share { flex: none; color: var(--text-3); font-size: 11px; white-space: nowrap; }
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

/* ── 每日走势 ─────────────────────────── */
.chart-card { padding: 14px 16px 10px; }
.chart-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.chart-title { color: var(--text); font-size: 13px; font-weight: 700; }
.chart-legend { display: flex; gap: 10px; color: var(--text-3); font-size: 11px; }
.chart-legend i { display: inline-block; width: 9px; height: 9px; margin-right: 4px; vertical-align: -1px; border-radius: 3px; }
.legend-bar { background: rgba(22, 121, 79, 0.3); }
.legend-line { background: var(--accent); }
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
.dr-badge { font-size: 11px; font-weight: 700; }
.dr-badge.up { color: var(--up); }
.dr-badge.down { color: var(--down); }
.chart-svg { display: block; width: 100%; height: auto; aspect-ratio: 360 / 150; overflow: visible; }
.avg-line {
  fill: none;
  stroke: var(--accent);
  stroke-width: 2.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.avg-dot { stroke: var(--accent); stroke-width: 1.6; }
.bar-tap { fill: transparent; cursor: pointer; }
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
.ai-card.open .ai-body { max-height: 400px; }
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
