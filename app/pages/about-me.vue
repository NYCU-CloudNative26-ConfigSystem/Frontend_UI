<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const api = useApi()
const auth = useAuthStore()

const profile = ref<{ email: string; full_name: string; company: string; username: string; role: string } | null>(null)
const loading = ref(true)
const error = ref('')

const roleLabel = computed(() => {
  if (!profile.value?.role) return 'User'
  return profile.value.role.charAt(0).toUpperCase() + profile.value.role.slice(1)
})

const roleDescription = computed(() => {
  if (profile.value?.role === 'admin') return 'Full access across config workflows.'
  if (profile.value?.role === 'reviewer') return 'Can review, approve, and reject pending snapshots.'
  return 'Can create and submit config snapshots for review.'
})

onMounted(async () => {
  loading.value = true
  error.value = ''
  try {
    profile.value = await api.auth.me(auth.token)
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Failed to load profile'
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
        <NuxtLink to="/home" class="text-sm text-slate-400 hover:text-slate-700 transition">
          ← Back to home
        </NuxtLink>
      </div>

      <div v-if="loading" class="text-center py-12 text-sm text-slate-400">Loading profile…</div>
      <AlertBox v-else-if="error" :large="true">{{ error }}</AlertBox>

      <template v-else-if="profile">
        <section class="bg-white rounded-2xl ring-1 ring-slate-900/5 overflow-hidden">
          <div class="px-5 py-5 border-b border-slate-50 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div class="flex items-start gap-4 min-w-0">
              <div class="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <span class="text-sm font-bold">{{ profile.username.slice(0, 2).toUpperCase() }}</span>
              </div>
              <div class="min-w-0">
                <h1 class="text-lg font-semibold text-slate-900 truncate">{{ profile.full_name || profile.username }}</h1>
                <p class="text-sm text-slate-500 mt-0.5">@{{ profile.username }}</p>
                <p class="text-xs text-slate-400 mt-1 break-all">{{ profile.email }}</p>
              </div>
            </div>
            <span class="self-start rounded-full bg-blue-50 text-blue-700 px-3 py-1 text-xs font-semibold ring-1 ring-blue-100">
              {{ roleLabel }}
            </span>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-slate-50">
            <div class="px-5 py-4">
              <p class="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Company</p>
              <p class="text-sm text-slate-700">{{ profile.company || '—' }}</p>
            </div>
            <div class="px-5 py-4">
              <p class="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Access</p>
              <p class="text-sm text-slate-700">{{ roleDescription }}</p>
            </div>
          </div>
        </section>

        <section class="bg-white rounded-2xl ring-1 ring-slate-900/5 overflow-hidden">
          <div class="px-5 py-4 border-b border-slate-50">
            <h2 class="font-semibold text-slate-900 text-sm">Quick actions</h2>
          </div>
          <div class="divide-y divide-slate-50">
            <NuxtLink to="/config-search" class="flex items-center justify-between gap-3 px-5 py-4 hover:bg-slate-50 transition">
              <div>
                <p class="text-sm font-semibold text-slate-800">Search configs</p>
                <p class="text-xs text-slate-400 mt-0.5">Find snapshots by name, project, company, key, or value.</p>
              </div>
              <span class="text-slate-300">›</span>
            </NuxtLink>
            <NuxtLink v-if="profile.role === 'reviewer' || profile.role === 'admin'" to="/review-pending" class="flex items-center justify-between gap-3 px-5 py-4 hover:bg-slate-50 transition">
              <div>
                <p class="text-sm font-semibold text-slate-800">Pending reviews</p>
                <p class="text-xs text-slate-400 mt-0.5">Open snapshots waiting for approval.</p>
              </div>
              <span class="text-slate-300">›</span>
            </NuxtLink>
          </div>
        </section>
      </template>
    </main>
  </div>
</template>
