# Level 3 §43 implementation and acceptance coverage

Pre-addendum product code `a6800e68f4c1e03d0cd0de28fe7febe5864bcdc4`; current addendum candidate `7953ecdbd849c8afe0379bfec1b4a61133292c62`. Research §43 says “twenty” but enumerates 22 items. All are accounted for below; code presence does not close an owner/provider validation gate. Full evidence and limitations are in [productionization](productionization.md).

| Item | Implementation | Acceptance boundary |
| --- | --- | --- |
| 0.1 Producer binding | `collect`, `proof`, `claims`; exact App/workflow, ambiguity and producer edits | Local negatives and live producer/workflow substitution |
| 0.2 Event binding | Eligible event by exact subject kind | Local and live wrong-event controls; final 7953ecd signed queue chain passed under temporary lab Write credential; Read restored; production permission decision open |
| 0.3 Per-claim currentness | `bindings`, `currentness`, targeted service queues, ETags, TTL deliveries | Model/local/live head/base/policy/permission/noise; org-only live enforcement plan gate |
| 0.4 False-NOT_PROVEN triage | Rule classification, writer-scoped reviews, paginated runs, specific gaps | Expanded live repository policy matrix; 22-run fixture; explicit provider limits retained |
| 0.5 Titles/stages | `check`, enforcing/admission titles and exact group subject | Local check/queue publication; final 7953ecd live signed group publication/currentness passed; production credential gate retained |
| 0.6 Model/corpus/version | Real-service seeded world/fetch simulator, shrinking, recorded corpus, frozen policy | Every one of 1,000 seeds retained in isolated workers; final suite 331/331 locally in 40.892 seconds, model 27.802 seconds; CI model passed in 68.147 seconds with its 120-second limit enforced |
| 1.1 ESI | `subject`, exact repository/commit/tree/base/group binding | Local cross-subject negatives; live currentness/queue observations |
| 1.2 Workflow blob | Bound workflow blob and advisory pin observations | Local and live source-change refusal; caller-only reusable workflow boundary |
| 1.3 Authorization graph | `authority`, actors, reviews, permissions, dismissal/activity and bot rules | Live account approval/revocation and permission loss; distinct human principals remain unproven |
| 1.4 Policy/rule suite | Raw/normalized snapshots, bound suite after landing | Live bypass/failed CI/exempt cases and repository policy; org plan gate |
| 1.5 Immutable observations | Observation references, immutable receipt/merge/landing archive, coalesced durable saves | Restart/eviction, write failure, duplicate recovery, immutable history and portable replay |
| 1.6 Reconciliation | Six-hour observation, four-hour delivery recovery, boot/retry, drift counter | Signed App recovery and model missed-delivery cases; optional INFER log parser absent |
| 2.1 Landed content | `landing`, bound commit/tree/parents, push observations, ordered queue predecessor | Live merge/squash/rebase and stale-tree mismatch; exact final squash journey and final 7953ecd signed queue landed chain |
| 2.2 Attestation/SHA lookup | Signed landed statements, archive indexes, authorized HTTP commit lookup | Final live signed portable chain and lookup; production signing gate |
| 3.1 Mirror/pinned Git | Isolated bare mirrors and pinned static build/runtime artifact | Linux static build/TLS and 20 final reconstruction tests; final production-host install gate |
| 3.2 Expected tree | Merge/squash/provider-ordered queue reconstruction and mismatch refusal | Final live ordered prefix, every candidate tree, landed chain and offline recomputation passed; final 7953ecd signed acceptance passed under owner-authorized temporary lab credential |
| 3.3 Rebase | First-parent replay with explicit conflict/merge/empty/duplicate boundaries | Local corpus and live clean single-commit rebase; complex shapes unresolved by design |
| 4.1 Signed portable verifier | KMS adapter, public JWKS endpoint, manifests, DSSE/subjects, frozen versions, optional offline Git and online checks | Final ephemeral-key live bundle verified; real KMS/JWKS mirror and production receipt acceptance require owner |
| 4.2 Operator log/public root | Hash chain, signed daily cumulative Merkle checkpoint/inclusion and explicit immutable publisher | Local positive/negative signature/inclusion tests; public publication not performed |
| 5.1 Machine contract | JSON schema, bearer-authorized decision, CLI/gh, exit codes and check machine line | Live exact PROCEED/wrong-head REFUSE and guarded synthetic merge; OIDC alternative absent |
| 5.2 MCP | Read-only stdio tool with output schema | Actual tools/call fixture-agent stop/proceed/head-race acceptance; no product merge capability |
| 5.3 Differential lab | Private owned fixture drivers, bounded allowlisted observer, diff/drift alarms, runtime metrics | Extensive one-off live matrix and read-only runner smoke; weekly activation and blocked environments require owner |

The selected required §43 code is implemented. Optional log inference, alternative OIDC authentication and the later Quint model are not represented as shipped. Unsupported-evidence boundaries explicitly retained by the charter (such as CODEOWNERS, last-push attribution, org required workflows and incomplete ALLGREEN evidence) remain NOT_PROVEN; a refusal test is not positive capability validation. Production key publication, anchoring, weekly activation and deployment are unexecuted owner operations, not removed requirements. Level 3 remains open until its required acceptance and owner gates are resolved.

The September addendum strengthens items 0.1–0.4, 1.4 and 4.1. Execution-policy discovery, actor/event/time binding, fine claim currentness, relevant-policy receipts, coverage rule ingestion and bound numeric evaluation are implemented. Positive coverage collection is not implemented: the documented provider API does not expose the complete qualifying aggregate/provenance. Its fixture-tested evaluator and explicit NOT_PROVEN live boundary do not close that item. See [the separate four-category addendum report](capability-addendum.md). No established Level 3 acceptance criterion is removed, and all owner gates continue to apply to the final product candidate.

The [final signed queue acceptance](signed-queue-final.md) closes the isolated live queue gate, including exact landed content, independent portable replay and archive restart. Administration was restored to Read. Stock token issuance remains Read, so the experimentally demonstrated policy-read Write requirement is now a separate production owner/product-security decision. No production permission architecture has been chosen.
