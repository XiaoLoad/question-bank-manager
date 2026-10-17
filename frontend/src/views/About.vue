<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { marked } from 'marked'
import avatarUrl from '@/assets/images/test.jpg'
import Skeleton from '@/components/Skeleton.vue'
import { useApi } from '@/composables/useApi'

defineOptions({ name: 'About' })

const api = useApi()

const appVersion = ref('v1.0.0')
const changelog = ref('')
const changelogFailed = ref(false)
const loading = ref(true)
const showChangelog = ref(false)

const renderedChangelog = computed(() => {
  if (!changelog.value) return ''
  return marked.parse(changelog.value)
})

const roles = ['独立开发者', '开源爱好者', '工具控']
const roleIndex = ref(0)
let roleTimer = null

const reduceMotion = ref(false)
const heroRef = ref(null)
let revealObserver = null
let spotlightFrame = 0

const beliefs = ['专注实用工具开发', '热爱开源', '追求极致体验']

const currentYear = new Date().getFullYear()

const techStack = [
  { name: 'Vue 3', color: '#4FC08D', path: 'M24,1.61H14.06L12,5.16,9.94,1.61H0L12,22.39ZM12,14.08,5.16,2.23H9.59L12,6.41l2.41-4.18h4.43Z' },
  { name: 'Vite', color: '#646CFF', path: 'M12,1.55L3.06,18.13,4.58,18.72,12,5.4l7.42,13.32,1.52-.59ZM12,14.23,8.17,7.72H15.83Z' },
  { name: 'Node.js', color: '#339933', path: 'M11.998,24c-0.321,0-0.641-0.084-0.922-0.247l-2.936-1.737c-0.438-0.245-0.224-0.332-0.08-0.383c0.585-0.203,0.703-0.25,1.328-0.604c0.065-0.037,0.151-0.023,0.218,0.017l2.256,1.339c0.082,0.045,0.197,0.045,0.272,0l8.795-5.076c0.082-0.047,0.134-0.141,0.134-0.238V6.921c0-0.099-0.053-0.192-0.137-0.242l-8.791-5.072c-0.081-0.047-0.189-0.047-0.271,0L3.075,6.68C2.99,6.729,2.936,6.825,2.936,6.921v10.15c0,0.097,0.054,0.189,0.135,0.235l2.409,1.392c1.307,0.654,2.108-0.116,2.108-0.89V7.787c0-0.142,0.114-0.253,0.256-0.253h1.115c0.139,0,0.255,0.112,0.255,0.253v10.021c0,1.745-0.95,2.745-2.604,2.745c-0.508,0-0.909,0-2.026-0.551L2.28,18.675c-0.57-0.329-0.922-0.945-0.922-1.604V6.921c0-0.659,0.353-1.275,0.922-1.603l8.795-5.082c0.557-0.315,1.296-0.315,1.848,0l8.794,5.082c0.57,0.329,0.924,0.944,0.924,1.603v10.15c0,0.659-0.354,1.273-0.924,1.604l-8.794,5.078C12.643,23.916,12.324,24,11.998,24z' },
  { name: 'Express', color: '#000000', label: 'Ex' },
  { name: 'SQLite', color: '#003B57', path: 'M12.006,2.412c-2.17,0-4.007,0.726-5.264,1.797C5.485,5.281,4.74,6.753,4.74,8.288c0,2.008,1.215,3.596,3.14,4.655c0.605,0.332,1.08,0.613,1.412,0.867c0.224,0.171,0.338,0.301,0.387,0.409c0.048,0.106,0.067,0.268-0.022,0.514c-0.115,0.319-0.493,0.729-1.141,0.729c-0.283,0-0.603-0.059-0.966-0.185c-0.637-0.221-1.361-0.618-2.088-1.237c-0.253,1.695-0.432,3.182-0.432,4.227c0,1.665,0.454,2.532,1.224,2.532c0.55,0,1.082-0.396,1.591-1.183c0.528-0.816,1.073-1.972,1.691-3.466c0.649,1.547,1.379,2.726,2.078,3.525c0.478,0.541,0.928,0.809,1.336,0.809c0.379,0,0.692-0.195,0.91-0.565c0.073-0.125,0.134-0.274,0.184-0.445c0.05-0.173,0.085-0.38,0.107-0.617c0.063-0.725,0.024-1.688-0.123-2.866c-0.145-1.179-0.373-2.536-0.68-3.992c0.647-0.753,1.228-1.613,1.703-2.537C18.241,6.526,18.5,5.18,18.5,4.015c0-1.026-0.341-1.603-0.965-1.603c-0.343,0-0.742,0.183-1.18,0.547C15.856,3.355,15.118,3.7,14.312,3.7c-1.15,0-2.175-0.537-2.853-1.021C10.935,2.292,11.279,2.412,12.006,2.412z' },
  { name: 'TailwindCSS', color: '#06B6D4', path: 'M12.001,4.8c-3.2,0-5.2,1.6-6,4.8c1.2-1.6,2.6-2.2,4.2-1.8c0.913,0.228,1.565,0.89,2.288,1.624C13.666,10.618,15.027,12,18.001,12c3.2,0,5.2-1.6,6-4.8c-1.2,1.6-2.6,2.2-4.2,1.8c-0.913-0.228-1.565-0.89-2.288-1.624C16.337,6.182,14.976,4.8,12.001,4.8zM6.001,12c-3.2,0-5.2,1.6-6,4.8c1.2-1.6,2.6-2.2,4.2-1.8c0.913,0.228,1.565,0.89,2.288,1.624c1.177,1.194,2.538,2.576,5.512,2.576c3.2,0,5.2-1.6,6-4.8c-1.2,1.6-2.6,2.2-4.2,1.8c-0.913-0.228-1.565-0.89-2.288-1.624C10.337,13.382,8.976,12,6.001,12z' },
  { name: 'Pinia', color: '#FFD859', path: 'M13.277.002c-.079-.01-.193.024-.31.09a2.346 2.346 0 0 0-.415.311c-.301.274-.65.68-.985 1.176-.672.99-1.31 2.356-1.485 3.785-.12.977-.154 1.849-.074 2.578a5.878 5.878 0 0 1 1.956-.338c.922 0 1.804.218 2.618.613.197-.637.34-1.395.445-2.246.175-1.429-.1-2.907-.499-4.028a6.695 6.695 0 0 0-.653-1.378 2.296 2.296 0 0 0-.321-.401c-.097-.092-.199-.153-.277-.162zm-6.81 2.965a.603.603 0 0 0-.288.117l-.013.011a.863.863 0 0 0-.177.327c-.051.15-.094.344-.126.565a8.205 8.205 0 0 0-.044 1.637c.08 1.222.397 2.665 1.079 3.769.093.15.193.296.294.442.726-.776 1.567-1.385 2.488-1.768-.1-.79-.06-1.714.066-2.744.038-.31.1-.616.176-.916a6.45 6.45 0 0 0-1.692-1.08 4.575 4.575 0 0 0-1.29-.366 1.805 1.805 0 0 0-.474.006zm11.751 1.789c-.21.003-.442.022-.687.06a5.974 5.974 0 0 0-2.132.76c-.009.146-.019.291-.036.437-.11.888-.258 1.684-.475 2.364.848.468 1.614 1.13 2.267 1.94.823-.85 1.43-2.05 1.787-3.13.187-.57.304-1.1.35-1.514.022-.207.027-.38.017-.51-.01-.133-.042-.206-.04-.202a.35.35 0 0 0-.114-.072 1.516 1.516 0 0 0-.375-.1 3.42 3.42 0 0 0-.562-.033zm-6.254 3.139c-2.014 0-3.83 1.087-5.147 2.834-1.316 1.748-2.131 4.16-2.131 6.807 0 2.65.806 4.258 2.131 5.218C8.132 23.707 9.96 24 11.964 24c2.004 0 3.831-.293 5.147-1.246 1.326-.96 2.133-2.568 2.133-5.218 0-2.647-.816-5.059-2.133-6.806-1.317-1.748-3.134-2.835-5.147-2.835zm-3.297 5.209a1.282 1.282 0 0 1 .292 2.518c.115.094.177.201.164.307-.032.265-.521.424-1.09.354-.571-.07-1.007-.342-.974-.607.024-.198.302-.336.678-.364a1.282 1.282 0 0 1 .93-2.208zm6.284.22a1.282 1.282 0 0 1 .726 2.303c.437.058.757.244.757.466 0 .267-.466.483-1.04.483-.574 0-1.04-.216-1.04-.483 0-.098.063-.189.17-.265a1.282 1.282 0 0 1 .427-2.505zm-6.318.215a.822.822 0 1 0 .028 1.645.822.822 0 0 0-.028-1.645zm6.284.22a.822.822 0 1 0 .027 1.644.822.822 0 0 0-.027-1.644zm-6.543.109a.338.338 0 1 1-.023.677.338.338 0 0 1 .023-.677zm6.284.22a.339.339 0 1 1-.018 0h.018zm-3.91 1.179c.17.252.432.404.808.447.372.043.694-.05.976-.28a.145.145 0 1 1 .183.226c-.344.28-.745.394-1.192.343-.445-.051-.79-.24-1.016-.574a.145.145 0 1 1 .24-.162z' },
  { name: 'Chart.js', color: '#FF6384', rect: true },
  { name: 'SQLite3', color: '#4A90D9', path: 'M12,2L4,5v6.09c0,5.05,3.41,9.76,8,10.91,4.59-1.15,8-5.86,8-10.91V5L12,2z M10.94,15.54l-3.54-3.54 1.41-1.41 2.12,2.12 4.24-4.24 1.41,1.41L10.94,15.54z' },
  { name: 'Git', color: '#F05032', path: 'M23.546 10.93L13.067.452c-.604-.603-1.582-.603-2.188 0L8.708 2.627l2.76 2.76c.645-.215 1.379-.07 1.889.441.516.515.658 1.258.438 1.9l2.66 2.66c.645-.222 1.387-.078 1.9.435.721.72.721 1.884 0 2.604-.72.719-1.886.719-2.604 0-.538-.536-.668-1.321-.4-1.978l-2.48-2.48v6.53c.175.087.339.197.482.338.72.72.72 1.884 0 2.604-.72.72-1.884.72-2.604 0-.72-.72-.72-1.884 0-2.604.18-.18.387-.316.604-.416V8.835c-.217-.1-.424-.236-.604-.416-.543-.54-.676-1.334-.396-1.992L7.576 3.75.45 10.881c-.6.605-.6 1.584 0 2.189l10.48 10.477c.604.604 1.582.604 2.186 0l10.43-10.43c.605-.603.605-1.582 0-2.187' },
  { name: 'Docker', color: '#2496ED', path: 'M13.983 11.078h2.119a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186h-2.119a.185.185 0 00-.185.185v1.888c0 .102.083.185.185.185m-2.954-5.43h2.118a.186.186 0 00.186-.186V3.574a.186.186 0 00-.186-.185h-2.118a.185.185 0 00-.185.185v1.888c0 .102.082.185.185.186m0 2.716h2.118a.187.187 0 00.186-.186V6.29a.186.186 0 00-.186-.185h-2.118a.185.185 0 00-.185.185v1.887c0 .102.082.186.185.186m-2.93 0h2.12a.186.186 0 00.184-.186V6.29a.185.185 0 00-.185-.185H8.1a.185.185 0 00-.185.185v1.887c0 .102.083.186.185.186m-2.964 0h2.119a.186.186 0 00.185-.186V6.29a.186.186 0 00-.185-.185H5.136a.186.186 0 00-.186.185v1.887c0 .102.084.186.186.186m5.893 2.715h2.118a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186h-2.118a.185.185 0 00-.185.185v1.888c0 .102.082.185.185.185m-2.93 0h2.12a.185.185 0 00.184-.185V9.006a.185.185 0 00-.184-.186h-2.12a.185.185 0 00-.184.185v1.888c0 .102.083.185.185.185m-2.964 0h2.119a.185.185 0 00.185-.185V9.006a.185.185 0 00-.184-.186h-2.12a.186.186 0 00-.186.186v1.887c0 .102.084.185.186.185m-2.92 0h2.12a.185.185 0 00.184-.185V9.006a.185.185 0 00-.184-.186h-2.12a.185.185 0 00-.184.185v1.888c0 .102.082.185.185.185M23.763 9.89c-.065-.051-.672-.51-1.954-.51-.338.001-.676.03-1.01.087-.248-1.7-1.653-2.53-1.716-2.566l-.344-.199-.226.327c-.284.438-.49.922-.612 1.43-.23.97-.09 1.882.403 2.661-.595.332-1.55.413-1.744.42H.751a.751.751 0 00-.75.748 11.376 11.376 0 00.692 4.062c.545 1.428 1.355 2.48 2.41 3.124 1.18.723 3.1 1.137 5.275 1.137.983.003 1.963-.086 2.93-.266a12.248 12.248 0 003.823-1.389c.98-.567 1.86-1.288 2.61-2.136 1.252-1.418 1.998-2.997 2.553-4.4h.221c1.372 0 2.215-.549 2.68-1.009.309-.293.55-.65.707-1.046l.098-.288Z' },
]

