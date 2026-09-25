<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { showToast } from 'vant'
import { fetchSettlementOptions, fetchSeriesComparison, fetchSeriesAnalysis } from '../api/data'
import { money, number, price, percent, gradeLabel, gradeColor } from '../utils/format'

const GRADE_ORDER = ['A', 'B', 'AB', 'C', 'D', 'E', 'F', 'OTHER']
const ROW_COLORS = ['#2f8f5b', '#d9942f', '#6fae62']

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
const showPicker = ref(false)
const searchText = ref('')

const canCompare = computed(() => selected.value.length >= 2 && selected.value.length <= 3)
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
const maxPrice = computed(() => Math.max(1, ...rows.value.flatMap((row, index) =>
  grades.value.map((grade) => avg(row, grade, index)).filter((value) => value !== null),
)))
const barHeight = (value) => (value === null ? 0 : Math.max(2, (value / maxPrice.value) * 100))
const priceText = (value) => (value === null ? '—' : price(value))
const color = (index) => ROW_COLORS[index % ROW_COLORS.length]

const segments = (row, index) => {
  const map = row.gradeQuantities || {}
  const items = grades.value.map((grade) => {
    if (map[grade] !== undefined && map[grade] !== null) return { grade, qty: num(map[grade]) }
    const info = detail(row, grade, index)
    return { grade, qty: info?.qty || 0, share: info?.share ?? null }
  }).filter((item) => item.qty > 0)
  const total = items.reduce((sum, item) => sum + item.qty, 0) || 1
  return items.map((item) => ({ grade: item.grade, share: item.share ?? item.qty / total }))
}
const hasShare = computed(() => rows.value.some((row, index) => segments(row, index).length > 0))

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

