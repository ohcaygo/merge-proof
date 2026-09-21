# Recommended Level 3 production configuration

**Current authority update (2026-09-20):** Ryan approved the architecture and $110/month ceiling with disposable Object Lock lifecycle acceptance first and second-account functional validation using `thatguyrw-boop`. [Approved preparation and current gates](LEVEL3-PREPARATION.md) supersede the pending-approval language below. Production deployment/cutover, public trust/checkpoint publication, production companion registration and irreversible production retention remain reserved. Implementation/live-validation identities remain separate.

Original recommendation prepared 2026-09-20, subsequently approved subject to the current authority update above. **No execution implied: no account, App, resource, paid plan, deployment, publication or schedule was created or changed.** This makes the choices in the [release acceptance packet](LEVEL3-RELEASE-PACKET.md) concrete; it does not replace its acceptance requirements.

Recommend a small AWS origin with native KMS identity, the existing Cloudflare Pages front door, immutable backups in a separate recovery account, and GitHub-hosted public trust records and private lab scheduling. Estimated steady-state spend is **$85–100/month; request a $110/month operating budget** at the assumptions below. No annual purchase or reserved instance. No Kubernetes, database migration, load balancer or NAT gateway.

The repository currently documents a dedicated $12/month DigitalOcean origin, Debian 13, Nginx and a single Node writer. This proposal **changes that hosting provider** to obtain short-lived native AWS runtime identity. It preserves the product URL, Pages project, Node service, billing authority, state model, exact Git reconstruction and proof semantics. The move is now owner-approved; it has not been performed. The documented deployment is the basis for this recommendation; production was not inspected this turn.

## Product and permission boundary

Last accepted signed queue-to-landed product: `7953ecdbd849c8afe0379bfec1b4a61133292c62`. Current product candidate: `838ed8f422605bc814c0a7d9d0140dabbe78fedb`, with [separate exact-candidate validation](../validation/enhanced-policy-production-prep-2026-09-20/README.md). It includes complete optional enrollment and lifecycle integration plus operational preparation, but has not completed a fresh live signed queue journey.

Standard installation remains Administration Read. Enhanced Policy Proof uses a separate, explicit customer opt-in and companion installation with only repository Administration Write and mandatory Metadata Read. This is needed to read execution protections, not to set them. GitHub still grants a powerful credential: an application transport restriction cannot change the provider's permission or make a stolen raw credential harmless. [GitHub Actions policies API](https://docs.github.com/en/rest/actions/policies).

Implemented component: exact App/account/installation/repository checks, one-repository token issuance, server-supplied consent checked before each read, a frozen capability exposing only allowed policy GETs, no token return, no redirects, bounded reads, and token revocation on exit. Non-GET repository operations, unrelated administration endpoints, alternate hosts, repository substitution, parent-scope expansion and request bodies are rejected before network I/O. Only fixed installation authentication/issuance/revocation operations use other methods. Tests cover these refusals and default-Read/coverage fail-closed behavior.

The isolated companion process, consent-bound IPC, enrollment UI and lifecycle/currentness routing are implemented in the current candidate. Root-owned credential directories prevent workload replacement of privileged refresh staging. Linux fixture acceptance is separate from the still-required real companion/provider and EC2 systemd/IMDS acceptance. No production companion registration is authorized.

No organization-administration Write or enterprise permission is proposed. Inherited execution-policy detail that cannot be read through the approved repository capability remains unavailable. This preserves the stronger proof requirement without expanding the credential. Positive coverage stays NOT_PROVEN until GitHub or another accepted provider exposes qualifying exact-candidate aggregate/provenance; purchasing Team does not create that source.

## 1. KMS, signing keys and runtime identity

**Selected:** AWS KMS `ECC_NIST_P256`, `SIGN_VERIFY`, `ECDSA_SHA_256`, using the existing DIGEST adapter. One active regional key in an owner-designated production AWS account, `us-east-1`; one independent cold recovery key in a separate owner-designated recovery account, `us-west-2`. Distinct exact key ARNs and `kid`s. Publish both public keys before relying on regional recovery; the recovery signer remains inaccessible to the normal runtime until an approved recovery activation. Use an EC2 instance profile for temporary AWS credentials, never a stored AWS access key.

