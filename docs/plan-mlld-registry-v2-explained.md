# The mlld registry (v2) — technical explanation

> **Technical companion** to `docs/plan-mlld-registry-v2.md` (APPROVED).
> Not authoritative — the v2 plan is the reference. Same facts, written for
> an engineer who wants the mechanism, not the analogy. Decision numbers
> (Dec-1..51), failures (F1..F8), invariants (I1..I12), phases, and open
> questions (O1..O6) are quoted from v2 exactly. The OCI substrate option
> (v2 §11/O1) is documented separately in `docs/plan-mlld-registry-oci.md`
> as OC-1..14; this companion keeps the substrate question OPEN, exactly
> as v2 leaves it.

---

## 0. Core model

The design rests on these invariants, each building on the previous one:

```
  R1  A module is addressed by NAME ("@nlf/foo") in source. A name is a
      KEY, never a location.

  R2  Resolution is recorded, not computed: mlld-lock.json maps each name
      to (typed transport, real fetchable URL, integrity = sha256).

  R3  The local cache (~/.llm/cache) is content-addressed: bytes live
      under their sha256, not under a name.

  R4  Install = fetch + verify + record, anchored on a URL. The URL is the
      pin; there is no semver resolution.

  R5  opgate is both the byte store and the event ledger for the public
      registry. Private modules load via github, which opgate never sees.

  R6  The events ledger is append-only. A version label is bound to its
      bytes at the append; it can never be re-bound.

  R7  Rollups (index.json) are derived from the ledger by replay — a
      cache, never a second source of truth.

  R8  Revocation is an operator-only event in the SAME ledger: 410 Gone +
      reason. Nothing is ever deleted.

  R9  Mirrors are untrusted fetch hints: any mirror fetch is verified
      against the entry's integrity, after the fact.

  R10 The legacy catalog is frozen; legacy-pins.json maps old locks to
      new pins.
```

---

## 1. Component roles and the data flow

```
   source names a module (bare "@author/module")
      -> the lock maps  name -> typed transport + real URL + integrity
      -> install is    fetch + verify + record  around a URL
      -> the registry is  append-only events -> derived, seq-stamped rollups
```

| Component | Role |
|-----------|------|
| `mlld` client (TS) | the only author of `mlld-lock.json`; issues `mlld install/publish/update`; fetches, verifies, records |
| Rust offline runtime | reads key + typed `transport` + `integrity`; never touches the network, never parses URLs |
| **opgate** (transport `opgate`) | immutable version manifests + append-only events + derived rollups; files on a Fly.io volume |
| **GitHub** (transport `github`) | direct `git+https://…#<sha>` byte refs; no registry involved |
| **legacy catalog** (`registry/` repo) | metadata-only `modules.json` + `legacy-pins.json`; read forever, never written |
| **operator** | the one service-side carve-out: an explicit `revoke` event (410 Gone + reason) |

---

## 2. System topology

```
                 LOCAL                              REMOTE
   +-----------------------------+   +-----------------------------------+
   | mlld client                 |   | opgate                            |
   |   install / publish /       |   |   immutable version manifests     |
   |   update                    |   |   append-only events              |
   |                             |   |     (events.jsonl)                |
   |   local cache               |   |   derived rollups (index.json)    |
   |   ~/.llm/cache              |   +-----------------------------------+
   |     content-addressed       |   |
   |     (sha256/<hex>/)         |   +-----------------------------------+
   |                             |   | github                            |
   |   Rust offline runtime      |   |   private repos, direct byte refs |
   |     (no network)            |   |   opgate never sees these bytes   |
   +-----------------------------+   +-----------------------------------+
      ^                 ^
      |                 |
   mlld-lock.json    source import
                     "@nlf/foo"
```

Two constraints settled up front:

- **No invented protocols.** A ref is a typed `transport` (adapter ID:
  `opgate` | `github` | `registry` | future `s3`) plus a REAL fetchable
  `resolved` URL. `opgate://` and `s3://` are banned.
- **No npm.** `mlld-lock.json` is mlld's own lockfile, produced by
  `mlld install`. It adopts package-lock's proven field shape
  (`version` / `resolved` / `integrity`) — deliberately.

---

## 3. What changes vs today (before → after)

| Today | v2 (target) | Ruled by |
|-------|-------------|----------|
| `resolved` = raw sha256 OR `registry://…` OR a URL (one field, three meanings) | `resolved` = a REAL fetchable URL (origin); `integrity` = normalized sha256 (fingerprint); `transport` = typed adapter ID | Dec-1/5/14/19/46 |
| `mlld install @nlf/foo` (bare name; CLI guesses) | `mlld install <url>` — URL is the pin; no bare-name install, no default registry, no semver math | Dec-50, Dec-2 |
| Flat cache index `index[name]=hash` → two transports overwrite each other, silent wrong bytes | Index **nested by transport**: `{opgate:{name:hash}, github:{…}}` | Dec-16/19/11 |
| Publisher hashes RAW sha256; resolver verifies NORMALIZED → mismatch on CRLF/BOM/NFD | One normalization, one authority (server), one pinned vector tested Go+TS+Rust | Dec-7/41/18 |
| Version label mutable in practice (overwrite/yank possible) | Label bound at the event append; publisher cannot re-bind; operator-only revoke | Dec-3/26/47 |
| `/v/{version}.json` returns full `PackageDetail` (growing `versions[]`) | Version route → new immutable `VersionManifest`; mutable listing keeps `PackageDetail` | Dec-6/24 (BLOCKER-3) |
| One lock entry = one hard-coded location (dead origin = dead install) | `resolved` (origin) + addable `mirrors[]`, verified at add-time | Dec-51 |
| No operator stop-serving path (legally impossible) | Explicit `revoke` event, same ledger, 410 Gone + reason, nothing deleted | Dec-47 |
| Namespace == identity (fails when teams arrive) | Namespace → owning **principal**; gate = `membership(actor, principal)` | Dec-48/39 |