// 两行技术栈：一行原序、一行倒序，滚动方向相反
const techRows = computed(() => [techStack, [...techStack].reverse()])

const features = [
  { title: '数据管理', desc: '仪表盘、题目 CRUD、分类与回收站、多数据库切换，AI 校验贯穿导入流程。', icon: 'M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4' },
  { title: '在线刷题', desc: '多分类多题型，顺序或随机出题，错题重练与复习模式，进度自动保存。', icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253' },
  { title: '用户系统', desc: '多用户登录、角色权限、分类可见性控制，以及活动日志与外部题库对接。', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z' },
]

const friendLinks = [
  { name: 'Yatori 刷课程序', desc: '自动考试答题系统', url: 'https://github.com/yatori-dev', icon: 'M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z' },
  { name: '题库管理系统', desc: '当前项目开源地址', url: 'https://github.com/XiaoLoad/QuestionBankManagementSystem', icon: 'M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z' },
  { name: 'OCS', desc: '开源网课助手脚本', url: 'https://github.com/ocsjs/ocsjs', icon: 'M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z' },
  { name: '个人博客', desc: '作者的个人博客', url: 'https://lovex2095.top', icon: 'M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9' },
]

const heroActions = [
  { name: 'GitHub', url: 'https://github.com/XiaoLoad', icon: friendLinks[0].icon, primary: true },
  { name: '个人博客', url: friendLinks[3].url, icon: friendLinks[3].icon, primary: false },
]

const statCards = computed(() => [
  { label: '当前版本', value: appVersion.value, hint: '最新发布', accent: true, mono: true },
  { label: '技术栈', value: String(techStack.length), suffix: ' 项', hint: '从界面到数据' },
  { label: '核心模块', value: String(features.length), suffix: ' 个', hint: '管理 · 练习 · 对接' },
  { label: '友情链接', value: String(friendLinks.length), suffix: ' 位', hint: '同行与朋友' },
])

function techInk(tech) {
  if (!tech.color || tech.color === '#000000') return 'var(--theme-text)'
  return `color-mix(in srgb, ${tech.color} 74%, var(--theme-text))`
}

function hostOf(url) {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.replace(/^www\./, '')
    const firstSegment = parsed.pathname.split('/').filter(Boolean)[0]
    return firstSegment ? `${host}/${firstSegment}` : host
  } catch {
    return url
  }
}

// 英雄区光斑跟随指针，仅在精细指针与允许动效时启用
function moveSpotlight(event) {
  if (reduceMotion.value || !heroRef.value) return
  const rect = heroRef.value.getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top
  if (spotlightFrame) cancelAnimationFrame(spotlightFrame)
  spotlightFrame = requestAnimationFrame(() => {
    heroRef.value?.style.setProperty('--mx', `${x}px`)
    heroRef.value?.style.setProperty('--my', `${y}px`)
  })
}

function moveFriendSpot(event) {
  if (reduceMotion.value) return
  const el = event.currentTarget
  const rect = el.getBoundingClientRect()
  el.style.setProperty('--fx', `${event.clientX - rect.left}px`)
  el.style.setProperty('--fy', `${event.clientY - rect.top}px`)
}

// 滚动入场：只触发一次，减少重复计算
function initReveal() {
  const nodes = document.querySelectorAll('[data-reveal]')
  if (!nodes.length) return
  if (reduceMotion.value || typeof IntersectionObserver === 'undefined') {
    nodes.forEach((node) => node.classList.add('is-revealed'))
    return
  }
  revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return
      entry.target.classList.add('is-revealed')
      observer.unobserve(entry.target)
    })
  }, { threshold: 0.08, rootMargin: '0px 0px -6% 0px' })
  nodes.forEach((node) => revealObserver.observe(node))
}

