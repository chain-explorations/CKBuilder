// Lesson 24 - Mainnet Deployment
//
// Production CKB work is mostly operational discipline around script identity,
// custody, and response paths. This script models deployment progression, explains
// hash_type tradeoffs, prints a checklist from local docs, and can run in a short
// checklist-only mode via `npm run checklist`.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

type EnvironmentStage = {
  name: "devnet" | "testnet" | "mainnet";
  purpose: string;
  allowedFailures: string;
  releaseGate: string;
};

type HashType = "data" | "data1" | "type";

type MonitoringSignal = {
  signal: string;
  example: string;
  severity: "info" | "warning" | "critical";
};

const STAGES: EnvironmentStage[] = [
  {
    name: "devnet",
    purpose: "fast iteration on transaction shape, witnesses, and script assumptions",
    allowedFailures: "high; break often, reset often",
    releaseGate: "repeatable local dry-runs and reviewed invariants",
  },
  {
    name: "testnet",
    purpose: "public-chain rehearsal with real RPC/indexer behavior and external wallets",
    allowedFailures: "medium; failure modes should already be understood",
    releaseGate: "stable code hash set, rehearsed operations, and documented recovery paths",
  },
  {
    name: "mainnet",
    purpose: "real value storage and settlement",
    allowedFailures: "low; every incident is expensive",
    releaseGate: "verified script hashes, strong custody, monitoring, and response playbooks",
  },
];

const MONITORING_SIGNALS: MonitoringSignal[] = [
  {
    signal: "unexpected script hash",
    example: "a transaction references an unknown lock or type script hash",
    severity: "critical",
  },
  {
    signal: "failed transaction burst",
    example: "fills or withdrawals start failing with the same witness or cell-dead pattern",
    severity: "warning",
  },
  {
    signal: "fee spike",
    example: "median fee rate jumps well above the operating band and users start timing out",
    severity: "warning",
  },
  {
    signal: "key compromise suspicion",
    example: "an unauthorized signature appears from a privileged deploy or treasury path",
    severity: "critical",
  },
];

function printSection(title: string) {
  console.log(`\n${title}`);
  console.log(`${"=".repeat(title.length)}`);
}

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function classifyHashType(hashType: HashType) {
  if (hashType === "type") {
    return {
      mutability: "upgradeable reference",
      verification: "follow the referenced type ID cell and verify its current data hash",
      useCase: "governed protocols that explicitly retain an upgrade path",
    };
  }

  if (hashType === "data1") {
    return {
      mutability: "pinned by data hash",
      verification: "recompute the binary hash locally and match it exactly",
      useCase: "production deployments that want immutability with the modern hash mode",
    };
  }

  return {
    mutability: "legacy pinned by data hash",
    verification: "recompute the binary hash locally and match it exactly",
    useCase: "older deployments or compatibility paths",
  };
}

function loadChecklist(): string[] {
  const currentFile = fileURLToPath(import.meta.url);
  const checklistPath = path.join(path.dirname(currentFile), "deploy-checklist.md");
  const contents = readFileSync(checklistPath, "utf8");
  return contents
    .split("\n")
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2));
}

function printChecklistOnly() {
  const checklist = loadChecklist();
  console.log("Week 5 mainnet checklist");
  for (const item of checklist) {
    console.log(`- ${item}`);
  }
}

function printProgression() {
  printSection("1. Deployment progression: devnet -> testnet -> mainnet");
  for (const stage of STAGES) {
    console.log(stage.name.toUpperCase());
    console.log(`  purpose:         ${stage.purpose}`);
    console.log(`  allowed failure: ${stage.allowedFailures}`);
    console.log(`  release gate:    ${stage.releaseGate}`);
    console.log("");
  }
  console.log("The same cell and script primitives travel across all three stages.");
  console.log("What changes is the cost of being wrong.");
}

function printHashTypeTradeoffs() {
  printSection("2. hash_type and code-hash verification");

  const typeModes: HashType[] = ["data1", "type", "data"];
  for (const mode of typeModes) {
    const info = classifyHashType(mode);
    console.log(mode);
    console.log(`  mutability:   ${info.mutability}`);
    console.log(`  verify by:    ${info.verification}`);
    console.log(`  use when:     ${info.useCase}`);
    console.log("");
  }

  assert(classifyHashType("data1").mutability.includes("pinned"), "data1 classification failed");
  assert(classifyHashType("type").mutability.includes("upgradeable"), "type classification failed");
}

function printCustodyExpectations() {
  printSection("3. Custody expectations");
  console.log("Mainnet assumptions");
  console.log("  - deploy keys live in hardware wallets or multisig, not in shell history");
  console.log("  - treasury authority should be separate from deployment authority");
  console.log("  - emergency actions need explicit quorum and a documented witness flow");
  console.log("");
  console.log("If a protocol keeps `hash_type = type`, governance over that type ID cell is the real upgrade key.");
}

function printMonitoringAndResponse() {
  printSection("4. Monitoring and incident response");
  for (const signal of MONITORING_SIGNALS) {
    console.log(`${signal.signal} (${signal.severity})`);
    console.log(`  example: ${signal.example}`);
  }
  console.log("");
  console.log("Response levels");
  console.log("  - L1 degraded reads: explorer or RPC disagreement; cross-check independent operators");
  console.log("  - L2 degraded writes: transactions fail but no funds appear misdirected; pause affected flows");
  console.log("  - L3 incorrect script reference: wrong code hash or hash_type in production path; stop broadcasting immediately");
  console.log("  - L4 key compromise: rotate authority, communicate publicly, and move funds if the protocol permits");
}

function printChecklistAndReview() {
  printSection("5. Production checklist and vulnerability review");
  const checklist = loadChecklist();
  const review = [
    "Wrong hash_type assumption: a transaction points at an upgradeable script when you believed it was pinned.",
    "Silent operator drift: local binary changed but no one reverified the on-chain code hash.",
    "Single-key deploy authority: one compromised laptop becomes a protocol-wide incident.",
    "Insufficient monitoring: dead-cell or stale-order failures pile up before anyone notices.",
  ];

  console.log("Checklist");
  for (const item of checklist) {
    console.log(`  - ${item}`);
  }
  console.log("");
  console.log("Vulnerability review");
  for (const item of review) {
    console.log(`  - ${item}`);
  }

  assert(checklist.length >= 5, "Checklist should expose multiple production items");
  assert(MONITORING_SIGNALS.some((signal) => signal.severity === "critical"), "Need at least one critical monitoring example");
}

function printTakeaways() {
  printSection("6. Week 5 invariant (mainnet ops)");
  console.log("  - Production risk lives in script identity, custody, and response discipline.");
  console.log("  - `data1` pins code, `type` preserves an upgrade path, and both must be verified deliberately.");
  console.log("  - Mainnet readiness is operational, not just syntactic.");
  console.log("  - Monitoring is part of the protocol surface once real value is involved.");
}

function main() {
  if (process.argv.includes("--checklist")) {
    printChecklistOnly();
    return;
  }

  printProgression();
  printHashTypeTradeoffs();
  printCustodyExpectations();
  printMonitoringAndResponse();
  printChecklistAndReview();
  printTakeaways();
}

try {
  main();
  process.exit(0);
} catch (error) {
  console.error("20-mainnet-deployment failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
