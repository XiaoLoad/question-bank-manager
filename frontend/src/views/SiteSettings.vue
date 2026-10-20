<script setup>
import { ref, reactive, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import gsap from 'gsap'
import { useApi } from '@/composables/useApi'
import { useToastStore } from '@/stores/toast'
import { useConfirmStore } from '@/stores/confirm'
import { gsapEasing } from '@/utils/motionTokens'
import PageHeader from '@/components/PageHeader.vue'
import SectionHeader from '@/components/SectionHeader.vue'

defineOptions({ name: 'SiteSettings' })

const api = useApi()
const toast = useToastStore()
const confirmStore = useConfirmStore()

const loading = ref(true)
const loadError = ref(false)
const saving = ref(false)
const savedFlash = ref(false)
const lastSavedAt = ref(null)
const dockOpen = ref(false)

// 暂存值（用户编辑只改这里，不触发接口）
const staged = reactive({
  site_name: '',
  site_description: '',
  announcement_modal: '',
  announcement_modal_enabled: false,
  announcement_banner: '',
  announcement_banner_enabled: false,
  app_version: 'v1.0.0',
  footer_text: '',
  footer_hitokoto: false,
  footer_hitokoto_types: 'a.b.c.d.e.f.g.h.i.j.k.l',
  footer_hitokoto_cache_minutes: 5,
})

// 服务端原始基线（保存成功或加载后更新）
const original = reactive({ ...staged })

// 一言类型配置
const hitokotoTypeOptions = [
  { key: 'a', label: '动画' }, { key: 'b', label: '漫画' }, { key: 'c', label: '游戏' },
  { key: 'd', label: '文学' }, { key: 'e', label: '原创' }, { key: 'f', label: '来自网络' },
  { key: 'g', label: '其他' }, { key: 'h', label: '影视' }, { key: 'i', label: '诗词' },
  { key: 'j', label: '网易云' }, { key: 'k', label: '哲学' }, { key: 'l', label: '抖机灵' },
]

// 字段中文名映射，用于暂存区变更明细
const fieldLabels = {
  site_name: '网站名称',
  site_description: '网站副标题',
  announcement_modal: '弹窗内容',
  announcement_modal_enabled: '启用弹窗公告',
  announcement_banner: '横幅内容',
  announcement_banner_enabled: '启用横幅公告',
  app_version: '版本号',
  footer_text: '页脚版权文字',
  footer_hitokoto: '一言模式',
  footer_hitokoto_types: '一言句子类型',
  footer_hitokoto_cache_minutes: '一言缓存时长',
}

// 网站名称/副标题长度上限（标题不宜过长）
const SITE_NAME_MAX = 30
const SITE_DESC_MAX = 60

const pageRef = ref(null)
const chipsRef = ref(null)

const reduceMotion = ref(false)
let revealObserver = null
let pointerFrame = 0
let savedTimer = null

/* ========== 派生状态 ========== */

// 预览地址：把站点名称转成可读的 slug，中文名回落到 home
const previewSlug = computed(() => {
  const ascii = String(staged.site_name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return ascii || 'home'
})

// 完整度只统计真正对外展示的内容字段，公告仅在启用时计入
const completenessFields = computed(() => {
  const fields = ['site_name', 'site_description', 'app_version', 'footer_text']
  if (staged.announcement_modal_enabled) fields.push('announcement_modal')
  if (staged.announcement_banner_enabled) fields.push('announcement_banner')
  return fields
})

const completion = computed(() => {
  const fields = completenessFields.value
  const filled = fields.filter((key) => String(staged[key] ?? '').trim()).length
  return Math.round((filled / fields.length) * 100)
})

// 环形进度：r = 30
const RING_C = 2 * Math.PI * 30
const ringOffset = computed(() => RING_C * (1 - completion.value / 100))

const statusItems = computed(() => [
  { label: '弹窗公告', on: staged.announcement_modal_enabled },
  { label: '横幅公告', on: staged.announcement_banner_enabled },
  { label: '页脚一言', on: staged.footer_hitokoto },
])

const hitokotoTypeCount = computed(() => staged.footer_hitokoto_types.split('.').filter(Boolean).length)
const hitokotoError = computed(() => staged.footer_hitokoto && hitokotoTypeCount.value === 0)

const cacheMinutes = computed(() => Number(staged.footer_hitokoto_cache_minutes) || 0)
const cacheAtMin = computed(() => cacheMinutes.value <= 1)
const cacheAtMax = computed(() => cacheMinutes.value >= 60)

const totalFields = Object.keys(staged).length

/* ========== 脏检测 ========== */

function sameValue(a, b) {
  if (typeof a === 'number' || typeof b === 'number') {
    if (a === '' || b === '' || a === null || b === null || a === undefined || b === undefined) return false
    return Number(a) === Number(b)
  }
  return a === b
}

// 一言类型只关心集合，顺序不同不算改动（避免取消再选回被误判）
function typeSignature(value) {
  return String(value || '').split('.').filter(Boolean).sort().join('.')
}

function isFieldDirty(key) {
  if (key === 'footer_hitokoto_types') return typeSignature(staged[key]) !== typeSignature(original[key])
  return !sameValue(staged[key], original[key])
}

// 逐字段对比暂存值与基线
const changedFields = computed(() => Object.keys(staged).filter((key) => isFieldDirty(key)))
const hasUnsavedChanges = computed(() => changedFields.value.length > 0)
const trayPercent = computed(() => Math.round((changedFields.value.length / totalFields) * 100))

const statusText = computed(() => (
  hasUnsavedChanges.value ? `有 ${changedFields.value.length} 项待发布` : '已与线上同步'
))

const publishLabel = computed(() => {
  if (saving.value) return '发布中'
  if (savedFlash.value) return '已发布'
  return '发布更改'
})

const lastSavedLabel = computed(() => {
  if (!lastSavedAt.value) return '当前展示的是服务器上的最新配置'
  const d = new Date(lastSavedAt.value)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `最近发布于 ${hh}:${mm}`
})

function formatValue(v) {
  if (v === '' || v === null || v === undefined) return '（空）'
  if (typeof v === 'boolean') return v ? '已开启' : '已关闭'
  if (typeof v === 'string' && /^[a-l](\.[a-l])*$/.test(v)) {
    const labels = v.split('.').filter(Boolean).map((k) => hitokotoTypeOptions.find((t) => t.key === k)?.label || k)
    return labels.length ? labels.join(' · ') : '（空）'
  }
  const s = String(v)
  // 变更栏长文本截断，避免无边界撑开
  return s.length > 80 ? `${s.slice(0, 80)}…` : s
}

// 未保存变更明细（原始值 vs 当前值）
const pendingChanges = computed(() => changedFields.value.map((key) => ({
  key,
  label: fieldLabels[key] || key,
  from: formatValue(original[key]),
  to: formatValue(staged[key]),
})))

/* ========== 一言交互 ========== */

function isHitokotoTypeSelected(key) {
  return staged.footer_hitokoto_types.split('.').includes(key)
}

function popChip(el) {
  if (reduceMotion.value || !el) return
  gsap.fromTo(
    el,
    { scale: 0.9 },
    {
      scale: 1,
      duration: 0.34,
      ease: gsapEasing.bounce,
      overwrite: 'auto',
      onComplete: () => gsap.set(el, { clearProps: 'transform' }),
    },
  )
}

function toggleHitokotoType(key, event) {
  const types = staged.footer_hitokoto_types.split('.').filter(Boolean)
  const idx = types.indexOf(key)
  if (idx >= 0) types.splice(idx, 1)
  else types.push(key)
  // 固定为选项顺序，避免「取消再选回」被误判成未保存改动
  types.sort((a, b) => hitokotoTypeOptions.findIndex((t) => t.key === a) - hitokotoTypeOptions.findIndex((t) => t.key === b))
  staged.footer_hitokoto_types = types.join('.')
  popChip(event?.currentTarget)
}

function bounceChips() {
  if (reduceMotion.value) return
  const chips = chipsRef.value?.querySelectorAll('.type-chip')
  if (!chips?.length) return
  gsap.fromTo(
    chips,
    { scale: 0.88 },
    {
      scale: 1,
      duration: 0.42,
      stagger: 0.018,
      ease: gsapEasing.bounce,
      overwrite: 'auto',
      onComplete: () => gsap.set(chips, { clearProps: 'transform' }),
    },
  )
}

function selectAllHitokotoTypes() {
  staged.footer_hitokoto_types = hitokotoTypeOptions.map((t) => t.key).join('.')
  bounceChips()
}

function clearAllHitokotoTypes() {
  staged.footer_hitokoto_types = ''
}

function bumpCache(delta) {
  const next = Number(staged.footer_hitokoto_cache_minutes) || 5
  staged.footer_hitokoto_cache_minutes = Math.min(60, Math.max(1, next + delta))
}

function clampCache() {
  const n = Number.parseInt(staged.footer_hitokoto_cache_minutes, 10)
  staged.footer_hitokoto_cache_minutes = Number.isFinite(n) ? Math.min(60, Math.max(1, n)) : 5
}

function revertField(key) {
  if (!(key in staged)) return
  staged[key] = original[key]
  if (key === 'footer_hitokoto_cache_minutes') clampCache()
}

/* ========== 数据读写 ========== */

// 将接口数据写入暂存（布尔字段统一为布尔）
function applyToStaged(data) {
  staged.site_name = data.site_name || ''
  staged.site_description = data.site_description || ''
  staged.announcement_modal = data.announcement_modal || ''
  staged.announcement_modal_enabled = data.announcement_modal_enabled || false
  staged.announcement_banner = data.announcement_banner || ''
  staged.announcement_banner_enabled = data.announcement_banner_enabled || false
  staged.app_version = data.app_version || 'v1.0.0'
  staged.footer_text = data.footer_text || ''
  staged.footer_hitokoto = data.footer_hitokoto || false
  staged.footer_hitokoto_types = data.footer_hitokoto_types || 'a.b.c.d.e.f.g.h.i.j.k.l'
  staged.footer_hitokoto_cache_minutes = data.footer_hitokoto_cache_minutes || 5
}

async function loadSettings() {
  loading.value = true
  loadError.value = false
  try {
    const data = await api.getSiteSettingsAll()
    applyToStaged(data)
    Object.assign(original, staged)
  } catch (e) {
    loadError.value = true
  } finally {
    loading.value = false
    await nextTick()
    initReveal()
    if (!loadError.value) animateRing()
  }
}

// 保存：仅提交已变更字段（布尔转字符串），成功后更新基线
async function handleSave() {
  if (!hasUnsavedChanges.value || saving.value) return
  clampCache()
  // 归一化后可能已无实际差异（例如只清空缓存时长又回到默认值）
  if (!hasUnsavedChanges.value) return
  if (hitokotoError.value) {
    toast.error('请至少保留一种一言句子类型')
    chipsRef.value?.scrollIntoView({ behavior: reduceMotion.value ? 'auto' : 'smooth', block: 'center' })
    return
  }

  saving.value = true
  savedFlash.value = false

  const patch = {}
  const snapshot = {}
  for (const key of changedFields.value) {
    let v = staged[key]
    if (key.endsWith('_enabled') || key === 'footer_hitokoto') v = v ? '1' : '0'
    if (key === 'footer_hitokoto_cache_minutes') v = String(v)
    patch[key] = v
    snapshot[key] = staged[key]
  }

  try {
    await api.updateSiteSettings(patch)
    // 只把已提交的字段写回基线：请求期间的新改动仍留在暂存区
    for (const key of Object.keys(snapshot)) original[key] = snapshot[key]
    lastSavedAt.value = Date.now()
    const hasMoreChanges = hasUnsavedChanges.value
    savedFlash.value = !hasMoreChanges
    if (!hasMoreChanges) dockOpen.value = false
    clearTimeout(savedTimer)
    savedTimer = setTimeout(() => { savedFlash.value = false }, 2400)
    toast.success(hasMoreChanges ? '已发布，新的改动仍保留在暂存区' : '网站设置已发布')
  } catch (e) {
    // 请求层已给出错误提示
  } finally {
    saving.value = false
  }
}

// 重置：所有暂存项恢复至基线
async function handleReset() {
  if (!hasUnsavedChanges.value) return
  const ok = await confirmStore.show({
    title: '放弃暂存改动？',
    message: `暂存区中的 ${pendingChanges.value.length} 项修改将恢复到上次发布的版本，此操作不可撤销。`,
    confirmText: '放弃修改',
    danger: true,
  })
  if (!ok) return
  Object.assign(staged, original)
  dockOpen.value = false
  toast.info('已放弃暂存改动')
}

/* ========== 动效 ========== */

// 光斑跟随指针；坐标保留在最后位置，移出时由 CSS 原地淡出
function moveSpotlight(event) {
  if (reduceMotion.value) return
  const el = event.currentTarget
  const rect = el.getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top
  if (pointerFrame) cancelAnimationFrame(pointerFrame)
  pointerFrame = requestAnimationFrame(() => {
    pointerFrame = 0
    el.style.setProperty('--mx', `${x}px`)
    el.style.setProperty('--my', `${y}px`)
  })
}

// 滚动入场：进入视口后只触发一次
function initReveal() {
  const nodes = pageRef.value?.querySelectorAll('[data-reveal]') || []
  if (!nodes.length) return
  if (reduceMotion.value || typeof IntersectionObserver === 'undefined') {
    nodes.forEach((node) => node.classList.add('is-revealed'))
    return
  }
  revealObserver?.disconnect()
  revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return
      entry.target.classList.add('is-revealed')
      observer.unobserve(entry.target)
    })
  }, { threshold: 0.06, rootMargin: '0px 0px -4% 0px' })
  nodes.forEach((node) => revealObserver.observe(node))
}

