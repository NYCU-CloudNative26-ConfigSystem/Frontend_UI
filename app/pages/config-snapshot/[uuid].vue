<script setup lang="ts">
import type { ConfigHistoryItem, ConfigReadResponse, DeployLogOut, NodeResolveResponse } from '~/composables/useApi'

definePageMeta({ middleware: 'auth' })

const api = useApi()
const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const uuid = computed(() => route.params.uuid as string)

// Context — seeded from query params, overridden with API values on mount
const projId = ref(route.query.proj as string ?? '')
const cmpId = ref(route.query.cmp as string ?? '')
const envId = ref(route.query.env as string ?? '')
const createdBy = ref(route.query.created_by as string || '')
const tmplVersion = computed(() => route.query.tmpl_v ? Number(route.query.tmpl_v) : null)
const isLatest = ref(route.query.is_latest === '1')
// approvalStatus / changeDescription from query params are initial values; replaced with API on mount.
const approvalStatus = route.query.status as string || ''
const rejectionReason = route.query.rejection_reason as string || ''
const changeDescription = ref(route.query.change_description as string || '')

// Viewer's identity and role (fetched from /me)
const myUsername = ref('')
const myRole = ref('user')
const canReview = computed(() =>
  (myRole.value === 'reviewer' || myRole.value === 'admin') &&
  myUsername.value !== createdBy.value
)

// Approval state — seeded from query params, replaced with API values on mount
const localApprovalStatus = ref(approvalStatus)
const localApprovedBy = ref<string | null>(null)
const localRejectionReason = ref(rejectionReason || null)
const approving = ref(false)
const approveError = ref('')
const rejecting = ref(false)
const rejectError = ref('')
const showRejectInput = ref(false)
const rejectReason = ref('')
const inheritEnv = ref('')
const lineageView = ref<'focus' | 'deep'>('focus')
const snapshotDetailTab = ref<'entries' | 'reviewer'>('entries')

watch(canReview, (allowed) => {
  if (!allowed && snapshotDetailTab.value === 'reviewer') snapshotDetailTab.value = 'entries'
})

const ENV_PIPELINE = ['development', 'testing', 'staging', 'production'] as const

function nextEnv(current: string): string | null {
  const idx = ENV_PIPELINE.indexOf(current as typeof ENV_PIPELINE[number])
  return idx >= 0 && idx < ENV_PIPELINE.length - 1 ? ENV_PIPELINE[idx + 1] : null
}

function formatDate(iso: string | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString()
}

// ── Snapshot data ─────────────────────────────────────────────────────────────

const config = ref<ConfigReadResponse | null>(null)
const loading = ref(true)
const loadError = ref('')

const resolvedNames = ref<Record<string, string>>({})
const resolvedValues = ref<Record<string, string>>({})
const resolvedSensitive = ref<Record<string, boolean>>({})
const revealedValues = ref(new Set<string>())

// Lineage diff state
interface DiffEntry { alias: string; type: 'changed' | 'added' | 'removed'; oldVal: string | null; newVal: string | null }
const diffEntries = ref<DiffEntry[]>([])
const diffUnchangedCount = ref(0)
const diffLoading = ref(false)
const diffError = ref('')
const sourceEnvironment = ref<string | null>(null)
const sourceApprovalStatus = ref<string | null>(null)
const sourceName = ref<string | null>(null)

// Lineage ancestors (ordered oldest -> newest, all levels)
interface LineageTreeNode extends ConfigHistoryItem { children: LineageTreeNode[] }
interface AncestorNode { uuid: string; cmp_id: string | null; environment: string; approval_status: string | null; name: string | null; branches: LineageTreeNode[] }
const ancestors = ref<AncestorNode[]>([])
const ancestorsLoaded = ref(false)

// Lineage children
const children = ref<LineageTreeNode[]>([])
const childrenLoaded = ref(false)

function toggleReveal(valRef: string) {
  const s = new Set(revealedValues.value)
  if (s.has(valRef)) s.delete(valRef)
  else s.add(valRef)
  revealedValues.value = s
}

function stripRef(r: string): string {
  return r.startsWith('VALUE:') || r.startsWith('GROUP:') ? r.slice(6) : r
}

async function resolveNodeToDisplay(nodeUuid: string, depth = 0): Promise<string> {
  if (depth > 4) return '…'
  const node = await api.ssot.resolveNode(nodeUuid, auth.token).catch(() => null)
  if (!node) return nodeUuid
  if (node.type === 'value') return String(node.val ?? '')
  if (node.type === 'name') return node.name_val ?? nodeUuid
  if (node.type === 'group') {
    if (!node.entries?.length) return node.isArray ? '[]' : '{}'
    const parts = await Promise.all(node.entries.map(async e => {
      const keyNode = await api.ssot.resolveNode(e.key, auth.token).catch(() => null)
      const keyName = keyNode?.type === 'name' ? (keyNode.name_val ?? e.key) : e.key
      const valDisplay = await resolveNodeToDisplay(stripRef(e.val), depth + 1)
      return node.isArray ? valDisplay : `${keyName}: ${valDisplay}`
    }))
    return node.isArray ? `[ ${parts.join(', ')} ]` : `{ ${parts.join(', ')} }`
  }
  return nodeUuid
}

async function resolveValDisplay(valRef: string): Promise<string> {
  const stripped = stripRef(valRef)
  const node = await api.ssot.resolveNode(stripped, auth.token).catch(() => null)
  if (!node) return valRef
  if (node.type === 'value') return node.is_sensitive ? '(sensitive)' : String(node.val ?? '')
  if (node.type === 'group') return await resolveNodeToDisplay(stripped, 0)
  return valRef
}

