// Lesson 27 - Indexer Query Layer
//
// The app can only build correct transactions if its read path finds live cells
// and revalidates them before broadcast. This exercise models cursor
// pagination, stale candidates, full-node live-cell checks, and fallback RPC
// verification without making any network calls.

type Script = {
  codeHash: string;
  hashType: "type" | "data" | "data1";
  args: string;
};

type LiveCell = {
  outPoint: string;
  projectId: string;
  kind: "project" | "milestone" | "receipt" | "treasury";
  lock: Script;
  type?: Script;
  capacity: bigint;
  live: boolean;
  indexedAtTip: number;
};

type IndexerPage<T> = {
  objects: T[];
  cursor: string | null;
  source: "indexer" | "rpc-fallback";
  staleCandidates: T[];
};

type RevalidationResult = {
  liveCells: LiveCell[];
  staleCells: LiveCell[];
  source: "full-node-rpc";
};

const CURRENT_TIP = 220;

const projectLock: Script = {
  codeHash: "project-lock",
  hashType: "type",
  args: "launch-0x42",
};

const indexedCells: LiveCell[] = [
  {
    outPoint: "tx-project:0",
    projectId: "launch-0x42",
    kind: "project",
    lock: projectLock,
    type: { codeHash: "launch-type-hash", hashType: "type", args: "launch-0x42" },
    capacity: 198n,
    live: true,
    indexedAtTip: 220,
  },
  {
    outPoint: "tx-receipt-alice:0",
    projectId: "launch-0x42",
    kind: "receipt",
    lock: { codeHash: "secp256k1-lock", hashType: "type", args: "alice-lock" },
    type: { codeHash: "receipt-type-hash", hashType: "type", args: "launch-0x42" },
    capacity: 142n,
    live: true,
    indexedAtTip: 220,
  },
  {
    outPoint: "tx-receipt-bob:0",
    projectId: "launch-0x42",
    kind: "receipt",
    lock: { codeHash: "secp256k1-lock", hashType: "type", args: "bob-lock" },
    type: { codeHash: "receipt-type-hash", hashType: "type", args: "launch-0x42" },
    capacity: 142n,
    live: true,
    indexedAtTip: 220,
  },
  {
    outPoint: "tx-receipt-carol:0",
    projectId: "launch-0x42",
    kind: "receipt",
    lock: { codeHash: "secp256k1-lock", hashType: "type", args: "carol-lock" },
    type: { codeHash: "receipt-type-hash", hashType: "type", args: "launch-0x42" },
    capacity: 142n,
    live: true,
    indexedAtTip: 219,
  },
  {
    outPoint: "tx-treasury-live:0",
    projectId: "launch-0x42",
    kind: "treasury",
    lock: { codeHash: "escrow-lock", hashType: "type", args: "launch-0x42" },
    type: { codeHash: "escrow-type-hash", hashType: "type", args: "launch-0x42" },
    capacity: 1_500n,
    live: true,
    indexedAtTip: 220,
  },
  {
    outPoint: "tx-treasury-stale:0",
    projectId: "launch-0x42",
    kind: "treasury",
    lock: { codeHash: "escrow-lock", hashType: "type", args: "launch-0x42" },
    type: { codeHash: "escrow-type-hash", hashType: "type", args: "launch-0x42" },
    capacity: 1_500n,
    live: false,
    indexedAtTip: 210,
  },
];

const rpcOnlyCells: Record<string, LiveCell> = {
  "tx-rpc-only:0": {
    outPoint: "tx-rpc-only:0",
    projectId: "launch-0x42",
    kind: "milestone",
    lock: projectLock,
    type: { codeHash: "milestone-type-hash", hashType: "type", args: "launch-0x42:m2" },
    capacity: 182n,
    live: true,
    indexedAtTip: CURRENT_TIP,
  },
};

const fullNodeLiveStatus: Record<string, boolean> = {
  "tx-project:0": true,
  "tx-receipt-alice:0": true,
  "tx-receipt-bob:0": true,
  "tx-receipt-carol:0": true,
  "tx-treasury-live:0": true,
  "tx-treasury-stale:0": false,
  "tx-rpc-only:0": true,
};