// 完整度环：首屏按当前百分比补间，避免静态渲染的钝感
function animateRing() {
  const el = pageRef.value?.querySelector('.ring-bar')
  if (!el || reduceMotion.value) return
  const target = Number(el.getAttribute('stroke-dashoffset') || 0)
  const previousTransition = el.style.transition
  el.style.transition = 'none'
  gsap.fromTo(
    el,
    { attr: { 'stroke-dashoffset': RING_C } },
    {
      attr: { 'stroke-dashoffset': target },
      duration: 1.1,
      delay: 0.18,
      ease: 'power3.out',
      onComplete: () => { el.style.transition = previousTransition },
    },
  )
}

// Ctrl / ⌘ + S 快速发布
function onKeydown(event) {
  if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 's') return
  event.preventDefault()
  if (hasUnsavedChanges.value) handleSave()
}

// 离开页面守卫：存在未保存变更时二次确认
function beforeUnloadHandler(e) {
  if (!hasUnsavedChanges.value) return
  e.preventDefault()
  e.returnValue = ''
}

onMounted(async () => {
  reduceMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  window.addEventListener('beforeunload', beforeUnloadHandler)
  window.addEventListener('keydown', onKeydown)
  await loadSettings()
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', beforeUnloadHandler)
  window.removeEventListener('keydown', onKeydown)
  clearTimeout(savedTimer)
  revealObserver?.disconnect()
  if (pointerFrame) cancelAnimationFrame(pointerFrame)
})

// 保存成功后自动收起移动端暂存条；重新编辑时撤销「已发布」态
watch(hasUnsavedChanges, (dirty) => {
  if (!dirty) {
    dockOpen.value = false
    return
  }
  savedFlash.value = false
})

// SPA 路由离开守卫（切换设置标签页/跳转其他页面）
onBeforeRouteLeave(async () => {
  if (!hasUnsavedChanges.value) return true
  return await confirmStore.show({
    title: '离开网站设置？',
    message: `还有 ${pendingChanges.value.length} 项改动尚未发布，离开后这些修改将丢失。`,
    confirmText: '仍然离开',
    danger: true,
  })
})
</script>

