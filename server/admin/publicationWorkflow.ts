import type {
  EvidenceRecord,
  ExistingAlternative,
  ProblemInsight,
} from '../../src/config/problemExplorer';
import {
  FIRESTORE_COLLECTION_NAMES,
  type DataSourceDocument,
  type EvidenceLinkDocument,
  type ProblemClusterDocument,
  type PublishedProblemDocument,
  type ResearchInsightDocument,
  type SourceObservationDocument,
} from '../../src/data/firestoreContracts';
import {
  containsUnsafeHtmlOrScript,
  deduplicateEvidenceLinks,
  isValidPublicationTransition,
  validateDataSourceRecord,
  validateProblemClusterRecord,
  validatePublishedProblemDocument,
  validateResearchInsightRecord,
  validateSourceObservationRecord,
} from '../../src/data/firestoreValidation';
import {
  buildQualitativeCommercialRelevance,
  computeClusterEvidenceSummary,
  invalidateStaleClusterApproval,
} from './clusteringAndEvidence';
import type { AdminFirestoreStore } from './firebaseAdminClient';

export { invalidateStaleClusterApproval };

export interface PublicationReadinessCheck {
  readonly eligible: boolean;
  readonly errors: readonly string[];
  readonly verifiedSupportingCount: number;
  readonly independentRecordCount: number;
  readonly sourceDiversityCount: number;
}

export function checkClusterPublicationReadiness(params: {
  readonly cluster: ProblemClusterDocument;
  readonly observations: readonly SourceObservationDocument[];
  readonly links: readonly EvidenceLinkDocument[];
  readonly sourcesById: ReadonlyMap<string, DataSourceDocument>;
  readonly founderExceptionReason?: string | null;
}): PublicationReadinessCheck {
  const { cluster, observations, links, sourcesById } = params;
  const errors: string[] = [];

  if (!cluster.title.trim() || cluster.title.trim().length < 8) {
    errors.push('Cluster requires a clear problem title (>= 8 characters).');
  }
  if (!cluster.summary.trim() || cluster.summary.trim().length < 20) {
    errors.push('Cluster requires a clear problem summary (>= 20 characters).');
  }
  if (
    cluster.affectedAudience.length === 0 ||
    cluster.affectedAudience.every((a) => a.toLowerCase().includes('unclassified'))
  ) {
    errors.push('Cluster requires an identified affected customer segment before approval.');
  }
  if (cluster.researchLimitations.length === 0) {
    errors.push('Cluster must document explicit research limitations.');
  }
  if (cluster.evidenceAvailability !== 'verified') {
    errors.push('Cluster evidenceAvailability must be "verified".');
  }

  const obsById = new Map(observations.map((o) => [o.observationId, o]));
  const clusterLinks = links.filter((l) => l.problemId === cluster.problemId);
  const dedup = deduplicateEvidenceLinks(
    clusterLinks,
    new Set(observations.filter((o) => o.removalOrRestrictionStatus === 'active').map((o) => o.observationId))
  );
  if (dedup.invalidReferenceErrors.length > 0) {
    errors.push(...dedup.invalidReferenceErrors);
  }

  let verifiedSupportingCount = 0;
  for (const link of dedup.uniqueLinks) {
    const obs = obsById.get(link.observationId);
    if (!obs) continue;
    const source = sourcesById.get(obs.sourceId);
    if (
      !source ||
      source.permissionReviewStatus !== 'approved' ||
      source.activationStatus !== 'active'
    ) {
      errors.push(
        `Observation "${obs.observationId}" relies on inactive or unapproved source "${obs.sourceId}".`
      );
      continue;
    }
    if (obs.verificationStatus === 'verified' && link.evidenceRole !== 'contradictory') {
      verifiedSupportingCount += 1;
    }
  }

  const summary = computeClusterEvidenceSummary(observations, dedup.uniqueLinks);

  if (verifiedSupportingCount < 1) {
    errors.push('Cluster requires at least 1 active, verified, traceable supporting observation.');
  }

  const effectiveException =
    params.founderExceptionReason?.trim() ||
    cluster.founderExceptionReason?.trim() ||
    '';
  if (summary.independentRecordCount < 2 && !effectiveException) {
    errors.push(
      `Minimum publication threshold requires >= 2 independent supporting observations (found ${summary.independentRecordCount}) unless an explicit founderExceptionReason is provided.`
    );
  }

  return {
    eligible: errors.length === 0,
    errors,
    verifiedSupportingCount,
    independentRecordCount: summary.independentRecordCount,
    sourceDiversityCount: summary.sourceDiversityCount,
  };
}

