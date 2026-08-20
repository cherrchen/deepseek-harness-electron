/**
 * @param {string} upstreamVersion
 * @returns {string}
 */
export function baseVersion(upstreamVersion) {
  const match = /^(\d+\.\d+\.\d+)/.exec(upstreamVersion)
  if (match === null) throw new Error(`Cannot derive base version from ${upstreamVersion}`)
  return match[1]
}

/**
 * @param {string} base
 * @param {readonly string[]} tags
 * @returns {number}
 */
export function nextBetaNumber(base, tags) {
  const prefix = `v${base}-beta.`
  let highest = 0
  for (const tag of tags) {
    if (!tag.startsWith(prefix)) continue
    const suffix = tag.slice(prefix.length)
    const value = Number.parseInt(suffix, 10)
    if (Number.isFinite(value) && value > highest) highest = value
  }
  return highest + 1
}

/**
 * @param {string} upstreamVersion
 * @param {readonly string[]} tags
 * @returns {string}
 */
export function nextBetaTag(upstreamVersion, tags) {
  const base = baseVersion(upstreamVersion)
  const beta = nextBetaNumber(base, tags)
  return `v${base}-beta.${String(beta)}`
}
