import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { pathToFileURL } from 'node:url';
import {
  FIRESTORE_COLLECTION_NAMES,
  type EvidenceLinkDocument,
  type ProblemClusterDocument,
  type SourceObservationDocument,
} from '../../src/data/firestoreContracts';
import {
  validateProblemClusterRecord,
  validateSourceObservationRecord,
} from '../../src/data/firestoreValidation';
import { extractObservationBatch } from './aiExtraction';
import {
  buildQualitativeCommercialRelevance,
  computeClusterEvidenceSummary,
  proposeClustersFromObservations,
} from './clusteringAndEvidence';
import {
  initializeFirebaseAdminFirestore,
  type AdminFirestoreStore,
  type RuntimeIdentityInspection,
} from './firebaseAdminClient';
import {
  buildDemoSeedRecords,
  executeIngestionPlan,
  parseIngestionPayload,
  verifyDemoSeedReadOnly,
  type ConflictPolicy,
  type IngestionRecordInput,
} from './ingestionCore';
import {
  approveClusterForPublication,
  archivePublishedProblem,
  buildPublishedProblemProjection,
  invalidateStaleClusterApproval,
  loadClusterContextFromStore,
  publishApprovedCluster,
  rejectClusterEditorial,
  transitionClusterToUnderReview,
} from './publicationWorkflow';
import { planResearchImport } from './researchImport';

export type CliCommand =
  | 'verify-connection'
  | 'seed-demo'
  | 'ingest'
  | 'research-import'
  | 'extract-observations'
  | 'propose-clusters'
  | 'assess-evidence'
  | 'review-cluster'
  | 'preview-publication'
  | 'publish-problem'
  | 'archive-problem'
  | 'help';

export type ReviewClusterAction = 'submit' | 'approve' | 'reject';

export interface ParsedCliArgs {
  readonly command: CliCommand;
  readonly filePath: string | null;
  readonly problemId?: string;
  readonly observationId?: string;
  readonly action?: ReviewClusterAction;
  readonly reviewer?: string;
  readonly assessedBy?: string;
  readonly notes?: string;
  readonly exceptionReason?: string;
  readonly reason?: string;
  readonly projectId?: string;
  readonly databaseId?: string;
  readonly apply: boolean;
  readonly approve: boolean;
  readonly conflictPolicy: ConflictPolicy;
  readonly confirmOverwrite: readonly string[];
  readonly jsonOutput: boolean;
}

export interface CliDependencies {
  readonly initStore?: (options: {
    projectId?: string;
    databaseId?: string;
  }) => {
    store: AdminFirestoreStore;
    identity: RuntimeIdentityInspection;
  };
  readonly promptApproval?: (summary: string) => Promise<boolean>;
  readonly stdout?: (line: string) => void;
  readonly stderr?: (line: string) => void;
  readonly geminiGenerateContentFn?: (args: {
    model: string;
    contents: string;
    systemInstruction: string;
  }) => Promise<{ readonly text: string | undefined }>;
}

const VALID_COMMANDS = new Set<CliCommand>([
  'verify-connection',
  'seed-demo',
  'ingest',
  'research-import',
  'extract-observations',
  'propose-clusters',
  'assess-evidence',
  'review-cluster',
  'preview-publication',
  'publish-problem',
  'archive-problem',
  'help',
]);

function readFlagValue(
  args: readonly string[],
  index: number,
  flagName: string
): { readonly value: string; readonly nextIndex: number } {
  const token = args[index];
  if (token.includes('=')) {
    const val = token.slice(token.indexOf('=') + 1);
    if (!val) throw new Error(`Flag "${flagName}" requires a value.`);
    return { value: val, nextIndex: index };
  }
  const val = args[index + 1];
  if (!val) throw new Error(`Flag "${flagName}" requires a value.`);
  return { value: val, nextIndex: index + 1 };
}

