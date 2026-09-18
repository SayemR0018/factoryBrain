# Company Brain Page — Core Functionality Spec

Extracted from `/src/app/app/brain/page.tsx` (`BrainPage` / `BrainInner`) of the
Thalamus project. **Design excluded** — only behavior, data flow, layout
algorithm, and integrations with other pages are documented. The new project
must provide its own UI / visualization library.

---

## 1. Purpose

The Company Brain page visualizes what the system has learned about the
business as an **interactive node-edge graph**: products, customers,
suppliers, policies, workflows, goals, and risks. Users can filter by
entity kind, search by label, hover to inspect, click to open a detail
panel, and follow connections.

It is the deepest read-only inspection surface in the app and is
typically reached from the command palette or the navigation rail.

---

## 2. Page structure (logical, not visual)

The page is composed of three areas inside a full-height flex container:

| Area | Width | Purpose |
| --- | --- | --- |
| Filter rail | 224 px (`w-56`), hidden below `md` | Toggle which entity kinds are shown, with per-kind counts. |
| Canvas | flexible | The node-edge graph (React Flow). |
| Detail panel | 384 px (`w-96`), animated slide-in | Selected node's metadata, neighbors, and evidence. |

Outer wrapper is marked `data-tour="brain"` for the onboarding tour.

---

## 3. Lifecycle & state

| State | Type | Purpose |
| --- | --- | --- |
| `filters` | `Set<BrainEntityPublic["kind"]>` | Active kind filters. Empty = show all. |
| `selectedId` | `string \| null` | Currently selected node (drives detail panel). |
| `hoveredId` | `string \| null` | Currently hovered node (drives dim/highlight). |
| `query` | `string` | Search-by-label overlay. |
| `frozen` | `boolean` | When `true`, `nodesDraggable={false}` (layout frozen). |
| `nodeParam` | from `useSearchParams().get("node")` | Deep-link entry from the command palette. |

The component is wrapped in `ReactFlowProvider` so that `useReactFlow()`
is available for programmatic viewport control (`fitView`).

No tick loop — the brain is read-only; nothing on this page mutates data.

---

## 4. Data sources

### 4.1 `brainService.getGraph({ kinds })`

Returns a `BrainGraph`:

```
{
  nodes: BrainEntityPublic[],
  edges: BrainEdgePublic[]
}
```

Filtering rules:

- If `kinds` is non-empty, keep only nodes whose `kind` is in the set.
- Edges are kept only if both endpoints remain after the node filter.

The page calls this with `kinds: Array.from(filters)` (kind filter applied
**first**), then applies the search-query overlay locally on top.

### 4.2 `brainService.getEntity(id)`

Returns a single `BrainEntityPublic | undefined`. Used for:

- Resolving `?node=<id>` deep links.
- Resolving the currently hovered entity for the floating hover card.

### 4.3 `brainService.getNeighbors(id)`

Returns `BrainEntityPublic[]` — every node connected to `id` by any edge,
in either direction. Used to populate the "Connected" chip list in the
detail panel.

### 4.4 `evidenceService.rows(ref, page=0, pageSize=8)`

The detail panel passes a synthetic `EvidenceRefPublic`:

```
{
  domain: entityToDomain(selected.kind),
  count: 1,
  previewIds: [selected.id]
}
```

Mapping (from `entityToDomain`):

| Entity kind | Domain |
| --- | --- |
| `product` | `products` |
| `customer` | `customers` |
| `supplier` | `suppliers` |
| `policy` | `policies` |
| `workflow` | `orders` |
| `goal` | `orders` |
| `risk` | `orders` |

The EvidenceBlock renders up to 8 source rows for that domain.

---

## 5. Search & filter pipeline

```
brainService.getGraph({ kinds: Array.from(filters) })   // kind filter
  → graph
  → if query.trim():
       nodes = nodes where label OR labelBn includes query (case-insensitive)
       edges = edges where source OR target is in matched node set
  → filteredGraph
```

Empty query → graph passes through unchanged.

---

## 6. Layout algorithm (pure, no UI lib)

`layoutGraph(nodes, edges)` produces `{ nodes: Node[], edges: Edge[] }` for
React Flow. The algorithm is **radial, kind-bucketed**:

1. Group nodes into `kindBuckets` keyed by `kind`.
2. Process kinds in this order, each on a different ring:
   `risk → goal → workflow → policy → supplier → customer → product`
