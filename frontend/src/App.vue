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
  // 跳转到题目详情页
  if (aiTask.task?.questionId) {
    router.push(`/questions/${aiTask.task.questionId}`)
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
