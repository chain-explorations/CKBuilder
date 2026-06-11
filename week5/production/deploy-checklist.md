# Week 5 Mainnet Checklist

- Confirm the exact script binaries, code hashes, and `hash_type` values that production transactions are expected to reference.
- Verify every deployed script cell on the target network by recomputing the local binary hash and matching it against the on-chain code cell.
- Keep deployment keys in hardware wallets or multisig custody; do not leave mainnet authority in a hot single-sig key.
- Separate deploy authority, treasury authority, and emergency pause authority when the protocol design allows it.
- Pin RPC, indexer, and explorer endpoints from at least two independent operators for cross-checking.
- Alert on failed transaction bursts, unexpected script-hash appearances, abnormal fee rates, and sudden cell-count growth.
- Rehearse incident response with concrete severities: degraded reads, degraded writes, incorrect script references, and key compromise.
- Record rollback or migration constraints before launch, especially when `hash_type = type` keeps upgrades live.
- Run a dry-run postmortem for one imagined outage before storing real value in the system.
