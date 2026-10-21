import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

export const useAiTaskStore = defineStore('aiTask', () => {
  // 活动任务状态
  const task = ref(null)
  // task: { questionId, question, status, result, error, progress }
  // status: 'generating' | 'completed' | 'error'

  // 弹窗是否打开（用于控制悬浮球显示）
  const modalOpen = ref(false)

  // 悬浮球点击后的"重新展开弹窗"请求：{ questionId, seq }
  // seq 递增保证每次点击都是新对象，详情页的 watch 一定会被触发
  const reopenRequest = ref(null)

  // 弹窗开始"收拢进悬浮球"的广播：{ questionId, seq }
  // 悬浮球监听它来抑制普通入场、改播吸收动画；lastCollapseAt 供
  // checkAndShow 判断"刚刚收拢过"，避免两条 watcher 时序竞争
  const collapseSignal = ref(null)
  const lastCollapseAt = ref(0)
  let collapseSeq = 0

  function signalCollapse(questionId) {
    lastCollapseAt.value = Date.now()
    collapseSignal.value = { questionId, seq: ++collapseSeq }
  }

  // 弹窗下一次入场是否要"从悬浮球槽位展开"（点悬浮球/生成中重开时置 true，
  // 弹窗 enterAnimation 消费后复位），与收拢动画构成可逆的视觉闭环
  const expandFromBall = ref(false)

  // AbortController for cancelling
  let abortController = null

  const isGenerating = computed(() => task.value?.status === 'generating')
  const isCompleted = computed(() => task.value?.status === 'completed')
  const hasTask = computed(() => task.value !== null)

  // 开始新任务
  function startTask(question) {
    // 如果已有任务在运行，先取消
    if (abortController) {
      abortController.abort()
    }

    abortController = new AbortController()

    task.value = {
      questionId: question.id,
      question,
      status: 'generating',
      result: null,
      error: null,
      progress: 0,
      promptText: '',
      displayedText: '',
    }

    return abortController
  }

  // 更新提示词
  function setPromptText(text) {
    if (task.value) {
      task.value.promptText = text
    }
  }

  // 追加显示文本
  function appendText(text) {
    if (task.value) {
      task.value.displayedText += text
    }
  }

  // 完成任务
  function completeTask(result) {
    if (task.value) {
      task.value.status = 'completed'
      task.value.result = result
      task.value.progress = 100
    }
  }

  // 任务出错
  function setError(error) {
    if (task.value) {
      task.value.status = 'error'
      task.value.error = error
    }
  }

  // 取消任务
  function cancelTask() {
    if (abortController) {
      abortController.abort()
      abortController = null
    }
    task.value = null
  }

  // 清除任务（完成后）
  function clearTask() {
    task.value = null
    abortController = null
  }

  // 设置弹窗状态
  function setModalOpen(open) {
    modalOpen.value = open
  }

  // 发起"重新展开弹窗"请求（悬浮球点击时调用）
  let reopenSeq = 0
  function requestReopen(questionId) {
    // 弹窗入场要反过来"从悬浮球槽位展开"，与收拢动画构成同一对轨迹
    expandFromBall.value = true
    reopenRequest.value = { questionId, seq: ++reopenSeq }
  }

  // 消费掉请求，避免重复触发
  function consumeReopen() {
    reopenRequest.value = null
  }

  return {
    task,
    modalOpen,
    reopenRequest,
    collapseSignal,
    lastCollapseAt,
    expandFromBall,
    isGenerating,
    isCompleted,
    hasTask,
    startTask,
    setPromptText,
    appendText,
    completeTask,
    setError,
    cancelTask,
    clearTask,
    setModalOpen,
    signalCollapse,
    requestReopen,
    consumeReopen,
  }
})
