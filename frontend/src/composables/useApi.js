import { useToastStore } from '@/stores/toast'
import { useAuthStore } from '@/stores/auth'

function buildQuery(params = {}) {
  const qs = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') qs.set(k, v)
  })
  return qs
}

/** 401 时清除登录态；仅当本次请求原本携带 token（登录态失效）才整页跳登录，
 *  未登录访问受保护接口（如登录页误调）不跳转，避免与登录页守卫形成重定向环 */
function handle401(authStore) {
  const hadToken = !!authStore.token
  authStore.logout()
  if (hadToken && window.location.pathname !== '/login') {
    window.location.href = '/login'
  }
  return { status: 401, data: { error: '登录已过期' } }
}

async function request(url, options = {}) {
  const toast = useToastStore()
  const authStore = useAuthStore()

  try {
    const headers = { 'Content-Type': 'application/json' }

    // 添加 token
    if (authStore.token) {
      headers['Authorization'] = `Bearer ${authStore.token}`
    }

    const res = await fetch(url, {
      headers,
      ...options,
    })

    if (res.status === 401) {
      throw handle401(authStore)
    }

    const data = await res.json()
    if (!res.ok) {
      const msg = data.error || data.message || '请求失败'
      toast.error(msg)
      throw { status: res.status, data }
    }
    return data
  } catch (err) {
    if (err.name === 'AbortError') return // Silently ignore cancelled requests
    if (err.status) throw err
    toast.error('网络错误，请检查连接')
    throw err
  }
}