**Fit and trust:** Matches the implemented ES256/KMS verifier and keeps private signing material non-exportable. The live role may only `kms:Sign` on the active exact ARN with the algorithm/message-type conditions in the release packet. Key administration, trust publication and recovery authority remain separate. KMS attests a signature, not truth of a GitHub observation; provider-trust labels remain. A compromised signer can sign false statements, so retained evidence, replay and independent trust history remain necessary.

**Cost:** Approximately **$3.50/month** for two $1 keys plus 100,000 ECC-256 signing requests at $1.50. Asymmetric signing does not receive the generic free-request allowance. Old retained keys add $1/month each while retained in KMS. [AWS KMS pricing](https://aws.amazon.com/kms/pricing/).

**Operations:** Owner passkeys/MFA, distinct key administrator and runtime roles, CloudTrail management/signing audit retention, deny routine disable/delete/policy/grant changes to the runtime. Rotate asymmetrical keys by creating a new key/`kid`, publishing trust first and retaining historical public keys; rehearse compromise revocation and cold recovery. Runtime identity access must be restricted to the appropriate service boundary, not assumed isolated merely because it is an instance role. [EC2 IAM roles](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/iam-roles-for-amazon-ec2.html).

**Rejected:** Local PEM production signer (exportable secret); static AWS keys on the existing host (unnecessary long-lived authority); CloudHSM (cost and operation disproportionate to this service); multi-Region shared KMS key (existing adapter accepts regional UUID key ARNs, not `mrk-` identifiers, and independent recovery keys avoid that adapter change).

**Authorize:** Designate/reuse or create the two AWS accounts, name primary and backup key administrators, approve the two keys, exact least-privilege IAM policies and real KMS acceptance calls within budget. No production App credential creation is included implicitly.

## 2. JWKS primary publication and independent mirror

**Selected:** Static public JWKS at `https://merge-proof.ohcaygo.com/.well-known/merge-proof/jwks.json` in the existing Cloudflare Pages project. Separate public GitHub repository `ohcaygo/merge-proof-trust` holds reviewed immutable key-set history, revocation history and commit-pinned verification instructions. Proposed repository names are subject to availability, not reserved. The runtime's existing JWKS endpoint must match approved public keys but is not the independent trust bootstrap.

**Fit and trust:** Cloudflare and GitHub provide separate hosting paths. Trust publication uses owner-controlled credentials absent from the proof runtime and anchor publisher. Customers pin an independently obtained key fingerprint/history commit; a key bundled with a receipt never establishes its own trust. Both publications are still operator-controlled, not an independent third-party witness. Offline verification cannot discover later revocation without an updated trust file.

**Cost:** **$0 incremental** at low-volume static hosting/public-repository usage, within the existing Pages/free public repository allowances. Existing domain or account charges are outside this incremental estimate. [Pages limits](https://developers.cloudflare.com/pages/platform/limits/), [GitHub plans](https://github.com/pricing).

**Operations:** Publish reviewed public-only bytes through protected owner release access, independently compare primary/mirror fingerprints, retain old public keys and date/key validity records, and monitor divergence. Never put private keys or raw receipts in this repository.

**Rejected:** Runtime-only JWKS (same compromise boundary); receipt-bundled self-trust; a second URL under the same backend; an elaborate new transparency service before the existing portable trust path is operating.

**Authorize:** Create this public repository and primary path, approve publication ownership and bootstrap fingerprint distribution, then approve the concrete first public key material after KMS acceptance. Approval of the hosting design alone is not approval to publish unknown keys.

## 3. Public anchoring

**Selected:** Separate public repository `ohcaygo/merge-proof-roots`, using the existing signed completed-UTC-day checkpoint and immutable-path publisher. Begin with owner-operated daily publication; automate only after one accepted publication/retrieval cycle and explicit scheduler credential approval.

**Fit and trust:** Publish signed cumulative roots/checkpoints, never receipts, repository names or raw evidence. Keep the resulting immutable commit ID, URL, object hash and externally retrieved bytes with the private acceptance record. GitHub Contents Write is repository-scoped, so a separate roots repository prevents an eventual anchor publisher from rewriting the trusted JWKS repository. The current publisher requires an owned public destination and verifies admin ownership through the owner-operated `gh` identity; it is not yet a narrowly scoped autonomous App publisher.

**Cost:** **$0 incremental** for a small public repository. [GitHub plans](https://github.com/pricing).

**Operations:** One daily completed-root publication, missing-publication alert after the agreed day boundary, periodic independent retrieval, no replacing a changed historical day. The current portable verifier reports external anchoring NOT_PROVEN; a public observation must be verified and retained separately. Do not label a Git commit timestamp a trusted timestamp or claim automatic external-anchor verification exists.

**Rejected:** Mixing trust keys with a roots-writer credential; public raw evidence; blockchain fees; Rekor/TSA integration that would add a new trust protocol before the implemented root path is accepted.

**Authorize:** Create the named public destination and approve the exact first outgoing checkpoint. Separately approve any later automation identity and its repository scope; the proof/companion Apps receive no anchor write permission.

## 4. Production compute/runtime

**Selected:** One on-demand x86-64 EC2 **t3.medium (2 vCPU, 4 GiB)**, Debian 13, `us-east-1`, native instance profile, Nginx, existing Node single-writer service and pinned static Linux Git. Retain the Pages project/customer URL and existing origin hostname. No traffic switch until exact-artifact, backup, KMS, trust, rollback and controlled hosted acceptance pass.

**Fit and trust:** Enough initial headroom for the existing Node/Git/PDF process model without changing storage semantics; avoids a second identity system for KMS. Immutable root-owned releases, non-root service identities, explicit writable state paths, restricted IMDS access, SSM administration, and no open public application port. Permit the existing authenticated Pages-to-origin HTTPS path; validate certificate renewal and ingress rules together. One writer and one availability zone mean repairable outages, not high availability or zero downtime.

**Cost:** About **$31/month compute + $3.65 public IPv4** at 730 hours; disks are listed separately. The currently displayed US East Linux rate is $0.0418/hour. T3 Unlimited excess CPU costs $0.05/vCPU-hour; monitor credits and use the reserve below. No reserved-instance commitment. [T3 pricing](https://aws.amazon.com/ec2/instance-types/t3/), [IPv4 pricing](https://aws.amazon.com/vpc/pricing/).

**Operations:** Monthly OS/runtime patches, supervised restart, daily capacity checks, tested restore automation, exact source/runtime hashes and rollback compatibility. Restore the cold replacement into the recovery region when necessary, only after fencing the old writer. SSM supplies an authenticated administration channel; it does not replace host hardening. [Session Manager](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager.html).

**Rejected:** Keeping DigitalOcean is a valid cheaper cash option ($24/month for the comparable 4 GiB tier), but AWS Roles Anywhere adds certificate issuance/rotation/recovery solely to reach KMS. EC2 removes that operational burden. Containers with EFS, Kubernetes, RDS and autoscaling would require new state/concurrency assumptions. ARM would require rebuilding/revalidating the accepted x86 Git runtime. [DigitalOcean pricing](https://www.digitalocean.com/pricing/droplets), [Roles Anywhere](https://aws.amazon.com/iam/roles-anywhere/).

**Authorize:** The explicit DigitalOcean-to-AWS origin migration and staged provisioning. Preserve the old service/state for an approved rollback window; authorize cutover and later old-host retirement separately. Allow up to one overlapping $12 DigitalOcean month, in addition to the steady-state budget.

## 5. Durable primary storage

**Selected:** Encrypted EBS gp3: **20 GiB OS + 100 GiB dedicated state/archive/mirror volume**, default 3,000 IOPS/125 MiB/s. Keep proof state and factory/account state in separate directories with the existing single-writer locks. Prevent automatic deletion of the data volume with the instance. Fail startup when the intended data mount is absent; never create an empty fallback store.

**Fit and trust:** Native POSIX fsync/atomic rename matches the existing durable Store and immutable archives. EBS supplies storage durability; it does not make two writers safe or establish disaster-recovery freshness. No acknowledgment before durable writes. Encryption uses AWS-managed EBS encryption keys; receipt-signing keys are never used for storage encryption.

**Cost:** About **$9.60/month** at $0.08/GiB-month for 120 GiB. [EBS pricing](https://aws.amazon.com/ebs/pricing/).

**Operations:** Alert at 70%/85% capacity, track inode and archive growth, exercise write denial only in disposable acceptance storage, and preserve state/archive/index/log consistency. No automatic receipt deletion or capacity-triggered evidence pruning.

**Rejected:** Ephemeral instance disk; a network filesystem for concurrent writers; replacing the file store with a database as a prerequisite; treating off-host object storage as a POSIX state-file substitute.

**Authorize:** Volumes/encryption and the initial capacity allocation, with monitored future capacity increases requiring approval outside budget. No production-data copy before the staged migration authorization.

## 6. Backups, restore targets and objectives

**Selected:** Incremental, versioned private S3 backup in the production account/region, with completed independent copies in the recovery account in `us-west-2`. Use **Object Lock compliance retention of 30 days** for completed backup objects/manifests; explicit owner consent is required because retained bytes cannot be deleted early, even by account root. Archive history remains retained without automatic deletion. Preserve daily recovery manifests for 90 days and monthly manifests for 12 months, retaining every object those manifests reference. Add encrypted daily EBS snapshots (7 daily/4 weekly) as a second recovery mechanism, not the only evidence backup.

**Fit and trust:** Recovery survives loss of the active instance, primary region or primary runtime credentials. Backup writers cannot delete objects, shorten retention or assume recovery administration. Recovery copies must not depend on the active receipt-signing key. Use S3 managed encryption and restrictive bucket policies; do not copy application secrets into receipt backups. S3 is private storage, not a public evidence publication. [Object Lock](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html).

**Objectives:** Start a consistent backup every 5 minutes; target **RPO ≤15 minutes** measured from the newest complete independently recoverable manifest. Alert at 10 minutes stale, critical at 15. Target **RTO ≤4 hours** for a host/AZ/primary-region outage using the cold recovery account, prepublished recovery signing key and retained runtime artifacts. These are proposed acceptance targets, **not an achieved SLA**. Account takeover or loss of both publication identities needs a separate incident process; do not promise the same RTO. A locally acknowledged receipt may still be lost within the backup RPO; the current design does not promise zero-loss cross-region acknowledgment.

**Cost:** Reserve **$10–15/month** for up to 100 GiB of retained versions per S3 region, approximately 50 GiB of incremental snapshot data per region, requests/transfer and a small monthly restore drill. This is a planning allowance, not a quoted fixed package. All versions and retained mirror objects count; check actual compression/change rate before activation. [S3 pricing](https://aws.amazon.com/s3/pricing/), [snapshot pricing](https://aws.amazon.com/ebs/snapshots/faqs/).

**Operations:** Implement a consistent state/archive/index/operator-log export and include retained Git objects. A live directory copy is not sufficient. Use the Store's atomic state boundary plus a checked immutable-object closure, or quiesce the writer for a consistent snapshot; verify every referenced object before marking a backup complete. Copy completion in the recovery account is what closes RPO. Run daily integrity checks and a monthly isolated full restore/portable replay; retain measured times. Stop/fence the old writer before opening restored state. Historical recovered receipts remain historical until fresh provider observations establish currentness.

**Rejected:** Only same-host/same-account snapshots; best-effort unverified uploads; a hot second writer; claiming backup scheduling alone meets recovery objectives.

**Authorize:** Both private backup destinations, cross-region transfer, 30-day non-deletability of private customer evidence, manifest retention, RPO/RTO targets and monthly restore capacity. Approve these retention obligations before production data enters Object Lock. The backup automation and selected-host recovery drill remain to be implemented/executed after configuration approval.

## 7. Private scheduler

**Selected:** Private GitHub Actions control repository `ohcaygo-merge-proof-validation-lab/merge-proof-lab-control` in the isolated Team organization below. Weekly Sunday **14:17 UTC** plus manual relevant-schema-change runs. One job at a time, 20-minute cap, bounded provider requests, pinned action/runtime SHAs and private 30-day artifacts. Run the existing read-only differential observer plus separate model/reconstruction checks. Fresh signed queue generation remains a separate explicitly authorized synthetic fixture driver.

**Fit and trust:** Operates away from production and needs no production AWS or signing credentials. Use separate lab App credentials and one-repository short-lived tokens, with the same companion restriction if opted in. Workflow file/write access is credential authority; protect it. Never upload raw customer evidence or put secrets in command arguments. No job may silently edit policies, broaden Apps, revise expectations or deploy.

**Cost:** **$0 expected incremental**, within Team's included 3,000 monthly minutes and 2 GiB storage; budget at most 160 Linux minutes/month for the weekly lane, reserve an optional $5 overage ceiling only if approved. Published standard 2-core Linux overage is $0.006/minute. [Included usage](https://docs.github.com/en/billing/reference/product-usage-included), [Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions).

**Operations:** Dead-man heartbeat through the independent monitor; warn if the weekly run has not completed within four hours of its due time. GitHub schedules may be delayed or dropped, so this is an observation cadence rather than an exact-time guarantee. Review the first baseline manually; never turn missing observations green. The current lab runner explicitly allows only `ohcaygo/merge-proof-l3-lab-*`; add only owner-approved immutable test-org/repository IDs before using this new organization, with refusal regressions and a new candidate. [Schedule behavior](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows).

**Rejected:** Public CI artifacts for private captures; a timer solely on the production host; a second permanent scheduler VM; a general governance automation service.

**Authorize:** The named private repository, fixture-only secret scopes, exact schedule/retention and alert recipient, after one reviewed manual run. No automatic App expansion from the existing selected pair.

## 8. Credential storage

**Selected:** AWS Secrets Manager for production App, OAuth/webhook, proxy and existing billing secrets, with separate names/access for any later companion App. Expect up to ten secrets. Deliver private credential files through restricted systemd credentials/tmpfs; never store them in images, source, environment dumps, receipt backups or lab artifacts. Lab-only keys stay in protected GitHub Actions secrets; owner trust-publication credentials stay out of both runtimes.

**Fit and trust:** Complements temporary IAM credentials and the existing private configuration files without changing billing or App authority. A root-only provisioning/credential boundary must keep the companion secret from the normal proof UID and block that UID from obtaining it through IMDS. An instance profile by itself is a host identity, not per-process separation. This OS/IPC separation requires deployment implementation and tests; the current library alone does not prove it.

**Cost:** About **$4/month** for ten secrets plus small API usage ($0.05/10,000 calls). [Secrets Manager pricing](https://aws.amazon.com/secrets-manager/pricing/).

**Operations:** Separate path/IAM allowlists, redacted errors, documented per-provider rotation, two-owner recovery access, no automatic rotation of external secrets unless the provider side is coordinated. Replicate only secrets needed for recovery with owner-approved recovery access; the count/budget must include replicas. Do not rotate or replace existing live billing credentials as an incidental migration step.

**Rejected:** Shared `.env`, production credentials in CI, static AWS keys, a new Vault cluster, or giving the standard process the companion private key and relying only on coding convention.

**Authorize:** Exact secret inventory and access principals, controlled migration of existing secrets, recovery access and separately the companion App registration. Never request secret values in chat.

## 9. Monitoring and alerts

**Selected:** CloudWatch metrics/logs/alarms and SNS email, plus an independent **Healthchecks.io Hobbyist** dead-man monitor for service/backup/lab heartbeat. Ryan is primary alert owner; name one backup human. No PagerDuty/Datadog purchase initially.

**Fit and trust:** CloudWatch covers durability errors, signer failures, webhook/refresh backlog, storage/memory/CPU credits, stale backups and failed checkpoints. An outside dead-man signal can detect an AWS outage when CloudWatch delivery is unavailable. A false VERIFIED observation is an immediate promotion stop and owner page; availability/permission loss is UNAVAILABLE/NOT_PROVEN, never a passing monitor baseline. Logs/alerts carry operational IDs/counts, not tokens, workflow contents or private repository names.

**Cost:** **$6–10/month** for roughly six custom metrics, ten standard alarms, up to 5 GiB/month log ingest with 30-day retention, small notification/audit traffic. Healthchecks Hobbyist is $0 with 20 checks. These usage assumptions need confirmation during host acceptance. [CloudWatch pricing](https://aws.amazon.com/cloudwatch/pricing/), [Healthchecks pricing](https://healthchecks.io/pricing/).

**Operations:** Exercise real alert delivery/acknowledgment and missing-heartbeat detection, redact before ingestion, review monthly spend and retention, maintain runbooks. Email plus two named owners is a lean response arrangement, not staffed 24/7 incident coverage. Upgrade paging only if a defined response obligation demands it.

**Rejected:** Logs with no alerts; a monitor solely inside the affected host/account; enterprise observability before workload warrants it; automatically changing evidence expectations after an alert.

**Authorize:** Monitoring resources, free external monitor account, exact recipient addresses and backup responder, operational thresholds and retained diagnostic fields. No messages or invitations have been sent.

## 10. Minimum GitHub plan/test organization

**Selected:** A new isolated **GitHub Team** organization, proposed name `ohcaygo-merge-proof-validation-lab`, with **two seats: Ryan’s existing primary and `thatguyrw-boop` accounts for functional validation**. Do not upgrade the production `ohcaygo` organization. Strict minimum for active org branch/tag rules is Team with one licensed owner; the approved second account enables functional authority/approval testing, without claiming independent-human participation.

**Fit and trust:** Organization-wide active ruleset enforcement is available on Team; repository-level rulesets and the existing public queue acceptance are different already-tested surfaces. Use selected public synthetic queue/branch fixtures and a private synthetic push-rules fixture, active inherited org policies and no bypass actors. Test actual enforcement, policy movement, refusal and exact signed proof. No customer repositories belong in this organization. [GitHub org rulesets](https://docs.github.com/en/organizations/managing-organization-settings/creating-rulesets-for-repositories-in-your-organization).

**Cost:** **$8/month for two seats** at the currently advertised $4/user/month first-12-month price; one-seat minimum is $4. Confirm renewal terms and monthly checkout total before purchase; this estimate is not permission for an annual commitment. Actions allocation is counted in the scheduler row, not purchased twice. [GitHub pricing](https://github.com/pricing).

**Operations:** Use `thatguyrw-boop` where GitHub permits it, record second-account functional attribution, create exact fixture allowlists and distinct test App installations only after approval. Keep the existing development App's two selected repositories unchanged. Enterprise-only evaluate mode, org required-workflow or private-queue capabilities, where applicable, remain separately named environment gates; Team is not claimed to enable every Enterprise feature. Unsupported or unreadable facts remain NOT_PROVEN. Team does not solve the missing positive coverage source.

**Rejected:** Upgrading the production org; buying Enterprise before a concrete remaining acceptance requires it; simulating org enforcement with a repository rule; representing Ryan approving with another credential as independent-human proof.

**Authorize:** The new Team org/name, up to two monthly seats, named second human/invitation, explicit synthetic repositories and the separately scoped test Apps needed for signed delivery. Do not register a production companion App through this authorization.

## Budget and ordered owner checklist

Planning estimate in USD, checked against the linked vendor pages on 2026-09-20; 730 compute hours/month, no promotional credits, taxes/support/labor excluded. Assumptions: up to 100,000 ECC signing calls; 120 GiB active disk; 100 GiB retained S3 versions per region; about 50 GiB incremental snapshots per region; ten secrets including replicas; 5 GiB log ingest; two Team seats; weekly lab within included usage. These are capacity assumptions, not measured production volume. Budget includes $5–10/month reserve for CPU credits, egress, restore runs and ordinary request variance. Sustained usage or retained evidence growth can exceed the estimate. Budget alarms at $80 actual/$100 forecast; seek approval before expanding beyond $110. Never enforce a spending threshold by deleting evidence, stopping backups or inventing a passing result.

| Allocation | Estimated monthly USD |
| --- | ---: |
| Compute and IPv4 | 34–35 |
| Active EBS | 9.60 |
| KMS | 3.50 |
| Backup/recovery storage and requests | 10–15 |
| Secrets | 4 |
| Monitoring | 6–10 |
| Team two seats | 8 |
| JWKS, roots, scheduled lab within allowances | 0 incremental |
| Usage/restore reserve | 5–10 |
| Rounded planning envelope / requested budget | **85–100 / 110** |

Approve in this order; each decision releases concrete work, not a renewed exploration phase:

1. **Architecture and budget:** Approve this exact configuration, the origin move to EC2, $110/month operating envelope and at most one $12 overlap month. Designate the two AWS accounts (or authorize creation), primary/recovery administrators, 30-day non-deletable backup retention and 15-minute RPO/4-hour outage RTO acceptance targets. This authorizes isolated provisioning/preparation, not traffic cutover or public trust publication.
2. **Validation environment:** Approve the separate Team organization, two monthly seats, the approved second account, exact synthetic fixtures and test App registrations/installations. Complete Enhanced enrollment/consent/currentness/isolation implementation, exact-org lab allowlisting, one required independent candidate review, full affected regression/model/reconstruction/factory checks, org enforcement acceptance and fresh signed queue-to-landed acceptance on the resulting exact candidate. Preserve the existing production/dev App permissions and selected pair.
3. **Production credentials and host preparation:** After the tested boundary and concrete manifests are reviewable, authorize the production companion App registration separately, exact KMS/IAM/secret resources and controlled credential migration. Keep standard App Read; companion customer opt-in is never automatic. Run real KMS, host preflight, backup/restore, permission isolation, alert and rollback acceptance without directing customer traffic to the new host.
4. **Public trust and anchors:** Approve the two public repositories/static path and then the reviewed first JWKS/history and completed checkpoint bytes. Publish, retrieve independently, pin and verify. Future anchor automation needs its own bounded publishing identity decision.
5. **Exact release and cutover:** Approve the final reviewed SHA/runtime artifacts, controlled hosted fixture, traffic migration and rollback window only after acceptance evidence is complete. Run the complete hosted chain and signed portable replay. Preserve live billing/state and stop the old writer before promoting the new one; retire the old host only after the rollback window and separate approval.
6. **Ongoing operation:** Approve activation of the tested weekly private lab, five-minute backup cycle, monthly restore, monitoring recipients and daily anchoring process. The periodic mechanisms must already have passed their manual acceptance before customer cutover; activation timing is part of the cutover plan. Retain immutable baselines, update the four-category Level 3 report, and stop at any still-unresolved external gate rather than weakening requirements.

Approval of this recommendation does not automatically authorize public publication of unspecified bytes, production traffic changes, broader GitHub permissions, Enterprise upgrades or costs outside the approved envelope. Once the concrete approvals above arrive, continue the existing release sequence directly. Positive coverage collection, complete Enhanced customer integration/OS isolation, new-org runner support, selected-host backup/deployment automation and all unexecuted live owner gates remain explicit work. **Level 3 is not complete.**
