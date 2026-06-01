<script setup lang="ts">
import type { ConfigHistoryItem } from '~/composables/useApi'

definePageMeta({ middleware: 'auth' })

const api = useApi()
const auth = useAuthStore()
const router = useRouter()

const query = ref('')
const results = ref<ConfigHistoryItem[]>([])
const loading = ref(false)
const searched = ref(false)

let debounceTimer: ReturnType<typeof setTimeout> | null = null

watch(query, (q) => {
  if (debounceTimer) clearTimeout(debounceTimer)
  if (!q.trim()) { results.value = []; searched.value = false; return }
  debounceTimer = setTimeout(() => runSearch(q.trim()), 300)
})

async function runSearch(q: string) {
  loading.value = true
  searched.value = true
  try {
    // 1. CT text search (name, proj_id, cmp_id)
    const ctResults = await api.configTable.search({ q, limit: 50 }, auth.token).catch(() => [] as ConfigHistoryItem[])

    // 2. SSOT key search: find TruthNodes matching the alias text
    let keyResults: ConfigHistoryItem[] = []
    try {
      const ssotHits = await api.ssot.search(q, '', auth.token)
      // Fetch each TruthNode to get its latestName (NameNode UUID stored in CT.key)
      const nameNodeUuids = (
        await Promise.all(
          ssotHits.slice(0, 5).map(hit =>
            api.ssot.getTruthNode(hit.truth, auth.token)
              .then(tn => tn.latestName)
              .catch(() => null)
          )
        )
      ).filter(Boolean) as string[]

      if (nameNodeUuids.length > 0) {
        keyResults = await api.configTable.search({ key_uuids: nameNodeUuids, limit: 50 }, auth.token).catch(() => [])
      }
    } catch { /* SSOT unreachable — skip key search */ }

    // 3. Merge and deduplicate by config_relation_uuid, newest first
    const seen = new Set<string>()
    const merged: ConfigHistoryItem[] = []
    for (const item of [...ctResults, ...keyResults]) {
      if (!seen.has(item.config_relation_uuid)) {
        seen.add(item.config_relation_uuid)
        merged.push(item)
      }
    }
    merged.sort((a, b) => new Date(b.date_created).getTime() - new Date(a.date_created).getTime())
    results.value = merged
  } finally {
    loading.value = false
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function statusClass(status: string) {
  if (status === 'approved') return 'bg-emerald-50 text-emerald-700'
  if (status === 'pending')  return 'bg-yellow-50 text-yellow-700'
  if (status === 'rejected') return 'bg-red-50 text-red-700'
  return 'bg-slate-100 text-slate-500'
}

function goToSnapshot(item: ConfigHistoryItem) {
  router.push(`/config-snapshot/${item.config_relation_uuid}`)
}
</script>

<template>
  <div class="min-h-screen bg-slate-50">
    <AppNav>
      <span class="text-sm text-slate-700 font-semibold">Search Configs</span>
    </AppNav>

    <div class="max-w-3xl lg:max-w-4xl xl:max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">

      <!-- Search box -->
      <div class="bg-white rounded-2xl ring-1 ring-slate-900/5 px-5 py-5">
        <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Search</label>
        <input
          v-model="query"
          type="text"
          autofocus
          placeholder="Search by config name, project, company, or key alias…"
          class="w-full ring-1 ring-slate-200 rounded-xl px-4 py-3 text-sm bg-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
        <p class="text-xs text-slate-400 mt-2">Results appear as you type. Key alias search resolves through SSOT.</p>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="space-y-2">
        <div v-for="i in 3" :key="i"
          class="bg-white rounded-2xl ring-1 ring-slate-900/5 px-5 py-4 animate-pulse h-16" />
      </div>

      <!-- Results -->
      <div v-else-if="results.length > 0" class="space-y-2">
        <p class="text-xs text-slate-400 px-1">{{ results.length }} result{{ results.length === 1 ? '' : 's' }}</p>
        <button
          v-for="item in results"
          :key="item.config_relation_uuid"
          @click="goToSnapshot(item)"
          class="w-full bg-white rounded-2xl ring-1 ring-slate-900/5 px-5 py-4 flex items-center justify-between text-left hover:ring-blue-400/40 hover:shadow-sm transition-all group">
          <div class="flex flex-col min-w-0 gap-1">
            <div class="flex flex-wrap items-center gap-2">
              <span :class="statusClass(item.approval_status)"
                class="text-xs font-semibold px-2.5 py-0.5 rounded-full shrink-0 capitalize">
                {{ item.is_latest && item.approval_status === 'approved' ? 'Latest' : item.approval_status }}
              </span>
              <span class="text-sm font-medium text-slate-800 truncate">
                {{ item.name ?? '—' }}
              </span>
            </div>
            <div class="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span v-if="item.proj_id">{{ item.proj_id }}</span>
              <span v-if="item.proj_id && item.cmp_id">›</span>
              <span v-if="item.cmp_id">{{ item.cmp_id }}</span>
              <span v-if="item.proj_id || item.cmp_id">·</span>
              <span class="capitalize">{{ item.environment }}</span>
              <span>·</span>
              <span>{{ formatDate(item.date_created) }}</span>
              <span>·</span>
              <span>{{ item.entry_count }} {{ item.entry_count === 1 ? 'entry' : 'entries' }}</span>
            </div>
          </div>
          <span class="text-slate-300 group-hover:text-blue-500 shrink-0 ml-2 transition">›</span>
        </button>
      </div>

      <!-- Empty state after search -->
      <div v-else-if="searched && !loading"
        class="bg-white rounded-2xl ring-1 ring-slate-900/5 px-5 py-10 text-center text-sm text-slate-400">
        No configs found matching <span class="font-semibold text-slate-600">"{{ query }}"</span>
      </div>

      <!-- Idle state -->
      <div v-else-if="!searched"
        class="bg-white rounded-2xl ring-1 ring-slate-900/5 px-5 py-10 text-center text-sm text-slate-400">
        Start typing to search across all configs.
      </div>

    </div>
  </div>
</template>
