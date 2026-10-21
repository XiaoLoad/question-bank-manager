<script setup>
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useAiTaskStore } from '@/stores/aiTask'
import gsap from 'gsap'
import { aiCollapseMotion, prefersReducedMotion } from '@/utils/motionTokens'

const emit = defineEmits(['click'])
const aiTask = useAiTaskStore()

const ballRef = ref(null)
const visible = ref(false)
const pulseRef = ref(null)
let pulseAnimation = null
let autoHideTimer = null
let ballTweens = []
let absorbTimers = []
// 弹窗正在收拢飞向本球：吸收动画接管入场，抑制普通弹出，避免双动画打架
let absorbing = false

// 收拢动画的"卡片落地"时刻（与 AiAnalyzeModal.leaveAnimation 共用 token）：
// 自 signalCollapse 发出起算，落地 = flightStart + travel
const LAND_AT = aiCollapseMotion.landAt()

const clearBallTweens = () => {
  ballTweens.forEach((t) => t.kill())
  ballTweens = []
}

const clearAbsorbTimers = () => {
  absorbTimers.forEach((id) => clearTimeout(id))
  absorbTimers = []
}

// 入场动画 - 简单弹出
const enterAnimation = () => {
  if (!ballRef.value || absorbing) return
  clearBallTweens()
  ballTweens.push(gsap.fromTo(ballRef.value,
    { scale: 0, opacity: 0 },
    { scale: 1, opacity: 1, duration: 0.3, ease: 'back.out(1.7)' }
  ))
}

// 吸收动画 - 承接弹窗收拢的落点，"卡片变成球"的交接瞬间。
// 三段：① 卡片飞行途中球保持完全透明（卡片还在路上就现身会读成"球等卡片"，
//        破坏收拢因果）；直到落地前 popLead 窗口才原位凝出，与卡片最后一段
//        淡出交叉淡化，落地一刻恰好完全成形；
// ② 卡片落地一刻被压扁（纵向收、横向鼓 = squash，与斜向右下的飞行方向正交，符合受力逻辑）；
// ③ back.out 过冲弹回原形。
// 注意：不能用 fromTo 再叠一次 scale——两段 fromTo 同属性会因 immediateRender 互相掐掉；
// 所以 ① 用 set+to，②③ 用 to 串在同一条时间轴上。
const absorbAnimation = () => {
  const ball = ballRef.value
  if (!ball) return
  clearBallTweens()
  if (prefersReducedMotion()) {
    gsap.set(ball, { scale: 1, opacity: 1 })
    return
  }
  const m = aiCollapseMotion
  gsap.set(ball, { transformOrigin: '50% 50%', scale: 0.55, opacity: 0 })
  ballTweens.push(gsap.timeline()
    .to(ball, { scale: 1.06, opacity: 1, duration: m.popLead, ease: 'power2.out' }, LAND_AT - m.popLead)
    .to(ball, { scaleX: 1.24, scaleY: 0.74, duration: 0.09, ease: 'power2.in' }, LAND_AT)
    .to(ball, { scaleX: 1, scaleY: 1, duration: 0.38, ease: 'back.out(2.4)' }))
}

// 弹窗收拢 → 本球是落点：立即挂载但先透明，等卡片飞到位再做吸收交接。
// absorbing 期间抑制 checkAndShow 的普通弹出，避免两套入场动画打架。
watch(() => aiTask.collapseSignal, async (sig) => {
  if (!sig || !aiTask.task) return
  absorbing = true
  clearAbsorbTimers()
  visible.value = true
  await nextTick()
  if (!ballRef.value) { absorbing = false; return }
  absorbAnimation()
  absorbTimers.push(setTimeout(() => { absorbing = false }, (LAND_AT + 0.5) * 1000))
})

// 退场动画
const leaveAnimation = () => {
  return new Promise((resolve) => {
    if (!ballRef.value) { resolve(); return }
    clearBallTweens()
    ballTweens.push(gsap.to(ballRef.value, {
      scale: 0, opacity: 0, y: 20,
      duration: 0.3, ease: 'power2.in',
      onComplete: resolve
    }))
  })
}

// 脉冲动画
const startPulse = () => {
  if (!pulseRef.value) return
  pulseAnimation = gsap.to(pulseRef.value, {
    scale: 1.5, opacity: 0,
    duration: 1.5, repeat: -1, ease: 'power1.out'
  })
}

const stopPulse = () => {
  if (pulseAnimation) {
    pulseAnimation.kill()
    pulseAnimation = null
  }
}

