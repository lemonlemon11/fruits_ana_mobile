<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchSettlementAnalysis, fetchSettlementDetail } from '../api/data'
import { compactMoney, gradeColor, gradeLabel, money, number, price } from '../utils/format'

const route = useRoute()
const router = useRouter()
const detail = ref(null)
const loading = ref(true)
const error = ref('')

// ── AI 同品牌分析 ──
const analysis = ref(null)
const analysisOpen = ref(false)
const analysisLoading = ref(false)
const analysisError = ref('')

const title = computed(() => detail.value?.orderNo || '结算单详情')
const total = computed(() => detail.value?.total ?? {})
const grades = computed(() => detail.value?.grades ?? [])
const records = computed(() => detail.value?.records ?? [])
const isManualEntry = computed(() => detail.value?.sourceType === 'manual')
const operatingAnomalies = computed(() =>
  Array.isArray(detail.value?.operatingAnomalies) ? detail.value.operatingAnomalies : [],
)

// 售出/来货进度：售出严格大于来货按 ADR-048 口径标红。
const soldOverArrival = computed(() =>
  detail.value?.arrivalQuantity !== null
  && Number(total.value.salesQuantity ?? 0) > Number(detail.value?.arrivalQuantity ?? 0),
)
const soldProgressPct = computed(() => {
  const arrival = Number(detail.value?.arrivalQuantity ?? 0)
  if (!arrival) return null
  return Math.min(100, (Number(total.value.salesQuantity ?? 0) / arrival) * 100)
})

const ANOMALY_META = {
  low_weighted_avg_price: { title: '均价偏低' },
  grade_share_deviation: { title: '等级占比偏离' },
  daily_quantity_deviation: { title: '日销量偏离' },
}

function anomalyTitle(item) {
  return ANOMALY_META[item?.type]?.title ?? '经营异常'
}

function anomalyScope(item) {
  const parts = []
  if (item.grade) parts.push(gradeLabel(item.grade))
  if (item.sale_date) parts.push(String(item.sale_date).slice(5))
  return parts.join(' · ')
}

function anomalyValueText(item) {
  if (!item) return ''
  const metric = Number(item.metric)
  const baseline = Number(item.baseline)
  if (!Number.isFinite(metric) || !Number.isFinite(baseline)) return ''
  if (item.type === 'low_weighted_avg_price') {
    return `本单均价 ${price(metric)}/件 · 同期基准 ${price(baseline)}/件`
  }
  if (item.type === 'grade_share_deviation') {
    return `本单占比 ${percent(metric)} · 同期基准 ${percent(baseline)}`
  }
  return `当日 ${number(metric)} 件 · 中位基准 ${number(baseline)} 件`
}
const payable = computed(() => detail.value?.settlement?.payableAmount)
const payableCompact = computed(() =>
  payable.value === null || payable.value === undefined || payable.value === ''
    ? '—'
    : compactMoney(payable.value),
)
const payableFull = computed(() =>
  payable.value === null || payable.value === undefined || payable.value === ''
    ? ''
    : money(payable.value),
)
const settlementRows = computed(() => {
  if (!detail.value) return []
  const data = detail.value.settlement ?? {}
  return [
    { label: '货款金额', value: formatMoney(data.goodsAmount) },
    { label: '售后金额', value: formatMoney(data.afterSalesAmount) },
    { label: '费用金额', value: formatMoney(data.feeAmount) },
    { label: '关税', value: formatMoney(data.customsTax) },
  ]
})

function formatMoney(value) {
  return value === null || value === undefined ? '—' : money(value)
}

function shareWidth(share) {
  const value = Number(share ?? 0)
  return `${Math.min(Math.max(value * 100, 0), 100)}%`
}

// ── 导出分享（PDF 财务单据 / Excel 完整数据）──
const showExport = ref(false)
const exportActions = [
  { name: '财务单据 PDF', subname: '适合转发分享', value: 'pdf' },
  { name: '完整数据 Excel', subname: '说明/等级/趋势/明细', value: 'xlsx' },
]

