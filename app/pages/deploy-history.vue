<script setup lang="ts">
import type { DeployLogOut } from '~/composables/useApi'

definePageMeta({ middleware: 'auth' })

const api = useApi()
const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const projId = ref((route.query.proj as string) ?? '')
const cmpId  = ref((route.query.cmp  as string) ?? '')

const records = ref<DeployLogOut[]>([])
const loading = ref(false)
const error   = ref('')
const envFilter = ref('all')

const ENVIRONMENTS = ['all', 'development', 'testing', 'staging', 'production']

const filtered = computed(() =>
  envFilter.value === 'all'
    ? records.value
    : records.value.filter(r => r.environment === envFilter.value)
)

// First triggered deploy per environment (records are newest-first)
const latestDeployedIds = computed(() => {
  const seen = new Set<string>()
  const ids = new Set<number>()
  for (const r of records.value) {
    if (r.status === 'triggered' && !seen.has(r.environment)) {
      seen.add(r.environment)
      ids.add(r.id)
    }
  }
  return ids
})

async function load() {
  if (!projId.value || !cmpId.value) return
  loading.value = true
  error.value = ''
  try {
    records.value = await api.export.deployHistory(projId.value, cmpId.value, auth.token)
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Failed to load deploy history'
  } finally {
    loading.value = false
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString()
}

function envColor(env: string) {
  return {
    development: 'text-green-600 bg-green-50',
    testing:     'text-yellow-700 bg-yellow-50',
    staging:     'text-orange-600 bg-orange-50',
    production:  'text-blue-700 bg-blue-50',
  }[env] ?? 'text-slate-600 bg-slate-100'
}

onMounted(load)
</script>

<template>
  <div class="min-h-screen bg-slate-50">
    <AppNav>
      <span class="font-semibold text-slate-900 text-sm">Deploy History</span>
    </AppNav>

    <main class="max-w-5xl mx-auto px-4 sm:px-6 py-6 pb-16 space-y-4">

      <!-- Selector bar -->
      <div class="bg-white rounded-2xl ring-1 ring-slate-900/5 px-5 py-4 flex flex-wrap items-end gap-3">
        <div class="flex flex-col gap-1 min-w-[160px]">
          <label class="text-xs font-medium text-slate-500">Project ID</label>
          <input v-model="projId" placeholder="proj-id"
            class="rounded-xl ring-1 ring-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>
        <div class="flex flex-col gap-1 min-w-[160px]">
          <label class="text-xs font-medium text-slate-500">Company ID</label>
          <input v-model="cmpId" placeholder="cmp-id"
            class="rounded-xl ring-1 ring-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>
        <button @click="load" :disabled="!projId || !cmpId || loading"
          class="rounded-xl px-5 py-2 text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 transition">
          {{ loading ? 'Loading…' : 'Load' }}
        </button>
      </div>

      <!-- Error -->
      <div v-if="error" class="text-sm text-red-600 bg-red-50 ring-1 ring-red-200 rounded-xl px-4 py-3">
        {{ error }}
      </div>

      <!-- Results -->
      <div v-if="records.length > 0" class="bg-white rounded-2xl ring-1 ring-slate-900/5 overflow-hidden">

        <!-- Header + env filter -->
        <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 class="font-semibold text-slate-900 text-sm">
              {{ records.length }} deployment{{ records.length === 1 ? '' : 's' }}
            </h2>
            <p class="text-xs text-slate-400 mt-0.5">{{ projId }} · {{ cmpId }}</p>
          </div>
          <div class="flex items-center gap-1.5 flex-wrap">
            <button
              v-for="env in ENVIRONMENTS" :key="env"
              @click="envFilter = env"
              :class="['px-3 py-1 rounded-full text-xs font-semibold transition capitalize',
                envFilter === env
                  ? 'bg-slate-800 text-white'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200']">
              {{ env }}
            </button>
          </div>
        </div>

        <!-- Table -->
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-xs text-slate-400 text-left border-b border-slate-100">
                <th class="px-5 py-3 font-medium">When</th>
                <th class="px-3 py-3 font-medium">Env</th>
                <th class="px-3 py-3 font-medium">Version</th>
                <th class="px-3 py-3 font-medium">Format</th>
                <th class="px-3 py-3 font-medium">Reason</th>
                <th class="px-3 py-3 font-medium">Deployed by</th>
                <th class="px-3 py-3 font-medium">Status</th>
                <th class="px-3 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-50">
              <tr v-for="log in filtered" :key="log.id"
                class="hover:bg-slate-50 transition">
                <td class="px-5 py-3 text-slate-500 whitespace-nowrap text-xs">
                  {{ formatDate(log.deployed_at) }}
                </td>
                <td class="px-3 py-3">
                  <span :class="['px-2 py-0.5 rounded-full text-xs font-semibold capitalize', envColor(log.environment)]">
                    {{ log.environment }}
                  </span>
                </td>
                <td class="px-3 py-3 font-mono text-xs text-slate-500">
                  {{ log.snapshot_name || log.version_uuid.slice(0, 8) }}
                </td>
                <td class="px-3 py-3 font-mono text-xs text-slate-500">
                  .{{ log.format }}
                </td>
                <td class="px-3 py-3 text-slate-700 max-w-[220px]">
                  <span :title="log.reason" class="block truncate text-xs">{{ log.reason }}</span>
                </td>
                <td class="px-3 py-3 text-xs text-slate-600">{{ log.deployed_by }}</td>
                <td class="px-3 py-3">
                  <div class="flex items-center gap-1.5 flex-wrap">
                    <span :class="['px-2 py-0.5 rounded-full text-xs font-semibold',
                      log.status === 'triggered' ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-red-50 text-red-600']">
                      {{ log.status }}
                    </span>
                    <span v-if="latestDeployedIds.has(log.id)"
                      class="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-600 text-white">
                      Latest
                    </span>
                  </div>
                </td>
                <td class="px-3 py-3">
                  <button
                    @click="router.push({ path: `/config-snapshot/${log.version_uuid}`, query: { proj: projId, cmp: cmpId, env: log.environment } })"
                    class="text-xs text-blue-600 hover:text-blue-800 font-semibold transition whitespace-nowrap">
                    View →
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-if="filtered.length === 0" class="px-5 py-8 text-center text-sm text-slate-400">
          No deployments for this environment.
        </div>
      </div>

      <!-- Empty state -->
      <div v-else-if="!loading && projId && cmpId && records.length === 0 && !error"
        class="bg-white rounded-2xl ring-1 ring-slate-900/5 p-10 text-center text-sm text-slate-400">
        No deployments found for this project + company.
      </div>

    </main>
  </div>
</template>
