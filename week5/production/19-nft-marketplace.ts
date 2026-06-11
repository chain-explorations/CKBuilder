// Lesson 23 - NFT Marketplace
//
// A Spore marketplace is three cell types cooperating: the Spore cell, the sale
// cell, and the plain payout / change cells around them. This script keeps the
// flow dry-run, validates the critical frontend checks, and draws the wallet
// boundary so the marketplace UI does not overreach into signing logic.

type Script = {
  codeHash: string;
  hashType: "type" | "data" | "data1";
  args: string;
};

type SporeAsset = {
  sporeId: string;
  ownerLockHash: string;
  contentType: string;
  contentBytes: number;
  scriptHash: string;
};

type SaleListing = {
  listingId: string;
  sellerLockHash: string;
  salePriceShannons: bigint;
  payoutLockHash: string;
  expectedBuyerLockHash: string;
  spore: SporeAsset;
  saleScript: Script;
};

type PurchaseIntent = {
  buyerLockHash: string;
  outputScriptHash: string;
  payoutLockHash: string;
  priceShannons: bigint;
};

const SHANNONS_PER_CKB = 100_000_000n;
const SPORE_SALE_SCRIPT_HASH = "0xd6e5f4c3b2a109887766554433221100ffeeddccbbaa99887766554433221100";