onMounted(async () => {
  reduceMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  roleTimer = setInterval(() => {
    roleIndex.value = (roleIndex.value + 1) % roles.length
  }, 2800)
  initReveal()

  try {
    const data = await api.getSiteSettings()
    appVersion.value = data.app_version || 'v1.0.0'
    if (data.changelog) {
      changelog.value = data.changelog
      changelogFailed.value = false
    } else {
      changelogFailed.value = true
    }
  } catch {
    changelogFailed.value = true
  } finally {
    loading.value = false
  }
})

onBeforeUnmount(() => {
  clearInterval(roleTimer)
  revealObserver?.disconnect()
  if (spotlightFrame) cancelAnimationFrame(spotlightFrame)
})
</script>

<template>
  <div class="about-page max-w-5xl mx-auto">

    <!-- ========== 页头 ========== -->
    <header class="anim-rise flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 sm:gap-4 mb-6 sm:mb-8">
      <div class="min-w-0">
        <h1 class="text-xl sm:text-2xl font-bold text-notion-text dark:text-notion-text-dark">关于</h1>
        <p class="text-xs sm:text-sm text-notion-muted dark:text-notion-muted-dark mt-1">
          认识这个项目，以及把它一点点搭起来的人。
        </p>
      </div>
      <div class="flex items-center gap-2 flex-shrink-0">
        <span class="release-pill">
          <svg class="release-pill-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/>
          </svg>
          <span class="min-w-0 truncate font-mono tabular-nums">{{ appVersion }}</span>
        </span>
      </div>
    </header>

    <!-- ========== 作者 ========== -->
    <section
      ref="heroRef"
      class="hero anim-rise"
      style="--d: 60ms"
      @pointermove="moveSpotlight"
    >
      <div class="hero-grid" aria-hidden="true"></div>
      <div class="hero-spot" aria-hidden="true"></div>
      <span class="hero-orb hero-orb--a" aria-hidden="true"></span>
      <span class="hero-orb hero-orb--b" aria-hidden="true"></span>
      <span class="hero-arc hero-arc--a" aria-hidden="true"></span>
      <span class="hero-arc hero-arc--b" aria-hidden="true"></span>

      <div class="relative z-10 flex flex-col md:flex-row md:items-center gap-7 md:gap-10 px-6 sm:px-9 py-8 sm:py-10">
        <div class="avatar-stage shrink-0 self-center md:self-auto">
          <span class="avatar-halo" aria-hidden="true"></span>
          <span class="avatar-ring" aria-hidden="true"></span>
          <span class="avatar-ring avatar-ring--soft" aria-hidden="true"></span>
          <img :src="avatarUrl" alt="派大星的头像" class="avatar-img" />
          <span class="avatar-badge" aria-hidden="true">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"/>
            </svg>
          </span>
        </div>

        <div class="min-w-0 flex-1 text-center md:text-left">
          <div class="flex items-center justify-center md:justify-start gap-2.5 flex-wrap">
            <h2 class="text-2xl sm:text-[28px] font-bold tracking-tight text-notion-text dark:text-notion-text-dark">派大星</h2>
            <span class="author-badge">作者</span>
          </div>

          <p class="mt-2.5 text-sm sm:text-[15px] text-notion-muted dark:text-notion-muted-dark">
            是一名
            <span class="role-slot">
              <Transition name="role" mode="out-in">
                <span :key="roleIndex" class="role-text">{{ roles[roleIndex] }}</span>
              </Transition>
            </span>
          </p>

          <p class="hero-bio">
            相信好用的工具应该安静、可靠、顺手——于是把日常里重复的部分，慢慢写成了一套系统。
          </p>

          <div class="mt-5 flex flex-wrap items-center justify-center md:justify-start gap-2">
            <a
              v-for="action in heroActions"
              :key="action.name"
              :href="action.url"
              target="_blank"
              rel="noopener"
              class="hero-action"
              :class="{ 'hero-action--primary': action.primary }"
            >
              <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path :d="action.icon" />
              </svg>
              <span>{{ action.name }}</span>
              <svg class="action-arrow" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 17L17 7M17 7H8M17 7v9"/>
              </svg>
            </a>
          </div>

          <div class="mt-5 flex flex-wrap items-center justify-center md:justify-start gap-1.5 lg:hidden">
            <span v-for="belief in beliefs" :key="belief" class="belief-chip">{{ belief }}</span>
          </div>
        </div>

        <div class="hero-meta hidden lg:flex flex-col gap-3.5 w-52 shrink-0">
          <p class="hero-meta-title">信条</p>
          <div v-for="belief in beliefs" :key="belief" class="belief-item">
            <span class="belief-dot" aria-hidden="true"></span>
            <span>{{ belief }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- ========== 数据 ========== -->
    <div class="stats-strip anim-rise" style="--d: 140ms">
      <div v-for="card in statCards" :key="card.label" class="stat-cell">
        <div class="flex items-center justify-between gap-2">
          <p class="stat-label">{{ card.label }}</p>
          <span class="stat-mark" :class="{ 'stat-mark--accent': card.accent }" aria-hidden="true"></span>
        </div>
        <p
          class="stat-value"
          :class="[
            card.mono ? 'stat-value--mono' : '',
            card.accent ? 'text-notion-accent dark:text-notion-accent-dark' : 'text-notion-text dark:text-notion-text-dark',
          ]"
          :title="card.value"
        >
          {{ card.value }}<span v-if="card.suffix" class="stat-suffix">{{ card.suffix }}</span>
        </p>
        <p class="stat-hint">{{ card.hint }}</p>
      </div>
    </div>

    <!-- ========== 01 关于项目 ========== -->
    <section class="section" data-reveal>
      <div class="sec-head">
        <span class="sec-index">01</span>
        <h2 class="text-base font-semibold text-notion-text dark:text-notion-text-dark">关于项目</h2>
        <span class="sec-line" aria-hidden="true"></span>
        <p class="sec-hint hidden sm:block">从刷课题库维护到独立系统</p>
      </div>

      <div class="card p-6 sm:p-8">
        <div class="grid gap-8 lg:grid-cols-[minmax(0,210px)_minmax(0,1fr)] lg:gap-12">
          <div class="lg:border-r lg:border-notion-border dark:lg:border-notion-border-dark lg:pr-10">
            <p class="story-lead">一个从「够用」开始，被真实需求推着长大的项目。</p>

            <div class="mt-6 flex items-center gap-3">
              <img
                :src="avatarUrl"
                alt=""
                class="w-9 h-9 rounded-full object-cover ring-1 ring-notion-border dark:ring-notion-border-dark"
              />
              <div>
                <p class="text-xs font-semibold text-notion-text dark:text-notion-text-dark">派大星</p>
                <p class="mt-0.5 text-[10.5px] text-notion-muted dark:text-notion-muted-dark">作者 · 维护者</p>
              </div>
            </div>

            <div class="mt-6 flex flex-wrap gap-1.5">
              <span class="meta-chip">MIT License</span>
              <span class="meta-chip">Docker 部署</span>
              <span class="meta-chip">多用户</span>
            </div>
          </div>

          <ol class="timeline">
            <li class="timeline-item">
              <span class="timeline-dot" aria-hidden="true"></span>
              <div class="timeline-head">
                <span class="timeline-index">01</span>
                <h3 class="timeline-title">起点</h3>
                <span class="timeline-tag">缘起</span>
              </div>
              <p class="timeline-text">
                题库管理系统是为
                <a href="https://github.com/yatori-dev/yatori-go-console" target="_blank" rel="noopener" class="inline-link">yatori-go-console</a>
                刷课程序开发的配套管理工具。最初只是为了解决刷课题库的可视化维护需求，随着功能扩展，逐渐发展为一个独立完整的管理系统。
              </p>
            </li>
            <li class="timeline-item">
              <span class="timeline-dot" aria-hidden="true"></span>
              <div class="timeline-head">
                <span class="timeline-index">02</span>
                <h3 class="timeline-title">生长</h3>
                <span class="timeline-tag">迭代</span>
              </div>
              <p class="timeline-text">
                从题目 CRUD 和分类管理起步，逐步加入在线刷题、多用户系统、AI 答案校验、外部题库对接等模块。整个开发过程大量借助 AI 辅助编程——从架构设计、代码编写到 UI 打磨，AI 深度参与其中。
              </p>
            </li>
            <li class="timeline-item">
              <span class="timeline-dot" aria-hidden="true"></span>
              <div class="timeline-head">
                <span class="timeline-index">03</span>
                <h3 class="timeline-title">底座</h3>
                <span class="timeline-tag">技术</span>
              </div>
              <p class="timeline-text">
                系统基于 Vue 3 + Node.js + SQLite 构建，与刷课软件共享同一个数据库文件，所有修改实时生效，无需手动同步。支持多数据库管理、移动端适配与 Docker 部署。
              </p>
            </li>
          </ol>
        </div>
      </div>
    </section>

    <!-- ========== 02 核心能力 ========== -->
    <section class="section" data-reveal>
      <div class="sec-head">
        <span class="sec-index">02</span>
        <h2 class="text-base font-semibold text-notion-text dark:text-notion-text-dark">核心能力</h2>
        <span class="sec-line" aria-hidden="true"></span>
        <p class="sec-hint hidden sm:block">管理、练习与对接，形成一套闭环</p>
      </div>

      <div class="grid gap-4 sm:grid-cols-3">
        <article v-for="(feat, i) in features" :key="feat.title" class="feature-card">
          <span class="feature-watermark" aria-hidden="true">{{ String(i + 1).padStart(2, '0') }}</span>
          <div class="feature-icon">
            <svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7" :d="feat.icon"/>
            </svg>
          </div>
          <h3 class="mt-4 text-sm font-semibold text-notion-text dark:text-notion-text-dark">{{ feat.title }}</h3>
          <p class="mt-1.5 text-xs leading-relaxed text-notion-muted dark:text-notion-muted-dark">{{ feat.desc }}</p>
          <span class="feature-bar" aria-hidden="true"></span>
        </article>
      </div>
    </section>

    <!-- ========== 03 技术底座 ========== -->
    <section class="section" data-reveal>
      <div class="sec-head">
        <span class="sec-index">03</span>
        <h2 class="text-base font-semibold text-notion-text dark:text-notion-text-dark">技术底座</h2>
        <span class="sec-line" aria-hidden="true"></span>
        <p class="sec-hint hidden sm:block">轻量、可控，覆盖界面到部署</p>
      </div>

      <div class="tech-panel">
        <div class="tech-note">
          <span class="tech-note-dot" aria-hidden="true"></span>
          <span>{{ techStack.length }} 项技术 · 前后端同仓维护</span>
        </div>

        <div
          v-for="(row, rowIndex) in techRows"
          :key="rowIndex"
          class="tech-row"
          :class="{ 'tech-row--reverse': rowIndex === 1 }"
          :aria-hidden="rowIndex === 1 ? 'true' : undefined"
        >
          <div class="tech-track">
            <div v-for="copy in 2" :key="copy" class="tech-group" :aria-hidden="copy === 2 ? 'true' : undefined">
              <span v-for="tech in row" :key="tech.name + copy" class="tech-chip">
                <span class="tech-glyph" :style="{ color: techInk(tech) }">
                  <svg v-if="tech.rect" class="w-[15px] h-[15px]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <rect x="2" y="13" width="4" height="8" rx="1"/><rect x="8" y="9" width="4" height="12" rx="1"/><rect x="14" y="5" width="4" height="16" rx="1"/><rect x="20" y="2" width="4" height="19" rx="1"/>
                  </svg>
                  <svg v-else-if="tech.label" class="w-[15px] h-[15px]" viewBox="0 0 24 24" aria-hidden="true">
                    <text x="2" y="18" font-size="16" font-weight="700" font-family="system-ui,sans-serif" fill="currentColor">{{ tech.label }}</text>
                  </svg>
                  <svg v-else class="w-[15px] h-[15px]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path :d="tech.path"/>
                  </svg>
                </span>
                <span class="tech-name">{{ tech.name }}</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ========== 04 版本记录 ========== -->
    <section class="section" data-reveal>
      <div class="sec-head">
        <span class="sec-index">04</span>
        <h2 class="text-base font-semibold text-notion-text dark:text-notion-text-dark">版本记录</h2>
        <span class="sec-line" aria-hidden="true"></span>
        <p class="sec-hint hidden sm:block">持续更新，保持轻盈</p>
      </div>

      <div class="card p-0 overflow-hidden">
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 px-6 sm:px-8 py-6">
          <div class="flex items-center gap-3.5 min-w-0">
            <span class="version-orb" aria-hidden="true">
              <svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/>
              </svg>
            </span>
            <div class="min-w-0">
              <p class="text-sm font-semibold text-notion-text dark:text-notion-text-dark">题库管理系统</p>
              <p class="mt-0.5 text-xs text-notion-muted dark:text-notion-muted-dark">当前版本 · 持续维护中</p>
            </div>
          </div>

          <div class="flex items-center gap-2.5 flex-shrink-0">
            <span class="version-pill">
              <span class="version-dot" aria-hidden="true"></span>
              <span class="min-w-0 truncate font-mono tabular-nums">{{ appVersion }}</span>
            </span>
            <button
              type="button"
              class="log-toggle"
              :class="{ 'is-open': showChangelog }"
              :aria-expanded="showChangelog"
              @click="showChangelog = !showChangelog"
            >
              更新日志
              <svg class="chevron" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
              </svg>
            </button>
          </div>
        </div>

        <Transition name="collapse">
          <div v-if="showChangelog" class="border-t border-notion-border dark:border-notion-border-dark">
            <div class="changelog-body max-h-[420px] overflow-y-auto px-6 sm:px-8 py-5">
              <Skeleton v-if="loading" :lines="3" height="12px" />
              <div
                v-else-if="changelog"
                class="markdown-body text-sm leading-relaxed text-notion-text dark:text-notion-text-dark"
                v-html="renderedChangelog"
              ></div>
              <p v-else-if="changelogFailed" class="py-4 text-center text-sm text-red-500 dark:text-red-400">获取更新日志失败，请检查网络后重试</p>
              <p v-else class="py-4 text-center text-sm text-notion-muted dark:text-notion-muted-dark">暂无更新日志</p>
            </div>
          </div>
        </Transition>
      </div>
    </section>

    <!-- ========== 05 友情链接 ========== -->
    <section class="section" data-reveal>
      <div class="sec-head">
        <span class="sec-index">05</span>
        <h2 class="text-base font-semibold text-notion-text dark:text-notion-text-dark">友情链接</h2>
        <span class="sec-line" aria-hidden="true"></span>
        <p class="sec-hint hidden sm:block">同行者与他们做的东西</p>
      </div>

      <div class="grid gap-4 sm:grid-cols-2">
        <a
          v-for="link in friendLinks"
          :key="link.name"
          :href="link.url"
          target="_blank"
          rel="noopener"
          class="friend-card"
          @pointermove="moveFriendSpot"
        >
          <span class="friend-spot" aria-hidden="true"></span>
          <div class="relative flex items-start justify-between gap-3">
            <span class="friend-icon">
              <svg class="w-[18px] h-[18px]" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path :d="link.icon"/>
              </svg>
            </span>
            <svg class="friend-arrow" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M7 17L17 7M17 7H8M17 7v9"/>
            </svg>
          </div>
          <p class="friend-name mt-4 text-sm font-semibold text-notion-text dark:text-notion-text-dark">{{ link.name }}</p>
          <p class="mt-1 text-xs text-notion-muted dark:text-notion-muted-dark">{{ link.desc }}</p>
          <div class="mt-4 flex items-center justify-between gap-3 border-t border-notion-border pt-3 dark:border-notion-border-dark">
            <span class="min-w-0 truncate font-mono text-[10.5px] text-notion-muted dark:text-notion-muted-dark">{{ hostOf(link.url) }}</span>
            <span class="friend-visit">访问 →</span>
          </div>
        </a>
      </div>
    </section>

    <!-- ========== 页脚签名 ========== -->
    <footer class="signature" data-reveal>
      <div class="signature-row">
        <span class="signature-line" aria-hidden="true"></span>
        <span class="signature-text">保持热爱，持续折腾</span>
        <span class="signature-line signature-line--end" aria-hidden="true"></span>
      </div>
      <p class="signature-meta">© {{ currentYear }} 派大星 · MIT License</p>
    </footer>

  </div>
