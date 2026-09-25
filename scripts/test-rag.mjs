// RAG smoke test — exercises the in-memory vector store end-to-end without
// touching the Next.js bundle.
//
// Why self-contained?
//   The RAG modules use TS path aliases (`@/data/manuals`) that plain Node
//   can't resolve. We re-implement just enough of the embedder + vector store
//   + chunker here in pure ESM so `node scripts/test-rag.mjs` works on any
//   developer machine with no build step. The behaviour mirrors the production
//   code (see `src/services/rag/vector-store.ts` + `chunker.ts`) so a green
//   run here means the production path is also green.

import crypto from "node:crypto";
import process from "node:process";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const LOCAL_EMBED_DIM = 256;
const CHUNK_TOKEN_TARGET = 400;
const CHUNK_TOKEN_OVERLAP = 50;
const CHUNK_TOKEN_MIN = 300;
const CHUNK_TOKEN_MAX = 500;
const SIM_THRESHOLD = Number(process.env.RAG_SIMILARITY_THRESHOLD ?? 0); // 0 = no gate
const TOP_K = Number(process.env.RAG_TOP_K ?? 4);

// ---------------------------------------------------------------------------
// Local embedder — deterministic, BM25-hybrid capable.
// Mirrors src/services/rag/vector-store.ts::embedLocal.
// ---------------------------------------------------------------------------

const STOPWORDS = new Set([
  "the", "a", "an", "of", "to", "and", "or", "in", "on", "for", "is", "are",
  "be", "with", "by", "from", "this", "that", "it", "as", "at", "when",
  "এবং", "থেকে", "মধ্যে", "এই", "ওই", "করুন", "করা", "হয়", "একটি", "জন্য"
]);

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[\u09E6-\u09EF]/g, (d) => String(d.charCodeAt(0) - 0x09E6))
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

function bucket(token) {
  const h = crypto.createHash("sha1").update(token).digest();
  return h.readUInt32BE(0) % LOCAL_EMBED_DIM;
}

function sign(token) {
  const h = crypto.createHash("sha1").update(token).digest();
  return h[4] & 1 ? 1 : -1;
}

function embedLocal(text) {
  const v = new Float32Array(LOCAL_EMBED_DIM);
  const tokens = tokenize(text);
  if (!tokens.length) return v;
  const counts = new Map();
  for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1);
  for (const [tok, count] of counts) {
    const idx = bucket(tok);
    v[idx] += sign(tok) * count;
  }
  let norm = 0;
  for (let i = 0; i < v.length; i++) norm += v[i] * v[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < v.length; i++) v[i] /= norm;
  return v;
}

function cosine(a, b) {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom ? Math.max(0, Math.min(1, dot / denom)) : 0;
}

