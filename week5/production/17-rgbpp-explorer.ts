// Lesson 21 - RGB++ Explorer
//
// RGB++ matters because it binds a Bitcoin UTXO to a CKB cell without introducing
// a custodian. The lock args are the bridge: reversed Bitcoin txid + vout LE. This
// script keeps the flow dry-run by default, proves the encode/decode round-trip,
// and shows the exact search key shape you would use against a public CKB indexer.

type BitcoinOutPoint = {
  txid: string;
  vout: number;
};

type RgbppBinding = {
  label: string;
  btc: BitcoinOutPoint;
  ckbOutPoint: { txHash: string; index: string };
  amount: string;
  status: "live" | "spent";
};

const LIVE = process.env.CKB_RUN_RGBPP_LIVE === "1";
const TESTNET_RPC = "https://testnet.ckb.dev/";
const RGBPP_LOCK_CODE_HASH =
  "0x9c6933d434dc1f3c3a7a5f0f9f7c9c4d7d6ef0a8a4be62b44f8f86f3d7f6c2a1";
const SAMPLE_BINDINGS: RgbppBinding[] = [
  {
    label: "Sample RGB++ xUDT allocation",
    btc: {
      txid: "4d3c2b1a00112233445566778899aabbccddeeff00112233445566778899aabb",
      vout: 1,
    },
    ckbOutPoint: {
      txHash: "0x1f0e0d0c0b0a99887766554433221100ffeeddccbbaa99887766554433221100",
      index: "0x0",
    },
    amount: "250.00 xUDT units",
    status: "live",
  },
  {
    label: "Sample RGB++ remainder cell",
    btc: {
      txid: "aaaaaaaa55555555bbbbbbbb66666666cccccccc77777777dddddddd88888888",
      vout: 2,
    },
    ckbOutPoint: {
      txHash: "0x9988aabbccddeeff00112233445566778899aabbccddeeff0011223344556677",
      index: "0x1",
    },
    amount: "92.50 xUDT units",
    status: "spent",
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

function normalizeTxid(txid: string): string {
  const clean = txid.toLowerCase();
  assert(/^[0-9a-f]{64}$/.test(clean), `Invalid Bitcoin txid: ${txid}`);
  return clean;
}

function reverseHexBytes(hex: string): string {
  const bytes = hex.match(/.{2}/g);
  assert(bytes !== null, `Hex string must have even length: ${hex}`);
  return bytes.reverse().join("");
}

function u32ToLeHex(value: number): string {
  assert(Number.isInteger(value) && value >= 0 && value <= 0xffffffff, `Invalid vout: ${value}`);
  const bytes = [
    value & 0xff,
    (value >> 8) & 0xff,
    (value >> 16) & 0xff,
    (value >> 24) & 0xff,
  ];
  return bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function leHexToU32(hex: string): number {
  assert(/^[0-9a-f]{8}$/.test(hex), `Invalid little-endian u32 hex: ${hex}`);
  const bytes = hex.match(/.{2}/g) ?? [];
  return bytes.reduce((acc, byte, index) => acc + Number.parseInt(byte, 16) * 2 ** (index * 8), 0);
}

function encodeRgbppLockArgs(outPoint: BitcoinOutPoint): string {
  return `0x${reverseHexBytes(normalizeTxid(outPoint.txid))}${u32ToLeHex(outPoint.vout)}`;
}

function decodeRgbppLockArgs(args: string): BitcoinOutPoint {
  const clean = args.startsWith("0x") ? args.slice(2) : args;
  assert(clean.length === 72, `RGB++ lock args must be 36 bytes, got ${clean.length / 2}`);
  const reversedTxid = clean.slice(0, 64);
  const voutLe = clean.slice(64);
  return {
    txid: reverseHexBytes(reversedTxid),
    vout: leHexToU32(voutLe),
  };
}

function buildRgbppSearchKey(args: string) {
  return {
    script: {
      code_hash: RGBPP_LOCK_CODE_HASH,
      hash_type: "type" as const,
      args,
    },
    script_type: "lock" as const,
    filter: {
      output_data_len_range: ["0x0", "0x400"],
    },
  };
}

function printBridgeModel() {
  printSection("1. RGB++ isomorphic binding");
  console.log("RGB++ is a cell-identity bridge, not a custody bridge.");
  console.log("One Bitcoin UTXO maps to one CKB lock-args payload, so ownership stays anchored to the UTXO.");
  console.log("");
  console.log("Mental model");
  console.log("  Bitcoin UTXO identity  ->  txid:vout");
  console.log("  RGB++ lock args        ->  reverse(txid bytes) ++ vout little-endian");
  console.log("  CKB live cell          ->  queried by exact lock script identity");
  console.log("");
  console.log("If the UTXO changes, the corresponding CKB cell identity changes too.");
}

function printRoundTrip() {
  printSection("2. Encode / decode the RGB++ lock args");

  for (const binding of SAMPLE_BINDINGS) {
    const encoded = encodeRgbppLockArgs(binding.btc);
    const decoded = decodeRgbppLockArgs(encoded);

    assert(decoded.txid === normalizeTxid(binding.btc.txid), "RGB++ txid round-trip failed");
    assert(decoded.vout === binding.btc.vout, "RGB++ vout round-trip failed");

    console.log(binding.label);
    console.log(`  bitcoin outpoint: ${binding.btc.txid}:${binding.btc.vout}`);
    console.log(`  encoded args:     ${encoded}`);
    console.log(`  decoded txid:     ${decoded.txid}`);
    console.log(`  decoded vout:     ${decoded.vout}`);
    console.log("");
  }
}

function printQueryFlow() {
  printSection("3. Query RGB++ cells by lock script");

  const binding = SAMPLE_BINDINGS[0];
  const args = encodeRgbppLockArgs(binding.btc);
  const searchKey = buildRgbppSearchKey(args);

  console.log("Indexer search key");
  console.log(JSON.stringify(searchKey, null, 2));
  console.log("");
  console.log("Locate a CKB cell from the Bitcoin outpoint");
  console.log(`  1. Start with BTC outpoint ${binding.btc.txid}:${binding.btc.vout}`);
  console.log(`  2. Encode RGB++ args ${args}`);
  console.log("  3. Query get_cells(searchKey, \"asc\", \"0x64\")");
  console.log(`  4. Match the returned live cell -> ${binding.ckbOutPoint.txHash}:${binding.ckbOutPoint.index}`);
  console.log("");
  console.log("Sample bindings");
  for (const sample of SAMPLE_BINDINGS) {
    console.log(`  ${sample.label}`);
    console.log(`    BTC: ${sample.btc.txid}:${sample.btc.vout}`);
    console.log(`    CKB: ${sample.ckbOutPoint.txHash}:${sample.ckbOutPoint.index} (${sample.status}, ${sample.amount})`);
  }
}

async function maybeRunLivePath() {
  printSection("4. Optional live testnet read");

  if (!LIVE) {
    console.log("Skipped. Set CKB_RUN_RGBPP_LIVE=1 to try a read-only get_cells call against the public testnet RPC.");
    console.log("The live query uses the first sample binding's encoded args and falls back silently if the endpoint is unreachable.");
    return;
  }

  const args = encodeRgbppLockArgs(SAMPLE_BINDINGS[0].btc);
  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "get_cells",
    params: [buildRgbppSearchKey(args), "asc", "0x2", null],
  };

  try {
    const res = await fetch(TESTNET_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(4000),
    });
    const json = (await res.json()) as { result?: { objects?: Array<{ output_data?: string }> }; error?: { message: string } };
    if (json.error) {
      throw new Error(json.error.message);
    }
    const objects = json.result?.objects ?? [];
    console.log(`Live RPC returned ${objects.length} matching cell(s) for the sample search key.`);
    console.log("A zero count is still useful: it proves the query shape is read-only and deterministic.");
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.log(`Live query unavailable. Falling back to embedded examples. Reason: ${reason}`);
  }
}

function printTakeaways() {
  printSection("5. Week 5 invariant (RGB++)");
  console.log("  - RGB++ binding turns cross-chain state into a cell-identity problem.");
  console.log("  - The critical bytes are reversed txid + little-endian vout.");
  console.log("  - Querying by lock script is enough to find the CKB side of a Bitcoin UTXO.");
  console.log("  - No private key is required to explore the binding model.");
}

async function main() {
  printBridgeModel();
  printRoundTrip();
  printQueryFlow();
  await maybeRunLivePath();
  printTakeaways();
}

try {
  await main();
  process.exit(0);
} catch (error) {
  console.error("17-rgbpp-explorer failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
