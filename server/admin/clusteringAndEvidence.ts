import type { QuickExploreCategory } from '../../src/config/opportunityRadar';
import {
  SUPPORTED_PROBLEM_CATEGORIES,
  type ClusterEvidenceSummary,
  type CommercialRelevanceAssessment,
  type CommercialRelevanceDimensionAssessment,
  type CommercialRelevanceStatus,
  type EvidenceLinkDocument,
  type ProblemClusterDocument,
  type ResearchOriginKind,
  type SourceObservationDocument,
} from '../../src/data/firestoreContracts';
import {
  deduplicateEvidenceLinks,
  normalizeTextForFingerprint,
  validateCommercialRelevanceAssessment,
} from '../../src/data/firestoreValidation';

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'for', 'of', 'in', 'on', 'at', 'to', 'from',
  'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'during', 'across',
  'that', 'this', 'their', 'they', 'when', 'who', 'often', 'report', 'reports',
  'users', 'people', 'due', 'lack',
]);

export function tokenizeProblemText(text: string): ReadonlySet<string> {
  const normalized = normalizeTextForFingerprint(text).replace(/[^a-z0-9\s]/g, ' ');
  const tokens = normalized
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !STOP_WORDS.has(t));
  return new Set(tokens);
}

export function computeObservationSimilarity(
  a: SourceObservationDocument,
  b: SourceObservationDocument
): number {
  const textA = [
    a.problemStatement ?? '',
    a.permittedExcerptOrSummary,
    a.affectedCustomerSegment ?? '',
    a.existingWorkaround ?? '',
  ].join(' ');
  const textB = [
    b.problemStatement ?? '',
    b.permittedExcerptOrSummary,
    b.affectedCustomerSegment ?? '',
    b.existingWorkaround ?? '',
  ].join(' ');

  const tokensA = tokenizeProblemText(textA);
  const tokensB = tokenizeProblemText(textB);
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;
  for (const tok of tokensA) {
    if (tokensB.has(tok)) intersection += 1;
  }
  const union = tokensA.size + tokensB.size - intersection;
  const jaccard = union > 0 ? intersection / union : 0;

  // Small boost if affectedCustomerSegment shares meaningful overlap
  let segmentBonus = 0;
  if (a.affectedCustomerSegment && b.affectedCustomerSegment) {
    const segA = tokenizeProblemText(a.affectedCustomerSegment);
    const segB = tokenizeProblemText(b.affectedCustomerSegment);
    let segOverlap = 0;
    for (const s of segA) {
      if (segB.has(s)) segOverlap += 1;
    }
    if (segOverlap > 0) segmentBonus = 0.08;
  }

  return Math.min(1, jaccard + segmentBonus);
}

function inferCategoriesFromObservations(
  observations: readonly SourceObservationDocument[]
): readonly QuickExploreCategory[] {
  const combined = observations
    .map((o) =>
      [o.problemStatement ?? '', o.permittedExcerptOrSummary, o.context ?? ''].join(' ')
    )
    .join(' ')
    .toLowerCase();

  const matches: QuickExploreCategory[] = [];
  if (/student|campus|study|exam|school|college|tutor/.test(combined)) {
    matches.push('Education');
  }
  if (/health|clinic|patient|nutrition|sleep|stress|medical|hospital/.test(combined)) {
    matches.push('Health');
  }
  if (/plastic|packaging|waste|recycl|carbon|sustainab|compost|solar/.test(combined)) {
    matches.push('Sustainability');
  }
  if (/software|api|automation|creator|ai\b|tech|cloud|app/.test(combined)) {
    matches.push('AI & Tech');
  }
  if (matches.length === 0) {
    matches.push('Daily Life');
  }
  return matches.filter((c) =>
    (SUPPORTED_PROBLEM_CATEGORIES as readonly string[]).includes(c)
  );
}

function deriveSlug(seed: string, fallbackIndex: number): string {
  const clean = seed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return clean || `problem-cluster-${fallbackIndex}`;
}

export function deriveIndependenceKey(obs: SourceObservationDocument): string {
  if (obs.independentGroupKey && obs.independentGroupKey.trim()) {
    return obs.independentGroupKey.trim();
  }
  return `${obs.sourceId}:${obs.canonicalUrl ?? obs.contentFingerprint}`;
}

