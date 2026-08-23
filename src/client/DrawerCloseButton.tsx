/** Circular drawer close control; chrome matches upstream DetailsPanel. */

import type { ButtonHTMLAttributes } from 'react'
import { IconCloseOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './DrawerCloseButton.module.css'

export type DrawerCloseButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'type'>

/**
 * Render the 28px circular close button used by the host details panel.
 * @param props - native button attributes except type/children.
 * @returns the close button.
 */
export function DrawerCloseButton({ className, ...rest }: DrawerCloseButtonProps) {
  const classes = className === undefined ? css.close : `${css.close} ${className}`
  return (
    <button type="button" className={classes} {...rest}>
      <IconCloseOutline16 size={14} />
    </button>
  )
}
