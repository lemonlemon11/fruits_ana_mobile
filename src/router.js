import { createRouter, createWebHistory } from 'vue-router'
import { restoreSession, currentUser } from './store/auth'

const routes = [
  { path: '/', redirect: '/home' },
  {
    path: '/login',
    name: 'login',
    component: () => import('./views/LoginView.vue'),
    meta: { guestOnly: true },
  },
  {
    path: '/forgot-password',
    name: 'forgot-password',
    component: () => import('./views/ForgotPasswordView.vue'),
    meta: { title: '找回密码' },
  },
  {
    path: '/home',
    name: 'home',
    component: () => import('./views/HomeView.vue'),
    meta: { requiresAuth: true, tabbar: true, title: '销售总览' },
  },
  {
    path: '/settlements',
    name: 'settlements',
    component: () => import('./views/SettlementListView.vue'),
    meta: { requiresAuth: true, tabbar: true, title: '结算单' },
  },
  {
    path: '/settlement/:id',
    name: 'settlement-detail',
    component: () => import('./views/SettlementDetailView.vue'),
    meta: { requiresAuth: true, title: '结算单详情' },
  },
  {
    path: '/compare',
    name: 'compare',
    component: () => import('./views/CompareView.vue'),
    meta: { requiresAuth: true, tabbar: true, title: '品牌对比' },
  },
  {
    path: '/mine',
    name: 'mine',
    component: () => import('./views/MineView.vue'),
    meta: { requiresAuth: true, tabbar: true, title: '我的' },
  },
  {
    path: '/notifications',
    name: 'notifications',
    component: () => import('./views/NotificationsView.vue'),
    meta: { requiresAuth: true, title: '消息通知' },
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/home',
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach(async (to) => {
  if (!currentUser.value) {
    try {
      await restoreSession()
    } catch {
      currentUser.value = null
    }
  }
  if (to.meta.requiresAuth && !currentUser.value) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }
  if (to.meta.guestOnly && currentUser.value) return { path: '/home' }
  return true
})

export default router
