<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const route = useRoute()
const router = useRouter()

const uuid = computed(() => route.params.uuid as string)

function backToSnapshot() {
  router.push({ path: `/config-snapshot/${uuid.value}`, query: route.query })
}
</script>

<template>
  <PageShell>
    <template #nav>
      <AppNav>
        <button
          @click="backToSnapshot"
          class="text-slate-400 hover:text-slate-700 transition shrink-0 hidden sm:inline capitalize">
          Back to snapshot
        </button>
        <span class="text-slate-200 shrink-0 hidden sm:inline select-none">›</span>
        <span class="font-semibold text-slate-900 truncate font-mono text-xs">{{ uuid }}</span>
      </AppNav>
    </template>

      <div>
        <button @click="backToSnapshot" class="text-sm text-slate-400 hover:text-slate-700 transition">
          ← Back to snapshot
        </button>
      </div>

      <ReviewerSimilarityReport :config-uuid="uuid" :compact="false" :limit="10" />
  </PageShell>
</template>
