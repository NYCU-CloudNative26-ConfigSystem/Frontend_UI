<script setup lang="ts">
import type { CompanyResponse, ConfigHistoryItem, ExportDownloadPayload, ExportPreviewResponse, ProjectResponse } from '~/composables/useApi'

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
const loadError = ref('')
const notice = ref('')

// Preview state — auto-updated whenever version or format changes
const previewing = ref(false)
const previewResult = ref<ExportPreviewResponse | null>(null)
const previewError = ref('')
let previewGeneration = 0  // stale-response guard

// Download modal + download state
const showDownloadModal = ref(false)
const downloading = ref(false)
const downloadError = ref('')

const ENVIRONMENTS = [
  { id: 'development', label: 'Development' },
  { id: 'testing', label: 'Testing' },
  { id: 'staging', label: 'Staging' },
  { id: 'production', label: 'Production' },
] as const

const FORMAT_OPTIONS: { value: ExportDownloadPayload['format']; label: string; description: string }[] = [
  { value: 'json',       label: '.json',       description: 'Compact object mapping' },
  { value: 'yaml',       label: '.yaml',       description: 'Human-readable document' },
  { value: 'env',        label: '.env',        description: 'Environment variables' },
  { value: 'xml',        label: '.xml',        description: 'XML document' },
  { value: 'properties', label: '.properties', description: 'Java-style properties file' },
]

const selectedProject = computed(() => projects.value.find(p => p.proj_id === projId.value) ?? null)
const selectedCompany  = computed(() => allCompanies.value.find(c => c.cmp_id === cmpId.value) ?? null)

const projectOptions = computed(() => {
  const q = projectQuery.value.toLowerCase().trim()
  if (!q) return projects.value
  return projects.value.filter(p =>
    p.proj_id.toLowerCase().includes(q) || p.display_name.toLowerCase().includes(q)
  )
})

const companyPool = computed(() => {
  const project = selectedProject.value
  if (!project || project.companies.length === 0) return allCompanies.value
  const linked = new Set(project.companies)
  return allCompanies.value.filter(c => linked.has(c.cmp_id))
})

const companyOptions = computed(() => {
  const q = companyQuery.value.toLowerCase().trim()
  if (!q) return companyPool.value
  return companyPool.value.filter(c =>
    c.cmp_id.toLowerCase().includes(q) || c.display_name.toLowerCase().includes(q)
  )
})

function companyLabel(id: string): string {
  return allCompanies.value.find(c => c.cmp_id === id)?.display_name ?? id
}

function selectProject(project: ProjectResponse) {
  projId.value = project.proj_id
  projectQuery.value = `${project.display_name} (${project.proj_id})`
  showProjectMenu.value = false
  const allowed = new Set(companyPool.value.map(c => c.cmp_id))
  if (cmpId.value && !allowed.has(cmpId.value)) { cmpId.value = ''; companyQuery.value = '' }
  notice.value = ''
}

function selectCompany(company: CompanyResponse) {
  cmpId.value = company.cmp_id
  companyQuery.value = `${company.display_name} (${company.cmp_id})`
  showCompanyMenu.value = false
  notice.value = ''
}

function onProjectBlur() {
  window.setTimeout(() => {
    showProjectMenu.value = false
    if (selectedProject.value)
      projectQuery.value = `${selectedProject.value.display_name} (${selectedProject.value.proj_id})`
  }, 120)
}

