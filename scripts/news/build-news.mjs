import { mkdir, open, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const sourceDir = path.join(root, 'content/news/items');
const publicDir = path.join(root, 'frontend');
const newsDir = path.join(publicDir, 'news');
const sitemapFile = path.join(publicDir, 'sitemap.xml');
const lockFile = path.join(root, '.aizanoi-news-build.lock');
const siteUrl = 'https://aizanoianalytics.com';
const categoryLabels = new Map([
  ['ai', 'AI'],
  ['technology', 'Technology'],
  ['economy-markets', 'Economy / Markets'],
  ['football', 'Football']
]);
const staticSitemapEntries = Object.freeze([
  ['/', '2026-08-24'],
  ['/news/', '2026-08-24'],
  ['/news/about/', '2026-08-25'],
  ['/privacy/', '2026-09-02'],
  ['/tv/', '2026-08-24'],
  ['/analytics/', '2026-08-25'],
  ['/analytics/dashboards/hr-analytics-full-set/', '2026-08-26'],
  ['/analytics/dashboards/hr-analytics-full-set/hr-executive-board-full-history/', '2026-08-26'],
  ['/analytics/dashboards/hr-analytics-full-set/hr-executive-board-current/', '2026-08-26'],
  ['/analytics/dashboards/hr-analytics-full-set/hr-administration-deep-dive/', '2026-08-26'],
  ['/analytics/dashboards/hr-analytics-full-set/store-operations-tracking/', '2026-08-26'],
  ['/analytics/dashboards/hr-analytics-full-set/store-learning-compliance/', '2026-08-26'],
  ['/analytics/dashboards/hr-analytics-full-set/learning-academy-analytics/', '2026-08-26'],
  ['/analytics/dashboards/hr-analytics-full-set/performance-hiring-turnover/', '2026-08-26'],
  ['/analytics/dashboards/hr-analytics-full-set/corporate-goals/', '2026-08-26'],
  ['/analytics/dashboards/hr-analytics-full-set/workforce-time-attendance/', '2026-08-26'],
  ['/analytics/dashboards/hr-analytics-full-set/workforce-turnover/', '2026-08-26'],
  ['/analytics/dashboards/new-hr-collection/', '2026-09-03'],
  ['/analytics/dashboards/new-hr-collection/pacs/', '2026-09-03'],
  ['/analytics/dashboards/new-hr-collection/recruitment-analytics/', '2026-09-03'],
  ['/worlds/', '2026-08-24'],
  ['/forge/', '2026-08-24'],
  ['/journal/', '2026-08-24'],
  ['/labs/', '2026-08-24'],
  ['/arcade/', '2026-08-24'],
  ['/historic-world/', '2026-08-23'],
  ['/ancient-cities/rome-410-476/', '2026-08-23'],
  ['/ancient-cities/athens-450-430/', '2026-08-23']
]);

function fail(file, message) { throw new Error(`${file}: ${message}`); }
function processAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { return error.code === 'EPERM'; }
}
async function acquireBuildLock() {
  await mkdir(publicDir, { recursive:true });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await open(lockFile, 'wx');
      await handle.writeFile(`${process.pid}\n`);
      return handle;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const owner = Number.parseInt(await readFile(lockFile, 'utf8').catch(() => ''), 10);
      if (processAlive(owner)) throw new Error('News build already in progress');
      await rm(lockFile, { force:true });
    }
  }
  throw new Error('News build already in progress');
}
async function recoverInterruptedBuild() {
  const entries = await readdir(publicDir).catch(() => []);
  const stages = entries.filter((name) => name.startsWith('.aizanoi-news-stage-'));
  const backups = entries.filter((name) => name.startsWith('.aizanoi-news-backup-')).sort();
  const sitemapStages = entries.filter((name) => name.startsWith('.aizanoi-sitemap-stage-'));
  const sitemapBackups = entries.filter((name) => name.startsWith('.aizanoi-sitemap-backup-')).sort();
  let liveExists = true;
  try { await readdir(newsDir); }
  catch (error) { if (error.code === 'ENOENT') liveExists = false; else throw error; }
  if (!liveExists && backups.length) await rename(path.join(publicDir, backups.pop()), newsDir);
  let sitemapExists = true;
  try { await readFile(sitemapFile); }
  catch (error) { if (error.code === 'ENOENT') sitemapExists = false; else throw error; }
  if (!sitemapExists && sitemapBackups.length) await rename(path.join(publicDir, sitemapBackups.pop()), sitemapFile);
  await Promise.all(stages.map((name) => rm(path.join(publicDir, name), { recursive:true, force:true })));
  await Promise.all(backups.map((name) => rm(path.join(publicDir, name), { recursive:true, force:true })));
  await Promise.all(sitemapStages.map((name) => rm(path.join(publicDir, name), { force:true })));
  await Promise.all(sitemapBackups.map((name) => rm(path.join(publicDir, name), { force:true })));
}
function iso(value, file, field) {
  const match = typeof value === 'string' && value.match(/^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/);
  const parsed = match ? Date.parse(value) : NaN;
  const year = Number(match?.[1]);
  const month = Number(match?.[2]);
  const day = Number(match?.[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (!match || month < 1 || month > 12 || day < 1 || day > days[month - 1] || Number.isNaN(parsed)) fail(file, `${field} must be an ISO 8601 date-time`);
  return new Date(parsed).toISOString();
}
function text(value, file, field, { min = 1, max } = {}) {
  if (typeof value !== 'string' || !value.trim()) fail(file, `${field} is required`);
  const clean = value.trim().replace(/\s+/g, ' ');
  if (clean.length < min) fail(file, `${field} must be at least ${min} characters`);
  if (Number.isFinite(max) && clean.length > max) fail(file, `${field} exceeds ${max} characters`);
  return clean;
}
function identity(value, file, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(file, `${field} identity is required`);
  return { name: text(value.name, file, `${field}.name`, { max:120 }) };
}
function publicUrl(value, file, field) {
  let url;
  try { url = new URL(value); } catch { fail(file, `${field} must be a valid URL`); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) fail(file, `${field} must be a public http or https URL without credentials`);
  return url.toString();
}
function imageRecord(value, file) {
  if (value == null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) fail(file, 'image must be null or an object');
  return {
    url: publicUrl(value.url, file, 'image.url'),
    alt: text(value.alt, file, 'image.alt', { max:180 }),
    ...(value.credit ? { credit:text(value.credit, file, 'image.credit', { max:160 }) } : {}),
    ...(value.license ? { license:text(value.license, file, 'image.license', { max:240 }) } : {})
  };
}
function validate(item, file) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) fail(file, 'item must be an object');
  const id = text(item.id, file, 'id', { max:120 });
  if (!/^[a-z0-9][a-z0-9-]+$/.test(id)) fail(file, 'id must use lowercase letters, numbers and hyphens');
  const kind = item.kind == null ? 'daily' : text(item.kind, file, 'kind', { max:16 });
  if (!['daily', 'weekly'].includes(kind)) fail(file, 'kind must be one of daily, weekly');
  const title = text(item.title, file, 'title', { max:160 });
  const summaryMin = kind === 'weekly' ? 240 : 80;
  const summary = text(item.summary, file, 'summary', { min:summaryMin, max:600 });
  if (!categoryLabels.has(item.category)) fail(file, `category must be one of ${[...categoryLabels.keys()].join(', ')}`);
  const priority = item.priority == null ? 50 : Number(item.priority);
  if (!Number.isInteger(priority) || priority < 0 || priority > 100) fail(file, 'priority must be an integer from 0 to 100');
  const publishedAt = iso(item.publishedAt, file, 'publishedAt');
  const updatedAt = iso(item.updatedAt || item.publishedAt, file, 'updatedAt');
  const retrievedAt = iso(item.retrievedAt, file, 'retrievedAt');
  if (Date.parse(updatedAt) < Date.parse(publishedAt)) fail(file, 'updatedAt cannot precede publishedAt');
  const week = kind === 'weekly'
    ? (item.week == null ? fail(file, 'week is required for weekly items') : text(item.week, file, 'week', { max:16 }))
    : null;
  if (week !== null) {
    if (!/^\d{4}-W\d{2}$/.test(week)) fail(file, 'week must match the format YYYY-Www');
    if (week !== isoWeek(item.publishedAt.slice(0, 10))) fail(file, 'week must match the ISO week of publishedAt');
  }
  if (!Array.isArray(item.corrections)) fail(file, 'corrections history must be an array');
  const corrections = item.corrections.map((correction, index) => ({
    note: text(correction?.note, file, `corrections[${index}].note`, { max:400 }),
    correctedAt: iso(correction?.correctedAt, file, `corrections[${index}].correctedAt`)
  }));
  for (const correction of corrections) {
    if (Date.parse(correction.correctedAt) < Date.parse(publishedAt)) fail(file, 'correction time cannot precede publication');
    if (Date.parse(correction.correctedAt) > Date.parse(updatedAt)) fail(file, 'correction time cannot follow updatedAt');
  }
  if (!Array.isArray(item.sources) || item.sources.length < 1) fail(file, 'at least one source is required');
  const sources = item.sources.map((source, index) => {
    const publisher = text(source?.publisher, file, `sources[${index}].publisher`, { max:120 });
    const url = publicUrl(source?.url, file, `sources[${index}].url`);
    const sourcePublishedAt = iso(source?.publishedAt, file, `sources[${index}].publishedAt`);
    if (Date.parse(sourcePublishedAt) > Date.parse(retrievedAt)) fail(file, 'source publication date cannot follow retrievedAt');
    return { publisher, url, publishedAt:sourcePublishedAt };
  });
  const tags = Array.isArray(item.tags) ? item.tags.map((tag, index) => text(tag, file, `tags[${index}]`, { max:40 })).slice(0, 12) : [];
  const image = imageRecord(item.image, file);
  return {
    id, kind, title, summary, category:item.category, priority, publishedAt, updatedAt, retrievedAt,
    ...(week ? { week } : {}),
    author:identity(item.author, file, 'author'), editor:identity(item.editor, file, 'editor'),
    corrections, tags, sources, ...(image ? { image } : {})
  };
}

