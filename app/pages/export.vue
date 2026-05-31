<script setup lang="ts">
import type { CompanyResponse, ConfigHistoryItem, ExportDownloadPayload, ProjectResponse } from '~/composables/useApi'

definePageMeta({ middleware: 'auth' })

const api = useApi()
const auth = useAuthStore()
const route = useRoute()

const projects = ref<ProjectResponse[]>([])
const allCompanies = ref<CompanyResponse[]>([])
const projectQuery = ref('')
const companyQuery = ref('')
const showProjectMenu = ref(false)
const showCompanyMenu = ref(false)
const projId = ref('')
const cmpId = ref('')
const environment = ref('production')
const filename = ref('')
const selectedFormat = ref<ExportDownloadPayload['format']>('json')
const selectedVersionUuid = ref('')
const versions = ref<ConfigHistoryItem[]>([])
const loadingVersions = ref(false)
const downloading = ref(false)
const loadError = ref('')
const downloadError = ref('')
const notice = ref('')

const ENVIRONMENTS = [
  { id: 'development', label: 'Development' },
  { id: 'testing', label: 'Testing' },
  { id: 'staging', label: 'Staging' },
  { id: 'production', label: 'Production' },
] as const

const FORMAT_OPTIONS: { value: ExportDownloadPayload['format']; label: string; description: string }[] = [
  { value: 'json', label: '.json', description: 'Compact object mapping' },
  { value: 'yaml', label: '.yaml', description: 'Human-readable document' },
  { value: 'env', label: '.env', description: 'Environment variables' },
  { value: 'xml', label: '.xml', description: 'XML document' },
  { value: 'properties', label: '.properties', description: 'Java-style properties file' },
]

const selectedProject = computed(() => projects.value.find(p => p.proj_id === projId.value) ?? null)
const selectedCompany = computed(() => allCompanies.value.find(c => c.cmp_id === cmpId.value) ?? null)

const projectOptions = computed(() => {
  const q = projectQuery.value.toLowerCase().trim()
  if (!q) return projects.value
  return projects.value.filter(project =>
    project.proj_id.toLowerCase().includes(q) ||
    project.display_name.toLowerCase().includes(q)
  )
})

const companyPool = computed(() => {
  const project = selectedProject.value
  if (!project || project.companies.length === 0) return allCompanies.value
  const linked = new Set(project.companies)
  return allCompanies.value.filter(company => linked.has(company.cmp_id))
})

const companyOptions = computed(() => {
  const q = companyQuery.value.toLowerCase().trim()
  if (!q) return companyPool.value
  return companyPool.value.filter(company =>
    company.cmp_id.toLowerCase().includes(q) ||
    company.display_name.toLowerCase().includes(q)
  )
})

function companyLabel(cmpIdValue: string): string {
  return allCompanies.value.find(company => company.cmp_id === cmpIdValue)?.display_name ?? cmpIdValue
}

function selectProject(project: ProjectResponse) {
  projId.value = project.proj_id
  projectQuery.value = `${project.display_name} (${project.proj_id})`
  showProjectMenu.value = false
  const allowed = new Set(companyPool.value.map(company => company.cmp_id))
  if (cmpId.value && !allowed.has(cmpId.value)) {
    cmpId.value = ''
    companyQuery.value = ''
  }
  notice.value = ''
}

function selectCompany(company: CompanyResponse) {
  cmpId.value = company.cmp_id
  companyQuery.value = `${company.display_name} (${company.cmp_id})`
  showCompanyMenu.value = false
  notice.value = ''
}

function onProjectInput() {
  showProjectMenu.value = true
}

function onCompanyInput() {
  showCompanyMenu.value = true
}

function onProjectBlur() {
  window.setTimeout(() => {
    showProjectMenu.value = false
    if (selectedProject.value) {
      projectQuery.value = `${selectedProject.value.display_name} (${selectedProject.value.proj_id})`
    }
  }, 120)
}

function onCompanyBlur() {
  window.setTimeout(() => {
    showCompanyMenu.value = false
    if (selectedCompany.value) {
      companyQuery.value = `${selectedCompany.value.display_name} (${selectedCompany.value.cmp_id})`
    }
  }, 120)
}