function onCompanyBlur() {
  window.setTimeout(() => {
    showCompanyMenu.value = false
    if (selectedCompany.value)
      companyQuery.value = `${selectedCompany.value.display_name} (${selectedCompany.value.cmp_id})`
  }, 120)
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

function syncQueriesFromSelection() {
  projectQuery.value = selectedProject.value
    ? `${selectedProject.value.display_name} (${selectedProject.value.proj_id})` : ''
  companyQuery.value = selectedCompany.value
    ? `${selectedCompany.value.display_name} (${selectedCompany.value.cmp_id})` : ''
}

// ── Preview (auto-triggered) ──────────────────────────────────────────────────

async function fetchPreview() {
  if (!projId.value || !cmpId.value || versions.value.length === 0) return

  previewError.value = ''
  previewing.value = true
  const gen = ++previewGeneration
  try {
    const payload: ExportDownloadPayload = {
      proj_id: projId.value,
      cmp_id: cmpId.value,
      environment: environment.value,
      format: selectedFormat.value,
      version_uuid: selectedVersionUuid.value || null,
      filename: filename.value.trim() || null,
    }
    const result = await api.export.preview(payload, auth.token)
    if (gen !== previewGeneration) return  // superseded by a newer request
    previewResult.value = result
  } catch (e: unknown) {
    if (gen !== previewGeneration) return
    previewError.value = e instanceof Error ? e.message : 'Preview failed'
    previewResult.value = null
  } finally {
    if (gen === previewGeneration) previewing.value = false
  }
}

// Re-fetch preview whenever version or format changes
watch([selectedVersionUuid, selectedFormat], fetchPreview)

// ── Load versions ─────────────────────────────────────────────────────────────

async function loadVersions() {
  loadError.value = ''
  notice.value = ''
  versions.value = []
  selectedVersionUuid.value = ''
  previewResult.value = null
  if (!projId.value || !cmpId.value) {
    loadError.value = 'Project ID and Company ID are required.'
    return
  }
  loadingVersions.value = true
  try {
    versions.value = await api.export.listVersions(projId.value, cmpId.value, environment.value, auth.token)
    const latest = versions.value.find(v => v.is_latest)
    selectedVersionUuid.value = latest ? '' : (versions.value[0]?.config_relation_uuid ?? '')
    notice.value = versions.value.length > 0
      ? `Loaded ${versions.value.length} version(s).`
      : 'No versions found for this scope.'
    if (versions.value.length > 0) fetchPreview()
  } catch (e: unknown) {
    loadError.value = e instanceof Error ? e.message : 'Failed to load versions'
  } finally {
    loadingVersions.value = false
  }
}

// ── Download ──────────────────────────────────────────────────────────────────

function parseContentDisposition(header: string | null): string | null {
  const match = header?.match(/filename="?([^";]+)"?/i)
  return match?.[1] ?? null
}

function openDownloadModal() {
  downloadError.value = ''
  showDownloadModal.value = true
}

function closeDownloadModal() {
  showDownloadModal.value = false
}

async function confirmDownload() {
  downloadError.value = ''
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
    showDownloadModal.value = false
    notice.value = 'Download started.'
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to download export'
    downloadError.value = msg.toLowerCase().includes('unauthorized')
      ? 'Session expired. Please log in again and retry.'
      : msg
  } finally {
    downloading.value = false
  }
}

