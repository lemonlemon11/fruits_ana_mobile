<script setup>
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast } from 'vant'
import { login } from '../store/auth'

const route = useRoute()
const router = useRouter()

const username = ref('')
const password = ref('')
const rememberMe = ref(true)
const loading = ref(false)
const formError = ref('')

const redirect = computed(() => {
  const target = route.query.redirect
  return typeof target === 'string' && target.startsWith('/') ? target : '/home'
})

const usernameRules = [{ required: true, message: '请输入用户名' }]
const passwordRules = [{ required: true, message: '请输入密码' }]

async function onSubmit() {
  formError.value = ''
  loading.value = true
  try {
    await login({
      displayName: username.value.trim(),
      password: password.value,
      rememberMe: rememberMe.value,
    })
    showToast({ type: 'success', message: '登录成功' })
    router.replace(redirect.value)
  } catch (error) {
    formError.value = error?.detail || error?.message || '登录失败，请稍后重试'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <main class="login-shell">
      <header class="page-header login-header">
        <div class="brand-mark">果</div>
        <h1 class="page-title brand-title">水果销售分析</h1>
      </header>

      <section class="app-card login-card">
        <div class="card-heading">
          <h2 class="card-title">账号登录</h2>
          <p class="card-hint">请输入账号与密码</p>
        </div>

        <van-form @submit="onSubmit">
          <van-field
            v-model="username"
            name="username"
            label="用户名"
            placeholder="请输入用户名"
            left-icon="user-o"
            clearable
            :rules="usernameRules"
          />
          <van-field
            v-model="password"
            type="password"
            name="password"
            label="密码"
            placeholder="请输入密码"
            left-icon="closed-eye"
            clearable
            :rules="passwordRules"
          />

          <p v-if="formError" class="form-error" role="alert">
            <van-icon name="warning-o" />
            <span>{{ formError }}</span>
          </p>

          <div class="remember-row">
            <van-checkbox v-model="rememberMe" shape="square" icon-size="16px">
              记住登录状态
            </van-checkbox>
          </div>

          <van-button
            block
            round
            type="primary"
            native-type="submit"
            :loading="loading"
            loading-text="登录中..."
            class="login-button"
          >
            登录
          </van-button>
        </van-form>
      </section>

      <footer class="login-footer">仅限授权用户使用，请妥善保管账号信息</footer>
    </main>
  </div>
</template>

<style scoped>
.login-page { min-height: 100vh; padding: 32px 20px calc(28px + env(safe-area-inset-bottom)); background: var(--bg); }
.login-shell { display: flex; flex-direction: column; width: min(100%, 430px); min-height: calc(100vh - 32px - 28px - env(safe-area-inset-bottom)); margin: 0 auto; }
.login-header { margin: 6px 2px 26px; }
.brand-mark { display: grid; width: 56px; height: 56px; margin-bottom: 18px; place-items: center; color: #ffffff; background: var(--accent); border-radius: 16px; font-size: 24px; font-weight: 700; }
.brand-title { font-size: 28px; line-height: 1.2; }
.login-card { width: 100%; padding: 20px; }
.card-heading { margin-bottom: 6px; }
.card-title { margin: 0; color: var(--text); font-size: 22px; font-weight: 700; }
.card-hint { margin: 8px 0 14px; color: var(--text-3); font-size: 12px; }
.login-card :deep(.van-cell) { min-height: 46px; padding: 10px 2px; background: transparent; }
.login-card :deep(.van-cell::after) { left: 2px; right: 2px; border-color: var(--line); }
.login-card :deep(.van-field__label) { width: 66px; color: var(--text-2); font-weight: 600; }
.login-card :deep(.van-field__left-icon) { color: var(--accent); }
.login-card :deep(.van-field__control) { color: var(--text); font-weight: 500; }
.login-card :deep(.van-field__control::placeholder) { color: var(--text-3); }
.remember-row { display: flex; justify-content: flex-end; padding: 12px 2px 0; color: var(--text-2); font-size: 13px; }
.remember-row :deep(.van-checkbox__icon--checked .van-icon) { color: var(--accent); background: var(--accent); border-color: var(--accent); }
.form-error { display: flex; gap: 8px; align-items: center; margin: 8px 0 0; padding: 9px 12px; color: var(--danger); background: rgba(255, 97, 120, 0.1); border: 1px solid rgba(255, 97, 120, 0.28); border-radius: 12px; font-size: 12px; line-height: 1.45; }
.login-button { width: 100%; height: 48px; margin-top: 16px; font-size: 16px; font-weight: 700; }
.login-card :deep(.van-button--primary) { background: var(--accent); border: 0; }
.login-footer { margin-top: auto; padding-top: 24px; color: var(--text-3); font-size: 12px; line-height: 1.6; text-align: center; }
</style>