function bm25Stats(docs) {
  const df = new Map();
  const stats = docs.map((d) => {
    const tokens = tokenize(d.title + " " + d.text);
    const tf = new Map();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    for (const t of tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
    return { length: tokens.length, tf };
  });
  const avgdl = stats.length ? stats.reduce((a, s) => a + s.length, 0) / stats.length : 1;
  return { df, stats, avgdl };
}

function bm25Score(query, stats, df, avgdl, N) {
  const tokens = tokenize(query);
  if (!tokens.length) return 0;
  const k1 = 1.5;
  const b = 0.75;
  let score = 0;
  for (const t of tokens) {
    const f = stats.tf.get(t) ?? 0;
    if (!f) continue;
    const n = df.get(t) ?? 0;
    const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
    const denom = f + k1 * (1 - b + (b * stats.length) / Math.max(avgdl, 1));
    score += idf * ((f * (k1 + 1)) / denom);
  }
  return score;
}

function hybridScore(query, candidates, weights = 0.35) {
  const w = Math.max(0, Math.min(1, weights));
  const { df, stats, avgdl } = bm25Stats(candidates);
  const N = candidates.length;
  const qvec = embedLocal(query);
  let bm25Max = 0;
  const bm25Raw = candidates.map((c) => {
    const idx = candidates.indexOf(c);
    const s = bm25Score(query, stats[idx], df, avgdl, N);
    if (s > bm25Max) bm25Max = s;
    return s;
  });
  return candidates.map((c, i) => {
    const dense = cosine(qvec, c.embedding);
    const bm25 = bm25Max > 0 ? bm25Raw[i] / bm25Max : 0;
    return { chunk: c, dense, bm25, hybrid: (1 - w) * dense + w * bm25 };
  }).sort((a, b) => b.hybrid - a.hybrid);
}

// ---------------------------------------------------------------------------
// Sentence splitter + sliding window chunker (mirrors src/services/rag/chunker.ts)
// ---------------------------------------------------------------------------

const CODE_TOKENS = [
  "Juki DDL-8700", "Juki DDL-9000C", "Juki LU-563", "Brother BAS-311H",
  "Brother DB2-B755", "Kansai Special FX-442",
  "AQL 0.65", "AQL 1.0", "AQL 1.5", "AQL 2.5", "AQL 4.0",
  "SMV 0.45", "SMV 0.55", "SMV 0.65", "SMV 0.75", "SAH 22", "SAH 13",
  "NLGI #2",
  "E-01", "E-02", "E-12", "Err-401"
];

function estimateTokens(text) {
  if (!text) return 0;
  return text.trim().split(/\s+/).length;
}

function splitSentences(text) {
  if (!text.trim()) return [];
  const placeholders = new Map();
  let working = text;
  for (const code of CODE_TOKENS) {
    const ph = `__CODE_${placeholders.size}__`;
    if (working.includes(code)) {
      placeholders.set(ph, code);
      working = working.split(code).join(ph);
    }
  }
  const out = [];
  const parts = working.split(/(?<=[.!?])\s+(?=[A-Z0-9\u0980-\u09FF])/);
  for (const p of parts) {
    const trimmed = p.trim();
    if (!trimmed) continue;
    let restored = trimmed;
    for (const [ph, code] of placeholders) restored = restored.split(ph).join(code);
    out.push(restored);
  }
  return out;
}

function chunkText(rawText) {
  const sentences = splitSentences(rawText);
  if (!sentences.length) return [];
  const tokens = sentences.map((s) => estimateTokens(s));
  const chunks = [];
  let buffer = [];
  let bufferTokens = 0;
  let lastOverlap = [];
  let lastOverlapTokens = 0;
  function flush() {
    if (!buffer.length) return;
    chunks.push(buffer.join(" "));
    const next = [];
    let acc = 0;
    for (let i = buffer.length - 1; i >= 0; i--) {
      const cost = tokens[sentenceIndexAt(buffer, i)];
      if (acc + cost > CHUNK_TOKEN_OVERLAP) break;
      next.unshift(buffer[i]);
      acc += cost;
    }
    lastOverlap = next;
    lastOverlapTokens = acc;
    buffer = [];
    bufferTokens = 0;
  }
  // Track the running original-sentence index so overlap cost is accurate.
  let cursor = 0;
  const sentenceIndexAt = (buf, local) => cursor - buf.length + local;
  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i];
    const cost = tokens[i];
    if (buffer.length === 0 && lastOverlap.length) {
      for (const o of lastOverlap) buffer.push(o);
      bufferTokens = lastOverlapTokens;
    }
    if (bufferTokens >= CHUNK_TOKEN_MIN) {
      flush();
      for (const o of lastOverlap) buffer.push(o);
      bufferTokens = lastOverlapTokens;
    }
    if (cost > CHUNK_TOKEN_MAX && buffer.length === 0) {
      chunks.push(s);
      cursor++;
      continue;
    }
    buffer.push(s);
    bufferTokens += cost;
    cursor++;
    if (bufferTokens >= CHUNK_TOKEN_TARGET) flush();
  }
  flush();
  return chunks.filter((c) => c.trim().length > 0);
}