async function loadAncestors() {
  // Step 1: Walk the complete ancestry chain sequentially (each depends on the previous).
  const snapList: { uuid: string; data: ConfigReadResponse }[] = []
  let nextUuid: string | null | undefined = config.value?.promoted_from_uuid
  const visitedAncestors = new Set<string>()
  while (nextUuid && !visitedAncestors.has(nextUuid)) {
    visitedAncestors.add(nextUuid)
    const snap = await api.configTable.getByUuid(nextUuid, auth.token).catch(() => null)
    if (!snap) break
    snapList.unshift({ uuid: nextUuid, data: snap })
    nextUuid = snap.promoted_from_uuid
  }

  const trunkUuids = new Set([...snapList.map(s => s.uuid), uuid.value])
  const descendantVisits = new Set<string>()

  async function enrichChild(child: ConfigHistoryItem): Promise<ConfigHistoryItem> {
    if (child.name) return child
    const full = await api.configTable.getByUuid(child.config_relation_uuid, auth.token).catch(() => null)
    if (!full?.name) return child
    return { ...child, name: full.name }
  }

  async function loadDescendants(parentUuid: string): Promise<LineageTreeNode[]> {
    if (descendantVisits.has(parentUuid)) return []
    descendantVisits.add(parentUuid)
    const directChildren = await api.configTable.getConfigChildren(parentUuid, auth.token).catch(() => [])
    return await Promise.all(directChildren.map(async child => {
      const enrichedChild = await enrichChild(child)
      return {
        ...enrichedChild,
        children: trunkUuids.has(enrichedChild.config_relation_uuid)
        ? []
        : await loadDescendants(enrichedChild.config_relation_uuid),
      }
    }))
  }

  const childrenByUuid: Record<string, LineageTreeNode[]> = {}
  await Promise.all(snapList.map(async ({ uuid: u }) => {
    childrenByUuid[u] = await loadDescendants(u)
  }))

  // Step 2: Build result - branches are children that are not the next node in the trunk.
  ancestors.value = snapList.map(({ uuid: ancestorUuid, data: snap }, i) => {
    const nextInChain = i < snapList.length - 1 ? snapList[i + 1].uuid : uuid.value
    const branches = (childrenByUuid[ancestorUuid] ?? []).filter(
      c => c.config_relation_uuid !== nextInChain
    )
    return {
      uuid: ancestorUuid,
      cmp_id: snap.cmp_id ?? null,
      environment: snap.environment,
      approval_status: snap.approval_status ?? null,
      name: snap.name ?? null,
      branches,
    }
  })
  ancestorsLoaded.value = true
}

async function loadChildren() {
  const visited = new Set<string>()

  async function enrichChild(child: ConfigHistoryItem): Promise<ConfigHistoryItem> {
    if (child.name) return child
    const full = await api.configTable.getByUuid(child.config_relation_uuid, auth.token).catch(() => null)
    if (!full?.name) return child
    return { ...child, name: full.name }
  }

  async function loadDescendants(parentUuid: string): Promise<LineageTreeNode[]> {
    if (visited.has(parentUuid)) return []
    visited.add(parentUuid)
    const directChildren = await api.configTable.getConfigChildren(parentUuid, auth.token).catch(() => [])
    return await Promise.all(directChildren.map(async child => {
      const enrichedChild = await enrichChild(child)
      return {
        ...enrichedChild,
        children: await loadDescendants(enrichedChild.config_relation_uuid),
      }
    }))
  }

  children.value = await loadDescendants(uuid.value)
  childrenLoaded.value = true
}

async function loadDiff() {
  if (!config.value?.promoted_from_uuid) return
  diffLoading.value = true
  diffError.value = ''
  try {
    const source = await api.configTable.getByUuid(config.value.promoted_from_uuid, auth.token)
    sourceEnvironment.value = source?.environment ?? null
    sourceApprovalStatus.value = source?.approval_status ?? null
    sourceName.value = source?.name ?? null

    const currentMap = new Map<string, string>()
    const sourceMap = new Map<string, string>()
    for (const row of config.value.rows) currentMap.set(row.key, row.val)
    for (const row of (source?.rows ?? [])) sourceMap.set(row.key, row.val)

    const allKeys = new Set([...currentMap.keys(), ...sourceMap.keys()])
    const entries: DiffEntry[] = []
    let unchanged = 0

    for (const key of allKeys) {
      const curVal = currentMap.get(key)
      const srcVal = sourceMap.get(key)
      const nameNode = await api.ssot.resolveNode(key, auth.token).catch(() => null)
      const alias = nameNode?.name_val ?? key

      if (curVal === undefined) {
        entries.push({ alias, type: 'removed', oldVal: await resolveValDisplay(srcVal!), newVal: null })
      } else if (srcVal === undefined) {
        entries.push({ alias, type: 'added', oldVal: null, newVal: await resolveValDisplay(curVal) })
      } else if (curVal !== srcVal) {
        const [oldDisplay, newDisplay] = await Promise.all([resolveValDisplay(srcVal), resolveValDisplay(curVal)])
        entries.push({ alias, type: 'changed', oldVal: oldDisplay, newVal: newDisplay })
      } else {
        unchanged++
      }
    }

    diffEntries.value = entries
    diffUnchangedCount.value = unchanged
  } catch (e: unknown) {
    diffError.value = e instanceof Error ? e.message : 'Failed to load diff'
  } finally {
    diffLoading.value = false
  }
}

