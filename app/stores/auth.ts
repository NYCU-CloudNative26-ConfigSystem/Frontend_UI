export const useAuthStore = defineStore('auth', () => {
  const token = ref<string>('')
  const refreshToken = ref<string>('')

  if (import.meta.client) {
    token.value = localStorage.getItem('access_token') ?? ''
    refreshToken.value = localStorage.getItem('refresh_token') ?? ''
  }

  const isLoggedIn = computed(() => !!token.value)

  function setToken(t: string) {
    token.value = t
    localStorage.setItem('access_token', t)
  }

  function setRefreshToken(t: string) {
    refreshToken.value = t
    localStorage.setItem('refresh_token', t)
  }

  function logout() {
    token.value = ''
    refreshToken.value = ''
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    navigateTo('/login')
  }

  return { token, refreshToken, isLoggedIn, setToken, setRefreshToken, logout }
})
