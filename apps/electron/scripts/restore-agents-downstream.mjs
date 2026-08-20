#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const agentsPath = fileURLToPath(new URL('../../../AGENTS.md', import.meta.url))
const marker = '@AGENTS.downstream.md'

const content = await readFile(agentsPath, 'utf8')
if (content.trimEnd().endsWith(marker)) {
  console.log('AGENTS.md already references AGENTS.downstream.md')
  process.exit(0)
}

const restored = `${content.trimEnd()}\n\n${marker}\n`
await writeFile(agentsPath, restored)
console.log('Restored AGENTS.downstream.md reference in AGENTS.md')
