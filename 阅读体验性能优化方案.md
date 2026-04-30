# FeedCentral 阅读体验性能优化方案

## 背景

当前项目部署在 Vercel 免费环境，CPU 和 Serverless 执行时间受限。现有阅读路径主要依赖客户端页面加载后请求 API，再由 API 查询数据库并返回数据。这个模式在文章点击、首页首屏、分类页和翻页场景下都会消耗 Vercel 函数 CPU，导致体感偏慢。

目标是把高频公开阅读路径尽量改成 ISR、CDN 缓存和轻量客户端交互，让用户打开首页、点击文章、翻页时尽量命中静态缓存或预取缓存。

## 优化目标

- 文章详情页点击后快速打开。
- 首页和分类页首屏更快显示。
- 首页和分类前几页可以通过 ISR 缓存。
- 翻页时提前预取下一页，减少等待。
- 深分页从 offset pagination 改成 cursor pagination，避免页码越深数据库越慢。
- 减少 `/api/articles` 和 `/api/articles/[id]` 的动态函数调用频率。
- 保持现有多语言路由兼容。

## 当前问题

### 文章详情页

当前文章详情页是客户端渲染，页面加载后再请求：

```txt
/api/articles/[id]
```

问题：

- 首屏先显示 loading/skeleton。
- 每次点击文章都会触发 API Serverless 函数。
- 文章正文通常低频变化，但没有充分利用 ISR。

### 首页和分类页

当前首页和分类页也是客户端请求 API：

```txt
/api/stats
/api/articles?page=1&pageSize=20
/api/articles?category=xxx&page=1&pageSize=20
```

问题：

- 首页首屏依赖客户端 JS 和 API。
- 分类页首屏也依赖 API。
- 高频路径无法直接命中静态页面缓存。

### 分页

当前分页使用 offset：

```ts
skip: (page - 1) * pageSize
```

问题：

- 页码越深，数据库扫描成本越高。
- 免费 Vercel 环境下更容易放大 CPU 和响应时间。
- API 虽然已经避免 count，但深分页仍然不够稳定。

## 总体方案

把公开阅读路径从：

```txt
客户端页面加载 → 请求 API → Serverless 查库 → 客户端渲染
```

改成：

```txt
Server Component / ISR 页面 → CDN 缓存命中 → 小型客户端交互
```

核心改造：

1. 文章详情页 ISR 化。
2. 首页和分类前几页 ISR 化。
3. 分页预取下一页。
4. offset pagination 改 cursor pagination。

## 推荐实施顺序

```txt
Phase 1: cursor pagination 数据层 + API 兼容
Phase 2: 文章详情页 ISR
Phase 3: 首页第 1 页 ISR
Phase 4: 首页/分类前几页路径化 ISR
Phase 5: 下一页预取和深分页体验优化
```

原因：

- cursor pagination 是长期性能地基。
- 文章详情页 ISR 收益最大，改造范围相对首页小。
- 首页和分类页涉及组件拆分，适合放到详情页之后。
- 预取需要等路径和 cursor 协议稳定后再做。

## Phase 1: Cursor Pagination 数据层和 API 改造

### 影响文件

- `app/api/articles/route.ts`
- `prisma/schema.prisma`
- `types/index.ts`
- `tests/api/articles.test.ts`
- `tests/api/integration.test.ts`
- 建议新增 `lib/articles/cursor.ts`
- 建议新增 `lib/articles/get-public-articles.ts`
- 建议新增 `lib/articles/article-query.ts`

### Cursor 设计

使用稳定排序：

```ts
orderBy: [
  { publishedAt: 'desc' },
  { id: 'desc' },
]
```

cursor 内容：

```ts
{
  publishedAt: string;
  id: string;
}
```

cursor 只表示位置，不保存 category、sourceId 或用户信息。

下一页查询条件：

```ts
OR: [
  { publishedAt: { lt: cursor.publishedAt } },
  {
    publishedAt: cursor.publishedAt,
    id: { lt: cursor.id },
  },
]
```

### API 返回格式

建议 `/api/articles` 返回：

```json
{
  "success": true,
  "data": [],
  "pagination": {
    "pageSize": 20,
    "hasNext": true,
    "nextCursor": "..."
  }
}
```

