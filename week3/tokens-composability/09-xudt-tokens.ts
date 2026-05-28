type ScriptRef = {
  codeHash: string;
  hashType: "data" | "data1" | "data2" | "type";
  args: string;
};

type TokenCell = {
  label: string;
  capacityCkb: number;
  amount: bigint;
  lock: string;
};

type TokenTransaction = {
  name: string;
  ownerMode: boolean;
  extensionMode: "plain" | "raw-scriptvec" | "witness-scriptvec";
  flags: number;
  inputs: TokenCell[];
  outputs: TokenCell[];
  notes: string[];
};

const SHANNONS_PER_CKB = 100_000_000n;
const XUDT_LOW_FLAG_MASK = 0x1fffffff;
const XUDT_DISABLE_INPUT_LOCK_OWNER_MODE = 0x20000000;
const XUDT_ENABLE_OUTPUT_TYPE_OWNER_MODE = 0x40000000;
const XUDT_ENABLE_INPUT_TYPE_OWNER_MODE = 0x80000000;

const ownerLockHash =
  "0x4b3b8f22b66c1f47cfe7fe2d15a8bb11db4f9d92b0f96c3b0eab9b72f1f19a17";
const treasuryLock = "dao-treasury-lock";
const aliceLock = "alice-secp-lock";
const bobLock = "bob-secp-lock";
const marketMakerLock = "market-maker-lock";

function encodeUint128Le(value: bigint): string {
  if (value < 0n || value > (1n << 128n) - 1n) {
    throw new Error(`Value out of uint128 range: ${value}`);
  }

  const bytes = new Uint8Array(16);
  let remainder = value;
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number(remainder & 0xffn);
    remainder >>= 8n;
  }

  return `0x${Buffer.from(bytes).toString("hex")}`;
}

function decodeUint128Le(hex: string): bigint {
  if (!hex.startsWith("0x") || hex.length !== 34) {
    throw new Error(`Expected 16-byte hex string, got: ${hex}`);
  }

  const bytes = Buffer.from(hex.slice(2), "hex");
  let value = 0n;
  for (let i = bytes.length - 1; i >= 0; i -= 1) {
    value = (value << 8n) + BigInt(bytes[i]);
  }
  return value;
}

function hexByte(byte: number): string {
  return byte.toString(16).padStart(2, "0");
}

function encodeU32Le(value: number): string {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
    throw new Error(`Value out of uint32 range: ${value}`);
  }

  const bytes = new Uint8Array(4);
  let remaining = value >>> 0;
  for (let i = 0; i < 4; i += 1) {
    bytes[i] = remaining & 0xff;
    remaining >>>= 8;
  }
  return `0x${Buffer.from(bytes).toString("hex")}`;
}

function extensionTag(mode: TokenTransaction["extensionMode"]): string {
  if (mode === "plain") {
    return "no extension data";
  }
  if (mode === "raw-scriptvec") {
    return "raw ScriptVec embedded in args";
  }
  return "ScriptVec hash in args, actual scripts in witness";
}

function xudtArgs(flags: number, extensionData = "0x"): string {
  return `${ownerLockHash}${encodeU32Le(flags).slice(2)}${extensionData.slice(2)}`;
}

function classifyFlags(flags: number) {
  const extensionMode = flags & XUDT_LOW_FLAG_MASK;
  return {
    extensionMode,
    ownerModeTriggers: [
      (flags & XUDT_DISABLE_INPUT_LOCK_OWNER_MODE) === 0
        ? "input lock can trigger owner mode"
        : "input lock owner mode disabled",
      (flags & XUDT_ENABLE_OUTPUT_TYPE_OWNER_MODE) !== 0
        ? "output type can trigger owner mode"
        : "output type owner mode disabled",
      (flags & XUDT_ENABLE_INPUT_TYPE_OWNER_MODE) !== 0
        ? "input type can trigger owner mode"
        : "input type owner mode disabled",
    ],
  };
}

function formatAmount(value: bigint): string {
  return `${value.toString()} base units`;
}

function printSection(title: string) {
  console.log(`\n${title}`);
  console.log(`${"=".repeat(title.length)}`);
}

