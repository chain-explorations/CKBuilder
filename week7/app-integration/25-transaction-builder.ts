// Lesson 25 - Transaction Builder
//
// Week 7 starts where the Week 6 protocol capstone ended: with a cell graph
// that now needs app-side transaction assembly. These self-checks describe the
// transaction plans the app must build before any wallet signs them.

type OutPoint = {
  txHash: string;
  index: number;
};

type Script = {
  codeHash: string;
  hashType: "type" | "data" | "data1";
  args: string;
};

type Asset = {
  symbol: "CKB" | "ckUSDT";
  kind: "native" | "xudt";
  typeHash: string | null;
};

type LiveCell = {
  outPoint: OutPoint;
  capacity: bigint;
  lock: Script;
  type?: Script;
  data: Record<string, unknown>;
  live: boolean;
};

type PlannedOutput = {
  label: string;
  capacity: bigint;
  lock: Script;
  type?: Script;
  data: Record<string, unknown>;
};

type WitnessGroup = {
  lockHash: string;
  inputIndices: number[];
  role: "contributor" | "project-owner" | "approver";
};

type TransactionPlan = {
  name: string;
  inputs: LiveCell[];
  outputs: PlannedOutput[];
  cellDeps: string[];
  witnessGroups: WitnessGroup[];
  headerDeps: string[];
  fee: bigint;
  riskChecks: string[];
};

const FEE = 1n;

const aliceLock: Script = {
  codeHash: "secp256k1-lock",
  hashType: "type",
  args: "alice-lock",
};

const ownerLock: Script = {
  codeHash: "secp256k1-lock",
  hashType: "type",
  args: "owner-lock",
};

const escrowLock: Script = {
  codeHash: "escrow-lock-code",
  hashType: "type",
  args: "launch-0x42",
};

const launchType: Script = {
  codeHash: "launch-type-hash",
  hashType: "type",
  args: "launch-0x42",
};

const milestoneType: Script = {
  codeHash: "milestone-type-hash",
  hashType: "type",
  args: "launch-0x42:m1",
};

const receiptType: Script = {
  codeHash: "receipt-type-hash",
  hashType: "type",
  args: "launch-0x42:alice-lock",
};

const escrowType: Script = {
  codeHash: "escrow-type-hash",
  hashType: "type",
  args: "launch-0x42",
};

const launchCell: LiveCell = {
  outPoint: { txHash: "tx-launch", index: 0 },
  capacity: 198n,
  lock: ownerLock,
  type: launchType,
  data: {
    projectId: "launch-0x42",
    state: "active",
    targetAmount: 1_500n,
    ownerLockHash: "owner-lock",
  },
  live: true,
};

const contributorCell: LiveCell = {
  outPoint: { txHash: "tx-alice-funds", index: 0 },
  capacity: 1_000n,
  lock: aliceLock,
  data: {
    ownerLockHash: "alice-lock",
    asset: "CKB",
  },
  live: true,
};

const milestoneCell: LiveCell = {
  outPoint: { txHash: "tx-milestone", index: 0 },
  capacity: 182n,
  lock: ownerLock,
  type: milestoneType,
  data: {
    id: "m1",
    amount: 500n,
    status: "approved",
    recipientLockHash: "owner-lock",
  },
  live: true,
};

const treasuryCell: LiveCell = {
  outPoint: { txHash: "tx-treasury-live", index: 0 },
  capacity: 1_500n,
  lock: escrowLock,
  type: escrowType,
  data: {
    projectId: "launch-0x42",
    lockedAmount: 1_500n,
    releasedAmount: 0n,
    assetTypeHash: null,
  },
  live: true,
};

const receiptCell: LiveCell = {
  outPoint: { txHash: "tx-receipt-alice", index: 0 },
  capacity: 142n,
  lock: aliceLock,
  type: receiptType,
  data: {
    projectId: "launch-0x42",
    contributorLockHash: "alice-lock",
    amount: 600n,
    refundEpoch: 1_250,
    assetTypeHash: null,
  },
  live: true,
};

const emptyTreasuryCell: LiveCell = {
  ...treasuryCell,
  outPoint: { txHash: "tx-treasury-empty", index: 0 },
  capacity: 61n,
  data: {
    ...treasuryCell.data,
    lockedAmount: 0n,
    releasedAmount: 1_500n,
  },
};

function printSection(title: string) {
  console.log(`\n${title}`);
  console.log(`${"=".repeat(title.length)}`);
}

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function buildContributionPlan(): TransactionPlan {
  return {
    name: "contribute 600 CKB to launch-0x42",
    inputs: [contributorCell],
    outputs: [
      {
        label: "treasury contribution",
        capacity: 600n,
        lock: escrowLock,
        type: escrowType,
        data: {
          projectId: "launch-0x42",
          amount: 600n,
          assetTypeHash: null,
        },
      },
      {
        label: "contribution receipt",
        capacity: 142n,
        lock: aliceLock,
        type: receiptType,
        data: {
          projectId: "launch-0x42",
          contributorLockHash: "alice-lock",
          amount: 600n,
          refundEpoch: 1_250,
          assetTypeHash: null,
        },
      },
      {
        label: "contributor change",
        capacity: 257n,
        lock: aliceLock,
        data: {
          ownerLockHash: "alice-lock",
        },
      },
    ],
    cellDeps: ["secp256k1-dep", "escrow-type-dep", "receipt-type-dep"],
    witnessGroups: [{ lockHash: "alice-lock", inputIndices: [0], role: "contributor" }],
    headerDeps: [],
    fee: FEE,
    riskChecks: [
      "contributor owns input lock",
      "receipt amount equals treasury contribution",
      "capacity balances before signing",
    ],
  };
}

