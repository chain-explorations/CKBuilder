// Lesson 22 - Token DEX
//
// On CKB, a DEX is mostly transaction geometry. The xUDT scripts enforce token
// conservation, while the DEX lock script enforces who is allowed to reshape an
// order cell. This script models full fills, partial fills, remainders, cancels,
// and the tradeoffs versus AMMs.

type Asset = {
  symbol: string;
  typeHash: string;
};

type OrderCell = {
  id: string;
  seller: string;
  sell: Asset;
  buy: Asset;
  totalSellAmount: bigint;
  totalBuyAmount: bigint;
  remainingSellAmount: bigint;
  remainingBuyAmount: bigint;
};

type FillResult = {
  baseTaken: bigint;
  quoteOwed: bigint;
  nextOrder: OrderCell | null;
};

const CKUSDT: Asset = {
  symbol: "ckUSDT",
  typeHash: "0x6d8f0f8a0f7e6d5c4b3a29180f7e6d5c4b3a29180f7e6d5c4b3a29180f7e6d5c",
};

const RGBPP_BTC: Asset = {
  symbol: "rgbppBTC",
  typeHash: "0x4d2a7bc3e6f18290a4b6c8d0e2f405162738495a6b7c8d9e0f10213243546576",
};

const SAMPLE_ORDER: OrderCell = {
  id: "order-0x71",
  seller: "ckb1qyq-maker-demo-address",
  sell: RGBPP_BTC,
  buy: CKUSDT,
  totalSellAmount: 1200n,
  totalBuyAmount: 6000n,
  remainingSellAmount: 1200n,
  remainingBuyAmount: 6000n,
};

function printSection(title: string) {
  console.log(`\n${title}`);
  console.log(`${"=".repeat(title.length)}`);
}

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function formatUnits(amount: bigint, asset: Asset): string {
  return `${amount.toString()} ${asset.symbol}`;
}

function quoteForFill(order: OrderCell, baseTaken: bigint): bigint {
  assert(baseTaken > 0n, "Fill must take a positive amount");
  assert(baseTaken <= order.remainingSellAmount, "Fill exceeds remaining base amount");
  const numerator = baseTaken * order.remainingBuyAmount;
  assert(numerator % order.remainingSellAmount === 0n, "This model expects an exact price division");
  return numerator / order.remainingSellAmount;
}

function fillOrder(order: OrderCell, baseTaken: bigint): FillResult {
  const quoteOwed = quoteForFill(order, baseTaken);
  const nextSell = order.remainingSellAmount - baseTaken;
  const nextBuy = order.remainingBuyAmount - quoteOwed;
  const nextOrder = nextSell === 0n
    ? null
    : {
        ...order,
        remainingSellAmount: nextSell,
        remainingBuyAmount: nextBuy,
      };

  return { baseTaken, quoteOwed, nextOrder };
}

function cancelOrder(order: OrderCell) {
  return {
    sellerGetsBack: order.remainingSellAmount,
    asset: order.sell,
  };
}

function printOrderModel() {
  printSection("1. Order cells make exchange a transaction-shape property");
  console.log("A DEX order cell is not a mutable contract slot.");
  console.log("It is a cell that says: this much of asset A may be exchanged for this much of asset B under this lock script.");
  console.log("");
  console.log(`Sample order: ${SAMPLE_ORDER.id}`);
  console.log(`  seller:            ${SAMPLE_ORDER.seller}`);
  console.log(`  selling:           ${formatUnits(SAMPLE_ORDER.totalSellAmount, SAMPLE_ORDER.sell)}`);
  console.log(`  asking:            ${formatUnits(SAMPLE_ORDER.totalBuyAmount, SAMPLE_ORDER.buy)}`);
  console.log("  implied price:     1 rgbppBTC = 5 ckUSDT");
}

