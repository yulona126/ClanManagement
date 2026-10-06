import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Ref,
} from 'react'
import {
  fetchGraph,
  type FamilyGraph,
  type GraphLink,
  type GraphNode,
} from '../../api/graph'
import { EmptyState } from '../../components/EmptyState'
import { Button } from '../../components/ui'
import { friendlyError } from '../../components/friendlyError'
import { useAuth } from '../../auth/AuthContext'
import { resolveMediaUrl } from '../media/mediaUrl'
import { formatBabyAge } from '../workspaces/age'
import { useWorkspace } from '../workspaces/WorkspaceContext'

type LaidOut = GraphNode & { x: number; y: number; angle: number }

const VIEW = 720
const CX = VIEW / 2
const CY = VIEW / 2
const BABY_R = 52
const NODE_R = 36
const ORBIT_INNER = 186
const ORBIT_OUTER = 262
const POP_GAP = 10
const POP_PAD = 10

type PopPlacement = 'top' | 'bottom' | 'left' | 'right'

type FloatLayout = {
  left: number
  top: number
  placement: PopPlacement
}

/** Flip + shift: prefer top, then bottom / sides; clamp into container. */
function placePopover(opts: {
  anchor: { left: number; top: number; width: number; height: number }
  popover: { width: number; height: number }
  container: { width: number; height: number }
  gap?: number
  pad?: number
}): FloatLayout {
  const gap = opts.gap ?? POP_GAP
  const pad = opts.pad ?? POP_PAD
  const { anchor: a, popover: p, container: c } = opts
  const ax = a.left + a.width / 2
  const ay = a.top + a.height / 2

  const candidates: Record<PopPlacement, { left: number; top: number }> = {
    top: { left: ax - p.width / 2, top: a.top - gap - p.height },
    bottom: { left: ax - p.width / 2, top: a.top + a.height + gap },
    right: { left: a.left + a.width + gap, top: ay - p.height / 2 },
    left: { left: a.left - gap - p.width, top: ay - p.height / 2 },
  }

  const overflow = (pos: { left: number; top: number }) => {
    const oL = Math.max(0, pad - pos.left)
    const oT = Math.max(0, pad - pos.top)
    const oR = Math.max(0, pos.left + p.width + pad - c.width)
    const oB = Math.max(0, pos.top + p.height + pad - c.height)
    return oL + oT + oR + oB
  }

  const order: PopPlacement[] = ['top', 'bottom', 'right', 'left']
  let placement: PopPlacement = 'top'
  let best = Infinity
  for (const pl of order) {
    const score = overflow(candidates[pl])
    if (score < best) {
      best = score
      placement = pl
    }
    if (score === 0) break
  }

  let { left, top } = candidates[placement]
  const maxL = Math.max(pad, c.width - p.width - pad)
  const maxT = Math.max(pad, c.height - p.height - pad)
  left = Math.min(Math.max(left, pad), maxL)
  top = Math.min(Math.max(top, pad), maxT)
  return { left, top, placement }
}

/** deg / sec — cruise */
const SPEED_CRUISE = 7
/** deg / sec — almost stopped on hover */
const SPEED_IDLE = 0.35
/** approach rate toward target speed */
const SPEED_LERP = 1.8

function clipIdFor(nodeId: string): string {
  return `fg-clip-${nodeId.replace(/[^a-zA-Z0-9_-]/g, '_')}`
}

function orbitRadius(node: GraphNode, index: number, total: number): number {
  if (node.generation === -1) return ORBIT_OUTER
  if (node.generation === 1) return ORBIT_INNER
  return index % 2 === 0 || total < 4 ? ORBIT_INNER : ORBIT_OUTER
}

function layoutNodes(nodes: GraphNode[]): LaidOut[] {
  const n = nodes.length
  if (n === 0) return []
  return nodes.map((node, i) => {
    const angle = -Math.PI / 2 + (i / n) * Math.PI * 2
    const radius = orbitRadius(node, i, n)
    return {
      ...node,
      angle,
      x: CX + Math.cos(angle) * radius,
      y: CY + Math.sin(angle) * radius,
    }
  })
}

function quadraticPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  bend = 0.22,
): string {
  const mx = (x1 + x2) / 2
  const my = (y1 + y2) / 2
  const dx = x2 - x1
  const dy = y2 - y1
  const qx = mx - dy * bend
  const qy = my + dx * bend
  return `M ${x1} ${y1} Q ${qx} ${qy} ${x2} ${y2}`
}

function avatarSrc(url: string | null | undefined): string {
  const t = (url || '').trim()
  return t ? resolveMediaUrl(t) : ''
}

function initialChar(label: string): string {
  const t = label.trim()
  return t ? t.slice(0, 1) : '?'
}

