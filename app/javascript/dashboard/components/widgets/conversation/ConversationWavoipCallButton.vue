<script setup>
import { computed } from 'vue';
import { useStore } from 'vuex';
import { useWavoip } from 'dashboard/composables/useWavoip';
import { useAlert } from 'dashboard/composables';
import NextButton from 'dashboard/components-next/button/Button.vue';

/**
 * Per-conversation WAVoIP call control.
 *
 * Shows only when the conversation's inbox maps to a configured WAVoIP number.
 * The call button is enabled only when BOTH conditions hold:
 *   1. capability — the inbox's WAVoIP device is connected (status "open");
 *   2. permission — the conversation is flagged callable
 *      (custom_attributes.wavoip_call_allowed === true).
 * The shield toggle flips that permission flag (persisted on the conversation).
 */
const props = defineProps({
  inbox: { type: Object, default: () => ({}) },
  chat: { type: Object, default: () => ({}) },
});

const store = useStore();
const { tokenForInbox, isInboxConnected, startCallFromInbox } = useWavoip();

const hasWavoip = computed(() => !!tokenForInbox(props.inbox?.id));
const phone = computed(() => props.chat?.meta?.sender?.phone_number || '');
const connected = computed(() => isInboxConnected(props.inbox?.id));
const allowed = computed(
  () => props.chat?.custom_attributes?.wavoip_call_allowed === true
);
const canCall = computed(
  () => connected.value && allowed.value && !!phone.value
);

const callTooltip = computed(() => {
  if (!connected.value) return 'WAVoIP: пристрій офлайн';
  if (!allowed.value) return 'Дзвінки заборонено для цієї розмови';
  if (!phone.value) return 'Немає номера контакта';
  return 'Подзвонити через WhatsApp';
});

const toggleAllowed = async () => {
  try {
    await store.dispatch('updateCustomAttributes', {
      conversationId: props.chat.id,
      customAttributes: {
        ...(props.chat.custom_attributes || {}),
        wavoip_call_allowed: !allowed.value,
      },
    });
  } catch (error) {
    useAlert(error?.message || 'Не вдалося змінити дозвіл на дзвінки');
  }
};

const startCall = async () => {
  if (!canCall.value) return;
  try {
    await startCallFromInbox(props.inbox.id, phone.value);
  } catch (error) {
    useAlert(error?.message || 'Не вдалося почати дзвінок');
  }
};
</script>

<template>
  <div v-if="hasWavoip" class="flex items-center gap-1">
    <NextButton
      v-tooltip.bottom="
        allowed ? 'Дзвінки дозволено (вимкнути)' : 'Дзвінки заборонено (дозволити)'
      "
      sm
      ghost
      :icon="allowed ? 'i-lucide-shield-check' : 'i-lucide-shield-ban'"
      :class="allowed ? 'text-n-teal-10' : 'text-n-slate-10'"
      @click="toggleAllowed"
    />
    <NextButton
      v-tooltip.bottom="callTooltip"
      sm
      ghost
      slate
      icon="i-lucide-phone"
      :disabled="!canCall"
      @click="startCall"
    />
  </div>
  <template v-else />
</template>
