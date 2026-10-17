<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { useApi } from '@/composables/useApi'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import { useConfirmStore } from '@/stores/confirm'
import Skeleton from '@/components/Skeleton.vue'

defineOptions({ name: 'AiSettings' })

const api = useApi()
const authStore = useAuthStore()
const toast = useToastStore()
const confirm = useConfirmStore()

const isAdmin = computed(() => authStore.isAdmin)

// ========== 数据状态 ==========
const providers = ref([])
const presets = ref([])
const loading = ref(true)
const providerQuery = ref('')
const adminConfig = ref({ authorized: false, providers: [] })

const prompts = ref({})
const defaultPrompts = ref({})
const promptScope = ref(isAdmin.value ? 'default' : 'user')

const promptLabels = {
  analyze: {
    name: 'AI 校验答案',
    desc: '用于题目详情页与刷题页的 AI 校验，模型会返回简要解析与答案。',
  },
}
const promptKeys = Object.keys(promptLabels)
const promptVariables = [
  { token: '{type}', label: '题型', desc: '题目类型，如单选题、多选题、判断题、填空题或简答题。' },
  { token: '{content}', label: '题目内容', desc: '题目的完整正文，包含题干文字与图片信息。' },
  { token: '{options}', label: '选项', desc: '选择题或判断题的选项，按 A. / B. 顺序拼接；无选项时为空。' },
  { token: '{category}', label: '分类', desc: '题目所属分类名称，会自动去掉导入来源后缀。' },
]

// ========== 请求超时 ==========
const aiTimeout = ref(clampTimeout(localStorage.getItem('ai_timeout')))
const timeoutSaved = ref(false)
let timeoutSavedTimer = null

// ========== 服务商表单 ==========
const showForm = ref(false)
const editingProvider = ref(null)
const saving = ref(false)
const showKey = ref(false)
const providerNameRef = ref(null)

const form = reactive({
  name: '',
  base_url: '',
  api_key: '',
  model: '',
  is_default: false,
})
const formSnapshot = ref('')

function formFingerprint() {
  return JSON.stringify({
    name: form.name,
    base_url: form.base_url,
    api_key: form.api_key,
    model: form.model,
    is_default: !!form.is_default,
  })
}

const formDirty = computed(() =>
  showForm.value && !!formSnapshot.value && formFingerprint() !== formSnapshot.value
)

// ========== 预设菜单 ==========
const showPresetMenu = ref(false)
const presetWrapRef = ref(null)

// ========== 服务商操作状态 ==========
const testingId = ref(null)
const loadingModelsId = ref(null)
const togglingId = ref(null)
const testResults = reactive({})
const copiedKey = ref('')
let copyTimer = null

// ========== 模型选择器 ==========
const modelPickerOpen = ref(false)
const modelPickerList = ref([])
const modelPickerCurrent = ref('')
const modelPickerProviderName = ref('')
const modelPickerResolve = ref(null)
const modelSearch = ref('')
const modelSearchRef = ref(null)

// ========== 提示词编辑器 ==========
const showPromptEditor = ref(false)
const editingPromptKey = ref('')
const editingIsDefault = ref(false)
const editingPrompt = reactive({ system_prompt: '', user_prompt: '' })
const savingPrompt = ref(false)
const editorSystemRef = ref(null)
const activePromptField = ref('user')
const promptSnapshot = ref('')

// 变量说明浮层
const varTip = reactive({
  visible: false,
  token: '',
  label: '',
  desc: '',
  x: 0,
  y: 0,
  placement: 'top',
})

// ========== 派生数据 ==========
const enabledProviders = computed(() => providers.value.filter(p => p.enabled))

// 服务商较多时支持按名称、模型、地址过滤；少量数据时始终展示全部
const visibleProviders = computed(() => {
  const q = providerQuery.value.trim().toLowerCase()
  if (!q || providers.value.length <= 4) return providers.value
  return providers.value.filter(p =>
    [p.name, p.base_url, p.model]
      .some(v => String(v || '').toLowerCase().includes(q))
  )
})

watch(() => providers.value.length, n => {
  if (n <= 4) providerQuery.value = ''
})

const activeProvider = computed(() =>
  enabledProviders.value.find(p => p.is_default) || enabledProviders.value[0] || null
)

// 普通用户未配置个人服务商时，若被授权可使用管理员共享 AI
const sharedProvider = computed(() => {
  if (isAdmin.value || activeProvider.value) return null
  if (!adminConfig.value.authorized) return null
  return adminConfig.value.providers.find(p => p.is_default) || adminConfig.value.providers[0] || null
})

const effectiveProvider = computed(() => activeProvider.value || sharedProvider.value)

const effectiveSource = computed(() => {
  if (activeProvider.value) return isAdmin.value ? '管理员全局配置' : '我的个人配置'
  if (sharedProvider.value) return '管理员共享'
  return ''
})

const enabledCount = computed(() => enabledProviders.value.length)

const readiness = computed(() => {
  if (effectiveProvider.value?.model) return { label: '已就绪', tone: 'ok' }
  if (effectiveProvider.value) return { label: '缺少模型', tone: 'warn' }
  if (providers.value.length || sharedProvider.value) return { label: '待启用', tone: 'warn' }
  return { label: '待配置', tone: 'warn' }
})

const customPrompt = computed(() => !!prompts.value.analyze?.is_custom)

const statCards = computed(() => {
  const ep = effectiveProvider.value
  return [
    {
      label: isAdmin.value ? '服务商' : '我的服务商',
      value: String(providers.value.length),
      hint: enabledCount.value
        ? `${enabledCount.value} 个已启用`
        : (!isAdmin.value && adminConfig.value.authorized ? '可回退到管理员 AI' : '暂无启用项'),
      accent: false,
      mono: false,
    },
    {
      label: '当前生效',
      value: ep?.name || '未配置',
      hint: ep ? effectiveSource.value : '添加并启用服务商',
      accent: !!ep,
      mono: false,
    },
    {
      label: '生效模型',
      value: ep?.model || '未选择',
      hint: ep?.model ? '用于答案校验' : '选择模型后才能校验',
      accent: false,
      mono: true,
    },
    {
      label: '提示词',
      value: customPrompt.value ? '已自定义' : '跟随默认',
      hint: `${aiTimeout.value} 秒请求超时`,
      accent: false,
      mono: false,
    },
  ]
})

const promptCards = computed(() =>
  promptKeys.map(key => {
    const isDefaultScope = isAdmin.value && promptScope.value === 'default'
    return {
      key,
      name: promptLabels[key].name,
      desc: promptLabels[key].desc,
      isDefaultScope,
      info: isDefaultScope ? defaultPrompts.value[key] : prompts.value[key],
    }
  })
)

const promptPriority = computed(() => {
  const custom = customPrompt.value
  return [
    {
      title: '我的自定义提示词',
      desc: '在「我的提示词」中保存的版本，优先级最高',
      active: custom,
    },
    {
      title: '全局默认提示词',
      desc: '管理员统一配置，未自定义时自动使用',
      active: !custom,
    },
    {
      title: '系统内置模板',
      desc: '未配置全局默认时的兜底版本',
      active: false,
    },
  ]
})

const timeoutPercent = computed(() => {
  const pct = ((aiTimeout.value - 10) / 590) * 100
  return `${Math.max(0, Math.min(100, pct))}%`
})