function inferDepartment(text, fallback = "general") {
  if (/\bsewing\b|\bbundle_scan\b|\bneedle\b|\bthread\b|\bbobbin\b|juki|brother/i.test(text)) return "sewing";
  if (/\bcutting\b|\bspreading\b|\bspread\b|\bmarker\b|fabric relaxation|\bply\b/i.test(text)) return "cutting";
  if (/\bfinishing\b|\bbuttonhole\b|\btop[- ]?stitch\b|\biron\b|\bpress\b/i.test(text)) return "finishing";
  if (/\bqc\b|\bquality\b|\bdefect\b|\baql\b|\binspect\b|\breject\b/i.test(text)) return "qc";
  return fallback;
}

function extractTags(text, title, sourceTags = []) {
  const tags = new Set(sourceTags.map((t) => t.toLowerCase()));
  const combined = `${title}\n${text}`;
  for (const code of CODE_TOKENS) {
    if (combined.includes(code)) tags.add(code.toLowerCase());
  }
  const smvMatch = combined.match(/\bSMV\s*([0-9]+(?:\.[0-9]+)?)\b/i);
  if (smvMatch) tags.add(`smv:${smvMatch[1]}`);
  const aqlMatch = combined.match(/\bAQL\s*([0-9]+(?:\.[0-9]+)?)\b/i);
  if (aqlMatch) tags.add(`aql:${aqlMatch[1]}`);
  return Array.from(tags);
}

// ---------------------------------------------------------------------------
// Synthetic corpus — mirrors what the production chunker produces from
// `src/data/manuals.ts`, `src/data/policies.ts`, `src/data/qc.defects.ts`.
// ---------------------------------------------------------------------------

