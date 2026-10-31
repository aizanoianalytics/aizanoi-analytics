# Anatolian Pact bot API

Contract version: 1, with additive seed, year-limit and support-effectiveness fields.

Publish a reviewed, same-origin file at `bots/<id>.js`. Export synchronously:

```js
module.exports = {
  name: 'Example',
  propose(state) { return []; },
  answer(state) { return {}; },
  orders(state) { return []; },
  retreats(state) { return {}; },
  builds(state) { return []; }
};
```

Only `orders` is required. Methods are called with one fresh JSON snapshot.
Promises/async functions are not awaited. Return plain JSON-compatible values.

## Rules

Six powers: Phrygia, Lydia, Caria, Bithynia, Galatia and Cilicia.
There are 24 supply centres, including three home centres per power and six
neutral centres. Every power starts with three units.

Each year has Spring and Autumn:

1. `negotiate-propose`: submit up to six structured proposals.
2. `negotiate-answer`: accept or reject incoming proposals.
3. `orders`: issue simultaneous, secret unit orders.
4. `retreats`, only if units were dislodged.
5. After Autumn retreats, update centre ownership and check victory.
6. `builds`: build or disband; then begin the next Spring.

A unit occupying a supply centre at the end of Autumn captures it.
Spring occupation alone does not change ownership. Retreats can capture
centres in Autumn. Unoccupied centres retain their previous owners.

Own at least 13 centres to win. Otherwise the centre leaders at the end of
`maxYears` share victory. The year limit is inclusive. There is no Spring
majority check. No further builds occur after a final Autumn scoring check.

Powers with zero units and zero centres are eliminated at season/adjustment
boundaries. Surviving powers rank by centres; eliminated powers rank by
latest elimination cohort first. Powers eliminated together share a rank.
Display ordering within tied ranks is code-unit alphabetical, not a tiebreak.

### Movement

- One unit per province.
- Armies move between adjacent land provinces.
- Fleets move between adjacent seas and coastal land.
- Direct fleet movement between two coastal land provinces additionally
  requires that both touch at least one common sea province.
- No convoys, transport, multi-coast provinces or army crossings of water.
- Mainland Anatolia, Thrace and Cyprus are separate land components.
- `~` is decorative water or an impassable lake, not a province.
- Blank cells are off-map.

Use `province.type`, not an ASCII case test. Some land IDs are Greek capitals.

### Adjudication

Each attack/defence starts at strength one. Matching, uncut supports add one.
Support-hold applies to units not ordered to move; a failed mover does not
receive support-hold defence.

Equal strongest attacks bounce. Head-to-head moves compare strengths; equal
opposing moves stay put. Unblocked rotations of at least three units succeed.
A successful departure vacates a province for another move.

A power cannot dislodge itself. Support from a defender's power cannot help
dislodge that defender. It can still matter when comparing competing attacks.
A friendly attack does not cut support.

An enemy attack cuts support even if the attack bounces, except when it
originates in the province the support is directed against. Dislodgement
removes the support. A dislodged attack has no effect on its dislodger's
origin; an attack directed elsewhere may still cut support or affect a
standoff.

A legal support order whose beneficiary does not issue the matching order
has no effect. It is not automatically a cut.

### Retreats and adjustments

A dislodged unit may retreat to an adjacent, terrain-legal empty province,
excluding its dislodger's origin and provinces left in a standoff.
Two or more retreats to the same destination all disband.

Unspecified retreats choose the first legal province in code-unit ID order,
or disband if none exists. Explicit `null` means disband.

After Autumn, unit capacity equals owned centres. Builds are optional and
only possible in empty, still-owned home centres. Armies may be built in
any such home; fleets require coastal homes. Unused builds are waived.
Partial disband selections are allowed; the engine fills any shortfall.

Automatic disbands remove the units farthest from any of that power's home
centres. Distance uses the unweighted province-adjacency graph, including
seas, irrespective of unit type. Equal distances use ascending code-unit
province ID order. Unreachable provinces have infinite distance.

## Negotiation and trust

Proposal payloads:

| Type | Exact terms | Obligation after acceptance |
| --- | --- | --- |
| `peace` | `{}` | Both parties promise no attacks on the partner's units this season. |
| `alliance` | `{"target":"Cilicia"}` | Same peace promise; target names a third living power. No obligation to attack it. |
| `dmz` | `{"province":"S"}` | Both parties promise no move orders into that province. |
| `support` | `{"unit":"N","dest":"M"}` | Sender promises to issue matching support for recipient's unit. |
| `request-support` | `{"unit":"M","dest":"hold"}` | Recipient promises to issue matching support for sender's unit. |

`to` must be another living power. Terms must contain exactly the listed
keys. A support proposal must name the beneficiary's current unit and a
legal destination or `"hold"`, and the promising power must have a possible
supporter. Extra terms are rejected.

Acceptance creates directional promise records. Peace, alliance and DMZ
each create two records; support creates one. `request-support` becomes a
`support` promise with the recipient as maker.

Promises are not enforced movement constraints. Betrayal is legal.

Evaluation uses normalized orders and the pre-resolution unit positions:

- Peace/alliance is broken by ordering a move, or supporting a move, into
  a province containing the partner's unit. A bounced attack still breaks
  it. Moving into an empty centre owned by the partner does not, by itself,
  break this specific promise.
- DMZ is broken by a move order into that province, even if it bounces.
  Supporting somebody else's entry does not break it. Retreats are not orders.
- Support is kept when a valid matching support order is issued, even if
  cut, dislodged, or ineffective because the beneficiary changed its order.
  The promise is about issuing support, not guaranteeing its effect.
- Invalid orders become holds and cannot satisfy support promises.
- Each accepted proposal is counted separately. Duplicate or reciprocal
  accepted deals can therefore generate multiple obligations. Trust totals
  count obligations, not distinct partners or independent seasons.

`promisesMade` includes accepted obligations still awaiting resolution.
After resolution, each obligation increments exactly one of `kept`/`broken`.
`brokenPromises` is public and retained for the whole match.

## State schema

All fields below are always present. Objects/arrays are detached from the
engine. Mutating them cannot change the authoritative game.

```text
{
  phase: "negotiate-propose" | "negotiate-answer" | "orders" |
         "retreats" | "builds" | "over",
  year: positive integer,
  season: "Spring" | "Autumn",
  seed: unsigned 32-bit integer,
  you: power ID,
  map: {
    provinces: Province[],
    adjacency: { [province ID]: province ID[] }
  },
  units: Unit[],
  owners: { [supply-centre province ID]: power ID | null },
  centresByPower: { [power ID]: integer },
  inbox: Proposal[],
  accepted: PromiseRecord[],
  trust: {
    [power ID]: {
      promisesMade: integer,
      kept: integer,
      broken: integer,
      brokenPromises: PromiseOutcome[]
    }
  },
  history: SeasonHistory[],
  retreats: RetreatUnit[],
  legalOrders: { [your on-board unit province ID]: Order[] },
  limits: { maxProposals: 6, timeLimitMs: 2000, maxYears: positive integer }
}

Province = {
  id: single UTF-16 code character,
  name: string,
  type: "land" | "sea",
  coastal: boolean,
  sc: boolean,
  home: power ID | null,
  hexes: [column, row][],
  centre: [x, y]
}

Unit = { power: power ID, type: "army" | "fleet", at: province ID }

Proposal = {
  id: string,
  from: power ID,
  to: power ID,
  type: "peace" | "alliance" | "support" | "dmz" | "request-support",
  terms: exact terms object,
  status: "pending" | "accepted" | "rejected"
}

PromiseRecord = {
  id: proposal ID,
  power: promising power ID,
  partner: other power ID,
  type: "peace" | "alliance" | "support" | "dmz",
  terms: exact terms object
}

PromiseOutcome = PromiseRecord plus {
  year: integer,
  season: "Spring" | "Autumn",
  outcome: "kept" | "broken"
}

Order =
  { unit: province ID, type: "hold" } |
  { unit: province ID, type: "move", dest: province ID } |
  { unit: province ID, type: "support",
    target: supported unit province ID, targetDest: province ID | "hold" }

ResolutionOrder = normalized Order plus {
  power: power ID,
  valid: boolean,
  outcome: "success" | "bounce" | "dislodged" | "cut" | "invalid",
  effective?: boolean
}

RetreatUnit = Unit plus {
  attacker: dislodger's origin province ID,
  options: legal retreat province ID[]
}

SeasonHistory = {
  year: integer,
  season: "Spring" | "Autumn",
  orders: { [power ID]: ResolutionOrder[] },
  resolution: ResolutionOrder[],
  promises: PromiseOutcome[],
  retreats?: {
    type: "retreat", power: power ID,
    from: province ID, to: province ID | null
  }[]
}
```

