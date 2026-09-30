<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { showToast } from 'vant'
import { fetchSettlementOptions, fetchSeriesComparison, fetchSeriesAnalysis, fetchGradeDetailAnalysis } from '../api/data'
import { money, number, price, percent, gradeLabel, gradeColor } from '../utils/format'

const GRADE_ORDER = ['A', 'B', 'AB', 'C', 'D', 'E', 'F', 'OTHER']
const ROW_COLORS = ['#16794F', '#d9942f', '#6fae62']

const options = ref([])
const loading = ref(true)
const optionsError = ref(false)
const selected = ref([])
const result = ref(null)
const busy = ref(false)
const compareError = ref('')
const aiText = ref('')
const aiBusy = ref(false)
const aiError = ref('')
// 号别细分（grade-detail）AI 小结，独立于整体智能分析。
const gradeAiText = ref('')
const gradeAiBusy = ref(false)
const gradeAiError = ref('')
const showPicker = ref(false)
const searchText = ref('')
// 等级结构占比口径：数量（gradeQuantities）/ 金额（gradeAmountShares，后端 grade_amount_shares）。
const shareMode = ref('qty')

const canCompare = computed(() => selected.value.length >= 2)
const selectedOptions = computed(() => options.value.filter((item) => selected.value.includes(keyOf(item))))
const rows = computed(() => result.value?.settlements?.length ? result.value.settlements : selectedOptions.value)
const selectedSeries = computed(() => selectedOptions.value[0]?.series || selectedOptions.value[0]?.brand || '')
const seriesGroups = computed(() => {
  const groups = []
  const map = new Map()
  options.value.forEach((item) => {
    const name = item.series || item.brand || '未识别品牌'
    if (!map.has(name)) {
      const group = { name, items: [] }
      map.set(name, group)
      groups.push(group)
    }
    map.get(name).items.push(item)
  })
  return groups
})
const filteredGroups = computed(() => {
  const keyword = searchText.value.trim().toLowerCase()
  if (!keyword) return seriesGroups.value
  const matches = (item) =>
    [item.orderNo, item.orderNoNormalized, item.series, item.brand, item.containerNo, item.vehicleNo, item.merchantNo]
      .some((value) => String(value ?? '').toLowerCase().includes(keyword))
  return seriesGroups.value
    .map((group) => ({ name: group.name, items: group.items.filter(matches) }))
    .filter((group) => group.items.length)
})
const selectedSummary = computed(() =>
  selectedOptions.value.map((item) => shortName(item)).join('、'),
)

watch(selected, () => {
  result.value = null
  compareError.value = ''
  aiText.value = ''
  aiError.value = ''
})

const num = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}
const maybe = (value) => {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}
const pick = (obj, keys) => {
  for (const name of keys) {
    const value = obj?.[name]
    if (value !== undefined && value !== null && value !== '') return value
  }
  return ''
}
const keyOf = (item) =>
  String(item?.merchantNo || item?.orderNoNormalized || item?.orderNo || item?.merchantNoNormalized || '')

const detailRows = computed(() => {
  const raw = result.value?.gradeDetails
  if (!Array.isArray(raw)) return []
  return raw.map((item, index) => {
    const grade = String(pick(item, ['grade', 'gradeName', 'grade_name'])).toUpperCase()
    if (!grade) return null
    const merchant = String(pick(item, [
      'merchantNoNormalized', 'merchantNo', 'merchant_no_normalized', 'merchant_no',
      'orderNoNormalized', 'orderNo', 'order_no_normalized', 'order_no',
    ]))
    const matched = merchant
      ? rows.value.find((row) => [keyOf(row), row.merchantNoNormalized, row.merchantNo, row.orderNoNormalized, row.orderNo].includes(merchant))
      : null
    return {
      grade,
      index,
      key: matched ? keyOf(matched) : '',
      price: maybe(pick(item, ['weightedAvgPrice', 'weighted_avg_price', 'averagePrice', 'average_price', 'avgPrice', 'unitPrice'])),
      qty: num(pick(item, ['salesQuantity', 'sales_quantity', 'totalQuantity', 'total_quantity', 'quantity'])),
      share: maybe(pick(item, ['quantityShare', 'quantity_share', 'share'])),
    }
  }).filter(Boolean)
})

const grades = computed(() => {
  const found = new Set()
  detailRows.value.forEach((row) => found.add(row.grade))
  rows.value.forEach((row) => Object.keys(row.gradeQuantities || {}).forEach((grade) => found.add(String(grade).toUpperCase())))
  return [
    ...GRADE_ORDER.filter((grade) => found.has(grade)),
    ...[...found].filter((grade) => !GRADE_ORDER.includes(grade)),
  ]
})

const detail = (row, grade, index) =>
  detailRows.value.find((item) => item.grade === grade && ((item.key && item.key === keyOf(row)) || (!item.key && item.index === index)))

const avg = (row, grade, index) => detail(row, grade, index)?.price ?? null
const priceText = (value) => (value === null ? '—' : price(value))
const color = (index) => ROW_COLORS[index % ROW_COLORS.length]