</template>

<style scoped>
/* ========== 入场 ========== */
.anim-rise {
  animation: rise 0.6s cubic-bezier(0.22, 1, 0.36, 1) backwards;
  animation-delay: var(--d, 0ms);
}

@keyframes rise {
  from { opacity: 0; transform: translateY(14px); }
  to { opacity: 1; transform: none; }
}

/* 滚动入场：进入视口后只触发一次 */
[data-reveal] {
  opacity: 0;
  transform: translateY(18px);
  transition:
    opacity 0.7s cubic-bezier(0.22, 1, 0.36, 1),
    transform 0.7s cubic-bezier(0.22, 1, 0.36, 1);
}

[data-reveal].is-revealed {
  opacity: 1;
  transform: none;
}

.section {
  margin-bottom: 2.5rem;
}

@media (min-width: 640px) {
  .section { margin-bottom: 3rem; }
}

/* ========== 页头版本胶囊 ========== */
.release-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  height: 30px;
  padding: 0 11px;
  border-radius: 9999px;
  border: 1px solid color-mix(in srgb, var(--theme-accent) 22%, var(--theme-border));
  background: color-mix(in srgb, var(--theme-accent) 6%, var(--theme-surface));
  color: var(--theme-accent);
  font-size: 11.5px;
  font-weight: 600;
}