export function transitionClusterToUnderReview(
  cluster: ProblemClusterDocument,
  input: {
    readonly reviewerId: string;
    readonly reviewNotes?: string | null;
    readonly nowIso?: string;
  }
): ProblemClusterDocument {
  const nowIso = input.nowIso ?? new Date().toISOString();
  if (!isValidPublicationTransition(cluster.publicationStatus, 'under_review')) {
    throw new Error(
      `Invalid editorial transition from "${cluster.publicationStatus}" to "under_review".`
    );
  }
  const reviewerId = input.reviewerId.trim();
  if (!reviewerId) {
    throw new Error('reviewerId is required to submit a cluster for review.');
  }
  if (input.reviewNotes && containsUnsafeHtmlOrScript(input.reviewNotes)) {
    throw new Error('reviewNotes contains disallowed HTML/script content.');
  }

  return {
    ...cluster,
    publicationStatus: 'under_review',
    reviewedBy: reviewerId,
    reviewedAt: nowIso,
    reviewNotes: input.reviewNotes?.trim() || cluster.reviewNotes || null,
    updatedAt: nowIso,
  };
}

export function approveClusterForPublication(
  cluster: ProblemClusterDocument,
  input: {
    readonly approverId: string;
    readonly observations: readonly SourceObservationDocument[];
    readonly links: readonly EvidenceLinkDocument[];
    readonly sourcesById: ReadonlyMap<string, DataSourceDocument>;
    readonly founderExceptionReason?: string | null;
    readonly reviewNotes?: string | null;
    readonly nowIso?: string;
  }
): ProblemClusterDocument {
  const nowIso = input.nowIso ?? new Date().toISOString();
  if (
    cluster.publicationStatus !== 'under_review' ||
    !isValidPublicationTransition(cluster.publicationStatus, 'approved')
  ) {
    throw new Error(
      `Cluster "${cluster.problemId}" must be in "under_review" before approval (current: "${cluster.publicationStatus}").`
    );
  }
  if (!cluster.reviewedBy?.trim() || !cluster.reviewedAt) {
    throw new Error(
      `Cluster "${cluster.problemId}" lacks recorded human review submission metadata (reviewedBy / reviewedAt). Submit for review first.`
    );
  }
  const approverId = input.approverId.trim();
  if (!approverId) {
    throw new Error('approverId is required to approve a cluster for publication.');
  }
  if (input.founderExceptionReason !== undefined && input.founderExceptionReason !== null) {
    const trimmedException = input.founderExceptionReason.trim();
    if (!trimmedException || trimmedException.length < 8) {
      throw new Error(
        'founderExceptionReason must be a meaningful rationale (>= 8 characters) when provided.'
      );
    }
    if (containsUnsafeHtmlOrScript(trimmedException)) {
      throw new Error('founderExceptionReason contains disallowed HTML/script content.');
    }
  }

  const readiness = checkClusterPublicationReadiness({
    cluster,
    observations: input.observations,
    links: input.links,
    sourcesById: input.sourcesById,
    founderExceptionReason: input.founderExceptionReason,
  });
  if (!readiness.eligible) {
    throw new Error(
      `Cluster "${cluster.problemId}" failed publication readiness checks: ${readiness.errors.join(' ')}`
    );
  }

  const summary = computeClusterEvidenceSummary(input.observations, input.links);
  const relevance = buildQualitativeCommercialRelevance({
    cluster,
    observations: input.observations,
    links: input.links,
    summary,
    assessedAt: nowIso,
    assessedBy: approverId,
    founderDecisionNote: input.founderExceptionReason?.trim() || null,
  });

  return {
    ...cluster,
    evidenceSummary: summary,
    commercialRelevance: relevance,
    publicationStatus: 'approved',
    approvedBy: approverId,
    approvedAt: nowIso,
    reviewNotes: input.reviewNotes?.trim() || cluster.reviewNotes || null,
    founderExceptionReason:
      input.founderExceptionReason?.trim() || cluster.founderExceptionReason || null,
    updatedAt: nowIso,
  };
}