const bestAmountIndex = computed(() => {
  if (rows.value.length < 2) return -1
  let best = -1
  let bestValue = -Infinity
  rows.value.forEach((row, index) => {
    const value = num(row.salesAmount)
    if (value > bestValue) { bestValue = value; best = index }
  })
  return best
})
const bestAvgPriceIndex = computed(() => {
  if (rows.value.length < 2) return -1
  let best = -1
  let bestValue = -Infinity
  rows.value.forEach((row, index) => {
    const value = maybe(row.averagePrice)
    if (value !== null && value > bestValue) { bestValue = value; best = index }
  })
  return best
})

const bestPriceByGrade = computed(() => {
  const map = {}
  grades.value.forEach((grade) => {
    let bestIndex = -1
    let bestValue = -Infinity
    rows.value.forEach((row, index) => {
      const value = avg(row, grade, index)
      if (value !== null && value > bestValue) { bestValue = value; bestIndex = index }
    })
    if (bestIndex >= 0) map[grade] = bestIndex
  })
  return map
})

function isBestPrice(grade, index) {
  return bestPriceByGrade.value[grade] === index
}

const segments = (row, index) => {
  if (shareMode.value === 'amount') {
    const amountMap = row.gradeAmountShares || {}
    const amountItems = grades.value
      .map((grade) => ({ grade, share: maybe(amountMap[grade]) }))
      .filter((item) => item.share !== null && item.share > 0)
    if (amountItems.length) return amountItems
  }
  const map = row.gradeQuantities || {}
  const items = grades.value.map((grade) => {
    if (map[grade] !== undefined && map[grade] !== null) return { grade, qty: num(map[grade]) }
    const info = detail(row, grade, index)
    return { grade, qty: info?.qty || 0, share: info?.share ?? null }
  }).filter((item) => item.qty > 0)
  const total = items.reduce((sum, item) => sum + item.qty, 0) || 1
  return items.map((item) => ({ grade: item.grade, share: item.share ?? item.qty / total }))
}
const dominantSegment = (row, index) => {
  const list = segments(row, index)
  if (!list.length) return null
  return list.reduce((best, item) => (item.share > best.share ? item : best), list[0])
}
const hasShare = computed(() => rows.value.some((row, index) => segments(row, index).length > 0))

// 汇总额优先用后端聚合（series-comparison 的 total），缺省再前端求和。
const resultTotalAmount = computed(() => {
  const backendTotal = num(result.value?.total?.salesAmount)
  if (backendTotal) return backendTotal
  return rows.value.reduce((sum, item) => sum + num(item.salesAmount), 0)
})

// 号别阶梯：后端 grade_details 的 buckets（按每件均价降序）与跨柜价差洞察。
const gradeLadder = computed(() => result.value?.gradeLadder ?? null)

// 同期排名：候选项携带的 rank 是同期窗口内全部结算单里的名次。
const optionByMerchant = computed(() => {
  const map = new Map()
  options.value.forEach((item) => {
    if (item.merchantNo) map.set(item.merchantNo, item)
  })
  return map
})
const periodRankText = (row) => {
  const rank = optionByMerchant.value.get(row.merchantNo)?.rank?.salesAmount
  if (!rank || options.value.length < 3) return ''
  return `同期金额第 ${rank} / ${options.value.length} 柜`
}

// 行业默认对比：最新一柜 + 同品牌上一柜（老板的口头问法「这柜比上柜怎么样」）。
function applyDefaultPair() {
  if (!options.value.length) return false
  const byDateDesc = [...options.value].sort((a, b) =>
    String(b.saleDateEnd || b.arrivalDate || '').localeCompare(
      String(a.saleDateEnd || a.arrivalDate || ''),
    ),
  )
  const latest = byDateDesc[0]
  const series = latest.series || latest.brand || ''
  const mate = byDateDesc
    .slice(1)
    .find((item) => (item.series || item.brand || '') === series)
  if (!mate) return false
  selected.value = [keyOf(latest), keyOf(mate)]
  return true
}
async function applyQuickPair() {
  if (applyDefaultPair()) {
    await generateComparison()
    return
  }
  showToast({ message: '最新柜的同品牌可配对柜数不足（需至少 2 柜），请手动选择', position: 'top' })
}

const shortName = (row) => row.orderNo || row.series || row.brand || row.merchantNoNormalized || row.merchantNo
const shortDate = (value) => String(value ?? '').slice(0, 10)
const optionMeta = (item) => {
  const start = shortDate(item.saleDateStart)
  const end = shortDate(item.saleDateEnd)
  if (start && end) return `${start} ~ ${end}`
  return item.series || item.fruitType || ''
}
const isOptionDisabled = (item) =>
  !selected.value.length || selected.value.includes(keyOf(item))
    ? false
    : selectedSeries.value !== (item.series || item.brand || '未识别品牌')