const urlInvalid = computed(() => !!form.base_url && !/^https?:\/\//i.test(form.base_url.trim()))

const modelSearchQuery = computed(() => modelSearch.value.trim().toLowerCase())
const filteredModels = computed(() => {
  const q = modelSearchQuery.value
  if (!q) return modelPickerList.value
  return modelPickerList.value.filter(m => String(m).toLowerCase().includes(q))
})

const criticalMissing = computed(() =>
  ['{type}', '{content}'].filter(v => !String(editingPrompt.user_prompt || '').includes(v))
)

const promptDirty = computed(() => {
  if (!showPromptEditor.value) return false
  const current = JSON.stringify({
    system_prompt: editingPrompt.system_prompt,
    user_prompt: editingPrompt.user_prompt,
  })
  return current !== promptSnapshot.value
})

const anyModalOpen = computed(
  () => showForm.value || modelPickerOpen.value || showPromptEditor.value
)

// ========== 生命周期 ==========
onMounted(async () => {
  try {
    if (isAdmin.value) {
      await Promise.all([loadProviders(), loadPresets(), loadDefaultPrompts()])
    } else {
      await Promise.all([loadUserProviders(), loadPresets(), loadAdminConfig()])
    }
    await loadPrompts()
  } finally {
    loading.value = false
  }
  document.addEventListener('keydown', onKeydown)
  document.addEventListener('pointerdown', onDocPointer)
})

let scrollLockState = null

// 锁定背景滚动时补偿滚动条宽度，避免内容因滚动条消失而横向抖动
function lockPageScroll() {
  if (scrollLockState) return

  const state = {
    bodyOverflow: document.body.style.overflow,
    bodyPaddingRight: document.body.style.paddingRight,
    main: null,
    mainOverflowY: '',
    mainPaddingRight: '',
  }

  const pageScrollbar = Math.max(0, window.innerWidth - document.documentElement.clientWidth)
  const bodyPadding = parseFloat(window.getComputedStyle(document.body).paddingRight) || 0
  if (pageScrollbar > 0) {
    document.body.style.paddingRight = `${bodyPadding + pageScrollbar}px`
  }
  document.body.style.overflow = 'hidden'

  const main = document.querySelector('main')
  if (main && window.getComputedStyle(main).overflowY !== 'visible') {
    const scrollbar = Math.max(0, main.offsetWidth - main.clientWidth)
    state.main = main
    state.mainOverflowY = main.style.overflowY
    state.mainPaddingRight = main.style.paddingRight
    if (scrollbar > 0) {
      const mainPadding = parseFloat(window.getComputedStyle(main).paddingRight) || 0
      main.style.paddingRight = `${mainPadding + scrollbar}px`
    }
    main.style.overflowY = 'hidden'
  }

  scrollLockState = state
}

function unlockPageScroll() {
  if (!scrollLockState) return

  if (scrollLockState.main) {
    scrollLockState.main.style.paddingRight = scrollLockState.mainPaddingRight
    scrollLockState.main.style.overflowY = scrollLockState.mainOverflowY
  }
  document.body.style.paddingRight = scrollLockState.bodyPaddingRight
  document.body.style.overflow = scrollLockState.bodyOverflow
  scrollLockState = null
}

watch(anyModalOpen, open => {
  if (open) lockPageScroll()
  else unlockPageScroll()
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  document.removeEventListener('pointerdown', onDocPointer)
  clearTimeout(timeoutSavedTimer)
  clearTimeout(copyTimer)
  hideVarTip()
  unlockPageScroll()
  if (modelPickerResolve.value) {
    modelPickerResolve.value(null)
    modelPickerResolve.value = null
  }
})

// ========== 数据加载 ==========
async function loadProviders() {
  try { providers.value = await api.getAiProviders() } catch {}
}

async function loadUserProviders() {
  try { providers.value = await api.getUserAiProviders() } catch {}
}

async function loadAdminConfig() {
  try { adminConfig.value = await api.getUserAiAdminConfig() } catch {}
}

async function loadPresets() {
  try { presets.value = await api.getAiPresets() } catch {}
}

async function loadPrompts() {
  try { prompts.value = await api.getUserAiPrompts() } catch {}
}

async function loadDefaultPrompts() {
  try { defaultPrompts.value = await api.getDefaultPrompts() } catch {}
}

function refreshProviders() {
  return isAdmin.value ? loadProviders() : loadUserProviders()
}

// ========== 服务商 CRUD ==========
async function openAddForm(preset = null) {
  editingProvider.value = null
  form.name = preset?.name || ''
  form.base_url = preset?.base_url || ''
  form.api_key = ''
  form.model = ''
  form.is_default = providers.value.length === 0
  formSnapshot.value = formFingerprint()
  showKey.value = false
  showPresetMenu.value = false
  showForm.value = true
  await nextTick()
  if (window.innerWidth >= 640) {
    providerNameRef.value?.focus()
    providerNameRef.value?.select?.()
  }
}

async function openEditForm(p) {
  editingProvider.value = p
  form.name = p.name || ''
  form.base_url = p.base_url || ''
  form.api_key = p.api_key || ''
  form.model = p.model || ''
  form.is_default = !!p.is_default
  formSnapshot.value = formFingerprint()
  showKey.value = false
  showForm.value = true
  await nextTick()
  if (window.innerWidth >= 640) providerNameRef.value?.focus()
}

async function closeForm(force = false) {
  if (saving.value && !force) return
  if (!force && formDirty.value) {
    const ok = await confirm.show({
      title: '放弃未保存的修改？',
      message: '服务商配置还没有保存，关闭后填写的内容将丢失。',
      confirmText: '放弃修改',
      danger: true,
    })
    if (!ok) return
  }
  showForm.value = false
  editingProvider.value = null
  showKey.value = false
  formSnapshot.value = ''
}

async function submitForm() {
  if (saving.value) return
  const name = form.name.trim()
  const baseUrl = form.base_url.trim()
  const apiKey = form.api_key.trim()
  if (!name || !baseUrl || !apiKey) {
    toast.error('请填写名称、API 地址和 API Key')
    return
  }
  if (!/^https?:\/\//i.test(baseUrl)) {
    toast.error('API 地址需要以 http:// 或 https:// 开头')
    return
  }

  saving.value = true
  const editingId = editingProvider.value?.id
  const payload = {
    name,
    base_url: baseUrl,
    api_key: apiKey,
    model: form.model.trim(),
    is_default: !!form.is_default,
  }
  try {
    if (editingProvider.value) {
      await (isAdmin.value
        ? api.updateAiProvider(editingProvider.value.id, payload)
        : api.updateUserAiProvider(editingProvider.value.id, payload))
      delete testResults[editingId]
      toast.success('服务商已更新')
    } else {
      await (isAdmin.value
        ? api.createAiProvider(payload)
        : api.createUserAiProvider(payload))
      toast.success('服务商已添加')
    }
    closeForm(true)
    providerQuery.value = ''
    await refreshProviders()
  } catch {} finally {
    saving.value = false
  }
}

async function deleteProvider(p) {
  const ok = await confirm.show({
    title: '删除服务商',
    message: `确定删除「${p.name}」吗？删除后需要重新配置才能用于 AI 校验。`,
    confirmText: '删除',
    danger: true,
  })
  if (!ok) return
  try {
    await (isAdmin.value ? api.deleteAiProvider(p.id) : api.deleteUserAiProvider(p.id))
    delete testResults[p.id]
    toast.success('已删除')
    await refreshProviders()
  } catch {}
}

async function setDefault(p) {
  try {
    await (isAdmin.value
      ? api.updateAiProvider(p.id, { is_default: true })
      : api.updateUserAiProvider(p.id, { is_default: true }))
    toast.success(`已将「${p.name}」设为默认`)
    await refreshProviders()
  } catch {}
}

async function toggleEnabled(p) {
  if (togglingId.value) return
  togglingId.value = p.id
  const next = !p.enabled
  try {
    await (isAdmin.value
      ? api.updateAiProvider(p.id, { enabled: next })
      : api.updateUserAiProvider(p.id, { enabled: next }))
    toast.success(`${p.name} 已${next ? '启用' : '停用'}`)
    await refreshProviders()
  } catch {} finally {
    togglingId.value = null
  }
}

async function testConnection(p) {
  if (testingId.value) return
  testingId.value = p.id
  try {
    const result = isAdmin.value
      ? await api.testAiProvider(p.id)
      : await api.testUserAiProvider(p.id)
    if (result.ok) {
      testResults[p.id] = { ok: true, message: '连接正常' }
      toast.success(`${p.name} 连接成功`)
    } else {
      testResults[p.id] = { ok: false, message: result.error || '连接失败' }
      toast.error(`连接失败：${result.error || '未知错误'}`)
    }
  } catch {} finally {
    testingId.value = null
  }
}

// ========== 模型 ==========
async function fetchModels(p) {
  if (!p || loadingModelsId.value) return
  loadingModelsId.value = p.id
  try {
    const result = isAdmin.value ? await api.getAiModels(p.id) : await api.getUserAiModels(p.id)
    if (result.models?.length) {
      const model = await showModelPicker(result.models, p.model, p.name)
      if (model !== null && model !== p.model) await applyModel(p, model)
    } else {
      toast.info('未获取到可用模型')
    }
  } catch {} finally {
    loadingModelsId.value = null
  }
}

async function applyModel(p, model) {
  if (!model) return
  try {
    await (isAdmin.value
      ? api.updateAiProvider(p.id, { model })
      : api.updateUserAiProvider(p.id, { model }))
    toast.success(`模型已设为 ${model}`)
    await refreshProviders()
  } catch {}
}

function showModelPicker(models, current, providerName) {
  if (modelPickerResolve.value) {
    modelPickerResolve.value(null)
    modelPickerResolve.value = null
  }
  modelPickerList.value = models
  modelPickerCurrent.value = current || ''
  modelPickerProviderName.value = providerName || ''
  modelSearch.value = ''
  modelPickerOpen.value = true
  nextTick(() => modelSearchRef.value?.focus())
  return new Promise(resolve => {
    modelPickerResolve.value = resolve
  })
}

function pickModel(model) {
  modelPickerOpen.value = false
  modelPickerResolve.value?.(model)
  modelPickerResolve.value = null
}

function cancelModelPicker() {
  modelPickerOpen.value = false
  modelPickerResolve.value?.(null)
  modelPickerResolve.value = null
}

function pickFirstModel() {
  if (filteredModels.value.length) pickModel(filteredModels.value[0])
}

// ========== 提示词 ==========
function openPromptEditor(key, isDefault) {
  const source = isDefault ? defaultPrompts.value[key] : prompts.value[key]
  editingPromptKey.value = key
  editingIsDefault.value = isDefault
  editingPrompt.system_prompt = source?.system_prompt || ''
  editingPrompt.user_prompt = source?.user_prompt || ''
  activePromptField.value = 'user'
  promptSnapshot.value = JSON.stringify({
    system_prompt: editingPrompt.system_prompt,
    user_prompt: editingPrompt.user_prompt,
  })
  showPromptEditor.value = true
  nextTick(() => {
    if (window.innerWidth >= 640) editorSystemRef.value?.focus()
  })
}

async function closePromptEditor(force = false) {
  if (!showPromptEditor.value) return
  hideVarTip()
  if (!force && promptDirty.value) {
    const ok = await confirm.show({
      title: '放弃未保存的修改？',
      message: '提示词还有未保存的修改，关闭后将无法恢复。',
      confirmText: '放弃修改',
      danger: true,
    })
    if (!ok) return
  }
  showPromptEditor.value = false
  editingPromptKey.value = ''
  editingIsDefault.value = false
  promptSnapshot.value = ''
}

async function savePrompt() {
  if (savingPrompt.value) return
  const systemPrompt = editingPrompt.system_prompt.trim()
  const userPrompt = editingPrompt.user_prompt.trim()
  if (!systemPrompt || !userPrompt) {
    toast.error('系统提示词与用户提示词不能为空')
    return
  }
  savingPrompt.value = true
  try {
    const key = editingPromptKey.value
    if (editingIsDefault.value) {
      await api.updateDefaultPrompt(key, {
        system_prompt: systemPrompt,
        user_prompt: userPrompt,
      })
      await loadDefaultPrompts()
      toast.success('默认提示词已更新')
    } else {
      await api.updateUserAiPrompt(key, {
        system_prompt: systemPrompt,
        user_prompt: userPrompt,
      })
      await loadPrompts()
      toast.success('提示词已保存')
    }
    await closePromptEditor(true)
  } catch {} finally {
    savingPrompt.value = false
  }
}

async function resetPrompt(key, isDefault) {
  const ok = await confirm.show({
    title: isDefault ? '恢复系统内置提示词' : '恢复默认提示词',
    message: isDefault
      ? '将删除管理员自定义的全局默认提示词，所有未单独自定义的用户都会回到系统内置版本。'
      : '将删除你的自定义提示词，改为使用当前全局默认提示词。',
    confirmText: '恢复',
    danger: true,
  })
  if (!ok) return false
  try {
    if (isDefault) {
      await api.resetDefaultPrompt(key)
      await loadDefaultPrompts()
      toast.success('已恢复系统内置提示词')
    } else {
      await api.resetUserAiPrompt(key)
      await loadPrompts()
      toast.success('已恢复默认提示词')
    }
    return true
  } catch {
    return false
  }
}

async function resetFromEditor() {
  const key = editingPromptKey.value
  const isDefault = editingIsDefault.value
  const ok = await resetPrompt(key, isDefault)
  if (ok) await closePromptEditor(true)
}

function insertVariable(variable) {
  const field = activePromptField.value === 'system' ? 'system_prompt' : 'user_prompt'
  const el = activePromptField.value === 'system' ? editorSystemRef.value : null
  const textarea = el || document.getElementById('prompt-user')
  if (!textarea) {
    editingPrompt[field] += variable
    return
  }
  const start = textarea.selectionStart ?? editingPrompt[field].length
  const end = textarea.selectionEnd ?? start
  editingPrompt[field] =
    editingPrompt[field].slice(0, start) + variable + editingPrompt[field].slice(end)
  nextTick(() => {
    textarea.focus()
    const pos = start + variable.length
    textarea.setSelectionRange(pos, pos)
  })
}

function showVarTip(event, variable) {
  // 仅在有悬停能力的设备上展示，避免触屏点按变量时弹出
  if (!window.matchMedia('(hover: hover)').matches) return
  const el = event.currentTarget
  if (!el) return

  const rect = el.getBoundingClientRect()
  const half = Math.min(160, window.innerWidth / 2)
  varTip.x = Math.min(Math.max(rect.left + rect.width / 2, half), window.innerWidth - half)
  varTip.placement = rect.top < 140 ? 'bottom' : 'top'
  varTip.y = varTip.placement === 'top'
    ? rect.top - 8
    : Math.min(rect.bottom + 8, window.innerHeight - 96)
  varTip.token = variable.token
  varTip.label = variable.label
  varTip.desc = variable.desc
  varTip.visible = true

  document.addEventListener('scroll', hideVarTip, true)
  window.addEventListener('resize', hideVarTip)
  window.addEventListener('blur', hideVarTip)
}

function hideVarTip() {
  if (!varTip.visible) return
  varTip.visible = false
  document.removeEventListener('scroll', hideVarTip, true)
  window.removeEventListener('resize', hideVarTip)
  window.removeEventListener('blur', hideVarTip)
}

// ========== 超时 ==========
function onTimeoutInput() {
  timeoutSaved.value = false
  clearTimeout(timeoutSavedTimer)
}

function saveTimeout() {
  const value = clampTimeout(aiTimeout.value)
  aiTimeout.value = value
  try { localStorage.setItem('ai_timeout', String(value)) } catch {}
  timeoutSaved.value = true
  clearTimeout(timeoutSavedTimer)
  timeoutSavedTimer = setTimeout(() => { timeoutSaved.value = false }, 1800)
}

function clampTimeout(raw) {
  const n = Number(raw)
  const value = Number.isFinite(n) && n > 0 ? n : 120
  return Math.max(10, Math.min(600, Math.round(value / 10) * 10))
}

// ========== 通用交互 ==========
async function copyText(text, key, label) {
  if (!text) return
  try {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text)
      } catch {
        legacyCopy(text)
      }
    } else {
      legacyCopy(text)
    }
  } catch {
    toast.error('复制失败，请手动复制')
    return
  }
  copiedKey.value = key
  clearTimeout(copyTimer)
  copyTimer = setTimeout(() => { copiedKey.value = '' }, 1600)
  toast.success(`${label}已复制`)
}