export function parseCliArgs(argv: readonly string[]): ParsedCliArgs {
  const args = [...argv];
  const rawCommand = args.shift();

  if (!rawCommand || rawCommand === '--help' || rawCommand === '-h' || rawCommand === 'help') {
    return {
      command: 'help',
      filePath: null,
      apply: false,
      approve: false,
      conflictPolicy: 'abort',
      confirmOverwrite: [],
      jsonOutput: false,
    };
  }

  if (!VALID_COMMANDS.has(rawCommand as CliCommand)) {
    throw new Error(
      `Unknown command "${rawCommand}". Expected verify-connection, seed-demo, ingest, research-import, extract-observations, propose-clusters, assess-evidence, review-cluster, preview-publication, publish-problem, or archive-problem.`
    );
  }

  const command = rawCommand as CliCommand;
  let filePath: string | null = null;
  let problemId: string | undefined;
  let observationId: string | undefined;
  let action: ReviewClusterAction | undefined;
  let reviewer: string | undefined;
  let assessedBy: string | undefined;
  let notes: string | undefined;
  let exceptionReason: string | undefined;
  let reason: string | undefined;
  let projectId: string | undefined;
  let databaseId: string | undefined;
  let apply = false;
  let approve = false;
  let conflictPolicy: ConflictPolicy = 'abort';
  let confirmOverwrite: string[] = [];
  let jsonOutput = false;

  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (token === '--dry-run') {
      apply = false;
    } else if (token === '--apply') {
      apply = true;
    } else if (token === '--approve') {
      approve = true;
    } else if (token === '--json') {
      jsonOutput = true;
    } else if (token === '--file' || token === '-f' || token.startsWith('--file=')) {
      const res = readFlagValue(args, i, '--file');
      filePath = res.value;
      i = res.nextIndex;
    } else if (token === '--problem-id' || token.startsWith('--problem-id=')) {
      const res = readFlagValue(args, i, '--problem-id');
      problemId = res.value;
      i = res.nextIndex;
    } else if (token === '--observation-id' || token.startsWith('--observation-id=')) {
      const res = readFlagValue(args, i, '--observation-id');
      observationId = res.value;
      i = res.nextIndex;
    } else if (token === '--action' || token.startsWith('--action=')) {
      const res = readFlagValue(args, i, '--action');
      if (res.value !== 'submit' && res.value !== 'approve' && res.value !== 'reject') {
        throw new Error('Flag "--action" must be submit, approve, or reject.');
      }
      action = res.value;
      i = res.nextIndex;
    } else if (token === '--reviewer' || token.startsWith('--reviewer=')) {
      const res = readFlagValue(args, i, '--reviewer');
      reviewer = res.value;
      i = res.nextIndex;
    } else if (token === '--assessed-by' || token.startsWith('--assessed-by=')) {
      const res = readFlagValue(args, i, '--assessed-by');
      assessedBy = res.value;
      i = res.nextIndex;
    } else if (token === '--notes' || token.startsWith('--notes=')) {
      const res = readFlagValue(args, i, '--notes');
      notes = res.value;
      i = res.nextIndex;
    } else if (token === '--exception-reason' || token.startsWith('--exception-reason=')) {
      const res = readFlagValue(args, i, '--exception-reason');
      exceptionReason = res.value;
      i = res.nextIndex;
    } else if (token === '--reason' || token.startsWith('--reason=')) {
      const res = readFlagValue(args, i, '--reason');
      reason = res.value;
      i = res.nextIndex;
    } else if (token === '--project-id' || token.startsWith('--project-id=')) {
      const res = readFlagValue(args, i, '--project-id');
      projectId = res.value;
      i = res.nextIndex;
    } else if (token === '--database-id' || token.startsWith('--database-id=')) {
      const res = readFlagValue(args, i, '--database-id');
      databaseId = res.value;
      i = res.nextIndex;
    } else if (token === '--on-conflict' || token.startsWith('--on-conflict=')) {
      const res = readFlagValue(args, i, '--on-conflict');
      if (res.value !== 'abort' && res.value !== 'skip' && res.value !== 'overwrite') {
        throw new Error('Flag "--on-conflict" must be abort, skip, or overwrite.');
      }
      conflictPolicy = res.value;
      i = res.nextIndex;
    } else if (token === '--confirm-overwrite' || token.startsWith('--confirm-overwrite=')) {
      const res = readFlagValue(args, i, '--confirm-overwrite');
      confirmOverwrite = res.value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      i = res.nextIndex;
    } else if (token === '--delete' || token === 'delete') {
      throw new Error('Arbitrary deletion is strictly prohibited by Kopi database policy.');
    } else {
      throw new Error(`Unrecognized CLI option "${token}".`);
    }
  }

  if ((command === 'ingest' || command === 'research-import') && !filePath) {
    throw new Error(`Command "${command}" requires --file <path-to-json>.`);
  }
  if (
    (command === 'assess-evidence' ||
      command === 'review-cluster' ||
      command === 'preview-publication' ||
      command === 'publish-problem' ||
      command === 'archive-problem') &&
    !problemId
  ) {
    throw new Error(`Command "${command}" requires --problem-id <id>.`);
  }
  if (command === 'review-cluster' && !action) {
    throw new Error('Command "review-cluster" requires --action submit|approve|reject.');
  }
  if (command === 'archive-problem' && !reason) {
    throw new Error('Command "archive-problem" requires --reason <text>.');
  }

  return {
    command,
    filePath,
    problemId,
    observationId,
    action,
    reviewer,
    assessedBy,
    notes,
    exceptionReason,
    reason,
    projectId,
    databaseId,
    apply,
    approve,
    conflictPolicy,
    confirmOverwrite,
    jsonOutput,
  };
}

