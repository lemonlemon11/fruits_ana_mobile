<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchSettlementDetail } from '../api/data'
import { gradeColor, gradeLabel, money, number, price } from '../utils/format'

const route = useRoute()
const router = useRouter()
const detail = ref(null)
const loading = ref(true)
const error = ref('')

const title = computed(() => detail.value?.orderNo || '结算单详情')
const total = computed(() => detail.value?.total ?? {})
const grades = computed(() => detail.value?.grades ?? [])
const records = computed(() => detail.value?.records ?? [])
const settlementRows = computed(() => {
  if (!detail.value) return []
  const data = detail.value.settlement ?? {}
  return [
    { label: '货款金额', value: formatMoney(data.goodsAmount) },
    { label: '售后金额', value: formatMoney(data.afterSalesAmount) },
    { label: '费用金额', value: formatMoney(data.feeAmount) },
    { label: '关税', value: formatMoney(data.customsTax) },
    { label: '应付款', value: formatMoney(data.payableAmount), strong: true },
  ]
})

function formatMoney(value) {
  return value === null || value === undefined ? '—' : money(value)
}

function shareWidth(share) {
  const value = Number(share ?? 0)
  return `${Math.min(Math.max(value * 100, 0), 100)}%`
}

async function loadDetail() {
  loading.value = true
  error.value = ''
  try {
    detail.value = await fetchSettlementDetail(route.params.id)
  } catch (err) {
    error.value = err?.message || '结算单详情加载失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

onMounted(loadDetail)
</script>

<template>
  <div class="page no-tabbar detail-page">
    <van-nav-bar :title="title" left-arrow fixed placeholder safe-area-inset-top @click-left="router.back()" />

    <div v-if="loading" class="state-card app-card">
      <van-loading color="var(--accent)" size="22">加载详情中...</van-loading>
    </div>
    <div v-else-if="error" class="state-card app-card">
      <p class="muted">{{ error }}</p>
      <van-button type="primary" size="small" round @click="loadDetail">重新加载</van-button>
    </div>
    <van-empty v-else-if="!detail" image="search" description="未找到该结算单" />

    <template v-else>
      <header class="page-header detail-header">
        <div class="detail-meta">
          <span>商号 {{ detail.merchantNo || '—' }}</span>
          <span>柜号 {{ detail.containerNo || '—' }}</span>
          <span>车号 {{ detail.vehicleNo || '—' }}</span>
          <span class="mono">{{ detail.saleDateStart || detail.startDate || detail.arrivalDate || '—' }} 至 {{ detail.saleDateEnd || detail.endDate || '—' }}</span>
        </div>
      </header>

      <main class="detail-stack">
        <section class="app-card overview-section">
          <h2 class="section-title">销售总览</h2>
          <div class="metric-grid overview-metrics">
            <article class="metric-card">
              <span class="metric-label">销售金额</span>
              <strong class="metric-value mono accent">{{ money(total.salesAmount) }}</strong>
            </article>
            <article class="metric-card">
              <span class="metric-label">销售数量</span>
              <strong class="metric-value mono">{{ number(total.salesQuantity) }}</strong>
            </article>
            <article class="metric-card">
              <span class="metric-label">平均售价</span>
              <strong class="metric-value mono">{{ price(total.weightedAvgPrice) }}</strong>
            </article>
          </div>
        </section>

        <section class="app-card grade-section">
          <h2 class="section-title">等级结构 <span class="muted">{{ grades.length }} 项</span></h2>
          <div v-if="grades.length" class="grade-list">
            <div v-for="row in grades" :key="row.grade" class="grade-row">
              <div class="grade-line">
                <span class="grade-name">
                  <i class="grade-dot" :style="{ background: row.color }"></i>
                  {{ row.label || gradeLabel(row.grade) }}
                </span>
                <span class="grade-amount mono">{{ number(row.salesQuantity) }} 件 · {{ money(row.salesAmount) }}</span>
              </div>
              <div class="progress-track grade-progress">
                <div class="progress-fill" :style="{ width: shareWidth(row.quantityShare), background: row.color }"></div>
              </div>
              <div class="grade-line grade-subline">
                <span>均价 {{ price(row.weightedAvgPrice) }}</span>
                <span class="mono">{{ (Number(row.quantityShare ?? 0) * 100).toFixed(1) }}%</span>
              </div>
            </div>
          </div>
          <p v-else class="muted empty-line">暂无等级数据</p>
        </section>

        <section class="app-card settlement-section">
          <h2 class="section-title">结算金额 <span class="muted">金额明细</span></h2>
          <div class="data-table settlement-table">
            <div class="data-row data-head">
              <span class="data-label">项目</span>
              <span class="data-value">金额</span>
            </div>
            <div v-for="row in settlementRows" :key="row.label" class="data-row settlement-row" :class="{ payable: row.strong }">
              <span class="data-label">{{ row.label }}</span>
              <strong class="data-value mono" :class="{ accent: row.strong }">{{ row.value }}</strong>
            </div>
          </div>
        </section>

        <section class="app-card records-section">
          <h2 class="section-title">销售明细 <span class="muted">{{ records.length }} 条</span></h2>
          <article
            v-for="record in records"
            :key="record.id"
            class="app-card record-card"
            :style="{ '--record-grade': gradeColor(record.grade) }"
          >
            <div class="record-head">
              <span class="grade-pill" :style="{ color: gradeColor(record.grade), background: `${gradeColor(record.grade)}1a` }">{{ gradeLabel(record.grade) }}</span>
              <span class="record-date mono">{{ record.saleDate || '—' }}</span>
            </div>
            <div class="record-meta">{{ record.fruitType || '—' }} · {{ record.specRaw || '—' }}<span v-if="record.headCount"> · {{ record.headCount }}</span></div>
            <div class="record-stats">
              <div class="record-stat"><span class="data-label">数量</span><strong class="data-value mono">{{ number(record.quantity) }}</strong></div>
              <div class="record-stat"><span class="data-label">单价</span><strong class="data-value mono">{{ price(record.unitPrice) }}</strong></div>
              <div class="record-stat"><span class="data-label">金额</span><strong class="data-value mono accent-text">{{ money(record.amount) }}</strong></div>
            </div>
            <div v-if="record.salesRegion || record.remark" class="record-foot">
              <span v-if="record.salesRegion">销售区域：{{ record.salesRegion }}</span>
              <span v-if="record.remark">备注：{{ record.remark }}</span>
            </div>
          </article>
          <p v-if="!records.length" class="muted empty-line">暂无销售明细</p>
        </section>
      </main>
    </template>
  </div>
</template>

<style scoped>
.detail-page { padding-top: 6px; }
.detail-header { margin: 4px 2px 14px; }
.detail-meta { display: flex; flex-wrap: wrap; gap: 8px 14px; color: var(--text-2); font-size: 12px; }
.detail-meta span { white-space: nowrap; }
.detail-stack { display: flex; flex-direction: column; }
.detail-stack .app-card:last-child { margin-bottom: 0; }

.state-card { min-height: 220px; }

.overview-metrics { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.overview-metrics .metric-card {
  display: flex;
  min-width: 0;
  min-height: 96px;
  flex-direction: column;
  justify-content: space-between;
  padding: 12px 10px;
}
.overview-metrics .metric-label { margin-bottom: 0; }
.overview-metrics .metric-value { font-size: 18px; line-height: 1.1; }

.grade-list { display: flex; flex-direction: column; }
.grade-row { padding: 12px 0; }
.grade-row + .grade-row { border-top: 1px solid var(--line); }
.grade-line { display: flex; min-height: 24px; align-items: center; justify-content: space-between; gap: 12px; }
.grade-name { display: inline-flex; align-items: center; gap: 8px; color: var(--text); font-size: 14px; font-weight: 700; }
.grade-amount { color: var(--text-2); font-size: 12px; text-align: right; }
.grade-progress { margin-top: 9px; }
.grade-subline { margin-top: 6px; color: var(--text-3); font-size: 12px; }

.settlement-table { background: var(--panel-soft); }
.settlement-row.payable { background: rgba(47, 143, 91, 0.06); }
.settlement-row.payable .data-value { color: var(--accent); }

.records-section { padding-bottom: 12px; }
.record-card { margin-bottom: 10px; padding: 12px; background: var(--panel-soft); border: 1px solid var(--line); border-radius: 12px; box-shadow: none; }
.record-card:last-of-type { margin-bottom: 0; }
.record-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.grade-pill { display: inline-flex; align-items: center; padding: 3px 8px; border: 1px solid currentColor; border-radius: 999px; font-size: 12px; font-weight: 700; }
.record-date { color: var(--text-3); font-size: 11px; }
.record-meta { margin: 9px 0 11px; color: var(--text-2); font-size: 12px; }
.record-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.record-stat {
  display: flex;
  min-width: 0;
  min-height: 44px;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 0 9px;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 10px;
}
.record-stat .data-label { font-size: 11px; }
.record-stat .data-value { font-size: 13px; font-weight: 700; text-align: right; }
.accent-text { color: var(--accent); }
.record-foot { display: flex; flex-direction: column; gap: 3px; margin-top: 10px; color: var(--text-3); font-size: 12px; }
.empty-line { margin: 4px 0 0; }
</style>
