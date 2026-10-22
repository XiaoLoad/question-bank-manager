<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { prefersReducedMotion } from '@/utils/motionTokens'

defineOptions({ name: 'SectionNav' })

const props = defineProps({
  // [{ nav: Number, index: String, label: String }]
  sections: { type: Array, required: true },
  // [data-nav] 锚点的查询作用域：页面根元素（模板 ref）；null 时测量安全退化不报错
  container: { type: Object, default: null },
  ariaLabel: { type: String, default: '章节导航' },
  // 判定「当前章节」的视口带高 = window.innerHeight * bandRatio
  bandRatio: { type: Number, default: 0.36 },
  // 落点脉冲的目标（相对锚点元素查询），查不到就脉冲锚点本身
  locateSelector: { type: String, default: '.panel' },
  // <1024px 的横向章节胶囊
  chips: { type: Boolean, default: false }
})

const emit = defineEmits(['jump'])

const activeNav = ref(0)
const chipsRef = ref(null)

let secRaf = 0
let secLast = 0
let locateTimer = 0

// container 可传模板 ref 解出来的元素、ref 对象或组件实例，统一解析成真实元素
function scopeEl() {
  const c = props.container
  if (!c) return null
  if (c.nodeType === 1) return c
  if (c.value && c.value.nodeType === 1) return c.value
  if (c.$el && c.$el.nodeType === 1) return c.$el
  return null
}

function measureNav() {
  const scope = scopeEl()
  if (!scope) return
  const band = window.innerHeight * props.bandRatio
  let idx = 0
  scope.querySelectorAll('[data-nav]').forEach((el) => {
    if (el.getBoundingClientRect().top <= band) idx = Number(el.dataset.nav)
  })
  if (activeNav.value !== idx) activeNav.value = idx
}

function trackSections() {
  const now = performance.now()
  if (now - secLast > 90) {
    secLast = now
    measureNav()
    return
  }
  if (secRaf) return
  secRaf = requestAnimationFrame(() => {
    secRaf = 0
    secLast = performance.now()
    measureNav()
  })
}

function jumpTo(idx) {
  const scope = scopeEl()
  if (!scope) return
  const el = scope.querySelector(`[data-nav="${idx}"]`)
  if (!el) return
  activeNav.value = idx
  emit('jump', idx)
  const reduced = prefersReducedMotion()
  el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
  if (reduced) return
  const ring = el.querySelector(props.locateSelector) || el
  ring.classList.remove('is-located')
  void ring.offsetWidth
  ring.classList.add('is-located')
  if (locateTimer) clearTimeout(locateTimer)
  locateTimer = setTimeout(() => ring.classList.remove('is-located'), 1000)
}