---

## 4. Why rebuild: the failures (symptom → root cause → fix)

| # | Symptom | Root cause | Fix (decisions) |
|---|----------|------------|-----------------|
| F1 | `resolved` is sometimes a raw hash, sometimes a fake URL, sometimes a real one; the offline runtime reads it one way and trusts whatever it finds | one field does two jobs (fingerprint + address) and does neither reliably | split into `integrity` + `resolved` + typed `transport`; drop the raw-hex fallback (Dec-1/5/14/19) |
| F2 | install github `@nlf/foo` writes `index[name]=A`; install opgate `@nlf/foo` overwrites to `B`; later the github pin serves `B`'s bytes — nobody notices | `updateIndex` (TS) and `resolve_from_cache` (Rust) both key by bare import path | index nested by transport; offline read enters the sub-object named by the typed `transport` (Dec-16/19/11) |
| F3 | publisher computes RAW sha256; resolver verifies NORMALIZED; CRLF/BOM/NFD content matches at publish, mismatches at fetch | two authorities, two different rules | one server-computed normalized hash; client verifies (never re-derives); one pinned vector file (Dec-7/41/18) |
| F4 | "immutable" is only a convention — nothing stops a silent overwrite, and nothing gives the operator a stop-serving lever | write path isn't append-only; the "nothing deletes" promise has no carve-out | bind at the event append; publisher write-once + operator-only `revoke` (Dec-3/26/47) |
| F5 | catalog stores no bytes (only a GitHub `source.url` + RAW `contentHash`); a normalized re-pin has no byte source | legacy bytes live nowhere accessible at install time for normalization | one-time freeze-time fetch → `legacy-pins.json`; client re-type READS the table, never re-fetches (Dec-25/31/20/42) |
| F6 | `/v/{version}.json` returns full `PackageDetail` incl. growing `versions[]` — "cache forever" would lie | version route and listing route share one response type | serving split: immutable `VersionManifest` vs mutable listing (Dec-6/24) |
| F7 | two Fly machines = two `flock` namespaces = duplicate events/seq | `flock`+rename is correct only with one writer; that invariant was never stated | pin machine count to exactly 1, no autoscale (Dec-38/35, Phase 0d) |
| F8 | a published module can shadow a built-in of the same name | hand-maintained guardlist + no structural protection for future embedded modules | code-derived guard for the 7 legacy refs + reserved `@mlld/std/*` prefix (Dec-43/49) |

---

## 5. Goals & non-goals

**Goals (each tagged with the decisions that implement it):**

1. Transport identity first-class, in npm's shape — a typed `transport` +
   a real `resolved` URL(s) + `integrity` on every lock entry. **Dec-1, 5, 13, 46, 50, 51.**
2. `mlld install` ALWAYS takes a URL — no bare-name install, no default
   registry, no semver math. Rust never parses URLs. **Dec-50, 2, 12, 13.**
3. Public registry moves to opgate as transport AND serving authority. **Dec-7, 6, 4.**
4. Private modules stay in GitHub via `git+https://…#<sha>` direct refs. **Dec-21, 11.**
5. Version immutability is an enforced contract (bind at append; operator-only revoke). **Dec-3, 8, 26, 47.**
6. Events are the truth; rollups are derived (replayable, seq-stamped). **Dec-4, 29, 40.**
7. Fetch-then-verify under one shared policy — nothing is trusted from a
   location, only from a verified hash. **Dec-6, 7, 41, 51.**

**Non-goals:** no S3 adapter yet (`https+s3://` is future) **Dec-46**; no
gists; no GitHub rate-limit work; no change to the Rust offline *resolution
model* beyond the transport-aware read of one typed field **Dec-13,16,19**;
no batch migration (freeze + re-publish only) **Dec-10,31,42**; no
multi-writer scaling now **Dec-38**.

---

## 6. The lockfile and the transport field

The lock entry is the complete answer for one name — one name, one entry;
resolution never searches (Dec-11/13).

```
   mlld-lock.json — mlld's own lockfile (no npm involved)

   "modules": { "@nlf/foo": {
      "version":    "1.2.3",                 <- display label, never a
                                                resolution input
      "resolved":   "https://opgate.dev/@nlf/foo/v/1.2.3.json",
                                                <- the ORIGIN: a real,
                                                fetchable URL
      "mirrors":    ["https://mirror.example.org/@nlf/foo/v/1.2.3.json"],
                                                <- ADDABLE backup refs,
                                                verified at add-time
      "transport":  "opgate",                  <- adapter ID, NEVER a URI scheme
      "integrity":  "sha256:7dbf35be…",        <- REQUIRED, never synthesized
                                                (Dec-22)
      "fetchedAt":  "…" } }
```