type FocusDetail =
  | {
      kind: 'baby'
      name: string
      age: string | null
      memberCount: number
      avatarUrl: string
    }
  | {
      kind: 'person'
      relation: string
      babyName: string
      bio: string
      isMe: boolean
      avatarUrl: string
    }

function FamilyPopoverFloat({
  detail,
  style,
  placement,
  placed,
  rootRef,
  onDismiss,
  onLayout,
}: {
  detail: FocusDetail
  style: CSSProperties
  placement: PopPlacement
  placed: boolean
  rootRef: Ref<HTMLDivElement>
  onDismiss: () => void
  onLayout?: () => void
}) {
  const src = avatarSrc(detail.avatarUrl)
  const title = detail.kind === 'baby' ? detail.name : detail.relation
  const fallback = initialChar(title)
  const meta =
    detail.kind === 'baby'
      ? [detail.age, `${detail.memberCount} 位家人`].filter(Boolean).join(' · ')
      : detail.isMe
        ? `我 · ${detail.babyName}的${detail.relation}`
        : `${detail.babyName}的${detail.relation}`
  const bio = detail.kind === 'person' ? detail.bio : ''

  return (
    <div
      ref={rootRef}
      className={`family-popover-float is-${placement}${placed ? ' is-placed' : ''}`}
      style={style}
      role="dialog"
      aria-label={title}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <article className="family-popover">
        <div className={`family-popover-banner${src ? '' : ' is-empty'}`}>
          {src ? (
            <img src={src} alt="" onLoad={onLayout} />
          ) : (
            <span className="family-popover-banner-fallback" aria-hidden>
              {fallback}
            </span>
          )}
          <button
            type="button"
            className="family-popover-dismiss"
            aria-label="收起"
            onClick={onDismiss}
          >
            ×
          </button>
        </div>
        <div className="family-popover-body">
          <h2 className="family-popover-title">{title}</h2>
          {meta ? <p className="family-popover-meta">{meta}</p> : null}
          {bio ? <p className="family-popover-bio">{bio}</p> : null}
        </div>
      </article>
    </div>
  )
}

function AvatarDisk({
  id,
  diskR,
  avatarUrl,
  label,
  variant,
}: {
  id: string
  diskR: number
  avatarUrl: string
  label: string
  variant: 'member' | 'baby'
}) {
  const src = avatarSrc(avatarUrl)
  const clip = clipIdFor(id)
  const diskClass =
    variant === 'baby' ? 'family-center-disk' : 'family-person-disk'
  const ringClass =
    variant === 'baby' ? 'family-center-ring' : 'family-person-ring'

  return (
    <g data-family-anchor={id}>
      {/* Transparent hit target — avatar/ring use pointer-events:none */}
      <circle className="family-hit" r={diskR} />
      {src ? (
        <>
          <g clipPath={`url(#${clip})`}>
            <image
              href={src}
              x={-diskR}
              y={-diskR}
              width={diskR * 2}
              height={diskR * 2}
              preserveAspectRatio="xMidYMid slice"
            />
          </g>
          <circle className={ringClass} r={diskR} />
        </>
      ) : (
        <>
          <circle className={diskClass} r={diskR} />
          <text
            y={variant === 'baby' ? 7 : 6}
            textAnchor="middle"
            className={
              variant === 'baby'
                ? 'family-center-name'
                : 'family-person-initial'
            }
          >
            {initialChar(label)}
          </text>
        </>
      )}
      {variant === 'member' ? (
        <text y={diskR + 16} textAnchor="middle" className="family-person-label">
          {label}
        </text>
      ) : src ? (
        <text
          y={diskR + 18}
          textAnchor="middle"
          className="family-person-label family-person-label--baby"
        >
          {label}
        </text>
      ) : null}
    </g>
  )
}

