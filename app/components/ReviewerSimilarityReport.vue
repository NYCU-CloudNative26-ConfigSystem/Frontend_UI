<script setup lang="ts">
import type { ReviewSimilarityReport } from '~/composables/useApi'

const props = withDefaults(defineProps<{
  configUuid: string
  compact?: boolean
  limit?: number
}>(), {
  compact: false,
  limit: 5,
})

const api = useApi()
const auth = useAuthStore()
const router = useRouter()

const report = ref<ReviewSimilarityReport | null>(null)
const loading = ref(false)
const error = ref('')
const sourceExpanded = ref(false)
const expandedCandidates = ref<Record<string, boolean>>({})
const expandedHidden = ref<Record<string, boolean>>({})

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function openCandidate(uuid: string) {
  router.push(`/config-snapshot/${uuid}`)
}

function openFullReport() {
  router.push(`/reviewer-report/${props.configUuid}`)
}

function candidateExpanded(uuid: string) {
  return expandedCandidates.value[uuid] ?? false
}

function hiddenExpanded(uuid: string) {
  return expandedHidden.value[uuid] ?? false
}

function toggleCandidate(uuid: string) {
  expandedCandidates.value = { ...expandedCandidates.value, [uuid]: !candidateExpanded(uuid) }
}

function toggleHidden(uuid: string) {
  expandedHidden.value = { ...expandedHidden.value, [uuid]: !hiddenExpanded(uuid) }
}

function sameValueMatches(matches: ReviewSimilarityReport['candidates'][number]['matched_entries']) {
  return matches.filter(match => match.display_state === 'shown' && match.display_reason === 'same_value')
}

function similarKeyMatches(matches: ReviewSimilarityReport['candidates'][number]['matched_entries']) {
  return matches.filter(match => match.display_state === 'shown' && match.display_reason === 'similar_key')
}

function hiddenMatches(matches: ReviewSimilarityReport['candidates'][number]['matched_entries']) {
  return matches.filter(match => match.display_state === 'hidden')
}

async function loadReport() {
  if (!props.configUuid) {
    report.value = null
    return
  }

  loading.value = true
  error.value = ''
  try {
    report.value = await api.configTable.reviewSimilarityReport(props.configUuid, auth.token, {
      limit: props.limit,
      threshold: props.compact ? 0.5 : 0.42,
    })
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Failed to load similarity report'
    report.value = null
  } finally {
    loading.value = false
  }
}

watch(() => [props.configUuid, props.limit, props.compact], loadReport, { immediate: true })

const visibleCandidates = computed(() => report.value?.candidates ?? [])
const visibleSourceEntries = computed(() => {
  if (!report.value) return []
  return props.compact ? report.value.source_entries.slice(0, 4) : report.value.source_entries
})
</script>

