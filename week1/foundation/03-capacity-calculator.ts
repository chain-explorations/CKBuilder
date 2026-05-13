type CapacityBreakdown = {
  capacityFieldBytes: number;
  lockScriptBytes: number;
  typeScriptBytes: number;
  dataBytes: number;
  totalBytes: number;
  totalShannons: bigint;
  totalCKBytes: number;
};

const SHANNONS_PER_CKBYTE = 100_000_000n;

function calculateCapacity(
  dataSize: number,
  hasTypeScript = false,
  lockArgsSize = 20,
  typeArgsSize = 20,
): CapacityBreakdown {
  const capacityFieldBytes = 8;
  const lockScriptBytes = 32 + 1 + lockArgsSize;
  const typeScriptBytes = hasTypeScript ? 32 + 1 + typeArgsSize : 0;
  const dataBytes = dataSize;

  const totalBytes =
    capacityFieldBytes + lockScriptBytes + typeScriptBytes + dataBytes;

  return {
    capacityFieldBytes,
    lockScriptBytes,
    typeScriptBytes,
    dataBytes,
    totalBytes,
    totalShannons: BigInt(totalBytes) * SHANNONS_PER_CKBYTE,
    totalCKBytes: totalBytes,
  };
}

function calculateDAOCompensation(
  depositCKB: bigint,
  durationDays: number,
  totalCirculatingCKB: bigint = 44_000_000_000n,
  totalDAODepositCKB: bigint = 6_000_000_000n,
  annualSecondaryIssuance: bigint = 1_344_000_000n,
): number {
  const daoShareRatio =
    Number(totalDAODepositCKB) / Number(totalCirculatingCKB);
  const daoAnnualCKB = Number(annualSecondaryIssuance) * daoShareRatio;
  const yourAnnualCKB =
    daoAnnualCKB * (Number(depositCKB) / Number(totalDAODepositCKB));

  return Math.round(yourAnnualCKB * (durationDays / 365));
}

function assertEqual(actual: number, expected: number, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

function printBreakdown(name: string, breakdown: CapacityBreakdown) {
  console.log(name);
  console.log(`  Capacity field: ${breakdown.capacityFieldBytes} bytes`);
  console.log(`  Lock script: ${breakdown.lockScriptBytes} bytes`);
  console.log(`  Type script: ${breakdown.typeScriptBytes} bytes`);
  console.log(`  Data: ${breakdown.dataBytes} bytes`);
  console.log(`  Total: ${breakdown.totalBytes} bytes`);
  console.log(`  Required capacity: ${breakdown.totalCKBytes} CKB`);
  console.log("");
}

async function main() {
  const minimal = calculateCapacity(0, false);
  const hashCell = calculateCapacity(32, false);
  const tokenCell = calculateCapacity(16, true, 20, 20);
  const dataCell = calculateCapacity(1024, false);
  const daoCell = calculateCapacity(8, true, 20, 0);

  assertEqual(minimal.totalBytes, 61, "Minimal cell");
  assertEqual(hashCell.totalBytes, 93, "32-byte hash cell");
  assertEqual(tokenCell.totalBytes, 130, "xUDT-style token cell");
  assertEqual(dataCell.totalBytes, 1085, "1 KB data cell");
  assertEqual(daoCell.totalBytes, 102, "DAO cell");

  console.log("Capacity examples\n");
  printBreakdown("1. Minimal cell", minimal);
  printBreakdown("2. 32-byte hash cell", hashCell);
  printBreakdown("3. xUDT-style token cell", tokenCell);
  printBreakdown("4. 1 KB data cell", dataCell);
  printBreakdown("5. Nervos DAO deposit cell", daoCell);

  const depositCKB = 10_000n;
  const durationDays = 180;
  const compensation = calculateDAOCompensation(depositCKB, durationDays);

  console.log("DAO estimate");
  console.log(`  Deposit: ${depositCKB} CKB`);
  console.log(`  Duration: ${durationDays} days`);
  console.log(`  Estimated secondary issuance compensation: ${compensation} CKB`);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("03-capacity-calculator failed.");
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