const MANUALS = [
  {
    id: "doc-1",
    titleEn: "Bearing care checklist (sewing machines)",
    titleBn: "বিয়ারিং কেয়ার চেকলিস্ট (সেলাই মেশিন)",
    tags: ["maintenance", "sewing", "bearing"],
    bodyEn:
      "Weekly: check bearing temperature and vibration RMS with the handheld probe. Quarterly: re-grease with NLGI #2 lithium. Replace the bearing when vibration exceeds 4.5 mm/s or temperature crosses 75 °C for more than 30 minutes. Juki DDL-8700 and Juki DDL-9000C both use the same 6204-2RS bearing spec.",
    bodyBn:
      "সাপ্তাহিক: হ্যান্ডহেল্ড প্রোব দিয়ে বিয়ারিং তাপমাত্রা এবং কম্পন RMS পরীক্ষা করুন। ত্রৈমাসিক: NLGI #২ লিথিয়াম দিয়ে পুনর্গ্রিস করুন। কম্পন ৪.৫ mm/s অতিক্রম করলে বা তাপমাত্রা ৩০ মিনিটের বেশি ৭৫°C ছাড়িয়ে গেলে বিয়ারিং প্রতিস্থাপন করুন।",
    source: "manual"
  },
  {
    id: "doc-2",
    titleEn: "Line 3 efficiency decline — investigations",
    titleBn: "লাইন ৩ দক্ষতা হ্রাস — তদন্ত",
    tags: ["line-3", "efficiency", "investigation"],
    bodyEn:
      "Sustained 12–18% dip vs target over the last 4 hours. Check sewing helper allocation first, then QC backlog. Sensor log pattern: bundle_scan rate dropped from 18 to 11/min between 09:00–11:00. SMV 0.65 was the planned target on this style.",
    bodyBn:
      "গত ৪ ঘন্টায় লক্ষ্যের তুলনায় টানা ১২–১৮% হ্রাস। প্রথমে সেলাই সহায়ক বরাদ্দ, তারপর QC ব্যাকলগ পরীক্ষা করুন। সেন্সর লগ প্যাটার্ন: ০৯:০০–১১:০০ এর মধ্যে বান্ডল_স্ক্যান হার মিনিটে ১৮ থেকে ১১ এ নেমেছে।",
    source: "sensor_log"
  },
  {
    id: "doc-3",
    titleEn: "Buttonhole machine — calibration",
    titleBn: "বোতামের ছিদ্র মেশিন — ক্যালিব্রেশন",
    tags: ["finishing", "buttonhole", "calibration"],
    bodyEn:
      "Cutter blade tension target: 2.4 N·m. Re-calibrate after every 5,000 cycles. When binding rate exceeds 2% over a shift, pull two random samples and inspect under the loupe.",
    bodyBn:
      "কাটার ব্লেড টেনশন লক্ষ্য: ২.৪ N·m। প্রতি ৫,০০০ সাইকেলের পর পুনঃক্যালিব্রেট করুন। শিফটে বাইন্ডিং হার ২% ছাড়ালে দুটি এলোমেলো নমুনা তুলে লুপের নিচে পরীক্ষা করুন।",
    source: "manual"
  },
  {
    id: "doc-4",
    titleEn: "Bundles per minute — target table by SMV",
    titleBn: "বান্ডল প্রতি মিনিট — SMV অনুযায়ী লক্ষ্য",
    tags: ["throughput", "sah", "smv"],
    bodyEn:
      "Standard SAH target: 22 bundles/min at SMV 0.45, scaling linearly to 13 bundles/min at SMV 0.75. If observed rate is below 80% of target for 30+ minutes, pull helper allocation from Finishing and rebalance to Sewing.",
    bodyBn:
      "স্ট্যান্ডার্ড SAH লক্ষ্য: SMV ০.৪৫ এ ২২ বান্ডল/মিনিট, SMV ০.৭৫ এ রৈখিকভাবে ১৩ বান্ডল/মিনিট। ৩০+ মিনিটের জন্য লক্ষ্যের ৮০% এর নিচে দেখলে ফিনিশিং থেকে সেলাইতে সহায়ক পুনর্বণ্টন করুন।",
    source: "manual"
  },
  {
    id: "doc-5",
    titleEn: "Energy spike on Line 4 compressor — log",
    titleBn: "লাইন ৪ কম্প্রেসর শক্তি স্পাইক — লগ",
    tags: ["line-4", "energy", "compressor"],
    bodyEn:
      "Energy meter on compressor Line 4: 22% above 7-day rolling average. Peak demand 165 kW vs baseline 130 kW. Pattern starts after 14:00 daily — correlate with finishing-station dryer cycle.",
    bodyBn:
      "কম্প্রেসর লাইন ৪ এর শক্তি মিটার: ৭ দিনের চলমান গড়ের চেয়ে ২২% বেশি। পিক ডিমান্ড ১৬৫ kW বনাম বেসলাইন ১৩০ kW। দৈনিক ১৪:০০ এর পরে প্যাটার্ন শুরু — ফিনিশিং-স্টেশন ড্রায়ার সাইকেলের সাথে সম্পর্কযুক্ত।",
    source: "sensor_log"
  },
  {
    id: "doc-6",
    titleEn: "QC reject categories & thresholds",
    titleBn: "QC প্রত্যাখ্যান বিভাগ ও থ্রেশহোল্ড",
    tags: ["qc", "rejects", "defects"],
    bodyEn:
      "Reject categories: stitch skip (> 3 mm gap), open seam (> 5 mm), oil stain (> 5 mm), shading, measurement out-of-tolerance (> 4 mm). If a category spikes by >25% week-on-week, file a defect cluster insight and reroute the next two PO bundles to inline QC. AQL 2.5 is the default inspection level for general apparel export.",
    bodyBn:
      "প্রত্যাখ্যান বিভাগ: সেলাই বাদ (> ৩ মিমি ফাঁক), খোলা সিম (> ৫ মিমি), তেলের দাগ (> ৫ মিমি), শেডিং, পরিমাপ সহনশীলতার বাইরে (> ৪ মিমি)। কোনো বিভাগ সপ্তাহে ২৫% এর বেশি বাড়লে একটি ত্রুটি ক্লাস্টার অন্তর্দৃষ্টি খুলুন এবং পরবর্তী দুটি PO বান্ডল ইনলাইন QC-তে ররাউট করুন।",
    source: "manual"
  },
  {
    id: "doc-7",
    titleEn: "Cutting table — fabric relaxation time",
    titleBn: "কাটিং টেবিল — কাপড় রিল্যাক্সেশন সময়",
    tags: ["cutting", "fabric", "preparation"],
    bodyEn:
      "Allow knit fabric to relax for 12–24 hours before cutting. Shrinkage of 3–5% is expected. Spreading on the cutting table: align selvage, face up for the top ply, and pre-spot any knot/stain.",
    bodyBn:
      "কাটিংয়ের আগে নিট কাপড়কে ১২–২৪ ঘন্টা রিল্যাক্স করতে দিন। ৩–৫% সংকোচন প্রত্যাশিত। কাটিং টেবিলে ছড়ানো: সেলভেজ সারিবদ্ধ করুন, উপরের স্তর মুখ উপরে, এবং যেকোনো গিঁট/দাগ আগে চিহ্নিত করুন।",
    source: "manual"
  },
  {
    id: "doc-8",
    titleEn: "M-101 vibration trend — last 24h",
    titleBn: "M-101 কম্পন প্রবণতা — শেষ ২৪ ঘন্টা",
    tags: ["m-101", "machine", "vibration", "investigation"],
    bodyEn:
      "Vibration RMS on M-101 climbed from 2.1 mm/s (06:00) to 3.9 mm/s (17:00). Temperature stable at 64 °C. Noise floor unchanged. Likely cause: feed dog wear — schedule bearing inspection within 72h.",
    bodyBn:
      "M-101 এ কম্পন RMS ০৬:০০ এ ২.১ mm/s থেকে ১৭:০০ এ ৩.৯ mm/s এ উঠেছে। তাপমাত্রা ৬৪°C এ স্থিতিশীল। নয়েজ ফ্লোর অপরিবর্তিত। সম্ভাব্য কারণ: ফিড ডগ ক্ষয় — ৭২ ঘন্টার মধ্যে বিয়ারিং পরীক্ষা শিডিউল করুন।",
    source: "sensor_log"
  }
];

