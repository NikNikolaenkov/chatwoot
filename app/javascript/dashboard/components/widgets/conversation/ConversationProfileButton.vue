<script setup>
import { ref, computed } from 'vue';
import axios from 'axios';
import { useRoute } from 'vue-router';
import { useStore } from 'vuex';
import Auth from 'dashboard/api/auth';
import { useAlert } from 'dashboard/composables';
import NextButton from 'dashboard/components-next/button/Button.vue';

/**
 * "Заполнить анкету" — on-demand DeepSeek CRM-profile refresh for this conversation.
 *
 * Posts to Chatwoot's authenticated proxy (/integrations/wavoip/contact_profile),
 * which relays to the Business Control backend with the shared bridge key. The
 * backend reads the chat, extracts the structured profile and writes it onto the
 * contact's custom attributes; we then reload the contact so the panel updates.
 */
const props = defineProps({
  chat: { type: Object, default: () => ({}) },
});

const route = useRoute();
const store = useStore();
const loading = ref(false);

const contactId = computed(() => props.chat?.meta?.sender?.id || null);
const conversationId = computed(() => props.chat?.id || null);

function authHeaders() {
  if (!Auth.hasAuthCookie?.()) return {};
  const {
    'access-token': accessToken,
    'token-type': tokenType,
    client,
    expiry,
    uid,
  } = Auth.getAuthData();
  return { 'access-token': accessToken, 'token-type': tokenType, client, expiry, uid };
}

const fillProfile = async () => {
  if (loading.value || !conversationId.value) return;
  loading.value = true;
  try {
    const accountId = route.params.accountId;
    const { data } = await axios.post(
      `/api/v1/accounts/${accountId}/integrations/wavoip/contact_profile`,
      { conversation_id: conversationId.value },
      { headers: authHeaders() }
    );
    if (data?.ok === false) {
      useAlert(data?.error || 'Не вдалося заповнити анкету');
    } else {
      // Reload the contact so the freshly written custom attributes show in the panel.
      if (contactId.value) {
        await store.dispatch('contacts/show', { id: contactId.value }).catch(() => {});
      }
      useAlert('Анкету оновлено');
    }
  } catch (error) {
    useAlert(error?.response?.data?.error || error?.message || 'Не вдалося заповнити анкету');
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <NextButton
    v-if="conversationId"
    v-tooltip.bottom="'Заповнити анкету контакта з діалогу (AI)'"
    sm
    ghost
    slate
    :icon="loading ? 'i-lucide-loader-circle' : 'i-lucide-clipboard-list'"
    :class="loading ? 'animate-spin' : ''"
    :disabled="loading"
    @click="fillProfile"
  />
</template>
