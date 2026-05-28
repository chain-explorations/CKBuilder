type Pattern = {
  title: string;
  bluf: string;
  ckbModel: string[];
  evmContrast: string[];
  invariant: string;
};

function printSection(title: string) {
  console.log(`\n${title}`);
  console.log(`${"=".repeat(title.length)}`);
}

function printPattern(pattern: Pattern) {
  console.log(`\n${pattern.title}`);
  console.log(`${"-".repeat(pattern.title.length)}`);
  console.log(`BLUF: ${pattern.bluf}`);
  console.log("CKB model:");
  for (const line of pattern.ckbModel) {
    console.log(`  - ${line}`);
  }
  console.log("Solidity / Solana contrast:");
  for (const line of pattern.evmContrast) {
    console.log(`  - ${line}`);
  }
  console.log(`Invariant: ${pattern.invariant}`);
}

function printPatterns() {
  printSection("1. Five composability patterns");

  const patterns: Pattern[] = [
    {
      title: "Script-as-parameter",
      bluf: "On CKB, a protocol can accept another script as data and let that script participate directly in validation.",
      ckbModel: [
        "A vault type script stores or hashes an external policy script in its args or witness.",
        "When the vault is spent, the transaction includes that policy script in cell deps or an owner-mode witness path.",
        "The vault and the policy both validate the same state transition.",
      ],
      evmContrast: [
        "An EVM contract usually calls another contract address at runtime.",
        "A Solana program usually CPI-calls another program ID.",
        "CKB composition is declared in the transaction shape before execution, not discovered by nested calls.",
      ],
      invariant: "The parameterized script must approve the same replacement the base script approves.",
    },
    {
      title: "Token-gated access",
      bluf: "A cell can require an xUDT-bearing input to be present instead of asking a contract balance table for permission.",
      ckbModel: [
        "A proposal lock script scans inputs for a threshold amount of governance xUDT.",
        "No tokens move if the action is read-only from the token perspective; they only need to be present in the transaction.",
        "The proposal cell is spendable only when the token predicate and the proposal predicate both pass.",
      ],
      evmContrast: [
        "ERC-20 gating usually reads balance from contract storage mid-call.",
        "CKB gating inspects the cells the user actually brought into the transaction.",
      ],
      invariant: "Authority is proven by cells in the transaction, not by querying a global ledger owned by the protocol.",
    },
    {
      title: "Multi-script AND validation",
      bluf: "Composability on CKB is just multiple validators agreeing on one state transition.",
      ckbModel: [
        "A cell may have a lock script, a type script, and xUDT extension rules all active at once.",
        "The transaction succeeds only if every relevant script group returns success.",
        "This behaves like logical AND over validators, not control flow between contracts.",
      ],
      evmContrast: [
        "In Solidity, one contract often becomes the orchestrator and others become callees.",
        "In CKB there is no privileged orchestrator inside the VM; the transaction is the orchestrator.",
      ],
      invariant: "Each validator sees the same proposed move and may veto it independently.",
    },
    {
      title: "Atomic swap flow",
      bluf: "Two parties can exchange cells atomically without a standing escrow contract.",
      ckbModel: [
        "Alice contributes a CKB or xUDT input cell; Bob contributes another asset cell.",
        "Outputs route Alice's asset to Bob and Bob's asset to Alice in one transaction.",
        "Either every script approves and the swap happens, or the whole transaction fails.",
      ],
      evmContrast: [
        "On EVM the AMM or escrow contract usually owns intermediate state.",
        "On CKB the transaction itself can express the full swap directly.",
      ],
      invariant: "No partial fill exists inside a single transaction: replacement is atomic.",
    },
    {
      title: "Permissionless extension",
      bluf: "A base asset can admit new behaviour without redeploying the asset standard itself.",
      ckbModel: [
        "xUDT extension scripts are selected by flags and ScriptVec entries.",
        "A protocol can define a new extension script and have users attach it to a token type.",
        "The base xUDT rules still run after the extension approves.",
      ],
      evmContrast: [
        "An ERC-20 usually needs a bespoke contract fork or proxy upgrade for new behaviour.",
        "CKB lets the asset carry the extra validator set at the cell level.",
      ],
      invariant: "Extension behaviour composes only if it does not violate xUDT conservation or owner-mode rules.",
    },
  ];

  for (const pattern of patterns) {
    printPattern(pattern);
  }
}

function printVotingExercise() {
  printSection("2. Voting protocol design exercise");

  console.log("BLUF: if you want on-chain governance, model votes as cells and token-bearing inputs, not as a contract-owned proposal map.");
  console.log("");
  console.log("Design sketch");
  console.log("  - Governance xUDT: carries voting power.");
  console.log("  - Proposal cell: holds proposal metadata, deadline, and tally commitments.");
  console.log("  - Vote receipt cell: prevents replay or double-counting for a specific voter and proposal.");
  console.log("");
  console.log("Open proposal transaction");
  console.log("  inputs:  proposer funding cells");
  console.log("  outputs: proposal cell + change");
  console.log("  validator: proposal type script enforces creation shape");
  console.log("");
  console.log("Cast vote transaction");
  console.log("  inputs:  voter xUDT cells + proposal cell + optional previous tally cell");
  console.log("  outputs: updated proposal/tally cell + vote receipt cell + xUDT change cells");
  console.log("  validators:");
  console.log("    1. xUDT proves the voter actually brought voting power");
  console.log("    2. proposal script checks deadline, option, and tally math");
  console.log("    3. vote receipt uniqueness prevents double-voting");
  console.log("");
  console.log("Why this is a CKB-native design");
  console.log("  - tokens do not move into a contract vault just to be counted");
  console.log("  - proposal state is explicit cell replacement");
  console.log("  - every rule is visible in the transaction graph before execution");
}

function printCompositionComparison() {
  printSection("3. Transaction composition vs call composition");

  console.log("Solidity / Anchor default");
  console.log("  user -> entry contract/program -> internal calls/CPI -> shared storage mutation");
  console.log("");
  console.log("CKB default");
  console.log("  user -> builds full transaction -> lock/type/extension validators referee the replacement");
  console.log("");
  console.log("Operational consequences");
  console.log("  - you reason about complete state transitions instead of handler-by-handler code paths");
  console.log("  - protocols compose by co-validating cells, not by trusting a parent contract to call children correctly");
  console.log("  - debugging starts from the transaction shape and script groups, not a nested call stack");
}

function main() {
  printPatterns();
  printVotingExercise();
  printCompositionComparison();
}

try {
  main();
  process.exit(0);
} catch (error) {
  console.error("12-composability-patterns failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