Rules the lockfile obeys:

- the writer **rejects `://` inside a module KEY** (Dec-15);
- `integrity` is **required** — never derived from `resolved` (Dec-22); and
  the raw-hex fallback in the offline path is **deleted** (Dec-14): the ONLY
  hash authority offline is the normalized `integrity`;
- format change = a net-new `LockFile.ts` rewrite with a `lockfileVersion`
  bump `1 → 2` (Dec-33);
- **the server never writes a lockfile** — it serves bytes + metadata only.

**The transport field — one per ref, closed enum (Dec-46/19):**

```
   transport   ADAPTER ID (never a URI scheme): "opgate"|"github"|
               "registry"|future "s3"
   resolved    a REAL URL, one of exactly three forms:
                 opgate  -> https://<host>/@nlf/foo/v/1.2.3.json
                            (the immutable artifact itself)
                 github  -> git+https://github.com/nlf/foo#9f31a…
                            (SHA as a URL FRAGMENT — always)
                 registry-> the catalog's real source.url (frozen)
                 s3 (future) -> https+s3://{bucket}/{path}
   unknown transport -> honest error, never a guess:
                 E_UNKNOWN_TRANSPORT: no adapter for transport 'ipfs'
```

GitHub refs are **SHA-pinned**: the branch name `@main` is install-time
convenience only, resolved to a SHA before the lock write. Index keys are
`(transport, name)` only — never a revision, because revisions move (Dec-21).

---

## 7. Install = fetch + verify + record

There is no resolution step to compute: the URL already identifies the exact
version (document path) or SHA (`git+https` fragment). The adapter is
fetch-only — resolution is NOT in the adapter (Dec-50/12).

```
   mlld install <url>     (the URL is the pin)

   adapter.fetch(url)  ----------------------> raw bytes
        |
        v
   shared policy re-verifies:  hashNormalized(bytes) == integrity ?
        |  no  -> E_MODULE_CONTENT_MISMATCH   (the LOCATION is distrusted)
        | yes  v
   store bytes at  cache/sha256/<hex>/        (content-addressed)
   + index[transport][name] = <hex>           (nested index)
   + lock entry born   (or a mirror appended, Dec-51)
```

The **materializer** — the TS component that turns verified bytes into
durable local state — writes the lock entry and updates the nested index.

**Offline is a lookup, not a query:**

```
   import '@nlf/foo'
     -> lock entry "@nlf/foo"   (pinned at install time)
     -> integrity sha256:<hex>  (nothing to compute — just compare)
     -> index box [transport][name] -> hash -> cache/sha256/<hex>/
     -> verify cached bytes == integrity -> done
```

The Rust offline runtime sits below all of this: lock (name→integrity) +
index (`(transport,name)`→hash) + cache (hash→bytes). No network, no
adapters, no URL parsing (Dec-13/16/19).

---

## 8. Local cache: content-addressed storage, nested index

Bytes live at `~/.llm/cache/sha256/<hex>/` — the address is the content.
Names and transports never appear in the byte store. The one place names do
appear is the index — and it's nested by transport (Dec-16):

```
   +-------------------------------------------------+
   |  "opgate": { "@nlf/foo": d41d…34 }   <- B      |
   |  "github": { "@nlf/foo": 9f31…88 }   <- A      |
   +-------------------------------------------------+

   offline read: entry.transport = "opgate"  -> enter the "opgate" sub-index
                  -> get the hash -> load those bytes
```

This is what closes F2: the github pin and the opgate pin coexist. It is
carve-out #2 of the "Rust untouched" cut (the other is Dec-14's fallback
drop) — a minimal transport-aware *read*; the resolution model is unchanged.

Why not key by the URL? The index answers *what-this-name-means*; the URL
says *where-from*. `resolved` is advisory — legacy re-type rewrites it
(Dec-20/25) and github SHAs move on every re-pin (Dec-21) — so it is never
a stable identity key. The offline read enters the sub-object named by the
lock's typed `transport` field, never the URL (Dec-19).

---

## 9. Events → rollup (append-only log → derived snapshot)

```
   Per package:   registry/{author}/{pkg}/events.jsonl   <- the LOG (truth,
                                                         append-only)
                  registry/{author}/{pkg}/index.json     <- the ROLLUP (derived)
   Per namespace: registry/{author}/index.json           <- namespace rollup
                  registry/{author}/_feed.jsonl          <- event feed
```

The git analogy (Dec-4): the rollup is to the event log what a checkout is
to a commit log — current state, derived and disposable; replay re-renders
the log into the snapshot.

The rollup exists so readers don't scan the whole log; it is a cache of the
log, never a second source of truth. Every rollup carries the `seq` of the
last event it includes (Dec-17/40), so staleness is DETECTABLE:

```
   reader: read rollup (seq=N) -> tail events from N+1
   a rollup claiming seq M that omits an event <= M -> REFUSE
   (a behind-rollup is a detectable stale cache, never a wrong answer)
```