const SAMPLE_LISTING: SaleListing = {
  listingId: "sale-0x44",
  sellerLockHash: "0xabc123seller0000000000000000000000000000000000000000000000000000",
  salePriceShannons: 250n * SHANNONS_PER_CKB,
  payoutLockHash: "0xpayee1230000000000000000000000000000000000000000000000000000000",
  expectedBuyerLockHash: "0xbuyer4560000000000000000000000000000000000000000000000000000000",
  spore: {
    sporeId: "0x6c95d7b5efad573b8ecf3f80be489ff7385fb3cf18ea2aa2cc0a16d45b5f0d31",
    ownerLockHash: "0xabc123seller0000000000000000000000000000000000000000000000000000",
    contentType: "image/svg+xml",
    contentBytes: 1284,
    scriptHash: "0xsporeasset123400000000000000000000000000000000000000000000000000",
  },
  saleScript: {
    codeHash: "0xmarketplace99887766554433221100ffeeddccbbaa99887766554433221100ff",
    hashType: "type",
    args: "0x01salepolicy00",
  },
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

function formatCkb(shannons: bigint): string {
  return `${shannons / SHANNONS_PER_CKB} CKB`;
}

function validatePurchase(listing: SaleListing, intent: PurchaseIntent) {
  const failures: string[] = [];
  if (intent.outputScriptHash !== listing.spore.scriptHash) failures.push("spore script hash mismatch");
  if (intent.payoutLockHash !== listing.payoutLockHash) failures.push("seller payout recipient mismatch");
  if (intent.buyerLockHash !== listing.expectedBuyerLockHash) failures.push("buyer recipient mismatch");
  if (intent.priceShannons !== listing.salePriceShannons) failures.push("sale price mismatch");
  return failures;
}

function renderRuleForContentType(contentType: string): string {
  if (contentType === "image/svg+xml") {
    return "sanitize SVG before inline rendering; forbid script tags and event handlers";
  }
  if (contentType === "image/png" || contentType === "image/jpeg" || contentType === "image/webp") {
    return "render as an image blob; do not reinterpret bytes as HTML";
  }
  if (contentType === "application/json") {
    return "treat as metadata payload; display structured fields, not executable content";
  }
  if (contentType.startsWith("text/")) {
    return "render as escaped text, never raw HTML";
  }
  return "offer download-first handling; avoid auto-executing or embedding unknown media types";
}

function printMarketplaceModel() {
  printSection("1. Spore sale flow: object cell plus sale cell");
  console.log("The marketplace does not own the NFT in a contract map.");
  console.log("It coordinates a Spore cell and a sale cell so listing and purchase are both cell-level objects.");
  console.log("");
  console.log(`Listing id:          ${SAMPLE_LISTING.listingId}`);
  console.log(`Spore id:            ${SAMPLE_LISTING.spore.sporeId}`);
  console.log(`Sale price:          ${formatCkb(SAMPLE_LISTING.salePriceShannons)}`);
  console.log(`Seller payout hash:  ${SAMPLE_LISTING.payoutLockHash}`);
  console.log(`Sale script hash:    ${SPORE_SALE_SCRIPT_HASH}`);
}

function printTransactionShapes() {
  printSection("2. Mint, list, buy, and cancel transaction shapes");
  console.log("Mint");
  console.log("  inputs:  plain CKB funding cells");
  console.log("  outputs: one Spore cell owned by the creator");
  console.log("");
  console.log("List");
  console.log("  inputs:  creator-owned Spore cell");
  console.log("  outputs:");
  console.log("    - Spore cell now locked by the marketplace sale lock");
  console.log("    - sale cell carrying price, payout target, and expected buyer constraints");
  console.log("");
  console.log("Buy");
  console.log("  inputs:");
  console.log("    - marketplace-locked Spore cell");
  console.log("    - sale cell");
  console.log("    - buyer funding cells");
  console.log("  outputs:");
  console.log("    - Spore cell owned by the buyer");
  console.log("    - seller payout cell");
  console.log("    - buyer change cell");
  console.log("");
  console.log("Cancel");
  console.log("  inputs:  sale cell + marketplace-locked Spore cell");
  console.log("  outputs: Spore cell returns to the seller; sale cell disappears");
}

function printValidationRules() {
  printSection("3. Frontend validation rules");

  const validIntent: PurchaseIntent = {
    buyerLockHash: SAMPLE_LISTING.expectedBuyerLockHash,
    outputScriptHash: SAMPLE_LISTING.spore.scriptHash,
    payoutLockHash: SAMPLE_LISTING.payoutLockHash,
    priceShannons: SAMPLE_LISTING.salePriceShannons,
  };

  const invalidIntent: PurchaseIntent = {
    buyerLockHash: "0xwrongbuyer000000000000000000000000000000000000000000000000000000",
    outputScriptHash: "0xwrongscript00000000000000000000000000000000000000000000000000000",
    payoutLockHash: "0xwrongpayee000000000000000000000000000000000000000000000000000000",
    priceShannons: 100n * SHANNONS_PER_CKB,
  };

  const validFailures = validatePurchase(SAMPLE_LISTING, validIntent);
  const invalidFailures = validatePurchase(SAMPLE_LISTING, invalidIntent);

  assert(validFailures.length === 0, "Valid marketplace purchase should pass all checks");
  assert(invalidFailures.length === 4, "Invalid marketplace purchase should fail all sample checks");

  console.log("Before rendering a Buy button, the frontend should verify:");
  console.log("  - Spore ID is the exact object the user expects");
  console.log("  - seller payout lock hash matches the listing terms");
  console.log("  - buyer recipient lock hash matches the intended receiving wallet");
  console.log("  - Spore script hash matches the listed object, not a substituted cell");
  console.log("");
  console.log(`Valid sample -> ${validFailures.length} failure(s)`);
  console.log(`Invalid sample -> ${invalidFailures.join(", ")}`);
}

function printContentHandling() {
  printSection("4. Content rendering rules and wallet boundary");
  const contentTypes = [
    "image/svg+xml",
    "image/png",
    "application/json",
    "text/plain;charset=utf-8",
    "application/octet-stream",
  ];

  for (const contentType of contentTypes) {
    console.log(`  ${contentType.padEnd(24)} ${renderRuleForContentType(contentType)}`);
  }
  console.log("");
  console.log("Wallet integration boundary");
  console.log("  - the wallet proves ownership and signs the spend");
  console.log("  - the marketplace frontend assembles and previews the transaction");
  console.log("  - the wallet should not be forced to render arbitrary Spore content inside the signing surface");
  console.log("  - the frontend should not assume the wallet validated marketplace business logic for it");
}

function printTakeaways() {
  printSection("5. Week 5 invariant (NFT marketplace)");
  console.log("  - Content, listing, and purchase can all be modeled as cells.");
  console.log("  - The safest frontend treats listing validation as a first-class job.");
  console.log("  - Rendering rules depend on MIME type, not on marketplace optimism.");
  console.log("  - The wallet signs ownership changes; the marketplace owns the preview and policy layer.");
}

function main() {
  printMarketplaceModel();
  printTransactionShapes();
  printValidationRules();
  printContentHandling();
  printTakeaways();
}

try {
  main();
  process.exit(0);
} catch (error) {
  console.error("19-nft-marketplace failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