function onExportSelect(action) {
  const no = encodeURIComponent(route.params.id)
  const path = action.value === 'pdf'
    ? `/api/exports/settlements/${no}/template.pdf`
    : `/api/exports/settlements/${no}.xlsx`
  // 同源 Cookie 会话鉴权，新窗口打开由浏览器直接下载/预览。
  window.open(path, '_blank')
  showExport.value = false
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

async function loadAnalysis() {
  if (analysisLoading.value) return
  analysisLoading.value = true
  analysisError.value = ''
  try {
    analysis.value = await fetchSettlementAnalysis(route.params.id)
  } catch (err) {
    analysisError.value = err?.message || 'AI 分析生成失败，请稍后重试'
  } finally {
    analysisLoading.value = false
  }
}

function toggleAnalysis() {
  analysisOpen.value = !analysisOpen.value
  // 首次展开才请求，失败后再次展开走重试。
  if (analysisOpen.value && !analysis.value) loadAnalysis()
}

// AI 内容按「段落 + 列表」分块渲染：空行分段，- / * / • 开头聚合为列表。
const analysisBlocks = computed(() => {
  const text = String(analysis.value?.content ?? '').trim()
  if (!text) return []
  const blocks = []
  let list = null
  for (const raw of text.split(/\r?\n/)) {
    const bullet = /^[-*•]\s+(.*)$/.exec(raw.trim())
    if (bullet) {
      list = list ?? []
      list.push(bullet[1])
      continue
    }
    if (list) {
      blocks.push({ type: 'list', items: list })
      list = null
    }
    if (raw.trim()) blocks.push({ type: 'para', text: raw.trim() })
  }
  if (list) blocks.push({ type: 'list', items: list })
  return blocks
})

function inlineHtml(text) {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return escaped.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
}

onMounted(loadDetail)
</script>

<template>
  <div class="page no-tabbar detail-page">
    <van-nav-bar :title="title" left-arrow fixed placeholder safe-area-inset-top @click-left="router.back()">
      <template #right>
        <button class="export-link" type="button" @click="showExport = true">
          <van-icon name="share-o" />
          <span>导出</span>
        </button>
      </template>
    </van-nav-bar>

    <van-action-sheet
      v-model:show="showExport"
      :actions="exportActions"
      cancel-text="取消"
      description="选择导出内容"
      close-on-click-action
      @select="onExportSelect"
    />

    <div v-if="loading" class="state-card app-card">
      <van-loading color="var(--accent)" size="22">加载详情中...</van-loading>
    </div>
    <div v-else-if="error" class="state-card app-card">
      <p class="muted">{{ error }}</p>
      <van-button type="primary" size="small" round @click="loadDetail">重新加载</van-button>
    </div>
    <van-empty v-else-if="!detail" image="search" description="未找到该结算单" />

    <template v-else>
      <header class="detail-header">
        <div class="detail-meta">
          <span>商号 {{ detail.merchantNoNormalized || detail.merchantNo || '—' }}</span>
          <span>柜号 {{ detail.containerNo || '—' }}</span>
          <span>车号 {{ detail.vehicleNo || '—' }}</span>
          <span v-if="detail.brand">品牌 {{ detail.brand }}</span>
          <span v-if="detail.country">国家 {{ detail.country }}</span>
          <span v-if="detail.market">市场 {{ detail.market }}</span>
          <span v-if="isManualEntry" class="source-tag">手工录单</span>
          <span class="mono">{{ detail.saleDateStart || detail.startDate || detail.arrivalDate || '—' }} 至 {{ detail.saleDateEnd || detail.endDate || '—' }}</span>
        </div>
      </header>

      <main class="detail-stack">
        <section class="app-card payable-card">
          <span class="payable-label">应付款</span>
          <strong class="payable-value mono">{{ payableCompact }}</strong>
          <span v-if="payableFull" class="payable-sub mono">完整金额 {{ payableFull }}</span>
        </section>

        <section class="app-card">
          <h2 class="section-title">销售总览</h2>
          <div class="overview-metrics">
            <div class="overview-metric">
              <span class="metric-label">销售金额</span>
              <strong class="overview-metric-value mono">{{ money(total.salesAmount) }}</strong>
            </div>
            <div class="overview-metric">
              <span class="metric-label">销售数量</span>
              <strong class="overview-metric-value mono">{{ number(total.salesQuantity) }}</strong>
            </div>
            <div class="overview-metric">
              <span class="metric-label">平均售价</span>
              <strong class="overview-metric-value mono">{{ price(total.weightedAvgPrice) }}</strong>
            </div>
          </div>
          <div v-if="detail.arrivalQuantity" class="arrival-progress">
            <div class="ap-head">
              <span class="ap-label">销售进度 · 来货 {{ number(detail.arrivalQuantity) }} 件</span>
              <span class="ap-value mono" :class="{ over: soldOverArrival }">
                {{ number(total.salesQuantity) }} / {{ number(detail.arrivalQuantity) }} 件
              </span>
            </div>
            <div class="progress-track ap-track">
              <div
                class="progress-fill"
                :class="{ over: soldOverArrival }"
                :style="{ width: `${soldProgressPct ?? 0}%` }"
              ></div>
            </div>
            <p v-if="soldOverArrival" class="ap-warn">售出件数超过来货数量，请核对数据</p>
          </div>
        </section>

        <section v-if="operatingAnomalies.length" class="app-card anomaly-card">
          <h2 class="section-title">经营异常 <span class="muted">{{ operatingAnomalies.length }} 项</span></h2>
          <div class="anomaly-list">
            <div
              v-for="(item, index) in operatingAnomalies"
              :key="`anomaly-${index}`"
              class="anomaly-item"
            >
              <div class="anomaly-line">
                <span class="anomaly-type">{{ anomalyTitle(item) }}</span>
                <span v-if="anomalyScope(item)" class="anomaly-scope mono">{{ anomalyScope(item) }}</span>
              </div>
              <p class="anomaly-reason">{{ item.reason }}</p>
              <p v-if="anomalyValueText(item)" class="anomaly-nums mono">{{ anomalyValueText(item) }}</p>
            </div>
          </div>
        </section>

        <section class="app-card">
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

        <section class="app-card">
          <h2 class="section-title">结算金额明细</h2>
          <div class="settlement-rows">
            <div v-for="row in settlementRows" :key="row.label" class="settlement-item-row">
              <span class="data-label">{{ row.label }}</span>
              <strong class="data-value mono">{{ row.value }}</strong>
            </div>
          </div>
        </section>

        <section class="app-card analysis-card" :class="{ open: analysisOpen }">
          <button class="analysis-head" type="button" @click="toggleAnalysis">
            <span class="ai-dot"></span>
            <b>AI 同品牌分析</b>
            <small>同品牌结算单对比</small>
            <span class="analysis-arrow">▾</span>
          </button>
          <div class="analysis-body">
            <div v-if="analysisLoading" class="analysis-state">
              <van-loading color="var(--accent)" size="18">正在生成分析，稍等片刻...</van-loading>
            </div>
            <div v-else-if="analysisError" class="analysis-state">
              <p class="analysis-error">{{ analysisError }}</p>
              <van-button size="small" round type="primary" plain @click="loadAnalysis">重试</van-button>
            </div>
            <template v-else-if="analysisBlocks.length">
              <template v-for="(block, index) in analysisBlocks" :key="`blk-${index}`">
                <p v-if="block.type === 'para'" class="analysis-para" v-html="inlineHtml(block.text)"></p>
                <ul v-else class="analysis-list">
                  <li
                    v-for="(item, itemIndex) in block.items"
                    :key="`blk-${index}-${itemIndex}`"
                    v-html="inlineHtml(item)"
                  ></li>
                </ul>
              </template>
              <p v-if="analysis" class="analysis-meta mono">
                模型 {{ analysis.model }} · {{ analysis.cached ? '缓存结果' : '实时生成' }}
              </p>
            </template>
            <p v-else class="muted empty-line">暂无分析内容</p>
          </div>
        </section>

        <section class="app-card records-section">
          <h2 class="section-title">销售明细 <span class="muted">{{ records.length }} 条</span></h2>
          <article
            v-for="record in records"
            :key="record.id"
            class="record-card"
          >
            <div class="record-head">
              <span class="grade-pill" :style="{ color: gradeColor(record.grade) }">{{ gradeLabel(record.grade) }}</span>
              <span class="record-date mono">{{ record.saleDate || '—' }}</span>
            </div>
            <div class="record-meta">
              {{ record.fruitType || '—' }}<template v-if="record.variety"> · {{ record.variety }}</template> · {{ record.specRaw || '—' }}<template v-if="record.headCount"> · {{ record.headCount }}头</template><template v-if="record.specKg"> · {{ record.specKg }}kg</template>
            </div>
            <div class="record-stats">
              <div class="record-stat"><span class="data-label">数量</span><strong class="data-value mono">{{ number(record.quantity) }}</strong></div>
              <div class="record-stat"><span class="data-label">单价</span><strong class="data-value mono">{{ price(record.unitPrice) }}</strong></div>
              <div class="record-stat"><span class="data-label">金额</span><strong class="data-value mono">{{ money(record.amount) }}</strong></div>
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
.export-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0;
  color: var(--text-2);
  background: transparent;
  border: 0;
  font-size: 13px;
}
.detail-header { margin: 4px 2px 6px; }
.detail-meta { display: flex; flex-wrap: wrap; gap: 8px 14px; color: var(--text-3); font-size: 12px; }
.detail-meta span { white-space: nowrap; }
.source-tag {
  color: var(--accent);
  background: var(--accent-soft);
  border-radius: 5px;
  font-size: 11px;
  font-weight: 600;
  padding: 1px 6px;
}
.detail-stack { display: flex; flex-direction: column; }
.detail-stack .app-card:last-child { margin-bottom: 0; }

