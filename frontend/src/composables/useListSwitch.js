import { watch, nextTick } from 'vue'
import gsap from 'gsap'

/**
 * 列表数据切换动画（GSAP）
 *
 * 分页/筛选导致列表数据变化时，用方向感知的逐行 stagger 动画
 * 替代默认的"闪烁"式替换：
 * - 下一页：行从下方淡入上移
 * - 上一页：行从上方淡入下移
 * - 尊重 prefers-reduced-motion，命中时跳过动画
 *
 * @param {import('vue').Ref} listRef 列表数据 ref（数据变化即触发动画）
 * @param {import('vue').Ref} containerRef 包含行元素的容器 ref
 * @param {function} [getPage] 当前页码 getter，用于判断切换方向
 * @param {object} [options]
 * @param {string} [options.rowSelector] 行元素选择器（相对 containerRef，默认 '> *'）
 * @param {function} [options.ready] 额外就绪条件（如 () => !loading.value），
 *        为 true 时才执行动画
 * @param {number} [options.maxRows] 参与动画的最大行数（性能保护，默认 40）
 */
export function useListSwitch(listRef, containerRef, getPage, options = {}) {
  const {
    rowSelector = '> *',
    ready = () => true,
    maxRows = 40,
  } = options

  let direction = 1
  let activeTween = null

  if (getPage) {
    watch(getPage, (nv, ov) => {
      direction = nv >= ov ? 1 : -1
    })
  }

  watch(
    [listRef, () => ready()],
    async ([, isReady]) => {
      if (!isReady) return
      await nextTick()
      const container = containerRef.value
      if (!container) return

      let rows = Array.from(container.querySelectorAll(rowSelector))
      if (!rows.length) return
      if (rows.length > maxRows) rows = rows.slice(0, maxRows)

      // 清除上一次动画残留的内联样式
      activeTween?.kill()
      gsap.set(rows, { clearProps: 'all' })

      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

      activeTween = gsap.fromTo(
        rows,
        { autoAlpha: 0, y: 16 * direction },
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.4,
          ease: 'power3.out',
          stagger: 0.03,
          overwrite: true,
          onComplete: () => gsap.set(rows, { clearProps: 'all' }),
        }
      )
    },
    { flush: 'post' }
  )
}
