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
