<template>
  <div class="login-page">
    <!-- 背景氛围：主题色光晕 + 网格纹理 -->
    <div class="login-ambient" aria-hidden="true">
      <div class="ambient-glow ambient-glow--tl"></div>
      <div class="ambient-glow ambient-glow--br"></div>
      <div class="ambient-grid"></div>
    </div>

    <div class="login-shell">
      <div class="login-card" ref="cardRef">
        <!-- 品牌区 -->
        <header class="login-brand">
          <div class="brand-mark" ref="markRef">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <h1 class="brand-title" ref="titleRef">题库管理系统</h1>
          <p class="brand-sub" ref="subRef">请登录以继续使用</p>
        </header>

        <form class="login-form" @submit.prevent="handleLogin">
          <!-- 用户名 -->
          <div class="field" :class="{ 'is-focused': focused === 'username' }" data-anim="field">
            <label class="field-label" for="login-username">用户名</label>
            <div class="field-control">
              <span class="field-icon" aria-hidden="true">
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </span>
              <input
                id="login-username"
                v-model="username"
                class="field-input"
                type="text"
                name="username"
                autocomplete="username"
                placeholder="请输入用户名"
                :disabled="loading"
                autofocus
                @focus="focused = 'username'"
                @blur="focused = ''"
              />
            </div>
          </div>

          <!-- 密码 -->
          <div class="field field--password" :class="{ 'is-focused': focused === 'password' }" data-anim="field">
            <label class="field-label" for="login-password">密码</label>
            <div class="field-control">
              <span class="field-icon" aria-hidden="true">
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                </svg>
              </span>
              <input
                id="login-password"
                v-model="password"
                class="field-input"
                :type="showPassword ? 'text' : 'password'"
                name="password"
                autocomplete="current-password"
                placeholder="请输入密码"
                :disabled="loading"
                @focus="focused = 'password'"
                @blur="focused = ''"
              />
              <button
                ref="toggleRef"
                class="field-toggle"
                type="button"
                :aria-label="showPassword ? '隐藏密码' : '显示密码'"
                @click="togglePassword"
              >
                <svg v-if="showPassword" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                </svg>
                <svg v-else fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                  <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </div>
          </div>

          <!-- 错误提示 -->
          <Transition name="err">
            <div v-if="error" class="login-error" role="alert">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              <p>{{ error }}</p>
            </div>
          </Transition>

          <!-- 提交 -->
          <button
            ref="submitRef"
            class="login-submit"
            type="submit"
            :disabled="loading || !username || !password"
          >
            <span class="login-submit-shine" aria-hidden="true"></span>
            <svg v-if="loading" class="login-spinner" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
              <path d="M21 12a9 9 0 11-6.219-8.56" />
            </svg>
            <span>{{ loading ? '登录中...' : '登录' }}</span>
          </button>
        </form>
      </div>

      <p class="login-hint" ref="hintRef">默认管理员账号: admin / admin123</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import gsap from 'gsap'
import { gsapEasing } from '@/utils/motionTokens'
import { useAuthStore } from '../stores/auth'
import { useToastStore } from '../stores/toast'

const router = useRouter()
const authStore = useAuthStore()
const toastStore = useToastStore()

const username = ref('')
const password = ref('')
const showPassword = ref(false)
const loading = ref(false)
const error = ref('')
const focused = ref('')

const cardRef = ref(null)
const markRef = ref(null)
const titleRef = ref(null)
const subRef = ref(null)
const submitRef = ref(null)
const hintRef = ref(null)
const toggleRef = ref(null)

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

// 入场动效：卡片浮起 + 品牌标记弹入 + 字段错峰上移
onMounted(() => {
  if (reduceMotion || !cardRef.value) return
  const fields = cardRef.value.querySelectorAll('[data-anim="field"]')
  const tl = gsap.timeline({ defaults: { ease: gsapEasing.smooth, duration: 0.5 } })
  tl.fromTo(cardRef.value, { autoAlpha: 0, y: 24, scale: 0.985 }, { autoAlpha: 1, y: 0, scale: 1 })
    .fromTo(markRef.value, { autoAlpha: 0, scale: 0.5, rotate: -12 }, { autoAlpha: 1, scale: 1, rotate: 0, duration: 0.6, ease: gsapEasing.bounce }, '-=0.3')
    .fromTo([titleRef.value, subRef.value], { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.45, stagger: 0.08 }, '-=0.38')
    .fromTo(fields, { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.45, stagger: 0.1 }, '-=0.28')
    .fromTo(submitRef.value, { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.45 }, '-=0.25')
    .fromTo(hintRef.value, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.4 }, '-=0.22')
})

// 密码可见性切换反馈
function togglePassword() {
  showPassword.value = !showPassword.value
  if (reduceMotion || !toggleRef.value) return
  gsap.fromTo(toggleRef.value, { scale: 0.82 }, { scale: 1, duration: 0.3, ease: gsapEasing.bounce, overwrite: 'auto' })
}