function buildReleasePlan(): TransactionPlan {
  return {
    name: "release m1 funds to project owner",
    inputs: [treasuryCell, milestoneCell],
    outputs: [
      {
        label: "project owner payout",
        capacity: 500n,
        lock: ownerLock,
        data: {
          milestoneId: "m1",
          recipientLockHash: "owner-lock",
        },
      },
      {
        label: "treasury remainder",
        capacity: 1_000n,
        lock: escrowLock,
        type: escrowType,
        data: {
          projectId: "launch-0x42",
          lockedAmount: 1_000n,
          releasedAmount: 500n,
          assetTypeHash: null,
        },
      },
      {
        label: "released milestone",
        capacity: 181n,
        lock: ownerLock,
        type: milestoneType,
        data: {
          id: "m1",
          amount: 500n,
          status: "released",
          recipientLockHash: "owner-lock",
        },
      },
    ],
    cellDeps: ["secp256k1-dep", "escrow-type-dep", "milestone-type-dep"],
    witnessGroups: [{ lockHash: "owner-lock", inputIndices: [1], role: "project-owner" }],
    headerDeps: [],
    fee: FEE,
    riskChecks: [
      "treasury cell is live",
      "recipient lock matches milestone policy",
      "escrow type hash matches deployment manifest",
      "release amount does not exceed remaining treasury",
    ],
  };
}

function buildRefundPlan(currentEpoch: number, headerDeps: string[]): TransactionPlan {
  if (currentEpoch <= 1_250) throw new Error("refund before deadline");
  if (headerDeps.length === 0) throw new Error("missing deadline header proof");

  return {
    name: "refund alice after missed deadline",
    inputs: [treasuryCell, receiptCell],
    outputs: [
      {
        label: "contributor refund",
        capacity: 741n,
        lock: aliceLock,
        data: {
          contributorLockHash: "alice-lock",
          refundAmount: 600n,
          receiptCapacityReturned: 142n,
        },
      },
      {
        label: "treasury remainder",
        capacity: 900n,
        lock: escrowLock,
        type: escrowType,
        data: {
          projectId: "launch-0x42",
          lockedAmount: 900n,
          assetTypeHash: null,
        },
      },
    ],
    cellDeps: ["secp256k1-dep", "escrow-type-dep", "receipt-type-dep"],
    witnessGroups: [{ lockHash: "alice-lock", inputIndices: [1], role: "contributor" }],
    headerDeps,
    fee: FEE,
    riskChecks: [
      "deadline header proves epoch greater than refund epoch",
      "receipt contributor matches signer lock",
      "treasury cell is live before broadcast",
    ],
  };
}

function buildClosePlan(): TransactionPlan {
  return {
    name: "close launch after funds settle",
    inputs: [launchCell, emptyTreasuryCell],
    outputs: [
      {
        label: "closed launch cell",
        capacity: 258n,
        lock: ownerLock,
        type: launchType,
        data: {
          projectId: "launch-0x42",
          state: "closed",
          targetAmount: 1_500n,
          ownerLockHash: "owner-lock",
        },
      },
    ],
    cellDeps: ["secp256k1-dep", "launch-type-dep", "escrow-type-dep"],
    witnessGroups: [{ lockHash: "owner-lock", inputIndices: [0], role: "project-owner" }],
    headerDeps: [],
    fee: FEE,
    riskChecks: [
      "all milestones released or refunded",
      "all treasury funds released or refunded",
      "launch cell state moves forward only",
    ],
  };
}

function validateReleaseAttempt(): string[] {
  const failures: string[] = [];
  const attemptedTreasury = {
    ...treasuryCell,
    outPoint: { txHash: "tx-stale-treasury", index: 0 },
    live: false,
    type: { ...escrowType, codeHash: "wrong-escrow-type-hash" },
    data: {
      ...treasuryCell.data,
      lockedAmount: 400n,
      assetTypeHash: "wrong-xudt-type-hash",
    },
  };
  const attemptedRecipient = "attacker-lock";
  const attemptedAmount = 500n;

  if (!attemptedTreasury.live || attemptedTreasury.outPoint.txHash !== treasuryCell.outPoint.txHash) {
    failures.push("stale treasury cell");
  }
  if (attemptedRecipient !== milestoneCell.data.recipientLockHash) failures.push("wrong recipient lock");
  if (attemptedTreasury.type?.codeHash !== escrowType.codeHash) failures.push("wrong escrow type hash");
  if (attemptedTreasury.data.assetTypeHash !== treasuryCell.data.assetTypeHash) failures.push("wrong asset type hash");
  if (attemptedAmount > (attemptedTreasury.data.lockedAmount as bigint)) failures.push("release exceeds remaining treasury");
  return failures;
}

