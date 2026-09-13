#!/usr/bin/env node
/**
 * docs:check —— 项目文档系统机器校验。
 *
 * 规则本体在 `.agent/skills/documentation/SKILL.md`；本脚本只机械执行其中
 * 机器可判定的部分（双语配对、链接有效性、命名规范、绝对路径禁令、必需
 * 骨架），不评价文档质量、架构正确性或翻译自然度——那些由人与 Agent 做
 * semantic review。
 *
 * 纯检查、零第三方依赖、可独立运行：`node scripts/check-docs.mjs`。
 * 发现违规时逐条列出文件与原因，exit code 1；全部通过 exit code 0。
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** 遍历与链接检查跳过的目录（VCS 元数据、依赖、构建产物）。 */
const IGNORED_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'coverage',
  'lib',
  '.pnpm-store',
  '.zcode',
]);

/** 必须存在的文档系统骨架（相对仓库根）。 */
const REQUIRED_PATHS = [
  'docs/requirements',
  'docs/architecture',
  'docs/decisions',
  'docs/plans/active',
  'docs/plans/completed',
  'docs/development',
  'docs/reference',
  'docs/troubleshooting',
  'docs/README.md',
  '.agent/note',
  '.agent/skills/documentation/SKILL.md',
  '.agent/templates/plan.md',
  '.agent/templates/adr.md',
  '.agent/templates/design.md',
];

/**
 * README 配对例外：目录（相对根，'' 表示仓库根）→ 英文版文件名。
 * 根目录沿用包发布既有惯例 README.md(英文) ↔ README.zh.md(中文)；
 * 其余目录一律 README.md(中文 canonical) ↔ README.en.md(英文副版)。
 */
const README_PAIR_EXCEPTIONS = new Map([['', 'README.zh.md']]);

/**
 * 确实要讨论路径格式本身的文档在此豁免绝对路径禁令（相对根路径）。
 * 默认为空：新增豁免必须在 SKILL.md 或该文档内说明理由。
 */
const ABSOLUTE_PATH_ALLOWLIST = new Set([]);

/** 文件名中禁止出现的临时性 token（小写精确匹配，按 -_. 切分）。 */
const BANNED_NAME_TOKENS = new Set([
  'temp',
  'tmp',
  'draft',
  'final',
  'notes',
  'scratch',
  'test',
  'new',
]);

/** 错误英文后缀：正确形式只有 `foo.en.md`。 */
const WRONG_EN_SUFFIX = /(_en|-en|_eng|-eng|\.eng)\.md$|\.eng$/i;

/** ADR 文件名。 */
const ADR_NAME = /^ADR-\d{4}-[a-z0-9]+(-[a-z0-9]+)*\.md$/;

// ---------------------------------------------------------------------------
// 文件收集
// ---------------------------------------------------------------------------

/** @returns {string[]} 相对仓库根、以 / 分隔的全部文件路径 */
function walkFiles() {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) walk(join(dir, entry.name));
      } else if (entry.isFile()) {
        files.push(relative(ROOT, join(dir, entry.name)).split('\\').join('/'));
      }
    }
  };
  walk(ROOT);
  return files.sort();
}

const allFiles = walkFiles();
const mdFiles = allFiles.filter((f) => f.toLowerCase().endsWith('.md'));

// ---------------------------------------------------------------------------
// Markdown 处理
// ---------------------------------------------------------------------------

/** 去除围栏代码块（``` 与 ~~~），保留其余行。 */
function stripFencedCode(text) {
  const out = [];
  let fence = null;
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (m) {
      const marker = m[1][0];
      if (fence === null) fence = marker;
      else if (marker === fence) fence = null;
      continue;
    }
    if (fence === null) out.push(line);
  }
  return out.join('\n');
}

/** 提取行内链接与引用式链接定义的 target。 */
function extractLinkTargets(text) {
  const targets = [];
  const inline = /\[[^\]]*\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/g;
  for (const match of text.matchAll(inline)) targets.push(match[1]);
  const refDef = /^[ \t]{0,3}\[[^\]]+\]:[ \t]+(\S+)[ \t]*$/gm;
  for (const match of text.matchAll(refDef)) targets.push(match[1]);
  return targets;
}

/**
 * 判断一个链接 target 是否指向仓库内文件；返回 { internal, reason }。
 * internal 为 false 且 reason 非空表示违规。
 */
