import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const sourceDir = path.join(root, 'content/news/items');
const publicDir = path.join(root, 'frontend');
const feedFile = path.join(publicDir, 'content/news/index.json');
const newsDir = path.join(publicDir, 'news');
const siteUrl = 'https://aizanoianalytics.com';
const categoryLabels = new Map([
  ['ai', 'AI'],
  ['technology', 'Technology'],
  ['economy-markets', 'Economy / Markets'],
  ['football', 'Football']
]);

function fail(file, message) { throw new Error(`${file}: ${message}`); }
function iso(value, file, field) {
  const match = typeof value === 'string' && value.match(/^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/);
  const parsed = match ? Date.parse(value) : NaN;
  const year = Number(match?.[1]);
  const month = Number(match?.[2]);
  const day = Number(match?.[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (!match || month < 1 || month > 12 || day < 1 || day > days[month - 1] || Number.isNaN(parsed)) {
    fail(file, `${field} must be an ISO 8601 date-time`);
  }
  return new Date(parsed).toISOString();
}
function text(value, file, field, { min = 1, max }) {
  if (typeof value !== 'string' || !value.trim()) fail(file, `${field} is required`);
  const clean = value.trim().replace(/\s+/g, ' ');
  if (clean.length < min) fail(file, `${field} must be at least ${min} characters`);
  if (clean.length > max) fail(file, `${field} exceeds ${max} characters`);
  return clean;
}
function identity(value, file, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(file, `${field} identity is required`);
  return { name: text(value.name, file, `${field}.name`, { max: 120 }) };
}
function validate(item, file) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) fail(file, 'item must be an object');
  const id = text(item.id, file, 'id', { max: 120 });
  if (!/^[a-z0-9][a-z0-9-]+$/.test(id)) fail(file, 'id must use lowercase letters, numbers and hyphens');
  const title = text(item.title, file, 'title', { max: 160 });
  const summary = text(item.summary, file, 'summary', { min: 80, max: 600 });
  if (!categoryLabels.has(item.category)) fail(file, `category must be one of ${[...categoryLabels.keys()].join(', ')}`);
  const publishedAt = iso(item.publishedAt, file, 'publishedAt');
  const updatedAt = iso(item.updatedAt || item.publishedAt, file, 'updatedAt');
  const retrievedAt = iso(item.retrievedAt, file, 'retrievedAt');
  if (Date.parse(updatedAt) < Date.parse(publishedAt)) fail(file, 'updatedAt cannot precede publishedAt');
  if (!Array.isArray(item.corrections)) fail(file, 'corrections history must be an array');
  const corrections = item.corrections.map((correction, index) => ({
    note: text(correction?.note, file, `corrections[${index}].note`, { max: 400 }),
    correctedAt: iso(correction?.correctedAt, file, `corrections[${index}].correctedAt`)
  }));
  for (const correction of corrections) {
    if (Date.parse(correction.correctedAt) < Date.parse(publishedAt)) fail(file, 'correction time cannot precede publication');
    if (Date.parse(correction.correctedAt) > Date.parse(updatedAt)) fail(file, 'correction time cannot follow updatedAt');
  }
  if (!Array.isArray(item.sources) || item.sources.length < 1) fail(file, 'at least one source is required');
  const sources = item.sources.map((source, index) => {
    const publisher = text(source?.publisher, file, `sources[${index}].publisher`, { max: 120 });
    let url;
    try { url = new URL(source?.url); } catch { fail(file, `sources[${index}].url must be a valid URL`); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      fail(file, `sources[${index}].url must be a public http or https URL without credentials`);
    }
    const sourcePublishedAt = iso(source?.publishedAt, file, `sources[${index}].publishedAt`);
    if (Date.parse(sourcePublishedAt) > Date.parse(retrievedAt)) fail(file, 'source publication date cannot follow retrievedAt');
    return { publisher, url: url.toString(), publishedAt: sourcePublishedAt };
  });
  const tags = Array.isArray(item.tags)
    ? item.tags.map((tag, index) => text(tag, file, `tags[${index}]`, { max: 40 })).slice(0, 12)
    : [];
  return {
    id, title, summary, category: item.category, publishedAt, updatedAt, retrievedAt,
    author: identity(item.author, file, 'author'), editor: identity(item.editor, file, 'editor'),
    corrections, tags, sources
  };
}