// 检查并显示悬浮球
const checkAndShow = async () => {
  const task = aiTask.task
  // 只在弹窗关闭且有任务时显示
  if (!task || aiTask.modalOpen) {
    // 收拢交接期间：弹窗组件要到动画结束才 emit close（modalOpen 仍为 true），
    // 而流式 appendText 会持续触发本深watch——若此时卸载球，吸收动画会被掐断
    if (absorbing) return
    visible.value = false
    stopPulse()
    return
  }

  if (task.status === 'generating') {
    if (!visible.value) {
      visible.value = true
      await nextTick()
      enterAnimation()
    }
    startPulse()
  } else if (task.status === 'completed') {
    stopPulse()
    if (!visible.value) {
      visible.value = true
      await nextTick()
      enterAnimation()
    }
    // 3 秒后自动隐藏
    clearTimeout(autoHideTimer)
    autoHideTimer = setTimeout(async () => {
      await leaveAnimation()
      visible.value = false
      aiTask.clearTask()
    }, 3000)
  } else if (task.status === 'error') {
    stopPulse()
    if (!visible.value) {
      visible.value = true
      await nextTick()
      enterAnimation()
    }
    // 5 秒后自动隐藏
    clearTimeout(autoHideTimer)
    autoHideTimer = setTimeout(async () => {
      await leaveAnimation()
      visible.value = false
      aiTask.clearTask()
    }, 5000)
  }
}

// 监听任务状态变化
watch(() => aiTask.task, checkAndShow, { deep: true })

// 监听弹窗状态变化
watch(() => aiTask.modalOpen, (isOpen) => {
  if (!isOpen && aiTask.hasTask) {
    // 弹窗关闭且有任务，显示悬浮球
    nextTick(() => checkAndShow())
  } else if (isOpen) {
    // 弹窗打开：球"让位"给正在展开的卡片——收缩淡出后再卸载，
    // 与收拢动画互为镜像（卡片从球的位置长出来，球缩回卡片里）
    stopPulse()
    if (visible.value && ballRef.value && !prefersReducedMotion()) {
      clearBallTweens()
      ballTweens.push(gsap.to(ballRef.value, {
        scale: 0.4, opacity: 0, duration: 0.18, ease: 'power2.in',
        onComplete: () => { visible.value = false },
      }))
    } else {
      visible.value = false
    }
  }
})

// 组件挂载时检查
onMounted(() => {
  if (aiTask.hasTask && !aiTask.modalOpen) {
    checkAndShow()
  }
})

// 点击球
const handleClick = () => {
  emit('click')
}

onBeforeUnmount(() => {
  stopPulse()
  clearTimeout(autoHideTimer)
  clearAbsorbTimers()
  clearBallTweens()
})
</script>

<template>
  <Teleport to="body">
    <!-- 显隐/透明度全部交给 GSAP 控制，不再套 CSS Transition：
         否则 fade 类会和内联 opacity 逐帧"追逐"，与吸收时间轴打架 -->
    <div
      v-if="visible && aiTask.task"
      ref="ballRef"
      @click="handleClick"
      class="fixed bottom-6 right-6 z-[9998] cursor-pointer group"
    >
        <!-- 脉冲效果 -->
        <div
          v-if="aiTask.isGenerating"
          ref="pulseRef"
          class="absolute inset-0 rounded-full bg-purple-500"
        ></div>

        <!-- 主球体 -->
        <div
          :class="[
            'relative w-14 h-14 rounded-full shadow-lg flex flex-col items-center justify-center transition-colors',
            aiTask.isGenerating ? 'bg-purple-600' : aiTask.isCompleted ? 'bg-green-500' : 'bg-red-500'
          ]"
        >
          <!-- 生成中：旋转图标 -->
          <template v-if="aiTask.isGenerating">
            <svg class="w-5 h-5 text-white animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            <span class="text-[10px] text-white/80 mt-0.5">AI</span>
          </template>

          <!-- 完成：勾号 -->
          <template v-else-if="aiTask.isCompleted">
            <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
            </svg>
          </template>

          <!-- 错误：感叹号 -->
          <template v-else>
            <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01"/>
            </svg>
          </template>
        </div>

        <!-- Hover 提示 -->
        <div class="absolute bottom-full right-0 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
          {{ aiTask.isGenerating ? 'AI 生成中...' : aiTask.isCompleted ? '点击查看结果' : '生成失败，点击查看详情' }}
        </div>
    </div>
  </Teleport>
</template>
