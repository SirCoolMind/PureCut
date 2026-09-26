<script setup>
/**
 * UpdatePrompt.vue
 *
 * Floating update banner displayed when CI/CD has deployed a newer version
 * of PureCut while the customer is still running an older cached session.
 */
import { Sparkles, RefreshCw, X } from 'lucide-vue-next'

defineProps({
  show: { type: Boolean, default: false },
  currentHash: { type: String, default: '' },
  newHash: { type: String, default: '' },
  newVersion: { type: String, default: '' }
})

defineEmits(['apply', 'close'])
</script>

<template>
  <Teleport to="body">
    <transition name="update-slide">
      <div v-if="show" class="update-banner-container" role="alert">
        <div class="update-banner-card">
          <div class="update-icon-wrap">
            <Sparkles :size="18" class="update-sparkle-icon" />
          </div>

          <div class="update-content">
            <div class="update-title-row">
              <span class="update-badge">Update Available</span>
              <span class="update-version">v{{ newVersion }} ({{ newHash.slice(0, 7) }})</span>
            </div>
            <p class="update-desc">
              A new version of PureCut was deployed with fresh updates & fixes.
            </p>
          </div>

          <div class="update-actions">
            <button class="btn-update-apply" @click="$emit('apply')" title="Refresh to load the newest version">
              <RefreshCw :size="13" class="spin-on-hover" />
              <span>Update Now</span>
            </button>
            <button class="btn-update-dismiss" @click="$emit('close')" title="Dismiss for now">
              <X :size="14" />
            </button>
          </div>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<style scoped>
.update-banner-container {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 10001;
  max-width: 460px;
  width: calc(100vw - 48px);
  pointer-events: auto;
}

.update-banner-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: rgba(15, 23, 42, 0.95);
  border: 1px solid rgba(99, 102, 241, 0.35);
  box-shadow: 0 12px 32px -4px rgba(0, 0, 0, 0.5), 0 0 24px -2px rgba(99, 102, 241, 0.25);
  border-radius: 12px;
  backdrop-filter: blur(12px);
  color: #f8fafc;
}

.update-icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(168, 85, 247, 0.2));
  border: 1px solid rgba(129, 140, 248, 0.4);
  color: #a5b4fc;
  flex-shrink: 0;
}

.update-content {
  flex: 1;
  min-width: 0;
}

.update-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.update-badge {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #38bdf8;
}

.update-version {
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  background: rgba(255, 255, 255, 0.08);
  padding: 1px 5px;
  border-radius: 4px;
  color: #cbd5e1;
}

.update-desc {
  font-size: 12px;
  color: #94a3b8;
  margin-top: 2px;
  line-height: 1.35;
}

.update-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.btn-update-apply {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  font-size: 12px;
  font-weight: 600;
  border-radius: 8px;
  background: linear-gradient(135deg, #4f46e5, #7c3aed);
  color: #ffffff;
  border: 1px solid rgba(255, 255, 255, 0.15);
  cursor: pointer;
  transition: all 0.15s ease;
  box-shadow: 0 2px 8px rgba(79, 70, 229, 0.4);
}

.btn-update-apply:hover {
  background: linear-gradient(135deg, #4338ca, #6d28d9);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(79, 70, 229, 0.5);
}

.btn-update-dismiss {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: transparent;
  color: #64748b;
  border: none;
  cursor: pointer;
  transition: color 0.15s ease, background-color 0.15s ease;
}

.btn-update-dismiss:hover {
  color: #cbd5e1;
  background: rgba(255, 255, 255, 0.08);
}

/* Slide in/out transition */
.update-slide-enter-active,
.update-slide-leave-active {
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.update-slide-enter-from,
.update-slide-leave-to {
  opacity: 0;
  transform: translateY(16px) scale(0.97);
}
</style>
