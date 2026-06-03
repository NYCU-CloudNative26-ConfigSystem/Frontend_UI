<script setup lang="ts">
withDefaults(defineProps<{
  mainClass?: string
  widthClass?: string
}>(), {
  mainClass: 'space-y-4',
  widthClass: 'max-w-3xl lg:max-w-4xl xl:max-w-5xl',
})
</script>

<template>
  <div class="min-h-screen bg-slate-50">
    <slot name="nav" />
    <main :class="[widthClass, 'mx-auto px-4 sm:px-6 py-6 pb-16', mainClass]">
      <slot />
    </main>
    <slot name="after" />
  </div>
</template>