function printFillExamples() {
  printSection("2. Full fill, partial fill, and remainder cells");

  const full = fillOrder(SAMPLE_ORDER, 1200n);
  const partial = fillOrder(SAMPLE_ORDER, 450n);

  assert(full.quoteOwed === 6000n, "Full fill quote math failed");
  assert(full.nextOrder === null, "Full fill should consume the entire order");
  assert(partial.quoteOwed === 2250n, "Partial fill quote math failed");
  assert(partial.nextOrder?.remainingSellAmount === 750n, "Remainder sell amount incorrect");
  assert(partial.nextOrder?.remainingBuyAmount === 3750n, "Remainder buy amount incorrect");
  assert(partial.baseTaken + (partial.nextOrder?.remainingSellAmount ?? 0n) === SAMPLE_ORDER.remainingSellAmount, "Base conservation failed");
  assert(partial.quoteOwed + (partial.nextOrder?.remainingBuyAmount ?? 0n) === SAMPLE_ORDER.remainingBuyAmount, "Quote conservation failed");

  console.log("Full fill");
  console.log(`  taker receives: ${formatUnits(full.baseTaken, SAMPLE_ORDER.sell)}`);
  console.log(`  seller receives: ${formatUnits(full.quoteOwed, SAMPLE_ORDER.buy)}`);
  console.log("  remainder order: none");
  console.log("");

  console.log("Partial fill");
  console.log(`  taker receives: ${formatUnits(partial.baseTaken, SAMPLE_ORDER.sell)}`);
  console.log(`  seller receives: ${formatUnits(partial.quoteOwed, SAMPLE_ORDER.buy)}`);
  console.log(`  remainder sell: ${formatUnits(partial.nextOrder?.remainingSellAmount ?? 0n, SAMPLE_ORDER.sell)}`);
  console.log(`  remainder buy:  ${formatUnits(partial.nextOrder?.remainingBuyAmount ?? 0n, SAMPLE_ORDER.buy)}`);
}

function printTransactionShapes() {
  printSection("3. Concrete transaction shapes");

  console.log("Full fill");
  console.log("  inputs:");
  console.log("    - maker order cell holding 1200 rgbppBTC");
  console.log("    - taker ckUSDT cells covering 6000 ckUSDT + fees");
  console.log("  outputs:");
  console.log("    - taker rgbppBTC cell with 1200 rgbppBTC");
  console.log("    - maker payout cell with 6000 ckUSDT");
  console.log("    - taker change cell");
  console.log("");

  console.log("Partial fill");
  console.log("  inputs:");
  console.log("    - maker order cell holding 1200 rgbppBTC");
  console.log("    - taker ckUSDT cells covering 2250 ckUSDT + fees");
  console.log("  outputs:");
  console.log("    - taker rgbppBTC cell with 450 rgbppBTC");
  console.log("    - maker payout cell with 2250 ckUSDT");
  console.log("    - remainder order cell with 750 rgbppBTC still offered for 3750 ckUSDT");
  console.log("    - taker change cell");
  console.log("");

  const cancel = cancelOrder(SAMPLE_ORDER);
  console.log("Cancel");
  console.log("  inputs:");
  console.log("    - maker order cell");
  console.log("  outputs:");
  console.log(`    - maker gets back ${formatUnits(cancel.sellerGetsBack, cancel.asset)}`);
  console.log("  no trade happens; the DEX lock only accepts the maker's cancel witness");
}

function printValidatorSplit() {
  printSection("4. What xUDT scripts enforce vs what the DEX lock enforces");
  console.log("xUDT type script");
  console.log("  - token conservation");
  console.log("  - mint / burn authority, if enabled");
  console.log("  - exact asset identity by type script hash");
  console.log("");
  console.log("DEX lock script");
  console.log("  - this order cell may only be consumed by a valid fill or cancel path");
  console.log("  - partial fills must preserve the price ratio in the remainder cell");
  console.log("  - maker payout recipient and order nonce rules live here");
  console.log("");
  console.log("One script says the assets are real. The other says this exchange shape is allowed.");
}

function printMarketStructure() {
  printSection("5. Front-running and AMM-vs-orderbook analysis");
  console.log("Front-running surface");
  console.log("  - makers expose a standing cell, so takers race to consume the same live object");
  console.log("  - the primary defense is atomicity: either the fill transaction consumes the exact cell or it fails as stale");
  console.log("  - wallets should re-check live-cell status immediately before broadcast");
  console.log("");
  console.log("Orderbook cell model vs AMM pool model");
  console.log("  - orderbook: explicit maker intent, exact price, natural partial fills, more UTXO-style matching logic");
  console.log("  - AMM: pooled inventory, continuous pricing curve, easier UX, but more implicit inventory risk");
  console.log("  - CKB fits both, but order cells highlight the chain's strength: transaction-shaped atomic exchange");
}

function printTakeaways() {
  printSection("6. Week 5 invariant (DEX)");
  console.log("  - Atomic exchange is mostly a property of the consumed and created cells.");
  console.log("  - Partial fills are just valid remainder cells with conserved amounts.");
  console.log("  - xUDT scripts and DEX locks enforce different layers of the trade.");
  console.log("  - A stale order fails because the cell changed, not because a contract slot was edited.");
}

function main() {
  printOrderModel();
  printFillExamples();
  printTransactionShapes();
  printValidatorSplit();
  printMarketStructure();
  printTakeaways();
}

try {
  main();
  process.exit(0);
} catch (error) {
  console.error("18-token-dex failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
