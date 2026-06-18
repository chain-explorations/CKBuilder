// Lesson 21 - Protocol Blueprint
//
// Week 6 turns the earlier lessons into a capstone: a milestone escrow /
// launchpad protocol expressed as an explicit cell graph. The point is not to
// deploy scripts here. The point is to make ownership, funding, time, assets,
// metadata, and failure recovery visible in transaction shape.

type Asset = {
  symbol: "CKB" | "ckUSDT";
  kind: "native" | "xudt";
  typeHash: string | null;
};

type LaunchCell = {
  projectId: string;
  ownerLockHash: string;
  launchTypeHash: string;
  targetAmount: bigint;
  state: "funding" | "active" | "closed";
  metadataSporeId?: string;
};

type MilestoneCell = {
  id: string;
  projectId: string;
  amount: bigint;
  deadlineEpoch: number;
  status: "pending" | "approved" | "released" | "refundable";
  approverLockHash: string;
};

type ReceiptCell = {
  id: string;
  projectId: string;
  contributorLockHash: string;
  asset: Asset;
  amount: bigint;
};

type TreasuryCell = {
  projectId: string;
  asset: Asset;
  lockedAmount: bigint;
  escrowTypeHash: string;
};

const SHANNONS_PER_CKB = 100_000_000n;
const LAUNCH_TYPE_HASH = "0xlaunch0000000000000000000000000000000000000000000000000000000001";
const ESCROW_TYPE_HASH = "0xescrow0000000000000000000000000000000000000000000000000000000002";
const CKUSDT_TYPE_HASH = "0xckusdt000000000000000000000000000000000000000000000000000000003";

const CKB: Asset = { symbol: "CKB", kind: "native", typeHash: null };
const CKUSDT: Asset = { symbol: "ckUSDT", kind: "xudt", typeHash: CKUSDT_TYPE_HASH };

const launch: LaunchCell = {
  projectId: "launch-0x42",
  ownerLockHash: "0xowner0000000000000000000000000000000000000000000000000000000000",
  launchTypeHash: LAUNCH_TYPE_HASH,
  targetAmount: 1_500n * SHANNONS_PER_CKB,
  state: "funding",
  metadataSporeId: "0xsporeprojectmetadata00000000000000000000000000000000000000000000",
};

const milestones: MilestoneCell[] = [
  {
    id: "m1-prototype",
    projectId: launch.projectId,
    amount: 500n * SHANNONS_PER_CKB,
    deadlineEpoch: 1_250,
    status: "pending",
    approverLockHash: "0xdaoapprover0000000000000000000000000000000000000000000000000000",
  },
  {
    id: "m2-testnet",
    projectId: launch.projectId,
    amount: 1_000n * SHANNONS_PER_CKB,
    deadlineEpoch: 1_400,
    status: "pending",
    approverLockHash: "0xdaoapprover0000000000000000000000000000000000000000000000000000",
  },
];

const receipts: ReceiptCell[] = [
  {
    id: "receipt-alice",
    projectId: launch.projectId,
    contributorLockHash: "0xalice000000000000000000000000000000000000000000000000000000000",
    asset: CKB,
    amount: 900n * SHANNONS_PER_CKB,
  },
  {
    id: "receipt-bob",
    projectId: launch.projectId,
    contributorLockHash: "0xbob00000000000000000000000000000000000000000000000000000000000",
    asset: CKB,
    amount: 600n * SHANNONS_PER_CKB,
  },
  {
    id: "receipt-carol-xudt",
    projectId: launch.projectId,
    contributorLockHash: "0xcarol00000000000000000000000000000000000000000000000000000000",
    asset: CKUSDT,
    amount: 25_000n,
  },
];

const treasury: TreasuryCell = {
  projectId: launch.projectId,
  asset: CKB,
  lockedAmount: 1_500n * SHANNONS_PER_CKB,
  escrowTypeHash: ESCROW_TYPE_HASH,
};

function printSection(title: string) {
  console.log(`\n${title}`);
  console.log(`${"=".repeat(title.length)}`);
}

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function formatAmount(amount: bigint, asset: Asset): string {
  if (asset.kind === "native") return `${amount / SHANNONS_PER_CKB} CKB`;
  return `${amount.toString()} ${asset.symbol}`;
}

