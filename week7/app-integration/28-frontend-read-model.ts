// Lesson 28 - Frontend Read Model
//
// A CKB frontend should not be a thin button layer over stale indexer results.
// It should turn cells into a read model that explains project state, treasury
// state, receipts, milestones, and exactly why each user action is enabled or
// disabled.

type Asset = {
  symbol: "CKB" | "ckUSDT";
  typeHash: string | null;
};

type ProjectView = {
  projectId: string;
  title: string;
  state: "funding" | "active" | "closed";
  targetAmount: bigint;
  fundedAmount: bigint;
  milestones: MilestoneView[];
  receipts: ReceiptView[];
  treasury: TreasuryView;
  actions: UserAction[];
};

type MilestoneView = {
  id: string;
  title: string;
  amount: bigint;
  deadlineEpoch: number;
  status: "pending" | "approved" | "released" | "refundable";
};

type ReceiptView = {
  id: string;
  contributorLockHash: string;
  amount: bigint;
  refundEpoch: number;
  asset: Asset;
};

type TreasuryView = {
  outPoint: string;
  lockedAmount: bigint;
  asset: Asset;
  live: boolean;
};

type UserAction = {
  name: "contribute" | "release-milestone" | "refund" | "close";
  enabled: boolean;
  reason: string;
};

function printSection(title: string) {
  console.log(`\n${title}`);
  console.log(`${"=".repeat(title.length)}`);
}

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function buildProjectReadModel(walletLockHash: string, currentEpoch: number): ProjectView {
  const ckb: Asset = { symbol: "CKB", typeHash: null };
  const ownerLockHash = "owner-lock";
  const milestones: MilestoneView[] = [
    {
      id: "m1",
      title: "Prototype",
      amount: 500n,
      deadlineEpoch: 1_250,
      status: "approved",
    },
    {
      id: "m2",
      title: "Public testnet",
      amount: 1_000n,
      deadlineEpoch: 1_400,
      status: "pending",
    },
  ];
  const receipts: ReceiptView[] = [
    {
      id: "receipt-alice",
      contributorLockHash: "alice-lock",
      amount: 900n,
      refundEpoch: 1_250,
      asset: ckb,
    },
    {
      id: "receipt-bob",
      contributorLockHash: "bob-lock",
      amount: 600n,
      refundEpoch: 1_250,
      asset: ckb,
    },
  ];
  const treasury: TreasuryView = {
    outPoint: "tx-treasury-live:0",
    lockedAmount: 1_500n,
    asset: ckb,
    live: true,
  };
  const userReceipt = receipts.find((receipt) => receipt.contributorLockHash === walletLockHash);
  const approvedMilestone = milestones.find((milestone) => milestone.status === "approved");

  const releaseAction = (() : UserAction => {
    if (walletLockHash !== ownerLockHash) {
      return { name: "release-milestone", enabled: false, reason: "wallet is not project owner" };
    }
    if (!treasury.live) {
      return { name: "release-milestone", enabled: false, reason: "treasury cell is stale" };
    }
    if (!approvedMilestone) {
      return { name: "release-milestone", enabled: false, reason: "no approved milestone to release" };
    }
    if (approvedMilestone.amount > treasury.lockedAmount) {
      return { name: "release-milestone", enabled: false, reason: "approved amount exceeds treasury" };
    }
    return { name: "release-milestone", enabled: true, reason: `ready to release ${approvedMilestone.id}` };
  })();

  const refundAction = (() : UserAction => {
    if (!userReceipt) return { name: "refund", enabled: false, reason: "wallet has no receipt" };
    if (currentEpoch <= userReceipt.refundEpoch) {
      return { name: "refund", enabled: false, reason: `refund unlocks at epoch ${userReceipt.refundEpoch + 1}` };
    }
    return { name: "refund", enabled: true, reason: `ready to refund ${userReceipt.id}` };
  })();

  const closeAction = (() : UserAction => {
    if (walletLockHash !== ownerLockHash) return { name: "close", enabled: false, reason: "wallet is not project owner" };
    if (treasury.lockedAmount > 0n) {
      return { name: "close", enabled: false, reason: `treasury still holds ${treasury.lockedAmount} ${treasury.asset.symbol}` };
    }
    if (milestones.some((milestone) => milestone.status !== "released")) {
      return { name: "close", enabled: false, reason: "milestones are not fully settled" };
    }
    return { name: "close", enabled: true, reason: "ready to close" };
  })();

  const contributeAction: UserAction = treasury.lockedAmount >= 1_500n
    ? { name: "contribute", enabled: false, reason: "funding target already met" }
    : { name: "contribute", enabled: true, reason: "ready to contribute" };

  return {
    projectId: "launch-0x42",
    title: "Cell Graph Launchpad",
    state: "active",
    targetAmount: 1_500n,
    fundedAmount: treasury.lockedAmount,
    milestones,
    receipts,
    treasury,
    actions: [contributeAction, releaseAction, refundAction, closeAction],
  };
}