For support orders, `effective` means the support matches the beneficiary's
order and survives cuts/dislodgement. The self-dislodgement restriction can
still exclude that support when calculating a particular attack strength.
A valid unmatched support has `outcome: "success", effective: false` unless
actually cut/dislodged.

`inbox` contains only pending proposals addressed to you, normally during
the answer phase. `accepted` contains this season's obligations involving
you in either direction, not all private deals. `history` contains the last
six completed movement seasons, after their retreats. Current private orders,
other powers' unanswered proposals and their private accepted-deal details
are not exposed. Public trust counts can reveal that obligations exist.

`units` excludes dislodged units waiting to retreat. Your own such units
are in `retreats`. Do not treat the survivor count alone as a complete
retreat-phase force count.

### Coordinates

Hexes use zero-based `[column,row]`, pointy-top, odd-r offset coordinates.
Odd rows are shifted right by half a hex width. Pixel x increases east/right;
pixel y increases south/down. Province centres are arithmetic means of hex
centres in engine map space, not CSS pixels, city coordinates, or guaranteed
interior points. Adjacency is computed from hex neighbours, sorted by
code-unit ID.

### Realistic JSON example

This is a complete, deliberately small custom-position snapshot showing the
actual JSON layout, not the entire shipped geographic map. The live game
contains all generated provinces and centres. Here, one Phrygian army is at
Aizanoi and can move to Kotiaion.

```json
{
  "phase": "orders",
  "year": 2,
  "season": "Autumn",
  "seed": 2026,
  "you": "Phrygia",
  "map": {
    "provinces": [
      {
        "id": "M",
        "name": "Aizanoi",
        "type": "land",
        "coastal": false,
        "sc": true,
        "home": "Phrygia",
        "hexes": [[0, 0]],
        "centre": [27.712812921102035, 16]
      },
      {
        "id": "N",
        "name": "Kotiaion",
        "type": "land",
        "coastal": false,
        "sc": true,
        "home": "Phrygia",
        "hexes": [[1, 0]],
        "centre": [55.42562584220407, 16]
      }
    ],
    "adjacency": {
      "M": ["N"],
      "N": ["M"]
    }
  },
  "units": [
    {"power": "Phrygia", "type": "army", "at": "M"}
  ],
  "owners": {
    "M": "Phrygia",
    "N": null
  },
  "centresByPower": {
    "Phrygia": 1,
    "Lydia": 0,
    "Caria": 0,
    "Bithynia": 0,
    "Galatia": 0,
    "Cilicia": 0
  },
  "inbox": [],
  "accepted": [],
  "trust": {
    "Phrygia": {"promisesMade": 0, "kept": 0, "broken": 0, "brokenPromises": []},
    "Lydia": {"promisesMade": 0, "kept": 0, "broken": 0, "brokenPromises": []},
    "Caria": {"promisesMade": 0, "kept": 0, "broken": 0, "brokenPromises": []},
    "Bithynia": {"promisesMade": 0, "kept": 0, "broken": 0, "brokenPromises": []},
    "Galatia": {"promisesMade": 0, "kept": 0, "broken": 0, "brokenPromises": []},
    "Cilicia": {"promisesMade": 0, "kept": 0, "broken": 0, "brokenPromises": []}
  },
  "history": [],
  "retreats": [],
  "legalOrders": {
    "M": [
      {"unit": "M", "type": "hold"},
      {"unit": "M", "type": "move", "dest": "N"}
    ]
  },
  "limits": {
    "maxProposals": 6,
    "timeLimitMs": 2000,
    "maxYears": 12
  }
}
```