短期兼容旧字段：

```json
{
  "page": null,
  "total": null,
  "totalPages": null,
  "hasPrev": false
}
```

### 旧参数兼容

短期保留：

```txt
/api/articles?page=1&pageSize=20
```

建议：

- `page=1` 映射为无 cursor。
- `page>1` 只作为过渡兼容，不建议长期保留。
- 后续 UI 移除随机跳页，改成上一页、下一页、加载更多。

### Prisma 索引

建议在 `Article` model 增加：

```prisma
@@index([deletedAt, publishedAt(sort: Desc), id(sort: Desc)])
@@index([categoryId, deletedAt, publishedAt(sort: Desc), id(sort: Desc)])
@@index([sourceId, deletedAt, publishedAt(sort: Desc), id(sort: Desc)])
```

这些索引用来支持：

- 全站文章列表。
- 分类文章列表。
- source 过滤文章列表。
- `publishedAt + id` 的稳定 cursor 排序。

### 验证点

- 无 cursor 时返回第一页。
- 有 cursor 时返回下一页。
- 相同 `publishedAt` 的文章不会重复或丢失。
- 非法 cursor 有明确处理。
- category 不存在时返回空列表或 404，行为需统一。
- API cache key 包含 cursor、category、sourceId、pageSize。

## Phase 2: 文章详情页 ISR 化

### 影响文件

- `app/[locale]/article/[id]/page.tsx`
- `app/api/articles/[id]/route.ts`
- `components/reader/ArticleHeader.tsx`
- `components/reader/ArticleContent.tsx`
- 建议新增 `lib/articles/get-public-article.ts`
- 建议新增 `components/reader/BookmarkButton.tsx`
- 建议新增 `components/reader/BackButton.tsx`

### 改造方式

将文章详情页从 Client Component 改成 Server Component。

移除：

```ts
'use client'
useEffect
useState
fetch('/api/articles/[id]')
```

改成服务端直接查询：

```ts
const article = await getPublicArticle(id);

if (!article) {
  notFound();
}
```

添加 ISR：

```ts
export const revalidate = 600;
```

### 交互拆分

详情页主体保持服务端渲染：

- 标题。
- 来源。
- 分类。
- 发布时间。
- 作者。
- 正文。
- 原文链接。

用户相关交互拆成小型 Client Component：

- 收藏按钮：`BookmarkButton.tsx`
- 返回按钮：`BackButton.tsx`

不要因为收藏按钮导致整篇文章详情页变成客户端页面。

### 静态参数策略

不建议全量预生成所有文章。

推荐：

- 构建时最多预生成最新 50 到 100 篇。
- 其他文章按需 ISR。
- `generateStaticParams()` 中访问数据库要 try/catch，失败时返回空数组，避免构建失败。

### API 兼容

`/api/articles/[id]` 保留，供旧客户端或外部调用使用。

成功响应增加缓存：

```txt
Cache-Control: public, s-maxage=300, stale-while-revalidate=1800
```

404 可短缓存：

```txt
Cache-Control: public, s-maxage=60
```

500 不缓存。

### 验证点

- 打开文章详情页时，不再依赖 `/api/articles/[id]` 才显示正文。
- 文章不存在时走 404。
- 收藏按钮仍可用。
- 正文 HTML 渲染正常。
- Vercel 部署后详情页能命中 ISR 或 CDN 缓存。

## Phase 3: 首页第 1 页 ISR 化

### 影响文件

- `app/[locale]/app/page.tsx`
- `components/feed/FeedList.tsx`
- `components/feed/FeedCard.tsx`
- `components/layout/AppTabs.tsx`
- 建议新增 `components/feed/StaticFeedList.tsx`
- 建议新增 `lib/categories/get-public-categories.ts`

### 改造方式

将首页从客户端请求 API 改成服务端直接查询：

```txt
categories + first page articles
```

添加 ISR：

```ts
export const revalidate = 120;
```

首页首屏直接输出文章列表。

### 组件拆分

当前每页大约 20 条文章，不需要虚拟列表。

建议拆分：