async function loadScopeOptions() {
  const [projectList, companyList] = await Promise.all([
    api.projects.list(auth.token),
    api.companies.list(auth.token),
  ])
  projects.value = projectList
  allCompanies.value = companyList
}

function syncQueriesFromSelection() {
  projectQuery.value = selectedProject.value
    ? `${selectedProject.value.display_name} (${selectedProject.value.proj_id})`
    : ''
  companyQuery.value = selectedCompany.value
    ? `${selectedCompany.value.display_name} (${selectedCompany.value.cmp_id})`
    : ''
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString()
}

function versionLabel(item: ConfigHistoryItem): string {
  return item.is_latest ? 'Latest' : item.config_relation_uuid.slice(0, 8)
}

function selectVersion(item: ConfigHistoryItem) {
  selectedVersionUuid.value = item.is_latest ? '' : item.config_relation_uuid
  notice.value = ''
}

function parseContentDisposition(header: string | null): string | null {
  if (!header) return null
  const match = header.match(/filename="?([^";]+)"?/i)
  return match?.[1] ?? null
}

async function loadVersions() {
  loadError.value = ''
  notice.value = ''
  versions.value = []
  selectedVersionUuid.value = ''
  if (!projId.value || !cmpId.value) {
    loadError.value = 'Project ID and Company ID are required.'
    return
  }
  loadingVersions.value = true
  try {
    versions.value = await api.export.listVersions(projId.value, cmpId.value, environment.value, auth.token)
    const latest = versions.value.find(v => v.is_latest)
    selectedVersionUuid.value = latest ? '' : (versions.value[0]?.config_relation_uuid ?? '')
    notice.value = versions.value.length > 0 ? `Loaded ${versions.value.length} version(s).` : 'No versions found for this scope.'
  } catch (error: unknown) {
    loadError.value = error instanceof Error ? error.message : 'Failed to load versions'
  } finally {
    loadingVersions.value = false
  }
}

async function downloadExport() {
  downloadError.value = ''
  notice.value = ''
  if (!projId.value || !cmpId.value) {
    downloadError.value = 'Project ID and Company ID are required.'
    return
  }
  downloading.value = true
  try {
    const payload: ExportDownloadPayload = {
      proj_id: projId.value,
      cmp_id: cmpId.value,
      environment: environment.value,
      format: selectedFormat.value,
      version_uuid: selectedVersionUuid.value || null,
      filename: filename.value.trim() || null,
    }
    const result = await api.export.download(payload, auth.token)
    const objectUrl = URL.createObjectURL(result.blob)
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = parseContentDisposition(result.headers.get('content-disposition')) ?? `config-export.${selectedFormat.value}`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
    notice.value = 'Download started.'
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to download export'
    if (message.toLowerCase().includes('session expired') || message.toLowerCase().includes('unauthorized')) {
      downloadError.value = 'Session expired while resolving SSOT values. Please login again and retry export.'
    } else {
      downloadError.value = message
    }
  } finally {
    downloading.value = false
  }
}

onMounted(async () => {
  try {
    await loadScopeOptions()
    if (route.query.proj) projId.value = route.query.proj as string
    if (route.query.cmp) cmpId.value = route.query.cmp as string
    if (route.query.env) environment.value = route.query.env as string
    if (projId.value && cmpId.value) {
      const allowed = new Set(companyPool.value.map(company => company.cmp_id))
      if (!allowed.has(cmpId.value)) {
        cmpId.value = ''
      }
    }
    syncQueriesFromSelection()
    if (projId.value && cmpId.value) {
      await loadVersions()
    }
  } catch (error: unknown) {
    loadError.value = error instanceof Error ? error.message : 'Failed to load project/company options'
  }
})
</script>