async function resolveRows(cfg: ConfigReadResponse) {
  resolvedNames.value = {}
  resolvedValues.value = {}
  resolvedSensitive.value = {}
  await Promise.all(cfg.rows.flatMap(row => [
    api.ssot.resolveNode(row.key, auth.token)
      .then(n => { if (n?.type === 'name') resolvedNames.value[row.key] = n.name_val ?? row.key })
      .catch(() => {}),
    (async () => {
      const stripped = stripRef(row.val)
      const n = await api.ssot.resolveNode(stripped, auth.token).catch(() => null)
      if (n?.type === 'value') {
        resolvedValues.value[row.val] = String(n.val ?? '')
        resolvedSensitive.value[row.val] = n.is_sensitive ?? false
      }
      else if (n?.type === 'group') resolvedValues.value[row.val] = await resolveNodeToDisplay(stripped, 0)
    })(),
  ]))
}

onMounted(async () => {
  loading.value = true
  loadError.value = ''
  try {
    const [cfg, me] = await Promise.all([
      api.configTable.getByUuid(uuid.value, auth.token),
      api.auth.me(auth.token).catch(() => ({ username: '', role: 'user', email: '', full_name: '', company: '' })),
    ])
    config.value = cfg
    myUsername.value = me.username
    myRole.value = me.role
    // Override query-param values with the authoritative API response
    if (cfg.approval_status != null) localApprovalStatus.value = cfg.approval_status
    if (cfg.approved_by != null) localApprovedBy.value = cfg.approved_by
    if (cfg.rejection_reason != null) localRejectionReason.value = cfg.rejection_reason
    if (cfg.created_by != null) createdBy.value = cfg.created_by
    if (cfg.is_latest != null) isLatest.value = cfg.is_latest
    if (cfg.change_description != null) changeDescription.value = cfg.change_description
    if (cfg.proj_id) projId.value = cfg.proj_id
    if (cfg.cmp_id) cmpId.value = cfg.cmp_id
    if (cfg.environment) envId.value = cfg.environment
    inheritEnv.value = cfg.environment ?? 'production'
    await resolveRows(config.value)
    loadAncestors()
    if (config.value.promoted_from_uuid) loadDiff()
    loadChildren().catch(() => { childrenLoaded.value = true })
    loadDeployHistory()
  } catch (e: unknown) {
    loadError.value = e instanceof Error ? e.message : 'Failed to load snapshot'
  } finally {
    loading.value = false
  }
})

// ── Approve / Reject ──────────────────────────────────────────────────────────

async function approveConfig() {
  approveError.value = ''
  approving.value = true
  try {
    const res = await api.configTable.approve(uuid.value, auth.token)
    localApprovalStatus.value = res.approval_status
    localApprovedBy.value = res.approved_by
  } catch (e: unknown) {
    approveError.value = e instanceof Error ? e.message : 'Approve failed'
  } finally {
    approving.value = false
  }
}

async function rejectConfig() {
  rejectError.value = ''
  rejecting.value = true
  try {
    const res = await api.configTable.reject(uuid.value, rejectReason.value || null, auth.token)
    localApprovalStatus.value = res.approval_status
    localRejectionReason.value = res.rejection_reason
    showRejectInput.value = false
  } catch (e: unknown) {
    rejectError.value = e instanceof Error ? e.message : 'Reject failed'
  } finally {
    rejecting.value = false
  }
}

// ── Deploy ────────────────────────────────────────────────────────────────────

const deploying = ref(false)
const deploySuccess = ref('')
const deployError = ref('')
const deployFormat = ref<'env' | 'json' | 'yaml' | 'xml' | 'properties'>('env')
const showDeployModal = ref(false)
const deployReason = ref('')
const deployHistory = ref<DeployLogOut[]>([])

async function loadDeployHistory() {
  if (!projId.value || !cmpId.value) return
  try {
    deployHistory.value = await api.export.deployHistory(projId.value, cmpId.value, auth.token)
  } catch {
    // non-blocking — history is best-effort
  }
}

async function deployConfig() {
  deploying.value = true
  deploySuccess.value = ''
  deployError.value = ''
  showDeployModal.value = false
  try {
    await api.export.deploy(uuid.value, {
      proj_id: projId.value,
      cmp_id: cmpId.value,
      environment: config.value!.environment,
      format: deployFormat.value,
      reason: deployReason.value,
      snapshot_name: config.value?.name || '',
    }, auth.token)
    deploySuccess.value = 'Deployment triggered!'
    deployReason.value = ''
    await loadDeployHistory()
  } catch (e: unknown) {
    deployError.value = e instanceof Error ? e.message : 'Deploy failed. Check GitHub Actions.'
  } finally {
    deploying.value = false
  }
}

// ── Promote ───────────────────────────────────────────────────────────────────

const promoting = ref(false)
const promoteError = ref('')
const promoteSuccess = ref('')

const targetEnv = computed(() => nextEnv(envId.value))

async function promoteConfig() {
  if (!targetEnv.value) return
  if (!confirm(`Promote this snapshot from ${envId.value} → ${targetEnv.value}?\n\nThis will create a new latest config in ${targetEnv.value}.`)) return
  promoting.value = true
  promoteError.value = ''
  promoteSuccess.value = ''
  try {
    await api.configTable.promoteByUuid(uuid.value, targetEnv.value, auth.token)
    promoteSuccess.value = `Promoted to ${targetEnv.value}`
    // Navigate to the target environment's history
    setTimeout(() => {
      router.push({ path: '/config', query: { proj: projId.value, cmp: cmpId.value, env: targetEnv.value } })
    }, 800)
  } catch (e: unknown) {
    promoteError.value = e instanceof Error ? e.message : 'Promote failed'
  } finally {
    promoting.value = false
  }
}

