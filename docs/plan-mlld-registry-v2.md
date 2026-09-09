# Plan — the mlld module registry, transport redesign (v2, executable)

> **Status: APPROVED, authoritative implementation reference.**
> This document **replaces `plan-mlld-registry.md` as the going-forward reference**.
> `docs/plan-mlld-registry.md` (rev 11) and `docs/plan-mlld-registry-explained.md`
> remain on disk, untouched, as the **historical annex** and the **teaching companion**:
> the facts here are identical to rev 11's 51 locked decisions; only the structure,
> ordering, and traceability changed. Every amendment beyond Dec-51 is numbered
> Dec-52+ in this document, none are added.
>
> 51 decisions locked (Dec-1..51). 7 adversarial reviews + 3 NLF ruling rounds
> (rev 9/10/11) are folded into the history appendix (§14). A **substrate question**
> (§11, OPEN) and a set of genuinely-open items remain; nothing else is undecided.
>
> Evidence convention: **VERIFIED** = the cited line was opened in the tree at write
> time. **OPEN** = a consciously undecided seam. **ASSUMPTION** = a reasoned default
> the plan requires but no decision pins. Neither is a decision.

---

## 1. Executive summary

**The one-sentence spine:** source names a module; the lock maps
*name → typed transport + real URL + fingerprint*; install is *fetch + verify +
record around a URL*; the registry is *append-only events with derived,
seq-stamped rollups*.

**The cast of roles:**

| Role | What it is | What it holds / does |
|------|-----------|----------------------|
| **mlld client** (TS) | `mlld install / publish / update` | the only author of `mlld-lock.json`; fetches, verifies, records |
| **Rust offline runtime** | `resolve_from_cache` | reads key + typed `transport` + `integrity`; never the network, never parses URLs |
| **opgate** | public registry (transport `opgate`) | immutable version docs + append-only events + derived rollups, on a Fly.io volume |
| **GitHub** | private modules (transport `github`) | direct `git+https://…#<sha>` byte refs, no registry involved |
| **legacy catalog** (`registry/` repo) | frozen fossil (transport `registry`) | metadata-only `modules.json` + `legacy-pins.json`, read forever, never written |
| **operator** | opgate staff | the one legal carve-out: explicit `revoke` event (410 Gone + reason) |
| **NLF** | the human ruler | locked all 51 decisions + 3 ruling rounds |

**What changes vs today:**

| Today | v2 (target) | Ruled by |
|-------|-------------|----------|
| `resolved` = raw sha256 OR `registry://…` OR a URL (one field, three meanings) | `resolved` = a REAL fetchable URL (origin); `integrity` = normalized sha256 (fingerprint); `transport` = typed adapter ID | Dec-1/5/14/19/46 |
| `mlld install @nlf/foo` (bare name; CLI guesses) | `mlld install <url>` — URL is the pin; no bare-name install, no default registry, no semver math | Dec-50, Dec-2 |
| Flat cache index `index[name]=hash` → two transports overwrite each other, silent wrong bytes | Index **nested by transport**: `{opgate:{name:hash}, github:{…}}` | Dec-16/19/11 |
| Publisher hashes RAW sha256; resolver verifies NORMALIZED → mismatch on CRLF/BOM/NFD | One normalization, one authority (server), one pinned vector tested Go+TS+Rust | Dec-7/41/18 |
| Version label mutable in practice (overwrite/yank possible) | Label burned at the event append; publisher cannot un-burn; operator-only revoke | Dec-3/26/47 |
| `/v/{version}.json` returns full `PackageDetail` (growing `versions[]`) | Version route → new immutable `VersionManifest`; mutable listing keeps `PackageDetail` | Dec-6/24 (BLOCKER-3) |
| One lock entry = one hard-coded location (dead origin = dead install) | `resolved` (origin) + addable `mirrors[]`, verified at add-time | Dec-51 |
| No operator stop-serving path (legally impossible) | Explicit `revoke` event, same ledger, 410 Gone + reason, nothing deleted | Dec-47 |
| Namespace == identity (fails when teams arrive) | Namespace → owning **principal**; gate = `membership(actor, principal)` | Dec-48/39 |

---

## 2. Current-state failures

Each row is a real bug triaged to the decision that kills it. "Symptom → root cause → fix" is the whole argument for the transport redesign.

| # | Symptom (what breaks today) | Root cause | Fixing decision(s) |
|---|------------------------------|------------|--------------------|
| F1 | **Mixed-meaning `resolved`.** An offline consumer reads a raw sha256 digest, loads bytes, and the signature system then refuses them (`BadIntegrity`) — or reads a `registry://` string that resolves to nothing; an auditor can't tell "registry" from "repo X at SHA Y". | One field does two jobs (fingerprint + address) and does neither reliably. | Dec-1/5/14/19: split into `integrity` + `resolved` + typed `transport`; drop the raw-hex fallback. |
| F2 | **Silent wrong bytes via one-name cache index.** Install `github` `@nlf/foo` writes `index["@nlf/foo"]=A`; install `opgate` `@nlf/foo` overwrites to `B`; later offline resolution of the *github* pin serves `B`'s bytes. Nothing notices. | `ModuleCache.updateIndex` (TS) and `resolve_from_cache` (Rust) both key by the bare import path only. | Dec-16/19/11: index nested by transport; offline read enters the sub-object named by the lock's typed `transport`. |
| F3 | **Raw-vs-normalized hash mismatch.** Publisher writes a RAW sha256; the resolver verifies a NORMALIZED hash (BOM/CRLF/NFC-normalized). CRLF/BOM/NFD content matches at publish, mismatches at fetch (`E_MODULE_CONTENT_MISMATCH`). | Two authorities compute two different rules; the raw-digest entry point survives. | Dec-7/41/18: server computes the ONE normalized hash; client verifies (never re-derives); one pinned vector file. |
| F4 | **No yank, but also no revoke.** "Immutable" is a convention — nothing physically stops a silent overwrite, and nothing gives the operator a legal stop-serving lever. | Write path isn't append-only; the "nothing deletes" promise has no carve-out. | Dec-3/26/47: burn at the event append; publisher write-once + operator-only `revoke`. |
| F5 | **Legacy catalog un-re-pinnable.** The catalog stores no bytes (only a GitHub `source.url` + a RAW `contentHash`); a normalized re-pin has no byte source, and a per-install re-fetch would be the batch migration Dec-10 forbids. | Legacy bytes live nowhere normalizable at install time. | Dec-25/31/20/42: one-time freeze-time fetch → `legacy-pins.json`; client re-type reads the table, never re-fetches. |
| F6 | **Growing `versions[]` on the immutable doc breaks `immutable` caching.** Today `/v/{version}.json` returns full `PackageDetail` incl. `versions[]` — a list that grows, so the "cache forever" header would lie. | The version route and the listing route share one response type. | Dec-6/24 (BLOCKER-3): serving split — immutable `VersionManifest` vs mutable listing. |

Two additional failures are structural to the registry's write substrate and its security boundary, fixed by dedicated decisions noted in §4:

| # | Symptom | Root cause | Fixing decision(s) |
|---|---------|------------|--------------------|
| F7 | **Two Fly machines silently corrupt the ledger** (two kernels = two `flock` namespaces = duplicate events/seq). | `flock`+rename is only correct with one writer, and that invariant was never stated. | Dec-38/35: pin machine count to exactly 1 (Phase 0d). |
| F8 | **Embedded stdlib can be shadowed by a published module of the same name.** | A hand-enumerated guardlist (wrong by two refs, twice) plus no structural protection for future embedded modules. | Dec-43/49: code-derived guard for the 7 legacy refs + reserved `@mlld/std/*` prefix. |

---

## 3. Goals & non-goals

### Goals (tagged with the decisions that implement each)

1. **Transport identity is first-class, in npm's shape.** Every lock entry records a typed `transport` (adapter ID `opgate` | `github` | `registry` | future `s3` — **never a URI scheme**) + the real, fetchable `resolved` URL(s) the bytes came from + `integrity`. Source stays bare `@author/module`; the lock maps name → hash + locations. **Dec-1, 5, 13, 46, 50, 51.**
2. **`mlld install` ALWAYS takes a URL.** No bare-name install, no default-registry resolution, no client semver math; the URL is the pin. Unlocked bare imports answer "no entry — install from a URL". Rust never parses URLs. **Dec-50, 2, 12, 13.**
3. **Public registry moves to opgate** as transport AND serving authority (immutable bytes + append-only ledger + server-computed hash). **Dec-7, 6, 4.**
4. **Private modules stay in GitHub** via `git+https://…#<sha>` direct-refs; gists dropped; install-time truth; `mlld update` re-pins deliberately. **Dec-21, 11.**
5. **Version immutability is a physical contract.** A label is write-once (burn at the event append); publisher cannot un-burn; operator-only explicit `revoke` (410 + reason); nothing deleted from the ledger. **Dec-3, 8, 26, 47.**
6. **Events are the truth; rollups are derived.** Append-only events → replayable, seq-stamped rollup; version map embedded; updates = tail-diff, never whole-index refetch. **Dec-4, 29, 40.**
7. **Fetch-then-verify under a shared transport-agnostic policy.** Nothing is trusted from a location, only from a verified hash; cache is addressed by content hash; mirrors add availability without trust. **Dec-6, 7, 41, 51.**

### Non-goals

- No S3 adapter yet (`https+s3://` is future, additive). **Dec-46.**
- No gists. No GitHub rate-limit work (private-only + per-token). 
- No client-visible change to the Rust offline **resolution model** beyond the transport-aware read of one typed field (key + integrity + `transport`). **Dec-13, 16, 19.**
- No batch migration, no catalog data movement — the legacy catalog freezes and migrates by re-publish only. **Dec-10, 31, 42.**
- No multi-writer scaling (Postgres/object-store) now — the single-instance shape is out-of-scope-if-scaled. **Dec-38.**

