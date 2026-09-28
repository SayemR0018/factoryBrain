# FactoryBrain RAG — research + plan

Scope: a read-only audit of the current retrieval-augmented generation (RAG)
pipeline on both sides of the fence (Next.js client + ASP.NET Core API), with
gaps, a domain-aware chunking strategy, embedder options, schema impact, and an
ordered implementation plan for the next four commits (steps 45–48).

---

## 1. How retrieval works today (step by step)

There are two parallel RAG implementations in this repo. The Next.js side is
the production data plane used by `Ask BunonBrain`; the ASP.NET Core side is a
mirror seeded from `DbInitializer` so the backend exposes a matching `/api/ask`
surface. Both share the same logical shape — chunk → embed → hybrid score →
cite — but differ in chunker sophistication and BM25 fidelity.

### 1.1 Next.js pipeline (`src/services/rag/*`)

| Stage | File | Function | Behaviour |
|---|---|---|---|
| Chunk | `src/services/rag/chunker.ts` | `buildCorpus()` → `chunkText()` | Sentence-aware sliding window. Splits on `(?<=[.!?])\s+(?=[A-Z0-9\u0980-\u09FF])`, protects ~16 machine codes (`Juki DDL-8700`, `AQL 2.5`, `SMV 0.45`, `NLGI #2`, `E-01`, etc.) by placeholder-replace/restore. Target 400 tokens, overlap 50, soft band 300–500. A sentence larger than `MAX` is emitted standalone so a code reference is never lost. |
| Ingest | `chunker.ts` | `extractTags()`, `inferDepartment()` | Tags pull from `CODE_TOKENS` + regex captures for `smv:X` / `aql:X`. Department inferred via four regex buckets (sewing / cutting / finishing / qc). |
| Index | `src/services/rag/vector-store.ts` | `VectorStore.upsertBatch()` | Embeds every chunk's `text` once via the configured embedder, stores in an in-memory `IndexedChunk[]`, persists to `.cache/rag-index.json` so the index survives restarts. |
| Score | `vector-store.ts` | `query()` → `cosine()` + `bm25Score()` + `Hybrid()` | True BM25 with corpus `df`, `avgdl`, `k1=1.5`, `b=0.75`. Final = `(1-w)·cosine + w·bm25` with `w=0.35` (env `RAG_BM25_WEIGHT`). `topK=4`, `threshold=0`. |
| Embed | `vector-store.ts` | `pickEmbedder()` | Local `local-bm25` (signed-feature hash, 256-dim) by default; OpenAI `text-embedding-3-small` (1536) or `text-embedding-3-large` (3072); Voyage `voyage-2` (1024). Selected by `EMBEDDING_PROVIDER` + `EMBEDDING_API_KEY` + `EMBEDDING_MODEL`. |
| Cite | `src/services/rag/indexer.ts` | `hitsToEvidenceRefs()` | Deduplicates hits by `sourceId`, groups per domain (`manuals` \| `policies`), emits `EvidenceRefPublic[]` = `{ domain, count, previewIds, filter: { department } }`. |
| Render | `src/components/evidence/EvidenceBlock.tsx` | `EvidenceBlock` | Renders grouped list of evidence refs; expanded view calls `evidenceService.rows(ref, ...)` which switches on `ref.domain` (`orders`, `inventory`, `customers`, `products`, `conversations`, `policies`, `suppliers`, `manuals`) and returns columns + rows for that domain. |

### 1.2 ASP.NET Core pipeline (`FactoryBrain.Api/Services/Rag/*`)

| Stage | File | Behaviour |
|---|---|---|
| Chunk | `TextChunker.cs` | Naive 250-char sliding window with 50-char overlap. **No sentence awareness, no machine-code protection.** Will split `Juki DDL-8700` cleanly because of whitespace, but `E-12` glued to a sentence is safe only by luck. |
| Embed | `EmbeddingService.cs` | `MD5`-bucketed token-frequency embedder, dimension configurable via `Rag:EmbeddingDimensions` (default 384), L2-normalised. Deterministic — same input → same vector. |
| Score | `HybridScorer.cs` | Cosine over the dense vectors + a *toy* BM25 (`sum(tf/(tf+1.2))` divided by term count, clamped to [0,1]). **No `df`, no `avgdl`, no IDF.** |
| Retrieve | `RagService.RetrieveAsync()` | Loads all chunks from Postgres (`document_chunks`), applies department/category filter, scores every chunk in process, sorts by `hybrid = 0.35·bm25 + 0.65·cosine`, takes topK. Snippet = first 240 chars of chunk text. |
| Cite | `RagService` returns `AskRagHit(...)` | Shape: `Id, SourceId, Title, Department, Category, Tags, HybridScore, DenseScore, Bm25Score, Snippet`. |
| Seed | `DbInitializer.cs::SeedManualsAsync()` | Inserts 8 manuals × 2 locales + 2 policies into `manual_documents` + `document_chunks` via `IRagService.ChunkAsync()`. |
| Controller | `AskController.cs::Post()` | Forwards to `IAskService.AskAsync(body, ct)`. |

