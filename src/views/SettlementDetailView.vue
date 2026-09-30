<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchSettlementAnalysis, fetchSettlementDetail, fetchSettlementReview } from '../api/data'
import { compactMoney, gradeColor, gradeLabel, money, number, percent, price } from '../utils/format'

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
// 号别阶梯：详情接口 grade_details（后端 ADR-013 桶口径）。
const gradeLadder = computed(() => detail.value?.gradeLadder ?? null)
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
const settlementFormula = computed(() => {
  if (!detail.value) return []
  const data = detail.value.settlement ?? {}
  // 后端口径：应付 = 货款 − 费用；关税是独立结算槽位（ADR-012 以清关单为准），
  // 不参与应付计算，作为补充行展示。
  const rows = [
    { op: '', label: '销售金额', value: money(total.value.salesAmount ?? 0) },
    { op: '−', label: '售后金额', value: formatAbs(data.afterSalesAmount) },
    { op: '=', label: '货款金额', value: formatMoney(data.goodsAmount) },
    { op: '−', label: '费用金额', value: formatAbs(data.feeAmount) },
    { op: '=', label: '应付金额', value: formatMoney(data.payableAmount), strong: true },
  ]
  return rows
})

function formatMoney(value) {
  return value === null || value === undefined ? '—' : money(value)
}

function formatAbs(value) {
  return value === null || value === undefined ? '—' : money(Math.abs(Number(value)))
}

// ── 售后/支出逐项明细（review 接口，随详情一起加载，常驻展示）──
const review = ref(null)
const reviewLoading = ref(false)
const reviewError = ref('')

async function loadReview() {
  if (review.value || reviewLoading.value) return
  reviewLoading.value = true
  reviewError.value = ''
  try {
    review.value = await fetchSettlementReview(route.params.id)
  } catch (err) {
    reviewError.value = err?.message || '售后/支出明细加载失败，请稍后重试'
  } finally {
    reviewLoading.value = false
  }
}

const afterSalesRatio = computed(() => {
  const after = detail.value?.settlement?.afterSalesAmount
  const sales = Number(total.value.salesAmount ?? 0)
  if (after === null || after === undefined || after === '' || !sales) return null
  return Math.abs(Number(after)) / sales
})

const feeRatio = computed(() => {
  const fee = detail.value?.settlement?.feeAmount
  const sales = Number(total.value.salesAmount ?? 0)
  if (fee === null || fee === undefined || fee === '' || !sales) return null
  return Math.abs(Number(fee)) / sales
})

const customsTaxAbs = computed(() => {
  const tax = detail.value?.settlement?.customsTax
  return tax === null || tax === undefined || tax === '' ? null : Math.abs(Number(tax))
})