.release-pill-icon {
  width: 13px;
  height: 13px;
  opacity: 0.8;
}

/* ========== 作者区 ========== */
.hero {
  --mx: 50%;
  --my: 30%;
  position: relative;
  isolation: isolate;
  overflow: hidden;
  margin-bottom: 1rem;
  border: 1px solid var(--theme-border);
  border-radius: 16px;
  background: var(--theme-surface);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
}

.hero-grid {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: radial-gradient(circle at 1px 1px, color-mix(in srgb, var(--theme-text) 12%, transparent) 1px, transparent 0);
  background-size: 20px 20px;
  opacity: 0.55;
  -webkit-mask-image: radial-gradient(ellipse 75% 80% at 55% 15%, #000 0%, transparent 72%);
  mask-image: radial-gradient(ellipse 75% 80% at 55% 15%, #000 0%, transparent 72%);
}

.hero-spot {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(340px circle at var(--mx) var(--my), color-mix(in srgb, var(--theme-accent) 11%, transparent), transparent 72%);
  opacity: 0;
  transition: opacity 0.45s ease;
}

.hero:hover .hero-spot {
  opacity: 1;
}

.hero-orb {
  position: absolute;
  border-radius: 9999px;
  filter: blur(46px);
  pointer-events: none;
}

.hero-orb--a {
  top: -130px;
  right: -80px;
  width: 280px;
  height: 280px;
  background: color-mix(in srgb, var(--theme-accent) 18%, transparent);
  animation: orb-a 18s ease-in-out infinite alternate;
}

.hero-orb--b {
  bottom: -150px;
  left: 12%;
  width: 220px;
  height: 220px;
  background: color-mix(in srgb, var(--theme-accent) 10%, transparent);
  animation: orb-b 22s ease-in-out infinite alternate;
}

.hero-arc {
  position: absolute;
  pointer-events: none;
  border: 1px solid color-mix(in srgb, var(--theme-accent) 13%, transparent);
  border-radius: 9999px;
}

.hero-arc--a {
  top: -250px;
  right: -140px;
  width: 460px;
  height: 460px;
}

.hero-arc--b {
  top: -330px;
  right: -220px;
  width: 620px;
  height: 620px;
  border-color: color-mix(in srgb, var(--theme-accent) 8%, transparent);
}

@keyframes orb-a {
  from { transform: translate3d(0, 0, 0) scale(1); }
  to { transform: translate3d(-24px, 18px, 0) scale(1.08); }
}

@keyframes orb-b {
  from { transform: translate3d(0, 0, 0) scale(1); }
  to { transform: translate3d(30px, -16px, 0) scale(1.06); }
}

/* 头像 */
.avatar-stage {
  position: relative;
  display: grid;
  place-items: center;
  width: 112px;
  height: 112px;
}

@media (min-width: 640px) {
  .avatar-stage { width: 128px; height: 128px; }
}

.avatar-img {
  position: relative;
  z-index: 2;
  width: 100%;
  height: 100%;
  border: 3px solid var(--theme-surface);
  border-radius: 9999px;
  object-fit: cover;
  box-shadow: 0 10px 30px -14px rgba(0, 0, 0, 0.4);
  transition: transform 0.45s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.45s ease;
}

.avatar-stage:hover .avatar-img {
  transform: scale(1.035);
  box-shadow: 0 16px 38px -16px rgba(0, 0, 0, 0.45);
}

.avatar-halo {
  position: absolute;
  inset: -26px;
  border-radius: 9999px;
  background: radial-gradient(circle, color-mix(in srgb, var(--theme-accent) 20%, transparent), transparent 68%);
  filter: blur(10px);
  animation: halo-breathe 6s ease-in-out infinite;
  pointer-events: none;
}

@keyframes halo-breathe {
  0%, 100% { opacity: 0.55; transform: scale(0.96); }
  50% { opacity: 0.9; transform: scale(1.04); }
}

.avatar-ring {
  position: absolute;
  inset: -7px;
  z-index: 3;
  border-radius: 9999px;
  background: conic-gradient(
    from 0deg,
    transparent 0 58%,
    color-mix(in srgb, var(--theme-accent) 80%, transparent) 72%,
    transparent 88%
  );
  -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 1.5px), #000 calc(100% - 1px));
  mask: radial-gradient(farthest-side, transparent calc(100% - 1.5px), #000 calc(100% - 1px));
  animation: ring-spin 9s linear infinite;
  opacity: 0.85;
  pointer-events: none;
}

.avatar-ring--soft {
  inset: -13px;
  opacity: 0.35;
  animation-duration: 16s;
  animation-direction: reverse;
}

@keyframes ring-spin {
  to { transform: rotate(360deg); }
}

.avatar-badge {
  position: absolute;
  right: 1px;
  bottom: 3px;
  z-index: 4;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 3px solid var(--theme-surface);
  border-radius: 9999px;
  color: #fff;
  background: var(--theme-accent);
  box-shadow: 0 4px 12px -4px color-mix(in srgb, var(--theme-accent) 60%, transparent);
}

.author-badge {
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 8px;
  border: 1px solid color-mix(in srgb, var(--theme-accent) 22%, transparent);
  border-radius: 9999px;
  color: var(--theme-accent);
  background: color-mix(in srgb, var(--theme-accent) 9%, transparent);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
}

/* 角色轮播 */
.role-slot {
  position: relative;
  display: inline-block;
  width: 5.2em;
  height: 1.6em;
  margin-left: 2px;
  overflow: hidden;
  vertical-align: bottom;
  text-align: center;
}

.role-slot::after {
  content: '';
  position: absolute;
  bottom: 1px;
  left: 50%;
  width: 2.4em;
  height: 1px;
  transform: translateX(-50%);
  background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--theme-accent) 55%, transparent), transparent);
}

