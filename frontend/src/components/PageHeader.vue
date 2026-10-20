<script setup>
defineOptions({ name: 'PageHeader' })

defineProps({
  eyebrow: { type: String, default: '' },
  eyebrowEn: { type: String, default: '' },
  title: { type: String, required: true },
  description: { type: String, default: '' },
})
</script>

<template>
  <header class="ds-page-head">
    <div class="ds-page-copy">
      <p v-if="eyebrow || eyebrowEn" class="ds-eyebrow ds-rise">
        <span v-if="eyebrow">{{ eyebrow }}</span>
        <span v-if="eyebrowEn" class="ds-eyebrow-en">{{ eyebrowEn }}</span>
      </p>
      <h1 class="ds-page-title ds-rise" style="--d: 60ms">{{ title }}</h1>
      <p v-if="description" class="ds-page-sub ds-rise" style="--d: 110ms">
        {{ description }}
      </p>
    </div>

    <div v-if="$slots.actions" class="ds-page-actions ds-rise" style="--d: 160ms">
      <slot name="actions" />
    </div>
  </header>
</template>

<style scoped>
.ds-page-head {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-bottom: 22px;
}

@media (min-width: 640px) {
  .ds-page-head {
    flex-direction: row;
    align-items: flex-end;
    justify-content: space-between;
    gap: 22px;
    margin-bottom: 26px;
  }
}

.ds-page-copy {
  min-width: 0;
}

.ds-eyebrow {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace;
  font-size: 9.5px;
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--theme-accent);
}

.ds-eyebrow::before {
  content: '';
  width: 16px;
  height: 1px;
  background: currentColor;
  opacity: 0.55;
}

.ds-eyebrow-en {
  color: var(--theme-muted);
  font-weight: 500;
  letter-spacing: 0.2em;
}

.ds-page-title {
  margin-top: 9px;
  font-size: 1.5rem;
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: -0.022em;
  color: var(--theme-text);
}

@media (min-width: 640px) {
  .ds-page-title {
    font-size: 1.625rem;
  }
}

.ds-page-sub {
  max-width: 54ch;
  margin-top: 6px;
  font-size: 0.8125rem;
  line-height: 1.65;
  color: var(--theme-muted);
}

.ds-page-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 9px;
  flex-shrink: 0;
}
</style>
