// ActiveApps 4.0 — Professional-Services CRM bootstrap for Twenty.
//
// Builds a system-implementation / consulting CRM at RUNTIME via Twenty's
// metadata API (createOneObject / createOneField on /metadata) and seeds demo
// records via the core REST API (/rest). Idempotent: existing objects/fields
// are reused and objects that already hold records are not re-seeded.
//
// Usage:
//   TWENTY_API_TOKEN=<admin jwt> npx tsx scripts/bootstrap-activeapps.ts
//
// Optional env:
//   SERVER_URL   (default http://localhost:3000)
//   SEED_RECORDS (default "true" — set "false" to only build the data model)

const SERVER_URL = process.env.SERVER_URL ?? 'http://localhost:3000';
const TOKEN = process.env.TWENTY_API_TOKEN;
const SEED_RECORDS = (process.env.SEED_RECORDS ?? 'true') !== 'false';

if (!TOKEN) {
  console.error('Missing TWENTY_API_TOKEN env var (admin JWT).');
  process.exit(1);
}

const authHeaders = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${TOKEN}`,
};

type SelectOption = { label: string; value: string; position: number; color: string };

type FieldSpec = {
  name: string;
  label: string;
  type: string;
  icon?: string;
  description?: string;
  options?: SelectOption[];
  isNullable?: boolean;
};

type RelationSpec = {
  name: string; // source-side field name (on the "many" object)
  label: string;
  icon?: string;
  targetObject: string; // nameSingular of the target ("one" side)
  targetFieldLabel: string; // reciprocal field label on the target
  targetFieldIcon?: string;
};

type ObjectSpec = {
  nameSingular: string;
  namePlural: string;
  labelSingular: string;
  labelPlural: string;
  icon: string;
  description: string;
  fields: FieldSpec[];
  relations: RelationSpec[];
};

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async function metaGql<T = any>(query: string, variables: Record<string, any> = {}): Promise<T> {
  const res = await fetch(`${SERVER_URL}/metadata`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) {
    throw new Error(`Metadata GraphQL error: ${JSON.stringify(json.errors, null, 2)}`);
  }
  return json.data;
}

async function rest(method: string, path: string, body?: unknown): Promise<any> {
  const res = await fetch(`${SERVER_URL}/rest${path}`, {
    method,
    headers: authHeaders,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`REST ${method} ${path} -> ${res.status}: ${text}`);
  }
  return json;
}

// ---------------------------------------------------------------------------
// Metadata reads
// ---------------------------------------------------------------------------

type ObjectInfo = { id: string; nameSingular: string; namePlural: string; fields: Set<string> };

async function fetchObjects(): Promise<Map<string, ObjectInfo>> {
  const data = await metaGql(`
    query {
      objects(paging: { first: 500 }) {
        edges {
          node {
            id
            nameSingular
            namePlural
            fields(paging: { first: 500 }) {
              edges { node { name } }
            }
          }
        }
      }
    }
  `);
  const map = new Map<string, ObjectInfo>();
  for (const edge of data.objects.edges) {
    const node = edge.node;
    const fields = new Set<string>(node.fields.edges.map((e: any) => e.node.name));
    map.set(node.nameSingular, {
      id: node.id,
      nameSingular: node.nameSingular,
      namePlural: node.namePlural,
      fields,
    });
  }
  return map;
}

// ---------------------------------------------------------------------------
// Data model definition
// ---------------------------------------------------------------------------

const o = (value: string, label: string, position: number, color: string): SelectOption => ({
  value,
  label,
  position,
  color,
});

const OBJECTS: ObjectSpec[] = [
  {
    nameSingular: 'engagement',
    namePlural: 'engagements',
    labelSingular: 'Engagement',
    labelPlural: 'Engagements',
    icon: 'IconBriefcase',
    description: 'A client implementation or advisory engagement (project)',
    fields: [
      { name: 'code', label: 'Engagement Code', type: 'TEXT', icon: 'IconHash' },
      {
        name: 'status',
        label: 'Status',
        type: 'SELECT',
        icon: 'IconProgress',
        options: [
          o('PROSPECTIVE', 'Prospective', 0, 'gray'),
          o('KICKOFF', 'Kickoff', 1, 'blue'),
          o('IN_PROGRESS', 'In Progress', 2, 'green'),
          o('ON_HOLD', 'On Hold', 3, 'amber'),
          o('AT_RISK', 'At Risk', 4, 'red'),
          o('CLOSED', 'Closed', 5, 'purple'),
        ],
      },
      {
        name: 'engagementType',
        label: 'Engagement Type',
        type: 'SELECT',
        icon: 'IconCategory',
        options: [
          o('IMPLEMENTATION', 'Implementation', 0, 'blue'),
          o('ADVISORY', 'Advisory', 1, 'violet'),
          o('MANAGED_SERVICES', 'Managed Services', 2, 'turquoise'),
          o('ASSESSMENT', 'Assessment', 3, 'sky'),
        ],
      },
      {
        name: 'billingType',
        label: 'Billing Type',
        type: 'SELECT',
        icon: 'IconReceipt',
        options: [
          o('TIME_AND_MATERIALS', 'Time & Materials', 0, 'amber'),
          o('FIXED_FEE', 'Fixed Fee', 1, 'green'),
          o('RETAINER', 'Retainer', 2, 'iris'),
        ],
      },
      { name: 'startDate', label: 'Start Date', type: 'DATE', icon: 'IconCalendarPlus' },
      { name: 'targetEndDate', label: 'Target End Date', type: 'DATE', icon: 'IconCalendarCheck' },
      { name: 'contractValue', label: 'Contract Value', type: 'CURRENCY', icon: 'IconCurrencyDollar' },
      { name: 'healthScore', label: 'Health Score', type: 'RATING', icon: 'IconHeartbeat' },
      { name: 'driveFolderUrl', label: 'Drive Folder', type: 'LINKS', icon: 'IconBrandGoogleDrive' },
      { name: 'slackChannel', label: 'Slack Channel', type: 'TEXT', icon: 'IconBrandSlack' },
    ],
    relations: [
      { name: 'client', label: 'Client', icon: 'IconBuildingSkyscraper', targetObject: 'company', targetFieldLabel: 'Engagements', targetFieldIcon: 'IconBriefcase' },
      { name: 'sponsor', label: 'Client Sponsor', icon: 'IconUser', targetObject: 'person', targetFieldLabel: 'Sponsored Engagements', targetFieldIcon: 'IconBriefcase' },
      { name: 'opportunity', label: 'Source Opportunity', icon: 'IconTargetArrow', targetObject: 'opportunity', targetFieldLabel: 'Engagements', targetFieldIcon: 'IconBriefcase' },
    ],
  },
  {
    nameSingular: 'statementOfWork',
    namePlural: 'statementOfWorks',
    labelSingular: 'Statement of Work',
    labelPlural: 'Statements of Work',
    icon: 'IconFileDescription',
    description: 'A contracted statement of work under an engagement',
    fields: [
      { name: 'sowNumber', label: 'SOW Number', type: 'TEXT', icon: 'IconHash' },
      {
        name: 'status',
        label: 'Status',
        type: 'SELECT',
        icon: 'IconProgress',
        options: [
          o('DRAFT', 'Draft', 0, 'gray'),
          o('IN_REVIEW', 'In Review', 1, 'amber'),
          o('SIGNED', 'Signed', 2, 'green'),
          o('AMENDED', 'Amended', 3, 'blue'),
          o('EXPIRED', 'Expired', 4, 'red'),
        ],
      },
      { name: 'effectiveDate', label: 'Effective Date', type: 'DATE', icon: 'IconCalendar' },
      { name: 'expirationDate', label: 'Expiration Date', type: 'DATE', icon: 'IconCalendarX' },
      { name: 'value', label: 'Contract Value', type: 'CURRENCY', icon: 'IconCurrencyDollar' },
      { name: 'documentUrl', label: 'Signed Document', type: 'LINKS', icon: 'IconFileCertificate' },
    ],
    relations: [
      { name: 'engagement', label: 'Engagement', icon: 'IconBriefcase', targetObject: 'engagement', targetFieldLabel: 'Statements of Work', targetFieldIcon: 'IconFileDescription' },
    ],
  },
  {
    nameSingular: 'milestone',
    namePlural: 'milestones',
    labelSingular: 'Milestone',
    labelPlural: 'Milestones',
    icon: 'IconFlag',
    description: 'A delivery milestone within an engagement',
    fields: [
      {
        name: 'status',
        label: 'Status',
        type: 'SELECT',
        icon: 'IconProgress',
        options: [
          o('NOT_STARTED', 'Not Started', 0, 'gray'),
          o('IN_PROGRESS', 'In Progress', 1, 'blue'),
          o('BLOCKED', 'Blocked', 2, 'red'),
          o('COMPLETED', 'Completed', 3, 'green'),
        ],
      },
      { name: 'dueDate', label: 'Due Date', type: 'DATE', icon: 'IconCalendarDue' },
      { name: 'completedDate', label: 'Completed Date', type: 'DATE', icon: 'IconCalendarCheck' },
      { name: 'percentComplete', label: 'Percent Complete', type: 'NUMBER', icon: 'IconPercentage' },
      { name: 'isBillingMilestone', label: 'Billing Milestone', type: 'BOOLEAN', icon: 'IconCoin' },
    ],
    relations: [
      { name: 'engagement', label: 'Engagement', icon: 'IconBriefcase', targetObject: 'engagement', targetFieldLabel: 'Milestones', targetFieldIcon: 'IconFlag' },
      { name: 'owner', label: 'Owner', icon: 'IconUserCog', targetObject: 'consultant', targetFieldLabel: 'Owned Milestones', targetFieldIcon: 'IconFlag' },
    ],
  },
  {
    nameSingular: 'deliverable',
    namePlural: 'deliverables',
    labelSingular: 'Deliverable',
    labelPlural: 'Deliverables',
    icon: 'IconPackageExport',
    description: 'A tangible work product produced for a milestone',
    fields: [
      {
        name: 'status',
        label: 'Status',
        type: 'SELECT',
        icon: 'IconProgress',
        options: [
          o('PLANNED', 'Planned', 0, 'gray'),
          o('IN_PROGRESS', 'In Progress', 1, 'blue'),
          o('IN_REVIEW', 'In Review', 2, 'amber'),
          o('DELIVERED', 'Delivered', 3, 'green'),
          o('ACCEPTED', 'Accepted', 4, 'jade'),
          o('REJECTED', 'Rejected', 5, 'red'),
        ],
      },
      { name: 'dueDate', label: 'Due Date', type: 'DATE', icon: 'IconCalendarDue' },
      { name: 'artifactUrl', label: 'Artifact', type: 'LINKS', icon: 'IconLink' },
    ],
    relations: [
      { name: 'milestone', label: 'Milestone', icon: 'IconFlag', targetObject: 'milestone', targetFieldLabel: 'Deliverables', targetFieldIcon: 'IconPackageExport' },
      { name: 'engagement', label: 'Engagement', icon: 'IconBriefcase', targetObject: 'engagement', targetFieldLabel: 'Deliverables', targetFieldIcon: 'IconPackageExport' },
    ],
  },
  {
    nameSingular: 'consultant',
    namePlural: 'consultants',
    labelSingular: 'Consultant',
    labelPlural: 'Consultants',
    icon: 'IconUserCog',
    description: 'An internal consultant or delivery resource',
    fields: [
      {
        name: 'role',
        label: 'Role',
        type: 'SELECT',
        icon: 'IconId',
        options: [
          o('PARTNER', 'Partner', 0, 'gold'),
          o('ENGAGEMENT_MANAGER', 'Engagement Manager', 1, 'iris'),
          o('SOLUTION_ARCHITECT', 'Solution Architect', 2, 'blue'),
          o('SENIOR_CONSULTANT', 'Senior Consultant', 3, 'green'),
          o('CONSULTANT', 'Consultant', 4, 'grass'),
          o('ANALYST', 'Analyst', 5, 'sky'),
        ],
      },
      { name: 'email', label: 'Email', type: 'EMAILS', icon: 'IconMail' },
      { name: 'phone', label: 'Phone', type: 'PHONES', icon: 'IconPhone' },
      { name: 'billRate', label: 'Bill Rate (hourly)', type: 'CURRENCY', icon: 'IconCurrencyDollar' },
      { name: 'utilizationTarget', label: 'Utilization Target %', type: 'NUMBER', icon: 'IconChartBar' },
      { name: 'isAvailable', label: 'Available', type: 'BOOLEAN', icon: 'IconUserCheck' },
    ],
    relations: [
      { name: 'primaryEngagement', label: 'Primary Engagement', icon: 'IconBriefcase', targetObject: 'engagement', targetFieldLabel: 'Consultants', targetFieldIcon: 'IconUserCog' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Metadata writes
// ---------------------------------------------------------------------------

async function createObject(spec: ObjectSpec): Promise<string> {
  const data = await metaGql(
    `mutation($input: CreateOneObjectInput!) {
       createOneObject(input: $input) { id nameSingular }
     }`,
    {
      input: {
        object: {
          nameSingular: spec.nameSingular,
          namePlural: spec.namePlural,
          labelSingular: spec.labelSingular,
          labelPlural: spec.labelPlural,
          icon: spec.icon,
          description: spec.description,
        },
      },
    },
  );
  return data.createOneObject.id;
}

async function createField(objectMetadataId: string, field: FieldSpec): Promise<void> {
  const input: Record<string, any> = {
    objectMetadataId,
    name: field.name,
    label: field.label,
    type: field.type,
    isNullable: field.isNullable ?? true,
  };
  if (field.icon) input.icon = field.icon;
  if (field.description) input.description = field.description;
  if (field.options) input.options = field.options;

  await metaGql(
    `mutation($input: CreateOneFieldMetadataInput!) {
       createOneField(input: $input) { id name }
     }`,
    { input: { field: input } },
  );
}

async function createRelationField(
  sourceObjectId: string,
  rel: RelationSpec,
  targetObjectId: string,
): Promise<void> {
  await metaGql(
    `mutation($input: CreateOneFieldMetadataInput!) {
       createOneField(input: $input) { id name }
     }`,
    {
      input: {
        field: {
          objectMetadataId: sourceObjectId,
          name: rel.name,
          label: rel.label,
          type: 'RELATION',
          icon: rel.icon ?? 'IconRelationManyToOne',
          relationCreationPayload: {
            type: 'MANY_TO_ONE',
            targetObjectMetadataId: targetObjectId,
            targetFieldLabel: rel.targetFieldLabel,
            targetFieldIcon: rel.targetFieldIcon ?? 'IconRelationOneToMany',
          },
        },
      },
    },
  );
}

// ---------------------------------------------------------------------------
// Orchestration: metadata
// ---------------------------------------------------------------------------

async function buildDataModel(): Promise<Map<string, ObjectInfo>> {
  let objects = await fetchObjects();

  // 1. Objects
  for (const spec of OBJECTS) {
    if (objects.has(spec.nameSingular)) {
      console.log(`  object ${spec.nameSingular} — exists, reusing`);
    } else {
      const id = await createObject(spec);
      console.log(`  object ${spec.nameSingular} — created (${id})`);
    }
  }

  // Refresh so newly created objects (with default fields) are known.
  objects = await fetchObjects();

  // 2. Scalar / select fields
  for (const spec of OBJECTS) {
    const info = objects.get(spec.nameSingular)!;
    for (const field of spec.fields) {
      if (info.fields.has(field.name)) {
        console.log(`  field ${spec.nameSingular}.${field.name} — exists`);
        continue;
      }
      await createField(info.id, field);
      info.fields.add(field.name);
      console.log(`  field ${spec.nameSingular}.${field.name} — created`);
    }
  }

  // 3. Relation fields (both objects now exist)
  for (const spec of OBJECTS) {
    const info = objects.get(spec.nameSingular)!;
    for (const rel of spec.relations) {
      if (info.fields.has(rel.name)) {
        console.log(`  relation ${spec.nameSingular}.${rel.name} — exists`);
        continue;
      }
      const target = objects.get(rel.targetObject);
      if (!target) {
        console.warn(`  relation ${spec.nameSingular}.${rel.name} — target ${rel.targetObject} missing, skipping`);
        continue;
      }
      await createRelationField(info.id, rel, target.id);
      info.fields.add(rel.name);
      console.log(`  relation ${spec.nameSingular}.${rel.name} -> ${rel.targetObject} — created`);
    }
  }

  return await fetchObjects();
}

// ---------------------------------------------------------------------------
// Demo records
// ---------------------------------------------------------------------------

const today = new Date('2026-06-27T00:00:00Z');
const day = (offset: number) => {
  const d = new Date(today);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};
const currency = (dollars: number) => ({ amountMicros: dollars * 1_000_000, currencyCode: 'USD' });
const link = (url: string, label: string) => ({ primaryLinkUrl: url, primaryLinkLabel: label, secondaryLinks: [] });

// Returns existing record count for an object (used for idempotent seeding).
async function recordCount(namePlural: string): Promise<number> {
  const res = await rest('GET', `/${namePlural}?limit=1`);
  const data = res.data?.[namePlural] ?? res.data ?? [];
  return Array.isArray(data) ? data.length : 0;
}

async function createRecord(namePlural: string, body: Record<string, any>): Promise<string> {
  const res = await rest('POST', `/${namePlural}`, body);
  // REST core wraps the created record under data.createX or data[plural].
  const created =
    res.data?.[`create${capitalize(singularize(namePlural))}`] ??
    res.data?.record ??
    res.data ??
    res;
  return created?.id;
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function singularize(plural: string) {
  // crude — only used for the few names below; relation key uses field names directly
  if (plural === 'companies') return 'company';
  if (plural === 'people') return 'person';
  if (plural.endsWith('s')) return plural.slice(0, -1);
  return plural;
}

async function seedRecords(objects: Map<string, ObjectInfo>): Promise<void> {
  const has = (n: string) => objects.has(n);

  // ---- Clients (Company) ----
  const companyPlural = objects.get('company')!.namePlural;
  let acme = '', meridian = '', northwind = '';
  if ((await recordCount(companyPlural)) === 0) {
    acme = await createRecord(companyPlural, { name: 'Acme Manufacturing', employees: 4200 });
    meridian = await createRecord(companyPlural, { name: 'Meridian Health Systems', employees: 9800 });
    northwind = await createRecord(companyPlural, { name: 'Northwind Logistics', employees: 1500 });
    console.log('  seeded 3 client companies');
  } else {
    const list = (await rest('GET', `/${companyPlural}?limit=10`)).data?.[companyPlural] ?? [];
    acme = list[0]?.id; meridian = list[1]?.id ?? acme; northwind = list[2]?.id ?? acme;
    console.log('  companies already present — reusing for relations');
  }

  // ---- Engagements ----
  if (!has('engagement')) return;
  const engPlural = objects.get('engagement')!.namePlural;
  let engErp = '', engEhr = '', engWms = '';
  if ((await recordCount(engPlural)) === 0) {
    engErp = await createRecord(engPlural, {
      name: 'Acme ERP Implementation',
      code: 'ENG-2026-014',
      status: 'IN_PROGRESS',
      engagementType: 'IMPLEMENTATION',
      billingType: 'FIXED_FEE',
      startDate: day(-40),
      targetEndDate: day(120),
      contractValue: currency(1_250_000),
      slackChannel: '#eng-acme-erp',
      clientId: acme,
    });
    engEhr = await createRecord(engPlural, {
      name: 'Meridian EHR Advisory',
      code: 'ENG-2026-021',
      status: 'KICKOFF',
      engagementType: 'ADVISORY',
      billingType: 'TIME_AND_MATERIALS',
      startDate: day(-5),
      targetEndDate: day(90),
      contractValue: currency(480_000),
      slackChannel: '#eng-meridian-ehr',
      clientId: meridian,
    });
    engWms = await createRecord(engPlural, {
      name: 'Northwind WMS Assessment',
      code: 'ENG-2026-007',
      status: 'AT_RISK',
      engagementType: 'ASSESSMENT',
      billingType: 'RETAINER',
      startDate: day(-70),
      targetEndDate: day(10),
      contractValue: currency(160_000),
      slackChannel: '#eng-northwind-wms',
      clientId: northwind,
    });
    console.log('  seeded 3 engagements');
  } else {
    const list = (await rest('GET', `/${engPlural}?limit=10`)).data?.[engPlural] ?? [];
    engErp = list[0]?.id; engEhr = list[1]?.id ?? engErp; engWms = list[2]?.id ?? engErp;
    console.log('  engagements already present — skipping');
    return; // assume downstream already seeded
  }

  // ---- Consultants ----
  if (has('consultant')) {
    const conPlural = objects.get('consultant')!.namePlural;
    if ((await recordCount(conPlural)) === 0) {
      const consultants = [
        { name: 'Dana Whitfield', role: 'PARTNER', billRate: currency(420), utilizationTarget: 35, isAvailable: true, primaryEngagementId: engErp },
        { name: 'Marcus Lin', role: 'ENGAGEMENT_MANAGER', billRate: currency(310), utilizationTarget: 75, isAvailable: true, primaryEngagementId: engErp },
        { name: 'Priya Nair', role: 'SOLUTION_ARCHITECT', billRate: currency(290), utilizationTarget: 85, isAvailable: false, primaryEngagementId: engErp },
        { name: 'Tomás Herrera', role: 'SENIOR_CONSULTANT', billRate: currency(220), utilizationTarget: 90, isAvailable: true, primaryEngagementId: engEhr },
        { name: 'Aisha Bello', role: 'CONSULTANT', billRate: currency(175), utilizationTarget: 92, isAvailable: true, primaryEngagementId: engWms },
      ];
      for (const c of consultants) await createRecord(conPlural, c);
      console.log('  seeded 5 consultants');
    }
  }

  // ---- Statements of Work ----
  if (has('statementOfWork')) {
    const sowPlural = objects.get('statementOfWork')!.namePlural;
    if ((await recordCount(sowPlural)) === 0) {
      const sows = [
        { name: 'Acme ERP — Phase 1 SOW', sowNumber: 'SOW-014-1', status: 'SIGNED', effectiveDate: day(-40), expirationDate: day(120), value: currency(750_000), engagementId: engErp },
        { name: 'Acme ERP — Phase 2 SOW', sowNumber: 'SOW-014-2', status: 'DRAFT', effectiveDate: day(60), expirationDate: day(200), value: currency(500_000), engagementId: engErp },
        { name: 'Meridian EHR Advisory SOW', sowNumber: 'SOW-021-1', status: 'IN_REVIEW', effectiveDate: day(-5), expirationDate: day(90), value: currency(480_000), engagementId: engEhr },
      ];
      for (const s of sows) await createRecord(sowPlural, s);
      console.log('  seeded 3 statements of work');
    }
  }

  // ---- Milestones ----
  let msDiscovery = '', msBuild = '';
  if (has('milestone')) {
    const msPlural = objects.get('milestone')!.namePlural;
    if ((await recordCount(msPlural)) === 0) {
      msDiscovery = await createRecord(msPlural, { name: 'Discovery & Blueprint', status: 'COMPLETED', dueDate: day(-20), completedDate: day(-22), percentComplete: 100, isBillingMilestone: true, engagementId: engErp });
      msBuild = await createRecord(msPlural, { name: 'Core Build', status: 'IN_PROGRESS', dueDate: day(30), percentComplete: 45, isBillingMilestone: true, engagementId: engErp });
      await createRecord(msPlural, { name: 'Data Migration', status: 'NOT_STARTED', dueDate: day(70), percentComplete: 0, isBillingMilestone: false, engagementId: engErp });
      await createRecord(msPlural, { name: 'Go-Live', status: 'NOT_STARTED', dueDate: day(110), percentComplete: 0, isBillingMilestone: true, engagementId: engErp });
      await createRecord(msPlural, { name: 'Current-State Assessment', status: 'IN_PROGRESS', dueDate: day(15), percentComplete: 60, isBillingMilestone: false, engagementId: engEhr });
      await createRecord(msPlural, { name: 'WMS Risk Review', status: 'BLOCKED', dueDate: day(5), percentComplete: 30, isBillingMilestone: false, engagementId: engWms });
      console.log('  seeded 6 milestones');
    }
  }

  // ---- Deliverables ----
  if (has('deliverable')) {
    const delPlural = objects.get('deliverable')!.namePlural;
    if ((await recordCount(delPlural)) === 0) {
      const dels = [
        { name: 'Blueprint Document', status: 'ACCEPTED', dueDate: day(-22), engagementId: engErp, milestoneId: msDiscovery },
        { name: 'Solution Design Spec', status: 'ACCEPTED', dueDate: day(-18), engagementId: engErp, milestoneId: msDiscovery },
        { name: 'Configured ERP Modules', status: 'IN_PROGRESS', dueDate: day(28), engagementId: engErp, milestoneId: msBuild },
        { name: 'Integration Build', status: 'IN_PROGRESS', dueDate: day(30), engagementId: engErp, milestoneId: msBuild },
        { name: 'Test Plan', status: 'IN_REVIEW', dueDate: day(25), engagementId: engErp, milestoneId: msBuild },
        { name: 'Training Materials', status: 'PLANNED', dueDate: day(95), engagementId: engErp },
        { name: 'EHR Gap Analysis', status: 'IN_PROGRESS', dueDate: day(12), engagementId: engEhr },
        { name: 'WMS Findings Report', status: 'PLANNED', dueDate: day(8), engagementId: engWms },
      ];
      for (const d of dels) await createRecord(delPlural, d);
      console.log('  seeded 8 deliverables');
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`ActiveApps 4.0 bootstrap → ${SERVER_URL}`);
  console.log('Building data model...');
  const objects = await buildDataModel();
  console.log('Data model ready.');

  if (SEED_RECORDS) {
    console.log('Seeding demo records...');
    await seedRecords(objects);
    console.log('Demo records ready.');
  } else {
    console.log('SEED_RECORDS=false — skipping demo records.');
  }

  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
