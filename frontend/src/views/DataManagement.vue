<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useApi } from '@/composables/useApi'
import { useToastStore } from '@/stores/toast'
import { useConfirmStore } from '@/stores/confirm'
import { QUESTION_TYPES } from '@/composables/constants'
import { formatDate } from '@/composables/utils'
import { useTrashStore } from '@/stores/trash'
import ImportResultDialog from '@/components/ImportResultDialog.vue'
import ImportCategoryDialog from '@/components/ImportCategoryDialog.vue'
import SearchableSelect from '@/components/SearchableSelect.vue'
import PageHeader from '@/components/PageHeader.vue'
import SectionHeader from '@/components/SectionHeader.vue'
import gsap from 'gsap'
import { gsapEasing, prefersReducedMotion } from '@/utils/motionTokens'
import { watch, nextTick, onBeforeUnmount } from 'vue'

defineOptions({ name: 'DataManagement' })

const api = useApi()
const toast = useToastStore()
const confirm = useConfirmStore()
const trashStore = useTrashStore()

// Categories for export filter & batch delete
const categories = ref([])
onMounted(async () => {
  try { categories.value = await api.getCategories() } catch {}
})

// Export filters
const exportFilters = reactive({
  types: [],
  category: '',
})

// Import
const importText = ref('')
const importing = ref(false)
const isDragging = ref(false)

// Import result dialog state
const showResultDialog = ref(false)
const resultDuplicates = ref([])
const resultConflicts = ref([])
const importSummary = ref({ imported: 0, skipped: 0 })

// Import category dialog state
const showCategoryDialog = ref(false)
const importCategories = ref([])
const pendingQuestions = ref(null)

// Batch delete
const batchFilters = reactive({
  before: '',
  after: '',
  type: '',
  category: '',
})

function downloadBackup() {
  api.downloadBackup()
  toast.success('数据库备份下载中...')
}

// ===== Backup overview =====
const backupStats = ref(null)
const backupTypeMax = computed(() =>
  Math.max(1, ...(backupStats.value?.typeCounts || []).map(t => t.count)),
)
const backupCategoryMax = computed(() =>
  Math.max(1, ...(backupStats.value?.topCategories || []).map(c => c.count)),
)

async function loadBackupStats() {
  try { backupStats.value = await api.getBackupStats() } catch {}
}

function exportJson() {
  const params = {}
  if (exportFilters.types.length > 0) params.type = exportFilters.types.join(',')
  if (exportFilters.category) params.category = exportFilters.category
  api.exportJson(params)
}

async function importJson() {
  if (!importText.value.trim()) {
    toast.error('请粘贴 JSON 数据')
    return
  }
  let questions
  try {
    questions = JSON.parse(importText.value)
    if (!Array.isArray(questions)) {
      toast.error('JSON 数据必须是数组格式')
      return
    }
  } catch (e) {
    toast.error('JSON 格式不正确')
    return
  }

  // Preview categories for score configuration
  try {
    const preview = await api.previewImport(questions)
    importCategories.value = preview.categories
    pendingQuestions.value = questions
    showCategoryDialog.value = true
  } catch (e) {
    // handled by useApi
  }
}

async function onCategoryConfirmed(categoryScores) {
  showCategoryDialog.value = false
  const questions = pendingQuestions.value
  pendingQuestions.value = null

  // Apply category name changes to questions
  const nameMap = {}
  for (const cs of categoryScores) {
    if (cs.name && cs.name !== cs.originalName) {
      nameMap[cs.originalName] = cs.name
    }
  }
  if (Object.keys(nameMap).length > 0) {
    for (const q of questions) {
      const cat = q.category || '默认'
      if (nameMap[cat]) {
        q.category = nameMap[cat]
      }
    }
  }

  const ok = await confirm.show({
    title: '导入数据',
    message: `即将导入 ${questions.length} 条题目数据。`,
    confirmText: '开始导入',
  })
  if (!ok) return

  importing.value = true
  try {
    const result = await api.importJson(questions, categoryScores)
    importSummary.value = { imported: result.imported, skipped: result.skipped }

    const dupes = result.duplicates || []
    const confs = result.conflicts || []

    if (confs.length > 0 || dupes.length > 0) {
      resultDuplicates.value = dupes
      resultConflicts.value = confs
      showResultDialog.value = true
      if (result.imported > 0) {
        toast.success(`已成功导入 ${result.imported} 条新题目`)
      }
    } else {
      toast.success(result.message)
      importText.value = ''
    }
  } catch (e) {
    // handled
  } finally {
    importing.value = false
  }
}

function onCategoryCancelled() {
  showCategoryDialog.value = false
  pendingQuestions.value = null
  importCategories.value = []
}

function closeResultDialog() {
  showResultDialog.value = false
  resultDuplicates.value = []
  resultConflicts.value = []
  importText.value = ''
}



function handleFileUpload(event) {
  const file = event.target.files[0]
  if (!file) return
  readFile(file)
  event.target.value = ''
}

function readFile(file) {
  const reader = new FileReader()
  reader.onload = (e) => {
    importText.value = e.target.result
  }
  reader.readAsText(file)
}

function onDragOver(e) {
  e.preventDefault()
  isDragging.value = true
}

function onDragLeave() {
  isDragging.value = false
}

function onDrop(e) {
  e.preventDefault()
  isDragging.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file && file.name.endsWith('.json')) {
    readFile(file)
  } else {
    toast.error('请拖入 .json 文件')
  }
}

// ===== Database =====
const dbInfo = ref({ currentPath: '', recentPaths: [], fileSize: 0, questionCount: 0, trashCount: 0, categoryCount: 0 })
const dbLoading = ref(false)
const dbFileInput = ref(null)
const showAllRecent = ref(false)
const RECENT_SHOW_LIMIT = 5
const pendingDbFile = ref(null)
const showUploadDialog = ref(false)
const uploadCustomName = ref('')

async function loadDbInfo() {
  try {
    const data = await api.getDatabase()
    dbInfo.value = data
    loadBackupStats()
  } catch {}
}

onMounted(() => { loadDbInfo() })

function formatFileSize(bytes) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let size = bytes
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++ }
  return `${size.toFixed(i > 0 ? 1 : 0)} ${units[i]}`
}

function getFileName(p) {
  if (!p) return ''
  return p.split('/').pop().split('\\').pop()
}

function getParentDir(p) {
  if (!p) return ''
  const parts = p.replace(/\\/g, '/').split('/')
  parts.pop()
  return parts.join('/') || '/'
}

async function handleDbFileSelect(event) {
  const file = event.target.files[0]
  if (!file) return
  if (!file.name.endsWith('.db')) {
    toast.error('请选择 .db 文件')
    event.target.value = ''
    return
  }
  event.target.value = ''

  // Pre-fill with original filename (without extension)
  const dotIdx = file.name.lastIndexOf('.')
  uploadCustomName.value = dotIdx > 0 ? file.name.slice(0, dotIdx) : file.name
  pendingDbFile.value = file
  showUploadDialog.value = true
}

async function confirmUpload() {
  const name = uploadCustomName.value.trim()
  if (!name) {
    toast.error('请输入数据库名称')
    return
  }
  const file = pendingDbFile.value
  if (!file) return

  showUploadDialog.value = false
  pendingDbFile.value = null

  const desiredName = name.endsWith('.db') ? name : `${name}.db`
  await doUploadDb(file, desiredName)
}

function cancelUpload() {
  showUploadDialog.value = false
  pendingDbFile.value = null
  uploadCustomName.value = ''
}

async function doUploadDb(file, desiredName) {
  dbLoading.value = true
  try {
    const result = await api.uploadDatabase(file, desiredName)
    toast.success(result.message || '上传并切换成功')
    dbInfo.value = {
      currentPath: result.currentPath,
      recentPaths: result.recentPaths || [],
      fileSize: result.fileSize || 0,
      questionCount: result.questionCount || 0,
      trashCount: result.trashCount || 0,
      categoryCount: result.categoryCount || 0,
    }
    loadBackupStats()
  } catch (e) {
    // handled
  } finally {
    dbLoading.value = false
  }
}


function triggerDbFileInput() {
  dbFileInput.value?.click()
}

async function switchToRecent(p) {
  if (p === dbInfo.value.currentPath) return
  dbLoading.value = true
  try {
    const result = await api.switchDatabase(p)
    toast.success(result.message || '切换成功')
    dbInfo.value = {
      currentPath: result.currentPath,
      recentPaths: result.recentPaths || [],
      fileSize: result.fileSize || 0,
      questionCount: result.questionCount || 0,
      trashCount: result.trashCount || 0,
      categoryCount: result.categoryCount || 0,
    }
    loadBackupStats()
  } catch (e) {
    // handled
  } finally {
    dbLoading.value = false
  }
}