// 局域网 HTTP 下 Clipboard API 不可用，回退到 execCommand
function legacyCopy(text) {
  const ta = document.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', '')
  ta.style.position = 'fixed'
  ta.style.top = '-9999px'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  const ok = document.execCommand('copy')
  document.body.removeChild(ta)
  if (!ok) throw new Error('copy failed')
}

function onKeydown(e) {
  if (e.key !== 'Escape') return
  if (confirm.visible) return
  if (showPresetMenu.value) {
    showPresetMenu.value = false
    return
  }
  if (showPromptEditor.value) {
    closePromptEditor()
    return
  }
  if (modelPickerOpen.value) {
    cancelModelPicker()
    return
  }
  if (showForm.value) closeForm()
}

function onDocPointer(e) {
  if (!showPresetMenu.value) return
  if (!presetWrapRef.value?.contains(e.target)) showPresetMenu.value = false
}

function providerInitial(name) {
  const n = String(name || '').trim()
  return n ? n.slice(0, 1).toUpperCase() : '?'
}

function providerHost(url) {
  if (!url) return '未填写地址'
  try {
    return new URL(url).host
  } catch {
    return String(url).replace(/^https?:\/\//i, '').replace(/\/.*$/, '')
  }
}
</script>

<template>
  <div>
    <!-- 页头：与其它页面保持一致，仅标题 + 描述 + 右侧操作 -->
    <header class="anim-rise flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 flex-wrap mb-6 sm:mb-8">
      <div class="min-w-0">
        <h1 class="text-xl sm:text-2xl font-bold text-notion-text dark:text-notion-text-dark">AI 设置</h1>
        <p class="text-xs sm:text-sm text-notion-muted dark:text-notion-muted-dark mt-1">
          {{ isAdmin
            ? '管理全局 AI 服务商与提示词，为题库提供稳定的答案校验能力。'
            : '配置你的 AI 服务商与提示词，用于题目答案校验。' }}
        </p>
      </div>

      <div class="flex items-center gap-2 flex-shrink-0">
        <div ref="presetWrapRef" class="relative">
          <button
            type="button"
            class="btn-primary"
            :aria-expanded="showPresetMenu"
            aria-haspopup="menu"
            @click="showPresetMenu = !showPresetMenu"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
            </svg>
            添加服务商
            <svg
              class="w-3.5 h-3.5 transition-transform duration-300"
              :class="showPresetMenu ? 'rotate-180' : ''"
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
            </svg>
          </button>

          <Transition name="pop">
            <div v-if="showPresetMenu" class="preset-menu" role="menu" @click.stop>
              <p class="preset-label">自定义</p>
              <button type="button" role="menuitem" class="menu-item" @click="openAddForm()">
                <span class="menu-avatar menu-avatar--accent">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                  </svg>
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block text-sm font-medium text-notion-text dark:text-notion-text-dark">自定义服务商</span>
                  <span class="block text-[11px] text-notion-muted dark:text-notion-muted-dark truncate">任意 OpenAI 兼容接口</span>
                </span>
                <svg class="menu-arrow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                </svg>
              </button>

              <div class="menu-divider"></div>
              <p class="preset-label">常用预设</p>
              <button
                v-for="preset in presets"
                :key="preset.name"
                type="button"
                role="menuitem"
                class="menu-item"
                @click="openAddForm(preset)"
              >
                <span class="menu-avatar">{{ providerInitial(preset.name) }}</span>
                <span class="min-w-0 flex-1">
                  <span class="block text-sm font-medium text-notion-text dark:text-notion-text-dark">{{ preset.name }}</span>
                  <span class="block text-[11px] text-notion-muted dark:text-notion-muted-dark truncate font-mono">{{ providerHost(preset.base_url) }}</span>
                </span>
                <svg class="menu-arrow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                </svg>
              </button>
              <p v-if="!presets.length" class="px-3 py-2 text-[11px] text-notion-muted dark:text-notion-muted-dark">暂无内置预设</p>
            </div>
          </Transition>
        </div>
      </div>
    </header>

    <!-- 概览 -->
    <div
      v-if="!loading"
      class="anim-rise grid grid-cols-2 lg:grid-cols-4 gap-px bg-notion-border dark:bg-notion-border-dark border border-notion-border dark:border-notion-border-dark rounded-card overflow-hidden mb-6"
      style="--d: 60ms"
    >
      <div
        v-for="s in statCards"
        :key="s.label"
        class="bg-notion-surface dark:bg-notion-surface-dark px-4 py-3.5 min-w-0"
      >
        <p class="text-[10.5px] font-semibold uppercase tracking-wider text-notion-muted dark:text-notion-muted-dark">{{ s.label }}</p>
        <p
          class="mt-1.5 text-base font-semibold tabular-nums truncate"
          :class="[
            s.accent ? 'text-notion-accent dark:text-notion-accent-dark' : 'text-notion-text dark:text-notion-text-dark',
            s.mono && 'font-mono text-[13px]',
          ]"
          :title="s.value"
        >{{ s.value }}</p>
        <p class="text-[11px] text-notion-muted dark:text-notion-muted-dark mt-0.5 truncate" :title="s.hint">{{ s.hint }}</p>
      </div>
    </div>

    <!-- 普通用户授权提示 -->
    <div
      v-if="!loading && !isAdmin"
      class="anim-rise notice mb-6"
      :class="adminConfig.authorized ? 'notice-info' : 'notice-warn'"
      style="--d: 90ms"
    >
      <span class="notice-icon" :class="adminConfig.authorized ? 'notice-icon--info' : 'notice-icon--warn'">
        <svg v-if="adminConfig.authorized" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"/>
        </svg>
      </span>
      <div class="min-w-0 flex-1">
        <p class="text-xs sm:text-[13px] font-medium text-notion-text dark:text-notion-text-dark">
          {{ adminConfig.authorized ? '已授权使用管理员 AI' : '未授权使用管理员 AI' }}
        </p>
        <p class="text-[11px] text-notion-muted dark:text-notion-muted-dark mt-0.5 truncate">
          <template v-if="adminConfig.authorized">
            当前可用：{{ adminConfig.providers.map(p => p.name).join('、') || '暂未配置' }}<span v-if="sharedProvider?.model"> · {{ sharedProvider.model }}</span>
            <span class="opacity-75">，个人服务商优先</span>
          </template>
          <template v-else>添加你自己的服务商后，才能使用 AI 校验功能</template>
        </p>
      </div>
    </div>

    <!-- 主体 -->
    <div class="relative grid grid-cols-1 min-[1440px]:grid-cols-[minmax(0,1fr)_320px] gap-6 items-start anim-rise" style="--d: 120ms">
      <div class="min-w-0">
        <!-- 服务商 -->
        <section aria-labelledby="providers-heading">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-3">
            <div class="min-w-0">
              <h2 id="providers-heading" class="flex items-center gap-2 text-base font-semibold text-notion-text dark:text-notion-text-dark">
                AI 服务商
                <span class="badge bg-notion-muted/10 text-notion-muted dark:text-notion-muted-dark text-[10px] tabular-nums">
                  {{ providerQuery.trim() ? visibleProviders.length + '/' + providers.length : providers.length }}
                </span>
              </h2>
              <p class="text-xs text-notion-muted dark:text-notion-muted-dark mt-1">AI 校验会优先使用标记为「默认」的已启用服务商</p>
            </div>

            <div v-if="providers.length > 4" class="relative w-full sm:w-56 flex-shrink-0">
              <span class="absolute inset-y-0 left-0 flex items-center pl-2.5 text-notion-muted dark:text-notion-muted-dark pointer-events-none">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                </svg>
              </span>
              <input
                v-model="providerQuery"
                type="search"
                class="input-field h-8 py-1 pl-8 pr-3 text-xs"
                placeholder="搜索服务商、模型或地址"
                aria-label="搜索服务商"
              />
            </div>
          </div>

          <!-- 加载骨架 -->
          <div v-if="loading" class="provider-list">
            <div v-for="i in 4" :key="i" class="skeleton-row">
              <Skeleton width="32px" height="32px" rounded="8px" />
              <div class="flex-1 min-w-0 space-y-2">
                <Skeleton width="42%" height="12px" />
                <Skeleton width="62%" height="10px" />
              </div>
              <Skeleton width="110px" height="12px" class="hidden min-[1280px]:block" />
              <Skeleton width="64px" height="12px" class="hidden min-[1280px]:block" />
              <Skeleton width="38px" height="22px" rounded="999px" />
            </div>
          </div>

          <!-- 空状态 -->
          <div v-else-if="providers.length === 0" class="empty-card">
            <div class="empty-orb">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z"/>
              </svg>
            </div>
            <h3 class="text-sm sm:text-base font-semibold text-notion-text dark:text-notion-text-dark">
              {{ !isAdmin && adminConfig.authorized ? '还没有配置个人服务商' : '还没有配置 AI 服务商' }}
            </h3>
            <p class="text-xs text-notion-muted dark:text-notion-muted-dark mt-1.5 max-w-sm mx-auto leading-relaxed">
              <template v-if="!isAdmin && adminConfig.authorized">
                你已可以使用管理员共享的 AI；添加个人服务商后会优先使用你自己的配置。
              </template>
              <template v-else>
                连接任意 OpenAI 兼容接口，即可在题目详情中启用 AI 答案校验。可以先从常用预设开始。
              </template>
            </p>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-6 max-w-md mx-auto text-left">
              <button
                v-for="preset in presets"
                :key="preset.name"
                type="button"
                class="preset-card"
                @click="openAddForm(preset)"
              >
                <span class="preset-avatar">{{ providerInitial(preset.name) }}</span>
                <span class="min-w-0 flex-1">
                  <span class="block text-[13px] font-medium text-notion-text dark:text-notion-text-dark truncate">{{ preset.name }}</span>
                  <span class="block text-[10.5px] text-notion-muted dark:text-notion-muted-dark font-mono truncate">{{ providerHost(preset.base_url) }}</span>
                </span>
                <svg class="preset-arrow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                </svg>
              </button>
              <button
                type="button"
                class="preset-card preset-card--custom sm:col-span-2"
                @click="openAddForm()"
              >
                <span class="preset-avatar preset-avatar--accent">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                  </svg>
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block text-[13px] font-medium text-notion-text dark:text-notion-text-dark">自定义服务商</span>
                  <span class="block text-[10.5px] text-notion-muted dark:text-notion-muted-dark">手动填写接口地址与密钥</span>
                </span>
                <svg class="preset-arrow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                </svg>
              </button>
            </div>
          </div>

          <!-- 服务商列表 -->
          <div v-else class="provider-list">
            <div class="provider-list-head">
              <span>服务商</span>
              <span>模型</span>
              <span>连通性</span>
              <span class="text-center">启用</span>
              <span class="text-right">操作</span>
            </div>

            <div
              v-for="(p, i) in visibleProviders"
              :key="p.id"
              class="provider-row"
              :class="{
                'provider-row--active': activeProvider?.id === p.id,
                'provider-row--off': !p.enabled,
              }"
              :style="{ animationDelay: `${i * 30}ms` }"
            >
              <div class="provider-identity flex items-start gap-2.5 min-w-0">
                <div class="provider-avatar provider-avatar--sm" :class="{ 'provider-avatar--active': activeProvider?.id === p.id }">
                  {{ providerInitial(p.name) }}
                </div>
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-1.5 flex-wrap">
                    <h3 class="text-[13px] font-semibold text-notion-text dark:text-notion-text-dark truncate max-w-[14rem]" :title="p.name">{{ p.name }}</h3>
                    <span v-if="p.is_default" class="badge bg-accent-10 text-accent text-[10px]">默认</span>
                    <span v-if="activeProvider?.id === p.id" class="badge bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 text-[10px]">生效中</span>
                    <span v-if="!p.enabled" class="badge bg-notion-muted/10 text-notion-muted dark:text-notion-muted-dark text-[10px]">停用</span>
                  </div>
                  <div class="flex items-center gap-1.5 mt-0.5 min-w-0">
                    <span
                      class="text-[10.5px] font-mono text-notion-muted dark:text-notion-muted-dark truncate"
                      :title="p.api_key_masked ? `${p.base_url} · Key ${p.api_key_masked}` : p.base_url"
                    >{{ providerHost(p.base_url) }}</span>
                    <button
                      type="button"
                      class="copy-btn"
                      :aria-label="copiedKey === `url-${p.id}` ? '接口地址已复制' : '复制接口地址'"
                      :title="copiedKey === `url-${p.id}` ? '已复制' : '复制接口地址'"
                      @click="copyText(p.base_url, `url-${p.id}`, '接口地址')"
                    >
                      <svg v-if="copiedKey === `url-${p.id}`" class="w-3 h-3 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M5 13l4 4L19 7"/>
                      </svg>
                      <svg v-else class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              <div class="provider-model flex items-center gap-1 min-w-0">
                <span class="min-[1280px]:hidden text-[10px] text-notion-muted dark:text-notion-muted-dark flex-shrink-0">模型</span>
                <span v-if="p.model" class="font-mono text-[11.5px] text-notion-text dark:text-notion-text-dark truncate" :title="p.model">{{ p.model }}</span>
                <button v-else type="button" class="meta-link text-[11px]" @click="fetchModels(p)">未选择 · 选择</button>
                <button
                  v-if="p.model"
                  type="button"
                  class="icon-btn icon-btn--xs flex-shrink-0"
                  :disabled="loadingModelsId === p.id"
                  title="获取或更换模型"
                  aria-label="获取或更换模型"
                  @click="fetchModels(p)"
                >
                  <span v-if="loadingModelsId === p.id" class="spinner"></span>
                  <svg v-else class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M9 5h6a4 4 0 014 4v6a4 4 0 01-4 4H9a4 4 0 01-4-4V9a4 4 0 014-4z"/>
                  </svg>
                </button>
              </div>

              <div class="provider-conn flex items-center gap-1.5 min-w-0">
                <span class="min-[1280px]:hidden text-[10px] text-notion-muted dark:text-notion-muted-dark flex-shrink-0">连接</span>
                <span v-if="testResults[p.id]?.ok" class="inline-flex items-center gap-1.5 text-[11px] text-green-600 dark:text-green-400">
                  <span class="w-1.5 h-1.5 rounded-full bg-green-500"></span>正常
                </span>
                <span v-else-if="testResults[p.id]" class="inline-flex items-center gap-1.5 text-[11px] text-red-600 dark:text-red-400" :title="testResults[p.id].message">
                  <span class="w-1.5 h-1.5 rounded-full bg-red-500"></span>失败
                </span>
                <span v-else class="text-[11px] text-notion-muted dark:text-notion-muted-dark">未测试</span>
                <button
                  type="button"
                  class="icon-btn icon-btn--xs flex-shrink-0"
                  :disabled="testingId === p.id"
                  title="测试连接"
                  aria-label="测试连接"
                  @click="testConnection(p)"
                >
                  <span v-if="testingId === p.id" class="spinner"></span>
                  <svg v-else class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                  </svg>
                </button>
              </div>

              <div class="provider-switch">
                <button
                  type="button"
                  role="switch"
                  class="switch"
                  :class="{ 'switch--on': p.enabled }"
                  :aria-checked="!!p.enabled"
                  :aria-label="`${p.enabled ? '停用' : '启用'} ${p.name}`"
                  :title="p.enabled ? '点击停用' : '点击启用'"
                  :disabled="togglingId === p.id"
                  @click="toggleEnabled(p)"
                >
                  <span class="switch-knob"></span>
                </button>
              </div>

              <div class="provider-actions-compact flex items-center gap-0.5">
                <button
                  v-if="!p.is_default && p.enabled"
                  type="button"
                  class="icon-btn icon-btn--xs"
                  title="设为默认"
                  aria-label="设为默认"
                  @click="setDefault(p)"
                >
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"/>
                  </svg>
                </button>
                <button type="button" class="icon-btn icon-btn--xs" title="编辑服务商" aria-label="编辑服务商" @click="openEditForm(p)">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                  </svg>
                </button>
                <button type="button" class="icon-btn icon-btn--xs icon-btn--danger" title="删除服务商" aria-label="删除服务商" @click="deleteProvider(p)">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                  </svg>
                </button>
              </div>

              <div v-if="testResults[p.id] && !testResults[p.id].ok" class="provider-error">
                {{ testResults[p.id].message }}
              </div>
            </div>

            <div v-if="visibleProviders.length === 0" class="provider-no-result">
              <p class="text-xs text-notion-muted dark:text-notion-muted-dark">没有匹配「{{ providerQuery }}」的服务商</p>
              <button type="button" class="ghost-btn text-xs" @click="providerQuery = ''">清除搜索</button>
            </div>
          </div>
        </section>

        <!-- 提示词 -->
        <section aria-labelledby="prompts-heading" class="mt-7">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-3">
            <div class="min-w-0">
              <h2 id="prompts-heading" class="text-base font-semibold text-notion-text dark:text-notion-text-dark">提示词</h2>
              <p class="text-xs text-notion-muted dark:text-notion-muted-dark mt-1">定义 AI 的角色与输出格式，支持占位变量</p>
            </div>

            <div v-if="isAdmin" class="segmented self-start sm:self-auto" role="tablist" aria-label="提示词范围">
              <!-- 滑块位置与当前激活项保持一致：default 在左，user 在右 -->
              <span class="segmented-thumb" :class="{ 'is-right': promptScope === 'user' }" aria-hidden="true"></span>
              <button
                type="button"
                role="tab"
                class="segmented-btn"
                :class="{ 'is-active': promptScope === 'default' }"
                :aria-selected="promptScope === 'default'"
                @click="promptScope = 'default'"
              >全局默认</button>
              <button
                type="button"
                role="tab"
                class="segmented-btn"
                :class="{ 'is-active': promptScope === 'user' }"
                :aria-selected="promptScope === 'user'"
                @click="promptScope = 'user'"
              >我的提示词</button>
            </div>
          </div>

          <Transition name="fade-slide" mode="out-in">
            <div :key="promptScope" class="space-y-3">
              <template v-if="loading">
                <div class="card p-4 sm:p-5">
                  <div class="flex items-start gap-3">
                    <Skeleton width="36px" height="36px" rounded="10px" />
                    <div class="flex-1 space-y-2 pt-0.5">
                      <Skeleton width="140px" height="13px" />
                      <Skeleton width="240px" height="11px" />
                    </div>
                  </div>
                  <Skeleton width="100%" height="84px" class="mt-4" rounded="10px" />
                </div>
              </template>

              <template v-else>
                <article v-for="card in promptCards" :key="card.key" class="card p-4 sm:p-5">
                  <div class="flex items-start gap-3 flex-wrap sm:flex-nowrap">
                    <div class="prompt-icon">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/>
                      </svg>
                    </div>
                    <div class="min-w-0 flex-1">
                      <div class="flex items-center gap-2 flex-wrap">
                        <h3 class="text-sm font-semibold text-notion-text dark:text-notion-text-dark">{{ card.name }}</h3>
                        <span v-if="card.isDefaultScope" class="badge bg-accent-10 text-accent text-[10px]">全局默认</span>
                        <span v-else-if="card.info?.is_custom" class="badge bg-accent-10 text-accent text-[10px]">已自定义</span>
                        <span v-else class="badge bg-notion-muted/10 text-notion-muted dark:text-notion-muted-dark text-[10px]">使用默认</span>
                      </div>
                      <p class="text-xs text-notion-muted dark:text-notion-muted-dark mt-1 leading-relaxed">{{ card.desc }}</p>
                    </div>
                    <div class="flex items-center gap-1.5 flex-shrink-0 w-full justify-end sm:w-auto sm:justify-start">
                      <button type="button" class="btn-secondary text-xs px-3 py-1.5" @click="openPromptEditor(card.key, card.isDefaultScope)">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                        </svg>
                        编辑
                      </button>
                      <button
                        v-if="card.isDefaultScope || card.info?.is_custom"
                        type="button"
                        class="ghost-btn"
                        @click="resetPrompt(card.key, card.isDefaultScope)"
                      >
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                        </svg>
                        {{ card.isDefaultScope ? '恢复内置' : '恢复默认' }}
                      </button>
                    </div>
                  </div>

                  <div class="prompt-preview">
                    <div class="preview-row">
                      <span class="preview-label">系统</span>
                      <p class="preview-text line-clamp-2">{{ card.info?.system_prompt || '—' }}</p>
                    </div>
                    <div class="preview-row preview-row--code">
                      <span class="preview-label">用户</span>
                      <pre class="preview-code line-clamp-3">{{ card.info?.user_prompt || '—' }}</pre>
                    </div>
                  </div>

                  <div class="prompt-footer">
                    <p class="flex items-center gap-1.5 min-w-0 text-[11px] text-notion-muted dark:text-notion-muted-dark">
                      <svg class="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
                      </svg>
                      <span class="truncate">{{ card.isDefaultScope ? '影响所有未自定义提示词的用户' : '仅对你生效，优先级高于全局默认' }}</span>
                    </p>
                    <div class="flex items-center gap-1 flex-wrap flex-shrink-0">
                      <code v-for="v in promptVariables" :key="v.token" class="var-chip" :title="v.desc">{{ v.token }}</code>
                    </div>
                  </div>
                </article>
              </template>
            </div>
          </Transition>
        </section>
      </div>

      <!-- 侧栏 -->
      <aside class="min-w-0 space-y-4 min-[1440px]:sticky min-[1440px]:top-6">
        <template v-if="loading">
          <div class="card p-5">
            <Skeleton width="72px" height="11px" />
            <div class="flex items-center gap-3 mt-4">
              <Skeleton width="40px" height="40px" rounded="11px" />
              <div class="flex-1 space-y-2">
                <Skeleton width="90px" height="13px" />
                <Skeleton width="120px" height="10px" />
              </div>
            </div>
            <Skeleton width="100%" height="58px" class="mt-4" />
          </div>
          <div class="card p-5">
            <Skeleton width="72px" height="11px" />
            <Skeleton width="100%" height="72px" class="mt-4" />
          </div>
        </template>

        <template v-else>
          <!-- 当前生效 -->
          <div class="card p-5">
            <div class="flex items-center justify-between gap-2 mb-4">
              <h2 class="text-[11px] font-semibold uppercase tracking-wider text-notion-muted dark:text-notion-muted-dark">当前生效</h2>
              <span
                class="inline-flex items-center gap-1.5 text-[10px] font-medium"
                :class="readiness.tone === 'ok' ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'"
              >
                <span class="relative flex h-1.5 w-1.5">
                  <span
                    v-if="readiness.tone === 'ok'"
                    class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60"
                  ></span>
                  <span
                    class="relative inline-flex rounded-full h-1.5 w-1.5"
                    :class="readiness.tone === 'ok' ? 'bg-green-500' : 'bg-amber-500'"
                  ></span>
                </span>
                {{ readiness.label }}
              </span>
            </div>

            <template v-if="effectiveProvider">
              <div class="flex items-center gap-3">
                <div class="active-avatar">{{ providerInitial(effectiveProvider.name) }}</div>
                <div class="min-w-0">
                  <p class="text-sm font-semibold text-notion-text dark:text-notion-text-dark truncate" :title="effectiveProvider.name">{{ effectiveProvider.name }}</p>
                  <p class="text-[11px] text-notion-muted dark:text-notion-muted-dark mt-0.5">{{ effectiveSource }}</p>
                </div>
              </div>

              <dl class="mt-4 pt-3.5 border-t border-notion-border dark:border-notion-border-dark space-y-2">
                <div class="flex items-baseline gap-3">
                  <dt class="w-11 flex-shrink-0 text-[11px] text-notion-muted dark:text-notion-muted-dark">模型</dt>
                  <dd
                    class="min-w-0 flex-1 font-mono text-[11.5px] truncate"
                    :class="effectiveProvider.model ? 'text-notion-text dark:text-notion-text-dark' : 'text-amber-600 dark:text-amber-400'"
                    :title="effectiveProvider.model || ''"
                  >{{ effectiveProvider.model || '未选择模型' }}</dd>
                </div>
                <div class="flex items-baseline gap-3">
                  <dt class="w-11 flex-shrink-0 text-[11px] text-notion-muted dark:text-notion-muted-dark">接口</dt>
                  <dd class="min-w-0 flex-1 font-mono text-[11.5px] text-notion-muted dark:text-notion-muted-dark truncate" :title="effectiveProvider.base_url">{{ providerHost(effectiveProvider.base_url) }}</dd>
                </div>
                <div class="flex items-baseline gap-3">
                  <dt class="w-11 flex-shrink-0 text-[11px] text-notion-muted dark:text-notion-muted-dark">超时</dt>
                  <dd class="text-[11.5px] tabular-nums text-notion-text dark:text-notion-text-dark">{{ aiTimeout }} 秒</dd>
                </div>
              </dl>

              <div
                v-if="!effectiveProvider.model"
                class="mt-3 rounded-btn border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-900/15 px-3 py-2 text-[11px] leading-relaxed text-amber-700 dark:text-amber-300"
              >
                尚未选择模型，AI 校验无法调用。
                <button
                  v-if="activeProvider"
                  type="button"
                  class="underline decoration-amber-400/60 underline-offset-2 hover:decoration-amber-500"
                  @click="fetchModels(activeProvider)"
                >立即选择</button>
              </div>

              <p
                v-if="!activeProvider && sharedProvider"
                class="mt-3 text-[11px] leading-relaxed text-notion-muted dark:text-notion-muted-dark"
              >
                个人服务商不可用，已回退到管理员共享的 AI。
              </p>
            </template>

            <div v-else class="text-center py-2">
              <div class="w-10 h-10 mx-auto rounded-btn bg-notion-muted/10 flex items-center justify-center text-notion-muted dark:text-notion-muted-dark mb-3">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/>
                </svg>
              </div>
              <p class="text-sm font-medium text-notion-text dark:text-notion-text-dark">
                {{ providers.length ? '服务商均已停用' : '还没有可用的 AI' }}
              </p>
              <p class="text-[11px] text-notion-muted dark:text-notion-muted-dark mt-1 leading-relaxed">
                {{ providers.length ? '启用任意服务商后即可恢复 AI 校验' : '添加服务商并选择模型后开始使用' }}
              </p>
              <button v-if="!providers.length" type="button" class="btn-primary w-full mt-3 text-xs justify-center" @click="openAddForm()">
                添加服务商
              </button>
            </div>
          </div>

          <!-- 请求超时 -->
          <div class="card p-5">
            <div class="flex items-center justify-between gap-2">
              <h2 class="text-[11px] font-semibold uppercase tracking-wider text-notion-muted dark:text-notion-muted-dark">请求超时</h2>
              <Transition name="fade-soft">
                <span v-if="timeoutSaved" class="inline-flex items-center gap-1 text-[10px] font-medium text-green-600 dark:text-green-400">
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.4" d="M5 13l4 4L19 7"/>
                  </svg>
                  已保存
                </span>
              </Transition>
            </div>
            <p class="text-[11px] text-notion-muted dark:text-notion-muted-dark mt-1">单次 AI 分析请求的最长等待时间</p>

            <div class="flex items-baseline gap-1.5 mt-4">
              <span class="text-3xl font-bold tabular-nums text-notion-accent dark:text-notion-accent-dark leading-none">{{ aiTimeout }}</span>
              <span class="text-xs text-notion-muted dark:text-notion-muted-dark">秒</span>
            </div>

            <input
              v-model.number="aiTimeout"
              type="range"
              min="10"
              max="600"
              step="10"
              class="ai-range mt-3.5"
              :style="{ '--pct': timeoutPercent }"
              aria-label="AI 请求超时秒数"
              @input="onTimeoutInput"
              @change="saveTimeout"
            />
            <div class="flex justify-between text-[10px] text-notion-muted dark:text-notion-muted-dark mt-1.5 tabular-nums">
              <span>10 秒</span>
              <span>600 秒</span>
            </div>

            <div class="flex items-center gap-2 mt-3">
              <label for="ai-timeout-input" class="text-[11px] text-notion-muted dark:text-notion-muted-dark">精确设置</label>
              <input
                id="ai-timeout-input"
                v-model.number="aiTimeout"
                type="number"
                min="10"
                max="600"
                step="10"
                class="input-field w-20 text-center py-1 text-xs tabular-nums"
                @change="saveTimeout"
                @blur="saveTimeout"
              />
              <span class="text-[11px] text-notion-muted dark:text-notion-muted-dark">秒</span>
            </div>
            <p class="text-[11px] text-notion-muted dark:text-notion-muted-dark mt-3 leading-relaxed">
              推荐 60–300 秒。响应较慢的推理模型可适当调高，设置会保存在当前浏览器。
            </p>
          </div>

          <!-- 提示词优先级 -->
          <div class="card p-5">
            <h2 class="text-[11px] font-semibold uppercase tracking-wider text-notion-muted dark:text-notion-muted-dark">提示词优先级</h2>
            <ol class="mt-4 space-y-3.5">
              <li v-for="(step, i) in promptPriority" :key="step.title" class="step-item flex items-start gap-2.5">
                <span class="step-index" :class="{ 'step-index--active': step.active }">{{ i + 1 }}</span>
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-1.5 flex-wrap">
                    <p
                      class="text-xs font-medium"
                      :class="step.active ? 'text-notion-accent dark:text-notion-accent-dark' : 'text-notion-text dark:text-notion-text-dark'"
                    >{{ step.title }}</p>
                    <span v-if="step.active" class="badge bg-accent-10 text-accent text-[9px] px-1.5">当前</span>
                  </div>
                  <p class="text-[11px] text-notion-muted dark:text-notion-muted-dark mt-0.5 leading-relaxed">{{ step.desc }}</p>
                </div>
              </li>
            </ol>
          </div>
        </template>
      </aside>
    </div>

  <!-- 服务商表单 -->
  <Teleport to="body">
    <Transition name="modal-overlay">
      <div v-if="showForm" class="fixed inset-0 z-[9994] flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/50" @click="closeForm()"></div>
        <Transition name="modal-content" appear>
          <div
            class="relative w-full max-w-xl max-h-[90vh] flex flex-col bg-notion-surface dark:bg-notion-surface-dark border border-notion-border dark:border-notion-border-dark rounded-card shadow-xl overflow-hidden"
            role="dialog"
            aria-modal="true"
            aria-labelledby="provider-form-title"
          >
          <div class="flex-shrink-0 flex items-start gap-3 px-5 sm:px-6 py-4 border-b border-notion-border dark:border-notion-border-dark">
            <div class="modal-icon">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7" d="M13 10V3L4 14h7v7l9-11h-7z"/>
              </svg>
            </div>
            <div class="min-w-0 flex-1">
              <h2 id="provider-form-title" class="text-base font-semibold text-notion-text dark:text-notion-text-dark">
                {{ editingProvider ? '编辑服务商' : '添加服务商' }}
              </h2>
              <p class="text-xs text-notion-muted dark:text-notion-muted-dark mt-0.5">兼容 OpenAI 接口协议，保存后即可获取模型列表</p>
            </div>
            <button type="button" class="icon-btn -mr-1 flex-shrink-0" aria-label="关闭" @click="closeForm()">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>

          <form class="flex-1 min-h-0 flex flex-col" @submit.prevent="submitForm">
            <div class="flex-1 min-h-0 overflow-y-auto px-5 sm:px-6 py-5 space-y-4">
              <div>
                <label for="ai-provider-name" class="block text-xs font-medium text-notion-text dark:text-notion-text-dark mb-1.5">
                  名称 <span class="text-red-500">*</span>
                </label>
                <input
                  id="ai-provider-name"
                  ref="providerNameRef"
                  v-model="form.name"
                  type="text"
                  class="input-field"
                  placeholder="如：DeepSeek"
                  maxlength="40"
                  autocomplete="off"
                />
              </div>

              <div>
                <label for="ai-provider-url" class="block text-xs font-medium text-notion-text dark:text-notion-text-dark mb-1.5">
                  API 地址 <span class="text-red-500">*</span>
                </label>
                <input
                  id="ai-provider-url"
                  v-model="form.base_url"
                  type="text"
                  inputmode="url"
                  class="input-field font-mono text-xs"
                  placeholder="https://api.deepseek.com/v1"
                  autocomplete="off"
                  spellcheck="false"
                />
                <p
                  class="mt-1 text-[11px] leading-relaxed"
                  :class="urlInvalid ? 'text-amber-600 dark:text-amber-400' : 'text-notion-muted dark:text-notion-muted-dark'"
                >
                  {{ urlInvalid ? '地址需要以 http:// 或 https:// 开头' : 'OpenAI 兼容格式，通常以 /v1 结尾' }}
                </p>
              </div>

              <div>
                <label for="ai-provider-key" class="block text-xs font-medium text-notion-text dark:text-notion-text-dark mb-1.5">
                  API Key <span class="text-red-500">*</span>
                </label>
                <div class="relative">
                  <input
                    id="ai-provider-key"
                    v-model="form.api_key"
                    :type="showKey ? 'text' : 'password'"
                    class="input-field font-mono text-xs pr-11"
                    placeholder="sk-..."
                    autocomplete="off"
                    spellcheck="false"
                  />
                  <button
                    type="button"
                    class="absolute inset-y-0 right-1 my-auto w-8 h-8 flex items-center justify-center rounded-btn text-notion-muted dark:text-notion-muted-dark hover:text-notion-text dark:hover:text-notion-text-dark hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    :aria-label="showKey ? '隐藏密钥' : '显示密钥'"
                    @click="showKey = !showKey"
                  >
                    <svg v-if="showKey" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>
                    </svg>
                    <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                    </svg>
                  </button>
                </div>
                <p class="mt-1 text-[11px] text-notion-muted dark:text-notion-muted-dark">密钥仅保存在本地数据库，不会上传到第三方</p>
              </div>

              <div>
                <label for="ai-provider-model" class="block text-xs font-medium text-notion-text dark:text-notion-text-dark mb-1.5">模型</label>
                <input
                  id="ai-provider-model"
                  v-model="form.model"
                  type="text"
                  class="input-field font-mono text-xs"
                  placeholder="保存后可点击模型图标获取"
                  autocomplete="off"
                  spellcheck="false"
                />
                <p class="mt-1 text-[11px] text-notion-muted dark:text-notion-muted-dark">可以留空，保存后可在列表中点击模型旁的图标获取</p>
              </div>

              <label class="flex items-center justify-between gap-3 rounded-btn border border-notion-border dark:border-notion-border-dark px-3.5 py-3 cursor-pointer hover:border-notion-accent/50 transition-colors">
                <span class="min-w-0">
                  <span class="block text-xs font-medium text-notion-text dark:text-notion-text-dark">设为默认服务商</span>
                  <span class="block text-[11px] text-notion-muted dark:text-notion-muted-dark mt-0.5">AI 校验将优先使用该服务商</span>
                </span>
                <input v-model="form.is_default" type="checkbox" class="sr-only" />
                <span class="switch flex-shrink-0" :class="{ 'switch--on': form.is_default }" aria-hidden="true">
                  <span class="switch-knob"></span>
                </span>
              </label>
            </div>

            <div class="flex-shrink-0 px-5 sm:px-6 py-3.5 border-t border-notion-border dark:border-notion-border-dark flex items-center justify-end gap-2">
              <button type="button" class="btn-secondary" :disabled="saving" @click="closeForm()">取消</button>
              <button type="submit" class="btn-primary min-w-[96px] justify-center" :disabled="saving">
                <span v-if="saving" class="spinner"></span>
                {{ saving ? '保存中' : (editingProvider ? '保存修改' : '添加服务商') }}
              </button>
            </div>
          </form>
        </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>

  <!-- 模型选择 -->
  <Teleport to="body">
    <Transition name="modal-overlay">
      <div v-if="modelPickerOpen" class="fixed inset-0 z-[9995] flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/50" @click="cancelModelPicker()"></div>
        <Transition name="modal-content" appear>
          <div
            class="relative w-full max-w-md max-h-[90vh] flex flex-col bg-notion-surface dark:bg-notion-surface-dark border border-notion-border dark:border-notion-border-dark rounded-card shadow-xl overflow-hidden"
            role="dialog"
            aria-modal="true"
            aria-labelledby="model-picker-title"
          >
          <div class="flex-shrink-0 px-5 py-4 border-b border-notion-border dark:border-notion-border-dark">
            <div class="flex items-start gap-3">
              <div class="modal-icon">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M9 5h6a4 4 0 014 4v6a4 4 0 01-4 4H9a4 4 0 01-4-4V9a4 4 0 014-4z"/>
                </svg>
              </div>
              <div class="min-w-0 flex-1">
                <h2 id="model-picker-title" class="text-base font-semibold text-notion-text dark:text-notion-text-dark">选择模型</h2>
                <p class="text-xs text-notion-muted dark:text-notion-muted-dark mt-0.5 truncate">
                  来自 {{ modelPickerProviderName || '服务商' }} · 共 {{ modelPickerList.length }} 个
                </p>
              </div>
              <button type="button" class="icon-btn -mr-1 flex-shrink-0" aria-label="关闭" @click="cancelModelPicker()">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>

            <div class="relative mt-3">
              <span class="absolute inset-y-0 left-0 flex items-center pl-3 text-notion-muted dark:text-notion-muted-dark pointer-events-none">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                </svg>
              </span>
              <input
                ref="modelSearchRef"
                v-model="modelSearch"
                type="search"
                class="input-field pl-9 text-xs"
                placeholder="搜索模型名称..."
                @keydown.enter.prevent="pickFirstModel"
              />
            </div>
          </div>

          <div class="flex-1 min-h-0 overflow-y-auto p-2">
            <button
              v-for="m in filteredModels"
              :key="m"
              type="button"
              class="model-row"
              :class="{ 'model-row--current': m === modelPickerCurrent }"
              @click="pickModel(m)"
            >
              <span class="font-mono text-xs truncate flex-1 text-left">{{ m }}</span>
              <span v-if="m === modelPickerCurrent" class="inline-flex items-center gap-1 text-[10px] font-medium text-notion-accent dark:text-notion-accent-dark flex-shrink-0">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M5 13l4 4L19 7"/>
                </svg>
                当前
              </span>
              <svg v-else class="w-3.5 h-3.5 flex-shrink-0 opacity-0 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
              </svg>
            </button>

            <div v-if="filteredModels.length === 0" class="py-10 text-center">
              <svg class="w-8 h-8 mx-auto text-notion-muted dark:text-notion-muted-dark mb-2 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
              </svg>
              <p class="text-xs text-notion-muted dark:text-notion-muted-dark">没有匹配的模型</p>
            </div>
          </div>

          <div class="flex-shrink-0 px-5 py-3 border-t border-notion-border dark:border-notion-border-dark flex items-center justify-between gap-3">
            <p class="text-[11px] text-notion-muted dark:text-notion-muted-dark truncate">
              当前：<span class="font-mono">{{ modelPickerCurrent || '未选择' }}</span>
            </p>
            <button type="button" class="btn-secondary text-xs" @click="cancelModelPicker()">取消</button>
          </div>
        </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>

  <!-- 提示词编辑器 -->
  <Teleport to="body">
    <Transition name="modal-overlay">
      <div v-if="showPromptEditor" class="fixed inset-0 z-[9996] flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/50" @click="closePromptEditor()"></div>
        <Transition name="modal-content" appear>
          <div
            class="relative w-full max-w-3xl max-h-[90vh] flex flex-col bg-notion-surface dark:bg-notion-surface-dark border border-notion-border dark:border-notion-border-dark rounded-card shadow-xl overflow-hidden"
            role="dialog"
            aria-modal="true"
            aria-labelledby="prompt-editor-title"
          >
          <div class="flex-shrink-0 flex items-start gap-3 px-5 sm:px-6 py-4 border-b border-notion-border dark:border-notion-border-dark">
            <div class="modal-icon">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/>
              </svg>
            </div>
            <div class="min-w-0 flex-1">
              <h2 id="prompt-editor-title" class="text-base font-semibold text-notion-text dark:text-notion-text-dark truncate">
                {{ editingIsDefault ? '编辑全局默认提示词' : '编辑我的提示词' }}
              </h2>
              <p class="text-xs text-notion-muted dark:text-notion-muted-dark mt-0.5">
                {{ promptLabels[editingPromptKey]?.name }} · {{ editingIsDefault ? '对所有未自定义用户生效' : '仅对你生效' }}
              </p>
            </div>
            <button type="button" class="icon-btn -mr-1 flex-shrink-0" aria-label="关闭" @click="closePromptEditor()">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>

          <div class="flex-1 min-h-0 overflow-y-auto px-5 sm:px-6 py-5 space-y-4">
            <div
              v-if="editingIsDefault"
              class="flex items-start gap-2 rounded-btn border border-accent-20 bg-accent-10 px-3 py-2.5 text-[11px] leading-relaxed text-accent"
            >
              <svg class="w-3.5 h-3.5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              <span>这是全局默认提示词，修改后将影响所有未单独自定义提示词的用户。</span>
            </div>

            <div>
              <div class="flex items-baseline justify-between gap-3 mb-1.5">
                <label for="prompt-system" class="text-xs font-medium text-notion-text dark:text-notion-text-dark">系统提示词</label>
                <span class="text-[10px] text-notion-muted dark:text-notion-muted-dark tabular-nums">{{ editingPrompt.system_prompt.length }} 字符</span>
              </div>
              <textarea
                id="prompt-system"
                ref="editorSystemRef"
                v-model="editingPrompt.system_prompt"
                rows="4"
                class="input-field font-mono text-xs leading-relaxed resize-y"
                placeholder="定义 AI 的角色和基本行为..."
                @focus="activePromptField = 'system'"
              ></textarea>
              <p class="mt-1 text-[11px] text-notion-muted dark:text-notion-muted-dark">描述 AI 的身份与约束，例如「只输出 JSON」</p>
            </div>

            <div class="rounded-btn border border-notion-border dark:border-notion-border-dark bg-notion-muted/5 px-3.5 py-3">
              <div class="flex items-center justify-between gap-2 mb-2">
                <p class="flex items-center gap-1.5 text-[11px] font-medium text-notion-text dark:text-notion-text-dark">
                  <svg class="w-3.5 h-3.5 text-notion-muted dark:text-notion-muted-dark" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"/>
                  </svg>
                  可用变量
                </p>
                <p class="text-[10px] text-notion-muted dark:text-notion-muted-dark">
                  点击插入到{{ activePromptField === 'system' ? '系统' : '用户' }}提示词
                </p>
              </div>
              <div class="flex flex-wrap gap-1.5">
                <button
                  v-for="v in promptVariables"
                  :key="v.token"
                  type="button"
                  class="var-chip"
                  :aria-label="`插入变量 ${v.token}：${v.desc}`"
                  @click="insertVariable(v.token)"
                  @mouseenter="showVarTip($event, v)"
                  @mouseleave="hideVarTip"
                  @focus="showVarTip($event, v)"
                  @blur="hideVarTip"
                >{{ v.token }}</button>
              </div>
            </div>

            <div>
              <div class="flex items-baseline justify-between gap-3 mb-1.5">
                <label for="prompt-user" class="text-xs font-medium text-notion-text dark:text-notion-text-dark">用户提示词</label>
                <span class="text-[10px] text-notion-muted dark:text-notion-muted-dark tabular-nums">{{ editingPrompt.user_prompt.length }} 字符</span>
              </div>
              <textarea
                id="prompt-user"
                v-model="editingPrompt.user_prompt"
                rows="12"
                class="input-field font-mono text-xs leading-relaxed resize-y"
                placeholder="发送给 AI 的提示词模板..."
                @focus="activePromptField = 'user'"
              ></textarea>
              <p class="mt-1 text-[11px] text-notion-muted dark:text-notion-muted-dark">实际发送给 AI 的模板，变量会在请求时自动替换</p>
            </div>

            <div
              v-if="criticalMissing.length"
              class="flex items-start gap-2 rounded-btn border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-900/15 px-3 py-2.5 text-[11px] leading-relaxed text-amber-700 dark:text-amber-300"
            >
              <svg class="w-3.5 h-3.5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"/>
              </svg>
              <span>用户提示词缺少 {{ criticalMissing.join('、') }}，模型可能无法获取题目信息。</span>
            </div>
          </div>

          <div class="flex-shrink-0 px-5 sm:px-6 py-3.5 border-t border-notion-border dark:border-notion-border-dark flex items-center justify-between gap-2">
            <button type="button" class="ghost-btn" :disabled="savingPrompt" @click="resetFromEditor">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
              </svg>
              {{ editingIsDefault ? '恢复系统内置' : '恢复默认' }}
            </button>
            <div class="flex items-center gap-2">
              <button type="button" class="btn-secondary" :disabled="savingPrompt" @click="closePromptEditor()">取消</button>
              <button type="button" class="btn-primary min-w-[88px] justify-center" :disabled="savingPrompt" @click="savePrompt">
                <span v-if="savingPrompt" class="spinner"></span>
                {{ savingPrompt ? '保存中' : '保存' }}
              </button>
            </div>
          </div>
        </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>

  <!-- 变量说明浮层 -->
  <Teleport to="body">
    <Transition name="var-tip">
      <div
        v-if="varTip.visible"
        class="var-tooltip"
        :class="{ 'is-bottom': varTip.placement === 'bottom' }"
        :style="{ left: `${varTip.x}px`, top: `${varTip.y}px` }"
        role="tooltip"
      >
        <div class="flex items-center gap-2">
          <code class="var-tooltip-token">{{ varTip.token }}</code>
          <span class="text-[11px] font-medium text-notion-text dark:text-notion-text-dark">{{ varTip.label }}</span>
        </div>
        <p class="var-tooltip-desc">{{ varTip.desc }}</p>
      </div>
    </Transition>
  </Teleport>
  </div>
