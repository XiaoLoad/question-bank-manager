<script setup>
import { ref, reactive, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useApi } from '@/composables/useApi'
import { useToastStore } from '@/stores/toast'
import { useConfirmStore } from '@/stores/confirm'
import PageHeader from '@/components/PageHeader.vue'
import SectionHeader from '@/components/SectionHeader.vue'
import SectionNav from '@/components/SectionNav.vue'
import gsap from 'gsap'
import { gsapEasing, prefersReducedMotion } from '@/utils/motionTokens'

defineOptions({ name: 'ExternalBanks' })

const api = useApi()
const toast = useToastStore()
const confirmDialog = useConfirmStore()

// ========== Config ==========

const config = reactive({
  external_enabled: true,
  external_api_key: '',
  yatori_enabled: true,
  ocs_enabled: true,
  max_concurrent_ai: 5,
  ai_timeout: 30,
  auto_save: true,
})
const configLoading = ref(true)
const loadError = ref('')
const saving = ref(false)

// API key visibility
const showKey = ref(false)
const maskedKey = computed(() => {
  const k = config.external_api_key || ''
  if (!k) return '（尚未生成）'
  if (showKey.value) return k
  return k.slice(0, 4) + '••••••••' + k.slice(-4)
})

// Stats（stats.today 为按日重置的日期键，流量数字取各来源 total）
const stats = ref({
  today: '',
  yatori: { total: 0, local: 0, ai: 0, notFound: 0 },
  ocs: { total: 0, local: 0, ai: 0, notFound: 0 },
  semaphore: { current: 0, waiting: 0 },
})
const sumTotal = computed(() => num(stats.value.yatori?.total) + num(stats.value.ocs?.total))
const sumLocal = computed(() => num(stats.value.yatori?.local) + num(stats.value.ocs?.local))
const sumAi = computed(() => num(stats.value.yatori?.ai) + num(stats.value.ocs?.ai))
const sumMiss = computed(() => num(stats.value.yatori?.notFound) + num(stats.value.ocs?.notFound))
const semCurrent = computed(() => num(stats.value.semaphore?.current))
const semWaiting = computed(() => num(stats.value.semaphore?.waiting))
// 并发槽位可视化：最多画 24 格，避免极端配置把面板撑坏
const slotCount = computed(() => Math.min(Math.max(num(config.max_concurrent_ai), 1), 24))

// Logs
const logs = ref([])
const logsLoading = ref(false)
const logFilter = reactive({ source: '', result: '' })

// Compute base URL
const baseUrl = computed(() => {
  if (typeof window !== 'undefined') {
    return window.location.origin
  }
  return 'http://localhost:3000'
})

const yatoriUrl = computed(() => `${baseUrl.value}/api/external/yatori?token=${config.external_api_key}`)
const ocsUrl = computed(() => `${baseUrl.value}/api/external/ocs`)

// OCS config JSON for copy
const ocsConfigJson = computed(() => JSON.stringify([{
  name: '题库管理系统',
  url: ocsUrl.value,
  method: 'get',
  contentType: 'json',
  data: { token: config.external_api_key, title: '${title}', type: '${type}', options: '${options}' },
  handler: "return (res) => res.code === 1 ? [res.question, res.answer] : undefined"
}], null, 2))

// Yatori config YAML for copy
const yatoriConfigYaml = computed(() =>
`# 在 config.yml 的 apiQueSetting 下配置
apiQueSetting:
  url: "${yatoriUrl.value}"`
)

// ========== Actions ==========

async function loadConfig() {
  configLoading.value = true
  loadError.value = ''
  try {
    const data = await api.getExternalConfig()
    Object.assign(config, data)
  } catch {
    loadError.value = '无法读取接口配置，请确认服务是否正常，然后重试。'
  } finally {
    configLoading.value = false
    if (!loadError.value) await afterRender()
  }
}

async function afterRender() {
  await nextTick()
  initReveal()
  applyStats()
  applyFlow()
}

async function loadStats() {
  try {
    stats.value = await api.getExternalStats()
    await nextTick()
    applyStats()
  } catch {}
}

async function loadLogs() {
  logsLoading.value = true
  try {
    const params = { limit: 50 }
    if (logFilter.source) params.source = logFilter.source
    if (logFilter.result) params.result = logFilter.result
    logs.value = await api.getExternalLogs(params)
    await nextTick()
    revealLogRows()
  } catch {} finally {
    logsLoading.value = false
  }
}

async function updateConfig(key, value) {
  saving.value = true
  try {
    config[key] = value
    await api.updateExternalConfig({ [key]: value })
    toast.success('配置已保存')
  } catch {
    // revert on error
    await loadConfig()
  } finally {
    saving.value = false
  }
}

async function updateNumberConfig(key, value, input) {
  const num2 = parseInt(value)
  if (isNaN(num2) || num2 < 1) {
    if (input) input.value = config[key]
    toast.error('该项至少为 1，已恢复原值')
    return
  }
  await updateConfig(key, num2)
}

async function regenerateApiKey() {
  const ok = await confirmDialog.show({
    title: '重新生成接口密钥',
    message: '旧密钥将立即失效，所有正在使用的 Yatori / OCS 工具会无法查询，直到你把新调用地址同步到工具配置中。确定要继续吗？',
    confirmText: '重新生成',
    cancelText: '取消',
    danger: true,
  })
  if (!ok) return
  try {
    const result = await api.regenerateExternalApiKey()
    config.external_api_key = result.api_key
    toast.success(result.message || '密钥已重新生成')
    pulseGate()
  } catch {}
}

async function clearLogs() {
  try {
    const result = await api.clearExternalLogs(30)
    toast.success(result.message || '日志已清理')
    await loadLogs()
  } catch {}
}

async function clearAllLogs() {
  const ok = await confirmDialog.show({
    title: '清空查询日志',
    message: '确定要清空所有查询日志吗？此操作不可恢复。',
    confirmText: '清空',
    cancelText: '取消',
    danger: true,
  })
  if (!ok) return
  try {
    const result = await api.clearExternalLogs(0)
    toast.success(result.message || '日志已清空')
    await loadLogs()
  } catch {}
}

// ========== Copy ==========

const copied = reactive({})
let copiedTimers = {}

async function copyToClipboard(text, label, key = label) {
  const done = () => {
    toast.success(`${label}已复制到剪贴板`)
    markCopied(key)
  }
  // navigator.clipboard 仅在安全上下文（HTTPS/localhost）可用，HTTP 部署需降级 execCommand
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text)
      done()
    } catch {
      legacyCopy(text, label, key)
    }
    return
  }
  legacyCopy(text, label, key)
}

function legacyCopy(text, label, key = label) {
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.focus()
  ta.select()
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  document.body.removeChild(ta)
  if (ok) {
    toast.success(`${label}已复制到剪贴板`)
    markCopied(key)
  } else {
    toast.error('复制失败，请手动复制')
  }
}

function markCopied(label) {
  copied[label] = true
  clearTimeout(copiedTimers[label])
  copiedTimers[label] = setTimeout(() => { copied[label] = false }, 1600)
  if (!reduceMotion) {
    const btn = pageRef.value?.querySelector(`[data-copy="${label}"]`)
    if (btn) gsap.fromTo(btn, { scale: 0.9 }, { scale: 1, duration: 0.5, ease: gsapEasing.bounce, clearProps: 'scale' })
  }
}

// ========== Formatters ==========

