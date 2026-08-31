const assert = require('node:assert/strict');
const test = require('node:test');

const { Prisma } = require('@prisma/client');

const datamodel = Prisma.dmmf.datamodel;
const models = new Map(datamodel.models.map((model) => [model.name, model]));

const expectedModels = [
  'ProjectBrandProfile',
  'ProjectBrandProfileVersion',
  'BrandProfileAuditEvent',
  'ContentSource',
  'SourceSyncRun',
  'SourceSnapshot',
  'SourceEvidence',
  'ContentEvidenceAssessment',
  'ContentFact',
  'ContentFactEvidence',
  'ContentContextSnapshot',
  'ContentContextItem',
  'ContentOutputContext',
  'DraftEvidence',
];

function field(modelName, fieldName) {
  const model = models.get(modelName);
  assert.ok(model, `generated Prisma client is missing model ${modelName}`);
  const result = model.fields.find((candidate) => candidate.name === fieldName);
  assert.ok(
    result,
    `generated Prisma client is missing ${modelName}.${fieldName}`
  );
  return result;
}

function scalarShape(modelName, fieldName) {
  const value = field(modelName, fieldName);
  return {
    type: value.type,
    required: value.isRequired,
    list: value.isList,
    default: value.hasDefaultValue ? value.default : null,
  };
}

function relationShape(modelName, fieldName) {
  const value = field(modelName, fieldName);
  return {
    type: value.type,
    required: value.isRequired,
    list: value.isList,
    from: value.relationFromFields,
    to: value.relationToFields,
  };
}

function hasUniqueFields(modelName, expectedFields) {
  const model = models.get(modelName);
  assert.ok(model, `generated Prisma client is missing model ${modelName}`);
  return model.uniqueFields.some(
    (fields) => JSON.stringify(fields) === JSON.stringify(expectedFields)
  );
}

test('generated Prisma contract exposes the additive content-intelligence model set', () => {
  assert.deepEqual(
    expectedModels.filter((modelName) => !models.has(modelName)),
    []
  );
});

test('every content-intelligence root and join has a composite tenant identity', () => {
  for (const modelName of expectedModels) {
    assert.deepEqual(scalarShape(modelName, 'organizationId'), {
      type: 'String',
      required: true,
      list: false,
      default: null,
    });
    assert.equal(
      hasUniqueFields(modelName, ['organizationId', 'id']),
      true,
      `${modelName} must expose @@unique([organizationId, id])`
    );
  }
});

test('brand profile versions, source provenance, facts and context joins enforce tenant-scoped relations', () => {
  const expectedRelations = {
    'ProjectBrandProfile.activeVersion': {
      type: 'ProjectBrandProfileVersion',
      required: false,
      list: false,
      from: ['organizationId', 'activeVersionId'],
      to: ['organizationId', 'id'],
    },
    'ProjectBrandProfileVersion.profile': {
      type: 'ProjectBrandProfile',
      required: true,
      list: false,
      from: ['organizationId', 'profileId'],
      to: ['organizationId', 'id'],
    },
    'BrandProfileAuditEvent.profile': {
      type: 'ProjectBrandProfile',
      required: true,
      list: false,
      from: ['organizationId', 'profileId'],
      to: ['organizationId', 'id'],
    },
    'SourceSyncRun.source': {
      type: 'ContentSource',
      required: true,
      list: false,
      from: ['organizationId', 'sourceId'],
      to: ['organizationId', 'id'],
    },
    'SourceSyncRun.resultSnapshot': {
      type: 'SourceSnapshot',
      required: false,
      list: false,
      from: ['organizationId', 'resultSnapshotId'],
      to: ['organizationId', 'id'],
    },
    'SourceSnapshot.source': {
      type: 'ContentSource',
      required: false,
      list: false,
      from: ['organizationId', 'sourceId'],
      to: ['organizationId', 'id'],
    },
    'ContentSource.currentSnapshot': {
      type: 'SourceSnapshot',
      required: false,
      list: false,
      from: ['organizationId', 'currentSnapshotId'],
      to: ['organizationId', 'id'],
    },
    'SourceEvidence.snapshot': {
      type: 'SourceSnapshot',
      required: true,
      list: false,
      from: ['organizationId', 'sourceSnapshotId'],
      to: ['organizationId', 'id'],
    },
    'ContentEvidenceAssessment.evidence': {
      type: 'SourceEvidence',
      required: true,
      list: false,
      from: ['organizationId', 'evidenceId'],
      to: ['organizationId', 'id'],
    },
    'ContentFactEvidence.fact': {
      type: 'ContentFact',
      required: true,
      list: false,
      from: ['organizationId', 'factId'],
      to: ['organizationId', 'id'],
    },
    'ContentFactEvidence.evidence': {
      type: 'SourceEvidence',
      required: true,
      list: false,
      from: ['organizationId', 'evidenceId'],
      to: ['organizationId', 'id'],
    },
    'ContentContextSnapshot.brandProfileVersion': {
      type: 'ProjectBrandProfileVersion',
      required: false,
      list: false,
      from: ['organizationId', 'brandProfileVersionId'],
      to: ['organizationId', 'id'],
    },
    'ContentContextItem.snapshot': {
      type: 'ContentContextSnapshot',
      required: true,
      list: false,
      from: ['organizationId', 'contentContextSnapshotId'],
      to: ['organizationId', 'id'],
    },
    'ContentOutputContext.post': {
      type: 'Post',
      required: true,
      list: false,
      from: ['organizationId', 'postId'],
      to: ['organizationId', 'id'],
    },
    'ContentOutputContext.snapshot': {
      type: 'ContentContextSnapshot',
      required: true,
      list: false,
      from: ['organizationId', 'contentContextSnapshotId'],
      to: ['organizationId', 'id'],
    },
    'DraftEvidence.evidence': {
      type: 'SourceEvidence',
      required: true,
      list: false,
      from: ['organizationId', 'evidenceId'],
      to: ['organizationId', 'id'],
    },
    'DraftEvidence.post': {
      type: 'Post',
      required: true,
      list: false,
      from: ['organizationId', 'postId'],
      to: ['organizationId', 'id'],
    },
  };

  for (const [path, expected] of Object.entries(expectedRelations)) {
    const [modelName, fieldName] = path.split('.');
    assert.deepEqual(relationShape(modelName, fieldName), expected, path);
  }
});