3. Ring radii:
   `risk: 80, goal: 140, workflow: 200, policy: 260, supplier: 320, customer: 380, product: 440`
4. Each kind's nodes are placed evenly around its ring centered at
   `(700, 460)` using `(cos(angle), sin(angle)) * radius`.
5. After each ring is placed, `angle += Math.PI / 6` to skew the next ring.
6. Edges are deduped by `source→target` key and only kept if both endpoints
   are present in the laid-out node set. Stroke width = `1 + round(weight * 1.5)`.
   `strong` edges get a `className: "strong"`.

Node `data` payload:
```
{ kind, label, weight }
```
Weight is used by `EntityNode` to scale the node visual (factor
`0.75 + weight * 0.75`, range 0.75×–1.5×). The new project can
disregard the visual scaling but must preserve `weight` on the data.

---

## 7. Interaction behaviors

### 7.1 Node click

Sets `selectedId = node.id`. Detail panel slides in with metadata, neighbors,
and evidence.

### 7.2 Node hover (mouse enter / leave)

Sets / clears `hoveredId`. While a node is hovered:

- Floating hover card (top-right of canvas) shows: icon, label (locale-aware),
  kind, top-3 meta entries, and the connection count.
- Unrelated nodes/edges are **dimmed** to opacity 0.18 (nodes) / 0.1 (edges).
- The hovered node and its direct neighbors keep full opacity.

The dim set is computed as: `{ hoveredId } ∪ { all direct neighbors }`.

### 7.3 Neighbor click (in detail panel)

`onClick` of a neighbor chip:
1. `setSelectedId(neighbor.id)` — updates detail panel.
2. `rf.fitView({ nodes: [{ id }], duration: 500, padding: 0.4 })` — recenters.

### 7.4 Search input

Plain text input, debounced only by React's natural render cycle. Updates
`query` state which re-derives `filteredGraph` → layout.

### 7.5 Kind filter (rail buttons)