const htmlEscape = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const xmlEscape = htmlEscape;
const dateLabel = (date) => new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${date}T00:00:00Z`));
const itemDate = (item) => item.publishedAt.slice(0, 10);

function story(item, lead = false) {
  const sources = item.sources.map((source) => `<a href="${htmlEscape(source.url)}" rel="noopener noreferrer">${htmlEscape(source.publisher)}</a>`).join('<span aria-hidden="true"> · </span>');
  const corrections = item.corrections.length
    ? `<details class="corrections"><summary>Corrections (${item.corrections.length})</summary><ol>${item.corrections.map((entry) => `<li><time datetime="${entry.correctedAt}">${entry.correctedAt.slice(0, 10)}</time> — ${htmlEscape(entry.note)}</li>`).join('')}</ol></details>`
    : '';
  return `<article id="${htmlEscape(item.id)}" class="story${lead ? ' lead' : ''}"><p class="kicker">${htmlEscape(categoryLabels.get(item.category))}</p><h2>${htmlEscape(item.title)}</h2><p class="summary">${htmlEscape(item.summary)}</p><p class="byline">By ${htmlEscape(item.author.name)} · Edited by ${htmlEscape(item.editor.name)}</p><p class="source-line"><strong>Sources</strong> ${sources}</p>${corrections}</article>`;
}

function page({ title, eyebrow, heading, deck, items, editionDate = '', archiveLinks = '', canonicalPath = '/news/' }) {
  const canonical = `${siteUrl}${canonicalPath}`;
  const structured = editionDate && items.length
    ? {
        '@context':'https://schema.org', '@type':'ItemList', name:title, url:canonical,
        itemListElement:items.map((item,index)=>({
          '@type':'ListItem', position:index+1,
          item:{ '@type':'NewsArticle', headline:item.title, description:item.summary, datePublished:item.publishedAt, dateModified:item.updatedAt, author:{ '@type':'Organization', name:item.author.name }, editor:{ '@type':'Person', name:item.editor.name }, mainEntityOfPage:`${canonical}#${item.id}` }
        }))
      }
    : { '@context':'https://schema.org', '@type':'CollectionPage', name:title, description:deck, url:canonical, isPartOf:{ '@type':'WebSite', name:'Aizanoi', url:siteUrl } };
  const jsonLd = JSON.stringify(structured).replace(/</g, '\\u003c');
  const content = items.length
    ? `<main class="news-grid">${items.map((item, index) => story(item, index === 0)).join('')}</main>`
    : `<main class="empty-edition"><p class="kicker">THE PRESS IS READY</p><h2>No edition has been published yet.</h2><p>The News Desk is preparing concise, original reports with named editors and linked sources. Return for the first edition.</p></main>`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${htmlEscape(title)}</title><meta name="description" content="${htmlEscape(deck)}"><link rel="canonical" href="${htmlEscape(canonical)}"><meta property="og:type" content="website"><meta property="og:site_name" content="Aizanoi News"><meta property="og:title" content="${htmlEscape(title)}"><meta property="og:description" content="${htmlEscape(deck)}"><meta property="og:url" content="${htmlEscape(canonical)}"><meta property="og:image" content="${siteUrl}/assets/branding/aizanoi-og.png"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${htmlEscape(title)}"><meta name="twitter:description" content="${htmlEscape(deck)}"><meta name="twitter:image" content="${siteUrl}/assets/branding/aizanoi-og.png"><script type="application/ld+json">${jsonLd}</script><link rel="alternate" type="application/rss+xml" title="Aizanoi News RSS" href="/news/rss.xml"><link rel="stylesheet" href="/news/news.css"></head>
