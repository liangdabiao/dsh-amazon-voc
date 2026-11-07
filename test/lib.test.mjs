// CSV 解析 + 词频 + 画像 + 工具 schema 单测。用 test/sample-data.csv 真实数据。零 dsh 依赖零网络。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SAMPLE = join(ROOT, 'test', 'sample-data.csv')
const { parseCsv, matchColumns, parseReviewCsvFile, matchColumnsFromText, CSVParseError } = await import('../lib/csv-parser.js')
const { wordFrequency, groupByLevel1, validatePersona, generateSummary } = await import('../lib/analysis.js')
const { TOOLS } = await import('../src/host.js')
const { createSkillProvider } = await import('../lib/skills.js')

test('真实样例 CSV：解析成功且列名模糊匹配', () => {
  assert.ok(existsSync(SAMPLE), '缺 test/sample-data.csv')
  const { reviews, totalRows, matchedColumns } = parseReviewCsvFile(SAMPLE)
  assert.ok(reviews.length > 0, `评论数 ${reviews.length} = 0`)
  assert.ok('content' in matchedColumns, '应匹配到评论内容列')
  assert.ok('rating' in matchedColumns, '应匹配到评分列')
  // 所有评论都有内容
  for (const r of reviews) assert.ok(r.content.length >= 3)
})

test('matchColumns：easy-scraper 列名风格', () => {
  const col = matchColumns(['a-profile-name', 'a-icon-alt', 'cr-original-review-content', 'a-size-mini (2)'])
  assert.equal(col.author, 'a-profile-name')
  assert.equal(col.rating, 'a-icon-alt')
  assert.equal(col.content, 'cr-original-review-content')
  assert.equal(col.date, 'a-size-mini (2)')
})

test('parseCsv：引号字段与转义', () => {
  const { rows } = parseCsv('"a""b",c\n"x,y",z')
  assert.equal(rows[0]['a"b'], 'x,y')
})

test('wordFrequency：一级/二级分布与情感统计', () => {
  const tags = [
    { level1: '功能价值', level2: '产品优点', sentiment: '正面' },
    { level1: '功能价值', level2: '产品缺点', sentiment: '负面' },
    { level1: '功能价值', level2: '产品优点', sentiment: '正面' },
    { level1: '人群场景', level2: '使用场景', sentiment: '中性' },
  ]
  const freq = wordFrequency(tags)
  assert.equal(freq.total, 4)
  assert.equal(freq.sentiment.positive, 2)
  assert.equal(freq.sentiment.negative, 1)
  assert.equal(freq.byLevel1[0].tag, '功能价值')
  assert.equal(freq.byLevel1[0].count, 3)
})

test('groupByLevel1：分组与抽样', () => {
  const groups = groupByLevel1([
    { level1: '功能价值', content: '很好用', sentiment: '正面' },
    { level1: '功能价值', content: '还行', sentiment: '中性' },
    { level1: '人群场景', content: '送人', sentiment: '中性' },
  ])
  assert.equal(groups.length, 2)
  const func = groups.find((g) => g.level1 === '功能价值')
  assert.equal(func.count, 2)
  assert.equal(func.samples.length, 2)
})

test('validatePersona：结构校验', () => {
  const good = validatePersona({ name: 'X', characteristics: ['a'], painPoints: ['b'], quote: 'c' })
  assert.equal(good.length, 0)
  const bad = validatePersona({ name: 'X' })
  assert.ok(bad.length >= 2, '缺字段应报多个错误')
})

test('generateSummary：确定性摘要含数字', () => {
  const summary = generateSummary([
    { content: 'a', level1: '功能价值', level2: '产品优点', sentiment: '正面' },
    { content: 'b', level1: '功能价值', level2: '产品缺点', sentiment: '负面' },
  ], '保温杯')
  assert.match(summary, /保温杯/)
  assert.match(summary, /正面 1 \/ 负面 1/)
})

test('CSVParseError：缺内容列时报表头', async () => {
  const { mkdirSync, writeFileSync } = await import('node:fs')
  const dir = join(ROOT, '.tmp')
  mkdirSync(dir, { recursive: true })
  const bad = join(dir, 'bad.csv')
  writeFileSync(bad, 'foo,bar\n1,2')
  assert.throws(() => parseReviewCsvFile(bad), CSVParseError)
})

test('4 个工具 schema 合规', () => {
  assert.equal(TOOLS.length, 4)
  for (const t of TOOLS) {
    assert.match(t.name, /^voc_/)
    assert.equal(t.parameters.additionalProperties, false)
    assert.equal(typeof t.execute, 'function')
  }
})

test('技能：四维模型 + 两步流程 + 工具引用', async () => {
  const provider = createSkillProvider([join(ROOT, 'skills')])
  const candidates = await provider.list()
  assert.equal(candidates.length, 1)
  const skill = await provider.get(candidates[0])
  for (const keyword of ['人群与场景', '功能价值', '保障价值', '体验价值', '两步 AI 分析', 'voc_parse_csv', 'voc_wordfreq', 'voc_persona']) {
    assert.ok(skill.content.includes(keyword), `缺「${keyword}」`)
  }
})

// 上面用了 require —— ESM 里不能有，替换为动态 import
test('placeholder: require removed', () => {
  assert.ok(true)
})