```txt
StaticFeedList.tsx      Server Component，用于首页和分类前几页
VirtualFeedList.tsx     Client Component，后续大列表再用
```

`FeedCard` 也尽量改为 Server Component。

如果图片 fallback 需要 client state，可以只拆图片为小型 Client Component，不要让整张卡片 client 化。

### AppTabs

`AppTabs` 主要是导航，建议逐步轻量化：

- 由服务端传入 active category。
- active 样式用 CSS。
- 可考虑移除 framer-motion 动画，减少 JS。

### 验证点

- `/cn/app` 首屏直接有文章列表。
- 首屏不再等 `/api/articles` 才显示内容。
- 首页分类 tabs 正常。
- 下一页链接正常。
- Vercel Functions 调用次数下降。

## Phase 4: 首页和分类前几页路径化 ISR

### 新增路径

首页：

```txt
/[locale]/app
/[locale]/app/page/2
/[locale]/app/page/3
```

分类：

```txt
/[locale]/app/[category]
/[locale]/app/[category]/page/2
/[locale]/app/[category]/page/3
```

### 影响文件

- `app/[locale]/app/page.tsx`
- `app/[locale]/app/[category]/page.tsx`
- 新增 `app/[locale]/app/page/[page]/page.tsx`
- 新增 `app/[locale]/app/[category]/page/[page]/page.tsx`
- 建议新增 `components/feed/FeedPagination.tsx`

### 推荐配置

集中定义常量：

```ts
PUBLIC_FEED_PAGE_SIZE = 20;
PUBLIC_FEED_REVALIDATE_SECONDS = 120;
ARTICLE_REVALIDATE_SECONDS = 600;
STATIC_FEED_PAGE_LIMIT = 3;
STATIC_ARTICLE_LIMIT = 100;
```

推荐预生成规模：

- 首页前 3 页。
- 分类前 2 到 3 页。
- 每页 20 条。

如果分类很多：

- 所有分类只预生成第 1 页。
- 热门分类预生成前 3 页。
- 冷门分类按需 ISR。

### Query URL 兼容

旧链接：

```txt
/app?page=2
/app/tech?page=2
```

建议 redirect 到 canonical path：

```txt
/app/page/2
/app/tech/page/2
```

`page=1` redirect 到：

```txt
/app
/app/tech
```

### 路由冲突风险

`/app/page/[page]` 可能和 `/app/[category]` 产生语义冲突。

解决方式：

- 把 `page` 作为保留 category slug。
- 测试 Next.js 路由优先级。
- 如果要更稳，可以使用：

```txt
/app/p/2
/app/[category]/p/2
```

`/page/2` 可读性更好，`/p/2` 更不容易冲突。

### 验证点

- `/cn/app/page/2` 可以直接访问。
- `/cn/app/[category]/page/2` 可以直接访问。
- 前几页能 ISR。
- 旧 query URL 能正确 redirect。
- 分类不存在时返回 404。

## Phase 5: 分页预取下一页

### 路径分页预取

前几页使用 Next `<Link />`：

```tsx
<Link href="/cn/app/page/2">下一页</Link>
```

对于 ISR 页面，Next 的路由预取可以让用户点击下一页时更快。

### Cursor 深分页预取

超过前几页后，使用 cursor API。

当前页加载完成后，后台预取下一页：

```txt
/api/articles?cursor=xxx&pageSize=20
```

分类页：

```txt
/api/articles?category=tech&cursor=xxx&pageSize=20
```

限制：

- 只预取下一页。
- 不预取下下页。
- 切换分类或页面卸载时 abort 请求。
- 不无限预取，避免浪费 Vercel 免费额度。

### 文章详情预取

文章卡片链接到详情页：

```txt
/article/[id]
```

详情页 ISR 后，可以先依赖 Next Link 默认预取行为。

不建议一开始手写 hover 预取所有文章详情，因为 20 条列表全部预取可能增加请求量。先观察 Vercel 带宽和函数调用后再调整。

## 需要调整或删除的功能

### 随机跳页

Cursor pagination 不适合随机跳到第 N 页。

建议移除或弱化：

```txt
跳到第 100 页
```

改成：

