# The mlld Registry on an OCI byte store — technical explanation

> **Technical companion to `docs/plan-mlld-registry-oci.md` (the OCI branch).**
> The OCI plan is **PROPOSED** — it answers the open substrate question `O1`
> and is **awaiting NLF's ruling**. This file renders that proposal for an
> engineering reader — no narrative, just mechanism and consequences. It is
> **not authority**: the OCI plan is authority for this branch's OC-1..14, and
> `plan-mlld-registry-v2.md` is authority for every substrate-agnostic fact
> (the 51 locked decisions, the lock/ref schemas, the transports, ownership,
> the legacy freeze). Where unsure, the source's exact wording wins.
>
> The OCI-specific decisions are numbered **OC-1..14**, exactly as the source
> plan does — they are *proposals this branch requires*, not NLF rulings
> (which is exactly why they are not Dec-52+).

---

## 0. Core model

**The component set (one line each).** The v2 component set is unchanged, plus four
components introduced by the OCI substrate:

| Component | Role |
|-----------|------|
| **opgate** | the public HTTP surface: auth, membership, cache posture, and record-keeping |
| **the Postgres ledger** | the append-only event/record store (plays the `events.jsonl` role from the file world) |
| **the OCI registry (`zot`)** | a content-addressed blob/manifest store; S3 backend |
| **the Tigris S3 bucket** | the physical byte backend (Fly's S3-compatible object store) |
| **a blob** | an immutable, content-addressed byte object (address = digest) |
| **a manifest** | the OCI manifest referencing the blobs of one artifact |
| **a config blob** | the version metadata (who, what, which version) |
| **a tag** | a mutable, alias-only pointer to a manifest digest — never trusted |
| **the cache (`~/.llm/cache`)** | the client's local, content-addressed store |
| **`mlld-lock.json`** | the client's lockfile |
| **integrity** | the normalized sha256 of the module source (computed, never copied) |
| **transport** | a typed adapter ID (never a URI scheme) |
| **binding ("burn")** | write-once version-label binding at append |
| **revoke** | operator stop-serving event (410 Gone; the record is kept) |
| **mirrors** | untrusted fetch hints, verified after the fetch |
| **the legacy catalog** | frozen metadata (`modules.json` + `legacy-pins.json`) |
| **`@mlld/std/*`** | reserved embedded-stdlib prefix |

**The one-line spine (unchanged from v2):** source names a module; the lock
maps *name → typed transport + real URL + integrity*; install is *fetch +
verify + record around a URL*; the registry is *append-only events with
derived, seq-stamped rollups*.

**The one thing that changes:** *where the bytes live*. The bytes and the
immutable version docs move from a Fly volume's file tree into an **OCI
registry** (a content-addressed blob store). *Where the truth lives* does
**not** change in kind: an **append-only ledger** — now opgate's **Postgres**,
which already runs an append-only event tape and a write-once
content-addressed artifact store.

**The key equivalence:** **the OCI blob digest *is* the `integrity`.** opgate
normalizes the source *once* at ingest; those *same* bytes become the blob;
the registry re-checks the digest on upload. The blob's digest and the
lockfile's integrity are **the same value**.

**Topology:**

```
             ┌──────────────────────────┐
             │   opgate — HTTP surface   │  same JSON routes, same cache posture
             │  (auth, membership)       │
             └───────┬────────────┬─────┘
                     │ reads      │ writes (the ONLY writer)
                     ▼            ▼
   ┌──────────────────────┐  ┌────────────────────────┐
   │  Postgres ledger      │  │  zot → Tigris S3       │
   │  module_events        │  │  blobs, manifests,     │
   │  (binding, seq,       ├─▶│  tags                  │
   │   revoke, digest)     │  │                        │
   └──────────────────────┘  └────────────────────────┘
        "records / truth"          "served bytes"
```

---

## 1. What problem does this branch answer?

v2 already designed the *registry* (names, URLs, transports, fingerprints,
ownership, the legacy freeze). One thing it explicitly left **open** — `O1`:
*where do the bytes and the immutable version docs physically live?* Two
candidate answers were on the table: **files + `flock` + `events.jsonl`** on a
Fly volume, versus an **OCI-style byte store**.

This branch **chooses OCI**, and the deciding fact is an operational one,
**VERIFIED in `opgate/fly.toml:1-10`**: production already runs an **idle
Managed Postgres cluster and an idle Tigris bucket** "for the day that
changes." Choosing OCI therefore *changes fewer things* than attaching a
volume does — most of the infrastructure is already provisioned.

---

## 2. The three stores

The whole branch is one split: **records** live in the ledger, **bytes** live
in the byte store, and opgate is the **front door** between them.

```
   ┌───────────────────────────────────────────────────────────────────┐
   │                        opgate (HTTP surface)                      │
   │                                                                   │
   │   the SAME JSON routes as before                                  │
   │   (auth, membership, cacheImmutable headers)                      │
   │                                                                   │
   │        reads (both stores)            writes (the only writer)    │
   │            │                              │                       │
   └────────────┼──────────────────────────────┼───────────────────────┘
                ▼                              ▼
   ┌─────────────────────────┐   ┌─────────────────────────────────────┐
   │  Postgres ledger         │   │  zot + Tigris (the byte store)      │
   │  (existing)              │   │  (the new surface)                  │
   │                         │   │                                     │
   │  append-only events:    │   │  zot = content-addressed registry;  │
   │    publish / revoke     │──▶│  Tigris = S3 object backend         │
   │  write-once name→digest │   │                                     │
   │  seq                    │   │  blobs (digest-addressed),          │
   │                         │   │  manifests, tags                     │
   │  the binding + the      │   │  write-CLOSED: only opgate writes   │
   │   audit trail live HERE │   │                                     │
   │  nothing deletes        │   │                                     │
   └─────────────────────────┘   └─────────────────────────────────────┘
        "records / truth"                "served bytes / convenience"
```

Three points to internalize:

- **The ledger is the only authority for truth.** The binding, the sequence
  number, the digest, and the revoke all live in Postgres — *not* in the
  registry. The ledger is **never reconstructed** from the registry's
  garbage-collection behavior.
- **The byte store holds no authority.** It serves *content-addressed*
  immutable bytes, fast and cacheable — and it is **write-closed**: only
  opgate's service identity may PUT; delete/untag/GC-of-claimed-objects is
  ruled out by policy (OC-10).
- **This is reuse, not re-invention.** opgate already ships an append-only
  tape (`tape.Append`, idempotent by `(session_id, seq)`, with
  `ErrSeqGap`/`ErrConflict`) and a write-once artifact store
  (`store.PutArtifact` + `ErrArtifactConflict` — the same write-once law).
  The branch reuses those two primitives to implement the one new table
  (OC-14).

What becomes **obsolete** wholesale: `flock`, the atomic-rename rollup, the
"rollup claims seq M but omits an event ≤ M" corruption class, and the
`min=max=1` single-machine pin. Removed, not re-implemented.

---

## 3. The key equivalence: blob digest = integrity

In the *file* world there was always the possibility of two different
numbers: the hash opgate wrote down, and the hash the bytes actually carry.
OCI collapses that possibility because **a blob's address *is* its hash.**

```
   opgate normalizes the source ONCE at ingest (Dec-7/41)
        │
        ▼
   normalized bytes (N bytes)  ────────────┐
        │                                  │
        │   integrity = sha256:<SOURCE>    │  THE SAME hex
        ▼                                  │
   upload the blob, addressed by          ◄─┘
   sha256:<SOURCE>; the registry
   RE-computes and REFUSES a mismatch
        │
        ▼
   THREE parties assert the SAME hex:
      opgate   computes it (normalize once)
      registry verifies it (PUT ?digest=)
      client   re-verifies it (hashNormalized)
   → one rule, one hash, no second digest
```

The v2 concern — "is the `contentHash` stored raw while the resolver compares
*normalized*?" — cannot arise here: only **normalized** bytes ever enter the
store, and the registry's `PUT ?digest=` check makes it a **third,
independent verifier** (OC-7).

---

## 4. The object graph — one published version

```
   OCI repository: author/module            (zot, backed by Tigris)

     blob   sha256:<SOURCE>   vnd.mlld.source.v1          ← the NORMALIZED source
            ── this digest IS the integrity ────────────────────────────┐
     blob   sha256:<CONFIG>   vnd.mlld.version.v1+json                  │
            {version, hash:<SOURCE>, access, author, source,             │
             needs, imports}        ← the metadata, points at the source│
     manifest sha256:<DM>     vnd.oci.image.manifest.v1+json            │
            config:  {digest:<CONFIG>, size}                            │
            layers: [{digest:<SOURCE>, size}]  ──────────────────────────┘
     tag     v1.2.3  ────────►  sha256:<DM>      ← alias only

   Postgres ledger: author/module            (opgate's existing DB)

     module_events:  seq | type(publish|revoke) | version | digest(<DM>)
                     | reason | at
                     ▲ the BINDING lives HERE, not in the tag
```

- **One hash answer.** `<SOURCE>` is sha256 over the **normalized** source
  bytes, and the config's `hash` field is `<SOURCE>` too. "stored == served ==
  hashed" is asserted by three independent parties.
- **The manifest is the version's root object** — the OCI-world counterpart of
  v2's immutable `/v/{version}.json`. Its digest `<DM>` is what the ledger
  records.
- **The tag is a convenience alias.** It exists so `oras`/`docker` can *name*
  a version. The ledger **never trusts it**.

---

## 5. The 14 OCI decisions

The register lives in §4 of the source. Semantics are the source's, not
re-worded.

| # | Decision |
|---|----------|
| **OC-1** | Substrate = **OCI byte store + opgate Postgres ledger**. Registry stores bytes; ledger records truth; opgate fronts. |
| **OC-2** | Registry = **`zot`** (single static binary; S3 backend; htpasswd/bearer/OIDC auth). CNCF `distribution` is the fallback; **Harbor ruled out** (Postgres+Redis+k8s-shaped); Docker Hub/GHCR/Cloudflare R2 ruled out (no reason to host bytes off-Fly). |
| **OC-3** | Byte backend = **`Tigris`** (Fly's S3-compatible store, zero egress) — the bucket already exists, idle, in production (`fly.toml`). |
| **OC-4** | OCI repo mapping **`@author/module` → `author/module`** (drop the single leading `@`; canonical-lowercase per Dec-9). Slug validation tightened to OCI grammar so the mapping is total. |
| **OC-5** | Version label = OCI-tag-safe `[A-Za-z0-9][A-Za-z0-9._-]{0,127}`; registry tag = `v{version}`. |
| **OC-6** | Media types: source blob `application/vnd.mlld.source.v1`; config blob `application/vnd.mlld.version.v1+json`; manifest `application/vnd.oci.image.manifest.v1+json`; optional package index `application/vnd.oci.image.index.v1+json`. |
| **OC-7** | **Normalize-at-ingest ⇒ blob digest == integrity.** Store only normalized bytes; the registry's `PUT ?digest=` verification is the *third* verifier (opgate, client, registry). One rule (Dec-7/41), one hash. |
| **OC-8** | **Binding = the ledger's `publish` row** (write-once via `PutArtifact`-law). The OCI tag is a *derived alias*, never the authority. Event-anchored (Dec-26): 409 only when a ledger row exists with a different digest. |
| **OC-9** | Registry is **write-closed**: only opgate's service identity writes; anonymous public read flows through opgate's front door (zot **not** public-facing by default). OCI pull (`oras`/`docker`) is an additive later ceremony by flipping read exposure. |
| **OC-10** | **"Nothing deletes" re-mechanized**: opgate never issues `DELETE`, never untags, `deleteReferrers:false`. GC may collect **only unclaimed orphans** (unburned/untagged); a bound/revoked version keeps its tag → survives. The Postgres ledger is the audit truth even if a byte were ever reclaimed. |
| **OC-11** | **Seq/rollup = a Postgres read model.** The v2 file-gap staleness protocol (I5) is *retired*; staleness = ordinary DB snapshot, and (per Dec-17) affects only the listing, never a pin. |
| **OC-12** | **Dec-38 (exactly-1-machine) relaxed.** The single-writer invariant becomes "one registry-writer service account"; zot+DDB-less S3 and Postgres are multi-writer-safe, so opgate may scale to N. |
| **OC-13** | **Install ceremony unchanged.** `GET /{author}/{pkg}/v/{version}.json` assembles the v2 §6.5 `VersionManifest` from ledger+registry; lock / ref / Dec-50 untouched. OCI pull is additive only. |
| **OC-14** | **Ledger implemented by reuse, not invention**: publish-binding = `PutArtifact` write-once law; revoke = `tape.AppendServer` (server-lane event). One new table, two existing primitives. |

---

## 6. What changes vs the file world (and what doesn't)

Only **substrate-specific** decisions are re-baselined. "Re-mechanized" =
*same semantics, new mechanism*. The ten that move:

```
   v2 file world                                     this branch (OCI)
   ─────────────                                    ────────────────────

   Dec-3  binding = append event to file  ──►   binding = publish ROW in the ledger
   Dec-4  events → rollup under flock     ──►   events → read model, Postgres tx
                                               (flock REMOVED)
   Dec-8  idempotency vs the events       ──►   same, vs the ledger row
   Dec-17 seq-staleness tail-diff         ──►   read-your-writes snapshot
                                               (listing-only; simplified)
   Dec-26 event-anchored 409              ──►   ledger-row-anchored 409
   Dec-32 O(1) version→seq index          ──►   embedded in the read model
   Dec-35 attach a Fly volume mount       ──►   zot + the idle Tigris bucket
                                               (REPLACED)
   Dec-38 exactly-1 machine               ──►   one registry-writer account;
                                               opgate scales to N (RELAXED)
   Dec-40 version map in rollup,          ──►   one DB transaction writes binding
          one atomic rename                    row + map together (no rename)
   Dec-47 operator revoke, 410+reason    ──►   same; revoke = ledger event,
                                               registry object untouched
```

Everything else — **Dec-1, 2, 5, 6, 7, 9–16, 18–25, 27–31, 33, 36, 37, 39,
41–46, 48–51** — is **unchanged, wholesale**: the entire client, lockfile, ref,
`VersionManifest`, transport, ownership/auth, normalization, and legacy-catalog
surface carry over by reference.

---

## 7. Publish — how a version gets bound (the new mechanics)

The client's contract is byte-for-byte the v2 §7 table (200 first / 200 no-op /
409 burned / 400 / 403 / 410 on read). Only the *server's* steps change:

```
 1  client → opgate :  { metadata, source, version, hashN? }   (hashN advisory)
 2  opgate            :  lowercase + slug/version check + membership + size caps
 3  opgate            :  normalize source ONCE → N bytes → integrity = sha256:<SOURCE>
 4  opgate → registry :  HEAD blob/{integrity}; absent →
                         POST blobs/uploads/?digest=sha256:<SOURCE>
                         ── registry RE-checks the digest (refuse on mismatch)
 5  opgate            :  upload config blob → digest <CONFIG>
 6  opgate            :  build manifest → PUT manifests/<DM>
 7  opgate → ledger   :  ★ THE BINDING ★  write (repo, version, <DM>) write-once:
                         absent              → row lands   → 200 (first publish)
                         present, same <DM>  → no-op       → 200 (idempotent)
                         present, diff <DM>  → conflict    → 409 (BURNED)
 8  opgate → registry :  PUT manifests/v{version}  (point the tag at <DM>)
                         ── derived, idempotent
 9  opgate → client   :  200 / 200 / 409 / 400 / 403     (Dec-26/23/48 contract)
```

Note the ordering: bytes go to the registry **first**, the binding is written
to the ledger **second**, and the tag is placed **last**.

---

## 8. Crash safety — state at each failure point

Every v2 §8 answer survives, re-told for the new machinery:

```
  step of §7            what's left if interrupted        why retry is safe
  ──────────────────    ──────────────────────────────    ─────────────────────────
  (4) blob uploaded,    an UNCLAIMED blob                 re-upload is idempotent
      manifest not      (digest-addressed)                (digest already exists);
      written                                             unclaimed blobs are GC-able
  (6) manifest PUT      manifest filed, no binding        still UNCLAIMED → a retry
      done, binding not written                           (even with DIFFERENT bytes)
      written                                             is a first-publish, not a burn
  (7) binding written,  the ledger has the binding; the   the tag is DERIVED → opgate
      tag not set       tag missing                       re-derives it from the ledger;
                                                          pins resolve by digest,
                                                          never the tag
  (9) ack lost after    the binding is durable; client    re-publish → same <DM> →
      binding           saw nothing                       no-op 200 (no false 409)
```

The one subtlety worth naming: **"unclaimed" is a precise term.** An uploaded
blob with no manifest, or a manifest with no ledger row, is an *orphan* — and
therefore the *only* thing GC may ever collect (OC-10). The moment the ledger
binds a version (`<DM>` in a `publish` row), that object is **claimed
forever**, its tag stays put, and GC is forbidden to collect it (I13).

**Staleness of the read model (Dec-4/17/40, OC-11):** the listing is a
Postgres read. A slightly-behind replica shows a slightly-behind *listing* —
cosmetic, and only for the browse surface. A pinned install resolves
`(author,module,version) → <DM>` from the ledger and fetches by **digest**:
exact by construction, independent of listing freshness.

---

## 9. Invariants — the re-mechanized must-never rules

v2 §5 holds, with three rows re-mechanized and one added:

```
  I2  ─ silent version-label overwrite
       OLD: binding = file write-once    NEW: binding = ledger write-once ROW
       (same digest no-op, diff digest conflict); tag never the authority
  I5  ─ stale rollup producing wrong answers
       OLD: file-gap staleness          NEW: Postgres read model
       installs resolve by digest (exact); listing lags are cosmetic
  I8  ─ two writers corrupting the ledger
       OLD: exactly-1 machine           NEW: one registry-writer account
       (opgate's service identity) + Postgres transactional uniqueness
  I13 ─ (NEW) a GC/delete reaping a CLAIMED version
       never DELETE; never untag; deleteReferrers:false; a claimed version
       keeps its tag forever → not "untagged" → GC leaves it; the ledger
       still records the digest as the audit backstop            (OC-10)
  I14 ─ (NEW) blob digest ≠ integrity (raw bytes stored)
       normalize BEFORE upload; store only normalized bytes; registry
       PUT ?digest= refuses a mismatch; a test asserts the equality (OC-7)
```

---

## 10. Read / install — unchanged at the client

```
  GET /{author}/{pkg}/v/{version}.json     (immutable, Dec-6/24, OC-13)

    opgate:  ledger lookup (repo, version) → {<DM>, seq, revoked?}
               absent  → 404
               revoked → 410 Gone + reason                    (Dec-47)
    opgate → registry:
               GET manifests/<DM>        → the manifest
               GET blobs/<CONFIG>        → the config (metadata)
               GET blobs/<SOURCE>        → the source bytes (digest == integrity)
    opgate:  assert config.hash == <SOURCE> == layer digest   (defense in depth)
             assemble the v2 §6.5 VersionManifest (with inline mlld) and serve
             Cache-Control: public, max-age=31536000, immutable
```

The **client's** ceremony is identical to v2: fetch once,
`hashNormalized(bytes) == integrity` (Dec-41), store under
`cache/sha256/<hex>/`, write the lock entry, update the nested-by-transport
index. The offline Rust runtime is untouched.

`GET /{author}/{pkg}.json` (the mutable listing) becomes a ledger query —
`versions[]` (the derived view), `latest` (display label), live
`installs/stars/ratings`, `current_access` — served with `cacheRevalidate`.

**OCI pull is additive, never required** (OC-13): if the read surface is ever
exposed (OC-9), `oras pull`/`docker pull` against the repo returns *the same
immutable objects* — the source blob's digest is the integrity, the manifest
digest is the ledger's `<DM>`. A second, optional ceremony for ecosystem
tooling; no change to the lock format, refs, or `mlld install`.

---

## 11. Phasing — only two phases change their contents

The dependency-correct order `0d → 0 → 0a → 0b → 0c → 1 → 2 → 3` is
**unchanged**; only the *contents* of `0d` and `0a` are re-baselined.

```
  Phase 0d  (ops/infra)   stand up zot + point at the idle Tigris bucket
                          (no volume mount, no min=max=1 hard pin). DoD: a smoke
                          publish lands a blob whose registry-reported digest
                          equals integrity (I14); blobs survive a zot restart
                          (state lives in Tigris); Postgres carries the binding row.
  Phase 0a  (write path)  normalize → upload → manifest → BIND → tag, honoring
                          the §7 status/idempotency contract. DoD: v2 §8
                          crash-window tests pass against registry+ledger;
                          lost-ACK retry is a no-op; I2/I5/I8/I13/I14 hold.
  Phase 0   (spec)        as v2, plus the OCI layout (§6), the OC-5 version-regex
                          pin, and the OC-4 slug tightening written into
                          spec-opgate-api.yaml (the only decisions touching the
                          spec's validation table).
  0b / 0c / 1 / 2 / 3     UNCHANGED — 0b (typed URL-only client) and 0c
                          (legacy-pins freeze) don't know the substrate exists;
                          1 (re-publish) and 2 (github) are additive, and github
                          bytes never enter the OCI store.
```

---

## 12. Residual risks

```
  RISK                                     MITIGATION                            RESIDUAL
  ────                                     ───────────                            ────────
  GC/delete reaps a claimed version        never DELETE/untag; keep the tag       the byte store's lifecycle is now
                                           (OC-10, I13)                           zot+Tigris's to guard — a NEW system to
                                                                                  operate, where a filesystem was a given;
                                                                                  the ledger mitigates, doesn't eliminate
  blob stores raw bytes → digest≠integrity normalize-then-upload; PUT ?digest=    a future contributor who stores raw bytes
                                           refuses; test asserts equality         must be stopped by the CONTRACT, not by
                                           (OC-7, I14)                            physics
  zot is a new runtime dependency          pin a max version; stateless            more moving parts, more surface —
                                           (backend is S3); distribution the      accepted as the price of removing Dec-38
                                           fallback (OC-2)
  version label not tag-safe               reject at the edge, 400 (OC-5)         only NEW opgate labels; legacy github/
                                                                                  registry labels are untouched
  tag re-pointed by a stray writer         registry write-closed; tag is never    a COMPROMISED opgate writer could rewrite
                                           the authority, so a re-point can't     tags and break DISCOVERY — but never a
                                           change a resolved pin (OC-8, OC-9)     digested pin
  OCI repo path collision                  mapping injective (drop @, lowercase); none
                                           slug tightened to be total (OC-4)
  "reconstruct from GC history" audit      the Postgres ledger IS the audit       none — we don't need registry history at all
  trail concern                            trail (OC-8, OC-14)
```

---

## 13. What stays open (this branch's three questions)

| # | Question | Why open | Settled by |
|---|----------|----------|------------|
| **O1′** | `zot` public-read vs fully-private (the OC-9 Option A/B) | private = least surface; public-read = free `oras`/`docker` pulls + third-party mirrors | Phase 0d |
| **O2′** | may mirrors (Dec-51) *also* be OCI pull refs? | mirrors are URL-typed and the lock field is the same either way; adding OCI mirrors is additive | post-Phase-1 |
| **O3′** | the `actor`/`at` audit fields on `module_events` | same "unspecified, not a decision" flag as v2 §6.3 | Phase 0 |

Everything else open in v2 §11 (O2 dry-run, O3 collaborators, O4 cap values,
O5 freeze-set, O6 max-depth) is **unchanged and still open**.

---

## 14. One-line cheat sheet

```
  Question answered   O1 — where bytes live → an OCI byte store (not files+flock)
  One thing changes   WHERE bytes and version docs live; truth stays an append-only ledger
  Truth               Postgres ledger (append-only events = records)
  Bytes               zot + Tigris — content-addressed, write-closed
  Key equivalence     blob digest == integrity (normalize once; registry = 3rd verifier)
  Binding             the ledger publish ROW (write-once), not the tag
  Tag                 a derived alias — never trusted
  Install             UNCHANGED — GET /v/{version}.json assembles the VersionManifest
  Removed             flock, atomic-rename rollup, min=max=1 machine pin
  New invariants      I13 (GC never reaps claimed), I14 (digest == integrity, tested)
  Status              PROPOSED — answers O1, awaiting NLF's ruling (OC-1..14)
```