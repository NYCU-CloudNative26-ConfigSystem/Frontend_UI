<script setup lang="ts">
import type { CompanyResponse } from '~/composables/useApi'

definePageMeta({ middleware: 'auth' })

const api = useApi()
const auth = useAuthStore()
const router = useRouter()

const loading = ref(true)
const loadError = ref('')
const profile = ref<{ email: string; full_name: string; company: string; username: string; role: string } | null>(null)
const companies = ref<CompanyResponse[]>([])

const companyDisplayName = computed(() => {
  if (!profile.value?.company) return '-'
  return companies.value.find(c => c.cmp_id === profile.value?.company)?.display_name ?? profile.value.company
})

const roleStyle = computed(() => {
  const role = profile.value?.role
  if (role === 'admin') return 'bg-indigo-50 text-indigo-700 ring-indigo-200'
  if (role === 'reviewer') return 'bg-amber-50 text-amber-700 ring-amber-200'
  return 'bg-slate-100 text-slate-600 ring-slate-200'
})

onMounted(async () => {
  loading.value = true
  loadError.value = ''
  try {
    const [me, companyList] = await Promise.all([
      api.auth.me(auth.token),
      api.companies.list(auth.token).catch(() => [] as CompanyResponse[]),
    ])
    profile.value = me
    companies.value = companyList
  } catch (e: unknown) {
    loadError.value = e instanceof Error ? e.message : 'Failed to load profile'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="min-h-screen bg-slate-50">
    <AppNav>
      <span class="font-semibold text-slate-900">About Me</span>
    </AppNav>

    <main class="max-w-3xl lg:max-w-4xl xl:max-w-5xl mx-auto px-4 sm:px-6 py-6 pb-16 space-y-4">
      <div>
        <button @click="router.push('/home')" class="text-sm text-slate-400 hover:text-slate-700 transition">
          Back to home
        </button>
      </div>

      <div v-if="loading" class="text-center py-12 text-sm text-slate-400">Loading profile...</div>
      <AlertBox v-else-if="loadError" :large="true">{{ loadError }}</AlertBox>

      <template v-else-if="profile">
        <section class="bg-white rounded-2xl ring-1 ring-slate-900/5 overflow-hidden">
          <div class="px-5 py-5 border-b border-slate-50 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div class="flex items-center gap-4 min-w-0">
              <div class="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center shrink-0">
                <span class="text-white text-sm font-bold">{{ profile.username.slice(0, 2).toUpperCase() }}</span>
              </div>
              <div class="min-w-0">
                <h1 class="text-lg font-semibold text-slate-900 truncate">{{ profile.full_name || profile.username }}</h1>
                <p class="text-xs text-slate-400 font-mono truncate">{{ profile.email }}</p>
              </div>
            </div>
            <span :class="roleStyle" class="inline-flex self-start sm:self-center rounded-full px-3 py-1 text-xs font-semibold capitalize ring-1">
              {{ profile.role }}
            </span>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-slate-50">
            <div class="px-5 py-4">
              <p class="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Username</p>
              <p class="text-sm text-slate-700 font-mono break-all">{{ profile.username }}</p>
            </div>
            <div class="px-5 py-4">
              <p class="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Company</p>
              <p class="text-sm text-slate-700">{{ companyDisplayName }}</p>
              <p v-if="profile.company && companyDisplayName !== profile.company" class="mt-0.5 text-xs text-slate-400 font-mono">{{ profile.company }}</p>
            </div>
          </div>
        </section>

        <section class="bg-white rounded-2xl ring-1 ring-slate-900/5 overflow-hidden">
          <div class="px-5 py-4 border-b border-slate-50">
            <h2 class="font-semibold text-slate-900 text-sm">Quick access</h2>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-5">
            <NuxtLink to="/config-search"
              class="rounded-2xl ring-1 ring-slate-200 px-4 py-3 hover:ring-blue-400 hover:bg-blue-50/30 transition">
              <p class="text-sm font-semibold text-slate-800">Search Configs</p>
              <p class="text-xs text-slate-400 mt-0.5">Find snapshots by name, key, or value</p>
            </NuxtLink>
            <NuxtLink to="/review-pending"
              class="rounded-2xl ring-1 ring-slate-200 px-4 py-3 hover:ring-rose-400 hover:bg-rose-50/30 transition">
              <p class="text-sm font-semibold text-slate-800">Pending Reviews</p>
              <p class="text-xs text-slate-400 mt-0.5">Open snapshots waiting for approval</p>
            </NuxtLink>
            <button @click="auth.logout()"
              class="rounded-2xl ring-1 ring-slate-200 px-4 py-3 text-left hover:ring-red-300 hover:bg-red-50/30 transition">
              <p class="text-sm font-semibold text-slate-800">Logout</p>
              <p class="text-xs text-slate-400 mt-0.5">End this browser session</p>
            </button>
          </div>
        </section>
      </template>
    </main>
  </div>
</template>