function sumReceipts(asset: Asset): bigint {
  return receipts
    .filter((receipt) => receipt.asset.symbol === asset.symbol)
    .reduce((sum, receipt) => sum + receipt.amount, 0n);
}

function printCellGraph() {
  printSection("1. Launchpad protocol as a cell graph");
  console.log("The protocol is not a contract-owned balance sheet.");
  console.log("It is a set of cells whose legal replacements encode the app.");
  console.log("");
  console.log("Project launch cell");
  console.log(`  project id:       ${launch.projectId}`);
  console.log(`  owner lock hash:  ${launch.ownerLockHash}`);
  console.log(`  type hash:        ${launch.launchTypeHash}`);
  console.log(`  target:           ${formatAmount(launch.targetAmount, CKB)}`);
  console.log(`  metadata Spore:   ${launch.metadataSporeId}`);
  console.log("");
  console.log("Milestone cells");
  for (const milestone of milestones) {
    console.log(`  ${milestone.id}: ${formatAmount(milestone.amount, CKB)}, deadline epoch ${milestone.deadlineEpoch}, ${milestone.status}`);
  }
  console.log("");
  console.log("Treasury/funding cell");
  console.log(`  locks:            ${formatAmount(treasury.lockedAmount, treasury.asset)}`);
  console.log(`  escrow type hash: ${treasury.escrowTypeHash}`);
}

function printContributionPaths() {
  printSection("2. CKB and xUDT contribution paths");
  const ckbTotal = sumReceipts(CKB);
  const xudtTotal = sumReceipts(CKUSDT);

  assert(ckbTotal === treasury.lockedAmount, "CKB receipt total must match treasury locked amount");
  assert(ckbTotal === launch.targetAmount, "CKB receipts should meet the launch target");
  assert(xudtTotal === 25_000n, "xUDT receipt total mismatch");

  console.log("CKB path");
  console.log("  inputs:  contributor CKB cells");
  console.log("  outputs: escrow treasury cell + contributor receipt cell + contributor change");
  console.log(`  sample total: ${formatAmount(ckbTotal, CKB)}`);
  console.log("");
  console.log("xUDT path");
  console.log("  inputs:  contributor xUDT cells + CKB capacity cells");
  console.log("  outputs: xUDT escrow cell with matching type hash + receipt cell + change");
  console.log(`  required type hash: ${CKUSDT_TYPE_HASH}`);
  console.log(`  sample total:       ${formatAmount(xudtTotal, CKUSDT)}`);
}

function printTransitions() {
  printSection("3. Valid state transitions");
  const totalMilestoneRelease = milestones.reduce((sum, milestone) => sum + milestone.amount, 0n);
  assert(totalMilestoneRelease <= treasury.lockedAmount, "Milestone release cannot exceed funded amount");

  const transitions = [
    "create: project owner creates launch cell, milestone cells, and optional Spore metadata proof",
    "contribute: contributor consumes owned assets and receives a receipt cell bound to project id",
    "approve milestone: approver witness turns a pending milestone into approved replacement cell",
    "release funds: approved milestone plus treasury input emits owner payout and smaller treasury cell",
    "refund: after deadline, receipt plus treasury input emits contributor payout and burns/replaces receipt",
    "close: all milestones released or refunded, launch cell moves to closed state",
  ];

  for (const transition of transitions) console.log(`  - ${transition}`);
  console.log("");
  console.log(`Total planned release: ${formatAmount(totalMilestoneRelease, CKB)}`);
  console.log(`Funded treasury:       ${formatAmount(treasury.lockedAmount, CKB)}`);
}

function printTakeaways() {
  printSection("4. Week 6 invariant (blueprint)");
  console.log("  - Ownership is in locks, protocol identity is in type scripts, and value is in cells.");
  console.log("  - Receipts make contributor claims explicit instead of hidden in a ledger.");
  console.log("  - Milestones are state cells, not scheduled jobs.");
  console.log("  - Metadata can live in Spore/content cells while protocol-critical bytes stay small.");
}

function main() {
  printCellGraph();
  printContributionPaths();
  printTransitions();
  printTakeaways();
}

try {
  main();
  process.exit(0);
} catch (error) {
  console.error("21-protocol-blueprint failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