export function computeClusterEvidenceSummary(
  observations: readonly SourceObservationDocument[],
  links: readonly EvidenceLinkDocument[]
): ClusterEvidenceSummary {
  const activeObsById = new Map<string, SourceObservationDocument>();
  for (const obs of observations) {
    if (obs.removalOrRestrictionStatus === 'active') {
      activeObsById.set(obs.observationId, obs);
    }
  }

  const dedup = deduplicateEvidenceLinks(links, new Set(activeObsById.keys()));

  const linkedObs: SourceObservationDocument[] = [];
  const independentKeys = new Set<string>();
  const sourceIds = new Set<string>();
  const geographies = new Set<string>();
  let verifiedCount = 0;
  let contradictoryCount = 0;
  let earliestMs = Number.POSITIVE_INFINITY;
  let latestMs = Number.NEGATIVE_INFINITY;
  let earliestIso: string | null = null;
  let latestIso: string | null = null;

  for (const link of dedup.uniqueLinks) {
    const obs = activeObsById.get(link.observationId);
    if (!obs) continue;

    linkedObs.push(obs);
    if (link.evidenceRole === 'contradictory') {
      contradictoryCount += 1;
    }

    if (obs.verificationStatus === 'verified') {
      verifiedCount += 1;
      sourceIds.add(obs.sourceId);
      if (link.evidenceRole !== 'contradictory') {
        independentKeys.add(deriveIndependenceKey(obs));
      }
      if (obs.geography && obs.geography.trim()) {
        geographies.add(obs.geography.trim());
      }
    }

    const ms = Date.parse(obs.observationTimestamp);
    if (Number.isFinite(ms)) {
      if (ms < earliestMs) {
        earliestMs = ms;
        earliestIso = new Date(ms).toISOString();
      }
      if (ms > latestMs) {
        latestMs = ms;
        latestIso = new Date(ms).toISOString();
      }
    }
  }

  return {
    totalObservations: linkedObs.length,
    verifiedCount,
    independentRecordCount: independentKeys.size,
    sourceDiversityCount: sourceIds.size,
    sourceIds: Array.from(sourceIds).sort(),
    geographicalCoverage: Array.from(geographies).sort(),
    contradictoryCount,
    earliestObservedAt: earliestIso,
    latestObservedAt: latestIso,
  };
}

