<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { showConfirmDialog } from 'vant'
import { authReady, currentUser, logout } from '../store/auth'

const router = useRouter()

const user = computed(() => currentUser.value)
const avatarText = computed(() => user.value?.displayName?.trim().slice(0, 1) || 'U')

const roleLabel = computed(() => {
  const permissions = user.value?.permissions ?? []
  if (!permissions.length) return '分析用户'

  const normalized = permissions.map((item) => String(item).toLowerCase())
  if (normalized.includes('admin') || normalized.includes('*')) return '系统管理员'
  if (normalized.some((item) => item.includes('admin') || item.includes('all'))) return '全量数据'
  if (normalized.some((item) => item.includes('merchant') || item.includes('sales'))) return '销售分析'
  return permissions[0]
})

const accountLabel = computed(() => {
  const account = user.value?.email || user.value?.displayName || user.value?.id
  return account || '未绑定账号'
})

const permissionText = computed(() => {
  const permissions = user.value?.permissions ?? []
  if (!permissions.length) return '默认数据范围'
  return permissions.length <= 2
    ? permissions.join(' / ')
    : `${permissions.length} 项权限`
})

function handleLogout() {
  showConfirmDialog({
    title: '退出登录',
    message: '确认结束当前安全会话并返回登录页？',
    confirmButtonText: '退出',
    confirmButtonColor: 'var(--danger)',
  })
    .then(async () => {
      try {
        await logout()
      } finally {
        router.replace('/login')
      }
    })
    .catch(() => {})
}
</script>

<template>
  <div class="mine-page page">
    <van-nav-bar title="我的" fixed placeholder safe-area-inset-top />

    <template v-if="user">
      <header class="page-header mine-header">
        <p class="mine-role"><span class="pill">{{ roleLabel }}</span></p>
      </header>

      <section class="app-card profile-card">
        <div class="profile-avatar mono">{{ avatarText }}</div>
        <div class="profile-info">
          <div class="profile-name-row">
            <h2 class="profile-name">{{ user.displayName || user.id || '分析用户' }}</h2>
            <span class="pill role-badge">{{ roleLabel }}</span>
          </div>
          <p class="profile-mail">{{ user.email || '未绑定邮箱' }}</p>
          <p class="profile-id mono">账号：{{ accountLabel }}</p>
        </div>
      </section>

      <section class="app-card account-card">
        <h2 class="section-title">账户信息</h2>
        <div class="data-table account-table">
          <div class="data-row">
            <span class="data-label">当前账号</span>
            <strong class="data-value mono">{{ accountLabel }}</strong>
          </div>
          <div class="data-row">
            <span class="data-label">数据权限</span>
            <strong class="data-value mono">{{ permissionText }}</strong>
          </div>
          <div class="data-row">
            <span class="data-label">系统版本</span>
            <strong class="data-value mono">水果销售分析系统 v1.0.0</strong>
          </div>
          <div class="data-row">
            <span class="data-label">安全状态</span>
            <strong class="data-value mono">安全会话</strong>
          </div>
        </div>
      </section>

      <van-button
        block
        round
        type="danger"
        plain
        icon="replay"
        class="logout-button"
        @click="handleLogout"
      >
        退出登录
      </van-button>
    </template>

    <div v-else class="empty-state">
      <van-loading v-if="!authReady" size="28" color="var(--accent)">
        正在读取身份信息
      </van-loading>
      <template v-else>
        <van-empty description="未检测到登录状态" />
        <van-button type="primary" block round @click="router.replace('/login')">
          前往登录
        </van-button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.mine-page { padding-top: 10px; }
.mine-header { margin: 8px 2px 14px; }
.mine-role { margin: 0; }
.profile-card { display: flex; align-items: center; gap: 14px; padding: 18px; }
.profile-avatar { flex: 0 0 auto; display: grid; width: 56px; height: 56px; place-items: center; color: #ffffff; background: linear-gradient(135deg, var(--accent), var(--accent-2)); border-radius: 18px; font-size: 26px; font-weight: 800; }
.profile-info { flex: 1; min-width: 0; }
.profile-name-row { display: flex; gap: 8px; align-items: center; }
.profile-name { min-width: 0; margin: 0; overflow: hidden; color: var(--text); font-size: 20px; font-weight: 800; line-height: 1.2; text-overflow: ellipsis; white-space: nowrap; }
.role-badge { flex: 0 0 auto; max-width: 110px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.profile-mail { margin: 7px 0 0; overflow: hidden; color: var(--text-2); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.profile-id { margin: 6px 0 0; color: var(--accent-2); font-size: 11px; }
.account-card { padding: 16px; }
.account-card .section-title { margin-bottom: 12px; }
.account-table { background: var(--panel-soft); }
.account-table .data-value { max-width: 220px; }
.logout-button { margin-top: 2px; }
.empty-state { display: flex; min-height: 320px; flex-direction: column; align-items: center; justify-content: center; color: var(--text-2); }
.empty-state .van-button { width: min(100%, 280px); margin-top: 10px; }
</style>