```txt
上一页
下一页
加载更多
前几页路径链接
```

这是为了换取稳定、低成本的分页性能。

### 手动刷新 Feed

如果首页存在手动刷新 RSS 的按钮，不建议放在公开阅读主路径频繁触发。

后续可以改为：

- 管理员入口。
- Vercel Cron。
- Webhook。
- 后台任务。

## 测试计划

### 单元测试

重点覆盖：

- cursor encode/decode。
- 非法 cursor。
- 空 cursor。
- `publishedAt + id` tie-breaker。
- `hasNext` 判断。
- `pageSize` 限制。
- category 不存在。
- soft-deleted article 不返回。

### API 测试

重点覆盖：

- `/api/articles` 无 cursor。
- `/api/articles` 有 cursor。
- `/api/articles?category=...`。
- legacy `page=1`。
- Cache-Control header。
- DB error。
- 404 article。
- soft-deleted article。

### 页面测试

重点路径：

```txt
/cn/app
/cn/app/page/2
/cn/app/[category]
/cn/app/[category]/page/2
/cn/article/[id]
```

验证：

- 页面服务端渲染文章标题。
- 页面不依赖 `/api/articles` 才出现首屏内容。
- notFound 行为正确。
- 下一页链接正确。

### E2E 测试

关键用户路径：

1. 打开 `/cn/app`。
2. 首屏文章列表快速出现。
3. 点击第一篇文章。
4. 文章标题和正文快速出现。
5. 返回首页。
6. 点击下一页。
7. 下一页文章快速出现。
8. 打开分类页。
9. 分类下一页可访问。

### 构建验证

每阶段完成后运行：

```bash
npm run type-check
npm run test
npm run build
```

部署后检查：

- `x-vercel-cache` 是否命中。
- `/api/articles` 调用次数是否下降。
- `/api/articles/[id]` 调用次数是否下降。
- Vercel Functions CPU 时间是否下降。
- 首页 LCP 和文章点击体感是否改善。

## 风险和取舍

### ISR 会有短暂旧数据

建议：

- 首页和分类页：`60` 到 `120` 秒。
- 文章详情页：`300` 到 `600` 秒。

如果删除文章必须立即生效，后续再接入 On-Demand Revalidation。

### 构建期数据库访问可能失败

`generateStaticParams()` 中访问数据库要 try/catch。

失败时返回空数组，让运行时按需 ISR 生成，避免 build 失败。

### 预取可能增加请求量

先只预取下一页，不预取所有详情页，不预取多页。

观察 Vercel 带宽和函数调用后再扩大预取范围。

### 分类太多会放大静态页数量

如果分类很多，不要全量预生成所有分类前几页。

建议：

- 所有分类第 1 页。
- 热门分类前 3 页。
- 冷门分类按需 ISR。

### Cursor 不支持低成本随机跳页

这是核心取舍。

放弃随机跳页，换取深分页性能稳定。

## 最小可执行版本

如果先做一版小而有效的优化，建议只做：

```txt
1. /api/articles 支持 cursor，page=1 兼容
2. /article/[id] 改 Server Component + revalidate=600
3. /app 改 Server Component + revalidate=120
4. 下一页 Link 指向 /app/page/2，并预生成首页前 3 页
```

这版已经可以明显改善：

- 文章点击速度。
- 首页首屏速度。
- 首页前几页翻页速度。
- Vercel Serverless CPU 使用。

## 成功标准

- `/cn/article/[id]` 首屏不再依赖客户端 `/api/articles/[id]` 请求显示正文。
- `/cn/app` 首屏服务端渲染文章列表。
- `/cn/app/[category]` 首屏服务端渲染分类文章列表。
- 首页和分类前几页具备路径型 URL，并可 ISR。
- `/api/articles` 支持 cursor pagination。
- 公开列表查询不再依赖深分页 `skip`。
- `publishedAt desc + id desc` 排序稳定，分页无重复、无漏项。
- 下一页可通过 Link 或客户端逻辑预取。
- 随机跳页被移除或限制为 legacy 兼容。
- Vercel 部署后文章点击和翻页体感明显改善。
- Vercel Functions 调用次数和 CPU 时间下降。