// ── Node resolve modal ────────────────────────────────────────────────────────

interface ModalResolvedEntry { key: string; val: string; keyName: string; valDisplay: string }
const modal = ref<{
  uuid: string
  data: NodeResolveResponse | null
  loading: boolean
  error: string
  resolvedEntries: ModalResolvedEntry[]
} | null>(null)

async function openModal(rawUuid: string) {
  const nodeUuid = stripRef(rawUuid)
  modal.value = { uuid: nodeUuid, data: null, loading: true, error: '', resolvedEntries: [] }
  try {
    const result = await api.ssot.resolveNode(nodeUuid, auth.token)
    if (modal.value) modal.value.data = result
    if (result?.type === 'group' && result.entries?.length && modal.value) {
      modal.value.resolvedEntries = await Promise.all(result.entries.map(async e => {
        const keyNode = await api.ssot.resolveNode(e.key, auth.token).catch(() => null)
        const keyName = keyNode?.type === 'name' ? (keyNode.name_val ?? e.key) : e.key
        const valDisplay = await resolveNodeToDisplay(stripRef(e.val), 0)
        return { key: e.key, val: e.val, keyName, valDisplay }
      }))
    }
  } catch (e: unknown) {
    if (modal.value) modal.value.error = e instanceof Error ? e.message : 'Failed to resolve node'
  } finally {
    if (modal.value) modal.value.loading = false
  }
}

function closeModal() { modal.value = null }