</template>

<style scoped>
/* ========== 入场 ========== */
.anim-rise {
  animation: rise 0.5s cubic-bezier(0.22, 1, 0.36, 1) backwards;
  animation-delay: var(--d, 0ms);
}

@keyframes rise {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: none; }
}

/* ========== 预设菜单 ========== */
.preset-menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 40;
  width: 17rem;
  max-width: calc(100vw - 2rem);
  padding: 6px;
  border-radius: 12px;
  border: 1px solid var(--theme-border);
  background: var(--theme-surface);
  box-shadow: 0 20px 44px -20px rgba(0, 0, 0, 0.4), 0 2px 8px -4px rgba(0, 0, 0, 0.12);
  transform-origin: top right;
}

.preset-label {
  padding: 8px 10px 4px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--theme-muted);
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 7px 9px;
  border-radius: 8px;
  text-align: left;
  transition: background-color 0.15s ease;
}

.menu-item:hover {
  background: color-mix(in srgb, var(--theme-text) 6%, transparent);
}

.menu-avatar {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 700;
  color: var(--theme-muted);
  background: color-mix(in srgb, var(--theme-text) 7%, transparent);
  border: 1px solid var(--theme-border);
}

.menu-avatar--accent {
  color: var(--theme-accent);
  background: color-mix(in srgb, var(--theme-accent) 12%, transparent);
  border-color: color-mix(in srgb, var(--theme-accent) 26%, transparent);
}

