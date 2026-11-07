// Amazon 评论 VOC · 技能快照提供方。
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const RANK = 600
const INVOCATION = { modelInvocable: true, userInvocable: true }

function parse(file) {
  const text = readFileSync(file, 'utf8')
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!m) return null
  const block = m[1]
  const name = block.match(/^name:\s*(.+)$/m)?.[1]?.trim()
  let description = block.match(/^description:\s*(.+)$/m)?.[1]?.trim().replace(/^(["'])(.*)\1$/, '$2') || null
  if (!description) {
    const lines = block.split(/\r?\n/)
    const start = lines.findIndex((l) => /^description:\s*>/.test(l))
    if (start !== -1) {
      const collected = []
      for (let i = start + 1; i < lines.length; i++) {
        if (/^\S/.test(lines[i])) break
        collected.push(lines[i].replace(/^\s+/, ''))
      }
      description = collected.join(' ').trim()
    }
  }
  return name && description ? { name, description, body: text.slice(m[0].length) } : null
}

function readDir(dir) {
  if (!existsSync(dir)) return []
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const sDir = join(dir, entry.name)
    const skillFile = join(sDir, 'SKILL.md')
    if (!existsSync(skillFile)) continue
    const parsed = parse(skillFile)
    if (parsed) out.push({ dir: sDir, file: skillFile, ...parsed, dirName: entry.name })
  }
  return out
}

function addendum(skill) {
  return [
    '',
    '---',
    '',
    '## 在 DSH 插件里使用',
    '',
    `- 本技能目录：\`${skill.dir}\`。`,
    '- **流程**：①`voc_parse_csv` 解析评论 CSV → ②按四维价值模型生成标签体系 → ③逐条评论打标（一级/二级/三级 + 情感）→ ④`voc_wordfreq` 词频统计 → ⑤生成 3~5 个用户画像 → ⑥`voc_persona` 校验格式 → ⑦`voc_summary` 生成确定性摘要。',
    '- **确定性统计交给工具**：词频、情感分布、分组计数用工具算，不要手算（不会算错）。',
    '- **输出报告到当前工作区**（`reports/voc-<产品名>.md`），不要往插件安装目录写文件。',
    '- LLM 两步分析（标签体系生成 + 打标）由你（宿主模型）完成，不需要外部 API key。',
    '',
  ].join('\n')
}

export function createSkillProvider(dirs) {
  const list = [].concat(dirs)
  const candidate = (s) => ({
    name: s.name,
    description: s.description,
    path: s.file,
    invocation: INVOCATION,
    source: 'bundled',
    provider: 'amazon-voc',
    rank: RANK,
    locator: s.dir,
    resourceBase: { kind: 'directory', path: s.dir },
  })

  return {
    name: 'amazon-voc',
    async list() {
      return list.flatMap(readDir).map(candidate)
    },
    async get(c) {
      const s = list.flatMap(readDir).find((x) => x.dir === c.locator && x.name === c.name)
      if (!s) return undefined
      const content = s.body + addendum(s)
      const { rank, locator, ...summary } = candidate(s)
      return { ...summary, content }
    },
  }
}

export { readDir, addendum }