<template>
  <details class="bg-white rounded-2xl ring-1 ring-slate-900/5 overflow-hidden" open>
    <summary class="list-none px-5 py-4 border-b border-slate-50 flex flex-wrap items-center justify-between gap-3 cursor-pointer">
      <div>
        <h3 class="font-semibold text-slate-900 text-sm">Reviewer similarity report</h3>
        <p class="text-xs text-slate-400 mt-0.5">Finds nearby configs and highlights similar key/value pairs.</p>
      </div>
      <div class="flex items-center gap-2">
        <button
          v-if="compact && report"
          @click.stop="openFullReport"
          class="rounded-xl px-3 py-2 text-xs font-semibold ring-1 ring-slate-200 text-slate-600 hover:bg-slate-50 transition">
          Open full report
        </button>
        <span v-if="report" class="text-xs text-slate-400">{{ report.candidate_count }} matches</span>
      </div>
    </summary>

    <div v-if="loading" class="px-5 py-8 text-center text-sm text-slate-400">
      Loading similarity report…
    </div>

    <AlertBox v-else-if="error" :large="false" class="m-4">
      {{ error }}
    </AlertBox>

    <div v-else-if="report" class="space-y-4 p-5">
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div class="rounded-2xl bg-slate-50 ring-1 ring-slate-200 px-4 py-3">
          <p class="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Source entries</p>
          <p class="mt-1 text-lg font-semibold text-slate-900">{{ report.source_entry_count }}</p>
        </div>
        <div class="rounded-2xl bg-slate-50 ring-1 ring-slate-200 px-4 py-3">
          <p class="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Similar configs</p>
          <p class="mt-1 text-lg font-semibold text-slate-900">{{ report.candidate_count }}</p>
        </div>
        <div class="rounded-2xl bg-slate-50 ring-1 ring-slate-200 px-4 py-3">
          <p class="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Context</p>
          <p class="mt-1 text-sm font-semibold text-slate-700 capitalize">{{ report.environment }}</p>
          <p class="text-xs text-slate-400">{{ report.approval_status }}</p>
        </div>
      </div>

      <div class="space-y-3">
        <div class="flex items-center justify-between gap-3">
          <h4 class="text-xs font-semibold text-slate-400 uppercase tracking-wide">Source items</h4>
          <button
            v-if="report.source_entries.length > visibleSourceEntries.length"
            @click="sourceExpanded = !sourceExpanded"
            class="text-xs text-blue-600 hover:text-blue-700 transition">
            {{ sourceExpanded ? 'Show less' : `Show ${report.source_entries.length - visibleSourceEntries.length} more` }}
          </button>
        </div>
        <div class="grid gap-2">
          <div
            v-for="entry in (sourceExpanded ? report.source_entries : visibleSourceEntries)"
            :key="`${entry.path}-${entry.key_uuid}`"
            class="rounded-xl bg-slate-50 ring-1 ring-slate-200 px-4 py-3">
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-sm font-semibold text-slate-800">{{ entry.key_alias }}</span>
              <span class="text-[11px] text-slate-400 font-mono">{{ entry.path }}</span>
              <span v-if="entry.is_group" class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 uppercase tracking-wide">group</span>
            </div>
            <p class="mt-1 text-xs text-slate-500 font-mono break-all">{{ entry.value_display }}</p>
          </div>
        </div>
      </div>

      <div class="space-y-3">
        <div class="flex items-center justify-between gap-3">
          <h4 class="text-xs font-semibold text-slate-400 uppercase tracking-wide">Matched configs</h4>
          <span class="text-xs text-slate-400">Top {{ visibleCandidates.length }}</span>
        </div>

        <div v-if="visibleCandidates.length === 0" class="rounded-2xl bg-slate-50 ring-1 ring-slate-200 px-4 py-8 text-center text-sm text-slate-400">
          No similar configs were found yet.
        </div>

        <div v-else class="space-y-3">
          <article
            v-for="candidate in visibleCandidates"
            :key="candidate.config_relation_uuid"
            class="rounded-2xl ring-1 ring-slate-200 overflow-hidden bg-white">
            <div class="w-full px-4 py-4 border-b border-slate-50 flex flex-wrap items-start justify-between gap-3 hover:bg-slate-50/50 transition">
              <button
                @click="toggleCandidate(candidate.config_relation_uuid)"
                class="min-w-0 text-left flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <StatusBadge :status="candidate.approval_status" />
                  <span class="text-sm font-semibold text-slate-900 truncate">{{ candidate.name ?? candidate.config_relation_uuid }}</span>
                </div>
                <p class="mt-1 text-xs text-slate-400">
                  {{ candidate.proj_id ?? '—' }} / {{ candidate.cmp_id ?? '—' }} · {{ candidate.environment }} · {{ formatDate(candidate.date_created) }}
                </p>
              </button>
              <div class="flex items-center gap-2 shrink-0">
                <span class="text-xs font-semibold text-blue-700 bg-blue-50 ring-1 ring-blue-200 px-2.5 py-1 rounded-full">
                  {{ Math.round(candidate.score * 100) }}%
                </span>
                <button
                  @click.stop="openCandidate(candidate.config_relation_uuid)"
                  class="rounded-xl px-3 py-2 text-xs font-semibold ring-1 ring-slate-200 text-slate-600 hover:bg-slate-50 transition">
                  Open snapshot
                </button>
              </div>
            </div>

            <div v-if="candidateExpanded(candidate.config_relation_uuid)" class="p-4 space-y-3">
              <div class="flex flex-wrap items-center gap-2">
                <span class="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Matched entries</span>
                <span class="text-xs text-slate-400">{{ candidate.matched_entries.length }}</span>
                <span class="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-semibold uppercase tracking-wide">
                  {{ sameValueMatches(candidate.matched_entries).length }} same value
                </span>
                <span class="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-semibold uppercase tracking-wide">
                  {{ similarKeyMatches(candidate.matched_entries).length }} similar key
                </span>
                <span class="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-semibold uppercase tracking-wide">
                  {{ hiddenMatches(candidate.matched_entries).length }} hidden
                </span>
              </div>

              <div class="grid gap-2">
                <div
                  v-for="match in candidate.matched_entries.filter(item => item.display_state === 'shown')"
                  :key="`${match.source_path}-${match.candidate_path}`"
                  class="rounded-xl bg-slate-50 ring-1 ring-slate-200 px-4 py-3">
                  <div class="flex flex-wrap items-start justify-between gap-3">
                    <div class="min-w-0 space-y-1">
                      <div class="flex flex-wrap items-center gap-2">
                        <span class="font-semibold text-slate-800">{{ match.source_key_alias }}</span>
                        <span class="text-slate-300">→</span>
                        <span class="font-semibold text-slate-800">{{ match.candidate_key_alias }}</span>
                        <span v-if="match.display_reason === 'same_value'" class="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold uppercase tracking-wide">same value</span>
                        <span v-else class="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-bold uppercase tracking-wide">similar key</span>
                      </div>
                      <p class="text-[11px] text-slate-400 font-mono break-all">{{ match.source_path }} · {{ match.candidate_path }}</p>
                    </div>
                    <div class="text-xs font-semibold text-slate-700">{{ Math.round(match.score * 100) }}%</div>
                  </div>
                  <p class="mt-2 text-xs text-slate-500 font-mono break-all">{{ match.source_value_display }} → {{ match.candidate_value_display }}</p>
                </div>
              </div>

              <div v-if="hiddenMatches(candidate.matched_entries).length > 0" class="pt-1">
                <button
                  @click="toggleHidden(candidate.config_relation_uuid)"
                  class="text-xs text-slate-500 hover:text-slate-700 transition underline">
                  {{ hiddenExpanded(candidate.config_relation_uuid) ? 'Hide low-priority matches' : `Show ${hiddenMatches(candidate.matched_entries).length} low-priority matches` }}
                </button>

                <div v-if="hiddenExpanded(candidate.config_relation_uuid)" class="mt-3 grid gap-2">
                  <div
                    v-for="match in hiddenMatches(candidate.matched_entries)"
                    :key="`hidden-${match.source_path}-${match.candidate_path}`"
                    class="rounded-xl bg-slate-50 ring-1 ring-slate-200 px-4 py-3 opacity-90">
                    <div class="flex flex-wrap items-start justify-between gap-3">
                      <div class="min-w-0 space-y-1">
                        <div class="flex flex-wrap items-center gap-2">
                          <span class="font-semibold text-slate-700">{{ match.source_key_alias }}</span>
                          <span class="text-slate-300">→</span>
                          <span class="font-semibold text-slate-700">{{ match.candidate_key_alias }}</span>
                          <span class="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-bold uppercase tracking-wide">{{ match.display_reason }}</span>
                        </div>
                        <p class="text-[11px] text-slate-400 font-mono break-all">{{ match.source_path }} · {{ match.candidate_path }}</p>
                      </div>
                      <div class="text-xs font-semibold text-slate-500">{{ Math.round(match.score * 100) }}%</div>
                    </div>
                    <p class="mt-2 text-xs text-slate-500 font-mono break-all">{{ match.source_value_display }} → {{ match.candidate_value_display }}</p>
                  </div>
                </div>
              </div>
            </div>
          </article>
        </div>
      </div>
    </div>
  </details>
</template>