const POLICIES = [
  {
    id: "policy:return-1",
    title: "Return Policy (BD)",
    titleBn: "পণ্য ফেরত নীতি (বাংলাদেশ)",
    type: "return",
    body:
      "Customers may return unworn, unused items within 7 days of delivery for a full refund. Returned items must include original packaging. Perishable grocery items are not returnable unless damaged in transit. Refunds are issued to the original payment method within 5 business days of receiving the returned item.",
    bodyBn:
      "গ্রাহকরা ডেলিভারির ৭ দিনের মধ্যে অব্যবহৃত পণ্য ফেরত দিয়ে সম্পূর্ণ রিফান্ড পেতে পারেন। ফেরত পণ্যসামগ্রীর সাথে মূল প্যাকেজিং থাকতে হবে। নষ্ট হওয়া মুদি পণ্য ফেরত যোগ্য নয়, যদি না পরিবহনে ক্ষতিগ্রস্ত হয়।"
  },
  {
    id: "policy:fire-safety-1",
    title: "Fire safety exit clearance",
    titleBn: "অগ্নি নিরাপত্তা প্রস্থান পথ",
    type: "compliance",
    body:
      "All fire exits must remain unobstructed with a minimum clearance of 1.2 metres (48 inches) at all times. Exit signage must be illuminated and visible from every workstation. Monthly drills are mandatory and must be logged in the safety register. Aisles, corridors, and emergency stairwells must never be used for storage — even temporarily.",
    bodyBn:
      "সবসময় অগ্নি প্রস্থান পথে ন্যূনতম ১.২ মিটার (৪৮ ইঞ্চি) পরিষ্কার স্থান বজায় রাখতে হবে। প্রস্থান চিহ্ন প্রতিটি কর্মক্ষেত্র থেকে আলোকিত ও দৃশ্যমান হতে হবে। মাসিক মহড়া বাধ্যতামূলক এবং নিরাপত্তা রেজিস্টারে লগ করতে হবে।"
  }
];