function printRoundTrips() {
  printSection("1. uint128 little-endian encoding");

  for (const amount of [
    0n,
    1n,
    42n,
    1_000_000_000_000n,
    340_282_366_920_938_463_463_374_607_431_768_211_455n,
  ]) {
    const encoded = encodeUint128Le(amount);
    const decoded = decodeUint128Le(encoded);
    console.log(
      `  ${amount.toString().padStart(39)} -> ${encoded} -> ${decoded} ${
        decoded === amount ? "ok" : "MISMATCH"
      }`,
    );
  }
}

function printIdentityExamples() {
  printSection("2. Token identity lives in the type script");

  const plainFlags = 0x00000000;
  const rawExtensionFlags = 0x80000001;
  const witnessExtensionFlags = 0x40000002;

  console.log("xUDT type args shape");
  console.log("  <32-byte owner lock hash> <4-byte flags little-endian> <extension data>");
  console.log(`  owner lock hash: ${ownerLockHash}`);
  console.log("");

  for (const [label, flags, extension] of [
    ["Plain xUDT", plainFlags, "0x"],
    ["Input-type owner mode + raw ScriptVec", rawExtensionFlags, "0x01020304"],
    ["Output-type owner mode + witness ScriptVec", witnessExtensionFlags, "0xaabbccdd"],
  ] as const) {
    const details = classifyFlags(flags);
    console.log(label);
    console.log(`  flags (u32 LE): ${encodeU32Le(flags)} (numeric ${flags})`);
    console.log(`  lower 29-bit extension selector: ${details.extensionMode}`);
    console.log(`  composed args: ${xudtArgs(flags, extension)}`);
    for (const line of details.ownerModeTriggers) {
      console.log(`  - ${line}`);
    }
    console.log("");
  }

  console.log("Takeaway");
  console.log("  - two xUDTs with different owner lock hashes are different assets");
  console.log("  - same owner hash but different flags/extension payloads also produce different assets");
  console.log("  - balances are not looked up by symbol; they are scanned by exact type-script identity");
}

function totalAmount(cells: TokenCell[]): bigint {
  return cells.reduce((sum, cell) => sum + cell.amount, 0n);
}

function printTransactionShape(tx: TokenTransaction) {
  const inputTotal = totalAmount(tx.inputs);
  const outputTotal = totalAmount(tx.outputs);
  const delta = outputTotal - inputTotal;

  console.log(`\n${tx.name}`);
  console.log(`${"-".repeat(tx.name.length)}`);
  console.log(`  xUDT flags: ${encodeU32Le(tx.flags)} (${extensionTag(tx.extensionMode)})`);
  console.log(`  owner mode active: ${tx.ownerMode}`);
  console.log("  shape:");
  console.log("    Inputs");
  for (const cell of tx.inputs) {
    console.log(
      `      [${cell.label}] ${cell.capacityCkb} CKB + ${formatAmount(cell.amount)} locked by ${cell.lock}`,
    );
  }
  console.log("    Outputs");
  for (const cell of tx.outputs) {
    console.log(
      `      [${cell.label}] ${cell.capacityCkb} CKB + ${formatAmount(cell.amount)} locked by ${cell.lock}`,
    );
  }

  console.log("  conservation check:");
  console.log(`    inputs:  ${formatAmount(inputTotal)}`);
  console.log(`    outputs: ${formatAmount(outputTotal)}`);
  if (!tx.ownerMode) {
    console.log(`    rule:    transfer mode requires exact equality -> ${inputTotal === outputTotal}`);
  } else {
    const verdict =
      delta > 0n ? `minted ${formatAmount(delta)}` : delta < 0n ? `burned ${formatAmount(-delta)}` : "no net issuance";
    console.log(`    rule:    owner mode may change supply -> ${verdict}`);
  }

  console.log("  why it passes:");
  for (const note of tx.notes) {
    console.log(`    - ${note}`);
  }
}

