// Lesson 24 - Indexer, Monitoring, and Audit
//
// A production CKB app is only as good as its ability to find, verify, and
// explain its cells. This script models indexer search keys, light-client watch
// lists, full-node verification, monitoring signals, and an audit checklist that
// maps rules back to the cells or scripts enforcing them.

type Script = {
  code_hash: string;
  hash_type: "type" | "data" | "data1";
  args: string;
};

type SearchKey = {
  script: Script;
  script_type: "lock" | "type";
  filter?: {
    output_data_len_range?: [string, string];
  };
};

type MonitoringSignal = {
  signal: string;
  example: string;
  severity: "info" | "warning" | "critical";
};

type AuditRule = {
  rule: string;
  enforcedBy: string;
  evidence: string;
};

const PROJECT_ID = "0xlaunch42";
const LAUNCH_TYPE_HASH = "0xlaunch0000000000000000000000000000000000000000000000000000000001";
const MILESTONE_TYPE_HASH = "0xmstone000000000000000000000000000000000000000000000000000000002";
const RECEIPT_TYPE_HASH = "0xreceipt00000000000000000000000000000000000000000000000000000003";
const ESCROW_LOCK_HASH = "0xescrowlock00000000000000000000000000000000000000000000000000004";

const signals: MonitoringSignal[] = [
  {
    signal: "unexpected script hash",
    example: "a release transaction references a lock or type hash outside the deployment manifest",
    severity: "critical",
  },
  {
    signal: "deadline approaching",
    example: "milestone m2 is within 72 hours of refund eligibility",
    severity: "warning",
  },
  {
    signal: "stuck funds",
    example: "treasury has funded capacity but no valid release or refund transaction has landed",
    severity: "warning",
  },
  {
    signal: "dead-cell failures",
    example: "many user refunds fail because wallets assembled transactions from stale receipts",
    severity: "warning",
  },
  {
    signal: "suspicious release attempts",
    example: "release attempts target a recipient lock hash different from project policy",
    severity: "critical",
  },
];

const auditRules: AuditRule[] = [
  {
    rule: "Project identity is stable",
    enforcedBy: "launch cell type script",
    evidence: "project_id is in type args and indexed by launch type hash",
  },
  {
    rule: "Receipts equal contributions",
    enforcedBy: "contribution transaction shape and receipt type script",
    evidence: "receipt amount equals consumed contributor asset amount",
  },
  {
    rule: "Milestone release cannot exceed funding",
    enforcedBy: "escrow type script",
    evidence: "treasury input amount minus output amount equals approved milestone amount",
  },
  {
    rule: "Refunds wait until deadline",
    enforcedBy: "refund path lock/type checks plus header deps",
    evidence: "transaction includes header proving epoch greater than milestone deadline",
  },
  {
    rule: "xUDT identity cannot be substituted",
    enforcedBy: "xUDT type script hash comparison",
    evidence: "escrow and receipt asset_type_hash match the expected xUDT type hash",
  },
];

function printSection(title: string) {
  console.log(`\n${title}`);
  console.log(`${"=".repeat(title.length)}`);
}

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function buildSearchKeys(projectId: string): Record<string, SearchKey> {
  return {
    projectCells: {
      script: {
        code_hash: LAUNCH_TYPE_HASH,
        hash_type: "type",
        args: projectId,
      },
      script_type: "type",
      filter: { output_data_len_range: ["0x20", "0x200"] },
    },
    milestoneCells: {
      script: {
        code_hash: MILESTONE_TYPE_HASH,
        hash_type: "type",
        args: projectId,
      },
      script_type: "type",
      filter: { output_data_len_range: ["0x20", "0x200"] },
    },
    receiptCells: {
      script: {
        code_hash: RECEIPT_TYPE_HASH,
        hash_type: "type",
        args: projectId,
      },
      script_type: "type",
      filter: { output_data_len_range: ["0x20", "0x200"] },
    },
    treasuryCells: {
      script: {
        code_hash: ESCROW_LOCK_HASH,
        hash_type: "type",
        args: projectId,
      },
      script_type: "lock",
      filter: { output_data_len_range: ["0x0", "0x400"] },
    },
  };
}

function printSearchKeys() {
  printSection("1. RPC/indexer search keys");
  const keys = buildSearchKeys(PROJECT_ID);
  assert(Object.keys(keys).length === 4, "Expected search keys for project, milestone, receipt, and treasury cells");
  console.log(JSON.stringify(keys, null, 2));
}

function printVerificationPath() {
  printSection("2. Light-client watch list and full-node verification");
  console.log("Light-client watch list");
  console.log(`  - launch type hash:    ${LAUNCH_TYPE_HASH}`);
  console.log(`  - milestone type hash: ${MILESTONE_TYPE_HASH}`);
  console.log(`  - receipt type hash:   ${RECEIPT_TYPE_HASH}`);
  console.log(`  - escrow lock hash:    ${ESCROW_LOCK_HASH}`);
  console.log("");
  console.log("Full-node verification path");
  console.log("  1. query indexer for candidate live cells");
  console.log("  2. fetch full transactions and referenced outputs by outpoint");
  console.log("  3. recompute script hashes and compare deployment manifest");
  console.log("  4. decode Molecule data and verify project id, amounts, deadlines, and recipients");
  console.log("  5. reject stale cells immediately before broadcast");
}

function printMonitoringSignals() {
  printSection("3. Monitoring signals");
  assert(signals.some((signal) => signal.severity === "critical"), "Monitoring checklist needs a critical alert");
  for (const signal of signals) {
    console.log(`${signal.signal} (${signal.severity})`);
    console.log(`  example: ${signal.example}`);
  }
}

function printAuditChecklist() {
  printSection("4. Audit checklist: rule -> enforcing surface");
  assert(auditRules.length >= 5, "Audit checklist should cover the core protocol rules");
  for (const item of auditRules) {
    console.log(item.rule);
    console.log(`  enforced by: ${item.enforcedBy}`);
    console.log(`  evidence:    ${item.evidence}`);
  }
}

function printTakeaways() {
  printSection("5. Week 6 invariant (operations)");
  console.log("  - Indexing is a protocol concern because users need to find the right live cells.");
  console.log("  - Light clients need explicit watch lists; full nodes provide the strongest verification path.");
  console.log("  - Monitoring should alert on cell-shape and script-identity violations, not just server uptime.");
  console.log("  - An audit is clearer when every rule maps to a cell, script, witness, or header precondition.");
}

function main() {
  printSearchKeys();
  printVerificationPath();
  printMonitoringSignals();
  printAuditChecklist();
  printTakeaways();
}

try {
  main();
  process.exit(0);
} catch (error) {
  console.error("24-indexer-monitoring-audit failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