const openPicker = () => { showPicker.value = true }
const closePicker = () => { showPicker.value = false }
const removeOption = (item) => {
  selected.value = selected.value.filter((key) => key !== keyOf(item))
}
const extractText = (payload) => {
  if (typeof payload === 'string') return payload
  if (!payload || typeof payload !== 'object') return ''
  const text = payload.content ?? payload.analysis ?? payload.result ?? payload.summary ?? payload.text ?? payload.markdown
  return typeof text === 'string' ? text : text === undefined || text === null ? '' : JSON.stringify(text)
}

const toBlocks = (raw) => {
  const text = String(raw ?? '').trim()
  if (!text) return []
  return text
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split('\n').map((line) => line.trim()).filter(Boolean)
      if (lines.length > 1 && lines.every((line) => /^([-*·•]|\d+[.、)])\s*/.test(line))) {
        return { type: 'list', items: lines.map((line) => line.replace(/^([-*·•]|\d+[.、)])\s*/, '')) }
      }
      return { type: 'para', text: block }
    })
}

const aiBlocks = computed(() => toBlocks(aiText.value))
const gradeAiBlocks = computed(() => toBlocks(gradeAiText.value))

async function loadOptions({ silent = false } = {}) {
  // 下拉刷新走静默模式：保留当前对比结果可见，不闪整屏 loading。
  if (!silent) loading.value = true
  optionsError.value = false
  try {
    options.value = await fetchSettlementOptions()
    if (!options.value.length) {
      showToast({ message: '暂无结算单', position: 'top' })
    } else if (!selected.value.length && applyDefaultPair()) {
      // 默认带上「同品牌最近两柜」并直接出对比，老板打开即见结论；
      // 已有选择（下拉刷新回来）时不覆盖用户的选择。
      await generateComparison()
    }
  } catch (error) {
    optionsError.value = true
    showToast({ message: error?.detail || error?.message || '结算单加载失败', type: 'fail', position: 'top' })
  } finally {
    loading.value = false
  }
}

// ── 下拉刷新 ──
const refreshing = ref(false)
async function onRefresh() {
  try {
    await loadOptions({ silent: true })
  } finally {
    refreshing.value = false
  }
}

async function generateComparison() {
  if (!canCompare.value || busy.value) return
  busy.value = true
  result.value = null
  compareError.value = ''
  aiText.value = ''
  aiError.value = ''
  try {
    result.value = await fetchSeriesComparison(selected.value)
    if (!result.value?.settlements?.length) {
      compareError.value = '暂无可对比数据，请确认所选结算单已生成结算结果。'
      showToast({ message: compareError.value, type: 'fail', position: 'top' })
    }
  } catch (error) {
    compareError.value = error?.detail || error?.message || '对比数据加载失败，请稍后再试。'
    showToast({ message: compareError.value, type: 'fail', position: 'top' })
  } finally {
    busy.value = false
  }
}

async function generateAnalysis() {
  if (!canCompare.value || aiBusy.value) return
  aiBusy.value = true
  aiText.value = ''
  aiError.value = ''
  try {
    aiText.value = extractText(await fetchSeriesAnalysis(selected.value)) || '智能分析已完成，暂无文字结论。'
  } catch (error) {
    const status = error?.status ?? 0
    aiError.value = [422, 502, 503].includes(status)
      ? error?.detail || error?.message || '智能分析服务暂不可用，请确认 AI 分析能力已配置后重试。'
      : status === 401
        ? '登录状态已失效，请重新登录后再试。'
        : error?.detail || error?.message || '智能分析生成失败，请稍后再试。'
  } finally {
    aiBusy.value = false
  }
}

async function generateGradeAnalysis() {
  if (!canCompare.value || gradeAiBusy.value) return
  gradeAiBusy.value = true
  gradeAiText.value = ''
  gradeAiError.value = ''
  try {
    gradeAiText.value = extractText(await fetchGradeDetailAnalysis(selected.value)) || '号别细分小结已完成，暂无文字结论。'
  } catch (error) {
    const status = error?.status ?? 0
    gradeAiError.value = [422, 502, 503].includes(status)
      ? error?.detail || error?.message || '号别细分分析暂不可用，请确认 AI 分析能力已配置后重试。'
      : status === 401
        ? '登录状态已失效，请重新登录后再试。'
        : error?.detail || error?.message || '号别细分分析生成失败，请稍后再试。'
  } finally {
    gradeAiBusy.value = false
  }
}

onMounted(loadOptions)
</script>

