import { ccc } from "@ckb-ccc/core";

const client = new ccc.ClientPublicTestnet();
const blockNumber = BigInt(process.env.CKB_EXERCISE_BLOCK ?? "21076742");

function shannonsToCKB(shannons: bigint): string {
  return `${Number(shannons) / 1e8} CKB`;
}

async function main() {
  const tipHeader = await client.getTipHeader();
  console.log(`Current tip block: #${tipHeader.number}`);
  console.log(`Inspecting pinned block: #${blockNumber}\n`);

  const block = await client.getBlockByNumber(blockNumber);
  if (!block) {
    throw new Error(`Block #${blockNumber} was not found on testnet.`);
  }

  console.log(`Block hash: ${block.header.hash}`);
  console.log(`Transaction count: ${block.transactions.length}\n`);

  if (block.transactions.length < 2) {
    throw new Error(
      "The pinned block only contains a cellbase transaction. Pick a block with a user transaction.",
    );
  }

  const tx = block.transactions[1];
  const txHash = tx.hash();

  console.log(`Inspecting transaction: ${txHash}`);
  console.log(`Inputs: ${tx.inputs.length}`);
  console.log(`Outputs: ${tx.outputs.length}\n`);

  let totalInputs = 0n;
  for (const [index, input] of tx.inputs.entries()) {
    const prevTx = await client.getTransaction(input.previousOutput.txHash);
    const prevOutputIndex = Number(input.previousOutput.index);
    const prevCell = prevTx.transaction.outputs[prevOutputIndex];

    totalInputs += prevCell.capacity;

    console.log(`Input ${index}`);
    console.log(
      `  Previous output: ${input.previousOutput.txHash}:${input.previousOutput.index}`,
    );
    console.log(`  Since: ${input.since}`);
    console.log(
      `  Capacity: ${prevCell.capacity} shannons (${shannonsToCKB(prevCell.capacity)})`,
    );
    console.log("");
  }

  let totalOutputs = 0n;
  for (const [index, output] of tx.outputs.entries()) {
    const data = tx.outputsData[index];
    totalOutputs += output.capacity;

    console.log(`Output ${index}`);
    console.log(
      `  Capacity: ${output.capacity} shannons (${shannonsToCKB(output.capacity)})`,
    );
    console.log(`  Lock code hash: ${output.lock.codeHash}`);
    console.log(`  Type code hash: ${output.type ? output.type.codeHash : "none"}`);
    console.log(`  Data: ${data === "0x" ? "(empty)" : data}`);
    console.log("");
  }

  const fee = totalInputs - totalOutputs;

  console.log("Summary");
  console.log(
    `  Total input capacity: ${totalInputs} shannons (${shannonsToCKB(totalInputs)})`,
  );
  console.log(
    `  Total output capacity: ${totalOutputs} shannons (${shannonsToCKB(totalOutputs)})`,
  );
  console.log(`  Transaction fee: ${fee} shannons (${shannonsToCKB(fee)})`);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("02-transaction-anatomy failed.");
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
