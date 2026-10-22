<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'

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

const open = ref(false)
const search = ref('')
const containerRef = ref(null)
const triggerRef = ref(null)
const inputRef = ref(null)
const flipUp = ref(false)

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

/* 打开方向：面板可能被最近的裁剪/滚动祖先截断，实测一次空间再决定向上或向下展开 */
const MIN_DROPDOWN_SPACE_REM = 20

function spaceLimits(el) {
  const rect = el.getBoundingClientRect()
  let top = 0
  let bottom = window.innerHeight
  let node = el.parentElement
  while (node && node !== document.documentElement) {
    if (getComputedStyle(node).overflowY !== 'visible') {
      const box = node.getBoundingClientRect()
      top = Math.max(top, box.top)
      bottom = Math.min(bottom, box.bottom)
      break
    }
    node = node.parentElement
  }
  return { top, bottom, rect }
}

function measureFlip() {
  const el = triggerRef.value
  if (!el) {
    flipUp.value = false
    return
  }
  const rootFont = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
  const needed = MIN_DROPDOWN_SPACE_REM * rootFont
  const { top, bottom, rect } = spaceLimits(el)
  const below = bottom - rect.bottom
  const above = rect.top - top
  flipUp.value = below < needed && above > below
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

function select(opt) {
  withoutAncestorScroll(() => {
    emit('update:modelValue', opt.value)
    open.value = false
    search.value = ''
  })
}

function toggle() {
  if (props.disabled) return
  if (open.value) {
    open.value = false
    return
  }
  measureFlip()
  search.value = ''
  open.value = true
  nextTick(focusSearch)
}

function onClickOutside(e) {
  if (containerRef.value && !containerRef.value.contains(e.target)) {
    open.value = false
    search.value = ''
  }
}

onMounted(() => document.addEventListener('mousedown', onClickOutside))
onBeforeUnmount(() => document.removeEventListener('mousedown', onClickOutside))
</script>

<template>
  <div ref="containerRef" class="ss-select relative">
    <button
      ref="triggerRef"
      type="button"
      @click="toggle"
      :disabled="disabled"
      class="select-field relative w-full text-left flex items-center pr-7"
      :class="disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'"
    >
      <span class="w-full min-w-0 truncate" :class="selectedLabel ? '' : 'text-notion-muted'">
        {{ selectedLabel || placeholder }}
      </span>
      <svg class="ss-chevron absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 flex-shrink-0 transition-transform" :class="open ? 'rotate-180' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
      </svg>
    </button>

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
        class="ss-pop absolute z-50 w-full flex rounded-card shadow-lg overflow-hidden"
        :class="flipUp ? 'bottom-full mb-1 flex-col-reverse' : 'mt-1 flex-col'"
      >
        <div class="shrink-0 p-2 border-notion-border" :class="flipUp ? 'border-t' : 'border-b'">
          <input
            ref="inputRef"
            v-model="search"
            type="text"
            class="input-field text-xs py-1.5"
            placeholder="搜索分类..."
          />
        </div>
        <div class="ss-list grow shrink min-h-0 max-h-48 overflow-y-auto">
          <div
            v-for="opt in filteredOptions"
            :key="opt.value"
            @click="select(opt)"
            class="ss-row px-3 py-2 text-xs cursor-pointer transition-colors flex items-center justify-between"
            :class="opt.value === modelValue ? 'ss-row-selected' : ''"
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
  </div>
</template>

<style scoped>
/* 弹层局部 token：全部由全局 --theme-* 派生，因此 6 套主题与暗色模式自动跟随 */
.ss-select {
  --ss-pop-surface: color-mix(in srgb, var(--theme-text) 3%, var(--theme-surface));
  --ss-pop-border: var(--theme-border);
  --ss-pop-text: var(--theme-text);
  --ss-pop-muted: var(--theme-muted);
  --ss-pop-hover: color-mix(in srgb, var(--theme-text) 5%, transparent);
  --ss-pop-selected: color-mix(in srgb, var(--theme-accent) 12%, transparent);
  --ss-pop-accent: var(--theme-accent);
  --ss-pop-max-h: 20rem;
}

/* html 上的 dark 类（tailwind darkMode:'class'）只调整混合强度，不引入颜色字面量 */
.dark .ss-select {
  --ss-pop-surface: color-mix(in srgb, var(--theme-text) 6%, var(--theme-surface));
  --ss-pop-hover: color-mix(in srgb, var(--theme-text) 8%, transparent);
  --ss-pop-selected: color-mix(in srgb, var(--theme-accent) 18%, transparent);
}

.ss-chevron {
  color: var(--ss-pop-muted);
}

.ss-pop {
  background-color: var(--ss-pop-surface);
  border: 1px solid var(--ss-pop-border);
  color: var(--ss-pop-text);
  max-height: var(--ss-pop-max-h);
}

/* 向上展开时缩放动画自底边发起，向下时自顶边发起 */
.ss-pop {
  transform-origin: top center;
}

.bottom-full.ss-pop {
  transform-origin: bottom center;
}

.ss-list {
  scrollbar-width: thin;
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