const onKeydown = (e: KeyboardEvent) => { if (e.key === 'Escape') closeModal() }
onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="min-h-screen bg-slate-50">

    <!-- Nav -->
    <AppNav>
      <button
        @click="router.push({ path: '/config', query: { proj: projId, cmp: cmpId, env: envId } })"
        class="text-slate-400 hover:text-slate-700 transition shrink-0 capitalize hidden sm:inline">
        {{ envId || 'Config' }}
      </button>
      <span class="text-slate-200 shrink-0 hidden sm:inline select-none">›</span>
      <span class="font-semibold text-slate-900 truncate font-mono text-xs">{{ uuid }}</span>
    </AppNav>

    <div class="max-w-3xl lg:max-w-4xl xl:max-w-5xl mx-auto px-4 sm:px-6 py-6 pb-16 space-y-4">

      <!-- Back button -->
      <div>
        <button
          @click="router.push({ path: '/config', query: { proj: projId, cmp: cmpId, env: envId } })"
          class="text-sm text-slate-400 hover:text-slate-700 transition">
          ← Back to {{ envId || 'history' }}
        </button>
      </div>

      <!-- Loading / error -->
      <div v-if="loading" class="text-center py-12 text-sm text-slate-400">Loading snapshot…</div>
      <AlertBox v-else-if="loadError" :large="true">{{ loadError }}</AlertBox>

      <template v-else-if="config">

        <!-- Metadata card -->
        <div class="bg-white rounded-2xl ring-1 ring-slate-900/5 overflow-hidden">
          <div class="px-5 py-4 border-b border-slate-50 flex items-start justify-between gap-4">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2 mb-1">
                <StatusBadge :status="localApprovalStatus" :is-latest="isLatest" />
                <span class="font-semibold text-slate-900 text-sm capitalize">{{ config.environment }}</span>
                <span v-if="tmplVersion != null"
                  class="bg-slate-100 text-slate-500 text-xs font-medium px-2 py-0.5 rounded-full">
                  Template v{{ tmplVersion }}
                </span>
              </div>
              <h2 class="text-lg font-semibold text-slate-900 truncate">
                {{ config.name || uuid.slice(0, 8) }}
              </h2>
              <p class="text-xs text-slate-400 font-mono break-all">{{ uuid }}</p>
            </div>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-0 divide-y sm:divide-y-0 sm:divide-x divide-slate-50">
            <div class="px-5 py-4">
              <p class="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Created</p>
              <p class="text-sm text-slate-700">{{ formatDate(config.date_created) }}</p>
            </div>
            <div class="px-5 py-4">
              <p class="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Created by</p>
              <p class="text-sm text-slate-700">{{ createdBy ?? 'unknown' }}</p>
            </div>
          </div>
          <div class="border-t border-slate-50 px-5 py-4">
            <p class="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Entries</p>
            <p class="text-sm text-slate-700">{{ config.rows.length }} {{ config.rows.length === 1 ? 'entry' : 'entries' }}</p>
          </div>
          <div v-if="changeDescription" class="border-t border-slate-50 px-5 py-4">
            <p class="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Reason for change</p>
            <p class="text-sm text-slate-700 whitespace-pre-wrap">{{ changeDescription }}</p>
          </div>
          <div v-if="config.promoted_from_uuid" class="border-t border-slate-50 px-5 py-4">
            <p class="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Derived from</p>
            <NuxtLink
              :to="`/config-snapshot/${config.promoted_from_uuid}?proj=${projId}&cmp=${cmpId}&env=${sourceEnvironment ?? ''}`"
              class="group inline-flex max-w-full items-start gap-2 text-blue-600 transition hover:text-blue-700">
              <span class="min-w-0">
                <span class="block truncate text-sm font-semibold">{{ sourceName || config.promoted_from_uuid.slice(0, 8) }}</span>
                <span class="block text-xs text-slate-400">
                  <span v-if="sourceEnvironment" class="capitalize">{{ sourceEnvironment }}</span>
                  <span v-if="sourceEnvironment"> · </span>
                  <span class="font-mono break-all">{{ config.promoted_from_uuid }}</span>
                </span>
              </span>
              <span class="pt-0.5 transition group-hover:translate-x-0.5">→</span>
            </NuxtLink>
          </div>
        </div>

        <!-- Snapshot detail tabs -->
        <div class="bg-white rounded-2xl ring-1 ring-slate-900/5 overflow-hidden">
          <div class="border-b border-slate-50 px-5 py-3">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h3 class="text-sm font-semibold text-slate-900">Snapshot details</h3>
              <div class="flex w-full gap-0.5 overflow-x-auto rounded-lg bg-slate-100 p-0.5 sm:w-auto">
                <button
                  @click="snapshotDetailTab = 'entries'"
                  :class="['flex-1 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition sm:flex-none', snapshotDetailTab === 'entries' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-400 hover:text-slate-600']">
                  Config Entries
                  <span class="ml-1 text-[10px] text-slate-400">{{ config.rows.length }}</span>
                </button>
                <button
                  v-if="canReview"
                  @click="snapshotDetailTab = 'reviewer'"
                  :class="['flex-1 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition sm:flex-none', snapshotDetailTab === 'reviewer' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-400 hover:text-slate-600']">
                  Similarity
                </button>
              </div>
            </div>
          </div>

          <template v-if="snapshotDetailTab === 'entries'">
            <div v-if="config.rows.length === 0" class="px-5 py-8 text-center text-sm text-slate-400">
              No entries in this snapshot.
            </div>
            <div v-else class="overflow-x-auto">
              <table class="w-full min-w-[520px] text-xs sm:text-sm">
                <thead>
                  <tr class="text-left border-b border-slate-50">
                    <th class="px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide w-1/2">Key</th>
                    <th class="px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide w-1/2">Value</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-50">
                  <tr v-for="row in config.rows" :key="row.uuid" class="hover:bg-slate-50/50 transition">
                    <td class="px-5 py-3">
                      <button @click="openModal(row.key)"
                        class="font-semibold text-slate-800 hover:text-blue-600 transition text-left">
                        {{ resolvedNames[row.key] ?? '…' }}
                      </button>
                    </td>
                    <td class="px-5 py-3">
                      <div v-if="resolvedSensitive[row.val]" class="flex items-center gap-2 flex-wrap">
                        <span v-if="!revealedValues.has(row.val)"
                          class="font-mono text-xs text-slate-300 tracking-widest select-none">••••••••</span>
                        <button v-else @click="openModal(row.val)"
                          class="text-slate-600 hover:text-blue-600 transition text-left font-mono text-xs break-all">
                          {{ resolvedValues[row.val] ?? '…' }}
                        </button>
                        <span class="bg-amber-50 text-amber-700 ring-1 ring-amber-200 text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide shrink-0">Sensitive</span>
                        <button v-if="canReview"
                          @click="toggleReveal(row.val)"
                          class="text-xs font-medium text-slate-400 hover:text-slate-700 transition underline shrink-0">
                          {{ revealedValues.has(row.val) ? 'Hide' : 'Reveal' }}
                        </button>
                      </div>
                      <button v-else @click="openModal(row.val)"
                        class="text-slate-600 hover:text-blue-600 transition text-left font-mono text-xs break-all">
                        {{ resolvedValues[row.val] ?? '…' }}
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>

          <div v-else-if="canReview" class="p-0">
            <ReviewerSimilarityReport :config-uuid="uuid" :compact="true" :limit="4" :embedded="true" />
          </div>
        </div>

        <!-- Lineage timeline (horizontal — left→right) -->
        <div class="bg-white rounded-2xl ring-1 ring-slate-900/5 px-5 py-5">
          <!-- Header + Focus / Deep toggle -->
          <div class="flex items-center justify-between mb-5">
            <h3 class="text-sm font-semibold text-slate-900">Lineage</h3>
            <div class="flex items-center gap-0.5 rounded-lg bg-slate-100 p-0.5">
              <button
                @click="lineageView = 'focus'"
                :class="['px-2.5 py-1 rounded-md text-xs font-medium transition', lineageView === 'focus' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-400 hover:text-slate-600']">
                Focus
              </button>
              <button
                @click="lineageView = 'deep'"
                :class="['px-2.5 py-1 rounded-md text-xs font-medium transition', lineageView === 'deep' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-400 hover:text-slate-600']">
                Deep
              </button>
            </div>
          </div>

          <LineageGraph
            :view="lineageView"
            :ancestors="ancestors"
            :ancestors-loaded="ancestorsLoaded"
            :children="children"
            :children-loaded="childrenLoaded"
            :current="{
              uuid,
              environment: config.environment,
              approval_status: localApprovalStatus,
              name: config.name ?? null,
            }"
            :proj-id="projId"
            :cmp-id="cmpId"
          />
        </div>

        <!-- Approval card -->
        <div class="bg-white rounded-2xl ring-1 ring-slate-900/5 overflow-hidden">
          <div class="px-5 py-4 border-b border-slate-50">
            <h3 class="font-semibold text-slate-900 text-sm">Review</h3>
          </div>

          <!-- Pending + can review -->
          <template v-if="localApprovalStatus === 'pending' && canReview">
            <div class="px-5 py-4 space-y-3">
              <p class="text-sm text-slate-600">This snapshot is awaiting approval. As a <span class="font-semibold capitalize">{{ myRole }}</span>, you can edit, approve, or reject it.</p>
              <div class="flex flex-wrap gap-2">
                <button
                  @click="router.push({ path: '/config', query: { proj: projId, cmp: cmpId, env: config.environment, editPending: uuid } })"
                  class="rounded-xl px-5 py-2 text-sm font-semibold ring-1 ring-blue-200 text-blue-600 hover:bg-blue-50 transition">
                  Edit
                </button>
                <button
                  @click="approveConfig"
                  :disabled="approving"
                  class="rounded-xl px-5 py-2 text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition disabled:opacity-40">
                  {{ approving ? 'Approving…' : 'Approve' }}
                </button>
                <button
                  @click="showRejectInput = !showRejectInput"
                  :disabled="rejecting"
                  class="rounded-xl px-5 py-2 text-sm font-semibold ring-1 ring-red-200 text-red-600 hover:bg-red-50 transition disabled:opacity-40">
                  Reject
                </button>
              </div>
              <div v-if="showRejectInput" class="space-y-2">
                <textarea
                  v-model="rejectReason"
                  placeholder="Reason (optional)"
                  rows="2"
                  class="w-full ring-1 ring-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-400 transition resize-none" />
                <button
                  @click="rejectConfig"
                  :disabled="rejecting"
                  class="rounded-xl px-5 py-2 text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition disabled:opacity-40">
                  {{ rejecting ? 'Rejecting…' : 'Confirm Reject' }}
                </button>
              </div>
              <div v-if="approveError" class="text-sm text-red-600 bg-red-50 ring-1 ring-red-200 rounded-xl px-3 py-2">{{ approveError }}</div>
              <div v-if="rejectError" class="text-sm text-red-600 bg-red-50 ring-1 ring-red-200 rounded-xl px-3 py-2">{{ rejectError }}</div>
            </div>
          </template>

          <!-- Pending + cannot review -->
          <template v-else-if="localApprovalStatus === 'pending'">
            <div class="px-5 py-4">
              <p v-if="myRole === 'user'" class="text-sm text-slate-500">
                Awaiting approval from a reviewer or admin.
              </p>
              <p v-else class="text-sm text-slate-500">
                You submitted this snapshot and cannot approve your own work.
              </p>
            </div>
          </template>

          <!-- Approved -->
          <template v-else-if="localApprovalStatus === 'approved'">
            <div class="px-5 py-4 flex items-center gap-3">
              <span class="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 text-xs font-bold shrink-0">✓</span>
              <div>
                <p class="text-sm font-semibold text-emerald-700">Approved</p>
                <p v-if="localApprovedBy" class="text-xs text-slate-400 mt-0.5">by {{ localApprovedBy }}</p>
              </div>
            </div>
          </template>

          <!-- Rejected -->
          <template v-else-if="localApprovalStatus === 'rejected'">
            <div class="px-5 py-4 space-y-2">
              <div class="flex items-center gap-3">
                <span class="w-7 h-7 rounded-full bg-red-100 flex items-center justify-center text-red-600 text-xs font-bold shrink-0">✗</span>
                <p class="text-sm font-semibold text-red-700">Rejected</p>
              </div>
              <p v-if="localRejectionReason" class="text-sm text-slate-600 bg-red-50 ring-1 ring-red-100 rounded-xl px-3 py-2">
                {{ localRejectionReason }}
              </p>
            </div>
          </template>
        </div>

        <!-- Lineage diff -->
        <div v-if="config.promoted_from_uuid" class="bg-white rounded-2xl ring-1 ring-slate-900/5 overflow-hidden">
          <div class="px-5 py-4 border-b border-slate-50 flex items-center justify-between gap-4">
            <h3 class="font-semibold text-slate-900 text-sm">Changes from source</h3>
            <NuxtLink v-if="sourceEnvironment"
              :to="`/config-snapshot/${config.promoted_from_uuid}?proj=${projId}&cmp=${cmpId}&env=${sourceEnvironment}`"
              class="text-xs font-medium text-blue-600 hover:text-blue-700 transition capitalize shrink-0">
              ← {{ sourceEnvironment }} snapshot
            </NuxtLink>
          </div>
          <div v-if="diffLoading" class="px-5 py-6 text-sm text-slate-400 text-center">Loading diff…</div>
          <div v-else-if="diffError" class="px-5 py-4 text-sm text-red-600">{{ diffError }}</div>
          <div v-else>
            <div v-if="diffEntries.length === 0"
              class="px-5 py-4 text-sm text-slate-500">
              No changes — {{ diffUnchangedCount }} {{ diffUnchangedCount === 1 ? 'key' : 'keys' }} unchanged.
            </div>
            <div v-else class="overflow-x-auto">
              <table class="w-full text-xs sm:text-sm">
                <thead>
                  <tr class="text-left border-b border-slate-50">
                    <th class="px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Key</th>
                    <th class="px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Old value</th>
                    <th class="px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">New value</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-50">
                  <tr v-for="entry in diffEntries" :key="entry.alias" class="hover:bg-slate-50/50">
                    <td class="px-5 py-3 font-semibold text-slate-800">{{ entry.alias }}</td>
                    <td class="px-5 py-3 font-mono text-xs text-slate-500">
                      <span v-if="entry.oldVal !== null">{{ entry.oldVal }}</span>
                      <span v-else class="text-slate-300 italic">—</span>
                    </td>
                    <td class="px-5 py-3 font-mono text-xs">
                      <span v-if="entry.type === 'removed'" class="text-red-500 italic">removed</span>
                      <span v-else-if="entry.newVal !== null" :class="{
                        'text-emerald-600': entry.type === 'added',
                        'text-blue-600': entry.type === 'changed',
                      }">{{ entry.newVal }}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
              <div v-if="diffUnchangedCount > 0" class="px-5 py-3 text-xs text-slate-400 border-t border-slate-50">
                {{ diffUnchangedCount }} {{ diffUnchangedCount === 1 ? 'key' : 'keys' }} unchanged
              </div>
            </div>
          </div>
        </div>

        <!-- Edit action (approved snapshots only) -->
        <div v-if="localApprovalStatus === 'approved'" class="bg-white rounded-2xl ring-1 ring-slate-900/5 px-5 py-5">
          <div class="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h3 class="font-semibold text-slate-900 text-sm">Edit config</h3>
              <p class="text-xs text-slate-400 mt-0.5">Pre-populate the editor with this snapshot's values</p>
            </div>
            <button
              @click="router.push({ path: '/config', query: { proj: projId, cmp: cmpId, env: config.environment, from: uuid } })"
              class="rounded-xl px-5 py-2.5 text-xs sm:text-sm font-semibold ring-1 ring-blue-200 text-blue-600 hover:bg-blue-50 transition shrink-0">
              Edit
            </button>
          </div>
        </div>

        <!-- Deploy action (approved snapshots only) -->
        <div v-if="localApprovalStatus === 'approved'" class="bg-white rounded-2xl ring-1 ring-slate-900/5 px-5 py-5">
          <div class="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h3 class="font-semibold text-slate-900 text-sm">Deploy config</h3>
              <p class="text-xs text-slate-400 mt-0.5">Push this snapshot to the live environment via CI/CD</p>
            </div>
            <button
              @click="showDeployModal = true"
              :disabled="deploying || !!deploySuccess"
              class="rounded-xl px-5 py-2.5 text-xs sm:text-sm font-semibold transition shrink-0"
              :class="deploySuccess
                ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                : 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40'">
              {{ deploySuccess ? deploySuccess : deploying ? 'Deploying…' : '🚀 Deploy' }}
            </button>
          </div>
          <div class="mt-3 flex flex-wrap gap-1.5">
            <button
              v-for="fmt in ['env', 'json', 'yaml', 'xml', 'properties']"
              :key="fmt"
              @click="deployFormat = (fmt as typeof deployFormat.value)"
              :disabled="deploying || !!deploySuccess"
              :class="['px-2.5 py-1 rounded-lg text-xs font-mono font-medium transition',
                deployFormat === fmt
                  ? 'bg-indigo-100 text-indigo-700 ring-1 ring-indigo-200'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200 disabled:opacity-40']">
              .{{ fmt }}
            </button>
          </div>
          <div v-if="deployError" class="mt-3 text-sm text-red-600 bg-red-50 ring-1 ring-red-200 rounded-xl px-3 py-2">
            {{ deployError }}
          </div>
        </div>

        <!-- Deploy history -->
        <!-- <div v-if="deployHistory.length > 0" class="bg-white rounded-2xl ring-1 ring-slate-900/5 px-5 py-5">
          <h3 class="font-semibold text-slate-900 text-sm mb-3">Deploy history</h3>
          <div class="overflow-x-auto">
            <table class="w-full text-xs">
              <thead>
                <tr class="text-slate-400 text-left border-b border-slate-100">
                  <th class="pb-2 pr-3 font-medium">When</th>
                  <th class="pb-2 pr-3 font-medium">Env</th>
                  <th class="pb-2 pr-3 font-medium">Version</th>
                  <th class="pb-2 pr-3 font-medium">Format</th>
                  <th class="pb-2 pr-3 font-medium">Reason</th>
                  <th class="pb-2 pr-3 font-medium">By</th>
                  <th class="pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-50">
                <tr v-for="log in deployHistory" :key="log.id" class="text-slate-600">
                  <td class="py-2 pr-3 text-slate-400 whitespace-nowrap">{{ new Date(log.deployed_at).toLocaleString() }}</td>
                  <td class="py-2 pr-3 capitalize">{{ log.environment }}</td>
                  <td class="py-2 pr-3 font-mono text-slate-500">{{ log.snapshot_name || log.version_uuid.slice(0, 8) }}</td>
                  <td class="py-2 pr-3 font-mono">{{ log.format }}</td>
                  <td class="py-2 pr-3 max-w-[180px] truncate" :title="log.reason">{{ log.reason }}</td>
                  <td class="py-2 pr-3">{{ log.deployed_by }}</td>
                  <td class="py-2">
                    <span :class="['px-2 py-0.5 rounded-full font-semibold',
                      log.status === 'triggered' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600']">
                      {{ log.status }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div> -->

        <!-- Inherit action (all snapshots) -->
        <div class="bg-white rounded-2xl ring-1 ring-slate-900/5 px-5 py-5">
          <div class="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h3 class="font-semibold text-slate-900 text-sm">Inherit config</h3>
              <p class="text-xs text-slate-400 mt-0.5">Start a new snapshot pre-filled from this one</p>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <select v-model="inheritEnv"
                class="rounded-xl ring-1 ring-slate-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="development">Development</option>
                <option value="testing">Testing</option>
                <option value="staging">Staging</option>
                <option value="production">Production</option>
              </select>
              <button
                @click="router.push({ path: '/config', query: { proj: projId, cmp: cmpId, env: inheritEnv, from: uuid } })"
                class="rounded-xl px-5 py-2.5 text-xs sm:text-sm font-semibold ring-1 ring-indigo-200 text-indigo-600 hover:bg-indigo-50 transition">
                Inherit
              </button>
            </div>
          </div>
        </div>

        <!-- Promote action -->
        <div v-if="targetEnv" class="bg-white rounded-2xl ring-1 ring-slate-900/5 px-5 py-5">
          <div class="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h3 class="font-semibold text-slate-900 text-sm">Promote snapshot</h3>
              <p class="text-xs text-slate-400 mt-0.5 capitalize">
                Copy this config to <span class="font-semibold text-slate-600">{{ targetEnv }}</span>
              </p>
            </div>
            <button
              @click="promoteConfig"
              :disabled="promoting || !!promoteSuccess"
              class="rounded-xl px-5 py-2.5 text-xs sm:text-sm font-semibold transition shrink-0"
              :class="promoteSuccess
                ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                : 'bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40'">
              {{ promoteSuccess ? promoteSuccess : promoting ? 'Promoting…' : `↑ Promote to ${targetEnv}` }}
            </button>
          </div>
          <div v-if="promoteError" class="mt-3 text-sm text-red-600 bg-red-50 ring-1 ring-red-200 rounded-xl px-3 py-2">
            {{ promoteError }}
          </div>
        </div>

        <div v-else class="text-xs text-slate-400 text-center py-2">
          Production environment — no further promotion available.
        </div>

      </template>
    </div>

    <!-- Deploy confirmation modal -->
    <AppModal v-model="showDeployModal" title="Confirm deployment" :subtitle="`Snapshot ${uuid.slice(0, 8)} → ${config?.environment ?? ''}`">
      <div class="space-y-3 px-5 py-4">
        <label class="block text-sm font-medium text-slate-700">Reason for deploying <span class="text-red-500">*</span></label>
        <textarea
          v-model="deployReason"
          rows="3"
          placeholder="e.g. Hotfix for missing API key in production…"
          class="w-full rounded-xl ring-1 ring-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
        />
        <p class="text-xs text-slate-400">Format: <span class="font-mono">.{{ deployFormat }}</span></p>
      </div>
      <template #footer>
        <div class="flex items-center justify-end gap-2">
          <button
            @click="showDeployModal = false"
            class="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 transition">
            Cancel
          </button>
          <button
            @click="deployConfig"
            :disabled="!deployReason.trim() || deploying"
            class="rounded-xl px-5 py-2 text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 transition">
            {{ deploying ? 'Deploying…' : '🚀 Deploy' }}
          </button>
        </div>
      </template>
    </AppModal>

    <!-- Node resolve modal -->
    <Teleport to="body">
      <div v-if="modal" class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" @click="closeModal" />
        <div class="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-4 sm:p-6 space-y-4">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <h3 v-if="modal.data?.type === 'name'" class="font-semibold text-slate-900 text-lg">{{ modal.data.name_val }}</h3>
              <h3 v-else-if="modal.data?.type === 'value'" class="font-semibold text-slate-900 text-lg font-mono">{{ modal.data.val }}</h3>
              <h3 v-else-if="modal.data?.type === 'group'" class="font-semibold text-slate-900 text-lg font-mono">{{ modal.data.isArray ? '[ ]' : '{ }' }}</h3>
              <h3 v-else class="font-semibold text-slate-900">Node Detail</h3>
              <p class="font-mono text-xs text-slate-400 break-all mt-1">{{ modal.uuid }}</p>
            </div>
            <button @click="closeModal"
              class="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition shrink-0 text-lg leading-none">×</button>
          </div>
          <div v-if="modal.loading" class="text-sm text-slate-400">Resolving…</div>
          <div v-else-if="modal.error" class="text-sm text-red-600">{{ modal.error }}</div>
          <div v-else-if="modal.data" class="space-y-3 text-sm">
            <div class="flex items-center gap-2">
              <span class="text-slate-400 text-xs font-semibold uppercase tracking-wide w-14 shrink-0">Type</span>
              <span class="font-semibold capitalize text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md text-xs">{{ modal.data.type }}</span>
            </div>
            <template v-if="modal.data.type === 'group'">
              <div class="flex items-center gap-2">
                <span class="text-slate-400 text-xs font-semibold uppercase tracking-wide w-14 shrink-0">Kind</span>
                <span class="font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md text-xs">{{ modal.data.isArray ? 'Array' : 'Object' }}</span>
              </div>
              <div v-if="modal.resolvedEntries.length > 0" class="space-y-1.5">
                <p class="text-xs font-semibold text-slate-400 uppercase tracking-wide">Entries</p>
                <div v-for="entry in modal.resolvedEntries" :key="entry.key"
                  class="flex items-center gap-2 bg-slate-50 ring-1 ring-slate-100 rounded-xl px-3 py-2">
                  <span class="font-semibold text-slate-700 shrink-0 text-sm">{{ entry.keyName }}</span>
                  <span class="text-slate-300">→</span>
                  <button @click="openModal(entry.val)"
                    class="text-slate-600 hover:text-blue-600 transition text-left break-all font-mono text-xs flex-1 min-w-0">
                    {{ entry.valDisplay }}
                  </button>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>
    </Teleport>

  </div>
</template>