.role-text {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
  font-weight: 600;
  color: var(--theme-accent);
}

.role-enter-active,
.role-leave-active {
  transition:
    opacity 0.36s cubic-bezier(0.22, 1, 0.36, 1),
    transform 0.36s cubic-bezier(0.22, 1, 0.36, 1),
    filter 0.36s ease;
}

.role-enter-from {
  opacity: 0;
  transform: translateY(10px);
  filter: blur(3px);
}

.role-leave-to {
  opacity: 0;
  transform: translateY(-10px);
  filter: blur(3px);
}

.hero-bio {
  max-width: 46ch;
  margin: 0.85rem auto 0;
  font-size: 13px;
  line-height: 1.8;
  color: color-mix(in srgb, var(--theme-text) 78%, transparent);
}

@media (min-width: 768px) {
  .hero-bio { margin-left: 0; margin-right: 0; }
}

/* 作者链接 */
.hero-action {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 34px;
  padding: 0 13px;
  border: 1px solid var(--theme-border);
  border-radius: 8px;
  color: var(--theme-text);
  background: color-mix(in srgb, var(--theme-text) 2%, var(--theme-surface));
  font-size: 12.5px;
  font-weight: 500;
  transition:
    transform 0.22s cubic-bezier(0.22, 1, 0.36, 1),
    border-color 0.22s ease,
    background-color 0.22s ease,
    box-shadow 0.22s ease;
}

.hero-action:hover {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--theme-accent) 38%, var(--theme-border));
  background: color-mix(in srgb, var(--theme-accent) 6%, var(--theme-surface));
  box-shadow: 0 8px 18px -14px rgba(0, 0, 0, 0.45);
}

.hero-action--primary {
  border-color: transparent;
  color: #fff;
  background: var(--theme-accent);
  box-shadow: 0 8px 18px -14px color-mix(in srgb, var(--theme-accent) 80%, transparent);
}

.hero-action--primary:hover {
  border-color: transparent;
  color: #fff;
  background: var(--theme-accent);
  opacity: 0.92;
}

.action-arrow {
  width: 12px;
  height: 12px;
  opacity: 0.45;
  transition: transform 0.22s ease, opacity 0.22s ease;
}

.hero-action:hover .action-arrow {
  transform: translate(1px, -1px);
  opacity: 0.9;
}

/* 信条 */
.belief-chip {
  display: inline-flex;
  align-items: center;
  height: 24px;
  padding: 0 9px;
  border: 1px solid var(--theme-border);
  border-radius: 9999px;
  color: var(--theme-muted);
  background: color-mix(in srgb, var(--theme-text) 3%, transparent);
  font-size: 10.5px;
}

.hero-meta {
  padding-left: 2rem;
  border-left: 1px solid var(--theme-border);
}

.hero-meta-title {
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--theme-muted);
}

.belief-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 12.5px;
  line-height: 1.6;
  color: color-mix(in srgb, var(--theme-text) 82%, transparent);
}

.belief-dot {
  flex-shrink: 0;
  width: 5px;
  height: 5px;
  margin-top: 6px;
  border-radius: 9999px;
  background: var(--theme-accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--theme-accent) 12%, transparent);
}

