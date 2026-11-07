// 词频统计与用户画像数据聚合（纯函数）。
// 移植自 easy-amazon-voc 的 word-frequency-service.ts（MIT，liangdabiao）逻辑。
// 标签由 LLM 打标后传进来，本模块做确定性统计与聚合——算数不经过大模型。

/** 词频统计：tags = [{ level1, level2, level3?, sentiment }] */
export function wordFrequency(tags) {
  const byL1 = new Map()
  const byL2 = new Map()
  let positive = 0
  let negative = 0
  let neutral = 0
  for (const tag of tags) {
    const l1 = String(tag.level1 || '未分类')
    const l2 = String(tag.level2 || '其他')
    byL1.set(l1, (byL1.get(l1) || 0) + 1)
    byL2.set(`${l1}/${l2}`, (byL2.get(`${l1}/${l2}`) || 0) + 1)
    const s = String(tag.sentiment || '').toLowerCase()
    if (s.includes('pos') || s.includes('正')) positive++
    else if (s.includes('neg') || s.includes('负')) negative++
    else neutral++
  }
  return {
    byLevel1: [...byL1.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count),
    byLevel2: [...byL2.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count),
    sentiment: { positive, negative, neutral },
    total: tags.length,
  }
}

/** 按一级标签分组抽样评论（供画像生成的原始素材） */
export function groupByLevel1(taggedReviews) {
  const groups = new Map()
  for (const r of taggedReviews) {
    const l1 = String(r.level1 || '未分类')
    if (!groups.has(l1)) groups.set(l1, [])
    groups.get(l1).push(r)
  }
  return [...groups.entries()].map(([level1, reviews]) => ({
    level1,
    count: reviews.length,
    samples: reviews.slice(0, 10).map((r) => ({ content: String(r.content || '').slice(0, 300), sentiment: r.sentiment })),
  }))
}

/** 用户画像结构模板（LLM 填充文本后的形状校验） */
export function validatePersona(persona) {
  const errors = []
  if (!persona || typeof persona !== 'object') return ['persona 不是对象']
  if (!persona.name || typeof persona.name !== 'string') errors.push('缺 name')
  if (!Array.isArray(persona.characteristics) || persona.characteristics.length === 0) errors.push('缺 characteristics')
  if (!Array.isArray(persona.painPoints) || persona.painPoints.length === 0) errors.push('缺 painPoints')
  if (!persona.quote || typeof persona.quote !== 'string') errors.push('缺 quote')
  return errors
}

/** 从打标结果生成 Markdown 分析摘要（确定性部分） */
export function generateSummary(taggedReviews, productName = '该产品') {
  const freq = wordFrequency(taggedReviews.map((r) => ({ level1: r.level1, level2: r.level2, sentiment: r.sentiment })))
  const lines = [
    `# ${productName} 评论分析摘要`,
    '',
    `- 分析评论数：${freq.total}`,
    `- 情感分布：正面 ${freq.sentiment.positive} / 负面 ${freq.sentiment.negative} / 中性 ${freq.sentiment.neutral}`,
    '',
    '## 一级标签分布',
    ...freq.byLevel1.map(({ tag, count }) => `- ${tag}: ${count} 条`),
    '',
    '## 二级标签 Top10',
    ...freq.byLevel2.slice(0, 10).map(({ tag, count }) => `- ${tag}: ${count} 条`),
  ]
  return lines.join('\n')
}
