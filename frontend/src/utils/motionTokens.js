/**
 * Motion Tokens - 统一动画配置系统
 *
 * 基于 motion-ui skill 最佳实践，提供一致的动画参数
 * 所有动画效果都应引用此处的配置，确保视觉一致性
 */

/**
 * GSAP 专用的缓动字符串映射
 */
export const gsapEasing = {
  smooth: 'power3.out',
  sharp: 'power2.inOut',
  bounce: 'back.out(1.7)'
}

/**
 * AI 弹窗 ⇄ 悬浮球的「收拢 / 展开」联动参数。
 * 弹窗关闭时整卡片收缩飞入右下角悬浮球槽位，悬浮球在卡片落地的刹那
 * 原位凝出并做吸收弹跳（飞行途中球保持透明，避免"球先出现等卡片"）；
 * 重新打开时从球槽位反向展开。
 * 两个组件（AiAnalyzeModal / AiProgressBall）必须共用这里的常量，
 * 才能保证吸入手感在时间轴上对齐。
 */
export const aiCollapseMotion = {
  // 悬浮球直径（对应 Tailwind w-14 h-14 = 56px）
  ballSize: 56,
  // 悬浮球距视口右下边距（对应 bottom-6 right-6 = 24px）
  cornerOffset: 24,
  // 收拢时间轴上"起飞"的时刻（内容隐去之后；刻意不加预备回弹，
  // 点击到起飞之间的等待会被感知成"卡了一下"）
  flightStart: 0.12,
  // 卡片收缩飞行时长（秒）；落地时刻 = flightStart + travel
  travel: 0.38,
  // 卡片在落地前的最后一段淡出时长（把画面交给刚凝出的球）
  settleFade: 0.09,
  // 遮罩淡出时长（秒），先于卡片落地结束，避免悬浮球隔着蒙层弹出
  overlayFade: 0.3,
  // 悬浮球在卡片落地前 popLead 秒开始凝出，凝出恰好在落地一刻完全成形：
  // 与卡片最后 settleFade 的淡出窗口重叠成交叉淡化，同一位置同一时刻交接，
  // 才读得出"卡片变成了球"（飞行途中球必须保持透明，否则是"球等卡片"）
  popLead: 0.16,
  // 悬浮球槽位的视口中心坐标
  ballCenter() {
    const half = this.ballSize / 2
    return {
      x: window.innerWidth - this.cornerOffset - half,
      y: window.innerHeight - this.cornerOffset - half,
    }
  },
  // 卡片落地时刻（悬浮球吸收动画的对齐点）
  landAt() {
    return this.flightStart + this.travel
  },
}

/**
 * 用户是否要求减少动态效果（可访问性）。动画调用方用它降级为纯淡入淡出。
 */
export function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
