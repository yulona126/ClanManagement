import type { ReactNode } from 'react'
import { Button } from './ui'

export function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />
}

export function FeedSkeleton() {
  return (
    <div className="feed-skeleton" aria-busy="true" aria-label="加载中">
      {[0, 1, 2].map((i) => (
        <div key={i} className="feed-card feed-card--skeleton">
          <SkeletonBlock className="feed-avatar-skel" />
          <div className="feed-card-main">
            <SkeletonBlock className="skeleton-line short" />
            <SkeletonBlock className="skeleton-line" />
            <SkeletonBlock className="skeleton-thumb" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string
  hint?: string
  action?: ReactNode
}) {
  return (
    <section className="ui-empty">
      <h2 className="ui-empty-title">{title}</h2>
      {hint ? <p className="ui-empty-hint">{hint}</p> : null}
      {action ? <div className="ui-empty-action">{action}</div> : null}
    </section>
  )
}

export function EmptyComposeLink() {
  return (
    <Button variant="primary" to="/compose">
      发第一条动态
    </Button>
  )
}