function num(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function formatTime(str) {
  if (!str) return ''
  const d = new Date(str)
  if (isNaN(d.getTime())) return str
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

function formatDate(str) {
  if (!str) return ''
  const d = new Date(str)
  if (isNaN(d.getTime())) return str
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${mm}-${dd}`
}

function truncate(str, len = 30) {
  if (!str) return ''
  return str.length > len ? str.slice(0, len) + '...' : str
}

function formatCost(ms) {
  const n = num(ms)
  if (n < 1000) return `${Math.round(n)} ms`
  return `${(n / 1000).toFixed(1)} s`
}

function costClass(ms) {
  const n = num(ms)
  if (n < 100) return 'is-fast'
  if (n < 2000) return 'is-slow'
  return 'is-late'
}

const resultLabel = { local: '本地', ai: 'AI', not_found: '未找到', disabled: '已禁用' }
const resultBadge = { local: 'is-local', ai: 'is-ai', not_found: 'is-miss', disabled: 'is-off' }

const sourceLabel = { yatori: 'Yatori', ocs: 'OCS' }

// ========== Motion ==========

const pageRef = ref(null)
const heroRef = ref(null)
let reduceMotion = false
let revealObserver = null
let statsTimer = null
let flowTweens = []
let spotRaf = 0

function initReveal() {
  const page = pageRef.value
  if (!page) return
  const nodes = page.querySelectorAll('[data-reveal]')
  if (reduceMotion || !('IntersectionObserver' in window)) {
    nodes.forEach(el => el.classList.add('is-revealed'))
    return
  }
  if (!revealObserver) {
    revealObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-revealed')
          revealObserver.unobserve(entry.target)
        }
      })
    }, { threshold: 0.06, rootMargin: '0px 0px -4% 0px' })
  }
  nodes.forEach(el => {
    if (!el.classList.contains('is-revealed')) revealObserver.observe(el)
  })
}

function moveSpotlight(e) {
  if (reduceMotion) return
  const el = e.currentTarget
  if (spotRaf) cancelAnimationFrame(spotRaf)
  spotRaf = requestAnimationFrame(() => {
    spotRaf = 0
    const rect = el.getBoundingClientRect()
    el.style.setProperty('--mx', `${e.clientX - rect.left}px`)
    el.style.setProperty('--my', `${e.clientY - rect.top}px`)
  })
}

// —— 链路流动：packet 沿导轨行进，开关决定通断（动效即状态）——

const yatoriLive = computed(() => config.external_enabled && config.yatori_enabled)
const ocsLive = computed(() => config.external_enabled && config.ocs_enabled)
const trunkLive = computed(() => config.external_enabled)

function applyFlow() {
  const page = pageRef.value
  if (!page || reduceMotion) return
  flowTweens.forEach(t => t.kill())
  flowTweens = []
  page.querySelectorAll('.flow-carrier').forEach(el => {
    const rail = el.closest('.rail')
    const declared = rail ? getComputedStyle(rail).getPropertyValue('--flow-axis').trim() : ''
    const vertical = declared ? declared === 'y' : !!rail && rail.offsetHeight > rail.offsetWidth
    const axis = vertical ? 'yPercent' : 'xPercent'
    // 清掉 CSS 里可能残留的位移：GSAP 会把已有 transform 解析成像素 x/y，
    // 再叠加 xPercent/yPercent 会让数据包跑出轨道一倍轨长（表现为“数据包不见了”）。
    gsap.set(el, { x: 0, y: 0, xPercent: 0, yPercent: 0 })
    const delay = num(el.dataset.delay)
    const dur = (vertical ? 1.15 : 2.6) + (el.dataset.slow === '1' ? 0.8 : 0)
    flowTweens.push(gsap.fromTo(el,
      { [axis]: -100 },
      {
        [axis]: 0,
        duration: dur,
        ease: 'none',
        repeat: -1,
        repeatDelay: 0.55 + (el.dataset.slow === '1' ? 0.3 : 0),
        delay,
      },
    ))
  })
}

let flowResize = 0
function onFlowResize() {
  clearTimeout(flowResize)
  flowResize = setTimeout(applyFlow, 220)
}

function pulseGate() {
  if (reduceMotion) return
  const gate = pageRef.value?.querySelector('.gate-mark')
  if (!gate) return
  const tl = gsap.timeline()
  tl.fromTo(gate, { scale: 1 }, { scale: 1.1, duration: 0.22, ease: gsapEasing.sharp })
    .to(gate, { scale: 1, duration: 0.5, ease: gsapEasing.bounce })
  gsap.fromTo(gate.querySelector('.gate-ring'),
    { opacity: 0.9, scale: 1 },
    { opacity: 0, scale: 1.9, duration: 0.8, ease: gsapEasing.smooth, clearProps: 'all' })
}

function flashKey() {
  if (reduceMotion) return
  const el = pageRef.value?.querySelector('[data-key-line]')
  if (!el) return
  gsap.fromTo(el, { autoAlpha: 0.35, y: 3 }, { autoAlpha: 1, y: 0, duration: 0.42, ease: gsapEasing.smooth, clearProps: 'transform' })
}

// —— 数字滚动 + 分布条：每次统计刷新都重新计时（动效即数据）——

function tweenNumber(el, to) {
  const target = num(to)
  const from = num(el.dataset.cur)
  if (from === target) return
  if (reduceMotion) {
    el.textContent = String(target)
    el.dataset.cur = String(target)
    return
  }
  const proxy = { v: from }
  if (el._numTween) el._numTween.kill()
  el._numTween = gsap.to(proxy, {
    v: target,
    duration: 0.85,
    ease: gsapEasing.smooth,
    onUpdate: () => { el.textContent = String(Math.round(proxy.v)) },
    onComplete: () => { el.textContent = String(target); el.dataset.cur = String(target) },
  })
  el.dataset.cur = String(target)
}

function tweenBar(el, pct) {
  const target = Math.max(0, Math.min(100, pct))
  if (el._barTween) el._barTween.kill()
  if (reduceMotion) {
    el.style.width = `${target}%`
    return
  }
  el._barTween = gsap.to(el, { width: `${target}%`, duration: 0.7, ease: gsapEasing.smooth })
}

function applyStats() {
  const page = pageRef.value
  if (!page) return
  page.querySelectorAll('[data-stat]').forEach(el => {
    const map = {
      total: sumTotal.value,
      'ans-local': sumLocal.value,
      'ans-ai': sumAi.value,
      'ans-miss': sumMiss.value,
      'y-total': num(stats.value.yatori?.total),
      'y-local': num(stats.value.yatori?.local),
      'y-ai': num(stats.value.yatori?.ai),
      'y-miss': num(stats.value.yatori?.notFound),
      'o-total': num(stats.value.ocs?.total),
      'o-local': num(stats.value.ocs?.local),
      'o-ai': num(stats.value.ocs?.ai),
      'o-miss': num(stats.value.ocs?.notFound),
      'sem-cur': num(stats.value.semaphore?.current),
      'sem-wait': num(stats.value.semaphore?.waiting),
    }
    tweenNumber(el, map[el.dataset.stat] ?? 0)
  })
  page.querySelectorAll('[data-bar]').forEach(el => {
    const src = stats.value[el.dataset.bar] || { total: 0, local: 0, ai: 0, notFound: 0 }
    const total = Math.max(num(src.total), num(src.local) + num(src.ai) + num(src.notFound), 1)
    const bar = el.querySelector('.bar')
    if (!bar) return
    tweenBar(bar.querySelector('.bar-seg--local'), (num(src.local) / total) * 100)
    tweenBar(bar.querySelector('.bar-seg--ai'), (num(src.ai) / total) * 100)
    tweenBar(bar.querySelector('.bar-seg--miss'), (num(src.notFound) / total) * 100)
  })
  pulseSlots()
}

function pulseSlots() {
  const page = pageRef.value
  if (!page) return
  const busy = Math.min(num(stats.value.semaphore?.current), slotCount.value)
  page.querySelectorAll('.ai-slot').forEach((slot, i) => {
    const on = i < busy
    const was = slot.classList.contains('is-busy')
    slot.classList.toggle('is-busy', on)
    if (reduceMotion || !on || was) return
    gsap.fromTo(slot, { scaleY: 0.55, opacity: 0.35 }, { scaleY: 1, opacity: 1, duration: 0.5, ease: gsapEasing.bounce })
  })
  const waitEl = page.querySelector('.ai-slots')
  if (waitEl) waitEl.classList.toggle('is-waiting', num(stats.value.semaphore?.waiting) > 0)
}

function revealLogRows() {
  if (reduceMotion || !pageRef.value) return
  const rows = pageRef.value.querySelectorAll('.log-row')
  if (!rows.length) return
  gsap.killTweensOf(rows)
  gsap.fromTo(rows,
    { autoAlpha: 0, y: 8 },
    {
      autoAlpha: 1, y: 0,
      duration: 0.42,
      ease: gsapEasing.smooth,
      stagger: { each: 0.018, limit: 22 },
      clearProps: 'transform',
    })
}

watch(() => config.external_enabled, () => { nextTick(pulseGate) })
watch(showKey, () => { nextTick(flashKey) })

// ========== 章节导航 ==========

const SECTIONS = [
  { nav: 0, index: '00', label: '调用链路' },
  { nav: 1, index: '01', label: '接口安全' },
  { nav: 2, index: '02', label: 'Yatori 对接' },
  { nav: 3, index: '03', label: 'OCS 对接' },
  { nav: 4, index: '04', label: 'AI 兜底参数' },
  { nav: 5, index: '05', label: '查询日志' },
]
// 导轨、测量与跳转已抽离到 SectionNav；正文里两处「01 接口安全」的
// note-link 按钮通过页内薄包装 jumpTo 调用组件 expose 的同名方法。
const navRef = ref(null)
const jumpTo = (idx) => navRef.value?.jumpTo(idx)

// ========== Lifecycle ==========

onMounted(async () => {
  reduceMotion = prefersReducedMotion()
  await Promise.all([loadConfig(), loadStats(), loadLogs()])
  await nextTick()
  applyStats()
  applyFlow()
  initReveal()
  window.addEventListener('resize', onFlowResize, { passive: true })
  // Auto-refresh stats every 30s
  statsTimer = setInterval(loadStats, 30000)
})

onBeforeUnmount(() => {
  if (statsTimer) clearInterval(statsTimer)
  if (revealObserver) { revealObserver.disconnect(); revealObserver = null }
  if (spotRaf) cancelAnimationFrame(spotRaf)
  clearTimeout(flowResize)
  window.removeEventListener('resize', onFlowResize)
  Object.values(copiedTimers).forEach(t => clearTimeout(t))
  flowTweens.forEach(t => t.kill())
  flowTweens = []
  pageRef.value?.querySelectorAll('.log-row, .flow-carrier, [data-stat], .bar-seg').forEach(el => gsap.killTweensOf(el))
})
</script>

<template>
  <section class="external-page" ref="pageRef">
    <PageHeader
      eyebrow="外部生态"
      eyebrow-en="INTEGRATIONS"
      title="题库对接"
      description="把这套题库变成可被调用的接口：Yatori 与 OCS 携带同一把密钥查询，本地命中优先，AI 兜底其后。"
    >
      <template #actions>
        <span class="status-pill" :class="{ 'is-live': config.external_enabled && !saving, 'is-saving': saving }" role="status" aria-live="polite">
          <i class="status-dot" aria-hidden="true" />
          <span>{{ saving ? '保存中' : (config.external_enabled ? '接口运行中' : '接口已停用') }}</span>
        </span>
      </template>
    </PageHeader>

    <!-- 加载骨架 -->
    <div v-if="configLoading" class="skeleton-wrap" aria-hidden="true">
      <div class="skeleton sk-console"></div>
      <div class="skeleton sk-panel"></div>
      <div class="skeleton sk-panel"></div>
    </div>

    <!-- 加载失败 -->
    <div v-else-if="loadError" class="error-block">
      <p class="error-text">{{ loadError }}</p>
      <button class="btn-quiet" @click="loadConfig">重试</button>
    </div>

    <template v-else>
      <!-- ============ 章节导航指示器 ============ -->
      <SectionNav
        ref="navRef"
        :sections="SECTIONS"
        :container="pageRef"
      />

      <!-- ============ 链路 Console：动效即状态 ============ -->
      <section class="console" ref="heroRef" data-nav="0" @mousemove="moveSpotlight" aria-label="接口调用链路">
        <i class="console-orb console-orb--a" aria-hidden="true" />
        <i class="console-orb console-orb--b" aria-hidden="true" />
        <i class="console-grid" aria-hidden="true" />
        <i class="console-spot" aria-hidden="true" />

        <header class="window-bar">
          <span class="window-dots" aria-hidden="true"><i /><i /><i /></span>
          <span class="window-url">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            {{ baseUrl }}/api/external
          </span>
          <span v-if="stats.today" class="window-tag" aria-hidden="true">按日累计 · {{ stats.today }}</span>
        </header>

        <div class="console-inner">
          <!-- 左：调用链路示意 -->
          <div class="flow-block" :class="{ 'is-muted': !trunkLive }">
            <p class="side-label">调用链路 · Request Flow</p>
            <div class="flow">
              <div class="flow-stage flow-stage--src">
                <div class="src-node src-node--y" :class="{ 'is-live': yatoriLive }">
                  <i class="src-dot" aria-hidden="true" />
                  <span class="src-name">Yatori</span>
                  <span class="src-state">{{ yatoriLive ? '在听' : (config.external_enabled ? '已停用' : '接口关闭') }}</span>
                </div>
                <div class="src-node src-node--o" :class="{ 'is-live': ocsLive }">
                  <i class="src-dot" aria-hidden="true" />
                  <span class="src-name">OCS</span>
                  <span class="src-state">{{ ocsLive ? '在听' : (config.external_enabled ? '已停用' : '接口关闭') }}</span>
                </div>
              </div>

              <div class="flow-rails">
                <span class="rail" :class="{ 'is-live': yatoriLive }" aria-hidden="true">
                  <i class="rail-line" />
                  <i class="flow-carrier" data-delay="0"><b class="packet" /></i>
                  <i class="flow-carrier" data-delay="1.4" data-slow="1"><b class="packet" /></i>
                </span>
                <span class="rail" :class="{ 'is-live': ocsLive }" aria-hidden="true">
                  <i class="rail-line" />
                  <i class="flow-carrier" data-delay="0.7"><b class="packet" /></i>
                  <i class="flow-carrier" data-delay="2.1" data-slow="1"><b class="packet" /></i>
                </span>
              </div>

              <div class="flow-gate">
                <span class="gate-mark" :class="{ 'is-live': trunkLive }" aria-hidden="true">
                  <svg class="gate-ring" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                </span>
                <span class="gate-label">密钥校验</span>
                <span class="gate-sub">X-API-Key · ?token=</span>
              </div>

              <span class="rail rail--trunk" :class="{ 'is-live': trunkLive }" aria-hidden="true">
                <i class="rail-line" />
                <i class="flow-carrier" data-delay="0.3"><b class="packet packet--ok" /></i>
                <i class="flow-carrier" data-delay="1.7"><b class="packet packet--ai" /></i>
              </span>

              <div class="flow-stage flow-stage--ans">
                <span class="ans-line">
                  <i class="adot is-local" aria-hidden="true" />
                  <span class="ans-name">本地命中</span>
                  <b class="ans-num" data-stat="ans-local">0</b>
                </span>
                <span class="ans-line">
                  <i class="adot is-ai" aria-hidden="true" />
                  <span class="ans-name">AI 补充</span>
                  <b class="ans-num" data-stat="ans-ai">0</b>
                </span>
                <span class="ans-line">
                  <i class="adot is-miss" aria-hidden="true" />
                  <span class="ans-name">未命中</span>
                  <b class="ans-num" data-stat="ans-miss">0</b>
                </span>
              </div>
            </div>
            <p class="flow-note">
              <template v-if="trunkLive">
                关掉下方
                <button type="button" class="note-link" @click="jumpTo(1)">「01 接口安全」的总开关</button>
                ，链路里的数据包会停在校验节点——动效就是状态本身。
              </template>
              <template v-else>
                接口已关闭，链路停在密钥校验节点，外部工具会收到「接口已禁用」。
                <button type="button" class="note-link" @click="jumpTo(1)">去开启</button>
              </template>
            </p>
          </div>

          <!-- 右：今日流量 -->
          <aside class="pulse-card">
            <p class="side-label">今日流量 · Live</p>
            <div class="pulse-num">
              <b class="pulse-big" data-stat="total">0</b>
              <span class="pulse-unit">次调用</span>
            </div>
            <div class="pulse-rows">
              <div class="pulse-row">
                <span class="pulse-src"><i class="src-dot src-dot--y" aria-hidden="true" />Yatori</span>
                <span class="pulse-count"><b data-stat="y-total">0</b> 次</span>
              </div>
              <div class="bar" aria-hidden="true">
                <i class="bar-seg bar-seg--local" style="width:0" />
                <i class="bar-seg bar-seg--ai" style="width:0" />
                <i class="bar-seg bar-seg--miss" style="width:0" />
              </div>
              <div class="pulse-row">
                <span class="pulse-src"><i class="src-dot src-dot--o" aria-hidden="true" />OCS</span>
                <span class="pulse-count"><b data-stat="o-total">0</b> 次</span>
              </div>
              <div class="bar" aria-hidden="true">
                <i class="bar-seg bar-seg--local" style="width:0" />
                <i class="bar-seg bar-seg--ai" style="width:0" />
                <i class="bar-seg bar-seg--miss" style="width:0" />
              </div>
            </div>
            <div class="side-note">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>
              <span>条形为本地 / AI / 未命中的构成，每 30 秒自动刷新。</span>
            </div>
          </aside>
        </div>
      </section>

      <!-- ============ 01 接口安全 ============ -->
      <section class="section" data-reveal data-nav="1">
        <SectionHeader index="01" title="接口安全" hint="总开关与调用密钥" />
        <div class="panel">
          <div class="panel-body">
            <div class="switch-row">
              <div class="switch-text">
                <p class="switch-title">对外开放接口</p>
                <p class="switch-hint">关闭后接口立即停止响应，已接入的 Yatori / OCS 会收到「接口已禁用」。未携带密钥的请求同样会被拒绝，因此开启状态下只有持钥工具能查询。</p>
              </div>
              <label class="switch" :class="{ 'is-on': config.external_enabled }">
                <input type="checkbox" class="sr-only" :checked="config.external_enabled" :disabled="saving"
                  aria-label="对外开放接口"
                  @change="updateConfig('external_enabled', $event.target.checked)">
                <span class="switch-track" aria-hidden="true"><i class="switch-thumb" /></span>
                <span class="switch-label">{{ config.external_enabled ? '已开启' : '已关闭' }}</span>
              </label>
            </div>

            <div class="field">
              <div class="field-top">
                <label class="field-label" for="ex-key">接口密钥</label>
                <span class="field-flags" v-if="!config.external_api_key"><i class="dirty-dot" aria-hidden="true" />尚未生成</span>
              </div>
              <div class="field-shell" data-key-line>
                <input id="ex-key" class="field-input is-mono" type="text" :value="maskedKey" readonly>
                <button class="icon-btn" :aria-label="showKey ? '隐藏密钥' : '显示密钥'" :title="showKey ? '隐藏密钥' : '显示密钥'" @click="showKey = !showKey">
                  <svg v-if="!showKey" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>
                  <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 3l18 18M10.6 5.1A10.9 10.9 0 0 1 12 5c6.5 0 10 6 10 6a17.2 17.2 0 0 1-3.4 4.1M6.6 6.6C3.9 8.2 2 12 2 12s3.5 6 10 6c1.9 0 3.6-.5 5-1.3"/></svg>
                </button>
                <button class="icon-btn" data-copy="密钥" :disabled="!config.external_api_key" aria-label="复制密钥" title="复制密钥" @click="copyToClipboard(config.external_api_key, '密钥')">
                  <svg v-if="!copied['密钥']" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>
                  <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12l5 5L20 6"/></svg>
                </button>
                <button class="btn-danger-quiet" @click="regenerateApiKey">重新生成</button>
              </div>
              <p class="field-hint">调用时在 URL 追加 <code>?token=密钥</code>，或带上请求头 <code>X-API-Key:&nbsp;密钥</code>。下方两个接入地址与配置示例已自动填入当前密钥，重新生成后记得同步到工具。</p>
            </div>
          </div>
        </div>
      </section>

      <!-- ============ 02 Yatori ============ -->
      <section class="section" data-reveal data-nav="2">
        <SectionHeader index="02" title="Yatori 对接" hint="yatori-go-console 答题系统">
          <template #actions>
            <label class="switch switch--mini" :class="{ 'is-on': config.yatori_enabled }">
              <input type="checkbox" class="sr-only" :checked="config.yatori_enabled" :disabled="saving"
                aria-label="启用 Yatori 对接"
                @change="updateConfig('yatori_enabled', $event.target.checked)">
              <span class="switch-track" aria-hidden="true"><i class="switch-thumb" /></span>
              <span class="switch-label">{{ config.yatori_enabled ? '已启用' : '已停用' }}</span>
            </label>
          </template>
        </SectionHeader>
        <div class="panel" :class="{ 'is-quiet': !yatoriLive }">
          <div class="panel-body">
            <div class="field">
              <div class="field-top">
                <label class="field-label">接入地址</label>
                <span class="path-badge">GET · /api/external/yatori</span>
              </div>
              <div class="field-shell">
                <input class="field-input is-mono" type="text" :value="yatoriUrl" readonly>
                <button class="icon-btn" data-copy="Yatori 地址" aria-label="复制接入地址" title="复制接入地址" @click="copyToClipboard(yatoriUrl, '地址', 'Yatori 地址')">
                  <svg v-if="!copied['Yatori 地址']" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>
                  <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12l5 5L20 6"/></svg>
                </button>
              </div>
            </div>

            <div class="code-block">
              <div class="code-head">
                <p class="side-label">config.yml · apiQueSetting</p>
                <button class="btn-copy" data-copy="YAML" :class="{ 'is-done': copied['YAML'] }" @click="copyToClipboard(yatoriConfigYaml, '配置', 'YAML')">
                  <svg v-if="!copied['YAML']" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>
                  <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12l5 5L20 6"/></svg>
                  <span>{{ copied['YAML'] ? '已复制' : '复制配置' }}</span>
                </button>
              </div>
              <pre class="code-pre">{{ yatoriConfigYaml }}</pre>
            </div>

            <div class="metrics" data-bar="yatori">
              <div class="metric">
                <span class="metric-label">今日查询</span>
                <b class="metric-num" data-stat="y-total">0</b>
              </div>
              <div class="metric is-local">
                <span class="metric-label">本地命中</span>
                <b class="metric-num" data-stat="y-local">0</b>
              </div>
              <div class="metric is-ai">
                <span class="metric-label">AI 补充</span>
                <b class="metric-num" data-stat="y-ai">0</b>
              </div>
              <div class="metric is-miss">
                <span class="metric-label">未找到</span>
                <b class="metric-num" data-stat="y-miss">0</b>
              </div>
              <div class="bar bar--wide" aria-hidden="true">
                <i class="bar-seg bar-seg--local" style="width:0" />
                <i class="bar-seg bar-seg--ai" style="width:0" />
                <i class="bar-seg bar-seg--miss" style="width:0" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ============ 03 OCS ============ -->
      <section class="section" data-reveal data-nav="3">
        <SectionHeader index="03" title="OCS 网课助手对接" hint="在线搜题题库源">
          <template #actions>
            <label class="switch switch--mini" :class="{ 'is-on': config.ocs_enabled }">
              <input type="checkbox" class="sr-only" :checked="config.ocs_enabled" :disabled="saving"
                aria-label="启用 OCS 对接"
                @change="updateConfig('ocs_enabled', $event.target.checked)">
              <span class="switch-track" aria-hidden="true"><i class="switch-thumb" /></span>
              <span class="switch-label">{{ config.ocs_enabled ? '已启用' : '已停用' }}</span>
            </label>
          </template>
        </SectionHeader>
        <div class="panel" :class="{ 'is-quiet': !ocsLive }">
          <div class="panel-body">
            <div class="field">
              <div class="field-top">
                <label class="field-label">接入地址</label>
                <span class="path-badge">GET · /api/external/ocs</span>
              </div>
              <div class="field-shell">
                <input class="field-input is-mono" type="text" :value="ocsUrl" readonly>
                <button class="icon-btn" data-copy="OCS 地址" aria-label="复制接入地址" title="复制接入地址" @click="copyToClipboard(ocsUrl, '地址', 'OCS 地址')">
                  <svg v-if="!copied['OCS 地址']" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>
                  <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12l5 5L20 6"/></svg>
                </button>
              </div>
            </div>

            <div class="code-block">
              <div class="code-head">
                <p class="side-label">OCS 题库配置 · JSON</p>
                <button class="btn-copy" data-copy="JSON" :class="{ 'is-done': copied['JSON'] }" @click="copyToClipboard(ocsConfigJson, '配置', 'JSON')">
                  <svg v-if="!copied['JSON']" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>
                  <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12l5 5L20 6"/></svg>
                  <span>{{ copied['JSON'] ? '已复制' : '复制配置' }}</span>
                </button>
              </div>
              <pre class="code-pre code-pre--tall">{{ ocsConfigJson }}</pre>
            </div>

            <div class="metrics" data-bar="ocs">
              <div class="metric">
                <span class="metric-label">今日查询</span>
                <b class="metric-num" data-stat="o-total">0</b>
              </div>
              <div class="metric is-local">
                <span class="metric-label">本地命中</span>
                <b class="metric-num" data-stat="o-local">0</b>
              </div>
              <div class="metric is-ai">
                <span class="metric-label">AI 补充</span>
                <b class="metric-num" data-stat="o-ai">0</b>
              </div>
              <div class="metric is-miss">
                <span class="metric-label">未找到</span>
                <b class="metric-num" data-stat="o-miss">0</b>
              </div>
              <div class="bar bar--wide" aria-hidden="true">
                <i class="bar-seg bar-seg--local" style="width:0" />
                <i class="bar-seg bar-seg--ai" style="width:0" />
                <i class="bar-seg bar-seg--miss" style="width:0" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ============ 04 AI 兜底参数 ============ -->
      <section class="section" data-reveal data-nav="4">
        <SectionHeader index="04" title="AI 兜底参数" hint="本地未命中时的补答节奏" />
        <div class="panel">
          <div class="panel-body">
            <p class="panel-intro">本地题库没有答案时，系统会把题目交给 AI 补答。以下参数控制补答的节奏与代价。</p>
            <div class="grid-2">
              <div class="field">
                <div class="field-top">
                  <label class="field-label" for="ex-conc">AI 最大并发</label>
                  <span class="counter">{{ config.max_concurrent_ai }}<span> 路</span></span>
                </div>
                <div class="field-shell">
                  <input id="ex-conc" class="field-input" type="number" min="1" :value="config.max_concurrent_ai" :disabled="saving"
                    @change="updateNumberConfig('max_concurrent_ai', $event.target.value, $event.target)">
                </div>
                <p class="field-hint">同时向 AI 发起的补答请求上限。调高会更快清空积压，但更容易触发上游限流。</p>
              </div>
              <div class="field">
                <div class="field-top">
                  <label class="field-label" for="ex-timeout">AI 超时</label>
                  <span class="counter">{{ config.ai_timeout }}<span> 秒</span></span>
                </div>
                <div class="field-shell">
                  <input id="ex-timeout" class="field-input" type="number" min="1" :value="config.ai_timeout" :disabled="saving"
                    @change="updateNumberConfig('ai_timeout', $event.target.value, $event.target)">
                </div>
                <p class="field-hint">超过这个时间就返回「未找到」，不让调用方一直等。</p>
              </div>
            </div>
            <div class="ai-load">
              <div class="ai-load-top">
                <span class="side-label">实时并发 · Semaphore</span>
                <span class="ai-load-num"><b class="num" data-stat="sem-cur">0</b><span class="slash">/</span>{{ config.max_concurrent_ai }} 路<i v-if="semWaiting" class="ai-queue"><b class="num" data-stat="sem-wait">0</b> 排队中</i></span>
              </div>
              <div class="ai-slots" :class="{ 'is-waiting': semWaiting > 0 }" aria-hidden="true">
                <i v-for="n in slotCount" :key="n" class="ai-slot" :class="{ 'is-busy': n <= semCurrent }" />
              </div>
              <p class="ai-load-hint">槽位由后端信号量实时上报：占满后新请求排队，排队超过「AI 超时」即返回未找到。</p>
            </div>
            <div class="switch-row">
              <div class="switch-text">
                <p class="switch-title">AI 答案自动入库</p>
                <p class="switch-hint">补答成功的题目自动写入题库，下次同题直接本地命中，不再消耗 AI 额度。</p>
              </div>
              <label class="switch" :class="{ 'is-on': config.auto_save }">
                <input type="checkbox" class="sr-only" :checked="config.auto_save" :disabled="saving"
                  aria-label="AI 答案自动入库"
                  @change="updateConfig('auto_save', $event.target.checked)">
                <span class="switch-track" aria-hidden="true"><i class="switch-thumb" /></span>
                <span class="switch-label">{{ config.auto_save ? '自动存' : '仅本次' }}</span>
              </label>
            </div>
          </div>
        </div>
      </section>

      <!-- ============ 05 查询日志 ============ -->
      <section class="section" data-reveal data-nav="5">
        <SectionHeader index="05" title="查询日志" hint="最近 50 条外部调用">
          <template #actions>
            <div class="log-tools">
              <div class="seg" role="group" aria-label="按来源筛选">
                <button class="seg-btn" :class="{ 'is-active': logFilter.source === '' }" @click="logFilter.source = ''; loadLogs()">全部</button>
                <button class="seg-btn" :class="{ 'is-active': logFilter.source === 'yatori' }" @click="logFilter.source = 'yatori'; loadLogs()">Yatori</button>
                <button class="seg-btn" :class="{ 'is-active': logFilter.source === 'ocs' }" @click="logFilter.source = 'ocs'; loadLogs()">OCS</button>
              </div>
              <div class="seg" role="group" aria-label="按结果筛选">
                <button class="seg-btn" :class="{ 'is-active': logFilter.result === '' }" @click="logFilter.result = ''; loadLogs()">全部</button>
                <button class="seg-btn" :class="{ 'is-active': logFilter.result === 'local' }" @click="logFilter.result = 'local'; loadLogs()">本地</button>
                <button class="seg-btn" :class="{ 'is-active': logFilter.result === 'ai' }" @click="logFilter.result = 'ai'; loadLogs()">AI</button>
                <button class="seg-btn" :class="{ 'is-active': logFilter.result === 'not_found' }" @click="logFilter.result = 'not_found'; loadLogs()">未找到</button>
              </div>
              <button class="icon-btn" :disabled="logsLoading" aria-label="刷新日志" title="刷新日志" @click="loadLogs">
                <svg class="icon-btn-spin" :class="{ 'is-spinning': logsLoading }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/></svg>
              </button>
              <button class="btn-quiet" @click="clearLogs">清理 30 天前</button>
              <button class="btn-danger-quiet" @click="clearAllLogs">清空</button>
            </div>
          </template>
        </SectionHeader>

        <div class="panel panel--logs">
          <!-- 桌面端表格 -->
          <div class="log-table-wrap">
            <table class="log-table">
              <thead>
                <tr>
                  <th class="col-time">时间</th>
                  <th class="col-src">来源</th>
                  <th class="col-q">题目</th>
                  <th class="col-type">题型</th>
                  <th class="col-res">结果</th>
                  <th class="col-ans">答案</th>
                  <th class="col-cost">耗时</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="logsLoading && !logs.length"><td colspan="7" class="log-state">加载中…</td></tr>
                <tr v-else-if="!logs.length && !logsLoading"><td colspan="7" class="log-state">还没有查询记录。把接入地址填进工具，第一次调用就会出现在这里。</td></tr>
                <tr v-for="(log, i) in logs" :key="`${log.created_at}-${i}`" class="log-row">
                  <td class="col-time mono"><span class="t-day">{{ formatDate(log.created_at) }}</span> {{ formatTime(log.created_at) }}</td>
                  <td class="col-src"><span class="src-tag" :class="`src-tag--${log.source}`">{{ sourceLabel[log.source] || log.source }}</span></td>
                  <td class="col-q" :title="log.content">{{ truncate(log.content, 30) }}</td>
                  <td class="col-type">{{ log.type || '—' }}</td>
                  <td class="col-res"><span class="res-badge" :class="resultBadge[log.result]">{{ resultLabel[log.result] || log.result }}</span></td>
                  <td class="col-ans" :title="log.answer">{{ log.answer ? truncate(log.answer, 16) : '—' }}</td>
                  <td class="col-cost mono" :class="costClass(log.cost_ms)">{{ formatCost(log.cost_ms) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </template>
  </section>
</template>

<style scoped>
.external-page {
  --ex-accent: var(--theme-accent);
  --ex-border: var(--theme-border);
  --ex-text: var(--theme-text);
  --ex-muted: var(--theme-muted);
  --ex-surface: var(--theme-surface);
  --ex-bg: var(--theme-bg);
  --ex-warn: #b45309;
  --ex-ok: #15803d;
  --ex-info: #1d4ed8;
  --ex-yatori: #2563eb;
  --ex-ocs: #b45309;
  --ex-muted-strong: color-mix(in srgb, var(--ex-muted) 62%, var(--ex-text));
  --ex-accent-text: color-mix(in srgb, var(--ex-accent) 82%, var(--ex-text));
  --ex-locate-ring: color-mix(in srgb, var(--ex-accent) 30%, transparent);
  --ex-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace;
  --ex-radius: 14px;
  display: flex;
  flex-direction: column;
  gap: 28px;
  color: var(--ex-text);
}
.dark .external-page {
  --ex-warn: #fbbf24;
  --ex-ok: #4ade80;
  --ex-info: #93c5fd;
  --ex-yatori: #60a5fa;
  --ex-ocs: #fbbf24;
}

/* ---------- 骨架 / 错误 ---------- */
.skeleton-wrap { display: flex; flex-direction: column; gap: 26px; }
.sk-console { height: 260px; border-radius: 18px; }
.sk-panel { height: 180px; border-radius: var(--ex-radius); }
.error-block {
  display: flex; flex-direction: column; align-items: flex-start; gap: 12px;
  padding: 28px; border: 1px solid var(--ex-border); border-radius: var(--ex-radius);
  background: var(--ex-surface);
}
.error-text { font-size: 13px; color: var(--ex-muted-strong); }

/* ---------- 状态胶囊 ---------- */
.status-pill {
  display: inline-flex; align-items: center; gap: 7px; height: 30px; padding: 0 12px;
  border: 1px solid var(--ex-border); border-radius: 999px;
  background: color-mix(in srgb, var(--ex-text) 3%, var(--ex-surface));
  color: var(--ex-muted); font-size: 11.5px; font-weight: 600; letter-spacing: .01em;
  transition: color .25s, border-color .25s, background .25s;
}
.status-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.status-pill.is-live {
  border-color: color-mix(in srgb, var(--ex-ok) 26%, var(--ex-border));
  background: color-mix(in srgb, var(--ex-ok) 8%, var(--ex-surface));
  color: var(--ex-ok);
}
.status-pill.is-live .status-dot { box-shadow: 0 0 0 3px color-mix(in srgb, var(--ex-ok) 14%, transparent); }
.status-pill.is-saving { color: var(--ex-warn); border-color: color-mix(in srgb, var(--ex-warn) 30%, var(--ex-border)); }
.status-pill.is-saving .status-dot { animation: ex-pulse 1.1s ease-in-out infinite; }
@keyframes ex-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .3; } }

/* ---------- 链路 Console ---------- */
.console {
  position: relative; isolation: isolate; overflow: hidden;
  container-type: inline-size;
  border: 1px solid var(--ex-border); border-radius: 18px;
  background: var(--ex-surface);
  box-shadow: 0 1px 2px rgba(0, 0, 0, .03), 0 30px 60px -48px color-mix(in srgb, var(--ex-accent) 60%, transparent);
}
.dark .console { box-shadow: 0 1px 2px rgba(0, 0, 0, .35), 0 30px 70px -46px rgba(0, 0, 0, .8); }
.console::after {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px;
  background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--ex-accent) 45%, transparent), transparent);
  opacity: .75;
}
.console-orb { position: absolute; border-radius: 50%; filter: blur(52px); pointer-events: none; }
.console-orb--a {
  width: 260px; height: 260px; top: -80px; left: -60px;
  background: color-mix(in srgb, var(--ex-accent) 16%, transparent);
  animation: ex-orb-a 20s ease-in-out infinite alternate;
}
.console-orb--b {
  width: 210px; height: 210px; right: -50px; bottom: -70px;
  background: color-mix(in srgb, var(--ex-accent) 8%, transparent);
  animation: ex-orb-b 26s ease-in-out infinite alternate;
}
@keyframes ex-orb-a { to { transform: translate3d(-24px, 18px, 0) scale(1.08); } }
@keyframes ex-orb-b { to { transform: translate3d(20px, -14px, 0) scale(1.05); } }
.console-grid {
  position: absolute; inset: 0; pointer-events: none;
  background-image: radial-gradient(circle at 1px 1px, color-mix(in srgb, var(--ex-text) 13%, transparent) 1px, transparent 0);
  background-size: 22px 22px; opacity: .42;
  -webkit-mask-image: radial-gradient(ellipse 80% 100% at 28% 0%, #000 0%, transparent 74%);
  mask-image: radial-gradient(ellipse 80% 100% at 28% 0%, #000 0%, transparent 74%);
}
.console-spot {
  position: absolute; inset: 0; pointer-events: none; opacity: 0; transition: opacity .45s;
  background: radial-gradient(360px circle at var(--mx, 50%) var(--my, 30%), color-mix(in srgb, var(--ex-accent) 10%, transparent), transparent 70%);
}
.console:hover .console-spot { opacity: 1; }

.window-bar { display: flex; align-items: center; gap: 10px; padding: 13px 16px 12px; }
.window-dots { display: inline-flex; gap: 5px; }
.window-dots i { width: 7px; height: 7px; border-radius: 50%; background: color-mix(in srgb, var(--ex-text) 14%, transparent); }
.window-dots i:first-child { background: color-mix(in srgb, var(--ex-accent) 55%, transparent); }
.window-url {
  flex: 0 1 auto;
  min-width: 0;
  display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 10px;
  border: 1px solid color-mix(in srgb, var(--ex-border) 82%, transparent); border-radius: 999px;
  background: color-mix(in srgb, var(--ex-text) 3%, transparent);
  color: var(--ex-muted); font-family: var(--ex-mono); font-size: 10px;
  max-width: min(420px, 100%); overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
}
.window-url svg { width: 10px; height: 10px; opacity: .7; flex: none; }
.window-tag {
  flex: none; margin-left: auto; font-family: var(--ex-mono); font-size: 9.5px; letter-spacing: .06em;
  color: color-mix(in srgb, var(--ex-muted) 80%, var(--ex-text)); white-space: nowrap;
}

.console-inner {
  display: grid; gap: 14px; padding: 4px 16px 18px;
  grid-template-columns: minmax(0, 1fr);
}
@container (min-width: 780px) { .console-inner { grid-template-columns: minmax(0, 1fr) 244px; gap: 18px; } }

.side-label {
  margin: 0 0 10px; font-family: var(--ex-mono); font-size: 9px; font-weight: 600;
  letter-spacing: .16em; text-transform: uppercase; color: var(--ex-muted);
}
.flow-block { transition: opacity .45s ease; }
.flow-block.is-muted { opacity: .72; }

/* —— 链路图 —— */
.flow {
  --flow-node-h: 38px;
  --flow-axis: x;
  display: grid; align-items: center; row-gap: 10px;
  grid-template-columns: auto minmax(26px, 1fr) auto minmax(26px, 1fr) auto;
  padding: 10px 0 4px;
}
.flow-stage--src { display: flex; flex-direction: column; gap: 8px; }
.src-node {
  display: grid; grid-template-columns: auto auto; grid-template-rows: auto auto; column-gap: 6px; align-items: center;
  box-sizing: border-box; height: var(--flow-node-h); align-content: center;
  padding: 0 10px; border: 1px solid var(--ex-border); border-radius: 10px;
  background: color-mix(in srgb, var(--ex-text) 2%, var(--ex-surface));
  transition: border-color .3s, opacity .3s, filter .3s;
  opacity: .58;
}
.src-node.is-live { opacity: 1; }
.src-node--y { border-color: color-mix(in srgb, var(--ex-yatori) 20%, var(--ex-border)); }
.src-node--y.is-live { border-color: color-mix(in srgb, var(--ex-yatori) 34%, var(--ex-border)); }
.src-node--o { border-color: color-mix(in srgb, var(--ex-ocs) 18%, var(--ex-border)); }
.src-node--o.is-live { border-color: color-mix(in srgb, var(--ex-ocs) 32%, var(--ex-border)); }
.src-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--ex-muted); grid-row: 1 / 3; }
.src-node--y .src-dot { background: color-mix(in srgb, var(--ex-yatori) 70%, var(--ex-muted)); }
.src-node--o .src-dot { background: color-mix(in srgb, var(--ex-ocs) 70%, var(--ex-muted)); }
.src-node.is-live .src-dot { box-shadow: 0 0 0 3px color-mix(in srgb, currentColor 12%, transparent); }
.src-name { font-size: 11px; font-weight: 650; color: var(--ex-text); }
.src-state { font-family: var(--ex-mono); font-size: 8.5px; letter-spacing: .05em; color: var(--ex-muted); }

.flow-rails { display: grid; grid-template-rows: repeat(2, var(--flow-node-h)); gap: 8px; align-self: center; }
.rail { position: relative; display: block; height: var(--flow-node-h); overflow: hidden; }
.rail-line {
  position: absolute; left: 0; right: 0; top: 50%; height: 2px; margin-top: -1px;
  background-image: linear-gradient(90deg, color-mix(in srgb, var(--ex-muted) 45%, transparent) 0 4px, transparent 4px 10px);
  background-size: 10px 2px; opacity: .35;
}
.rail.is-live .rail-line { opacity: .65; animation: ex-march 1.4s linear infinite; }
@keyframes ex-march { to { background-position: 10px 0; } }
@keyframes ex-march-v { to { background-position: 0 10px; } }
.flow-carrier { position: absolute; left: 0; top: 0; width: 100%; height: 100%; transform: translateX(-100%); opacity: 0; transition: opacity .4s; }
.rail.is-live .flow-carrier { opacity: 1; }
.packet {
  position: absolute; right: 0; top: 50%; margin-top: -3px; width: 6px; height: 6px; border-radius: 50%;
  background: var(--ex-accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--ex-accent) 16%, transparent), 0 0 10px color-mix(in srgb, var(--ex-accent) 60%, transparent);
}
.packet--ok { background: var(--ex-ok); box-shadow: 0 0 0 3px color-mix(in srgb, var(--ex-ok) 14%, transparent), 0 0 10px color-mix(in srgb, var(--ex-ok) 55%, transparent); }
.packet--ai { background: var(--ex-info); box-shadow: 0 0 0 3px color-mix(in srgb, var(--ex-info) 14%, transparent), 0 0 10px color-mix(in srgb, var(--ex-info) 55%, transparent); }

.flow-gate { display: flex; flex-direction: column; align-items: center; gap: 5px; padding: 0 4px; }
.gate-mark {
  position: relative; display: grid; place-items: center; width: 40px; height: 40px; border-radius: 11px;
  border: 1px solid color-mix(in srgb, var(--ex-border) 80%, var(--ex-accent) 18%);
  background: color-mix(in srgb, var(--ex-accent) 7%, var(--ex-surface));
  color: color-mix(in srgb, var(--ex-muted) 55%, var(--ex-text));
  transition: color .35s, border-color .35s, background .35s, box-shadow .35s;
}
.gate-mark svg { width: 17px; height: 17px; }
.gate-mark.is-live {
  color: var(--ex-accent-text);
  border-color: color-mix(in srgb, var(--ex-accent) 32%, var(--ex-border));
  background: color-mix(in srgb, var(--ex-accent) 11%, var(--ex-surface));
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--ex-accent) 6%, transparent);
}
.gate-ring { position: absolute; inset: -1px; margin: auto; width: 100%; height: 100%; opacity: 0; }
.gate-label { font-size: 10.5px; font-weight: 650; color: var(--ex-muted-strong); white-space: nowrap; }
.gate-sub { font-family: var(--ex-mono); font-size: 8.5px; letter-spacing: .04em; color: var(--ex-muted); white-space: nowrap; }

.flow-stage--ans { display: flex; flex-direction: column; gap: 7px; }
.ans-line { display: flex; align-items: center; gap: 7px; }
.adot { width: 6px; height: 6px; border-radius: 50%; flex: none; }
.adot.is-local { background: var(--ex-ok); }
.adot.is-ai { background: var(--ex-info); }
.adot.is-miss { background: color-mix(in srgb, var(--ex-muted) 70%, transparent); }
.ans-name { font-size: 11px; color: var(--ex-muted-strong); white-space: nowrap; }
.ans-num { margin-left: auto; font-family: var(--ex-mono); font-size: 11px; font-weight: 650; color: var(--ex-text); font-variant-numeric: tabular-nums; }
.flow-note { margin: 10px 0 0; font-size: 10.5px; line-height: 1.6; color: var(--ex-muted); }

/* 容器窄于 660px：链路改为「竖脊步进器」——一条贯穿的导流线，节点依次排在右侧，
   与手机阅读顺序一致。必须写在基础规则之后：同特异性下后者胜出，容器查询不改变层叠顺序。 */
@container (max-width: 660px) {
  .flow-block { text-align: left; }
  .flow {
    --flow-node-h: 30px;
    --flow-axis: y;
    display: block;
    position: relative;
    padding: 4px 0 2px 32px;
  }
  .flow::before {
    content: '';
    position: absolute; left: 10px; top: 12px; bottom: 12px; width: 2px;
    background-image: linear-gradient(180deg, color-mix(in srgb, var(--ex-text) 16%, transparent) 40%, transparent 40%);
    background-size: 2px 10px;
  }
  .flow-block:not(.is-muted) .flow::before { animation: ex-march-v 1.6s linear infinite; }
  .flow-rails { display: none; }
  .rail--trunk { position: absolute; left: 1px; top: 8px; bottom: 8px; width: 20px; height: auto; }
  .rail--trunk .rail-line { display: none; }
  .flow-carrier { transform: translateY(-100%); }
  /* 数据包挂在载体底边，yPercent -100→0 才会从脊线顶端一路走到底 */
  .packet { left: 50%; right: auto; top: auto; bottom: 0; margin: 0 0 -3px -3px; }
  .flow-stage--src { flex-direction: row; flex-wrap: wrap; gap: 8px; }
  .src-node { height: auto; min-height: 36px; padding: 6px 11px; }
  .src-name { font-size: 11.5px; }
  .flow-gate { flex-direction: row; align-items: center; gap: 9px; padding: 12px 0; }
  .gate-mark { width: 34px; height: 34px; flex: none; }
  .gate-label { font-size: 11px; }
  .gate-sub { font-size: 8.5px; }
  .flow-stage--ans { flex-direction: column; gap: 7px; padding: 2px 0 0; }
  .ans-line { width: 100%; gap: 8px; }
  .ans-name { font-size: 11.5px; }
  .ans-num { margin-left: auto; font-size: 11.5px; }
  .flow-note { font-size: 11.5px; line-height: 1.7; }
}
@container (max-width: 560px) {
  .window-tag { display: none; }
}

/* —— 右侧流量卡 —— */
.pulse-card {
  display: flex; flex-direction: column; padding: 12px 14px 14px;
  border: 1px solid color-mix(in srgb, var(--ex-border) 78%, transparent); border-radius: 12px;
  background: color-mix(in srgb, var(--ex-text) 2.5%, var(--ex-surface));
}
.pulse-num { display: flex; align-items: baseline; gap: 8px; margin-bottom: 14px; }
.pulse-big { font-family: var(--ex-mono); font-size: 30px; font-weight: 700; letter-spacing: -.03em; color: var(--ex-accent-text); font-variant-numeric: tabular-nums; }
.pulse-unit { font-size: 10.5px; color: var(--ex-muted); }
.pulse-rows { display: flex; flex-direction: column; gap: 6px; }
.pulse-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.pulse-src { display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; font-weight: 600; color: var(--ex-muted-strong); }
.src-dot--y { background: var(--ex-yatori); }
.src-dot--o { background: var(--ex-ocs); }
.pulse-count { font-size: 10.5px; color: var(--ex-muted); }
.pulse-count b { font-family: var(--ex-mono); font-size: 11.5px; font-weight: 650; color: var(--ex-text); font-variant-numeric: tabular-nums; }

.bar { display: flex; gap: 2px; height: 5px; margin: 2px 0 8px; border-radius: 3px; background: color-mix(in srgb, var(--ex-text) 6%, transparent); }
.bar-seg { height: 100%; border-radius: 3px; overflow: hidden; }
.bar-seg--local { background: color-mix(in srgb, var(--ex-ok) 72%, transparent); }
.bar-seg--ai { background: color-mix(in srgb, var(--ex-info) 72%, transparent); }
.bar-seg--miss { background: color-mix(in srgb, var(--ex-muted) 40%, transparent); }
.bar--wide { height: 6px; margin-top: 14px; }

.side-note { display: flex; gap: 6px; margin-top: auto; padding-top: 10px; font-size: 9.5px; line-height: 1.6; color: var(--ex-muted); }
.side-note svg { width: 11px; height: 11px; flex: none; margin-top: 1px; opacity: .7; }

/* 窄屏：流量卡改为横排读数条——大号数字在左，两路明细在右，说明占满整行。
   同样必须位于以上基础规则之后，否则同特异性下基础规则胜出。 */
@container (max-width: 660px) {
  .pulse-card { display: grid; grid-template-columns: auto minmax(0, 1fr); align-content: center; gap: 8px 20px; }
  .pulse-card .side-label { grid-column: 1 / -1; margin-bottom: 0; }
  .pulse-num { margin: 0; align-self: center; }
  .pulse-rows { grid-column: 2; min-width: 0; gap: 4px; }
  .bar { margin: 2px 0 0; }
  .pulse-card .side-note { grid-column: 1 / -1; margin-top: 6px; padding-top: 10px; }
}

/* ---------- 区块 ---------- */
.section { min-width: 0; }

/* ---------- 面板 ---------- */
.panel {
  position: relative;
  border: 1px solid var(--ex-border); border-radius: var(--ex-radius);
  background: var(--ex-surface);
  box-shadow: 0 1px 2px rgba(0, 0, 0, .025);
  transition: border-color .25s, box-shadow .25s, opacity .4s;
}
.dark .panel { box-shadow: 0 1px 2px rgba(0, 0, 0, .35); }
.panel:focus-within {
  border-color: color-mix(in srgb, var(--ex-accent) 34%, var(--ex-border));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--ex-accent) 6%, transparent);
}
.panel.is-quiet { opacity: .66; }
.panel.is-quiet:hover { opacity: 1; }
.panel-body { display: flex; flex-direction: column; gap: 18px; padding: 18px; }
@media (min-width: 640px) { .panel-body { padding: 20px 22px; } }
.panel-intro { margin: 0; font-size: 12px; line-height: 1.65; color: var(--ex-muted-strong); }

/* ---------- 字段 ---------- */
.field { display: flex; flex-direction: column; gap: 6px; }
.field-top { display: flex; align-items: center; justify-content: space-between; gap: 6px 10px; flex-wrap: wrap; }
.field-label { font-size: 12px; font-weight: 600; color: var(--ex-muted-strong); }
.field-flags { display: inline-flex; align-items: center; gap: 5px; font-size: 10px; color: var(--ex-warn); }
.dirty-dot { width: 5px; height: 5px; border-radius: 50%; background: #f59e0b; box-shadow: 0 0 0 3px rgba(245, 158, 11, .14); }
.counter {
  padding: 1px 6px; border-radius: 5px; background: color-mix(in srgb, var(--ex-text) 5%, transparent);
  font-family: var(--ex-mono); font-size: 9.5px; color: var(--ex-muted); font-variant-numeric: tabular-nums;
}
.counter span { opacity: .55; }
.field-shell {
  display: flex; align-items: center; gap: 8px; min-height: 42px; padding: 0 8px 0 12px;
  border: 1px solid var(--ex-border); border-radius: 10px;
  background: color-mix(in srgb, var(--ex-text) 2.5%, var(--ex-bg));
  transition: border-color .25s, background .25s;
}
.field-shell:focus-within {
  border-color: color-mix(in srgb, var(--ex-accent) 45%, var(--ex-border));
  background: var(--ex-surface);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--ex-accent) 7%, transparent);
}
.field-input { flex: 1; min-width: 0; height: 40px; border: 0; outline: 0; background: transparent; font-size: 13px; color: var(--ex-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.field-input.is-mono { font-family: var(--ex-mono); font-size: 11.5px; }
.field-input:disabled { opacity: .55; cursor: not-allowed; }
.field-hint { margin: 0; font-size: 10.5px; line-height: 1.6; color: var(--ex-muted); }
.field-hint code {
  padding: 1px 5px; border-radius: 4px; background: color-mix(in srgb, var(--ex-accent) 8%, transparent);
  color: var(--ex-accent-text); font-family: var(--ex-mono); font-size: 10px;
}
input[type='number']::-webkit-outer-spin-button,
input[type='number']::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
input[type='number'] { -moz-appearance: textfield; appearance: textfield; }

.grid-2 { display: grid; gap: 16px; grid-template-columns: minmax(0, 1fr); }
@media (min-width: 720px) { .grid-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); } }

/* ---------- 开关行 ---------- */
.switch-row {
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  padding: 14px 16px; border: 1px solid color-mix(in srgb, var(--ex-border) 76%, transparent); border-radius: 12px;
  background: color-mix(in srgb, var(--ex-text) 2%, var(--ex-surface));
}
.switch-text { min-width: 0; }
.switch-title { margin: 0 0 3px; font-size: 13px; font-weight: 650; color: var(--ex-text); }
.switch-hint { margin: 0; font-size: 11px; line-height: 1.6; color: var(--ex-muted); max-width: 62ch; }

/* ---------- 开关 ---------- */
.switch { position: relative; display: inline-flex; align-items: center; gap: 8px; padding: 2px; border-radius: 999px; cursor: pointer; flex: none; }
.switch-track {
  position: relative; width: 42px; height: 24px; border-radius: 999px; flex: none;
  border: 1px solid color-mix(in srgb, var(--ex-text) 8%, transparent);
  background: color-mix(in srgb, var(--ex-text) 13%, transparent);
  transition: background .26s, border-color .26s, box-shadow .26s;
}
.switch-thumb {
  position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; border-radius: 50%;
  background: #fff; box-shadow: 0 1px 2px rgba(0, 0, 0, .25);
  transition: transform .3s cubic-bezier(0.22, 1.2, 0.36, 1);
}
.switch.is-on .switch-track {
  background: var(--ex-accent); border-color: transparent;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--ex-accent) 12%, transparent);
}
.switch.is-on .switch-thumb { transform: translateX(18px); }
.switch:active .switch-thumb { box-shadow: 0 1px 2px rgba(0, 0, 0, .25), 0 0 0 6px color-mix(in srgb, var(--ex-accent) 8%, transparent); }
.switch input:focus-visible + .switch-track { outline: 2px solid var(--ex-accent); outline-offset: 2px; }
.switch-label { font-size: 10px; font-weight: 600; color: var(--ex-muted); white-space: nowrap; }
.switch.is-on .switch-label { color: var(--ex-accent-text); }
.switch--mini .switch-track { width: 36px; height: 20px; }
.switch--mini .switch-thumb { width: 14px; height: 14px; }
.switch--mini.is-on .switch-thumb { transform: translateX(16px); }

/* ---------- 代码块 / 徽标 ---------- */
.code-block { min-width: 0; }
.code-head {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  margin-bottom: 8px;
}
.code-head .side-label { margin: 0; }
.btn-copy {
  display: inline-flex; align-items: center; gap: 5px; flex: none;
  padding: 4px 9px; border: 1px solid color-mix(in srgb, var(--ex-border) 82%, transparent); border-radius: 8px;
  background: color-mix(in srgb, var(--ex-text) 3%, transparent);
  font-size: 10px; font-weight: 600; color: var(--ex-muted-strong); cursor: pointer;
  transition: color .2s, border-color .2s, background .2s, transform .15s;
}
.btn-copy svg { width: 11px; height: 11px; }
.btn-copy:hover {
  color: var(--ex-accent-text); background: color-mix(in srgb, var(--ex-accent) 7%, transparent);
  border-color: color-mix(in srgb, var(--ex-accent) 35%, var(--ex-border));
}
.btn-copy:active { transform: scale(.96); }
.btn-copy.is-done { color: var(--ex-ok); border-color: color-mix(in srgb, var(--ex-ok) 34%, var(--ex-border)); }
.code-pre {
  margin: 0; padding: 12px 14px; overflow: auto; max-height: 220px;
  border: 1px solid color-mix(in srgb, var(--ex-border) 80%, transparent); border-radius: 10px;
  background: color-mix(in srgb, var(--ex-text) 3%, var(--ex-bg));
  font-family: var(--ex-mono); font-size: 11px; line-height: 1.7; color: var(--ex-muted-strong);
  transition: border-color .25s;
}
.code-pre:hover { border-color: color-mix(in srgb, var(--ex-accent) 24%, var(--ex-border)); }
.code-pre--tall { max-height: 300px; }
.path-badge {
  padding: 2px 8px; border-radius: 6px;
  border: 1px solid color-mix(in srgb, var(--ex-accent) 22%, transparent);
  background: color-mix(in srgb, var(--ex-accent) 8%, transparent);
  color: var(--ex-accent-text); font-family: var(--ex-mono); font-size: 9.5px; letter-spacing: .04em;
}

/* ---------- 指标 ---------- */
.metrics { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 14px; }
@media (min-width: 720px) { .metrics { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
.metric {
  display: flex; flex-direction: column; gap: 3px; padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--ex-border) 72%, transparent); border-radius: 10px;
  background: color-mix(in srgb, var(--ex-text) 2%, var(--ex-surface));
  transition: border-color .25s;
}
.metric:hover { border-color: color-mix(in srgb, var(--ex-accent) 26%, var(--ex-border)); }
.metric-label { font-size: 9.5px; letter-spacing: .05em; color: var(--ex-muted); text-transform: uppercase; }
.metric-num { font-family: var(--ex-mono); font-size: 17px; font-weight: 700; letter-spacing: -.02em; color: var(--ex-text); font-variant-numeric: tabular-nums; }
.metric.is-local .metric-num { color: var(--ex-ok); }
.metric.is-ai .metric-num { color: var(--ex-info); }
.metric.is-miss .metric-num { color: var(--ex-muted-strong); }
.metrics .bar--wide { grid-column: 1 / -1; margin-top: 4px; }

/* ---------- 按钮 ---------- */
.icon-btn {
  display: inline-grid; place-items: center; width: 30px; height: 30px; flex: none;
  border: 1px solid transparent; border-radius: 8px; color: var(--ex-muted); cursor: pointer; background: transparent;
  transition: color .2s, background .2s, border-color .2s;
}
.icon-btn svg { width: 15px; height: 15px; }
.icon-btn:hover:not(:disabled) {
  color: var(--ex-accent-text);
  background: color-mix(in srgb, var(--ex-accent) 8%, transparent);
  border-color: color-mix(in srgb, var(--ex-accent) 22%, transparent);
}
.icon-btn:disabled { opacity: .4; cursor: not-allowed; }
.btn-quiet {
  height: 28px; padding: 0 10px; border-radius: 8px; flex: none;
  border: 1px solid color-mix(in srgb, var(--ex-border) 84%, transparent); background: transparent;
  font-size: 11px; font-weight: 600; color: var(--ex-muted-strong); cursor: pointer;
  transition: color .2s, border-color .2s, background .2s;
}
.btn-quiet:hover { color: var(--ex-accent-text); border-color: color-mix(in srgb, var(--ex-accent) 34%, var(--ex-border)); }
.btn-danger-quiet {
  height: 28px; padding: 0 10px; border-radius: 8px; flex: none;
  border: 1px solid color-mix(in srgb, #dc2626 22%, transparent); background: transparent;
  font-size: 11px; font-weight: 600; color: #dc2626; cursor: pointer;
  transition: color .2s, border-color .2s, background .2s, transform .12s;
}
.dark .btn-danger-quiet { color: #f87171; border-color: color-mix(in srgb, #f87171 24%, transparent); }
.btn-danger-quiet:hover { background: color-mix(in srgb, #dc2626 7%, transparent); border-color: color-mix(in srgb, #dc2626 40%, transparent); }
.btn-danger-quiet:active, .btn-quiet:active { transform: scale(.97); }
.btn-quiet:focus-visible, .btn-danger-quiet:focus-visible, .btn-copy:focus-visible, .note-link:focus-visible, .icon-btn:focus-visible {
  outline: 2px solid var(--ex-accent); outline-offset: 2px;
}

/* ---------- 日志 ---------- */
.log-tools { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.seg {
  display: inline-flex; padding: 2px; border-radius: 9px;
  border: 1px solid color-mix(in srgb, var(--ex-border) 80%, transparent);
  background: color-mix(in srgb, var(--ex-text) 3%, transparent);
}
.seg-btn {
  padding: 4px 10px; border: 0; border-radius: 7px; background: transparent; cursor: pointer;
  font-size: 10.5px; font-weight: 600; color: var(--ex-muted);
  transition: color .22s, background .22s, box-shadow .22s;
}
.seg-btn:hover { color: var(--ex-accent-text); }
.seg-btn.is-active {
  color: var(--ex-accent-text); background: color-mix(in srgb, var(--ex-accent) 10%, var(--ex-surface));
  box-shadow: 0 1px 2px rgba(0, 0, 0, .06);
}
.seg-btn:focus-visible { outline: 2px solid var(--ex-accent); outline-offset: 1px; }
.icon-btn-spin.is-spinning { animation: ex-spin .8s linear infinite; }
@keyframes ex-spin { to { transform: rotate(360deg); } }

.panel--logs { overflow: hidden; }
.log-table-wrap { max-height: 520px; overflow: auto; }
.log-table { width: 100%; min-width: 700px; border-collapse: collapse; font-size: 12px; }
/* 窄屏：收起次要列，表格横向滚动而不是把 7 列压成一团；右侧渐隐提示可滑动 */
@media (max-width: 640px) {
  .log-table { min-width: 560px; }
  .log-table .col-type, .log-table .col-ans { display: none; }
  .log-table-wrap {
    -webkit-mask-image: linear-gradient(90deg, #000 0, #000 calc(100% - 28px), transparent 100%);
    mask-image: linear-gradient(90deg, #000 0, #000 calc(100% - 28px), transparent 100%);
  }
}
.log-table thead th {
  position: sticky; top: 0; z-index: 1; text-align: left; white-space: nowrap;
  padding: 10px 14px; background: color-mix(in srgb, var(--ex-text) 3.5%, var(--ex-surface));
  border-bottom: 1px solid var(--ex-border);
  font-family: var(--ex-mono); font-size: 9.5px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: var(--ex-muted);
}
.log-table td { padding: 9px 14px; border-bottom: 1px solid color-mix(in srgb, var(--ex-border) 62%, transparent); vertical-align: middle; color: var(--ex-muted-strong); }
.log-row { transition: background .18s; }
.log-row:hover { background: color-mix(in srgb, var(--ex-accent) 4%, transparent); }
.log-row:last-child td { border-bottom: 0; }
.mono { font-family: var(--ex-mono); }
.t-day { color: var(--ex-muted); opacity: .65; font-size: 10px; margin-right: 2px; }
.col-time { width: 96px; white-space: nowrap; font-size: 11px; }
.col-src { width: 62px; }
.col-q { min-width: 160px; max-width: 320px; color: var(--ex-text); }
.col-type { width: 74px; }
.col-res { width: 64px; }
.col-ans { width: 130px; }
.col-cost { width: 70px; text-align: right; white-space: nowrap; font-size: 11px; }
.col-cost.is-fast { color: var(--ex-ok); }
.col-cost.is-slow { color: var(--ex-warn); }
.col-cost.is-late { color: #dc2626; }
.dark .col-cost.is-late { color: #f87171; }
.log-state { padding: 34px 14px !important; text-align: center; font-size: 12px; color: var(--ex-muted); }

.src-tag {
  display: inline-flex; align-items: center; padding: 2px 7px; border-radius: 6px;
  font-family: var(--ex-mono); font-size: 9.5px; font-weight: 650; letter-spacing: .03em;
}
.src-tag--yatori { background: color-mix(in srgb, var(--ex-yatori) 10%, transparent); color: var(--ex-yatori); }
.src-tag--ocs { background: color-mix(in srgb, var(--ex-ocs) 12%, transparent); color: var(--ex-ocs); }

.res-badge {
  display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 999px;
  font-size: 10px; font-weight: 650; letter-spacing: .02em; white-space: nowrap;
}
.res-badge.is-local { background: color-mix(in srgb, var(--ex-ok) 11%, transparent); color: var(--ex-ok); }
.res-badge.is-ai { background: color-mix(in srgb, var(--ex-info) 11%, transparent); color: var(--ex-info); }
.res-badge.is-miss { background: color-mix(in srgb, var(--ex-text) 6%, transparent); color: var(--ex-muted); }
.res-badge.is-off { background: color-mix(in srgb, var(--ex-warn) 12%, transparent); color: var(--ex-warn); }

/* ---------- AI 实时并发 ---------- */
.ai-load {
  display: flex; flex-direction: column; gap: 9px;
  padding: 12px 13px 13px;
  border: 1px dashed color-mix(in srgb, var(--ex-border) 90%, transparent);
  border-radius: 11px;
  background: color-mix(in srgb, var(--ex-text) 2%, transparent);
}
.ai-load .side-label { margin: 0; }
.ai-load-top { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.ai-load-num { display: inline-flex; align-items: baseline; gap: 3px; font-family: var(--ex-mono); font-size: 11px; color: var(--ex-muted-strong); }
.ai-load-num .num { font-size: 15px; font-weight: 700; letter-spacing: -.02em; color: var(--ex-text); font-variant-numeric: tabular-nums; }
.ai-load-num .slash { opacity: .45; }
.ai-queue {
  margin-left: 8px; padding: 1px 6px; border-radius: 999px; font-style: normal;
  background: color-mix(in srgb, var(--ex-warn) 12%, transparent); color: var(--ex-warn); font-size: 9.5px;
}
.ai-queue .num { font-size: 9.5px; font-weight: 650; color: inherit; }
.ai-slots { display: flex; flex-wrap: wrap; gap: 3px; }
.ai-slot {
  width: 10px; height: 22px; border-radius: 3px; transform-origin: bottom center;
  background: color-mix(in srgb, var(--ex-text) 6%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ex-text) 5%, transparent);
  transition: background .35s ease, box-shadow .35s ease;
}
.ai-slot.is-busy {
  background: linear-gradient(180deg, color-mix(in srgb, var(--ex-accent) 78%, white), var(--ex-accent));
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--ex-accent) 38%, transparent), 0 5px 12px -5px color-mix(in srgb, var(--ex-accent) 65%, transparent);
}
.dark .ai-slot.is-busy { background: linear-gradient(180deg, color-mix(in srgb, var(--ex-accent) 88%, white 12%), color-mix(in srgb, var(--ex-accent) 70%, black)); }
.ai-slots.is-waiting .ai-slot:not(.is-busy) { animation: ex-slot-wait 1.8s ease-in-out infinite; }
@keyframes ex-slot-wait { 0%, 100% { opacity: .5; } 50% { opacity: 1; } }
.ai-load-hint { margin: 0; font-size: 10.5px; line-height: 1.55; color: var(--ex-muted); }

/* ---------- 章节锚点偏移（导轨样式已抽离到 SectionNav） ---------- */
.console { scroll-margin-top: 20px; }
.section { scroll-margin-top: 76px; }
@media (min-width: 1024px) {
  .section { scroll-margin-top: 22px; }
}

.note-link {
  padding: 0 1px; border: 0; background: none; cursor: pointer; font: inherit;
  color: var(--ex-accent-text);
  border-bottom: 1px dashed color-mix(in srgb, var(--ex-accent) 42%, transparent);
  transition: background .2s, border-color .2s;
}
.note-link:hover {
  background: color-mix(in srgb, var(--ex-accent) 9%, transparent);
  border-bottom-color: var(--ex-accent);
}

.is-located { animation: ex-located 1s cubic-bezier(.22, 1, .36, 1); }
@keyframes ex-located {
  0% { box-shadow: 0 0 0 0 var(--ex-locate-ring); }
  70% { box-shadow: 0 0 0 8px transparent; }
  100% { box-shadow: 0 0 0 0 transparent; }
}

/* ---------- 动效降级 ---------- */
@media (prefers-reduced-motion: reduce) {
  .console-orb, .rail.is-live .rail-line, .icon-btn-spin.is-spinning, .status-pill.is-saving .status-dot { animation: none; }
  .flow::before { animation: none; }
  .ai-slots.is-waiting .ai-slot:not(.is-busy) { animation: none; }
  .flow-carrier { transition: none; }
  .is-located { animation: none; }
}
</style>