// review 未返回 item_type，损耗类售后按文案关键词提示（仅展示标记，不参与计算）。
const LOSS_LIKE = /损|坏|烂|抽检|补果|黄皮/
function isLossLike(item) {
  return LOSS_LIKE.test(`${item.content ?? ''}${item.summary ?? ''}`)
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
    // 售后/支出明细是关键数据，随详情并行加载，不再折叠。
    loadReview()
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
        <div class="meta-grid">
          <div class="meta-cell">
            <span class="meta-label">商号</span>
            <b class="meta-value mono">{{ detail.merchantNoNormalized || detail.merchantNo || '—' }}</b>
          </div>
          <div class="meta-cell">
            <span class="meta-label">柜号</span>
            <b class="meta-value mono">{{ detail.containerNo || '—' }}</b>
          </div>
          <div class="meta-cell">
            <span class="meta-label">车号</span>
            <b class="meta-value mono">{{ detail.vehicleNo || '—' }}</b>
          </div>
          <div v-if="detail.brand" class="meta-cell">
            <span class="meta-label">品牌</span>
            <b class="meta-value">{{ detail.brand }}</b>
          </div>
          <div v-if="detail.country" class="meta-cell">
            <span class="meta-label">国家</span>
            <b class="meta-value">{{ detail.country }}</b>
          </div>
          <div v-if="detail.market" class="meta-cell">
            <span class="meta-label">市场</span>
            <b class="meta-value">{{ detail.market }}</b>
          </div>
          <div v-if="detail.arrivalDate" class="meta-cell">
            <span class="meta-label">到达日期</span>
            <b class="meta-value mono">{{ detail.arrivalDate }}</b>
          </div>
          <div v-if="isManualEntry" class="meta-cell meta-cell-tag">
            <span class="meta-label">来源</span>
            <span class="source-tag">手工录单</span>
          </div>
          <div class="meta-cell meta-period">
            <span class="meta-label">销售期间</span>
            <b class="meta-value mono">{{ detail.saleDateStart || detail.startDate || '—' }} 至 {{ (detail.saleDateEnd || detail.endDate || '').slice(5) || '—' }}</b>
          </div>
        </div>
      </header>

      <main class="detail-stack">
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

        <section v-if="gradeLadder && gradeLadder.buckets.length" class="app-card">
          <h2 class="section-title">
            <span>号别价格阶梯</span>
            <span class="muted">元/件 · 按均价从高到低</span>
          </h2>
          <div class="ladder-list">
            <div
              v-for="(row, ladderIndex) in gradeLadder.buckets"
              :key="`${row.fruitType}-${row.grade}-${row.label}`"
              class="ladder-card"
            >
              <div class="ladder-line1">
                <span class="ladder-badge mono" :style="{ backgroundColor: gradeColor(row.grade) }">{{ row.label }}</span>
                <span class="ladder-grade">{{ gradeLabel(row.grade) }}</span>
                <span v-for="mark in row.qualityMarks" :key="mark" class="quality-mark">{{ mark }}</span>
                <span class="ladder-price mono" :class="{ top: ladderIndex === 0 }">
                  {{ row.weightedAvgPrice !== null ? price(row.weightedAvgPrice) : '—' }}<i>/件</i>
                </span>
                <span v-if="ladderIndex === 0 && row.weightedAvgPrice !== null" class="ladder-top-tag">最高</span>
              </div>
              <div class="ladder-line2">
                <span class="ladder-track">
                  <i :style="{ width: shareWidth(row.quantityShare), backgroundColor: gradeColor(row.grade) }"></i>
                </span>
                <span class="ladder-stats mono">{{ number(row.salesQuantity) }} 件 · {{ percent(row.quantityShare) }} · {{ compactMoney(row.salesAmount) }}</span>
              </div>
            </div>
          </div>
          <p v-if="gradeLadder.unrecognizedQuantity" class="muted ladder-note">
            另有 {{ number(gradeLadder.unrecognizedQuantity) }} 件未识别等级写法，未计入阶梯。
          </p>
          <div v-if="gradeLadder.gradeGaps.length" class="ladder-gaps">
            <div class="ladder-subtitle"><span>同级号别价差</span><span class="muted">贵的号别贵在哪</span></div>
            <p v-for="gap in gradeLadder.gradeGaps" :key="gap.grade" class="gap-line">
              {{ gradeLabel(gap.grade) }}：<b class="mono">{{ gap.topLabel }}</b> {{ gap.topPrice !== null ? price(gap.topPrice) : '—' }}
              · <b class="mono">{{ gap.bottomLabel }}</b> {{ gap.bottomPrice !== null ? price(gap.bottomPrice) : '—' }}
              · 差 <b class="mono gap-diff">{{ gap.diff !== null ? price(gap.diff) : '—' }}</b>
            </p>
          </div>
        </section>

        <section class="app-card">
          <h2 class="section-title">
            <span>结算金额明细</span>
          </h2>
          <div class="settlement-rows formula">
            <div
              v-for="row in settlementFormula"
              :key="row.label"
              class="settlement-item-row"
              :class="{ total: row.strong, note: row.note }"
            >
              <span class="data-label">
                <i v-if="row.op" class="op mono">{{ row.op }}</i>
                {{ row.label }}
              </span>
              <strong class="data-value mono" :class="{ minus: row.op === '−' && !row.strong && !row.note }">{{ row.value }}</strong>
            </div>
          </div>

        </section>

        <section class="app-card">
          <h2 class="section-title">
            <span>售后信息</span>
            <span class="muted sec-amount">
              共 {{ formatAbs(detail.settlement.afterSalesAmount) }}<template v-if="afterSalesRatio !== null"> · 售后比 {{ percent(afterSalesRatio) }}</template>
            </span>
          </h2>
          <van-loading v-if="reviewLoading" color="var(--accent)" size="18px" vertical>正在加载售后明细…</van-loading>
          <div v-else-if="reviewError" class="review-error-wrap">
            <p class="review-error">{{ reviewError }}</p>
            <van-button size="small" round type="primary" plain @click="loadReview">重试</van-button>
          </div>
          <template v-else>
            <div v-if="review?.afterSales?.length" class="review-group">
              <div v-for="(item, index) in review.afterSales" :key="`as-${index}`" class="review-item">
                <span class="review-item-label">
                  {{ item.summary || item.content || '售后项' }}
                  <span v-if="isLossLike(item)" class="loss-tag">损耗相关</span>
                </span>
                <span class="review-item-amount mono">− {{ money(item.amount) }}</span>
              </div>
            </div>
            <p v-else class="muted empty-line">未录入售后项目</p>
          </template>
        </section>

        <section class="app-card">
          <h2 class="section-title">
            <span>支出信息</span>
            <span class="muted sec-amount">
              共 {{ formatAbs(detail.settlement.feeAmount) }}<template v-if="feeRatio !== null"> · 占销售 {{ percent(feeRatio) }}</template>
            </span>
          </h2>
          <van-loading v-if="reviewLoading" color="var(--accent)" size="18px" vertical>正在加载支出明细…</van-loading>
          <div v-else-if="reviewError" class="review-error-wrap">
            <p class="review-error">{{ reviewError }}</p>
            <van-button size="small" round type="primary" plain @click="loadReview">重试</van-button>
          </div>
          <template v-else>
            <div v-if="review?.fees?.length || customsTaxAbs !== null" class="review-group">
              <div v-for="(item, index) in review?.fees ?? []" :key="`fee-${index}`" class="review-item">
                <span class="review-item-label">
                  {{ item.name || '费用项' }}
                  <span v-if="item.isCustom" class="custom-tag">自定义</span>
                </span>
                <span class="review-item-amount mono">− {{ money(item.amount) }}</span>
              </div>
              <div v-if="customsTaxAbs !== null" class="review-item">
                <span class="review-item-label">关税<span class="muted">（独立结算，不计入应付）</span></span>
                <span class="review-item-amount mono">{{ money(customsTaxAbs) }}</span>
              </div>
            </div>
            <p v-else class="muted empty-line">未录入支出项目</p>
          </template>
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
.detail-header { margin: 4px 0 6px; }
/* 基础信息格子：对齐 PC 端 8 格布局，label 上值下 */
.meta-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 13px 10px;
  padding: 14px 16px;
  background: var(--panel);
  border-radius: 14px;
  box-shadow: 0 1px 2px rgba(26, 46, 34, 0.05), 0 10px 28px rgba(26, 46, 34, 0.06);
}
.meta-cell { min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.meta-label { color: var(--text-3); font-size: 10.5px; }
.meta-value {
  overflow: hidden;
  color: var(--text);
  font-size: 14px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.meta-period { grid-column: 1 / -1; padding-top: 11px; border-top: 1px dashed var(--line); }
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

/* ── 号别价格阶梯 ─────────────────────── */
.ladder-list { display: flex; flex-direction: column; gap: 10px; }
.ladder-card { padding: 12px 14px; background: var(--panel-soft); border-radius: 12px; }
.ladder-line1 { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; }
.ladder-badge {
  min-width: 46px;
  padding: 4px 8px;
  color: #ffffff;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 800;
  text-align: center;
  letter-spacing: 0.02em;
}
.ladder-grade { flex: none; color: var(--text-3); font-size: 11.5px; white-space: nowrap; }
.quality-mark {
  flex: none;
  padding: 2px 7px;
  color: #a1622f;
  background: rgba(224, 168, 60, 0.14);
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 600;
  white-space: nowrap;
}
.ladder-price { margin-left: auto; color: var(--text); font-size: 20px; font-weight: 800; letter-spacing: -0.01em; white-space: nowrap; }
.ladder-price i { margin-left: 1px; color: var(--text-3); font-size: 10.5px; font-style: normal; font-weight: 500; }
.ladder-price.top { color: var(--accent); }
.ladder-top-tag {
  flex: none;
  padding: 2px 6px;
  color: #ffffff;
  background: var(--accent);
  border-radius: 5px;
  font-size: 10px;
  font-weight: 700;
}
.ladder-line2 { display: flex; align-items: center; gap: 8px; margin-top: 10px; }
.ladder-track { flex: 1; height: 5px; overflow: hidden; display: flex; background: #e6ece8; border-radius: 3px; }
.ladder-track i { display: block; height: 100%; }
.ladder-stats { flex: none; color: var(--text-3); font-size: 11px; white-space: nowrap; }
.ladder-note { margin: 8px 0 0; font-size: 11px; }
.ladder-gaps { margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--line); }
.ladder-subtitle {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  color: var(--text);
  font-size: 13px;
  font-weight: 700;
}
.ladder-subtitle .muted { font-size: 11px; font-weight: 400; }
.gap-line { margin: 8px 0 0; color: var(--text-2); font-size: 12px; line-height: 1.6; }
.gap-line b { color: var(--text); font-weight: 700; }
.gap-line b.gap-diff { color: var(--accent); }

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
.settlement-item-row .op {
  display: inline-flex;
  justify-content: center;
  width: 14px;
  margin-right: 6px;
  color: var(--text-3);
  font-size: 12px;
  font-style: normal;
  font-weight: 700;
}
.settlement-item-row.total { border-top: 1px solid var(--line); }
.settlement-item-row.note { min-height: 34px; }
.settlement-item-row.note .data-label { color: var(--text-3); font-size: 11.5px; }
.settlement-item-row.note .data-value { color: var(--text-3); font-size: 12.5px; font-weight: 500; }
.settlement-item-row.total .data-label { color: var(--text); font-weight: 700; }
.settlement-item-row.total .data-value { color: var(--accent); font-size: 17px; font-weight: 800; }
.data-value.minus { color: var(--down); }


.review-detail { margin-top: 12px; padding: 12px; background: var(--panel-soft); border-radius: 10px; }
.review-group + .review-group { margin-top: 14px; }
.review-group-title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 4px;
  color: var(--text);
  font-size: 12px;
  font-weight: 700;
}
.sec-amount { font-size: 11.5px; }
.review-item {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 7px 0;
  border-bottom: 1px dashed var(--line);
}
.review-item:last-child { border-bottom: 0; }
.review-item-label { flex: 1; min-width: 0; color: var(--text-2); font-size: 12px; line-height: 1.5; }
.review-item-amount { flex: none; color: var(--text-2); font-size: 12px; font-weight: 600; white-space: nowrap; }
.custom-tag { margin-left: 5px; padding: 1px 5px; color: var(--text-3); background: var(--bg-soft); border-radius: 4px; font-size: 10px; }
.loss-tag {
  display: inline-block;
  margin-left: 6px;
  padding: 0 5px;
  color: #b25e09;
  background: rgba(224, 168, 60, 0.16);
  border-radius: 4px;
  font-size: 10px;
  font-weight: 700;
  white-space: nowrap;
}
.review-error-wrap { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; }
.review-error { margin: 0; color: var(--down); font-size: 12px; line-height: 1.6; }

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
.analysis-card.open .analysis-body { max-height: 70vh; overflow-y: auto; }
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