.state-card { min-height: 220px; }

.payable-card { padding-bottom: 18px; }
.payable-label { display: block; color: var(--text-3); font-size: 13px; font-weight: 600; letter-spacing: 0.02em; }
.payable-value {
  display: block;
  margin-top: 6px;
  color: var(--accent);
  font-size: 32px;
  font-weight: 800;
  line-height: 1.1;
  letter-spacing: -0.02em;
}
.payable-sub { display: block; margin-top: 7px; color: var(--text-3); font-size: 11px; }

.overview-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.overview-metric { display: flex; min-width: 0; flex-direction: column; gap: 6px; }
.overview-metric .metric-label { margin-bottom: 0; }
.overview-metric .data-value, .overview-metric-value {
  overflow: hidden;
  color: var(--text);
  font-size: 16px;
  font-weight: 700;
  line-height: 1.15;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── 来货/销售进度 ────────────────────── */
.arrival-progress { margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--line); }
.ap-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.ap-label { color: var(--text-3); font-size: 12px; }
.ap-value { color: var(--text-2); font-size: 12px; font-weight: 700; }
.ap-value.over { color: var(--down); }
.ap-track { margin-top: 8px; }
.ap-track .progress-fill { background: var(--accent); }
.ap-track .progress-fill.over { background: var(--down); }
.ap-warn { margin: 7px 0 0; color: var(--down); font-size: 11px; }

