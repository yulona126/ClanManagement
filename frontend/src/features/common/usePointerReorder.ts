import { useCallback, useEffect, useRef } from 'react'

type DragState = {
  /** 被拖的那一项的 id —— 整个手势期间**保持不变** */
  id: string
  el: HTMLElement
  /** 最近一次指针位置（松手时兜底用） */
  x: number
  y: number
}

/**
 * 指针拖拽排序（鼠标 / 触屏通用），**实时让位**。
 *
 * 为什么不用 HTML5 draggable：iOS Safari 与多数移动浏览器对非原生元素
 * 不触发 dragstart/drop —— 手机上会完全没反应。
 *
 * 为什么"源"必须固定：早期版本在每次交换后把目标当成新的源，
 * 于是元素在手指下反复换位，出现 1→2→1→2 的抖动、最终顺序还原。
 * 正确做法是全程只拖同一个 id，每次移动重新找"指针下面是哪一项"。
 *
 * 用法：每个可拖项挂 `handlers(id)`；容器上 `touch-action: none`，
 * 否则移动端一拖就变成页面滚动。
 */
export function usePointerReorder(
  onMove: (fromId: string, toId: string) => void,
) {
  const dragRef = useRef<DragState | null>(null)

  const cleanup = useCallback(() => {
    dragRef.current?.el.classList.remove('is-dragging')
    dragRef.current = null
  }, [])

  useEffect(() => () => cleanup(), [cleanup])

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>, id: string) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      const el = e.currentTarget
      dragRef.current = { id, el, x: e.clientX, y: e.clientY }
      el.classList.add('is-dragging')

      const hitTest = (x: number, y: number): string | undefined =>
        document
          .elementFromPoint(x, y)
          ?.closest<HTMLElement>('[data-reorder-id]')?.dataset.reorderId

      const move = (ev: PointerEvent) => {
        const drag = dragRef.current
        if (!drag) return
        drag.x = ev.clientX
        drag.y = ev.clientY

        const to = hitTest(ev.clientX, ev.clientY)
        // 指针压在"自己"身上（刚被移到新位置）时什么都不做，避免来回抖
        if (!to || to === drag.id) return
        onMove(drag.id, to)
      }

      const finish = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', finish)
        window.removeEventListener('pointercancel', cancel)
        cleanup()
      }
      const cancel = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', finish)
        window.removeEventListener('pointercancel', cancel)
        cleanup()
      }

      window.addEventListener('pointermove', move, { passive: true })
      window.addEventListener('pointerup', finish)
      window.addEventListener('pointercancel', cancel)
    },
    [cleanup, onMove],
  )

  const handlers = useCallback(
    (id: string) => ({
      'data-reorder-id': id,
      onPointerDown: (e: React.PointerEvent<HTMLElement>) =>
        onPointerDown(e, id),
    }),
    [onPointerDown],
  )

  return { handlers }
}