<template>
  <div ref="pageRef" class="site-settings">
    <!-- 加载骨架：结构与真实布局对应，避免加载完成时跳动 -->
    <div v-if="loading" class="sk-wrap" aria-busy="true" aria-label="正在加载网站设置">
      <div class="sk-head">
        <div class="sk-lines">
          <div class="skeleton sk-eyebrow" />
          <div class="skeleton sk-title" />
          <div class="skeleton sk-sub" />
        </div>
        <div class="skeleton sk-pill" />
      </div>
      <div class="skeleton sk-hero" />
      <div class="sk-grid">
        <div class="skeleton sk-panel" />
        <div class="skeleton sk-panel" />
      </div>
    </div>

    <!-- 加载失败 -->
    <div v-else-if="loadError" class="load-error">
      <span class="load-error-icon" aria-hidden="true">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
      </span>
      <h2>无法加载站点设置</h2>
      <p>请确认服务正在运行，或稍后重试。</p>
      <button type="button" class="btn-save-head" @click="loadSettings">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v6h6M20 20v-6h-6M20 9a8 8 0 00-14.06-3.06L4 8M4 15a8 8 0 0014.06 3.06L20 16" />
        </svg>
        <span>重新加载</span>
      </button>
    </div>

    <template v-else>
      <!-- ========== 页头 ========== -->
      <PageHeader
        eyebrow="站点配置"
        eyebrow-en="SITE IDENTITY"
        title="网站设置"
        description="定义访客看到的第一印象；改动先暂存，确认后发布。"
      >
        <template #actions>
          <span class="status-pill" :class="hasUnsavedChanges ? 'is-draft' : 'is-live'" role="status" aria-live="polite">
            <span class="status-dot" aria-hidden="true" />
            <span>{{ statusText }}</span>
          </span>
          <button
            type="button"
            class="btn-save-head"
            :class="{ 'is-saved': savedFlash }"
            :disabled="!hasUnsavedChanges || saving"
            title="保存并发布（Ctrl / ⌘ + S）"
            @click="handleSave"
          >
            <span v-if="saving" class="spinner" aria-hidden="true" />
            <svg v-else-if="savedFlash" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M5 13l4 4L19 7" />
            </svg>
            <svg v-else fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v10" />
            </svg>
            <span>{{ publishLabel }}</span>
          </button>
        </template>
      </PageHeader>

      <!-- ========== 移动端暂存条 ========== -->
      <Transition name="dock">
        <div v-if="hasUnsavedChanges" class="dock">
          <div class="dock-bar">
            <button
              type="button"
              class="dock-toggle"
              :aria-expanded="dockOpen"
              @click="dockOpen = !dockOpen"
            >
              <span class="dock-pulse" aria-hidden="true" />
              <span>{{ pendingChanges.length }} 项待发布</span>
              <svg class="dock-chevron" :class="{ 'is-open': dockOpen }" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <div class="dock-actions">
              <button type="button" class="dock-reset" :disabled="saving" aria-label="放弃全部修改" @click="handleReset">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M9 14L4 9l5-5M4 9h10a5 5 0 015 5v3" />
                </svg>
              </button>
              <button type="button" class="dock-save" :disabled="saving" @click="handleSave">
                <span>{{ saving ? '发布中' : savedFlash ? '已发布' : '发布' }}</span>
              </button>
            </div>
          </div>
          <div class="dock-panel" :class="{ 'is-open': dockOpen }">
            <div class="dock-scroll">
              <ul class="diff-list dock-list">
                <li v-for="c in pendingChanges" :key="c.key" class="diff-row">
                  <span class="diff-mark" aria-hidden="true" />
                  <div class="diff-main">
                    <div class="diff-top">
                      <span class="diff-label">{{ c.label }}</span>
                      <button type="button" class="revert-btn" :aria-label="`撤销${c.label}的修改`" title="撤销此项" @click="revertField(c.key)">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 14L4 9l5-5M4 9h10a5 5 0 015 5v3" />
                        </svg>
                      </button>
                    </div>
                    <div class="diff-values">
                      <span class="diff-old">{{ c.from }}</span>
                      <span class="diff-new">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14m-5-5l5 5-5 5" />
                        </svg>
                        <span>{{ c.to }}</span>
                      </span>
                    </div>
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </Transition>

      <!-- ========== 实时预览台 ========== -->
      <section
        class="console anim-rise"
        style="--d: 200ms"
        aria-label="站点实时预览"
        @pointermove="moveSpotlight"
      >
        <span class="console-orb console-orb--a" aria-hidden="true" />
        <span class="console-orb console-orb--b" aria-hidden="true" />
        <span class="console-grid" aria-hidden="true" />
        <span class="console-spot" aria-hidden="true" />

        <div class="console-inner">
          <div class="console-main">
            <div class="window-bar">
              <span class="window-dots" aria-hidden="true"><i /><i /><i /></span>
              <span class="window-url">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <span>preview.local</span>
                <span class="window-path">/{{ previewSlug }}</span>
              </span>
              <span class="window-live" :class="{ 'is-draft': hasUnsavedChanges }">
                <i aria-hidden="true" />
                {{ hasUnsavedChanges ? '草稿预览' : '实时预览' }}
              </span>
            </div>

            <div class="stage">
              <div class="stage-head">
                <div class="stage-brand">
                  <span class="stage-mark" aria-hidden="true">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                  </span>
                  <div class="stage-brand-text">
                    <p class="stage-name">{{ staged.site_name || '未命名站点' }}</p>
                    <p class="stage-desc">{{ staged.site_description || '还没有填写副标题' }}</p>
                  </div>
                </div>
                <span class="stage-version">{{ staged.app_version || 'v1.0.0' }}</span>
              </div>

              <Transition name="strip">
                <div v-if="staged.announcement_banner_enabled" class="stage-banner">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
                  </svg>
                  <span class="stage-banner-text">{{ staged.announcement_banner || '横幅公告内容为空，发布后不会展示' }}</span>
                  <span class="stage-banner-tag">横幅</span>
                </div>
              </Transition>

              <div class="stage-footer">
                <span class="stage-copy">{{ staged.footer_text || '未设置页脚版权文字' }}</span>
                <span v-if="staged.footer_hitokoto" class="stage-quote">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M7 8h10M7 12h6M21 12a9 9 0 11-4.6-7.83L21 3v9z" />
                  </svg>
                  一言 · 每 {{ cacheMinutes || 5 }} 分钟刷新
                </span>
                <span v-else class="stage-quote is-off">一言模式已关闭</span>
              </div>
            </div>
          </div>

          <aside class="console-side">
            <p class="side-label">配置概览</p>
            <div class="side-body">
              <div class="ring-wrap" :title="`已填写 ${Math.round((completion / 100) * completenessFields.length)} / ${completenessFields.length} 项内容`">
                <svg class="ring" viewBox="0 0 76 76" role="img" :aria-label="`配置完整度 ${completion}%`">
                  <defs>
                    <linearGradient id="ss-ring-grad" x1="0" y1="0" x2="1" y2="1">
                      <stop class="ring-stop-a" offset="0%" />
                      <stop class="ring-stop-b" offset="100%" />
                    </linearGradient>
                  </defs>
                  <circle class="ring-track" cx="38" cy="38" r="30" />
                  <circle
                    class="ring-bar"
                    cx="38"
                    cy="38"
                    r="30"
                    stroke="url(#ss-ring-grad)"
                    :stroke-dasharray="RING_C"
                    :stroke-dashoffset="ringOffset"
                    transform="rotate(-90 38 38)"
                  />
                </svg>
                <div class="ring-center">
                  <span class="ring-value">{{ completion }}<span>%</span></span>
                  <span class="ring-caption">完整度</span>
                </div>
              </div>

              <ul class="side-list">
                <li v-for="item in statusItems" :key="item.label" class="side-row">
                  <span class="side-dot" :class="{ 'is-on': item.on }" aria-hidden="true" />
                  <span class="side-name">{{ item.label }}</span>
                  <span class="side-state" :class="{ 'is-on': item.on }">{{ item.on ? '已启用' : '未启用' }}</span>
                </li>
              </ul>
            </div>

            <p class="side-note">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              改动仅停留在暂存区，发布后才对访客生效。
            </p>
          </aside>
        </div>
      </section>

      <!-- ========== 设置主体 ========== -->
      <div class="workspace">
        <div class="sections">
          <!-- 01 站点身份 -->
          <section class="section" data-reveal>
            <SectionHeader index="01" title="站点身份" hint="名称、副标题与版本标识" />

            <div class="panel">
              <div class="panel-body">
                <div class="identity-grid">
                  <div class="field">
                    <div class="field-top">
                      <label class="field-label" for="ss-site-name">网站名称</label>
                      <span class="field-flags">
                        <span v-if="isFieldDirty('site_name')" class="dirty-dot" title="该项有未发布改动" />
                        <span
                          class="counter"
                          :class="{
                            'is-near': staged.site_name.length >= SITE_NAME_MAX - 5 && staged.site_name.length < SITE_NAME_MAX,
                            'is-full': staged.site_name.length >= SITE_NAME_MAX,
                          }"
                        >
                          {{ staged.site_name.length }}<span>/{{ SITE_NAME_MAX }}</span>
                        </span>
                      </span>
                    </div>
                    <div class="field-shell">
                      <svg class="field-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                      </svg>
                      <input
                        id="ss-site-name"
                        v-model="staged.site_name"
                        type="text"
                        class="field-input"
                        :maxlength="SITE_NAME_MAX"
                        placeholder="题库管理"
                        autocomplete="off"
                        spellcheck="false"
                      />
                    </div>
                    <p class="field-hint">显示在侧栏顶部，是站点对外的主要标识。</p>
                  </div>

                  <div class="field">
                    <div class="field-top">
                      <label class="field-label" for="ss-app-version">版本号</label>
                      <span class="field-flags">
                        <span v-if="isFieldDirty('app_version')" class="dirty-dot" title="该项有未发布改动" />
                      </span>
                    </div>
                    <div class="field-shell">
                      <svg class="field-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                      </svg>
                      <input
                        id="ss-app-version"
                        v-model="staged.app_version"
                        type="text"
                        class="field-input"
                        maxlength="20"
                        placeholder="v1.0.0"
                        autocomplete="off"
                        spellcheck="false"
                      />
                    </div>
                    <p class="field-hint">关于页展示的版本标识；接入更新日志后以最新标签为准。</p>
                  </div>

                  <div class="field field--wide">
                    <div class="field-top">
                      <label class="field-label" for="ss-site-desc">网站副标题</label>
                      <span class="field-flags">
                        <span v-if="isFieldDirty('site_description')" class="dirty-dot" title="该项有未发布改动" />
                        <span
                          class="counter"
                          :class="{
                            'is-near': staged.site_description.length >= SITE_DESC_MAX - 10 && staged.site_description.length < SITE_DESC_MAX,
                            'is-full': staged.site_description.length >= SITE_DESC_MAX,
                          }"
                        >
                          {{ staged.site_description.length }}<span>/{{ SITE_DESC_MAX }}</span>
                        </span>
                      </span>
                    </div>
                    <div class="field-shell">
                      <svg class="field-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" d="M4 6h16M4 12h16M4 18h10" />
                      </svg>
                      <input
                        id="ss-site-desc"
                        v-model="staged.site_description"
                        type="text"
                        class="field-input"
                        :maxlength="SITE_DESC_MAX"
                        placeholder="Question Bank"
                        autocomplete="off"
                        spellcheck="false"
                      />
                    </div>
                    <p class="field-hint">侧栏标题下方的一行说明，简短比完整更重要。</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <!-- 02 公告系统 -->
          <section class="section" data-reveal>
            <SectionHeader index="02" title="公告系统" hint="按场景选择弹窗或横幅" />

            <div class="announce-grid">
              <!-- 弹窗公告 -->
              <article
                class="panel announce-card"
                :class="{ 'is-dirty': isFieldDirty('announcement_modal') || isFieldDirty('announcement_modal_enabled') }"
              >
                <header class="announce-head">
                  <span class="head-icon" aria-hidden="true">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
                    </svg>
                  </span>
                  <div class="head-text">
                    <div class="head-title-line">
                      <h3>弹窗公告</h3>
                      <span
                        v-if="isFieldDirty('announcement_modal') || isFieldDirty('announcement_modal_enabled')"
                        class="dirty-chip"
                      >未发布</span>
                    </div>
                    <p>登录或打开页面时弹出，支持 Markdown</p>
                  </div>
                  <button
                    type="button"
                    class="switch"
                    :class="{ 'is-on': staged.announcement_modal_enabled }"
                    role="switch"
                    :aria-checked="staged.announcement_modal_enabled"
                    aria-label="启用弹窗公告"
                    @click="staged.announcement_modal_enabled = !staged.announcement_modal_enabled"
                  >
                    <span class="switch-track"><span class="switch-thumb" /></span>
                    <span class="switch-label">{{ staged.announcement_modal_enabled ? '已启用' : '已关闭' }}</span>
                  </button>
                </header>

                <div class="announce-body">
                  <div class="field">
                    <div class="field-top">
                      <label class="field-label" for="ss-modal">公告内容</label>
                      <span class="field-flags">
                        <span v-if="isFieldDirty('announcement_modal')" class="dirty-dot" title="该项有未发布改动" />
                        <span class="counter counter--plain">{{ staged.announcement_modal.length }} 字</span>
                      </span>
                    </div>
                    <textarea
                      id="ss-modal"
                      v-model="staged.announcement_modal"
                      rows="6"
                      class="textarea"
                      placeholder="输入弹窗公告内容，支持 Markdown 语法…"
                      spellcheck="false"
                    />
                    <div class="md-hints">
                      <span class="md-chip"><code>##</code> 标题</span>
                      <span class="md-chip"><code>-</code> 列表</span>
                      <span class="md-chip"><code>**</code> 加粗</span>
                      <span class="md-chip"><code>[]()</code> 链接</span>
                    </div>
                    <p v-if="staged.announcement_modal_enabled && !staged.announcement_modal.trim()" class="field-warn">
                      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                      </svg>
                      内容为空，发布后不会展示弹窗。
                    </p>
                  </div>
                </div>
              </article>

              <!-- 横幅公告 -->
              <article
                class="panel announce-card"
                :class="{ 'is-dirty': isFieldDirty('announcement_banner') || isFieldDirty('announcement_banner_enabled') }"
              >
                <header class="announce-head">
                  <span class="head-icon" aria-hidden="true">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </span>
                  <div class="head-text">
                    <div class="head-title-line">
                      <h3>横幅公告</h3>
                      <span
                        v-if="isFieldDirty('announcement_banner') || isFieldDirty('announcement_banner_enabled')"
                        class="dirty-chip"
                      >未发布</span>
                    </div>
                    <p>常驻页面顶部的轻量提醒</p>
                  </div>
                  <button
                    type="button"
                    class="switch"
                    :class="{ 'is-on': staged.announcement_banner_enabled }"
                    role="switch"
                    :aria-checked="staged.announcement_banner_enabled"
                    aria-label="启用横幅公告"
                    @click="staged.announcement_banner_enabled = !staged.announcement_banner_enabled"
                  >
                    <span class="switch-track"><span class="switch-thumb" /></span>
                    <span class="switch-label">{{ staged.announcement_banner_enabled ? '已启用' : '已关闭' }}</span>
                  </button>
                </header>

                <div class="announce-body">
                  <div class="field">
                    <div class="field-top">
                      <label class="field-label" for="ss-banner">横幅内容</label>
                      <span class="field-flags">
                        <span v-if="isFieldDirty('announcement_banner')" class="dirty-dot" title="该项有未发布改动" />
                        <span class="counter counter--plain">{{ staged.announcement_banner.length }} 字</span>
                      </span>
                    </div>
                    <textarea
                      id="ss-banner"
                      v-model="staged.announcement_banner"
                      rows="3"
                      class="textarea textarea--short"
                      placeholder="简短提醒，如：系统维护中，预计 22:00 恢复…"
                      spellcheck="false"
                    />
                    <p class="field-hint">展示在内容区顶部，建议控制在两行以内。</p>
                    <p v-if="staged.announcement_banner_enabled && !staged.announcement_banner.trim()" class="field-warn">
                      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                      </svg>
                      内容为空，发布后不会展示横幅。
                    </p>
                  </div>
                </div>
              </article>
            </div>
          </section>

          <!-- 03 页脚与一言 -->
          <section class="section" data-reveal>
            <SectionHeader index="03" title="页脚与一言" hint="版权、随机句子与刷新节奏" />

            <div class="panel">
              <div class="panel-body">
                <div class="field">
                  <div class="field-top">
                    <label class="field-label" for="ss-footer-text">页脚版权文字</label>
                    <span class="field-flags">
                      <span v-if="isFieldDirty('footer_text')" class="dirty-dot" title="该项有未发布改动" />
                      <span class="counter counter--plain">{{ staged.footer_text.length }} 字</span>
                    </span>
                  </div>
                  <div class="field-shell">
                    <svg class="field-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <input
                      id="ss-footer-text"
                      v-model="staged.footer_text"
                      type="text"
                      class="field-input"
                      placeholder="© 2026 题库管理 · All rights reserved."
                      autocomplete="off"
                      spellcheck="false"
                    />
                  </div>
                  <p class="field-hint">开启一言后，这段文字会作为引用来源前缀显示。</p>
                </div>

                <div class="sub-block">
                  <div class="sub-head">
                    <div class="sub-title">
                      <span class="sub-mark" aria-hidden="true" />
                      <div>
                        <h3>页脚一言</h3>
                        <p>从 Hitokoto 随机取一句，显示在页脚</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      class="switch"
                      :class="{ 'is-on': staged.footer_hitokoto }"
                      role="switch"
                      :aria-checked="staged.footer_hitokoto"
                      aria-label="启用页脚一言"
                      @click="staged.footer_hitokoto = !staged.footer_hitokoto"
                    >
                      <span class="switch-track"><span class="switch-thumb" /></span>
                      <span class="switch-label">{{ staged.footer_hitokoto ? '已启用' : '已关闭' }}</span>
                    </button>
                  </div>

                  <div class="hitokoto-wrap" :class="{ 'is-open': staged.footer_hitokoto }" :inert="!staged.footer_hitokoto">
                    <div class="hitokoto-inner">
                      <div class="hitokoto-body">
                        <div class="chips-head">
                          <p class="chips-label">
                            句子类型
                            <span class="chips-count">{{ hitokotoTypeCount }}/{{ hitokotoTypeOptions.length }}</span>
                          </p>
                          <div class="chips-actions">
                            <button type="button" class="chip-action" @click="selectAllHitokotoTypes">全选</button>
                            <span class="chips-sep" aria-hidden="true" />
                            <button type="button" class="chip-action" @click="clearAllHitokotoTypes">清空</button>
                          </div>
                        </div>

                        <div ref="chipsRef" class="chips">
                          <button
                            v-for="t in hitokotoTypeOptions"
                            :key="t.key"
                            type="button"
                            class="type-chip"
                            :class="{ 'is-active': isHitokotoTypeSelected(t.key) }"
                            :aria-pressed="isHitokotoTypeSelected(t.key)"
                            :aria-label="`${isHitokotoTypeSelected(t.key) ? '取消' : '选择'}${t.label}`"
                            @click="toggleHitokotoType(t.key, $event)"
                          >
                            <span class="type-key">
                              <svg v-if="isHitokotoTypeSelected(t.key)" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                              </svg>
                              <template v-else>{{ t.key }}</template>
                            </span>
                            <span class="type-name">{{ t.label }}</span>
                          </button>
                        </div>

                        <p v-if="hitokotoError" class="field-error">
                          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                          </svg>
                          至少保留一种句子类型，否则无法发布。
                        </p>

                        <div class="cache-row">
                          <div class="cache-copy">
                            <p class="cache-title">缓存时长</p>
                            <p class="cache-hint">所有访客共享同一条一言，到期后自动刷新</p>
                          </div>
                          <div class="stepper">
                            <button
                              type="button"
                              class="stepper-btn"
                              :disabled="cacheAtMin"
                              aria-label="减少一分钟"
                              @click="bumpCache(-1)"
                            >−</button>
                            <input
                              v-model.number="staged.footer_hitokoto_cache_minutes"
                              class="stepper-input"
                              type="number"
                              min="1"
                              max="60"
                              aria-label="一言缓存时长（分钟）"
                              @blur="clampCache"
                            />
                            <button
                              type="button"
                              class="stepper-btn"
                              :disabled="cacheAtMax"
                              aria-label="增加一分钟"
                              @click="bumpCache(1)"
                            >+</button>
                            <span class="stepper-unit">分钟</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>

        <!-- ========== 改动暂存区（桌面） ========== -->
        <aside class="tray anim-rise" style="--d: 320ms" aria-label="改动暂存区">
          <div class="tray-head">
            <span class="tray-icon" aria-hidden="true">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </span>
            <div class="tray-title">
              <h2>改动暂存区</h2>
              <p>{{ hasUnsavedChanges ? '确认后一次性发布' : '所有配置均已发布' }}</p>
            </div>
            <span class="tray-badge" :class="{ 'is-empty': !hasUnsavedChanges }" :key="pendingChanges.length">
              {{ pendingChanges.length }}
            </span>
          </div>

          <div class="tray-progress" aria-hidden="true">
            <span :style="{ width: `${trayPercent}%` }" />
          </div>

          <div class="tray-body">
            <Transition name="tray-swap" mode="out-in">
              <div v-if="hasUnsavedChanges" key="list" class="tray-list">
                <p class="tray-meta">{{ pendingChanges.length }} 项待发布 · 共 {{ totalFields }} 项配置</p>
                <ul class="diff-list">
                  <li v-for="c in pendingChanges" :key="c.key" class="diff-row">
                    <span class="diff-mark" aria-hidden="true" />
                    <div class="diff-main">
                      <div class="diff-top">
                        <span class="diff-label">{{ c.label }}</span>
                        <button type="button" class="revert-btn" :aria-label="`撤销${c.label}的修改`" title="撤销此项" @click="revertField(c.key)">
                          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 14L4 9l5-5M4 9h10a5 5 0 015 5v3" />
                          </svg>
                        </button>
                      </div>
                      <div class="diff-values">
                        <span class="diff-old">{{ c.from }}</span>
                        <span class="diff-new">
                          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14m-5-5l5 5-5 5" />
                          </svg>
                          <span>{{ c.to }}</span>
                        </span>
                      </div>
                    </div>
                  </li>
                </ul>
                <p class="tray-note" :class="{ 'is-blocked': hitokotoError }">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {{ hitokotoError ? '一言句子类型为空，补全后才能发布。' : '改动暂存在当前页面，发布后才会对访客生效。' }}
                </p>
              </div>

              <div v-else key="empty" class="tray-empty">
                <span class="empty-icon" aria-hidden="true">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M5 13l4 4L19 7" />
                  </svg>
                </span>
                <p class="empty-title">已与线上同步</p>
                <p class="empty-desc">编辑配置后，改动会先在这里汇总；确认无误再一次性发布。</p>
                <p class="empty-time">{{ lastSavedLabel }}</p>
              </div>
            </Transition>
          </div>

          <div class="tray-foot">
            <button
              type="button"
              class="btn-publish"
              :class="{ 'is-saved': savedFlash }"
              :disabled="!hasUnsavedChanges || saving"
              title="保存并发布（Ctrl / ⌘ + S）"
              @click="handleSave"
            >
              <span v-if="saving" class="spinner" aria-hidden="true" />
              <svg v-else-if="savedFlash" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M5 13l4 4L19 7" />
              </svg>
              <svg v-else fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v10" />
              </svg>
              <span>{{ publishLabel }}</span>
              <span v-if="hasUnsavedChanges && !saving && !savedFlash" class="btn-count">{{ pendingChanges.length }}</span>
            </button>
            <button type="button" class="btn-quiet" :disabled="!hasUnsavedChanges || saving" @click="handleReset">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M9 14L4 9l5-5M4 9h10a5 5 0 015 5v3" />
              </svg>
              放弃修改
            </button>
          </div>
        </aside>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* ==========================================================================
   站点设置 · 设计变量
   ========================================================================== */