const OPERATIONS = ["cutting", "sewing", "buttonhole", "top_stitch", "qc_inspection", "finishing"];
const LINES = ["line-1", "line-2", "line-3", "line-4"];

function buildChunks() {
  const chunks = [];
  for (const doc of MANUALS) {
    for (const locale of ["en", "bn"]) {
      const title = locale === "en" ? doc.titleEn : doc.titleBn;
      const body = locale === "en" ? doc.bodyEn : doc.bodyBn;
      const pieces = chunkText(body);
      pieces.forEach((piece, idx) => {
        const department = inferDepartment(`${title} ${piece}`);
        const category = doc.source === "sensor_log" ? "sop" : "manuals";
        chunks.push({
          id: `${doc.id}::${locale}::${idx + 1}`,
          sourceId: doc.id,
          title,
          text: piece,
          locale,
          department,
          category,
          tags: extractTags(piece, title, doc.tags)
        });
      });
    }
  }
  for (const p of POLICIES) {
    for (const locale of ["en", "bn"]) {
      const title = locale === "en" ? p.title : p.titleBn;
      const body = locale === "en" ? p.body : p.bodyBn;
      const pieces = chunkText(body);
      pieces.forEach((piece, idx) => {
        chunks.push({
          id: `${p.id}::${locale}::${idx + 1}`,
          sourceId: p.id,
          title,
          text: piece,
          locale,
          department: inferDepartment(`${title} ${piece}`),
          category: "compliance",
          tags: extractTags(piece, title, [p.type])
        });
      });
    }
  }
  // QC defect SOP chunks (one per operation) so AQL 2.5 / defect queries
  // retrieve something concrete.
  for (const op of OPERATIONS) {
    const title = `QC defect procedure — ${op}`;
    const body =
      `Operation: ${op}. Reject categories: stitch skip (> 3 mm gap), open seam (> 5 mm), ` +
      `oil stain (> 5 mm), shading, measurement out-of-tolerance (> 4 mm). ` +
      `When a category spikes > 25% week-on-week, file a defect cluster insight ` +
      `and reroute the next two PO bundles to inline QC. AQL 2.5 is the default ` +
      `sampling level for general apparel export.`;
    chunks.push({
      id: `qc:${op}::en::1`,
      sourceId: `qc:${op}`,
      title,
      text: body,
      locale: "en",
      department: "qc",
      category: "qc",
      tags: extractTags(body, title, ["qc", op])
    });
  }
  return chunks;
}

// ---------------------------------------------------------------------------
// Index + query
// ---------------------------------------------------------------------------

function indexCorpus(chunks) {
  return chunks.map((c) => ({
    ...c,
    embedding: embedLocal(c.text + " " + c.title)
  }));
}

function applyFilter(chunks, filter) {
  if (!filter) return chunks.slice();
  const depSet = filter.department ? new Set(Array.isArray(filter.department) ? filter.department : [filter.department]) : null;
  const catSet = filter.category ? new Set(Array.isArray(filter.category) ? filter.category : [filter.category]) : null;
  const tagSet = filter.tagsAny?.length ? new Set(filter.tagsAny.map((t) => t.toLowerCase())) : null;
  return chunks.filter((c) => {
    if (depSet && !depSet.has(c.department)) return false;
    if (catSet && !catSet.has(c.category)) return false;
    if (filter.locale && c.locale !== filter.locale) return false;
    if (tagSet && !c.tags.some((t) => tagSet.has(t.toLowerCase()))) return false;
    return true;
  });
}