async function resetDb() {
  const ok = await confirm.show({
    title: '切回默认数据库',
    message: '将从当前数据库切换回项目目录下的 default.db，当前数据库文件不会被删除。确定继续？',
    confirmText: '切回默认',
    danger: true,
  })
  if (!ok) return
  dbLoading.value = true
  try {
    const result = await api.resetDatabase()
    toast.success(result.message || '已切回默认数据库')
    dbInfo.value = {
      currentPath: result.currentPath,
      recentPaths: result.recentPaths || [],
      fileSize: result.fileSize || 0,
      questionCount: result.questionCount || 0,
      trashCount: result.trashCount || 0,
      categoryCount: result.categoryCount || 0,
    }
    loadBackupStats()
  } catch (e) {
    // handled
  } finally {
    dbLoading.value = false
  }
}

const displayedRecentPaths = computed(() => {
  const paths = dbInfo.value.recentPaths || []
  if (showAllRecent.value || paths.length <= RECENT_SHOW_LIMIT) return paths
  return paths.slice(0, RECENT_SHOW_LIMIT)
})

async function removeRecentPath(p, event) {
  event.stopPropagation()
  if (p === dbInfo.value.currentPath) {
    toast.error('不能移除当前正在使用的数据库')
    return
  }
  try {
    const result = await api.removeRecentDb(p)
    dbInfo.value.recentPaths = result.recentPaths || []
    toast.success('已从列表中移除')
  } catch (e) {
    // handled
  }
}

// ===== Dedup =====
const dedupLoading = ref(false)
const dedupGroups = ref([])
const dedupTotalDuplicates = ref(0)
const dedupSelections = ref({})

async function scanDuplicates() {
  dedupLoading.value = true; dedupGroups.value = []; dedupTotalDuplicates.value = 0; dedupSelections.value = {}
  try {
    const r = await api.getDuplicates()
    dedupGroups.value = r.groups || []; dedupTotalDuplicates.value = r.totalDuplicates || 0
    const s = {}; r.groups.forEach((g, i) => { if (g.items.length) s[i] = g.items[0].id }); dedupSelections.value = s
    if (!r.groups.length) toast.info('未发现重复题目')
  } catch (e) {} finally { dedupLoading.value = false }
}
function selectDedupKeep(gi, id) { dedupSelections.value = { ...dedupSelections.value, [gi]: id } }
function selectNewestAll() { const s = {}; dedupGroups.value.forEach((g, i) => { if (g.items.length) s[i] = g.items[0].id }); dedupSelections.value = s }
function selectOldestAll() { const s = {}; dedupGroups.value.forEach((g, i) => { if (g.items.length) s[i] = g.items[g.items.length-1].id }); dedupSelections.value = s }
async function resolveDuplicates() {
  const groups = dedupGroups.value.map((g, i) => ({ type: g.type, content: g.content, keepId: dedupSelections.value[i] })).filter(g => g.keepId)
  if (!groups.length) { toast.error('请至少为一组选择要保留的题目'); return }
  const ok = await confirm.show({ title: '去重处理', message: `将保留每组选中的题目，其余 ${dedupTotalDuplicates.value} 条重复题目移至回收站。`, confirmText: '确认去重', danger: true })
  if (!ok) return
  dedupLoading.value = true
  try { const r = await api.resolveDuplicates({ groups }); toast.success(r.message || '去重完成'); trashStore.increment(r.trashed || 0); await scanDuplicates() }
  catch (e) {} finally { dedupLoading.value = false }
}
async function batchDeleteByDate() {
  if (!batchFilters.before && !batchFilters.after && !batchFilters.type && !batchFilters.category) {
    toast.error('请至少选择一个删除条件')
    return
  }
  const parts = []
  if (batchFilters.after) parts.push(`创建于 ${batchFilters.after} 之后`)
  if (batchFilters.before) parts.push(`创建于 ${batchFilters.before} 之前`)
  if (batchFilters.type) parts.push(`题型为 ${batchFilters.type}`)
  if (batchFilters.category) parts.push(`分类为 ${batchFilters.category}`)

  const ok = await confirm.show({
    title: '批量删除',
    message: `将删除${parts.join('且')}的题目，移至回收站。确定继续？`,
    confirmText: '确认删除',
    danger: true,
  })
  if (!ok) return

  try {
    const result = await api.batchDelete(batchFilters)
    if (result.deleted) trashStore.increment(result.deleted)
    toast.success(result.message || '已移至回收站')
    batchFilters.before = ''
    batchFilters.after = ''
    batchFilters.type = ''
    batchFilters.category = ''
  } catch (e) {
    // handled
  }
}

/* ========== 表现层：章节锚点 / 入场编排 / 数据可视化动效 ==========
   以下状态与函数只驱动视觉：不新增任何请求，也不改动上面的业务标识符。 */

// 导航状态由共享组件 SectionNav 持有（/external 与本页同一份实现），页面只声明 SECTIONS 锚点
import SectionNav from '@/components/SectionNav.vue'

const pageRef = ref(null)
const heroRef = ref(null)
const dropRef = ref(null)

// 锚点章节：data-nav 与 SectionHeader 的 index 一一对应
const SECTIONS = [
  { nav: 0, index: '01', label: '数据库设置' },
  { nav: 1, index: '02', label: '备份与统计' },
  { nav: 2, index: '03', label: '条件导出' },
  { nav: 3, index: '04', label: 'JSON 导入' },
  { nav: 4, index: '05', label: '批量操作' }
]

let reduceMotion = false
let gsapCtx = null
let revealObserver = null
let spotRaf = 0
let lampX = null
let lampY = null
let busyTween = null

function num(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

const isDefaultDb = computed(() => !dbInfo.value.currentPath)
const activeDbName = computed(() => getFileName(dbInfo.value.currentPath) || 'default.db')
const activeDbDir = computed(() => getParentDir(dbInfo.value.currentPath))
const activeDbSize = computed(() => formatFileSize(dbInfo.value.fileSize || 0))
const recentCount = computed(() => (dbInfo.value.recentPaths || []).length)
const dbState = computed(() => (dbLoading.value ? 'busy' : isDefaultDb.value ? 'idle' : 'live'))
const busy = computed(() => dbLoading.value || importing.value || dedupLoading.value)

// 回收站占比：只由已有 dbInfo / backupStats 派生，供仪表盘环形使用
const trashShare = computed(() => {
  const q = num(backupStats.value ? backupStats.value.questionCount : dbInfo.value.questionCount)
  const t = num(backupStats.value ? backupStats.value.trashCount : dbInfo.value.trashCount)
  const total = q + t
  return total > 0 ? Math.round((t / total) * 1000) / 10 : 0
})

const RING_LEN = 264
const ringReady = ref(false)
const ringOffset = computed(() => Math.round(RING_LEN - (RING_LEN * (ringReady.value ? trashShare.value : 0)) / 100))

// data-stat 的取值表：模板里这些数字是静态 0，真实值由 tweenNumber 写入
const statMap = computed(() => ({
  questions: num(backupStats.value ? backupStats.value.questionCount : dbInfo.value.questionCount),
  categories: num(backupStats.value ? backupStats.value.categoryCount : dbInfo.value.categoryCount),
  types: num(backupStats.value ? backupStats.value.typeCounts.length : 0),
  trash: num(backupStats.value ? backupStats.value.trashCount : dbInfo.value.trashCount),
  recent: recentCount.value,
  'b-questions': num(backupStats.value ? backupStats.value.questionCount : 0),
  'b-categories': num(backupStats.value ? backupStats.value.categoryCount : 0),
  'b-types': num(backupStats.value ? backupStats.value.typeCounts.length : 0),
  'b-trash': num(backupStats.value ? backupStats.value.trashCount : 0),
  dedup: num(dedupTotalDuplicates.value)
}))

// 后端没有「最近切换时间」字段，只能在前端观测路径变化时打点，因此文案限定在本次会话
const sessionSwitchAt = ref('')
watch(
  () => dbInfo.value.currentPath,
  () => {
    const d = new Date()
    const p = (n) => String(n).padStart(2, '0')
    sessionSwitchAt.value = p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds())
  }
)

function tweenNumber(el, to) {
  const target = num(to)
  const from = num(el.dataset.cur)
  if (from === target) return
  el.dataset.cur = String(target)
  if (reduceMotion) {
    el.textContent = String(target)
    return
  }
  if (el._numTween) el._numTween.kill()
  const proxy = { v: from }
  el._numTween = gsap.to(proxy, {
    v: target,
    duration: 0.85,
    ease: gsapEasing.smooth,
    onUpdate: () => {
      el.textContent = String(Math.round(proxy.v))
    },
    onComplete: () => {
      el.textContent = String(target)
    }
  })
}

// 条宽交给 gsap 写内联宽度，模板只提供 data-w，避免 Vue patch 与补间互相覆盖
function tweenBar(el, pct) {
  const target = Math.max(0, Math.min(100, num(pct)))
  if (reduceMotion) {
    el.style.width = target + '%'
    return
  }
  if (el._barTween) el._barTween.kill()
  el._barTween = gsap.to(el, { width: target + '%', duration: 0.7, ease: gsapEasing.smooth })
}