.site-settings {
  --ss-accent: var(--theme-accent);
  --ss-border: var(--theme-border);
  --ss-text: var(--theme-text);
  --ss-muted: var(--theme-muted);
  --ss-surface: var(--theme-surface);
  --ss-warn: #b45309;
  --ss-ok: #15803d;
  --ss-info: #1d4ed8;
  --ss-muted-strong: color-mix(in srgb, var(--theme-muted) 62%, var(--theme-text));
  --ss-accent-text: color-mix(in srgb, var(--theme-accent) 82%, var(--theme-text));
  --ss-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace;
  --ss-radius: 14px;
}

.dark .site-settings {
  --ss-warn: #fbbf24;
  --ss-ok: #4ade80;
  --ss-info: #93c5fd;
}

/* ==========================================================================
   入场与滚动揭示
   ========================================================================== */
.anim-rise {
  animation: ss-rise 0.62s cubic-bezier(0.22, 1, 0.36, 1) backwards;
  animation-delay: var(--d, 0ms);
}

@keyframes ss-rise {
  from {
    opacity: 0;
    transform: translateY(14px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

[data-reveal] {
  opacity: 0;
  transform: translateY(16px);
  transition:
    opacity 0.7s cubic-bezier(0.22, 1, 0.36, 1),
    transform 0.7s cubic-bezier(0.22, 1, 0.36, 1);
}

[data-reveal].is-revealed {
  opacity: 1;
  transform: none;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 30px;
  padding: 0 11px;
  border: 1px solid var(--ss-border);
  border-radius: 999px;
  background: color-mix(in srgb, var(--theme-text) 3%, var(--ss-surface));
  color: var(--ss-muted);
  font-size: 11.5px;
  font-weight: 600;
  white-space: nowrap;
  transition: background 0.25s ease, border-color 0.25s ease, color 0.25s ease;
}

.status-pill.is-draft {
  border-color: color-mix(in srgb, #f59e0b 32%, var(--ss-border));
  background: color-mix(in srgb, #f59e0b 9%, var(--ss-surface));
  color: var(--ss-warn);
}

.status-pill.is-live {
  border-color: color-mix(in srgb, #22c55e 26%, var(--ss-border));
  background: color-mix(in srgb, #22c55e 8%, var(--ss-surface));
  color: var(--ss-ok);
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.status-pill.is-draft .status-dot {
  box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.16);
  animation: ss-pulse 2.2s ease-in-out infinite;
}

.status-pill.is-live .status-dot {
  box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.14);
}

@keyframes ss-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.btn-save-head {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 32px;
  padding: 0 13px;
  border: 1px solid transparent;
  border-radius: 9px;
  background: var(--ss-accent);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  box-shadow: 0 8px 18px -12px color-mix(in srgb, var(--theme-accent) 80%, transparent);
  transition:
    transform 0.18s cubic-bezier(0.22, 1, 0.36, 1),
    box-shadow 0.2s ease,
    background 0.2s ease,
    color 0.2s ease,
    opacity 0.2s ease;
}

.btn-save-head svg {
  width: 13px;
  height: 13px;
}

.btn-save-head:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 12px 22px -12px color-mix(in srgb, var(--theme-accent) 85%, transparent);
}

.btn-save-head:active:not(:disabled) {
  transform: scale(0.975);
}

.btn-save-head:disabled {
  background: color-mix(in srgb, var(--theme-text) 6%, transparent);
  color: var(--ss-muted);
  box-shadow: none;
  cursor: not-allowed;
  opacity: 0.85;
}

.btn-save-head.is-saved {
  background: var(--ss-ok);
  color: #fff;
}

.spinner {
  width: 12px;
  height: 12px;
  border: 1.5px solid rgba(255, 255, 255, 0.35);
  border-top-color: #fff;
  border-radius: 50%;
  animation: ss-spin 0.7s linear infinite;
}

@keyframes ss-spin {
  to { transform: rotate(360deg); }
}

/* ==========================================================================
   实时预览台
   ========================================================================== */
.console {
  --mx: 50%;
  --my: 20%;
  position: relative;
  isolation: isolate;
  overflow: hidden;
  margin-bottom: 26px;
  border: 1px solid var(--ss-border);
  border-radius: 18px;
  background: var(--ss-surface);
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.03),
    0 30px 60px -48px color-mix(in srgb, var(--theme-accent) 60%, transparent);
}

.dark .console {
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.4),
    0 30px 70px -46px rgba(0, 0, 0, 0.8);
}

.console::after {
  content: '';
  position: absolute;
  inset: 0 0 auto;
  height: 1px;
  background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--theme-accent) 45%, transparent), transparent);
  opacity: 0.75;
  pointer-events: none;
}

