// Amazon 评论 VOC · Host 半边。
// 工具：voc_parse_csv（CSV 解析）/ voc_wordfreq（词频统计）/ voc_summary（确定性摘要）。
// voc_persona（画像结构校验）。
// LLM 两步分析（标签体系生成 + 逐条打标）由宿主模型完成——技能正文有 prompt 模板指引。
import Schema from '@deepseek-ai/schemastery'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { readFileSync } from 'node:fs'
import { createSkillProvider } from '../lib/skills.js'
import { parseReviewCsvFile, CSVParseError } from '../lib/csv-parser.js'
import { wordFrequency, groupByLevel1, validatePersona, generateSummary } from '../lib/analysis.js'
import { registerApi } from '../lib/api.js'

export const name = 'amazon-voc'

export const inject = ['tools', 'skills', 'webServer', 'connection']

export const Config = Schema.object({
  maxRows: Schema.number().min(10).max(1000).default(500).description('CSV 最大解析行数'),
})

const configRef = { config: Config, rt: null }

const str = (description, extra = {}) => ({ type: 'string', description, ...extra })
const num = (description, extra = {}) => ({ type: 'number', description, ...extra })
const text = (value) => [{ type: 'text', text: value }]

const OUTPUT = {
  schema: {
    type: 'object', additionalProperties: false, required: ['ok', 'summary'],
    properties: {
      ok: { type: 'boolean' },
      summary: { type: 'string' },
      data: { type: 'string' },
    },
  },
  render: (_args, value) => text(value.data ? `${value.summary}\n\n${value.data}` : value.summary),
}

const result = (ok, summary, data = '') => ({ ok, summary, data })

/** 路径解析：工作区内相对路径或绝对路径 */
function resolveCsvPath(rt, path) {
  const p = String(path || '').trim()
  if (join(p).startsWith(rt.dataDir) || p.includes(':') || p.startsWith('/')) return p
  return join(rt.dataDir, 'uploads', p)
}

export const vocParseCsvTool = {
  name: 'voc_parse_csv',
  description:
    '解析 Amazon 评论 CSV 文件（easy-scraper 浏览器插件导出格式）：列名模糊匹配、提取评论内容/评分/日期/作者。' +
    'VOC 分析第一步。解析后按技能正文的两步 AI 流程（生成标签体系→逐条打标）继续。',
  parameters: {
    type: 'object', additionalProperties: false, required: ['path'],
    properties: {
      path: str('CSV 文件路径（工作区相对路径或绝对路径）'),
      max_rows: num('最大解析行数（默认 500，最多 1000）'),
    },
  },
  timeoutMs: 30_000,
  output: OUTPUT,
  async execute(args) {
    const rt = configRef.rt
    try {
      const p = resolveCsvPath(rt, args.path)
      const { reviews, totalRows, skipped, matchedColumns } = parseReviewCsvFile(p, { maxRows: args.max_rows || rt.maxRows })
      if (reviews.length === 0) {
        return result(true, `CSV「${args.path}」解析完成但没有任何有效评论（共 ${totalRows} 行，跳过 ${skipped} 行空行）。这不是错误：确认文件是否为 easy-scraper 导出的评论格式。`)
      }
      return result(
        true,
        `解析完成：${reviews.length} 条有效评论（总 ${totalRows} 行，跳过 ${skipped} 行）。` +
        `识别列：${Object.entries(matchedColumns).map(([f, h]) => `${f}←${h}`).join('、')}。` +
        `接下来按 amazon-voc-analysis 技能的两步 AI 流程（生成标签体系→逐条打标）分析。`,
        JSON.stringify(reviews.slice(0, 5), null, 1) + (reviews.length > 5 ? `\n…(共 ${reviews.length} 条，此处仅显示前 5 条)` : ''),
      )
    } catch (err) {
      if (err instanceof CSVParseError) return result(false, `CSV 解析失败：${err.message}`)
      throw err
    }
  },
}