function classifyLinkTarget(rawTarget) {
  if (rawTarget === '' || rawTarget.startsWith('#')) return { internal: false, reason: null };
  if (/^(https?|mailto):/i.test(rawTarget)) return { internal: false, reason: null };
  if (/^file:\/\//i.test(rawTarget)) return { internal: false, reason: 'file:// 协议链接被禁止' };
  if (rawTarget.includes('://')) return { internal: false, reason: null };
  if (rawTarget.startsWith('/') || rawTarget.startsWith('\\')) {
    return { internal: false, reason: '绝对路径链接被禁止，必须使用相对链接' };
  }
  return { internal: true, reason: null };
}

/** 解析仓库内相对链接 target，返回绝对路径或 null（越出仓库根）。 */
function resolveLinkTarget(fromFile, rawTarget) {
  const withoutFragment = rawTarget.split('#')[0].split('?')[0];
  if (withoutFragment === '') return null;
  let decoded;
  try {
    decoded = decodeURIComponent(withoutFragment);
  } catch {
    decoded = withoutFragment;
  }
  if (isAbsolute(decoded)) return null;
  const abs = resolve(dirname(join(ROOT, fromFile)), decoded);
  if (relative(ROOT, abs).startsWith('..')) return null;
  return abs;
}

// ---------------------------------------------------------------------------
// 校验
// ---------------------------------------------------------------------------

/** @type {{ file: string, reason: string }[]} */
const violations = [];
const violation = (file, reason) => violations.push({ file, reason });
let linkCount = 0;

function checkRequiredPaths() {
  for (const p of REQUIRED_PATHS) {
    if (!existsSync(join(ROOT, p))) violation(p, '文档系统必需路径缺失');
  }
}

function checkReadmePairs() {
  const dirs = new Set(mdFiles.map((f) => dirname(f) === '.' ? '' : dirname(f)));
  for (const dir of dirs) {
    const readmeMd = mdFiles.find((f) => (dir === '' ? !f.includes('/') : f.startsWith(`${dir}/`)) && basename(f) === 'README.md');
    const readmeEn = mdFiles.find((f) => (dir === '' ? !f.includes('/') : f.startsWith(`${dir}/`)) && basename(f) === 'README.en.md');
    const readmeZh = mdFiles.find((f) => (dir === '' ? !f.includes('/') : f.startsWith(`${dir}/`)) && basename(f) === 'README.zh.md');
    const partner = README_PAIR_EXCEPTIONS.get(dir) ?? 'README.en.md';

    if (readmeMd !== undefined) {
      const partnerPath = joinRel(dir, partner);
      const partnerPresent =
        partner === 'README.en.md' ? readmeEn !== undefined : readmeZh !== undefined;
      if (!allFiles.includes(partnerPath) || !partnerPresent) {
        violation(joinRel(dir, 'README.md'), `缺少配对的 ${partner}（双语强制，见 SKILL.md 双语规则）`);
      } else {
        checkMutualLinks(joinRel(dir, 'README.md'), joinRel(dir, partner));
      }
    }
    if (readmeEn !== undefined && readmeMd === undefined) {
      violation(joinRel(dir, 'README.en.md'), 'README.en.md 缺少配对的 README.md');
    }
    if (readmeZh !== undefined && dir !== '' && readmeMd === undefined) {
      violation(joinRel(dir, 'README.zh.md'), 'README.zh.md 仅允许作为仓库根既有惯例的中文版');
    }
  }
}

function basename(f) {
  return f.split('/').pop();
}

function joinRel(dir, name) {
  return dir === '' ? name : `${dir}/${name}`;
}

/** 两个 README 必须互相包含指向对方的相对链接。 */
function checkMutualLinks(fileA, fileB) {
  const rawA = readDoc(fileA);
  const rawB = readDoc(fileB);
  const targetsA = extractLinkTargets(stripFencedCode(rawA));
  const targetsB = extractLinkTargets(stripFencedCode(rawB));
  linkCount += targetsA.length + targetsB.length;
  const linksTo = (targets, from, target) =>
    targets.some((t) => {
      const c = classifyLinkTarget(t);
      if (!c.internal) return false;
      const abs = resolveLinkTarget(from, t);
      return abs !== null && abs === join(ROOT, target);
    });
  if (!linksTo(targetsA, fileA, fileB)) {
    violation(fileA, `缺少指向 ${fileB} 的导航链接（README 互相导航）`);
  }
  if (!linksTo(targetsB, fileB, fileA)) {
    violation(fileB, `缺少指向 ${fileA} 的导航链接（README 互相导航）`);
  }
}

const docCache = new Map();
function readDoc(relPath) {
  if (!docCache.has(relPath)) {
    docCache.set(relPath, existsSync(join(ROOT, relPath)) ? readDocFile(relPath) : '');
  }
  return docCache.get(relPath);
}

function readDocFile(relPath) {
  return readFileSync(join(ROOT, relPath), 'utf8');
}

function checkNotePairs() {
  const notePrefix = '.agent/note/';
  for (const f of mdFiles) {
    if (!f.startsWith(notePrefix)) continue;
    const base = basename(f);
    if (base === 'README.md' || base === 'README.en.md') continue;
    if (base.endsWith('.en.md')) {
      const zh = f.slice(0, -'.en.md'.length) + '.md';
      if (!mdFiles.includes(zh)) violation(f, `缺少配对的中文 canonical 版 ${zh}`);
    } else if (base !== 'README.md') {
      const en = f.slice(0, -'.md'.length) + '.en.md';
      if (!mdFiles.includes(en)) violation(f, `缺少配对的英文副版 ${en}（.agent/note/ 正式文档双语强制）`);
    }
  }
}

function checkAdrNames() {
  const seen = new Map();
  for (const f of mdFiles) {
    if (dirname(f) !== 'docs/decisions') continue;
    const base = basename(f);
    if (base === 'README.md' || base === 'README.en.md' || base === 'README.zh.md') continue;
    if (!ADR_NAME.test(base)) {
      violation(f, `ADR 文件名不符合 ADR-\\d{4}-[a-z0-9]+(-[a-z0-9]+)*.md（SKILL.md ADR 纪律）`);
      continue;
    }
    const number = base.slice('ADR-'.length, 'ADR-'.length + 4);
    if (seen.has(number)) {
      violation(f, `ADR 编号 ${number} 与 ${seen.get(number)} 重复（编号唯一不复用）`);
    } else {
      seen.set(number, f);
    }
  }
}

function checkLinks() {
  for (const f of mdFiles) {
    const targets = extractLinkTargets(stripFencedCode(readDoc(f)));
    for (const target of targets) {
      linkCount += 1;
      const c = classifyLinkTarget(target);
      if (!c.internal) {
        if (c.reason) violation(f, `链接 \`${target}\`：${c.reason}`);
        continue;
      }
      const abs = resolveLinkTarget(f, target);
      if (abs === null) {
        violation(f, `链接 \`${target}\`：越出仓库根或无法解析`);
      } else if (!existsSync(abs)) {
        violation(f, `链接 \`${target}\`：目标不存在`);
      }
    }
  }
}

function checkAbsolutePaths() {
  const patterns = [
    [/\/Users\//, '包含 macOS 用户目录绝对路径 /Users/...'],
    [/\/home\//, '包含 Linux 用户目录绝对路径 /home/...'],
    [/C:\\Users\\/i, '包含 Windows 用户目录绝对路径 C:\\Users\\...'],
    [/file:\/\//i, '包含 file:// 协议链接'],
  ];
  for (const f of mdFiles) {
    if (ABSOLUTE_PATH_ALLOWLIST.has(f)) continue;
    const body = stripFencedCode(readDoc(f));
    for (const [re, reason] of patterns) {
      if (re.test(body)) violation(f, `${reason}（围栏代码除外；如确需讨论路径格式，加入 ABSOLUTE_PATH_ALLOWLIST 并说明理由）`);
    }
  }
}

function checkNaming() {
  for (const f of mdFiles) {
    const base = basename(f);
    if (WRONG_EN_SUFFIX.test(base)) {
      violation(f, `错误英文后缀（正确形式只有 foo.en.md，见 SKILL.md 命名规则）`);
      continue;
    }
    const stem = base.replace(/\.en\.md$/i, '').replace(/\.md$/i, '');
    const tokens = stem.split(/[-_.]+/).filter(Boolean).map((t) => t.toLowerCase());
    const banned = tokens.find((t) => BANNED_NAME_TOKENS.has(t.replace(/\d+$/, '')));
    if (banned) {
      violation(f, `文件名含临时性 token "${banned}"（禁止 temp/draft/test/new/final/notes/scratch 类命名）`);
    }
  }
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------

checkRequiredPaths();
checkReadmePairs();
checkNotePairs();
checkAdrNames();
checkLinks();
checkAbsolutePaths();
checkNaming();

if (violations.length > 0) {
  console.error(`docs:check 失败：${violations.length} 项违规\n`);
  for (const { file, reason } of violations) {
    console.error(`  ✗ ${file}`);
    console.error(`      ${reason}\n`);
  }
  process.exit(1);
}

console.log(
  `docs:check 通过：${mdFiles.length} 个 Markdown 文件、${linkCount} 个链接、` +
    `${allFiles.length} 个文件名均已检查；ADR、双语配对、链接、命名、骨架无违规。`,
);