.menu-arrow {
  width: 13px;
  height: 13px;
  flex-shrink: 0;
  color: var(--theme-muted);
  opacity: 0.5;
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.menu-item:hover .menu-arrow {
  opacity: 1;
  transform: translateX(2px);
}

.menu-divider {
  height: 1px;
  margin: 5px 8px;
  background: var(--theme-border);
}

.pop-enter-active {
  transition: opacity 0.18s ease, transform 0.24s cubic-bezier(0.22, 1, 0.36, 1);
}
.pop-leave-active {
  transition: opacity 0.12s ease, transform 0.12s ease;
}
.pop-enter-from,
.pop-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.97);
}

/* ========== 提示条 ========== */
.notice {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid var(--theme-border);
}

.notice-info {
  border-color: color-mix(in srgb, var(--theme-accent) 24%, var(--theme-border));
  background: color-mix(in srgb, var(--theme-accent) 6%, var(--theme-surface));
}

.notice-warn {
  border-color: color-mix(in srgb, #f59e0b 32%, var(--theme-border));
  background: color-mix(in srgb, #f59e0b 7%, var(--theme-surface));
}

.notice-icon {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.notice-icon--info {
  color: var(--theme-accent);
  background: color-mix(in srgb, var(--theme-accent) 12%, transparent);
}

.notice-icon--warn {
  color: #d97706;
  background: rgba(245, 158, 11, 0.14);
}

.dark .notice-icon--warn {
  color: #fbbf24;
}

/* ========== 空状态 ========== */
.empty-card {
  position: relative;
  padding: 34px 20px;
  border-radius: 12px;
  border: 1px dashed color-mix(in srgb, var(--theme-text) 20%, transparent);
  background: color-mix(in srgb, var(--theme-text) 2%, var(--theme-surface));
  text-align: center;
}

.empty-orb {
  position: relative;
  width: 56px;
  height: 56px;
  margin: 0 auto 14px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--theme-accent);
  background: color-mix(in srgb, var(--theme-accent) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--theme-accent) 22%, transparent);
}

.empty-orb::before {
  content: '';
  position: absolute;
  inset: -8px;
  border-radius: 22px;
  border: 1px solid color-mix(in srgb, var(--theme-accent) 16%, transparent);
  animation: orb-pulse 3.2s ease-out infinite;
}

@keyframes orb-pulse {
  0% { transform: scale(0.92); opacity: 0.9; }
  70% { transform: scale(1.14); opacity: 0; }
  100% { transform: scale(1.14); opacity: 0; }
}

.preset-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border-radius: 9px;
  border: 1px solid var(--theme-border);
  background: var(--theme-surface);
  text-align: left;
  transition: border-color 0.2s ease, background-color 0.2s ease, transform 0.2s ease;
}