### 1.3 End-to-end (one query)

1. UI posts `AskRequest { Query, AgentId, Filter }` to `/api/ask`.
2. `AskService` calls the Next.js RAG layer (the authoritative path) — `retrieveAsEvidence(query, opts)` → `retrieve()` → `ensureIndexed()` (one-shot corpus build) → `vectorStore.query()`.
3. Hits are deduped by `sourceId`, grouped by domain → `EvidenceRefPublic[]`.
4. `AskService` packages `EvidenceRefPublic[]` plus the `Finding` text and the Bangla translation into `AskAnswerResponse`.
5. `EvidenceBlock` renders the grouped list and lazily expands each ref into a domain-specific table from `evidenceService.rows(...)`.

---

## 2. Gaps

### 2.1 "Semantic" score is really word overlap

`EmbeddingService.Embed()` is a deterministic hash bucket: each token is hashed
into one of `dim` bins via `MD5`, the bin is incremented, then the vector is
L2-normalised. Two texts are "close" in cosine iff they share a bag of tokens
that hash into overlapping bins — which is essentially term-overlap with some
hash collisions folded in. There is no learned semantic representation, so
paraphrase queries ("needle breakage" vs "needle snap") collapse to the BM25
channel.

The Next.js `localEmbedder` uses **signed feature hashing** (`+1`/`-1` per
token via `sign(tok)`), which is slightly better than the C# bucket impl — it
unbiases bucket collisions — but still purely lexical.

### 2.2 No Bangla tokenisation in BM25

`HybridScorer.TermFreq()` tokenises with `' ', ',', '.', ';', ':', '(', ')', '/', '"'`. Bangla
script (U+0980–U+09FF) has no whitespace word boundaries for many constructs,
and the comma-of-equivalent `।` (U+09E1, U+0964) is missing from the splitter.
So `সেলাই বাদ` may stay attached to the next token and never match a query.

The Next.js tokenizer does handle Bangla digits (`\u09E6-\u09EF` → 0-9) and
removes punctuation, but again no real Bangla segmentation.

### 2.3 No score cutoff

Both retrievers call `.Where(hybrid >= similarityThreshold)` with default
`threshold = 0`. A query that hits nothing still returns the top-K with low
hybrid scores, and the LLM has to learn to ignore them. We should ship a
defaulted-but-configurable minimum (e.g. `RAG_MIN_HYBRID = 0.10`) and surface
"No matching manual found" when nothing clears it.

### 2.4 Citation-shape mismatch with `EvidenceBlock`

The brief mentions `EvidenceBlock` expecting `{ id, title, snippet,
confidence, source, url }`. The actual contract is different on both sides:

- **Next.js** (`EvidenceBlock.tsx` line 10): takes
  `EvidenceRefPublic[] = { domain, count, previewIds, filter }`. Domain
  expands lazily through `evidenceService.rows(ref)` — there is **no inline
  snippet**, no per-hit confidence, no per-hit URL. `previewIds` is used only
  to filter the manuals list inside `evidenceService.rows()`.
- **ASP.NET Core** (`AskRagHit`): returns per-hit `id`, `sourceId`, `title`,
  `tags`, `hybridScore`, `denseScore`, `bm25Score`, `snippet` (240-char
  prefix). These are not piped into `EvidenceBlock` at all today.

Net effect: the ASP.NET path is producing rich per-hit citation data the UI
never sees, and the UI's `EvidenceBlock` expects a domain-grouped card view
that the API does not produce. Aligning them is a real contract change:
either (a) extend `EvidenceRefPublic` with a `hits: AskRagHit[]`-shaped
embedded snippet list, or (b) keep the current grouping and additionally
render a `Citations` list of `{title, snippet, score}` rows.

### 2.5 Other gaps worth flagging