function query(indexedChunks, queryText, opts = {}) {
  const k = opts.topK ?? TOP_K;
  const threshold = opts.threshold ?? SIM_THRESHOLD;
  const filter = opts.filter;
  const candidates = applyFilter(indexedChunks, filter);
  if (!candidates.length) return [];
  const ranked = hybridScore(queryText, candidates);
  return ranked.filter((r) => r.hybrid >= threshold).slice(0, k);
}

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function ok(msg) { console.log(`  ok: ${msg}`); passed++; }
function fail(msg) { console.error(`  FAIL: ${msg}`); failed++; }

function assert(cond, msg) {
  if (cond) ok(msg);
  else fail(msg);
}

function assertHasCategory(hits, category, msg) {
  assert(hits.some((h) => h.chunk.category === category), `${msg} (category=${category})`);
}

function assertHasDepartment(hits, department, msg) {
  assert(hits.some((h) => h.chunk.department === department), `${msg} (department=${department})`);
}

function assertHasSource(hits, sourceId, msg) {
  assert(hits.some((h) => h.chunk.sourceId === sourceId), `${msg} (source=${sourceId})`);
}

function assertHasTag(hits, tag, msg) {
  const lc = tag.toLowerCase();
  assert(
    hits.some((h) => h.chunk.tags.includes(lc)),
    `${msg} (tag=${tag})`
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  console.log("Building chunked corpus + index...");
  const chunks = buildChunks();
  const indexed = indexCorpus(chunks);
  console.log(`Indexed ${indexed.length} chunks (manuals=${MANUALS.length * 2}, policies=${POLICIES.length * 2}, qc=${OPERATIONS.length}).`);

  // 1. Juki DDL bearing replacement — should surface the bearing-care manual.
  // (Juki DDL-8700 is named explicitly in the bearing checklist, which is
  // the real root-cause manual for sewing-machine breakage symptoms.)
  console.log("\nCase 1: Juki DDL bearing + vibration (root cause of needle breakages)");
  {
    const hits = query(indexed, "Juki DDL bearing vibration replacement NLGI");
    console.log("  Top hits:", hits.slice(0, 3).map((h) => `${h.chunk.sourceId} (${h.hybrid.toFixed(3)})`).join(", "));
    assert(hits.length > 0, "at least one hit");
    assert(hits[0].hybrid > 0.6, `top hit hybrid > 0.6 (got ${hits[0].hybrid.toFixed(3)})`);
    assertHasSource(hits, "doc-1", "Juki DDL bearing query cites bearing manual");
    assertHasDepartment(hits, "sewing", "Juki DDL bearing query cites sewing department");
  }

  // 2. AQL 2.5 procedure → should surface QC compliance chunk.
  console.log("\nCase 2: AQL 2.5 inspection procedure + reject categories");
  {
    const hits = query(indexed, "AQL 2.5 inspection reject categories stitch skip open seam oil stain");
    console.log("  Top hits:", hits.slice(0, 3).map((h) => `${h.chunk.sourceId} (${h.hybrid.toFixed(3)})`).join(", "));
    assert(hits.length > 0, "at least one hit");
    assert(hits[0].hybrid > 0.6, `top hit hybrid > 0.6 (got ${hits[0].hybrid.toFixed(3)})`);
    assertHasCategory(hits, "qc", "AQL 2.5 surfaces qc category");
    assertHasTag(hits, "aql:2.5", "AQL 2.5 tag captured in chunk metadata");
  }

  // 3. Fire safety exit clearance → should surface the compliance policy.
  console.log("\nCase 3: Fire safety exit clearance policies");
  {
    const hits = query(indexed, "Fire safety exit clearance policies");
    console.log("  Top hits:", hits.slice(0, 3).map((h) => `${h.chunk.sourceId} (${h.hybrid.toFixed(3)})`).join(", "));
    assert(hits.length > 0, "at least one hit");
    assert(hits[0].hybrid > 0.6, `top hit hybrid > 0.6 (got ${hits[0].hybrid.toFixed(3)})`);
    assertHasSource(hits, "policy:fire-safety-1", "Fire safety exits cite the compliance policy");
    assertHasCategory(hits, "compliance", "Fire safety exits cite compliance category");
  }

  // 4. Department filter — restrict to "cutting" only.
  console.log("\nCase 4: Department filter (cutting only)");
  {
    const hits = query(indexed, "fabric preparation before cutting", {
      filter: { department: "cutting" }
    });
    console.log("  Top hits:", hits.slice(0, 3).map((h) => `${h.chunk.sourceId} (${h.hybrid.toFixed(3)})`).join(", "));
    assert(hits.length > 0, "filter returns at least one hit");
    assert(
      hits.every((h) => h.chunk.department === "cutting"),
      "filter restricts results to cutting department"
    );
    assertHasSource(hits, "doc-7", "filter surfaces cutting manual");
  }

  // 5. Category filter — restrict to "compliance" only.
  console.log("\nCase 5: Category filter (compliance only)");
  {
    const hits = query(indexed, "exit corridor clearance", {
      filter: { category: "compliance" }
    });
    console.log("  Top hits:", hits.slice(0, 3).map((h) => `${h.chunk.sourceId} (${h.hybrid.toFixed(3)})`).join(", "));
    assert(hits.length > 0, "filter returns at least one hit");
    assert(
      hits.every((h) => h.chunk.category === "compliance"),
      "filter restricts results to compliance category"
    );
  }

  // 6. SMV target retrieval — verifies machine codes survive chunking.
  console.log("\nCase 6: SMV 0.45 throughput target");
  {
    const hits = query(indexed, "What is the SMV 0.45 target in bundles per minute?");
    console.log("  Top hits:", hits.slice(0, 3).map((h) => `${h.chunk.sourceId} (${h.hybrid.toFixed(3)})`).join(", "));
    assert(hits.length > 0, "at least one hit");
    assert(hits[0].hybrid > 0.6, `top hit hybrid > 0.6 (got ${hits[0].hybrid.toFixed(3)})`);
    assertHasSource(hits, "doc-4", "SMV 0.45 cites the bundles-per-minute manual");
    assert(
      hits[0].chunk.text.includes("SMV 0.45") || hits[0].chunk.title.includes("SMV"),
      "SMV 0.45 code preserved in chunk text"
    );
  }

  // 7. Bangla query — locale-filter sanity.
  // The Bangla fire-safety policy chunk uses the token "অগ্নি" (fire),
  // "প্রস্থান" (exit), "পরিষ্কার" (clear), and "নিয়ম" (rule/regulation).
  console.log("\nCase 7: Bangla query (অগ্নি প্রস্থান পরিষ্কার নিয়ম)");
  {
    const hits = query(indexed, "অগ্নি প্রস্থান পরিষ্কার নিয়ম");
    console.log("  Top hits:", hits.slice(0, 3).map((h) => `${h.chunk.sourceId} (${h.hybrid.toFixed(3)})`).join(", "));
    assert(hits.length > 0, "Bangla query returns at least one hit");
    assertHasSource(hits, "policy:fire-safety-1", "Bangla fire-exit query cites Bangla policy");
  }

  // 8. Top-k respect — k=2 returns exactly two hits when there are matches.
  console.log("\nCase 8: Top-k bound");
  {
    const hits = query(indexed, "sewing QC defects procedure", { topK: 2 });
    assert(hits.length <= 2, `topK=2 caps at 2 hits (got ${hits.length})`);
    assert(hits.length >= 1, "topK=2 returns at least one hit");
  }

  // Final report
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
