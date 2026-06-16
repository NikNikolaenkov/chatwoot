<script setup>
import { ref, computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAlert } from 'dashboard/composables';
import { useMapGetter } from 'dashboard/composables/store';
import { useKeyboardEvents } from 'dashboard/composables/useKeyboardEvents';
import Button from 'dashboard/components-next/button/Button.vue';

const props = defineProps({
  show: { type: Boolean, default: false },
  /** Pre-populate participants with this phone number (optional, from contact context). */
  initialPhone: { type: String, default: '' },
});

const emit = defineEmits(['cancel']);

const router = useRouter();
const route = useRoute();

const currentUser = useMapGetter('getCurrentUser');
const inboxesList = useMapGetter('inboxes/getInboxes');

/** Only show API-channel inboxes (our WhatsApp instances). */
const waInboxes = computed(() =>
  (inboxesList.value || []).filter(
    inbox => inbox.channel_type === 'Channel::Api'
  )
);

const groupName = ref('');
const selectedInboxId = ref(null);
const participantsRaw = ref(props.initialPhone ? props.initialPhone : '');
const isLoading = ref(false);

const onCancel = () => {
  groupName.value = '';
  participantsRaw.value = props.initialPhone || '';
  selectedInboxId.value = null;
  emit('cancel');
};

useKeyboardEvents({
  Escape: { action: () => { if (props.show) onCancel(); }, allowOnFocusedInput: true },
});

const parseParticipants = raw => {
  return raw
    .split(/[\n,;]+/)
    .map(p => p.replace(/[^\d+]/g, '').replace(/^\+/, ''))
    .filter(p => p.length >= 7);
};

const canSubmit = computed(
  () =>
    groupName.value.trim().length > 0 &&
    selectedInboxId.value &&
    parseParticipants(participantsRaw.value).length > 0
);

const onSubmit = async () => {
  if (!canSubmit.value || isLoading.value) return;

  const token = currentUser.value?.access_token;
  if (!token) {
    useAlert('Помилка авторизації — оновіть сторінку');
    return;
  }

  isLoading.value = true;
  try {
    const res = await fetch('/api/v1/groups', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        inboxId: Number(selectedInboxId.value),
        subject: groupName.value.trim(),
        participants: parseParticipants(participantsRaw.value),
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      useAlert(data?.message || 'Помилка створення групи');
      return;
    }

    onCancel();

    if (data.conversationId) {
      const accountId = route.params.accountId || data.accountId;
      router.push(
        `/app/accounts/${accountId}/conversations/${data.conversationId}`
      );
      useAlert(`Групу «${groupName.value}» створено`);
    } else {
      useAlert(`Групу «${groupName.value}» створено — конверзація з'явиться автоматично`);
    }
  } catch (err) {
    useAlert('Мережева помилка — спробуйте ще раз');
  } finally {
    isLoading.value = false;
  }
};
</script>

<template>
  <transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="ltr:translate-x-full rtl:-translate-x-full opacity-0"
    leave-active-class="transition duration-150 ease-in"
    leave-to-class="ltr:translate-x-[30%] rtl:-translate-x-[30%] opacity-0"
  >
    <div
      v-if="show"
      class="fixed inset-y-0 ltr:right-0 rtl:left-0 z-50 flex flex-col w-[30rem] max-w-full h-full bg-n-surface-2 ltr:border-l rtl:border-r border-n-weak shadow-lg overflow-auto"
    >
      <!-- Header -->
      <div class="flex items-center justify-between px-8 pt-8 pb-2">
        <div>
          <h2 class="text-lg font-medium text-n-slate-12 mb-1">
            Нова WhatsApp-група
          </h2>
          <p class="text-sm text-n-slate-11 mb-0">
            Введіть назву, оберіть інбокс та учасників
          </p>
        </div>
        <Button icon="i-lucide-x" slate ghost sm @click="onCancel" />
      </div>

      <!-- Form body -->
      <div class="flex flex-col gap-5 px-8 py-6">
        <!-- Group name -->
        <div class="flex flex-col gap-1.5">
          <label class="text-xs font-medium text-n-slate-11">
            Назва групи *
          </label>
          <input
            v-model="groupName"
            type="text"
            maxlength="100"
            placeholder="Наприклад: Менеджери проєкту"
            class="w-full rounded-lg border border-n-weak bg-n-surface-1 px-3 py-2 text-sm text-n-slate-12 placeholder:text-n-slate-9 focus:outline-none focus:ring-2 focus:ring-n-brand"
            @keyup.enter="onSubmit"
          />
        </div>

        <!-- WhatsApp inbox selector -->
        <div class="flex flex-col gap-1.5">
          <label class="text-xs font-medium text-n-slate-11">
            WhatsApp акаунт (інбокс) *
          </label>
          <select
            v-model="selectedInboxId"
            class="w-full rounded-lg border border-n-weak bg-n-surface-1 px-3 py-2 text-sm text-n-slate-12 focus:outline-none focus:ring-2 focus:ring-n-brand"
          >
            <option value="" disabled selected>Оберіть інбокс…</option>
            <option
              v-for="inbox in waInboxes"
              :key="inbox.id"
              :value="inbox.id"
            >
              {{ inbox.name }}
            </option>
          </select>
          <p v-if="waInboxes.length === 0" class="text-xs text-red-500 mt-0.5">
            Немає підключених WhatsApp інбоксів
          </p>
        </div>

        <!-- Participants -->
        <div class="flex flex-col gap-1.5">
          <label class="text-xs font-medium text-n-slate-11">
            Учасники (номери телефонів) *
          </label>
          <textarea
            v-model="participantsRaw"
            rows="5"
            placeholder="380501234567&#10;380661234567&#10;або через кому: 380501234567, 380661234567"
            class="w-full rounded-lg border border-n-weak bg-n-surface-1 px-3 py-2 text-sm text-n-slate-12 placeholder:text-n-slate-9 focus:outline-none focus:ring-2 focus:ring-n-brand resize-none"
          />
          <p class="text-xs text-n-slate-9">
            Кожен номер на новому рядку або через кому/крапку з комою.
            {{ parseParticipants(participantsRaw).length }} учасник(ів) розпізнано.
          </p>
        </div>
      </div>

      <!-- Footer actions -->
      <div class="mt-auto flex items-center justify-end gap-2 px-8 py-4 border-t border-n-weak">
        <Button faded slate sm label="Скасувати" @click="onCancel" />
        <Button
          sm
          label="Створити групу"
          icon="i-ph-users-three"
          :is-loading="isLoading"
          :disabled="!canSubmit || isLoading"
          @click="onSubmit"
        />
      </div>
    </div>
  </transition>
</template>
