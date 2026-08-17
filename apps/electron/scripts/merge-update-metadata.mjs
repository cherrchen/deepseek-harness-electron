import { cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { load, dump } from 'js-yaml'

/** Merge per-architecture electron-builder metadata and collect release files. */
export async function collectReleaseArtifacts(inputDirectory, outputDirectory) {
  await mkdir(outputDirectory, { recursive: true })
  const files = await findFiles(inputDirectory)
  const metadata = new Map()
  for (const file of files) {
    const name = basename(file)
    if (/^latest(?:-mac|-linux(?:-[a-z0-9]+)?)?\.yml$/.test(name)) {
      const document = load(await readFile(file, 'utf8'))
      if (!isUpdateMetadata(document)) throw new Error(`Invalid updater metadata: ${file}`)
      const group = metadata.get(name) ?? []
      group.push(document)
      metadata.set(name, group)
      continue
    }
    await cp(file, join(outputDirectory, name), { errorOnExist: true, force: false })
  }
  for (const [name, documents] of metadata) {
    const [first] = documents
    if (first === undefined) continue
    const version = first.version
    if (documents.some(document => document.version !== version)) {
      throw new Error(`Updater metadata ${name} contains multiple versions.`)
    }
    const files = documents.flatMap(document => document.files)
    const urls = new Set(files.map(file => file.url))
    if (urls.size !== files.length) throw new Error(`Updater metadata ${name} contains duplicate files.`)
    const primary = files[0]
    if (primary === undefined) throw new Error(`Updater metadata ${name} contains no release files.`)
    const merged = {
      ...first,
      files,
      path: primary.url,
      sha512: primary.sha512,
    }
    await writeFile(join(outputDirectory, name), dump(merged, { lineWidth: -1, noRefs: true }), 'utf8')
  }
}

async function findFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(entry => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? findFiles(path) : [path]
  }))
  return nested.flat()
}

function isUpdateMetadata(value) {
  return typeof value === 'object' && value !== null
    && typeof value.version === 'string'
    && Array.isArray(value.files)
    && value.files.every(file => typeof file === 'object' && file !== null
      && typeof file.url === 'string' && typeof file.sha512 === 'string')
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [, , inputDirectory, outputDirectory] = process.argv
  if (inputDirectory === undefined || outputDirectory === undefined) {
    throw new Error('Usage: node merge-update-metadata.mjs <input-directory> <output-directory>')
  }
  await collectReleaseArtifacts(inputDirectory, outputDirectory)
}
