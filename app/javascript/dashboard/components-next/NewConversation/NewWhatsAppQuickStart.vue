<script setup>
import { ref, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAlert } from 'dashboard/composables';
import { useMapGetter } from 'dashboard/composables/store';
import { useKeyboardEvents } from 'dashboard/composables/useKeyboardEvents';
import Button from 'dashboard/components-next/button/Button.vue';

const { t } = useI18n();

const isOpen = ref(false);
const open = () => { isOpen.value = true; };
const close = () => {
  isOpen.value = false;
  resetForms();
};

const router = useRouter();
const route = useRoute();
const currentUser = useMapGetter('getCurrentUser');
const inboxesList = useMapGetter('inboxes/getInboxes');

const waInboxes = computed(() =>
  (inboxesList.value || []).filter(i => i.channel_type === 'Channel::Api')
);

// ─── mode ────────────────────────────────────────────────────────────────────
const mode = ref('personal'); // 'personal' | 'group'

// ─── shared ──────────────────────────────────────────────────────────────────
const selectedInboxId = ref('');
const isLoading = ref(false);

// ─── personal mode ───────────────────────────────────────────────────────────
const phone = ref('');
const contactName = ref('');

const phoneDigits = computed(() => phone.value.replace(/\D/g, ''));
const personalCanSubmit = computed(
  () => phoneDigits.value.length >= 7 && selectedInboxId.value !== ''
);

const submitPersonal = async () => {
  if (!personalCanSubmit.value || isLoading.value) return;
  isLoading.value = true;
  try {
    const res = await fetch('/api/v1/conversations/whatsapp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${currentUser.value?.access_token}`,
      },
      body: JSON.stringify({
        inboxId: Number(selectedInboxId.value),
        phone: phoneDigits.value,
        name: contactName.value.trim() || undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      useAlert(data?.message || t('WA_QUICK_START.ERROR_GENERIC'));
      return;
    }
    close();
    if (data.conversationId) {
      router.push(
        `/app/accounts/${route.params.accountId}/conversations/${data.conversationId}`
      );
    }
  } catch {
    useAlert(t('WA_QUICK_START.ERROR_NETWORK'));
  } finally {
    isLoading.value = false;
  }
};

// ─── group mode ──────────────────────────────────────────────────────────────
const groupName = ref('');
const participantInput = ref('');
const participants = ref([]);

const addParticipant = () => {
  const digits = participantInput.value.replace(/\D/g, '');
  if (digits.length >= 7 && !participants.value.includes(digits)) {
    participants.value.push(digits);
  }
  participantInput.value = '';
};

const removeParticipant = p => {
  participants.value = participants.value.filter(x => x !== p);
};

const handleParticipantKey = e => {
  if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
    e.preventDefault();
    addParticipant();
  }
};

const groupCanSubmit = computed(
  () =>
    groupName.value.trim().length > 0 &&
    selectedInboxId.value !== '' &&
    participants.value.length > 0
);