<template>
  <div class="min-h-screen bg-slate-50">
    <header class="bg-white border-b border-slate-100">
      <div class="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
        <div class="flex items-center gap-2.5 min-w-0">
          <NuxtLink to="/home" class="text-slate-400 hover:text-slate-700 text-sm shrink-0">← Home</NuxtLink>
          <span class="text-slate-200 select-none">|</span>
          <span class="font-semibold text-slate-900 text-sm truncate">Config Export</span>
        </div>
        <button @click="auth.logout()" class="text-sm text-slate-400 hover:text-red-500 transition">Logout</button>
      </div>
    </header>

    <main class="max-w-3xl mx-auto px-4 py-6 pb-16 space-y-4">
      <section class="bg-white rounded-2xl ring-1 ring-slate-900/5 p-5 space-y-4">
        <div>
          <h1 class="text-lg font-semibold text-slate-900">Export config snapshot</h1>
          <p class="text-sm text-slate-500 mt-1">Choose the scope, version, and output format, then download the file directly.</p>
        </div>

        <div class="grid gap-3 sm:grid-cols-2">
          <div class="space-y-2 relative">
            <label class="space-y-1.5 block">
              <span class="text-xs font-semibold text-slate-500 uppercase tracking-wide">Project search</span>
              <input v-model="projectQuery" type="text" placeholder="Search project ID or name"
                @focus="showProjectMenu = true"
                @input="onProjectInput"
                @blur="onProjectBlur"
                class="w-full ring-1 ring-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
            </label>
            <div v-if="showProjectMenu" class="absolute left-0 right-0 top-[76px] z-20 ring-1 ring-slate-200 rounded-xl bg-white overflow-hidden shadow-lg">
              <div v-if="projectOptions.length === 0" class="px-3 py-3 text-xs text-slate-400">No project matches your search.</div>
              <div v-else class="max-h-56 overflow-y-auto divide-y divide-slate-50">
                <button
                  v-for="project in projectOptions"
                  :key="project.proj_id"
                  @mousedown.prevent="selectProject(project)"
                  class="w-full px-3 py-2.5 text-left hover:bg-slate-50 transition"
                  :class="projId === project.proj_id ? 'bg-blue-50' : ''">
                  <p class="text-sm font-semibold text-slate-800">{{ project.display_name }}</p>
                  <p class="text-xs text-slate-400 font-mono mt-0.5">{{ project.proj_id }}</p>
                </button>
              </div>
            </div>
          </div>

          <div class="space-y-2 relative">
            <label class="space-y-1.5 block">
              <span class="text-xs font-semibold text-slate-500 uppercase tracking-wide">Company search</span>
              <input v-model="companyQuery" type="text" placeholder="Search company ID or name"
                @focus="showCompanyMenu = true"
                @input="onCompanyInput"
                @blur="onCompanyBlur"
                class="w-full ring-1 ring-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
            </label>
            <div v-if="showCompanyMenu" class="absolute left-0 right-0 top-[76px] z-20 ring-1 ring-slate-200 rounded-xl bg-white overflow-hidden shadow-lg">
              <div v-if="companyOptions.length === 0" class="px-3 py-3 text-xs text-slate-400">No company matches your search.</div>
              <div v-else class="max-h-56 overflow-y-auto divide-y divide-slate-50">
                <button
                  v-for="company in companyOptions"
                  :key="company.cmp_id"
                  @mousedown.prevent="selectCompany(company)"
                  class="w-full px-3 py-2.5 text-left hover:bg-slate-50 transition"
                  :class="cmpId === company.cmp_id ? 'bg-blue-50' : ''">
                  <p class="text-sm font-semibold text-slate-800">{{ company.display_name }}</p>
                  <p class="text-xs text-slate-400 font-mono mt-0.5">{{ company.cmp_id }}</p>
                </button>
              </div>
            </div>
          </div>

          <label class="space-y-1.5">
            <span class="text-xs font-semibold text-slate-500 uppercase tracking-wide">Environment</span>
            <select v-model="environment"
              class="w-full ring-1 ring-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition">
              <option v-for="env in ENVIRONMENTS" :key="env.id" :value="env.id">{{ env.label }}</option>
            </select>
          </label>
          <div class="space-y-1.5 flex items-end">
            <button @click="loadVersions" :disabled="loadingVersions"
              class="w-full bg-blue-600 text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-40">
              {{ loadingVersions ? 'Loading…' : 'Load versions' }}
            </button>
          </div>
        </div>

        <div class="flex flex-wrap gap-2 text-xs">
          <span class="inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-600 px-3 py-1">
            Project: <span class="font-mono">{{ projId || 'not selected' }}</span>
          </span>
          <span class="inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-600 px-3 py-1">
            Company: <span class="font-mono">{{ cmpId ? `${companyLabel(cmpId)} (${cmpId})` : 'not selected' }}</span>
          </span>
        </div>

        <div v-if="loadError" class="text-sm text-red-600">{{ loadError }}</div>
        <div v-else-if="notice" class="text-sm text-slate-500">{{ notice }}</div>
      </section>

      <section class="bg-white rounded-2xl ring-1 ring-slate-900/5 overflow-hidden">
        <div class="px-5 py-4 border-b border-slate-50 flex items-center justify-between">
          <div>
            <h2 class="font-semibold text-slate-900 text-sm">Versions</h2>
            <p class="text-xs text-slate-400 mt-0.5">Latest is marked explicitly. Click a version to export it instead.</p>
          </div>
          <span class="text-xs text-slate-400">{{ versions.length }} item(s)</span>
        </div>
        <div v-if="versions.length === 0" class="px-5 py-8 text-center text-sm text-slate-400">
          Load a project scope to see exportable versions.
        </div>
        <div v-else class="divide-y divide-slate-50">
          <button v-for="item in versions" :key="item.config_relation_uuid"
            @click="selectVersion(item)"
            class="w-full px-5 py-4 text-left flex items-start gap-3 transition hover:bg-slate-50"
            :class="selectedVersionUuid === item.config_relation_uuid || (item.is_latest && !selectedVersionUuid) ? 'bg-blue-50/40' : ''">
            <div class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              :class="item.is_latest ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'">
              <span class="text-xs font-bold">{{ item.is_latest ? 'L' : 'V' }}</span>
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <p class="text-sm font-semibold text-slate-800">{{ versionLabel(item) }}</p>
                <span v-if="item.is_latest" class="text-[10px] font-bold uppercase tracking-wide bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">Latest</span>
                <span class="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{{ item.approval_status }}</span>
              </div>
              <p class="text-xs text-slate-500 mt-0.5">{{ formatDate(item.date_created) }} · {{ item.entry_count }} entries · by {{ item.created_by ?? '—' }}</p>
              <p class="text-xs text-slate-400 mt-0.5 truncate">{{ item.change_description ?? 'No description provided' }}</p>
            </div>
          </button>
        </div>
      </section>

      <section class="bg-white rounded-2xl ring-1 ring-slate-900/5 p-5 space-y-4">
        <div>
          <h2 class="font-semibold text-slate-900 text-sm">Output format</h2>
          <p class="text-xs text-slate-400 mt-0.5">Choose a format and optionally provide a custom filename.</p>
        </div>

        <div class="grid gap-3 sm:grid-cols-2">
          <button v-for="option in FORMAT_OPTIONS" :key="option.value"
            @click="selectedFormat = option.value"
            class="rounded-2xl ring-1 px-4 py-3 text-left transition"
            :class="selectedFormat === option.value ? 'ring-blue-500 bg-blue-50/50' : 'ring-slate-200 hover:ring-slate-300 bg-white'">
            <div class="flex items-center justify-between gap-3">
              <p class="text-sm font-semibold text-slate-800">{{ option.label }}</p>
              <span v-if="selectedFormat === option.value" class="text-xs font-bold text-blue-600">Selected</span>
            </div>
            <p class="text-xs text-slate-500 mt-1">{{ option.description }}</p>
          </button>
        </div>

        <label class="block space-y-1.5">
          <span class="text-xs font-semibold text-slate-500 uppercase tracking-wide">Filename</span>
          <input v-model="filename" type="text" placeholder="Optional custom name"
            class="w-full ring-1 ring-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
        </label>

        <div class="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <p class="text-xs text-slate-400">If no filename is provided, the service will generate one and append the correct extension.</p>
          <button @click="downloadExport" :disabled="downloading"
            class="bg-emerald-600 text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-emerald-700 transition disabled:opacity-40 whitespace-nowrap">
            {{ downloading ? 'Preparing…' : 'Download export' }}
          </button>
        </div>

        <div v-if="downloadError" class="text-sm text-red-600">{{ downloadError }}</div>
      </section>
    </main>
  </div>
</template>
