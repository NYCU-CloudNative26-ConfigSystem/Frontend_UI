<script setup lang="ts">
import type { CompanyResponse, ProjectResponse } from '~/composables/useApi'

definePageMeta({ middleware: 'auth' })

const api = useApi()
const auth = useAuthStore()

const companies = ref<CompanyResponse[]>([])
const loadError = ref('')

onMounted(fetchCompanies)

async function fetchCompanies() {
  loadError.value = ''
  try {
    companies.value = await api.companies.list(auth.token)
  } catch (e: unknown) {
    loadError.value = e instanceof Error ? e.message : 'Failed to load companies'
  }
}

// ── Create company ────────────────────────────────────────────────────────────

const showCreateForm = ref(false)
const newCmpId = ref('')
const newDisplayName = ref('')
const newDescription = ref('')
const createError = ref('')
const creating = ref(false)

async function createCompany() {
  createError.value = ''
  if (!newCmpId.value.trim() || !newDisplayName.value.trim()) {
    createError.value = 'Company ID and Display Name are required.'
    return
  }
  creating.value = true
  try {
    await api.companies.create({
      cmp_id: newCmpId.value.trim(),
      display_name: newDisplayName.value.trim(),
      description: newDescription.value.trim() || undefined,
    }, auth.token)
    newCmpId.value = ''
    newDisplayName.value = ''
    newDescription.value = ''
    showCreateForm.value = false
    await fetchCompanies()
  } catch (e: unknown) {
    createError.value = e instanceof Error ? e.message : 'Failed to create company'
  } finally {
    creating.value = false
  }
}

// ── Projects Modal & Details View ─────────────────────────────────────────────

const showProjectsModal = ref(false)
const selectedCompany = ref<CompanyResponse | null>(null)
const companyProjects = ref<ProjectResponse[]>([])
const loadingProjects = ref(false)
const projectsError = ref('')

const projectSearchQuery = ref('')
const selectedProject = ref<ProjectResponse | null>(null)

const filteredProjects = computed(() => {
  const query = projectSearchQuery.value.trim().toLowerCase()
  if (!query) return companyProjects.value
  return companyProjects.value.filter(
    p => p.proj_id.toLowerCase().includes(query) || p.display_name.toLowerCase().includes(query)
  )
})

// Detailed config preview state
const projectDetails = ref<Record<string, Record<string, { status: string; rows: { key: string; val: string }[] } | null>>>({})
const detailsLoading = ref(false)

function stripRef(r: string): string {
  return r.startsWith('VALUE:') || r.startsWith('GROUP:') ? r.slice(6) : r
}

function formatDate(iso: string | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString()
}

async function openProjects(company: CompanyResponse) {
  selectedCompany.value = company
  companyProjects.value = []
  projectSearchQuery.value = ''
  selectedProject.value = null
  projectsError.value = ''
  loadingProjects.value = true
  showProjectsModal.value = true
  try {
    companyProjects.value = await api.projects.list(auth.token, company.cmp_id)
  } catch (e: unknown) {
    projectsError.value = e instanceof Error ? e.message : 'Failed to load projects'
  } finally {
    loadingProjects.value = false
  }
}

function selectProject(proj: ProjectResponse) {
  selectedProject.value = proj
  fetchProjectConfigDetails(proj.proj_id)
}

async function fetchProjectConfigDetails(projId: string) {
  if (projectDetails.value[projId]) return // already cached
  
  detailsLoading.value = true
  projectDetails.value[projId] = {}
  
  try {
    const envs = ['development', 'testing', 'staging', 'production']
    const cmp = selectedCompany.value?.cmp_id
    if (!cmp) return
    
    const results = await Promise.all(envs.map(async env => {
      try {
        const config = await api.configTable.getConfig(projId, cmp, env, auth.token)
        if (!config || !config.rows?.length) return { env, data: null }
        
        // Resolve the first 5 rows
        const rowsToResolve = config.rows.slice(0, 5)
        const resolvedRows = await Promise.all(rowsToResolve.map(async row => {
          const nameNode = await api.ssot.resolveNode(row.key, auth.token).catch(() => null)
          const keyName = nameNode?.type === 'name' ? (nameNode.name_val ?? row.key) : row.key
          
          const stripped = stripRef(row.val)
          const valNode = await api.ssot.resolveNode(stripped, auth.token).catch(() => null)
          let valDisplay = row.val
          if (valNode?.type === 'value') {
            valDisplay = valNode.is_sensitive ? '(sensitive)' : String(valNode.val ?? '')
          } else if (valNode?.type === 'group') {
            valDisplay = valNode.isArray ? '[]' : '{}'
          }
          
          return { key: keyName, val: valDisplay }
        }))
        
        return {
          env,
          data: {
            status: config.approval_status || 'unknown',
            rows: resolvedRows
          }
        }
      } catch {
        return { env, data: null }
      }
    }))
    
    const projectCache: Record<string, any> = {}
    for (const res of results) {
      if (res.data) projectCache[res.env] = res.data
    }
    projectDetails.value[projId] = projectCache
  } catch (err) {
    console.error('Failed to load project configs:', err)
  } finally {
    detailsLoading.value = false
  }
}
</script>

