<script setup lang="ts">
import type { ConfigHistoryItem } from '~/composables/useApi'

definePageMeta({ middleware: 'auth' })

const api  = useApi()
const auth = useAuthStore()
const route  = useRoute()
const router = useRouter()

const projId = computed(() => route.query.proj as string || '')
const cmpId  = computed(() => route.query.cmp as string || '')

// ── Config picker ─────────────────────────────────────────────────────────────

interface SelectedConfig {
  uuid: string
  name: string
  environment: string
  proj_id: string
  cmp_id: string
  date_created: string
  approval_status: string
  entry_count: number
}

function toSelected(item: ConfigHistoryItem): SelectedConfig {
  return {
    uuid:            item.config_relation_uuid,
    name:            item.name || item.config_relation_uuid.slice(0, 8),
    environment:     item.environment,
    proj_id:         item.proj_id  || '',
    cmp_id:          item.cmp_id   || '',
    date_created:    item.date_created,
    approval_status: item.approval_status,
    entry_count:     item.entry_count,
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const query1    = ref('')
const results1  = ref<ConfigHistoryItem[]>([])
const selected1 = ref<SelectedConfig | null>(null)
const loading1  = ref(false)
const open1     = ref(false)

const query2    = ref('')
const results2  = ref<ConfigHistoryItem[]>([])
const selected2 = ref<SelectedConfig | null>(null)
const loading2  = ref(false)
const open2     = ref(false)

let timer1: ReturnType<typeof setTimeout> | null = null
let timer2: ReturnType<typeof setTimeout> | null = null

async function doSearch(side: 1 | 2) {
  const q = (side === 1 ? query1 : query2).value.trim()
  const setLoading = (v: boolean) => { if (side === 1) loading1.value = v; else loading2.value = v }
  const setResults = (v: ConfigHistoryItem[]) => { if (side === 1) results1.value = v; else results2.value = v }
  const setOpen    = (v: boolean) => { if (side === 1) open1.value = v; else open2.value = v }

  if (!q) { setResults([]); setOpen(false); return }
  setLoading(true)
  try {
    if (UUID_RE.test(q)) {
      const res = await api.configTable.getByUuid(q, auth.token).catch(() => null)
      if (res) {
        const item: ConfigHistoryItem = {
          config_relation_uuid: res.config_relation_uuid,
          date_created:         res.date_created,
          date_deleted:         null,
          created_by:           res.created_by   || null,
          entry_count:          res.rows.length,
          is_latest:            res.is_latest     ?? false,
          environment:          res.environment,
          template_version_uuid:   null,
          template_version_number: null,
          approval_status:      res.approval_status      || 'unknown',
          approved_by:          res.approved_by           || null,
          approved_at:          res.approved_at           || null,
          rejection_reason:     res.rejection_reason      || null,
          change_description:   res.change_description    || null,
          name:                 res.name     || null,
          proj_id:              res.proj_id  || null,
          cmp_id:               res.cmp_id   || null,
        }
        setResults([item])
      } else {
        setResults([])
      }
    } else {
      const params: Parameters<typeof api.configTable.search>[0] = { q, limit: 10 }
      if (projId.value) params.proj_id = projId.value
      if (cmpId.value)  params.cmp_id  = cmpId.value
      const items = await api.configTable.search(params, auth.token).catch(() => [] as ConfigHistoryItem[])
      setResults(items)
    }
    setOpen(true)
  } finally {
    setLoading(false)
  }
}

function onInput(side: 1 | 2) {
  const t = side === 1 ? timer1 : timer2
  if (t) clearTimeout(t)
  const next = setTimeout(() => doSearch(side), 300)
  if (side === 1) timer1 = next; else timer2 = next
}

function pickResult(side: 1 | 2, item: ConfigHistoryItem) {
  const s = toSelected(item)
  if (side === 1) { selected1.value = s; open1.value = false; query1.value = '' }
  else            { selected2.value = s; open2.value = false; query2.value = '' }
  diffRows.value = []
  error.value    = ''
}

function clearSide(side: 1 | 2) {
  if (side === 1) { selected1.value = null; results1.value = []; query1.value = '' }
  else            { selected2.value = null; results2.value = []; query2.value = '' }
  diffRows.value = []
  error.value    = ''
}

function closeDropdown(side: 1 | 2) {
  setTimeout(() => { if (side === 1) open1.value = false; else open2.value = false }, 150)
}

function statusClass(s: string) {
  if (s === 'approved') return 'bg-emerald-50 text-emerald-700 ring-emerald-200'
  if (s === 'pending')  return 'bg-amber-50 text-amber-700 ring-amber-200'
  return 'bg-red-50 text-red-700 ring-red-200'
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ── Diff ──────────────────────────────────────────────────────────────────────

interface DiffRow {
  nameUuid:   string
  displayName: string
  category:   'changed' | 'removed' | 'added' | 'same'
  val1: string
  val2: string
  sensitive1: boolean
  sensitive2: boolean
}

const diffRows     = ref<DiffRow[]>([])
const loading      = ref(false)
const error        = ref('')
const hideUnchanged = ref(false)

const canCompare = computed(() =>
  selected1.value && selected2.value && selected1.value.uuid !== selected2.value.uuid
)

const visibleRows = computed(() =>
  hideUnchanged.value ? diffRows.value.filter(r => r.category !== 'same') : diffRows.value
)

const counts = computed(() => ({
  changed: diffRows.value.filter(r => r.category === 'changed').length,
  removed: diffRows.value.filter(r => r.category === 'removed').length,
  added:   diffRows.value.filter(r => r.category === 'added').length,
  same:    diffRows.value.filter(r => r.category === 'same').length,
}))

function stripRef(r: string) {
  return r.startsWith('VALUE:') || r.startsWith('GROUP:') ? r.slice(6) : r
}

async function resolveNodeToDisplay(nodeUuid: string, depth = 0): Promise<string> {
  if (depth > 3) return '…'
  const node = await api.ssot.resolveNode(nodeUuid, auth.token).catch(() => null)
  if (!node) return nodeUuid
  if (node.type === 'value') return String(node.val ?? '')
  if (node.type === 'name')  return node.name_val ?? nodeUuid
  if (node.type === 'group') {
    if (!node.entries?.length) return node.isArray ? '[]' : '{}'
    const parts = await Promise.all(node.entries.map(async e => {
      const keyNode  = await api.ssot.resolveNode(e.key, auth.token).catch(() => null)
      const keyName  = keyNode?.type === 'name' ? (keyNode.name_val ?? e.key) : e.key
      const valDisplay = await resolveNodeToDisplay(stripRef(e.val), depth + 1)
      return node.isArray ? valDisplay : `${keyName}: ${valDisplay}`
    }))
    return node.isArray ? `[ ${parts.join(', ')} ]` : `{ ${parts.join(', ')} }`
  }
  return nodeUuid
}

async function runDiff() {
  if (!canCompare.value) return
  loading.value = true
  error.value   = ''
  diffRows.value = []

  try {
    const [snap1, snap2] = await Promise.all([
      api.configTable.getByUuid(selected1.value!.uuid, auth.token).catch(() => null),
      api.configTable.getByUuid(selected2.value!.uuid, auth.token).catch(() => null),
    ])

    if (!snap1 || !snap2) { error.value = 'Failed to load one or both configs'; return }

    const map1 = new Map<string, string>(snap1.rows.map(r => [r.key, r.val]))
    const map2 = new Map<string, string>(snap2.rows.map(r => [r.key, r.val]))

    const allNameUuids = new Set([...map1.keys(), ...map2.keys()])
    const allValRefs   = new Set([...map1.values(), ...map2.values()])

    const nameEntries = await Promise.all([...allNameUuids].map(async uuid => {
      const node = await api.ssot.resolveNode(uuid, auth.token).catch(() => null)
      return [uuid, node?.type === 'name' ? (node.name_val ?? uuid) : uuid] as [string, string]
    }))
    const nameMap = new Map(nameEntries)

    const valEntries = await Promise.all([...allValRefs].map(async valRef => {
      const stripped = stripRef(valRef)
      const node = await api.ssot.resolveNode(stripped, auth.token).catch(() => null)
      let displayStr = ''; let isSensitive = false
      if (node?.type === 'value') { displayStr = String(node.val ?? ''); isSensitive = node.is_sensitive ?? false }
      else if (node?.type === 'group') { displayStr = await resolveNodeToDisplay(stripped, 0) }
      return [valRef, { displayStr, isSensitive }] as [string, { displayStr: string; isSensitive: boolean }]
    }))
    const valMap = new Map(valEntries)

    const rows: DiffRow[] = []
    for (const nameUuid of allNameUuids) {
      const valRef1  = map1.get(nameUuid)
      const valRef2  = map2.get(nameUuid)
      const resolved1 = valRef1 ? valMap.get(valRef1) : undefined
      const resolved2 = valRef2 ? valMap.get(valRef2) : undefined

      let category: DiffRow['category']
      if (!valRef1) category = 'added'
      else if (!valRef2) category = 'removed'
      else if (resolved1?.displayStr === resolved2?.displayStr) category = 'same'
      else category = 'changed'

      rows.push({
        nameUuid,
        displayName: nameMap.get(nameUuid) ?? nameUuid,
        category,
        val1: resolved1?.displayStr ?? '',
        val2: resolved2?.displayStr ?? '',
        sensitive1: resolved1?.isSensitive ?? false,
        sensitive2: resolved2?.isSensitive ?? false,
      })
    }

    const ORDER = { changed: 0, removed: 1, added: 2, same: 3 }
    rows.sort((a, b) => ORDER[a.category] - ORDER[b.category] || a.displayName.localeCompare(b.displayName))
    diffRows.value = rows
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Diff failed'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <PageShell>
    <template #nav>
      <AppNav>
        <button @click="router.back()"
          class="text-slate-400 hover:text-slate-700 transition shrink-0 hidden sm:inline">← Back</button>
        <span class="text-slate-200 shrink-0 hidden sm:inline select-none">›</span>
        <span class="font-semibold text-slate-900">Config Diff</span>
      </AppNav>
    </template>

    <button @click="router.back()" class="text-sm text-slate-400 hover:text-slate-700 transition">← Back</button>

    <!-- Config picker -->
    <div class="bg-white rounded-2xl ring-1 ring-slate-900/5 px-5 py-5 space-y-4">
      <h2 class="text-sm font-semibold text-slate-900">Choose two configs to compare</h2>
      <p class="text-xs text-slate-400 -mt-2">Search by name or paste a config UUID directly.</p>

      <div class="grid grid-cols-1 sm:grid-cols-[1fr_32px_1fr] gap-3 items-start">

        <!-- ── Panel A ── -->
        <div class="space-y-2">
          <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide">Config A</p>

          <!-- Selected chip -->
          <div v-if="selected1"
            class="flex items-start justify-between gap-2 bg-blue-50 ring-1 ring-blue-200 rounded-xl px-3 py-2.5">
            <div class="min-w-0">
              <p class="text-sm font-semibold text-slate-900 truncate">{{ selected1.name }}</p>
              <p class="text-xs text-slate-500 mt-0.5 capitalize">{{ selected1.environment }}
                <span v-if="selected1.proj_id" class="ml-1 text-slate-400">· {{ selected1.proj_id }}</span>
              </p>
              <p class="text-xs text-slate-400 mt-0.5">{{ fmtDate(selected1.date_created) }}
                · {{ selected1.entry_count }} keys</p>
              <span class="mt-1 inline-block ring-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide"
                :class="statusClass(selected1.approval_status)">{{ selected1.approval_status }}</span>
            </div>
            <button @click="clearSide(1)" class="text-slate-400 hover:text-slate-700 transition shrink-0 mt-0.5">✕</button>
          </div>

          <!-- Search input + dropdown -->
          <div v-else class="relative">
            <div class="flex items-center gap-2 ring-1 ring-slate-200 rounded-xl px-3 py-2 focus-within:ring-2 focus-within:ring-blue-500 transition bg-white">
              <span class="text-slate-400 text-sm">🔍</span>
              <input
                v-model="query1"
                @input="onInput(1)"
                @focus="() => { if (results1.length) open1 = true }"
                @blur="closeDropdown(1)"
                placeholder="Search by name or paste UUID…"
                class="flex-1 text-sm bg-transparent outline-none placeholder:text-slate-300 min-w-0"
              />
              <span v-if="loading1" class="text-slate-300 text-xs animate-pulse">searching…</span>
            </div>

            <div v-if="open1 && results1.length"
              class="absolute z-20 mt-1 w-full bg-white rounded-xl ring-1 ring-slate-200 shadow-lg overflow-hidden">
              <button
                v-for="item in results1"
                :key="item.config_relation_uuid"
                @mousedown.prevent="pickResult(1, item)"
                class="w-full text-left px-4 py-3 hover:bg-slate-50 transition border-b border-slate-50 last:border-0">
                <div class="flex items-center justify-between gap-2">
                  <span class="text-sm font-semibold text-slate-800 truncate">
                    {{ item.name || item.config_relation_uuid.slice(0, 8) }}
                  </span>
                  <span class="ring-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide shrink-0"
                    :class="statusClass(item.approval_status)">{{ item.approval_status }}</span>
                </div>
                <p class="text-xs text-slate-400 mt-0.5 capitalize">
                  {{ item.environment }}
                  <span v-if="item.proj_id" class="ml-1">· {{ item.proj_id }}</span>
                  · {{ item.entry_count }} keys · {{ fmtDate(item.date_created) }}
                </p>
              </button>
            </div>

            <div v-if="open1 && !results1.length && query1 && !loading1"
              class="absolute z-20 mt-1 w-full bg-white rounded-xl ring-1 ring-slate-200 shadow-lg px-4 py-3 text-sm text-slate-400">
              No configs found.
            </div>
          </div>
        </div>

        <!-- Divider -->
        <div class="hidden sm:flex items-center justify-center pt-8 text-slate-300 font-bold text-xl select-none">↔</div>

        <!-- ── Panel B ── -->
        <div class="space-y-2">
          <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide">Config B</p>

          <div v-if="selected2"
            class="flex items-start justify-between gap-2 bg-violet-50 ring-1 ring-violet-200 rounded-xl px-3 py-2.5">
            <div class="min-w-0">
              <p class="text-sm font-semibold text-slate-900 truncate">{{ selected2.name }}</p>
              <p class="text-xs text-slate-500 mt-0.5 capitalize">{{ selected2.environment }}
                <span v-if="selected2.proj_id" class="ml-1 text-slate-400">· {{ selected2.proj_id }}</span>
              </p>
              <p class="text-xs text-slate-400 mt-0.5">{{ fmtDate(selected2.date_created) }}
                · {{ selected2.entry_count }} keys</p>
              <span class="mt-1 inline-block ring-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide"
                :class="statusClass(selected2.approval_status)">{{ selected2.approval_status }}</span>
            </div>
            <button @click="clearSide(2)" class="text-slate-400 hover:text-slate-700 transition shrink-0 mt-0.5">✕</button>
          </div>

          <div v-else class="relative">
            <div class="flex items-center gap-2 ring-1 ring-slate-200 rounded-xl px-3 py-2 focus-within:ring-2 focus-within:ring-blue-500 transition bg-white">
              <span class="text-slate-400 text-sm">🔍</span>
              <input
                v-model="query2"
                @input="onInput(2)"
                @focus="() => { if (results2.length) open2 = true }"
                @blur="closeDropdown(2)"
                placeholder="Search by name or paste UUID…"
                class="flex-1 text-sm bg-transparent outline-none placeholder:text-slate-300 min-w-0"
              />
              <span v-if="loading2" class="text-slate-300 text-xs animate-pulse">searching…</span>
            </div>

            <div v-if="open2 && results2.length"
              class="absolute z-20 mt-1 w-full bg-white rounded-xl ring-1 ring-slate-200 shadow-lg overflow-hidden">
              <button
                v-for="item in results2"
                :key="item.config_relation_uuid"
                @mousedown.prevent="pickResult(2, item)"
                class="w-full text-left px-4 py-3 hover:bg-slate-50 transition border-b border-slate-50 last:border-0">
                <div class="flex items-center justify-between gap-2">
                  <span class="text-sm font-semibold text-slate-800 truncate">
                    {{ item.name || item.config_relation_uuid.slice(0, 8) }}
                  </span>
                  <span class="ring-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide shrink-0"
                    :class="statusClass(item.approval_status)">{{ item.approval_status }}</span>
                </div>
                <p class="text-xs text-slate-400 mt-0.5 capitalize">
                  {{ item.environment }}
                  <span v-if="item.proj_id" class="ml-1">· {{ item.proj_id }}</span>
                  · {{ item.entry_count }} keys · {{ fmtDate(item.date_created) }}
                </p>
              </button>
            </div>

            <div v-if="open2 && !results2.length && query2 && !loading2"
              class="absolute z-20 mt-1 w-full bg-white rounded-xl ring-1 ring-slate-200 shadow-lg px-4 py-3 text-sm text-slate-400">
              No configs found.
            </div>
          </div>
        </div>

      </div>

      <!-- Same UUID warning -->
      <p v-if="selected1 && selected2 && selected1.uuid === selected2.uuid"
        class="text-xs text-amber-600">Select two different configs to compare.</p>

      <button @click="runDiff" :disabled="!canCompare || loading"
        class="bg-blue-600 text-white rounded-xl px-5 py-2 text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-40">
        {{ loading ? 'Comparing…' : 'Compare' }}
      </button>
    </div>

    <!-- Error -->
    <AlertBox v-if="error">{{ error }}</AlertBox>

    <!-- Loading -->
    <div v-if="loading" class="text-center py-12 text-sm text-slate-400">Comparing configs…</div>

    <!-- Results -->
    <template v-else-if="diffRows.length > 0">

      <!-- Summary + filter -->
      <div class="flex flex-wrap items-center gap-2">
        <span v-if="counts.changed > 0"
          class="bg-yellow-50 text-yellow-700 ring-1 ring-yellow-200 text-xs font-semibold px-3 py-1.5 rounded-full">
          {{ counts.changed }} changed
        </span>
        <span v-if="counts.removed > 0"
          class="bg-red-50 text-red-700 ring-1 ring-red-200 text-xs font-semibold px-3 py-1.5 rounded-full">
          {{ counts.removed }} removed
        </span>
        <span v-if="counts.added > 0"
          class="bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 text-xs font-semibold px-3 py-1.5 rounded-full">
          {{ counts.added }} added
        </span>
        <span v-if="counts.same > 0"
          class="bg-slate-100 text-slate-500 text-xs font-semibold px-3 py-1.5 rounded-full">
          {{ counts.same }} unchanged
        </span>
        <label class="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer ml-1">
          <input type="checkbox" v-model="hideUnchanged" class="accent-blue-600" />
          Hide unchanged
        </label>
      </div>

      <!-- Diff table -->
      <div class="bg-white rounded-2xl ring-1 ring-slate-900/5 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-xs sm:text-sm min-w-[580px]">
            <thead>
              <tr class="border-b border-slate-100 bg-slate-50/60">
                <th class="px-5 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide w-[26%]">Key</th>
                <th class="px-5 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide w-[30%]">
                  <span class="text-blue-600">A</span>
                  · {{ selected1?.name }}
                  <span class="font-normal capitalize text-slate-400 ml-1">({{ selected1?.environment }})</span>
                </th>
                <th class="px-5 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide w-[30%]">
                  <span class="text-violet-600">B</span>
                  · {{ selected2?.name }}
                  <span class="font-normal capitalize text-slate-400 ml-1">({{ selected2?.environment }})</span>
                </th>
                <th class="px-5 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide w-[14%]">Status</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-50">
              <tr v-for="row in visibleRows" :key="row.nameUuid"
                :class="{
                  'border-l-4 border-yellow-400 bg-yellow-50/20':   row.category === 'changed',
                  'border-l-4 border-red-400 bg-red-50/20':         row.category === 'removed',
                  'border-l-4 border-emerald-400 bg-emerald-50/20': row.category === 'added',
                }"
                class="transition">

                <td class="px-5 py-3 font-semibold text-slate-800">{{ row.displayName }}</td>

                <td class="px-5 py-3 font-mono text-xs">
                  <template v-if="row.category === 'added'">
                    <span class="text-slate-300">—</span>
                  </template>
                  <template v-else-if="row.sensitive1">
                    <span class="text-slate-300 tracking-widest">••••••••</span>
                    <span class="ml-1.5 bg-amber-50 text-amber-700 ring-1 ring-amber-200 text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide">Sensitive</span>
                  </template>
                  <template v-else>
                    <span :class="row.category === 'changed' ? 'text-red-700' : 'text-slate-600'" class="break-all">
                      {{ row.val1 || '—' }}
                    </span>
                  </template>
                </td>

                <td class="px-5 py-3 font-mono text-xs">
                  <template v-if="row.category === 'removed'">
                    <span class="text-slate-300">—</span>
                  </template>
                  <template v-else-if="row.sensitive2">
                    <span class="text-slate-300 tracking-widest">••••••••</span>
                    <span class="ml-1.5 bg-amber-50 text-amber-700 ring-1 ring-amber-200 text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide">Sensitive</span>
                  </template>
                  <template v-else>
                    <span :class="row.category === 'changed' ? 'text-emerald-700' : 'text-slate-600'" class="break-all">
                      {{ row.val2 || '—' }}
                    </span>
                  </template>
                </td>

                <td class="px-5 py-3 whitespace-nowrap">
                  <span v-if="row.category === 'changed'"
                    class="bg-yellow-50 text-yellow-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">⚠ changed</span>
                  <span v-else-if="row.category === 'removed'"
                    class="bg-red-50 text-red-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">✕ removed</span>
                  <span v-else-if="row.category === 'added'"
                    class="bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">+ added</span>
                  <span v-else
                    class="text-slate-300 text-[10px] font-semibold uppercase tracking-wide">✓ same</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

    </template>

    <!-- Empty state -->
    <div v-else-if="!loading && !error && selected1 && selected2 && canCompare"
      class="bg-white rounded-2xl ring-1 ring-slate-900/5 p-12 text-center text-sm text-slate-400">
      Click <strong>Compare</strong> to see the diff.
    </div>

    <div v-else-if="!loading && !error && (!selected1 || !selected2)"
      class="bg-white rounded-2xl ring-1 ring-slate-900/5 p-12 text-center text-sm text-slate-400">
      Select two configs above to compare them.
    </div>

  </PageShell>
</template>