.console-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(52px);
  pointer-events: none;
}

.console-orb--a {
  top: -110px;
  right: 12%;
  width: 260px;
  height: 260px;
  background: color-mix(in srgb, var(--theme-accent) 16%, transparent);
  animation: ss-orb-a 20s ease-in-out infinite alternate;
}

.console-orb--b {
  bottom: -130px;
  left: -30px;
  width: 210px;
  height: 210px;
  background: color-mix(in srgb, var(--theme-accent) 8%, transparent);
  animation: ss-orb-b 26s ease-in-out infinite alternate;
}

@keyframes ss-orb-a {
  from { transform: translate3d(0, 0, 0) scale(1); }
  to { transform: translate3d(-24px, 18px, 0) scale(1.08); }
}

@keyframes ss-orb-b {
  from { transform: translate3d(0, 0, 0) scale(1); }
  to { transform: translate3d(20px, -16px, 0) scale(1.06); }
}

.console-grid {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: radial-gradient(circle at 1px 1px, color-mix(in srgb, var(--theme-text) 13%, transparent) 1px, transparent 0);
  background-size: 22px 22px;
  opacity: 0.42;
  -webkit-mask-image: radial-gradient(ellipse 80% 100% at 28% 0%, #000 0%, transparent 74%);
  mask-image: radial-gradient(ellipse 80% 100% at 28% 0%, #000 0%, transparent 74%);
}

.console-spot {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(360px circle at var(--mx) var(--my), color-mix(in srgb, var(--theme-accent) 10%, transparent), transparent 70%);
  opacity: 0;
  transition: opacity 0.45s ease;
}

.console:hover .console-spot {
  opacity: 1;
}

.console-inner {
  position: relative;
  z-index: 2;
  display: grid;
  gap: 14px;
  padding: 14px;
}

@media (min-width: 1024px) {
  .console-inner {
    grid-template-columns: minmax(0, 1fr) 244px;
    gap: 22px;
    padding: 16px 18px 18px;
  }
}

.console-main {
  min-width: 0;
}

.window-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 1px 2px 12px;
}

.window-dots {
  display: inline-flex;
  gap: 5px;
  flex-shrink: 0;
}

.window-dots i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--theme-text) 14%, transparent);
}

.window-dots i:first-child {
  background: color-mix(in srgb, var(--theme-accent) 55%, transparent);
}

.window-url {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  height: 24px;
  padding: 0 10px;
  border: 1px solid color-mix(in srgb, var(--ss-border) 82%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--theme-text) 3%, transparent);
  color: var(--ss-muted);
  font-family: var(--ss-mono);
  font-size: 10px;
  letter-spacing: 0.01em;
  white-space: nowrap;
  overflow: hidden;
}

.window-url > span {
  overflow: hidden;
  text-overflow: ellipsis;
}

.window-url svg {
  width: 10px;
  height: 10px;
  flex-shrink: 0;
  opacity: 0.7;
}

.window-path {
  color: var(--ss-text);
}

.window-live {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  font-family: var(--ss-mono);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ss-muted);
  white-space: nowrap;
  transition: color 0.25s ease;
}

.window-live i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--ss-accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--theme-accent) 12%, transparent);
  animation: ss-pulse 2.4s ease-in-out infinite;
}

.window-live.is-draft {
  color: var(--ss-warn);
}

.window-live.is-draft i {
  background: #f59e0b;
  box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.16);
}

.stage {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 188px;
  padding: 18px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--ss-border) 90%, transparent);
  border-radius: 12px;
  background: linear-gradient(180deg, color-mix(in srgb, var(--theme-text) 2%, var(--theme-bg)), var(--theme-bg));
}

.stage::before {
  content: '';
  position: absolute;
  top: -90px;
  right: -50px;
  width: 200px;
  height: 200px;
  border-radius: 50%;
  background: radial-gradient(circle, color-mix(in srgb, var(--theme-accent) 11%, transparent), transparent 70%);
  pointer-events: none;
}

.stage-head {
  position: relative;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.stage-brand {
  display: flex;
  align-items: center;
  gap: 11px;
  min-width: 0;
}

.stage-mark {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border: 1px solid color-mix(in srgb, var(--theme-accent) 18%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--theme-accent) 11%, transparent);
  color: var(--ss-accent);
}

.stage-mark svg {
  width: 18px;
  height: 18px;
}

.stage-brand-text {
  min-width: 0;
}