test('legacy Post and AutoPost rows remain valid while new provenance is typed and nullable', () => {
  assert.deepEqual(scalarShape('Post', 'researchSources'), {
    type: 'String',
    required: true,
    list: false,
    default: '[]',
  });
  assert.deepEqual(scalarShape('Post', 'contentContextSnapshotId'), {
    type: 'String',
    required: false,
    list: false,
    default: null,
  });
  assert.deepEqual(scalarShape('Post', 'brandProfileVersionId'), {
    type: 'String',
    required: false,
    list: false,
    default: null,
  });
  assert.deepEqual(relationShape('Post', 'contentContextSnapshot'), {
    type: 'ContentContextSnapshot',
    required: false,
    list: false,
    from: ['organizationId', 'contentContextSnapshotId'],
    to: ['organizationId', 'id'],
  });
  assert.deepEqual(relationShape('Post', 'brandProfileVersion'), {
    type: 'ProjectBrandProfileVersion',
    required: false,
    list: false,
    from: ['organizationId', 'brandProfileVersionId'],
    to: ['organizationId', 'id'],
  });

  assert.deepEqual(scalarShape('AutoPost', 'contentSourceId'), {
    type: 'String',
    required: false,
    list: false,
    default: null,
  });
  assert.deepEqual(scalarShape('AutoPost', 'brandProfileVersionId'), {
    type: 'String',
    required: false,
    list: false,
    default: null,
  });
  assert.deepEqual(scalarShape('AutoPost', 'workflowVersion'), {
    type: 'Int',
    required: true,
    list: false,
    default: 1,
  });
  assert.deepEqual(scalarShape('AutoPost', 'requiresAttention'), {
    type: 'Boolean',
    required: true,
    list: false,
    default: false,
  });
  assert.deepEqual(relationShape('AutoPost', 'contentSource'), {
    type: 'ContentSource',
    required: false,
    list: false,
    from: ['organizationId', 'contentSourceId'],
    to: ['organizationId', 'id'],
  });
  assert.deepEqual(relationShape('AutoPost', 'brandProfileVersion'), {
    type: 'ProjectBrandProfileVersion',
    required: false,
    list: false,
    from: ['organizationId', 'brandProfileVersionId'],
    to: ['organizationId', 'id'],
  });
});

test('context persistence has literal version and budget defaults', () => {
  assert.deepEqual(scalarShape('ProjectBrandProfileVersion', 'schemaVersion'), {
    type: 'Int',
    required: true,
    list: false,
    default: 1,
  });
  assert.deepEqual(scalarShape('ProjectBrandProfileVersion', 'revision'), {
    type: 'Int',
    required: true,
    list: false,
    default: 1,
  });
  assert.deepEqual(scalarShape('ContentContextSnapshot', 'contractVersion'), {
    type: 'String',
    required: true,
    list: false,
    default: 'content-context/v1',
  });
  assert.deepEqual(scalarShape('ContentContextSnapshot', 'maxFacts'), {
    type: 'Int',
    required: true,
    list: false,
    default: 8,
  });
  assert.deepEqual(scalarShape('ContentContextSnapshot', 'maxEvidence'), {
    type: 'Int',
    required: true,
    list: false,
    default: 8,
  });
  assert.deepEqual(
    scalarShape('ContentContextSnapshot', 'maxRenderedCharacters'),
    {
      type: 'Int',
      required: true,
      list: false,
      default: 12000,
    }
  );
  assert.deepEqual(scalarShape('ContentContextItem', 'factStatement'), {
    type: 'String',
    required: false,
    list: false,
    default: null,
  });
  assert.deepEqual(scalarShape('ContentContextItem', 'factTemporalKind'), {
    type: 'String',
    required: false,
    list: false,
    default: null,
  });
  assert.deepEqual(scalarShape('ContentContextItem', 'factVerifiedAt'), {
    type: 'DateTime',
    required: false,
    list: false,
    default: null,
  });
  assert.deepEqual(scalarShape('ContentContextItem', 'factFreshUntil'), {
    type: 'DateTime',
    required: false,
    list: false,
    default: null,
  });
  assert.deepEqual(
    scalarShape('ContentContextItem', 'factEvidenceCitationIds'),
    {
      type: 'Json',
      required: false,
      list: false,
      default: null,
    }
  );
});

test('source snapshots expose safe nullable search-provider provenance', () => {
  assert.deepEqual(scalarShape('SourceSnapshot', 'retrievalProvider'), {
    type: 'String',
    required: false,
    list: false,
    default: null,
  });
  assert.deepEqual(scalarShape('SourceSnapshot', 'providerMetadata'), {
    type: 'Json',
    required: false,
    list: false,
    default: null,
  });
});