export function rejectClusterEditorial(
  cluster: ProblemClusterDocument,
  input: {
    readonly reviewerId: string;
    readonly reviewNotes: string;
    readonly nowIso?: string;
  }
): ProblemClusterDocument {
  const nowIso = input.nowIso ?? new Date().toISOString();
  if (!isValidPublicationTransition(cluster.publicationStatus, 'rejected')) {
    throw new Error(
      `Cannot transition cluster "${cluster.problemId}" from "${cluster.publicationStatus}" to "rejected".`
    );
  }
  if (!input.reviewNotes.trim() || containsUnsafeHtmlOrScript(input.reviewNotes)) {
    throw new Error('Rejection requires safe non-empty reviewNotes.');
  }
  return {
    ...cluster,
    publicationStatus: 'rejected',
    approvedBy: null,
    approvedAt: null,
    reviewedBy: input.reviewerId.trim(),
    reviewedAt: nowIso,
    reviewNotes: input.reviewNotes.trim(),
    updatedAt: nowIso,
  };
}

/**
 * Projects an approved internal ProblemCluster + active verified observations into
 * a sanitized public `PublishedProblemDocument`.
 * Strips internal editorial notes, reviewer identities, raw unverified observations,
 * and ensures all insights/alternatives reference only sanitized public evidence IDs.
 */
export function buildPublishedProblemProjection(params: {
  readonly cluster: ProblemClusterDocument;
  readonly observations: readonly SourceObservationDocument[];
  readonly links: readonly EvidenceLinkDocument[];
  readonly insights: readonly ResearchInsightDocument[];
  readonly sourcesById: ReadonlyMap<string, DataSourceDocument>;
  readonly publishedAtIso?: string;
}): PublishedProblemDocument {
  const { cluster, observations, links, insights, sourcesById } = params;
  const publishedAt = params.publishedAtIso ?? new Date().toISOString();

  if (cluster.publicationStatus !== 'approved' && cluster.publicationStatus !== 'published') {
    throw new Error(
      `Cannot build public projection for "${cluster.problemId}" while status is "${cluster.publicationStatus}". Approval is required first.`
    );
  }

  const obsById = new Map(observations.map((o) => [o.observationId, o]));
  const clusterLinks = links.filter((l) => l.problemId === cluster.problemId);
  const deduped = deduplicateEvidenceLinks(
    clusterLinks,
    new Set(
      observations
        .filter((o) => o.removalOrRestrictionStatus === 'active')
        .map((o) => o.observationId)
    )
  );

  // Build sanitized verified EvidenceRecord[]
  const evidence: EvidenceRecord[] = [];
  for (const link of deduped.uniqueLinks) {
    const obs = obsById.get(link.observationId);
    if (!obs || obs.verificationStatus !== 'verified' || obs.removalOrRestrictionStatus !== 'active') {
      continue;
    }
    const source = sourcesById.get(obs.sourceId);
    if (!source || source.activationStatus !== 'active' || source.permissionReviewStatus !== 'approved') {
      continue;
    }

    evidence.push({
      id: obs.observationId,
      problemId: cluster.problemId,
      sourceType: obs.sourceType ?? 'field_observation',
      sourceName: obs.sourceName ?? source.sourceName,
      excerpt: obs.permittedExcerptOrSummary,
      observedDate: obs.observationTimestamp,
      externalUrl: obs.permittedSourceUrl,
      verificationStatus: 'verified',
    });
  }

  if (evidence.length === 0) {
    throw new Error(
      `Cannot publish "${cluster.problemId}": zero active verified observations remain after sanitization.`
    );
  }

  const publicEvidenceIds = new Set(evidence.map((e) => e.id));
  const summaryStats = computeClusterEvidenceSummary(observations, deduped.uniqueLinks);
  if (summaryStats.independentRecordCount < 2 && !cluster.founderExceptionReason?.trim()) {
    throw new Error(
      `Cannot publish "${cluster.problemId}": fewer than 2 independent observations without founderExceptionReason.`
    );
  }

  // Map validated insights that only cite sanitized public evidence IDs
  const publicInsights: ProblemInsight[] = [];
  const unknownsFromInsights: string[] = [];

  for (const ins of insights) {
    if (ins.problemId !== cluster.problemId) continue;
    if (ins.insightCategory === 'unknown_information') {
      unknownsFromInsights.push(ins.statement);
      continue;
    }

    const validSupporting = ins.supportingObservationIds.filter((id) =>
      publicEvidenceIds.has(id)
    );
    if (
      (ins.insightCategory === 'verified_observation' ||
        ins.insightCategory === 'evidence_supported_interpretation') &&
      validSupporting.length === 0
    ) {
      continue;
    }

    publicInsights.push({
      id: ins.insightId,
      statement: ins.statement,
      kind:
        ins.insightCategory === 'hypothesis' ? 'hypothesis' : 'evidence_backed',
      supportingEvidenceIds: validSupporting,
    });
  }

  const sanitizedAlternatives: ExistingAlternative[] = (
    cluster.existingAlternatives ?? []
  ).map((alt) => ({
    ...alt,
    supportingEvidenceIds: alt.supportingEvidenceIds.filter((id) =>
      publicEvidenceIds.has(id)
    ),
  }));

  const unknownsAndRisks = Array.from(
    new Set([
      ...(cluster.unresolvedQuestions ?? []),
      ...unknownsFromInsights,
      ...cluster.researchLimitations,
    ])
  ).slice(0, 15);

  const coverageNote = cluster.founderExceptionReason?.trim()
    ? `Published under documented founder exception with ${evidence.length} verified observation(s) across ${summaryStats.sourceDiversityCount} distinct source(s).`
    : `Based on ${evidence.length} verified observation(s) across ${summaryStats.independentRecordCount} independent record(s) and ${summaryStats.sourceDiversityCount} distinct source(s).`;

  const commercialRelevance =
    cluster.commercialRelevance ??
    buildQualitativeCommercialRelevance({
      cluster,
      observations,
      links: deduped.uniqueLinks,
      summary: summaryStats,
      assessedAt: publishedAt,
      founderDecisionNote: cluster.founderExceptionReason ?? null,
    });

  const candidateProjection: PublishedProblemDocument = {
    id: cluster.problemId,
    slug: cluster.problemId,
    title: cluster.title,
    summary: cluster.summary,
    categoryLabel: cluster.categories.join(' · '),
    categories: cluster.categories,
    affectedAudience: cluster.affectedAudience,
    recurrenceNote: cluster.recurrenceNote,
    isIllustrativeDemo: false,
    publishedAt,
    publicationStatus: 'published',
    verifiedEvidenceCount: evidence.length,
    independentEvidenceCount: summaryStats.independentRecordCount,
    sourceDiversityCount: summaryStats.sourceDiversityCount,
    sourceCoverage: summaryStats.sourceDiversityCount,
    geographicalCoverage: summaryStats.geographicalCoverage,
    lastUpdated: summaryStats.latestObservedAt ?? publishedAt,
    coverageNote,
    evidence,
    researchLimitations: cluster.researchLimitations,
    unknownsAndRisks:
      unknownsAndRisks.length > 0
        ? unknownsAndRisks
        : ['Additional market validation still required before building solutions.'],
    insights: publicInsights,
    existingAlternatives: sanitizedAlternatives,
    commercialRelevance,
    founderExceptionNote: cluster.founderExceptionReason ?? null,
    schemaVersion: 1,
  };

  const validated = validatePublishedProblemDocument(
    cluster.problemId,
    candidateProjection
  );
  if (!validated.ok || !validated.value) {
    throw new Error(
      `Published projection failed strict validation: ${validated.errors.join(' ')}`
    );
  }

  return validated.value;
}

