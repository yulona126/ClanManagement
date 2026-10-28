import { useCallback, useEffect, useRef } from 'react'

type DragState = {
  id: string
  el: HTMLElement
  x: number
  y: number
}

/**
 * 指针拖拽排序（鼠标 / 触屏通用）。
 *
 * 两个关键取舍：
 *
 * 1. **不用 HTML5 draggable**：iOS Safari 与多数移动浏览器对非原生元素
 *    不触发 dragstart/drop，手机上会完全没反应。
 *
 * 2. **松手时才落位**，而不是实时交换：实时交换时被拖元素会在手指下方
 *    不断换位，`elementFromPoint` 于是反复命中"新的目标"，出现 1→2→1→2 的抖动
 *    （实测顺序最终还原）。改成拖动时只高亮，抬手时按最后位置落到目标索引。
 *
 * 用法：每个可拖项挂 `handlers(id)`；容器上建议 `touch-action: none`。
 */
export function usePointerReorder(
  onMove: (fromId: string, toId: string) => void,
) {
  const dragRef = useRef<DragState | null>(null)

  const finish = useCallback(() => {
    const drag = dragRef.current
    if (!drag) return
    drag.el.classList.remove('is-dragging')

    const target = document
      .elementFromPoint(drag.x, drag.y)
      ?.closest<HTMLElement>('[data-reorder-id]')
    const to = target?.dataset.reorderId
    if (to && to !== drag.id) onMove(drag.id, to)

    dragRef.current = null
  }, [onMove])

  const cancel = useCallback(() => {
    dragRef.current?.el.classList.remove('is-dragging')
    dragRef.current = null
  }, [])

  useEffect(
    () => () => {
      dragRef.current?.el.classList.remove('is-dragging')
    },
    [],
  )

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>, id: string) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      const el = e.currentTarget
      dragRef.current = { id, el, x: e.clientX, y: e.clientY }
      el.classList.add('is-dragging')

      const move = (ev: PointerEvent) => {
        const drag = dragRef.current
        if (!drag) return
        drag.x = ev.clientX
        drag.y = ev.clientY
      }
      const cleanup = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        window.removeEventListener('pointercancel', onCancel)
      }
      const up = () => {
        cleanup()
        finish()
      }
      const onCancel = () => {
        cleanup()
        cancel()
      }

      window.addEventListener('pointermove', move, { passive: true })
      window.addEventListener('pointerup', up)
      window.addEventListener('pointercancel', onCancel)
    },
    [cancel, finish],
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