async function loadOptions() {
  loading.value = true
  optionsError.value = false
  try {
    options.value = await fetchSettlementOptions()
    if (!options.value.length) showToast({ message: '暂无结算单', position: 'top' })
  } catch (error) {
    optionsError.value = true
    showToast({ message: error?.detail || error?.message || '结算单加载失败', type: 'fail', position: 'top' })
  } finally {
    loading.value = false
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

onMounted(loadOptions)
</script>

<template>
  <div class="page compare-page">
    <van-nav-bar title="品牌对比" fixed placeholder safe-area-inset-top />

    <main class="compare-main">
      <header class="page-header compare-header">
        <div class="page-meta compare-meta">
          <span class="pill">已选 {{ selected.length }} / 3</span>
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
            <span class="muted">最多 3 项 · 需同一品牌</span>
          </div>
          <button class="picker-trigger" type="button" @click="openPicker">
            <span class="picker-trigger-value" :class="{ placeholder: !selected.length }">
              {{ selectedSummary || '请选择 2–3 个结算单' }}
            </span>
            <van-icon name="arrow" class="picker-trigger-arrow" />
          </button>
          <div v-if="selectedOptions.length" class="selected-tags">
            <van-tag
              v-for="item in selectedOptions"
              :key="keyOf(item)"
              closeable
              size="medium"
              round
              type="primary"
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
          <van-empty image="search" description="请选择 2 至 3 个结算单" />
          <p class="muted">选择后可对比数量、金额、等级均价与数量结构。</p>
        </section>

        <section v-else-if="!result" class="app-card state-card">
          <van-empty image="chart" description="数据已就绪" />
          <p class="muted">已选择 {{ selected.length }} 个结算单，点击“生成对比”获取结果。</p>
        </section>

        <template v-else>
          <section class="app-card summary-panel">
            <div class="section-title">
              <span>汇总对比</span>
              <span class="muted">共 {{ rows.length }} 项</span>
            </div>
            <div class="metric-grid summary-overview">
              <div class="metric-card">
                <span class="metric-label">对比项</span>
                <span class="metric-value">{{ rows.length }}</span>
              </div>
              <div class="metric-card">
                <span class="metric-label">销售总额</span>
                <span class="metric-value accent">{{ money(rows.reduce((sum, item) => sum + num(item.salesAmount), 0)) }}</span>
              </div>
            </div>
            <div class="summary-list">
              <article v-for="(item, index) in rows" :key="keyOf(item)" class="settlement-card">
                <div class="settlement-name">
                  <span class="row-dot" :style="{ backgroundColor: color(index) }"></span>
                  <span>{{ shortName(item) }}</span>
                </div>
                <div class="summary-stats">
                  <div class="summary-stat">
                    <span class="metric-label">数量</span>
                    <span class="metric-value">{{ number(item.totalQuantity) }}</span>
                  </div>
                  <div class="summary-stat">
                    <span class="metric-label">金额</span>
                    <span class="metric-value money">{{ money(item.salesAmount) }}</span>
                  </div>
                  <div class="summary-stat">
                    <span class="metric-label">平均售价</span>
                    <span class="metric-value">{{ priceText(item.averagePrice) }}</span>
                  </div>
                </div>
              </article>
            </div>
          </section>

          <section class="app-card grade-panel">
            <div class="section-title">
              <span>等级均价对比</span>
              <span class="muted">元/斤</span>
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
                  >{{ priceText(avg(item, grade, index)) }}</span>
                </div>
              </div>
            </div>
            <p v-else class="muted">暂无等级均价数据。</p>
          </section>

          <section class="app-card share-panel">
            <div class="section-title">
              <span>等级数量占比</span>
              <span class="muted">按数量计算</span>
            </div>
            <div v-if="hasShare" class="share-list">
              <article v-for="(item, index) in rows" :key="keyOf(item)" class="share-card">
                <div class="share-head">
                  <span class="share-name">
                    <span class="row-dot" :style="{ backgroundColor: color(index) }"></span>{{ shortName(item) }}
                  </span>
                  <span class="share-total mono">{{ number(item.totalQuantity) }} 件</span>
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
                    </span>
                    <span class="share-percent mono">{{ percent(segment.share) }}</span>
                  </div>
                </div>
              </article>
            </div>
            <p v-else class="muted">暂无等级数量结构数据。</p>
          </section>

          <section class="app-card intelligence-panel">
            <div class="section-title">
              <span>智能分析</span>
              <span class="pill">可选</span>
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
            <div v-else-if="aiText" class="analysis-content">{{ aiText }}</div>
            <p v-else class="muted analysis-hint">可生成对比结论；若服务未配置，会给出友好提示。</p>
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
            <span class="muted">已选 {{ selected.length }} / 3</span>
          </div>
          <van-search
            v-model="searchText"
            placeholder="搜索单号 / 品牌 / 柜号 / 车牌"
            clearable
          />
          <div class="picker-body">
            <van-checkbox-group v-model="selected" :max="3" class="options">
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
    </main>
  </div>
</template>

<style scoped>
.compare-page { min-height: 100vh; overflow-x: hidden; }
.compare-nav { position: sticky; top: 0; z-index: 20; }
.compare-main { display: flex; flex-direction: column; }
.compare-header { margin: 4px 2px 12px; }
.compare-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 14px; }
.loading-panel { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; min-height: 180px; text-align: center; }
.selection-panel { padding: 16px; }
.picker-trigger { display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; min-height: 48px; padding: 0 14px; color: var(--text); background: var(--panel-soft); border: 1px solid var(--line); border-radius: 12px; text-align: left; }
.picker-trigger-value { flex: 1; min-width: 0; overflow: hidden; font-size: 13px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.picker-trigger-value.placeholder { color: var(--text-3); font-weight: 400; }
.picker-trigger-arrow { flex-shrink: 0; color: var(--text-3); font-size: 16px; }
.selected-tags { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0 0; }
.compare-picker { max-height: 78vh; display: flex; flex-direction: column; }
.picker-head { display: flex; align-items: center; justify-content: space-between; padding: 16px 16px 2px; }
.picker-title { color: var(--text); font-size: 16px; font-weight: 700; }
.picker-body { flex: 1; min-height: 0; padding: 0 16px 8px; overflow-y: auto; }
.picker-group-title { display: flex; align-items: center; justify-content: space-between; padding: 14px 2px 8px; color: var(--text); font-size: 13px; font-weight: 700; }
.picker-footer { flex-shrink: 0; padding: 10px 16px calc(10px + env(safe-area-inset-bottom)); }
.picker-footer .van-button { margin: 0; }
.options { display: flex; flex-direction: column; gap: 10px; margin: 4px 0 16px; }
.option { width: 100%; padding: 0; overflow: hidden; background: var(--panel-soft); border: 1px solid var(--line); border-radius: 12px; }
.option.van-checkbox--checked { background: rgba(47, 143, 91, 0.06); border-color: rgba(47, 143, 91, 0.35); }
.option :deep(.van-checkbox__icon) { align-self: center; margin-left: 14px; }
.option :deep(.van-checkbox__label) { flex: 1; min-width: 0; margin-left: 10px; }
.option-content { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 12px; min-height: 52px; padding: 0 14px; min-width: 0; }
.option-main { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.option-order { overflow: hidden; color: var(--text); font-size: 13px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
.option-meta { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.option-amount { color: var(--accent-2); font-size: 13px; font-weight: 700; text-align: right; white-space: nowrap; }
.summary-panel, .grade-panel, .share-panel, .intelligence-panel { padding: 16px; }
.summary-overview { margin-bottom: 14px; }
.summary-list { display: flex; flex-direction: column; gap: 12px; }
.settlement-card { padding: 14px; background: var(--panel-soft); border: 1px solid var(--line); border-radius: 12px; }
.settlement-name { display: flex; align-items: center; gap: 6px; min-width: 0; margin-bottom: 12px; overflow: hidden; color: var(--text); font-size: 13px; font-weight: 700; white-space: nowrap; }
.settlement-name span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.summary-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.summary-stat { min-width: 0; }
.summary-stat .metric-label { margin-bottom: 6px; font-size: 11px; }
.summary-stat .metric-value { font-size: 17px; }
.money { color: var(--accent-2); }
.row-dot { flex-shrink: 0; width: 8px; height: 8px; border-radius: 50%; }
.scroll-box { overflow-x: auto; padding-bottom: 4px; scrollbar-width: none; }
.scroll-box::-webkit-scrollbar { display: none; }
.grade-price-table { width: max-content; min-width: 100%; overflow: hidden; border: 1px solid var(--line); border-radius: 12px; }
.grade-price-row { display: flex; min-height: 44px; background: var(--panel-soft); }
.grade-price-row + .grade-price-row { border-top: 1px solid var(--line); }
.grade-price-head { min-height: 34px; color: var(--text-3); background: #f0f5ef; font-size: 12px; font-weight: 600; }
.grade-price-name { display: flex; align-items: center; gap: 6px; flex: 0 0 124px; min-width: 0; padding: 0 12px; color: var(--text-2); font-size: 12px; white-space: nowrap; }
.grade-price-cell { display: flex; align-items: center; justify-content: flex-end; flex: 0 0 72px; padding: 0 12px; color: var(--text); font-size: 13px; font-weight: 700; white-space: nowrap; }
.grade-price-head .grade-price-cell { justify-content: center; color: var(--text-3); font-weight: 600; }
.share-list { display: flex; flex-direction: column; gap: 12px; }
.share-card { padding: 13px; background: var(--panel-soft); border: 1px solid var(--line); border-radius: 12px; }
.share-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
.share-name { display: flex; align-items: center; gap: 6px; min-width: 0; overflow: hidden; color: var(--text); font-size: 13px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
.share-total { color: var(--text-2); font-size: 12px; white-space: nowrap; }
.share-track { display: flex; height: 12px; overflow: hidden; }
.share-segment { min-width: 4px; height: 100%; }
.share-meta { display: flex; flex-direction: column; gap: 8px; margin-top: 11px; }
.share-meta-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.share-grade { display: inline-flex; align-items: center; gap: 6px; min-width: 0; color: var(--text-2); font-size: 11px; }
.share-percent { color: var(--text); font-size: 11px; font-weight: 700; }
.intelligence-panel .van-button { align-self: flex-start; }
.analysis-loading { display: flex; align-items: center; gap: 10px; min-height: 52px; margin-top: 14px; color: var(--text-2); }
.analysis-error { margin-top: 14px; padding: 12px 14px; color: var(--text-2); background: rgba(255, 97, 120, 0.08); border: 1px solid rgba(255, 97, 120, 0.22); border-radius: 12px; }
.analysis-error span { display: block; margin-bottom: 6px; color: var(--danger); font-size: 13px; font-weight: 700; }
.analysis-error p { margin: 0; font-size: 12px; line-height: 1.7; }
.analysis-content { margin-top: 14px; padding: 14px; background: var(--panel-soft); border: 1px solid var(--line); border-radius: 12px; color: var(--text-2); font-size: 13px; line-height: 1.7; white-space: pre-wrap; }
.analysis-hint { margin: 14px 0 0; line-height: 1.7; }
</style>