.preset-card:hover {
  border-color: color-mix(in srgb, var(--theme-accent) 40%, var(--theme-border));
  background: color-mix(in srgb, var(--theme-accent) 5%, var(--theme-surface));
  transform: translateY(-1px);
}

.preset-card--custom {
  border-style: dashed;
}

.preset-avatar {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 700;
  color: var(--theme-muted);
  background: color-mix(in srgb, var(--theme-text) 7%, transparent);
  border: 1px solid var(--theme-border);
}

.preset-avatar--accent {
  color: var(--theme-accent);
  background: color-mix(in srgb, var(--theme-accent) 12%, transparent);
  border-color: color-mix(in srgb, var(--theme-accent) 26%, transparent);
}

.preset-arrow {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  margin-left: auto;
  color: var(--theme-muted);
  opacity: 0.4;
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.preset-card:hover .preset-arrow {
  opacity: 0.9;
  transform: translateX(2px);
}

/* ========== 服务商列表 ========== */
.provider-list {
  border: 1px solid var(--theme-border);
  border-radius: 12px;
  background: var(--theme-surface);
  overflow: hidden;
}

.provider-list-head {
  display: none;
  grid-template-columns: minmax(0, 1.6fr) minmax(0, 1.2fr) 116px 56px 96px;
  gap: 16px;
  padding: 9px 16px;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--theme-muted);
  border-bottom: 1px solid var(--theme-border);
}

