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
  <div class="min-h-screen bg-slate-50">
    <AppNav>
      <button
        @click="backToSnapshot"
        class="text-slate-400 hover:text-slate-700 transition shrink-0 hidden sm:inline capitalize">
        Back to snapshot
      </button>
      <span class="text-slate-200 shrink-0 hidden sm:inline select-none">›</span>
      <span class="font-semibold text-slate-900 truncate font-mono text-xs">{{ uuid }}</span>
    </AppNav>

    <div class="max-w-3xl lg:max-w-4xl xl:max-w-5xl mx-auto px-4 sm:px-6 py-6 pb-16 space-y-4">
      <div>
        <button @click="backToSnapshot" class="text-sm text-slate-400 hover:text-slate-700 transition">
          ← Back to snapshot
        </button>
      </div>

      <ReviewerSimilarityReport :config-uuid="uuid" :compact="false" :limit="10" />
    </div>
  </div>
</template>