The **version map is embedded in the rollup** — one file, one atomic rename,
no separate version index, no index-rollup disagreement (Dec-40 amends
Dec-32). The O(1) event-existence check (Dec-26) reads that map.

Why files + `flock` rather than a database? On one writable disk, `flock` +
atomic rename is correct — and only correct with one writer. Hence the
**single-instance invariant (Dec-38)**: exactly ONE Fly machine
(`min=max=1`, no autoscale; the volume mount is Dec-35). Scaling to N needs
a multi-writer primitive — out of scope, and the events→rollup *shape* is
designed to survive that switch.

---

## 10. Publish flow and version-label binding

```
   client (authed)                     opgate (holding the flock)
      |  { bytes, version, hashN? }          |
      +------------------------------------->|
                                              | 1. normalize bytes -> contentHash
                                              |    (SERVER computes the record)
                                              | 2. check EVENTS for (pkg, version):
                                              |      absent         -> append -> 200
                                              |      same hash      -> no-op  -> 200
                                              |      different hash -> 409  BURNED
                                              | 3. replay events -> new rollup
                                              |    (version map embedded, 1 file)
                                              | 4. one atomic rename
                                              | 5. serve /@nlf/foo/v/1.2.3.json
```

**The binding IS the event append** — one line lands at the end of the
append-only file, under the flock. No flag, no row, no rewrite; every later
check reads exactly that line (Dec-3/26).

Two powers, precisely:

```
   publisher:  CANNOT re-bind a label, cannot rewrite bytes, no yank,
               no unpublish.
   operator:   CAN stop serving — because it legally MUST
               (DMCA/abuse/takedown) — as an explicit revoke event in
               the SAME register, visible + auditable, never a silent
               deletion (Dec-47).
```

