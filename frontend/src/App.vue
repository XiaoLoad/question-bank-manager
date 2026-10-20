<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useThemeStore } from '@/stores/theme'
import { useAiTaskStore } from '@/stores/aiTask'
import AppLayout from '@/components/AppLayout.vue'
import ToastContainer from '@/components/ToastContainer.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import AiProgressBall from '@/components/AiProgressBall.vue'
import GlobalLoader from '@/components/GlobalLoader.vue'

const theme = useThemeStore()
const router = useRouter()
const aiTask = useAiTaskStore()

// 首屏初始导航（含懒加载 chunk 加载与登录态重定向）完成前，
// 不渲染 AppLayout 与 router-view，避免已登录刷新 /login 时侧栏/首页面板闪现
const routerReady = ref(false)

onMounted(() => {
  theme.init()
  router.isReady().then(() => { routerReady.value = true })
})

// 点击悬浮球
const handleBallClick = () => {
  const task = aiTask.task
  if (!task?.questionId) return
  // 通知题目详情页重新展开 AI 弹窗（在本页时 router.push 不会重新挂载页面，
  // 必须经 store 的 reopenRequest 驱动；跨页时由详情页挂载后的 watch 消费）
  aiTask.requestReopen(task.questionId)
  const target = `/questions/${task.questionId}`
  if (String(router.currentRoute.value.params.id || '') !== String(task.questionId)) {
    router.push(target).catch(() => {})
  }
}
</script>

<template>
  <div v-if="routerReady">
    <AppLayout>
      <router-view v-slot="{ Component }">
        <Transition name="page" mode="out-in">
          <KeepAlive :include="['Questions', 'Categories', 'Quiz']">
            <component :is="Component" />
          </KeepAlive>
        </Transition>
      </router-view>
    </AppLayout>
    <ToastContainer />
    <GlobalLoader />
    <ConfirmDialog />
    <AiProgressBall @click="handleBallClick" />
  </div>
</template>
