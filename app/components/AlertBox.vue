<script setup lang="ts">
const props = withDefaults(defineProps<{
  variant?: 'error' | 'warning' | 'success'
  large?: boolean
}>(), {
  variant: 'error',
  large: false,
})

const colorClass = computed(() => ({
  error:   'bg-red-50    ring-red-200    text-red-700',
  warning: 'bg-amber-50  ring-amber-200  text-amber-700',
  success: 'bg-emerald-50 ring-emerald-200 text-emerald-700',
}[props.variant]))

const sizeClass = computed(() =>
  props.large ? 'rounded-2xl px-5 py-4' : 'rounded-xl px-4 py-3'
)
</script>

<template>
  <div :class="[colorClass, sizeClass]" class="ring-1 text-sm"><slot /></div>
</template>