---

## 4. Architecture

### 4.0 The locked decisions (Dec-1..51, authoritative register)

One line each. "→ amends X" / "amended by Y" notes record amendment chains; the operative text is always the amending decision. Semantics are exactly rev 11's; wording is compressed.

| # | Decision | Amendment note |
|---|----------|----------------|
| 1 | Transport identity first-class: typed `transport` + REAL-URL `resolved`; no invented URI schemes | amended by Dec-46 (real-URL forms), Dec-50 (URL-only install), Dec-51 (mirrors) |
| 2 | No semver resolution in install — a URL pins exactly; listing carries version records for browsing | amended by Dec-50 |
| 3 | Version label burned forever (publisher-side); operator revocation via explicit event only | extends Dec-47 |
| 4 | Events → rollup, sync under flock, seq'd | |
| 5 | Lock = name + integrity + transport + resolved (origin) + mirrors[] | extends Dec-1; amended by Dec-51 |
| 6 | Serving split: immutable version doc / mutable listing | |
| 7 | Server-side normalization (opgate computes the hash) | fold-in of rev-10 rulings: normalize once at ingest; hash covers content, not envelope |
| 8 | Idempotency = (version, normalized-hash), server-side, vs events | |
| 9 | Namespace → owning PRINCIPAL (user / GitHub org / future team); publish gate = membership; canonical lowercase | **amended by Dec-48** (principal, not fused identity) |
| 10 | NO batch migration; two permanent worlds (legacy fossil + new opgate) | |
| 11 | Typed `transport` + origin URL IS the package identity | same display name coexists across worlds |
| 12 | Refs are typed + URL-explicit; no default-transport inference | |
| 13 | Source statements stay bare `@author/module` | Rust offline parsing untouched (scope cut) |
| 14 | Raw-hex `resolved` fallback dropped in Rust offline path | legacy raw-digest locks fail loud → re-pinned via Dec-20/25 |
| 15 | Lock writer rejects `://` in module keys | |
| 16 | Cache index NESTED BY TRANSPORT; offline read enters sub-object named by typed `transport` | |
| 17 | Rollup staleness affects only the browse-surface listing; installs are pin-exact | |
| 18 | Publish: client sends bytes+version(+optional `hashN`); SERVER computes & records own `contentHash`; `hashN` mismatch = warning, never refusal; client verifies post-publish | final text — supersedes review #1 MEDIUM-1's pre-append gate (reversed) |
| 19 | Lock entries gain typed `transport` (opgate/github/registry-default) — adapter ID, never a URI scheme | **renamed from `scheme` (rev 9)** |
| 20 | Legacy locks re-typed at first install: `transport:"registry"` + integrity re-pinned to NORMALIZED + `resolved` from catalog's real `source.url` | |
| 21 | `github` lock refs ALWAYS carry `#<sha>` URL fragment; `@<branch>` is install-time convenience; index keys `(transport, name)` only | |
| 22 | `normalizeLockEntry` REQUIRES integrity — never synthesizes `sha256:${resolved}` | |
| 23 | Publish endpoint is a net-new write surface: auth-claims, endpoint idempotency, validation regexes, size caps, rate-limits, 4xx/5xx | values pinned by review #7 HIGH-3 (see §7) |
| 24 | `VersionManifest` freeze-set explicit schema; `versions`/`installs`/`stars`/`latest` on the MUTABLE side; `latest` = listing label, never CLI-resolved | |
| 25 | Legacy re-type is PIN-AUTHORITATIVE: Phase 0c bakes `legacy-pins` table (normalized hash per `@mlld/*` entry); client READS the table, never re-fetches | |
| 26 | Burn/idempotency check is EVENT-anchored: `(pkg,version)` absent from EVENTS = first-publish; 409 ONLY when an event exists with a different hash | |
| 27 | `access` split: `VersionManifest` freezes the VERSION's own `access`; package-level `current_access` on the mutable listing | |
| 28 | `@mlld` owned by the GitHub `mlld-lang` ORG; publish gate = org membership | **amended by NLF** (forge-identity, not an invented opgate org) |
| 29 | Mutable listing is ROLLUP-DERIVED: `versions[]` = rendered view at a seq, never an independent store; only `installs`/`stars`/`latest` live | |
| 30 | `@mlld` namespace owned by the GitHub `mlld-lang` ORG (NLF ruling on review #3 HIGH-1) | reaffirms Dec-28/39 |
| 31 | Pins-table build needs a ONE-TIME FREEZE-TIME FETCH of the 21 pinned URLs (pre-freeze) | |
| 32 | Per-package separate `versions-index.json` (version→seq) as the O(1) existence source | **AMENDED by Dec-40** — no separate file; map lives in the rollup |
| 33 | Dec-19/22 are NET-NEW `LockFile.ts` format changes (new `transport` field + `normalizeLockEntry` rewrite + `lockfileVersion` bump) | |
| 34 | `legacy-pins.json` lives at `registry/legacy-pins.json`, committed at freeze, served read-only | |
| 35 | Phase 0d adds the persistent Fly VOLUME MOUNT for the registry file surface | |
| 36 | `dependencies` JOINS the `VersionManifest` freeze-set | refined by Dec-37 |
| 37 | `dependencies` SPLIT into `needs` (runtime interpreter needs) + `imports` (transport-qualified module graph, net-new collector) | amends Dec-36 |
| 38 | EXPLICIT single-instance invariant: exactly ONE Fly machine (min=max=1, no autoscale); multi-writer out of scope | |
| 39 | `mlld-lang` org-membership verification = NET-NEW opgate auth work (Phase 0) | |
| 40 | Version map EMBEDDED IN THE ROLLUP (one file, one atomic rename, no index-rollup disagreement) | **amends Dec-32** |
| 41 | Normalization: ONE pinned vector file tested by Go+TS+Rust; exact byte rules; sha256-normalized, NOT blake3 | |
| 42 | 404-at-freeze RULED: per-module REFUSE; grace path = old raw-URL fetch or uninstallable-new; one 404 never kills the other 20 | |
| 43 | Shadowing guardlist CODE-DERIVED: union of dispatch predicates = **seven** refs | |
| 44 | Cycles bounded: publish refuses an `imports` cycle; install keeps visited-set/max-depth guard | |
| 45 | Collector scope: only static refs; MCP/URL/`@root`/`@base`/interpolated are not registry refs and not in `imports` | basis corrected by review #7 (runtime already refuses interpolated) |
| 46 | Refs are REAL URLs, never invented URI schemes; vocabulary `scheme`→`transport`; index nested by transport | amends Dec-1/5/11/16/19/20/21/33/36/37 |
| 47 | OPERATOR REVOCATION = explicit `revoke` event (reason legal/dmca/abuse) on the SAME ledger; 410 Gone + reason; label stays burned; nothing deleted | |
| 48 | Namespace ownership is a PRINCIPAL (`owner: {type, ref}` from day one); publish gate = `membership(actor, principal)` uniformly | **amends Dec-9/28/30** |
| 49 | Embedded PREFIX reservation: `@mlld/std/*` resolved bundled by prefix rule, publish REFUSED; 7 legacy refs keep names + code-derived guard | |
| 50 | `mlld install` ALWAYS takes a URL; name derived from the URL; no bare-name install, no default registry, no CLI semver math | amends Dec-2 |
| 51 | Lock records ORIGIN (`resolved`) + ADDABLE mirrors (`mirrors[]`); mirror-add verifies bytes against an existing entry's integrity | amends Dec-5 |

### 4.1 Client install / materializer

- **Current:** install resolves a bare name against the legacy catalog; a hidden default registry is implied; the lock's `resolved` may hold a raw digest.
- **Target:** `mlld install <url>` = fetch + verify + record. The URL supplies transport (from its scheme, once, in TS), name (path or owner/repo), and the pin (doc path or `#<sha>`). The **materializer** — the TS component that turns verified bytes into durable local state — writes the lock entry and updates the nested cache index. **Dec-50, 2, 51.**
  ```
  install =   adapter.fetch(url)        → raw bytes
            → shared policy: hashNormalized(bytes) == integrity   (E_MODULE_CONTENT_MISMATCH on any mismatch)
            → store cache/sha256/<hex>/  +  index[transport][name] = <hex>
            → lock entry born (or a mirror appended, Dec-51)
  ```
- The `ModuleTransport` adapter is fetch-only (`fetch(url) -> bytes`). **Resolution is NOT in the adapter** — a URL pins exactly. **Dec-50, 12.**
- The Rust offline runtime sits below all of this: lock (name→integrity) + index (`(transport,name)`→hash) + cache (hash→bytes). No network, no adapters, no URL parsing. **Dec-13, 16, 19.**

### 4.2 Lockfile

- **Current:** `ModuleLockEntry` (`LockFile.ts:13-26`) has `version/resolved/source/integrity/fetchedAt/…` — **no `transport`**, and `normalizeLockEntry` *synthesizes* `integrity: sha256:${resolved}` when absent (`LockFile.ts:175`), re-importing the raw-digest hole.
- **Target:** `mlld-lock.json` — mlld's OWN lockfile, produced by `mlld install`, deliberately package-lock-shaped, **no npm involved**. See the schema in §6. The writer requires `integrity` (never synthesizes it — **Dec-22**), the writer rejects `://` in keys (**Dec-15**), the `transport` field is typed and never parsed from `resolved` (**Dec-19**), and format changes are a NET-NEW `LockFile.ts` rewrite with a `lockfileVersion` bump (**Dec-33**). The **server never writes a lockfile** — it serves bytes + metadata only.
- The lock entry is the **whole answer** for a name: one name, one entry, one place; resolution never searches and never wanders. **Dec-11, 13.**

### 4.3 Cache + index

- **Current:** cache is already content-addressed (`~/.llm/cache/sha256/<hex>/`), but the name→hash index is flat (`ModuleCache.updateIndex`, `ModuleCache.ts:417-428`, `index[importPath]=hash`), and offline `resolve_from_cache` (`registry.rs:87-147`, `get_hash_by_import_path` at `:114`) reads the same bare key — the F2 collision.
- **Target:** the byte store stays purely content-addressed. The **index alone** becomes nested by transport — `{ "opgate": {"@nlf/foo": hash}, "github": {"@nlf/foo": hash} }` — no composite key strings; the offline read enters the sub-object named by the lock's typed `transport` field (never the URL: `resolved` is advisory and gets rewritten by legacy re-type Dec-20/25 and SHA re-pins Dec-21). **Dec-16, 19.** This is carve-out #2 to the "Rust untouched" cut (the other is BLOCKER-1's fallback drop, Dec-14): a minimal transport-aware *read*; the resolution model is unchanged.