export function useApi() {
  return {
    // Auth
    login: (username, password) => request('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),

    // Questions
    getQuestions: (params = {}) => request(`/api/questions?${buildQuery(params)}`),
    getQuestion: (id) => request(`/api/questions/${id}`),
    createQuestion: (body) => request('/api/questions', { method: 'POST', body: JSON.stringify(body) }),
    updateQuestion: (id, body) => request(`/api/questions/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    updateQuestionAiStatus: (id, status) => request(`/api/questions/${id}/ai-status`, { method: 'PUT', body: JSON.stringify({ status }) }),
    deleteQuestion: (id) => request(`/api/questions/${id}`, { method: 'DELETE' }),
    batchDelete: (body) => request('/api/questions/batch-delete', { method: 'POST', body: JSON.stringify(body) }),
    batchCategory: (body) => request('/api/questions/batch-category', { method: 'PUT', body: JSON.stringify(body) }),

    // Stats
    getStats: (days) => request(`/api/stats${days ? `?days=${days}` : ''}`),
    getAdminStats: (days) => request(`/api/stats/admin${days ? `?days=${days}` : ''}`),

    // Site Settings
    getSiteSettings: () => request('/api/site-settings'),
    getSiteSettingsAll: () => request('/api/site-settings/all'),
    updateSiteSettings: (body) => request('/api/site-settings', { method: 'PUT', body: JSON.stringify(body) }),
    getHitokoto: () => request('/api/site-settings/hitokoto'),

    // Quiz
    getTypeCounts: (category) => request(`/api/quiz/type-counts${category ? `?category=${encodeURIComponent(category)}` : ''}`),
    getQuizQuestions: (params = {}) => request(`/api/quiz/questions?${buildQuery(params)}`),
    checkQuizAnswer: (id, answer) => request('/api/quiz/check', { method: 'POST', body: JSON.stringify({ id, answer }) }),
    reportQuizResult: (result) => request('/api/quiz/result', { method: 'POST', body: JSON.stringify(result) }),

    // Categories
    getCategories: () => request('/api/categories'),
    createCategory: (name, score, notes) => request('/api/categories', { method: 'POST', body: JSON.stringify({ name, score, notes }) }),
    updateCategory: (id, nameOrBody) => {
      const body = typeof nameOrBody === 'object' ? nameOrBody : { name: nameOrBody };
      return request(`/api/categories/${id}`, { method: 'PUT', body: JSON.stringify(body) });
    },
    moveCategory: (id, target) => request(`/api/categories/${id}/move`, { method: 'POST', body: JSON.stringify({ target }) }),
    deleteCategory: (id, confirm) => request(`/api/categories/${id}`, { method: 'DELETE', body: JSON.stringify({ confirm }) }),

    // Backup
    getBackupStats: () => request('/api/backup/stats'),
    downloadBackup: () => {
      const toast = useToastStore()
      const authStore = useAuthStore()
      fetch('/api/backup', {
        headers: { 'Authorization': `Bearer ${authStore.token}` },
      })
        .then(res => {
          if (!res.ok) return res.json().then(d => { throw d })
          return res.blob()
        })
        .then(blob => {
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `question-bank-backup-${new Date().toISOString().slice(0, 10)}.db`
          a.click()
          URL.revokeObjectURL(url)
          toast.success('备份下载成功')
        })
        .catch(err => {
          toast.error(err.error || '备份下载失败')
        })
    },
    exportJson: (params = {}) => {
      const toast = useToastStore()
      const authStore = useAuthStore()
      fetch('/api/backup/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authStore.token}`,
        },
        body: JSON.stringify(params),
      })
        .then(res => {
          if (!res.ok) return res.json().then(d => { throw d })
          return res.blob()
        })
        .then(blob => {
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `questions-export-${new Date().toISOString().slice(0, 10)}.json`
          a.click()
          URL.revokeObjectURL(url)
          toast.success('导出成功')
        })
        .catch(err => {
          toast.error(err.error || '导出失败')
        })
    },
    importJson: (questions, categoryScores) => request('/api/backup/import', { method: 'POST', body: JSON.stringify({ questions, categoryScores }) }),
    previewImport: (questions) => request('/api/backup/import/preview', { method: 'POST', body: JSON.stringify({ questions }) }),
    resolveImportConflicts: (updates) => request('/api/backup/import/resolve', { method: 'POST', body: JSON.stringify({ updates }) }),

    // Trash
    getTrash: (params = {}) => request(`/api/trash?${buildQuery(params)}`),
    getTrashCount: () => request('/api/trash/count'),
    restoreTrash: (id, force = false) => request(`/api/trash/${id}/restore`, { method: 'POST', body: JSON.stringify({ force }) }),
    batchRestoreTrash: (body) => request('/api/trash/batch-restore', { method: 'POST', body: JSON.stringify(body) }),
    permanentDeleteTrash: (id) => request(`/api/trash/${id}`, { method: 'DELETE' }),
    batchPermanentDeleteTrash: (body) => request('/api/trash/batch-delete', { method: 'POST', body: JSON.stringify(body) }),
    emptyTrash: () => request('/api/trash/empty', { method: 'POST' }),

    // AI
    getAiPresets: () => request('/api/ai/presets'),
    getAiProviders: () => request('/api/ai/providers'),
    createAiProvider: (body) => request('/api/ai/providers', { method: 'POST', body: JSON.stringify(body) }),
    updateAiProvider: (id, body) => request(`/api/ai/providers/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    deleteAiProvider: (id) => request(`/api/ai/providers/${id}`, { method: 'DELETE' }),
    testAiProvider: (id) => request(`/api/ai/providers/${id}/test`, { method: 'POST' }),
    getAiModels: (id) => request(`/api/ai/providers/${id}/models`),
    analyzeQuestion: (body) => {
      const timeout = parseInt(localStorage.getItem('ai_timeout') || '120') * 1000
      return request('/api/ai/analyze', { method: 'POST', body: JSON.stringify({ ...body, timeout }) })
    },

    // User AI Providers
    getUserAiProviders: () => request('/api/user-ai/providers'),
    createUserAiProvider: (body) => request('/api/user-ai/providers', { method: 'POST', body: JSON.stringify(body) }),
    updateUserAiProvider: (id, body) => request(`/api/user-ai/providers/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    deleteUserAiProvider: (id) => request(`/api/user-ai/providers/${id}`, { method: 'DELETE' }),
    testUserAiProvider: (id) => request(`/api/user-ai/providers/${id}/test`, { method: 'POST' }),
    getUserAiModels: (id) => request(`/api/user-ai/providers/${id}/models`),
    getUserAiAdminConfig: () => request('/api/user-ai/admin-config'),

    // User AI Prompts
    getUserAiPrompts: () => request('/api/user-ai/prompts'),
    updateUserAiPrompt: (key, body) => request(`/api/user-ai/prompts/${key}`, { method: 'PUT', body: JSON.stringify(body) }),
    resetUserAiPrompt: (key) => request(`/api/user-ai/prompts/${key}/reset`, { method: 'POST' }),

    // Admin Default Prompts
    getDefaultPrompts: () => request('/api/user-ai/default-prompts'),
    updateDefaultPrompt: (key, body) => request(`/api/user-ai/default-prompts/${key}`, { method: 'PUT', body: JSON.stringify(body) }),
    resetDefaultPrompt: (key) => request(`/api/user-ai/default-prompts/${key}/reset`, { method: 'POST' }),

    // Duplicates
    getDuplicates: () => request('/api/duplicates'),
    resolveDuplicates: (body) => request('/api/duplicates/resolve', { method: 'POST', body: JSON.stringify(body) }),

    // External Banks
    getExternalConfig: () => request('/api/external/config'),
    updateExternalConfig: (body) => request('/api/external/config', { method: 'PUT', body: JSON.stringify(body) }),
    regenerateExternalApiKey: () => request('/api/external/api-key/regenerate', { method: 'POST' }),
    getExternalStats: () => request('/api/external/stats'),
    getExternalLogs: (params = {}) => request(`/api/external/logs?${buildQuery(params)}`),
    clearExternalLogs: (days) => request('/api/external/logs', { method: 'DELETE', body: JSON.stringify({ days }) }),

    // Database
    getDatabase: () => request('/api/database'),
    switchDatabase: (dbPath) => request('/api/database/switch', { method: 'POST', body: JSON.stringify({ dbPath }) }),
    resetDatabase: () => request('/api/database/reset', { method: 'POST' }),
    removeRecentDb: (dbPath) => request('/api/database/recent', { method: 'DELETE', body: JSON.stringify({ dbPath, deleteFile: true }) }),
    uploadDatabase: async (file, desiredName) => {
      const toast = useToastStore()
      const authStore = useAuthStore()
      const formData = new FormData()
      formData.append('file', file)
      const url = desiredName ? `/api/database/upload?desiredName=${encodeURIComponent(desiredName)}` : '/api/database/upload'
      try {
        const res = await fetch(url, {
          method: 'POST',
          body: formData,
          headers: { 'Authorization': `Bearer ${authStore.token}` },
        })
        if (res.status === 401) {
          throw handle401(authStore)
        }
        const data = await res.json()
        if (!res.ok) {
          toast.error(data.error || '上传失败')
          throw { status: res.status, data }
        }
        return data
      } catch (err) {
        if (err.status) throw err
        toast.error('网络错误，请检查连接')
        throw err
      }
    },
  }
}