function printTransactionExamples() {
  printSection("3. Issuance, transfer, and owner mode");

  const transactions: TokenTransaction[] = [
    {
      name: "Scenario A - issuance",
      ownerMode: true,
      extensionMode: "plain",
      flags: 0x00000000,
      inputs: [
        {
          label: "owner authority cell",
          capacityCkb: 200,
          amount: 0n,
          lock: treasuryLock,
        },
      ],
      outputs: [
        {
          label: "alice treasury tranche",
          capacityCkb: 200,
          amount: 1_000_000n,
          lock: aliceLock,
        },
      ],
      notes: [
        "the owner lock hash in xUDT args matches an input lock script in the transaction",
        "supply increases because owner mode is true",
        "capacity moves like normal CKB; xUDT amount lives in cell data, not contract storage",
      ],
    },
    {
      name: "Scenario B - normal transfer",
      ownerMode: false,
      extensionMode: "plain",
      flags: 0x00000000,
      inputs: [
        {
          label: "alice spend",
          capacityCkb: 142,
          amount: 600_000n,
          lock: aliceLock,
        },
        {
          label: "alice change",
          capacityCkb: 142,
          amount: 400_000n,
          lock: aliceLock,
        },
      ],
      outputs: [
        {
          label: "bob receive",
          capacityCkb: 142,
          amount: 550_000n,
          lock: bobLock,
        },
        {
          label: "alice change",
          capacityCkb: 142,
          amount: 450_000n,
          lock: aliceLock,
        },
      ],
      notes: [
        "no owner cell is present, so xUDT falls back to pure conservation",
        "the transaction can still have many other CKB inputs and outputs for fees and change",
        "this feels like ERC-20 transfer, but the chain is validating cell replacement, not mutating a balance map",
      ],
    },
    {
      name: "Scenario C - owner mode plus extension script",
      ownerMode: true,
      extensionMode: "raw-scriptvec",
      flags: 0x80000001,
      inputs: [
        {
          label: "governance receipt cell",
          capacityCkb: 180,
          amount: 0n,
          lock: "governance-receipt-lock",
        },
        {
          label: "market-maker inventory",
          capacityCkb: 142,
          amount: 250_000n,
          lock: marketMakerLock,
        },
      ],
      outputs: [
        {
          label: "market-maker inventory",
          capacityCkb: 142,
          amount: 500_000n,
          lock: marketMakerLock,
        },
      ],
      notes: [
        "flag 0x80000000 allows an input type script to trigger owner mode",
        "flag low bits 0x1 mean extension scripts are embedded directly in args as ScriptVec",
        "xUDT still runs its own supply rules after every extension script returns success",
      ],
    },
  ];

  for (const tx of transactions) {
    printTransactionShape(tx);
  }
}

function scanBalances(cells: TokenCell[], ownerHash: string, flags: number) {
  const typeArgs = xudtArgs(flags);
  const totals = new Map<string, bigint>();
  for (const cell of cells) {
    const key = `${cell.lock}|${ownerHash}|${typeArgs}`;
    totals.set(key, (totals.get(key) ?? 0n) + cell.amount);
  }
  return totals;
}

function printBalanceScanning() {
  printSection("4. Balance scanning");

  const walletView: TokenCell[] = [
    { label: "bob cell 1", capacityCkb: 142, amount: 100_000n, lock: bobLock },
    { label: "bob cell 2", capacityCkb: 170, amount: 75_000n, lock: bobLock },
    { label: "alice cell 1", capacityCkb: 142, amount: 450_000n, lock: aliceLock },
  ];

  const balances = scanBalances(walletView, ownerLockHash, 0x00000000);
  console.log("Cells are the balances.");
  console.log("A wallet does not ask a contract for `balanceOf(bob)`.");
  console.log("It scans cells whose type script exactly matches the target xUDT asset.\n");

  for (const [key, amount] of balances) {
    const [lock] = key.split("|");
    console.log(`  ${lock.padEnd(24)} -> ${formatAmount(amount)}`);
  }
}

function printTakeaways() {
  printSection("5. Week 3 invariant");
  console.log("  - xUDT amount is just 16 bytes of cell data in little-endian uint128 format");
  console.log("  - asset identity is type-script identity, not an entry in a global balance table");
  console.log("  - transfer mode enforces conservation; owner mode is the explicit escape hatch");
  console.log("  - extension scripts compose by agreeing on the same state transition, not by calling each other");
}

function main() {
  printRoundTrips();
  printIdentityExamples();
  printTransactionExamples();
  printBalanceScanning();
  printTakeaways();
}

try {
  main();
  process.exit(0);
} catch (error) {
  console.error("09-xudt-tokens failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
