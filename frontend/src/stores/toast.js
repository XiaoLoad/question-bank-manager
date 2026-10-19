import { defineStore } from 'pinia'
import { ref } from 'vue'

let toastId = 0
const DEFAULT_DURATION = 3400

// 计时器存放在模块级 Map，避免引入响应式开销：id -> { timer, duration, start, remaining, paused }
const timers = new Map()

export const useToastStore = defineStore('toast', () => {
  const toasts = ref([])

  // 新通知插到队首（渲染在最上方），把旧通知向下推，配合 TransitionGroup 呈现层叠递推动画
  function add(message, type = 'success', duration = DEFAULT_DURATION) {
    const id = ++toastId
    toasts.value.unshift({ id, message, type, duration })
    arm(id, duration)
    return id
  }

  function arm(id, duration) {
    const record = timers.get(id) || {}
    clearTimeout(record.timer)
    record.duration = duration
    record.start = performance.now()
    record.paused = false
    record.timer = setTimeout(() => remove(id), duration)
    timers.set(id, record)
  }

  // 悬停暂停倒计时
  function pause(id) {
    const record = timers.get(id)
    if (!record || record.paused) return
    clearTimeout(record.timer)
    record.paused = true
    record.remaining = Math.max(800, record.duration - (performance.now() - record.start))
  }

  function resume(id) {
    const record = timers.get(id)
    if (!record || !record.paused) return
    record.paused = false
    record.duration = record.remaining
    record.start = performance.now()
    record.timer = setTimeout(() => remove(id), record.remaining)
  }

  function remove(id) {
    const record = timers.get(id)
    if (record) {
      clearTimeout(record.timer)
      timers.delete(id)
    }
    const idx = toasts.value.findIndex(t => t.id === id)
    if (idx !== -1) toasts.value.splice(idx, 1)
  }

  const success = (message, duration) => add(message, 'success', duration)
  const error = (message, duration) => add(message, 'error', duration)
  const info = (message, duration) => add(message, 'info', duration)

  return { toasts, add, remove, pause, resume, success, error, info }
})
