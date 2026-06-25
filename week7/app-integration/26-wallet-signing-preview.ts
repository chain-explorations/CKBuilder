// Lesson 26 - Wallet Signing Preview
//
// A wallet should not be asked to sign an opaque blob. This exercise models the
// preview boundary: what cells are consumed, what cells are created, which role
// signs, what witness groups are needed, and which warnings the frontend must
// surface before signature.

type Script = {
  codeHash: string;
  hashType: "type" | "data" | "data1";
  args: string;
};

type LiveCell = {
  outPoint: string;
  capacity: bigint;
  lockHash: string;
  lock: Script;
  asset: "CKB" | "ckUSDT";
  amount: bigint;
};

type PlannedOutput = {
  label: string;
  lockHash: string;
  asset: "CKB" | "ckUSDT";
  amount: bigint;
};

type WitnessGroup = {
  lockHash: string;
  inputIndices: number[];
  signerRole: "contributor" | "project-owner" | "approver";
};

type TransactionPlan = {
  actionName: string;
  inputs: LiveCell[];
  outputs: PlannedOutput[];
  witnessGroups: WitnessGroup[];
  riskChecks: string[];
};

type WalletPreview = {
  actionName: string;
  consumedCells: string[];
  createdCells: string[];
  signerRole: "contributor" | "project-owner" | "approver" | "unknown";
  recipientLockHashes: string[];
  assetDeltas: Record<string, bigint>;
  warnings: string[];
};

function printSection(title: string) {
  console.log(`\n${title}`);
  console.log(`${"=".repeat(title.length)}`);
}

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function sampleContributionPlan(): TransactionPlan {
  const aliceLock: Script = {
    codeHash: "secp256k1-lock",
    hashType: "type",
    args: "alice-lock",
  };

  return {
    actionName: "contribute to launch-0x42",
    inputs: [
      {
        outPoint: "tx-alice-funds:0",
        capacity: 1_000n,
        lockHash: "alice-lock",
        lock: aliceLock,
        asset: "CKB",
        amount: 1_000n,
      },
    ],
    outputs: [
      {
        label: "treasury contribution",
        lockHash: "escrow-lock",
        asset: "CKB",
        amount: 600n,
      },
      {
        label: "contribution receipt",
        lockHash: "alice-lock",
        asset: "CKB",
        amount: 142n,
      },
      {
        label: "contributor change",
        lockHash: "alice-lock",
        asset: "CKB",
        amount: 258n,
      },
    ],
    witnessGroups: [{ lockHash: "alice-lock", inputIndices: [0], signerRole: "contributor" }],
    riskChecks: [
      "receipt amount equals treasury contribution",
      "capacity balances before signing",
    ],
  };
}

function buildWalletPreview(plan: TransactionPlan, signerLockHash: string): WalletPreview {
  const signerGroup = plan.witnessGroups.find((group) => group.lockHash === signerLockHash);
  const deltas: Record<string, bigint> = {};

  for (const input of plan.inputs) {
    if (input.lockHash !== signerLockHash) continue;
    deltas[input.asset] = (deltas[input.asset] ?? 0n) - input.amount;
  }

  for (const output of plan.outputs) {
    if (output.lockHash !== signerLockHash) continue;
    if (output.label.includes("receipt")) continue;
    deltas[output.asset] = (deltas[output.asset] ?? 0n) + output.amount;
  }

  return {
    actionName: plan.actionName,
    consumedCells: plan.inputs.map((input) => input.outPoint),
    createdCells: plan.outputs.map((output) => output.label),
    signerRole: signerGroup?.signerRole ?? "unknown",
    recipientLockHashes: [...new Set(plan.outputs.map((output) => output.lockHash))],
    assetDeltas: deltas,
    warnings: plan.riskChecks.filter((check) => {
      const lower = check.toLowerCase();
      return lower.includes("stale") || lower.includes("wrong") || lower.includes("missing") || lower.includes("unknown");
    }),
  };
}

