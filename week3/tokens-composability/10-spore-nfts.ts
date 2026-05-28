import * as SporeSDK from "@spore-sdk/core";
import { ccc } from "@ckb-ccc/core";

type SporeRecord = {
  contentType: string;
  content: string;
  clusterId?: string;
};

type ClusterRecord = {
  name: string;
  description: string;
};

const SHANNONS_PER_CKB = 100_000_000n;
const SPORE_TYPE_HASH =
  "0x50bd8d6680b8b9cf98b73f3c08faf8b2a21914311954118ad6609be6e78a1b95";
const CLUSTER_TYPE_HASH =
  "0x9b5d3a7ad7f52a0d4a932c3537ae0db693087e5d2f0e8fe455d1a6352cc0ab09";
const SAMPLE_SPORE_ID =
  "0x6c95d7b5efad573b8ecf3f80be489ff7385fb3cf18ea2aa2cc0a16d45b5f0d31";
const SAMPLE_CLUSTER_ID =
  "0x8127bcf7f2337165f4be4c10d74e0d396cb0b46df2fd565f67c5b267d24ec64a";

function utf8Bytes(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

function formatCkb(shannons: bigint): string {
  const whole = shannons / SHANNONS_PER_CKB;
  const fraction = (shannons % SHANNONS_PER_CKB).toString().padStart(8, "0");
  return `${whole}.${fraction.replace(/0+$/, "") || "0"} CKB`;
}

function calculateOccupiedCapacity(dataBytes: number, typeArgsBytes = 32): bigint {
  const capacityFieldBytes = 8;
  const lockScriptBytes = 32 + 1 + 20;
  const typeScriptBytes = 32 + 1 + typeArgsBytes;
  const totalBytes = capacityFieldBytes + lockScriptBytes + typeScriptBytes + dataBytes;
  return BigInt(totalBytes) * SHANNONS_PER_CKB;
}

function printSection(title: string) {
  console.log(`\n${title}`);
  console.log(`${"=".repeat(title.length)}`);
}

function pseudoMoleculeTable(fields: Array<[string, number]>) {
  let offset = 4 * (fields.length + 1);
  const rows = fields.map(([name, byteLength]) => {
    const row = { name, offset, byteLength };
    offset += byteLength;
    return row;
  });
  return { headerBytes: 4 * (fields.length + 1), rows, totalBytes: offset };
}

function describeSpore(record: SporeRecord) {
  const contentTypeBytes = utf8Bytes(record.contentType);
  const contentBytes = utf8Bytes(record.content);
  const clusterBytes = record.clusterId ? (record.clusterId.length - 2) / 2 : 0;

  return pseudoMoleculeTable([
    ["content_type", contentTypeBytes],
    ["content", contentBytes],
    ["cluster_id", clusterBytes],
  ]);
}

function describeCluster(record: ClusterRecord) {
  return pseudoMoleculeTable([
    ["name", utf8Bytes(record.name)],
    ["description", utf8Bytes(record.description)],
  ]);
}

function printSporeStructure() {
  printSection("1. Spore mental model");
  console.log("Spore is not an NFT pointer plus contract metadata.");
  console.log("A Spore cell is the object: immutable content, MIME type, optional cluster linkage, and capacity.\n");

  console.log("Spore cell shape");
  console.log(`  type.code_hash: ${SPORE_TYPE_HASH}`);
  console.log("  type.hash_type: data1");
  console.log(`  type.args:      ${SAMPLE_SPORE_ID}  # Type ID style unique Spore ID`);
  console.log("  data fields:    content-type, content, optional cluster_id");
  console.log("");
  console.log("Cluster cell shape");
  console.log(`  type.code_hash: ${CLUSTER_TYPE_HASH}`);
  console.log("  type.hash_type: data1");
  console.log(`  type.args:      ${SAMPLE_CLUSTER_ID}  # Type ID style unique Cluster ID`);
  console.log("  data fields:    name, description");
  console.log("");
  console.log("Key issue worth noting");
  console.log("  - Cluster cells do not contain Spore cells. The linkage is by ID reference, not nested ownership.");
}

function printMoleculeLayouts() {
  printSection("2. Molecule-style layout walkthrough");

  const spore: SporeRecord = {
    contentType: "image/svg+xml",
    content: "<svg viewBox='0 0 12 12'><circle cx='6' cy='6' r='5'/></svg>",
    clusterId: SAMPLE_CLUSTER_ID,
  };
  const cluster: ClusterRecord = {
    name: "Week 3 Collectibles",
    description: "A dry-run collection for understanding how Cluster IDs link independent Spore cells.",
  };

  const sporeLayout = describeSpore(spore);
  const clusterLayout = describeCluster(cluster);

  console.log("Spore molecule table");
  console.log(`  header bytes: ${sporeLayout.headerBytes}`);
  for (const row of sporeLayout.rows) {
    console.log(
      `  ${row.name.padEnd(14)} offset=${row.offset.toString().padStart(3)} bytes=${row.byteLength}`,
    );
  }
  console.log(`  total encoded payload bytes (model): ${sporeLayout.totalBytes}`);
  console.log("");

  console.log("Cluster molecule table");
  console.log(`  header bytes: ${clusterLayout.headerBytes}`);
  for (const row of clusterLayout.rows) {
    console.log(
      `  ${row.name.padEnd(14)} offset=${row.offset.toString().padStart(3)} bytes=${row.byteLength}`,
    );
  }
  console.log(`  total encoded payload bytes (model): ${clusterLayout.totalBytes}`);
}

function printCapacityExamples() {
  printSection("3. Capacity calculations by content type");

  const examples = [
    {
      label: "Plain text note",
      contentType: "text/plain;charset=utf-8",
      content: "Protocols do not own assets. Cells do.",
    },
    {
      label: "SVG badge",
      contentType: "image/svg+xml",
      content: "<svg viewBox='0 0 12 12'><rect width='12' height='12' rx='2'/><text x='6' y='7'>CKB</text></svg>",
    },
    {
      label: "JSON metadata",
      contentType: "application/json",
      content:
        JSON.stringify({
          title: "Week 3 demo",
          tags: ["spore", "xudt", "cells"],
          thesis: "The cell is the object.",
        }),
    },
    {
      label: "Lua script object",
      contentType: "application/lua",
      content: "return { title = 'autoload demo', render = function() return 'hello spore' end }",
    },
  ];

  for (const example of examples) {
    const payload = describeSpore({
      contentType: example.contentType,
      content: example.content,
    });
    const occupied = calculateOccupiedCapacity(payload.totalBytes);
    console.log(example.label);
    console.log(`  content-type bytes: ${utf8Bytes(example.contentType)}`);
    console.log(`  content bytes:      ${utf8Bytes(example.content)}`);
    console.log(`  modeled payload:    ${payload.totalBytes} bytes`);
    console.log(`  occupied capacity:  ${occupied} shannons (${formatCkb(occupied)})`);
    console.log("");
  }

  console.log("Issue to remember");
  console.log("  - richer content is not a metadata convenience; it directly increases occupied capacity.");
}

function printTransactionDryRuns() {
  printSection("4. Dry-run transaction shapes");

  const cluster = describeCluster({
    name: "Week 3 Collectibles",
    description: "Used by every Spore in this walkthrough.",
  });
  const spore = describeSpore({
    contentType: "image/svg+xml",
    content: "<svg viewBox='0 0 12 12'><circle cx='6' cy='6' r='5'/></svg>",
    clusterId: SAMPLE_CLUSTER_ID,
  });

  const clusterCapacity = calculateOccupiedCapacity(cluster.totalBytes);
  const sporeCapacity = calculateOccupiedCapacity(spore.totalBytes);

  console.log("Cluster creation");
  console.log("  inputs:  plain CKB funding cells");
  console.log("  outputs: Cluster cell");
  console.log(`  capacity reserved: ${formatCkb(clusterCapacity)}`);
  console.log(`  cluster id: ${SAMPLE_CLUSTER_ID}`);
  console.log("");

  console.log("Spore creation");
  console.log("  inputs:  plain CKB funding cells");
  console.log("  outputs: Spore cell linked to cluster by cluster_id");
  console.log(`  capacity reserved: ${formatCkb(sporeCapacity)}`);
  console.log(`  spore id: ${SAMPLE_SPORE_ID}`);
  console.log("");

  console.log("Decode flow");
  console.log("  1. Read the cell type script to confirm it is a Spore or Cluster cell.");
  console.log("  2. Parse molecule data into named fields.");
  console.log("  3. Interpret `content-type` as MIME, not as off-chain convention.");
  console.log("  4. If `cluster_id` exists, fetch that Cluster cell separately for display context.");
}

function printMeltingModel() {
  printSection("5. Melting and intrinsic value");

  const payload = describeSpore({
    contentType: "text/plain",
    content: "hello, Spore",
  });
  const occupied = calculateOccupiedCapacity(payload.totalBytes);
  const infused = occupied + 25n * SHANNONS_PER_CKB;

  console.log("A Spore can carry more capacity than its minimum occupied requirement.");
  console.log(`  occupied minimum: ${formatCkb(occupied)}`);
  console.log(`  example infused value: ${formatCkb(infused)}`);
  console.log("");
  console.log("Melting model");
  console.log("  input:  one Spore cell");
  console.log("  output: plain CKB cell(s)");
  console.log("  effect: object disappears, capacity survives");
  console.log("");
  console.log("Interpretation");
  console.log("  - on Ethereum an NFT burn usually destroys the pointer but not a recoverable storage-backed object");
  console.log("  - on Spore, the object is the cell, so melting is just reclaiming the cell's capacity");
}

async function maybeRunLiveExample() {
  printSection("6. Optional live path");

  const shouldRun = process.env.CKB_RUN_SPORE_LIVE === "true";
  if (!shouldRun) {
    console.log("Skipping live queries.");
    console.log("Set `CKB_RUN_SPORE_LIVE=true` and provide funded testnet credentials if you want to explore live create/query flows.");
    return;
  }

  const privateKey = process.env.CKB_PRIVATE_KEY;
  if (!privateKey) {
    console.log("Live mode requested, but `CKB_PRIVATE_KEY` is missing.");
    console.log("Leaving the walkthrough in dry-run mode so the script still succeeds.");
    return;
  }

  try {
    const client = new ccc.ClientPublicTestnet();
    const tip = await client.getTip();
    console.log(`Connected to CKB testnet at block #${tip}`);
    console.log("This script intentionally stops short of broadcasting a Spore transaction.");
    console.log("Use the funded environment only after you are ready to build a real create/query flow.");
    void privateKey;
    void SporeSDK;
  } catch (error) {
    console.log("Live query failed gracefully.");
    console.log(error instanceof Error ? `  ${error.message}` : `  ${error}`);
    console.log("Dry-run explanations above remain valid without funded state.");
  }
}

async function main() {
  void SporeSDK;
  printSporeStructure();
  printMoleculeLayouts();
  printCapacityExamples();
  printTransactionDryRuns();
  printMeltingModel();
  await maybeRunLiveExample();
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("10-spore-nfts failed.");
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
