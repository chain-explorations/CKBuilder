# Week 6 Protocol Design Checklist

- Model the application as live cells, consumed cells, and replacement cells before naming scripts.
- Keep project identity, milestone identity, receipt identity, and asset identity explicit in type args or cell data.
- Prove contribution totals match receipt totals for every supported asset.
- Prove milestone releases cannot exceed funded treasury cells.
- Require exact recipient lock hashes for release and refund paths.
- Treat deadlines as transaction preconditions backed by headers, not as off-chain jobs.
- Reject stale cells immediately before transaction broadcast.
- Reject mismatched xUDT type hashes on contribution, release, and refund paths.
- Estimate capacity for every persistent data cell before promising protocol economics.
- Decide which data belongs inline and which data belongs in Spore/content cells.
- Build indexer search keys for launch cells, milestone cells, receipt cells, and treasury cells.
- Maintain a production watch list for expected lock/type script hashes.
- Alert on unknown script hashes, suspicious release attempts, dead-cell bursts, and stuck funds.
- Map every audit rule to the cell, script, witness, or header precondition that enforces it.
