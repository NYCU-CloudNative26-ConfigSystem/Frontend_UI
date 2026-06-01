<script setup lang="ts">
import type { ConfigReadResponse } from '~/composables/useApi'

definePageMeta({ middleware: 'auth' })

const api = useApi()
const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const configUuid = computed(() => route.query.config_uuid as string || '')

// ── Review row model ──────────────────────────────────────────────────────────

interface ReviewRow {
  key: string        // NameNode UUID (CT row.key)
  alias: string      // human-readable key name
  truthId: string    // TruthNode UUID
  isGroup: boolean   // val starts with GROUP:
  sensitive: boolean
  oldVal: string     // CT row.val at snapshot time, e.g. 'VALUE:<uuid>'
  newVal: string     // TruthNode.latestVal right now, e.g. 'VALUE:<uuid>'
  isStale: boolean   // oldVal !== newVal
  adopt: boolean     // user choice: true = use newVal, false = keep oldVal
  oldDisplay: string // resolved string for display
  newDisplay: string // resolved string for display
}

// ── State ─────────────────────────────────────────────────────────────────────

const snapshot = ref<ConfigReadResponse | null>(null)
const reviewRows = ref<ReviewRow[]>([])
const loading = ref(true)
const loadError = ref('')
const showUnchanged = ref(false)
const changeDescription = ref('')
const submitting = ref(false)
const submitError = ref('')
const myUsername = ref('')

const staleRows = computed(() => reviewRows.value.filter(r => r.isStale))
const unchangedRows = computed(() => reviewRows.value.filter(r => !r.isStale))

// ── Helpers ───────────────────────────────────────────────────────────────────

function stripRef(r: string): string {
  return r.startsWith('VALUE:') || r.startsWith('GROUP:') ? r.slice(6) : r
}

async function resolveDisplay(valRef: string, sensitive: boolean, isGroup: boolean): Promise<string> {
  if (sensitive) return '(sensitive — hidden)'
  if (isGroup) return '(object / array)'
  const nodeUuid = stripRef(valRef)
  const node = await api.ssot.resolveNode(nodeUuid, auth.token).catch(() => null)
  if (!node) return valRef
  if (node.type === 'value') return String(node.val ?? '')
  if (node.type === 'group') {
    if (!node.entries?.length) return node.isArray ? '[]' : '{}'
    return '(object / array)'
  }
  return valRef
}

// ── Load ──────────────────────────────────────────────────────────────────────

onMounted(async () => {
  if (!configUuid.value) {
    loadError.value = 'Missing config_uuid query parameter.'
    loading.value = false
    return
  }

  try {
    const [cfg, me] = await Promise.all([
      api.configTable.getByUuid(configUuid.value, auth.token),
      api.auth.me(auth.token).catch(() => ({ username: '', role: 'user', email: '', full_name: '', company: '' })),
    ])
    snapshot.value = cfg
    myUsername.value = me.username

    const rows: ReviewRow[] = []

    for (const ctRow of cfg.rows) {
      // Resolve NameNode → alias + truthId
      const nameNode = await api.ssot.resolveNode(ctRow.key, auth.token).catch(() => null)
      const alias = nameNode?.name_val ?? ctRow.key
      const truthId = nameNode?.truthId ?? ''

      // Get TruthNode's current latestVal
      const truthNode = truthId
        ? await api.ssot.getTruthNode(truthId, auth.token).catch(() => null)
        : null
      const latestVal = truthNode?.latestVal ?? ctRow.val
      const sensitive = truthNode?.sensitive ?? false

      const isStale = latestVal !== ctRow.val
      const isGroup = ctRow.val.startsWith('GROUP:')

      // Resolve display values
      const oldDisplay = await resolveDisplay(ctRow.val, sensitive, isGroup)
      const newDisplay = isStale
        ? await resolveDisplay(latestVal, sensitive, isGroup)
        : oldDisplay

      rows.push({
        key: ctRow.key,
        alias,
        truthId,
        isGroup,
        sensitive,
        oldVal: ctRow.val,
        newVal: latestVal,
        isStale,
        adopt: isStale, // default: adopt new value
        oldDisplay,
        newDisplay,
      })
    }

    reviewRows.value = rows
  } catch (e: unknown) {
    loadError.value = e instanceof Error ? e.message : 'Failed to load config.'
  } finally {
    loading.value = false
  }
})

// ── Submit ────────────────────────────────────────────────────────────────────

