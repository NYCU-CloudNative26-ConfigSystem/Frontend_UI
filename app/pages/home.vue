<script setup lang="ts">
import type { ConfigHistoryItem } from '~/composables/useApi'

definePageMeta({ middleware: 'auth' })

const api = useApi()
const auth = useAuthStore()

const statuses = ref<Record<string, 'ok' | 'error' | 'checking'>>({
  login: 'checking',
  config: 'checking',
  ssot: 'checking',
  export: 'checking',
})

const pendingReviews = ref<ConfigHistoryItem[]>([])
const pendingReviewsLoading = ref(false)

async function loadPendingReviews() {
  pendingReviewsLoading.value = true
  try {
    pendingReviews.value = await api.configTable.pendingReviews(auth.token, { limit: 5 }).catch(() => [])
  } finally {
    pendingReviewsLoading.value = false
  }
}

async function checkHealth() {
  const checks: [string, () => Promise<{ status: string }>][] = [
    ['login', api.health.login],
    ['config', api.health.config],
    ['ssot', api.health.ssot],
    ['export', api.health.export],
  ]
  for (const [key, fn] of checks) {
    statuses.value[key] = 'checking'
    try {
      await fn()
      statuses.value[key] = 'ok'
    } catch {
      statuses.value[key] = 'error'
    }
  }
}

onMounted(checkHealth)
onMounted(loadPendingReviews)
</script>

