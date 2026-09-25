<script setup>
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const showTabbar = computed(() => Boolean(route.meta.tabbar))

function handleUnauthorized() {
  router.replace({ path: '/login', query: { redirect: route.fullPath } })
}

onMounted(() => window.addEventListener('api:unauthorized', handleUnauthorized))
onBeforeUnmount(() => window.removeEventListener('api:unauthorized', handleUnauthorized))
</script>

<template>
  <van-config-provider theme="light">
    <div class="app-shell">

      <router-view v-slot="{ Component }">
        <keep-alive :include="['HomeView', 'SettlementListView', 'CompareView', 'MineView']">
          <component :is="Component" />
        </keep-alive>
      </router-view>

      <van-tabbar
        v-if="showTabbar"
        route
        fixed
        placeholder
        safe-area-inset-bottom
        :border="false"
        active-color="#2f8f5b"
        inactive-color="#8fa08c"
      >
        <van-tabbar-item replace to="/home" icon="chart-trending-o">总览</van-tabbar-item>
        <van-tabbar-item replace to="/settlements" icon="orders-o">结算</van-tabbar-item>
        <van-tabbar-item replace to="/compare" icon="bar-chart-o">对比</van-tabbar-item>
        <van-tabbar-item replace to="/mine" icon="user-o">我的</van-tabbar-item>
      </van-tabbar>
    </div>
  </van-config-provider>
</template>

<style scoped>
.app-shell {
  position: relative;
  min-height: 100vh;
  overflow-x: hidden;
}
</style>