.stage-name {
  overflow: hidden;
  font-size: 1.0625rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--ss-text);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stage-desc {
  overflow: hidden;
  margin-top: 2px;
  font-size: 11.5px;
  color: var(--ss-muted);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stage-version {
  flex-shrink: 0;
  max-width: 96px;
  overflow: hidden;
  padding: 3px 8px;
  border: 1px solid var(--ss-border);
  border-radius: 6px;
  background: color-mix(in srgb, var(--theme-text) 3%, transparent);
  color: var(--ss-muted);
  font-family: var(--ss-mono);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stage-banner {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid color-mix(in srgb, #3b82f6 26%, var(--ss-border));
  border-radius: 8px;
  background: color-mix(in srgb, #3b82f6 8%, transparent);
  color: var(--ss-info);
  font-size: 11.5px;
}

.stage-banner > svg {
  width: 13px;
  height: 13px;
  flex-shrink: 0;
}

.stage-banner-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stage-banner-tag {
  flex-shrink: 0;
  padding: 1px 5px;
  border-radius: 4px;
  background: color-mix(in srgb, #3b82f6 15%, transparent);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.06em;
}

.stage-footer {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: auto;
  padding-top: 13px;
  border-top: 1px dashed color-mix(in srgb, var(--ss-border) 85%, transparent);
}

.stage-copy {
  font-size: 10.5px;
  color: var(--ss-muted);
}

.stage-quote {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 10.5px;
  color: var(--ss-accent);
}

.stage-quote svg {
  width: 12px;
  height: 12px;
}

.stage-quote.is-off {
  color: var(--ss-muted);
  opacity: 0.85;
}

.strip-enter-active,
.strip-leave-active {
  transition: opacity 0.3s ease, transform 0.32s cubic-bezier(0.22, 1, 0.36, 1);
}

.strip-enter-from,
.strip-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

/* 预览台右栏 */
/* 预览台右栏：仅桌面展示，移动端把首屏留给设置本身 */
.console-side {
  display: none;
}

@media (min-width: 1024px) {
  .console-side {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
    padding-top: 4px;
    padding-left: 22px;
    border-left: 1px solid color-mix(in srgb, var(--ss-border) 85%, transparent);
  }
}

.side-label {
  font-family: var(--ss-mono);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--ss-muted);
}

.side-body {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
}

.ring-wrap {
  position: relative;
  width: 76px;
  height: 76px;
}

.ring {
  width: 76px;
  height: 76px;
}

.ring-track {
  fill: none;
  stroke: color-mix(in srgb, var(--theme-text) 10%, transparent);
  stroke-width: 6;
}

.ring-stop-a {
  stop-color: var(--theme-accent);
}

.ring-stop-b {
  stop-color: color-mix(in srgb, var(--theme-accent) 45%, var(--theme-text));
}

.ring-bar {
  fill: none;
  stroke-width: 6;
  stroke-linecap: round;
  transition: stroke-dashoffset 0.9s cubic-bezier(0.22, 1, 0.36, 1);
}

.ring-center {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
}

.ring-value {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
  color: var(--ss-text);
}

.ring-value span {
  margin-left: 1px;
  font-size: 9px;
  font-weight: 600;
  color: var(--ss-muted);
}

.ring-caption {
  font-size: 8.5px;
  letter-spacing: 0.06em;
  color: var(--ss-muted);
}

.side-list {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.side-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px dashed color-mix(in srgb, var(--ss-border) 70%, transparent);
  font-size: 11px;
}

.side-row:last-child {
  border-bottom: 0;
}

.side-dot {
  width: 5px;
  height: 5px;
  border: 1px solid color-mix(in srgb, var(--theme-text) 25%, transparent);
  border-radius: 50%;
  flex-shrink: 0;
  transition: background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
}

.side-dot.is-on {
  border-color: transparent;
  background: var(--ss-accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--theme-accent) 10%, transparent);
}

.side-name {
  color: var(--ss-text);
}

.side-state {
  margin-left: auto;
  font-size: 10px;
  color: var(--ss-muted);
}

.side-state.is-on {
  font-weight: 600;
  color: var(--ss-accent);
}

.side-note {
  display: flex;
  gap: 6px;
  margin-top: auto;
  padding-top: 4px;
  font-size: 9.5px;
  line-height: 1.6;
  color: var(--ss-muted);
}

.side-note svg {
  width: 11px;
  height: 11px;
  flex-shrink: 0;
  margin-top: 1px;
  opacity: 0.7;
}

/* ==========================================================================
   设置主体与分节
   ========================================================================== */
.workspace {
  display: block;
}

@media (min-width: 1280px) {
  .workspace {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 318px;
    align-items: start;
    gap: 24px;
  }
}

.sections {
  display: flex;
  flex-direction: column;
  gap: 26px;
  min-width: 0;
}

.section {
  min-width: 0;
}

.panel {
  position: relative;
  border: 1px solid var(--ss-border);
  border-radius: var(--ss-radius);
  background: var(--ss-surface);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.025);
  transition: border-color 0.25s ease, box-shadow 0.25s ease;
}

.dark .panel {
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
}

.panel:focus-within {
  border-color: color-mix(in srgb, var(--theme-accent) 34%, var(--ss-border));
  box-shadow:
    0 0 0 3px color-mix(in srgb, var(--theme-accent) 6%, transparent),
    0 1px 2px rgba(0, 0, 0, 0.03);
}

.panel-body {
  padding: 18px;
}

@media (min-width: 640px) {
  .panel-body {
    padding: 20px 22px;
  }
}

/* 字段 */
.identity-grid {
  display: grid;
  gap: 16px;
}

@media (min-width: 640px) {
  .identity-grid {
    grid-template-columns: minmax(0, 1.5fr) minmax(0, 0.8fr);
  }

  .identity-grid .field--wide {
    grid-column: 1 / -1;
  }
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.field-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.field-label {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.005em;
  color: var(--ss-text);
}

.field-flags {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.dirty-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #f59e0b;
  box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.14);
}

.counter {
  padding: 1px 6px;
  border-radius: 5px;
  background: color-mix(in srgb, var(--theme-text) 5%, transparent);
  color: var(--ss-muted);
  font-family: var(--ss-mono);
  font-size: 9.5px;
  font-variant-numeric: tabular-nums;
  transition: color 0.2s ease, background 0.2s ease;
}

.counter span {
  opacity: 0.55;
}

.counter.is-near {
  background: color-mix(in srgb, #f59e0b 12%, transparent);
  color: var(--ss-warn);
}

.counter.is-full {
  background: color-mix(in srgb, #ef4444 12%, transparent);
  color: #dc2626;
}

.dark .counter.is-full {
  color: #f87171;
}

.counter--plain {
  padding-right: 0;
  background: transparent;
}

.field-shell {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 42px;
  padding: 0 12px;
  border: 1px solid var(--ss-border);
  border-radius: 9px;
  background: color-mix(in srgb, var(--theme-text) 2.5%, var(--theme-bg));
  transition: border-color 0.2s ease, box-shadow 0.22s ease, background 0.22s ease;
}

.field-shell:hover {
  border-color: color-mix(in srgb, var(--theme-accent) 25%, var(--ss-border));
}

.field-shell:focus-within {
  border-color: var(--ss-accent);
  background: var(--ss-surface);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--theme-accent) 13%, transparent);
}

.field-icon {
  width: 15px;
  height: 15px;
  flex-shrink: 0;
  color: color-mix(in srgb, var(--ss-muted) 85%, transparent);
  transition: color 0.2s ease;
}

.field-shell:focus-within .field-icon {
  color: var(--ss-accent);
}

.field-input {
  flex: 1;
  min-width: 0;
  height: 40px;
  padding: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--ss-text);
  font-family: inherit;
  font-size: 13px;
}

.field-input::placeholder,
.textarea::placeholder {
  color: color-mix(in srgb, var(--ss-muted) 78%, transparent);
}

.field-hint {
  font-size: 10.5px;
  line-height: 1.55;
  color: var(--ss-muted);
}

.field-warn,
.field-error {
  display: flex;
  align-items: flex-start;
  gap: 5px;
  font-size: 10.5px;
  line-height: 1.55;
  color: var(--ss-warn);
}

.field-error {
  color: #dc2626;
}

.dark .field-error {
  color: #f87171;
}

.field-warn svg,
.field-error svg {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
  margin-top: 1px;
}

.textarea {
  width: 100%;
  min-height: 122px;
  padding: 11px 12px;
  border: 1px solid var(--ss-border);
  border-radius: 9px;
  outline: 0;
  background: color-mix(in srgb, var(--theme-text) 2.5%, var(--theme-bg));
  color: var(--ss-text);
  font-family: inherit;
  font-size: 12.5px;
  line-height: 1.72;
  resize: vertical;
  transition: border-color 0.2s ease, box-shadow 0.22s ease, background 0.22s ease;
}

.textarea--short {
  min-height: 84px;
}

.textarea:hover {
  border-color: color-mix(in srgb, var(--theme-accent) 25%, var(--ss-border));
}

.textarea:focus {
  border-color: var(--ss-accent);
  background: var(--ss-surface);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--theme-accent) 13%, transparent);
}

.md-hints {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.md-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 20px;
  padding: 0 7px;
  border: 1px solid color-mix(in srgb, var(--ss-border) 80%, transparent);
  border-radius: 5px;
  background: color-mix(in srgb, var(--theme-text) 2.5%, transparent);
  color: var(--ss-muted);
  font-size: 9.5px;
}

.md-chip code {
  color: color-mix(in srgb, var(--theme-accent) 80%, var(--ss-text));
  font-family: var(--ss-mono);
  font-size: 9px;
}

/* 公告卡片 */
.announce-grid {
  display: grid;
  gap: 16px;
}

/* 无右栏的中等宽度可用两列；出现右栏后先堆叠，宽屏再恢复两列 */
@media (min-width: 1024px) and (max-width: 1279px) {
  .announce-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 1440px) {
  .announce-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.announce-card {
  display: flex;
  flex-direction: column;
}

.announce-card .announce-body {
  flex: 1;
}

.announce-card .announce-body .field {
  flex: 1;
}

.announce-card .textarea {
  flex: 1 1 auto;
}

.announce-card.is-dirty {
  border-color: color-mix(in srgb, #f59e0b 26%, var(--ss-border));
}

.announce-head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 16px 16px 14px;
  border-bottom: 1px solid color-mix(in srgb, var(--ss-border) 75%, transparent);
}

@media (min-width: 640px) {
  .announce-head {
    padding: 18px 20px 15px;
  }
}

.head-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 30px;
  height: 30px;
  border: 1px solid color-mix(in srgb, var(--theme-accent) 16%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--theme-accent) 10%, transparent);
  color: var(--ss-accent);
}