const htmlEscape = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
const xmlEscape = htmlEscape;
const dateLabel = (date) => new Intl.DateTimeFormat('en-GB', { timeZone:'UTC', weekday:'long', day:'numeric', month:'long', year:'numeric' }).format(new Date(`${date}T00:00:00Z`));
const itemDate = (item) => item.publishedAt.slice(0, 10);
const isoWeek = (date) => {
  const target = new Date(`${date}T00:00:00Z`);
  const dayNumber = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNumber + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((target.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
};
const storySlug = (item) => item.id.startsWith(`${itemDate(item)}-`) ? item.id.slice(11) : item.id;
const storyPath = (item) => `/news/${item.kind === 'weekly' ? 'weekly/' : ''}${itemDate(item)}/${storySlug(item)}/`;
const editionPath = (item) => `/news/${item.kind === 'weekly' ? 'weekly/' : ''}${itemDate(item)}/`;
const schemaIdentity = (identity) => ({ '@type':/\b(desk|team|staff|editorial)\b/i.test(identity.name) ? 'Organization' : 'Person', name:identity.name });
const publisherSchema = Object.freeze({ '@type':'Organization', name:'Aizanoi Analytics', url:siteUrl, logo:{ '@type':'ImageObject', url:`${siteUrl}/assets/branding/aizanoi-logo-mark.svg` } });
function newsArticleSchema(item) {
  const schema = {
    '@type':'NewsArticle', headline:item.title, description:item.summary,
    datePublished:item.publishedAt, dateModified:item.updatedAt,
    author:schemaIdentity(item.author), editor:schemaIdentity(item.editor),
    mainEntityOfPage:`${siteUrl}${storyPath(item)}`, isAccessibleForFree:true,
    articleSection:categoryLabels.get(item.category), inLanguage:'en', publisher:publisherSchema
  };
  if (item.tags.length) schema.keywords = item.tags.join(', ');
  if (item.image) schema.image = [{ '@type':'ImageObject', url:item.image.url, caption:item.image.alt }];
  return schema;
}
function sourceLinks(item) {
  return item.sources.map((source) => `<a href="${htmlEscape(source.url)}" rel="noopener noreferrer">${htmlEscape(source.publisher)}</a>`).join('<span aria-hidden="true"> · </span>');
}
function correctionMarkup(item) {
  return item.corrections.length
    ? `<details class="corrections"><summary>Corrections (${item.corrections.length})</summary><ol>${item.corrections.map((entry) => `<li><time datetime="${entry.correctedAt}">${entry.correctedAt.slice(0, 10)}</time> — ${htmlEscape(entry.note)}</li>`).join('')}</ol></details>`
    : '';
}
function editionSummary(item) {
  if (item.kind === 'weekly') return item.summary;
  const punctuation = /[.!?](?=\s|$)/g;
  let match;
  while ((match = punctuation.exec(item.summary))) {
    const end = match.index + 1;
    if (end >= 160 && end < item.summary.length - 20) return item.summary.slice(0, end).trim();
  }
  return item.summary;
}
function story(item, lead = false) {
  return `<article id="${htmlEscape(item.id)}" class="story${lead ? ' lead' : ''}" data-priority="${item.priority}"><p class="kicker">${htmlEscape(categoryLabels.get(item.category))}</p><h2><a href="${storyPath(item)}">${htmlEscape(item.title)}</a></h2><p class="summary">${htmlEscape(editionSummary(item))}</p><p class="byline">By ${htmlEscape(item.author.name)} · Edited by ${htmlEscape(item.editor.name)}</p><p class="source-line"><strong>Sources</strong> ${sourceLinks(item)}</p>${correctionMarkup(item)}</article>`;
}
function page({ title, eyebrow, heading, deck, items, editionDate = '', archiveLinks = '', canonicalPath = '/news/', isWeekly = false, extraArchive = '' }) {
  const canonical = `${siteUrl}${canonicalPath}`;
  const structured = editionDate && items.length
    ? { '@context':'https://schema.org', '@type':'ItemList', name:title, url:canonical, itemListElement:items.map((item,index)=>({ '@type':'ListItem', position:index+1, url:`${siteUrl}${storyPath(item)}`, item:newsArticleSchema(item) })) }
    : { '@context':'https://schema.org', '@type':'CollectionPage', name:title, description:deck, url:canonical, isPartOf:{ '@type':'WebSite', name:'Aizanoi Analytics', url:siteUrl } };
  const jsonLd = JSON.stringify(structured).replace(/</g, '\\u003c');
  const content = items.length ? `<main class="news-grid">${items.map((item, index) => story(item, index === 0)).join('')}</main>` : `<main class="empty-edition"><p class="kicker">THE PRESS IS READY</p><h2>No edition has been published yet.</h2><p>The News Desk is preparing concise, original reports with named editors and linked sources. Return for the first edition.</p></main>`;
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${htmlEscape(title)}</title><meta name="description" content="${htmlEscape(deck)}"><link rel="canonical" href="${htmlEscape(canonical)}"><link rel="icon" href="/assets/branding/aizanoi-logo-mark.svg" type="image/svg+xml"><meta property="og:type" content="website"><meta property="og:site_name" content="Aizanoi News"><meta property="og:title" content="${htmlEscape(title)}"><meta property="og:description" content="${htmlEscape(deck)}"><meta property="og:url" content="${htmlEscape(canonical)}"><meta property="og:image" content="${siteUrl}/assets/branding/aizanoi-og.png"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${htmlEscape(title)}"><meta name="twitter:description" content="${htmlEscape(deck)}"><meta name="twitter:image" content="${siteUrl}/assets/branding/aizanoi-og.png"><script type="application/ld+json">${jsonLd}</script><link rel="alternate" type="application/rss+xml" title="Aizanoi News RSS" href="/news/rss.xml"><link rel="stylesheet" href="/news/news.css"></head>\n<body><header class="masthead"><a class="wordmark" href="/news/" aria-label="Aizanoi News home">AIZANOI <span>NEWS</span></a><p>${htmlEscape(eyebrow)}</p><nav aria-label="News sections"><a href="/">Aizanoi Analytics</a>${[...categoryLabels].map(([slug, label]) => `<a href="/news/category/${slug}/">${htmlEscape(label)}</a>`).join('')}<a href="/news/about/">How we publish</a><a href="/news/rss.xml">RSS</a></nav></header>\n<section class="edition-head"><p class="edition-label">${isWeekly ? 'THE WEEKLY EDITION' : (editionDate ? 'THE DAILY EDITION' : 'THE NEWS ARCHIVE')}</p><h1>${htmlEscape(heading)}</h1><p>${htmlEscape(deck)}</p></section>${content}${archiveLinks}${extraArchive}\n<footer><p>Aizanoi News · An Aizanoi Analytics publication · Sources before claims · AI-assisted production is disclosed in our methodology.</p><a href="/news/about/">How we publish</a><a href="/news/rss.xml">RSS</a></footer></body></html>\n`;
}
function articlePage(item) {
  const canonical = `${siteUrl}${storyPath(item)}`;
  const structured = { '@context':'https://schema.org', ...newsArticleSchema(item) };
  const jsonLd = JSON.stringify(structured).replace(/</g, '\\u003c');
  const socialImage = item.image?.url || `${siteUrl}/assets/branding/aizanoi-og.png`;
  const image = item.image ? `<figure class="article-image"><img src="${htmlEscape(item.image.url)}" alt="${htmlEscape(item.image.alt)}" loading="eager" decoding="async">${item.image.credit ? `<figcaption>${htmlEscape(item.image.credit)}${item.image.license ? ` · ${htmlEscape(item.image.license)}` : ''}</figcaption>` : ''}</figure>` : '';
  const tags = item.tags.length ? `<p class="tags">${item.tags.map((tag) => `<span>${htmlEscape(tag)}</span>`).join('')}</p>` : '';
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${htmlEscape(item.title)} — Aizanoi News</title><meta name="description" content="${htmlEscape(item.summary)}"><link rel="canonical" href="${canonical}"><link rel="icon" href="/assets/branding/aizanoi-logo-mark.svg" type="image/svg+xml"><meta property="og:type" content="article"><meta property="og:site_name" content="Aizanoi News"><meta property="og:title" content="${htmlEscape(item.title)}"><meta property="og:description" content="${htmlEscape(item.summary)}"><meta property="og:url" content="${canonical}"><meta property="og:image" content="${htmlEscape(socialImage)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${htmlEscape(item.title)}"><meta name="twitter:description" content="${htmlEscape(item.summary)}"><meta name="twitter:image" content="${htmlEscape(socialImage)}"><script type="application/ld+json">${jsonLd}</script><link rel="alternate" type="application/rss+xml" title="Aizanoi News RSS" href="/news/rss.xml"><link rel="stylesheet" href="/news/news.css"></head>\n<body><header class="masthead"><a class="wordmark" href="/news/" aria-label="Aizanoi News home">AIZANOI <span>NEWS</span></a><p>${htmlEscape(dateLabel(itemDate(item)))}</p><nav aria-label="News sections"><a href="/">Aizanoi Analytics</a><a href="/news/${itemDate(item)}/">Daily edition</a><a href="/news/category/${item.category}/">${htmlEscape(categoryLabels.get(item.category))}</a><a href="/news/about/">How we publish</a></nav></header><main class="article-page"><p class="kicker">${htmlEscape(categoryLabels.get(item.category))}</p><h1>${htmlEscape(item.title)}</h1><p class="article-deck">${htmlEscape(item.summary)}</p>${image}<p class="byline">By ${htmlEscape(item.author.name)} · Edited by ${htmlEscape(item.editor.name)} · <time datetime="${item.publishedAt}">${htmlEscape(dateLabel(itemDate(item)))}</time></p>${tags}<section class="article-sources"><h2>Sources</h2><p>${sourceLinks(item)}</p></section>${correctionMarkup(item)}</main><footer><p>Aizanoi News publishes original summaries and links the sources behind factual claims.</p><a href="/news/${itemDate(item)}/">Back to the edition</a><a href="/news/about/">Methodology & corrections</a></footer></body></html>\n`;
}
function aboutPage() {
  const canonical = `${siteUrl}/news/about/`;
  const structured = JSON.stringify({ '@context':'https://schema.org', '@type':'AboutPage', name:'How Aizanoi News publishes', url:canonical, isPartOf:{ '@type':'WebSite', name:'Aizanoi Analytics', url:siteUrl } }).replace(/</g, '\\u003c');
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>How We Publish — Aizanoi News</title><meta name="description" content="Aizanoi News sourcing, corrections and AI-assisted production methodology."><link rel="canonical" href="${canonical}"><link rel="icon" href="/assets/branding/aizanoi-logo-mark.svg" type="image/svg+xml"><script type="application/ld+json">${structured}</script><link rel="stylesheet" href="/news/news.css"></head><body><header class="masthead"><a class="wordmark" href="/news/">AIZANOI <span>NEWS</span></a><p>METHOD · SOURCES · CORRECTIONS</p><nav aria-label="News sections"><a href="/news/">News home</a><a href="/">Aizanoi Analytics</a><a href="/news/rss.xml">RSS</a></nav></header><main class="method-page"><p class="kicker">HOW WE PUBLISH</p><h1>Sources before claims.</h1><p>Aizanoi News publishes original concise summaries rather than copied article bodies. Every story links the sources used to prepare it.</p><h2>Source selection</h2><p>For important, disputed or fast-moving stories we prefer multiple independent sources and/or a primary source. Rehosts of the same wire report do not count as independent corroboration, and direct original-publisher links are preferred when available.</p><h2>AI-assisted production</h2><p>AI-assisted tools may support source discovery, drafting, classification and production. They are not treated as sources. Publication remains governed by the repository's source, validation and corrections policy.</p><h2>Corrections</h2><p>Material corrections update the story metadata and preserve a visible correction note on the permanent article page.</p><h2>Images</h2><p>We do not copy third-party editorial images simply because they appear in a source article. Story imagery must be original, appropriately licensed, public-domain or otherwise permitted, with provenance retained when required.</p></main><footer><p>Aizanoi News · An Aizanoi Analytics publication</p><a href="/news/">Return to News</a></footer></body></html>\n`;
}

const css = `:root{--paper:#f3ead7;--ink:#17130e;--muted:#675f52;--rule:#2a241b;--brass:#9a6c25;--rust:#8b321f}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font-family:Georgia,'Times New Roman',serif;background-image:linear-gradient(rgba(154,108,37,.035) 1px,transparent 1px);background-size:100% 24px}.masthead,.edition-head,.news-grid,.empty-edition,footer,.archive-strip,.article-page,.method-page{width:min(1180px,calc(100% - 32px));margin-inline:auto}.masthead{padding:24px 0 12px;text-align:center;border-bottom:4px double var(--rule)}.wordmark{color:var(--ink);font-size:clamp(2rem,7vw,5rem);font-weight:900;letter-spacing:-.055em;text-decoration:none}.wordmark span{color:var(--rust)}.masthead>p{margin:3px 0 14px;font:700 .72rem/1.3 ui-monospace,monospace;letter-spacing:.18em;text-transform:uppercase}.masthead nav{display:flex;justify-content:center;flex-wrap:wrap;gap:4px 14px;border-top:1px solid var(--rule);padding-top:8px}.masthead nav a,.archive-strip a,footer a{min-height:44px;display:inline-flex;align-items:center;color:var(--ink);font:700 .76rem/1.4 Arial,sans-serif;text-transform:uppercase;letter-spacing:.08em;text-decoration-color:var(--brass);text-underline-offset:4px}.edition-head{text-align:center;padding:38px 8px 28px;border-bottom:1px solid var(--rule)}.edition-label,.kicker{font:800 .7rem/1.3 Arial,sans-serif;letter-spacing:.16em;color:var(--rust);text-transform:uppercase}.edition-head h1{margin:7px 0;font-size:clamp(2.1rem,5vw,4.8rem);line-height:.95}.edition-head>p:last-child{color:var(--muted);font-style:italic}.news-grid{display:grid;grid-template-columns:repeat(3,1fr);padding:26px 0;border-bottom:3px double var(--rule)}.story{padding:0 22px 22px;border-left:1px solid #9c907c}.story:nth-child(3n+1){border-left:0}.story h2{font-size:1.55rem;line-height:1.04;margin:7px 0 14px}.story h2 a{color:inherit;text-decoration-thickness:1px;text-decoration-color:rgba(139,50,31,.35);text-underline-offset:4px}.story.lead{grid-column:span 2}.story.lead h2{font-size:clamp(2rem,4vw,3.7rem)}.summary{font-size:1rem;line-height:1.55}.byline,.source-line,.corrections{font:600 .76rem/1.6 Arial,sans-serif;color:#5d554a}.source-line a,.article-sources a{color:var(--rust);font-weight:700}.corrections summary{cursor:pointer;color:var(--rust);min-height:44px;display:flex;align-items:center}.empty-edition{max-width:780px;text-align:center;padding:80px 24px}.empty-edition h2{font-size:clamp(2rem,5vw,4rem);margin:8px}.empty-edition p:last-child{font-size:1.15rem;line-height:1.6;color:var(--muted)}.archive-strip{padding:24px 0;display:flex;gap:8px 14px;flex-wrap:wrap}.archive-strip h2{width:100%;margin:0;font-size:1.15rem;text-transform:uppercase;letter-spacing:.08em}footer{display:flex;align-items:center;flex-wrap:wrap;justify-content:space-between;gap:8px 20px;padding:25px 0 50px;font:700 .72rem Arial,sans-serif;color:#5d554a}.article-page,.method-page{max-width:820px;padding:48px 0 70px}.article-page h1,.method-page h1{font-size:clamp(2.5rem,7vw,5.5rem);line-height:.94;margin:8px 0 22px}.article-deck,.method-page>p{font-size:1.18rem;line-height:1.7}.method-page h2,.article-sources h2{margin-top:34px;font-size:1.45rem}.article-image{margin:30px 0}.article-image img{display:block;width:100%;height:auto}.article-image figcaption{margin-top:8px;color:var(--muted);font:600 .72rem/1.5 Arial,sans-serif}.tags{display:flex;flex-wrap:wrap;gap:8px}.tags span{padding:5px 8px;border:1px solid #9c907c;border-radius:999px;font:700 .7rem Arial,sans-serif}.article-sources{margin-top:30px;padding-top:20px;border-top:1px solid #9c907c}.method-page{max-width:760px}.method-page p{line-height:1.75}@media(max-width:760px){.news-grid{grid-template-columns:1fr}.story,.story:nth-child(3n+1){grid-column:auto;border-left:0;border-top:1px solid #9c907c;padding:22px 4px}.story:first-child{border-top:0}.story h2{font-size:1.75rem}.story.lead h2{font-size:2.35rem}.masthead nav{gap:2px 12px}.edition-head{padding-top:28px}footer{display:flex}.article-page,.method-page{padding-top:34px}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}`;

function rss(items, generatedAt) {
  const entries = items.map((item) => `<item><title>${xmlEscape(item.title)}</title><link>${siteUrl}${storyPath(item)}</link><guid isPermaLink="true">${siteUrl}${storyPath(item)}</guid><pubDate>${new Date(item.publishedAt).toUTCString()}</pubDate><category>${xmlEscape(item.kind === 'weekly' ? 'Weekly' : categoryLabels.get(item.category))}</category><dc:creator>${xmlEscape(item.author.name)}</dc:creator><description>${xmlEscape(item.summary)}</description><source url="${xmlEscape(item.sources[0].url)}">${xmlEscape(item.sources[0].publisher)}</source></item>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>Aizanoi News</title><link>${siteUrl}/news/</link><atom:link href="${siteUrl}/news/rss.xml" rel="self" type="application/rss+xml"/><description>Original, concise and source-linked coverage from Aizanoi Analytics.</description><language>en</language><lastBuildDate>${new Date(generatedAt).toUTCString()}</lastBuildDate>${entries}</channel></rss>\n`;
}
function sitemap(editions, items, weeklyEditions = []) {
  const dynamic = [
    ...weeklyEditions.map((edition) => [edition.path, edition.date]),
    ...editions.map((edition) => [edition.path, edition.date]),
    ...items.map((item) => [storyPath(item), itemDate(item)]),
    ...[...categoryLabels.keys()].map((slug) => [`/news/category/${slug}/`, editions[0]?.date || '2026-08-24'])
  ];
  const entries = [...staticSitemapEntries, ...dynamic];
  const seen = new Set();
  const urls = entries.filter(([route]) => !seen.has(route) && seen.add(route));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(([route,lastmod]) => `  <url>\n    <loc>${siteUrl}${xmlEscape(route)}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`).join('\n')}\n</urlset>\n`;
}
function newsSitemap(items) {
  if (!items.length) return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"></urlset>\n`;
  const latest = Math.max(...items.map((item) => Date.parse(item.publishedAt)));
  const recent = items.filter((item) => Date.parse(item.publishedAt) >= latest - 48 * 60 * 60 * 1000).slice(0, 1000);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">\n${recent.map((item) => `  <url>\n    <loc>${siteUrl}${xmlEscape(storyPath(item))}</loc>\n    <news:news>\n      <news:publication><news:name>Aizanoi News</news:name><news:language>en</news:language></news:publication>\n      <news:publication_date>${xmlEscape(item.publishedAt)}</news:publication_date>\n      <news:title>${xmlEscape(item.title)}</news:title>\n    </news:news>\n  </url>`).join('\n')}\n</urlset>\n`;
}

const buildLock = await acquireBuildLock();
await recoverInterruptedBuild();
const nonce = `${process.pid}-${Date.now()}`;
const stageDir = path.join(publicDir, `.aizanoi-news-stage-${nonce}`);
const backupDir = path.join(publicDir, `.aizanoi-news-backup-${nonce}`);
const sitemapStage = path.join(publicDir, `.aizanoi-sitemap-stage-${nonce}.xml`);
const sitemapBackup = path.join(publicDir, `.aizanoi-sitemap-backup-${nonce}.xml`);
let oldTreeMoved = false, oldSitemapMoved = false, newsPromoted = false, sitemapPromoted = false;

try {
  let names = [];
  try { names = (await readdir(sourceDir)).filter((name) => name.endsWith('.json') && !name.startsWith('_')).sort(); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const items = [];
  const ids = new Set();
  const permanentPaths = new Set();
  for (const name of names) {
    const item = validate(JSON.parse(await readFile(path.join(sourceDir, name), 'utf8')), name);
    if (ids.has(item.id)) fail(name, `duplicate id ${item.id}`);
    const permanentPath = storyPath(item);
    if (permanentPaths.has(permanentPath)) fail(name, `duplicate permanent story path ${permanentPath}`);
    ids.add(item.id);
    permanentPaths.add(permanentPath);
    items.push(item);
  }
  items.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || b.priority - a.priority || Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || a.id.localeCompare(b.id));
  const dates = [...new Set(items.filter((item) => item.kind !== 'weekly').map(itemDate))].sort().reverse();
  let generatedAt;
  if (process.env.SOURCE_DATE_EPOCH !== undefined) {
    if (!/^\d+$/.test(process.env.SOURCE_DATE_EPOCH)) fail('SOURCE_DATE_EPOCH', 'must be a non-negative integer');
    const epoch = Number(process.env.SOURCE_DATE_EPOCH);
    if (!Number.isSafeInteger(epoch) || epoch > 4_102_444_800) fail('SOURCE_DATE_EPOCH', 'must be a realistic Unix timestamp');
    generatedAt = new Date(epoch * 1000).toISOString();
  } else generatedAt = new Date(items.length ? Math.max(...items.map((item) => Date.parse(item.retrievedAt))) : 0).toISOString();
  const editions = dates.map((date) => ({ date, path:`/news/${date}/`, itemCount:items.filter((item) => itemDate(item) === date && item.kind !== 'weekly').length }));
  const weeklyDates = [...new Set(items.filter((item) => item.kind === 'weekly').map(itemDate))].sort().reverse();
  const weeklyEditions = weeklyDates.map((date) => ({ date, week:isoWeek(date), path:`/news/weekly/${date}/`, itemCount:items.filter((item) => item.kind === 'weekly' && itemDate(item) === date).length }));
  const feed = { schemaVersion:4, generatedAt, categories:[...categoryLabels.keys()], editions, weeklyEditions, items };

  await rm(stageDir, { recursive:true, force:true });
  await rm(sitemapStage, { force:true });
  await mkdir(stageDir, { recursive:true });
  await writeFile(path.join(stageDir, 'index.json'), `${JSON.stringify(feed, null, 2)}\n`);
  await writeFile(path.join(stageDir, 'news.css'), `${css}\n`);
  const archiveLinks = editions.length ? `<aside class="archive-strip"><h2>Past editions</h2>${editions.map((edition) => `<a href="${edition.path}">${edition.date} (${edition.itemCount})</a>`).join('')}</aside>` : '';
  const weeklyArchiveLinks = weeklyEditions.length ? `<aside class="archive-strip"><h2>Weekly archive</h2>${weeklyEditions.map((edition) => `<a href="${edition.path}">${edition.date} · ${edition.week} (${edition.itemCount})</a>`).join('')}</aside>` : '';
  const latestDate = dates.filter((date) => items.some((item) => itemDate(item) === date && item.kind !== 'weekly'))[0];
  const latestWeeklyDate = weeklyEditions[0]?.date;
  await writeFile(path.join(stageDir, 'index.html'), page({ title:'Aizanoi News — The Daily Edition', eyebrow:latestDate ? dateLabel(latestDate) : 'Independent · Original · Source-linked', heading:latestDate ? dateLabel(latestDate) : 'The Daily Edition', deck:latestDate ? 'AI, technology, markets and football — edited into one concise edition.' : 'The press is ready. The record remains empty until verified reporting is published.', items:latestDate ? items.filter((item) => itemDate(item) === latestDate && item.kind !== 'weekly') : [], editionDate:latestDate, archiveLinks, extraArchive:weeklyArchiveLinks }));
  const aboutDir = path.join(stageDir, 'about');
  await mkdir(aboutDir, { recursive: true });
  await writeFile(path.join(aboutDir, 'index.html'), aboutPage());
  for (const date of dates) {
    const dayItems = items.filter((item) => itemDate(item) === date && item.kind !== 'weekly');
    if (!dayItems.length) continue;
    const dir = path.join(stageDir, date);
    await mkdir(dir, { recursive:true });
    await writeFile(path.join(dir, 'index.html'), page({ title:`${dateLabel(date)} — Aizanoi News`, eyebrow:'Aizanoi News · Daily archive', heading:dateLabel(date), deck:'A complete daily edition from the Aizanoi News archive.', items:dayItems, editionDate:date, canonicalPath:`/news/${date}/` }));
    for (const item of dayItems) {
      const articleDir = path.join(dir, storySlug(item));
      await mkdir(articleDir, { recursive:true });
      await writeFile(path.join(articleDir, 'index.html'), articlePage(item));
    }
  }
  for (const date of weeklyDates) {
    const weekItems = items.filter((item) => item.kind === 'weekly' && itemDate(item) === date);
    if (!weekItems.length) continue;
    const dir = path.join(stageDir, 'weekly', date);
    await mkdir(dir, { recursive:true });
    const week = weekItems[0].week;
    await writeFile(path.join(dir, 'index.html'), page({ title:`Weekly ${week} — Aizanoi News`, eyebrow:`Aizanoi News · Weekly Edition · ${week}`, heading:`The Weekly Edition — ${week}`, deck:'A longer-form analytical read across AI, technology, markets and football for the week ending today.', items:weekItems, editionDate:date, canonicalPath:`/news/weekly/${date}/`, isWeekly:true }));
    for (const item of weekItems) {
      const articleDir = path.join(dir, storySlug(item));
      await mkdir(articleDir, { recursive:true });
      await writeFile(path.join(articleDir, 'index.html'), articlePage(item));
    }
  }
  for (const [slug, label] of categoryLabels) {
    const dir = path.join(stageDir, 'category', slug);
    await mkdir(dir, { recursive:true });
    await writeFile(path.join(dir, 'index.html'), page({ title:`${label} Archive — Aizanoi News`, eyebrow:'Aizanoi News · Section archive', heading:`${label} Archive`, deck:`Every published ${label} report, newest first.`, items:items.filter((item) => item.category === slug), canonicalPath:`/news/category/${slug}/` }));
  }
  await writeFile(path.join(stageDir, 'rss.xml'), rss(items, generatedAt));
  await writeFile(path.join(stageDir, 'sitemap.xml'), newsSitemap(items));
  await writeFile(sitemapStage, sitemap(editions, items, weeklyEditions));

  JSON.parse(await readFile(path.join(stageDir, 'index.json'), 'utf8'));
  for (const required of [
    'index.json', 'index.html', 'news.css', 'rss.xml', 'sitemap.xml', 'about/index.html',
    ...editions.map((edition) => `${edition.date}/index.html`),
    ...weeklyEditions.map((edition) => `weekly/${edition.date}/index.html`),
    ...items.map((item) => `${storyPath(item).replace(/^\/news\//, '')}index.html`),
    ...[...categoryLabels.keys()].map((slug) => `category/${slug}/index.html`)
  ]) await readFile(path.join(stageDir, required));
  await readFile(sitemapStage);
  if (process.env.AIZANOI_NEWS_FAIL_AFTER_STAGE === '1') throw new Error('Injected failure after staged News validation');

  try { await rename(newsDir, backupDir); oldTreeMoved = true; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  try { await rename(sitemapFile, sitemapBackup); oldSitemapMoved = true; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  try {
    await rename(stageDir, newsDir); newsPromoted = true;
    await rename(sitemapStage, sitemapFile); sitemapPromoted = true;
  } catch (error) {
    if (newsPromoted) await rm(newsDir, { recursive:true, force:true });
    if (sitemapPromoted) await rm(sitemapFile, { force:true });
    if (oldTreeMoved) await rename(backupDir, newsDir).catch(() => {});
    if (oldSitemapMoved) await rename(sitemapBackup, sitemapFile).catch(() => {});
    throw error;
  }
  if (oldTreeMoved) await rm(backupDir, { recursive:true, force:true });
  if (oldSitemapMoved) await rm(sitemapBackup, { force:true });
  console.log(`Aizanoi News: wrote ${items.length} item(s), ${editions.length} edition(s), ${categoryLabels.size} archive(s), permanent article pages and News sitemap discovery`);
} finally {
  await rm(stageDir, { recursive:true, force:true });
  await rm(sitemapStage, { force:true });
  if (!newsPromoted && oldTreeMoved) { try { await rename(backupDir, newsDir); } catch (_) {} }
  if (!sitemapPromoted && oldSitemapMoved) { try { await rename(sitemapBackup, sitemapFile); } catch (_) {} }
  await rm(backupDir, { recursive:true, force:true });
  await rm(sitemapBackup, { force:true });
  await buildLock?.close();
  await rm(lockFile, { force:true });
}