export function buildQualitativeCommercialRelevance(params: {
  readonly cluster: ProblemClusterDocument;
  readonly observations: readonly SourceObservationDocument[];
  readonly links: readonly EvidenceLinkDocument[];
  readonly summary: ClusterEvidenceSummary;
  readonly assessedBy?: string;
  readonly assessedAt?: string;
  readonly founderDecisionNote?: string | null;
}): CommercialRelevanceAssessment {
  const { cluster, observations, links, summary } = params;
  const assessedAt = params.assessedAt ?? new Date().toISOString();
  const assessedBy = params.assessedBy ?? 'kopi-research-engine';

  const obsById = new Map(observations.map((o) => [o.observationId, o]));
  const verifiedObs = links
    .filter((l) => l.evidenceRole !== 'contradictory')
    .map((l) => obsById.get(l.observationId))
    .filter((o): o is SourceObservationDocument => Boolean(o && o.verificationStatus === 'verified' && o.removalOrRestrictionStatus === 'active'));

  const verifiedIds = verifiedObs.map((o) => o.observationId);
  const consequencesObsIds = verifiedObs
    .filter((o) => Boolean(o.reportedConsequences))
    .map((o) => o.observationId);
  const segmentObsIds = verifiedObs
    .filter((o) => Boolean(o.affectedCustomerSegment))
    .map((o) => o.observationId);
  const workaroundObsIds = verifiedObs
    .filter((o) => Boolean(o.existingWorkaround))
    .map((o) => o.observationId);
  const economicObsIds = verifiedObs
    .filter((o) => Boolean(o.spendingOrWtpSignal))
    .map((o) => o.observationId);

  const hasSingleSourceWarning = summary.independentRecordCount < 2;

  const pickStatus = (
    count: number,
    fullThreshold: number,
    contradicted = false
  ): CommercialRelevanceStatus => {
    if (contradicted) return 'contradicted';
    if (count === 0) return 'insufficient_evidence';
    if (count >= fullThreshold && !hasSingleSourceWarning) return 'supported';
    return 'partially_supported';
  };

  const dimensions: CommercialRelevanceDimensionAssessment[] = [
    {
      key: 'severity',
      label: 'Problem Severity',
      status: pickStatus(consequencesObsIds.length, 2),
      summary:
        consequencesObsIds.length > 0
          ? `${consequencesObsIds.length} verified observation(s) document concrete consequences for affected groups.`
          : 'Concrete severity consequences are not yet established across verified observations.',
      supportingObservationIds: consequencesObsIds,
      unresolvedQuestion:
        consequencesObsIds.length < 2
          ? 'How often does the failure cause measurable financial loss, safety risk, or lost time?'
          : null,
    },
    {
      key: 'recurrence',
      label: 'Recurrence & Persistence',
      status:
        cluster.recurrenceStatus === 'recurring' && summary.independentRecordCount >= 2
          ? 'supported'
          : verifiedIds.length >= 1
            ? 'partially_supported'
            : 'insufficient_evidence',
      summary: `${cluster.recurrenceNote} (${summary.independentRecordCount} independent verified record${summary.independentRecordCount === 1 ? '' : 's'}).`,
      supportingObservationIds: verifiedIds,
      unresolvedQuestion:
        summary.independentRecordCount < 2
          ? 'Does this problem recur across multiple independent cohorts or seasonal cycles?'
          : null,
    },
    {
      key: 'customer_clarity',
      label: 'Affected Customer Clarity',
      status: pickStatus(segmentObsIds.length, 2),
      summary:
        segmentObsIds.length > 0
          ? `Identified affected segments: ${cluster.affectedAudience.join('; ')}.`
          : 'Specific buyer vs end-user personas have not been separated cleanly.',
      supportingObservationIds: segmentObsIds,
      unresolvedQuestion:
        segmentObsIds.length < 2
          ? 'Who controls the budget or procurement decision versus who experiences the pain?'
          : null,
    },
    {
      key: 'existing_alternatives',
      label: 'Existing Alternatives & Workarounds',
      status: pickStatus(
        workaroundObsIds.length + (cluster.existingAlternatives?.length ?? 0),
        2
      ),
      summary:
        workaroundObsIds.length > 0 || (cluster.existingAlternatives?.length ?? 0) > 0
          ? `${workaroundObsIds.length} workaround mention(s) and ${cluster.existingAlternatives?.length ?? 0} documented alternative(s).`
          : 'Current alternatives and manual workarounds remain unverified.',
      supportingObservationIds: workaroundObsIds,
      unresolvedQuestion:
        'Why do existing workarounds fail to resolve the core bottleneck today?',
    },
    {
      key: 'economic_signals',
      label: 'Economic & Willingness-to-Pay Signals',
      status: pickStatus(economicObsIds.length, 2),
      summary:
        economicObsIds.length > 0
          ? `${economicObsIds.length} observation(s) note explicit spending, delay costs, or willingness-to-pay friction.`
          : 'No verified willingness-to-pay or budget allocation evidence has been observed yet.',
      supportingObservationIds: economicObsIds,
      unresolvedQuestion:
        economicObsIds.length === 0
          ? 'Are affected customers actively paying for workarounds or losing measurable money/time?'
          : 'What price ceiling and procurement model fits this segment?',
    },
    {
      key: 'addressability',
      label: 'Solution Addressability',
      status:
        verifiedIds.length >= 2 && workaroundObsIds.length >= 1
          ? 'partially_supported'
          : 'insufficient_evidence',
      summary:
        'Qualitative feasibility cannot be confirmed without validating operational delivery constraints with buyers.',
      supportingObservationIds: workaroundObsIds,
      unresolvedQuestion:
        'What regulatory, distribution, or workflow integration barriers constrain adoption?',
    },
    {
      key: 'evidence_strength',
      label: 'Evidence Independence & Strength',
      status:
        summary.contradictoryCount > summary.verifiedCount
          ? 'contradicted'
          : summary.verifiedCount >= 2 &&
              summary.independentRecordCount >= 2 &&
              summary.sourceDiversityCount >= 2
            ? 'supported'
            : summary.verifiedCount >= 1
              ? 'partially_supported'
              : 'insufficient_evidence',
      summary: `${summary.verifiedCount} verified observation(s) across ${summary.independentRecordCount} independent record(s) and ${summary.sourceDiversityCount} distinct source(s); ${summary.contradictoryCount} contradictory record(s).`,
      supportingObservationIds: verifiedIds,
      unresolvedQuestion: hasSingleSourceWarning
        ? 'Additional independent sources are needed to confirm findings beyond initial observations.'
        : null,
    },
  ];

  const assessment: CommercialRelevanceAssessment = {
    assessedAt,
    assessedBy,
    overallSummary:
      summary.independentRecordCount >= 2
        ? `Qualitative review across ${summary.independentRecordCount} independent verified records (${summary.sourceDiversityCount} distinct source${summary.sourceDiversityCount === 1 ? '' : 's'}). No numerical commercial score is assigned.`
        : `Single-source or thin evidence warning (${summary.independentRecordCount} independent verified record). Qualitative assessment remains preliminary without numerical scoring.`,
    founderDecisionNote: params.founderDecisionNote ?? null,
    dimensions,
  };

  const checked = validateCommercialRelevanceAssessment(assessment);
  if (!checked.ok || !checked.value) {
    throw new Error(`Invalid commercial relevance assessment: ${checked.errors.join(' ')}`);
  }
  return checked.value;
}