### 4.4 Transports

A ref = typed `transport` (adapter ID) + a REAL fetchable URL in `resolved`. **No invented URI schemes, ever (Dec-46).**

| Transport | Trust class | Address form (`resolved`) | Verification |
|-----------|-------------|---------------------------|--------------|
| `opgate` (public registry) | Root of trust (we host bytes + compute hash) | `https://<host>/@{author}/{pkg}/v/{version}.json` — the immutable artifact itself | opgate computes normalized hash (server-side); client verifies at fetch |
| `github` (private) | User-stewarded | `git+https://github.com/{owner}/{repo}#<sha>` — always the SHA as a URL fragment | client computes at install; re-install refuses on mismatch until `mlld update` |
| `registry` (legacy fossil) | Frozen | the catalog's `source.url` (real https URL) | freeze-time `legacy-pins` table (normalized, Dec-25/31) |
| `s3` (future) | future | `https+s3://{bucket}/{path}` (HTTPS transport, s3 backend) | same shape as `github` — byte source, no rollup |

- **`github` refs are SHA-pinned** — the branch-name `@main` is install-time convenience only (CLI resolves branch→SHA before the lock write); index keys are `(transport, name)` only, never a revision, because revisions move. **Dec-21.**
- **Unknown transport = honest error** (`E_UNKNOWN_TRANSPORT: no adapter for transport 'ipfs'`), never a silent fallback to a default. **Dec-1.**

### 4.5 Server write path (events → rollup → serving)

