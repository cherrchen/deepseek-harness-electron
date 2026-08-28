/** Composer tool-row chip trigger; structure matches upstream PermissionSelect. */

import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { IconChevronDownOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './ComposerToolTrigger.module.css'

export interface ComposerToolTriggerProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Optional leading 16px glyph; renders at 14px on the trigger face. */
  icon?: ReactNode
  /** Primary trigger label. */
  label: ReactNode
  /** Override the default triggerLabel class (for caption or warn tones). */
  labelClassName?: string | undefined
  /** Symmetric compact chip for numeric badges (changes count). */
  metric?: boolean
  /** Show the PermissionSelect chevron seat. */
  chevron?: boolean
  /** Rotate the chevron while an anchored menu is open. */
  open?: boolean
}

/**
 * Render the PermissionSelect-style composer chip trigger.
 * @param props - icon, label, optional chevron, and native button attributes.
 * @returns the trigger button.
 */
export const ComposerToolTrigger = forwardRef<HTMLButtonElement, ComposerToolTriggerProps>(
  function ComposerToolTrigger(
    {
      icon, label, labelClassName, metric = false, chevron = false, open = false,
      type = 'button', className, ...rest
    },
    ref,
  ) {
    const chevronClass = open ? `${css.chevron} ${css.chevronOpen}` : css.chevron
    const triggerClass = metric
      ? `${css.trigger} ${css.triggerMetric}${className === undefined ? '' : ` ${className}`}`
      : `${css.trigger}${className === undefined ? '' : ` ${className}`}`
    return (
      <button ref={ref} type={type} className={triggerClass} {...rest}>
        {icon !== undefined && (
          <span className={css.triggerIcon} aria-hidden>{icon}</span>
        )}
        <span className={labelClassName ?? css.triggerLabel}>{label}</span>
        {chevron && (
          <span className={chevronClass} aria-hidden>
            <IconChevronDownOutline14 />
          </span>
        )}
      </button>
    )
  },
)
