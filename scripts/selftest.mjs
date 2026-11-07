// 离线自检：真实 CSV 解析 + 工具注册 + 技能 + 面板 API。零网络零 key。
import { existsSync, mkdtempSync, mkdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// 沙箱限制：临时目录放工作区 .tmp/
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const TMP = join(ROOT, '.tmp')
mkdirSync(TMP, { recursive: true })
process.env.DSH_HOME = mkdtempSync(join(TMP, 'voc-selftest-'))

const { parseReviewCsvFile } = await import('../lib/csv-parser.js')
const { TOOLS } = await import('../src/host.js')
const { createSkillProvider } = await import('../lib/skills.js')

let failed = 0
const step = async (name, fn) => {
  process.stdout.write(`- ${name} … `)
  try {
    await fn()
    console.log('ok')
  } catch (err) {
    failed++
    console.log('失败')
    console.error(`  ${err.message}`)
  }
}

await step('真实样例 CSV 解析（test/sample-data.csv）', () => {
  const sample = join(ROOT, 'test', 'sample-data.csv')
  if (!existsSync(sample)) throw new Error('缺样例文件')
  const { reviews, matchedColumns } = parseReviewCsvFile(sample)
  if (reviews.length === 0) throw new Error('解析 0 条评论')
  if (!('content' in matchedColumns)) throw new Error('未匹配内容列')
})

await step('4 个 VOC 工具注册且 schema 合规', () => {
  if (TOOLS.length !== 4) throw new Error(`工具 ${TOOLS.length} ≠ 4`)
  for (const t of TOOLS) {
    if (!/^voc_/.test(t.name)) throw new Error(`工具名前缀错：${t.name}`)
    if (t.parameters.additionalProperties !== false) throw new Error(`${t.name} 缺 additionalProperties:false`)
  }
})

await step('技能：四维模型 + 两步流程 + 工具引用', async () => {
  const provider = createSkillProvider([join(ROOT, 'skills')])
  const candidates = await provider.list()
  if (candidates.length !== 1) throw new Error(`候选 ${candidates.length} ≠ 1`)
  const skill = await provider.get(candidates[0])
  for (const keyword of ['人群与场景', '功能价值', '保障价值', '体验价值', 'voc_parse_csv', 'voc_wordfreq', 'voc_persona', 'voc_summary']) {
    if (!skill.content.includes(keyword)) throw new Error(`缺「${keyword}」`)
  }
})

await step('上游明文 key 不入包（全局扫描）', () => {
  const LEAKED = 'sssss' + 'sssy0sUi' // 打乱写避免自匹配
  function* walk(dir) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory()) yield* walk(p)
      else yield p
    }
  }
  for (const dir of ['src', 'lib', 'skills', 'scripts', 'test']) {
    for (const file of walk(join(ROOT, dir))) {
      if (file === import.meta.filename) continue
      if (readFileSync(file, 'utf8').includes(LEAKED)) throw new Error(`明文 key 出现在 ${file}`)
    }
  }
})

await step('面板 API 健康/技能目录（内存 ctx 模拟）', async () => {
  const { registerApi } = await import('../lib/api.js')
  const captured = []
  const fakeRes = { writeHead() { return this }, end(chunk) { captured.push(String(chunk)) } }
  const fakeCtx = {
    get: () => ({ requestRejection: () => false }),
    webServer: { register: async ({ handler }) => { globalThis.__vocHandler = handler } },
  }
  await registerApi(fakeCtx, { skillDirs: [join(ROOT, 'skills')] })
  const handler = globalThis.__vocHandler
  if (!handler) throw new Error('路由未注册')
  await handler({ method: 'GET', url: '/amazon-voc/api/health', headers: {} }, fakeRes)
  if (!JSON.parse(captured.at(-1)).ok) throw new Error('health 错误')
  captured.length = 0
  await handler({ method: 'GET', url: '/amazon-voc/api/skills', headers: {} }, fakeRes)
  if (JSON.parse(captured.at(-1)).count !== 1) throw new Error('技能目录数量错')
})

if (failed > 0) {
  console.error(`\n自检失败 ${failed} 项`)
  process.exit(1)
}
console.log('\n全部通过。')

import { readdirSync } from 'node:fs'
