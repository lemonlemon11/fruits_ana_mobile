import { ref } from 'vue'
import { ApiError } from '../api/client'
import { fetchLogin, fetchLogout, fetchMe } from '../api/data'

export const currentUser = ref(null)
export const authReady = ref(false)

let restorePromise = null

export function setCurrentUser(user) {
  currentUser.value = user
  authReady.value = true
}

export function clearCurrentUser() {
  currentUser.value = null
  authReady.value = true
}

export async function login(payload) {
  const user = await fetchLogin(payload)
  setCurrentUser(user)
  return user
}

export async function logout() {
  try {
    await fetchLogout()
  } finally {
    clearCurrentUser()
  }
}

export function restoreSession() {
  if (authReady.value) return Promise.resolve(currentUser.value)
  if (restorePromise) return restorePromise
  restorePromise = fetchMe()
    .then((user) => {
      setCurrentUser(user)
      return user
    })
    .catch((error) => {
      if (error instanceof ApiError && error.status === 401) {
        clearCurrentUser()
        return null
      }
      throw error
    })
    .finally(() => {
      restorePromise = null
    })
  return restorePromise
}