/* ========== 数据条 ========== */
.stats-strip {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1px;
  overflow: hidden;
  margin-bottom: 2.5rem;
  border: 1px solid var(--theme-border);
  border-radius: 12px;
  background: var(--theme-border);
}

@media (min-width: 768px) {
  .stats-strip {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    margin-bottom: 3rem;
  }
}

.stat-cell {
  min-width: 0;
  padding: 14px 16px;
  background: var(--theme-surface);
  transition: background-color 0.25s ease;
}

@media (min-width: 640px) {
  .stat-cell { padding: 16px 20px; }
}

.stat-cell:hover {
  background: color-mix(in srgb, var(--theme-accent) 3.5%, var(--theme-surface));
}

.stat-label {
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--theme-muted);
}

.stat-mark {
  flex-shrink: 0;
  width: 5px;
  height: 5px;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--theme-text) 18%, transparent);
}

.stat-mark--accent {
  background: var(--theme-accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--theme-accent) 12%, transparent);
}

.stat-value {
  display: block;
  min-height: 2rem;
  margin-top: 8px;
  font-size: 1.5rem;
  font-weight: 700;
  line-height: 2rem;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}

.stat-value--mono {
  overflow: hidden;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.95rem;
  font-weight: 600;
  letter-spacing: 0;
  line-height: 2rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stat-suffix {
  margin-left: 3px;
  font-size: 11px;
  font-weight: 500;
  color: var(--theme-muted);
}

.stat-hint {
  overflow: hidden;
  margin-top: 2px;
  color: var(--theme-muted);
  font-size: 11px;
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* ========== 区块标题 ========== */
.sec-head {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-bottom: 14px;
}

.sec-index {
  color: color-mix(in srgb, var(--theme-accent) 75%, var(--theme-muted));
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.12em;
}

.sec-line {
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, var(--theme-border), color-mix(in srgb, var(--theme-border) 20%, transparent));
}

.sec-hint {
  color: var(--theme-muted);
  font-size: 11px;
  white-space: nowrap;
}

/* ========== 项目故事 ========== */
.story-lead {
  font-size: 15px;
  font-weight: 500;
  line-height: 1.75;
  letter-spacing: -0.005em;
  color: var(--theme-text);
}

.meta-chip {
  display: inline-flex;
  align-items: center;
  height: 22px;
  padding: 0 8px;
  border: 1px solid var(--theme-border);
  border-radius: 6px;
  color: var(--theme-muted);
  background: color-mix(in srgb, var(--theme-text) 4%, transparent);
  font-size: 10.5px;
}

.timeline {
  position: relative;
  margin: 0;
  padding-left: 24px;
  list-style: none;
}

.timeline::before {
  content: '';
  position: absolute;
  top: 6px;
  bottom: 8px;
  left: 3.5px;
  width: 1px;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--theme-accent) 45%, transparent),
    var(--theme-border) 22%,
    var(--theme-border) 82%,
    transparent
  );
}

.timeline-item {
  position: relative;
}

.timeline-item + .timeline-item {
  margin-top: 24px;
}

.timeline-dot {
  position: absolute;
  top: 6px;
  left: -24px;
  width: 9px;
  height: 9px;
  border: 1.5px solid color-mix(in srgb, var(--theme-accent) 55%, var(--theme-border));
  border-radius: 9999px;
  background: var(--theme-surface);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--theme-accent) 6%, transparent);
  transition: border-color 0.25s ease, box-shadow 0.25s ease;
}

.timeline-item:hover .timeline-dot {
  border-color: var(--theme-accent);
  box-shadow: 0 0 0 5px color-mix(in srgb, var(--theme-accent) 11%, transparent);
}

.timeline-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.timeline-index {
  color: var(--theme-muted);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 10px;
  letter-spacing: 0.08em;
}

.timeline-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--theme-text);
}

.timeline-tag {
  margin-left: auto;
  padding: 1px 6px;
  border: 1px solid var(--theme-border);
  border-radius: 4px;
  color: var(--theme-muted);
  font-size: 9.5px;
  letter-spacing: 0.08em;
}

.timeline-text {
  max-width: 62ch;
  margin-top: 8px;
  font-size: 13px;
  line-height: 1.85;
  color: color-mix(in srgb, var(--theme-text) 72%, var(--theme-muted));
}

.inline-link {
  color: var(--theme-accent);
  text-decoration: underline;
  text-decoration-color: color-mix(in srgb, var(--theme-accent) 35%, transparent);
  text-underline-offset: 2px;
  transition: text-decoration-color 0.2s ease;
}

.inline-link:hover {
  text-decoration-color: var(--theme-accent);
}

/* ========== 核心能力 ========== */
.feature-card {
  position: relative;
  overflow: hidden;
  padding: 22px;
  border: 1px solid var(--theme-border);
  border-radius: 12px;
  background: var(--theme-surface);
  transition:
    transform 0.3s cubic-bezier(0.22, 1, 0.36, 1),
    border-color 0.3s ease,
    box-shadow 0.3s ease;
}

.feature-card:hover {
  transform: translateY(-3px);
  border-color: color-mix(in srgb, var(--theme-accent) 28%, var(--theme-border));
  box-shadow: 0 20px 40px -32px rgba(0, 0, 0, 0.65);
}

.feature-icon {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border: 1px solid color-mix(in srgb, var(--theme-accent) 16%, transparent);
  border-radius: 10px;
  color: var(--theme-accent);
  background: color-mix(in srgb, var(--theme-accent) 9%, transparent);
  transition:
    transform 0.3s cubic-bezier(0.22, 1, 0.36, 1),
    background-color 0.3s ease,
    color 0.3s ease,
    border-color 0.3s ease;
}

.feature-card:hover .feature-icon {
  transform: translateY(-1px) rotate(-3deg);
  border-color: transparent;
  color: #fff;
  background: var(--theme-accent);
}

.feature-watermark {
  position: absolute;
  top: 12px;
  right: 16px;
  color: color-mix(in srgb, var(--theme-text) 6%, transparent);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 34px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.05em;
  transition: color 0.3s ease;
  pointer-events: none;
}

.feature-card:hover .feature-watermark {
  color: color-mix(in srgb, var(--theme-accent) 14%, transparent);
}

.feature-bar {
  position: absolute;
  right: 22px;
  bottom: 0;
  left: 22px;
  height: 2px;
  border-radius: 2px 2px 0 0;
  background: linear-gradient(90deg, var(--theme-accent), color-mix(in srgb, var(--theme-accent) 10%, transparent));
  transform: scaleX(0);
  transform-origin: left;
  transition: transform 0.35s cubic-bezier(0.22, 1, 0.36, 1);
}

.feature-card:hover .feature-bar {
  transform: scaleX(1);
}

/* ========== 技术底座 ========== */
.tech-panel {
  position: relative;
  overflow: hidden;
  padding: 20px 0 22px;
  border: 1px solid var(--theme-border);
  border-radius: 12px;
  background: var(--theme-surface);
}

.tech-note {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 0 22px 14px;
  color: var(--theme-muted);
  font-size: 11px;
}

.tech-note-dot {
  width: 5px;
  height: 5px;
  border-radius: 9999px;
  background: var(--theme-accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--theme-accent) 10%, transparent);
}

.tech-row {
  overflow: hidden;
  -webkit-mask-image: linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent);
  mask-image: linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent);
}

