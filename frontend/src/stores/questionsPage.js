import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useQuestionsPageStore = defineStore('questionsPage', () => {
  const saved = ref(null)

  function save(state) {
    saved.value = { ...state }
  }

  function restore() {
    const s = saved.value
    saved.value = null
    return s
  }

  return { saved, save, restore }
})
