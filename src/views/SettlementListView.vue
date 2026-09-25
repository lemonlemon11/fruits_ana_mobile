<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { fetchSettlements } from '../api/data'
import { gradeColor, gradeLabel, money, number, price } from '../utils/format'

const router = useRouter()

const keyword = ref('')
const sortBy = ref('arrival_date')
const sortOrder = ref('desc')
const settlements = ref([])
const loading = ref(true)
const error = ref('')

const sortOptions = [
  { label: '日期', value: 'arrival_date' },
  { label: '金额', value: 'sales_amount' },
  { label: '数量', value: 'total_quantity' },
]

async function loadSettlements() {
  loading.value = true
  error.value = ''

  try {
    const result = await fetchSettlements({
      keyword: keyword.value.trim(),
      sortBy: sortBy.value,
      sortOrder: sortOrder.value,
      page: 1,
      pageSize: 30,
    })
    settlements.value = result.settlements ?? []
  } catch (err) {
    error.value = err?.message || '结算单加载失败，请稍后重试'
  } finally {
    loading.value = false
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

function gradeEntries(item) {
  return Object.entries(item.gradeQuantities ?? {}).filter(([, value]) => Number(value) > 0)
}

function goDetail(item) {
  router.push(`/settlement/${item.merchantNo}`)
}

loadSettlements()
</script>

<template>
  <div class="page settlement-page">
    <van-nav-bar title="结算单" fixed placeholder safe-area-inset-top />

    <section class="app-card control-bar">
      <div class="control-search">
        <van-search
          v-model="keyword"
          shape="round"
          background="transparent"
          placeholder="搜索订单号 / 商号 / 柜号"
          clearable
          @search="onSearch"
          @clear="onClear"
        />
      </div>

      <div class="sort-grid" role="tablist" aria-label="排序方式">
        <button
          v-for="option in sortOptions"
          :key="option.value"
          class="sort-chip"
          :class="{ active: sortBy === option.value }"
          type="button"
          @click="changeSort(option)"
        >
          <span>{{ option.label }}</span>
          <span class="sort-arrow mono">{{ sortArrow(option) }}</span>
        </button>
      </div>
    </section>

    <div v-if="loading" class="app-card state-card">
      <van-loading color="var(--accent)" size="22">加载结算单中...</van-loading>
    </div>

    <div v-else-if="error" class="app-card state-card">
      <p class="muted">{{ error }}</p>
      <van-button type="primary" size="small" round @click="loadSettlements">重新加载</van-button>
    </div>

    <van-empty v-else-if="!settlements.length" image="search" description="暂无结算单" />

    <div v-else class="settlement-list">
      <article
        v-for="item in settlements"
        :key="item.merchantNo || item.orderNo"
        class="app-card settlement-card"
        @click="goDetail(item)"
      >
        <div class="card-head">
          <div class="order-wrap">
            <h2 class="order-no mono">{{ item.orderNo || '未命名订单' }}</h2>
            <p class="order-date mono">到货 {{ item.arrivalDate || '—' }} · 销售 {{ item.saleDateStart || '—' }} 至 {{ item.saleDateEnd || '—' }}</p>
          </div>
          <van-tag v-if="item.brand" plain type="primary">{{ item.brand }}</van-tag>
        </div>

        <div class="info-line">
          <span>商号 <b>{{ item.merchantNo || '—' }}</b></span>
          <span>柜号 <b>{{ item.containerNo || '—' }}</b></span>
          <span>车号 <b>{{ item.vehicleNo || '—' }}</b></span>
        </div>

        <div class="settlement-metrics metric-grid">
          <div class="metric-card">
            <span class="metric-label">销量</span>
            <strong class="metric-value mono">{{ number(item.totalQuantity) }}</strong>
          </div>
          <div class="metric-card">
            <span class="metric-label">金额</span>
            <strong class="metric-value mono accent">{{ money(item.salesAmount) }}</strong>
          </div>
          <div class="metric-card">
            <span class="metric-label">均价</span>
            <strong class="metric-value mono">{{ price(item.averagePrice) }}</strong>
          </div>
        </div>

        <div v-if="gradeEntries(item).length" class="grade-row">
          <span
            v-for="[grade, quantity] in gradeEntries(item)"
            :key="grade"
            class="grade-chip"
            :style="{ color: gradeColor(grade), borderColor: `${gradeColor(grade)}55`, background: `${gradeColor(grade)}12` }"
          >
            <i class="grade-dot" :style="{ background: gradeColor(grade) }"></i>
            <span>{{ gradeLabel(grade) }}</span>
            <b class="mono">{{ number(quantity) }}</b>
          </span>
        </div>

        <div class="card-foot">
          <span class="mono">商号 {{ item.merchantNoNormalized || item.merchantNo || '—' }}</span>
          <span class="card-cta">查看明细 <i>→</i></span>
        </div>
      </article>
    </div>
  </div>
</template>

<style scoped>
.settlement-page { padding-top: 6px; }
.control-bar {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 14px;
  padding: 12px;
}
.control-search { margin: -4px -4px 0; }
.control-search :deep(.van-search) { padding: 0; }
.control-search :deep(.van-search__content) {
  background: rgba(255, 255, 255, 0.88);
  border: 1px solid rgba(58, 104, 66, 0.16);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.6);
}
.control-search :deep(.van-field__control) { color: var(--text); }
.control-search :deep(.van-field__control::placeholder) { color: var(--text-3); }
.sort-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.sort-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 38px;
  color: var(--text-2);
  background: var(--panel-soft);
  border: 1px solid var(--line);
  border-radius: 10px;
  font-size: 13px;
  transition: color 0.2s ease, background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
}
.sort-chip.active {
  color: #ffffff;
  background: var(--accent);
  border-color: var(--accent);
  box-shadow: 0 8px 18px rgba(47, 143, 91, 0.18);
}
.sort-arrow { min-width: 12px; font-size: 13px; font-weight: 600; }
.settlement-list { display: flex; flex-direction: column; gap: 14px; }
.settlement-card {
  margin-bottom: 0;
  padding: 16px;
  cursor: pointer;
  transition: border-color 0.2s ease, transform 0.2s ease;
}
.settlement-card:active { border-color: var(--line-strong); transform: scale(0.985); }
.card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.order-wrap { display: flex; min-width: 0; flex-direction: column; }
.order-no {
  overflow: hidden;
  margin: 0;
  color: var(--text);
  font-size: 20px;
  font-weight: 700;
  line-height: 1.15;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.order-date { margin: 6px 0 0; color: var(--text-2); font-size: 12px; }
.info-line {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  margin-bottom: 13px;
  color: var(--text-2);
  font-size: 12px;
}
.info-line b { color: var(--text); font-weight: 600; }
.settlement-metrics { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-bottom: 13px; }
.settlement-metrics .metric-card {
  display: flex;
  min-width: 0;
  min-height: 76px;
  flex-direction: column;
  justify-content: space-between;
  padding: 11px 10px;
}
.settlement-metrics .metric-label { margin-bottom: 7px; }
.settlement-metrics .metric-value { font-size: 18px; line-height: 1.1; text-align: left; }
.grade-row { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; }
.grade-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 26px;
  padding: 3px 9px;
  border: 1px solid;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}
.grade-chip b { margin-left: 2px; color: currentColor; font-size: 12px; font-weight: 600; }
.grade-dot { width: 7px; height: 7px; margin-right: 0; }
.card-foot {
  display: flex;
  min-height: 34px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 13px;
  padding-top: 11px;
  color: var(--text-3);
  border-top: 1px solid var(--line);
  font-size: 11px;
}
.card-foot > :first-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.card-cta { flex: none; color: var(--accent); font-size: 11px; font-weight: 600; white-space: nowrap; }
.card-cta i { margin-left: 3px; font-style: normal; }
.state-card { min-height: 170px; }
</style>