.provider-row {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-areas:
    "identity switch"
    "model actions"
    "conn actions";
  gap: 5px 12px;
  padding: 11px 12px;
  transition: background-color 0.15s ease;
  animation: row-in 0.32s cubic-bezier(0.22, 1, 0.36, 1) backwards;
}

.provider-row + .provider-row {
  border-top: 1px solid var(--theme-border);
}

@keyframes row-in {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: none; }
}

.provider-row:hover {
  background: color-mix(in srgb, var(--theme-text) 2.5%, transparent);
}

.provider-row--active {
  background: color-mix(in srgb, var(--theme-accent) 4%, transparent);
}

.provider-row--active:hover {
  background: color-mix(in srgb, var(--theme-accent) 6%, transparent);
}

.provider-row--active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 8px;
  bottom: 8px;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: linear-gradient(
    to bottom,
    var(--theme-accent),
    color-mix(in srgb, var(--theme-accent) 35%, transparent)
  );
}

.provider-row--off .provider-identity,
.provider-row--off .provider-model,
.provider-row--off .provider-conn {
  opacity: 0.6;
}

.provider-identity { grid-area: identity; }
.provider-model { grid-area: model; }
.provider-conn { grid-area: conn; }
.provider-switch { grid-area: switch; align-self: start; }
.provider-actions-compact { grid-area: actions; align-self: center; justify-content: flex-end; }

.provider-error {
  grid-column: 1 / -1;
  margin-top: 3px;
  padding: 7px 9px;
  border-radius: 7px;
  border: 1px solid color-mix(in srgb, #ef4444 24%, var(--theme-border));
  background: color-mix(in srgb, #ef4444 7%, var(--theme-surface));
  font-size: 11px;
  line-height: 1.6;
  word-break: break-all;
  color: #dc2626;
}

.dark .provider-error {
  color: #fca5a5;
}

.provider-no-result {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 26px 16px;
  border-top: 1px solid var(--theme-border);
}

@media (min-width: 1280px) {
  .provider-list-head {
    display: grid;
  }

  .provider-row {
    grid-template-columns: minmax(0, 1.6fr) minmax(0, 1.2fr) 116px 56px 96px;
    grid-template-areas: "identity model conn switch actions";
    align-items: center;
    gap: 16px;
    padding: 11px 16px;
  }

  .provider-switch {
    align-self: center;
    justify-self: center;
  }

  .provider-actions-compact {
    align-self: center;
  }
}

.skeleton-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
}

.skeleton-row + .skeleton-row {
  border-top: 1px solid var(--theme-border);
}

.provider-avatar {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--theme-muted);
  background: color-mix(in srgb, var(--theme-text) 6%, transparent);
  border: 1px solid var(--theme-border);
  transition: color 0.2s ease, background-color 0.2s ease, border-color 0.2s ease;
}