const submitGroup = async () => {
  if (!groupCanSubmit.value || isLoading.value) return;
  isLoading.value = true;
  try {
    const res = await fetch('/api/v1/groups', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${currentUser.value?.access_token}`,
      },
      body: JSON.stringify({
        inboxId: Number(selectedInboxId.value),
        subject: groupName.value.trim(),
        participants: participants.value,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      useAlert(data?.message || t('WA_QUICK_START.ERROR_GENERIC'));
      return;
    }
    const name = groupName.value.trim();
    close();
    if (data.conversationId) {
      router.push(
        `/app/accounts/${route.params.accountId}/conversations/${data.conversationId}`
      );
      useAlert(t('WA_QUICK_START.GROUP_CREATED', { name }));
    } else {
      useAlert(t('WA_QUICK_START.GROUP_CREATED_PENDING', { name }));
    }
  } catch {
    useAlert(t('WA_QUICK_START.ERROR_NETWORK'));
  } finally {
    isLoading.value = false;
  }
};

// ─── helpers ─────────────────────────────────────────────────────────────────
const resetForms = () => {
  phone.value = '';
  contactName.value = '';
  groupName.value = '';
  participantInput.value = '';
  participants.value = [];
  selectedInboxId.value = '';
  mode.value = 'personal';
};

const onSubmit = () => {
  if (mode.value === 'personal') submitPersonal();
  else submitGroup();
};

useKeyboardEvents({
  Escape: { action: () => { if (isOpen.value) close(); }, allowOnFocusedInput: false },
});
</script>

<template>
  <!-- Trigger slot — wraps whatever button the parent provides -->
  <span @click.stop="open">
    <slot name="trigger" />
  </span>

  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0"
      leave-active-class="transition duration-100 ease-in"
      leave-to-class="opacity-0"
    >
      <div
        v-if="isOpen"
        class="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4"
        role="dialog"
        aria-modal="true"
      >
        <!-- Backdrop -->
        <div
          class="absolute inset-0 bg-n-slate-12/30 backdrop-blur-[2px]"
          @click="close"
        />

        <!-- Dialog card -->
        <Transition
          enter-active-class="transition duration-150 ease-out"
          enter-from-class="opacity-0 scale-95 -translate-y-2"
          leave-active-class="transition duration-100 ease-in"
          leave-to-class="opacity-0 scale-95 -translate-y-2"
        >
          <div
            v-if="isOpen"
            class="relative w-[480px] max-w-full bg-n-surface-2 rounded-xl shadow-2xl overflow-hidden border border-n-weak"
          >
            <!-- Header: mode tabs + close -->
            <div class="flex items-center justify-between px-4 pt-4 pb-0">
              <div class="flex gap-0.5 bg-n-slate-3 rounded-lg p-1">
                <button
                  :class="[
                    'px-3 py-1.5 text-sm font-medium rounded-md transition-all',
                    mode === 'personal'
                      ? 'bg-n-surface-2 shadow-sm text-n-slate-12'
                      : 'text-n-slate-10 hover:text-n-slate-12',
                  ]"
                  @click="mode = 'personal'"
                >
                  <span class="i-ph-user mr-1.5 align-middle" />{{ $t('WA_QUICK_START.TAB_PERSONAL') }}
                </button>
                <button
                  :class="[
                    'px-3 py-1.5 text-sm font-medium rounded-md transition-all',
                    mode === 'group'
                      ? 'bg-n-surface-2 shadow-sm text-n-slate-12'
                      : 'text-n-slate-10 hover:text-n-slate-12',
                  ]"
                  @click="mode = 'group'"
                >
                  <span class="i-ph-users-three mr-1.5 align-middle" />{{ $t('WA_QUICK_START.TAB_GROUP') }}
                </button>
              </div>
              <Button icon="i-lucide-x" slate ghost sm @click="close" />
            </div>

            <!-- ── PERSONAL MODE ─────────────────────────────────────── -->
            <div v-if="mode === 'personal'" class="flex flex-col gap-4 px-4 py-4">
              <p class="text-xs text-n-slate-10 -mt-1">
                {{ $t('WA_QUICK_START.PERSONAL_HINT') }}
              </p>

              <!-- Phone -->
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium text-n-slate-11">{{ $t('WA_QUICK_START.PHONE_LABEL') }} *</label>
                <div class="relative">
                  <span class="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-n-slate-9 select-none">+</span>
                  <input
                    v-model="phone"
                    type="tel"
                    :placeholder="$t('WA_QUICK_START.PHONE_PLACEHOLDER')"
                    class="w-full pl-6 pr-3 py-2 rounded-lg border border-n-weak bg-n-surface-1 text-sm text-n-slate-12 placeholder:text-n-slate-9 focus:outline-none focus:ring-2 focus:ring-n-brand"
                    @keyup.enter="onSubmit"
                  />
                </div>
              </div>

              <!-- Name (optional) -->
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium text-n-slate-11">
                  {{ $t('WA_QUICK_START.NAME_LABEL') }}
                  <span class="text-n-slate-9">{{ $t('WA_QUICK_START.NAME_OPTIONAL') }}</span>
                </label>
                <input
                  v-model="contactName"
                  type="text"
                  :placeholder="$t('WA_QUICK_START.NAME_PLACEHOLDER')"
                  maxlength="100"
                  class="w-full px-3 py-2 rounded-lg border border-n-weak bg-n-surface-1 text-sm text-n-slate-12 placeholder:text-n-slate-9 focus:outline-none focus:ring-2 focus:ring-n-brand"
                  @keyup.enter="onSubmit"
                />
              </div>

              <!-- Inbox -->
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium text-n-slate-11">{{ $t('WA_QUICK_START.INBOX_LABEL') }} *</label>
                <select
                  v-model="selectedInboxId"
                  class="w-full px-3 py-2 rounded-lg border border-n-weak bg-n-surface-1 text-sm text-n-slate-12 focus:outline-none focus:ring-2 focus:ring-n-brand"
                >
                  <option value="" disabled>{{ $t('WA_QUICK_START.INBOX_PLACEHOLDER') }}</option>
                  <option v-for="inbox in waInboxes" :key="inbox.id" :value="inbox.id">
                    {{ inbox.name }}
                  </option>
                </select>
                <p v-if="waInboxes.length === 0" class="text-xs text-red-500">
                  {{ $t('WA_QUICK_START.NO_INBOXES') }}
                </p>
              </div>
            </div>

            <!-- ── GROUP MODE ────────────────────────────────────────── -->
            <div v-else class="flex flex-col gap-4 px-4 py-4">
              <p class="text-xs text-n-slate-10 -mt-1">
                {{ $t('WA_QUICK_START.GROUP_HINT') }}
              </p>

              <!-- Group name -->
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium text-n-slate-11">{{ $t('WA_QUICK_START.GROUP_NAME_LABEL') }} *</label>
                <input
                  v-model="groupName"
                  type="text"
                  maxlength="100"
                  :placeholder="$t('WA_QUICK_START.GROUP_NAME_PLACEHOLDER')"
                  class="w-full px-3 py-2 rounded-lg border border-n-weak bg-n-surface-1 text-sm text-n-slate-12 placeholder:text-n-slate-9 focus:outline-none focus:ring-2 focus:ring-n-brand"
                />
              </div>

              <!-- Inbox -->
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium text-n-slate-11">{{ $t('WA_QUICK_START.INBOX_LABEL') }} *</label>
                <select
                  v-model="selectedInboxId"
                  class="w-full px-3 py-2 rounded-lg border border-n-weak bg-n-surface-1 text-sm text-n-slate-12 focus:outline-none focus:ring-2 focus:ring-n-brand"
                >
                  <option value="" disabled>{{ $t('WA_QUICK_START.INBOX_PLACEHOLDER') }}</option>
                  <option v-for="inbox in waInboxes" :key="inbox.id" :value="inbox.id">
                    {{ inbox.name }}
                  </option>
                </select>
              </div>

              <!-- Participants -->
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium text-n-slate-11">
                  {{ $t('WA_QUICK_START.PARTICIPANTS_LABEL') }} *
                  <span class="text-n-slate-9 font-normal">({{ participants.length }})</span>
                </label>
                <div class="flex gap-2">
                  <div class="relative flex-1">
                    <span class="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-n-slate-9 select-none">+</span>
                    <input
                      v-model="participantInput"
                      type="tel"
                      :placeholder="$t('WA_QUICK_START.PARTICIPANTS_PLACEHOLDER')"
                      class="w-full pl-6 pr-3 py-2 rounded-lg border border-n-weak bg-n-surface-1 text-sm text-n-slate-12 placeholder:text-n-slate-9 focus:outline-none focus:ring-2 focus:ring-n-brand"
                      @keydown="handleParticipantKey"
                    />
                  </div>
                  <Button sm slate faded :label="$t('WA_QUICK_START.ADD_BUTTON')" @click="addParticipant" />
                </div>
                <p class="text-xs text-n-slate-9">{{ $t('WA_QUICK_START.PARTICIPANTS_HINT') }}</p>

                <!-- Tags list -->
                <div
                  v-if="participants.length > 0"
                  class="flex flex-wrap gap-1.5 mt-1 max-h-28 overflow-y-auto"
                >
                  <span
                    v-for="p in participants"
                    :key="p"
                    class="inline-flex items-center gap-1 px-2 py-0.5 bg-n-slate-3 rounded-full text-xs text-n-slate-12"
                  >
                    +{{ p }}
                    <button
                      class="text-n-slate-9 hover:text-red-500 transition-colors leading-none"
                      @click="removeParticipant(p)"
                    >
                      <span class="i-lucide-x size-3" />
                    </button>
                  </span>
                </div>
              </div>
            </div>

            <!-- Footer -->
            <div class="flex items-center justify-end gap-2 px-4 py-3 border-t border-n-weak">
              <Button faded slate sm :label="$t('WA_QUICK_START.CANCEL_BUTTON')" @click="close" />
              <Button
                sm
                :label="mode === 'personal' ? $t('WA_QUICK_START.OPEN_CHAT_BUTTON') : $t('WA_QUICK_START.CREATE_GROUP_BUTTON')"
                :icon="mode === 'personal' ? 'i-ph-chat-circle-dots' : 'i-ph-users-three'"
                :is-loading="isLoading"
                :disabled="(mode === 'personal' ? !personalCanSubmit : !groupCanSubmit) || isLoading"
                @click="onSubmit"
              />
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
