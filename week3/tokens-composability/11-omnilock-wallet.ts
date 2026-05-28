type OmnilockConfig = {
  authFlag: number;
  authContent: string;
  anyoneCanPay?: {
    ckbExponent: number;
    udtExponent: number;
  };
  timeLockSince?: bigint;
};

const ADMINISTRATOR_MODE = 0b00000001;
const ACP_MODE = 0b00000010;
const TIME_LOCK_MODE = 0b00000100;
const SUPPLY_MODE = 0b00001000;

function printSection(title: string) {
  console.log(`\n${title}`);
  console.log(`${"=".repeat(title.length)}`);
}

function ensureHex(bytes: string, expectedByteLength: number) {
  if (!bytes.startsWith("0x")) {
    throw new Error(`Expected hex string, got: ${bytes}`);
  }
  const actual = (bytes.length - 2) / 2;
  if (actual !== expectedByteLength) {
    throw new Error(`Expected ${expectedByteLength} bytes, got ${actual}: ${bytes}`);
  }
}

function encodeU64Le(value: bigint): string {
  if (value < 0n || value > 0xffffffffffffffffn) {
    throw new Error(`Value out of u64 range: ${value}`);
  }
  const bytes = new Uint8Array(8);
  let remaining = value;
  for (let i = 0; i < 8; i += 1) {
    bytes[i] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  return `0x${Buffer.from(bytes).toString("hex")}`;
}

function buildAuth(authFlag: number, authContent: string): string {
  ensureHex(authContent, 20);
  return `0x${authFlag.toString(16).padStart(2, "0")}${authContent.slice(2)}`;
}

function buildOmnilockArgs(config: OmnilockConfig) {
  let flags = 0;
  let prefix = "0x";

  if (config.anyoneCanPay) {
    flags |= ACP_MODE;
  }
  if (config.timeLockSince !== undefined) {
    flags |= TIME_LOCK_MODE;
  }

  prefix += flags.toString(16).padStart(2, "0");

  if (config.anyoneCanPay) {
    prefix += config.anyoneCanPay.ckbExponent.toString(16).padStart(2, "0");
    prefix += config.anyoneCanPay.udtExponent.toString(16).padStart(2, "0");
  }

  if (config.timeLockSince !== undefined) {
    prefix += encodeU64Le(config.timeLockSince).slice(2);
  }

  return `${prefix}${buildAuth(config.authFlag, config.authContent).slice(2)}`;
}

function describeMinimum(exponent: number): string {
  return `${10n ** BigInt(exponent)} base units`;
}

function printModeExamples() {
  printSection("1. Auth modes 0x00, 0x01, and 0x06");

  console.log("Important ambiguity");
  console.log("  - mode 0x00 / 0x01 / 0x06 are auth flag values inside the 21-byte `auth` field");
  console.log("  - they are not the same thing as the Omnilock flags byte for ACP/timelock/admin modes\n");

  const examples: Array<[string, OmnilockConfig, string]> = [
    [
      "Mode 0x00 - CKB secp256k1/blake160 style auth",
      {
        authFlag: 0x00,
        authContent: "0x1111111111111111111111111111111111111111",
      },
      "native CKB-style single-sig",
    ],
    [
      "Mode 0x01 - Ethereum auth",
      {
        authFlag: 0x01,
        authContent: "0x2222222222222222222222222222222222222222",
      },
      "Ethereum-compatible message signing, but still spending CKB cells",
    ],
    [
      "Mode 0x06 - CKB multisig auth",
      {
        authFlag: 0x06,
        authContent: "0x3333333333333333333333333333333333333333",
      },
      "multi-party approval carried by Omnilock witness data",
    ],
  ];

  for (const [label, config, description] of examples) {
    const auth = buildAuth(config.authFlag, config.authContent);
    const args = buildOmnilockArgs(config);
    console.log(label);
    console.log(`  auth field:      ${auth}`);
    console.log(`  full args:       ${args}`);
    console.log(`  interpretation:  ${description}`);
    console.log("");
  }
}

function printAcpAndTimelockExamples() {
  printSection("2. ACP thresholds and time-lock encoding");

  const acpConfig: OmnilockConfig = {
    authFlag: 0x01,
    authContent: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    anyoneCanPay: {
      ckbExponent: 4,
      udtExponent: 6,
    },
  };

  const timeLockedConfig: OmnilockConfig = {
    authFlag: 0x00,
    authContent: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    anyoneCanPay: {
      ckbExponent: 3,
      udtExponent: 0,
    },
    timeLockSince: 0x0000000000001234n,
  };

  console.log("ACP-enabled Omnilock");
  console.log(`  args: ${buildOmnilockArgs(acpConfig)}`);
  console.log(`  CKB minimum receive threshold: ${describeMinimum(acpConfig.anyoneCanPay!.ckbExponent)}`);
  console.log(`  UDT minimum receive threshold: ${describeMinimum(acpConfig.anyoneCanPay!.udtExponent)}`);
  console.log("  why it matters: prevents someone from griefing the cell with microscopic deposits");
  console.log("");

  console.log("ACP + time-lock Omnilock");
  console.log(`  args: ${buildOmnilockArgs(timeLockedConfig)}`);
  console.log(`  flags byte: 0x${(ACP_MODE | TIME_LOCK_MODE).toString(16).padStart(2, "0")}`);
  console.log(`  since (u64 LE): ${encodeU64Le(timeLockedConfig.timeLockSince!)}`);
  console.log("  mental model: the auth method proves who you are, the since field constrains when spend is legal");
}

function printWitnessLayouts() {
  printSection("3. Witness layout");

  console.log("Single-sig witness (Mode 0x00 or 0x01)");
  console.log("  WitnessArgs.lock = OmniLockWitnessLock");
  console.log("    signature:      65-byte recoverable signature");
  console.log("    omni_identity:  none");
  console.log("    preimage:       none");
  console.log("");

  console.log("Multisig witness (Mode 0x06)");
  console.log("  WitnessArgs.lock = OmniLockWitnessLock");
  console.log("    signature:      multisig script header + participating signatures");
  console.log("    omni_identity:  none unless admin mode is in play");
  console.log("    preimage:       none");
  console.log("");

  console.log("Operational issue");
  console.log("  - Omnilock packs several concepts into one witness lock field, so the auth mode and the extra Omnilock flags are easy to conflate.");
}

function printFraming() {
  printSection("4. Cross-chain auth, not bridging");

  console.log("Omnilock reuses signing conventions from other ecosystems.");
  console.log("That does not move the asset to those ecosystems.");
  console.log("");
  console.log("  - Ethereum mode means an Ethereum-style signer can control a CKB cell.");
  console.log("  - Bitcoin mode would mean a Bitcoin-style signer can control a CKB cell.");
  console.log("  - Multisig mode means a CKB-native quorum can control a CKB cell.");
  console.log("");
  console.log("The asset never stops being a CKB cell. Omnilock changes authentication, not settlement layer.");
}

function main() {
  void ADMINISTRATOR_MODE;
  void SUPPLY_MODE;
  printModeExamples();
  printAcpAndTimelockExamples();
  printWitnessLayouts();
  printFraming();
}

try {
  main();
  process.exit(0);
} catch (error) {
  console.error("11-omnilock-wallet failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
