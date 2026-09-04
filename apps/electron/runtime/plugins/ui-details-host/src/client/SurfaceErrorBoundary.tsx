/**
 * Error boundary around one details surface body: a plugin render error
 * isolates to its tab instead of crashing the dock or the app frame.
 */
import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import css from './SurfaceErrorBoundary.module.css'

interface SurfaceErrorBoundaryProps {
  /** Rendered surface body. */
  children: ReactNode
  /** Surface id for the diagnostic message. */
  surfaceId: string
}

interface SurfaceErrorBoundaryState {
  error: Error | null
}

/** Catch render errors from one surface contribution. */
export class SurfaceErrorBoundary extends Component<SurfaceErrorBoundaryProps, SurfaceErrorBoundaryState> {
  state: SurfaceErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): SurfaceErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`shellDetails: surface ${JSON.stringify(this.props.surfaceId)} crashed`, error, info.componentStack)
  }

  componentDidUpdate(prevProps: SurfaceErrorBoundaryProps): void {
    // A tab switch remounts via key; a same-surface payload change resets the
    // caught state so a recovered surface re-renders.
    if (prevProps.surfaceId !== this.props.surfaceId && this.state.error !== null) {
      this.setState({ error: null })
    }
  }

  render(): ReactNode {
    if (this.state.error !== null) {
      return (
        <div className={css.root} data-details-surface-error="">
          <p className={css.title}>This panel could not be rendered.</p>
          <p className={css.detail}>{this.props.surfaceId}</p>
        </div>
      )
    }
    return this.props.children
  }
}
