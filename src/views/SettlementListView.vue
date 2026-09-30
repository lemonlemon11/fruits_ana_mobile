<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { fetchSettlements } from '../api/data'
import { compactMoney, gradeColor, gradeLabel, money, number, price } from '../utils/format'

const router = useRouter()

const keyword = ref('')
const brand = ref('')
const sortBy = ref('arrival_date')
const sortOrder = ref('desc')
const settlements = ref([])
const brandTotals = ref([])
const loading = ref(true)
const error = ref('')
const showSort = ref(false)

// ── 分页：van-list 滚动加载，搜索/排序/品牌切换重置回第 1 页 ──
const PAGE_SIZE = 30
const page = ref(1)
const pagination = ref(null)
const dateRange = ref(null)
const listLoading = ref(false)
const finished = computed(() => {
  if (!pagination.value) return true
  return page.value >= (pagination.value.pages || 1)
})

const rangeText = computed(() => {
  const range = dateRange.value
  if (!range) return ''
  const start = String(range.start_date ?? '').slice(5)
  const end = String(range.end_date ?? '').slice(5)
  if (!start && !end) return ''
  const text = `数据 ${start} ~ ${end}`
  return range.is_default ? `${text} · 默认最近一月` : text
})

const sortOptions = [
  { label: '到货日期', value: 'arrival_date' },
  { label: '销售金额', value: 'sales_amount' },
  { label: '销售数量', value: 'total_quantity' },
  { label: 'A果数量', value: 'grade_a' },
  { label: 'B果数量', value: 'grade_b' },
  { label: '平均售价', value: 'average_price' },
  { label: '确认时间', value: 'confirmed_at' },
]
const activeSortLabel = computed(() => {
  const current = sortOptions.find((option) => option.value === sortBy.value)
  return `${current?.label || '日期'} ${sortOrder.value === 'desc' ? '降序' : '升序'}`
})

// ── 日期快捷筛选：不传日期时后端默认最近一月 ──
const datePresets = [
  { label: '近一月', value: 'default' },
  { label: '本月', value: 'this_month' },
  { label: '上月', value: 'last_month' },
  { label: '近三月', value: 'last_3m' },
  { label: '近一年', value: 'last_1y' },
]
const datePreset = ref('default')

