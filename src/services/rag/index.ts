// Public re-exports for the RAG module. The rest of the app should import
// from `./services/rag` rather than reaching into the individual files —
// keeps the surface area tidy and lets us refactor internals freely.

export {
  getVectorStore,
  pickEmbedder,
  localEmbedder,
  type RagChunk,
  type RagHit,
  type RagFilter,
  type RagDepartment,
  type RagCategory,
  type Embedder,
  type VectorStoreOptions
} from "./vector-store";

export {
  buildCorpus,
  chunkText,
  estimateTokens,
  type ChunkIngestReport
} from "./chunker";

export {
  ensureIndexed,
  reindex,
  autoIndexOnStartup,
  retrieve,
  retrieveAsEvidence,
  hitsToEvidenceRefs,
  lastIndexedAt,
  lastBuildReport
} from "./indexer";