.provider-avatar--sm {
  width: 32px;
  height: 32px;
  border-radius: 9px;
  font-size: 13px;
}

.provider-avatar--active {
  color: var(--theme-accent);
  background: color-mix(in srgb, var(--theme-accent) 12%, transparent);
  border-color: color-mix(in srgb, var(--theme-accent) 28%, transparent);
}

.meta-link {
  font-size: 12px;
  color: var(--theme-accent);
  text-align: left;
  transition: opacity 0.15s ease;
}

.meta-link:hover {
  opacity: 0.75;
}

.copy-btn {
  width: 22px;
  height: 22px;
  border-radius: 5px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--theme-muted);
  opacity: 0.6;
  transition: background-color 0.15s ease, color 0.15s ease, opacity 0.15s ease;
}

.copy-btn:hover {
  opacity: 1;
  color: var(--theme-text);
  background: color-mix(in srgb, var(--theme-text) 8%, transparent);
}

/* ========== 开关 ========== */
.switch {
  position: relative;
  width: 38px;
  height: 22px;
  border-radius: 999px;
  padding: 0;
  border: 0;
  background: color-mix(in srgb, var(--theme-text) 16%, transparent);
  transition: background-color 0.22s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
  flex-shrink: 0;
}

/* 扩大开关的可点击区域，不改变视觉尺寸 */
.switch::after {
  content: '';
  position: absolute;
  inset: -7px;
  border-radius: 999px;
}

.switch:hover {
  background: color-mix(in srgb, var(--theme-text) 24%, transparent);
}

.switch--on,
.switch--on:hover {
  background: var(--theme-accent);
}

.switch:disabled {
  opacity: 0.6;
  cursor: wait;
}

.switch-knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.28);
  transition: transform 0.24s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.switch--on .switch-knob {
  transform: translateX(16px);
}

/* ========== 按钮 ========== */
.ghost-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 9px;
  border-radius: 8px;
  font-size: 12px;
  color: var(--theme-muted);
  transition: background-color 0.15s ease, color 0.15s ease, opacity 0.15s ease;
  white-space: nowrap;
}

.ghost-btn:hover {
  background: color-mix(in srgb, var(--theme-text) 6%, transparent);
  color: var(--theme-text);
}

.ghost-btn:disabled {
  opacity: 0.55;
  cursor: wait;
}

.icon-btn {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--theme-muted);
  transition: background-color 0.15s ease, color 0.15s ease;
}

.icon-btn:hover {
  background: color-mix(in srgb, var(--theme-text) 7%, transparent);
  color: var(--theme-text);
}

.icon-btn.icon-btn--xs {
  width: 28px;
  height: 28px;
  border-radius: 7px;
}

.icon-btn--danger:hover {
  background: rgba(239, 68, 68, 0.1);
  color: #dc2626;
}

.dark .icon-btn--danger:hover {
  color: #f87171;
}

.spinner {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 1.5px solid color-mix(in srgb, currentColor 25%, transparent);
  border-top-color: currentColor;
  animation: spin 0.7s linear infinite;
  flex-shrink: 0;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ========== 提示词 ========== */
.segmented {
  position: relative;
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  width: 12.5rem;
  padding: 3px;
  border-radius: 9px;
  background: color-mix(in srgb, var(--theme-text) 6%, transparent);
  border: 1px solid color-mix(in srgb, var(--theme-text) 6%, transparent);
}

.segmented-thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: calc(50% - 3px);
  height: calc(100% - 6px);
  border-radius: 7px;
  background: var(--theme-surface);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.14);
  transition: transform 0.32s cubic-bezier(0.22, 1, 0.36, 1);
}

.segmented-thumb.is-right {
  transform: translateX(100%);
}

.segmented-btn {
  position: relative;
  z-index: 1;
  padding: 5px 8px;
  border-radius: 7px;
  font-size: 12px;
  font-weight: 500;
  color: var(--theme-muted);
  white-space: nowrap;
  transition: color 0.2s ease;
}

.segmented-btn:hover {
  color: var(--theme-text);
}

.segmented-btn.is-active {
  color: var(--theme-text);
}

.prompt-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--theme-accent);
  background: color-mix(in srgb, var(--theme-accent) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--theme-accent) 20%, transparent);
}

.prompt-preview {
  margin-top: 14px;
  border-radius: 10px;
  border: 1px solid var(--theme-border);
  overflow: hidden;
}

.preview-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 9px 12px;
  background: color-mix(in srgb, var(--theme-text) 2%, transparent);
}

.preview-row + .preview-row {
  border-top: 1px solid var(--theme-border);
}

.preview-label {
  flex-shrink: 0;
  padding-top: 1px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: var(--theme-muted);
}

.preview-text {
  min-width: 0;
  flex: 1;
  font-size: 12px;
  line-height: 1.65;
  word-break: break-word;
  color: var(--theme-text);
}

.preview-code {
  min-width: 0;
  flex: 1;
  margin: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11.5px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--theme-text);
}

.prompt-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 12px;
}

.var-chip {
  padding: 2px 6px;
  border-radius: 5px;
  border: 1px solid var(--theme-border);
  background: color-mix(in srgb, var(--theme-text) 3%, transparent);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 10px;
  color: var(--theme-muted);
  transition: color 0.15s ease, border-color 0.15s ease, background-color 0.15s ease;
}

.var-chip:hover {
  color: var(--theme-accent);
  border-color: color-mix(in srgb, var(--theme-accent) 35%, var(--theme-border));
  background: color-mix(in srgb, var(--theme-accent) 7%, transparent);
}

.var-tooltip {
  position: fixed;
  z-index: 9997;
  width: max-content;
  max-width: min(18rem, calc(100vw - 2rem));
  padding: 9px 11px;
  border: 1px solid var(--theme-border);
  border-radius: 9px;
  background: var(--theme-surface);
  box-shadow:
    0 16px 36px -20px rgba(0, 0, 0, 0.45),
    0 2px 8px -4px rgba(0, 0, 0, 0.12);
  pointer-events: none;
  transform: translate(-50%, -100%);
}

.var-tooltip.is-bottom {
  transform: translate(-50%, 0);
}

.var-tooltip-token {
  padding: 1px 5px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--theme-accent) 10%, transparent);
  color: var(--theme-accent);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 10.5px;
}

.var-tooltip-desc {
  margin-top: 4px;
  font-size: 11px;
  line-height: 1.65;
  color: var(--theme-muted);
}

.var-tip-enter-active,
.var-tip-leave-active {
  transition: opacity 0.16s ease, transform 0.18s cubic-bezier(0.22, 1, 0.36, 1);
}

.var-tip-enter-from,
.var-tip-leave-to {
  opacity: 0;
}

.var-tip-enter-from:not(.is-bottom),
.var-tip-leave-to:not(.is-bottom) {
  transform: translate(-50%, calc(-100% + 5px));
}

.var-tip-enter-from.is-bottom,
.var-tip-leave-to.is-bottom {
  transform: translate(-50%, -5px);
}

.fade-slide-enter-active {
  transition: opacity 0.22s ease, transform 0.28s cubic-bezier(0.22, 1, 0.36, 1);
}
.fade-slide-leave-active {
  transition: opacity 0.12s ease, transform 0.12s ease;
}
.fade-slide-enter-from {
  opacity: 0;
  transform: translateY(6px);
}
.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

/* ========== 侧栏 ========== */
.active-avatar {
  width: 40px;
  height: 40px;
  border-radius: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--theme-accent);
  background: linear-gradient(
    145deg,
    color-mix(in srgb, var(--theme-accent) 15%, var(--theme-surface)),
    color-mix(in srgb, var(--theme-accent) 6%, var(--theme-surface))
  );
  border: 1px solid color-mix(in srgb, var(--theme-accent) 24%, transparent);
}

.step-item {
  position: relative;
}

.step-item:not(:last-child)::before {
  content: '';
  position: absolute;
  left: 10px;
  top: 25px;
  bottom: -12px;
  width: 1px;
  background: var(--theme-border);
}

.step-index {
  width: 21px;
  height: 21px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 10.5px;
  font-weight: 600;
  color: var(--theme-muted);
  background: color-mix(in srgb, var(--theme-text) 6%, transparent);
  border: 1px solid transparent;
  transition: color 0.2s ease, background-color 0.2s ease, border-color 0.2s ease;
}

.step-index--active {
  color: var(--theme-accent);
  background: color-mix(in srgb, var(--theme-accent) 13%, transparent);
  border-color: color-mix(in srgb, var(--theme-accent) 24%, transparent);
}

/* ========== 滑块 ========== */
.ai-range {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 6px;
  border-radius: 999px;
  background: linear-gradient(
    to right,
    var(--theme-accent) 0%,
    var(--theme-accent) var(--pct),
    color-mix(in srgb, var(--theme-text) 12%, transparent) var(--pct),
    color-mix(in srgb, var(--theme-text) 12%, transparent) 100%
  );
  outline: none;
  cursor: pointer;
}

.ai-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--theme-surface);
  border: 2px solid var(--theme-accent);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.22);
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}

.ai-range::-webkit-slider-thumb:hover {
  transform: scale(1.12);
  box-shadow: 0 0 0 6px color-mix(in srgb, var(--theme-accent) 14%, transparent);
}

.ai-range:focus-visible::-webkit-slider-thumb {
  box-shadow: 0 0 0 6px color-mix(in srgb, var(--theme-accent) 18%, transparent);
}

.ai-range::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--theme-surface);
  border: 2px solid var(--theme-accent);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.22);
}

.ai-range::-moz-range-track {
  height: 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--theme-text) 12%, transparent);
}

.ai-range::-moz-range-progress {
  height: 6px;
  border-radius: 999px;
  background: var(--theme-accent);
}

/* ========== 弹层 ========== */
.modal-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--theme-accent);
  background: color-mix(in srgb, var(--theme-accent) 11%, transparent);
  border: 1px solid color-mix(in srgb, var(--theme-accent) 20%, transparent);
}

.model-row {
  width: 100%;
  min-height: 40px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 10px;
  border-radius: 8px;
  color: var(--theme-text);
  transition: background-color 0.15s ease, color 0.15s ease;
}

.model-row:hover {
  background: color-mix(in srgb, var(--theme-text) 6%, transparent);
}

.model-row--current {
  background: color-mix(in srgb, var(--theme-accent) 9%, transparent);
  color: var(--theme-accent);
}

.model-row--current:hover {
  background: color-mix(in srgb, var(--theme-accent) 13%, transparent);
}

.fade-soft-enter-active,
.fade-soft-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.fade-soft-enter-from,
.fade-soft-leave-to {
  opacity: 0;
  transform: translateY(-2px);
}

/* ========== 可访问性 ========== */
button:focus-visible,
a:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--theme-accent) 55%, transparent);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .anim-rise,
  .provider-row,
  .empty-orb::before {
    animation: none !important;
    opacity: 1;
    transform: none;
  }

  .ai-range::-webkit-slider-thumb {
    transition: none;
  }
}
</style>