export async function loadClusterContextFromStore(
  store: AdminFirestoreStore,
  problemId: string
): Promise<{
  readonly cluster: ProblemClusterDocument;
  readonly observations: readonly SourceObservationDocument[];
  readonly links: readonly EvidenceLinkDocument[];
  readonly insights: readonly ResearchInsightDocument[];
  readonly sourcesById: ReadonlyMap<string, DataSourceDocument>;
}> {
  const clusterSnap = await store.getDocument(
    FIRESTORE_COLLECTION_NAMES.problemClusters,
    problemId
  );
  if (!clusterSnap.exists || !clusterSnap.data) {
    throw new Error(`Problem cluster "problemClusters/${problemId}" does not exist.`);
  }
  const clusterVal = validateProblemClusterRecord(clusterSnap.data);
  if (!clusterVal.ok || !clusterVal.value) {
    throw new Error(
      `Problem cluster "${problemId}" failed schema validation: ${clusterVal.errors.join(' ')}`
    );
  }

  const [sourceSnaps, obsSnaps, linkSnaps, insightSnaps] = await Promise.all([
    store.listDocuments(FIRESTORE_COLLECTION_NAMES.dataSources, { limit: 500 }),
    store.listDocuments(FIRESTORE_COLLECTION_NAMES.sourceObservations, { limit: 1000 }),
    store.listDocuments(FIRESTORE_COLLECTION_NAMES.evidenceLinks, { limit: 1000 }),
    store.listDocuments(FIRESTORE_COLLECTION_NAMES.researchInsights, { limit: 1000 }),
  ]);

  const sourcesById = new Map<string, DataSourceDocument>();
  for (const s of sourceSnaps) {
    if (!s.exists || !s.data) continue;
    const v = validateDataSourceRecord(s.data);
    if (v.ok && v.value) sourcesById.set(v.value.sourceId, v.value);
  }

  const observations: SourceObservationDocument[] = [];
  for (const o of obsSnaps) {
    if (!o.exists || !o.data) continue;
    const v = validateSourceObservationRecord(o.data);
    if (v.ok && v.value) observations.push(v.value);
  }

  const links: EvidenceLinkDocument[] = [];
  for (const l of linkSnaps) {
    if (!l.exists || !l.data) continue;
    const raw = l.data;
    if (raw.problemId === problemId && typeof raw.observationId === 'string') {
      links.push(raw as unknown as EvidenceLinkDocument);
    }
  }

  const insights: ResearchInsightDocument[] = [];
  for (const ins of insightSnaps) {
    if (!ins.exists || !ins.data) continue;
    const v = validateResearchInsightRecord(ins.data);
    if (v.ok && v.value && v.value.problemId === problemId) {
      insights.push(v.value);
    }
  }

  return {
    cluster: clusterVal.value,
    observations,
    links,
    insights,
    sourcesById,
  };
}