function printSection(title: string) {
  console.log(`\n${title}`);
  console.log(`${"=".repeat(title.length)}`);
}

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function queryIndexedCells(kind: LiveCell["kind"], cursor: string | null, limit: number): IndexerPage<LiveCell> {
  const offset = cursor === null ? 0 : Number(cursor);
  const matches = indexedCells.filter((cell) => cell.kind === kind);
  const objects = matches.slice(offset, offset + limit);
  const nextOffset = offset + objects.length;

  return {
    objects,
    cursor: nextOffset < matches.length ? String(nextOffset) : null,
    source: "indexer",
    staleCandidates: objects.filter((cell) => !cell.live || CURRENT_TIP - cell.indexedAtTip > 5),
  };
}

function revalidateBeforeBroadcast(cells: LiveCell[]): RevalidationResult {
  const liveCells: LiveCell[] = [];
  const staleCells: LiveCell[] = [];

  for (const cell of cells) {
    if (fullNodeLiveStatus[cell.outPoint]) liveCells.push({ ...cell, live: true, indexedAtTip: CURRENT_TIP });
    else staleCells.push({ ...cell, live: false });
  }

  return {
    liveCells,
    staleCells,
    source: "full-node-rpc",
  };
}

function fallbackRpcVerify(outPoint: string): IndexerPage<LiveCell> {
  const cell = rpcOnlyCells[outPoint];
  return {
    objects: cell && fullNodeLiveStatus[outPoint] ? [cell] : [],
    cursor: null,
    source: "rpc-fallback",
    staleCandidates: cell && !fullNodeLiveStatus[outPoint] ? [cell] : [],
  };
}

function printPaginationSelfCheck() {
  printSection("1. Cursor pagination");
  const first = queryIndexedCells("receipt", null, 2);
  const second = queryIndexedCells("receipt", first.cursor, 2);

  assert(first.objects.length === 2, "First page should return two receipts");
  assert(first.cursor === "2", "First page should preserve cursor state");
  assert(second.objects.length === 1, "Second page should return the final receipt");
  assert(second.cursor === null, "Final page should clear the cursor");
  assert(first.objects[0].outPoint !== second.objects[0].outPoint, "Pages should not duplicate cells");

  console.log(`first page:  ${first.objects.map((cell) => cell.outPoint).join(", ")} cursor=${first.cursor}`);
  console.log(`second page: ${second.objects.map((cell) => cell.outPoint).join(", ")} cursor=${second.cursor}`);
}

function printStaleSelfCheck() {
  printSection("2. Stale candidates and revalidation");
  const page = queryIndexedCells("treasury", null, 10);
  const result = revalidateBeforeBroadcast(page.objects);

  assert(page.staleCandidates.length === 1, "Indexer page should flag stale treasury candidates");
  assert(result.liveCells.length === 1, "Revalidation should keep the live treasury cell");
  assert(result.staleCells.length === 1, "Revalidation should reject the dead treasury cell");
  assert(result.source === "full-node-rpc", "Revalidation should use full-node RPC semantics");

  console.log(`stale candidates: ${page.staleCandidates.map((cell) => cell.outPoint).join(", ")}`);
  console.log(`live after RPC:    ${result.liveCells.map((cell) => cell.outPoint).join(", ")}`);
  console.log(`stale after RPC:   ${result.staleCells.map((cell) => cell.outPoint).join(", ")}`);
}

function printFallbackSelfCheck() {
  printSection("3. Fallback RPC verification");
  const fallback = fallbackRpcVerify("tx-rpc-only:0");

  assert(fallback.source === "rpc-fallback", "Fallback page should identify RPC fallback source");
  assert(fallback.objects.length === 1, "Fallback should return the requested live cell");
  assert(fallback.objects[0].kind === "milestone", "Fallback cell should be decoded into the expected kind");

  console.log(`fallback source: ${fallback.source}`);
  console.log(`fallback cell:   ${fallback.objects[0].outPoint} (${fallback.objects[0].kind})`);
}

function main() {
  printPaginationSelfCheck();
  printStaleSelfCheck();
  printFallbackSelfCheck();
  printSection("4. Week 7 invariant (indexer)");
  console.log("  - Indexers are read accelerators, not final authority for spending.");
  console.log("  - Pagination state is part of correctness because missing a page means missing cells.");
  console.log("  - The app revalidates candidate inputs against live-cell RPC before broadcast.");
}

try {
  main();
  process.exit(0);
} catch (error) {
  console.error("27-indexer-query-layer failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
