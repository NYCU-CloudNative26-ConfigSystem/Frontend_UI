<script setup lang="ts">
const props = defineProps<{
  modelValue: boolean
  title?: string
  subtitle?: string
  maxWidth?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

function close() { emit('update:modelValue', false) }
</script>

<!-- Teleport-based modal with header / default / footer named slots.
     Bind with v-model; clicking the backdrop or × closes it. -->
<template>
  <Teleport to="body">
    <div v-if="modelValue"
      class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/30 backdrop-blur-sm"
      @click.self="close">
      <div class="bg-white rounded-2xl ring-1 ring-slate-900/10 shadow-2xl w-full flex flex-col max-h-[80vh]"
        :class="maxWidth ?? 'max-w-lg'">

        <!-- Header -->
        <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div class="min-w-0">
            <slot name="header">
              <h3 v-if="title" class="font-semibold text-slate-900 text-sm">{{ title }}</h3>
            </slot>
            <p v-if="subtitle" class="text-xs text-slate-400 font-mono mt-0.5 truncate">{{ subtitle }}</p>
          </div>
          <button @click="close"
            class="text-slate-400 hover:text-slate-700 transition text-xl leading-none px-1 shrink-0 ml-3">×</button>
        </div>

        <!-- Body -->
        <div class="overflow-y-auto flex-1 min-h-0">
          <slot />
        </div>

        <!-- Footer (optional) -->
        <div v-if="$slots.footer" class="px-5 py-4 border-t border-slate-100 flex flex-col gap-2 shrink-0">
          <slot name="footer" />
        </div>

      </div>
    </div>
  </Teleport>
</template>
