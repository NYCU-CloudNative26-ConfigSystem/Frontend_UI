<script setup lang="ts">
import type { ConfigHistoryItem } from '~/composables/useApi'

definePageMeta({ middleware: 'auth' })

const api = useApi()
const auth = useAuthStore()
const router = useRouter()

const pending = ref<ConfigHistoryItem[]>([])
const loading = ref(false)
const error = ref('')

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function openSnapshot(item: ConfigHistoryItem) {
  router.push(`/config-snapshot/${item.config_relation_uuid}?proj=${item.proj_id ?? ''}&cmp=${item.cmp_id ?? ''}&env=${item.environment}`)
}

async function loadPending() {
  loading.value = true
  error.value = ''
  try {
    pending.value = await api.configTable.pendingReviews(auth.token, { limit: 100 })
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Failed to load pending reviews'
  } finally {
    loading.value = false
  }
}

onMounted(loadPending)
</script>

<template>
  <div class="min-h-screen bg-slate-50">
    <AppNav>
      <span class="font-semibold text-slate-900">Pending Reviews</span>
    </AppNav>

    <div class="max-w-3xl lg:max-w-4xl xl:max-w-5xl mx-auto px-4 sm:px-6 py-6 pb-16 space-y-4">
      <div>
        <button @click="router.push('/home')" class="text-sm text-slate-400 hover:text-slate-700 transition">
          ← Back to home
        </button>
      </div>

      <div class="bg-white rounded-2xl ring-1 ring-slate-900/5 px-5 py-5 flex items-center justify-between gap-3">
        <div>
          <h1 class="text-lg font-semibold text-slate-900">All pending review snapshots</h1>
          <p class="text-sm text-slate-400 mt-1">Open any item to review, compare, approve, or reject it.</p>
        </div>
        <button
          @click="loadPending"
          class="rounded-xl px-4 py-2 text-sm font-semibold ring-1 ring-slate-200 text-slate-600 hover:bg-slate-50 transition">
          Refresh
        </button>
      </div>

      <AlertBox v-if="error">{{ error }}</AlertBox>

      <div v-if="loading" class="space-y-2">
        <div v-for="i in 4" :key="i" class="bg-white rounded-2xl ring-1 ring-slate-900/5 px-5 py-5 animate-pulse h-20" />
      </div>

      <div v-else-if="pending.length === 0" class="bg-white rounded-2xl ring-1 ring-slate-900/5 px-5 py-10 text-center text-sm text-slate-400">
        No pending reviews right now.
      </div>

      <div v-else class="space-y-2">
        <button
          v-for="item in pending"
          :key="item.config_relation_uuid"
          @click="openSnapshot(item)"
          class="w-full bg-white rounded-2xl ring-1 ring-slate-900/5 px-5 py-4 flex items-center justify-between text-left hover:ring-blue-400/40 hover:shadow-sm transition-all group">
          <div class="flex flex-col min-w-0 gap-1">
            <div class="flex flex-wrap items-center gap-2">
              <StatusBadge :status="item.approval_status" />
              <span class="text-sm font-medium text-slate-800 truncate">{{ item.name ?? '—' }}</span>
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
    </div>
  </div>
</template>
