<script setup>
import { ref } from 'vue'
import { useToastStore } from '@/stores/toast'

const toast = useToastStore()
const hoverId = ref(null)

const iconMap = {
  success: 'M5 12.5l4.2 4.2L19 7',
  error: 'M7 7l10 10M17 7L7 17',
  info: 'M12 7.8h.01M12 11.2v5M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
}

// 层叠深度：越靠后的旧通知缩得越小、越透明。
// 注意：opacity/transform 必须作用在 .toast-card 上而非其父元素——
// 祖先的 opacity<1 或 filter 会创建 backdrop root，令卡片的 backdrop-filter 失效。
function depthStyle(idx) {
  return {
    '--d-scale': Math.pow(0.96, idx).toFixed(3),
    '--d-step': String(idx),
  }
}

function enter(id) {
  hoverId.value = id
  toast.pause(id)
}

function leave() {
  if (hoverId.value == null) return
  toast.resume(hoverId.value)
  hoverId.value = null
}
</script>

<template>
  <div class="toast-container" role="status" aria-live="polite">
    <TransitionGroup name="toast">
      <div
        v-for="(t, idx) in toast.toasts"
        :key="t.id"
        class="toast-item"
        :style="depthStyle(idx)"
        @mouseenter="enter(t.id)"
        @mouseleave="leave()"
      >
        <div class="toast-card" :data-type="t.type" :class="{ paused: hoverId === t.id }">
          <span class="toast-chip">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path :d="iconMap[t.type]" />
            </svg>
          </span>
          <p class="toast-msg">{{ t.message }}</p>
          <button class="toast-close" aria-label="关闭提示" @click="toast.remove(t.id)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
            </svg>
          </button>
          <i class="toast-progress" :style="{ animationDuration: t.duration + 'ms' }"></i>
        </div>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-container {
  position: fixed;
  z-index: 9999;
  top: 1rem;
  right: 1rem;
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: flex-end;
  width: 100%;
  max-width: 24rem;
  pointer-events: none;
}

.toast-item {
  pointer-events: auto;
}

/* 毛玻璃卡片：图标与文字中轴对齐。
   transform/opacity 全部定义在卡片自身，避免祖先创建 backdrop root
   导致 backdrop-filter 在入场动画期间失效 */
.toast-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 11px 10px 13px 12px;
  border-radius: 12px;
  overflow: hidden;
  background: color-mix(in srgb, var(--theme-surface) 78%, transparent);
  -webkit-backdrop-filter: blur(16px) saturate(1.6);
  backdrop-filter: blur(16px) saturate(1.6);
  border: 1px solid color-mix(in srgb, var(--theme-border) 65%, transparent);
  box-shadow: 0 12px 32px rgba(20, 20, 30, 0.14), 0 2px 8px rgba(20, 20, 30, 0.06);
  transform: translateX(0) scale(var(--d-scale, 1));
  opacity: calc(1 - var(--d-step, 0) * 0.22);
  transition: transform 0.45s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.3s ease;
}

.dark .toast-card {
  background: color-mix(in srgb, var(--theme-surface) 82%, transparent);
  border-color: color-mix(in srgb, var(--theme-border) 90%, transparent);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45), 0 2px 8px rgba(0, 0, 0, 0.3);
}

.toast-card[data-type='success'] { --tc: #16a34a; }
.toast-card[data-type='error'] { --tc: #dc2626; }
.toast-card[data-type='info'] { --tc: var(--theme-accent); }
.dark .toast-card[data-type='success'] { --tc: #34d399; }
.dark .toast-card[data-type='error'] { --tc: #f87171; }

.toast-chip {
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  color: var(--tc);
  background: color-mix(in srgb, var(--tc) 14%, transparent);
}

.toast-chip svg {
  width: 13px;
  height: 13px;
}

.toast-msg {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 0.875rem;
  line-height: 1.45;
  font-weight: 500;
  color: var(--theme-text);
}

.toast-close {
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  margin-right: -4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  background: transparent;
  border-radius: 7px;
  color: var(--theme-muted);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.toast-close:hover {
  background: color-mix(in srgb, var(--theme-text) 8%, transparent);
  color: var(--theme-text);
}

.toast-close svg {
  width: 13px;
  height: 13px;
}

/* 底部倒计时进度条，与自动消失时长同步，悬停暂停 */
.toast-progress {
  position: absolute;
  left: 0;
  bottom: 0;
  height: 2px;
  width: 100%;
  background: var(--tc);
  opacity: 0.8;
  transform-origin: 0 50%;
  animation: toast-progress-run linear forwards;
}

.toast-card.paused .toast-progress {
  animation-play-state: paused;
}

@keyframes toast-progress-run {
  from { transform: scaleX(1); }
  to { transform: scaleX(0); }
}

/* 入场：右侧弹簧滑入 + 模糊聚焦（过冲曲线）。
   动画作用在 .toast-card 上，父级仅作为 TransitionGroup 的挂载点 */
.toast-enter-active {
  transition: none;
}

.toast-enter-active .toast-card {
  transition: transform 0.6s cubic-bezier(0.26, 1.1, 0.44, 1), opacity 0.4s ease, filter 0.4s ease;
}

/* 退场：右侧滑出 + 模糊消散，absolute 让下方卡片无缝上移 */
.toast-leave-active {
  transition: none;
  position: absolute;
  left: 0;
  right: 0;
}

.toast-leave-active .toast-card {
  transition: transform 0.3s cubic-bezier(0.5, 0.05, 0.85, 0.5), opacity 0.3s ease, filter 0.3s ease;
}

.toast-enter-from .toast-card {
  transform: translateX(112%) scale(var(--d-scale, 1));
  opacity: 0;
  filter: blur(6px);
}

.toast-leave-to .toast-card {
  transform: translateX(112%) scale(var(--d-scale, 1));
  opacity: 0;
  filter: blur(4px);
}

/* 其余卡片的弹性递推（FLIP） */
.toast-move {
  transition: transform 0.5s cubic-bezier(0.22, 1, 0.36, 1);
}

/* 移动端适配：顶部通栏，从上方滑入 */
@media screen and (max-width: 639px) {
  .toast-container {
    top: 0;
    right: 0;
    left: 0;
    max-width: 100%;
    padding: max(0.75rem, env(safe-area-inset-top, 0px)) 0.75rem 0.75rem;
    gap: 8px;
  }

  .toast-enter-from .toast-card {
    transform: translateY(-110%) scale(var(--d-scale, 1));
  }

  .toast-leave-to .toast-card {
    transform: translateY(-110%) scale(var(--d-scale, 1));
  }
}

/* 无障碍：减少动效 */
@media (prefers-reduced-motion: reduce) {
  .toast-enter-active .toast-card,
  .toast-leave-active .toast-card,
  .toast-move {
    transition: opacity 0.15s ease;
  }

  .toast-enter-from .toast-card,
  .toast-leave-to .toast-card {
    transform: scale(var(--d-scale, 1));
    filter: none;
  }
}
</style>