<body><header class="masthead"><a class="wordmark" href="/news/" aria-label="Aizanoi News home">AIZANOI <span>NEWS</span></a><p>${htmlEscape(eyebrow)}</p><nav aria-label="News sections">${[...categoryLabels].map(([slug, label]) => `<a href="/news/category/${slug}/">${htmlEscape(label)}</a>`).join('')}<a href="/news/rss.xml">RSS</a></nav></header>
<section class="edition-head"><p class="edition-label">${editionDate ? 'THE DAILY EDITION' : 'THE NEWS ARCHIVE'}</p><h1>${htmlEscape(heading)}</h1><p>${htmlEscape(deck)}</p></section>${content}${archiveLinks}
<footer><p>Aizanoi News · Original summaries · Sources before claims</p><a href="/">Return to AizanoiOS</a></footer></body></html>\n`;
}

const css = `:root{--paper:#f3ead7;--ink:#17130e;--muted:#675f52;--rule:#2a241b;--brass:#9a6c25;--rust:#9a3f27}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font-family:Georgia,'Times New Roman',serif;background-image:linear-gradient(rgba(154,108,37,.035) 1px,transparent 1px);background-size:100% 24px}.masthead,.edition-head,.news-grid,.empty-edition,footer,.archive-strip{width:min(1180px,calc(100% - 32px));margin-inline:auto}.masthead{padding:24px 0 12px;text-align:center;border-bottom:4px double var(--rule)}.wordmark{color:var(--ink);font-size:clamp(2rem,7vw,5rem);font-weight:900;letter-spacing:-.055em;text-decoration:none}.wordmark span{color:var(--rust)}.masthead>p{margin:3px 0 14px;font:700 .72rem/1.3 ui-monospace,monospace;letter-spacing:.18em;text-transform:uppercase}.masthead nav{display:flex;justify-content:center;flex-wrap:wrap;gap:4px 22px;border-top:1px solid var(--rule);padding-top:10px}.masthead nav a,.archive-strip a,footer a{color:var(--ink);font:700 .76rem/1.4 Arial,sans-serif;text-transform:uppercase;letter-spacing:.08em;text-decoration-color:var(--brass);text-underline-offset:4px}.edition-head{text-align:center;padding:38px 8px 28px;border-bottom:1px solid var(--rule)}.edition-label,.kicker{font:800 .7rem/1.3 Arial,sans-serif;letter-spacing:.16em;color:var(--rust);text-transform:uppercase}.edition-head h1{margin:7px 0;font-size:clamp(2.1rem,5vw,4.8rem);line-height:.95}.edition-head>p:last-child{color:var(--muted);font-style:italic}.news-grid{display:grid;grid-template-columns:repeat(3,1fr);padding:26px 0;border-bottom:3px double var(--rule)}.story{padding:0 22px 22px;border-left:1px solid #9c907c}.story:nth-child(3n+1){border-left:0}.story h2{font-size:1.55rem;line-height:1.04;margin:7px 0 14px}.story.lead{grid-column:span 2}.story.lead h2{font-size:clamp(2rem,4vw,3.7rem)}.summary{font-size:1rem;line-height:1.55}.byline,.source-line,.corrections{font:600 .72rem/1.55 Arial,sans-serif;color:var(--muted)}.source-line a{color:var(--rust);font-weight:700}.corrections summary{cursor:pointer;color:var(--rust)}.empty-edition{max-width:780px;text-align:center;padding:80px 24px}.empty-edition h2{font-size:clamp(2rem,5vw,4rem);margin:8px}.empty-edition p:last-child{font-size:1.15rem;line-height:1.6;color:var(--muted)}.archive-strip{padding:24px 0;display:flex;gap:14px;flex-wrap:wrap}.archive-strip h2{width:100%;margin:0;font-size:1.15rem;text-transform:uppercase;letter-spacing:.08em}footer{display:flex;justify-content:space-between;gap:20px;padding:25px 0 50px;font:700 .72rem Arial,sans-serif;color:var(--muted)}@media(max-width:760px){.news-grid{grid-template-columns:1fr}.story,.story:nth-child(3n+1){grid-column:auto;border-left:0;border-top:1px solid #9c907c;padding:22px 4px}.story:first-child{border-top:0}.story.lead h2,.story h2{font-size:2rem}.masthead nav{gap:10px 16px}.edition-head{padding-top:28px}footer{display:block}}`;

function rss(items, generatedAt) {
  const entries = items.map((item) => `<item><title>${xmlEscape(item.title)}</title><link>${siteUrl}/news/${itemDate(item)}/#${xmlEscape(item.id)}</link><guid isPermaLink="false">aizanoi-news:${xmlEscape(item.id)}</guid><pubDate>${new Date(item.publishedAt).toUTCString()}</pubDate><category>${xmlEscape(categoryLabels.get(item.category))}</category><dc:creator>${xmlEscape(item.author.name)}</dc:creator><description>${xmlEscape(item.summary)}</description><source url="${xmlEscape(item.sources[0].url)}">${xmlEscape(item.sources[0].publisher)}</source></item>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><title>Aizanoi News</title><link>${siteUrl}/news/</link><description>Original, concise and source-linked coverage.</description><language>en</language><lastBuildDate>${new Date(generatedAt).toUTCString()}</lastBuildDate>${entries}</channel></rss>\n`;
}

let names = [];
try { names = (await readdir(sourceDir)).filter((name) => name.endsWith('.json') && !name.startsWith('_')).sort(); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const items = [];
const ids = new Set();
for (const name of names) {
  const item = validate(JSON.parse(await readFile(path.join(sourceDir, name), 'utf8')), name);
  if (ids.has(item.id)) fail(name, `duplicate id ${item.id}`);
  ids.add(item.id);
  items.push(item);
}
items.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || a.id.localeCompare(b.id));
const dates = [...new Set(items.map(itemDate))].sort().reverse();
let generatedAt;
if (process.env.SOURCE_DATE_EPOCH !== undefined) {
  if (!/^\d+$/.test(process.env.SOURCE_DATE_EPOCH)) fail('SOURCE_DATE_EPOCH', 'must be a non-negative integer');
  generatedAt = new Date(Number(process.env.SOURCE_DATE_EPOCH) * 1000).toISOString();
} else {
  generatedAt = new Date(items.length ? Math.max(...items.map((item) => Date.parse(item.retrievedAt))) : 0).toISOString();
}
const editions = dates.map((date) => ({ date, path: `/news/${date}/`, itemCount: items.filter((item) => itemDate(item) === date).length }));
const feed = { schemaVersion: 2, generatedAt, categories: [...categoryLabels.keys()], editions, items };
await rm(newsDir, { recursive: true, force: true });
await mkdir(path.dirname(feedFile), { recursive: true });
await mkdir(newsDir, { recursive: true });
await writeFile(feedFile, `${JSON.stringify(feed, null, 2)}\n`);
await writeFile(path.join(newsDir, 'news.css'), `${css}\n`);
const archiveLinks = editions.length ? `<aside class="archive-strip"><h2>Past editions</h2>${editions.map((edition) => `<a href="${edition.path}">${edition.date} (${edition.itemCount})</a>`).join('')}</aside>` : '';
const latestDate = dates[0];
await writeFile(path.join(newsDir, 'index.html'), page({ title: 'Aizanoi News — The Daily Edition', eyebrow: latestDate ? dateLabel(latestDate) : 'Independent · Original · Source-linked', heading: latestDate ? dateLabel(latestDate) : 'The Daily Edition', deck: latestDate ? 'AI, technology, markets and football — edited into one concise edition.' : 'The press is ready. The record remains empty until verified reporting is published.', items: latestDate ? items.filter((item) => itemDate(item) === latestDate) : [], editionDate: latestDate, archiveLinks }));
for (const date of dates) {
  const dir = path.join(newsDir, date);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'index.html'), page({ title: `${dateLabel(date)} — Aizanoi News`, eyebrow: 'Aizanoi News · Daily archive', heading: dateLabel(date), deck: 'A complete daily edition from the Aizanoi News archive.', items: items.filter((item) => itemDate(item) === date), editionDate: date, canonicalPath: `/news/${date}/` }));
}
for (const [slug, label] of categoryLabels) {
  const dir = path.join(newsDir, 'category', slug);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'index.html'), page({ title: `${label} Archive — Aizanoi News`, eyebrow: 'Aizanoi News · Section archive', heading: `${label} Archive`, deck: `Every published ${label} report, newest first.`, items: items.filter((item) => item.category === slug), canonicalPath: `/news/category/${slug}/` }));
}
await writeFile(path.join(newsDir, 'rss.xml'), rss(items, generatedAt));
console.log(`Aizanoi News: wrote ${items.length} item(s), ${editions.length} edition(s) and ${categoryLabels.size} archive(s)`);