function applyVisualsIn(scope) {
  if (!scope) return
  scope.querySelectorAll('[data-stat]').forEach((el) => tweenNumber(el, statMap.value[el.dataset.stat]))
  scope.querySelectorAll('[data-w]').forEach((el) => tweenBar(el, el.dataset.w))
}

function playSection(el) {
  el.classList.add('is-revealed')
  if (!reduceMotion) {
    const items = el.querySelectorAll('.dm-stagger > *')
    if (items.length) {
      gsap.fromTo(
        items,
        { y: 16, autoAlpha: 0 },
        { y: 0, autoAlpha: 1, duration: 0.62, ease: gsapEasing.smooth, stagger: 0.06, immediateRender: false, clearProps: 'transform' }
      )
    }
  }
  applyVisualsIn(el)
}

function initReveal() {
  const page = pageRef.value
  if (!page) return
  const nodes = page.querySelectorAll('[data-reveal]')
  // reduce 或无 IntersectionObserver 时退化为静态呈现：只做可见态，不做位移
  if (reduceMotion || typeof IntersectionObserver === 'undefined') {
    nodes.forEach((el) => el.classList.add('is-revealed'))
    applyVisualsIn(page)
    return
  }
  revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return
        playSection(entry.target)
        revealObserver.unobserve(entry.target)
      })
    },
    { threshold: 0.06, rootMargin: '0px 0px -4% 0px' }
  )
  nodes.forEach((el) => revealObserver.observe(el))
}

function heroIntro() {
  const hero = heroRef.value
  if (!hero) return
  const items = hero.querySelectorAll('.dm-hero-in')
  if (reduceMotion) {
    gsap.set(items, { autoAlpha: 1, y: 0 })
    return
  }
  gsap.fromTo(
    items,
    { y: 18, autoAlpha: 0 },
    { y: 0, autoAlpha: 1, duration: 0.7, ease: gsapEasing.smooth, stagger: 0.07, delay: 0.05 }
  )
}

function moveSpotlight(e) {
  if (reduceMotion) return
  const el = e.currentTarget
  const x = e.clientX
  const y = e.clientY
  if (spotRaf) cancelAnimationFrame(spotRaf)
  spotRaf = requestAnimationFrame(() => {
    spotRaf = 0
    const rect = el.getBoundingClientRect()
    const px = x - rect.left
    const py = y - rect.top
    el.style.setProperty('--mx', px + 'px')
    el.style.setProperty('--my', py + 'px')
    if (lampX && lampY) {
      lampX(px - 110)
      lampY(py - 110)
    }
  })
}

function leaveSpotlight(e) {
  if (reduceMotion) return
  const el = e.currentTarget
  el.classList.remove('is-lit')
  if (lampX && lampY) {
    lampX(0)
    lampY(0)
  }
}

function enterSpotlight(e) {
  if (reduceMotion) return
  e.currentTarget.classList.add('is-lit')
}

// 章节测量 / 滚动高亮 / 跳转全部由 SectionNav 承载，本页只声明锚点 data-nav

// 拖拽反馈：状态类留在模板里，这里只在文件真正悬停进来的瞬间补一次弹跳
watch(isDragging, (on) => {
  const el = dropRef.value
  if (!el) return
  if (reduceMotion || !on) return
  gsap.fromTo(el, { scale: 0.994 }, { scale: 1, duration: 0.45, ease: gsapEasing.bounce, clearProps: 'transform' })
})

// 忙碌态脉冲只在真的有请求在飞时循环，静止即 kill，且 reduce 下完全交给 CSS 静态态
watch(busy, (on) => {
  const el = pageRef.value && pageRef.value.querySelector('.dm-live')
  if (!el) return
  if (reduceMotion) return
  if (on) {
    if (busyTween) busyTween.kill()
    busyTween = gsap.to(el, { scale: 1.035, duration: 0.7, ease: gsapEasing.sharp, yoyo: true, repeat: -1 })
  } else if (busyTween) {
    busyTween.kill()
    busyTween = null
    gsap.set(el, { clearProps: 'transform' })
  }
})

watch([statMap, backupStats, dedupTotalDuplicates], () => {
  nextTick(() => applyVisualsIn(pageRef.value))
})

onMounted(async () => {
  reduceMotion = prefersReducedMotion()
  await nextTick()
  gsapCtx = gsap.context(() => {
    const lamp = heroRef.value ? heroRef.value.querySelector('.dm-hero-lamp') : null
    if (lamp) {
      lampX = gsap.quickTo(lamp, 'x', { duration: 0.28, ease: gsapEasing.smooth })
      lampY = gsap.quickTo(lamp, 'y', { duration: 0.28, ease: gsapEasing.smooth })
    }
    initReveal()
    heroIntro()
    ringReady.value = true
    applyVisualsIn(heroRef.value)
  }, pageRef.value)
})

onBeforeUnmount(() => {
  if (revealObserver) {
    revealObserver.disconnect()
    revealObserver = null
  }
  if (busyTween) {
    busyTween.kill()
    busyTween = null
  }
  if (spotRaf) cancelAnimationFrame(spotRaf)
  if (pageRef.value) {
    pageRef.value.querySelectorAll('[data-stat], [data-w]').forEach((el) => {
      if (el._numTween) el._numTween.kill()
      if (el._barTween) el._barTween.kill()
    })
  }
  if (gsapCtx) gsapCtx.revert()
  gsapCtx = null
  lampX = null
  lampY = null
})
</script>