- **Corpus size**: 8 manuals × 2 locales + 2 policies × 2 + 6 QC ops × 1 = ~30 chunks. Trivially small — any meaningful test of retrieval quality needs an order of magnitude more.
- **C# `ChunkAsync` is sync-after-yield**: the await on `Task.Yield()` is just to release the sync context; embedding happens on the thread-pool synchronously inside a request scope. With a hosted embedder this becomes blocking I/O on a request thread.
- **No reindex trigger from seed data**: `SeedManualsAsync` runs once (`if (await db.ManualDocuments.AnyAsync(ct)) return;`). If you change the chunker or embedder you must drop the table or call the (not-yet-wired) `ReindexAsync()`.
- **`ReindexAsync` rewrites every embedding in place** even when the embedder is unchanged — fine for the local hash, expensive against a hosted embedder.
- **`PickEmbedder` (Next.js) returns a *new* embedder per call site only at boot**. At runtime, swapping `EMBEDDING_API_KEY` does nothing until process restart.

---

## 3. Chunking strategy for machinery manuals + SOPs

### 3.1 Rules

1. **Never split an error code from its fix.** Detect patterns like
   `E-NN`, `Err-NNN`, `ALARM`, `FAULT` followed by its cause + remedy within
   ±2 sentences. Keep that block atomic even if it pushes the chunk past
   `MAX`.
2. **Keep AQL table rows together.** When the body contains an AQL table
   (`AQL 2.5`, `AQL 1.5`, etc., on adjacent lines or within the same bullet
   group), keep all rows in one chunk. Detection: consecutive lines all
   matching `/^AQL\s*\d+(\.\d+)?/` or a Markdown table header immediately
   preceding AQL rows.
3. **Keep SMV / DHU / AQL definitions with the numeric spec.** Treat
   `SMV X.YX`, `DHU X.X`, `SAH NN`, `NLGI #N` as a single glued phrase — never
   split mid-spec. Achieved by always replacing these with a sentinel before
   splitting, then restoring on flush.
4. **Keep needle specs together.** `needle 134`, `needle DBx1`, `Nm 70`,
   `Nm 90`, etc. Live in their own sentence; never merge them into a generic
   sentence. Already implicit in the existing `CODE_TOKENS` set; extend it to
   include `Nm 60`, `Nm 70`, `Nm 80`, `Nm 90`, `DBx1`, `134`, `134-35`.
5. **Prefer a structured-document splitter when present.** If the source is
   Markdown (headings `#`/`##`/`###`, bullets `-`, numbered lists `1.`),
   split on heading boundaries first, then on bullet boundaries, then fall
   back to the sentence splitter. This keeps SOP sections intact.
6. **Title bleed**: prepend `${doc.title}` to the first chunk of each
   document so queries that match the title (e.g. "bearing checklist")
   still hit when the body doesn't repeat it.

### 3.2 Target sizes

- **Target**: 400 tokens (≈1,800 chars English, ≈2,400 chars Bangla).
- **Overlap**: 60 tokens (~15%) — slightly higher than current 50 because
  Bangla chunks lose more context per cut.
- **Soft min / max**: 300 / 550 tokens. Hard cap 700 tokens (any single
  sentence that exceeds this is emitted as its own chunk so codes survive).
- **Section quota**: at most 1 heading per chunk to avoid two unrelated
  procedures merging.

### 3.3 Implementation sketch

Extend `chunker.ts` (and port to `TextChunker.cs`) with:

- An expanded `CODE_TOKENS` list (AQL levels, SMV, SAH, NLGI, machine models, needle specs, error codes, defect thresholds).
- A `protectPhrases(text)` / `restorePhrases(text)` pair used by the sentence splitter.
- A Markdown-aware pre-pass: split on `^#{1,3}\s` first; for each section run the existing `chunkText`; emit one chunk per section, then merge short sections up to `MIN`.
- An "atomic-error" detector: a regex + adjacency scan over sentence boundaries that, when it finds an error code + remedy pair, emits them as a single chunk even if oversized.

---

## 4. Embedding options

| Provider | Model | Dimensions | API key required | Cost note |
|---|---|---|---|---|
| **Local hash (current)** | `local-bm25` (signed feature hash) / C# `EmbeddingService` (MD5 bucket) | 256 (Next.js) / 384 (C#) | No | Free, deterministic. Quality ceiling = bag-of-tokens overlap with hash-collision noise. |
| **OpenAI** | `text-embedding-3-small` | 1536 | `OPENAI_API_KEY` (via `EMBEDDING_API_KEY`) | $0.02 / 1M tokens (~50k chunks ≈ a few cents per reindex). Best price/quality for English; Bangla quality is acceptable but not best-in-class. |
| **OpenAI** | `text-embedding-3-large` | 3072 | same | $0.13 / 1M tokens. ~3× retrieval quality on English benchmarks; Bangla parity unclear. |
| **Voyage AI** | `voyage-3` (recommended) | 1024 | `EMBEDDING_API_KEY` (provider `voyage`) | $0.06 / 1M tokens. Strong on technical/industrial text; good Bangla support. |
| **Google Gemini** | `text-embedding-004` | 768 | `GOOGLE_API_KEY` (not currently wired into `pickEmbedder`) | Free tier (1k req/min); paid ~$0.025 / 1M chars. Multilingual by design (trained on 100+ languages incl. Bangla). |