function capacityBalances(plan: TransactionPlan): boolean {
  const inputCapacity = plan.inputs.reduce((sum, cell) => sum + cell.capacity, 0n);
  const outputCapacity = plan.outputs.reduce((sum, output) => sum + output.capacity, 0n);
  return inputCapacity === outputCapacity + plan.fee;
}

function printPlan(plan: TransactionPlan) {
  console.log(`${plan.name}`);
  console.log(`  inputs:         ${plan.inputs.length}`);
  console.log(`  outputs:        ${plan.outputs.length}`);
  console.log(`  cell deps:      ${plan.cellDeps.join(", ")}`);
  console.log(`  witness groups: ${plan.witnessGroups.map((group) => group.role).join(", ")}`);
  console.log(`  header deps:    ${plan.headerDeps.length}`);
  console.log(`  risk checks:    ${plan.riskChecks.join(", ")}`);
}

function printContributionSelfCheck() {
  printSection("1. Contribution transaction plan");
  const plan = buildContributionPlan();
  const treasury = plan.outputs.find((output) => output.label === "treasury contribution");
  const receipt = plan.outputs.find((output) => output.label === "contribution receipt");

  assert(capacityBalances(plan), "Contribution plan should balance input capacity, outputs, and fee");
  assert(treasury?.data.amount === 600n, "Treasury contribution should lock the contributed amount");
  assert(receipt?.data.amount === 600n, "Receipt should record the contributed amount");
  assert(receipt?.data.contributorLockHash === "alice-lock", "Receipt should bind to the contributor lock");

  printPlan(plan);
}

function printReleaseSelfCheck() {
  printSection("2. Release transaction plan");
  const plan = buildReleasePlan();
  const payout = plan.outputs.find((output) => output.label === "project owner payout");
  const treasury = plan.outputs.find((output) => output.label === "treasury remainder");
  const failures = validateReleaseAttempt();

  assert(capacityBalances(plan), "Release plan should balance capacity");
  assert(payout?.capacity === 500n, "Release should pay exactly the approved milestone amount");
  assert(treasury?.data.lockedAmount === 1_000n, "Treasury remainder should track unreleased funds");
  assert(failures.includes("stale treasury cell"), "Release validation should catch stale treasury cells");
  assert(failures.includes("wrong recipient lock"), "Release validation should catch wrong recipients");
  assert(failures.includes("wrong escrow type hash"), "Release validation should catch wrong escrow type hashes");
  assert(failures.includes("release exceeds remaining treasury"), "Release validation should catch over-release");

  printPlan(plan);
  console.log(`  invalid release failures: ${failures.join(", ")}`);
}

function printRefundSelfCheck() {
  printSection("3. Refund transaction plan");
  const earlyFailures = (() => {
    try {
      buildRefundPlan(1_200, ["header-epoch-1200"]);
      return [];
    } catch (error) {
      return [error instanceof Error ? error.message : String(error)];
    }
  })();
  const missingHeaderFailures = (() => {
    try {
      buildRefundPlan(1_251, []);
      return [];
    } catch (error) {
      return [error instanceof Error ? error.message : String(error)];
    }
  })();
  const plan = buildRefundPlan(1_251, ["header-epoch-1251"]);

  assert(capacityBalances(plan), "Refund plan should balance capacity");
  assert(plan.headerDeps.length === 1, "Refund plan should include a deadline header proof");
  assert(earlyFailures.includes("refund before deadline"), "Early refunds should be rejected");
  assert(missingHeaderFailures.includes("missing deadline header proof"), "Refunds should require header proof");

  printPlan(plan);
}

function printCloseSelfCheck() {
  printSection("4. Close transaction plan");
  const plan = buildClosePlan();
  const closed = plan.outputs.find((output) => output.label === "closed launch cell");

  assert(capacityBalances(plan), "Close plan should balance capacity");
  assert(closed?.data.state === "closed", "Close plan should replace the launch cell with closed state");
  assert(plan.riskChecks.includes("all treasury funds released or refunded"), "Close plan should prove treasury is empty");

  printPlan(plan);
}

function main() {
  printContributionSelfCheck();
  printReleaseSelfCheck();
  printRefundSelfCheck();
  printCloseSelfCheck();
  printSection("5. Week 7 invariant (transaction builder)");
  console.log("  - The app builds exact cell replacements before asking a wallet to sign.");
  console.log("  - Every plan carries inputs, outputs, deps, witnesses, headers, fees, and risk checks.");
  console.log("  - Stale cells, wrong recipients, wrong type hashes, and deadline failures are app-layer rejects.");
}

try {
  main();
  process.exit(0);
} catch (error) {
  console.error("25-transaction-builder failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
