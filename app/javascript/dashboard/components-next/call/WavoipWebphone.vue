<script setup>
import { onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { useStore } from 'vuex';
import { useAccount } from 'dashboard/composables/useAccount';
import { initWavoip, destroyWavoip } from 'dashboard/composables/useWavoip';

/**
 * Boots the WAVoIP webphone once for the dashboard. The webphone mounts its own UI
 * into a Shadow DOM on document.body and its floating launcher is hidden — calls are
 * driven from the per-conversation ConversationWavoipCallButton. This component
 * renders nothing; it only manages the webphone lifecycle.
 */
const { accountId } = useAccount();
const router = useRouter();
const store = useStore();

onMounted(() => {
  initWavoip(accountId.value, {
    router,
    getCurrentUserId: () => store.getters.getCurrentUserID,
  }).catch(error => {
    // eslint-disable-next-line no-console
    console.error('[wavoip] webphone init failed', error);
  });
});

onBeforeUnmount(() => {
  destroyWavoip();
});
</script>

<template>
  <span aria-hidden="true" class="hidden" />
</template>