export const vocWordfreqTool = {
  name: 'voc_wordfreq',
  description:
    '词频统计（确定性计算，不算错）：对打标结果统计一级/二级标签分布与情感分布。输入 JSON 数组 [{level1, level2, sentiment}]。',
  parameters: {
    type: 'object', additionalProperties: false, required: ['tags'],
    properties: {
      tags: str('打标结果 JSON 数组，如 [{"level1":"功能价值","level2":"产品优点","sentiment":"正面"}]'),
    },
  },
  timeoutMs: 15_000,
  output: OUTPUT,
  async execute(args) {
    let tags
    try { tags = JSON.parse(args.tags) } catch (e) { return result(false, `tags 不是合法 JSON: ${e.message}`) }
    if (!Array.isArray(tags) || tags.length === 0) return result(false, 'tags 必须是非空数组')
    const freq = wordFrequency(tags)
    return result(
      true,
      `词频统计完成（${freq.total} 条）：情感分布 正面 ${freq.sentiment.positive} / 负面 ${freq.sentiment.negative} / 中性 ${freq.sentiment.neutral}。`,
      JSON.stringify(freq, null, 1),
    )
  },
}

export const vocPersonaTool = {
  name: 'voc_persona',
  description:
    '校验并格式化用户画像。输入你基于评论生成的画像 JSON 数组（每项 name/characteristics/painPoints/quote），返回格式化 Markdown。',
  parameters: {
    type: 'object', additionalProperties: false, required: ['personas'],
    properties: {
      personas: str('画像 JSON 数组，如 [{"name":"价格敏感型妈妈","characteristics":["30-40岁","注重性价比"],"painPoints":["怕买到假货"],"quote":"太贵了不值得"}]'),
    },
  },
  timeoutMs: 10_000,
  output: OUTPUT,
  async execute(args) {
    let personas
    try { personas = JSON.parse(args.personas) } catch (e) { return result(false, `personas 不是合法 JSON: ${e.message}`) }
    if (!Array.isArray(personas) || personas.length === 0) return result(false, 'personas 必须是非空数组')
    if (personas.length > 5) return result(false, '画像最多 5 个')
    const allErrors = []
    for (let i = 0; i < personas.length; i++) {
      const errors = validatePersona(personas[i])
      if (errors.length) allErrors.push(`画像 ${i + 1}: ${errors.join('；')}`)
    }
    if (allErrors.length) return result(false, `画像格式有问题：${allErrors.join(' | ')}`)
    const md = personas.map((p) =>
      `## ${p.name}\n\n**特征**：${p.characteristics.join('、')}\n**痛点**：${p.painPoints.join('、')}\n**典型引言**：「${p.quote}」`,
    ).join('\n\n')
    return result(true, `${personas.length} 个用户画像已格式化：`, md)
  },
}

export const vocSummaryTool = {
  name: 'voc_summary',
  description:
    '生成确定性分析摘要（词频/情感分布/分组抽样）。输入完整打标结果 [{content, level1, level2, sentiment}]。',
  parameters: {
    type: 'object', additionalProperties: false, required: ['tagged_reviews'],
    properties: {
      tagged_reviews: str('完整打标结果 JSON 数组 [{content, level1, level2, sentiment}]'),
      product_name: str('产品名（默认「该产品」）'),
    },
  },
  timeoutMs: 15_000,
  output: OUTPUT,
  async execute(args) {
    let reviews
    try { reviews = JSON.parse(args.tagged_reviews) } catch (e) { return result(false, `tagged_reviews 不是合法 JSON: ${e.message}`) }
    if (!Array.isArray(reviews) || reviews.length === 0) return result(false, 'tagged_reviews 必须是非空数组')
    const summary = generateSummary(reviews, args.product_name || '该产品')
    const groups = groupByLevel1(reviews)
    return result(true, `分析摘要生成完成（${reviews.length} 条）。`, summary + '\n\n## 分组抽样\n' +
      groups.map((g) => `### ${g.level1}（${g.count} 条）\n` + g.samples.map((s) => `- 「${s.content.slice(0, 80)}」(${s.sentiment})`).join('\n')).join('\n\n'))
  },
}

export function apply(ctx, config) {
  const rt = {
    ...config,
    dataDir: join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'amazon-voc'),
  }
  configRef.config = config
  configRef.rt = rt

  ctx.skills.registerProvider(() => createSkillProvider([join(dirname(fileURLToPath(import.meta.url)), '..', 'skills')]))
  ctx.tools.register(vocParseCsvTool)
  ctx.tools.register(vocWordfreqTool)
  ctx.tools.register(vocPersonaTool)
  ctx.tools.register(vocSummaryTool)
  ctx.effect(() => registerApi(ctx, { skillDirs: [join(dirname(fileURLToPath(import.meta.url)), '..', 'skills')] }), `${name}: routes`)
}

export const TOOLS = [vocParseCsvTool, vocWordfreqTool, vocPersonaTool, vocSummaryTool]
