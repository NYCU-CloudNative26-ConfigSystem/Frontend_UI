<script setup lang="ts">
withDefaults(defineProps<{ showBack?: boolean }>(), { showBack: true })

const auth = useAuthStore()
const api = useApi()
const myUsername = ref('')

onMounted(async () => {
  const me = await api.auth.me(auth.token).catch(() => ({ username: '', role: 'user', email: '', full_name: '', company: '' }))
  myUsername.value = me.username
})
</script>

<!-- Sticky top navigation bar.
     showBack=true (default): renders "← Home | [slot]" — for interior pages.
     showBack=false: renders only the slot — for the home page itself. -->
<template>
  <nav class="sticky top-0 z-10 bg-white/90 backdrop-blur-sm border-b border-slate-100">
    <div class="max-w-3xl lg:max-w-4xl xl:max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
      <div class="flex items-center gap-2 min-w-0 text-sm">
        <template v-if="showBack">
          <NuxtLink to="/home" class="text-slate-400 hover:text-slate-700 transition shrink-0">← Home</NuxtLink>
          <span class="text-slate-200 shrink-0 select-none">|</span>
        </template>
        <slot />
      </div>
      <div class="flex items-center gap-3 shrink-0">
        <span v-if="myUsername" class="text-sm text-slate-400">Hi, {{ myUsername }}</span>
        <button @click="auth.logout()" class="text-sm text-slate-400 hover:text-red-500 transition">Logout</button>
      </div>
    </div>
  </nav>
</template>