async function handleLogin() {
  if (!username.value || !password.value) return

  // 按钮按压反馈
  if (!reduceMotion && submitRef.value) {
    gsap.fromTo(submitRef.value, { scale: 0.97 }, { scale: 1, duration: 0.3, ease: gsapEasing.bounce, overwrite: 'auto' })
  }

  loading.value = true
  error.value = ''

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: username.value,
        password: password.value
      })
    })

    const data = await res.json()

    if (!res.ok) {
      error.value = data.error || '登录失败'
      return
    }

    authStore.setAuth(data.token, data.user)
    toastStore.success('登录成功')
    router.push('/')
  } catch (err) {
    error.value = '网络错误，请稍后重试'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
/* ========== 页面容器 ========== */
.login-page {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  min-height: 100dvh;
  padding: 1.25rem 1rem;
  overflow: hidden;
  background: var(--theme-bg);
  color: var(--theme-text);
}

/* ========== 背景氛围 ========== */
.login-ambient {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}
.ambient-glow {
  position: absolute;
  border-radius: 999px;
  filter: blur(80px);
}
.ambient-glow--tl {
  top: -13rem;
  left: -10rem;
  width: 30rem;
  height: 30rem;
  background: radial-gradient(circle, color-mix(in srgb, var(--theme-accent) 34%, transparent), transparent 68%);
}
.ambient-glow--br {
  right: -12rem;
  bottom: -16rem;
  width: 32rem;
  height: 32rem;
  background: radial-gradient(circle, color-mix(in srgb, var(--theme-accent) 24%, transparent), transparent 68%);
}
.ambient-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(to right, var(--theme-border) 1px, transparent 1px),
    linear-gradient(to bottom, var(--theme-border) 1px, transparent 1px);
  background-size: 40px 40px;
  opacity: 0.55;
  -webkit-mask-image: radial-gradient(ellipse 80% 70% at 50% 45%, #000 30%, transparent 100%);
  mask-image: radial-gradient(ellipse 80% 70% at 50% 45%, #000 30%, transparent 100%);
}
.dark .ambient-grid {
  opacity: 0.4;
}

/* ========== 卡片 ========== */
.login-shell {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 400px;
}
.login-card {
  padding: 1.25rem;
  background: var(--theme-surface);
  border: 1px solid var(--theme-border);
  border-radius: 16px;
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.04),
    0 22px 44px -26px color-mix(in srgb, var(--theme-accent) 60%, transparent),
    0 30px 60px -44px rgba(0, 0, 0, 0.35);
}
.dark .login-card {
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.4),
    0 22px 44px -24px color-mix(in srgb, var(--theme-accent) 34%, transparent),
    0 30px 60px -40px rgba(0, 0, 0, 0.6);
}

/* ========== 品牌区 ========== */
.login-brand {
  margin-bottom: 1.5rem;
  text-align: center;
}
.brand-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 3.25rem;
  height: 3.25rem;
  margin-bottom: 0.875rem;
  border-radius: 14px;
  color: #fff;
  background: linear-gradient(145deg, color-mix(in srgb, var(--theme-accent) 82%, #fff), var(--theme-accent));
  box-shadow:
    0 8px 20px -8px color-mix(in srgb, var(--theme-accent) 80%, transparent),
    inset 0 1px 0 rgba(255, 255, 255, 0.25);
}
.brand-mark svg {
  width: 1.6rem;
  height: 1.6rem;
}
.brand-title {
  font-size: clamp(1.35rem, 1.15rem + 1.1vw, 1.6rem);
  font-weight: 700;
  line-height: 1.25;
  letter-spacing: -0.015em;
  color: var(--theme-text);
}
.brand-sub {
  margin-top: 0.375rem;
  font-size: 0.875rem;
  color: var(--theme-muted);
}

/* ========== 表单 ========== */
.login-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.field {
  display: flex;
  flex-direction: column;
}
.field-label {
  margin-bottom: 0.4rem;
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--theme-text);
  transition: color 0.18s ease;
}
.field.is-focused .field-label {
  color: var(--theme-accent);
}
.field-control {
  position: relative;
  display: flex;
  align-items: stretch;
  min-height: 3rem;
  padding: 0 0.75rem 0 2.6rem;
  background: var(--theme-bg);
  border: 1px solid var(--theme-border);
  border-radius: 10px;
  transition: border-color 0.18s ease, box-shadow 0.22s ease;
}
.field--password .field-control {
  padding-right: 3rem;
}
.field.is-focused .field-control {
  border-color: var(--theme-accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--theme-accent) 16%, transparent);
}
.field-icon {
  position: absolute;
  top: 50%;
  left: 0.8rem;
  display: flex;
  color: var(--theme-muted);
  transform: translateY(-50%);
  transition: color 0.18s ease;
}
.field.is-focused .field-icon {
  color: var(--theme-accent);
}
.field-icon svg {
  width: 1.05rem;
  height: 1.05rem;
}
.field-input {
  flex: 1;
  width: 100%;
  min-height: 2.75rem;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--theme-text);
  font-family: inherit;
  font-size: 0.9375rem;
}
.field-input::placeholder {
  color: var(--theme-muted);
}
.field-input:disabled {
  cursor: not-allowed;
}
.field-toggle {
  position: absolute;
  top: 50%;
  right: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.75rem;
  height: 2.75rem;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--theme-muted);
  cursor: pointer;
  transform: translateY(-50%);
  transition: color 0.18s ease, background-color 0.18s ease;
}
.field-toggle:hover {
  color: var(--theme-text);
  background: color-mix(in srgb, var(--theme-accent) 10%, transparent);
}
.field-toggle:focus-visible {
  outline: 2px solid var(--theme-accent);
  outline-offset: 2px;
}
.field-toggle svg {
  width: 1.15rem;
  height: 1.15rem;
}

