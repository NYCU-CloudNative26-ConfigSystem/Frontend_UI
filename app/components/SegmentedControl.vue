<script setup lang="ts" generic="T extends string">
defineProps<{
  modelValue: T
  options: { value: T; label: string; count?: number | string }[]
  variant?: 'light' | 'primary'
}>()

defineEmits<{
  'update:modelValue': [value: T]
}>()
</script>

<template>
  <div :class="['flex w-full gap-0.5 overflow-x-auto sm:w-auto',
    variant === 'primary' ? 'rounded-xl bg-white ring-1 ring-slate-900/5 p-1' : 'rounded-lg bg-slate-100 p-0.5']">
    <button
      v-for="option in options"
      :key="option.value"
      @click="$emit('update:modelValue', option.value)"
      :class="['flex-1 whitespace-nowrap px-3 py-1.5 text-xs font-medium transition sm:flex-none',
        variant === 'primary' ? 'rounded-lg' : 'rounded-md',
        modelValue === option.value
          ? (variant === 'primary' ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-slate-700 shadow-sm')
          : (variant === 'primary' ? 'text-slate-500 hover:text-slate-800 hover:bg-slate-50' : 'text-slate-400 hover:text-slate-600')]">
      {{ option.label }}
      <span v-if="option.count != null" class="ml-1 text-[10px] text-slate-400">{{ option.count }}</span>
    </button>
  </div>
</template>
