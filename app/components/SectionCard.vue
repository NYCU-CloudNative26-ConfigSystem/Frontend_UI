<script setup lang="ts">
const props = withDefaults(defineProps<{
  padded?: boolean
  paddingClass?: string
  interactive?: boolean
}>(), {
  padded: false,
  paddingClass: 'p-5',
  interactive: false,
})

const classes = computed(() => [
  'bg-white rounded-2xl ring-1 ring-slate-900/5',
  props.padded ? props.paddingClass : 'overflow-hidden',
  props.interactive ? 'hover:ring-blue-400/40 hover:shadow-sm transition-all' : '',
])
</script>

<template>
  <div :class="classes">
    <slot />
  </div>
</template>