export function FamilyPage() {
  const { current } = useWorkspace()
  const { user } = useAuth()
  const [graph, setGraph] = useState<FamilyGraph | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [focusId, setFocusId] = useState<string | null>(null)
  const [floatPos, setFloatPos] = useState<FloatLayout | null>(null)

  const orbitRef = useRef<SVGGElement | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)
  const uprightRefs = useRef<Map<string, SVGGElement>>(new Map())
  const angleRef = useRef(0)
  const speedRef = useRef(SPEED_CRUISE)
  const hoverRef = useRef(false)
  const focusRef = useRef<string | null>(null)

  const load = useCallback(async () => {
    if (!current) {
      setGraph(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      setGraph(await fetchGraph(current.id))
    } catch (err) {
      setError(friendlyError(err, '加载家族图谱失败'))
    } finally {
      setLoading(false)
    }
  }, [current])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    focusRef.current = focusId
  }, [focusId])

  const laidOut = useMemo(
    () => (graph ? layoutNodes(graph.nodes) : []),
    [graph],
  )
  const nodeMap = useMemo(() => {
    const m = new Map<string, LaidOut>()
    for (const n of laidOut) m.set(n.id, n)
    return m
  }, [laidOut])

  const clipDefs = useMemo(() => {
    if (!graph) return null
    const ids = [
      ...graph.nodes.map((n) => ({ id: n.id, r: NODE_R })),
      { id: graph.baby.id, r: BABY_R },
    ]
    return ids.map(({ id, r }) => (
      <clipPath key={id} id={clipIdFor(id)}>
        <circle r={r} />
      </clipPath>
    ))
  }, [graph])

  const related = useMemo(() => {
    if (!focusId || !graph) return new Set<string>()
    const s = new Set<string>([focusId])
    for (const link of graph.links) {
      if (link.source === focusId || link.target === focusId) {
        s.add(link.source)
        s.add(link.target)
      }
    }
    return s
  }, [focusId, graph])

  const focusDetail = useMemo((): FocusDetail | null => {
    if (!focusId || !graph) return null
    if (focusId === graph.baby.id) {
      return {
        kind: 'baby',
        name: graph.baby.name,
        age: formatBabyAge(graph.baby.birthday),
        memberCount: graph.nodes.length,
        avatarUrl: graph.baby.avatar_url,
      }
    }
    const node = graph.nodes.find((n) => n.id === focusId)
    if (!node) return null
    return {
      kind: 'person',
      relation: node.relation_to_baby || node.display_name || node.username,
      babyName: graph.baby.name,
      bio: node.bio || '',
      isMe: node.user_id === user?.id,
      avatarUrl: node.avatar_url,
    }
  }, [focusId, graph, user?.id])

  const updateFloatPos = useCallback(() => {
    if (!focusId || !svgRef.current || !canvasRef.current) {
      setFloatPos(null)
      return
    }
    const anchor = svgRef.current.querySelector<SVGElement>(
      `[data-family-anchor="${CSS.escape(focusId)}"]`,
    )
    const pop = popoverRef.current
    if (!anchor || !pop) {
      setFloatPos(null)
      return
    }
    const a = anchor.getBoundingClientRect()
    const c = canvasRef.current.getBoundingClientRect()
    const next = placePopover({
      anchor: {
        left: a.left - c.left,
        top: a.top - c.top,
        width: a.width,
        height: a.height,
      },
      popover: { width: pop.offsetWidth, height: pop.offsetHeight },
      container: { width: c.width, height: c.height },
    })
    setFloatPos((prev) => {
      if (
        prev &&
        prev.placement === next.placement &&
        Math.abs(prev.left - next.left) < 0.5 &&
        Math.abs(prev.top - next.top) < 0.5
      ) {
        return prev
      }
      return next
    })
  }, [focusId])

  useLayoutEffect(() => {
    if (!focusId || !focusDetail) {
      setFloatPos(null)
      return
    }
    updateFloatPos()
    const id = requestAnimationFrame(() => updateFloatPos())
    window.addEventListener('resize', updateFloatPos)
    return () => {
      cancelAnimationFrame(id)
      window.removeEventListener('resize', updateFloatPos)
    }
  }, [updateFloatPos, graph, focusId, focusDetail])

  // Orbit rotates; hover slows down; selection freezes angle (no DOM flicker).
  useEffect(() => {
    let raf = 0
    let last = performance.now()

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now

      if (!focusRef.current) {
        const target = hoverRef.current ? SPEED_IDLE : SPEED_CRUISE
        speedRef.current +=
          (target - speedRef.current) * Math.min(1, SPEED_LERP * dt)
        angleRef.current =
          (angleRef.current + speedRef.current * dt) % 360
      } else {
        speedRef.current = 0
      }

      const a = angleRef.current
      if (orbitRef.current) {
        orbitRef.current.setAttribute(
          'transform',
          `rotate(${a} ${CX} ${CY})`,
        )
      }
      for (const el of uprightRefs.current.values()) {
        el.setAttribute('transform', `rotate(${-a})`)
      }
      if (!document.hidden) {
        raf = requestAnimationFrame(tick)
      }
    }

    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf)
        raf = 0
      } else {
        last = performance.now()
        raf = requestAnimationFrame(tick)
      }
    }

    document.addEventListener('visibilitychange', onVisibility)
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  function toggleFocus(id: string) {
    setFocusId((prev) => (prev === id ? null : id))
  }

  function clearFocus() {
    setFocusId(null)
  }

  if (!current) {
    return (
      <EmptyState
        title="先选一个宝宝空间"
        hint="在「空间」里选择后再看家族图谱。"
        action={
          <Button variant="primary" to="/spaces">
            选择空间
          </Button>
        }
      />
    )
  }

  const babyId = graph?.baby.id

  return (
    <div className="family-stage">
      {error ? <p className="form-error family-stage-error">{error}</p> : null}
      {loading && !graph ? <p className="meta family-stage-error">加载中…</p> : null}

      {graph && graph.nodes.length === 0 ? (
        <EmptyState
          title="还没有成员"
          hint="邀请家人后，这里会围着宝宝展开。"
        />
      ) : null}

      {graph && graph.nodes.length > 0 ? (
        <div className="family-stage-body">
          <div
            ref={canvasRef}
            className="family-stage-canvas"
            onPointerEnter={() => {
              hoverRef.current = true
            }}
            onPointerLeave={() => {
              hoverRef.current = false
            }}
          >
            <svg
              ref={svgRef}
              className="family-graph"
              viewBox={`0 0 ${VIEW} ${VIEW}`}
              role="img"
              aria-label={`${graph.baby.name} 的家族图谱`}
              onClick={() => clearFocus()}
            >
              <defs>
                <radialGradient id="fg-wash" cx="50%" cy="50%" r="55%">
                  <stop offset="0%" stopColor="#f4f4f4" />
                  <stop offset="70%" stopColor="#fafafa" stopOpacity="0.55" />
                  <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                </radialGradient>
                {clipDefs}
              </defs>

              <circle cx={CX} cy={CY} r={ORBIT_OUTER + 48} fill="url(#fg-wash)" />

              <g ref={orbitRef}>
                <circle className="family-ring" cx={CX} cy={CY} r={ORBIT_INNER} />
                <circle
                  className="family-ring family-ring--outer"
                  cx={CX}
                  cy={CY}
                  r={ORBIT_OUTER}
                />

                {graph.links.map((link) => (
                  <GraphEdge
                    key={link.id}
                    link={link}
                    baby={{ x: CX, y: CY }}
                    nodeMap={nodeMap}
                    focused={
                      focusId == null ||
                      link.source === focusId ||
                      link.target === focusId
                    }
                  />
                ))}

                {laidOut.map((node, i) => {
                  const isMe = node.user_id === user?.id
                  const dimmed = focusId != null && !related.has(node.id)
                  const label =
                    node.relation_to_baby || node.display_name || node.username
                  return (
                    <g
                      key={node.id}
                      className={`family-person${focusId === node.id ? ' is-focus' : ''}${dimmed ? ' is-dim' : ''}${isMe ? ' is-me' : ''}`}
                      transform={`translate(${node.x} ${node.y})`}
                      style={{ ['--i' as string]: i }}
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleFocus(node.id)
                      }}
                    >
                      <g
                        ref={(el) => {
                          if (el) uprightRefs.current.set(node.id, el)
                          else uprightRefs.current.delete(node.id)
                        }}
                      >
                        <g className="family-person-inner">
                          <AvatarDisk
                            id={node.id}
                            diskR={NODE_R}
                            avatarUrl={node.avatar_url}
                            label={label}
                            variant="member"
                          />
                        </g>
                      </g>
                    </g>
                  )
                })}
              </g>

              <g
                className={`family-center${focusId === babyId ? ' is-focus' : ''}${focusId != null && babyId && !related.has(babyId) ? ' is-dim' : ''}`}
                transform={`translate(${CX} ${CY})`}
                onClick={(e) => {
                  e.stopPropagation()
                  if (babyId) toggleFocus(babyId)
                }}
              >
                <circle
                  className="family-center-halo"
                  cx={0}
                  cy={0}
                  r={BABY_R + 12}
                />
                <AvatarDisk
                  id={graph.baby.id}
                  diskR={BABY_R}
                  avatarUrl={graph.baby.avatar_url}
                  label={graph.baby.name}
                  variant="baby"
                />
              </g>
            </svg>

            {focusDetail ? (
              <FamilyPopoverFloat
                key={focusId}
                rootRef={popoverRef}
                detail={focusDetail}
                placement={floatPos?.placement ?? 'top'}
                placed={floatPos != null}
                style={{
                  left: floatPos?.left ?? 0,
                  top: floatPos?.top ?? 0,
                }}
                onDismiss={clearFocus}
                onLayout={updateFloatPos}
              />
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function GraphEdge({
  link,
  baby,
  nodeMap,
  focused,
}: {
  link: GraphLink
  baby: { x: number; y: number }
  nodeMap: Map<string, LaidOut>
  focused: boolean
}) {
  const from = nodeMap.get(link.source)
  if (!from) return null

  if (link.kind === 'to_baby') {
    return (
      <g className={`family-edge is-to-baby${focused ? '' : ' is-dim'}`}>
        <line x1={from.x} y1={from.y} x2={baby.x} y2={baby.y} />
      </g>
    )
  }

  const to = nodeMap.get(link.target)
  if (!to) return null
  return (
    <g className={`family-edge is-peer${focused ? '' : ' is-dim'}`}>
      <path
        d={quadraticPath(from.x, from.y, to.x, to.y)}
        fill="none"
      />
    </g>
  )
}
