<script setup lang="ts">
const auth = useAuthStore()
</script>

<!-- Sticky top navigation bar.
     The default slot receives everything that appears after the "← Home |" separator. -->
<template>
  <nav class="sticky top-0 z-10 bg-white/90 backdrop-blur-sm border-b border-slate-100">
    <div class="max-w-3xl lg:max-w-4xl xl:max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
      <div class="flex items-center gap-2 min-w-0 text-sm">
        <NuxtLink to="/home" class="text-slate-400 hover:text-slate-700 transition shrink-0">← Home</NuxtLink>
        <span class="text-slate-200 shrink-0 select-none">|</span>
        <slot />
      </div>
      <button @click="auth.logout()" class="text-sm text-slate-400 hover:text-red-500 transition shrink-0">Logout</button>
    </div>
  </nav>
</template>
