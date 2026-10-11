# Tied-team standings revision

User-confirmed rule: exactly two teams tied on wins use head-to-head. For three or more tied teams, compare points scored minus points conceded ONLY in completed group matches among those tied teams. Mini-table wins and set differential must not precede point differential. Preserve existing secondary fallbacks if differential is equal; do not recursively switch a subset to head-to-head. Existing knockout draws are not rewritten.

Implementation: shared ranking used by Worker state, Node state and knockout qualification; equivalent Preview ranking with published standingRank; public pages consume authoritative rank. Operator wording and cache versions updated.

Validation: regression first failed against overall differential; focused 17 standings/Preview tests passed. Independent review found no blockers. Full Worker suite, championship browser and deployment results recorded in task tool outputs.