/* ── 经营异常 ────────────────────────── */
.anomaly-list { display: flex; flex-direction: column; }
.anomaly-item { padding: 10px 12px; background: #fdf6ec; border-radius: 10px; }
.anomaly-item + .anomaly-item { margin-top: 8px; }
.anomaly-line { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.anomaly-type {
  color: #b25e09;
  background: rgba(224, 168, 60, 0.16);
  border-radius: 5px;
  padding: 2px 7px;
  font-size: 11px;
  font-weight: 700;
}
.anomaly-scope { color: var(--text-3); font-size: 11px; white-space: nowrap; }
.anomaly-reason { margin: 7px 0 0; color: var(--text-2); font-size: 12px; line-height: 1.6; }
.anomaly-nums { margin: 5px 0 0; color: #b25e09; font-size: 11.5px; font-weight: 600; }

.grade-list { display: flex; flex-direction: column; }
.grade-row { padding: 12px 0; }
.grade-row + .grade-row { border-top: 1px solid var(--line); }
.grade-line { display: flex; min-height: 24px; align-items: center; justify-content: space-between; gap: 12px; }
.grade-name { display: inline-flex; align-items: center; gap: 8px; color: var(--text); font-size: 14px; font-weight: 700; }
.grade-amount { color: var(--text-2); font-size: 12px; text-align: right; }
.grade-progress { margin-top: 9px; }
.grade-subline { margin-top: 6px; color: var(--text-3); font-size: 12px; }

.settlement-rows { display: flex; flex-direction: column; }
.settlement-item-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 44px;
  padding: 8px 0;
}
.settlement-item-row + .settlement-item-row { border-top: 1px solid var(--line); }

.records-section { padding-bottom: 12px; }
.record-card { padding: 12px 0; border-bottom: 1px solid var(--line); }
.record-card:last-of-type { border-bottom: 0; }
.record-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.grade-pill { display: inline-flex; align-items: center; padding: 2px 7px; background: rgba(0, 0, 0, 0.04); border-radius: 5px; font-size: 12px; font-weight: 700; }
.record-date { color: var(--text-3); font-size: 11px; }
.record-meta { margin: 9px 0 11px; color: var(--text-2); font-size: 12px; }
.record-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.record-stat {
  display: flex;
  min-width: 0;
  min-height: 40px;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 0 9px;
  background: var(--panel-soft);
  border-radius: 8px;
}
.record-stat .data-label { font-size: 11px; }
.record-stat .data-value { font-size: 13px; font-weight: 700; text-align: right; }
.record-foot { display: flex; flex-direction: column; gap: 3px; margin-top: 10px; color: var(--text-3); font-size: 12px; }
.empty-line { margin: 4px 0 0; }

/* ── AI 同品牌分析 ────────────────────── */
.analysis-card { overflow: hidden; }
.analysis-head {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 8px;
  min-height: 48px;
  padding: 0;
  background: transparent;
  border: 0;
  text-align: left;
}
.ai-dot { flex: none; width: 8px; height: 8px; background: var(--accent); border-radius: 50%; }
.analysis-head b { color: var(--text); font-size: 14px; }
.analysis-head small {
  margin-left: 2px;
  padding: 2px 7px;
  color: var(--accent);
  background: var(--accent-soft);
  border-radius: 5px;
  font-size: 10px;
}
.analysis-arrow { margin-left: auto; color: var(--text-3); font-size: 12px; transition: transform 0.2s; }
.analysis-card.open .analysis-arrow { transform: rotate(180deg); }
.analysis-body { max-height: 0; overflow: hidden; transition: max-height 0.25s ease; }
.analysis-card.open .analysis-body { max-height: 640px; }
.analysis-body > * { margin: 0; }
.analysis-para { color: var(--text-2); font-size: 13px; line-height: 1.75; }
.analysis-para + .analysis-para,
.analysis-list + .analysis-para { margin-top: 8px; }
.analysis-para :deep(b) { color: var(--accent-deep); }
.analysis-list { margin: 8px 0 0; padding-left: 18px; color: var(--text-2); font-size: 13px; line-height: 1.75; }
.analysis-list + .analysis-list { margin-top: 8px; }
.analysis-list :deep(b) { color: var(--accent-deep); }
.analysis-meta { margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--line); color: var(--text-3); font-size: 10.5px; }
.analysis-state { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; padding: 4px 0 6px; }
.analysis-error { margin: 0; color: var(--down); font-size: 12px; line-height: 1.6; }
</style>
