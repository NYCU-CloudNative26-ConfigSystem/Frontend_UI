import { expect, test as base, type Page, type Route } from '@playwright/test'

const now = '2026-06-02T19:40:35Z'

type MockResponse = unknown

async function json(route: Route, body: MockResponse, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

async function empty(route: Route) {
  await json(route, [])
}

export async function seedAuth(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('access_token', 'e2e-access-token')
    window.localStorage.setItem('refresh_token', 'e2e-refresh-token')
  })
}

export async function mockCommonApi(page: Page) {
  await page.route('**/api/login/api/v1/auth/me', route => json(route, {
    email: 'justin@example.com',
    full_name: 'Justin Reviewer',
    company: 'acme',
    username: 'justin001',
    role: 'reviewer',
  }))

  await page.route('**/api/login/api/v1/auth/login', route => json(route, {
    access_token: 'e2e-access-token',
    refresh_token: 'e2e-refresh-token',
  }))

  for (const service of ['login', 'config', 'ssot', 'export']) {
    await page.route(`**/api/${service}/health`, route => json(route, { status: 'ok' }))
  }

  await page.route('**/api/config/api/v1/companies', route => {
    if (route.request().method() === 'GET') {
      return json(route, [{
        uuid: 'company-uuid',
        cmp_id: 'acme',
        display_name: 'Acme Corp',
        description: 'Demo company',
        created_by: 'justin001',
        date_created: now,
      }])
    }
    return json(route, { ok: true })
  })

  await page.route('**/api/config/api/v1/projects', route => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/projects')) {
      return json(route, [{
        uuid: 'project-uuid',
        proj_id: 'project-alpha',
        display_name: 'Project Alpha',
        description: 'Demo project',
        created_by: 'justin001',
        date_created: now,
        companies: ['acme', 'beta', 'gamma', 'delta'],
      }])
    }
    return route.fallback()
  })

  await page.route('**/api/config/api/v1/projects/project-alpha', route => json(route, {
    uuid: 'project-uuid',
    proj_id: 'project-alpha',
    display_name: 'Project Alpha',
    description: 'Demo project',
    created_by: 'justin001',
    date_created: now,
    companies: ['acme'],
  }))

  await page.route('**/api/config/api/v1/projects/project-alpha/template/keys', empty)
  await page.route('**/api/config/api/v1/projects/project-alpha/template/versions', empty)
  await page.route('**/api/config/api/v1/projects/project-alpha/template/published-keys', route => json(route, {
    version_uuid: null,
    keys: [],
  }))

  await page.route('**/api/config/api/v1/config/companies**', route => json(route, ['acme', 'beta', 'gamma']))
  await page.route('**/api/config/api/v1/config/pending**', route => json(route, [{
    config_relation_uuid: 'snapshot-003',
    date_created: now,
    date_deleted: null,
    created_by: 'developer001',
    entry_count: 2,
    is_latest: true,
    environment: 'development',
    template_version_uuid: null,
    template_version_number: null,
    approval_status: 'pending',
    approved_by: null,
    approved_at: null,
    rejection_reason: null,
    change_description: 'E2E pending snapshot',
    promoted_from_uuid: null,
    name: '003',
    proj_id: 'project-alpha',
    cmp_id: 'acme',
  }]))

  await page.route('**/api/config/api/v1/config/search**', route => json(route, [{
    config_relation_uuid: 'snapshot-003',
    date_created: now,
    date_deleted: null,
    created_by: 'developer001',
    entry_count: 2,
    is_latest: true,
    environment: 'development',
    template_version_uuid: null,
    template_version_number: null,
    approval_status: 'approved',
    approved_by: 'reviewer001',
    approved_at: now,
    rejection_reason: null,
    change_description: null,
    promoted_from_uuid: null,
    name: '003',
    proj_id: 'project-alpha',
    cmp_id: 'acme',
  }]))

  await page.route('**/api/config/api/v1/config/snapshot-003/children', empty)
  await page.route('**/api/config/api/v1/config/snapshot-003/review-similarity**', route => json(route, {
    config_relation_uuid: 'snapshot-003',
    date_created: now,
    environment: 'development',
    approval_status: 'pending',
    created_by: 'developer001',
    name: '003',
    proj_id: 'project-alpha',
    cmp_id: 'acme',
    source_entry_count: 2,
    candidate_count: 0,
    source_entries: [],
    candidates: [],
  }))
  await page.route('**/api/config/api/v1/config/snapshot-003', route => json(route, {
    config_relation_uuid: 'snapshot-003',
    date_created: now,
    environment: 'development',
    rows: [
      { uuid: 'row-1', key: 'key-uuid-1', val: 'VALUE:value-uuid-1' },
      { uuid: 'row-2', key: 'key-uuid-2', val: 'plain-value' },
    ],
    approval_status: 'pending',
    approved_by: null,
    approved_at: null,
    rejection_reason: null,
    created_by: 'developer001',
    is_latest: true,
    change_description: 'E2E pending snapshot',
    promoted_from_uuid: null,
    proj_id: 'project-alpha',
    cmp_id: 'acme',
    name: '003',
  }))

  await page.route('**/api/ssot/api/v1/search**', empty)
  await page.route('**/api/ssot/api/v1/search/value**', empty)
  await page.route('**/api/ssot/api/v1/truth/*', route => json(route, {
    uniqueID: 'truth-uuid',
    Truth: 'truth-uuid',
    CMPID: 'acme',
    projectID: 'project-alpha',
    latestVal: 'VALUE:value-uuid-1',
    latestName: 'key-uuid-1',
    sensitive: false,
    latestAlias: 'API_URL',
  }))
  await page.route('**/api/ssot/api/v1/node/key-uuid-1', route => json(route, {
    type: 'name',
    uuid: 'key-uuid-1',
    name_val: 'API_URL',
    truthId: 'truth-uuid',
  }))
  await page.route('**/api/ssot/api/v1/node/key-uuid-2', route => json(route, {
    type: 'name',
    uuid: 'key-uuid-2',
    name_val: 'FEATURE_FLAG',
    truthId: 'truth-uuid-2',
  }))
  await page.route('**/api/ssot/api/v1/node/value-uuid-1', route => json(route, {
    type: 'value',
    uuid: 'value-uuid-1',
    val: 'https://api.example.test',
    is_sensitive: false,
  }))

  await page.route('**/api/export/api/v1/exports/deploy-history**', empty)
}

export const test = base.extend({
  page: async ({ page }, use) => {
    await mockCommonApi(page)
    await use(page)
  },
})

export { expect }
