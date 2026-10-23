<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'

const props = defineProps({
  modelValue: { type: String, default: '' },
  options: { type: Array, default: () => [] },
  placeholder: { type: String, default: '请选择' },
  allLabel: { type: String, default: '' },
  labelField: { type: String, default: 'label' },
  valueField: { type: String, default: 'value' },
  disabled: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue'])

/* ── 浮层几何 ─────────────────────────────────────────────────────────────
   面板通过 <Teleport to="body"> 挂到 document.body 并以 position:fixed 定位，
   因此完全脱离祖先的 overflow 裁剪、stacking context 与「程序化滚动 overflow:hidden
   祖先」这条抖动路径；所有坐标由触发器 getBoundingClientRect() 计算。 */

/* 判定下侧空间是否够用的自然高度下限：20rem（= 旧版 MIN_DROPDOWN_SPACE_REM） */
const MIN_DROPDOWN_SPACE_REM = 20
/* 面板与视口边缘之间的呼吸间距 */
const VIEWPORT_PAD = 8
/* 面板与触发器之间的间距（旧版 mt-1 / mb-1 = 0.25rem） */
const GAP = 4
/* 可用空间额外让出的余量：max-height = 所选方向可用空间 - 12px */
const SAFETY = 12
/* max-height 下限，避免空间紧张时面板塌成不可用 */
const MIN_PANEL_H = 160
/* 视口极端狭窄时的硬截断下限 */
const MIN_FIT_H = 96
/* 宽度下限：与 .ss-pop 的 min-width: 10rem 同源（rem 随根字号缩放，
   写死 px 会在大根字号下被 CSS 反顶出视口） */
const MIN_PANEL_W_REM = 10
/* --ss-pop-max-h：设计上的自然最大高度（rem） */
const NATURAL_CAP_REM = 20
/* 旧版 .ss-list 的 max-h-48 = 12rem：选项很少时让面板保持紧凑，
   下侧空间充裕也不把 max-height 灌满（否则只有几行时会撑出一大片空白） */
const NATURAL_LIST_CAP_REM = 12
/*
  z-index 阶梯（站内既有层级）：
     40        章节导航 rail（SectionNav.vue:172）
     90        页内覆盖层（DataManagement.vue:2472）
    200        页内浮层档位 —— 本组件在页面流里使用时的档位，高于以上、低于所有弹窗
  9994 ~ 9998  站点级弹窗 / 确认弹窗（ImportCategoryDialog z-[9997]、Categories 移动弹窗 z-[9998]）
  9999 / 10000 toast / 全局 loading —— 浮层永远不越过这一档
  挂到 body 之后回到根层叠上下文：若一律写死 200，弹窗里的下拉会被自己所在的弹窗盖住。
  因此取「承载它的宿主层级」同档 —— Teleport 把面板追加在 <body> 末尾，DOM 顺序在宿主之后，
  同 z 已经压得住宿主；同时用 Z_CEILING 夹住，绝不进入 toast/loading 档。
*/
const Z_FALLBACK = 200
const Z_CEILING = 9998

const open = ref(false)
const search = ref('')
const containerRef = ref(null)
const triggerRef = ref(null)
const inputRef = ref(null)
const panelRef = ref(null)
const searchRef = ref(null)
const listRef = ref(null)
const flipUp = ref(false)
const panelStyle = ref({})
const listStyle = ref({})
/* document.body 不可用时（SSR 首帧 / 极端宿主环境）降级为原地渲染：
   Teleport 置 disabled，fixed 坐标仍以视口为参照，位置不受影响 */
const canTeleport = ref(false)

const allOptions = computed(() => {
  const list = []
  if (props.allLabel) {
    list.push({ label: props.allLabel, value: '' })
  }
  for (const opt of props.options) {
    if (typeof opt === 'string') {
      list.push({ label: opt, value: opt })
    } else {
      list.push({ label: opt[props.labelField] || opt.label || opt.value, value: opt[props.valueField] || opt.value || '' })
    }
  }
  return list
})

const filteredOptions = computed(() => {
  if (!search.value.trim()) return allOptions.value
  const q = search.value.trim().toLowerCase()
  return allOptions.value.filter(opt => opt.label.toLowerCase().includes(q))
})

const selectedLabel = computed(() => {
  const found = allOptions.value.find(opt => opt.value === props.modelValue)
  return found ? found.label : ''
})

function rootFontSizePx() {
  const n = parseFloat(getComputedStyle(document.documentElement).fontSize)
  return Number.isFinite(n) && n > 0 ? n : 16
}

/* 从触发器向上找最近的整数 z-index（遇到 position:fixed 祖先即停） */
function resolveZIndex() {
  let hostZ = 0
  let node = triggerRef.value
  while (node && node !== document.documentElement) {
    const cs = getComputedStyle(node)
    const z = parseInt(cs.zIndex, 10)
    if (Number.isFinite(z)) hostZ = Math.max(hostZ, z)
    if (cs.position === 'fixed') break
    node = node.parentElement
  }
  if (hostZ <= 0) return Z_FALLBACK
  return Math.min(hostZ, Z_CEILING)
}

/* 重算面板几何：水平 clamp → 垂直翻转 → 高度按所选方向收敛 */
function place() {
  const trig = triggerRef.value
  if (!trig) return

  const r = trig.getBoundingClientRect()
  const vw = window.innerWidth
  const vh = window.innerHeight

  /* 水平：默认与触发器等宽，clamp 进视口；右缘越界则右边对齐触发器右边 */
  const rootFont = rootFontSizePx()
  const minW = Math.round(MIN_PANEL_W_REM * rootFont)
  const width = Math.min(Math.max(minW, Math.min(r.width, vw - VIEWPORT_PAD * 2)), vw - VIEWPORT_PAD * 2)
  let left = r.left
  if (left + width > vw - VIEWPORT_PAD) left = r.right - width
  if (left < VIEWPORT_PAD) left = 0                        // 左边缘越界：贴回 0
  const maxLeft = Math.max(0, vw - VIEWPORT_PAD - width)   // 最终夹逼，保证整块在视口内
  if (left > maxLeft) left = maxLeft

  /* 垂直：优先向下；下侧不够自然高度且上侧更有空间时才向上翻转 */
  const roomBelow = vh - r.bottom
  const roomAbove = r.top
  const needed = MIN_DROPDOWN_SPACE_REM * rootFont + GAP
  flipUp.value = roomBelow < needed && roomAbove > roomBelow

  const avail = (flipUp.value ? roomAbove : roomBelow) - GAP
  const fit = avail - SAFETY                                // 可用空间 - 12px
  const cap = NATURAL_CAP_REM * rootFont
  let maxH = Math.min(cap, Math.max(MIN_PANEL_H, fit))
  maxH = Math.max(MIN_FIT_H, Math.min(maxH, fit))           // 面板本体绝不超出视口

  const style = {
    position: 'fixed',
    left: Math.round(left) + 'px',
    width: Math.round(width) + 'px',
    maxHeight: Math.round(maxH) + 'px',
    zIndex: String(resolveZIndex())
  }
  if (flipUp.value) style.bottom = Math.round(vh - r.top + GAP) + 'px'
  else style.top = Math.round(r.bottom + GAP) + 'px'
  panelStyle.value = style

  /* .ss-list 的 max-height 按可用空间动态收敛：面板 = 搜索区 + 列表 + 上下 1px 边框 */
  const searchH = searchRef.value ? searchRef.value.offsetHeight : 0
  const budget = Math.max(40, Math.round(maxH) - searchH - 2)
  /* 视口给得更多时也只到旧版 max-h-48（12rem），再按预算截断，两者取小 */
  const listMax = Math.round(NATURAL_LIST_CAP_REM * rootFont)
  listStyle.value = { maxHeight: Math.max(40, Math.min(budget, listMax)) + 'px' }
}

let rafId = 0
function schedulePlace() {
  if (rafId) return
  rafId = requestAnimationFrame(() => {
    rafId = 0
    place()
  })
}

function onScrollReposition(e) {
  /* 面板内部列表自己的滚动不需要重算，只响应外部滚动带来的触发器位移 */
  const t = e && e.target
  if (t && t.nodeType === 1 && panelRef.value && panelRef.value.contains(t)) return
  schedulePlace()
}

function startTracking() {
  stopTracking()
  window.addEventListener('scroll', onScrollReposition, { passive: true, capture: true })
  window.addEventListener('resize', schedulePlace)
}

function stopTracking() {
  window.removeEventListener('scroll', onScrollReposition, { capture: true })
  window.removeEventListener('resize', schedulePlace)
  if (rafId) {
    cancelAnimationFrame(rafId)
    rafId = 0
  }
}

function focusTrigger() {
  const trig = triggerRef.value
  if (!trig) return
  withoutAncestorScroll(() => trig.focus({ preventScroll: true }))
}

/* 关闭：先摘掉 scroll/resize 监听，再卸载浮层 */
function closeDropdown(withFocus) {
  stopTracking()
  open.value = false
  search.value = ''
  if (withFocus) focusTrigger()
}

function select(opt) {
  withoutAncestorScroll(() => {
    emit('update:modelValue', opt.value)
    closeDropdown()
  })
  /* 键盘/读屏用户选完项之后焦点要有归属，交还给触发器（preventScroll 保证不引发任何滚动） */
  focusTrigger()
}

/* 祖先滚动保护：focus() 与面板卸载都会让可滚动祖先跟着滚动，
   因此记录并在下一帧复位这些祖先的 scrollTop/scrollLeft，面板开合期间页面保持原位 */
function clippedAncestors(el) {
  const nodes = []
  let node = el ? el.parentElement : null
  while (node && node !== document.documentElement) {
    if (node.scrollHeight > node.clientHeight || node.scrollWidth > node.clientWidth) nodes.push(node)
    node = node.parentElement
  }
  return nodes
}

function withoutAncestorScroll(mutate) {
  const nodes = clippedAncestors(containerRef.value)
  const snapshot = nodes.map(node => [node, node.scrollTop, node.scrollLeft])
  mutate()
  const restore = () => {
    for (const [node, top, left] of snapshot) {
      if (node.scrollTop !== top) node.scrollTop = top
      if (node.scrollLeft !== left) node.scrollLeft = left
    }
  }
  restore()
  nextTick(restore)
}

function focusSearch() {
  if (!inputRef.value) return
  withoutAncestorScroll(() => inputRef.value.focus({ preventScroll: true }))
}

function toggle() {
  if (props.disabled) return
  if (open.value) {
    closeDropdown()
    return
  }
  search.value = ''
  /* 先按触发器矩形算好坐标再打开：面板挂到 body 后若首帧没有坐标，
     会先在 <body> 末尾以静态位置闪现一次 */
  place()
  open.value = true
  startTracking()
  nextTick(() => {
    place()
    nextTick(() => {
      place()        // 搜索区高度与列表滚动条就绪后再收敛一次
      focusSearch()
    })
  })
}

function onClickOutside(e) {
  if (!open.value) return
  const inTrigger = containerRef.value && containerRef.value.contains(e.target)
  /* 面板已 Teleport 到 body，不在 containerRef 子树内，必须一并放行 */
  const inPanel = panelRef.value && panelRef.value.contains(e.target)
  if (!inTrigger && !inPanel) closeDropdown(false)   // 点击空白处：焦点交给被点中的元素，不抢回
}

watch(canTeleport, () => {
  /* 面板在「body 顶层」与「组件子树内」之间迁移时重测一次：
     子树内可能受祖先 transform 影响 fixed 的参照系 */
  if (open.value) nextTick(place)
})

onMounted(() => {
  canTeleport.value = !!document.body
  document.addEventListener('mousedown', onClickOutside)
  if (open.value) {
    startTracking()
    nextTick(place)
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onClickOutside)
  stopTracking()
})
</script>

<template>
  <div ref="containerRef" class="ss-select relative">
    <button
      ref="triggerRef"
      type="button"
      @click="toggle"
      @keydown.esc="closeDropdown(true)"
      :disabled="disabled"
      class="select-field relative w-full text-left flex items-center pr-7"
      :class="disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'"
      aria-haspopup="listbox"
      :aria-expanded="open ? 'true' : 'false'"
    >
      <span class="w-full min-w-0 truncate" :class="selectedLabel ? '' : 'text-notion-muted'">
        {{ selectedLabel || placeholder }}
      </span>
      <svg class="ss-chevron absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 flex-shrink-0 transition-transform" :class="open ? 'rotate-180' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
      </svg>
    </button>

    <Teleport to="body" :disabled="!canTeleport">
      <Transition
        enter-active-class="transition ease-out duration-100"
        enter-from-class="opacity-0 scale-95"
        enter-to-class="opacity-100 scale-100"
        leave-active-class="transition ease-in duration-75"
        leave-from-class="opacity-100 scale-100"
        leave-to-class="opacity-0 scale-95"
      >
        <div
          v-if="open"
          ref="panelRef"
          class="ss-pop flex rounded-card shadow-lg overflow-hidden"
          :class="flipUp ? 'ss-pop-up flex-col-reverse' : 'flex-col'"
          :style="panelStyle"
        >
          <div ref="searchRef" class="shrink-0 p-2 border-notion-border" :class="flipUp ? 'border-t' : 'border-b'">
            <input
              ref="inputRef"
              v-model="search"
              type="text"
              class="input-field text-xs py-1.5"
              placeholder="搜索分类..."
              @keydown.esc="closeDropdown(true)"
            />
          </div>
          <div
            ref="listRef"
            role="listbox"
            class="ss-list grow shrink min-h-0 overflow-y-auto"
            :style="listStyle"
          >
            <div
              v-for="opt in filteredOptions"
              :key="opt.value"
              @click="select(opt)"
              class="ss-row px-3 py-2 text-xs cursor-pointer transition-colors flex items-center justify-between"
              :class="opt.value === modelValue ? 'ss-row-selected' : ''"
              role="option"
              :aria-selected="opt.value === modelValue ? 'true' : 'false'"
            >
              <span class="truncate">{{ opt.label }}</span>
              <svg v-if="opt.value === modelValue" class="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
              </svg>
            </div>
            <div v-if="filteredOptions.length === 0" class="ss-empty px-3 py-4 text-xs text-center">
              无匹配项
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
/* 弹层局部 token：全部由全局 --theme-* 派生（color-mix + var），
   因此 6 套主题与暗色模式自动跟随，浮层不引入任何调色板字面量。
   面板 Teleport 到 body 后已不在 .ss-select 子树内，令牌必须同时在面板自身上声明。 */
.ss-select,
.ss-pop {
  --ss-pop-surface: color-mix(in srgb, var(--theme-text) 3%, var(--theme-surface));
  --ss-pop-border: var(--theme-border);
  --ss-pop-text: var(--theme-text);
  --ss-pop-muted: var(--theme-muted);
  --ss-pop-hover: color-mix(in srgb, var(--theme-text) 5%, transparent);
  --ss-pop-selected: color-mix(in srgb, var(--theme-accent) 12%, transparent);
  --ss-pop-accent: var(--theme-accent);
  --ss-pop-max-h: 20rem;
}

/* html 上的 dark 类（tailwind darkMode:'class'）只调整混合强度，不引入颜色字面量。
   scoped 编译只把 data-v 补在复合选择器的最后一段（.dark .ss-pop[data-v-x]），而 Teleport 会保留
   面板自身的 data-v 属性，因此这条覆写在面板挂到 body 之后依然命中。 */
.dark .ss-select,
.dark .ss-pop {
  --ss-pop-surface: color-mix(in srgb, var(--theme-text) 6%, var(--theme-surface));
  --ss-pop-hover: color-mix(in srgb, var(--theme-text) 8%, transparent);
  --ss-pop-selected: color-mix(in srgb, var(--theme-accent) 18%, transparent);
}

.ss-chevron {
  color: var(--ss-pop-muted);
}

/* left/top/width/maxHeight/zIndex 由脚本按视口边界内联写入；
   这里只留兜底：min-width 与不设内联值时的自然上限。 */
.ss-pop {
  background-color: var(--ss-pop-surface);
  border: 1px solid var(--ss-pop-border);
  color: var(--ss-pop-text);
  min-width: 10rem;
  max-height: var(--ss-pop-max-h);
  transform-origin: top center;
}

/* 向上展开时缩放动画自底边发起，向下时自顶边发起 */
.ss-pop-up {
  transform-origin: bottom center;
}

.ss-list {
  scrollbar-width: thin;
  max-height: var(--ss-pop-max-h);
}

.ss-row {
  color: var(--ss-pop-text);
}

.ss-row:hover {
  background-color: var(--ss-pop-hover);
}

.ss-row.ss-row-selected,
.ss-row.ss-row-selected:hover {
  background-color: var(--ss-pop-selected);
  color: var(--ss-pop-accent);
}

.ss-empty {
  color: var(--ss-pop-muted);
}
</style>