const onKeydown = (e: KeyboardEvent) => { if (e.key === 'Escape') closeDownloadModal() }
onMounted(async () => {
  window.addEventListener('keydown', onKeydown)
  try {
    const [projectList, companyList] = await Promise.all([
      api.projects.list(auth.token),
      api.companies.list(auth.token),
    ])
    projects.value = projectList
    allCompanies.value = companyList
    if (route.query.proj) projId.value = route.query.proj as string
    if (route.query.cmp)  cmpId.value  = route.query.cmp  as string
    if (route.query.env)  environment.value = route.query.env as string
    if (projId.value && cmpId.value) {
      const allowed = new Set(companyPool.value.map(c => c.cmp_id))
      if (!allowed.has(cmpId.value)) cmpId.value = ''
    }
    syncQueriesFromSelection()
    if (projId.value && cmpId.value) await loadVersions()
  } catch (e: unknown) {
    loadError.value = e instanceof Error ? e.message : 'Failed to load project/company options'
  }
})
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <PageShell width-class="max-w-3xl">
    <template #nav>
      <AppNav><span class="font-semibold text-slate-900">Config Export</span></AppNav>
    </template>

      <!-- Scope picker -->
      <section class="bg-white rounded-2xl ring-1 ring-slate-900/5 p-5 space-y-4">
        <div>
          <h1 class="text-lg font-semibold text-slate-900">Export config snapshot</h1>
          <p class="text-sm text-slate-500 mt-1">Select a scope and version — a live preview updates automatically.</p>
        </div>

        <div class="grid gap-3 sm:grid-cols-2">
          <!-- Project search -->
          <div class="space-y-2 relative">
            <label class="space-y-1.5 block">
              <span class="text-xs font-semibold text-slate-500 uppercase tracking-wide">Project</span>
              <input v-model="projectQuery" type="text" placeholder="Search project ID or name"
                @focus="showProjectMenu = true" @input="showProjectMenu = true" @blur="onProjectBlur"
                class="w-full ring-1 ring-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
            </label>
            <div v-if="showProjectMenu" class="absolute left-0 right-0 top-[76px] z-20 ring-1 ring-slate-200 rounded-xl bg-white overflow-hidden shadow-lg">
              <div v-if="projectOptions.length === 0" class="px-3 py-3 text-xs text-slate-400">No matches.</div>
              <div v-else class="max-h-56 overflow-y-auto divide-y divide-slate-50">
                <button v-for="p in projectOptions" :key="p.proj_id"
                  @mousedown.prevent="selectProject(p)"
                  class="w-full px-3 py-2.5 text-left hover:bg-slate-50 transition"
                  :class="projId === p.proj_id ? 'bg-blue-50' : ''">
                  <p class="text-sm font-semibold text-slate-800">{{ p.display_name }}</p>
                  <p class="text-xs text-slate-400 font-mono mt-0.5">{{ p.proj_id }}</p>
                </button>
              </div>
            </div>
          </div>

          <!-- Company search -->
          <div class="space-y-2 relative">
            <label class="space-y-1.5 block">
              <span class="text-xs font-semibold text-slate-500 uppercase tracking-wide">Company</span>
              <input v-model="companyQuery" type="text" placeholder="Search company ID or name"
                @focus="showCompanyMenu = true" @input="showCompanyMenu = true" @blur="onCompanyBlur"
                class="w-full ring-1 ring-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
            </label>
            <div v-if="showCompanyMenu" class="absolute left-0 right-0 top-[76px] z-20 ring-1 ring-slate-200 rounded-xl bg-white overflow-hidden shadow-lg">
              <div v-if="companyOptions.length === 0" class="px-3 py-3 text-xs text-slate-400">No matches.</div>
              <div v-else class="max-h-56 overflow-y-auto divide-y divide-slate-50">
                <button v-for="c in companyOptions" :key="c.cmp_id"
                  @mousedown.prevent="selectCompany(c)"
                  class="w-full px-3 py-2.5 text-left hover:bg-slate-50 transition"
                  :class="cmpId === c.cmp_id ? 'bg-blue-50' : ''">
                  <p class="text-sm font-semibold text-slate-800">{{ c.display_name }}</p>
                  <p class="text-xs text-slate-400 font-mono mt-0.5">{{ c.cmp_id }}</p>
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
          <div class="flex items-end">
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

      <!-- Version list -->
      <section class="bg-white rounded-2xl ring-1 ring-slate-900/5 overflow-hidden">
        <div class="px-5 py-4 border-b border-slate-50 flex items-center justify-between">
          <div>
            <h2 class="font-semibold text-slate-900 text-sm">Versions</h2>
            <p class="text-xs text-slate-400 mt-0.5">Click a version to select it — the preview updates instantly.</p>
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

      <!-- Format picker + live preview -->
      <section class="bg-white rounded-2xl ring-1 ring-slate-900/5 overflow-hidden">
        <div class="p-5 space-y-4">
          <div>
            <h2 class="font-semibold text-slate-900 text-sm">Output format</h2>
            <p class="text-xs text-slate-400 mt-0.5">Selecting a format instantly updates the preview below.</p>
          </div>

          <div class="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <button v-for="option in FORMAT_OPTIONS" :key="option.value"
              @click="selectedFormat = option.value"
              class="rounded-2xl ring-1 px-3 py-2.5 text-left transition"
              :class="selectedFormat === option.value ? 'ring-blue-500 bg-blue-50/50' : 'ring-slate-200 hover:ring-slate-300 bg-white'">
              <p class="text-sm font-semibold text-slate-800">{{ option.label }}</p>
              <p class="text-xs text-slate-500 mt-0.5">{{ option.description }}</p>
            </button>
          </div>

          <label class="block space-y-1.5">
            <span class="text-xs font-semibold text-slate-500 uppercase tracking-wide">Filename (optional)</span>
            <input v-model="filename" type="text" placeholder="Leave blank to auto-generate"
              class="w-full ring-1 ring-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
          </label>
        </div>

        <!-- Live preview panel -->
        <div class="border-t border-slate-100">
          <!-- Loading -->
          <div v-if="previewing" class="px-5 py-6 flex items-center gap-3 text-sm text-slate-400">
            <svg class="animate-spin h-4 w-4 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
            </svg>
            Rendering preview…
          </div>

          <!-- Error -->
          <div v-else-if="previewError" class="px-5 py-4 text-sm text-red-600 bg-red-50">
            Preview failed: {{ previewError }}
          </div>

          <!-- Empty state (no versions loaded yet) -->
          <div v-else-if="!previewResult" class="px-5 py-6 text-center text-sm text-slate-400">
            Load a project scope and select a version to see a live preview here.
          </div>

          <!-- Preview content -->
          <template v-else>
            <div class="px-5 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between gap-3">
              <div class="flex items-center gap-2 min-w-0">
                <span class="text-xs font-semibold text-slate-400 uppercase tracking-wide shrink-0">Preview</span>
                <span class="bg-white ring-1 ring-slate-200 text-slate-600 text-xs font-mono px-2 py-0.5 rounded-full truncate">
                  {{ previewResult.filename }}
                </span>
              </div>
              <button @click="openDownloadModal"
                class="bg-emerald-600 text-white rounded-xl px-3 py-1.5 text-xs font-semibold hover:bg-emerald-700 transition whitespace-nowrap shrink-0">
                Download ↓
              </button>
            </div>
            <pre class="px-5 py-4 text-xs text-slate-700 leading-relaxed whitespace-pre font-mono bg-white max-h-[55vh] overflow-y-auto overflow-x-auto">{{ previewResult.content }}</pre>
          </template>
        </div>
      </section>

    <template #after>
      <!-- Download confirmation modal -->
      <AppModal v-model="showDownloadModal" title="Confirm download" :subtitle="previewResult?.filename">

      <div v-if="previewing" class="px-5 py-8 flex items-center justify-center gap-2 text-sm text-slate-400">
        <svg class="animate-spin h-4 w-4 text-blue-500" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
        </svg>
        Loading preview…
      </div>
      <pre v-else-if="previewResult"
        class="px-5 py-4 text-xs text-slate-700 leading-relaxed whitespace-pre font-mono bg-slate-50">{{ previewResult.content }}</pre>
      <div v-else class="px-5 py-6 text-sm text-slate-400 text-center">No preview available.</div>

      <template #footer>
        <AlertBox v-if="downloadError">{{ downloadError }}</AlertBox>
        <div class="flex gap-2 justify-end">
          <button @click="closeDownloadModal"
            class="rounded-xl px-4 py-2 text-sm font-semibold ring-1 ring-slate-200 text-slate-600 hover:bg-slate-50 transition">
            Cancel
          </button>
          <button @click="confirmDownload" :disabled="downloading"
            class="rounded-xl px-5 py-2 text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition disabled:opacity-40">
            {{ downloading ? 'Downloading…' : 'Download' }}
          </button>
        </div>
      </template>

      </AppModal>
    </template>
  </PageShell>
</template>