export interface ProposedClusteringOutput {
  readonly clusters: readonly ProblemClusterDocument[];
  readonly evidenceLinks: readonly EvidenceLinkDocument[];
  readonly ambiguousPairs: readonly {
    readonly observationA: string;
    readonly observationB: string;
    readonly similarity: number;
    readonly needsHumanReview: true;
  }[];
}

export function proposeClustersFromObservations(
  observations: readonly SourceObservationDocument[],
  options: {
    readonly similarityThreshold?: number;
    readonly ambiguousLowThreshold?: number;
    readonly existingClusters?: readonly ProblemClusterDocument[];
    readonly nowIso?: string;
  } = {}
): ProposedClusteringOutput {
  const similarityThreshold = options.similarityThreshold ?? 0.24;
  const ambiguousLowThreshold = options.ambiguousLowThreshold ?? 0.14;
  const nowIso = options.nowIso ?? new Date().toISOString();

  const activeObservations = observations.filter(
    (obs) => obs.removalOrRestrictionStatus === 'active'
  );

  const buckets: {
    representative: SourceObservationDocument;
    members: SourceObservationDocument[];
  }[] = [];
  const ambiguousPairs: {
    observationA: string;
    observationB: string;
    similarity: number;
    needsHumanReview: true;
  }[] = [];

  for (const obs of activeObservations) {
    let bestBucket: (typeof buckets)[number] | null = null;
    let bestSim = 0;

    for (const bucket of buckets) {
      const sim = computeObservationSimilarity(obs, bucket.representative);
      if (sim > bestSim) {
        bestSim = sim;
        bestBucket = bucket;
      }
      if (sim >= ambiguousLowThreshold && sim < similarityThreshold) {
        ambiguousPairs.push({
          observationA: bucket.representative.observationId,
          observationB: obs.observationId,
          similarity: Number(sim.toFixed(3)),
          needsHumanReview: true,
        });
      }
    }

    if (bestBucket && bestSim >= similarityThreshold) {
      bestBucket.members.push(obs);
    } else {
      buckets.push({ representative: obs, members: [obs] });
    }
  }

  const clusters: ProblemClusterDocument[] = [];
  const evidenceLinks: EvidenceLinkDocument[] = [];

  buckets.forEach((bucket, index) => {
    const primaryTitleSeed =
      bucket.representative.problemStatement ??
      bucket.representative.permittedExcerptOrSummary;
    const slugBase = deriveSlug(primaryTitleSeed, index + 1);
    const problemId = `cluster_${slugBase}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);

    const bucketLinks: EvidenceLinkDocument[] = bucket.members.map((member) => ({
      linkId: `link_${problemId}_${member.observationId}`.slice(0, 128),
      problemId,
      observationId: member.observationId,
      evidenceRole: 'supporting',
      contentFingerprint: member.contentFingerprint,
      verificationStatus: member.verificationStatus,
      createdAt: nowIso,
      schemaVersion: 1,
    }));

    const dedupedLinks = deduplicateEvidenceLinks(bucketLinks).uniqueLinks;
    evidenceLinks.push(...dedupedLinks);

    const summaryStats = computeClusterEvidenceSummary(bucket.members, dedupedLinks);
    const verifiedCount = summaryStats.verifiedCount;

    const audiences = Array.from(
      new Set(
        bucket.members
          .map((m) => m.affectedCustomerSegment?.trim())
          .filter((v): v is string => Boolean(v))
      )
    );
    const consequences = Array.from(
      new Set(
        bucket.members
          .map((m) => m.reportedConsequences?.trim())
          .filter((v): v is string => Boolean(v))
      )
    );
    const workarounds = Array.from(
      new Set(
        bucket.members
          .map((m) => m.existingWorkaround?.trim())
          .filter((v): v is string => Boolean(v))
      )
    );

    const categories = inferCategoriesFromObservations(bucket.members);
    const recurrenceStatus =
      summaryStats.independentRecordCount >= 2
        ? 'recurring'
        : verifiedCount === 1
          ? 'emerging'
          : 'unknown';

    const limitations: string[] = [
      `Based on ${dedupedLinks.length} linked observation(s) across ${summaryStats.sourceDiversityCount} distinct verified source(s).`,
    ];
    if (summaryStats.independentRecordCount < 2) {
      limitations.push(
        'Fewer than 2 independent verified observations; requires additional independent corroboration or explicit founder exception before publication.'
      );
    }
    if (summaryStats.geographicalCoverage.length === 0) {
      limitations.push('Geographical coverage has not yet been established across sources.');
    }

    const hasSyntheticMember = bucket.members.some(
      (m) =>
        m.isSyntheticTestFixture === true ||
        m.researchOrigin === 'synthetic_test_fixture'
    );
    const allGenuineMembers =
      bucket.members.length > 0 &&
      bucket.members.every(
        (m) =>
          m.researchOrigin === 'genuine_research' &&
          m.isSyntheticTestFixture !== true
      );
    const clusterOriginMeta: {
      isSyntheticTestFixture?: boolean;
      researchOrigin?: ResearchOriginKind;
    } = hasSyntheticMember
      ? { isSyntheticTestFixture: true, researchOrigin: 'synthetic_test_fixture' }
      : allGenuineMembers
        ? { isSyntheticTestFixture: false, researchOrigin: 'genuine_research' }
        : {};

    const baseCluster: ProblemClusterDocument = {
      problemId,
      slug: problemId,
      title: primaryTitleSeed.slice(0, 180),
      summary: bucket.representative.permittedExcerptOrSummary.slice(0, 800),
      context: bucket.representative.context ?? null,
      categories,
      affectedAudience:
        audiences.length > 0 ? audiences : ['Unclassified affected group (needs review)'],
      reportedConsequences: consequences,
      existingWorkarounds: workarounds,
      existingAlternatives: [],
      recurrenceStatus,
      recurrenceNote:
        summaryStats.independentRecordCount >= 2
          ? `Observed across ${summaryStats.independentRecordCount} independent records (${summaryStats.earliestObservedAt ?? 'unknown'} to ${summaryStats.latestObservedAt ?? 'unknown'}).`
          : 'Preliminary signal — cross-source recurrence still under review.',
      evidenceAvailability: verifiedCount > 0 ? 'verified' : 'unverified_only',
      researchLimitations: limitations,
      unresolvedQuestions: [
        'Verify buyer budget ownership and willingness to pay across affected cohorts.',
      ],
      evidenceSummary: summaryStats,
      ...clusterOriginMeta,
      publicationStatus: 'draft',
      createdAt: nowIso,
      updatedAt: nowIso,
      schemaVersion: 1,
    };

    const commercialRelevance = buildQualitativeCommercialRelevance({
      cluster: baseCluster,
      observations: bucket.members,
      links: dedupedLinks,
      summary: summaryStats,
      assessedAt: nowIso,
    });

    clusters.push({
      ...baseCluster,
      commercialRelevance,
    });
  });

  return {
    clusters,
    evidenceLinks,
    ambiguousPairs,
  };
}

export function invalidateStaleClusterApproval(
  cluster: ProblemClusterDocument,
  options: {
    readonly reasonNote?: string;
    readonly nowIso?: string;
  } = {}
): ProblemClusterDocument {
  if (cluster.publicationStatus === 'published') {
    throw new Error(
      `Cluster "${cluster.problemId}" is currently published. Archive it via archive-problem before modifying research inputs.`
    );
  }
  if (cluster.publicationStatus !== 'approved') {
    return cluster;
  }
  const nowIso = options.nowIso ?? new Date().toISOString();
  const reasonNote = options.reasonNote?.trim();
  const nextNotes = reasonNote
    ? [cluster.reviewNotes?.trim(), `[Approval invalidated: ${reasonNote}]`]
        .filter(Boolean)
        .join(' | ')
    : cluster.reviewNotes ?? null;

  return {
    ...cluster,
    publicationStatus: 'draft',
    reviewedBy: null,
    reviewedAt: null,
    approvedBy: null,
    approvedAt: null,
    reviewNotes: nextNotes,
    updatedAt: nowIso,
  };
}

export function mergeClusters(params: {
  readonly targetCluster: ProblemClusterDocument;
  readonly sourceCluster: ProblemClusterDocument;
  readonly sourceLinks: readonly EvidenceLinkDocument[];
  readonly targetLinks: readonly EvidenceLinkDocument[];
  readonly observations: readonly SourceObservationDocument[];
  readonly nowIso?: string;
}): {
  readonly mergedCluster: ProblemClusterDocument;
  readonly mergedLinks: readonly EvidenceLinkDocument[];
} {
  if (
    params.targetCluster.publicationStatus === 'published' ||
    params.sourceCluster.publicationStatus === 'published'
  ) {
    throw new Error(
      'Cannot merge live published problem clusters. Archive published clusters before merging.'
    );
  }

  const nowIso = params.nowIso ?? new Date().toISOString();
  const invalidatedTarget = invalidateStaleClusterApproval(params.targetCluster, {
    reasonNote: `Merged with cluster "${params.sourceCluster.problemId}".`,
    nowIso,
  });
  const reassignedLinks: EvidenceLinkDocument[] = params.sourceLinks.map((l) => ({
    ...l,
    linkId: `link_${params.targetCluster.problemId}_${l.observationId}`.slice(0, 128),
    problemId: params.targetCluster.problemId,
  }));

  const dedupedLinks = deduplicateEvidenceLinks([
    ...params.targetLinks,
    ...reassignedLinks,
  ]).uniqueLinks;

  const summary = computeClusterEvidenceSummary(params.observations, dedupedLinks);
  const categories = Array.from(
    new Set([...params.targetCluster.categories, ...params.sourceCluster.categories])
  ) as readonly QuickExploreCategory[];
  const affectedAudience = Array.from(
    new Set([...params.targetCluster.affectedAudience, ...params.sourceCluster.affectedAudience])
  );
  const researchLimitations = Array.from(
    new Set([
      ...params.targetCluster.researchLimitations,
      ...params.sourceCluster.researchLimitations,
    ])
  );

  const mergedSynthetic =
    params.targetCluster.isSyntheticTestFixture === true ||
    params.targetCluster.researchOrigin === 'synthetic_test_fixture' ||
    params.sourceCluster.isSyntheticTestFixture === true ||
    params.sourceCluster.researchOrigin === 'synthetic_test_fixture';
  const mergedOriginMeta: {
    isSyntheticTestFixture?: boolean;
    researchOrigin?: ResearchOriginKind;
  } = mergedSynthetic
    ? { isSyntheticTestFixture: true, researchOrigin: 'synthetic_test_fixture' }
    : params.targetCluster.researchOrigin === 'genuine_research' &&
        params.sourceCluster.researchOrigin === 'genuine_research'
      ? { isSyntheticTestFixture: false, researchOrigin: 'genuine_research' }
      : {};

  const updatedBase: ProblemClusterDocument = {
    ...invalidatedTarget,
    categories,
    affectedAudience,
    researchLimitations,
    evidenceSummary: summary,
    evidenceAvailability: summary.verifiedCount > 0 ? 'verified' : 'unverified_only',
    ...mergedOriginMeta,
    updatedAt: nowIso,
  };

  return {
    mergedCluster: {
      ...updatedBase,
      commercialRelevance: buildQualitativeCommercialRelevance({
        cluster: updatedBase,
        observations: params.observations,
        links: dedupedLinks,
        summary,
        assessedAt: nowIso,
      }),
    },
    mergedLinks: dedupedLinks,
  };
}

export function splitObservationFromCluster(params: {
  readonly cluster: ProblemClusterDocument;
  readonly clusterLinks: readonly EvidenceLinkDocument[];
  readonly observationToSplit: SourceObservationDocument;
  readonly allObservations: readonly SourceObservationDocument[];
  readonly newProblemId: string;
  readonly nowIso?: string;
}): {
  readonly updatedOriginalCluster: ProblemClusterDocument;
  readonly updatedOriginalLinks: readonly EvidenceLinkDocument[];
  readonly newCluster: ProblemClusterDocument;
  readonly newClusterLinks: readonly EvidenceLinkDocument[];
} {
  if (params.cluster.publicationStatus === 'published') {
    throw new Error(
      `Cannot split observation from live published cluster "${params.cluster.problemId}". Archive it first.`
    );
  }

  const nowIso = params.nowIso ?? new Date().toISOString();
  const invalidatedCluster = invalidateStaleClusterApproval(params.cluster, {
    reasonNote: `Split observation "${params.observationToSplit.observationId}" into "${params.newProblemId}".`,
    nowIso,
  });
  const remainingLinks = params.clusterLinks.filter(
    (l) => l.observationId !== params.observationToSplit.observationId
  );
  const remainingSummary = computeClusterEvidenceSummary(
    params.allObservations,
    remainingLinks
  );

  const updatedOriginalBase: ProblemClusterDocument = {
    ...invalidatedCluster,
    evidenceSummary: remainingSummary,
    evidenceAvailability:
      remainingSummary.verifiedCount > 0 ? 'verified' : 'unverified_only',
    updatedAt: nowIso,
  };

  const newLinks: EvidenceLinkDocument[] = [
    {
      linkId: `link_${params.newProblemId}_${params.observationToSplit.observationId}`.slice(
        0,
        128
      ),
      problemId: params.newProblemId,
      observationId: params.observationToSplit.observationId,
      evidenceRole: 'supporting',
      contentFingerprint: params.observationToSplit.contentFingerprint,
      verificationStatus: params.observationToSplit.verificationStatus,
      createdAt: nowIso,
      schemaVersion: 1,
    },
  ];
  const newSummary = computeClusterEvidenceSummary(
    [params.observationToSplit],
    newLinks
  );

  const splitSynthetic =
    params.observationToSplit.isSyntheticTestFixture === true ||
    params.observationToSplit.researchOrigin === 'synthetic_test_fixture' ||
    params.cluster.isSyntheticTestFixture === true ||
    params.cluster.researchOrigin === 'synthetic_test_fixture';
  const splitOriginMeta: {
    isSyntheticTestFixture?: boolean;
    researchOrigin?: ResearchOriginKind;
  } = splitSynthetic
    ? { isSyntheticTestFixture: true, researchOrigin: 'synthetic_test_fixture' }
    : params.observationToSplit.researchOrigin === 'genuine_research'
      ? { isSyntheticTestFixture: false, researchOrigin: 'genuine_research' }
      : {};

  const newClusterBase: ProblemClusterDocument = {
    problemId: params.newProblemId,
    slug: params.newProblemId,
    title: (
      params.observationToSplit.problemStatement ??
      params.observationToSplit.permittedExcerptOrSummary
    ).slice(0, 180),
    summary: params.observationToSplit.permittedExcerptOrSummary.slice(0, 800),
    categories: inferCategoriesFromObservations([params.observationToSplit]),
    affectedAudience: params.observationToSplit.affectedCustomerSegment
      ? [params.observationToSplit.affectedCustomerSegment]
      : ['Unclassified affected group (needs review)'],
    recurrenceStatus: 'emerging',
    recurrenceNote: 'Split into dedicated cluster for independent review.',
    evidenceAvailability:
      newSummary.verifiedCount > 0 ? 'verified' : 'unverified_only',
    researchLimitations: [
      'Split from parent cluster; single observation requires independent corroboration before publication.',
    ],
    evidenceSummary: newSummary,
    ...splitOriginMeta,
    publicationStatus: 'draft',
    createdAt: nowIso,
    updatedAt: nowIso,
    schemaVersion: 1,
  };

  return {
    updatedOriginalCluster: {
      ...updatedOriginalBase,
      commercialRelevance: buildQualitativeCommercialRelevance({
        cluster: updatedOriginalBase,
        observations: params.allObservations,
        links: remainingLinks,
        summary: remainingSummary,
        assessedAt: nowIso,
      }),
    },
    updatedOriginalLinks: remainingLinks,
    newCluster: {
      ...newClusterBase,
      commercialRelevance: buildQualitativeCommercialRelevance({
        cluster: newClusterBase,
        observations: [params.observationToSplit],
        links: newLinks,
        summary: newSummary,
        assessedAt: nowIso,
      }),
    },
    newClusterLinks: newLinks,
  };
}