The synthetic two-cell map is illustrative, not a snapshot claimed to have
been captured from a running match. In a shipped-map call, use the complete
`state.map` and `state.legalOrders`; do not substitute this example geometry.

## Method return values

### `propose(state)`

```json
[
  {"to":"Lydia","type":"peace","terms":{}},
  {"to":"Galatia","type":"alliance","terms":{"target":"Cilicia"}}
]
```

Maximum six. Invalid proposal lists are rejected as a whole and become `[]`.

### `answer(state)`

```json
{"p1":"accept","p4":"reject"}
```

Only IDs in your inbox are allowed. Missing answers reject. Unknown IDs,
invalid values or wrong shapes cause the entire call to use `{}`.

### `orders(state)`

```json
[
  {"unit":"M","type":"hold"},
  {"unit":"N","type":"support","target":"O","targetDest":"hold"},
  {"unit":"O","type":"move","dest":"P"}
]
```

Orders must address your current units. Unknown/foreign unit entries are
ignored by the engine. Missing own units hold. Duplicate entries for an own
unit make that unit hold with `outcome: "invalid"`. Terrain-invalid or
impossible orders also become holds. Other valid orders remain usable.

For support, omitted `targetDest` is accepted as shorthand for `"hold"`.
An explicit destination equal to `target` is not shorthand: it is invalid.

The runner first validates JSON shape. If an entry has an unknown order type,
missing string unit ID, or non-string destination/target fields, the whole
payload falls back to `[]`. To avoid differing normalization layers, select
orders directly from `state.legalOrders`.

### `retreats(state)`

```json
{"N":"M","O":null}
```

Keys are your dislodged units' origins; values are listed options or `null`.
Omitted units use automatic retreats. Unknown keys or illegal destinations
reject the entire payload and trigger automatic retreats for all your units.

### `builds(state)`

Builds:

```json
[{"type":"army","at":"M"}]
```

Disbands:

```json
[{"disband":"N"}]
```

Use one form matching the sign of centres minus current units. Empty `[]`
waives builds or delegates mandatory disbands. Duplicate locations, excess
selections and illegal builds/disbands reject the entire list and use `[]`.

## Worker execution, timing and fallback

- The worker imports `map-data.js`, then `engine.js`, then one local bot.
- IDs must match `^[a-z0-9][a-z0-9.-]*$` and must not contain `..`.
- No caller-supplied URL is used to load a bot.
- Initialization has a 2,000 ms wall-clock limit.
- Each method call has a separate 2,000 ms wall-clock limit, including
  message transfer/scheduling overhead. Leave substantial headroom.
- One persistent worker per bot-controlled seat, even when several seats
  use the same bot file. Module variables persist across that seat's calls.
- Missing optional methods, thrown bot exceptions and uncloneable returns
  produce null payloads and safe defaults.
- A worker timeout, worker error or load failure terminates that worker;
  subsequent phases for that seat use defaults.
- An ordinary invalid return or caught method exception does not, by itself,
  terminate an otherwise responsive worker.
- Public `bot-fallback` events identify the power, method and broad reason,
  not private payloads or exception text.
- Calls run in parallel; no seat sees another seat's pending submission.
- Human seats have no bot timeout and remain waiting after invalid input.

Defaults are no proposals, reject all, hold all, automatic retreats, waived
builds and automatic required disbands.

The worker is not a security sandbox for hostile scripts. Publish reviewed
local files; do not attempt network access, storage, global monkey-patching,
worker protocol manipulation or side-channel inspection.

### Determinism and seeds

The engine uses no clock or random source for rules. `create({seed})`
records the unsigned seed but does not randomly alter the map or tie-breaks.

For map power index `i`, the runner sends initialization seed:

```text
(Math.imul(matchSeed, 31) + i) >>> 0
```

The worker installs:

```js
Math.random = PactEngine.rng(initSeed ^ 0x9e3779b9);
```

The sequence is Mulberry32 and persists across calls; it is not reset each
phase. `state.seed` is the match seed, not this mixed worker seed.