<template>
  <PageShell main-class="space-y-3">
    <template #nav>
      <AppNav><h1 class="font-semibold text-slate-900">Companies</h1></AppNav>
    </template>

      <!-- Create panel -->
      <SectionCard>
        <div class="flex items-center justify-between px-5 py-4">
          <span class="font-medium text-slate-800 text-sm">Create Company</span>
          <button @click="showCreateForm = !showCreateForm"
            class="text-sm font-semibold text-blue-600 hover:text-blue-700 transition">
            {{ showCreateForm ? 'Cancel' : '+ New' }}
          </button>
        </div>
        <div v-if="showCreateForm" class="border-t border-slate-50 px-5 py-4 space-y-3">
          <div class="flex gap-3 flex-wrap">
            <input v-model="newCmpId" type="text" placeholder="Company ID (e.g. acme-corp)"
              class="ring-1 ring-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition flex-1 min-w-40" />
            <input v-model="newDisplayName" type="text" placeholder="Display Name"
              class="ring-1 ring-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition flex-1 min-w-40" />
          </div>
          <textarea v-model="newDescription" placeholder="Description (optional)"
            class="w-full ring-1 ring-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition resize-none h-20" />
          <div v-if="createError" class="text-sm text-red-600 font-medium">{{ createError }}</div>
          <button @click="createCompany" :disabled="creating"
            class="bg-blue-600 text-white rounded-xl px-4 py-2 text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-40">
            {{ creating ? 'Creating…' : 'Create' }}
          </button>
        </div>
      </SectionCard>

      <!-- Error -->
      <AlertBox v-if="loadError">{{ loadError }}</AlertBox>

      <!-- Empty state -->
      <div v-if="companies.length === 0 && !loadError"
        class="bg-white rounded-2xl ring-1 ring-slate-900/5 p-12 text-center">
        <p class="text-slate-400 text-sm">No companies yet.</p>
        <button @click="showCreateForm = true"
          class="mt-2 text-sm text-blue-600 hover:text-blue-700 font-semibold">Create the first one</button>
      </div>

      <!-- Company list -->
      <div class="space-y-2">
        <div v-for="company in companies" :key="company.cmp_id"
          @click="openProjects(company)"
          class="bg-white rounded-2xl ring-1 ring-slate-900/5 px-5 py-4 hover:ring-blue-500/40 hover:shadow-sm transition-all cursor-pointer text-left group flex items-center justify-between">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 flex-wrap">
              <h3 class="font-semibold text-slate-900 group-hover:text-blue-700 transition">{{ company.display_name }}</h3>
              <span class="font-mono text-xs bg-slate-100 text-slate-500 rounded-md px-2 py-0.5">{{ company.cmp_id }}</span>
            </div>
            <p v-if="company.description" class="text-sm text-slate-500 mt-1">{{ company.description }}</p>
            <p class="text-xs text-slate-400 mt-1">Created by {{ company.created_by }}</p>
          </div>
          <span class="text-slate-300 group-hover:text-blue-500 transition shrink-0 ml-3 text-lg">›</span>
        </div>
      </div>

    <!-- Projects Modal -->
    <AppModal v-model="showProjectsModal" :title="`Projects for ${selectedCompany?.display_name || ''}`" maxWidth="max-w-5xl">
      <!-- Search bar inside modal -->
      <div class="px-5 py-3 border-b border-slate-100 flex items-center justify-between shrink-0">
        <div class="relative w-full max-w-md flex items-center">
          <span class="absolute left-3.5 text-slate-400 text-xs">🔍</span>
          <input v-model="projectSearchQuery" type="text" placeholder="Search projects by ID or Name..." 
            class="w-full ring-1 ring-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
        </div>
        <span class="text-xs text-slate-400 font-semibold shrink-0 ml-3">{{ filteredProjects.length }} project{{ filteredProjects.length === 1 ? '' : 's' }}</span>
      </div>

      <div class="px-5 py-4">
        <div v-if="loadingProjects" class="text-center py-12 text-sm text-slate-400">Loading projects...</div>
        <div v-else-if="projectsError" class="text-sm text-red-600 font-medium py-6">{{ projectsError }}</div>
        <div v-else-if="companyProjects.length === 0" class="text-center py-12 text-sm text-slate-400">
          No projects linked to this company.
        </div>
        <div v-else class="flex h-[60vh] divide-x divide-slate-100 min-h-0 -mx-5 -mb-4">
          <!-- Left Column: Project list -->
          <div class="w-1/2 overflow-y-auto px-5 pb-4 space-y-2">
            <div v-if="filteredProjects.length === 0" class="text-center py-12 text-xs text-slate-400">
              No matching projects found.
            </div>
            <button v-for="proj in filteredProjects" :key="proj.proj_id"
              @click="selectProject(proj)"
              :class="[
                'w-full text-left p-3.5 rounded-2xl border transition flex flex-col',
                selectedProject?.proj_id === proj.proj_id
                  ? 'border-blue-500 bg-blue-50/20'
                  : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50'
              ]">
              <div class="flex items-center justify-between w-full">
                <span class="font-semibold text-slate-900 text-sm truncate pr-2">{{ proj.display_name }}</span>
                <span class="font-mono text-[10px] bg-slate-100 text-slate-500 rounded-md px-2 py-0.5 shrink-0">{{ proj.proj_id }}</span>
              </div>
              <p v-if="proj.description" class="text-xs text-slate-500 mt-1 line-clamp-1 w-full">{{ proj.description }}</p>
            </button>
          </div>

          <!-- Right Column: Detail Panel -->
          <div class="w-1/2 overflow-y-auto px-5 pb-4">
            <div v-if="!selectedProject" class="h-full flex flex-col items-center justify-center text-center text-slate-400 py-12">
              <span class="text-3xl mb-2">📁</span>
              <p class="text-xs font-semibold">Select a project to view details</p>
            </div>
            <div v-else class="space-y-4 pt-1">
              <!-- Header -->
              <div class="space-y-2">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <h4 class="font-bold text-slate-900 text-base leading-tight">{{ selectedProject.display_name }}</h4>
                    <span class="font-mono text-xs text-slate-400 block mt-0.5">{{ selectedProject.proj_id }}</span>
                  </div>
                  <NuxtLink
                    :to="`/config?proj=${encodeURIComponent(selectedProject.proj_id)}&cmp=${encodeURIComponent(selectedCompany?.cmp_id || '')}`"
                    class="shrink-0 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3.5 py-2 rounded-xl transition inline-flex items-center gap-1.5 shadow-sm active:scale-[0.98]">
                    Go to Project ➔
                  </NuxtLink>
                </div>
                <p v-if="selectedProject.description" class="text-xs text-slate-600 bg-slate-50 p-3 rounded-xl italic whitespace-pre-wrap leading-relaxed">
                  {{ selectedProject.description }}
                </p>
              </div>

              <!-- Metadata -->
              <div class="grid grid-cols-2 gap-3 pt-3 border-t border-slate-100 text-xs text-slate-500">
                <div>
                  <span class="block text-slate-400 uppercase font-bold text-[9px] tracking-wide">Created by</span>
                  <span class="font-medium text-slate-700 mt-0.5 block truncate">{{ selectedProject.created_by }}</span>
                </div>
                <div>
                  <span class="block text-slate-400 uppercase font-bold text-[9px] tracking-wide">Created at</span>
                  <span class="font-medium text-slate-700 mt-0.5 block truncate">{{ formatDate(selectedProject.date_created) }}</span>
                </div>
              </div>

              <!-- Configurations preview -->
              <div class="pt-4 border-t border-slate-100 space-y-3">
                <span class="block text-xs font-bold text-slate-400 uppercase tracking-wider">Latest Environments</span>
                
                <div v-if="detailsLoading" class="flex items-center gap-1.5 text-xs text-slate-400 py-2">
                  <span class="animate-spin text-blue-500">⏳</span> Loading configurations...
                </div>
                <div v-else class="space-y-3">
                  <div v-for="env in ['development', 'testing', 'staging', 'production']" :key="env" class="space-y-1">
                    <div class="flex items-center justify-between text-xs">
                      <span class="capitalize font-semibold text-slate-700">{{ env }}</span>
                      <span v-if="projectDetails[selectedProject.proj_id]?.[env]"
                        :class="[
                          'text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider',
                          projectDetails[selectedProject.proj_id]?.[env]?.status === 'approved' ? 'bg-emerald-50 text-emerald-700' :
                          projectDetails[selectedProject.proj_id]?.[env]?.status === 'pending' ? 'bg-amber-50 text-amber-700' :
                          'bg-slate-50 text-slate-500'
                        ]">
                        {{ projectDetails[selectedProject.proj_id]?.[env]?.status }}
                      </span>
                      <span v-else class="text-[9px] text-slate-400">no config</span>
                    </div>
                    
                    <!-- Key-values preview -->
                    <div v-if="projectDetails[selectedProject.proj_id]?.[env]?.rows?.length"
                      class="bg-slate-50/50 rounded-xl p-2.5 font-mono text-[10px] text-slate-600 space-y-1 max-h-36 overflow-y-auto border border-slate-100/50 font-normal">
                      <div v-for="row in projectDetails[selectedProject.proj_id]?.[env]?.rows" :key="row.key" class="flex justify-between gap-3">
                        <span class="text-slate-800 font-semibold truncate max-w-[130px]">{{ row.key }}</span>
                        <span class="text-slate-500 truncate max-w-[150px]">{{ row.val }}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </AppModal>

  </PageShell>
</template>
