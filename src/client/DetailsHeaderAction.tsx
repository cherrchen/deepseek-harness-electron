/**
 * Details Host header action primitive: one 28px round icon button with the
 * shared hover/focus feedback and a host-styled tooltip. Plugins contributing
 * to `shell.details.header.actions` render these instead of bespoke buttons so
 * every plugin's actions share size, radius, and spacing. `label` is the
 * single source for both the tooltip text and the button's accessible name.
 */
import type { ReactNode } from 'react'
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './DetailsHost.module.css'

/** Props for one Details header action icon button. */
export interface DetailsHeaderActionProps {
  /** Icon element rendered inside the button (host icon set or inline SVG). */
  icon: ReactNode
  /** Action name: tooltip text and aria-label; never rendered as button text. */
  label: string
  /** Invoked on click. */
  onTrigger: () => void
  /** Disables the button; the tooltip stays suppressed while disabled. */
  disabled?: boolean
}

/**
 * Render one header action icon button.
 * @param props - icon, label, trigger, and disabled flag.
 * @returns the tooltip-wrapped icon button.
 */
export function DetailsHeaderAction({ icon, label, onTrigger, disabled }: DetailsHeaderActionProps): ReactNode {
  return (
    <Tooltip label={label} side="bottom" delayMs={500} disabled={disabled ?? false}>
      <button
        type="button"
        className={css.headerAction}
        onClick={onTrigger}
        disabled={disabled}
        aria-label={label}
      >
        {icon}
      </button>
    </Tooltip>
  )
}
