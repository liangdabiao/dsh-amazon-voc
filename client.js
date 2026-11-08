// ============================================================================
// Amazon 评论 VOC · 浏览器半边（最小面板）。
// 两块：📖 四维价值模型 + 📋 使用流程。
// ============================================================================
const h = require('react').createElement
const { useState, useEffect } = require('react')

const PANEL_ID = 'amazon-voc'
const BASE = 'amazon-voc'

// 「马上使用」：开新对话并把 VOC 分析指令填进输入框（不直接发送，用户挂上 CSV 再回车）。
// 走 Host 的 uiWorkspace.startSession（与「运营 Agent」「卖家工具箱」「小红书验证」同一套入口）：
//   startSession(sessionId?, { prompt, whenDraftExists: 'keep'|'replace'|'append' })
const USE_PROMPT = '使用‘评论VOC’插件 进行评论分析， 上传csv:'
let openInChat = null

function PanelIcon(props) {
  return h('svg', { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', ...props },
    h('rect', { x: 2.5, y: 2.5, width: 19, height: 19, rx: 5, fill: '#b45309' }),
    h('path', { d: 'M7 8h10M7 12h7', stroke: '#fff', 'stroke-width': 1.6, 'stroke-linecap': 'round' }),
    h('path', { d: 'M8 16.5c1 .8 2.5 1.2 4 1.2s3-.4 4-1.2', stroke: '#ffd24a', 'stroke-width': 1.4, 'stroke-linecap': 'round' }))
}

async function fetchJson(path) {
  const res = await fetch(BASE + path)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `请求失败（${res.status}）`)
  return data
}

const DIMENSIONS = [
  ['👥 人群与场景', '使用场景 · 购买动机 · 未被满足的需求 · 痛点问题'],
  ['⚙️ 功能价值', '产品优点 · 产品缺点 · 期望建议 · 设计与外观'],
  ['🛡️ 保障价值', '物流配送 · 售后服务 · 售前服务'],
  ['✨ 体验价值', '推荐意愿 · 品牌印象 · 感官感受 · 价格感知'],
]

const STEPS = [
  ['📥 上传 CSV', '用 easy-scraper 浏览器插件爬取 Amazon 商品评论，导出 CSV'],
  ['🗣️ 对话发起', '「分析这份评论 CSV：<路径>」→ 模型调 voc_parse_csv 解析'],
  ['🏷️ 两步 AI 分析', '第一步生成四维标签体系 → 第二步逐条评论打标 + 情感判断'],
  ['📊 确定性统计', 'voc_wordfreq 词频统计 + voc_summary 摘要（算数不经过大模型）'],
  ['👤 用户画像', '模型生成 3~5 个画像 → voc_persona 校验格式 → 输出 Markdown'],
]

function GuideTab() {
  return h('div', null,
    h('div', { style: styles.card },
      h('div', { style: styles.sectionTitle }, '四维价值模型'),
      h('div', { style: styles.dimList },
        DIMENSIONS.map(([title, desc]) => h('div', { key: title, style: styles.dimRow },
          h('div', { style: styles.dimTitle }, title),
          h('div', { style: styles.muted }, desc))))),
    h('div', { style: styles.card },
      h('div', { style: styles.sectionTitle }, '使用流程'),
      h('div', { style: styles.stageList },
        STEPS.map(([title, desc], i) => h('div', { key: title, style: styles.stageRow },
          h('span', { style: styles.stageNum }, `${i + 1}`),
          h('div', null, h('div', { style: styles.viewTitle }, title), h('div', { style: styles.muted }, desc)))))),
    h('div', { style: styles.card },
      h('div', { style: styles.sectionTitle }, '怎么发起'),
      h('div', { style: styles.stepList },
        h('div', { style: styles.quote }, '「分析这份评论 CSV：<工作区里的文件路径>」'),
        h('div', { style: styles.quote }, '「给这个产品的评论做 VOC 分析和用户画像」'),
        'LLM 两步分析走宿主模型（无需单独 API key）；词频等确定性统计由工具计算，不算错。')),
    h('div', { style: styles.card },
      h('div', { style: styles.sectionTitle }, '⚠️ 免责声明'),
      h('div', { style: styles.muted }, '分析结果仅供研究参考。评论数据来自 Amazon 公开内容，请遵守平台规则。')))
}