.head-icon svg {
  width: 15px;
  height: 15px;
}

.head-text {
  flex: 1;
  min-width: 0;
}

.head-title-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 7px;
}

.head-text h3 {
  font-size: 13px;
  font-weight: 600;
  color: var(--ss-text);
}

.head-text p {
  margin-top: 2px;
  font-size: 10.5px;
  line-height: 1.5;
  color: var(--ss-muted);
}

.dirty-chip {
  padding: 0 5px;
  border-radius: 4px;
  background: color-mix(in srgb, #f59e0b 13%, transparent);
  color: var(--ss-warn);
  font-size: 8.5px;
  font-weight: 600;
  letter-spacing: 0.04em;
  line-height: 15px;
}

.announce-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
}

@media (min-width: 640px) {
  .announce-body {
    padding: 18px 20px 20px;
  }
}

/* 开关 */
.switch {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  padding: 2px;
  border-radius: 999px;
  color: var(--ss-muted);
  transition: color 0.2s ease;
}

.switch:hover {
  color: var(--ss-text);
}

.switch-track {
  position: relative;
  width: 42px;
  height: 24px;
  border: 1px solid color-mix(in srgb, var(--theme-text) 8%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--theme-text) 13%, transparent);
  transition: background 0.26s ease, border-color 0.26s ease, box-shadow 0.26s ease;
}

.switch-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
  transition: transform 0.3s cubic-bezier(0.22, 1.2, 0.36, 1);
}

.switch.is-on .switch-track {
  border-color: transparent;
  background: var(--ss-accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--theme-accent) 12%, transparent);
}

.switch.is-on .switch-thumb {
  transform: translateX(18px);
}

.switch:active .switch-thumb {
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3), 0 0 0 4px color-mix(in srgb, var(--theme-accent) 8%, transparent);
}

.switch-label {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.switch.is-on .switch-label {
  color: var(--ss-accent);
}

/* 页脚与一言 */
.sub-block {
  margin-top: 2px;
  padding-top: 16px;
  border-top: 1px solid color-mix(in srgb, var(--ss-border) 80%, transparent);
}

.sub-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.sub-title {
  display: flex;
  gap: 9px;
  min-width: 0;
}

.sub-mark {
  flex-shrink: 0;
  width: 3px;
  height: 26px;
  border-radius: 999px;
  background: var(--ss-accent);
  opacity: 0.7;
}

.sub-title h3 {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--ss-text);
}

.sub-title p {
  margin-top: 1px;
  font-size: 10.5px;
  color: var(--ss-muted);
}

.hitokoto-wrap {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 0.42s cubic-bezier(0.22, 1, 0.36, 1);
}

.hitokoto-wrap.is-open {
  grid-template-rows: 1fr;
}

.hitokoto-inner {
  min-height: 0;
  overflow: hidden;
}

.hitokoto-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 14px;
}

.chips-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.chips-label {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 11px;
  font-weight: 600;
  color: var(--ss-text);
}

.chips-count {
  padding: 1px 5px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--theme-text) 5%, transparent);
  color: var(--ss-muted);
  font-family: var(--ss-mono);
  font-size: 9px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}

.chips-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.chip-action {
  font-size: 10.5px;
  color: var(--ss-muted);
  transition: color 0.18s ease;
}

.chip-action:hover {
  color: var(--ss-accent);
}

.chips-sep {
  width: 1px;
  height: 9px;
  background: var(--ss-border);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.type-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 9px 0 6px;
  border: 1px solid var(--ss-border);
  border-radius: 7px;
  background: color-mix(in srgb, var(--theme-text) 2%, transparent);
  color: var(--ss-muted);
  font-size: 11px;
  transition:
    border-color 0.2s ease,
    background 0.2s ease,
    color 0.2s ease,
    transform 0.2s cubic-bezier(0.22, 1, 0.36, 1);
}

.type-chip:hover {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--theme-accent) 30%, var(--ss-border));
  color: var(--ss-text);
}

.type-chip.is-active {
  border-color: color-mix(in srgb, var(--theme-accent) 38%, transparent);
  background: color-mix(in srgb, var(--theme-accent) 9%, var(--ss-surface));
  color: var(--ss-accent);
}

.type-key {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--theme-text) 6%, transparent);
  color: var(--ss-muted);
  font-family: var(--ss-mono);
  font-size: 8.5px;
  font-weight: 600;
  text-transform: uppercase;
  transition: background 0.2s ease, color 0.2s ease;
}

.type-key svg {
  width: 10px;
  height: 10px;
}

.type-chip.is-active .type-key {
  background: color-mix(in srgb, var(--theme-accent) 16%, transparent);
  color: var(--ss-accent);
}

.type-name {
  line-height: 1;
}

.cache-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-top: 12px;
  border-top: 1px dashed color-mix(in srgb, var(--ss-border) 75%, transparent);
}

.cache-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--ss-text);
}

.cache-hint {
  margin-top: 2px;
  font-size: 10px;
  color: var(--ss-muted);
}

.stepper {
  display: inline-flex;
  align-items: center;
  gap: 1px;
  padding: 3px;
  border: 1px solid var(--ss-border);
  border-radius: 9px;
  background: color-mix(in srgb, var(--theme-text) 3%, transparent);
}

.stepper-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  color: var(--ss-muted);
  font-size: 14px;
  line-height: 1;
  transition: background 0.18s ease, color 0.18s ease;
}

.stepper-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--theme-accent) 10%, transparent);
  color: var(--ss-accent);
}

.stepper-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.stepper-input {
  width: 32px;
  height: 24px;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--ss-text);
  font-family: var(--ss-mono);
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  text-align: center;
  -moz-appearance: textfield;
  appearance: textfield;
}

.stepper-input::-webkit-outer-spin-button,
.stepper-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.stepper-unit {
  padding: 0 8px 0 4px;
  font-size: 10px;
  color: var(--ss-muted);
}

/* ==========================================================================
   改动暂存区（桌面右栏）
   ========================================================================== */
.tray {
  display: none;
}

@media (min-width: 1280px) {
  .tray {
    position: sticky;
    top: 1rem;
    display: flex;
    flex-direction: column;
    max-height: calc(100vh - 2rem);
    overflow: hidden;
    border: 1px solid var(--ss-border);
    border-radius: var(--ss-radius);
    background: var(--ss-surface);
    box-shadow:
      0 1px 2px rgba(0, 0, 0, 0.03),
      0 18px 40px -34px rgba(0, 0, 0, 0.35);
  }
}

.tray::before {
  content: '';
  flex-shrink: 0;
  height: 2px;
  background: linear-gradient(90deg, var(--ss-accent), color-mix(in srgb, var(--theme-accent) 22%, transparent));
  opacity: 0.85;
}

.tray-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px 12px;
}

.tray-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border: 1px solid color-mix(in srgb, var(--theme-accent) 16%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--theme-accent) 10%, transparent);
  color: var(--ss-accent);
}

.tray-icon svg {
  width: 14px;
  height: 14px;
}

.tray-title {
  flex: 1;
  min-width: 0;
}

.tray-title h2 {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--ss-text);
}

.tray-title p {
  margin-top: 1px;
  font-size: 10px;
  color: var(--ss-muted);
}

.tray-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  border-radius: 7px;
  background: #f59e0b;
  color: #fff;
  font-family: var(--ss-mono);
  font-size: 11px;
  font-weight: 600;
  box-shadow: 0 4px 10px -6px rgba(245, 158, 11, 0.8);
  animation: ss-pop 0.42s cubic-bezier(0.22, 1.4, 0.36, 1);
}

.tray-badge.is-empty {
  background: color-mix(in srgb, var(--theme-text) 6%, transparent);
  color: var(--ss-muted);
  box-shadow: none;
}

@keyframes ss-pop {
  0% { transform: scale(0.6); opacity: 0.4; }
  100% { transform: scale(1); opacity: 1; }
}

.tray-progress {
  flex-shrink: 0;
  height: 2px;
  background: color-mix(in srgb, var(--theme-text) 6%, transparent);
  overflow: hidden;
}

.tray-progress span {
  display: block;
  height: 100%;
  background: #f59e0b;
  transition: width 0.45s cubic-bezier(0.22, 1, 0.36, 1);
}

.tray-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px 16px 14px;
  scrollbar-width: thin;
}

.tray-meta {
  margin-bottom: 9px;
  font-family: var(--ss-mono);
  font-size: 9px;
  letter-spacing: 0.04em;
  color: var(--ss-muted);
}

.diff-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.diff-row {
  display: flex;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px dashed color-mix(in srgb, var(--ss-border) 65%, transparent);
}

.diff-row:last-child {
  border-bottom: 0;
}

.diff-mark {
  flex-shrink: 0;
  width: 3px;
  border-radius: 2px;
  background: #f59e0b;
  opacity: 0.6;
}

.diff-main {
  flex: 1;
  min-width: 0;
}

.diff-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.diff-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--ss-text);
}

.revert-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  border-radius: 4px;
  color: var(--ss-muted);
  opacity: 0;
  transition: opacity 0.18s ease, background 0.18s ease, color 0.18s ease;
}

.diff-row:hover .revert-btn,
.revert-btn:focus-visible {
  opacity: 1;
}

.revert-btn:hover {
  background: color-mix(in srgb, var(--theme-text) 6%, transparent);
  color: var(--ss-text);
}

.revert-btn svg {
  width: 11px;
  height: 11px;
}

.diff-values {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 3px;
}

.diff-old {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  font-size: 10.5px;
  line-height: 1.5;
  color: var(--ss-muted);
  text-decoration: line-through;
  text-decoration-color: color-mix(in srgb, var(--ss-muted) 45%, transparent);
  text-decoration-thickness: 1px;
  word-break: break-word;
}

.diff-new {
  position: relative;
  padding-left: 13px;
  font-size: 10.5px;
  line-height: 1.5;
  color: var(--ss-text);
  font-weight: 500;
  word-break: break-word;
}