### Recommendation

- **Default for production**: **OpenAI `text-embedding-3-small` (1536-d)**.
  Cheap, stable, well-documented, and the 1536-d vector fits comfortably in
  `pgvector` with `halfvec` storage if needed. Bangla quality is "good enough"
  for the demo corpus; pair it with the strong BM25 channel and the hybrid
  rerank masks any Bangla weakness.
- **If Bangla quality matters more than price**: switch to **Gemini
  `text-embedding-004` (768-d)**. Native multilingual training, smaller
  vector, free tier covers a demo reindex many times over. Requires wiring
  the Google provider into `pickEmbedder()`.
- **Fallback / offline dev**: keep the local hash embedder exactly as today.
  No key, deterministic, perfect for `scripts/test-rag.mjs` and CI.
- **Avoid `text-embedding-3-large`** for the demo — the quality delta vs
  `3-small` does not justify 6.5× the cost at this corpus size.

---

## 5. Schema impact

### 5.1 Current state

- `document_chunks.Embedding` is hard-coded as `vector(384)` in
  `ManualDocumentConfiguration.cs::DocumentChunkConfiguration` (line 29).
- `FactoryBrain.Api/Data/` contains **no `Migrations/` folder**.
- `Program.cs:145` calls `db.Database.EnsureCreated()` — i.e. the app boots
  by *creating the schema from the model* if it does not yet exist, then
  `CREATE EXTENSION IF NOT EXISTS vector;`.
- `Program.cs:71` does configure `MigrationsHistoryTable("__ef_migrations")`,
  signalling that migrations are *intended* in production but not currently
  used in this repo.
- The 384 default matches the C# `EmbeddingService` default (`Rag:EmbeddingDimensions`).
- No model has been generated, no `__EFMigrationsHistory` rows exist, no
  migration files exist.

### 5.2 Problem

If we swap to an OpenAI 1536-d embedder (or any other dim ≠ 384), `EnsureCreated`
will not alter the existing column — the schema stays at `vector(384)` and
the embedder either writes the wrong-size vector (pgvector throws) or is
silently truncated. Worse: a developer who drops a single chunk and lets
`EnsureCreated` recreate the table will silently lose every chunk's
embedding.

### 5.3 Safest path to a configurable dimension + reindex

1. **Stop using `EnsureCreated` for the RAG tables.** Add the first EF
   migration explicitly:
   ```bash
   dotnet ef migrations add Init \
     --project FactoryBrain.Api \
     --output-dir Data/Migrations
   ```
2. **Generate a second migration** that:
   - drops the existing `vector(384)` column;
   - re-creates it as `vector(1536)` (or whatever dim the configured
     embedder reports at boot);
   - sets the dim at migration time from configuration rather than hard-coded.
