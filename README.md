# CKBuilder

CKBuilder is my public documentation of learning and exploring CKB from the perspective of someone coming from Solana. The repo tracks the mental model shift, working notes, and hands-on exercises that help me understand how CKB works and what kinds of things are worth building on it.

The published documentation lives at [ckb.danielasaboro.com](https://ckb.danielasaboro.com/). That documentation is scheduled to receive weekly updates from `May 13, 2026` through `August 13, 2026`.

## What is in this repo

- `docs/` contains the source for the public documentation site.
- `week1/foundation/` contains early exercises used to explore core CKB concepts such as cells, transactions, capacity, and basic transfers.

## Current learning path

The current focus is Week 1: understanding the mental model shift from Solana's account-based patterns to CKB's model of cells, state replacement, and script-based validation.

The broader goal is not just to learn CKB terminology. It is to document the exploration clearly enough that I can use it to evaluate what I should build on CKB as the research progresses.

Start here:

1. Read the hosted docs: [From Solana to CKB](https://ckb.danielasaboro.com/week-1/from-solana-to-ckb).
2. Work through the local exercises in `week1/foundation/`.
3. Follow the weekly updates as the exploration expands beyond the initial foundation material.

## Running the Week 1 exercises

The Week 1 foundation package uses Node.js and the dependencies declared in `week1/foundation/package.json`.

```bash
cd week1/foundation
npm install
npm test
```

The exercise entry points currently included are:

- `01-cell-model-explorer.ts`
- `02-transaction-anatomy.ts`
- `03-capacity-calculator.ts`
- `04-first-ckb-transfer.ts`

## Documentation workflow

The hosted docs are the main public record of this learning process.

- Site URL: `https://ckb.danielasaboro.com/`
- Source: `docs/`
- Expected cadence: weekly updates through `August 13, 2026`

If you are contributing new material, keep the README, local exercises, and hosted docs aligned so the public learning path stays consistent.

## Repository remote

`origin` is set to:

```text
https://github.com/danielAsaboro/CKBuilder.git
```
