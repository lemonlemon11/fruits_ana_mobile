<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { fetchOverview, fetchTrend } from '../api/data'
import { money, number, percent, price } from '../utils/format'

const router = useRouter()
const loading = ref(true)
const error = ref('')
const overview = ref(null)
const trend = ref([])

const total = computed(() => overview.value?.total ?? {})
const grades = computed(() => overview.value?.grades ?? [])
const settlementCount = computed(() => {
  const data = overview.value
  if (!data) return 0
  if (data.settlements?.length) return data.settlements.length
  const issue = data.issueCounts ?? {}
  const explicit = Number(issue.settlement_count ?? issue.settlementCount)
  if (Number.isFinite(explicit) && explicit) return explicit
  return Object.values(issue).reduce((sum, value) => sum + Number(value || 0), 0)
})

const metrics = computed(() => [
  { label: '销售金额', value: money(total.value.salesAmount), accent: true },
  { label: '销售数量', value: number(total.value.salesQuantity) },
  { label: '平均售价', value: price(total.value.weightedAvgPrice) },
  { label: '结算单数', value: number(settlementCount.value) },
])

const trendItems = computed(() => {
  const items = (Array.isArray(trend.value) ? trend.value : [])
    .map((row) => ({
      date: row.sale_date ?? row.saleDate ?? '',
      amount: Number(row.sales_amount ?? row.salesAmount ?? 0),
    }))
    .filter((row) => row.date)
  return items.map((row) => ({
    ...row,
    dateLabel: formatTrendDate(row.date),
    amountLabel: compactMoney(row.amount),
  }))
})

const trendChart = computed(() => {
  const items = trendItems.value
  if (!items.length) return null

  const width = 600
  const height = 180
  const padX = 18
  const padY = 24
  const plotWidth = width - padX * 2
  const plotHeight = height - padY * 2
  const maxAmount = Math.max(1, ...items.map((row) => row.amount))
  const step = items.length > 1 ? plotWidth / (items.length - 1) : 0

  const points = items.map((row, index) => ({
    ...row,
    x: Number((padX + step * index).toFixed(2)),
    y: Number((height - padY - (row.amount / maxAmount) * plotHeight).toFixed(2)),
  }))
  const lineCoords = points.map((point) => `${point.x} ${point.y}`).join(' L ')
  const linePath = points.length === 1
    ? `M ${points[0].x} ${points[0].y} L ${points[0].x + 1} ${points[0].y}`
    : `M ${lineCoords}`
  const areaPath = points.length === 1
    ? `M ${points[0].x} ${height - padY} L ${points[0].x} ${points[0].y} L ${points[0].x + 1} ${points[0].y} L ${points[0].x + 1} ${height - padY} Z`
    : `M ${points[0].x} ${height - padY} L ${lineCoords} L ${points[points.length - 1].x} ${height - padY} Z`

  const labelIndexes = [...new Set([0, Math.floor((items.length - 1) / 2), items.length - 1])]
  const labels = labelIndexes.map((index) => points[index]).filter(Boolean)

  return {
    points,
    labels,
    linePath,
    areaPath,
    maxLabel: compactMoney(maxAmount),
  }
})

function compactMoney(value) {
  const num = Number(value ?? 0)
  if (num >= 100000000) return `¥${(num / 100000000).toFixed(1)}亿`
  if (num >= 10000) return `¥${(num / 10000).toFixed(1)}万`
  return money(num)
}

function formatTrendDate(value) {
  const text = String(value ?? '')
  return text.length > 10 ? text.slice(5) : text
}

function shareWidth(value) {
  return `${Math.min(100, Math.max(0, Number(value ?? 0) * 100))}%`
}

function progressStyle(row) {
  return {
    width: shareWidth(row.quantityShare),
    background: row.color,
    boxShadow: `0 0 14px ${row.color}55`,
  }
}

async function loadData() {
  loading.value = true
  error.value = ''
  try {
    const [overviewData, trendData] = await Promise.all([fetchOverview(), fetchTrend()])
    overview.value = overviewData
    trend.value = trendData
  } catch (err) {
    error.value = err?.message || '数据加载失败'
  } finally {
    loading.value = false
  }
}

function goSettlements() {
  router.push('/settlements')
}

onMounted(loadData)
</script>