async function submit() {
  if (!snapshot.value) return
  submitting.value = true
  submitError.value = ''
  try {
    const entries = reviewRows.value.map(r => ({
      key: r.key,
      val: r.isStale && r.adopt ? r.newVal : r.oldVal,
    }))

    const result = await api.configTable.writeConfig({
      proj_id: snapshot.value.proj_id!,
      cmp_id: snapshot.value.cmp_id!,
      environment: snapshot.value.environment,
      user_id: myUsername.value,
      entries,
      change_description: changeDescription.value || undefined,
      source_snapshot_uuid: configUuid.value,
    }, auth.token)

    router.push(`/config-snapshot/${result.config_relation_uuid}`)
  } catch (e: unknown) {
    submitError.value = e instanceof Error ? e.message : 'Submit failed.'
  } finally {
    submitting.value = false
  }
}

function adoptAll() {
  for (const r of reviewRows.value) if (r.isStale) r.adopt = true
}

function keepAll() {
  for (const r of reviewRows.value) if (r.isStale) r.adopt = false
}
</script>

<template>
  <div class="min-h-screen bg-slate-50">

    <!-- Nav -->
    <nav class="sticky top-0 z-10 bg-white/90 backdrop-blur-sm border-b border-slate-100">
      <div class="max-w-3xl lg:max-w-4xl xl:max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
        <div class="flex items-center gap-2 min-w-0 text-sm">
          <NuxtLink to="/home" class="text-slate-400 hover:text-slate-700 transition shrink-0">← Home</NuxtLink>
          <span class="text-slate-200 shrink-0 select-none">|</span>
          <span class="font-semibold text-slate-700 capitalize truncate">
            {{ snapshot?.environment ?? 'Config' }} update review
          </span>
        </div>
        <button @click="auth.logout()" class="text-sm text-slate-400 hover:text-red-500 transition shrink-0">Logout</button>
      </div>
    </nav>

    <div class="max-w-3xl lg:max-w-4xl xl:max-w-5xl mx-auto px-4 sm:px-6 py-6 pb-16 space-y-4">

      <!-- Back -->
      <div>
        <button
          @click="router.back()"
          class="text-sm text-slate-400 hover:text-slate-700 transition">
          ← Back
        </button>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="text-center py-16 text-sm text-slate-400">
        Loading config and checking for updates…
      </div>

      <!-- Error -->
      <div v-else-if="loadError"
        class="bg-red-50 ring-1 ring-red-200 rounded-2xl px-5 py-4 text-sm text-red-700">
        {{ loadError }}
      </div>

      <template v-else-if="snapshot">

        <!-- Info card -->
        <div class="bg-white rounded-2xl ring-1 ring-slate-900/5 px-5 py-4">
          <h2 class="font-semibold text-slate-900 text-base mb-1">
            Reviewing config updates
          </h2>
          <p class="text-sm text-slate-500">
            <span class="capitalize font-medium">{{ snapshot.environment }}</span>
            &mdash; {{ snapshot.proj_id }} / {{ snapshot.cmp_id }}
          </p>
          <p v-if="staleRows.length > 0" class="mt-2 text-sm text-amber-700 font-medium">
            {{ staleRows.length }} {{ staleRows.length === 1 ? 'key has' : 'keys have' }} a newer value available.
            Choose which ones to adopt before submitting a new snapshot.
          </p>
          <p v-else class="mt-2 text-sm text-emerald-700 font-medium">
            All keys are already up to date.
          </p>
        </div>

        <!-- All up to date state -->
        <div v-if="staleRows.length === 0"
          class="bg-white rounded-2xl ring-1 ring-slate-900/5 px-5 py-10 text-center">
          <p class="text-4xl mb-3">✓</p>
          <p class="text-slate-600 text-sm">No action needed. Your config is using the latest values.</p>
          <button
            @click="router.push(`/config-snapshot/${configUuid}`)"
            class="mt-4 rounded-xl px-5 py-2 text-sm font-semibold ring-1 ring-slate-200 text-slate-600 hover:bg-slate-50 transition">
            View snapshot
          </button>
        </div>

        <!-- Stale keys table -->
        <div v-if="staleRows.length > 0" class="bg-white rounded-2xl ring-1 ring-slate-900/5 overflow-hidden">
          <div class="px-5 py-3 border-b border-slate-50 flex items-center justify-between gap-3">
            <h3 class="text-xs font-semibold text-slate-400 uppercase tracking-wide">
              Updated keys ({{ staleRows.length }})
            </h3>
            <div class="flex gap-2">
              <button
                @click="adoptAll"
                class="text-xs font-semibold text-emerald-700 hover:text-emerald-800 transition px-2 py-1 rounded-lg hover:bg-emerald-50">
                Adopt all
              </button>
              <button
                @click="keepAll"
                class="text-xs font-semibold text-slate-500 hover:text-slate-700 transition px-2 py-1 rounded-lg hover:bg-slate-50">
                Keep all
              </button>
            </div>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-xs sm:text-sm">
              <thead>
                <tr class="text-left border-b border-slate-50">
                  <th class="px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Key</th>
                  <th class="px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Current value</th>
                  <th class="px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">New value</th>
                  <th class="px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide text-center">Action</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-50">
                <tr v-for="row in staleRows" :key="row.key"
                  :class="row.adopt ? 'bg-emerald-50/30' : 'bg-slate-50/30'"
                  class="transition">
                  <!-- Key -->
                  <td class="px-5 py-3">
                    <span class="font-semibold text-slate-800">{{ row.alias }}</span>
                    <span v-if="row.sensitive"
                      class="ml-2 bg-amber-50 text-amber-700 ring-1 ring-amber-200 text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide">
                      Sensitive
                    </span>
                    <span v-if="row.isGroup"
                      class="ml-2 bg-slate-100 text-slate-500 text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide">
                      Object
                    </span>
                  </td>
                  <!-- Old value -->
                  <td class="px-5 py-3 font-mono text-slate-500 break-all">
                    <span v-if="row.sensitive" class="text-slate-300 tracking-widest">••••••••</span>
                    <span v-else>{{ row.oldDisplay }}</span>
                  </td>
                  <!-- New value -->
                  <td class="px-5 py-3 font-mono break-all">
                    <span v-if="row.sensitive" class="text-slate-300 tracking-widest">••••••••</span>
                    <span v-else class="text-emerald-700 font-semibold">{{ row.newDisplay }}</span>
                  </td>
                  <!-- Toggle -->
                  <td class="px-5 py-3 text-center">
                    <button
                      @click="row.adopt = !row.adopt"
                      :class="row.adopt
                        ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                        : 'bg-white text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50'"
                      class="rounded-xl px-3 py-1.5 text-xs font-semibold transition whitespace-nowrap">
                      {{ row.adopt ? 'Adopt ✓' : 'Keep' }}
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Unchanged keys (collapsed) -->
        <div v-if="unchangedRows.length > 0" class="bg-white rounded-2xl ring-1 ring-slate-900/5 overflow-hidden">
          <button
            @click="showUnchanged = !showUnchanged"
            class="w-full px-5 py-3 flex items-center justify-between text-left hover:bg-slate-50/50 transition">
            <h3 class="text-xs font-semibold text-slate-400 uppercase tracking-wide">
              Unchanged keys ({{ unchangedRows.length }})
            </h3>
            <span class="text-slate-400 text-xs">{{ showUnchanged ? '▲ Hide' : '▼ Show' }}</span>
          </button>
          <div v-if="showUnchanged" class="border-t border-slate-50">
            <div class="px-5 py-3 flex flex-wrap gap-2">
              <span
                v-for="row in unchangedRows"
                :key="row.key"
                class="bg-slate-100 text-slate-600 text-xs font-medium px-2.5 py-1 rounded-full">
                {{ row.alias }}
              </span>
            </div>
          </div>
        </div>

        <!-- Submit section (only shown when there are stale rows) -->
        <div v-if="staleRows.length > 0" class="bg-white rounded-2xl ring-1 ring-slate-900/5 overflow-hidden">
          <div class="px-5 py-4 border-b border-slate-50">
            <h3 class="font-semibold text-slate-900 text-sm">Create update snapshot</h3>
            <p class="text-xs text-slate-400 mt-0.5">
              A new pending snapshot will be created and sent for approval.
            </p>
          </div>
          <div class="px-5 py-4 space-y-4">
            <!-- Summary of choices -->
            <div class="flex flex-wrap gap-2 text-xs">
              <span class="bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 px-2.5 py-1 rounded-full font-medium">
                {{ staleRows.filter(r => r.adopt).length }} adopted
              </span>
              <span class="bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full font-medium">
                {{ staleRows.filter(r => !r.adopt).length }} kept
              </span>
              <span class="bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full font-medium">
                {{ unchangedRows.length }} unchanged
              </span>
            </div>

            <!-- Change description -->
            <div>
              <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                Reason for change (optional)
              </label>
              <textarea
                v-model="changeDescription"
                placeholder="Briefly describe what changed and why…"
                rows="2"
                class="w-full ring-1 ring-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400 transition resize-none" />
            </div>

            <div v-if="submitError"
              class="text-sm text-red-600 bg-red-50 ring-1 ring-red-200 rounded-xl px-3 py-2">
              {{ submitError }}
            </div>

            <button
              @click="submit"
              :disabled="submitting"
              class="rounded-xl px-6 py-2.5 text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition disabled:opacity-40">
              {{ submitting ? 'Submitting…' : 'Submit for approval' }}
            </button>
          </div>
        </div>

      </template>

    </div>
  </div>
</template>
