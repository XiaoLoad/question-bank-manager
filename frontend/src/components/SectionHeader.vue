<script setup>
defineOptions({ name: 'SectionHeader' })

defineProps({
  index: { type: String, default: '' },
  title: { type: String, required: true },
  hint: { type: String, default: '' },
  titleId: { type: String, default: undefined },
})
</script>

<template>
  <div class="ds-sec-head">
    <span v-if="index" class="ds-sec-index">{{ index }}</span>
    <h2 :id="titleId" class="ds-sec-title">
      {{ title }}
      <slot name="badge" />
    </h2>
    <span class="ds-sec-line" aria-hidden="true" />
    <p v-if="hint" class="ds-sec-hint">{{ hint }}</p>
    <div v-if="$slots.actions" class="ds-sec-actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<style scoped>
.ds-sec-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 9px;
  margin-bottom: 12px;
}

.ds-sec-index {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace;
  font-size: 9.5px;
  font-weight: 600;
  letter-spacing: 0.12em;
  color: color-mix(in srgb, var(--theme-accent) 72%, var(--theme-muted));
}

.ds-sec-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.9375rem;
  font-weight: 600;
  letter-spacing: -0.005em;
  color: var(--theme-text);
}

.ds-sec-line {
  flex: 1;
  min-width: 16px;
  height: 1px;
  background: linear-gradient(90deg, var(--theme-border), color-mix(in srgb, var(--theme-border) 15%, transparent));
}

.ds-sec-hint {
  display: none;
  font-size: 10.5px;
  color: var(--theme-muted);
  white-space: nowrap;
}

.ds-sec-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1 0 100%;
  justify-content: flex-start;
}

@media (min-width: 640px) {
  .ds-sec-hint {
    display: block;
  }

  .ds-sec-actions {
    flex: 0 0 auto;
    justify-content: flex-end;
    margin-left: auto;
  }
}
</style>
