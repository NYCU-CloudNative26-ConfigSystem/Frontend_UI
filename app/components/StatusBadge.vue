<script setup lang="ts">
const props = defineProps<{
  status: string
  isLatest?: boolean
}>()

interface BadgeStyle { text: string; bg: string }

const badge = computed((): BadgeStyle => {
  if (props.isLatest && props.status === 'approved') return { text: 'Latest',          bg: 'bg-blue-50    text-blue-700'   }
  if (props.status === 'pending')                    return { text: 'Pending review',   bg: 'bg-yellow-50  text-yellow-700'  }
  if (props.status === 'rejected')                   return { text: 'Rejected',         bg: 'bg-red-50     text-red-700'     }
  if (props.status === 'approved')                   return { text: 'Approved',         bg: 'bg-slate-100  text-slate-500'   }
  return                                                    { text: props.status,        bg: 'bg-slate-100  text-slate-500'   }
})
</script>

<template>
  <span :class="badge.bg" class="text-xs font-semibold px-2.5 py-0.5 rounded-full shrink-0">
    {{ badge.text }}
  </span>
</template>
