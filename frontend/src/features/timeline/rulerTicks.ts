/**
 * 时间刻度尺的刻度图案。
 *
 * 单独放一个模块：Ruler.tsx 是组件文件，混着导出函数会破坏 Fast Refresh。
 */

export type RulerTick = {
  /** 该位置是否为月份起点（长刻度） */
  major: boolean
  /** 月份名，仅 major 有 */
  label?: string
}

/**
 * 由「按月分组」的计数生成刻度图案。
 *
 * 参考站口径：每个月占 `图片数 × 9` 个槽，每月第一个槽是长刻度并带月份名。
 * 槽总数决定标尺的稀疏程度 —— 槽越多，单槽越窄，刻度越密。
 */
export function buildTicks(
  groups: { label: string; count: number }[],
): RulerTick[] {
  const ticks: RulerTick[] = []
  for (const g of groups) {
    const slots = Math.max(1, g.count) * 9
    ticks.push({ major: true, label: g.label })
    for (let i = 1; i < slots; i += 1) ticks.push({ major: false })
  }
  return ticks
}
