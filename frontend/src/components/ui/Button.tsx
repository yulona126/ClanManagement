import {
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react'
import { Link, type To } from 'react-router-dom'

export type ButtonVariant = 'primary' | 'ghost' | 'danger' | 'link'

type CommonProps = {
  variant?: ButtonVariant
  block?: boolean
  children: ReactNode
  className?: string
}

type AsButton = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'> & {
    to?: undefined
  }

type AsLink = CommonProps & {
  to: To
  replace?: boolean
  disabled?: boolean
  type?: never
  onClick?: AnchorHTMLAttributes<HTMLAnchorElement>['onClick']
}

export type ButtonProps = AsButton | AsLink

function btnClass(
  variant: ButtonVariant,
  block: boolean | undefined,
  className: string | undefined,
  disabled: boolean | undefined,
): string {
  return [
    'ui-btn',
    `ui-btn--${variant}`,
    block ? 'ui-btn--block' : '',
    disabled ? 'is-disabled' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')
}

export function Button(props: ButtonProps) {
  const {
    variant = 'primary',
    block,
    className,
    children,
    disabled,
    ...rest
  } = props

  const cls = btnClass(variant, block, className, disabled)

  if ('to' in props && props.to != null) {
    const { to, replace, onClick } = props
    if (disabled) {
      return (
        <span className={cls} aria-disabled="true">
          {children}
        </span>
      )
    }
    return (
      <Link className={cls} to={to} replace={replace} onClick={onClick}>
        {children}
      </Link>
    )
  }

  const buttonProps = rest as ButtonHTMLAttributes<HTMLButtonElement>
  return (
    <button
      type={buttonProps.type ?? 'button'}
      className={cls}
      disabled={disabled}
      {...buttonProps}
    >
      {children}
    </button>
  )
}
