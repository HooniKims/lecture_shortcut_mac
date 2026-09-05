# Runtime audit journal

Scope: theme UI and resource behavior; user requested ego-browser.
Hypotheses: H1 redundant display helper launches; H2 repeated DOM replacement; H3 orphaned helper/read threads on errors; H4 retained frontend nodes/listeners after repeated dialogs.
Artifacts: temporary loopback QA server and ego task space (close after QA), native process samples (aggregate only, no private titles/URLs), browser heap measurements using isolated fixture IPC (not OS behavior proof).

Results: H1 source-confirmed redundant helper work removed; H2 unchanged-state/search reuse observed in ego; H3 baseline child leak reproduced and fixed with real process fixtures; H4 node/listener count stable through 300 final-source theme cycles. Heap growth +79,332 bytes remains reported rather than rounded away. Native leaks is inconclusive (restricted analysis,14,400 bytes in AppIntents/NSXPC cycles). Native visual QA blocked by AX/screenshot tooling; no permission bypass attempted.