.tech-row + .tech-row {
  margin-top: 10px;
}

.tech-track {
  display: flex;
  width: max-content;
  animation: tech-scroll 44s linear infinite;
}

.tech-row--reverse .tech-track {
  animation-direction: reverse;
  animation-duration: 50s;
}

.tech-row:hover .tech-track {
  animation-play-state: paused;
}

.tech-group {
  display: flex;
  gap: 9px;
  padding-right: 9px;
}

.tech-chip {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--theme-border);
  border-radius: 9999px;
  background: color-mix(in srgb, var(--theme-text) 2%, var(--theme-surface));
  white-space: nowrap;
  transition: border-color 0.22s ease, background-color 0.22s ease, transform 0.22s ease;
}

.tech-chip:hover {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--theme-accent) 35%, var(--theme-border));
  background: color-mix(in srgb, var(--theme-accent) 5%, var(--theme-surface));
}

.tech-glyph {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 15px;
  height: 15px;
}

.tech-name {
  color: var(--theme-text);
  font-size: 12px;
}

@keyframes tech-scroll {
  from { transform: translate3d(0, 0, 0); }
  to { transform: translate3d(-50%, 0, 0); }
}

/* ========== 友情链接 ========== */
.friend-card {
  --fx: 50%;
  --fy: 0%;
  position: relative;
  display: block;
  overflow: hidden;
  padding: 18px 20px 14px;
  border: 1px solid var(--theme-border);
  border-radius: 12px;
  background: var(--theme-surface);
  transition:
    transform 0.3s cubic-bezier(0.22, 1, 0.36, 1),
    border-color 0.3s ease,
    box-shadow 0.3s ease;
}

.friend-card:hover {
  transform: translateY(-3px);
  border-color: color-mix(in srgb, var(--theme-accent) 30%, var(--theme-border));
  box-shadow: 0 22px 44px -34px rgba(0, 0, 0, 0.7);
}

.friend-spot {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(220px circle at var(--fx) var(--fy), color-mix(in srgb, var(--theme-accent) 9%, transparent), transparent 68%);
  opacity: 0;
  transition: opacity 0.3s ease;
}

.friend-card:hover .friend-spot {
  opacity: 1;
}

.friend-icon {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border: 1px solid var(--theme-border);
  border-radius: 10px;
  color: var(--theme-muted);
  background: color-mix(in srgb, var(--theme-text) 5%, transparent);
  transition:
    transform 0.28s cubic-bezier(0.22, 1, 0.36, 1),
    background-color 0.28s ease,
    color 0.28s ease,
    border-color 0.28s ease;
}

.friend-card:hover .friend-icon {
  transform: translateY(-1px);
  border-color: transparent;
  color: #fff;
  background: var(--theme-accent);
}

.friend-name {
  transition: color 0.2s ease;
}

.friend-card:hover .friend-name {
  color: var(--theme-accent);
}

.friend-arrow {
  width: 16px;
  height: 16px;
  color: var(--theme-muted);
  opacity: 0.5;
  transition: color 0.25s ease, opacity 0.25s ease, transform 0.25s ease;
}

.friend-card:hover .friend-arrow {
  transform: translate(2px, -2px);
  color: var(--theme-accent);
  opacity: 1;
}

.friend-visit {
  flex-shrink: 0;
  color: var(--theme-muted);
  font-size: 10px;
  transition: color 0.25s ease, transform 0.25s ease;
}

.friend-card:hover .friend-visit {
  transform: translateX(2px);
  color: var(--theme-accent);
}

/* ========== 版本记录 ========== */
.version-orb {
  position: relative;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border: 1px solid color-mix(in srgb, var(--theme-accent) 18%, transparent);
  border-radius: 10px;
  color: var(--theme-accent);
  background: color-mix(in srgb, var(--theme-accent) 9%, transparent);
}

.version-orb::after {
  content: '';
  position: absolute;
  inset: -6px;
  border: 1px solid color-mix(in srgb, var(--theme-accent) 18%, transparent);
  border-radius: 14px;
  animation: version-pulse 3.4s ease-out infinite;
  pointer-events: none;
}

@keyframes version-pulse {
  0% { transform: scale(0.92); opacity: 0.8; }
  70%, 100% { transform: scale(1.12); opacity: 0; }
}

.version-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  height: 30px;
  padding: 0 11px;
  border: 1px solid color-mix(in srgb, var(--theme-accent) 24%, var(--theme-border));
  border-radius: 9999px;
  color: var(--theme-accent);
  background: color-mix(in srgb, var(--theme-accent) 6%, var(--theme-surface));
  font-size: 11.5px;
  font-weight: 600;
}

.version-dot {
  width: 5px;
  height: 5px;
  border-radius: 9999px;
  background: var(--theme-accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--theme-accent) 12%, transparent);
}

.log-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 11px;
  border: 1px solid var(--theme-border);
  border-radius: 8px;
  color: var(--theme-text);
  font-size: 12px;
  transition: background-color 0.2s ease, border-color 0.2s ease;
}

.log-toggle:hover {
  border-color: color-mix(in srgb, var(--theme-accent) 30%, var(--theme-border));
  background: color-mix(in srgb, var(--theme-text) 4%, transparent);
}

.chevron {
  width: 13px;
  height: 13px;
  transition: transform 0.3s cubic-bezier(0.22, 1, 0.36, 1);
}

.log-toggle.is-open .chevron {
  transform: rotate(180deg);
}

.changelog-body :deep(a) {
  color: var(--theme-accent);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.changelog-body :deep(img) {
  max-width: 100%;
  border-radius: 8px;
}

.changelog-body :deep(h1),
.changelog-body :deep(h2),
.changelog-body :deep(h3) {
  color: var(--theme-text);
}

/* ========== 页脚签名 ========== */
.signature {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  margin-top: 3rem;
  padding: 1.5rem 0 0.5rem;
}

.signature-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.signature-line {
  width: 28px;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--theme-border));
}

.signature-line--end {
  background: linear-gradient(90deg, var(--theme-border), transparent);
}

.signature-text {
  color: var(--theme-muted);
  font-size: 11px;
  letter-spacing: 0.06em;
}

.signature-meta {
  color: color-mix(in srgb, var(--theme-muted) 75%, transparent);
  font-size: 10.5px;
}

/* ========== 焦点可见 ========== */
.hero-action:focus-visible,
.friend-card:focus-visible,
.log-toggle:focus-visible,
.inline-link:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--theme-accent) 60%, transparent);
  outline-offset: 2px;
}

@media (hover: none) {
  .hero-spot {
    display: none;
  }
}

/* ========== 减少动效 ========== */
@media (prefers-reduced-motion: reduce) {
  .anim-rise {
    animation: none;
    opacity: 1;
    transform: none;
  }

  [data-reveal] {
    opacity: 1;
    transform: none;
    transition: none;
  }

  .avatar-ring,
  .avatar-halo,
  .hero-orb,
  .version-orb::after {
    animation: none !important;
  }

  .hero-spot {
    display: none;
  }

  .tech-track {
    animation: none !important;
  }

  .tech-row {
    overflow-x: auto;
    -webkit-mask-image: none;
    mask-image: none;
  }

  .role-enter-active,
  .role-leave-active {
    transition-duration: 0.01ms;
  }
}
</style>
