<script setup lang="ts">
import { resolveComponent } from 'vue'

const props = defineProps<{
  label: string
  environment: string
  status: string | null
  to?: string      // if set, renders as a NuxtLink (clickable)
  current?: boolean // true = indigo highlight + ping dot (this snapshot)
  tag?: string     // suffix after environment, e.g. "parent" or "this snapshot"
  compact?: boolean // dots-only mode — card hidden until hover
}>()

const NuxtLink = resolveComponent('NuxtLink')
</script>

<template>
  <component
    :is="to ? NuxtLink : 'div'"
    :to="to"
    :class="['flex flex-col items-center group', compact && !current ? 'gap-0' : 'gap-3']"
  >
    <!-- Dot -->
    <div class="relative z-10 mt-1 shrink-0">
      <div :class="['w-3.5 h-3.5 rounded-full ring-2 ring-white', to && 'group-hover:scale-110 transition-transform', {
        'bg-indigo-500':  current,
        'bg-yellow-400':  !current && status === 'pending',
        'bg-green-400':   !current && status === 'approved',
        'bg-red-400':     !current && status === 'rejected',
        'bg-slate-300':   !current && !status,
      }]"></div>
      <div v-if="current" class="absolute inset-0 rounded-full bg-indigo-400 animate-ping opacity-25"></div>
    </div>

    <!-- Inline card (normal mode, or always for current) -->
    <div v-if="!compact || current" :class="['rounded-xl px-3.5 py-3 w-44 transition', current
      ? 'bg-indigo-50 ring-2 ring-indigo-400'
      : ['bg-slate-50 ring-1 ring-slate-200', to && 'group-hover:ring-indigo-300 group-hover:bg-indigo-50/40']
    ]">
      <div>
        <div :class="['text-xs font-semibold truncate', current ? 'text-indigo-800' : 'text-slate-700']">
          {{ label }}
        </div>
        <span v-if="status" :class="['text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0', {
          'bg-yellow-100 text-yellow-700': status === 'pending',
          'bg-green-100 text-green-700':   status === 'approved',
          'bg-red-100 text-red-600':        status === 'rejected',
        }]">{{ status }}</span>
      </div>
      <p :class="['mt-0.5 text-[11px] capitalize', current ? 'text-indigo-400' : 'text-slate-400']">
        {{ environment }}<template v-if="tag"> · {{ tag }}</template>
      </p>
    </div>

    <!-- Compact hover-reveal card (hidden by default, expands below dot on hover) -->
    <div v-if="compact && !current"
      class="w-44 overflow-hidden max-h-0 group-hover:max-h-[130px] transition-all duration-200">
      <div class="mt-3 rounded-xl px-3.5 py-3 bg-white ring-1 ring-slate-200 shadow-sm">
        <div class="text-xs font-semibold truncate text-slate-700">{{ label }}</div>
        <span v-if="status" :class="['text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0', {
          'bg-yellow-100 text-yellow-700': status === 'pending',
          'bg-green-100 text-green-700':   status === 'approved',
          'bg-red-100 text-red-600':        status === 'rejected',
        }]">{{ status }}</span>
        <p class="mt-0.5 text-[11px] capitalize text-slate-400">
          {{ environment }}<template v-if="tag"> · {{ tag }}</template>
        </p>
      </div>
    </div>
  </component>
</template>