`hashN` (the client's pre-publish claim) is **advisory**: a mismatch is a
warning that flags divergence, never a refusal; the server's own hash is the
recorded value, and the client verifies again post-publish (Dec-18 — the
final text, superseding the once-proposed pre-append gate).

---

## 11. Ownership & namespaces (who may publish)

Every namespace is owned by a **PRINCIPAL**, not a fused identity string
(Dec-48, amends Dec-9/28/30):

```
      @nlf    -> owner {type: user, ref: "nlf"}
      @mlld   -> owner {type: org,  ref: "mlld-lang"}
      @acme   -> owner {type: team, ...}   (future — same gate, new type)

      the publish gate is ONE rule everywhere:
        membership(actor, principal)
          user-owned -> membership = the user themself
          org-owned  -> GitHub membership (orgs/{org}/members/{login})
          team-owned -> the team's membership source (future)
```

- **`@mlld` = the GitHub `mlld-lang` ORG** (Dec-28/30/39): publishing to
  `@mlld/*` requires GitHub `mlld-lang` membership — a forge-identity check,
  not an invented opgate org. Net-new auth work in Phase 0.
- **Canonical lowercase at the edge** (Dec-9): `@Nlf/foo` is rejected; the
  Rust parser doesn't case-fold, so `Adam` could otherwise squat both
  `@Adam/foo` and `@adam/foo`.
- **Slug validation** (alphanumeric + `-`/`_`, ≥1 segment) before any path is
  derived — names become filesystem paths (Dec-23).
- **Embedded stdlib** (Dec-43/49): `@mlld/std/*` is the reserved
  embedded-prefix — resolved bundled by prefix rule, publish REFUSED at the
  edge, drift-immune. The 7 legacy embedded refs
  (`@mlld/policy`, `@mlld/policy/standard`, `@mlld/policy/url-defense`,
  `@mlld/patterns/url`, `@mlld/sanitizers/url`, `@mlld/authorize`,
  `@mlld/test`) keep their names + a **code-derived guard** (the union of the
  dispatcher's predicates), so the list can't drift by hand. Any *other*
  `@mlld/*` (ai-cli, array, …) is a legitimate registry ref.
- **First-publish race** resolves under the flock: both writers touch the
  same `(author,package)` path; first event wins, second gets a clean 409.

---

## 12. Trust model

```
   opgate   = root of trust. we host the bytes, we compute the hash,
              we append the events. the client re-verifies by COMPUTING,
              never by copying.

   github   = install-time truth. opgate never sees private bytes so
              cannot vouch; the lock integrity is the snapshot from
              install. upstream moved -> MISMATCH -> refuse (actionable);
              `mlld update` re-pins deliberately (partial npm ci-vs-install).
              no semver, no metadata server, no opgate consultation.

   mirrors  = zero trust by construction. any fetch is verified AFTER
              the fact against the entry's integrity; mismatch = refuse
              + try the next location. trust lives only in the hash,
              never in a location.
```

A hash copied is a rumor; a hash recomputed is a measurement.

---

## 13. The invariants — conditions that must never hold

| # | Must NEVER happen | Enforcing mechanism | Dec |
|---|-------------------|---------------------|-----|
| I1 | Silent wrong bytes served to a pin | cache index nested by transport; offline read enters the sub-object named by typed `transport`; bytes addressed by content hash | 16,19,11 |
| I2 | Silent version-label overwrite | binding at the event append; same-hash no-op / diff-hash 409, event-anchored | 3,26,8 |
| I3 | Unverified bytes served offline | raw-hex fallback dropped; ONLY normalized `integrity` is a hash authority offline; integrity never synthesized | 14,15,22 |
| I4 | Normalization drift (Go vs TS vs Rust) | one rule, one authority (server), one pinned vector file tested by all three | 7,41 |
| I5 | Stale rollup producing wrong answers | `seq` on every rollup + reader tail-diff protocol; rollup-with-gap = refuse | 4,17,40 |
| I6 | Namespace / case-variant squatting | canonical lowercase at the edge + membership gate on the owning principal | 9,48,39 |
| I7 | Path traversal via slugs | slug validation (alphanumeric + `-`/`_`, ≥1 segment) before any path derivation | 23 |
| I8 | Two machines corrupting the ledger | single-instance invariant: exactly 1 Fly machine, no autoscale | 38,35 |
| I9 | Untrusted location supplies wrong-but-accepted bytes | shared fetch-then-verify policy; mismatch = refuse after ANY fetch | 6,51,21 |
| I10 | Legacy consumers silently break on re-pin | pin-authoritative `legacy-pins.json`; re-type reads the table, never re-fetches; unre-pinnable = per-module refuse | 25,31,42,20 |
| I11 | Published module shadows embedded stdlib | reserved `@mlld/std/*` prefix (publish refused) + code-derived guard for the 7 legacy refs | 43,49 |
| I12 | Infinite install recursion (a→b→a) | publish refuses `imports` cycles; install keeps visited-set + max-depth guard | 44 |

**Three adversarial self-checks from the review history still hold:**
- *two-transport collision* → I1+I3 close it (nested index; hash never named-only);
- *crash-window retry* → a first publish whose bytes were stored but whose
  event never appended has NO event → label unclaimed → a same-version
  different-content retry is a legitimate first-publish. I2 is *event*-anchored, so no false burn;
- *legacy raw-digest lock* → after Dec-14 it fails LOUD and is recovered ONLY
  through Dec-20/25's re-type (read `legacy-pins.json`). I3 + I10, no gap.

---

## 14. The data model

### 14.1 The normalized hash — one rule, one authority (Dec-41/7)

Input: the module content bytes (the full `mlld` source — **not** the JSON
envelope). Output: `sha256:<64-hex>`.

```
   Bytes:
     1. strip a leading UTF-8 BOM (EF BB BF)
     2. line endings: CRLF -> LF; lone CR -> LF
     3. NFC-normalize (Unicode 15.0)
     4. sha256 over the normalized bytes -> 64 lowercase hex; prefix "sha256:"
```

- NOT blake3 (the `mlld_sig` chain is different; the lock-integrity chain is
  sha256).
- valid UTF-8 required (NFC is a Unicode op); the server refuses non-UTF-8
  with 400.
- **one pinned vector file** `vectors/content-normalization.json` tested by
  Go (server), TypeScript (client), AND Rust (offline) — Dec-41.
- normalized **once at ingest** → stored == served == hashed. The client
  verifies by re-applying the same idempotent rule to the served bytes.

The hash covers the ENTIRE module content, never the JSON envelope — hashing
the envelope would be circular (the hash would describe itself).

### 14.2 The version manifest — `VersionManifest` (immutable, Dec-24/6/27/36/37)

```
   /@nlf/foo/v/1.2.3.json   <- the ARTIFACT (byte-immutable)
   +-----------------------------------------------+
   | version:  "1.2.3"                              |
   | hash:     "sha256:..."   (server-computed,    |
   |                           of the CONTENT)      |
   | mlld:     "import {x}…"  (the full source)    |
   | access:   {reads:[], emits:[], never:[]}       |  frozen at publish
   | author:   "nlf"                                |
   | source:   {publishedAt:…}                      |
   | needs:    {node:">=18"}   (interpreter needs)  |
   | imports: [                                     |  the frozen,
   |   {transport:"opgate", name:"@nlf/bar", ...},  |  transport-qualified
   |   {transport:"github", name:"@nlf/baz",        |  module graph —
   |     rev:"9f31a…", ...} ]                       |  structured entries,
   +-----------------------------------------------+   never URL strings
   cache: public, max-age=31536000, immutable  <- it can never change
```

- `imports[i]` shape: `{transport, name, version?|rev?, resolved}` —
  `version` for opgate/registry, `rev` (the SHA) for github.
- **explicitly NOT present:** `versions[]`, `installs`, `stars`, `ratings`,
  `latest` — anything that grows lives on the MUTABLE side (Dec-24/6).
- `dependencies` split: `needs` (runtime interpreter needs) vs `imports`
  (the collected module graph; static refs only — MCP/URL/`@root`/`@base`/
  interpolated are not registry refs and not in `imports`, Dec-37/45).

**The listing** (`/@nlf/foo.json`, mutable) carries the growing data:
`versions[]` (rollup-derived, Dec-29), `latest` (display label only — never
CLI-resolved, Dec-24), `installs`/`stars`/`ratings` (live), and
`current_access` (the package's evolving access, Dec-27) — revalidate
posture, never immutable.

### 14.3 The register and the rollup

```
   events.jsonl line (one JSON object per line, append-only):
     {"type":"publish","pkg":"@nlf/foo","version":"1.2.3",
      "hash":"sha256:7dbf35be…","seq":41}
     {"type":"revoke", "pkg":"@nlf/foo","version":"1.0.0",
      "reason":"dmca","seq":42}

   rollup index.json (derived, version map embedded — Dec-40):
     { "package":"@nlf/foo", "seq":42,
       "versions": {
         "1.2.3": {"hash":"sha256:7dbf35be…","seq":41,"revoked":null},
         "1.0.0": {"hash":"sha256:…",       "seq":7, "revoked":"dmca"} } }
```

> One honest non-decision flagged in v2 (not invented here): an event
> `actor`/`at` field for audit would be consistent with Dec-47's
> "auditable" but is NOT ruled; Phase 0 may add it.

### 14.4 The serialized ref (typed + URL-explicit, Dec-46)

```
   { "transport": "opgate"|"github"|"registry"|"s3",   // adapter ID
     "resolved":  "<real fetchable URL>",              // 3 forms of §6 only
     "mirrors":   ["<url>", …] }                       // addable,
                                                        // verified-at-add
```

`transport` is written by TS at install (the adapter knows it); Rust reads
`entry.transport`, never splits `resolved` on `://` (Dec-19). Source imports
stay bare `@author/module` — a bare name is a KEY, never a location (Dec-13).

---

## 15. API surface (routes & status)

```
   GET /@{author}/{pkg}/v/{version}.json  -> VersionManifest (immutable)
        public, max-age=31536000, immutable
        200 | 404 unknown | 410 Gone + reason if revoked (Dec-47)

   GET /@{author}/{pkg}.json              -> catalog listing (mutable)
        revalidate | 200 | 404

   POST publish (authed)                  -> 200 | 409 | 400 | 403
```

The **publish status contract**:

| Status | Meaning | Trigger |
|--------|---------|---------|
| 200 | first-publish | `(pkg,version)` absent from EVENTS → append |
| 200 | no-op | event exists, same normalized hash |
| 409 | BURNED | event exists, DIFFERENT hash — only when an event exists (Dec-26) |
| 400 | validation | bad slug/version/size/UTF-8/imports-cap |
| 403 | identity | `membership(actor, principal)` fails |
| 410 | revoked (read) | version has a `revoke` event |

Client errors — never silent, never a fallback:

```
   E_UNKNOWN_TRANSPORT    no adapter for transport 'ipfs'  (Dec-1)
   E_MODULE_CONTENT_MISMATCH  bytes fail hashNormalized(…)==integrity
                          the LOCATION is distrusted  (Dec-6, 41)
```

Publish endpoint spec (Dec-23, values from review #7): OAuth claim
`publish`; `max_mlld_bytes` and `max_imports` caps (**exact values OPEN,
O4**); rate limit per-identity per-hour (**value OPEN**); idempotency =
`(version, normalized-hash)` server-side vs EVENTS (no client key);
auth = `membership(actor, principal)`; validation = slug/version regex +
caps + UTF-8 + static-imports-only.

---

## 16. Crash safety (why retry is always safe)

| Crash window | What's left | Why retry is safe | Dec |
|--------------|-------------|-------------------|-----|
| Bytes stored, event NOT appended | stored bytes, NO event | label is **unclaimed** → same-version retry (even different content) is a legitimate first-publish, NOT a burn | 26 |
| Append done, rollup rename NOT done | events has the last line; rollup stale | retry replays against EVENTS and no-ops (`(version,hash)` idempotent); rollup is a disposable cache, events are truth | 8,4 |
| Lost ACK after a successful append | event durable, client never saw the 200 | client re-publishes → server reads EVENTS → same hash → no-op 200 (no false 409) | 8,26 |

- A 409 requires an existing event (Dec-26) *precisely so* a crash between
  byte-write and event-append can't burn an unclaimed label.
- Stale bytes after a first-publish overwrite are harmless: the event (not
  the bytes) is the authority, so stale bytes can never be served as truth.

---

## 17. Phasing (dependency order)

Dependency-correct order: **`0d → 0 → 0a → 0b → 0c → 1 → 2 → 3`**.

```
   0d  OPS + INFRA precondition   opgate API -> production; attach the
                                   persistent Fly VOLUME MOUNT; pin machine
                                   count min=max=1 (no autoscale); TLS/domain.
                                   <- a PRECONDITION of everything (gates 0a)
    0  SPEC                        normalization rule + vector file; publish
                                   endpoint; serving split + BREAKING
                                   VersionManifest; serialized ref format;
                                   @mlld org gate + @mlld/std/* prefix.
                                   -> unblocks 0a, 0b, 0c
   0a  SERVER WRITE PATH           flock -> append -> replay -> atomic rename;
                                   seq; publish status contract; revoke event
                                   + 410.  -> unblocks 0b's opgate adapter + 1
   0b  TS CLIENT                   LockFile.ts rewrite (transport + integrity-
                                   required + re-type + bump); nested cache
                                   index; materializer + transport trait;
                                   URL-only install + mirror-add; cycle guard.
                                   -> unblocks 1 and 2
   0c  CATALOG FREEZE + legacy-pins   modules.json read-only FOREVER; ONE-TIME
                                   fetch of the 21 URLS -> legacy-pins.json;
                                   per-module refuse for un-pinnable entries.
                                   -> supplies 0b's legacy re-type at runtime
    1  MIGRATE BY RE-PUBLISH ONLY  new names + new versions; no batch copy,
                                   no label reuse.  -> unblocks 2
    2  GITHUB TRANSPORT            git+https:#<sha> direct refs; SHA-pinned
                                   locks; install-time truth; gists removed.
    3  https+s3 (future)           additive; no owner/milestone yet.
```

---

## 18. Open questions (genuinely open, from v2 §11)

| # | Question | Why open | Must be decided by |
|---|----------|----------|--------------------|
| O1 | **The substrate question** — Fly volume + `flock` + `events.jsonl` vs an OCI-style registry byte store | strategic; both viable, different seams change | before Phase 0d completes |
| O2 | Publish dry-run / pre-publish verify (a typo'd publish burns a label forever) | default proposed, not ruled | before Phase 1 |
| O3 | Multiple authors per package (collaborator-grant event) | schema leaves room; nothing enforces it | post-Phase-1, non-blocking |
| O4 | Exact rate-limit + size-cap numbers (`max_mlld_bytes`, `max_imports`) | Dec-23 categories ruled; numbers carried as residual | Phase 0 |
| O5 | `VersionManifest` freeze-set confirmation (exactly `version, hash, mlld, access, author, source, needs, imports`) | it must be frozen before 0a/0b build | Phase 0 |
| O6 | Install visited-set `max-depth` value (the Dec-44 backstop) | the rule is Dec-44; the number never pinned | Phase 0b |

**O1 — surface, do not decide.** v2 rules *files + flock + events.jsonl* as
the substrate (review #1 HIGH-2) but flags an **OCI-style registry byte
store** as a live alternative. v2 is substrate-agnostic at the seams; the
two options differ on burn determinism, normalization authority, delete/GC
semantics, listing/rollup, install ceremony, trust, and ops surface. The
events→rollup **shape** and the lock/ref/**VersionManifest**/listing
**schemas** are the SAME under both options. A separate document
(`docs/plan-mlld-registry-oci.md`) records the OCI specifics as OC-1..14;
this companion does not re-decide O1.

---

## 19. Appendix — the decision register (Dec-1..51)

Quoted from v2 §4.0, one line each, amendment chains preserved. Operative
text is always the *amending* decision.

| # | Decision |
|---|----------|
| 1 | Transport identity first-class: typed `transport` + REAL-URL `resolved`; no invented URI schemes (amended by 46, 50, 51) |
| 2 | No semver resolution in install — a URL pins exactly; listing carries version records for browsing (amended by 50) |
| 3 | Version label bound forever (publisher-side); operator revocation via explicit event only (extends 47) |
| 4 | Events → rollup, sync under flock, seq'd |
| 5 | Lock = name + integrity + transport + resolved (origin) + mirrors[] (extends 1; amended by 51) |
| 6 | Serving split: immutable version doc / mutable listing |
| 7 | Server-side normalization (normalize once at ingest; hash covers content, not envelope) |
| 8 | Idempotency = (version, normalized-hash), server-side, vs events |
| 9 | Namespace → owning PRINCIPAL; publish gate = membership; canonical lowercase (amended by 48) |
| 10 | NO batch migration; two permanent worlds (legacy fossil + new opgate) |
| 11 | Typed `transport` + origin URL IS the package identity |
| 12 | Refs are typed + URL-explicit; no default-transport inference |
| 13 | Source statements stay bare `@author/module`; Rust offline parsing untouched |
| 14 | Raw-hex `resolved` fallback dropped in Rust offline path; legacy raw-digest locks fail loud |
| 15 | Lock writer rejects `://` in module keys |
| 16 | Cache index NESTED BY TRANSPORT; offline read enters sub-object named by typed `transport` |
| 17 | Rollup staleness affects only the browse-surface listing; installs are pin-exact |
| 18 | Publish: client sends bytes+version(+optional `hashN`); SERVER computes & records its own `contentHash`; `hashN` mismatch = warning, never refusal; client verifies post-publish |
| 19 | Lock entries gain typed `transport` — adapter ID, never a URI scheme (renamed from `scheme`) |
| 20 | Legacy locks re-typed at first install: `transport:"registry"` + normalized integrity + `resolved` from `source.url` |
| 21 | `github` refs ALWAYS carry `#<sha>` fragment; `@<branch>` install-time convenience; index keys `(transport, name)` only |
| 22 | `normalizeLockEntry` REQUIRES integrity — never synthesizes `sha256:${resolved}` |
| 23 | Publish endpoint net-new write surface: auth-claims, idempotency, validation regexes, size caps, rate-limits, 4xx/5xx |
| 24 | `VersionManifest` freeze-set explicit; `versions`/`installs`/`stars`/`latest` on MUTABLE side; `latest` = listing label, never CLI-resolved |
| 25 | Legacy re-type PIN-AUTHORITATIVE: `legacy-pins` table read, never re-fetched |
| 26 | Burn/idempotency check EVENT-anchored: 409 ONLY when an event exists with a different hash |
| 27 | `access` split: `VersionManifest` freezes the version's own `access`; package-level `current_access` on the mutable listing |
| 28 | `@mlld` owned by GitHub `mlld-lang` ORG; publish gate = org membership (amended by NLP ruling) |
| 29 | Mutable listing ROLLUP-DERIVED: `versions[]` = rendered view at a seq; only `installs`/`stars`/`latest` live |
| 30 | `@mlld` namespace owned by GitHub `mlld-lang` ORG (reaffirms 28/39) |
| 31 | Pins-table build needs a ONE-TIME FREEZE-TIME FETCH of the 21 pinned URLs (pre-freeze) |
| 32 | Per-package separate `versions-index.json` as O(1) existence source (AMENDED by 40) |
| 33 | Dec-19/22 are NET-NEW `LockFile.ts` format changes (new `transport` field + `normalizeLockEntry` rewrite + `lockfileVersion` bump) |
| 34 | `legacy-pins.json` lives at `registry/legacy-pins.json`, committed at freeze, served read-only |
| 35 | Phase 0d adds the persistent Fly VOLUME MOUNT for the registry file surface |
| 36 | `dependencies` JOINS the `VersionManifest` freeze-set (refined by 37) |
| 37 | `dependencies` SPLIT into `needs` (runtime) + `imports` (transport-qualified module graph, net-new collector) (amends 36) |
| 38 | EXPLICIT single-instance invariant: exactly ONE Fly machine (min=max=1, no autoscale); multi-writer out of scope |
| 39 | `mlld-lang` org-membership verification = NET-NEW opgate auth work (Phase 0) |
| 40 | Version map EMBEDDED IN THE ROLLUP (one file, one atomic rename) (amends 32) |
| 41 | Normalization: ONE pinned vector file tested by Go+TS+Rust; sha256-normalized, NOT blake3 |
| 42 | 404-at-freeze RULED: per-module REFUSE; grace path = old raw-URL fetch or uninstallable-new; one 404 never kills the other 20 |
| 43 | Shadowing guardlist CODE-DERIVED: union of dispatch predicates = seven refs |
| 44 | Cycles bounded: publish refuses an `imports` cycle; install keeps visited-set/max-depth guard |
| 45 | Collector scope: only static refs; MCP/URL/`@root`/`@base`/interpolated are not registry refs and not in `imports` |
| 46 | Refs are REAL URLs, never invented URI schemes; vocabulary `scheme`→`transport`; index nested by transport (amends 1/5/11/16/19/20/21/33/36/37) |
| 47 | OPERATOR REVOCATION = explicit `revoke` event (reason legal/dmca/abuse) on the SAME ledger; 410 Gone + reason; label stays bound; nothing deleted |
| 48 | Namespace ownership is a PRINCIPAL (`owner: {type, ref}` from day one); publish gate = `membership(actor, principal)` uniformly (amends 9/28/30) |
| 49 | Embedded PREFIX reservation: `@mlld/std/*` resolved bundled by prefix rule, publish REFUSED; 7 legacy refs keep names + code-derived guard |
| 50 | `mlld install` ALWAYS takes a URL; name derived from the URL; no bare-name install, no default registry, no CLI semver math (amends 2) |
| 51 | Lock records ORIGIN (`resolved`) + ADDABLE mirrors (`mirrors[]`); mirror-add verifies bytes against an existing entry's integrity (amends 5) |

---

## 20. One-line cheat sheet

- Transport identity first-class, npm-shaped: source stays bare `@author/module`; the lock records typed `transport` + origin URL + addable mirrors; install ALWAYS takes a URL; unknown transport = honest error, never a guess.
- No invented URI schemes: `https://…` (registry artifact), `git+https://…#<sha>` (private refs), future `https+s3://`.
- `mlld-lock.json` is mlld's own lockfile, produced by `mlld install`, no npm involved, deliberately package-lock-shaped. No semver math: a URL pins exactly; `latest` is never CLI-resolved.
- Version labels are write-once for PUBLISHERS (the event append IS the binding). OPERATORS revoke serving via an explicit event — 410 Gone + reason; nothing deletes from the register.
- Events → rollup under one flock, seq'd → stale rollups are detectable, never wrong (rollup = the checkout derived from the event log).
- Lock = name + typed `transport` + normalized `integrity` (required, never synthesized) + origin `resolved` + addable `mirrors[]`. Legacy locks re-type from the freeze-time pins table.
- Mirrors are untrusted fetch hints: added by installing a URL whose bytes verify to an existing entry's integrity.
- Two documents per package: frozen artifact (immutable cache) / living catalog (revalidate).
- Normalization: one rule, one authority, one vector file (Go+TS+Rust). Client verifies by computing; pre-publish `hashN` is advisory.
- Every namespace is owned by a PRINCIPAL; publish gate = membership; `@mlld` gated by GitHub `mlld-lang` org; embedded stdlib = reserved `@mlld/std/*` prefix + code-derived guard for the 7 legacy refs.
- No batch migration: freeze the old catalog; migrate by re-publish only.
- Dependencies = `needs` + `imports` (static, transport-qualified, structured objects, cycle-refused at publish, depth-guarded at install).
- Single-instance invariant: exactly one Fly machine (min = max = 1).