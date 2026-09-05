/**
 * Launcher contribution registry. The Launcher is generated dynamically from
 * live contributions — plugins register on load and dispose on unload; no
 * plugin is hardcoded into the Launcher.
 */
import type { DetailsLauncherContribution } from './contract.ts'

/** Mutable registry of Launcher contributions. */
export class DetailsLauncherRegistry {
  readonly #byId = new Map<string, DetailsLauncherContribution>()

  /**
   * Register one contribution. Duplicate ids throw.
   * @param contribution - launcher card metadata and open intent.
   * @returns disposer that removes the contribution.
   */
  register(contribution: DetailsLauncherContribution): () => void {
    const id = contribution.id
    if (this.#byId.has(id)) {
      throw new Error(`shellDetails: launcher contribution ${JSON.stringify(id)} is already registered`)
    }
    this.#byId.set(id, contribution)
    return () => {
      if (this.#byId.get(id) === contribution) this.#byId.delete(id)
    }
  }

  /**
   * Visible contributions, sorted by ascending `order` (ties keep
   * registration order), with `when()` predicates applied.
   * @returns the rendered card list.
   */
  list(): DetailsLauncherContribution[] {
    const visible: DetailsLauncherContribution[] = []
    for (const contribution of this.#byId.values()) {
      if (contribution.when !== undefined) {
        try {
          if (!contribution.when()) continue
        } catch (error) {
          console.error(`shellDetails: launcher when(${JSON.stringify(contribution.id)}) failed`, error)
          continue
        }
      }
      visible.push(contribution)
    }
    return visible.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  }

  /** Remove every contribution (host unload). */
  clear(): void {
    this.#byId.clear()
  }
}