/* ========== 错误提示 ========== */
.login-error {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.625rem 0.75rem;
  border-radius: 10px;
  font-size: 0.8125rem;
  line-height: 1.5;
  color: #dc2626;
  background: color-mix(in srgb, #dc2626 9%, transparent);
  border: 1px solid color-mix(in srgb, #dc2626 26%, transparent);
}
.dark .login-error {
  color: #f87171;
  background: color-mix(in srgb, #f87171 14%, transparent);
  border-color: color-mix(in srgb, #f87171 30%, transparent);
}
.login-error svg {
  flex-shrink: 0;
  width: 1rem;
  height: 1rem;
  margin-top: 0.1rem;
}
.err-enter-active {
  animation: err-in 0.34s cubic-bezier(0.22, 1, 0.36, 1);
}
.err-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.err-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
@keyframes err-in {
  0% { opacity: 0; transform: translateY(-6px); }
  55% { opacity: 1; transform: translateY(0); }
  72% { transform: translateX(-3px); }
  86% { transform: translateX(3px); }
  100% { transform: translateX(0); }
}

/* ========== 提交按钮 ========== */
.login-submit {
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  width: 100%;
  min-height: 3rem;
  margin-top: 0.25rem;
  border: 0;
  border-radius: 10px;
  color: #fff;
  font-family: inherit;
  font-size: 0.9375rem;
  font-weight: 600;
  background: linear-gradient(135deg, color-mix(in srgb, var(--theme-accent) 88%, #fff), var(--theme-accent));
  box-shadow: 0 10px 24px -12px color-mix(in srgb, var(--theme-accent) 85%, transparent);
  cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.22s ease, filter 0.18s ease, opacity 0.18s ease;
}
.login-submit:hover:not(:disabled) {
  filter: brightness(1.06);
  box-shadow: 0 14px 30px -12px color-mix(in srgb, var(--theme-accent) 90%, transparent);
  transform: translateY(-1px);
}
.login-submit:active:not(:disabled) {
  transform: translateY(0) scale(0.985);
}
.login-submit:focus-visible {
  outline: 2px solid var(--theme-accent);
  outline-offset: 2px;
}
.login-submit:disabled {
  opacity: 0.55;
  box-shadow: none;
  cursor: not-allowed;
}
.login-submit-shine {
  position: absolute;
  top: 0;
  left: 0;
  width: 60%;
  height: 100%;
  pointer-events: none;
  background: linear-gradient(105deg, transparent, rgba(255, 255, 255, 0.38), transparent);
  transform: translateX(-160%) skewX(-18deg);
  transition: transform 0.65s ease;
}
.login-submit:hover:not(:disabled) .login-submit-shine {
  transform: translateX(220%) skewX(-18deg);
}
.login-spinner {
  width: 1.05rem;
  height: 1.05rem;
  animation: spinner-in 0.25s ease, spin 0.7s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
@keyframes spinner-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* ========== 页脚说明 ========== */
.login-hint {
  margin-top: 1.25rem;
  text-align: center;
  font-size: 0.75rem;
  color: var(--theme-muted);
}

/* ========== 响应式 ========== */
@media (max-width: 640px) {
  .login-card {
    padding: 1.5rem 1.25rem;
  }
  /* 16px 字号避免 iOS 聚焦时自动缩放 */
  .field-input {
    font-size: 1rem;
  }
  .field-control,
  .login-submit {
    min-height: 3.25rem;
  }
  .login-submit {
    font-size: 1rem;
  }
}
@media (max-width: 480px) {
  .ambient-glow--tl {
    width: 22rem;
    height: 22rem;
  }
  .ambient-glow--br {
    width: 24rem;
    height: 24rem;
  }
}
@media (min-width: 640px) {
  .login-page {
    padding: 2rem;
  }
  .login-card {
    padding: 1.75rem;
  }
}

/* ========== 无障碍：减少动效 ========== */
@media (prefers-reduced-motion: reduce) {
  .field-label,
  .field-control,
  .field-icon,
  .field-toggle,
  .login-submit,
  .login-submit-shine {
    transition: none;
  }
  .err-enter-active,
  .login-spinner {
    animation: none;
  }
}
</style>