<template>
  <div class="min-h-screen bg-slate-50">
    <AppNav :show-back="false">
      <div class="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
        <span class="text-white text-xs font-bold leading-none">CS</span>
      </div>
      <span class="font-semibold text-slate-900 text-sm">Config System</span>
    </AppNav>

    <main class="max-w-3xl lg:max-w-4xl xl:max-w-5xl mx-auto px-4 sm:px-6 py-6 pb-16 space-y-4">
      <!-- Navigation cards -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <NuxtLink to="/companies"
          class="group bg-white rounded-2xl ring-1 ring-slate-900/5 p-5 hover:ring-blue-500/40 hover:shadow-sm transition-all">
          <div class="w-9 h-9 bg-violet-100 rounded-xl flex items-center justify-center mb-3 group-hover:bg-violet-200 transition">
            <span class="text-violet-700 text-xs font-bold">CMP</span>
          </div>
          <p class="font-semibold text-slate-800 text-sm">Companies</p>
          <p class="text-xs text-slate-400 mt-0.5">Manage organizations</p>
        </NuxtLink>

        <NuxtLink to="/projects"
          class="group bg-white rounded-2xl ring-1 ring-slate-900/5 p-5 hover:ring-blue-500/40 hover:shadow-sm transition-all">
          <div class="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center mb-3 group-hover:bg-blue-200 transition">
            <span class="text-blue-700 text-xs font-bold">PRJ</span>
          </div>
          <p class="font-semibold text-slate-800 text-sm">Projects</p>
          <p class="text-xs text-slate-400 mt-0.5">Assign companies and configs</p>
        </NuxtLink>


        <NuxtLink to="/config-search"
          class="group bg-white rounded-2xl ring-1 ring-slate-900/5 p-5 hover:ring-blue-500/40 hover:shadow-sm transition-all">
          <div class="w-9 h-9 bg-violet-100 rounded-xl flex items-center justify-center mb-3 group-hover:bg-violet-200 transition">
            <span class="text-violet-700 text-xs font-bold">SRC</span>
          </div>
          <p class="font-semibold text-slate-800 text-sm">Search Configs</p>
          <p class="text-xs text-slate-400 mt-0.5">Find configs by name, project, company, or key</p>
        </NuxtLink>

        <NuxtLink to="/review-pending"
          class="group bg-white rounded-2xl ring-1 ring-slate-900/5 p-5 hover:ring-blue-500/40 hover:shadow-sm transition-all">
          <div class="w-9 h-9 bg-rose-100 rounded-xl flex items-center justify-center mb-3 group-hover:bg-rose-200 transition">
            <span class="text-rose-700 text-xs font-bold">REV</span>
          </div>
          <p class="font-semibold text-slate-800 text-sm">Pending Review</p>
          <p class="text-xs text-slate-400 mt-0.5">Jump straight into pending snapshots</p>
        </NuxtLink>

        <NuxtLink to="/export"
          class="group bg-white rounded-2xl ring-1 ring-slate-900/5 p-5 hover:ring-blue-500/40 hover:shadow-sm transition-all">
          <div class="w-9 h-9 bg-amber-100 rounded-xl flex items-center justify-center mb-3 group-hover:bg-amber-200 transition">
            <span class="text-amber-700 text-xs font-bold">EXP</span>
          </div>
          <p class="font-semibold text-slate-800 text-sm">Config Export</p>
          <p class="text-xs text-slate-400 mt-0.5">Download JSON, YAML, ENV, XML</p>
        </NuxtLink>
        <NuxtLink to="/"
          class="group bg-white rounded-2xl ring-1 ring-slate-900/5 p-5 hover:ring-blue-500/40 hover:shadow-sm transition-all">
          <div class="w-9 h-9 bg-emerald-100 rounded-xl flex items-center justify-center mb-3 group-hover:bg-emerald-200 transition">
            <span class="text-emerald-700 text-xs font-bold">Me</span>
          </div>
          <p class="font-semibold text-slate-800 text-sm">About Me</p>
          <p class="text-xs text-slate-400 mt-0.5">Browse my profile and settings</p>
        </NuxtLink>
      </div>

      <div class="bg-white rounded-2xl ring-1 ring-slate-900/5 overflow-hidden">
        <div class="flex items-center justify-between px-5 py-4 border-b border-slate-50">
          <div>
            <h2 class="font-semibold text-slate-900 text-sm">Pending review</h2>
            <p class="text-xs text-slate-400 mt-0.5">Snapshots waiting for reviewer action.</p>
          </div>
          <NuxtLink to="/review-pending" class="text-xs font-medium text-blue-600 hover:text-blue-700 transition">
            View all pending reviews
          </NuxtLink>
          
        </div>
        <div v-if="pendingReviewsLoading" class="px-5 py-8 text-sm text-slate-400">Loading pending reviews…</div>
        <div v-else-if="pendingReviews.length === 0" class="px-5 py-8 text-sm text-slate-400">
          No pending reviews right now.
        </div>
        <div v-else class="divide-y divide-slate-50">
          <NuxtLink
            v-for="item in pendingReviews"
            :key="item.config_relation_uuid"
            :to="`/config-snapshot/${item.config_relation_uuid}?proj=${item.proj_id ?? ''}&cmp=${item.cmp_id ?? ''}&env=${item.environment}`"
            class="block px-5 py-4 hover:bg-slate-50 transition">
            <div class="flex items-center justify-between gap-3">
              <div class="min-w-0">
                <p class="font-semibold text-slate-900 text-sm truncate">{{ item.name ?? item.config_relation_uuid }}</p>
                <p class="text-xs text-slate-400 mt-0.5">
                  {{ item.proj_id ?? '—' }} / {{ item.cmp_id ?? '—' }} · {{ item.environment }} · {{ item.entry_count }} entries
                </p>
              </div>
              <StatusBadge :status="item.approval_status" />
            </div>
          </NuxtLink>
        </div>
      </div>

      <!-- Service health -->
      <div class="bg-white rounded-2xl ring-1 ring-slate-900/5 overflow-hidden">
        <div class="flex items-center justify-between px-5 py-4 border-b border-slate-50">
          <h2 class="font-semibold text-slate-900 text-sm">Service Health</h2>
          <button @click="checkHealth"
            class="text-xs font-medium text-slate-500 hover:text-blue-600 bg-slate-50 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition">
            Refresh
          </button>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-0 sm:gap-3 sm:p-4 divide-y sm:divide-y-0 divide-slate-50">
          <div v-for="(status, name) in statuses" :key="name"
            class="flex items-center gap-3 px-5 py-3 sm:px-4 sm:bg-slate-50 sm:rounded-xl">
            <div :class="{
              'bg-emerald-400': status === 'ok',
              'bg-red-400': status === 'error',
              'bg-slate-300 animate-pulse': status === 'checking',
            }" class="w-2 h-2 rounded-full shrink-0" />
            <span class="text-sm text-slate-700 capitalize flex-1">{{ name }}</span>
            <span :class="{
              'text-emerald-600': status === 'ok',
              'text-red-500': status === 'error',
              'text-slate-400': status === 'checking',
            }" class="text-xs font-semibold">{{ status }}</span>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>
