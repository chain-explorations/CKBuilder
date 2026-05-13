import { ccc } from "@ckb-ccc/core";

const client = new ccc.ClientPublicTestnet();

function ckbToShannons(amount: string): bigint {
  const [wholePart, fractionalPart = ""] = amount.trim().split(".");
  if (!/^\d+$/.test(wholePart) || !/^\d*$/.test(fractionalPart)) {
    throw new Error(`Invalid CKB amount: "${amount}"`);
  }
  if (fractionalPart.length > 8) {
    throw new Error("CKB amounts support at most 8 decimal places.");
  }

  const whole = BigInt(wholePart);
  const fractional = BigInt(fractionalPart.padEnd(8, "0") || "0");
  return whole * 100_000_000n + fractional;
}

function shannonsToCKB(shannons: bigint): string {
  const whole = shannons / 100_000_000n;
  const fraction = shannons % 100_000_000n;
  return fraction === 0n
    ? `${whole} CKB`
    : `${whole}.${fraction.toString().padStart(8, "0").replace(/0+$/, "")} CKB`;
}

async function main() {
  const privateKey = process.env.CKB_PRIVATE_KEY;
  const recipientAddressText = process.env.CKB_RECIPIENT_ADDRESS;
  const amountText = process.env.CKB_TRANSFER_CKB ?? "61";
  const shouldBroadcast = process.env.CKB_BROADCAST === "true";

  const tip = await client.getTip();
  console.log(`Connected to CKB testnet at block #${tip}\n`);

  if (!privateKey || !recipientAddressText) {
    console.log("This exercise is configured as a safe dry run by default.");
    console.log("Set these environment variables to build and sign a transfer:");
    console.log("  CKB_PRIVATE_KEY=<32-byte hex private key>");
    console.log("  CKB_RECIPIENT_ADDRESS=<testnet address>");
    console.log("  CKB_TRANSFER_CKB=61");
    console.log("  CKB_BROADCAST=true   # optional, only if you want to send it");
    return;
  }

  const signer = new ccc.SignerCkbPrivateKey(client, privateKey);
  const recipient = await ccc.Address.fromString(recipientAddressText, client);
  const amountShannons = ckbToShannons(amountText);

  const senderAddress = await signer.getInternalAddress();
  const balance = await signer.getBalance();

  console.log(`Sender: ${senderAddress}`);
  console.log(`Recipient: ${recipient.toString()}`);
  console.log(`Balance: ${balance} shannons (${shannonsToCKB(balance)})`);
  console.log(`Transfer amount: ${amountShannons} shannons (${shannonsToCKB(amountShannons)})\n`);

  const tx = ccc.Transaction.from({});
  tx.addOutput(
    {
      capacity: amountShannons,
      lock: recipient.script,
    },
    "0x",
  );

  const [addedInputs, hasChange] = await tx.completeFeeBy(signer);
  const signedTx = await signer.signTransaction(tx);

  console.log("Transaction prepared successfully.");
  console.log(`  Inputs added: ${addedInputs}`);
  console.log(`  Change output created: ${hasChange}`);
  console.log(`  Outputs: ${signedTx.outputs.length}`);

  if (!shouldBroadcast) {
    console.log("\nDry run only. Set CKB_BROADCAST=true to send the signed transaction.");
    return;
  }

  const txHash = await client.sendTransaction(signedTx);
  console.log(`\nTransaction sent: ${txHash}`);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("04-first-ckb-transfer failed.");
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
