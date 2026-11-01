import { mkdir, open, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const sourceDir = path.join(root, 'content/news/items');
const publicDir = path.join(root, 'frontend');
const newsDir = path.join(publicDir, 'news');
const sitemapFile = path.join(publicDir, 'sitemap.xml');
const lockFile = path.join(root, '.aizanoi-news-build.lock');
const siteUrl = 'https://aizanoianalytics.com';
const twitterSiteMeta = '<meta name="twitter:site" content="@AizanoiHQ">';
const publicIdentityLinks = '<nav class="public-identity-links" aria-label="Social and contact"><a href="https://x.com/AizanoiHQ" target="_blank" rel="noopener noreferrer">X — @AizanoiHQ</a><a href="https://github.com/aizanoianalytics/aizanoi-analytics" target="_blank" rel="noopener noreferrer">GitHub</a><a href="mailto:aizanoianalytics@protonmail.com">Email</a></nav>';
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
  ['/analytics/markets/', '2026-09-10'],
  ['/analytics/dashboards/new-hr-collection/', '2026-09-03'],
  ['/analytics/dashboards/new-hr-collection/pacs/', '2026-09-03'],
  ['/analytics/dashboards/new-hr-collection/recruitment-analytics/', '2026-09-03'],
  ['/worlds/', '2026-08-24'],
  ['/forge/', '2026-08-24'],
  ['/journal/', '2026-08-24'],
  ['/labs/', '2026-08-24'],
  ['/arcade/', '2026-08-24'],
  ['/arcade/snake-royale/', '2026-10-26'],
  ['/arcade/chess/', '2026-10-31'],
  ['/arcade/maze-chase/', '2026-10-31'],
  ['/arcade/capture-flag/', '2026-10-31'],
  ['/arcade/holdem/', '2026-10-31'],
  ['/arcade/football/', '2026-10-31'],
  ['/arcade/anatolian-pact/', '2026-10-31'],
  ['/arcade/trade-arena/', '2026-10-31'],
  ['/worlds/aizanoi-225/', '2026-09-07']
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
const shortDate = (date) => new Intl.DateTimeFormat('en-GB', { timeZone:'UTC', day:'numeric', month:'short', year:'numeric' }).format(new Date(`${date}T00:00:00Z`));
function coveredRange(items) {
  const days = items.flatMap((item) => item.sources.map((source) => source.publishedAt.slice(0, 10))).sort();
  if (!days.length) return '';
  return days[0] === days.at(-1) ? shortDate(days[0]) : `${shortDate(days[0])} – ${shortDate(days.at(-1))}`;
}
function editionNavMarkup(list, date, label, latestPath) {
  const index = list.findIndex((edition) => edition.date === date);
  if (index < 0) return '';
  const newer = list[index - 1], older = list[index + 1];
  const links = [
    older ? `<a rel="prev" href="${older.path}">&larr; Previous ${label}: ${older.date}</a>` : '',
    newer ? `<a rel="next" href="${newer.path}">Next ${label}: ${newer.date} &rarr;</a>` : '',
    index > 0 ? `<a class="edition-latest" href="${latestPath}">Latest ${label}</a>` : ''
  ].join('');
  return links ? `<nav class="edition-nav" aria-label="${label[0].toUpperCase() + label.slice(1)} editions">${links}</nav>` : '';
}
function storyNavMarkup(list, item) {
  const index = list.findIndex((entry) => entry.id === item.id);
  const older = list[index + 1], newer = list[index - 1];
  const links = [
    older ? `<a rel="prev" href="${storyPath(older)}">&larr; ${htmlEscape(older.title)}</a>` : '',
    newer ? `<a rel="next" href="${storyPath(newer)}">${htmlEscape(newer.title)} &rarr;</a>` : ''
  ].join('');
  return links ? `<nav class="edition-nav" aria-label="More from this edition">${links}</nav>` : '';
}
function story(item, lead = false) {
  return `<article id="${htmlEscape(item.id)}" class="story${lead ? ' lead' : ''}" data-priority="${item.priority}"><div class="card-meta"><p class="kicker">${htmlEscape(categoryLabels.get(item.category))}</p><time datetime="${item.publishedAt}">${itemDate(item)}</time></div><h2><a href="${storyPath(item)}">${htmlEscape(item.title)}</a></h2><p class="summary">${htmlEscape(editionSummary(item))}</p><p class="byline">By ${htmlEscape(item.author.name)} · Edited by ${htmlEscape(item.editor.name)}</p><p class="source-line"><strong>Sources</strong> ${sourceLinks(item)}</p>${correctionMarkup(item)}</article>`;
}
function page({ title, eyebrow, heading, deck, items, editionDate = '', archiveLinks = '', canonicalPath = '/news/', isWeekly = false, extraArchive = '', editionNav = '' }) {
  const canonical = `${siteUrl}${canonicalPath}`;
  const structured = editionDate && items.length
    ? { '@context':'https://schema.org', '@type':'ItemList', name:title, url:canonical, itemListElement:items.map((item,index)=>({ '@type':'ListItem', position:index+1, url:`${siteUrl}${storyPath(item)}`, item:newsArticleSchema(item) })) }
    : { '@context':'https://schema.org', '@type':'CollectionPage', name:title, description:deck, url:canonical, isPartOf:{ '@type':'WebSite', name:'Aizanoi Analytics', url:siteUrl } };
  const jsonLd = JSON.stringify(structured).replace(/</g, '\\u003c');
  const content = items.length ? `<main id="main" tabindex="-1" class="news-grid">${items.map((item, index) => story(item, index === 0)).join('')}</main>` : `<main id="main" tabindex="-1" class="empty-edition"><p class="kicker">THE PRESS IS READY</p><h2>No edition has been published yet.</h2><p>The News Desk is preparing concise, original reports with named editors and linked sources. Return for the first edition.</p></main>`;
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${htmlEscape(title)}</title><meta name="description" content="${htmlEscape(deck)}"><link rel="canonical" href="${htmlEscape(canonical)}"><link rel="icon" href="/assets/branding/aizanoi-logo-mark.svg" type="image/svg+xml"><meta property="og:type" content="website"><meta property="og:site_name" content="Aizanoi News"><meta property="og:title" content="${htmlEscape(title)}"><meta property="og:description" content="${htmlEscape(deck)}"><meta property="og:url" content="${htmlEscape(canonical)}"><meta property="og:image" content="${siteUrl}/assets/branding/aizanoi-og.png"><meta name="twitter:card" content="summary_large_image">${twitterSiteMeta}<meta name="twitter:title" content="${htmlEscape(title)}"><meta name="twitter:description" content="${htmlEscape(deck)}"><meta name="twitter:image" content="${siteUrl}/assets/branding/aizanoi-og.png"><script type="application/ld+json">${jsonLd}</script><link rel="alternate" type="application/rss+xml" title="Aizanoi News RSS" href="/news/rss.xml"><link rel="stylesheet" href="/news/news.css"></head>\n<body><a class="skip-link" href="#main">Skip to content</a><header class="masthead"><a class="wordmark" href="/news/" aria-label="Aizanoi News home">AIZANOI <span>NEWS</span></a><p>${htmlEscape(eyebrow)}</p><nav aria-label="News sections"><a href="/">Aizanoi Analytics</a>${[...categoryLabels].map(([slug, label]) => `<a href="/news/category/${slug}/">${htmlEscape(label)}</a>`).join('')}<a href="/news/about/">How we publish</a><a href="/news/rss.xml">RSS</a></nav></header>\n<section class="edition-head"><p class="edition-label">${isWeekly ? 'THE WEEKLY EDITION' : (editionDate ? 'THE DAILY EDITION' : 'THE NEWS ARCHIVE')}</p><h1>${htmlEscape(heading)}</h1><p>${htmlEscape(deck)}</p></section>${editionNav}${content}${archiveLinks}${extraArchive}\n<footer><p>Aizanoi News · An Aizanoi Analytics publication · Sources before claims · AI-assisted production is disclosed in our methodology.</p><a href="/news/about/">How we publish</a><a href="/news/rss.xml">RSS</a><a href="/privacy/">Privacy</a>${publicIdentityLinks}</footer></body></html>\n`;
}
function articlePage(item, storyNav = '') {
  const canonical = `${siteUrl}${storyPath(item)}`;
  const structured = { '@context':'https://schema.org', ...newsArticleSchema(item) };
  const jsonLd = JSON.stringify(structured).replace(/</g, '\\u003c');
  const socialImage = item.image?.url || `${siteUrl}/assets/branding/aizanoi-og.png`;
  const image = item.image ? `<figure class="article-image"><img src="${htmlEscape(item.image.url)}" alt="${htmlEscape(item.image.alt)}" loading="eager" decoding="async">${item.image.credit ? `<figcaption>${htmlEscape(item.image.credit)}${item.image.license ? ` · ${htmlEscape(item.image.license)}` : ''}</figcaption>` : ''}</figure>` : '';
  const tags = item.tags.length ? `<p class="tags">${item.tags.map((tag) => `<span>${htmlEscape(tag)}</span>`).join('')}</p>` : '';
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${htmlEscape(item.title)} — Aizanoi News</title><meta name="description" content="${htmlEscape(item.summary)}"><link rel="canonical" href="${canonical}"><link rel="icon" href="/assets/branding/aizanoi-logo-mark.svg" type="image/svg+xml"><meta property="og:type" content="article"><meta property="og:site_name" content="Aizanoi News"><meta property="og:title" content="${htmlEscape(item.title)}"><meta property="og:description" content="${htmlEscape(item.summary)}"><meta property="og:url" content="${canonical}"><meta property="og:image" content="${htmlEscape(socialImage)}"><meta name="twitter:card" content="summary_large_image">${twitterSiteMeta}<meta name="twitter:title" content="${htmlEscape(item.title)}"><meta name="twitter:description" content="${htmlEscape(item.summary)}"><meta name="twitter:image" content="${htmlEscape(socialImage)}"><script type="application/ld+json">${jsonLd}</script><link rel="alternate" type="application/rss+xml" title="Aizanoi News RSS" href="/news/rss.xml"><link rel="stylesheet" href="/news/news.css"></head>\n<body><a class="skip-link" href="#main">Skip to content</a><header class="masthead"><a class="wordmark" href="/news/" aria-label="Aizanoi News home">AIZANOI <span>NEWS</span></a><p>${htmlEscape(dateLabel(itemDate(item)))}</p><nav aria-label="News sections"><a href="/">Aizanoi Analytics</a><a href="${editionPath(item)}">${item.kind === 'weekly' ? 'Weekly edition' : 'Daily edition'}</a><a href="/news/category/${item.category}/">${htmlEscape(categoryLabels.get(item.category))}</a><a href="/news/about/">How we publish</a><a href="/news/rss.xml">RSS</a></nav></header><main id="main" tabindex="-1" class="article-page"><p class="kicker">${htmlEscape(categoryLabels.get(item.category))}</p><h1>${htmlEscape(item.title)}</h1><p class="article-deck">${htmlEscape(item.summary)}</p>${image}<p class="byline">By ${htmlEscape(item.author.name)} · Edited by ${htmlEscape(item.editor.name)} · <time datetime="${item.publishedAt}">${htmlEscape(dateLabel(itemDate(item)))}</time></p>${tags}<section class="article-sources"><h2>Sources</h2><p>${sourceLinks(item)}</p></section>${correctionMarkup(item)}${storyNav}</main><footer><p>Aizanoi News publishes original summaries and links the sources behind factual claims.</p><a href="${editionPath(item)}">Back to the edition</a><a href="/news/about/">Methodology & corrections</a><a href="/privacy/">Privacy</a>${publicIdentityLinks}</footer></body></html>\n`;
}
function aboutPage() {
  const canonical = `${siteUrl}/news/about/`;
  const structured = JSON.stringify({ '@context':'https://schema.org', '@type':'AboutPage', name:'How Aizanoi News publishes', url:canonical, isPartOf:{ '@type':'WebSite', name:'Aizanoi Analytics', url:siteUrl } }).replace(/</g, '\\u003c');
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>How We Publish — Aizanoi News</title><meta name="description" content="Aizanoi News sourcing, corrections and AI-assisted production methodology."><link rel="canonical" href="${canonical}"><link rel="icon" href="/assets/branding/aizanoi-logo-mark.svg" type="image/svg+xml">${twitterSiteMeta}<script type="application/ld+json">${structured}</script><link rel="stylesheet" href="/news/news.css"></head><body><a class="skip-link" href="#main">Skip to content</a><header class="masthead"><a class="wordmark" href="/news/">AIZANOI <span>NEWS</span></a><p>METHOD · SOURCES · CORRECTIONS</p><nav aria-label="News sections"><a href="/news/">News home</a><a href="/">Aizanoi Analytics</a><a href="/news/rss.xml">RSS</a></nav></header><main id="main" tabindex="-1" class="method-page"><p class="kicker">HOW WE PUBLISH</p><h1>Sources before claims.</h1><p>Aizanoi News publishes original concise summaries rather than copied article bodies. Every story links the sources used to prepare it.</p><h2>Source selection</h2><p>For important, disputed or fast-moving stories we prefer multiple independent sources and/or a primary source. Rehosts of the same wire report do not count as independent corroboration, and direct original-publisher links are preferred when available.</p><h2>AI-assisted production</h2><p>AI-assisted tools may support source discovery, drafting, classification and production. They are not treated as sources. Publication remains governed by the repository's source, validation and corrections policy.</p><h2>Corrections</h2><p>Material corrections update the story metadata and preserve a visible correction note on the permanent article page.</p><h2>Images</h2><p>We do not copy third-party editorial images simply because they appear in a source article. Story imagery must be original, appropriately licensed, public-domain or otherwise permitted, with provenance retained when required.</p></main><footer><p>Aizanoi News · An Aizanoi Analytics publication</p><a href="/news/">Return to News</a><a href="/privacy/">Privacy</a>${publicIdentityLinks}</footer></body></html>\n`;
}

const css = `:root{color-scheme:light dark;--bg:#f4f7fb;--surface:#fff;--surface-2:#eaf0f8;--ink:#182334;--muted:#4d5b6d;--line:#cfd8e4;--accent:#3846a8;--accent-ink:#fff;--kicker:#8a3a22;--focus:#3b55d9;--serif:Georgia,'Times New Roman',serif;--sans:Inter,system-ui,-apple-system,'Segoe UI',Arial,sans-serif;--mono:ui-monospace,SFMono-Regular,Consolas,monospace}@media(prefers-color-scheme:dark){:root{--bg:#10151d;--surface:#18202b;--surface-2:#222d3b;--ink:#eaf0f8;--muted:#b0bccb;--line:#34414f;--accent:#9db0ff;--accent-ink:#10151d;--kicker:#f0a98e;--focus:#a9b8ff}}*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--serif);line-height:1.6}a{color:var(--accent)}a:focus-visible,summary:focus-visible{outline:3px solid var(--focus);outline-offset:3px;border-radius:4px}.skip-link{position:absolute;left:16px;top:-80px;z-index:10;padding:12px 16px;background:var(--accent);color:var(--accent-ink);font:700 .9rem var(--sans);border-radius:8px}.skip-link:focus{top:12px}main:focus{outline:none}.masthead,.edition-head,.news-grid,.empty-edition,footer,.archive-strip,.article-page,.method-page,.edition-nav{width:min(1180px,calc(100% - 32px));margin-inline:auto}.masthead{display:flex;flex-wrap:wrap;align-items:center;gap:4px 20px;padding:16px 0 12px;border-bottom:1px solid var(--line)}.wordmark{color:var(--ink);font:800 1.5rem/1 var(--sans);letter-spacing:-.02em;text-decoration:none;min-height:44px;display:inline-flex;align-items:center}.wordmark span{color:var(--accent)}.masthead>p{margin:0;flex:1 1 auto;font:600 .8rem/1.3 var(--mono);color:var(--muted);letter-spacing:.04em;text-transform:uppercase}.masthead nav{display:flex;flex-wrap:wrap;gap:0 6px;flex:1 1 100%}.masthead nav a,.archive-strip a,footer a,.edition-nav a{min-height:44px;display:inline-flex;align-items:center;padding:0 10px;color:var(--ink);font:600 .85rem/1.3 var(--sans);text-decoration-color:var(--accent);text-underline-offset:4px}.masthead nav a{border-radius:999px}.masthead nav a:hover,.archive-strip a:hover,.edition-nav a:hover{background:var(--surface-2)}.edition-head{padding:36px 0 22px}.edition-label,.kicker{margin:0;font:700 .72rem/1.3 var(--sans);letter-spacing:.1em;color:var(--kicker);text-transform:uppercase}.edition-head h1{margin:8px 0;font:700 clamp(2rem,4.6vw,3.4rem)/1.1 var(--serif);letter-spacing:-.01em}.edition-head>p:last-child{margin:0;max-width:70ch;color:var(--muted);font-size:1.05rem}.edition-nav{display:flex;flex-wrap:wrap;gap:6px 10px;padding-bottom:18px}.edition-nav a{border:1px solid var(--line);border-radius:10px;background:var(--surface);padding:0 14px}.edition-nav .edition-latest{background:var(--accent);color:var(--accent-ink);border-color:var(--accent)}.edition-nav .edition-latest:hover{background:var(--accent);filter:brightness(1.1)}.news-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;padding:6px 0 30px}.story{display:flex;flex-direction:column;padding:20px 22px 12px;background:var(--surface);border:1px solid var(--line);border-radius:14px}.story.lead{grid-column:span 2}.story h2{font:700 1.35rem/1.25 var(--serif);margin:6px 0 10px}.story h2 a{color:inherit;text-decoration-thickness:1px;text-decoration-color:var(--line);text-underline-offset:4px}.story h2 a:hover{text-decoration-color:var(--accent)}.story.lead h2{font-size:clamp(1.7rem,3vw,2.3rem);line-height:1.15}.story h2,.article-page h1,.method-page h1,.edition-head h1{overflow-wrap:break-word}.summary{font-size:1.02rem;line-height:1.6;max-width:70ch;margin:0 0 12px}.card-meta{display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 10px}.card-meta time{font:600 .75rem/1.3 var(--mono);color:var(--muted)}.byline,.corrections{font:500 .8rem/1.5 var(--sans);color:var(--muted)}.byline{margin:0 0 4px}.source-line{margin:auto 0 0;padding-top:10px;border-top:1px solid var(--line);display:flex;flex-wrap:wrap;align-items:center;gap:0 4px;font:600 .8rem/1.4 var(--sans);color:var(--muted)}.source-line strong{margin-right:6px}.source-line a,.article-sources a{display:inline-flex;align-items:center;justify-content:center;min-width:44px;min-height:44px;padding:0 8px;color:var(--accent);font-weight:700;text-decoration-thickness:1px;text-underline-offset:4px}.corrections summary{cursor:pointer;color:var(--kicker);min-height:44px;display:flex;align-items:center}.empty-edition{max-width:780px;text-align:center;padding:80px 24px}.empty-edition h2{font-size:clamp(2rem,5vw,3rem);margin:8px}.empty-edition p:last-child{font-size:1.1rem;color:var(--muted)}.archive-strip{padding:20px 0;display:flex;gap:4px 8px;flex-wrap:wrap;border-top:1px solid var(--line)}.archive-strip h2{width:100%;margin:0;font:700 .85rem var(--sans);text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}.archive-strip a{font-family:var(--mono);font-size:.8rem;border:1px solid var(--line);border-radius:8px;background:var(--surface)}footer{display:flex;align-items:center;flex-wrap:wrap;justify-content:space-between;gap:4px 20px;padding:22px 0 46px;margin-top:10px;border-top:1px solid var(--line);font:500 .8rem/1.5 var(--sans);color:var(--muted)}footer a{padding:0}.public-identity-links{display:flex;align-items:center;flex-wrap:wrap;gap:0 16px}.article-page,.method-page{max-width:760px;padding:36px 0 60px}.article-page h1,.method-page h1{font:700 clamp(2rem,5.5vw,3.2rem)/1.12 var(--serif);letter-spacing:-.01em;margin:8px 0 18px}.article-deck{font-size:1.2rem;line-height:1.65;max-width:70ch;margin:0 0 18px}.method-page>p,.method-page li{font-size:1.1rem;line-height:1.7;max-width:70ch}.method-page h2,.article-sources h2{margin:32px 0 8px;font:700 1.35rem/1.3 var(--serif)}.article-page .byline{margin:14px 0 8px}.article-page .byline time{font-family:var(--mono);font-size:.78rem}.article-image{margin:22px 0}.article-image img{display:block;width:100%;height:auto;max-height:480px;object-fit:cover;border-radius:12px;background:var(--surface-2)}.article-image figcaption{margin-top:8px;color:var(--muted);font:500 .78rem/1.5 var(--sans)}.tags{display:flex;flex-wrap:wrap;gap:8px;padding:0;margin:8px 0}.tags span{padding:3px 10px;border:1px solid var(--line);border-radius:999px;background:var(--surface);color:var(--muted);font:600 .75rem var(--sans)}.article-sources{margin-top:26px;padding:16px 18px;border:1px solid var(--line);border-radius:12px;background:var(--surface)}.article-sources h2{margin-top:0}.article-sources p{margin:0;font:600 1rem/1.4 var(--sans);display:flex;flex-wrap:wrap;gap:0 6px}.article-sources a{font-size:1rem}.article-page .edition-nav{width:auto;padding:28px 0 0}@media(max-width:900px){.news-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:620px){.news-grid{grid-template-columns:1fr;gap:14px}.story.lead{grid-column:auto}.story{padding:16px 16px 8px}.masthead>p{flex-basis:100%;order:3}.edition-head{padding-top:24px}footer{display:flex}.article-page,.method-page{padding-top:24px}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important}}@media print{:root{--bg:#fff;--surface:#fff;--surface-2:#fff;--ink:#000;--muted:#333;--line:#999;--accent:#000;--accent-ink:#fff;--kicker:#000;--focus:#000}body{background:#fff;color:#000}.masthead nav,.skip-link,.edition-nav,.archive-strip,.public-identity-links{display:none}.story{break-inside:avoid;border-color:#999;background:#fff}.news-grid{display:block}.story.lead{grid-column:auto}a{color:#000}.source-line a::after,.article-sources a::after{content:' (' attr(href) ')';font-weight:400;font-size:.75em;word-break:break-all}}`;

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
  await writeFile(path.join(stageDir, 'index.html'), page({ title:'Aizanoi News — The Daily Edition', eyebrow:latestDate ? dateLabel(latestDate) : 'Independent · Original · Source-linked', heading:latestDate ? dateLabel(latestDate) : 'The Daily Edition', deck:latestDate ? 'AI, technology, markets and football — edited into one concise edition.' : 'The press is ready. The record remains empty until verified reporting is published.', items:latestDate ? items.filter((item) => itemDate(item) === latestDate && item.kind !== 'weekly') : [], editionDate:latestDate, editionNav:latestDate ? editionNavMarkup(editions, latestDate, 'daily', '/news/') : '', archiveLinks, extraArchive:weeklyArchiveLinks }));
  const aboutDir = path.join(stageDir, 'about');
  await mkdir(aboutDir, { recursive: true });
  await writeFile(path.join(aboutDir, 'index.html'), aboutPage());
  for (const date of dates) {
    const dayItems = items.filter((item) => itemDate(item) === date && item.kind !== 'weekly');
    if (!dayItems.length) continue;
    const dir = path.join(stageDir, date);
    await mkdir(dir, { recursive:true });
    await writeFile(path.join(dir, 'index.html'), page({ title:`${dateLabel(date)} — Aizanoi News`, eyebrow:'Aizanoi News · Daily archive', heading:dateLabel(date), deck:'A complete daily edition from the Aizanoi News archive.', items:dayItems, editionDate:date, canonicalPath:`/news/${date}/`, editionNav:editionNavMarkup(editions, date, 'daily', '/news/') }));
    for (const item of dayItems) {
      const articleDir = path.join(dir, storySlug(item));
      await mkdir(articleDir, { recursive:true });
      await writeFile(path.join(articleDir, 'index.html'), articlePage(item, storyNavMarkup(dayItems, item)));
    }
  }
  for (const date of weeklyDates) {
    const weekItems = items.filter((item) => item.kind === 'weekly' && itemDate(item) === date);
    if (!weekItems.length) continue;
    const dir = path.join(stageDir, 'weekly', date);
    await mkdir(dir, { recursive:true });
    const week = weekItems[0].week;
    await writeFile(path.join(dir, 'index.html'), page({ title:`Weekly ${week} — Aizanoi News`, eyebrow:`Aizanoi News · Weekly Edition · ${week}`, heading:`The Weekly Edition — ${week}`, deck:`A longer-form analytical read across AI, technology, markets and football, published ${dateLabel(date)}. Sources dated ${coveredRange(weekItems)}.`, items:weekItems, editionDate:date, editionNav:editionNavMarkup(weeklyEditions, date, 'weekly', '/news/weekly/' + weeklyEditions[0].date + '/'), canonicalPath:`/news/weekly/${date}/`, isWeekly:true }));
    for (const item of weekItems) {
      const articleDir = path.join(dir, storySlug(item));
      await mkdir(articleDir, { recursive:true });
      await writeFile(path.join(articleDir, 'index.html'), articlePage(item, storyNavMarkup(weekItems, item)));
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
