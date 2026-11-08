# dsh-amazon-voc · Amazon 评论智能分析（VOC）

DeepSeek Harness（dsh）插件：**Amazon 评论智能分析（VOC）**——四维价值模型（人群场景/功能价值/保障价值/体验价值）+ 两步 AI 分析（标签体系生成→逐条打标）+ 确定性词频统计 + 用户画像。LLM 分析走宿主模型，**无需单独 API key**。

技能来自 [easy-amazon-voc](https://github.com/liangdabiao/easy-amazon-voc)（MIT，liangdabiao）。

<img width="1614" height="1215" alt="image" src="https://github.com/user-attachments/assets/387574fa-fb99-456b-b61b-d60e0a37cf97" />


## 装上以后有什么

| 能力 | 说明 |
|---|---|
| `amazon-voc-analysis` 技能 | 四维价值模型方法论（4 大价值层级 + 标签设计原则 + 两步分析流程） |
| `voc_parse_csv` 工具 | 解析 easy-scraper 导出的 Amazon 评论 CSV：列名模糊匹配、提取内容/评分/日期/作者，最大 1000 行 |
| `voc_wordfreq` 工具 | 确定性词频统计：一级/二级标签分布 + 情感分布（**算数不经过大模型**） |
| `voc_persona` 工具 | 用户画像格式校验与 Markdown 输出（3~5 个画像） |
| `voc_summary` 工具 | 确定性分析摘要 + 分组抽样 |
| 侧栏「评论 VOC」面板 | 四维价值模型速览 + 使用流程 + 免责声明 |

## 使用

1. 用 [easy-scraper](https://chromewebstore.google.com/) 浏览器插件爬取 Amazon 商品评论，导出 CSV
2. 对话里：**「分析这份评论 CSV：<工作区里的文件路径>」**
3. 模型：解析 CSV → 生成标签体系 → 逐条打标 → 词频统计 → 用户画像 → 输出到工作区 `reports/`

## ⚠️ 安全提醒

上游 Python 版 functions.py 曾含明文 API key（已随 GitHub 公开）——本插件**不携带任何密钥**（全局扫描测试防泄露）。如果你用过那对 key，请轮换。

## 自检

```bash
npm install && npm test && npm run selftest && npm run build
```

- `npm test`：11 个单测（真实样例 CSV 解析/列名匹配/词频/画像校验/摘要/工具 schema/技能引用），零网络零 key
- `npm run selftest`：样例解析+工具+技能+密钥不入包+面板 API
- `npm run build`：打包 dist/client.js + 三大自检（含 treeShaking:false）


## 安装

```bash
# 从 GitHub 装（dist/client.js 已入库，装完即有面板）
dsh plugin --profile web add github:liangdabiao/dsh-amazon-voc

# 钉版本
dsh plugin --profile web add github:liangdabiao/dsh-amazon-voc#v0.1.1
```

> ⚠️ 本包**没有发布到 npm**，`dsh plugin add dsh-amazon-voc` 会失败——请用上面的 `github:` 形式。
>
> `dist/client.js` 是入库文件：dsh 宿主直接消费已构建的客户端 bundle（`package.json` → `exports["./client"]`），缺它会导致插件激活失败、侧栏「评论 VOC」面板不出现。改完源码记得 `npm run build` 再提交。

## 一键开始

面板顶部有 **🚀 马上使用** 按钮：点了会开一个新对话，输入框里已经填好

```
使用‘评论VOC’插件 进行评论分析， 上传csv:
```

你把评论 CSV 拖进对话框（或点附件按钮选文件）后回车即可，模型会接着调 `voc_parse_csv`。

## 许可

MIT（liangdabiao）