<template>
  <section ref="pageRef" class="dm-page">
    <PageHeader
      eyebrow="数据资产"
      eyebrow-en="DATA OPERATIONS"
      title="数据管理"
      description="数据库切换、备份与导入导出；批量操作前请先确认影响范围。"
    >
      <template #actions>
        <span class="dm-live" :class="'is-' + dbState" role="status" aria-live="polite">
          <i class="dm-live-dot" aria-hidden="true"></i>
          <span class="dm-live-k">当前库</span>
          <b class="dm-live-v" :title="dbInfo.currentPath || '项目默认数据库'">{{ activeDbName }}</b>
        </span>
      </template>
    </PageHeader>

    <!-- ===== Hero：数据库控制台 ===== -->
    <section
      ref="heroRef"
      class="dm-console dm-hero"
      data-reveal
      @pointerenter="enterSpotlight"
      @pointermove="moveSpotlight"
      @pointerleave="leaveSpotlight"
    >
      <span class="dm-console-fx" aria-hidden="true">
        <span class="dm-hero-grid"></span>
        <span class="dm-hero-scan"></span>
        <span class="dm-hero-lamp"></span>
      </span>

      <div class="dm-hero-top">
        <div class="dm-hero-id">
          <p class="dm-kicker dm-hero-in"><i aria-hidden="true">◆</i> ACTIVE DATABASE CONSOLE</p>
          <h2 class="dm-hero-name dm-hero-in" :title="dbInfo.currentPath || '项目默认数据库'">
            {{ isDefaultDb ? '未绑定独立库' : activeDbName }}
          </h2>
          <p class="dm-hero-path dm-hero-in">
            {{ isDefaultDb ? '当前使用项目目录下的默认数据库文件' : activeDbDir + '/' }}
          </p>
          <dl class="dm-hero-facts dm-hero-in">
            <div class="dm-fact">
              <dt>文件体积</dt>
              <dd>{{ activeDbSize }}</dd>
            </div>
            <div class="dm-fact">
              <dt>近期库</dt>
              <dd>{{ recentCount }} 个</dd>
            </div>
            <div class="dm-fact">
              <dt>本次会话切换</dt>
              <dd>{{ sessionSwitchAt || '未切换' }}</dd>
            </div>
          </dl>
        </div>

        <div class="dm-gauge dm-hero-in">
          <svg class="dm-ring" viewBox="0 0 100 100" role="img" :aria-label="'回收站题目占比 ' + trashShare + '%'">
            <circle class="dm-ring-bg" cx="50" cy="50" r="42"></circle>
            <circle
              class="dm-ring-val"
              cx="50"
              cy="50"
              r="42"
              :stroke-dasharray="RING_LEN"
              :style="{ strokeDashoffset: ringOffset }"
            ></circle>
          </svg>
          <p class="dm-gauge-read">
            <b>{{ trashShare }}<i>%</i></b>
            <span>回收站占比</span>
          </p>
        </div>
      </div>

      <ul class="dm-stats dm-stagger">
        <li class="dm-stat">
          <b class="dm-num" data-stat="questions">0</b>
          <span class="dm-stat-k">题目总数</span>
        </li>
        <li class="dm-stat">
          <b class="dm-num" data-stat="categories">0</b>
          <span class="dm-stat-k">分类数量</span>
        </li>
        <li class="dm-stat">
          <b class="dm-num" data-stat="types">0</b>
          <span class="dm-stat-k">覆盖题型</span>
        </li>
        <li class="dm-stat">
          <b class="dm-num" data-stat="trash">0</b>
          <span class="dm-stat-k">回收站</span>
        </li>
        <li class="dm-stat">
          <b class="dm-num" data-stat="recent">0</b>
          <span class="dm-stat-k">近期库</span>
        </li>
      </ul>
    </section>

    <!-- ===== 章节锚点：≥1024 右侧导轨，<1024 顶部胶囊（与 /external 共用组件） ===== -->
    <SectionNav
      :sections="SECTIONS"
      :container="pageRef"
      locate-selector=".dm-console"
      chips
    />

    <!-- ===== 01 数据库设置 ===== -->
    <section class="dm-sec" data-nav="0" data-reveal>
      <SectionHeader index="01" title="数据库设置" hint="切换、上传与移除题库数据库文件">
        <template #badge>
          <span class="dm-badge" :class="'is-' + dbState">{{ isDefaultDb ? '默认库' : '已绑定' }}</span>
        </template>
        <template #actions>
          <button type="button" class="btn-primary dm-btn" :disabled="dbLoading" @click="triggerDbFileInput">
            <svg v-if="dbLoading" class="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <svg v-else class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            {{ dbLoading ? '处理中...' : '选择数据库文件' }}
          </button>
          <button
            type="button"
            class="btn-secondary dm-btn"
            :disabled="dbLoading || dbInfo.currentPath === dbInfo.recentPaths?.[0] && dbInfo.recentPaths?.length <= 1"
            @click="resetDb"
          >
            切回默认数据库
          </button>
        </template>
      </SectionHeader>

      <div class="dm-console dm-console-plain">
        <input ref="dbFileInput" type="file" accept=".db" class="hidden" @change="handleDbFileSelect" />

        <div class="dm-grid-a dm-stagger">
          <div class="dm-card">
            <div class="dm-card-head">
              <p class="dm-h">当前数据库</p>
              <span class="dm-tag is-live">使用中</span>
            </div>
            <p class="dm-file-name" :title="dbInfo.currentPath">{{ getFileName(dbInfo.currentPath) || 'default.db' }}</p>
            <p class="dm-file-path" :title="dbInfo.currentPath">{{ getParentDir(dbInfo.currentPath) }}/</p>
            <ul class="dm-facts-row">
              <li>
                <span>题目</span>
                <b>{{ dbInfo.questionCount }}</b>
              </li>
              <li>
                <span>分类</span>
                <b>{{ dbInfo.categoryCount }}</b>
              </li>
              <li>
                <span>回收站</span>
                <b>{{ dbInfo.trashCount }}</b>
              </li>
              <li>
                <span>大小</span>
                <b>{{ formatFileSize(dbInfo.fileSize) }}</b>
              </li>
            </ul>
          </div>

          <div v-if="dbInfo.recentPaths && dbInfo.recentPaths.filter(p => p !== dbInfo.currentPath).length > 0" class="dm-card">
            <div class="dm-card-head">
              <p class="dm-h">最近使用的数据库</p>
              <span class="dm-count">{{ dbInfo.recentPaths.length }} 个</span>
            </div>
            <ul class="dm-recent">
              <li
                v-for="p in displayedRecentPaths"
                :key="p"
                class="dm-recent-item"
                :class="{ 'is-current': p === dbInfo.currentPath }"
                role="button"
                tabindex="0"
                :aria-label="'切换到 ' + getFileName(p)"
                @click="switchToRecent(p)"
                @keydown.enter.prevent="switchToRecent(p)"
                @keydown.space.prevent="switchToRecent(p)"
              >
                <span class="dm-recent-ico" aria-hidden="true">
                  <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7c0-2-1-3-3-3H7C5 4 4 5 4 7z"
                    />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 11h6M9 8h6" />
                  </svg>
                </span>
                <span class="dm-recent-text">
                  <span class="dm-recent-name">
                    {{ getFileName(p) }}
                    <em v-if="p === dbInfo.currentPath" class="dm-tag is-live">当前</em>
                  </span>
                  <span class="dm-recent-path" :title="p">{{ getParentDir(p) }}/</span>
                </span>
                <button
                  v-if="p !== dbInfo.currentPath"
                  type="button"
                  class="dm-recent-del"
                  title="从列表中移除"
                  @click="removeRecentPath(p, $event)"
                >
                  <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </li>
            </ul>
            <button
              v-if="dbInfo.recentPaths.length > RECENT_SHOW_LIMIT"
              type="button"
              class="dm-more"
              @click="showAllRecent = !showAllRecent"
            >
              <svg
                class="h-3 w-3 transition-transform duration-300"
                :class="{ 'rotate-180': showAllRecent }"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" />
              </svg>
              {{ showAllRecent ? '收起列表' : `查看全部 ${dbInfo.recentPaths.length} 个` }}
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- ===== 02 备份与统计 ===== -->
    <section class="dm-sec" data-nav="1" data-reveal>
      <SectionHeader index="02" title="备份与统计" hint="当前库快照、题型分布与分类排行">
        <template #badge>
          <span class="dm-badge">BACKUP v1</span>
        </template>
        <template #actions>
          <button type="button" class="btn-secondary dm-btn" @click="loadBackupStats">刷新快照</button>
          <button type="button" class="btn-primary dm-btn" @click="downloadBackup">下载数据库备份</button>
        </template>
      </SectionHeader>

      <div class="dm-console">
        <span class="dm-console-fx" aria-hidden="true">
          <span class="dm-hero-grid"></span>
        </span>
        <div v-if="!backupStats" class="dm-empty">
          <p class="dm-empty-t">尚未读取快照数据</p>
          <p class="dm-sub">快照只统计当前库，切换数据库后需要重新刷新。</p>
          <button type="button" class="btn-primary dm-btn" @click="loadBackupStats">立即刷新</button>
        </div>
        <template v-else>
          <ul class="dm-stats dm-stats-4 dm-stagger">
            <li class="dm-stat">
              <b class="dm-num" data-stat="b-questions">0</b>
              <span class="dm-stat-k">备份题目</span>
            </li>
            <li class="dm-stat">
              <b class="dm-num" data-stat="b-categories">0</b>
              <span class="dm-stat-k">分类数量</span>
            </li>
            <li class="dm-stat">
              <b class="dm-num" data-stat="b-types">0</b>
              <span class="dm-stat-k">覆盖题型</span>
            </li>
            <li class="dm-stat">
              <b class="dm-num" data-stat="b-trash">0</b>
              <span class="dm-stat-k">回收站</span>
            </li>
          </ul>

          <div class="dm-grid2 dm-stagger">
            <div class="dm-block">
              <div class="dm-block-head">
                <p class="dm-h">题型分布</p>
                <span class="dm-sub">按题目数排序</span>
              </div>
              <div v-if="backupStats.typeCounts.length" class="dm-bars">
                <div v-for="t in backupStats.typeCounts" :key="t.type" class="dm-row">
                  <span class="badge badge-type dm-row-type">{{ t.type }}</span>
                  <span class="dm-track"><i class="dm-fill" :data-w="(t.count / backupTypeMax * 100).toFixed(1)"></i></span>
                  <b class="dm-row-v">{{ t.count }}</b>
                </div>
              </div>
              <p v-else class="dm-sub">当前库还没有题目。</p>
            </div>

            <div class="dm-block">
              <div class="dm-block-head">
                <p class="dm-h">题目最多的分类</p>
                <span class="dm-sub">Top {{ backupStats.topCategories.length }}</span>
              </div>
              <div v-if="backupStats.topCategories.length" class="dm-bars">
                <div v-for="(c, i) in backupStats.topCategories" :key="c.name" class="dm-row">
                  <span class="dm-row-idx">{{ String(i + 1).padStart(2, '0') }}</span>
                  <span class="dm-row-name" :title="c.name">{{ c.name }}</span>
                  <span class="dm-track"><i class="dm-fill is-alt" :data-w="(c.count / backupCategoryMax * 100).toFixed(1)"></i></span>
                  <b class="dm-row-v">{{ c.count }}</b>
                </div>
              </div>
              <p v-else class="dm-sub">暂无分类统计。</p>
            </div>
          </div>
        </template>
      </div>
    </section>

    <!-- ===== 03 条件导出 ===== -->
    <section class="dm-sec" data-nav="2" data-reveal>
      <SectionHeader index="03" title="条件导出" hint="按题型与分类筛选后导出 JSON">
        <template #badge>
          <span class="dm-badge">{{ exportFilters.types.length || '全部' }} 题型</span>
        </template>
        <template #actions>
          <button type="button" class="btn-primary dm-btn" @click="exportJson">导出 JSON</button>
        </template>
      </SectionHeader>

      <div class="dm-console">
        <span class="dm-console-fx" aria-hidden="true">
          <span class="dm-hero-grid"></span>
        </span>
        <div class="dm-grid-a dm-stagger">
          <div class="dm-field">
            <label class="dm-label">题型筛选（可多选）</label>
            <div class="dm-chips">
              <button
                v-for="t in QUESTION_TYPES"
                :key="t"
                type="button"
                class="dm-chip"
                :class="{ 'is-on': exportFilters.types.includes(t) }"
                :aria-pressed="exportFilters.types.includes(t) ? 'true' : 'false'"
                @click="exportFilters.types.includes(t) ? exportFilters.types.splice(exportFilters.types.indexOf(t), 1) : exportFilters.types.push(t)"
              >
                {{ t }}
              </button>
            </div>
            <p class="dm-sub">不选任何题型即导出全部题型。</p>
          </div>
          <div class="dm-field">
            <label class="dm-label">分类筛选</label>
            <SearchableSelect
              :modelValue="exportFilters.category"
              @update:modelValue="(v) => exportFilters.category = v"
              :options="categories.map(c => ({ label: c.name, value: c.name }))"
              allLabel="全部分类"
              placeholder="全部分类"
            />
          </div>
        </div>
      </div>
    </section>

    <!-- ===== 04 JSON 导入 ===== -->
    <section class="dm-sec" data-nav="3" data-reveal>
      <SectionHeader index="04" title="JSON 导入" hint="粘贴或拖入 .json，重复与冲突逐条确认">
        <template #badge>
          <span class="dm-badge is-caution">写入当前库</span>
        </template>
        <template #actions>
          <label class="btn-secondary dm-btn dm-file-label">
            选择文件
            <input type="file" accept=".json" class="hidden" @change="handleFileUpload" />
          </label>
        </template>
      </SectionHeader>

      <div class="dm-console">
        <span class="dm-console-fx" aria-hidden="true">
          <span class="dm-hero-grid"></span>
        </span>
        <div class="dm-import dm-stagger">
          <div ref="dropRef" class="dm-drop" :class="{ 'is-dragging': isDragging }">
            <span class="dm-drop-corner" aria-hidden="true">
              <i class="dm-drop-tick dm-drop-tick-tl"></i>
              <i class="dm-drop-tick dm-drop-tick-tr"></i>
              <i class="dm-drop-tick dm-drop-tick-br"></i>
              <i class="dm-drop-tick dm-drop-tick-bl"></i>
            </span>
            <textarea
              v-model="importText"
              rows="8"
              class="input-field dm-textarea font-mono text-xs"
              placeholder='[{"type":"单选题","content":"题目内容","options":["A","B"],"answers":["A"],"category":"默认分类"}]'
              @dragover="onDragOver"
              @dragleave="onDragLeave"
              @drop="onDrop"
            ></textarea>
            <p class="dm-drop-hint">
              <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
              也可把 .json 文件直接拖到这里
            </p>
          </div>
          <div class="dm-endrow">
            <span class="dm-sub">{{ importText.trim() ? `待导入 ${importText.trim().length} 个字符` : '等待粘贴或拖入 JSON 数组' }}</span>
            <button type="button" class="btn-primary dm-btn" :disabled="importing || !importText.trim()" @click="importJson">
              <svg v-if="importing" class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              {{ importing ? '导入中...' : '开始导入' }}
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- ===== 05 批量操作 ===== -->
    <section class="dm-sec" data-nav="4" data-reveal>
      <SectionHeader index="05" title="批量操作" hint="按条件删除与重复题去重，执行前请确认影响范围" />

      <div class="dm-subset">
        <SectionHeader index="05 · A" title="按条件批量删除" hint="日期与题型分类可任意组合">
          <template #badge>
            <span class="dm-badge is-danger">移入回收站</span>
          </template>
        </SectionHeader>
        <div class="dm-console dm-console-danger">
          <span class="dm-console-fx" aria-hidden="true">
            <span class="dm-hero-grid"></span>
          </span>
          <div class="dm-form dm-stagger">
            <div class="dm-field">
              <label class="dm-label" for="dm-del-after">起始日期（之后）</label>
              <input id="dm-del-after" v-model="batchFilters.after" type="date" class="input-field" />
            </div>
            <div class="dm-field">
              <label class="dm-label" for="dm-del-before">结束日期（之前）</label>
              <input id="dm-del-before" v-model="batchFilters.before" type="date" class="input-field" />
            </div>
            <div class="dm-field">
              <label class="dm-label" for="dm-del-type">题型</label>
              <span class="dm-select">
                <select id="dm-del-type" v-model="batchFilters.type" class="select-field">
                  <option value="">全部题型</option>
                  <option v-for="t in QUESTION_TYPES" :key="t" :value="t">{{ t }}</option>
                </select>
              </span>
            </div>
            <div class="dm-field">
              <label class="dm-label">分类</label>
              <SearchableSelect
                :modelValue="batchFilters.category"
                @update:modelValue="(v) => batchFilters.category = v"
                :options="categories.map(c => ({ label: c.name, value: c.name }))"
                allLabel="全部分类"
                placeholder="全部分类"
              />
            </div>
          </div>
          <div class="dm-endrow">
            <span class="dm-sub">删除的题目进入回收站，可在回收站恢复。</span>
            <button type="button" class="btn-danger dm-btn" @click="batchDeleteByDate">批量删除</button>
          </div>
        </div>
      </div>

      <div class="dm-subset">
        <SectionHeader index="05 · B" title="重复题目去重" hint="题型与内容完全相同的题目只保留一条">
          <template #actions>
            <button type="button" class="btn-secondary dm-btn" @click="scanDuplicates">
              <svg v-if="dedupLoading" class="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <svg v-else class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M9 12h6M9 8h6M9 16h4M5 4h11a3 3 0 013 3v13l-3-2H5a3 3 0 01-3-3V7a3 3 0 013-3z"
                />
              </svg>
              {{ dedupLoading ? '扫描中...' : '扫描重复题目' }}
            </button>
          </template>
        </SectionHeader>

        <div class="dm-console">
          <span class="dm-console-fx" aria-hidden="true">
            <span class="dm-hero-grid"></span>
          </span>
          <div v-if="dedupGroups.length" class="dm-dedup">
            <div class="dm-dedup-bar">
              <p class="dm-sub">
                待移除 <b class="dm-num-sm" data-stat="dedup">0</b> 条 · 每组保留你选定的那一条
              </p>
              <div class="dm-dedup-acts">
                <button type="button" class="dm-link" @click="selectNewestAll">全选最新</button>
                <button type="button" class="dm-link" @click="selectOldestAll">全选最旧</button>
                <button type="button" class="btn-danger dm-btn" :disabled="dedupLoading" @click="resolveDuplicates">
                  去重处理（移除 {{ dedupTotalDuplicates }} 条）
                </button>
              </div>
            </div>

            <div class="dm-groups">
              <article v-for="(group, gi) in dedupGroups" :key="gi" class="dm-group">
                <header class="dm-group-head">
                  <span class="badge badge-type">{{ group.type }}</span>
                  <span class="badge badge-category">{{ group.items[0]?.category || '默认' }}</span>
                  <span class="dm-group-count">{{ group.count }} 条相同</span>
                </header>
                <p class="dm-group-content">{{ group.content }}</p>
                <ul class="dm-items">
                  <li v-for="item in group.items" :key="item.id" class="dm-item" :class="{ 'is-keep': dedupSelections[gi] === item.id }">
                    <label class="dm-item-main">
                      <input
                        type="radio"
                        :name="`dedup-g${gi}`"
                        class="dm-radio"
                        :checked="dedupSelections[gi] === item.id"
                        @change="selectDedupKeep(gi, item.id)"
                      />
                      <span class="dm-item-body">
                        <span class="dm-item-text">{{ item.content }}</span>
                        <span class="dm-item-meta">
                          ID {{ item.id }} · 创建 {{ formatDate(item.created_at, 'datetime') }} · 更新 {{ formatDate(item.updated_at, 'datetime') }}
                        </span>
                        <span v-if="item.answers && item.answers.length" class="dm-item-answers">答案：{{ item.answers.join(' / ') }}</span>
                      </span>
                      <span class="dm-item-flag" :class="dedupSelections[gi] === item.id ? 'is-ok' : 'is-danger'">
                        {{ dedupSelections[gi] === item.id ? '保留' : '移除' }}
                      </span>
                    </label>
                  </li>
                </ul>
              </article>
            </div>
          </div>
          <div v-else-if="dedupLoading" class="dm-empty">
            <p class="dm-empty-t">正在扫描重复题目…</p>
          </div>
          <div v-else class="dm-empty">
            <p class="dm-empty-t">还没有重复题数据</p>
            <p class="dm-sub">点击「扫描重复题目」开始检测。</p>
          </div>
        </div>
      </div>
    </section>

    <ImportCategoryDialog
      v-if="showCategoryDialog"
      :categories="importCategories"
      :localCategories="categories"
      :totalQuestions="pendingQuestions?.length || 0"
      @confirm="onCategoryConfirmed"
      @cancel="onCategoryCancelled"
    />

    <ImportResultDialog
      v-if="showResultDialog"
      :duplicates="resultDuplicates"
      :conflicts="resultConflicts"
      :importSummary="importSummary"
      @close="closeResultDialog"
      @resolved="closeResultDialog"
    />

    <div v-if="showUploadDialog" class="dm-modal" @click.self="cancelUpload">
      <div class="dm-modal-panel">
        <h3 class="dm-modal-title">自定义数据库名称</h3>
        <p class="dm-modal-sub">
          上传成功后将自动切换到该数据库。文件名为 <b>{{ pendingDbFile?.name }}</b>
        </p>
        <div class="dm-modal-body">
          <label class="dm-label">自定义名称</label>
          <input
            v-model="uploadCustomName"
            type="text"
            class="input-field"
            placeholder="留空则使用原文件名"
            @keyup.enter="confirmUpload"
          />
          <p class="dm-modal-hint">将保存为 {{ uploadCustomName || (pendingDbFile?.name || "database.db") }}.db</p>
        </div>
        <div class="dm-modal-actions">
          <button type="button" class="btn-secondary dm-btn" @click="cancelUpload">取消</button>
          <button type="button" class="btn-primary dm-btn" @click="confirmUpload">确认上传</button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* 结构性色彩全部走 --theme-*，只给危险/成功两类语义保留固定色相，
   并压低饱和度与面积，保证 6 套主题 × 亮暗同时成立。 */
