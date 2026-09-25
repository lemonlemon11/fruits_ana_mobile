<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { fetchSettlements } from '../api/data'
import { gradeColor, gradeLabel, money, number, price } from '../utils/format'

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

const sortOptions = [
  { label: '日期', value: 'arrival_date' },
  { label: '金额', value: 'sales_amount' },
  { label: '数量', value: 'total_quantity' },
]
const activeSortLabel = computed(() => {
  const current = sortOptions.find((option) => option.value === sortBy.value)
  return `${current?.label || '日期'} ${sortOrder.value === 'desc' ? '降序' : '升序'}`
})

async function loadSettlements() {
  loading.value = true
  error.value = ''

  try {
    const result = await fetchSettlements({
      keyword: keyword.value.trim(),
      brand: brand.value || undefined,
      sortBy: sortBy.value,
      sortOrder: sortOrder.value,
      page: 1,
      pageSize: 30,
    })
    settlements.value = result.settlements ?? []
    if (!brand.value && result.brandTotals?.length) {
      brandTotals.value = result.brandTotals
    }
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
      <div class="control-top">
        <van-search
          v-model="keyword"
          shape="round"
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
        <div class="card-top">
          <div class="brand-block">
            <span class="brand-name">{{ item.brand || item.series || '未命名品牌' }}</span>
            <span class="order-no mono">{{ item.orderNoNormalized || item.orderNo || '—' }}</span>
          </div>
          <div class="amount-block">
            <strong class="amount mono">{{ money(item.salesAmount) }}</strong>
            <span class="amount-label">销售金额</span>
          </div>
        </div>

        <div class="card-period mono">
          <span>销售 {{ shortDate(item.saleDateStart) || '—' }} ~ {{ shortDate(item.saleDateEnd) || '—' }}</span>
          <span>到货 {{ shortDate(item.arrivalDate) || '—' }}</span>
        </div>

        <div class="card-logistics">
          <span>商号 {{ item.merchantNoNormalized || item.merchantNo || '—' }}</span>
          <span>柜号 {{ item.containerNo || '—' }}</span>
          <span>车号 {{ item.vehicleNo || '—' }}</span>
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
          <div class="stat">
            <span class="stat-label">记录</span>
            <b class="mono">{{ item.recordCount || 0 }} 条</b>
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
      </article>
    </div>
  </div>
</template>

<style scoped>
.settlement-page { padding-top: 6px; }
.control-bar {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 14px;
  padding: 12px;
}
.control-top { display: flex; align-items: center; gap: 8px; }
.control-top :deep(.van-search) { flex: 1; padding: 0; }
.control-top :deep(.van-search__content) {
  background: rgba(255, 255, 255, 0.88);
  border: 1px solid rgba(58, 104, 66, 0.16);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.6);
}
.control-top :deep(.van-field__control) { color: var(--text); }
.control-top :deep(.van-field__control::placeholder) { color: var(--text-3); }
.sort-trigger {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 40px;
  padding: 0 11px;
  color: var(--text-2);
  background: var(--panel-soft);
  border: 1px solid var(--line);
  border-radius: 10px;
  font-size: 12px;
  white-space: nowrap;
}
.sort-arrow { min-width: 12px; font-size: 12px; font-weight: 600; }
.brand-filter { display: flex; gap: 7px; padding: 1px 2px 2px; overflow-x: auto; scrollbar-width: none; }
.brand-filter::-webkit-scrollbar { display: none; }
.brand-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 30px;
  padding: 0 11px;
  color: var(--text-2);
  background: var(--panel-soft);
  border: 1px solid var(--line);
  border-radius: 999px;
  font-size: 12px;
  white-space: nowrap;
}
.brand-chip.active {
  color: #ffffff;
  background: var(--accent);
  border-color: var(--accent);
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
  border: 1px solid transparent;
  border-radius: 12px;
  font-size: 14px;
}
.sort-option.active { color: var(--accent); background: rgba(47, 143, 91, 0.06); border-color: rgba(47, 143, 91, 0.2); font-weight: 600; }
.sort-footer { padding: 10px 16px calc(10px + env(safe-area-inset-bottom)); }
.sort-footer .van-button { margin: 0; }
.settlement-list { display: flex; flex-direction: column; gap: 12px; }
.settlement-card {
  margin-bottom: 0;
  padding: 14px;
  cursor: pointer;
  transition: border-color 0.2s ease, transform 0.2s ease;
}
.settlement-card:active { border-color: var(--line-strong); transform: scale(0.985); }
.card-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}
.brand-block { display: flex; min-width: 0; flex-direction: column; }
.brand-name { color: var(--text); font-size: 17px; font-weight: 800; line-height: 1.15; }
.order-no {
  overflow: hidden;
  margin-top: 3px;
  color: var(--text-2);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.amount-block { flex: none; display: flex; flex-direction: column; align-items: flex-end; }
.amount { color: var(--accent-2); font-size: 18px; font-weight: 800; line-height: 1.1; }
.amount-label { margin-top: 3px; color: var(--text-3); font-size: 10px; }
.card-period {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin-bottom: 8px;
  color: var(--text-2);
  font-size: 11px;
}
.card-logistics {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  margin-bottom: 10px;
  padding-bottom: 10px;
  color: var(--text-2);
  border-bottom: 1px solid var(--line);
  font-size: 11px;
}
.card-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.stat {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
}
.stat-label { color: var(--text-3); font-size: 11px; }
.stat b { color: var(--text); font-size: 14px; font-weight: 700; line-height: 1.1; }
.grade-row { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; }
.grade-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 24px;
  padding: 2px 8px;
  border: 1px solid;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 600;
  white-space: nowrap;
}
.grade-chip b { margin-left: 2px; color: currentColor; font-size: 11px; font-weight: 600; }
.grade-dot { width: 6px; height: 6px; margin-right: 0; }
.grade-row { margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--line); }
.state-card { min-height: 170px; }
</style>