function formatSafeCliError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (
    message.toLowerCase().includes('permission_denied') ||
    message.toLowerCase().includes('permission-denied') ||
    message.toLowerCase().includes('insufficient permissions')
  ) {
    return (
      'PERMISSION_DENIED: Active credentials lack Firestore access to the named database. ' +
      'Verify Cloud Shell impersonated ADC (--impersonate-service-account) and the per-database roles/datastore.user IAM binding.'
    );
  }
  return message;
}

async function defaultInteractivePrompt(summary: string): Promise<boolean> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return false;
  }
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    const answer = await rl.question(
      `\n${summary}\nType "APPLY" to approve writing these changes to Firestore: `
    );
    return answer.trim() === 'APPLY';
  } finally {
    rl.close();
  }
}

async function resolveApproval(
  parsed: ParsedCliArgs,
  deps: CliDependencies,
  summary: string
): Promise<boolean> {
  if (parsed.approve) return true;
  const promptFn = deps.promptApproval ?? defaultInteractivePrompt;
  return promptFn(summary);
}

async function runIngestionCommand(
  store: AdminFirestoreStore,
  records: readonly IngestionRecordInput[],
  parsed: ParsedCliArgs,
  deps: CliDependencies,
  out: (line: string) => void,
  errOut: (line: string) => void,
  extraBatchContext?: {
    readonly knownSourceIds?: ReadonlySet<string>;
    readonly verifiedObservationIds?: ReadonlySet<string>;
    readonly allowEditorialClusterTransitions?: boolean;
  }
): Promise<number> {
  const dryRunReport = await executeIngestionPlan(store, records, {
    mode: 'dry-run',
    approved: parsed.approve,
    conflictPolicy: parsed.conflictPolicy,
    approvedOverwritePaths: parsed.confirmOverwrite,
    batchContext: extraBatchContext,
    allowEditorialClusterTransitions:
      extraBatchContext?.allowEditorialClusterTransitions,
  });

  if (!dryRunReport.validationPassed) {
    if (parsed.jsonOutput) {
      out(JSON.stringify(dryRunReport, null, 2));
    } else {
      errOut('Pre-write validation failed:');
      for (const issue of dryRunReport.validationIssues) {
        errOut(`  - ${issue.collection}/${issue.documentId}: ${issue.errors.join('; ')}`);
      }
    }
    return 1;
  }

  if (!parsed.apply) {
    if (parsed.jsonOutput) {
      out(JSON.stringify(dryRunReport, null, 2));
    } else {
      out(
        `Dry-run complete (${dryRunReport.projectId} / ${dryRunReport.databaseId}): create=${dryRunReport.summary.create}, unchanged=${dryRunReport.summary.unchanged}, conflict=${dryRunReport.summary.conflict}, approvedOverwrite=${dryRunReport.summary.approvedOverwrite}`
      );
      for (const decision of dryRunReport.planned) {
        out(
          `  - ${decision.documentPath}: ${decision.action}${decision.changedFields.length ? ` fields=[${decision.changedFields.join(', ')}]` : ''}`
        );
      }
      if (dryRunReport.blockedReason) {
        out(`Notice: ${dryRunReport.blockedReason}`);
      }
    }
    return dryRunReport.blockedReason ? 1 : 0;
  }

  const approved = await resolveApproval(
    parsed,
    deps,
    `Planned Firestore writes for ${dryRunReport.projectId} / ${dryRunReport.databaseId}: create=${dryRunReport.summary.create}, unchanged=${dryRunReport.summary.unchanged}, conflict=${dryRunReport.summary.conflict}, approvedOverwrite=${dryRunReport.summary.approvedOverwrite}`
  );

  const applyReport = await executeIngestionPlan(store, records, {
    mode: 'apply',
    approved,
    conflictPolicy: parsed.conflictPolicy,
    approvedOverwritePaths: parsed.confirmOverwrite,
    batchContext: extraBatchContext,
    allowEditorialClusterTransitions:
      extraBatchContext?.allowEditorialClusterTransitions,
  });

  if (parsed.jsonOutput) {
    out(JSON.stringify(applyReport, null, 2));
  } else {
    out(
      `Apply finished (${applyReport.projectId} / ${applyReport.databaseId}): created=${applyReport.summary.appliedCreates}, updated=${applyReport.summary.appliedUpdates}, skippedConflicts=${applyReport.summary.skippedConflicts}, verifiedWrites=${applyReport.summary.verifiedWrites}`
    );
    if (applyReport.blockedReason) {
      errOut(`Blocked: ${applyReport.blockedReason}`);
    }
  }

  return applyReport.blockedReason ? 1 : 0;
}

