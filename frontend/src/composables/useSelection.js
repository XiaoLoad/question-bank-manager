import { ref } from 'vue'

/**
 * Composable for selection logic shared across list views.
 * Uses array instead of Set for proper Vue reactivity (Fix #8).
 * @returns {{ selectedIds, allSelected, toggleSelect, toggleSelectAll, clearSelection }}
 */
export function useSelection() {
  // FIX #8: Use array instead of Set for proper Vue 3 reactivity
  const selectedIds = ref([])

  function allSelected(items) {
    return items.length > 0 && selectedIds.value.length === items.length
  }

  function toggleSelect(id) {
    const idx = selectedIds.value.indexOf(id)
    if (idx === -1) {
      selectedIds.value = [...selectedIds.value, id]
    } else {
      selectedIds.value = selectedIds.value.filter(x => x !== id)
    }
  }

  function toggleSelectAll(items) {
    if (allSelected(items)) {
      selectedIds.value = []
    } else {
      selectedIds.value = items.map(q => q.id)
    }
  }

  function clearSelection() {
    selectedIds.value = []
  }

  return { selectedIds, allSelected, toggleSelect, toggleSelectAll, clearSelection }
}