3. **Make the embedder the source of truth for dimension.** Read
   `Rag:EmbeddingDimensions` (or the embedder provider's `dim`) once at
   startup, and have the migration / reindex flow read it. Store it on
   `DocumentChunk` as a non-mapped runtime property if convenient.
4. **Reindex runs as a one-shot console command** (`dotnet run -- reindex`)
   rather than from inside `DbInitializer`. It re-embeds every chunk with
   the active embedder and updates the column. Idempotent — safe to re-run.
5. **Keep `EnsureCreated` only for the *non-RAG* tables** in dev, or guard
   it behind `if (app.Environment.IsDevelopment() && db.Database.GetMigrations().Any() == false)`.
   This avoids the silent-wipe footgun while letting first-run contributors
   still get a usable schema.

The net change in this repo: introduce the `Migrations/` folder, generate one
init migration, stop calling `EnsureCreated` for `document_chunks`, and add a
`reindex` CLI sub-command that re-embeds with the configured provider.

---

## 6. Ordered implementation plan (steps 45–48)

Four commit-sized steps, ordered so each is independently shippable and the
previous step's tests stay green.

### Step 45 — `docs(rag): research + plan` (this commit)

- Add `docs/rag-research.md`. No code changes.

### Step 46 — `feat(rag): domain-aware chunker`

- Extend `src/services/rag/chunker.ts` with:
  - expanded `CODE_TOKENS` (AQL, SMV, NLGI, needle specs, error codes);
  - `protectPhrases` / `restorePhrases` helpers used by the sentence splitter;
  - a Markdown-aware pre-pass (`#`/`##`/`###` headings);
  - an "atomic error block" detector that emits code+cause+remedy as one chunk;
  - title bleed (`${doc.title}` prefix on first chunk of each document).
- Port the same rules into `FactoryBrain.Api/Services/Rag/TextChunker.cs`
  so both sides stay aligned.
- Update `scripts/test-rag.mjs` with two new assertions: (a) Bangla query
  with error code in body still surfaces the correct chunk, (b) an AQL
  table chunk keeps all rows in one piece.
- Leave `EmbeddingService` and `HybridScorer` untouched so retrieval quality
  is comparable before/after.

### Step 47 — `feat(rag): configurable embedder + score cutoff`

- Add a `Rag:EmbeddingProvider` config key to `appsettings.json`:
  `local | openai | voyage | gemini`.
- Introduce an `IEmbedder` factory in `Services/Rag/` (mirrors `pickEmbedder()`
  on the Next.js side) that resolves at runtime; dimensions flow from the
  provider, not from config.
- Wire `GeminiEmbeddingService` (new) using `text-embedding-004` (768-d) with
  `GOOGLE_API_KEY`.
- Add `Rag:MinHybridScore` config (default `0.10`) and apply it inside
  `RetrieveAsync`. When nothing clears it, return `Array.Empty<AskRagHit>()`
  and let `AskService` surface "No matching manual found".
- Add a `POST /api/rag/reindex` admin endpoint that calls the existing
  `RagService.ReindexAsync()`. Keep it gated to admin role.
- Smoke-test: with no API keys, the local hash path still works and is
  byte-identical to today. With OpenAI key, reindex writes 1536-d vectors.

### Step 48 — `feat(rag): align citation shape with EvidenceBlock`

- Extend `EvidenceRefPublic` (`src/services/types.ts`) with an optional
  `hits?: Array<{ title: string; snippet: string; score: number; url?: string }>`.
- In `src/services/rag/indexer.ts::hitsToEvidenceRefs()`, include the top 3
  hits per domain (already known at this point) so the UI can render an
  inline snippet list without a second round-trip.
- In `EvidenceBlock.tsx`, render a "Citations" list under each expanded
  domain row — `${title} · score=${score.toFixed(2)}` plus the 240-char
  snippet. Keep the existing domain-table expand behaviour so nothing
  existing breaks.
- In the ASP.NET path, surface `AskRagHit[]` (already returned) as a
  `ragHits` field on `AskAnswerResponse` (already there) and copy it into
  the same `hits` slot when the Next.js side is bypassed.
- Update `src/components/ask/EvidenceBlock.stories.tsx` (if present) and
  the Ask page to render the new snippet list.
- Add a smoke test that a query returning `EvidenceRefPublic[]` with
  `hits.length >= 1` per ref renders without throwing.

Each step keeps `scripts/test-rag.mjs` green and leaves `EnsureCreated` as
the dev fallback until a future step introduces real migrations (covered in
section 5 above).

---

## Known limitations

- In degraded mode (`/api/rag/status` reports `degraded=true` because the
  configured hosted provider is missing its API key or its embedding call
  fails), `/api/ask` returns `denseScore = 0` for every hit and the results
  are BM25-only ranking.
- With Gemini and no key, `GET /api/rag/status` leaves out `lastProbeAt`
  and `lastProbeOk`.
- The startup warning in the Gemini-with-no-key case prints a stack trace.
  It never includes the key.
- The `.env.local` reload only happens in Development and only overwrites
  variables still in the file. Deleting `RAG_EMBEDDING_FAKE_FAIL` leaves
  the old value in place, so set it to `false` instead of deleting the line.
- Databases upgraded from a legacy build keep their original 9 chunks per
  document; the new domain-aware chunker does not retroactively re-chunk
  existing rows. To repopulate with the new chunker, delete the affected
  rows from `manual_documents` and re-ingest them via `POST /api/rag/ingest`.
  `POST /api/rag/reindex` only re-embeds the chunks it finds and never
  re-splits the text.
- The Next.js RAG services under `src/services/rag/*` are now a legacy
  offline-only fallback. The ASP.NET Core pipeline
  (`FactoryBrain.Api/Services/Rag/*`) is the authoritative `/api/ask`
  retrieval path. The TypeScript files are preserved for offline tooling
  and local demos; no live route imports them. Header banners in each
  file document the same.
- On a fresh database with a non-local provider, the 8 base seed documents
  are stamped local/384 and aren't realigned until the next reindex,
  though pendingCount flags them.