export async function runAdminCli(
  argv: readonly string[],
  deps: CliDependencies = {}
): Promise<number> {
  const out = deps.stdout ?? ((line: string) => console.log(line));
  const errOut = deps.stderr ?? ((line: string) => console.error(line));

  let parsed: ParsedCliArgs;
  try {
    parsed = parseCliArgs(argv);
  } catch (err) {
    errOut(`Argument error: ${formatSafeCliError(err)}`);
    return 2;
  }

  if (parsed.command === 'help') {
    out(
      [
        'Kopi Database Admin & Research Engine CLI (Keyless ADC / Named Database Only)',
        '',
        'Usage:',
        '  tsx server/admin/cli.ts verify-connection [--json]',
        '  tsx server/admin/cli.ts seed-demo [--dry-run] [--apply --approve] [--on-conflict=abort|skip|overwrite] [--confirm-overwrite=id1,id2] [--json]',
        '  tsx server/admin/cli.ts ingest --file <records.json> [--dry-run] [--apply --approve] [--on-conflict=abort|skip|overwrite] [--confirm-overwrite=path1,path2] [--json]',
        '  tsx server/admin/cli.ts research-import --file <package.json> [--dry-run] [--apply --approve] [--json]',
        '  tsx server/admin/cli.ts extract-observations [--problem-id <id> | --observation-id <id>] [--dry-run] [--apply --approve] [--json]',
        '  tsx server/admin/cli.ts propose-clusters [--dry-run] [--apply --approve] [--json]',
        '  tsx server/admin/cli.ts assess-evidence --problem-id <id> [--assessed-by <id>] [--dry-run] [--apply --approve] [--json]',
        '  tsx server/admin/cli.ts review-cluster --problem-id <id> --action submit|approve|reject [--reviewer <id>] [--notes <text>] [--exception-reason <text>] [--dry-run] [--apply --approve] [--json]',
        '  tsx server/admin/cli.ts preview-publication --problem-id <id> [--json]',
        '  tsx server/admin/cli.ts publish-problem --problem-id <id> [--dry-run] [--apply --approve] [--json]',
        '  tsx server/admin/cli.ts archive-problem --problem-id <id> --reason <text> [--dry-run] [--apply --approve] [--json]',
      ].join('\n')
    );
    return 0;
  }

  let store: AdminFirestoreStore;
  let identity: RuntimeIdentityInspection;
  try {
    const init = deps.initStore
      ? deps.initStore({
          projectId: parsed.projectId,
          databaseId: parsed.databaseId,
        })
      : initializeFirebaseAdminFirestore({
          projectId: parsed.projectId,
          databaseId: parsed.databaseId,
        });
    store = init.store;
    identity = init.identity;
  } catch (err) {
    errOut(`Initialization error: ${formatSafeCliError(err)}`);
    return 1;
  }

  try {
    if (parsed.command === 'verify-connection') {
      const report = await verifyDemoSeedReadOnly(store);
      if (parsed.jsonOutput) {
        out(JSON.stringify({ identity, report }, null, 2));
      } else {
        out(
          `Verified read-only connection to ${report.projectId} / ${report.databaseId} (ADC: ${identity.adcKind}${identity.impersonatedServiceAccount ? ` -> ${identity.impersonatedServiceAccount}` : ''})`
        );
        for (const item of report.items) {
          out(
            `  - ${item.documentPath}: exists=${item.exists} valid=${item.validationOk} matchesManifest=${item.matchesManifest}${item.errors.length ? ` errors=[${item.errors.join('; ')}]` : ''}`
          );
        }
      }
      return report.allValidAndMatching ? 0 : 1;
    }

    if (parsed.command === 'seed-demo' || parsed.command === 'ingest') {
      const records =
        parsed.command === 'seed-demo'
          ? buildDemoSeedRecords()
          : (() => {
              const resolved = path.resolve(process.cwd(), parsed.filePath!);
              if (!fs.existsSync(resolved)) {
                throw new Error(`Ingestion file not found: "${resolved}".`);
              }
              const rawJson = JSON.parse(fs.readFileSync(resolved, 'utf8')) as unknown;
              return parseIngestionPayload(rawJson);
            })();

      return runIngestionCommand(store, records, parsed, deps, out, errOut);
    }

    if (parsed.command === 'research-import') {
      const resolved = path.resolve(process.cwd(), parsed.filePath!);
      if (!fs.existsSync(resolved)) {
        throw new Error(`Research import package not found: "${resolved}".`);
      }
      const rawPkg = JSON.parse(fs.readFileSync(resolved, 'utf8')) as unknown;
      const plan = await planResearchImport(store, rawPkg);

      if (!plan.ok) {
        if (parsed.jsonOutput) {
          out(JSON.stringify(plan, null, 2));
        } else {
          errOut(`Research import validation failed for package "${plan.packageId}":`);
          for (const err of plan.errors) {
            errOut(`  - ${err}`);
          }
        }
        return 1;
      }

      if (plan.ingestionRecords.length === 0) {
        if (parsed.jsonOutput) {
          out(JSON.stringify({ plan, skippedAllAsDuplicates: true }, null, 2));
        } else {
          out(
            `Research import "${plan.packageId}": 0 new records (${plan.skippedDuplicates.length} duplicate observation(s) skipped).`
          );
        }
        return 0;
      }

      const sourceIds = new Set<string>(plan.acceptedSources.map((s) => s.sourceId));
      const sourceSnaps = await store.listDocuments(FIRESTORE_COLLECTION_NAMES.dataSources, { limit: 500 });
      for (const snap of sourceSnaps) {
        if (snap.exists && snap.data && typeof snap.data.sourceId === 'string') {
          sourceIds.add(snap.data.sourceId);
        }
      }

      return runIngestionCommand(store, plan.ingestionRecords, parsed, deps, out, errOut, {
        knownSourceIds: sourceIds,
      });
    }

    if (parsed.command === 'extract-observations') {
      const obsSnaps = await store.listDocuments(
        FIRESTORE_COLLECTION_NAMES.sourceObservations,
        { limit: 500 }
      );
      let candidateObs: SourceObservationDocument[] = [];
      for (const snap of obsSnaps) {
        if (!snap.exists || !snap.data) continue;
        const val = validateSourceObservationRecord(snap.data);
        if (val.ok && val.value && val.value.removalOrRestrictionStatus === 'active') {
          candidateObs.push(val.value);
        }
      }

      if (parsed.observationId) {
        candidateObs = candidateObs.filter((o) => o.observationId === parsed.observationId);
      } else if (parsed.problemId) {
        const linkSnaps = await store.listDocuments(
          FIRESTORE_COLLECTION_NAMES.evidenceLinks,
          { limit: 1000 }
        );
        const linkedIds = new Set<string>();
        for (const l of linkSnaps) {
          if (l.exists && l.data && l.data.problemId === parsed.problemId && typeof l.data.observationId === 'string') {
            linkedIds.add(l.data.observationId);
          }
        }
        candidateObs = candidateObs.filter((o) => linkedIds.has(o.observationId));
      } else {
        candidateObs = candidateObs.filter((o) => !o.extractedByAi);
      }

      if (candidateObs.length === 0) {
        const msg = 'No eligible active sourceObservations matched extraction criteria.';
        if (parsed.jsonOutput) {
          out(JSON.stringify({ ok: true, processedCount: 0, message: msg }, null, 2));
        } else {
          out(msg);
        }
        return 0;
      }

      // Fail fast before calling Gemini if any targeted observation feeds a live published cluster
      const candidateObsIds = new Set(candidateObs.map((o) => o.observationId));
      const [existingLinkSnaps, existingClusterSnaps] = await Promise.all([
        store.listDocuments(FIRESTORE_COLLECTION_NAMES.evidenceLinks, { limit: 1000 }),
        store.listDocuments(FIRESTORE_COLLECTION_NAMES.problemClusters, { limit: 1000 }),
      ]);
      const publishedClusterIds = new Set<string>();
      for (const cs of existingClusterSnaps) {
        if (cs.exists && cs.data && cs.data.publicationStatus === 'published') {
          publishedClusterIds.add(
            typeof cs.data.problemId === 'string' ? cs.data.problemId : cs.id
          );
        }
      }
      const blockedByPublished = new Set<string>();
      for (const ls of existingLinkSnaps) {
        if (!ls.exists || !ls.data) continue;
        const obsId = typeof ls.data.observationId === 'string' ? ls.data.observationId : '';
        const pid = typeof ls.data.problemId === 'string' ? ls.data.problemId : '';
        if (candidateObsIds.has(obsId) && publishedClusterIds.has(pid)) {
          blockedByPublished.add(pid);
        }
      }
      if (blockedByPublished.size > 0) {
        const blockedList = Array.from(blockedByPublished).sort().join(', ');
        errOut(
          `Blocked: Targeted observations feed live published cluster(s) [${blockedList}]. Archive via archive-problem before running extraction.`
        );
        return 1;
      }

      const batchReport = await extractObservationBatch(candidateObs, {
        generateContentFn: deps.geminiGenerateContentFn,
      });

      if (!batchReport.ok) {
        if (parsed.jsonOutput) {
          out(JSON.stringify(batchReport, null, 2));
        } else {
          errOut(`Gemini extraction failed (${batchReport.failedCount}/${batchReport.processedCount} errors):`);
          for (const o of batchReport.outcomes.filter((item) => !item.ok)) {
            errOut(`  - ${o.observationId} [${o.errorCode}]: ${o.errorMessage}`);
          }
        }
        return 1;
      }

      const records: IngestionRecordInput[] = [];
      const knownSourceIds = new Set<string>();
      const verifiedObsIds = new Set<string>();

      for (const outcome of batchReport.outcomes) {
        if (!outcome.ok || !outcome.updatedObservation) continue;
        knownSourceIds.add(outcome.updatedObservation.sourceId);
        if (outcome.updatedObservation.verificationStatus === 'verified') {
          verifiedObsIds.add(outcome.updatedObservation.observationId);
        }
        records.push({
          collection: FIRESTORE_COLLECTION_NAMES.sourceObservations,
          documentId: outcome.updatedObservation.observationId,
          data: outcome.updatedObservation as unknown as Record<string, unknown>,
        });
        for (const insight of outcome.generatedInsights) {
          records.push({
            collection: FIRESTORE_COLLECTION_NAMES.researchInsights,
            documentId: insight.insightId,
            data: insight as unknown as Record<string, unknown>,
          });
        }
      }

      const effectiveParsed: ParsedCliArgs = {
        ...parsed,
        conflictPolicy: 'overwrite',
        confirmOverwrite: records
          .filter((r) => r.collection === FIRESTORE_COLLECTION_NAMES.sourceObservations)
          .map((r) => `${r.collection}/${r.documentId}`),
      };

      return runIngestionCommand(store, records, effectiveParsed, deps, out, errOut, {
        knownSourceIds,
        verifiedObservationIds: verifiedObsIds,
      });
    }

    if (parsed.command === 'propose-clusters') {
      const obsSnaps = await store.listDocuments(
        FIRESTORE_COLLECTION_NAMES.sourceObservations,
        { limit: 1000 }
      );
      const observations: SourceObservationDocument[] = [];
      for (const snap of obsSnaps) {
        if (!snap.exists || !snap.data) continue;
        const val = validateSourceObservationRecord(snap.data);
        if (val.ok && val.value && val.value.removalOrRestrictionStatus === 'active') {
          observations.push(val.value);
        }
      }

      const proposed = proposeClustersFromObservations(observations);
      if (proposed.clusters.length === 0) {
        const msg = 'No active observations available for clustering.';
        if (parsed.jsonOutput) {
          out(JSON.stringify({ ok: true, clusters: [], message: msg }, null, 2));
        } else {
          out(msg);
        }
        return 0;
      }

      const records: IngestionRecordInput[] = [
        ...proposed.clusters.map((cluster) => ({
          collection: FIRESTORE_COLLECTION_NAMES.problemClusters,
          documentId: cluster.problemId,
          data: cluster as unknown as Record<string, unknown>,
        })),
        ...proposed.evidenceLinks.map((link) => ({
          collection: FIRESTORE_COLLECTION_NAMES.evidenceLinks,
          documentId: link.linkId,
          data: link as unknown as Record<string, unknown>,
        })),
      ];

      if (!parsed.apply && parsed.jsonOutput) {
        out(JSON.stringify({ proposed, recordCount: records.length }, null, 2));
        return 0;
      }

      return runIngestionCommand(store, records, parsed, deps, out, errOut);
    }

    if (parsed.command === 'assess-evidence') {
      const ctx = await loadClusterContextFromStore(store, parsed.problemId!);
      if (ctx.cluster.publicationStatus === 'published') {
        throw new Error(
          `Cluster "${ctx.cluster.problemId}" is currently published. Archive it via archive-problem before re-assessing evidence.`
        );
      }

      const summary = computeClusterEvidenceSummary(ctx.observations, ctx.links);
      const relevance = buildQualitativeCommercialRelevance({
        cluster: ctx.cluster,
        observations: ctx.observations,
        links: ctx.links,
        summary,
        assessedBy: parsed.assessedBy ?? 'kopi-admin-operator',
      });

      const baseCluster = invalidateStaleClusterApproval(ctx.cluster, {
        reasonNote: 'Evidence re-assessed via assess-evidence.',
        nowIso: relevance.assessedAt,
      });

      const updatedCluster: ProblemClusterDocument = {
        ...baseCluster,
        evidenceSummary: summary,
        commercialRelevance: relevance,
        evidenceAvailability: summary.verifiedCount > 0 ? 'verified' : 'unverified_only',
        updatedAt: relevance.assessedAt,
      };

      const record: IngestionRecordInput = {
        collection: FIRESTORE_COLLECTION_NAMES.problemClusters,
        documentId: updatedCluster.problemId,
        data: updatedCluster as unknown as Record<string, unknown>,
      };

      return runIngestionCommand(
        store,
        [record],
        {
          ...parsed,
          conflictPolicy: 'overwrite',
          confirmOverwrite: [`problemClusters/${updatedCluster.problemId}`],
        },
        deps,
        out,
        errOut
      );
    }

    if (parsed.command === 'review-cluster') {
      const ctx = await loadClusterContextFromStore(store, parsed.problemId!);
      const reviewerId = parsed.reviewer ?? 'founder-operator';
      let updatedCluster: ProblemClusterDocument;

      if (parsed.action === 'submit') {
        updatedCluster = transitionClusterToUnderReview(ctx.cluster, {
          reviewerId,
          reviewNotes: parsed.notes,
        });
      } else if (parsed.action === 'approve') {
        updatedCluster = approveClusterForPublication(ctx.cluster, {
          approverId: reviewerId,
          observations: ctx.observations,
          links: ctx.links,
          sourcesById: ctx.sourcesById,
          founderExceptionReason: parsed.exceptionReason,
          reviewNotes: parsed.notes,
        });
      } else {
        updatedCluster = rejectClusterEditorial(ctx.cluster, {
          reviewerId,
          reviewNotes: parsed.notes ?? 'Rejected during editorial review.',
        });
      }

      const record: IngestionRecordInput = {
        collection: FIRESTORE_COLLECTION_NAMES.problemClusters,
        documentId: updatedCluster.problemId,
        data: updatedCluster as unknown as Record<string, unknown>,
      };

      return runIngestionCommand(
        store,
        [record],
        {
          ...parsed,
          conflictPolicy: 'overwrite',
          confirmOverwrite: [`problemClusters/${updatedCluster.problemId}`],
        },
        deps,
        out,
        errOut,
        { allowEditorialClusterTransitions: true }
      );
    }

    if (parsed.command === 'preview-publication') {
      const ctx = await loadClusterContextFromStore(store, parsed.problemId!);
      const projection = buildPublishedProblemProjection({
        cluster: ctx.cluster,
        observations: ctx.observations,
        links: ctx.links,
        insights: ctx.insights,
        sourcesById: ctx.sourcesById,
      });

      if (parsed.jsonOutput) {
        out(JSON.stringify(projection, null, 2));
      } else {
        out(
          `Publication preview for "${projection.id}": verifiedEvidenceCount=${projection.verifiedEvidenceCount}, independentEvidenceCount=${projection.independentEvidenceCount ?? 'n/a'}, insights=${projection.insights.length}`
        );
      }
      return 0;
    }

    if (parsed.command === 'publish-problem') {
      if (!parsed.apply) {
        const dryRes = await publishApprovedCluster(store, parsed.problemId!, {
          dryRun: true,
        });
        if (parsed.jsonOutput) {
          out(JSON.stringify(dryRes, null, 2));
        } else if (dryRes.blockedReason) {
          errOut(`Blocked: ${dryRes.blockedReason}`);
        } else {
          out(
            `Dry-run publish ready for "publishedProblems/${parsed.problemId!}" (verifiedEvidenceCount=${dryRes.projection?.verifiedEvidenceCount ?? 0}).`
          );
        }
        return dryRes.blockedReason ? 1 : 0;
      }

      const approved = await resolveApproval(
        parsed,
        deps,
        `Publish cluster "${parsed.problemId!}" to public collection publishedProblems/${parsed.problemId!} on ${store.projectId} / ${store.databaseId}?`
      );

      const res = await publishApprovedCluster(store, parsed.problemId!, {
        dryRun: false,
        approved,
      });
      if (parsed.jsonOutput) {
        out(JSON.stringify(res, null, 2));
      } else if (res.blockedReason) {
        errOut(`Blocked: ${res.blockedReason}`);
      } else {
        out(`Published and verified "publishedProblems/${parsed.problemId!}".`);
      }
      return res.blockedReason ? 1 : 0;
    }

    if (parsed.command === 'archive-problem') {
      if (!parsed.apply) {
        const dryRes = await archivePublishedProblem(store, parsed.problemId!, {
          archiveReason: parsed.reason!,
          dryRun: true,
        });
        if (parsed.jsonOutput) {
          out(JSON.stringify(dryRes, null, 2));
        } else if (dryRes.blockedReason) {
          errOut(`Blocked: ${dryRes.blockedReason}`);
        } else {
          out(`Dry-run archive valid for "${parsed.problemId!}".`);
        }
        return dryRes.blockedReason ? 1 : 0;
      }

      const approved = await resolveApproval(
        parsed,
        deps,
        `Archive problem "${parsed.problemId!}" (reason: "${parsed.reason!}")?`
      );
      const res = await archivePublishedProblem(store, parsed.problemId!, {
        archiveReason: parsed.reason!,
        dryRun: false,
        approved,
      });
      if (parsed.jsonOutput) {
        out(JSON.stringify(res, null, 2));
      } else if (res.blockedReason) {
        errOut(`Blocked: ${res.blockedReason}`);
      } else {
        out(`Archived "${parsed.problemId!}" cleanly without deletion.`);
      }
      return res.blockedReason ? 1 : 0;
    }

    return 1;
  } catch (err) {
    errOut(`Operation failed: ${formatSafeCliError(err)}`);
    return 1;
  }
}

const isEntrypoint =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isEntrypoint) {
  runAdminCli(process.argv.slice(2)).then((code) => {
    process.exit(code);
  });
}