function action(view: ProjectView, name: UserAction["name"]): UserAction {
  const found = view.actions.find((item) => item.name === name);
  assert(found, `Missing action ${name}`);
  return found;
}

function printProjectSummary() {
  printSection("1. Project read model");
  const view = buildProjectReadModel("alice-lock", 1_200);

  assert(view.projectId === "launch-0x42", "Project id should survive read-model assembly");
  assert(view.fundedAmount === 1_500n, "Funded amount should come from live treasury state");
  assert(view.milestones.length === 2, "Read model should expose milestones");
  assert(view.receipts.length === 2, "Read model should expose receipts");
  assert(view.treasury.live, "Read model should expose treasury live status");

  console.log(`${view.title} (${view.state})`);
  console.log(`funded:    ${view.fundedAmount} / ${view.targetAmount} ${view.treasury.asset.symbol}`);
  console.log(`milestones:${view.milestones.map((milestone) => ` ${milestone.id}:${milestone.status}`).join(",")}`);
  console.log(`receipts:  ${view.receipts.map((receipt) => receipt.id).join(", ")}`);
}

function printDisabledReasons() {
  printSection("2. Disabled user-action reasons");
  const aliceBeforeDeadline = buildProjectReadModel("alice-lock", 1_200);
  const aliceAfterDeadline = buildProjectReadModel("alice-lock", 1_251);
  const ownerView = buildProjectReadModel("owner-lock", 1_200);

  assert(!action(aliceBeforeDeadline, "refund").enabled, "Refund should be disabled before the deadline");
  assert(action(aliceBeforeDeadline, "refund").reason === "refund unlocks at epoch 1251", "Refund disabled reason should name the epoch");
  assert(action(aliceAfterDeadline, "refund").enabled, "Refund should be enabled after the deadline for receipt owner");
  assert(!action(aliceBeforeDeadline, "release-milestone").enabled, "Non-owner should not release milestone funds");
  assert(action(aliceBeforeDeadline, "release-milestone").reason === "wallet is not project owner", "Release disabled reason should explain signer mismatch");
  assert(action(ownerView, "release-milestone").enabled, "Owner should be able to release the approved milestone");
  assert(!action(ownerView, "close").enabled, "Close should be disabled while treasury still holds funds");
  assert(action(ownerView, "close").reason === "treasury still holds 1500 CKB", "Close disabled reason should explain remaining funds");

  console.log(`alice refund before deadline: ${action(aliceBeforeDeadline, "refund").reason}`);
  console.log(`alice refund after deadline:  ${action(aliceAfterDeadline, "refund").reason}`);
  console.log(`owner release:                ${action(ownerView, "release-milestone").reason}`);
  console.log(`owner close:                  ${action(ownerView, "close").reason}`);
}

function main() {
  printProjectSummary();
  printDisabledReasons();
  printSection("3. Week 7 invariant (frontend)");
  console.log("  - The UI is a projection of live cells, not a separate source of truth.");
  console.log("  - Every enabled action should correspond to a transaction the app can build now.");
  console.log("  - Every disabled action should have a concrete reason tied to cells, time, role, or treasury state.");
}

try {
  main();
  process.exit(0);
} catch (error) {
  console.error("28-frontend-read-model failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