<template>
  <div class="page compare-page">
    <van-nav-bar title="销售对比" fixed placeholder safe-area-inset-top />

    <main class="compare-main">
      <van-pull-refresh v-model="refreshing" class="compare-pull" @refresh="onRefresh">
      <header class="page-header compare-header">
        <div class="compare-meta">
          <span class="pill">已选 {{ selected.length }} 张</span>
          <span v-if="options.length" class="muted">共 {{ options.length }} 个结算单</span>
        </div>
      </header>

      <section v-if="loading" class="app-card loading-panel">
        <van-loading color="var(--accent)" size="22px" />
        <p class="muted">正在加载结算单…</p>
      </section>

      <section v-else-if="optionsError" class="app-card state-card">
        <van-empty image="error" description="结算单加载失败" />
        <van-button size="small" round type="primary" @click="loadOptions">重新加载</van-button>
      </section>

      <template v-else>
        <section class="app-card selection-panel">
          <div class="section-title">
            <span>选择结算单</span>
            <span class="title-side">
              <span class="muted">需同一品牌</span>
              <button class="quick-pair-btn" type="button" @click="applyQuickPair">同品牌最近两柜</button>
            </span>
          </div>
          <button class="picker-trigger" type="button" @click="openPicker">
            <span class="picker-trigger-value" :class="{ placeholder: !selected.length }">
              {{ selectedSummary || '请选择至少 2 个结算单' }}
            </span>
            <van-icon name="arrow" class="picker-trigger-arrow" />
          </button>
          <div v-if="selectedOptions.length" class="selected-tags">
            <van-tag
              v-for="item in selectedOptions"
              :key="keyOf(item)"
              closeable
              size="medium"
              plain
              @close="removeOption(item)"
            >
              {{ shortName(item) }}
            </van-tag>
          </div>
          <van-button
            type="primary"
            block
            round
            :loading="busy"
            loading-text="生成中…"
            :disabled="!canCompare"
            @click="generateComparison"
          >
            生成对比
          </van-button>
        </section>

        <section v-if="!canCompare" class="app-card state-card">
          <van-empty image="search" description="请选择至少 2 个结算单" />
          <p class="muted">选择后可对比数量、金额、等级均价与数量结构。</p>
        </section>

        <section v-else-if="!result" class="app-card state-card">
          <van-empty image="default" description="已选好结算单" />
          <p class="muted">已选择 {{ selected.length }} 张，点击「生成对比」查看汇总、等级均价与结构占比。</p>
        </section>

        <template v-else>
          <section class="app-card">
            <div class="section-title">
              <span>汇总对比</span>
              <span class="muted">共 {{ rows.length }} 项</span>
            </div>
            <div class="summary-overview">
              <div class="summary-total">
                <span class="metric-label">销售总额</span>
                <strong class="summary-total-value mono">{{ money(resultTotalAmount) }}</strong>
              </div>
            </div>
            <div class="summary-list">
              <article v-for="(item, index) in rows" :key="keyOf(item)" class="settlement-card">
                <div class="settlement-name">
                  <span class="row-dot" :style="{ backgroundColor: color(index) }"></span>
                  <span>{{ shortName(item) }}</span>
                  <span v-if="index === bestAmountIndex" class="best-mark">金额最高</span>
                  <span v-else-if="index === bestAvgPriceIndex" class="best-mark">均价最高</span>
                  <span v-if="periodRankText(item)" class="period-rank mono">{{ periodRankText(item) }}</span>
                </div>
                <div class="summary-stats">
                  <div class="summary-stat">
                    <span class="metric-label">数量</span>
                    <span class="summary-value mono">{{ number(item.totalQuantity) }}</span>
                  </div>
                  <div class="summary-stat">
                    <span class="metric-label">金额</span>
                    <span class="summary-value mono" :class="{ lead: index === bestAmountIndex }">{{ money(item.salesAmount) }}</span>
                  </div>
                  <div class="summary-stat">
                    <span class="metric-label">平均售价</span>
                    <span class="summary-value mono" :class="{ lead: index === bestAvgPriceIndex }">{{ priceText(item.averagePrice) }}</span>
                  </div>
                </div>
              </article>
            </div>
          </section>

          <section class="app-card">
            <div class="section-title">
              <span>等级均价对比</span>
              <span class="muted">元/件 · <i class="best-legend"></i> 为该等级最高</span>
            </div>
            <div v-if="grades.length" class="scroll-box">
              <div class="grade-price-table">
                <div class="grade-price-row grade-price-head">
                  <span class="grade-price-name">结算单</span>
                  <span v-for="grade in grades" :key="grade" class="grade-price-cell">{{ gradeLabel(grade) }}</span>
                </div>
                <div v-for="(item, index) in rows" :key="keyOf(item)" class="grade-price-row">
                  <span class="grade-price-name">
                    <span class="row-dot" :style="{ backgroundColor: color(index) }"></span>{{ shortName(item) }}
                  </span>
                  <span
                    v-for="grade in grades"
                    :key="grade"
                    class="grade-price-cell mono"
                    :class="{ best: isBestPrice(grade, index) }"
                  >{{ priceText(avg(item, grade, index)) }}</span>
                </div>
              </div>
            </div>
            <p v-else class="muted">暂无等级均价数据。</p>
          </section>

          <section class="app-card">
            <div class="section-title">
              <span>等级结构占比</span>
              <span class="share-mode-toggle">
                <button class="mode-chip" :class="{ active: shareMode === 'qty' }" type="button" @click="shareMode = 'qty'">数量</button>
                <button class="mode-chip" :class="{ active: shareMode === 'amount' }" type="button" @click="shareMode = 'amount'">金额</button>
              </span>
            </div>
            <div v-if="hasShare" class="share-list">
              <article v-for="(item, index) in rows" :key="keyOf(item)" class="share-card">
                <div class="share-head">
                  <span class="share-name">
                    <span class="row-dot" :style="{ backgroundColor: color(index) }"></span>{{ shortName(item) }}
                  </span>
                  <span class="share-total mono">
                    {{ shareMode === 'amount' ? money(item.salesAmount) : `${number(item.totalQuantity)} 件` }}
                  </span>
                </div>
                <div class="progress-track share-track">
                  <div
                    v-for="segment in segments(item, index)"
                    :key="segment.grade"
                    class="progress-fill share-segment"
                    :style="{ width: `${Math.max(0, Math.min(100, segment.share * 100))}%`, backgroundColor: gradeColor(segment.grade) }"
                  ></div>
                </div>
                <div class="share-meta">
                  <div v-for="segment in segments(item, index)" :key="segment.grade" class="share-meta-row">
                    <span class="share-grade">
                      <span class="grade-dot" :style="{ backgroundColor: gradeColor(segment.grade) }"></span>{{ gradeLabel(segment.grade) }}
                      <span v-if="dominantSegment(item, index)?.grade === segment.grade" class="dominant-mark">主力</span>
                    </span>
                    <span class="share-percent mono" :class="{ lead: dominantSegment(item, index)?.grade === segment.grade }">{{ percent(segment.share) }}</span>
                  </div>
                </div>
              </article>
            </div>
            <p v-else class="muted">暂无等级数量结构数据。</p>
          </section>

          <section class="app-card intelligence-panel">
            <div class="section-title">
              <span>智能分析</span>
              <span class="muted">可选</span>
            </div>
            <van-button
              size="small"
              round
              type="primary"
              plain
              :loading="aiBusy"
              loading-text="分析中…"
              :disabled="aiBusy"
              @click="generateAnalysis"
            >
              生成智能分析
            </van-button>
            <div v-if="aiBusy" class="analysis-loading">
              <van-loading color="var(--accent)" size="18px" />
              <span class="muted">正在生成对比结论…</span>
            </div>
            <div v-else-if="aiError" class="analysis-error">
              <span>智能分析暂不可用</span>
              <p>{{ aiError }}</p>
            </div>
            <div v-else-if="aiBlocks.length" class="analysis-content">
              <template v-for="(block, blockIndex) in aiBlocks" :key="blockIndex">
                <p v-if="block.type === 'para'" class="analysis-para">{{ block.text }}</p>
                <ul v-else class="analysis-list">
                  <li v-for="(line, lineIndex) in block.items" :key="lineIndex">{{ line }}</li>
                </ul>
              </template>
            </div>
            <p v-else class="muted analysis-hint">可生成对比结论；若服务未配置，会给出友好提示。</p>
          </section>

          <section
            v-if="gradeLadder && (gradeLadder.buckets.length || gradeLadder.crossGaps.length)"
            class="app-card ladder-panel"
          >
            <div class="section-title">
              <span>号别价格阶梯</span>
              <span class="muted">元/件 · 按均价从高到低</span>
            </div>

            <div v-if="gradeLadder.buckets.length" class="ladder-list">
              <div
                v-for="(row, ladderIndex) in gradeLadder.buckets"
                :key="`${row.fruitType}-${row.grade}-${row.label}`"
                class="ladder-row"
              >
                <div class="ladder-main">
                  <span class="ladder-label">
                    <i class="grade-dot" :style="{ backgroundColor: gradeColor(row.grade) }"></i>
                    <b class="mono">{{ row.label }}</b>
                    <span class="ladder-grade">{{ gradeLabel(row.grade) }}</span>
                    <span v-for="mark in row.qualityMarks" :key="mark" class="quality-mark">{{ mark }}</span>
                  </span>
                  <span class="ladder-price mono" :class="{ top: ladderIndex === 0 }">{{ priceText(row.weightedAvgPrice) }}</span>
                </div>
                <div class="ladder-sub">
                  <div class="progress-track ladder-track">
                    <div
                      class="progress-fill"
                      :style="{
                        width: `${Math.max(0, Math.min(100, (row.quantityShare ?? 0) * 100))}%`,
                        backgroundColor: gradeColor(row.grade),
                      }"
                    ></div>
                  </div>
                  <span class="ladder-qty mono">{{ number(row.salesQuantity) }} 件 · {{ percent(row.quantityShare) }}</span>
                </div>
              </div>
            </div>
            <p v-else class="muted">暂无号别数据：所选结算单的等级写法未能解析出号别。</p>
            <p v-if="gradeLadder.unrecognizedQuantity" class="muted ladder-note">
              另有 {{ number(gradeLadder.unrecognizedQuantity) }} 件未识别等级写法，未计入阶梯。
            </p>

            <div v-if="gradeLadder.crossGaps.length" class="ladder-gaps">
              <div class="section-subtitle">
                <span>同号别跨柜价差</span>
                <span class="muted">同样的号别，哪张单卖得贵</span>
              </div>
              <div
                v-for="gap in gradeLadder.crossGaps.slice(0, 5)"
                :key="`${gap.label}-${gap.topMerchant}-${gap.bottomMerchant}`"
                class="gap-row"
              >
                <div class="gap-head">
                  <span class="gap-label mono">{{ gap.label }}</span>
                  <span class="gap-diff mono">差 {{ price(gap.diff) }}</span>
                </div>
                <div class="gap-body">
                  <span class="gap-side top"><i>高</i>{{ gap.topMerchant }} {{ priceText(gap.topPrice) }} · {{ number(gap.topQuantity) }} 件</span>
                  <span class="gap-side"><i>低</i>{{ gap.bottomMerchant }} {{ priceText(gap.bottomPrice) }} · {{ number(gap.bottomQuantity) }} 件</span>
                </div>
              </div>
            </div>

            <div class="ladder-ai">
              <div class="section-subtitle">
                <span>AI 解读</span>
                <span class="muted">可选</span>
              </div>
              <van-button
                size="small"
                round
                type="primary"
                plain
                :loading="gradeAiBusy"
                loading-text="分析中…"
                :disabled="gradeAiBusy"
                @click="generateGradeAnalysis"
              >
                生成号别解读
              </van-button>
              <div v-if="gradeAiBusy" class="analysis-loading">
                <van-loading color="var(--accent)" size="18px" />
                <span class="muted">正在按号别拆解价格与品质…</span>
              </div>
              <div v-else-if="gradeAiError" class="analysis-error">
                <span>号别解读暂不可用</span>
                <p>{{ gradeAiError }}</p>
              </div>
              <div v-else-if="gradeAiBlocks.length" class="analysis-content">
                <template v-for="(block, blockIndex) in gradeAiBlocks" :key="blockIndex">
                  <p v-if="block.type === 'para'" class="analysis-para">{{ block.text }}</p>
                  <ul v-else class="analysis-list">
                    <li v-for="(line, lineIndex) in block.items" :key="lineIndex">{{ line }}</li>
                  </ul>
                </template>
              </div>
              <p v-else class="muted analysis-hint">基于上方号别阶梯生成解读，含品质标记（熟/裂/黄皮）对价格的影响。</p>
            </div>
          </section>
        </template>

        <van-popup
          v-model:show="showPicker"
          position="bottom"
          round
          safe-area-inset-bottom
          class="compare-picker"
        >
          <div class="picker-head">
            <span class="picker-title">选择结算单</span>
            <span class="muted">已选 {{ selected.length }} 张</span>
          </div>
          <van-search
            v-model="searchText"
            placeholder="搜索单号 / 品牌 / 柜号 / 车牌"
            clearable
          />
          <div class="picker-body">
            <van-checkbox-group v-model="selected" class="options">
              <template v-for="group in filteredGroups" :key="group.name">
                <div class="picker-group-title">
                  {{ group.name }}
                  <span class="muted">{{ group.items.length }} 单</span>
                </div>
                <van-checkbox
                  v-for="item in group.items"
                  :key="keyOf(item)"
                  :name="keyOf(item)"
                  shape="square"
                  :disabled="isOptionDisabled(item)"
                  class="option"
                >
                  <div class="option-content">
                    <div class="option-main">
                      <span class="option-order">{{ item.orderNo || item.series || item.brand }}</span>
                      <span class="muted option-meta">{{ optionMeta(item) }}</span>
                    </div>
                    <span class="option-amount mono">{{ money(item.salesAmount) }}</span>
                  </div>
                </van-checkbox>
              </template>
            </van-checkbox-group>
            <van-empty
              v-if="!filteredGroups.length"
              image="search"
              description="没有匹配的结算单"
            />
          </div>
          <div class="picker-footer">
            <van-button block round type="primary" @click="closePicker">完成</van-button>
          </div>
        </van-popup>
      </template>
      </van-pull-refresh>
    </main>
  </div>
