type WalletCell = {
  id: string;
  ckb: number;
  tag: "plain" | "xudt" | "spore" | "treasury";
};

type SelectionResult = {
  picked: WalletCell[];
  total: number;
  waste: number;
};

const wallet: WalletCell[] = [
  { id: "c1", ckb: 61, tag: "plain" },
  { id: "c2", ckb: 61, tag: "plain" },
  { id: "c3", ckb: 95, tag: "plain" },
  { id: "c4", ckb: 120, tag: "plain" },
  { id: "c5", ckb: 142, tag: "xudt" },
  { id: "c6", ckb: 142, tag: "xudt" },
  { id: "c7", ckb: 180, tag: "spore" },
  { id: "c8", ckb: 240, tag: "plain" },
  { id: "c9", ckb: 400, tag: "treasury" },
  { id: "c10", ckb: 800, tag: "treasury" },
];

function printSection(title: string) {
  console.log(`\n${title}`);
  console.log(`${"=".repeat(title.length)}`);
}

function sumCkb(cells: WalletCell[]): number {
  return cells.reduce((sum, cell) => sum + cell.ckb, 0);
}

function formatCells(cells: WalletCell[]): string {
  return cells.map((cell) => `${cell.id}:${cell.ckb}`).join(", ");
}

function selectionResult(picked: WalletCell[], target: number): SelectionResult {
  const total = sumCkb(picked);
  return { picked, total, waste: total - target };
}

function smallestFirst(cells: WalletCell[], target: number): SelectionResult {
  const picked: WalletCell[] = [];
  for (const cell of [...cells].sort((a, b) => a.ckb - b.ckb)) {
    picked.push(cell);
    if (sumCkb(picked) >= target) {
      break;
    }
  }
  return selectionResult(picked, target);
}

function largestFirst(cells: WalletCell[], target: number): SelectionResult {
  const picked: WalletCell[] = [];
  for (const cell of [...cells].sort((a, b) => b.ckb - a.ckb)) {
    picked.push(cell);
    if (sumCkb(picked) >= target) {
      break;
    }
  }
  return selectionResult(picked, target);
}

function bestFit(cells: WalletCell[], target: number): SelectionResult {
  const sorted = [...cells].sort((a, b) => a.ckb - b.ckb);
  let bestSingle: WalletCell | undefined;
  for (const cell of sorted) {
    if (cell.ckb >= target) {
      bestSingle = cell;
      break;
    }
  }
  if (bestSingle) {
    return selectionResult([bestSingle], target);
  }

  const picked: WalletCell[] = [];
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const cell = sorted[i];
    if (sumCkb(picked) + cell.ckb <= target + 61) {
      picked.push(cell);
    }
    if (sumCkb(picked) >= target) {
      break;
    }
  }
  return selectionResult(picked, target);
}

function branchAndBound(cells: WalletCell[], target: number): SelectionResult {
  const sorted = [...cells].sort((a, b) => b.ckb - a.ckb);
  let best: SelectionResult | null = null;

  function search(index: number, chosen: WalletCell[]) {
    const total = sumCkb(chosen);
    if (total >= target) {
      const candidate = selectionResult(chosen, target);
      if (!best || candidate.waste < best.waste || (candidate.waste === best.waste && candidate.picked.length < best.picked.length)) {
        best = candidate;
      }
      return;
    }
    if (index >= sorted.length) {
      return;
    }
    if (best && total > target + best.waste) {
      return;
    }

    search(index + 1, [...chosen, sorted[index]]);
    search(index + 1, chosen);
  }

  search(0, []);
  return best ?? selectionResult(sorted, target);
}

function printOperationalTransforms() {
  printSection("1. Fragmentation, consolidation, splitting, and dust");

  console.log("Current wallet cells");
  console.log(`  ${formatCells(wallet)}`);
  console.log("");

  console.log("Fragmentation");
  console.log("  - too many 61-95 CKB cells increase input count and fee pressure");
  console.log("  - xUDT and Spore cells amplify the pain because protocol cells already carry non-trivial occupied capacity");
  console.log("");

  console.log("Consolidation example");
  console.log("  inputs:  c1:61, c2:61, c3:95, c4:120");
  console.log("  outputs: one 320-ish CKB plain cell + fee/change");
  console.log("  benefit: fewer future inputs for treasury operations");
  console.log("");

  console.log("Splitting example");
  console.log("  input:   c10:800");
  console.log("  outputs: 3 x 180 CKB operational cells + 1 x 240 CKB reserve");
  console.log("  benefit: parallel deposits, swaps, and protocol interactions without reopening the giant reserve cell every time");
  console.log("");

  console.log("Dust sweeping");
  console.log("  - sweep plain 61 CKB receive cells before they multiply");
  console.log("  - avoid sweeping protocol cells blindly; an xUDT or Spore cell may be small in free capacity but large in semantic importance");
}

function printSelectionAlgorithms() {
  printSection("2. Cell selection strategies");

  const spendable = wallet.filter((cell) => cell.tag !== "spore");
  const target = 350;
  const strategies: Array<[string, SelectionResult]> = [
    ["smallest-first", smallestFirst(spendable, target)],
    ["largest-first", largestFirst(spendable, target)],
    ["best-fit", bestFit(spendable, target)],
    ["branch-and-bound", branchAndBound(spendable, target)],
  ];

  console.log(`Target spend: ${target} CKB\n`);
  for (const [name, result] of strategies) {
    console.log(name);
    console.log(`  picked: ${formatCells(result.picked)}`);
    console.log(`  total:  ${result.total} CKB`);
    console.log(`  waste:  ${result.waste} CKB`);
    console.log("");
  }

  console.log("Heuristic summary");
  console.log("  - smallest-first reduces dust count but often explodes input count");
  console.log("  - largest-first minimizes inputs but can over-open reserve cells");
  console.log("  - best-fit is a fast wallet heuristic when exact optimization is unnecessary");
  console.log("  - branch-and-bound gives cleaner results for high-value treasury moves when compute budget allows");
}

function printRecommendations() {
  printSection("3. Wallet-oriented recommendations");

  console.log("Teaching heuristics, not protocol rules");
  console.log("  - keep 6-12 plain operational cells for ordinary sends and fee coverage");
  console.log("  - keep 2-4 medium cells in the 150-300 CKB range for xUDT receives, ACP updates, and swap flows");
  console.log("  - keep 1-3 larger reserve cells for treasury or batch operations");
  console.log("  - isolate Spore cells from plain liquidity management unless you intend to melt them");
  console.log("");

  console.log("Protocol-specific tie-backs");
  console.log("  - xUDT: keep enough medium cells to avoid constantly merging token-bearing cells during transfers");
  console.log("  - Spore: each object is its own storage-heavy cell, so capacity planning matters before minting collections");
  console.log("  - dApp treasury/state cells: reserve predictable cell sizes so governance, vault, or orderbook updates do not keep fragmenting the treasury");
}

function main() {
  printOperationalTransforms();
  printSelectionAlgorithms();
  printRecommendations();
}

try {
  main();
  process.exit(0);
} catch (error) {
  console.error("13-cell-management failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
