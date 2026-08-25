# Aizanoi Analytics Content & Source Policy

This policy applies to Aizanoi News, Aizanoi TV companion pages, Aizanoi Journal research and any automated content prepared for Aizanoi Analytics by Hermes or another agent.

## Core rule

Aizanoi Analytics publishes **original summaries, analysis and presentation**. It does not republish full third-party articles.

## News requirements

Every Aizanoi News item must contain:
- an original Aizanoi News title;
- an original concise summary (80–600 characters for daily items, at least 240 characters for weekly analysis items);
- category and publication timestamp;
- an explicit editorial priority when the desk intends to control lead placement;
- at least one source URL;
- source publisher name;
- source publication date when available;
- retrieval/update timestamp in structured metadata;
- a `kind` of either `daily` (default) or `weekly`. Weekly items must also declare a `week` label that matches the ISO week of the publication date (for example `2026-W36`).

For important, disputed or fast-moving stories, prefer multiple **independent** sources and/or a primary source. Multiple links that ultimately repeat the same wire report, press release or organization do not count as independent corroboration.

When a story is available both through an aggregator/rehost and from the original publisher, prefer linking the original publisher directly. An aggregator may remain as an additional source when it materially improves accessibility or context.

## Editorial priority

`priority` is an editorial signal, not a measure of truth. Higher values may control lead placement within an edition; the default is neutral. Priority must not be derived automatically from a publisher's prestige, source count, engagement bait or political viewpoint.

Use it to express an actual desk decision about prominence. Do not let filename or identifier ordering silently choose the lead story.

## Attribution

Source links are mandatory for News even where copyright law would not strictly require a citation. Attribution is part of the product's trust model.

Do not:
- copy an article body;
- lightly paraphrase one source sentence-by-sentence;
- remove attribution from a sourced claim;
- invent a source, publication date or quote;
- imply that Aizanoi Analytics or Aizanoi News reporting occurred on location unless it actually did.

Brief quotations may be used only when genuinely necessary and must remain short, attributed and linked to the source.

## Images and media

Do not copy third-party editorial images merely because they appear in a source article. Use:
- original Aizanoi Analytics artwork/screenshots;
- original editorial graphics generated from Aizanoi-owned design assets;
- media explicitly licensed for reuse under compatible terms;
- public-domain media;
- official press assets whose terms permit the intended use;
- embeds/links where appropriate instead of copying the file.

Store rights/provenance metadata when third-party media is used. A generic company logo must not be presented as though it were a story-specific editorial photograph. If no suitable story image exists, publishing without a story image is preferable to fabricating provenance.

## Corrections

Material corrections should update the item timestamp and preserve a short correction note when the original publication could have misled readers. The generated article page must keep correction history visible and permanent.

The corrections path should be exercised in automated fixtures even when the live correction count is zero.

## AI-assisted publishing

Hermes or another model may collect sources, draft summaries, classify items and prepare commits. Before publication it must still satisfy this policy and the structured validation gate.

Automation must never treat an LLM's unsupported memory as a source.

Aizanoi News publicly discloses that AI-assisted tools may support source discovery, drafting and production while publication remains governed by this source/correction policy. The generated News methodology page is the canonical reader-facing explanation.

## TV and Journal

Video companion pages and Journal articles should list meaningful research sources when factual claims depend on external material. Opinion does not require a citation merely for being opinion, but the facts it relies on should be sourced.

## Historical Worlds

The existing evidence taxonomy remains mandatory: documented/source-supported, archaeological/material, inferred, atmospheric and disputed where applicable. Plausible reconstruction is never promoted to verified fact by visual polish.
