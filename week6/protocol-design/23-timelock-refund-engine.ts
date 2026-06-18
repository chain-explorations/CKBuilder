// Lesson 23 - Timelock Refund Engine
//
// Time on CKB is not a cron job. It is a precondition a transaction must satisfy.
// This dry-run engine models milestone release, contributor refunds, stale cells,
// wrong recipients, and xUDT type-hash checks as transaction validity rules.

type Asset = {
  symbol: "CKB" | "ckUSDT";
  typeHash: string | null;
};

type EscrowState = {
  projectId: string;
  treasuryCellOutPoint: string;
  milestoneId: string;
  fundedAmount: bigint;
  releasedAmount: bigint;
  deadlineEpoch: number;
  approved: boolean;
  projectRecipientLockHash: string;
  expectedEscrowTypeHash: string;
  asset: Asset;
};

type ReleaseAttempt = {
  currentEpoch: number;
  recipientLockHash: string;
  escrowTypeHash: string;
  inputOutPoint: string;
  amount: bigint;
  assetTypeHash: string | null;
};

type RefundAttempt = {
  currentEpoch: number;
  contributorLockHash: string;
  receiptContributorLockHash: string;
  inputOutPoint: string;
  amount: bigint;
  assetTypeHash: string | null;
};

const CKUSDT_TYPE_HASH = "0xckusdt000000000000000000000000000000000000000000000000000000003";

const ckbEscrow: EscrowState = {
  projectId: "launch-0x42",
  treasuryCellOutPoint: "0xtreasurycell0000000000000000000000000000000000000000000000000000:0x0",
  milestoneId: "m1-prototype",
  fundedAmount: 1_500n,
  releasedAmount: 0n,
  deadlineEpoch: 1_250,
  approved: true,
  projectRecipientLockHash: "0xowner0000000000000000000000000000000000000000000000000000000000",
  expectedEscrowTypeHash: "0xescrow0000000000000000000000000000000000000000000000000000000002",
  asset: { symbol: "CKB", typeHash: null },
};

const xudtEscrow: EscrowState = {
  ...ckbEscrow,
  treasuryCellOutPoint: "0xxudttreasury000000000000000000000000000000000000000000000000000:0x0",
  fundedAmount: 25_000n,
  asset: { symbol: "ckUSDT", typeHash: CKUSDT_TYPE_HASH },
};

function printSection(title: string) {
  console.log(`\n${title}`);
  console.log(`${"=".repeat(title.length)}`);
}

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function validateRelease(state: EscrowState, attempt: ReleaseAttempt): string[] {
  const failures: string[] = [];
  if (!state.approved) failures.push("milestone not approved");
  if (attempt.currentEpoch > state.deadlineEpoch) failures.push("release after deadline requires separate late policy");
  if (attempt.recipientLockHash !== state.projectRecipientLockHash) failures.push("wrong recipient");
  if (attempt.escrowTypeHash !== state.expectedEscrowTypeHash) failures.push("wrong script hash");
  if (attempt.inputOutPoint !== state.treasuryCellOutPoint) failures.push("stale cell");
  if (attempt.amount > state.fundedAmount - state.releasedAmount) failures.push("release exceeds funded amount");
  if (attempt.assetTypeHash !== state.asset.typeHash) failures.push("mismatched xUDT type hash");
  return failures;
}

function validateRefund(state: EscrowState, attempt: RefundAttempt): string[] {
  const failures: string[] = [];
  if (attempt.currentEpoch <= state.deadlineEpoch) failures.push("refund before deadline");
  if (attempt.contributorLockHash !== attempt.receiptContributorLockHash) failures.push("wrong contributor");
  if (attempt.inputOutPoint !== state.treasuryCellOutPoint) failures.push("stale cell");
  if (attempt.amount > state.fundedAmount - state.releasedAmount) failures.push("refund exceeds remaining amount");
  if (attempt.assetTypeHash !== state.asset.typeHash) failures.push("mismatched xUDT type hash");
  return failures;
}

function printTimeModel() {
  printSection("1. Time-lock thinking");
  console.log("There is no background process that wakes up and refunds contributors.");
  console.log("A refund transaction becomes valid only when its inputs, witnesses, and header deps prove the deadline condition.");
  console.log("");
  console.log("Absolute lock thinking");
  console.log("  - after epoch 1250, refund transactions may satisfy the deadline rule");
  console.log("Relative lock thinking");
  console.log("  - after N epochs from a receipt's creation, refund may become valid");
}