Use only the supplied seeded `Math.random` or your own explicitly seeded
generator. Avoid clocks, network results, unseeded entropy and
locale-sensitive sorting. Prefer numeric or code-unit comparisons.

Same seed plus same deterministic algorithms and inputs gives reproducible
rules and bot random streams. Wall-clock timeouts remain environment-dependent;
reproducibility assumes the bots finish within their budgets.

## Helper globals and headless use

Inside the worker:

- `PactEngine.MAP`: deeply frozen map definition, with object-indexed
  `provinces`, `adjacency`, `powers`, `rows`, `hexSize`, `pixel(col,row)`,
  `neighbours(col,row)` and `rules`.
- `PactEngine.canMove(unit,dest)`: terrain/adjacency legality.
- `PactEngine.rng(seed)`: independent Mulberry32 generator.
- `PactEngine.adjudicate(units,orders)`: pure one-season movement resolver.
  Returns `{units,dislodged,standoffs,resolution}`.
- `PactEngine.retreatOptions(unit,units,standoffs)`.
- `PactEngine.resolveRetreats(units,dislodged,standoffs,choicesByPower)`.
- `PactEngine.create({seed,maxYears})`: independent game, not a reference
  to the actual match.
- `PactMapData`: generated raw geography.
- `module.exports` and `exports`: CommonJS-style export support.
- `self` and `window`: worker global aliases, not a DOM.
- `console` methods are muted.

Do not overwrite worker globals or send protocol messages yourself.

`create` additionally accepts a test/simulation `setup` with `units`,
`owners`, `phase`, `year` and `season`. It is not a full snapshot importer:
it does not restore proposals, promises, trust, retreats or history.
For movement simulations, use `adjudicate` directly.

Game methods are `units()`, `owners()`, `proposals()`, `legalOrders(power)`,
the five submit methods, `advance()`, `botState(power)`, `finished()` and
`result()`, plus getters `phase`, `year`, `season`.

`advance()` explicitly commits one phase. It does not wait for submissions:
missing submissions use defaults. The browser runner supplies the barrier.
Submit methods return `{ok,...}` and do not advance the game.

`result()` is null until over, then:

```text
{
  winner: power ID | null,
  shared: power ID[],
  reason: "majority" | "years",
  year: integer,
  centres: { [power ID]: integer },
  trust: { [power ID]: { made: integer, kept: integer, broken: integer } },
  placements: { power: power ID, rank: integer,
                centres: integer, eliminated: boolean }[]
}
```

A sole winner has `shared: []`; shared leaders have `winner: null`.

The engine is DOM-free UMD. In this ES-module repository, use the existing
same-realm VM loader from the tests; load map data first and supply it to
the engine wrapper. Do not introduce `require` into the engine or change
the repository module type.

## Minimal complete bot

```js
(function () {
  'use strict';

  module.exports = {
    name: 'Reference Hold',
    propose() {
      return [];
    },
    answer(state) {
      return Object.fromEntries(state.inbox.map(p => [p.id, 'reject']));
    },
    orders(state) {
      return state.units
        .filter(u => u.power === state.you)
        .map(u => ({ unit: u.at, type: 'hold' }));
    },
    retreats(state) {
      return Object.fromEntries(state.retreats.map(u => [
        u.at, u.options[0] || null
      ]));
    },
    builds() {
      return [];
    }
  };
})();
```

## Author checklist / model prompt

Implement a synchronous CommonJS-style bot for this contract. Return only
plain payloads, keep runtime comfortably below two seconds, use no external
dependencies, and do not access private information or worker internals.

- Read `limits.maxYears`; do not assume every match lasts twelve years.
- Treat IDs as opaque strings, including Greek characters.
- Use `legalOrders` and retreat `options` rather than duplicating legality.
- Distinguish ownership from occupation and on-board from dislodged units.
- Distinguish issuing promised support from its successful effect.
- Do not mutate snapshots expecting engine changes.
- Keep persistent module memory seat-local and deterministic.
- Test malformed returns, missing optional methods and end-game positions.
- Label house samples as samples, not AI-model entries.
