import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root=process.cwd();
const sourceDir=path.join(root,'content/news/items');
const outFile=path.join(root,'frontend/content/news/index.json');
const categories=new Set(['ai-technology','markets-economy','world','sports','culture']);

function fail(file,message){throw new Error(`${file}: ${message}`);}
function iso(value,file,field){if(!value||Number.isNaN(Date.parse(value)))fail(file,`${field} must be an ISO-compatible date`);return new Date(value).toISOString();}
function cleanText(value,file,field,max){if(typeof value!=='string'||!value.trim())fail(file,`${field} is required`);const text=value.trim();if(text.length>max)fail(file,`${field} exceeds ${max} characters`);return text;}
function validate(item,file){
  if(!item||typeof item!=='object'||Array.isArray(item))fail(file,'item must be an object');
  const id=cleanText(item.id,file,'id',120);
  if(!/^[a-z0-9][a-z0-9-]+$/.test(id))fail(file,'id must use lowercase letters, numbers and hyphens');
  const title=cleanText(item.title,file,'title',180);
  const summary=cleanText(item.summary,file,'summary',1200);
  if(!categories.has(item.category))fail(file,`category must be one of ${[...categories].join(', ')}`);
  if(!Array.isArray(item.sources)||item.sources.length<1)fail(file,'at least one source is required');
  const sources=item.sources.map((source,index)=>{
    const publisher=cleanText(source?.publisher,file,`sources[${index}].publisher`,120);
    let url;
    try{url=new URL(source?.url);}catch{fail(file,`sources[${index}].url must be a valid URL`);}
    if(!['http:','https:'].includes(url.protocol))fail(file,`sources[${index}].url must use http or https`);
    return {publisher,url:url.toString(),publishedAt:source.publishedAt?iso(source.publishedAt,file,`sources[${index}].publishedAt`):null};
  });
  const tags=Array.isArray(item.tags)?item.tags.map((tag)=>String(tag).trim()).filter(Boolean).slice(0,12):[];
  return {id,title,summary,category,publishedAt:iso(item.publishedAt,file,'publishedAt'),updatedAt:iso(item.updatedAt||item.publishedAt,file,'updatedAt'),tags,sources};
}

let names=[];
try{names=(await readdir(sourceDir)).filter((name)=>name.endsWith('.json')&&!name.startsWith('_'));}catch(error){if(error.code!=='ENOENT')throw error;}
const items=[];
const ids=new Set();
for(const name of names){
  const file=path.join(sourceDir,name);
  const item=validate(JSON.parse(await readFile(file,'utf8')),name);
  if(ids.has(item.id))fail(name,`duplicate id ${item.id}`);
  ids.add(item.id);items.push(item);
}
items.sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt));
const feed={schemaVersion:1,generatedAt:new Date().toISOString(),categories:[...categories],items};
await mkdir(path.dirname(outFile),{recursive:true});
await writeFile(outFile,`${JSON.stringify(feed,null,2)}\n`,'utf8');
console.log(`Aizanoi News: wrote ${items.length} item(s) to ${path.relative(root,outFile)}`);