function validatePreviewBeforeSigning(preview: WalletPreview, expectedRecipientLockHash: string): string[] {
  const failures: string[] = [];
  if (preview.signerRole === "unknown") failures.push("unknown signer role");
  if (!preview.recipientLockHashes.includes(expectedRecipientLockHash)) failures.push("expected recipient lock missing");
  if (preview.consumedCells.length === 0) failures.push("no consumed cells to sign");
  if (preview.createdCells.length === 0) failures.push("no created cells to preview");
  if (preview.warnings.length > 0) failures.push("preview contains warnings");
  return failures;
}

function printContributionPreview() {
  printSection("1. Contribution signing preview");
  const plan = sampleContributionPlan();
  const preview = buildWalletPreview(plan, "alice-lock");
  const validation = validatePreviewBeforeSigning(preview, "escrow-lock");

  assert(preview.actionName === "contribute to launch-0x42", "Preview should keep the action name");
  assert(preview.consumedCells.length === 1, "Preview should expose consumed cells");
  assert(preview.createdCells.includes("treasury contribution"), "Preview should expose created treasury cell");
  assert(preview.createdCells.includes("contribution receipt"), "Preview should expose created receipt cell");
  assert(preview.signerRole === "contributor", "Signer role should be contributor");
  assert(preview.assetDeltas["CKB"] === -742n, "Preview should show signer CKB delta including receipt capacity and fee");
  assert(validation.length === 0, "Expected contribution preview should validate");

  console.log(`action:       ${preview.actionName}`);
  console.log(`signer role:  ${preview.signerRole}`);
  console.log(`consumes:     ${preview.consumedCells.join(", ")}`);
  console.log(`creates:      ${preview.createdCells.join(", ")}`);
  console.log(`recipients:   ${preview.recipientLockHashes.join(", ")}`);
  console.log(`CKB delta:    ${preview.assetDeltas["CKB"]}`);
}

function printInvalidPreview() {
  printSection("2. Frontend checks before signature");
  const plan = sampleContributionPlan();
  plan.outputs[0] = { ...plan.outputs[0], lockHash: "attacker-lock" };
  plan.riskChecks.push("stale candidate: treasury tip behind full node");

  const preview = buildWalletPreview(plan, "alice-lock");
  const validation = validatePreviewBeforeSigning(preview, "escrow-lock");

  assert(preview.warnings.includes("stale candidate: treasury tip behind full node"), "Preview should surface plan warnings");
  assert(validation.includes("expected recipient lock missing"), "Frontend should reject wrong recipient lock");
  assert(validation.includes("preview contains warnings"), "Frontend should reject warned previews before signing");

  console.log(`warnings:     ${preview.warnings.join(", ")}`);
  console.log(`validation:   ${validation.join(", ")}`);
}

function printWitnessBoundary() {
  printSection("3. Witness groups and wallet boundary");
  const plan = sampleContributionPlan();
  const preview = buildWalletPreview(plan, "alice-lock");
  const signerGroup = plan.witnessGroups.find((group) => group.lockHash === "alice-lock");

  assert(signerGroup?.inputIndices.join(",") === "0", "Contributor witness group should cover the contributor input");
  assert(preview.signerRole !== "unknown", "Wallet should know which role is signing");

  console.log("The frontend assembles and validates the transaction plan.");
  console.log("The wallet signs the witness group controlled by the signer lock.");
  console.log("Neither side should pretend the other side already checked business logic.");
}

function main() {
  printContributionPreview();
  printInvalidPreview();
  printWitnessBoundary();
  printSection("4. Week 7 invariant (wallet boundary)");
  console.log("  - Signing is not the same job as transaction construction.");
  console.log("  - The preview must name consumed cells, created cells, signer role, recipients, deltas, and warnings.");
  console.log("  - A frontend should reject suspicious previews before the wallet signs them.");
}

try {
  main();
  process.exit(0);
} catch (error) {
  console.error("26-wallet-signing-preview failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