</template>

<style scoped>
.compare-page { min-height: 100vh; overflow-x: hidden; }
.compare-pull { min-height: 70vh; }
.compare-main { display: flex; flex-direction: column; }
.compare-main .app-card { margin-bottom: 16px; }
.compare-header { margin: 4px 2px 12px; }
.compare-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 14px; }
.loading-panel { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; min-height: 180px; text-align: center; }
.selection-panel { padding: 16px; }
.picker-trigger { display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; min-height: 48px; padding: 0 14px; color: var(--text); background: var(--panel-soft); border: 0; border-radius: 10px; text-align: left; }
.picker-trigger-value { flex: 1; min-width: 0; overflow: hidden; font-size: 13px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.picker-trigger-value.placeholder { color: var(--text-3); font-weight: 400; }
.picker-trigger-arrow { flex-shrink: 0; color: var(--text-3); font-size: 16px; }
.selected-tags { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0 0; }
.selection-panel .van-button { margin-top: 14px; }
.compare-picker { max-height: 78vh; display: flex; flex-direction: column; }
.picker-head { display: flex; align-items: center; justify-content: space-between; padding: 16px 16px 2px; }
.picker-title { color: var(--text); font-size: 16px; font-weight: 700; }
.picker-body { flex: 1; min-height: 0; padding: 0 16px 8px; overflow-y: auto; }
.picker-group-title { display: flex; align-items: center; justify-content: space-between; padding: 14px 2px 8px; color: var(--text); font-size: 13px; font-weight: 700; }
.picker-footer { flex-shrink: 0; padding: 10px 16px calc(10px + env(safe-area-inset-bottom)); }
.picker-footer .van-button { margin: 0; }
.options { display: flex; flex-direction: column; gap: 10px; margin: 4px 0 16px; }
.option { width: 100%; padding: 0; overflow: hidden; background: var(--panel-soft); border: 1px solid var(--line); border-radius: 10px; }
.option.van-checkbox--checked { background: rgba(22, 121, 79, 0.06); border-color: rgba(22, 121, 79, 0.35); }
.option :deep(.van-checkbox__icon) { align-self: center; margin-left: 14px; }
.option :deep(.van-checkbox__label) { flex: 1; min-width: 0; margin-left: 10px; }
.option-content { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 12px; min-height: 52px; padding: 0 14px; min-width: 0; }
.option-main { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.option-order { overflow: hidden; color: var(--text); font-size: 13px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
.option-meta { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.option-amount { color: var(--text-2); font-size: 13px; font-weight: 700; text-align: right; white-space: nowrap; }
.summary-overview { margin-bottom: 16px; }
.summary-total { display: flex; flex-direction: column; gap: 6px; }
.summary-total-value { color: var(--text); font-size: 24px; font-weight: 800; letter-spacing: -0.01em; }
.summary-list { display: flex; flex-direction: column; gap: 12px; }
.settlement-card { padding: 14px; background: var(--panel-soft); border-radius: 12px; }
.settlement-name { display: flex; align-items: center; gap: 6px; min-width: 0; margin-bottom: 12px; overflow: hidden; color: var(--text); font-size: 13px; font-weight: 700; white-space: nowrap; }
.settlement-name span:nth-child(2) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.best-mark {
  flex: none;
  margin-left: 4px;
  padding: 1px 6px;
  color: var(--accent);
  background: rgba(22, 121, 79, 0.09);
  border-radius: 5px;
  font-size: 10px;
  font-weight: 700;
}
.summary-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.share-mode-toggle { display: inline-flex; gap: 4px; }
.mode-chip {
  padding: 2px 10px;
  color: var(--text-3);
  background: var(--bg-soft);
  border: 0;
  border-radius: 999px;
  font-size: 11px;
  white-space: nowrap;
}
.mode-chip.active { color: #ffffff; background: var(--accent); font-weight: 600; }
.summary-stat { min-width: 0; }
.summary-stat .metric-label { margin-bottom: 6px; font-size: 11px; }
.summary-value { display: block; overflow: hidden; color: var(--text-2); font-size: 16px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; font-variant-numeric: tabular-nums; }
.summary-value.lead { color: var(--accent); font-weight: 800; }
.row-dot { flex-shrink: 0; width: 8px; height: 8px; border-radius: 50%; }
.scroll-box { overflow-x: auto; padding-bottom: 4px; scrollbar-width: none; }
.scroll-box::-webkit-scrollbar { display: none; }
.grade-price-table { width: max-content; min-width: 100%; overflow: hidden; background: var(--panel-soft); border-radius: 10px; }
.grade-price-row { display: flex; min-height: 50px; background: var(--panel); }
.grade-price-row + .grade-price-row { border-top: 1px solid var(--line); }
.grade-price-head { min-height: 38px; color: var(--text-3); background: var(--panel-soft); font-size: 12px; font-weight: 600; }
.grade-price-name { display: flex; align-items: center; gap: 6px; flex: 0 0 124px; min-width: 0; padding: 0 12px; color: var(--text-2); font-size: 12px; white-space: nowrap; }
.grade-price-cell { display: flex; align-items: center; justify-content: flex-end; flex: 0 0 72px; padding: 0 12px; color: var(--text-2); font-size: 13px; font-weight: 500; white-space: nowrap; }
.grade-price-cell.best { color: var(--accent); font-weight: 800; }
.grade-price-head .grade-price-cell { justify-content: center; color: var(--text-3); font-weight: 600; }
.best-legend { display: inline-block; width: 10px; height: 3px; margin: 0 2px -1px 2px; background: var(--accent); border-radius: 2px; vertical-align: middle; }
.share-list { display: flex; flex-direction: column; gap: 12px; }
.share-card { padding: 14px; background: var(--panel-soft); border-radius: 12px; }
.share-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.share-name { display: flex; align-items: center; gap: 6px; min-width: 0; overflow: hidden; color: var(--text); font-size: 13px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
.share-total { color: var(--text-2); font-size: 12px; white-space: nowrap; }
.share-track { display: flex; height: 14px; overflow: hidden; }
.share-segment { min-width: 4px; height: 100%; }
.share-meta { display: flex; flex-direction: column; gap: 10px; margin-top: 12px; }
.share-meta-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.share-grade { display: inline-flex; align-items: center; gap: 6px; min-width: 0; color: var(--text-2); font-size: 11px; }
.dominant-mark { padding: 0 5px; color: var(--accent); background: rgba(22, 121, 79, 0.09); border-radius: 4px; font-size: 10px; font-weight: 700; }
.share-percent { color: var(--text-2); font-size: 11px; font-weight: 500; font-variant-numeric: tabular-nums; }
.share-percent.lead { color: var(--text); font-weight: 800; }
.intelligence-panel .van-button { align-self: flex-start; }
.title-side { display: inline-flex; align-items: center; gap: 8px; }
.quick-pair-btn {
  padding: 3px 10px;
  color: var(--accent);
  background: rgba(22, 121, 79, 0.09);
  border: 0;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}
.period-rank {
  flex: none;
  margin-left: auto;
  padding: 1px 6px;
  color: var(--text-3);
  background: var(--bg-soft);
  border-radius: 5px;
  font-size: 10px;
  font-weight: 500;
  white-space: nowrap;
}
.ladder-panel { display: flex; flex-direction: column; }
.ladder-row { padding: 10px 0; border-bottom: 1px dashed var(--line); }
.ladder-row:last-of-type { border-bottom: 0; padding-bottom: 4px; }
.ladder-main { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.ladder-label { display: inline-flex; align-items: center; gap: 6px; min-width: 0; overflow: hidden; }
.ladder-label b { color: var(--text); font-size: 14px; font-weight: 800; }
.ladder-grade { flex: none; color: var(--text-3); font-size: 11px; white-space: nowrap; }
.quality-mark {
  flex: none;
  padding: 0 5px;
  color: #a1622f;
  background: rgba(224, 168, 60, 0.14);
  border-radius: 4px;
  font-size: 10px;
  font-weight: 600;
  white-space: nowrap;
}
.ladder-price { flex: none; color: var(--text); font-size: 15px; font-weight: 700; white-space: nowrap; }
.ladder-price.top { color: var(--accent); font-weight: 800; }
.ladder-sub { display: flex; align-items: center; gap: 10px; margin-top: 8px; }
.ladder-track { flex: 1; height: 6px; }
.ladder-qty { flex: none; color: var(--text-3); font-size: 11px; white-space: nowrap; }
.ladder-note { margin: 8px 0 0; font-size: 11px; }
.ladder-gaps { margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--line); }
.section-subtitle { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; color: var(--text); font-size: 13px; font-weight: 700; }
.section-subtitle .muted { font-size: 11px; font-weight: 400; }
.gap-row { margin-top: 10px; padding: 10px 12px; background: var(--panel-soft); border-radius: 10px; }
.gap-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.gap-label { color: var(--text); font-size: 13px; font-weight: 800; }
.gap-diff { color: var(--danger); font-size: 12px; font-weight: 700; white-space: nowrap; }
.gap-body { display: flex; flex-direction: column; gap: 4px; margin-top: 8px; }
.gap-side { display: flex; align-items: center; gap: 6px; color: var(--text-2); font-size: 11px; }
.gap-side i {
  flex: none;
  padding: 0 4px;
  color: var(--text-3);
  background: var(--bg-soft);
  border-radius: 3px;
  font-size: 10px;
  font-style: normal;
}
.gap-side.top i { color: var(--accent); background: rgba(22, 121, 79, 0.09); }
.ladder-ai { display: flex; flex-direction: column; margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--line); }
.ladder-ai .van-button { align-self: flex-start; }
.analysis-loading { display: flex; align-items: center; gap: 10px; min-height: 52px; margin-top: 14px; color: var(--text-2); }
.analysis-error { margin-top: 14px; padding: 12px 14px; color: var(--text-2); background: rgba(255, 97, 120, 0.08); border: 1px solid rgba(255, 97, 120, 0.22); border-radius: 10px; }
.analysis-error span { display: block; margin-bottom: 6px; color: var(--danger); font-size: 13px; font-weight: 700; }
.analysis-error p { margin: 0; font-size: 12px; line-height: 1.7; }
.analysis-content { margin-top: 14px; display: flex; flex-direction: column; gap: 12px; }
.analysis-para { margin: 0; color: var(--text-2); font-size: 13px; line-height: 1.75; white-space: pre-wrap; }
.analysis-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 7px; }
.analysis-list li { position: relative; padding-left: 14px; color: var(--text-2); font-size: 13px; line-height: 1.7; }
.analysis-list li::before { content: ''; position: absolute; left: 2px; top: 9px; width: 5px; height: 5px; background: var(--accent); border-radius: 50%; }
.analysis-hint { margin: 14px 0 0; line-height: 1.7; }
</style>
