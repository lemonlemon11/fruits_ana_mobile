<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { showSuccessToast, showToast } from 'vant'
import { resetPassword, sendResetCode, verifyResetCode } from '../api/data'

const router = useRouter()

const step = ref(1)
const email = ref('')
const code = ref('')
const password = ref('')
const passwordConfirm = ref('')
const resetToken = ref('')
const busy = ref(false)
const formError = ref('')
// 已发送过验证码后允许「重新发送」，并加 60s 冷却倒计时防连点。
const codeSent = ref(false)
const resendCooldown = ref(0)
let resendTimer = null

function startResendCooldown() {
  resendCooldown.value = 60
  if (resendTimer) clearInterval(resendTimer)
  resendTimer = setInterval(() => {
    resendCooldown.value -= 1
    if (resendCooldown.value <= 0) {
      clearInterval(resendTimer)
      resendTimer = null
    }
  }, 1000)
}

const stepTitle = computed(() =>
  step.value === 1 ? '验证邮箱' : step.value === 2 ? '输入验证码' : '设置新密码',
)
const stepHint = computed(() => {
  if (step.value === 1) return '输入账号绑定的邮箱，我们将发送 6 位验证码'
  if (step.value === 2) return `验证码已发送至 ${email.value}`
  return '新密码长度不少于 8 位'
})

const emailRules = [
  { required: true, message: '请输入邮箱' },
  { pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: '邮箱格式不正确' },
]
const codeRules = [
  { required: true, message: '请输入验证码' },
  { pattern: /^\d{6}$/, message: '验证码为 6 位数字' },
]
const passwordRules = [
  { required: true, message: '请输入新密码' },
  { validator: (value) => value.length >= 8, message: '密码长度不能少于 8 位' },
]

function fail(err) {
  formError.value = err?.detail || err?.message || '操作失败，请稍后重试'
}

async function onSendCode() {
  formError.value = ''
  busy.value = true
  try {
    await sendResetCode(email.value.trim())
    codeSent.value = true
    step.value = 2
    startResendCooldown()
    showSuccessToast('验证码已发送')
  } catch (err) {
    fail(err)
  } finally {
    busy.value = false
  }
}

async function onVerifyCode() {
  formError.value = ''
  busy.value = true
  try {
    const result = await verifyResetCode({ email: email.value.trim(), code: code.value.trim() })
    resetToken.value = result.resetToken
    step.value = 3
  } catch (err) {
    fail(err)
  } finally {
    busy.value = false
  }
}

async function onReset() {
  if (password.value !== passwordConfirm.value) {
    formError.value = '两次输入的密码不一致'
    return
  }
  formError.value = ''
  busy.value = true
  try {
    await resetPassword({
      email: email.value.trim(),
      resetToken: resetToken.value,
      password: password.value,
    })
    showSuccessToast('密码已重置，请使用新密码登录')
    router.replace('/login')
  } catch (err) {
    fail(err)
  } finally {
    busy.value = false
  }
}

function goBack() {
  formError.value = ''
  if (step.value > 1) {
    step.value -= 1
    return
  }
  router.back()
}
</script>

<template>
  <div class="login-page forgot-page">
    <main class="login-shell">
      <header class="page-header login-header">
        <button class="back-link" type="button" @click="goBack">‹ 返回</button>
        <h1 class="page-title forgot-title">找回密码</h1>
      </header>

      <section class="app-card login-card">
        <div class="card-heading">
          <div class="step-row mono">
            <span v-for="n in 3" :key="n" class="step-dot" :class="{ done: step > n, active: step === n }">{{ step > n ? '✓' : n }}</span>
            <i v-for="n in 2" :key="`bar-${n}`" class="step-bar" :class="{ done: step > n }"></i>
          </div>
          <h2 class="card-title">{{ stepTitle }}</h2>
          <p class="card-hint">{{ stepHint }}</p>
        </div>

        <van-form v-if="step === 1" @submit="onSendCode">
          <van-field
            v-model="email"
            name="email"
            label="邮箱"
            placeholder="请输入注册邮箱"
            left-icon="envelop-o"
            clearable
            :rules="emailRules"
          />
          <p v-if="formError" class="form-error" role="alert">
            <van-icon name="warning-o" />
            <span>{{ formError }}</span>
          </p>
          <van-button block round type="primary" native-type="submit" :loading="busy" loading-text="发送中..." class="login-button">
            发送验证码
          </van-button>
        </van-form>

        <van-form v-else-if="step === 2" @submit="onVerifyCode">
          <van-field
            v-model="code"
            name="code"
            label="验证码"
            placeholder="6 位数字验证码"
            left-icon="shield-o"
            clearable
            maxlength="6"
            type="digit"
            :rules="codeRules"
          />
          <p class="resend-row">
            <button
              type="button"
              class="resend-link"
              :disabled="busy || resendCooldown > 0"
              @click="onSendCode"
            >{{ resendCooldown > 0 ? `重新发送（${resendCooldown}s）` : '重新发送验证码' }}</button>
          </p>
          <p v-if="formError" class="form-error" role="alert">
            <van-icon name="warning-o" />
            <span>{{ formError }}</span>
          </p>
          <van-button block round type="primary" native-type="submit" :loading="busy" loading-text="验证中..." class="login-button">
            下一步
          </van-button>
        </van-form>

        <van-form v-else @submit="onReset">
          <van-field
            v-model="password"
            type="password"
            name="password"
            label="新密码"
            placeholder="不少于 8 位"
            left-icon="closed-eye"
            clearable
            :rules="passwordRules"
          />
          <van-field
            v-model="passwordConfirm"
            type="password"
            name="passwordConfirm"
            label="确认密码"
            placeholder="再次输入新密码"
            left-icon="closed-eye"
            clearable
            :rules="[{ required: true, message: '请再次输入新密码' }]"
          />
          <p v-if="formError" class="form-error" role="alert">
            <van-icon name="warning-o" />
            <span>{{ formError }}</span>
          </p>
          <van-button block round type="primary" native-type="submit" :loading="busy" loading-text="提交中..." class="login-button">
            重置密码
          </van-button>
        </van-form>
      </section>

      <footer class="login-footer">验证码发送至账号绑定邮箱，如无法收到请联系管理员</footer>
    </main>
  </div>
</template>

<style scoped>
.forgot-title { font-size: 26px; }
.back-link {
  margin-bottom: 14px;
  padding: 0;
  color: var(--text-3);
  background: transparent;
  border: 0;
  font-size: 13px;
}
.step-row { position: relative; display: flex; align-items: center; gap: 26px; margin: 4px 0 16px; padding: 0 22px; }
.step-dot {
  z-index: 1;
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  color: var(--text-3);
  background: var(--bg-soft);
  border-radius: 50%;
  font-size: 11px;
  font-weight: 700;
}
.step-dot.active { color: #ffffff; background: var(--accent); }
.step-dot.done { color: #ffffff; background: var(--accent); opacity: 0.55; }
.step-bar { position: absolute; top: 10px; left: 34px; right: 34px; height: 2px; background: var(--line); }
.step-bar.done { background: var(--accent); opacity: 0.55; }
.resend-row { margin: 10px 2px 0; text-align: right; }
.resend-link { padding: 0; color: var(--accent); background: transparent; border: 0; font-size: 12.5px; }
.resend-link:disabled { opacity: 0.5; }
</style>
