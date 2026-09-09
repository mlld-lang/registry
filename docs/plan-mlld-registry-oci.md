# Plan — the mlld module registry on an OCI byte store (the OCI branch)

> **Status: PROPOSED. Answers the substrate question `O1` in `plan-mlld-registry-v2.md` §11 by choosing the OCI registry.**
> `plan-mlld-registry-v2.md` remains the going-forward reference for every
> **substrate-agnostic** fact — the 51 locked decisions, the lock/ref schemas,
> the `VersionManifest`, the transports, the ownership model, the legacy-catalog
> freeze. This document is that plan with **one** thing resolved: the write/serve
> substrate. It re-derives exactly the seams the v2 plan marked "Changes under
> OCI" (§11), and leaves everything else untouched, by reference.
>
> The OCI-specific decisions here are numbered **OC-1..14** (not Dec-52+): they
> are *proposals this branch requires*, not NLF rulings. If NLF rules this branch
> in, OC-1..14 are adopted as-is or amended, and the substrate rulings they
> replace (review #1 HIGH-2, Dec-4/35/38) are superseded. Nothing else in the 51
> decisions changes.
>
> Evidence convention (same as v2): **VERIFIED** = cited line opened in the tree
> at write time; **PROPOSED** = a reasoned default this plan requires but no ruling
> pins; **OPEN** = still undecided. None of the three is a decision.

---

## 1. Executive summary

**The one-sentence spine (unchanged):** source names a module; the lock maps
*name → typed transport + real URL + fingerprint*; install is *fetch + verify +
record around a URL*; the registry is *append-only events with derived,
seq-stamped rollups*.

**The one thing that changes:** *where the bytes and the immutable version docs
live* — an **OCI registry** (content-addressed blob store) instead of a Fly
volume's file tree. *Where the truth lives* is unchanged in kind: an **append-only
ledger**. Under this branch that ledger is **opgate's Postgres** — which *already
runs* an append-only event tape and a write-once content-addressed artifact
store — rather than `events.jsonl` files under `flock`.

**The cast of roles (only the substrate actors change):**

| Role | v2 status-quo substrate | This branch (OCI) |
|------|-------------------------|-------------------|
| **mlld client** (TS) | unchanged | unchanged — `mlld install <url>`, fetch+verify+record |
| **Rust offline runtime** | unchanged | unchanged — reads key + `transport` + `integrity`, never the network |
| **opgate** | writes files on a Fly volume | **the ledger** (Postgres) + **the front door** (same HTTP JSON routes) |
| **OCI registry** (new) | — | the **byte store**: `zot` + a `Tigris` (S3) bucket — content-addressed, immutable, write-closed to opgate |
| **GitHub / legacy / operator / NLF** | unchanged | unchanged |

**What changes vs the v2 status-quo substrate** (the five rows of §11's
"OCI byte-store (delta)" column, now decided):

| Surface | v2 status quo | OCI branch | By |
|---------|---------------|-----------|-----|
| Phase 0d | attach Fly volume, pin `min=max=1` | stand up `zot` + reuse the **idle Tigris bucket**; no volume; single-machine pin **relaxed** | OC-2, OC-3, OC-12 |
| Phase 0a | `flock` → append → replay → atomic rename | normalize → registry upload → manifest PUT → **ledger burn** → tag | OC-7, OC-8, OC-14 |
| Invariants I2/I5/I8 | files: append-only + seq-staleness + one machine | re-mechanized: DB write-once + DB read consistency + one **registry writer** | OC-8, OC-10, OC-11, OC-12 |
| Schemas | `events.jsonl` + rollup `index.json` files | a `module_events` Postgres table + derived read model; the **lock / ref / `VersionManifest` / listing schemas are UNCHANGED** | OC-8, OC-11, OC-13 |
| API surface | publish = opgate Go file write path | publish = opgate → registry + ledger; **routes & status contract unchanged**; OCI pull added as an optional ceremony | OC-9, OC-13 |

The elegant fact at the center of the branch: **the OCI blob digest *is* the
`integrity`.** opgate normalizes the source once at ingest (Dec-7/41); the *same*
normalized bytes become the OCI blob, addressed by `sha256:<hex>`; so the
registry's own content-address **is** the fingerprint the client re-verifies.
One authority, a third verifier (the registry), and no second digest.

---

## 2. The substrate decision (O1 → answered)

`O1` asked: files + `flock` + `events.jsonl` vs an OCI-style byte store. This
plan **chooses OCI**, on these grounds, against the same five criteria the v2
plan laid out:

| Decision criterion | OCI branch result |
|--------------------|-------------------|
| Burn determinism & auditability | The **ledger** (Postgres) is the burn and the audit trail — unchanged in kind; the registry is *not* the truth, so we never reconstruct history from its GC semantics |
| Normalization authority | opgate still normalizes once (Dec-7/41); the **registry independently verifies** the digest on upload (OC-7) — a strengthening |
| Delete/GC | OCI registries can GC/delete → re-mechanized: never delete, never untag, GC collects **only unclaimed orphans**; ledger is the audit backstop (OC-10) |
| Catalog/listing | The rollup becomes a **Postgres read model**, not a file — the seq-staleness file protocol is *retired*, not re-derived (OC-11) |
| Install ceremony | **Unchanged** — `mlld install <https://…/v/{version}.json>`; OCI pull is an *additive* ceremony (OC-13) |
| Trust | Root of trust stays opgate: publishers → opgate (membership, Dec-48/39) → registry (write-closed to opgate's service identity, OC-9) |
| Ops surface | `zot` (single static binary, S3 backend) + the **already-provisioned, idle** Tigris bucket + Postgres; **Dec-38's exactly-1-machine constraint is removed** (OC-12) |

The deciding fact, **VERIFIED** in `opgate/fly.toml:1-10`: production "serves the
static marketing page … the production **Managed Postgres cluster and Tigris
bucket stay where they are, idle**, for the day that changes." The OCI branch's
infrastructure is *largely already provisioned*; it changes fewer things than the
volume does.

---

## 3. Architecture — three stores

The whole branch is one split, stated once and then kept everywhere:

```
          ┌─────────────────────────┐
          │  opgate (front door)    │  the SAME JSON routes as v2 §7
          │  HTTP, auth, membership │  unchanged cache posture
          └─────┬─────────────┬─────┘
                │ reads       │ writes (the only writer)
                ▼             ▼
   ┌────────────────────┐   ┌──────────────────────┐
   │  LEDGER (Postgres) │   │  OCI byte store      │
   │  module_events     │   │  zot + Tigris        │
   │  append-only       │──▶│  blobs (content-     │
   │  (burn, seq,       │   │   addressed)         │
   │   revoke, digest)  │   │  manifests, tags     │
   └────────────────────┘   └──────────────────────┘
        "records/truth"          "served bytes"
```

- **The ledger (Postgres, existing)** is the *only* writer of truth: append-only
  `publish`/`revoke` events, write-once name→digest mapping, seq. It already
  exists in kind — see the seams below.
- **The OCI byte store (new surface)** holds *content-addressed* immutable bytes
  and serves them, anonymously, fast, and cacheable. It is **write-closed**:
  only opgate's service identity can PUT; delete/untag/GC-prune-of-claimed-stuff
  is ruled out by policy (OC-10).
- **The front door (opgate HTTP, existing)** renders the v2 §6/§7 shapes from
  the two stores and applies the exact `cacheImmutable`/`cacheRevalidate`
  posture opgate already emits.

**Why the ledger can stay a ledger — VERIFIED reuse, not re-invention.** The v2
plan's substrate note already observed that opgate's `store.go`/`tape.go` "are
the tape/receipts store, a different surface." That surface is precisely the
append-only machinery this branch needs:

| Need | What opgate already ships | Citation (VERIFIED) |
|------|---------------------------|---------------------|
| Append-only, strictly-ordered, idempotent events | `tape.Append` — atomic batches, idempotent by `(session_id, seq)`, `ErrSeqGap`/`ErrConflict`, two lanes; server-lane `AppendServer` for operator-produced events | `tape.go:146-465` |
| Write-once, content-addressed, "same bytes = no-op, different bytes = conflict" | `store.PutArtifact` + `ErrArtifactConflict` — literally the burn law | `store.go:473-516` |
| The events table | `events` table with `seq`, `lane`, `type` | `store.go:128-149` |
| The write-once artifact table | `artifacts` table, key `(kind,key)` | `store.go:150-157` |
| Immutable-byte serving posture | `cacheImmutable = "max-age=31536000, immutable"`, `cacheRevalidate` | `read.go:196`, `:211` |

The branch therefore **does not copy the file machinery into Postgres**; it
*reuses the tape's ordering/idempotency and `PutArtifact`'s write-once law* to
implement the one new table (§7). OC-14 pins this.

**What specifically becomes obsolete:** `flock`, the atomic-rename rollup, the
"rollup claiming seq M that omits an event ≤ M" corruption class, and the
`min=max=1` machine pin. None of it is re-implemented; it is *removed*.

---

## 4. The OCI decision register (OC-1..14)

One line each; the operative text is the section that follows.

| # | Decision |
|---|----------|
| OC-1 | **Substrate = OCI byte store + opgate Postgres ledger.** Answers O1: OCI chosen. The registry stores bytes; the ledger records truth; opgate fronts. |
| OC-2 | **Registry = `zot`** (single static binary; S3 backend; htpasswd/bearer/OIDC auth). CNCF `distribution` is the fallback; **Harbor ruled out** (Postgres+Redis+k8s-shaped — too heavy); Docker Hub/GHCR/Cloudflare R2 ruled out (no reason to host bytes off-Fly). |
| OC-3 | **Byte backend = `Tigris`** (Fly's S3-compatible store, zero egress) — the bucket already exists, idle, in production (`fly.toml`). |
| OC-4 | **OCI repo mapping `@author/module` → `author/module`** (drop the single leading `@`; canonical-lowercase per Dec-9). Slug validation tightened to OCI component grammar so the mapping is total. |
| OC-5 | **Version label = OCI-tag-safe**: `[A-Za-z0-9][A-Za-z0-9._-]{0,127}`; the registry tag is `v{version}`. Pins the Dec-23 "version regex" value that was OPEN. |
| OC-6 | **Media types**: source blob `application/vnd.mlld.source.v1`; config blob `application/vnd.mlld.version.v1+json`; manifest `application/vnd.oci.image.manifest.v1+json`; optional package index `application/vnd.oci.image.index.v1+json`. |
| OC-7 | **Normalize-at-ingest ⇒ blob digest == integrity.** Store only normalized bytes; the registry's `PUT ?digest=` verification is the *third* verifier (opgate, client, registry). One rule (Dec-7/41), one hash. |
| OC-8 | **Burn = the ledger's `publish` row** (write-once via `PutArtifact`-law). The OCI tag is a *derived alias*, never the authority. Event-anchored (Dec-26): 409 only when a ledger row exists with a different digest. |
| OC-9 | **Registry is write-closed**: only opgate's service identity writes; anonymous public read flows through opgate's front door (zot **not** public-facing by default). OCI pull (`oras`/`docker`) is an additive later ceremony by flipping read exposure. |
| OC-10 | **"Nothing deletes" re-mechanized**: opgate never issues `DELETE`, never untags, `deleteReferrers:false`. GC may collect **only unclaimed orphans** (unburned/untagged); a burned/revoked version keeps its tag → survives. The Postgres ledger is the audit truth even if a byte were ever reclaimed. |
| OC-11 | **Seq/rollup = a Postgres read model.** The v2 file-gap staleness protocol (I5) is *retired*; staleness = ordinary DB snapshot, and (per Dec-17) affects only the listing, never a pin. |
| OC-12 | **Dec-38 (exactly-1-machine) relaxed.** The single-writer invariant becomes "one registry-writer service account"; zot+DDB-less S3 and Postgres are multi-writer-safe, so opgate may scale to N. |
| OC-13 | **Install ceremony unchanged.** `GET /{author}/{pkg}/v/{version}.json` assembles the v2 §6.5 `VersionManifest` from ledger+registry; lock (§6.2) / ref (§6.7) / Dec-50 untouched. OCI pull is additive only. |
| OC-14 | **Ledger implemented by reuse, not invention**: publish-burn = `PutArtifact` write-once law; revoke = `tape.AppendServer` (server-lane event). One new table, two existing primitives. |

---

## 5. What changes vs the v2 status-quo substrate

Every decision in v2 §4.0 that is **substrate-specific** is re-baselined; the
rest is unchanged. "Re-mechanized" = same semantics, new mechanism.

| Decision | v2 status-quo meaning | This branch | Change |
|----------|-----------------------|-------------|--------|
| Dec-3 | burn = event append (file) | burn = `publish` row in the ledger | re-mechanized, same semantics |
| Dec-4 | events → rollup, sync under `flock`, seq'd | events → read model, Postgres tx, seq'd | `flock` removed |
| Dec-8 | idempotency `(version,hash)` vs events | same, vs the ledger row | re-mechanized |
| Dec-17 | seq-staleness tail-diff protocol | read-your-writes / snapshot; listing-only | simplified (retired) |
| Dec-26 | event-anchored 409 | ledger-row-anchored 409 (via `PutArtifact` law) | re-mechanized |
| Dec-32 | per-package O(1) version→seq index | embedded in the ledger read model (as Dec-40) | same outcome |
| Dec-35 | attach Fly volume mount | stand up `zot` + point at the idle Tigris bucket | replaced |
| Dec-38 | exactly-1 Fly machine, no autoscale | one registry-writer service account; opgate scales to N | relaxed |
| Dec-40 | version map embedded in rollup, one atomic rename | one DB transaction writes burn row + map together | re-mechanized, no rename |
| Dec-47 | operator `revoke` event, 410 + reason | same; revoke = ledger event, registry object untouched | re-mechanized |

**Unchanged, wholesale** (substrate-agnostic — no restatement here, v2 §4.0 is
authoritative): Dec-1, 2, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15, 16, 18, 19, 20,
21, 22, 23, 24, 25, 27, 28, 29, 30, 31, 33, 36, 37, 39, 41, 42, 43, 44, 45, 46,
48, 49, 50, 51 — the entire client, lockfile, ref, `VersionManifest`, transport,
ownership/auth, normalization, and legacy-catalog surface.

---

## 6. OCI layout & mechanics

### 6.1 Object graph (per published version)

```
OCI repository: author/module                    (zot, backed by Tigris)

  blob     sha256:<SOURCE>   mediaType vnd.mlld.source.v1   ← the NORMALIZED module source
                              ── this digest IS the integrity ────────────────────┐
  blob     sha256:<CONFIG>   mediaType vnd.mlld.version.v1+json                  │
                              {version, hash:<SOURCE>, access, author, source,    │
                               needs, imports}                                     │
  manifest sha256:<DM>       mediaType vnd.oci.image.manifest.v1+json             │
                              config:  { digest:<CONFIG>, size }                   │
                              layers: [{ digest:<SOURCE>, size }] ─────────────────┘
  tag      v1.2.3  ────────►  sha256:<DM>

Postgres ledger: author/module                     (opgate, existing DB)

  module_events:  seq | type(publish|revoke) | version | digest(<DM>) | reason | at
                    ▲ the burn lives HERE, not in the tag
```

- **One hash answer.** `<SOURCE>` is sha256 over the **normalized** source bytes;
  the config's `hash` field is `<SOURCE>` too. The registry *verifies* the blob
  against `<SOURCE>` on upload (OC-7), so the "stored == served == hashed" chain
  has three independent parties asserting the same hex.
- **The manifest is the version's root object**, like v2's immutable
  `/v/{version}.json`; its digest `<DM>` is what the ledger records.
- **The tag is a convenience alias.** It exists so `oras`/`docker` tooling and
  the registry's own tooling can name a version; the ledger never trusts it.

### 6.2 Repo mapping (OC-4) — total, injective

- Bare name is always `@author/module` (author always present, Dec-13).
- Slug charset (Dec-23): alphanumeric + `-`/`_`, ≥1 segment; `@` therefore occurs
  **only** as the leading scope marker.
- Mapping: drop the leading `@` → `author/module`, then OCI-canonicalize
  (lowercase, already true by Dec-9). Distinct bare names stay distinct.
- **Tightening (this branch must carry):** OCI path components must *start* with
  `[a-z0-9]` and may continue with `[a-z0-9._-]`. Dec-23's "alphanumeric + `-`/`_`"
  permits a leading `-`/`_`, which OCI rejects. The slug regex is therefore pinned
  to `[a-z0-9][a-z0-9._-]*` per segment (a strict subset of Dec-23) so the
  mapping is total. This is the only place OC-4 narrows a v2 decision, and it
  narrows a regex whose value was already OPEN (Dec-23).

### 6.3 Version labels and tags (OC-5)

- Version label = `[A-Za-z0-9][A-Za-z0-9._-]{0,127}`; rejected otherwise at the
  publish edge (400). Pins the Dec-23 "version regex" OPEN value.
- Registry tag = `v{version}` (`v1.2.3`). The `v` prefix separates version tags
  from any future non-version tags and from the digest namespace.
- `github`-transport `version` fields (SHAs) and legacy `registry` labels are
  **not** OCI tags — they never touch the registry (github is a direct byte ref;
  legacy is the frozen catalog).

### 6.4 Registry configuration (OC-2/3/9/10), VERIFIED against zot docs

- **Backend**: S3 = the Tigris bucket. `zot` stores blobs/manifests there; the
  binary itself is stateless.
- **Auth**: anonymous **read** permitted *on the registry* (it is private-network
  only; public reach goes through opgate), bearer/OIDC **write** restricted to
  opgate's service identity. No publisher ever holds registry credentials.
- **GC**: zot's `gc` model (`gc` on/off, `gcInterval`, `gcDelay`) and `retention`
  policy. This branch pins, per the zot storage/retention docs (VERIFIED
  2026-09): no retention policies; `deleteUntagged` may stay **true** (it only
  ever removes *unclaimed* manifests — see §8 crash windows); `deleteReferrers`
  **false** (revoke referrers, if attached, reference a live subject and must
  never be pruned); no `DELETE` calls from the writer.

---

## 7. Write path (publish) & crash safety

### 7.1 Publish (unchanged client contract; new server mechanics)

```
1. client → opgate:  { metadata, mlld source, version, hashN? }      (hashN advisory, Dec-18)
2. opgate:           canonical-lowercase (Dec-9) + slug/version validation (OC-4/5)
                     + membership(actor, principal) (Dec-48/39) + size caps (Dec-23)
3. opgate:           normalize source ONCE (Dec-7/41) → N bytes → integrity = sha256:<SOURCE>
4. opgate → registry: HEAD /v2/{repo}/blobs/{integrity}
                     absent → POST /v2/{repo}/blobs/uploads/?digest=sha256:<SOURCE>  (monolithic)
                     registry verifies digest == <SOURCE>   (mismatch → upload refused)
5. opgate:           config blob {version, hash:<SOURCE>, access, author, source, needs, imports}
                     → upload → digest <CONFIG>  (mediaType vnd.mlld.version.v1+json)
6. opgate:           build manifest {config, layers:[<SOURCE>]}
                     → PUT /v2/{repo}/manifests/{<DM>}  → header Docker-Content-Digest: <DM>
7. opgate → ledger:  **THE BURN** — write (repo, version, <DM>) write-once (PutArtifact law):
                       absent            → row lands                    → 200 (first-publish)
                       present, same <DM>→ no-op                        → 200 (idempotent)
                       present, diff <DM>→ ErrArtifactConflict          → 409 (BURNED)
8. opgate → registry: PUT /v2/{repo}/manifests/v{version}  (point tag at <DM>)  — derived, idempotent
9. opgate → client:   200 / 200 / 409 / 400 / 403                        (Dec-26/23/48 contract)
```

The status contract (`200 first` / `200 no-op` / `409 burned` / `400` / `403` /
`410` on read) is byte-for-byte the v2 §7 table.

### 7.2 Crash windows — every v2 §8 row preserves its answer

| Crash window | What's left | Why retry is safe | Decision |
|--------------|-------------|-------------------|----------|
| Blob uploaded, manifest not | an unclaimed blob | re-upload is idempotent (digest exists); unclaimed blobs are GC-able | OC-8, OC-10 |
| Manifest PUT done, burn row not written | manifest, no ledger row | label **unclaimed** → same-version retry (even different content) is a first-publish, not a burn | Dec-26, OC-8 |
| Burn row written, tag not set | ledger has the claim; tag missing | the tag is a **derived alias** — opgate re-derives it from the ledger on next read/repair; pinned installs resolve by digest via the ledger, never the tag | OC-8, OC-13 |
| Lost ACK after burn | row durable, client saw nothing | re-publish → same `<DM>` → no-op 200 (no false 409) | Dec-8, OC-8 |

**Staleness of the read model (Dec-4/17/40, OC-11):** the listing is a Postgres
read; a slightly-behind replica sees a slightly-behind listing — cosmetic only,
and only for the browse surface. A pinned install resolves `(author,module,
version) → <DM>` from the ledger and fetches `<DM>`'s blob by digest: exact by
construction, independent of listing freshness.

---

## 8. Read path (install) & serving

### 8.1 `GET /{author}/{pkg}/v/{version}.json` — immutable (Dec-6/24, OC-13)

```
opgate:  ledger lookup (repo, version) → {<DM>, seq, revoked?}
           absent  → 404
           revoked → 410 Gone + reason                         (Dec-47)
opgate → registry: GET /v2/{repo}/manifests/{<DM>}             → manifest
                    GET /v2/{repo}/blobs/{<CONFIG>}            → metadata JSON
                    GET /v2/{repo}/blobs/{<SOURCE>}            → source bytes  (digest == integrity)
opgate:  assert config.hash == <SOURCE> == layer digest (defense in depth)
          assemble the v2 §6.5 VersionManifest (with inline `mlld`) and serve
          Cache-Control: public, max-age=31536000, immutable     (cacheImmutable)
```

The client's ceremony is **identical to v2**: fetch once, `hashNormalized(bytes)
== integrity` (Dec-41), store under `cache/sha256/<hex>/`, write the lock entry
(§6.2), update the nested-by-transport index (Dec-16). The offline Rust runtime
is untouched (Dec-13/14/16/19).

### 8.2 `GET /{author}/{pkg}.json` — mutable listing (Dec-24/27/29)

Ledger query → `versions[]` (rollup-derived view), `latest` (display label),
`installs`/`stars`/`ratings` (live), `current_access`. `cacheRevalidate`.

### 8.3 OCI pull as an additive ceremony (OC-13)

`oras pull`/`docker pull` against the registry repo (if the read surface is
later exposed, OC-9) yields the same immutable objects: the source blob's digest
is the integrity, and the manifest digest is the ledger's `<DM>`. This is a
*second*, optional ceremony for ecosystem tooling — never required, never a
change to the lock format, refs, or `mlld install`.

---

## 9. Invariants (re-mechanized)

v2 §5 holds with three rows re-mechanized and one added. Rows not listed are
unchanged as written.

| # | Invariant (must NEVER be true) | Enforcing mechanism | Decision(s) |
|---|-------------------------------|---------------------|-------------|
| I2 | Silent version-label overwrite | Burn = **ledger write-once row** (`PutArtifact` law: same digest no-op, diff digest `ErrArtifactConflict`); the tag is never the authority and never re-pointed | Dec-3, 8, 26, **OC-8** |
| I5 | Stale rollup producing wrong answers | **Postgres read model**: installs resolve by digest (exact); listing lags are a bounded snapshot, cosmetic only | Dec-4, 17, 40, **OC-11** |
| I8 | Two writers corrupting the ledger | **Single registry-writer** (opgate's service account) + Postgres transactional uniqueness; the old single-**machine** invariant is retired | Dec-38→**OC-12** |
| I13 | (new) A registry GC/delete reaping a **claimed** version | Never `DELETE`; never untag; `deleteReferrers:false`; a claimed version keeps its tag forever → not "untagged" → GC leaves it; the ledger still records the digest as the audit backstop | **OC-10** |
| I14 | (new) Blob digest ≠ integrity (raw bytes stored) | Normalize **before** upload; store only normalized bytes; registry `PUT ?digest=` refuses a mismatch; a test asserts `integrity == the registry-reported digest` | **OC-7**, Dec-7/41 |

---

## 10. Schemas

### 10.1 The ledger — `module_events` (replaces §6.3 `events.jsonl`)

One row per event; the `PutArtifact` write-once law supplies the burn semantics.

| column | type | req | meaning |
|--------|------|-----|---------|
| `repo` | text | → | OCI path `author/module` (the OC-4 mapping) |
| `seq` | bigint | → | per-repo monotonic event counter (staleness anchor) |
| `type` | text | → | `publish` \| `revoke` |
| `version` | text | → | the version label (OC-5 charset) |
| `digest` | text | → | manifest digest `<DM>` (`sha256:<64-hex>`); '' for `revoke`? no — revoke names the version, digest mirrors its publish row |
| `reason` | text | →* | `legal` \| `dmca` \| `abuse`, present iff `type=revoke` (Dec-47) |
| `actor`, `at` | text | →* | audit (same status as v2 §6.3's "unspecified, not a decision" flag) |

Write-once law on `(repo, version, type=publish)`: identical `digest` → no-op;
different `digest` → conflict. `PUT /v2` never writes this table; only opgate's
publish path does.

### 10.2 The read model (replaces §6.4 rollup `index.json`)

The `versions[]` / version→`{hash, seq, revoked}` map the listing renders is a
derived view of `module_events` — not a file, no atomic rename. Its client-facing
shape is unchanged from v2 §6.4/§6.6.

### 10.3 Unchanged schemas

`mlld-lock.json` (§6.2), the serialized ref (§6.7), the `VersionManifest`
(§6.5 — its `hash` is now also the registry blob digest, but the field and its
meaning are identical), and the catalog listing (§6.6) are **unchanged**. The
`resolved` URL in a lock entry is still
`https://<host>/@{author}/{pkg}/v/{version}.json`; nothing about the lock
mentions OCI.

### 10.4 OCI object shapes (the only net-new bytes-on-wire)

- **source blob**: the normalized module source; mediaType `application/vnd.mlld.source.v1`.
- **config blob**: the `VersionManifest` *metadata only* (no inline `mlld`):
  `version, hash, access, author, source, needs, imports`. mediaType
  `application/vnd.mlld.version.v1+json`.
- **manifest**: standard OCI image manifest with `config` = config blob and one
  `layers` entry = source blob. mediaType `application/vnd.oci.image.manifest.v1+json`.
- **(optional) package index** (`vnd.oci.image.index.v1+json`) pointing at every
  version manifest by digest — available if a single pull-for-whole-package
  ceremony is ever wanted; not required by anything here.

---

## 11. API surface

The v2 §7 routes and status semantics are **unchanged** — opgate fronts the same
JSON contract; the registry is behind it. The only addition is the registry's
own `/v2/` pull surface, which is *private* by default (OC-9): opgate (internal)
and, if ever exposed, ecosystem tooling speak the standard OCI Distribution API
(`blobs`, `manifests`, `tags/list`, `referrers`). No client code changes because
no client speaks `/v2/` in the default posture.

| Route | Posture | Status |
|-------|---------|--------|
| `GET /@{author}/{pkg}/v/{version}.json` | `public, max-age=31536000, immutable` | 200 · 404 · **410 + reason** (Dec-47) |
| `GET /@{author}/{pkg}.json` | revalidate | 200 · 404 |
| `POST` publish (authed) | n/a | 200 first / 200 no-op / 409 / 400 / 403 (Dec-26/23/48) |
| `GET /v2/…` (registry) | private by default | standard OCI Distribution responses |

---

## 12. Migration & phasing (only 0d and 0a change)

Dependency-correct order `0d → 0 → 0a → 0b → 0c → 1 → 2 → 3` is unchanged; the
**contents** of 0d and 0a are re-baselined. 0b/0c/1/2/3 are untouched.

### Phase 0d — ops + infra precondition (re-baselined)

- **Goal:** make the byte store servable in production.
- **Inputs:** Fly account, domain/TLS, the idle **Tigris bucket** and **Managed
  Postgres** already in the prod org (`fly.toml`), this plan.
- **Outputs:** a `zot` deployment (private Fly app, S3 = Tigris, bearer write
  creds held only by opgate); opgate's prod API promoted; the registry reachable
  from opgate over Fly's private network (not public); **no volume mount, no
  `min=max=1` hard pin** (OC-12). First pass runs one machine for cost, not
  correctness.
- **Acceptance/DoD:** a smoke publish lands a blob whose registry-reported digest
  equals `integrity` (I14); a smoke install fetches by digest; blobs survive a
  zot restart (state is in Tigris); opgate's Postgres carries the burn row.
- **Depends on / unblocks:** unblocks 0a; precondition of everything (§9 of v2).

### Phase 0a — server write path (re-baselined)

- **Goal:** normalize → upload → manifest PUT → ledger burn → tag, honoring the
  §7 status/idempotency contract.
- **Outputs:** the `module_events` table (reusing `PutArtifact`-law + `tape`
  ordering); the publish endpoint; `VersionManifest` assembly with immutable
  header; operator `revoke` → 410-with-reason, registry object untouched.
- **Acceptance/DoD:** the v2 §8 crash-window tests pass against the registry+ledger;
  retry-after-lost-ACK is a no-op; I2/I5/I8/I13/I14 hold.
- **Depends on / unblocks:** unblocks **0b**'s opgate integration and **1**.

### Phase 0 — spec

Same as v2 Phase 0, plus: the OCI layout appendix (§6), the OC-5 version-regex
pin, and the OC-4 slug tightening are written into `spec-opgate-api.yaml` too
(they are the only decisions touching the spec's validation table).

### Phases 0b, 0c, 1, 2, 3 — unchanged

0b (typed URL-only verifying client) and 0c (legacy-pins freeze) do not know the
substrate exists; 1 (re-publish) and 2 (github) and 3 (future s3) are additive,
and github bytes never enter the OCI store.

---

## 13. Risks register (the honest residual)

Same discipline as v2 §10: mitigation + owning decision + residual.

| Risk | Mitigation | Owning | Residual |
|------|-----------|--------|----------|
| Registry GC/delete reaps a claimed version | never DELETE, never untag, `deleteReferrers:false`; claimed versions keep their tag | OC-10, I13 | the byte store's lifecycle is now owned by zot+Tigris — a new system to guard *operationally*, where a filesystem was a given; the ledger mitigates (digest survives), it does not eliminate |
| Blob stores raw bytes → digest ≠ integrity | normalize-then-upload; registry `PUT ?digest=` refuses mismatch; test asserts equality | OC-7, I14 | a future contributor who stores raw bytes must be stopped by the contract, not by physics |
| `zot` is a new runtime dependency (vs "a directory + flock") | pin a max version; S3 backend means zot is stateless/replaceable; distribution is the fallback | OC-2 | more moving parts, more surface — accepted as the price of removing Dec-38 |
| Version label not tag-safe (new publishes) | reject at the edge (OC-5), 400 | OC-5 | legacy `registry`/`github` labels untouched; only new opgate labels hit OC-5 |
| Tag re-pointing by a stray registry-writer | registry write-closed to opgate; tag is *never* the authority, so even a re-point can't change a resolved pin | OC-8, OC-9 | a compromised opgate writer could rewrite tags and break *discovery*, but never a digested pin |
| OCI repo path collision | mapping is injective (drop leading `@`, lowercase); slug tightened so the mapping is total | OC-4 | none |
| The v2 audit-trail concern ("reconstruct from GC history") | the ledger (Postgres) IS the audit trail — we never reconstruct from registry history | OC-8, OC-14 | none (the concern is in the *other* direction: we don't need registry history at all) |

---

## 14. Open questions (this branch)

| # | Question | Why open | Owner | Decided by |
|---|----------|----------|-------|-----------|
| O1′ | `zot` public-read vs fully-private (the OC-9 Option A/B) | private = least surface, no `/v2/` ceremony; public-read = free `oras`/`docker` pulls + third-party mirrors | NLF | Phase 0d (it decides whether zot binds a public listener) |
| O2′ | Whether mirrors (Dec-51) may *also* be OCI pull refs | mirrors today are URL-typed but the lock field is the same either way; adding OCI mirrors is additive | NLF / mlld | post-Phase-1, if ever wanted |
| O3′ | The `actor`/`at` audit fields on `module_events` (same flag as v2 §6.3 "unspecified") | not a decision | opgate | Phase 0 |

Everything else that was open in v2 §11 (O2 dry-run, O3 collaborators, O4 cap
values, O5 freeze-set, O6 max-depth) is **unchanged** and still open.

---

## 15. Glossary (additions to v2 §12)

- **OCI registry / byte store** — the content-addressed store (`zot` + Tigris)
  holding blobs, manifests, and tags; *serves* bytes, holds no authority.
- **ledger** — opgate's Postgres record of `publish`/`revoke`; the burn and audit
  truth. The v2 word "events" now points here.
- **blob digest / `<SOURCE>`** — sha256 of the normalized module source; the same
  hex as the lock `integrity`.
- **manifest digest / `<DM>`** — sha256 of the OCI manifest; what the ledger
  records as the version's identity.
- **tag** — the `v{version}` alias pointing at `<DM>`; convenience only, never
  trusted.
- **burn** (re-mechanized) — the write-once `(repo, version) → <DM>` row; same
  as v2's definition, now in Postgres, not a JSONL line.
- **write-closed** — only opgate's service identity can mutate the registry.

Everything else (transport, resolved, integrity, mirror, rollup, revoke, etc.)
has the same meaning as v2 §12.

---

## Appendix — verified citations

| Claim | Location (VERIFIED) |
|-------|---------------------|
| opgate prod has an idle Managed Postgres + Tigris bucket | `opgate/fly.toml:1-10` |
| Append-only, ordered, idempotent event store; two lanes; server lane | `opgate/api/internal/core/tape/tape.go:146-465` |
| Write-once content-addressed artifacts; `ErrArtifactConflict` | `opgate/api/internal/core/store/store.go:473-516` |
| `events` / `artifacts` tables | `store.go:128-157` |
| The payload store's rows "go away" (prunable — *not* for registry bytes) | `opgate/api/internal/core/store/payloads.go:1-9` |
| `cacheImmutable = "max-age=31536000, immutable"`; `cacheRevalidate` | `opgate/api/internal/face/receipts/read.go:196`, `:211` |
| Staging runs one machine (`min_machines_running=1`), per-process rate limiters make a 2nd machine a loosening | `opgate/fly.staging.toml` |
| zot: GC on/off, `gcInterval`, `gcDelay`; retention `deleteUntagged` (default true), `deleteReferrers` (default false); untagged rejects under default GC | zotregistry.dev storage & retention docs (web-verified 2026-09) |