// 胶囊在横向滚动区里，激活项换人时把它带回视野（nearest，不触发页面滚动）
watch(activeNav, (nav) => {
  if (!props.chips) return
  nextTick(() => {
    chipsRef.value?.querySelector(`[data-chip="${nav}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  })
})

onMounted(() => {
  window.addEventListener('scroll', trackSections, { passive: true, capture: true })
  window.addEventListener('resize', trackSections, { passive: true })
  nextTick(trackSections)
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', trackSections, { capture: true })
  window.removeEventListener('resize', trackSections)
  if (secRaf) cancelAnimationFrame(secRaf)
  if (locateTimer) clearTimeout(locateTimer)
})

defineExpose({ jumpTo })
</script>

<template>
  <div class="sn">
    <nav class="sn-nav" :aria-label="ariaLabel">
      <button
        v-for="s in sections"
        :key="s.nav"
        type="button"
        class="sn-item"
        :class="{ 'is-active': activeNav === s.nav }"
        :aria-current="activeNav === s.nav ? 'true' : undefined"
        :style="{ '--i': s.nav }"
        @click="jumpTo(s.nav)"
      >
        <span class="sn-tip"><i>{{ s.index }}</i>{{ s.label }}</span>
        <span class="sn-bar" aria-hidden="true"></span>
      </button>
    </nav>

    <nav v-if="chips" ref="chipsRef" class="sn-chips" :aria-label="ariaLabel + '（紧凑）'">
      <button
        v-for="s in sections"
        :key="'chip' + s.nav"
        type="button"
        class="sn-chip"
        :data-chip="s.nav"
        :class="{ 'is-active': activeNav === s.nav }"
        :aria-current="activeNav === s.nav ? 'true' : undefined"
        @click="jumpTo(s.nav)"
      >
        <i>{{ s.index }}</i>{{ s.label }}
      </button>
    </nav>
  </div>
</template>

<style scoped>
/* 导轨与胶囊的 token 只从全局 --theme-* 派生（themes.css 在 :root / .theme-* / .dark.theme-*
   三处声明，与所在页面无关），不读页面局部变量（--ex-* / --dm-*），也不新增页面 token，
   因此同一份标记在 6 套主题与亮暗模式下都自动跟随换色。 */
.sn {
  --sn-text: var(--theme-text);
  --sn-border: var(--theme-border);
  --sn-accent: var(--theme-accent);
  --sn-surface: var(--theme-surface);
  --sn-muted: var(--theme-muted);
  --sn-muted-strong: color-mix(in srgb, var(--theme-muted) 62%, var(--theme-text));
  --sn-accent-text: color-mix(in srgb, var(--theme-accent) 82%, var(--theme-text));
  --sn-tip-border: color-mix(in srgb, var(--theme-border) 88%, transparent);
  --sn-tip-shadow: 0 10px 24px -18px rgba(0, 0, 0, 0.5);
  --sn-chip-line: color-mix(in srgb, var(--theme-border) 82%, transparent);
  --sn-chip-active-line: color-mix(in srgb, var(--theme-accent) 55%, transparent);
  --sn-chip-active-bg: color-mix(in srgb, var(--theme-accent) 12%, transparent);
  --sn-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace;
  /* 不产生盒子：导轨与胶囊各自保持原有的文档流身份 */
  display: contents;
}

/* ---------- ≥1024 右侧导轨 ---------- */
.sn-nav {
  position: fixed;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  /* 高于页内面板的焦点层级（DataManagement .dm-console:focus-within: 30），低于页面模态（90） */
  z-index: 40;
  display: none;
  flex-direction: column;
  align-items: flex-end;
  gap: 14px;
}
.sn-item {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  width: 24px;
  height: 16px;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
  animation: sn-in 0.5s cubic-bezier(0.22, 1, 0.36, 1) backwards;
  animation-delay: calc(160ms + var(--i, 0) * 45ms);
}
@keyframes sn-in {
  from {
    opacity: 0;
    transform: translateX(9px);
  }
}
.sn-bar {
  display: block;
  width: 9px;
  height: 2px;
  border-radius: 2px;
  background: color-mix(in srgb, var(--sn-text) 15%, transparent);
  transition: width 0.42s cubic-bezier(0.22, 1, 0.36, 1), background 0.3s ease, box-shadow 0.3s ease;
}
.sn-item:hover .sn-bar {
  width: 16px;
  background: color-mix(in srgb, var(--sn-text) 34%, transparent);
}
.sn-item.is-active .sn-bar {
  width: 24px;
  background: var(--sn-accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--sn-accent) 11%, transparent);
}
.sn-tip {
  position: absolute;
  right: calc(100% + 4px);
  top: 50%;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
  padding: 4px 9px;
  border-radius: 999px;
  border: 1px solid var(--sn-tip-border);
  background: color-mix(in srgb, var(--sn-surface) 94%, transparent);
  backdrop-filter: blur(6px);
  box-shadow: var(--sn-tip-shadow);
  font-size: 10.5px;
  font-weight: 600;
  color: var(--sn-muted-strong);
  opacity: 0;
  pointer-events: none;
  transform: translate(7px, -50%);
  transition: opacity 0.3s ease, transform 0.3s cubic-bezier(0.22, 1, 0.36, 1);
  transition-delay: calc(var(--i, 0) * 28ms);
}
.sn-tip i {
  font-family: var(--sn-mono);
  font-style: normal;
  font-size: 8.5px;
  letter-spacing: 0.1em;
  color: var(--sn-muted);
}
/* 揭示挂在容器上：悬停导轨 = 整排标签同时浮出，按 --i 错峰 */
.sn-nav:hover .sn-tip,
.sn-nav:focus-within .sn-tip {
  opacity: 1;
  transform: translate(0, -50%);
}
.sn-item.is-active .sn-tip {
  color: var(--sn-accent-text);
  border-color: color-mix(in srgb, var(--sn-accent) 26%, var(--sn-border));
}
.sn-item.is-active .sn-tip i {
  color: var(--sn-accent-text);
}
.sn-item:focus-visible {
  outline: 2px solid var(--sn-accent);
  outline-offset: 3px;
  border-radius: 6px;
}

/* ---------- <1024 横向胶囊 ---------- */
.sn-chips {
  display: flex;
  gap: 0.4rem;
  margin-top: -0.5rem;
  padding-bottom: 0.15rem;
  overflow-x: auto;
  scrollbar-width: none;
}
.sn-chips::-webkit-scrollbar {
  display: none;
}
.sn-chip {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: baseline;
  gap: 0.3rem;
  padding: 0.28rem 0.65rem;
  border: 1px solid var(--sn-chip-line);
  border-radius: 999px;
  background: var(--sn-surface);
  color: var(--sn-muted);
  font-size: 0.72rem;
  cursor: pointer;
  transition: color 0.25s ease, border-color 0.25s ease, background-color 0.25s ease;
}
.sn-chip i {
  font-style: normal;
  font-family: var(--sn-mono);
  font-size: 0.6rem;
  opacity: 0.85;
}
.sn-chip.is-active {
  color: var(--sn-text);
  border-color: var(--sn-chip-active-line);
  background: var(--sn-chip-active-bg);
}
.sn-chip:focus-visible {
  outline: 2px solid var(--sn-accent);
  outline-offset: 2px;
}

.dark .sn-nav {
  --sn-tip-border: color-mix(in srgb, var(--sn-border) 100%, transparent);
  --sn-tip-shadow: 0 12px 26px -16px rgba(0, 0, 0, 0.8);
}
.dark .sn-chips {
  --sn-chip-line: color-mix(in srgb, var(--sn-border) 110%, transparent);
}

@media (min-width: 1024px) {
  .sn-nav {
    display: flex;
  }
  .sn-chips {
    display: none;
  }
}

/* ---------- 动效降级 ---------- */
@media (prefers-reduced-motion: reduce) {
  .sn-item {
    animation: none;
  }
  .sn-bar,
  .sn-tip,
  .sn-chip {
    transition: none;
  }
  /* 降级时标签直接静态呈现：transform 固定居中，揭示与错峰延迟全部取消 */
  .sn-tip {
    transform: translate(0, -50%);
    transition-delay: 0s;
  }
}
</style>