.dm-page {
  --dm-mono: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
  --dm-line: color-mix(in srgb, var(--theme-border) 82%, transparent);
  --dm-soft: color-mix(in srgb, var(--theme-text) 5%, transparent);
  --dm-soft-2: color-mix(in srgb, var(--theme-text) 9%, transparent);
  --dm-accent-10: color-mix(in srgb, var(--theme-accent) 12%, transparent);
  --dm-accent-soft: color-mix(in srgb, var(--theme-accent) 18%, transparent);
  --danger: #b4453a;
  --danger-soft: color-mix(in srgb, #b4453a 12%, transparent);
  --ok: #2f7d5d;
  --ok-soft: color-mix(in srgb, #2f7d5d 12%, transparent);
  display: flex;
  flex-direction: column;
  gap: 1.75rem;
  padding-bottom: 3.5rem;
}

.dark .dm-page {
  --dm-line: color-mix(in srgb, var(--theme-border) 110%, transparent);
  --danger: #d9695c;
  --danger-soft: color-mix(in srgb, #d9695c 16%, transparent);
  --ok: #58b98d;
  --ok-soft: color-mix(in srgb, #58b98d 16%, transparent);
}

/* ---------- PageHeader 里的当前库状态胶囊 ---------- */
.dm-live {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  max-width: 15rem;
  padding: 0.3rem 0.65rem;
  border: 1px solid var(--dm-line);
  border-radius: 999px;
  background: var(--theme-surface);
  font-size: 0.72rem;
  line-height: 1;
}

.dm-live-dot {
  flex: 0 0 auto;
  width: 0.42rem;
  height: 0.42rem;
  border-radius: 50%;
  background: var(--theme-muted);
}

.dm-live.is-live .dm-live-dot {
  background: var(--ok);
  animation: dmPulse 2.8s ease-out infinite;
}

.dm-live.is-busy .dm-live-dot {
  background: var(--theme-accent);
  animation: dmPulse 1.2s ease-out infinite;
}

.dm-live-k {
  flex: 0 0 auto;
  color: var(--theme-muted);
}

.dm-live-v {
  min-width: 0;
  overflow: hidden;
  font-family: var(--dm-mono);
  font-size: 0.7rem;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@keyframes dmPulse {
  0% {
    box-shadow: 0 0 0 0 var(--dm-accent-soft);
  }
  70% {
    box-shadow: 0 0 0 5px transparent;
  }
  100% {
    box-shadow: 0 0 0 0 transparent;
  }
}

/* ---------- 控制台面板（Hero 与各章节共用） ---------- */
.dm-console {
  position: relative;
  isolation: isolate;
  padding: 1.35rem;
  border: 1px solid var(--dm-line);
  border-radius: 12px;
  background: linear-gradient(180deg, color-mix(in srgb, var(--theme-text) 3%, var(--theme-surface)), var(--theme-surface));
  transition: border-color 0.3s ease, box-shadow 0.3s ease;
}

.dm-console > :not(.dm-console-fx) {
  position: relative;
  z-index: 1;
}

/* 面板内有输入框获得焦点时抬高层级到 30，
   让「批量删除」里的题型下拉浮在后续面板之上；层级导航导轨（SectionNav）高于此值。 */
.dm-console:focus-within {
  z-index: 30;
}

/* 装饰层统一收进一个圆角裁剪容器：网格、扫描光、跟随光斑
   都被限制在面板圆角之内，面板本体仍可向外投影。 */
.dm-console-fx {
  position: absolute;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  border-radius: inherit;
  pointer-events: none;
}

.dm-console::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  /* 光斑铺满面板，所以自己跟随圆角，四角才不会露出方形边缘。 */
  border-radius: inherit;
  pointer-events: none;
  background: radial-gradient(220px circle at var(--mx, 50%) var(--my, 0%), var(--dm-accent-soft), transparent 70%);
  opacity: 0;
  transition: opacity 0.35s ease;
}

.dm-console.is-lit::after {
  opacity: 1;
}

.dm-console.is-located {
  animation: dmLocate 1s ease-out;
}

@keyframes dmLocate {
  0% {
    border-color: color-mix(in srgb, var(--theme-accent) 60%, transparent);
    box-shadow: 0 0 0 3px var(--dm-accent-10);
  }
  100% {
    border-color: var(--dm-line);
    box-shadow: 0 0 0 0 transparent;
  }
}

.dm-hero-grid {
  position: absolute;
  inset: 0;
  background-image: linear-gradient(to right, var(--dm-soft) 1px, transparent 1px),
    linear-gradient(to bottom, var(--dm-soft) 1px, transparent 1px);
  background-size: 44px 44px;
  -webkit-mask-image: radial-gradient(120% 90% at 16% 0%, #000 10%, transparent 76%);
  mask-image: radial-gradient(120% 90% at 16% 0%, #000 10%, transparent 76%);
}

.dm-hero-scan {
  position: absolute;
  top: 0;
  right: 0;
  left: 0;
  height: 45%;
  background: linear-gradient(180deg, transparent, var(--dm-accent-10), transparent);
  animation: dmScan 9s cubic-bezier(0.45, 0, 0.55, 1) infinite;
}

@keyframes dmScan {
  0% {
    transform: translateY(-130%);
    opacity: 0;
  }
  18% {
    opacity: 1;
  }
  82% {
    opacity: 1;
  }
  100% {
    transform: translateY(190%);
    opacity: 0;
  }
}

.dm-hero-lamp {
  position: absolute;
  top: 0;
  left: 0;
  width: 220px;
  height: 220px;
  border-radius: 50%;
  background: radial-gradient(circle, var(--dm-accent-soft), transparent 68%);
  filter: blur(14px);
  opacity: 0;
  transition: opacity 0.45s ease;
  will-change: transform;
}

.dm-hero.is-lit .dm-hero-lamp {
  opacity: 1;
}

/* ---------- Hero 身份区 ---------- */
.dm-hero {
  padding: 1.5rem;
}

.dm-hero-top {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 1.1rem;
}

.dm-kicker {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0;
  font-family: var(--dm-mono);
  font-size: 0.64rem;
  letter-spacing: 0.18em;
  color: var(--theme-muted);
}

.dm-kicker i {
  font-style: normal;
  color: var(--theme-accent);
}

.dm-hero-name {
  margin: 0.5rem 0 0;
  font-size: clamp(1.35rem, 3.2vw, 1.85rem);
  font-weight: 600;
  letter-spacing: -0.01em;
  line-height: 1.2;
  overflow-wrap: anywhere;
}

.dm-hero-path {
  margin: 0.4rem 0 0;
  max-width: 46rem;
  overflow-wrap: anywhere;
  font-family: var(--dm-mono);
  font-size: 0.7rem;
  color: var(--theme-muted);
}

.dm-hero-facts {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1.75rem;
  margin: 1rem 0 0;
}

.dm-fact dt {
  font-size: 0.62rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--theme-muted);
}

.dm-fact dd {
  margin: 0.18rem 0 0;
  font-family: var(--dm-mono);
  font-size: 0.82rem;
  font-variant-numeric: tabular-nums;
}

.dm-gauge {
  position: relative;
  justify-self: start;
  width: 132px;
  height: 132px;
}

.dm-ring {
  display: block;
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.dm-ring-bg {
  fill: none;
  stroke: var(--dm-soft-2);
  stroke-width: 7;
}

.dm-ring-val {
  fill: none;
  stroke: var(--theme-accent);
  stroke-width: 7;
  stroke-linecap: round;
  transition: stroke-dashoffset 0.95s cubic-bezier(0.22, 1, 0.36, 1);
}

.dm-gauge-read {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.1rem;
  margin: 0;
}

.dm-gauge-read b {
  font-size: 1.4rem;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.dm-gauge-read b i {
  margin-left: 0.08rem;
  font-style: normal;
  font-size: 0.68rem;
  color: var(--theme-muted);
}

.dm-gauge-read span {
  font-size: 0.64rem;
  letter-spacing: 0.08em;
  color: var(--theme-muted);
}

/* ---------- 指标条 ---------- */
.dm-stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.55rem 0.9rem;
  margin: 1.25rem 0 0;
  padding: 0;
  list-style: none;
}

.dm-hero .dm-stats {
  margin-top: 1.4rem;
  padding-top: 1.1rem;
  border-top: 1px solid var(--dm-line);
}

.dm-stat {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
}

.dm-num {
  font-size: 1.5rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
  line-height: 1.1;
}

.dm-num-sm {
  font-variant-numeric: tabular-nums;
  color: var(--danger);
}

.dm-stat-k {
  font-size: 0.68rem;
  letter-spacing: 0.04em;
  color: var(--theme-muted);
}

/* ---------- 章节骨架 ---------- */
.dm-sec {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  scroll-margin-top: 4.5rem;
}

.dm-subset {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
}

.dm-console-plain {
  padding: 1.1rem;
}

.dm-grid-a {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0.9rem;
}

.dm-card {
  min-width: 0;
  padding: 0.9rem;
  border: 1px solid var(--dm-line);
  border-radius: 10px;
  background: color-mix(in srgb, var(--theme-text) 2%, var(--theme-surface));
  transition: border-color 0.3s ease, box-shadow 0.3s ease;
}

/* 悬停只改变描边与投影：transform 整条留给 GSAP 入场动画，
   一个元素上的位移由单一书写者负责，落位后才稳定。 */
.dm-card:hover {
  border-color: color-mix(in srgb, var(--theme-accent) 32%, var(--theme-border));
  box-shadow: 0 6px 18px -14px color-mix(in srgb, var(--theme-text) 40%, transparent);
}

.dm-card-head,
.dm-block-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.6rem;
  margin-bottom: 0.6rem;
}

.dm-h {
  margin: 0;
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.01em;
}

.dm-sub {
  margin: 0;
  font-size: 0.7rem;
  line-height: 1.5;
  color: var(--theme-muted);
}

.dm-count,
.dm-group-count {
  flex: 0 0 auto;
  font-family: var(--dm-mono);
  font-size: 0.66rem;
  color: var(--theme-muted);
}

.dm-tag {
  display: inline-flex;
  align-items: center;
  padding: 0.08rem 0.4rem;
  border: 1px solid var(--dm-line);
  border-radius: 6px;
  font-family: var(--dm-mono);
  font-size: 0.62rem;
  font-style: normal;
  color: var(--theme-muted);
}

.dm-tag.is-live {
  color: var(--ok);
  border-color: color-mix(in srgb, var(--ok) 38%, transparent);
  background: var(--ok-soft);
}

.dm-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.1rem 0.45rem;
  border: 1px solid var(--dm-line);
  border-radius: 999px;
  background: var(--dm-soft);
  color: var(--theme-muted);
  font-family: var(--dm-mono);
  font-size: 0.64rem;
  letter-spacing: 0.06em;
}

.dm-badge.is-live {
  color: var(--ok);
  border-color: color-mix(in srgb, var(--ok) 40%, transparent);
  background: var(--ok-soft);
}

.dm-badge.is-busy,
.dm-badge.is-caution {
  color: color-mix(in srgb, var(--theme-accent) 80%, var(--theme-text));
  border-color: color-mix(in srgb, var(--theme-accent) 42%, transparent);
  background: var(--dm-accent-10);
}

.dm-badge.is-danger {
  color: var(--danger);
  border-color: color-mix(in srgb, var(--danger) 36%, transparent);
  background: var(--danger-soft);
}

.dm-file-name {
  margin: 0;
  overflow: hidden;
  font-family: var(--dm-mono);
  font-size: 0.9rem;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dm-file-path {
  margin: 0.2rem 0 0;
  overflow: hidden;
  font-family: var(--dm-mono);
  font-size: 0.68rem;
  color: var(--theme-muted);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dm-facts-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.5rem 0.9rem;
  margin: 0.85rem 0 0;
  padding: 0.75rem 0 0;
  border-top: 1px dashed var(--dm-line);
  list-style: none;
}

.dm-facts-row li {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.4rem;
  font-size: 0.7rem;
  color: var(--theme-muted);
}

.dm-facts-row b {
  font-family: var(--dm-mono);
  font-weight: 500;
  color: var(--theme-text);
  font-variant-numeric: tabular-nums;
}

/* ---------- 近期数据库 ---------- */
.dm-recent {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.dm-recent-item {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  min-width: 0;
  padding: 0.5rem 0.5rem 0.5rem 0.6rem;
  border: 1px solid transparent;
  border-radius: 9px;
  cursor: pointer;
  outline: none;
  transition: background-color 0.25s ease, border-color 0.25s ease, transform 0.25s ease;
}

.dm-recent-item:hover,
.dm-recent-item:focus-visible {
  border-color: var(--dm-line);
  background: var(--dm-soft);
  transform: translateX(2px);
}

.dm-recent-item.is-current {
  border-color: color-mix(in srgb, var(--ok) 28%, transparent);
  background: color-mix(in srgb, var(--ok) 6%, transparent);
}

.dm-recent-ico {
  display: inline-flex;
  flex: 0 0 auto;
  color: var(--theme-muted);
}

.dm-recent-text {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
  gap: 0.12rem;
}

.dm-recent-name {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  overflow: hidden;
  font-size: 0.78rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dm-recent-path {
  overflow: hidden;
  font-family: var(--dm-mono);
  font-size: 0.64rem;
  color: var(--theme-muted);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dm-recent-del {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  border: 1px solid transparent;
  border-radius: 6px;
  background: none;
  color: var(--theme-muted);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.25s ease, color 0.25s ease, border-color 0.25s ease;
}

.dm-recent-item:hover .dm-recent-del,
.dm-recent-del:focus-visible {
  opacity: 1;
}

.dm-recent-del:hover {
  color: var(--danger);
  border-color: color-mix(in srgb, var(--danger) 40%, transparent);
}

.dm-more {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  align-self: flex-start;
  margin-top: 0.5rem;
  padding: 0.1rem 0;
  border: 0;
  background: none;
  color: var(--theme-muted);
  font-size: 0.7rem;
  cursor: pointer;
  transition: color 0.25s ease;
}

.dm-more:hover {
  color: var(--theme-accent);
}

/* ---------- 条形统计 ---------- */
.dm-grid2 {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 1.1rem;
  margin-top: 1.1rem;
}

.dm-block {
  min-width: 0;
}

.dm-bars {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.dm-row {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  min-width: 0;
}

.dm-row-type {
  flex: 0 0 auto;
  width: 5.25rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dm-row-idx {
  flex: 0 0 1.5rem;
  font-family: var(--dm-mono);
  font-size: 0.66rem;
  color: var(--theme-muted);
}

.dm-row-name {
  flex: 0 0 6rem;
  overflow: hidden;
  font-size: 0.78rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dm-track {
  position: relative;
  flex: 1 1 auto;
  min-width: 1.5rem;
  height: 8px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--dm-soft);
}

.dm-fill {
  display: block;
  width: 0;
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--theme-accent), color-mix(in srgb, var(--theme-accent) 45%, var(--theme-text)));
}

.dm-fill.is-alt {
  background: linear-gradient(90deg, color-mix(in srgb, var(--theme-accent) 55%, var(--theme-muted)), color-mix(in srgb, var(--theme-muted) 80%, var(--theme-text)));
}

.dm-row-v {
  flex: 0 0 2.5rem;
  font-family: var(--dm-mono);
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

/* ---------- 表单与胶囊 ---------- */
.dm-field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  min-width: 0;
}

.dm-label {
  font-size: 0.68rem;
  letter-spacing: 0.06em;
  color: var(--theme-muted);
}

/* 题型下拉：浏览器原生箭头在不同系统下宽度与配色都不受控，
   关掉 appearance 并预留出右侧 2rem，箭头由 ::after 用描边画。 */
.dm-select {
  position: relative;
  display: block;
  min-width: 0;
}

.dm-select select {
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  width: 100%;
  padding-right: 2rem;
}

.dm-select::after {
  content: '';
  position: absolute;
  top: 50%;
  right: 0.85rem;
  width: 6px;
  height: 6px;
  margin-top: -4px;
  border-right: 1.5px solid var(--theme-muted);
  border-bottom: 1.5px solid var(--theme-muted);
  transform: rotate(45deg);
  transform-origin: 50% 50%;
  pointer-events: none;
  transition: border-color 0.2s ease;
}

.dm-select:focus-within::after {
  border-color: var(--theme-accent);
}

.dm-form {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0.75rem;
}

.dm-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.dm-chip {
  padding: 0.3rem 0.7rem;
  border: 1px solid var(--dm-line);
  border-radius: 999px;
  background: transparent;
  color: var(--theme-muted);
  font-size: 0.74rem;
  cursor: pointer;
  transition: color 0.25s ease, border-color 0.25s ease, background-color 0.25s ease, transform 0.25s ease;
}

.dm-chip:hover {
  color: var(--theme-text);
  border-color: color-mix(in srgb, var(--theme-accent) 45%, var(--theme-border));
  transform: translateY(-1px);
}

.dm-chip.is-on {
  color: var(--theme-text);
  border-color: color-mix(in srgb, var(--theme-accent) 60%, transparent);
  background: var(--dm-accent-10);
}

.dm-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  white-space: nowrap;
}

.dm-file-label {
  cursor: pointer;
}

.dm-endrow {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  margin-top: 0.9rem;
}

/* ---------- 导入 ---------- */
.dm-import {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.dm-drop {
  position: relative;
  padding: 0.35rem;
  border: 1px dashed var(--dm-line);
  border-radius: 10px;
  /* 投递井有自己比面板更暗一档的底色，因此粘贴区读起来是嵌进面板的凹槽，
     边界与内容区之间始终有可见的层级差。 */
  background:
    linear-gradient(180deg,
      color-mix(in srgb, var(--theme-text) 5%, transparent),
      color-mix(in srgb, var(--theme-text) 2.5%, transparent)),
    color-mix(in srgb, var(--theme-bg) 82%, var(--theme-surface));
  transition: border-color 0.25s ease, background-color 0.25s ease, box-shadow 0.25s ease;
}

/* 焦点提示由整口井统一画（见下方 :focus-within），
   键盘操作时焦点落点只有一圈描边，位置清晰。 */
.dm-drop:focus-within {
  border-color: color-mix(in srgb, var(--theme-accent) 45%, var(--theme-border));
  box-shadow: 0 0 0 2px var(--dm-accent-10);
}

.dm-drop.is-dragging {
  border-color: color-mix(in srgb, var(--theme-accent) 65%, transparent);
  background:
    linear-gradient(180deg,
      color-mix(in srgb, var(--theme-accent) 14%, transparent),
      color-mix(in srgb, var(--theme-accent) 8%, transparent)),
    color-mix(in srgb, var(--theme-bg) 82%, var(--theme-surface));
  box-shadow: 0 0 0 3px var(--dm-accent-10);
}

/* 拖拽态点亮四个角的 L 形短标：四角各自展开一下，
   读起来是「对准了投放框」，落点信息集中在角上。 */
.dm-drop-corner {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.25s ease;
}

.dm-drop-tick {
  position: absolute;
  width: 11px;
  height: 11px;
  background-image: linear-gradient(to right,
      color-mix(in srgb, var(--theme-accent) 70%, transparent) 100%, transparent 100%),
    linear-gradient(to bottom,
      color-mix(in srgb, var(--theme-accent) 70%, transparent) 100%, transparent 100%);
  background-size: 11px 1px, 1px 11px;
  background-repeat: no-repeat;
  opacity: 0;
  transform: scale(0.7);
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.dm-drop-tick-tl {
  top: 4px;
  left: 4px;
  background-position: left top, left top;
}

.dm-drop-tick-tr {
  top: 4px;
  right: 4px;
  background-position: right top, right top;
}

.dm-drop-tick-bl {
  bottom: 4px;
  left: 4px;
  background-position: left bottom, left top;
}

.dm-drop-tick-br {
  bottom: 4px;
  right: 4px;
  background-position: right bottom, right top;
}

.dm-drop.is-dragging .dm-drop-corner {
  opacity: 1;
}

.dm-drop.is-dragging .dm-drop-tick {
  opacity: 1;
  transform: none;
}

.dm-drop.is-dragging .dm-drop-tick-tr,
.dm-drop.is-dragging .dm-drop-tick-bl {
  transition-delay: 0.04s;
}

.dm-drop.is-dragging .dm-drop-tick-br {
  transition-delay: 0.09s;
}

.dm-textarea.input-field {
  min-height: 9rem;
  padding: 0.65rem;
  border: 0;
  background: transparent;
  color: var(--theme-text);
  font-family: var(--dm-mono);
  font-size: 0.72rem;
  line-height: 1.6;
  resize: vertical;
}

/* 焦点由 .dm-drop:focus-within 统一表达：整口井是唯一的焦点载体 */
.dm-textarea.input-field:focus {
  box-shadow: none;
}

.dm-drop-hint {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  margin: 0;
  padding: 0.15rem 0.5rem 0.35rem;
  font-size: 0.68rem;
  color: var(--theme-muted);
}

/* ---------- 去重 ---------- */
.dm-dedup {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
}

.dm-dedup-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  padding-bottom: 0.7rem;
  border-bottom: 1px solid var(--dm-line);
}

.dm-dedup-acts {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

.dm-link {
  padding: 0;
  border: 0;
  background: none;
  color: var(--theme-muted);
  font-size: 0.72rem;
  text-decoration: underline;
  text-decoration-color: color-mix(in srgb, var(--theme-muted) 45%, transparent);
  text-underline-offset: 3px;
  cursor: pointer;
  transition: color 0.25s ease;
}

.dm-link:hover {
  color: var(--theme-accent);
}

.dm-groups {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
}

.dm-group {
  padding: 0.75rem;
  border: 1px solid var(--dm-line);
  border-radius: 10px;
  background: color-mix(in srgb, var(--theme-text) 2%, var(--theme-surface));
}

.dm-group-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
}

.dm-group-content {
  margin: 0.5rem 0 0;
  font-size: 0.8rem;
  line-height: 1.6;
  color: var(--theme-text);
}

.dm-items {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin: 0.6rem 0 0;
  padding: 0;
  list-style: none;
}

.dm-item {
  border: 1px solid var(--dm-line);
  border-radius: 9px;
  background: var(--theme-surface);
  transition: border-color 0.25s ease, background-color 0.25s ease;
}

.dm-item.is-keep {
  border-color: color-mix(in srgb, var(--ok) 42%, var(--theme-border));
  background: var(--ok-soft);
}

.dm-item-main {
  display: flex;
  align-items: flex-start;
  gap: 0.55rem;
  padding: 0.5rem 0.65rem;
  cursor: pointer;
}

.dm-radio {
  flex: 0 0 auto;
  margin-top: 0.22rem;
  accent-color: var(--theme-accent);
}

.dm-item-body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
  gap: 0.18rem;
}

.dm-item-text {
  font-size: 0.76rem;
  line-height: 1.55;
  overflow-wrap: anywhere;
}

.dm-item-meta {
  font-family: var(--dm-mono);
  font-size: 0.62rem;
  color: var(--theme-muted);
}

.dm-item-answers {
  font-size: 0.66rem;
  color: var(--theme-muted);
}

.dm-item-flag {
  flex: 0 0 auto;
  padding: 0.05rem 0.4rem;
  border: 1px solid var(--dm-line);
  border-radius: 999px;
  font-size: 0.62rem;
}

.dm-item-flag.is-ok {
  color: var(--ok);
  border-color: color-mix(in srgb, var(--ok) 40%, transparent);
  background: var(--ok-soft);
}

.dm-item-flag.is-danger {
  color: var(--danger);
  border-color: color-mix(in srgb, var(--danger) 32%, transparent);
  background: var(--danger-soft);
}

/* ---------- 空状态 ---------- */
.dm-empty {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.4rem;
  padding: 1.4rem 0.2rem;
}

.dm-empty-t {
  margin: 0;
  font-size: 0.84rem;
  font-weight: 500;
}

/* ---------- 上传命名对话框 ---------- */
.dm-modal {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgb(0 0 0 / 0.5);
  backdrop-filter: blur(4px);
}

.dm-modal-panel {
  width: 100%;
  max-width: 26rem;
  padding: 1.25rem;
  border: 1px solid var(--dm-line);
  border-radius: 12px;
  background: var(--theme-surface);
  box-shadow: 0 24px 60px -30px rgb(0 0 0 / 0.6);
}

.dm-modal-title {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
}

.dm-modal-sub {
  margin: 0.4rem 0 0;
  font-size: 0.72rem;
  line-height: 1.6;
  color: var(--theme-muted);
}

.dm-modal-sub b {
  font-family: var(--dm-mono);
  font-weight: 500;
}

.dm-modal-body {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-top: 1rem;
}

.dm-modal-hint {
  margin: 0;
  overflow-wrap: anywhere;
  font-family: var(--dm-mono);
  font-size: 0.66rem;
  color: var(--theme-muted);
}

.dm-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1.1rem;
}

/* ---------- 断点 ---------- */
@media (min-width: 640px) {
  .dm-console {
    padding: 1.5rem;
  }

  .dm-stats {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .dm-form {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .dm-facts-row {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .dm-recent-item {
    padding-right: 0.4rem;
  }
}

@media (min-width: 1024px) {
  .dm-page {
    gap: 2rem;
  }

  .dm-hero-top {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;
    gap: 1.5rem;
  }

  .dm-gauge {
    justify-self: end;
  }

  .dm-stats {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }

  .dm-stats-4 {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .dm-grid-a {
    grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
  }

  .dm-grid2 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .dm-form {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

/* ---------- 减弱动效：只保留静态可见态 ---------- */
@media (prefers-reduced-motion: reduce) {
  .dm-page *,
  .dm-page *::before,
  .dm-page *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
    transition-delay: 0s !important;
  }

  .dm-hero-scan,
  .dm-hero-lamp {
    display: none;
  }

  .dm-chip:hover,
  .dm-recent-item:hover {
    transform: none;
  }
}
</style>