<template>
  <div class="page home-page">
    <van-nav-bar title="销售总览" fixed placeholder safe-area-inset-top />

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
        <section class="metric-grid metrics-grid" aria-label="核心指标">
          <article
            v-for="metric in metrics"
            :key="metric.label"
            class="app-card metric-card"
          >
            <span class="metric-label">{{ metric.label }}</span>
            <strong class="metric-value" :class="{ accent: metric.accent }">{{ metric.value }}</strong>
          </article>
        </section>

        <section class="app-card trend-card">
          <h2 class="section-title">
            <span class="section-title-text">每日趋势</span>
            <span class="muted">{{ trendItems.length }} 天</span>
          </h2>
          <div v-if="trendChart" class="trend-chart-wrap">
            <div class="trend-summary">
              <span class="muted">销售金额走势</span>
              <span class="trend-peak mono">峰值 {{ trendChart.maxLabel }}</span>
            </div>
            <svg
              class="trend-svg"
              viewBox="0 0 600 180"
              role="img"
              aria-label="每日销售金额折线图"
            >
              <defs>
                <linearGradient id="trend-area-gradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#2f8f5b" stop-opacity="0.24"></stop>
                  <stop offset="100%" stop-color="#2f8f5b" stop-opacity="0.02"></stop>
                </linearGradient>
              </defs>
              <path class="trend-area" :d="trendChart.areaPath"></path>
              <path class="trend-line" :d="trendChart.linePath"></path>
              <g class="trend-points">
                <circle
                  v-for="(point, index) in trendChart.points"
                  :key="`${point.date}-${index}`"
                  class="trend-point"
                  :cx="point.x"
                  :cy="point.y"
                  r="3"
                ></circle>
              </g>
            </svg>
            <div class="trend-axis">
              <span v-for="label in trendChart.labels" :key="label.date" class="mono">{{ label.dateLabel }}</span>
            </div>
          </div>
          <p v-else class="muted empty-note">暂无趋势数据</p>
        </section>

        <section class="app-card grade-card">
          <h2 class="section-title">
            <span class="section-title-text">等级结构</span>
            <span class="muted">数量 / 金额</span>
          </h2>
          <div v-if="grades.length" class="grade-list">
            <div v-for="row in grades" :key="row.grade" class="grade-item">
              <div class="grade-main">
                <span class="grade-name">
                  <i class="grade-dot" :style="{ background: row.color, color: row.color }"></i>
                  {{ row.label }}
                </span>
                <span class="grade-figures mono">{{ number(row.salesQuantity) }} 件 / {{ money(row.salesAmount) }}</span>
              </div>
              <div class="progress-track">
                <div class="progress-fill" :style="progressStyle(row)"></div>
              </div>
              <div class="grade-foot">
                <span>均价 {{ row.salesQuantity ? price(row.salesAmount / row.salesQuantity) : '—' }}</span>
                <span class="mono">占比 {{ percent(row.quantityShare) }}</span>
              </div>
            </div>
          </div>
          <p v-else class="muted empty-note">暂无等级数据</p>
        </section>

        <div class="primary-action">
          <van-button type="primary" size="large" round block icon="orders-o" @click="goSettlements">查看全部结算单</van-button>
        </div>
      </template>
    </main>
  </div>
</template>

<style scoped>
.home-page { padding-top: 6px; }
.home-main { padding-bottom: 8px; }
.state-card { min-height: 220px; }
.error-text { margin: -4px 0 12px; text-align: center; }
.metrics-grid { margin-bottom: 14px; }
.metrics-grid .metric-card {
  display: flex;
  min-height: 96px;
  margin-bottom: 0;
  flex-direction: column;
  justify-content: space-between;
  padding: 15px;
}
.metrics-grid .metric-value { font-size: 22px; text-align: left; }
.trend-chart-wrap { display: flex; flex-direction: column; gap: 8px; }
.trend-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.trend-peak { color: var(--accent); font-size: 12px; font-weight: 700; }
.trend-svg { display: block; width: 100%; height: auto; aspect-ratio: 600 / 180; overflow: visible; }
.trend-area { fill: url('#trend-area-gradient'); }
.trend-line {
  fill: none;
  stroke: var(--accent);
  stroke-width: 2.5;
  stroke-linecap: round;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
}
.trend-point {
  fill: #ffffff;
  stroke: var(--accent);
  stroke-width: 2;
  vector-effect: non-scaling-stroke;
}
.trend-axis {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--text-3);
  font-size: 11px;
}
.trend-svg path,
.trend-svg circle {
  animation: trend-fade 0.7s ease both;
}
.grade-list { display: flex; flex-direction: column; }
.grade-item { padding: 12px 0; }
.grade-item + .grade-item { border-top: 1px solid var(--line); }
.grade-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.grade-name {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
  color: var(--text);
  font-size: 13px;
  font-weight: 600;
}
.grade-figures {
  flex: none;
  color: var(--text-2);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.grade-item .progress-track { margin: 10px 0; }
.grade-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: var(--text-2);
  font-size: 12px;
}
.empty-note { padding: 10px 0 2px; text-align: center; }
.primary-action { margin-top: 2px; }

@keyframes trend-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}
</style>