function Panel() {
  const use = () => { if (openInChat) openInChat(USE_PROMPT) }
  return h('div', { style: styles.wrap },
    // 一键入口：开新对话并填好 VOC 指令
    h('div', { style: styles.ctaCard },
      h('div', { style: styles.ctaText },
        h('div', { style: styles.ctaTitle }, '想分析一批 Amazon 评论？'),
        h('div', { style: styles.muted },
          '点「马上使用」→ 开新对话，输入框已填好指令；把评论 CSV 拖进对话框（或点附件按钮选文件）后回车即可。')),
      h('button', { style: styles.ctaButton, onClick: use, title: `填进对话：${USE_PROMPT}` }, '🚀 马上使用')),
    h('div', { style: styles.row },
      h('button', { style: styles.tabActive }, '📖 四维价值模型')),
    h(GuideTab))
}

const styles = {
  wrap: { padding: 16, overflow: 'auto', height: '100%', boxSizing: 'border-box', fontFamily: '-apple-system, "Segoe UI", "Microsoft YaHei", sans-serif', fontSize: 13, color: '#1a1a1a' },
  ctaCard: { display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', background: '#fdf6ee', border: '1px solid #f0dcc4', borderRadius: 10, padding: '12px 14px', marginBottom: 12 },
  ctaText: { flex: 1, minWidth: 200 },
  ctaTitle: { fontWeight: 700, color: '#7a3a10', marginBottom: 4 },
  ctaButton: { padding: '10px 20px', border: 'none', borderRadius: 10, background: '#b45309', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 700, boxShadow: '0 2px 6px rgba(180,83,9,.25)' },
  row: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 },
  button: { padding: '6px 14px', border: 'none', borderRadius: 8, background: '#b45309', color: '#fff', cursor: 'pointer', fontSize: 13 },
  tabActive: { padding: '8px 16px', border: '1px solid #b45309', borderRadius: 8, background: '#fdf3e7', color: '#7a3a10', fontWeight: 600, fontSize: 13 },
  card: { background: '#fff', border: '1px solid #e3e3e6', borderRadius: 10, padding: 12, marginBottom: 10 },
  sectionTitle: { fontWeight: 700, marginBottom: 6, color: '#7a3a10' },
  stepList: { lineHeight: 1.9 },
  quote: { background: '#fdf3e7', borderRadius: 6, padding: '4px 10px', margin: '4px 0', color: '#7a3a10' },
  dimList: { display: 'grid', gap: 8 },
  dimRow: { background: '#fafafa', borderRadius: 8, padding: '8px 10px' },
  dimTitle: { fontWeight: 600, color: '#7a3a10' },
  stageList: { display: 'grid', gap: 8 },
  stageRow: { display: 'flex', gap: 10, alignItems: 'flex-start' },
  stageNum: { width: 22, height: 22, borderRadius: '50%', background: '#b45309', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 },
  viewTitle: { fontWeight: 600 },
  muted: { color: '#8a8a92' },
}

function apply(ctx) {
  // 一键入口：开新对话并预填「使用‘评论VOC’插件 进行评论分析， 上传csv:」（不直接发送）
  openInChat = (prompt) => {
    try {
      ctx.uiWorkspace.startSession(undefined, { prompt, whenDraftExists: 'replace' })
    } catch (err) {
      console.error('[amazon-voc] 开新对话失败', err)
      alert('开新对话失败：' + ((err && err.message) || err))
    }
  }
  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register({ name: 'sidebar.panellist', id: PANEL_ID, order: 19, label: () => '评论 VOC' }, PanelIcon))
  ctx.slots.inject('main', () =>
    ctx.slots.register({ name: 'main', key: PANEL_ID }, Panel))
}

exports.isPlugin = true
exports.inject = ['slots', 'uiWorkspace']
exports.apply = apply