function printReleaseCases() {
  printSection("2. Release path");
  const valid = validateRelease(ckbEscrow, {
    currentEpoch: 1_200,
    recipientLockHash: ckbEscrow.projectRecipientLockHash,
    escrowTypeHash: ckbEscrow.expectedEscrowTypeHash,
    inputOutPoint: ckbEscrow.treasuryCellOutPoint,
    amount: 500n,
    assetTypeHash: null,
  });
  const invalid = validateRelease(ckbEscrow, {
    currentEpoch: 1_200,
    recipientLockHash: "0xwrongrecipient00000000000000000000000000000000000000000000000000",
    escrowTypeHash: "0xwrongscript0000000000000000000000000000000000000000000000000000",
    inputOutPoint: "0xdeadcell000000000000000000000000000000000000000000000000000000:0x0",
    amount: 2_000n,
    assetTypeHash: null,
  });

  assert(valid.length === 0, "Valid release should pass");
  assert(invalid.includes("wrong recipient"), "Wrong recipient should fail");
  assert(invalid.includes("wrong script hash"), "Wrong script hash should fail");
  assert(invalid.includes("stale cell"), "Stale cell should fail");
  assert(invalid.includes("release exceeds funded amount"), "Excessive release should fail");

  console.log(`Valid release failures: ${valid.length}`);
  console.log(`Invalid release failures: ${invalid.join(", ")}`);
}

function printRefundCases() {
  printSection("3. Refund path");
  const early = validateRefund(ckbEscrow, {
    currentEpoch: 1_200,
    contributorLockHash: "0xalice",
    receiptContributorLockHash: "0xalice",
    inputOutPoint: ckbEscrow.treasuryCellOutPoint,
    amount: 100n,
    assetTypeHash: null,
  });
  const late = validateRefund(ckbEscrow, {
    currentEpoch: 1_251,
    contributorLockHash: "0xalice",
    receiptContributorLockHash: "0xalice",
    inputOutPoint: ckbEscrow.treasuryCellOutPoint,
    amount: 100n,
    assetTypeHash: null,
  });

  assert(early.includes("refund before deadline"), "Early refund should fail");
  assert(late.length === 0, "Late refund should pass");

  console.log(`Early refund failures: ${early.join(", ")}`);
  console.log(`Late refund failures:  ${late.length}`);
}

function printXudtCases() {
  printSection("4. xUDT identity check");
  const valid = validateRefund(xudtEscrow, {
    currentEpoch: 1_251,
    contributorLockHash: "0xcarol",
    receiptContributorLockHash: "0xcarol",
    inputOutPoint: xudtEscrow.treasuryCellOutPoint,
    amount: 1_000n,
    assetTypeHash: CKUSDT_TYPE_HASH,
  });
  const invalid = validateRefund(xudtEscrow, {
    currentEpoch: 1_251,
    contributorLockHash: "0xcarol",
    receiptContributorLockHash: "0xcarol",
    inputOutPoint: xudtEscrow.treasuryCellOutPoint,
    amount: 1_000n,
    assetTypeHash: "0xwrongxudttype00000000000000000000000000000000000000000000000000",
  });

  assert(valid.length === 0, "Valid xUDT refund should pass");
  assert(invalid.includes("mismatched xUDT type hash"), "Mismatched xUDT type hash should fail");

  console.log(`Valid xUDT refund failures: ${valid.length}`);
  console.log(`Invalid xUDT refund failures: ${invalid.join(", ")}`);
}

function printTakeaways() {
  printSection("5. Week 6 invariant (time)");
  console.log("  - Time is checked by transaction validity, not by scheduled execution.");
  console.log("  - Deadlines, recipients, stale cells, and type hashes must all be explicit.");
  console.log("  - Double release fails because the old treasury cell is no longer live.");
  console.log("  - Refund rights should be readable from receipt cells and enforceable by scripts.");
}

function main() {
  printTimeModel();
  printReleaseCases();
  printRefundCases();
  printXudtCases();
  printTakeaways();
}

try {
  main();
  process.exit(0);
} catch (error) {
  console.error("23-timelock-refund-engine failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
