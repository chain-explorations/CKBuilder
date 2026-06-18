// Lesson 22 - Molecule Capacity Planner
//
// Molecule gives CKB protocols canonical bytes and stable layouts. This script
// keeps that idea educational: it estimates serialized sizes for schema-like
// records, converts bytes to minimum capacity, and compares inline metadata with
// a Spore/content-cell reference.

type Field = {
  name: string;
  bytes: number;
  variable?: boolean;
};

type Schema = {
  name: string;
  fields: Field[];
};

const SHANNONS_PER_CKB = 100_000_000n;
const CELL_OVERHEAD_BYTES = 61;
const MOLECULE_TABLE_HEADER_BYTES = 4;
const MOLECULE_OFFSET_BYTES = 4;
const MIN_CELL_CAPACITY = 61n * SHANNONS_PER_CKB;

const schemas: Schema[] = [
  {
    name: "ProjectData",
    fields: [
      { name: "project_id", bytes: 32 },
      { name: "owner_lock_hash", bytes: 32 },
      { name: "target_amount", bytes: 16 },
      { name: "metadata_ref", bytes: 32 },
      { name: "state", bytes: 1 },
    ],
  },
  {
    name: "MilestoneData",
    fields: [
      { name: "project_id", bytes: 32 },
      { name: "milestone_id", bytes: 4 },
      { name: "amount", bytes: 16 },
      { name: "deadline_epoch", bytes: 8 },
      { name: "status", bytes: 1 },
      { name: "approver_lock_hash", bytes: 32 },
    ],
  },
  {
    name: "ContributionReceipt",
    fields: [
      { name: "project_id", bytes: 32 },
      { name: "contributor_lock_hash", bytes: 32 },
      { name: "asset_type_hash", bytes: 32 },
      { name: "amount", bytes: 16 },
      { name: "refund_epoch", bytes: 8 },
    ],
  },
  {
    name: "ReleasePolicy",
    fields: [
      { name: "milestone_id", bytes: 4 },
      { name: "recipient_lock_hash", bytes: 32 },
      { name: "required_approval_hash", bytes: 32 },
      { name: "max_release_amount", bytes: 16 },
    ],
  },
];

function printSection(title: string) {
  console.log(`\n${title}`);
  console.log(`${"=".repeat(title.length)}`);
}

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function tableSize(schema: Schema): number {
  const offsets = schema.fields.length * MOLECULE_OFFSET_BYTES;
  const payload = schema.fields.reduce((sum, field) => sum + field.bytes, 0);
  return MOLECULE_TABLE_HEADER_BYTES + offsets + payload;
}

function requiredCapacity(bytes: number): bigint {
  const occupiedBytes = BigInt(CELL_OVERHEAD_BYTES + bytes);
  const capacity = occupiedBytes * SHANNONS_PER_CKB;
  return capacity > MIN_CELL_CAPACITY ? capacity : MIN_CELL_CAPACITY;
}

function formatCkb(shannons: bigint): string {
  const whole = shannons / SHANNONS_PER_CKB;
  const frac = shannons % SHANNONS_PER_CKB;
  return frac === 0n ? `${whole} CKB` : `${whole}.${frac.toString().padStart(8, "0")} CKB`;
}

function printMoleculeModel() {
  printSection("1. Molecule concepts without building a compiler");
  console.log("Molecule matters because protocol data becomes canonical bytes.");
  console.log("Tables use offsets, stable field order, and deterministic serialization.");
  console.log("That makes partial reading practical: a script can jump to the field it needs instead of parsing ad hoc JSON.");
  console.log("");
  console.log("If state is permanent, schema design is economic design.");
}

function printCapacityTable() {
  printSection("2. Schema sizes and locked capacity");
  let total = 0n;
  for (const schema of schemas) {
    const bytes = tableSize(schema);
    const capacity = requiredCapacity(bytes);
    total += capacity;
    assert(capacity >= BigInt(CELL_OVERHEAD_BYTES + bytes) * SHANNONS_PER_CKB, `${schema.name} is underfunded`);
    console.log(schema.name);
    console.log(`  molecule bytes:     ${bytes}`);
    console.log(`  occupied bytes:     ${CELL_OVERHEAD_BYTES + bytes}`);
    console.log(`  minimum capacity:   ${formatCkb(capacity)}`);
    console.log(`  fields:             ${schema.fields.map((field) => field.name).join(", ")}`);
  }
  console.log("");
  console.log(`Modeled one-of-each capacity lock: ${formatCkb(total)}`);
}

function printInlineVsReferenceTradeoff() {
  printSection("3. Inline data vs Spore/content reference");
  const projectBaseBytes = tableSize(schemas[0]);
  const inlineJsonBytes = projectBaseBytes + 1_800;
  const referenceBytes = projectBaseBytes;
  const inlineCapacity = requiredCapacity(inlineJsonBytes);
  const referenceCapacity = requiredCapacity(referenceBytes);
  const contentCellCapacity = requiredCapacity(1_800);

  assert(inlineCapacity > referenceCapacity, "Inline metadata should lock more project-cell capacity");
  assert(contentCellCapacity >= 1_861n * SHANNONS_PER_CKB, "Content cell capacity should cover bytes plus overhead");

  console.log("Inline metadata in ProjectData");
  console.log(`  project cell data bytes: ${inlineJsonBytes}`);
  console.log(`  project cell capacity:   ${formatCkb(inlineCapacity)}`);
  console.log("");
  console.log("Reference a Spore/content cell");
  console.log(`  project cell data bytes: ${referenceBytes}`);
  console.log(`  project cell capacity:   ${formatCkb(referenceCapacity)}`);
  console.log(`  content cell capacity:   ${formatCkb(contentCellCapacity)}`);
  console.log("");
  console.log("Tradeoff");
  console.log("  - inline: simpler lookup, larger protocol state cell");
  console.log("  - reference: smaller critical state, extra cell to index and verify");
}

function printTakeaways() {
  printSection("4. Week 6 invariant (serialization)");
  console.log("  - Canonical bytes are part of consensus-facing design.");
  console.log("  - Offsets and stable layouts make scripts and indexers less fragile.");
  console.log("  - Every persisted byte also locks capacity.");
  console.log("  - Storage cost should shape what goes in protocol cells versus content cells.");
}

function main() {
  printMoleculeModel();
  printCapacityTable();
  printInlineVsReferenceTradeoff();
  printTakeaways();
}

try {
  main();
  process.exit(0);
} catch (error) {
  console.error("22-molecule-capacity-planner failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