export async function publishApprovedCluster(
  store: AdminFirestoreStore,
  problemId: string,
  options: {
    readonly dryRun?: boolean;
    readonly approved?: boolean;
    readonly nowIso?: string;
  } = {}
): Promise<{
  readonly mode: 'dry-run' | 'apply';
  readonly published: boolean;
  readonly blockedReason: string | null;
  readonly projection: PublishedProblemDocument | null;
}> {
  const nowIso = options.nowIso ?? new Date().toISOString();
  const ctx = await loadClusterContextFromStore(store, problemId);

  if (ctx.cluster.publicationStatus !== 'approved') {
    return {
      mode: options.dryRun ? 'dry-run' : 'apply',
      published: false,
      blockedReason: `Cluster "${problemId}" must be in "approved" status before publication (current status: "${ctx.cluster.publicationStatus}").`,
      projection: null,
    };
  }

  if (!ctx.cluster.approvedBy?.trim() || !ctx.cluster.approvedAt) {
    return {
      mode: options.dryRun ? 'dry-run' : 'apply',
      published: false,
      blockedReason: `Cluster "${problemId}" is missing recorded editorial approval metadata (approvedBy / approvedAt). Re-run review-cluster --action approve.`,
      projection: null,
    };
  }

  const readiness = checkClusterPublicationReadiness({
    cluster: ctx.cluster,
    observations: ctx.observations,
    links: ctx.links,
    sourcesById: ctx.sourcesById,
  });
  if (!readiness.eligible) {
    return {
      mode: options.dryRun ? 'dry-run' : 'apply',
      published: false,
      blockedReason: `Cluster "${problemId}" no longer passes publication readiness checks: ${readiness.errors.join(' ')}`,
      projection: null,
    };
  }

  const projection = buildPublishedProblemProjection({
    cluster: ctx.cluster,
    observations: ctx.observations,
    links: ctx.links,
    insights: ctx.insights,
    sourcesById: ctx.sourcesById,
    publishedAtIso: nowIso,
  });

  if (options.dryRun) {
    return {
      mode: 'dry-run',
      published: false,
      blockedReason: null,
      projection,
    };
  }

  if (!options.approved) {
    return {
      mode: 'apply',
      published: false,
      blockedReason: 'Explicit operator approval (--approve) is required before publishing.',
      projection,
    };
  }

  const nextCluster: ProblemClusterDocument = {
    ...ctx.cluster,
    publicationStatus: 'published',
    publishedAt: nowIso,
    updatedAt: nowIso,
  };

  await store.runTransaction(async (txStore) => {
    const liveCluster = await txStore.getDocument(
      FIRESTORE_COLLECTION_NAMES.problemClusters,
      problemId
    );
    if (!liveCluster.exists || !liveCluster.data) {
      throw new Error(`CONCURRENT_MODIFICATION_CONFLICT: Cluster "${problemId}" disappeared.`);
    }
    if (
      liveCluster.data.publicationStatus !== 'approved' ||
      liveCluster.data.updatedAt !== ctx.cluster.updatedAt ||
      liveCluster.data.approvedAt !== ctx.cluster.approvedAt
    ) {
      throw new Error(
        `CONCURRENT_MODIFICATION_CONFLICT: Cluster "${problemId}" approval state changed concurrently (status=${String(liveCluster.data.publicationStatus)}).`
      );
    }
    const existingPublic = await txStore.getDocument(
      FIRESTORE_COLLECTION_NAMES.publishedProblems,
      problemId
    );

    txStore.updateDocument(
      FIRESTORE_COLLECTION_NAMES.problemClusters,
      problemId,
      nextCluster as unknown as Record<string, unknown>
    );
    if (existingPublic.exists) {
      txStore.updateDocument(
        FIRESTORE_COLLECTION_NAMES.publishedProblems,
        problemId,
        projection as unknown as Record<string, unknown>
      );
    } else {
      txStore.createDocument(
        FIRESTORE_COLLECTION_NAMES.publishedProblems,
        problemId,
        projection as unknown as Record<string, unknown>
      );
    }
  });

  // Post-write read-back integrity verification
  const verifiedRead = await store.getDocument(
    FIRESTORE_COLLECTION_NAMES.publishedProblems,
    problemId
  );
  if (!verifiedRead.exists || !verifiedRead.data) {
    throw new Error(`Post-write verification failed: "publishedProblems/${problemId}" not found.`);
  }
  const revalidated = validatePublishedProblemDocument(problemId, verifiedRead.data);
  if (!revalidated.ok) {
    throw new Error(
      `Post-write verification failed for "publishedProblems/${problemId}": ${revalidated.errors.join(' ')}`
    );
  }

  return {
    mode: 'apply',
    published: true,
    blockedReason: null,
    projection: revalidated.value,
  };
}