`toggleKind(k)` adds/removes the kind from the `filters` set. The chip's
dot indicator lights up using the kind's color (from `KIND_META`) when
active. Each chip shows the live count of that kind in the **unsearched**
graph (so search doesn't make counts vanish).

### 7.6 Freeze layout toggle

Single button in the toolbar. Toggles `frozen`. When `true`:

- React Flow `nodesDraggable={false}` (can't drag nodes around).
- A pill-shaped "Layout frozen" indicator appears top-left of the canvas.

### 7.7 Fit-to-screen button

`rf.fitView({ duration: 400, padding: 0.2 })`.

### 7.8 Close detail

`selectedId = null` → detail panel slides out.

---

## 8. Deep-link behavior (`?node=<id>`)

When the URL contains `?node=<id>` (typically from the command palette):

1. Look up the entity. If missing, do nothing.
2. Ensure its kind is in `filters` (add it if absent — without removing other filters).
3. `setSelectedId(nodeParam)`.
4. After 280 ms (let the layout settle):
   - `rf.fitView({ nodes: [{ id: nodeParam }], duration: 600, padding: 0.4 })`.
   - Add CSS class `brain-node-focus` to the matching DOM node (managed in CSS,
     not specified here) for 2400 ms to draw attention.
5. Effect re-runs only when `nodeParam` changes.

---

## 9. Canvas configuration (React Flow)

| Option | Value | Reason |
| --- | --- | --- |
| `fitView` | true | Initial framing. |
| `proOptions.hideAttribution` | true | Branding removed. |
| `minZoom` / `maxZoom` | 0.2 / 2.5 | Reasonable bounds. |
| `nodesDraggable` | `!frozen` | Free editing by default. |
| `elementsSelectable` | true | Needed for click handlers. |
| `panOnDrag` / `zoomOnScroll` / `zoomOnPinch` | true | Standard canvas controls. |
| Controls position | bottom-right, `showInteractive={false}` | Standard zoom controls only. |
| MiniMap | pannable + zoomable, `maskColor: rgba(0,0,0,0.4)`, `nodeStrokeWidth: 2`, `nodeColor` keyed off `kind` | Mini-overview of all nodes. |

`Background` is drawn at 20 px gap with a low-opacity stroke.

The new project is free to swap libraries but must keep these interaction
semantics (zoom range, pan, drag, mini-map, dim-on-hover, fit-view).

---

## 10. Entity-kind metadata (`KIND_META`)

Static map of per-kind visual identity. The new project can ignore the
visual specifics but **must keep the kind taxonomy** (the seven kinds are
referenced by the service, dataset, and detail mapping):

| Kind | Icon family | Role |
| --- | --- | --- |
| `product` | package | Things you sell. |
| `customer` | users | Buyer segments / individuals. |
| `supplier` | truck | Vendors. |
| `policy` | file-text | Business rules / SOPs. |
| `workflow` | workflow | Recurring processes. |
| `goal` | target | Business goals / KPIs. |
| `risk` | alert-triangle | Identified risks (e.g., stockout, churn). |

---

## 11. Cross-page integration map

| Trigger | Target | Param |
| --- | --- | --- |
| Command palette → "Open in Brain" | `/app/brain` | `?node=<entityId>` |
| In-app deep link | `/app/brain` | `?node=<entityId>` (handled by §8) |

The Brain page does not send outbound links in the current implementation
(neighbors are in-app selections). The detail panel does surface
evidence, which in other pages is linkable.

---

## 12. State mutations triggered here

**None.** This page is strictly read-only. It does not write to any store,
does not call any mutation service, and does not affect onboarding flags.

---

## 13. Dependencies the new project must replicate

### Services

```ts
brainService.getGraph(opts?: { kinds?, query? }): BrainGraph
brainService.getEntity(id: string): BrainEntityPublic | undefined
brainService.getNeighbors(id: string): BrainEntityPublic[]
evidenceService.rows(ref: EvidenceRefPublic, page=0, pageSize=8): EvidenceRows
```

### Type contracts (from `src/services/types.ts`)

```
BrainGraph        = { nodes: BrainEntityPublic[]; edges: BrainEdgePublic[] }
BrainEntityPublic = {
  id, kind: "product"|"customer"|"supplier"|"policy"|"workflow"|"goal"|"risk",
  label, labelBn, weight?, meta?: Record<string, string|number>
}
BrainEdgePublic   = { id, source, target, weight, strong?, label? }
EvidenceRefPublic = { domain, count, filter?, previewIds? }
EvidenceRows      = { domain, columns: string[], rows: Array<Record<string, any>> }
```

### Helpers

- `useT()` → `{ t(key, params?), locale: "en" | "bn" }`.
- `useSearchParams()` for the `node` query param.
- `useReactFlow()` for `fitView({ nodes, duration, padding })`.

### Component contracts the page relies on

- `Panel`, `Input`, `Tooltip` — generic UI primitives.
- `EvidenceBlock({ refs: EvidenceRefPublic[] })` — expandable evidence card.

### i18n keys consumed

`brain.*`:

- `title`, `subtitle`, `legend`, `filter`, `searchPlaceholder`, `fit`,
  `neighbors`, `connections`.
- `entity.<kind>` for each of the seven kinds.
- `detailTitle`, `viewSources`, `zoomIn`, `zoomOut`, `isolate`,
  `clearFocus`, `facts` (defined but not all used on this page; reserved
  for future variants).

---

## 14. What the new project must implement

1. A page route at the equivalent of `/app/brain` that mounts the
   three-area layout (filter rail + canvas + detail panel).
2. The graph services in §13 with identical contracts.
3. The radial kind-bucketed layout algorithm in §6 (or an equivalent
   visualization that preserves hover-dim, neighbor-highlight, and
   fit-to-node behavior).
4. The search-pipeline in §5: kind filter first, then query overlay.
5. The deep-link handler in §8 (`?node=<id>`).
6. The seven-kind taxonomy and the `entityToDomain` mapping in §4.4.
7. Locale-aware labels (`label` vs `labelBn`) and counts per kind.
8. The freeze-layout toggle (or an equivalent anti-drag mode).
9. Locale-aware i18n keys listed in §13.

What the new project owns:

- Graph-rendering library (React Flow can be replaced by Cytoscape, d3,
  Sigma, etc., as long as the interaction semantics are preserved).
- Visual styling of nodes, edges, mini-map, controls.
- Specific color/icon choices per kind.
- Any extra animations / transitions.

No CSS, color tokens, fonts, or layout from this project should be
carried over — the new project owns its own design.
