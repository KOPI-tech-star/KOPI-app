import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { pathToFileURL } from 'node:url';
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
} from './ingestionCore';

export type CliCommand = 'verify-connection' | 'seed-demo' | 'ingest' | 'help';

export interface ParsedCliArgs {
  readonly command: CliCommand;
  readonly filePath: string | null;
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

  if (
    rawCommand !== 'verify-connection' &&
    rawCommand !== 'seed-demo' &&
    rawCommand !== 'ingest'
  ) {
    throw new Error(
      `Unknown command "${rawCommand}". Expected verify-connection, seed-demo, or ingest.`
    );
  }

  let filePath: string | null = null;
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
    } else if (token === '--file' || token === '-f') {
      const val = args[++i];
      if (!val) throw new Error(`Flag "${token}" requires a file path.`);
      filePath = val;
    } else if (token.startsWith('--file=')) {
      filePath = token.slice('--file='.length);
    } else if (token === '--project-id') {
      projectId = args[++i];
      if (!projectId) throw new Error('Flag "--project-id" requires a value.');
    } else if (token === '--database-id') {
      databaseId = args[++i];
      if (!databaseId) throw new Error('Flag "--database-id" requires a value.');
    } else if (token === '--on-conflict') {
      const val = args[++i];
      if (val !== 'abort' && val !== 'skip' && val !== 'overwrite') {
        throw new Error('Flag "--on-conflict" must be abort, skip, or overwrite.');
      }
      conflictPolicy = val;
    } else if (token.startsWith('--on-conflict=')) {
      const val = token.slice('--on-conflict='.length);
      if (val !== 'abort' && val !== 'skip' && val !== 'overwrite') {
        throw new Error('Flag "--on-conflict" must be abort, skip, or overwrite.');
      }
      conflictPolicy = val;
    } else if (token === '--confirm-overwrite') {
      const val = args[++i];
      if (!val) throw new Error('Flag "--confirm-overwrite" requires comma-separated IDs/paths.');
      confirmOverwrite = val
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (token.startsWith('--confirm-overwrite=')) {
      confirmOverwrite = token
        .slice('--confirm-overwrite='.length)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (token === '--delete' || token === 'delete') {
      throw new Error('Arbitrary deletion is strictly prohibited by Kopi database policy.');
    } else {
      throw new Error(`Unrecognized CLI option "${token}".`);
    }
  }

  if (rawCommand === 'ingest' && !filePath) {
    throw new Error('Command "ingest" requires --file <path-to-json>.');
  }

  return {
    command: rawCommand,
    filePath,
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
        'Kopi Database Admin CLI (Keyless ADC / Named Database Only)',
        '',
        'Usage:',
        '  tsx server/admin/cli.ts verify-connection [--json]',
        '  tsx server/admin/cli.ts seed-demo [--dry-run] [--apply --approve] [--on-conflict=abort|skip|overwrite] [--confirm-overwrite=id1,id2] [--json]',
        '  tsx server/admin/cli.ts ingest --file <records.json> [--dry-run] [--apply --approve] [--on-conflict=abort|skip|overwrite] [--confirm-overwrite=path1,path2] [--json]',
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

    const dryRunReport = await executeIngestionPlan(store, records, {
      mode: 'dry-run',
      approved: parsed.approve,
      conflictPolicy: parsed.conflictPolicy,
      approvedOverwritePaths: parsed.confirmOverwrite,
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

    let approved = parsed.approve;
    if (!approved) {
      const promptFn = deps.promptApproval ?? defaultInteractivePrompt;
      approved = await promptFn(
        `Planned Firestore writes for ${dryRunReport.projectId} / ${dryRunReport.databaseId}: create=${dryRunReport.summary.create}, unchanged=${dryRunReport.summary.unchanged}, conflict=${dryRunReport.summary.conflict}, approvedOverwrite=${dryRunReport.summary.approvedOverwrite}`
      );
    }

    const applyReport = await executeIngestionPlan(store, records, {
      mode: 'apply',
      approved,
      conflictPolicy: parsed.conflictPolicy,
      approvedOverwritePaths: parsed.confirmOverwrite,
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
