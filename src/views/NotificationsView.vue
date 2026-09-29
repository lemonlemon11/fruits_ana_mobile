<script setup>
import { computed, onActivated, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { showSuccessToast, showToast } from 'vant'
import { fetchNotifications, markAllNotificationsRead, markNotificationRead } from '../api/data'

const router = useRouter()
const notifications = ref([])
const unreadCount = ref(0)
const loading = ref(true)
const error = ref('')
const readAllBusy = ref(false)
const expandedId = ref(null)

const PRIORITY_TEXT = { high: '重要', normal: '普通', low: '低' }
const TYPE_TEXT = {
  system: '系统',
  announcement: '公告',
  data: '数据',
  operation: '经营',
}

function priorityText(value) {
  return PRIORITY_TEXT[value] ?? '通知'
}

function typeText(value) {
  return TYPE_TEXT[value] ?? value ?? '通知'
}

function formatTime(value) {
  const text = String(value ?? '')
  if (!text) return ''
  return text.length > 10 ? text.slice(0, 16).replace('T', ' ') : text
}

// 管理端通知内容为富文本 HTML，列表内按纯文本展示。
function plainText(value) {
  return String(value ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim()
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const result = await fetchNotifications({ limit: 100 })
    notifications.value = result.items
    unreadCount.value = result.unreadCount
  } catch (err) {
    error.value = err?.message || '通知加载失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

async function toggleItem(item) {
  expandedId.value = expandedId.value === item.id ? null : item.id
  if (!item.isRead) {
    try {
      await markNotificationRead(item.id)
      item.isRead = true
      item.readAt = new Date().toISOString()
      unreadCount.value = Math.max(0, unreadCount.value - 1)
    } catch {
      showToast({ message: '标记已读失败，请稍后重试', position: 'top' })
    }
  }
}

async function readAll() {
  if (readAllBusy.value || !unreadCount.value) return
  readAllBusy.value = true
  try {
    await markAllNotificationsRead()
    notifications.value = notifications.value.map((item) => ({ ...item, isRead: true }))
    unreadCount.value = 0
    showSuccessToast('已全部标记为已读')
  } catch (err) {
    showToast({ message: err?.message || '操作失败，请稍后重试', position: 'top' })
  } finally {
    readAllBusy.value = false
  }
}

onMounted(load)
onActivated(load)
</script>

<template>
  <div class="page no-tabbar notifications-page">
    <van-nav-bar title="消息通知" left-arrow fixed placeholder safe-area-inset-top @click-left="router.back()">
      <template #right>
        <button
          v-if="unreadCount"
          class="read-all-link"
          :class="{ busy: readAllBusy }"
          type="button"
          @click="readAll"
        >全部已读</button>
      </template>
    </van-nav-bar>

    <div v-if="loading" class="state-card">
      <van-loading color="var(--accent)" size="22">加载通知中...</van-loading>
    </div>

    <div v-else-if="error" class="state-card">
      <p class="muted">{{ error }}</p>
      <van-button type="primary" size="small" round @click="load">重新加载</van-button>
    </div>

    <van-empty v-else-if="!notifications.length" image="search" description="暂无消息通知" />

    <div v-else class="notice-list">
      <article
        v-for="item in notifications"
        :key="item.id"
        class="notice-item"
        :class="{ unread: !item.isRead, open: expandedId === item.id }"
        @click="toggleItem(item)"
      >
        <div class="notice-head">
          <span v-if="!item.isRead" class="unread-dot"></span>
          <b class="notice-title">{{ item.title || '未命名通知' }}</b>
          <span class="notice-tag" :class="{ hot: item.priority === 'high' }">{{ priorityText(item.priority) }}</span>
        </div>
        <div class="notice-meta mono">
          <span>{{ typeText(item.type) }}</span>
          <span v-if="formatTime(item.publishAt)">{{ formatTime(item.publishAt) }}</span>
        </div>
        <p class="notice-content">{{ plainText(item.content) || '（无内容）' }}</p>
      </article>
      <p class="list-end muted">共 {{ notifications.length }} 条 · 未读 {{ unreadCount }} 条</p>
    </div>
  </div>
</template>

<style scoped>
.notifications-page { padding-top: 6px; }
.read-all-link {
  padding: 0;
  color: var(--accent);
  background: transparent;
  border: 0;
  font-size: 13px;
}
.read-all-link.busy { opacity: 0.55; }
.state-card {
  display: flex;
  min-height: 170px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  text-align: center;
}
.notice-list { display: flex; flex-direction: column; gap: 10px; }
.notice-item {
  padding: 13px 15px;
  background: var(--panel);
  border-radius: 14px;
  box-shadow: 0 1px 2px rgba(26, 46, 34, 0.05), 0 10px 28px rgba(26, 46, 34, 0.06);
}
.notice-item.unread { border-left: 3px solid var(--accent); }
.notice-head { display: flex; align-items: center; gap: 7px; }
.unread-dot { flex: none; width: 7px; height: 7px; background: var(--accent); border-radius: 50%; }
.notice-title {
  flex: 1;
  overflow: hidden;
  color: var(--text);
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.notice-item.unread .notice-title { font-weight: 700; }
.notice-tag {
  flex: none;
  padding: 2px 7px;
  color: var(--text-2);
  background: var(--bg-soft);
  border-radius: 5px;
  font-size: 10.5px;
}
.notice-tag.hot { color: var(--down); background: rgba(255, 97, 120, 0.1); }
.notice-meta {
  display: flex;
  gap: 10px;
  margin-top: 7px;
  color: var(--text-3);
  font-size: 10.5px;
}
.notice-content {
  display: -webkit-box;
  overflow: hidden;
  margin: 8px 0 0;
  color: var(--text-2);
  font-size: 12.5px;
  line-height: 1.65;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.notice-item.open .notice-content {
  display: block;
  -webkit-line-clamp: unset;
}
.list-end { margin: 4px 0 0; text-align: center; font-size: 11px; }
</style>