function presetRange(value) {
  const pad = (part) => String(part).padStart(2, '0')
  const fmt = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  const today = new Date()
  if (value === 'this_month') {
    return { startDate: fmt(new Date(today.getFullYear(), today.getMonth(), 1)), endDate: fmt(today) }
  }
  if (value === 'last_month') {
    return {
      startDate: fmt(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
      endDate: fmt(new Date(today.getFullYear(), today.getMonth(), 0)),
    }
  }
  if (value === 'last_3m') {
    const start = new Date(today)
    start.setMonth(start.getMonth() - 3)
    return { startDate: fmt(start), endDate: fmt(today) }
  }
  if (value === 'last_1y') {
    const start = new Date(today)
    start.setFullYear(start.getFullYear() - 1)
    return { startDate: fmt(start), endDate: fmt(today) }
  }
  return { startDate: '', endDate: '' }
}

const activeRange = computed(() => presetRange(datePreset.value))

function selectDatePreset(value) {
  if (datePreset.value === value) return
  datePreset.value = value
  loadSettlements()
}

function queryFilters(nextPage = 1) {
  const range = activeRange.value
  return {
    keyword: keyword.value.trim(),
    brand: brand.value || undefined,
    startDate: range.startDate || undefined,
    endDate: range.endDate || undefined,
    sortBy: sortBy.value,
    sortOrder: sortOrder.value,
    page: nextPage,
    pageSize: PAGE_SIZE,
  }
}

// 请求序号守卫：搜索/排序/品牌/日期切换会重置列表，与在途的翻页请求并发时，
// 只让最新一次请求的结果生效，避免旧筛选的下一页拼接进来。
let requestSeq = 0

async function loadSettlements({ silent = false } = {}) {
  const seq = ++requestSeq
  // 下拉刷新走静默模式：保留当前列表可见，不闪整屏 loading。
  if (!silent) loading.value = true
  error.value = ''

  try {
    const result = await fetchSettlements(queryFilters(1))
    if (seq !== requestSeq) return
    settlements.value = result.settlements ?? []
    pagination.value = result.pagination
    dateRange.value = result.dateRange
    page.value = 1
    if (!brand.value && result.brandTotals?.length) {
      brandTotals.value = result.brandTotals
    }
  } catch (err) {
    if (seq !== requestSeq) return
    error.value = err?.message || '结算单加载失败，请稍后重试'
  } finally {
    if (seq === requestSeq) loading.value = false
  }
}

// ── 下拉刷新 ──
const refreshing = ref(false)
async function onRefresh() {
  try {
    await loadSettlements({ silent: true })
  } finally {
    refreshing.value = false
  }
}

async function loadMore() {
  // 首屏仍在加载或已到末页时不再翻页。
  if (loading.value || finished.value) return
  const seq = requestSeq
  try {
    const next = page.value + 1
    const result = await fetchSettlements(queryFilters(next))
    // 等待期间若发生搜索/筛选/刷新（序号变化），丢弃本页结果。
    if (seq !== requestSeq) return
    settlements.value.push(...(result.settlements ?? []))
    pagination.value = result.pagination
    page.value = next
  } catch {
    // 翻页失败保持当前列表，滚动到底会再次触发重试。
  } finally {
    listLoading.value = false
  }
}

function onSearch(value) {
  keyword.value = value
  loadSettlements()
}

function onClear() {
  keyword.value = ''
  loadSettlements()
}

function selectBrand(value) {
  if (brand.value === value) return
  brand.value = value
  loadSettlements()
}

function openSort() {
  showSort.value = true
}

function closeSort() {
  showSort.value = false
}

function changeSort(option) {
  if (sortBy.value === option.value) {
    sortOrder.value = sortOrder.value === 'desc' ? 'asc' : 'desc'
  } else {
    sortBy.value = option.value
    sortOrder.value = 'desc'
  }
  loadSettlements()
}

function sortArrow(option) {
  if (sortBy.value !== option.value) return '↕'
  return sortOrder.value === 'desc' ? '↓' : '↑'
}

const shortDate = (value) => String(value ?? '').slice(5, 10)

function gradeSegments(item) {
  const entries = Object.entries(item.gradeQuantities ?? {})
    .filter(([, value]) => Number(value) > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
  const total = entries.reduce((sum, [, value]) => sum + Number(value), 0) || 1
  const segments = entries.map(([grade, value]) => ({
    grade,
    share: Number(value) / total,
  }))
  return {
    segments,
    summary: entries
      .slice(0, 2)
      .map(([grade, value]) => `${gradeLabel(grade)} ${((Number(value) / total) * 100).toFixed(0)}%`)
      .join(' · '),
  }
}

function goDetail(item) {
  router.push(`/settlement/${item.merchantNo}`)
}

loadSettlements()
</script>

<template>
  <div class="page settlement-page">
    <van-nav-bar title="结算单列表" fixed placeholder safe-area-inset-top />

    <section class="control-bar">
      <div class="control-top">
        <van-search
          v-model="keyword"
          shape="square"
          background="transparent"
          placeholder="搜索订单号 / 商号 / 柜号 / 车牌"
          clearable
          @search="onSearch"
          @clear="onClear"
        />
        <button class="sort-trigger" type="button" @click="openSort">
          <span>{{ activeSortLabel }}</span>
          <span class="sort-arrow mono">▾</span>
        </button>
      </div>

      <div class="date-filter">
        <button
          v-for="preset in datePresets"
          :key="preset.value"
          class="brand-chip"
          :class="{ active: datePreset === preset.value }"
          type="button"
          @click="selectDatePreset(preset.value)"
        >{{ preset.label }}</button>
      </div>

      <div v-if="brandTotals.length" class="brand-filter">
        <button
          class="brand-chip"
          :class="{ active: !brand }"
          type="button"
          @click="selectBrand('')"
        >
          全部
        </button>
        <button
          v-for="item in brandTotals"
          :key="item.brand"
          class="brand-chip"
          :class="{ active: brand === item.brand }"
          type="button"
          @click="selectBrand(item.brand)"
        >
          <span>{{ item.brand }}</span>
          <span class="brand-count mono">{{ item.settlement_count }}</span>
        </button>
      </div>
    </section>

    <van-popup
      v-model:show="showSort"
      position="bottom"
      round
      safe-area-inset-bottom
      class="sort-popup"
    >
      <div class="sort-head">排序方式</div>
      <button
        v-for="option in sortOptions"
        :key="option.value"
        class="sort-option"
        :class="{ active: sortBy === option.value }"
        type="button"
        @click="changeSort(option)"
      >
        <span>{{ option.label }}</span>
        <span class="mono">{{ sortArrow(option) }}</span>
      </button>
      <div class="sort-footer">
        <van-button block round type="primary" @click="closeSort">完成</van-button>
      </div>
    </van-popup>

    <van-pull-refresh v-model="refreshing" class="list-pull" @refresh="onRefresh">
      <p v-if="rangeText" class="range-hint mono">{{ rangeText }}</p>

      <div v-if="loading" class="state-card">
        <van-loading color="var(--accent)" size="22">加载结算单中...</van-loading>
      </div>

      <div v-else-if="error" class="state-card">
        <p class="muted">{{ error }}</p>
        <van-button type="primary" size="small" round @click="loadSettlements">重新加载</van-button>
      </div>

      <van-empty v-else-if="!settlements.length" image="search" description="暂无结算单" />

    <van-list
      v-else
      v-model:loading="listLoading"
      class="settlement-list"
      :finished="finished"
      finished-text="没有更多了"
      loading-text="加载中..."
      @load="loadMore"
    >
      <article
        v-for="(item, index) in settlements"
        :key="item.merchantNo || item.orderNo || `idx-${index}`"
        class="settlement-item"
        @click="goDetail(item)"
      >
        <div class="card-top">
          <div class="brand-block">
            <span class="brand-name">
              {{ item.brand || item.series || '未命名品牌' }}
              <span v-if="item.fruitType && item.fruitType !== '榴莲'" class="fruit-tag">{{ item.fruitType }}</span>
            </span>
            <span class="order-no mono">{{ item.orderNoNormalized || item.orderNo || '—' }}<span v-if="item.recordCount" class="record-count"> · {{ item.recordCount }} 条</span></span>
          </div>
          <div class="amount-block">
            <template v-if="item.payableAmount !== null">
              <strong class="amount mono payable">{{ compactMoney(item.payableAmount) }}</strong>
              <span class="amount-label mono">应付 · 销售 {{ compactMoney(item.salesAmount) }}</span>
            </template>
            <template v-else>
              <strong class="amount mono">{{ compactMoney(item.salesAmount) }}</strong>
              <span class="amount-label mono">{{ money(item.salesAmount) }}</span>
            </template>
          </div>
        </div>

        <div class="card-period mono">
          <span>销售 {{ shortDate(item.saleDateStart) || '—' }} ~ {{ shortDate(item.saleDateEnd) || '—' }}</span>
          <span>到货 {{ shortDate(item.arrivalDate) || '—' }}</span>
          <span v-if="item.confirmedAt">确认 {{ shortDate(item.confirmedAt) }}</span>
        </div>

        <div class="card-stats">
          <div class="stat">
            <span class="stat-label">销量</span>
            <b class="mono">{{ number(item.totalQuantity) }} 件</b>
          </div>
          <div class="stat">
            <span class="stat-label">均价</span>
            <b class="mono">{{ price(item.averagePrice) }}</b>
          </div>
          <div class="stat logistics">
            <span class="stat-label">柜 / 车</span>
            <b class="mono">{{ item.containerNo || '—' }} / {{ item.vehicleNo || '—' }}</b>
          </div>
        </div>

        <div v-if="gradeSegments(item).segments.length" class="grade-block">
          <div class="grade-bar">
            <span
              v-for="segment in gradeSegments(item).segments"
              :key="segment.grade"
              class="grade-segment"
              :style="{ width: `${Math.min(100, Math.max(0, segment.share * 100))}%`, background: gradeColor(segment.grade) }"
            ></span>
          </div>
          <span class="grade-summary">{{ gradeSegments(item).summary }}</span>
        </div>
      </article>
    </van-list>
    </van-pull-refresh>
  </div>
</template>

<style scoped>
.settlement-page { padding-top: 6px; }
.control-bar {
  margin-bottom: 4px;
  border-bottom: 1px solid var(--line);
}
.control-top { display: flex; align-items: center; gap: 8px; }
.control-top :deep(.van-search) { flex: 1; padding: 0; }
.control-top :deep(.van-search__content) { background: var(--panel-soft); border-radius: 8px; }
.control-top :deep(.van-field__control) { color: var(--text); }
.control-top :deep(.van-field__control::placeholder) { color: var(--text-3); }
.sort-trigger {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 36px;
  padding: 0 10px;
  color: var(--text-2);
  background: var(--panel-soft);
  border: 0;
  border-radius: 8px;
  font-size: 12px;
  white-space: nowrap;
}
.sort-arrow { min-width: 12px; font-size: 12px; font-weight: 600; }
.brand-filter {
  display: flex;
  gap: 7px;
  padding: 0 0 10px;
  overflow-x: auto;
  scrollbar-width: none;
}
.brand-filter::-webkit-scrollbar { display: none; }
.date-filter {
  display: flex;
  gap: 7px;
  padding: 10px 0 0;
  overflow-x: auto;
  scrollbar-width: none;
}
.date-filter::-webkit-scrollbar { display: none; }
.list-pull { min-height: 60vh; }
.amount.payable { color: var(--accent); }
.brand-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 30px;
  padding: 0 11px;
  color: var(--text-2);
  background: var(--panel-soft);
  border: 0;
  border-radius: 8px;
  font-size: 12px;
  white-space: nowrap;
}
.brand-chip.active {
  color: #ffffff;
  background: var(--accent);
}
.brand-count { color: var(--text-3); font-size: 11px; }
.brand-chip.active .brand-count { color: rgba(255, 255, 255, 0.85); }
.sort-popup { display: flex; flex-direction: column; }
.sort-head { padding: 16px 16px 4px; color: var(--text); font-size: 16px; font-weight: 700; }
.sort-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 50px;
  margin: 4px 12px;
  padding: 0 12px;
  color: var(--text-2);
  background: var(--panel-soft);
  border: 0;
  border-radius: 10px;
  font-size: 14px;
}
.sort-option.active { color: var(--accent); background: rgba(22, 121, 79, 0.08); font-weight: 600; }
.sort-footer { padding: 10px 16px calc(10px + env(safe-area-inset-bottom)); }
.sort-footer .van-button { margin: 0; }
.settlement-list { display: flex; flex-direction: column; }
.settlement-item {
  padding: 14px 2px;
  cursor: pointer;
  border-bottom: 1px solid var(--line);
}
.settlement-item:active { background: var(--panel-soft); }
.card-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.brand-block { display: flex; min-width: 0; flex-direction: column; }
.brand-name { color: var(--text); font-size: 15px; font-weight: 700; line-height: 1.2; }
.order-no {
  overflow: hidden;
  margin-top: 3px;
  color: var(--text-3);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.record-count { color: var(--text-3); }
.amount-block { flex: none; display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
.amount { color: var(--text); font-size: 21px; font-weight: 800; line-height: 1.1; letter-spacing: -0.01em; }
.amount-label { color: var(--text-3); font-size: 10px; }
.card-period {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin: 8px 0 10px;
  color: var(--text-3);
  font-size: 11px;
}
.card-stats {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.4fr);
  gap: 8px;
}
.stat {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
}
.stat.logistics b { font-weight: 600; font-size: 12px; }
.stat-label { color: var(--text-3); font-size: 11px; }
.stat b { color: var(--text); font-size: 14px; font-weight: 700; line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.grade-block {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 11px;
}
.grade-bar {
  display: flex;
  flex: 1;
  height: 6px;
  overflow: hidden;
  border-radius: 3px;
  background: #eef2ee;
}
.grade-segment { height: 100%; min-width: 3px; }
.grade-summary {
  flex: none;
  color: var(--text-3);
  font-size: 11px;
  white-space: nowrap;
}
.state-card {
  display: flex;
  min-height: 170px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  text-align: center;
}
.range-hint { margin: 8px 2px 0; color: var(--text-3); font-size: 10.5px; }
.fruit-tag {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 6px;
  color: var(--accent);
  background: var(--accent-soft);
  border-radius: 5px;
  font-size: 10.5px;
  font-weight: 600;
  vertical-align: 1px;
}
</style>