> **Substrate note (ruled, review #1 HIGH-2):** the registry writes FILES on Fly.io attached storage — **not** Postgres. `store.go`'s `events`/`plane_generations` tables are the tape/receipts store, a different surface. On Fly.io volume storage, `flock` + atomic rename are correct primitives *only under a single writer*. **This is exactly the seam the substrate question §11 re-opens — see §11 for the undecided options.**

```
Per package:    registry/{author}/{pkg}/events.jsonl   ← EVENTS (the truth, append-only)
                registry/{author}/{pkg}/index.json     ← per-package ROLLUP (derived)
Per namespace:  registry/{author}/index.json           ← per-namespace ROLLUP
                registry/{author}/_feed.jsonl          ← per-namespace EVENT FEED
```

- **Events = the commit log; rollup = the checkout/HEAD.** The rollup is a disposable cache of the log, rebuilt by replay, never a second source of truth. **Dec-4.**
- **Single-instance invariant (Dec-38):** the file surface is served by EXACTLY ONE Fly machine (`min=machines=max=1`, no autoscale). Two hosts = two `flock` namespaces = silent duplicate-events/seq corruption. Scaling to N needs a multi-writer primitive — explicitly OUT OF SCOPE. **Dec-38, 35.**
- **Version map embedded in the rollup (Dec-40, amends Dec-32):** the rollup carries `seq` + `version→{hash,seq}`. ONE file, ONE atomic rename — no separate version-index, no index-rollup disagreement. The O(1) event-existence check (Dec-26) reads the rollup's embedded map.
- **Seq staleness protocol (Dec-4/17):** a rollup carries the `seq` of the last event it includes; a reader reads rollup (seq=N) then tails events from N+1. A rollup claiming seq M that omits an event ≤ M is corrupt → refuse. A behind-rollup is a *detectable stale cache*, never a wrong answer, and it affects only the browse-surface listing — pinned installs are exact by construction.
- **Publish path (under the flock):**
  ```
  1. client → { metadata, mlld source, version, hashN? }        (hashN informational)
  2. opgate normalize bytes → contentHash                         (SERVER-computed; the recorded value)
  3. EVENTS check for (pkg, version):
       absent                         → append publish event → 200   (first-publish)
       present, same hash             → no-op                    → 200
       present, different hash        → 409                       (burned; only if an EVENT exists, Dec-26)
  4. replay → rollup (version map embedded) → single atomic rename
  5. serve /@{author}/{pkg}/v/{version}.json   (immutable forever)
  ```
- **The burn IS the event append** — one line lands at the end of the append-only events file under the flock. No flag, no row, no rewrite; every later check reads exactly that line. **Dec-3, 26.**
- **Revocation (Dec-47):** "no yank" is publisher-scoped. Operators (never publishers) append an explicit `revoke` event (`reason: legal|dmca|abuse`) to the SAME ledger; the rollup renders it; serving → 410 Gone + reason; resolution refuses with an actionable error; the label stays burned; nothing is deleted from the ledger.
- **Serving split (Dec-6/24):** version-scoped `/@{author}/{pkg}/v/{version}.json` = immutable `VersionManifest`, `public, max-age=31536000, immutable`; unversioned `/@{author}/{pkg}.json` = mutable listing, revalidate posture. See §6/§7.

### 4.6 Ownership & auth

- **Namespace → owning PRINCIPAL (Dec-48, amends Dec-9/28/30).** `owner: {type: user|org|team, ref}` from day one; publish gate = `membership(actor, principal)` uniformly: user-owned degenerates to self, org-owned = GitHub membership (`orgs/{org}/members/{login}`), future team = a third principal type with its own membership source — no data-model migration, no republishing. The net-new auth work (Dec-39) is that ONE membership primitive.
- **`@mlld` = the GitHub `mlld-lang` ORG (Dec-28/30/39).** Publish to `@mlld/*` requires the authenticated identity be a MEMBER of `github.com/mlld-lang`. Forge-identity check, not an invented opgate org. Net-new in Phase 0 (the org namespace in `spec-opgate-api.yaml:1032` is "PROPOSED" today).
- **Canonical lowercase** at the publish edge — `@Nlf/foo` rejected (Rust `module_names.rs:117-122` does not case-fold; without this, `Adam` squats `@Adam/foo` AND `@adam/foo`). **Dec-9.**
- **Embedded stdlib (Dec-43/49):** `@mlld/std/*` is the reserved embedded prefix — resolved bundled by a prefix rule, publish REFUSED at the edge, structurally drift-immune. The **seven** legacy embedded refs (`@mlld/policy`, `@mlld/policy/standard`, `@mlld/policy/url-defense`, `@mlld/patterns/url`, `@mlld/sanitizers/url`, `@mlld/authorize`, `@mlld/test`) keep their names + a **code-derived guard** — the union of the dispatch predicates at `import.rs:246-257` — so the list can't drift by hand. Any other `@mlld/*` (ai-cli, array, claude, …) is a legitimate registry ref.
- **Slug validation at the edge** (alphanumeric + `-`/`_`, non-empty, ≥1 segment, per the Rust model at `registry.rs:51-63`) before any path is derived — names become filesystem paths. **Dec-23.**
- **First-publish race** resolves under the flock: both writers touch the same deterministic `(author,package)` path; first event wins, second gets a clean 409.

### 4.7 Trust model

- **opgate** = root of trust for metadata AND bytes: we host the bytes, we compute the hash, we append the events; the client re-verifies by computing, never by copying.
- **GitHub** = install-time truth: opgate never sees private bytes so cannot vouch for them; the lock `integrity` is the snapshot from install; upstream moves → mismatch → refuse with an actionable message; `mlld update` re-pins deliberately (partial `npm ci`-vs-`npm install`). No semver, no metadata server, no opgate consultation. **Dec-21.**
- **Mirrors** = zero trust by construction: any fetch is verified after the fact against the entry's `integrity`; mismatch = refuse + try the next location. Trust lives only in the hash, never in a location. **Dec-51.**

---

## 5. Invariants

"This can NEVER happen" → the mechanism that enforces it → the decision(s).

| # | Invariant (must NEVER be true) | Enforcing mechanism | Decision(s) |
|---|-------------------------------|---------------------|-------------|
| I1 | Silent wrong bytes served to a pin (two transports, one name) | Cache index nested by transport; offline read enters the sub-object named by typed `transport`; cache addressed by content hash | Dec-16, 19, 11 |
| I2 | Silent version-label overwrite | Burn at the event append (append-only); same-hash no-op / diff-hash 409, event-anchored | Dec-3, 26, 8 |
| I3 | Unverified bytes served offline | Raw-hex `resolved` fallback dropped; ONLY the normalized `integrity` is a hash authority offline; integrity never synthesized | Dec-14, 15, 22 |
| I4 | Normalization drift (Go vs TS vs Rust) | One spec'd rule, one authority (server), one pinned vector file tested by all three | Dec-7, 41 |
| I5 | Stale rollup producing wrong answers | `seq` on every rollup + reader tail-diff protocol; rollup-with-gap = refuse | Dec-4, 17, 40 |
| I6 | Namespace squatting / case-variant squatting | Canonical lowercase at the edge + membership gate on the owning principal | Dec-9, 48, 39 |
| I7 | Path traversal via author/package slugs | Slug validation (alphanumeric + `-`/`_`, ≥1 segment) before any path derivation | Dec-23 (Rust model `registry.rs:51-63`) |
| I8 | Two machines corrupting the ledger | Single-instance invariant: exactly 1 Fly machine, no autoscale (Phase 0d) | Dec-38, 35 |
| I9 | Untrusted location (github/mirror) supplies wrong-but-accepted bytes | Shared fetch-then-verify policy; mismatch = refuse (E_MODULE_CONTENT_MISMATCH) after ANY fetch | Dec-6, 51, 21 |
| I10 | Legacy consumers silently break on re-pin | Pin-authoritative `legacy-pins.json`; re-type reads the table, never re-fetches; unre-pinnable = per-module REFUSE | Dec-25, 31, 42, 20 |
| I11 | Published module shadows an embedded stdlib module | Reserved `@mlld/std/*` prefix (publish refused) + code-derived guard for the 7 legacy refs | Dec-43, 49 |
| I12 | Infinite install recursion (a→b→a) | Publish refuses `imports` cycles; install keeps visited-set + max-depth guard | Dec-44 |

**Adversarial self-check (STEP 4, run against review history):** three scenarios probed —
- *Two-transport collision* (review #1 HIGH-1): I1 + I3 close it (nested index; hash never named-only).
- *Crash-window retry* (review #3 BLOCKER-B): a first publish whose bytes were stored but whose event never appended has NO event → label unclaimed → same-version-different-content retry is a legitimate first-publish. I2 is *event*-anchored, so no false burn. ✓
- *Legacy raw-digest lock* (review #1 BLOCKER-1): after Dec-14, a raw-digest integrity with no normalized pin fails LOUD (refuse) and is recovered ONLY through Dec-20/25's re-type (read `legacy-pins.json`). I3 + I10. No gap.

---

## 6. Data model & schemas

All seven artifacts, machine-precision. A `→` marks a REQUIRED field. String forms are normative: the content hash is `sha256:<64-hex>` (SRI `sha256-<b64>` is a DIFFERENT format and is explicitly never mixed in — see `LockFile.ts:259-261` docs-graph warning).

### 6.1 The normalized-hash algorithm (the ONE rule, Dec-41/7)

Input: the module content bytes (the full `mlld` source — **not** the JSON envelope). Output: `sha256:<64-hex>`.

1. Strip a leading UTF-8 BOM `EF BB BF` (if present).
2. Normalize line endings: CRLF (`0D 0A`) → LF (`0A`); lone CR (`0D`) → LF.
3. NFC-normalize (Unicode 15.0).
4. sha256 over the normalized bytes → 64 lowercase hex; prefix `sha256:`.

- **NOT blake3.** `mlld_sig::digest::digest` returns BLAKE3 `b3:` (`digest.rs:49-53`); the lock-integrity chain is `module.rs:normalized_sha256_hex` (**sha256**, `module.rs:160-166`). Never conflated.
- **Valid UTF-8 required** — NFC is a Unicode operation; the Rust pipeline already refuses non-UTF-8 (`digest.rs:56-58`). The server refuses non-UTF-8 content with 400 (implied by NFC; the vector file pins it).
- **One pinned vector file** `vectors/content-normalization.json` — Go, TS, and Rust all test against it. Created in Phase 0.
- **Normalization applied ONCE at ingest** → stored == served == hashed (rev 10 ruling). The client verifies by re-applying the same idempotent rule to the served bytes.

### 6.2 `mlld-lock.json`

| field | type | req | meaning |
|-------|------|-----|---------|
| `lockfileVersion` | number | → | bumped from today's `1` to `2` on the Dec-19/22 format change (`LockFile.ts:109,145` defaults to `1`) |
| `modules` | object | → | key = bare `@author/module` name; value = entry |
| `modules[name].version` | string | → | the pin the URL expresses: doc-path label (`1.2.3`), github SHA, legacy label; display only, never a resolution input |
| `modules[name].resolved` | string | → | the **origin** URL — REAL and fetchable; the location the bytes came from |
| `modules[name].mirrors` | string[] | → | ADDABLE mirror URLs (Dec-51); verified at add-time, untrusted fetch hints |
| `modules[name].transport` | string | → | adapter ID: `opgate` \| `github` \| `registry` \| (future `s3`) — typed, never a URI scheme, never parsed from `resolved` |
| `modules[name].integrity` | string | → | `sha256:<64-hex>` NORMALIZED; REQUIRED, never synthesized (Dec-22); the ONLY content authority the offline runtime reads |
| `modules[name].fetchedAt` | string | → | ISO-8601 timestamp of the entry's creation |

Reserved-value rules: `transport` enum is closed; unknown → `E_UNKNOWN_TRANSPORT`; `resolved` address forms are only the three in §4.4; writer rejects `://` in a module **key** (Dec-15).

```json
{
  "lockfileVersion": 2,
  "modules": {
    "@nlf/foo": {
      "version": "1.2.3",
      "resolved": "https://opgate.dev/@nlf/foo/v/1.2.3.json",
      "mirrors": ["https://mirror.example.org/@nlf/foo/v/1.2.3.json"],
      "transport": "opgate",
      "integrity": "sha256:7dbf35be5331d9959eb73feaf93d3edb081b8bffd9ccd0c61eed6ca33c35b89a",
      "fetchedAt": "2026-09-09T12:00:00Z"
    },
    "@nlf/baz": {
      "version": "9f31a4d0e6c10f0e21a96d2b1cdef",
      "resolved": "git+https://github.com/nlf/baz#9f31a4d0e6c10f0e21a96d2b1cdef",
      "mirrors": [],
      "transport": "github",
      "integrity": "sha256:1d70d049c829bd70eb81735969f54079985860dd6e602305d279b408fe3f3e5f",
      "fetchedAt": "2026-09-09T12:05:00Z"
    },
    "@mlld/claude": {
      "version": "3.3.3",
      "resolved": "https://raw.githubusercontent.com/mlld-lang/modules/8a6d6b5d/llm/modules/claude.mld.md",
      "mirrors": [],
      "transport": "registry",
      "integrity": "sha256:<normalized-hex from legacy-pins.json>",
      "fetchedAt": "2026-09-09T12:10:00Z"
    }
  }
}
```

### 6.3 `events.jsonl` line (one JSON object per line, append-only)

| event `type` | fields (→ required) |
|--------------|--------------------|
| `publish` | `type, pkg, version, hash` (server-computed `sha256:<hex>`), `seq` (per-package monotonic) |
| `revoke` | `type, pkg, version, reason` (`legal` \| `dmca` \| `abuse`), `seq` |

```jsonl
{"type":"publish","pkg":"@nlf/foo","version":"1.2.3","hash":"sha256:7dbf35be…","seq":41}
{"type":"revoke","pkg":"@nlf/foo","version":"1.0.0","reason":"dmca","seq":42}
```

> **Unspecified (not a decision):** an event `actor`/`at` field for audit would be consistent with Dec-47's "auditable" but is not ruled. Phase 0 may add it; flagged here rather than silently invented.

### 6.4 Rollup `index.json` (per-package; version map embedded — Dec-40)

| field | type | req | meaning |
|-------|------|-----|---------|
| `package` | string | → | bare name |
| `seq` | number | → | `seq` of the last event included (staleness anchor, Dec-17) |
| `versions` | object | → | version label → record; the O(1) event-existence map (Dec-40) |
| `versions[label].hash` | string | → | `sha256:<hex>` recorded at that label's publish |
| `versions[label].seq` | number | → | the event seq that burned this label |
| `versions[label].revoked` | string \| null | →* | `reason` if operator-revoked, else `null` (Dec-47) |

\* The `revoked` field name is illustrative — Dec-47 pins the SEMANTICS (410+reason, label stays burned), not the exact field name; Phase 0 pins the spelling.

```json
{
  "package": "@nlf/foo",
  "seq": 42,
  "versions": {
    "1.2.3": { "hash": "sha256:7dbf35be…", "seq": 41, "revoked": null },
    "1.0.0": { "hash": "sha256:…", "seq": 7, "revoked": "dmca" }
  }
}
```

### 6.5 `VersionManifest` (immutable version-scoped doc, Dec-24/6/27/36/37)

| field | type | req | meaning |
|-------|------|-----|---------|
| `version` | string | → | version label |
| `hash` | string | → | server-computed NORMALIZED `sha256:<hex>` of the `mlld` CONTENT (not the envelope) |
| `mlld` | string | → | the full module source the runtime interprets |
| `access` | object | → | THIS VERSION's own `{reads[], emits[], never[]}` — frozen at publish (Dec-27) |
| `author` | string | → | author, frozen at write |
| `source` | object | → | provenance, frozen at write |
| `needs` | object | → | runtime interpreter needs `{js?, node?, py?, sh?}` (Dec-37) |
| `imports` | object[] | → | transport-qualified module graph (net-new collector, Dec-37/45); structured entries, never URL strings |

`imports[i]` entry shape: `{ transport, name, version?|rev?, resolved }` — `version` for opgate/registry, `rev` (the SHA) for github; `resolved` = the entry's own real URL.

**Explicitly NOT present:** `versions[]`, `installs`, `stars`, `ratings`, `latest` — anything that grows must live on the mutable side (Dec-24/6). Served `public, max-age=31536000, immutable`.

```json
{
  "version": "1.2.3",
  "hash": "sha256:7dbf35be…",
  "mlld": "import {x} from '@nlf/bar'\n…",
  "access": { "reads": ["env","fs"], "emits": [], "never": ["net"] },
  "author": "nlf",
  "source": { "publishedAt": "2026-09-09T12:00:00Z" },
  "needs": { "node": ">=18" },
  "imports": [
    { "transport": "opgate", "name": "@nlf/bar", "version": "2.0.1", "resolved": "https://opgate.dev/@nlf/bar/v/2.0.1.json" },
    { "transport": "github", "name": "@nlf/baz", "rev": "9f31a4d0e6c10f0e21a96d2b1cdef", "resolved": "git+https://github.com/nlf/baz#9f31a4d0e6c10f0e21a96d2b1cdef" }
  ]
}
```

### 6.6 Catalog listing (mutable unversioned doc)

| field | type | req | meaning |
|-------|------|-----|---------|
| `name` | string | → | bare name |
| `versions` | string[] | → | ROLLUP-DERIVED rendered view (Dec-29), never an independent store |
| `latest` | string | →* | display label only; never a CLI resolution input (Dec-24) |
| `installs` | number | → | live computed (only live field alongside stars/ratings) |
| `stars` | number | → | live computed |
| `ratings` | object | → | live computed |
| `current_access` | object | → | package-level EVOLVING `{reads,emits,never}` (Dec-27) |

\* `latest` is the one label the server renders; it is never resolved by the CLI (Dec-24; Dec-2's "server omits `latest`" means *from the immutable doc and the install path*).

```json
{
  "name": "@nlf/foo",
  "versions": ["1.0.0", "1.2.3"],
  "latest": "1.2.3",
  "installs": 1203,
  "stars": 87,
  "ratings": {},
  "current_access": { "reads": ["env","fs"], "emits": [], "never": ["net"] }
}
```

### 6.7 The serialized ref format (typed + URL-explicit)

A ref serializes to exactly three fields; the enum and address forms are closed (Dec-46):

```
{ "transport": "opgate"|"github"|"registry"|"s3",   // adapter ID, never a URI scheme
  "resolved":  "<real fetchable URL>",              // the THREE forms of §4.4 only
  "mirrors":   ["<url>", …] }                        // addable, verified-at-add (Dec-51)
```

- `transport` is written by TS at install (it knows the adapter); Rust reads `entry.transport`, never splits `resolved` on `://` (Dec-19).
- Source statements remain bare `@author/module` — a bare name is a KEY, never a location (Dec-13).

---

## 7. API surface

### Routes & status semantics

| Route / method | Response type | Posture | Status semantics |
|----------------|--------------|---------|------------------|
| `GET /@{author}/{pkg}/v/{version}.json` | `VersionManifest` (immutable) | `public, max-age=31536000, immutable` | 200; 404 unknown; **410 Gone + `reason` if revoked** (Dec-47) |
| `GET /@{author}/{pkg}.json` | catalog listing (mutable) | revalidate (existing `cacheRevalidate` pattern, `read.go:195`) | 200; 404 |
| `POST` publish (authed; route path named in Phase 0) | 200 / 409 / 400 / 403 | n/a (write) | see table below |

Status code contract for publish (the burn gate):

| Status | Meaning | Trigger | Decision |
|--------|---------|---------|----------|
| **200** | first-publish | `(pkg,version)` absent from EVENTS → append event | Dec-26 |
| **200** | no-op | event exists, same normalized hash | Dec-8, 26 |
| **409** | BURNED | event exists, DIFFERENT hash — **only when an event exists** | Dec-26, 3 |
| **400** | validation | bad slug/version/size/UTF-8/imports-cap | Dec-23 |
| **403** | identity | `membership(actor, principal)` fails | Dec-48, 39 |
| **410** | revoked (read) | version has a `revoke` event | Dec-47 |

Client-side honest errors (never silent, never a fallback):

| Error | Meaning | Ruled by |
|-------|---------|----------|
| `E_UNKNOWN_TRANSPORT` | `no adapter for transport 'ipfs'` — unknown adapter ID | Dec-1 |
| `E_MODULE_CONTENT_MISMATCH` | fetched bytes fail `hashNormalized(bytes) == integrity` — the LOCATION is distrusted | Dec-6, 41 |

### Publish endpoint spec table (review #7 HIGH-3, values for Dec-23)

| Ruling | Value |
|--------|-------|
| OAuth claim | `publish` scope on the token |
| `max_mlld_bytes` | hard cap on content length — **exact value OPEN** (§11) |
| `max_imports` | hard cap on the collected import-graph size — **exact value OPEN** (§11) |
| Rate limit | per-identity per-hour (storage-DoS bound on the volume) — **exact value OPEN** (§11) |
| Idempotency | `(version, normalized-hash)`, server-side, vs EVENTS — no client idempotency key | Dec-8, 26 |
| Auth | `membership(actor, principal)` via opgate auth (GitHub forge-identity); `@mlld/*` = `orgs/mlld-lang/members/{login}` | Dec-48, 39 |
| Validation | slug regex (alphanumeric + `-`/`_`, ≥1 segment); version regex; size caps; UTF-8; static-imports-only | Dec-23, 45 |

---

## 8. Failure modes & crash safety

| Crash window | What's left | Why retry is safe | Decision |
|--------------|-------------|-------------------|----------|
| **Bytes stored, event NOT appended** | stored bytes with NO event | label is unclaimed → same-version retry (even different content) is a legitimate first-publish, NOT a burn | Dec-26 |
| **Append done, rollup rename NOT done** | events has the last line; rollup stale | a retry replays against EVENTS and no-ops (`(version,hash)` idempotent); the rollup is a disposable cache, events are truth | Dec-8, 4 |
| **Lost ACK after a successful append** | event durable, client never saw the 200 | client re-publishes → server reads EVENTS → same hash → no-op 200 (no false 409) | Dec-8, 26 |

- **Why a 409 requires an existing event (Dec-26):** anchoring the burn to *bytes stored* would burn an unclaimed label when a first publish crashed between byte-write and event-append. Anchoring to EVENTS means a 409 can only fire for a label that was genuinely claimed.
- **The seq staleness protocol (Dec-4/17/40):** reader reads rollup (seq=N) then tails events from N+1; a rollup claiming seq M that omits an event ≤ M is corrupt → refuse. Retry-after-crash simply re-reads; nothing can present a behind-rollup as a correct answer.
- **Superfluous stored bytes after the Dec-26 first-publish overwrite** are garbage-collected or harmless — the event (not the bytes) is the authority, so stale bytes can never be served as truth.

---

## 9. Migration & phasing

**Normalized ordering (recorded conflict):** the rev-11 plan §5 *lists* Phase 0 before Phase 0d but *states* 0d is "a PRECONDITION of Phase 0a"; the explainer (§17) and the dependency logic put **0d first, a precondition of everything**. This document adopts the dependency-correct order **`0d → 0 → 0a → 0b → 0c → 1 → 2 → 3`**. `0` (spec) and `0d` (ops) have no in-plan inputs and may be parallelized; they are sequenced `0d`-first to honor the "0d precondition of everything" ruling and because 0d is the gating path for 0a.

Dependency edges (inputs → consumer): **0d** (prod+volume+single instance) → **0a**; **0** (spec) → **0a**, **0b**, **0c**; **0a** → **0b** (opgate adapter integration) and → **1**; **0c** (`legacy-pins.json`) → **0b's** legacy re-type path (runtime, post-0c); **1** → **2** (needs a live client publish/install to build on); **2** → **3** (additive).

### Phase 0d — ops + infra precondition
- **Goal:** make the registry servable in production at all.
- **Inputs (external):** Fly.io account, domain/TLS, the plan.
- **Outputs:** opgate API promoted to production; a persistent Fly VOLUME MOUNT attached for the registry file surface (Dec-35, no volume exists today — `fly.toml:3-6` is a static landing page); machine count pinned `min=max=1`, no autoscale (Dec-38).
- **Acceptance/DoD:** `min_machines_running == max_machines_running == 1` verified in the deployed config; the volume survives a deploy/restart; TLS + domain live; a smoke write+read on the volume succeeds.
- **Depends on / unblocks:** unblocks **0a**; a PRECONDITION of everything per the plan's "0d = precondition".

### Phase 0 — spec
- **Goal:** put every new surface in the spec before any code.
- **Inputs:** this plan.
- **Outputs (`spec-opgate-api.yaml` deltas):** the normalization rule + normative vector file `vectors/content-normalization.json` (Dec-41); the publish endpoint (POST is net-new — today only market READ surfaces exist); the serving split with the **BREAKING `VersionManifest`** schema change at `/v/{version}.json` (BLOCKER-3; `PackageDetail` unchanged at the unversioned route); the serialized ref format (typed `transport` + real-URL `resolved` + `mirrors[]`, Dec-46/50/51); the `@mlld` GitHub-`mlld-lang` org publish gate (Dec-28/39) + the embedded-prefix reservation `@mlld/std/*` (Dec-49); the publish spec table (§7).
- **Acceptance/DoD:** the spec compiles and is reviewable; `VersionManifest`, ref format, and normalization are machine-precise (§6); every §7 row has a home in the spec; the breaking change is named as such.
- **Depends on / unblocks:** unblocks **0a, 0b, 0c**.

### Phase 0a — server write path
- **Goal:** the events→rollup→serve machinery in opgate.
- **Inputs:** Phase 0 spec + Phase 0d infra.
- **Outputs:** flock → append → replay → atomic-rename with embedded version map (Dec-40) and seq; the publish endpoint honoring the §7 status/`idempotency` contract; `VersionManifest` serving with the immutable header; operator `revoke` event + 410-with-reason serving (Dec-47).
- **Acceptance/DoD:** the F6/F2/I2/I5/I8 invariants hold under the crash-window tests of §8; retry after lost-ACK is a no-op; the burn gate is event-anchored.
- **Depends on / unblocks:** unblocks **0b**'s opgate adapter integration and **1**.

### Phase 0b — TS client
- **Goal:** the typed, URL-only, verifying client.
- **Inputs:** Phase 0 spec; Phase 0a for opgate-adapter integration testing; at RUNTIME, Phase 0c's `legacy-pins.json` for the legacy re-type branch.
- **Outputs:** `LockFile.ts` rewrite — typed `transport` field, integrity-required `normalizeLockEntry`, re-type branch, `lockfileVersion` bump (Dec-33/22/20); `ModuleCache.updateIndex` transport-scoped key (nested index, review #7 LOW); materializer + `ModuleTransport` trait; URL-only install (Dec-50) + mirror-add (Dec-51); fetch-then-verify with the shared policy; normalized-integrity publish-side (Dec-41); cycle guard (visited-set + max-depth, Dec-44).
- **Acceptance/DoD:** I1/I3/I4/I9/I12 hold; legacy lock re-types without a network fetch (reads `legacy-pins.json`); `transport` is written by TS and read (never parsed) by Rust.
- **Depends on / unblocks:** unblocks **1** and **2**.

### Phase 0c — catalog freeze + legacy-pins
- **Goal:** turn the legacy catalog into the permanent fossil with a normalized pin table.
- **Inputs:** frozen `modules.json`; a ONE-TIME pre-freeze FETCH of the 21 pinned URLs (GitHub, external — Dec-31, the only byte source).
- **Outputs:** `modules.json` locked read-only forever; `registry/legacy-pins.json` (normalized hash per `@mlld/*` entry, committed at freeze, served read-only — Dec-34); per-module REFUSE marks for unr-pinnable (404/moved) entries with the grace path (Dec-42).
- **Acceptance/DoD:** the 21 normalized hashes are reproducible against the §6.1 algorithm; one 404 marks only that module; the fossil is read-only (no write path).
- **Depends on / unblocks:** supplies 0b's legacy re-type path at runtime; unblocks **1** for legacy consumers.

### Phase 1 — migrate by re-publish only
- **Goal:** move modules onto opgate with no batch copy.
- **Inputs:** live publish (0a) + live install (0b) + frozen legacy table (0c).
- **Outputs:** newly published opgate entries under new names/versions (Dec-10 — no reuse of old labels/hashes); `@mlld/*` publishes gated by `mlld-lang` org membership (Dec-28/39).
- **Acceptance/DoD:** a legacy module's owner can `mlld publish` a fresh version URL; install of that URL produces a correct, verified lock entry; no old label is ever re-burned.
- **Depends on / unblocks:** unblocks **2** (a working client/registry pair to extend).

### Phase 2 — github transport
- **Goal:** private modules via `git+https://…#<sha>`.
- **Inputs:** Phase 0 spec + Phase 0b client (transport trait + ref format).
- **Outputs:** the `github` adapter (fetch at SHA); SHA-pinned lock refs (Dec-21); install-time-truth + mismatch-refuse + `mlld update` re-pin; gist path removed.
- **Acceptance/DoD:** I9 holds (upstream drift → refuse, never silent); branch installs resolve to SHA before the lock write.
- **Depends on / unblocks:** additive; establishes the pattern **3** extends.

### Phase 3 — https+s3 (future, additive)
- **Goal:** an s3-backed transport by the same shape (`https+s3://{bucket}/{path}`, Dec-46) — non-goal now, no owner/milestone assigned.

---

## 10. Risks register

Nothing says "accepted" without naming the ruling. "Residual" = what remains after mitigation, honestly stated.

| Risk | Mitigation | Owning decision(s) | Residual |
|------|-----------|--------------------|----------|
| Go vs TS normalization drift breaks the hash chain | one spec'd rule + one pinned vector tested by all three | Dec-7, 41 | a bug in the vector itself is undetectable by construction — mitigated by adversarial review, not eliminated |
| Crash between append and rollup-rename leaves a stale rollup | seq protocol makes staleness detectable; retry no-ops; rollup is a cache, events are truth | Dec-4, 8, 17, 40 | the browse listing may briefly lag — cosmetic, never a wrong answer |
| Burn rule + lost ACK = false 409 | idempotency `(version, hash)` under the lock, event-anchored | Dec-8, 26 | none (fully closed) |
| Scheme-qualified refs creep into source imports | World A locked: source stays bare; the lock is the address book; writer rejects `://` keys | Dec-13, 15, 46 | a future contributor must be actively stopped from adding them (convention) |
| Case-variant namespace squatting | canonical lowercase at the publish edge | Dec-9, 48 | none |
| Path traversal via slugs | edge slug validation before path derivation | Dec-23 | none |
| Two transports under one display name confuse clients | typed `transport` + origin URL is identity; cache keyed by content hash | Dec-11, 16, 19 | none |
| Legacy `registry://` locks silently break | honest `E_UNKNOWN_TRANSPORT` naming the re-install fix; re-type from the pins table | Dec-20, 25, 34 | unre-pinnable modules are uninstallable-new (ruled, Dec-42) |
| Publish endpoint net-new in opgate without review | Phase 0 spec carries the design; adversarial review before rollout | Dec-23 (review #7 HIGH-3) | exact cap/rate numbers still OPEN (§11) |
| 1+N fetches / GitHub rate limits | direct-ref only; opgate serves public; per-token private reads | Dec-21 | none by design |
| No prod API exists today (deployment precondition) | Phase 0d: API → prod, volume attach, TLS/domain | Dec-35 (review #3 LOW-1) | 0d is the gating path — any 0d slip slips everything |
| Legacy re-pin has no byte source | one-time freeze-time fetch → `legacy-pins.json` | Dec-31, 25 | the fetch is a snapshot; anything 404s is refuse (Dec-42) |
| `versions[]` second source of truth | mutable listing `versions[]` = rollup-derived rendered view; only `installs`/`stars`/`latest` live | Dec-29 | none |
| Single-instance flock (2 machines = silent corruption) | machine count pinned to exactly 1 (Phase 0d); multi-writer = future | Dec-38, 35 | a whole-machine failover is manual; scaling is deferred — the SUBSTRATE QUESTION (§11) directly targets this residual |
| Fake-URI refs imply unregistered protocols | real URLs + typed `transport`; only https / git+https / https+s3 | Dec-46 | none |
| Legal takedown vs "nothing deletes" | two powers: publisher write-once + operator `revoke` (410 + reason, ledger kept) | Dec-47 | bytes stay in the ledger forever (by design — the law requires stop-serving, not erasure) |
| "namespace == identity" blocks teams later | owner is a PRINCIPAL from day one; membership is the uniform gate | Dec-48, 39 | a future team principal type is new auth work (already scoped as Dec-48's "third type") |
| Embedded-module shadowing / guardlist drift | `@mlld/std/*` prefix (publish refused) + code-derived guard for the 7 legacy refs | Dec-43, 49 | the 7 legacy refs stay name-based until a future runtime MAJOR boundary (flagged) |
| Untrusted mirrors serve wrong bytes | mirrors are fetch hints; verify after ANY fetch; mismatch = refuse + next location | Dec-51 | a fully-unavailable set of origins/mirrors = fail-to-install (availability, not integrity) |
| Bare-name install invites guessing / lock-in | install ALWAYS takes a URL; discovery is the browse surface | Dec-50 | none |

---

## 11. Open questions

Only genuinely-open items. Each: why it's open → who decides → when it must be decided (which phase blocks on it).

| # | Question | Why it's open | Owner | Must be decided by |
|---|----------|---------------|-------|--------------------|
| O1 | **The substrate question** (Fly volume + flock + events.jsonl vs an OCI-style registry as the byte store — see below) | strategic, undecided; both options are viable and different seams change | NLF (strategic) | before Phase 0d completes (it decides what infra 0d stands up and 0a implements) |
| O2 | Publish dry-run / pre-publish verify flow (a typo'd publish burns the label forever, Dec-3) | default (`mlld publish` gains a verify step / `--dry-run`) is proposed, not ruled | NLF / mlld CLI | before Phase 1 (first real re-publishes); recommended during Phase 0/0b |
| O3 | Multiple authors per package (npm `owner add`-style `grant-collaborator` event) | schema "leaves room" but nothing enforces it; teams-at-namespace-level are already Dec-48 | opgate (principal model) | not blocking; before any package needs a second author (post-Phase-1) |
| O4 | Exact rate-limit + size-cap numbers (`max_mlld_bytes`, `max_imports`, per-identity/hour) | Dec-23 categories ruled; the NUMBERS were carried as a review-#7 residual | opgate | Phase 0 — they must be concrete spec rows before 0a builds |
| O5 | `VersionManifest` freeze-set confirmation (exactly `version, hash, mlld, access, author, source, needs, imports`) | anything else that changes post-publish must live on the mutable side | NLF + implementers | Phase 0 — the schema must be frozen before 0a/0b |
| O6 | Install visited-set `max-depth` value (the Dec-44 cycle backstop) | the cycle *rule* is Dec-44, but the depth bound number was never pinned | mlld client | Phase 0b — the guard ships with a concrete bound |

### O1 — the substrate question (surface, do not decide)

The plan rules **files on Fly.io attached storage + `flock` + `events.jsonl`** as the registry substrate (review #1 HIGH-2). The team is evaluating replacing that custom server-side file store with an **OCI-style registry as the byte store**. This document is **substrate-agnostic at the seams** and does **not** pick. Presenting both options with the decision criteria:

| Decision criterion | Fly volume + flock + events.jsonl (status quo) | OCI-style registry byte store |
|--------------------|------------------------------------------------|-------------------------------|
| Burn determinism & auditability | event append IS the burn; append-only JSONL is trivially auditable | manifest/digest upload is the burn; audit trail must be reconstructed from registry GC/history semantics |
| Normalization authority | opgate normalizes at ingest (stored==served==hashed) — authority stays in one Go process | must decide whether the byte store normalizes or opgate asserts a digest annotation on already-normalized bytes |
| Delete/GC semantics | nothing deletes from the ledger by construction (Dec-3) | OCI registries GC/delete manifests — the "nothing deletes" invariant (I2) needs a re-mechanism |
| Catalog/listing | rollup-derived rendered view (Dec-29) | registry tag/list indexes may replace the rollup — the seq-staleness protocol (I5) must be re-derived |
| Install ceremony | `mlld install <https://…/v/{version}.json>` (one immutable GET) | may become an OCI pull (different ceremony; Dec-50's URL shape is tied to the HTTP doc) |
| Trust | root of trust = opgate's own write path | trust delegated to the registry's auth/ACL |
| Ops surface | exactly-1-machine + flock + volume backup (Dec-38's constraints) | registry distribution + object-store backend (relaxes or replaces Dec-38) |

**Sections that change under each option** (everything else stays):

| Surface | Status quo (kept as documented) | OCI byte-store (delta) |
|---------|--------------------------------|-------------------------|
| Phase 0d | attach Fly volume + pin to 1 machine (Dec-35/38) | stand up the OCI registry (or object-store) instead of the volume; single-instance pin may relax |
| Phase 0a | flock → append → replay → atomic rename | registry manifest/tag writes replace the events-file append; replay/seq re-derived |
| Invariants (§5) | I2, I5, I8 as written | I2/I5/I8 re-mechanized (immutability + staleness + single-writer now owned by the registry, not flock) |
| Schemas (§6) | `events.jsonl` + rollup `index.json` as files | events/rollup may be wrapped or replaced by registry manifest lists; the VersionManifest/lock/ref schemas (6.2/6.5/6.7) are UNCHANGED |
| API surface (§7) | publish = opgate Go write path | publish routes to the registry; status semantics (200/409/400/403/410) must be reproduced on the new write primitive |

The events→rollup *shape* is designed to survive the switch (§7 of the explainer), which is why the ref/lock/install schemas (6.2, 6.5, 6.7) are the same under both options.

---

## 12. Glossary

Each term defined exactly once; used consistently everywhere above.

- **transport** — the typed adapter ID on a lock entry/ref (`opgate` | `github` | `registry` | future `s3`) naming *which* source the bytes came from. A courier sticker, never a URI scheme.
- **resolved** — the REAL, fetchable URL in a lock entry: the origin location the bytes came from (`https://…/v/{version}.json`; `git+https://…#<sha>`; future `https+s3://…`). Advisory: it gets rewritten by legacy re-type and SHA re-pins, so it is never a stable identity key.
- **integrity** — the content fingerprint: normalized sha256 of the module source, `sha256:<64-hex>`, computed (never copied), required (never synthesized), and the ONLY hash authority the offline runtime trusts.
- **mirror** — an ADDABLE alternate location (`mirrors[]`) whose bytes verify to an existing entry's `integrity`. Untrusted fetch hint: availability with zero trust.
- **rollup** — the per-package derived snapshot (`index.json`) re-rendered from `events.jsonl`: the git-checkout of the event log. Carries `seq` + the embedded version map. Disposable cache, never a second source of truth.
- **burn** — the irreversible act of appending a `publish` event under the flock; the label's birth certificate saying `(version, hash)` can never change. Publisher write-once.
- **revoke** — the operator-only explicit `revoke` event (reason `legal`/`dmca`/`abuse`): stops serving (410 Gone + reason); the label stays burned; nothing is deleted from the ledger.
- **content addressing** — the cache stores bytes at `sha256/<hex-of-the-bytes>/`: the address IS the content. Names and transports never appear in the byte store.
- **materializer** — the TS install-side component that turns fetched+verified bytes into durable local state: writes the lock entry and updates the nested cache index.
- **legacy pins** — the freeze-time `legacy-pins.json` table (normalized hash per `@mlld/*` entry, computed from the one-time fetch); the client re-type reads it — the only bridge from raw-digest legacy locks.
- **membership** — `membership(actor, principal)` — the single auth primitive gating publish: is the authenticated identity a member of the owning principal (self for user-owned, GitHub org for org-owned, team-source for future teams).
- **principal** — the OWNER of a namespace: `{type: user|org|team, ref}`. Namespaces are owned by a principal, not a fused identity string.
- **world** — an environment/value-space a ref inhabits; used three ways: (a) the legacy fossil vs the new opgate registry (Dec-10); (b) the two transport worlds opgate/github that may share one display name (Dec-11); (c) World A (bare source imports) vs the lockfile (typed records, Dec-13). Resolution searches one place — one name, one entry.

Supporting terms (implied by the above): **seq** (the monotonic per-package event counter stamped on every event and rollup; the staleness anchor); **replay** (re-rendering events into a rollup); **event** (one append-only JSONL line — `publish` or `revoke`); **needs / imports** (the split of a version's dependencies: runtime interpreter needs vs the transport-qualified module graph).

---

## 13. Delta & consistency report

### 13.1 Structural changes

1. **Five welded documents → fourteen ordered sections.** Decisions (prose/table/changelog/ruling-rounds) consolidated into one register (§4.0); review history demoted to two tables (§14); risks given owner+decision+residual columns (§10).
2. **Phase numbering normalized** `0d → 0 → 0a → 0b → 0c → 1 → 2 → 3` (§9), with the plan-doc (`0, 0d, …`) vs explainer (`0d, 0, …`) conflict recorded; `0d` is a precondition of `0a` (and sequenced first).
3. **`scheme` → `transport` residual prose** scrubbed: the lock field is `transport` everywhere; the only remaining use of the *word* "scheme" is the URL-scheme concept (`https`/`git+https`) from which the TS CLI derives the adapter at install — that derivation is TS-only, never offline Rust (Dec-19, 50).
4. **Terms defined once** (§12); the `world` overload (Dec-10 vs Dec-11 vs World A) is spelled out rather than left implicit.

### 13.2 Contradictions found & resolved (by amendment, never by preference)

| # | Contradiction | Resolution |
|---|---------------|------------|
| C1 | Phase order: plan lists `0` before `0d`; explainer/dependency logic say `0d` is first | Adopted `0d → 0 → …`; recorded in §9 |
| C2 | `scheme` remnants ("transport (from its scheme)") vs rev-9 rename | Retained only as the URL-scheme *concept* driving TS-side adapter selection; the field is `transport` |
| C3 | Dec-32 (separate `versions-index.json`) vs Dec-40 (embed in rollup) | **Dec-40 amends Dec-32**; the embedded map is operative; no separate file |
| C4 | Dec-14 (fail loud on raw-digest) vs Dec-20/25 (re-type bridge) | Complementary, not opposed: Dec-14 is the DETECTOR, Dec-20/25 the only sanctioned RECOVERY (read `legacy-pins.json`, never re-fetch) |
| C5 | Dec-9 ("identity" frame) vs Dec-48 (principal) vs Dec-28/30 (`@mlld` org) | **Dec-48 amends Dec-9**; Dec-28/30 are the `@mlld`-specific concretization; canonical-lowercase (Dec-9) survives intact |
| C6 | Dec-18 gate direction (review #1 MEDIUM-1 pre-append gate vs review #2 HIGH-2 reversal) | The table's Dec-18 is the FINAL post-reversal text (server records own hash; `hashN` advisory); the gate was reversed, not kept |
| C7 | Dec-2 "server omits `latest`" vs Dec-24/§2.6 "listing carries a `latest` label" | Reconciled: `latest` exists ONLY as a display label on the mutable listing; it is never on the immutable doc, never a CLI/install resolution input |
| C8 | Dec-24/§2.6 "latest = mutable-listing label" vs review #2 changelog's "latest client-side" | Stale changelog wording; followed Dec-24 (authoritative): label on the listing, never CLI-resolved |
| C9 | Non-goal "no data movement" vs Dec-31 "one-time fetch of 21 URLs" | The fetch is a read to compute hashes, not a migration/data movement; the catalog is not moved or rewritten |
| C10 | Dec-45 "npm manifest rule" (justification) removed by review #7 | The operative basis is "the runtime already refuses interpolated paths" (`import.rs:60-66`); the npm framing is dropped |

### 13.3 Stale / wrong code citations (verified, NOT fixed — code untouched per contract)

| Citation | Finding |
|----------|---------|
| `read.go:175-191` (payload-store `cacheFor` emitting `public, max-age=31536000, immutable`) | **STALE line range** — `175-191` is the `visibleRepoT` struct; `cacheImmutable` is at `read.go:196`, `cacheFor` at `:211`. Substance correct. |
| `RegistryResolver.ts:378` | Resolves to `ts/core/resolvers/RegistryResolver.ts` (689 lines); note the co-located `ts/core/registry/RegistryResolver.ts` (290 lines) is a DIFFERENT file without that check. Correct line, ambiguous path — disambiguated here. |
| `import.rs:263` (`is_registry_module_ref`) | Call is at `import.rs:261`; `:263` is the closing brace. Off-by-2, substance correct. |
| `import.rs:60-63` (interpolated paths "refused honestly") | The REFUSED-honestly list spans `62-66`; "interpolated variables" is at `:66`. Off-by-a-few, substance correct. |
| `spec-opgate-api.yaml:1032` (org namespace "PROPOSED") | Line 1032 is the `/api/me` aggregate ("org picker … PROPOSED"); orgs are "PROPOSED" via `x-status: proposed` at `:1031`. Substantive claim (orgs not implemented) correct. |
| `digest.rs:49-53` (BLAKE3 `b3:`) | `blake3::hash` at `:50`; the `DIGEST_PREFIX` (`b3:`) is a const defined elsewhere. Substance correct. |

All other ~40 cited locations (Rust `registry.rs`/`module_names.rs`/`module.rs`/`policy_lib.rs`/`authorize_lib.rs`; TS `LockFile.ts`/`ModuleCache.ts`/`RepoPublishingStrategy.ts`/`HashUtils.ts`; spec `:84,85,519-538,3021,3023-3036,3049-3058,1244`; `fly.toml:3-6`, `fly.staging.toml:62-67`) verified accurate. Catalog confirmed 21 entries, all `@mlld/*`, metadata-only (`source.url` + raw `contentHash`, no bytes).

### 13.4 Wording touches (semantics unchanged)

Dec-2, 9, 18, 19, 28, 32, 40, 46, 50, 51 wording compressed in §4.0; amendment chains recorded in the "amended/amends" column. No decision was renumbered or re-semanticized; no Dec-52+ was added (none were needed).

### 13.5 Cross-reference matrix (architecture claim ↔ Dec ↔ source section)

| Architecture claim | Dec(s) | Source (§ of rev-11 plan / explained) |
|--------------------|--------|----------------------------------------|
| URL-only install, no semver, name from URL | 50, 2, 12 | §2.1, §2.3 / §2, §3 |
| Nested-by-transport cache index | 16, 19, 11 | §2.1 / §4 |
| Lock = name + integrity + transport + resolved + mirrors[] | 5, 22, 33, 51, 46 | §2.3 / §5 |
| Raw-hex fallback dropped; integrity only | 14, 15, 22 | §2.3 / §1, §5 |
| `github` SHA-pinned refs | 21 | §2.2, §2.3 / §2, §11 |
| Events→rollup, seq, fleet of one | 4, 17, 40, 38, 35 | §2.4 / §7 |
| Burn at event append; event-anchored 409 | 3, 8, 26 | §2.5 / §6, §8 |
| Serving split, VersionManifest | 6, 24 | §2.6 / §10 |
| Server-side normalization, one vector, sha256-not-blake3 | 7, 41 | §2.7 / §9 |
| Hash covers content, not envelope; normalize once at ingest | 7 (rev-10 rulings) | §2.5, §2.7 / §9 |
| access split (version vs package) | 27 | §2.6 / §10 |
| needs/imports split, collector, cycles | 36, 37, 44, 45, 43 | §2.6, §2.8 / §13 |
| Owner = principal; membership gate; `@mlld` = mlld-lang org | 48, 39, 28, 30, 9 | §2.8 / §12 |
| `@mlld/std/*` prefix + 7-ref code-derived guard | 49, 43 | §2.8 / §12 |
| Mirrors addable, verified-at-add | 51 | §2.3 / §5 |
| Operator revoke = 410 + reason | 47 | §2.4 / §6, §7 |
| Legacy re-type pin-authoritative, one-time fetch, per-module refuse | 20, 25, 31, 34, 42 | §2.2, §5(0c) / §14 |
| Install-time truth for GitHub; fetch-then-verify | 6, 51, 21 | §2.9 / §11 |

---

## 14. Appendix: history

The 7 reviews + 3 ruling rounds, reduced to one table each. Prose commentary dropped; findings mapped to their ruling and decision number.

### Reviews #1–#7 (finding → ruling → decision)

| Review | Sev | Finding (one line) | Ruling | Dec |
|--------|-----|--------------------|--------|-----|
| #1 | BLOCKER | Rust "untouched" false: raw-digest lock passes offline gate then fails attestation | drop raw-hex fallback; writer rejects `://` keys | 14, 15 |
| #1 | BLOCKER | `@mlld` not reserved; builtin shadowing possible | reframed → org-owned namespace + guardlist | (→#2-B) |
| #1 | BLOCKER | `/v/{version}.json` returns full `PackageDetail` incl. `versions[]` | net-new `VersionManifest`; BREAKING, Phase 0 | 24 (6) |
| #1 | HIGH | Two-world cache collision (flat index) | transport-scoped nested index + typed field | 16, 19 |
| #1 | HIGH | flock/rename on multi-replica Postgres (wrong citation) | substrate correction: Fly.io volume files; staleness scoped to `latest` | 17 (+substrate) |
| #1 | MEDIUM | root-of-trust fails for corrupted uploads | pre-append gate → **REVERSED** by #2-HIGH-2 | 18 (final) |
| #2 | BLOCKER | legacy `registry://` locks bare-name-keyed, raw-digest | re-type at first install (transport `registry`) | 20 |
| #2 | BLOCKER | catalog is 100% `@mlld/*`; "reserve @mlld" dead-locks fossil | org-owned namespace; guard on bundled refs | 28 |
| #2 | BLOCKER | `github://…@main` mis-split; branch unstable | `#<sha>` URL fragment; branch resolved to SHA | 21 |
| #2 | HIGH | Dec-16 (key from `resolved`) vs "Rust never parses URLs" | typed `transport` field (renamed from `scheme`) | 19 |
| #2 | HIGH | pre-append gate cedes authority; retry-gate drift burns label | REVERSED: server computes own hash; `hashN` advisory | 18 |
| #2 | MEDIUM | `normalizeLockEntry` invents integrity from `resolved` | integrity REQUIRED, never synthesized | 22 |
| #2 | MEDIUM | publish endpoint under-specified | auth/idempotency/validation/caps/rate-limits | 23 |
| #2 | LOW | freeze-set prose not a schema; `latest` unruled | `VersionManifest` schema; aggregates on mutable side | 24 |
| #3 | BLOCKER | legacy re-type impossible (no normalized byte source) | pin-authoritative `legacy-pins` at freeze | 25 |
| #3 | BLOCKER | idempotency mis-burns a benign retry | EVENT-anchored burn; 409 only with an event | 26 |
| #3 | BLOCKER | `access` mutable but frozen | split: version `access` vs package `current_access` | 27 |
| #3 | HIGH | `@mlld` org identity doesn't exist in spec | GitHub `mlld-lang` org membership (forge-identity) | 28, 30 |
| #3 | HIGH | `versions[]` has no source of truth | rollup-derived rendered view | 29 |
| #3 | MEDIUM | no prod API (staging-only) | Phase 0d = API → prod as precondition | 35 (0d) |
| #4 | BLOCKER | pins table has no byte source | one-time freeze-time fetch of 21 URLs | 31 |
| #4 | BLOCKER | event-existence check O(n) on unbounded file | version→seq index (→ amended by 40) | 32 |
| #4 | HIGH | `transport` field is net-new (understated) | explicit LockFile.ts rewrite + version bump | 33 |
| #4 | HIGH | freeze-set omits `dependencies` | `dependencies` joins the freeze-set | 36 |
| #4 | HIGH | `legacy-pins.json` location unstated | lives at `registry/legacy-pins.json`, read-only | 34 |
| #4 | MEDIUM | "attach Fly volume" underspecified | explicit persistent mount in 0d | 35 |
| #5 | BLOCKER | `dependencies` has no mechanical source (needs≠imports) | split `needs` vs `imports` (net-new collector) | 37 |
| #5 | BLOCKER | single-instance flock never stated | explicit exactly-1-machine invariant | 38 |
| #5 | HIGH | `@mlld` org membership = net-new auth | GitHub membership call in Phase 0 | 39 |
| #5 | HIGH | Dec-32 separate index leaves two-rename gap | version map EMBEDDED in the rollup | 40 |
| #5 | MEDIUM | vector unlocated; blake3-vs-sha256 conflation | pinned vector; sha256-normalized NOT blake3 | 41 |
| #5 | MEDIUM | 404-at-freeze policy a footnote | per-module REFUSE + grace path, ruled | 42 |
| #6 | BLOCKER | guardlist wrong: 7 refs, not 4 | code-derived guard (dispatch-predicate union) | 43 |
| #6 | HIGH | collector can't capture interpolated refs | static refs only; interpolated already refused | 45 |
| #6 | HIGH | cycles unbounded | publish refuses cycles; install visited-set | 44 |
| #7 | HIGH | Dec-44 cycle-check body homeless | folded into §2.6; named parse authority | 44, 45 |
| #7 | HIGH | Dec-45 misread `import.rs:60-63` | basis corrected; "npm rule" dropped | 45 |
| #7 | HIGH | Dec-23 categories without values | PUBLISH SPEC TABLE (claim/caps/rate/status) | 23 |
| #7 | MEDIUM | Dec-38 fossil citation (`fly.staging.toml:62-67`) | mechanism = min=max=1 hard pin | 38 |
| #7 | LOW | ModuleCache transport-key not in 0b | `updateIndex` nested key into Phase 0b | 16 |

### Ruling rounds (finding → ruling → decision)

| Round | Finding | Ruling | Dec |
|-------|---------|--------|-----|
| rev 9 | `opgate://`/`s3://` as URI schemes | real URLs; rename `scheme`→`transport`; nested index | 46 |
| rev 9 | "must guess transport" overstated | goals/§2 rewritten to npm shape | 1, 7 (→50) |
| rev 9 | "what lockfile?" unstated | name `mlld-lock.json`, no npm | 5 |
| rev 9 | `scheme` vocabulary lingered | mechanical rename across §1–7 + Dec 1/5/11/16/19/20/21/33/36/37 | 46 |
| rev 9 | legacy `registry://` in the wild | re-type also rewrites `resolved` from `source.url` | 20, 25 |
| rev 10 | "no yank, nothing deletes" legally impossible | publisher write-once + operator `revoke` | 47 |
| rev 10 | server-side normalization ≠ "client can't verify" | normalize ONCE at ingest; client verifies served bytes | 7 |
| rev 10 | what the hash covers unclear | content bytes, NOT the envelope | 7 |
| rev 10 | "rollup"/"replay" undefined | commit-log/checkout definitions | 4 |
| rev 10 | "namespace == identity" fuses owner/member | owner = principal; uniform membership | 48 |
| rev 10 | guardlist enumerations drift (twice wrong) | reserved `@mlld/std/*` prefix | 49 |
| rev 11 | "install @nlf/foo" bakes in a default registry | `mlld install` ALWAYS takes a URL | 50 |
| rev 11 | one location = dead origin = dead install | addable `mirrors[]`, verified at add | 51 |
| rev 11 | config row obsolete under URL-only install | inputs = typed URL + fetched bytes | 50 |