export async function archivePublishedProblem(
  store: AdminFirestoreStore,
  problemId: string,
  options: {
    readonly archiveReason: string;
    readonly approved?: boolean;
    readonly dryRun?: boolean;
    readonly nowIso?: string;
  }
): Promise<{
  readonly archived: boolean;
  readonly blockedReason: string | null;
}> {
  const nowIso = options.nowIso ?? new Date().toISOString();
  const reason = options.archiveReason.trim();
  if (!reason || containsUnsafeHtmlOrScript(reason)) {
    throw new Error('Archiving requires a safe non-empty archiveReason.');
  }

  const clusterSnap = await store.getDocument(
    FIRESTORE_COLLECTION_NAMES.problemClusters,
    problemId
  );
  if (!clusterSnap.exists || !clusterSnap.data) {
    throw new Error(`Cluster "problemClusters/${problemId}" does not exist.`);
  }
  const clusterVal = validateProblemClusterRecord(clusterSnap.data);
  if (!clusterVal.ok || !clusterVal.value) {
    throw new Error(`Cluster "${problemId}" failed validation.`);
  }
  const cluster = clusterVal.value;
  if (!isValidPublicationTransition(cluster.publicationStatus, 'archived')) {
    return {
      archived: false,
      blockedReason: `Cluster "${problemId}" cannot be archived from status "${cluster.publicationStatus}".`,
    };
  }

  if (options.dryRun) {
    return { archived: false, blockedReason: null };
  }
  if (!options.approved) {
    return {
      archived: false,
      blockedReason: 'Explicit operator approval (--approve) is required before archiving.',
    };
  }

  await store.runTransaction(async (txStore) => {
    const liveCluster = await txStore.getDocument(
      FIRESTORE_COLLECTION_NAMES.problemClusters,
      problemId
    );
    const livePublic = await txStore.getDocument(
      FIRESTORE_COLLECTION_NAMES.publishedProblems,
      problemId
    );
    if (!liveCluster.exists || !liveCluster.data) {
      throw new Error(`Cluster "${problemId}" not found.`);
    }
    txStore.updateDocument(
      FIRESTORE_COLLECTION_NAMES.problemClusters,
      problemId,
      {
        ...liveCluster.data,
        publicationStatus: 'archived',
        archivedAt: nowIso,
        archiveReason: reason,
        updatedAt: nowIso,
      }
    );
    if (livePublic.exists && livePublic.data) {
      txStore.updateDocument(
        FIRESTORE_COLLECTION_NAMES.publishedProblems,
        problemId,
        {
          ...livePublic.data,
          publicationStatus: 'archived',
        }
      );
    }
  });

  return { archived: true, blockedReason: null };
}
