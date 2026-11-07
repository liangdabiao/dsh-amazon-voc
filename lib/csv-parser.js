// 评论 CSV 解析：easy-scraper 导出的 Amazon 评论 CSV → 结构化评论数组。
// 移植自 easy-amazon-voc 的 src/lib/utils/csv-parser.ts（MIT，liangdabiao）。
// 列名模糊匹配（easy-scraper 的列名带样式类名后缀，如 a-icon-alt=评分）。
import { readFileSync } from 'node:fs'

export const CSV_LIMITS = {
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  MAX_ROWS: 1000,
}

export class CSVParseError extends Error {}

/** 简易 CSV 解析（支持引号字段、引号转义、, \t ; 探测） */
export function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  const sample = text.slice(0, 4096)
  let delimiter = ','
  let best = -1
  for (const d of [',', '\t', ';']) {
    const count = sample.split(d).length - 1
    if (count > best) { best = count; delimiter = d }
  }
  const rows = []
  let cur = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else inQuotes = false
      } else field += ch
    } else if (ch === '"') inQuotes = true
    else if (ch === delimiter) { cur.push(field); field = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      cur.push(field); field = ''
      if (cur.some((c) => String(c).trim() !== '')) rows.push(cur)
      cur = []
    } else field += ch
  }
  if (field !== '' || cur.length) { cur.push(field); if (cur.some((c) => String(c).trim() !== '')) rows.push(cur) }
  if (rows.length === 0) return { headers: [], rows: [] }
  const headers = rows[0]
  return { headers, rows: rows.slice(1).map((r) => { const o = {}; for (let i = 0; i < headers.length; i++) o[headers[i]] = i < r.length ? r[i] : ''; return o }) }
}

// Amazon 评论列名 → 规范字段（easy-scraper 导出格式）
const COLUMN_ALIASES = {
  content: ['cr-original-review-content', 'review-content', 'review_content', 'content', '评论内容', 'review body'],
  rating: ['a-icon-alt', 'rating', 'star', '评分', 'stars'],
  date: ['a-size-mini (2)', 'review-date', 'date', '日期'],
  author: ['a-profile-name', 'author', 'reviewer', '评论者'],
  title: ['review-title', 'title', '标题'],
  verified: ['a-size-mini', 'verified purchase', 'verified'],
}

export function matchColumns(headers) {
  const norm = headers.map((h) => String(h ?? '').trim().toLowerCase())
  const out = {}
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    for (const alias of aliases) {
      for (let i = 0; i < norm.length; i++) {
        if (norm[i] === alias || (norm[i].includes(alias) && alias.length >= 4)) {
          if (!(field in out)) out[field] = headers[i]
          break
        }
      }
      if (field in out) break
    }
  }
  return out
}

/** 解析评论 CSV → { reviews: [{content, rating, date, author}], totalRows, skipped } */
export function parseReviewCsv(text, { maxRows = CSV_LIMITS.MAX_ROWS } = {}) {
  const { headers, rows } = parseCsv(text)
  if (headers.length === 0) throw new CSVParseError('CSV 为空或格式不正确')
  const col = matchColumns(headers)
  if (!('content' in col)) {
    throw new CSVParseError(`CSV 缺少评论内容列。识别到的表头：${headers.slice(0, 10).join(' | ')}`)
  }
  const reviews = []
  let skipped = 0
  for (const r of rows.slice(0, maxRows)) {
    const content = String(r[col.content] ?? '').trim()
    if (!content || content.length < 3) { skipped++; continue }
    const ratingRaw = 'rating' in col ? String(r[col.rating] ?? '') : ''
    const ratingMatch = ratingRaw.match(/([\d.]+)/)
    reviews.push({
      content: content.slice(0, 5000),
      rating: ratingMatch ? Number(ratingMatch[1]) : null,
      date: 'date' in col ? String(r[col.date] ?? '').slice(0, 40) : null,
      author: 'author' in col ? String(r[col.author] ?? '').slice(0, 60) : null,
    })
  }
  return { reviews, totalRows: rows.length, skipped, matchedColumns: col }
}

export function parseReviewCsvFile(filePath, options) {
  return parseReviewCsv(readFileSync(filePath, 'utf8'), options)
}
