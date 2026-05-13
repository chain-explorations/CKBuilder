import { ccc } from "@ckb-ccc/core";

const client = new ccc.ClientPublicTestnet();
const maxCells = Number(process.env.CKB_EXERCISE_MAX_CELLS ?? "5");

const lockScript: ccc.ScriptLike = {
  codeHash:
    "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8",
  hashType: "type",
  args: "0xe2fa82e70b062c8644b80ad7ecf6e015e5f352f6",
};

function shannonsToCKB(shannons: bigint): string {
  const whole = shannons / 100_000_000n;
  const fraction = shannons % 100_000_000n;
  return fraction === 0n
    ? `${whole} CKB`
    : `${whole}.${fraction.toString().padStart(8, "0").replace(/0+$/, "")} CKB`;
}

function hexByteLength(hex: string): number {
  if (hex === "0x") {
    return 0;
  }

  return (hex.length - 2) / 2;
}

async function main() {
  const tip = await client.getTip();
  console.log(`Connected to CKB testnet at block #${tip}`);
  console.log(`Inspecting up to ${maxCells} cells for the sample lock script...\n`);

  let index = 0;
  for await (const cell of client.findCellsByLock(lockScript)) {
    index += 1;

    console.log(`Cell ${index}`);
    console.log(
      `  Capacity: ${cell.cellOutput.capacity} shannons (${shannonsToCKB(cell.cellOutput.capacity)})`,
    );
    console.log(`  Has type script: ${cell.cellOutput.type !== null}`);
    console.log(`  Data size: ${hexByteLength(cell.outputData)} bytes`);
    console.log(`  Out point: ${cell.outPoint.txHash}:${cell.outPoint.index}`);
    console.log("");

    if (index >= maxCells) {
      break;
    }
  }

  if (index === 0) {
    console.log("No cells were found for the sample lock script.");
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("01-cell-model-explorer failed.");
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