.diff-new > span {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.diff-new svg {
  position: absolute;
  top: 3px;
  left: 0;
  width: 9px;
  height: 9px;
  color: var(--ss-accent);
}

.tray-note {
  display: flex;
  gap: 6px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid color-mix(in srgb, var(--ss-border) 70%, transparent);
  font-size: 9.5px;
  line-height: 1.6;
  color: var(--ss-muted);
}

.tray-note svg {
  width: 11px;
  height: 11px;
  flex-shrink: 0;
  margin-top: 1px;
  opacity: 0.75;
}

.tray-note.is-blocked {
  color: var(--ss-warn);
}

.tray-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 26px 8px 20px;
  text-align: center;
}

.empty-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  margin-bottom: 10px;
  border: 1px solid color-mix(in srgb, #22c55e 30%, var(--ss-border));
  border-radius: 50%;
  background: color-mix(in srgb, #22c55e 8%, transparent);
  color: var(--ss-ok);
}

.empty-icon svg {
  width: 18px;
  height: 18px;
}

.empty-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--ss-text);
}

.empty-desc {
  max-width: 24ch;
  margin-top: 4px;
  font-size: 10.5px;
  line-height: 1.65;
  color: var(--ss-muted);
}

.empty-time {
  margin-top: 8px;
  font-family: var(--ss-mono);
  font-size: 8.5px;
  letter-spacing: 0.03em;
  color: color-mix(in srgb, var(--ss-muted) 85%, transparent);
}

.tray-foot {
  display: flex;
  flex-direction: column;
  gap: 7px;
  flex-shrink: 0;
  padding: 12px 16px 14px;
  border-top: 1px solid color-mix(in srgb, var(--ss-border) 80%, transparent);
  background: color-mix(in srgb, var(--theme-text) 1.5%, transparent);
}

.btn-publish {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  width: 100%;
  height: 36px;
  border-radius: 9px;
  background: var(--ss-accent);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  box-shadow: 0 10px 22px -14px color-mix(in srgb, var(--theme-accent) 85%, transparent);
  transition:
    transform 0.18s cubic-bezier(0.22, 1, 0.36, 1),
    box-shadow 0.2s ease,
    background 0.2s ease,
    color 0.2s ease,
    opacity 0.2s ease;
}

.btn-publish svg {
  width: 13px;
  height: 13px;
}

.btn-publish:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 14px 26px -14px color-mix(in srgb, var(--theme-accent) 90%, transparent);
}

.btn-publish:active:not(:disabled) {
  transform: scale(0.985);
}

.btn-publish:disabled {
  background: color-mix(in srgb, var(--theme-text) 7%, transparent);
  color: var(--ss-muted);
  box-shadow: none;
  cursor: not-allowed;
}

.btn-publish.is-saved {
  background: var(--ss-ok);
  color: #fff;
}

.btn-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 5px;
  background: rgba(255, 255, 255, 0.2);
  font-family: var(--ss-mono);
  font-size: 9.5px;
}

.btn-quiet {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  height: 30px;
  border-radius: 8px;
  color: var(--ss-muted);
  font-size: 11px;
  transition: background 0.18s ease, color 0.18s ease;
}

.btn-quiet svg {
  width: 12px;
  height: 12px;
}

.btn-quiet:hover:not(:disabled) {
  background: color-mix(in srgb, var(--theme-text) 5%, transparent);
  color: var(--ss-text);
}

.btn-quiet:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.tray-swap-enter-active,
.tray-swap-leave-active {
  transition: opacity 0.25s ease, transform 0.3s cubic-bezier(0.22, 1, 0.36, 1);
}

.tray-swap-enter-from {
  opacity: 0;
  transform: translateY(6px);
}

.tray-swap-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

/* ==========================================================================
   移动端暂存条
   ========================================================================== */
.dock {
  position: sticky;
  top: 76px;
  z-index: 25;
  margin-bottom: 16px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, #f59e0b 30%, var(--ss-border));
  border-radius: 12px;
  background: color-mix(in srgb, var(--theme-surface) 92%, #f59e0b 8%);
  box-shadow: 0 14px 30px -22px rgba(0, 0, 0, 0.45);
}

@media (min-width: 640px) {
  .dock {
    top: 12px;
  }
}

@media (min-width: 1280px) {
  .dock {
    display: none;
  }
}

.dock-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
}

.dock-toggle {
  display: flex;
  align-items: center;
  gap: 7px;
  flex: 1;
  min-width: 0;
  padding: 2px 0;
  color: var(--ss-warn);
  font-size: 11.5px;
  font-weight: 600;
  text-align: left;
}

.dock-pulse {
  flex-shrink: 0;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #f59e0b;
  box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.16);
  animation: ss-pulse 2.2s ease-in-out infinite;
}

.dock-chevron {
  width: 13px;
  height: 13px;
  margin-left: auto;
  opacity: 0.7;
  transition: transform 0.25s ease;
}

.dock-chevron.is-open {
  transform: rotate(180deg);
}

.dock-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.dock-reset {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 7px;
  color: var(--ss-muted);
  transition: background 0.18s ease, color 0.18s ease;
}

.dock-reset:hover {
  background: rgba(245, 158, 11, 0.1);
  color: var(--ss-warn);
}

.dock-reset:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.dock-reset svg {
  width: 13px;
  height: 13px;
}

.dock-save {
  height: 28px;
  padding: 0 11px;
  border-radius: 7px;
  background: #f59e0b;
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  transition: transform 0.15s ease, opacity 0.2s ease;
}

.dock-save:active {
  transform: scale(0.97);
}

.dock-save:disabled {
  opacity: 0.6;
}

.dock-panel {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 0.38s cubic-bezier(0.22, 1, 0.36, 1);
}

.dock-panel.is-open {
  grid-template-rows: 1fr;
}

.dock-scroll {
  min-height: 0;
  overflow: hidden;
}

.dock-list {
  max-height: 42vh;
  overflow-y: auto;
  padding: 2px 12px 10px;
  border-top: 1px solid rgba(245, 158, 11, 0.16);
}

.dock-list .diff-row {
  padding: 7px 0;
}

.dock-enter-active {
  transition: opacity 0.25s ease, transform 0.3s cubic-bezier(0.22, 1, 0.36, 1);
}

.dock-leave-active {
  transition: opacity 0.18s ease, transform 0.22s ease;
}

.dock-enter-from,
.dock-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

/* ==========================================================================
   骨架与异常
   ========================================================================== */
.sk-wrap {
  min-height: 60vh;
}

.sk-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 24px;
}

.sk-lines {
  flex: 1;
  max-width: 420px;
}

.sk-eyebrow {
  width: 130px;
  height: 10px;
  margin-bottom: 12px;
  border-radius: 4px;
}

.sk-title {
  width: 170px;
  height: 26px;
  margin-bottom: 10px;
  border-radius: 7px;
}

.sk-sub {
  width: min(300px, 100%);
  height: 12px;
  border-radius: 4px;
}

.sk-pill {
  width: 132px;
  height: 30px;
  border-radius: 999px;
  flex-shrink: 0;
}

.sk-hero {
  height: 232px;
  border-radius: 18px;
}

.sk-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
  margin-top: 20px;
}

@media (min-width: 1024px) {
  .sk-grid {
    grid-template-columns: 1fr 1fr;
  }
}

.sk-panel {
  height: 240px;
  border-radius: 14px;
}

.load-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 48px 24px;
  border: 1px solid var(--ss-border);
  border-radius: var(--ss-radius);
  background: var(--ss-surface);
  text-align: center;
}

.load-error-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  margin-bottom: 14px;
  border-radius: 50%;
  background: color-mix(in srgb, #f59e0b 10%, transparent);
  color: var(--ss-warn);
}

.load-error-icon svg {
  width: 20px;
  height: 20px;
}

.load-error h2 {
  font-size: 15px;
  font-weight: 600;
  color: var(--ss-text);
}

.load-error p {
  margin-top: 4px;
  margin-bottom: 16px;
  font-size: 12px;
  color: var(--ss-muted);
}

/* ==========================================================================
   正文级提示文字：比全局 muted 略深，保证 10px 级说明仍可读
   ========================================================================== */
.field-hint,
.stage-desc,
.stage-copy,
.side-state,
.side-note,
.head-text p,
.sub-title p,
.cache-hint,
.tray-title p,
.tray-meta,
.tray-note,
.empty-desc,
.load-error p,
.type-chip,
.counter,
.md-chip,
.stage-version,
.tray-badge.is-empty,
.diff-old {
  color: var(--ss-muted-strong);
}

/* 强调文字：参与正文阅读的地方避免过亮的品牌色 */
.side-state.is-on,
.type-chip.is-active,
.type-chip.is-active .type-key,
.stage-quote,
.switch.is-on .switch-label,
.chip-action:hover {
  color: var(--ss-accent-text);
}

/* ==========================================================================
   焦点可见
   ========================================================================== */
.btn-save-head:focus-visible,
.btn-publish:focus-visible,
.btn-quiet:focus-visible,
.dock-toggle:focus-visible,
.dock-save:focus-visible,
.dock-reset:focus-visible,
.switch:focus-visible,
.type-chip:focus-visible,
.chip-action:focus-visible,
.stepper-btn:focus-visible,
.revert-btn:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--theme-accent) 60%, transparent);
  outline-offset: 2px;
}

/* ==========================================================================
   减少动效 / 触控
   ========================================================================== */
@media (hover: none) {
  .console-spot {
    display: none;
  }

  .revert-btn {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .anim-rise {
    animation: none;
    opacity: 1;
    transform: none;
  }

  [data-reveal] {
    opacity: 1;
    transform: none;
    transition: none;
  }

  .console-orb,
  .status-pill.is-draft .status-dot,
  .window-live i,
  .dock-pulse {
    animation: none !important;
  }

  .ring-bar,
  .hitokoto-wrap,
  .dock-panel {
    transition: none;
  }

  .tray-badge {
    animation: none;
  }
}
</style>
