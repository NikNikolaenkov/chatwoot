<script setup>
import { computed } from 'vue';
import { useMessageContext } from '../provider.js';

import Icon from 'dashboard/components-next/icon/Icon.vue';
import BaseBubble from 'next/message/bubbles/Base.vue';

const { content, contentAttributes } = useMessageContext();

const labels = {
  time: 'Time',
  callId: 'Call ID',
  status: 'Status',
  duration: 'Duration',
};

const details = computed(() => {
  const rows = {};

  String(content.value || '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .forEach(line => {
      const separatorIndex = line.indexOf(':');
      if (separatorIndex === -1) return;

      const key = line.slice(0, separatorIndex).trim().toLowerCase();
      const value = line.slice(separatorIndex + 1).trim();
      rows[key] = value;
    });

  return rows;
});

const status = computed(
  () =>
    contentAttributes.value?.whatsapp_call_status ||
    details.value.status ||
    'unknown'
);

const callType = computed(
  () =>
    contentAttributes.value?.whatsapp_call_type || details.value.type || 'voice'
);

const phone = computed(
  () =>
    contentAttributes.value?.whatsapp_call_phone || details.value.phone || ''
);

const occurredAt = computed(
  () => contentAttributes.value?.whatsapp_call_at || details.value.time || ''
);

const callId = computed(
  () =>
    contentAttributes.value?.whatsapp_call_id || details.value['call id'] || ''
);

const duration = computed(
  () => contentAttributes.value?.whatsapp_call_duration || details.value.duration || ''
);

const direction = computed(() =>
  String(
    contentAttributes.value?.whatsapp_call_direction ||
      details.value.direction ||
      'incoming'
  ).toLowerCase()
);

const isOutgoing = computed(() => direction.value === 'outgoing');

const normalizedStatus = computed(() =>
  String(status.value || 'unknown')
    .toLowerCase()
    .replaceAll('_', '-')
);

const isMissed = computed(() =>
  ['missed', 'no-answer', 'not-answered', 'rejected', 'failed', 'connection-lost'].includes(
    normalizedStatus.value
  )
);

const title = computed(() => {
  if (isMissed.value) {
    return isOutgoing.value ? 'Unanswered WhatsApp call' : 'Missed WhatsApp call';
  }
  return isOutgoing.value ? 'Outgoing WhatsApp call' : 'Incoming WhatsApp call';
});

const subtext = computed(() => {
  const type = callType.value === 'video' ? 'Video' : 'Voice';
  if (!phone.value) return `${type} call`;
  return isOutgoing.value
    ? `${type} call to ${phone.value}`
    : `${type} call from ${phone.value}`;
});

const iconName = computed(() => {
  if (isMissed.value) return 'i-ph-phone-x-bold';
  return isOutgoing.value ? 'i-ph-phone-outgoing-bold' : 'i-ph-phone-incoming-bold';
});

const iconClass = computed(() =>
  isMissed.value ? 'bg-n-ruby-3 text-n-ruby-10' : 'bg-n-teal-3 text-n-teal-11'
);
</script>

<template>
  <BaseBubble class="!p-3 !max-w-md min-w-[260px]" hide-meta>
    <div class="flex flex-col gap-3 w-full">
      <div class="flex gap-2.5 items-start">
        <div
          class="flex justify-center items-center rounded-xl size-11 shrink-0"
          :class="iconClass"
        >
          <Icon class="size-4" :icon="iconName" />
        </div>

        <div class="flex flex-col flex-1 min-w-0 self-center">
          <span class="font-display text-sm font-medium leading-tight">
            {{ title }}
          </span>
          <span class="text-sm leading-tight opacity-75">
            {{ subtext }}
          </span>
        </div>
      </div>

      <div class="grid gap-1 text-xs text-n-slate-11">
        <div v-if="occurredAt" class="flex justify-between gap-3">
          <span>{{ labels.time }}</span>
          <span class="text-n-slate-12 text-right break-all">{{
            occurredAt
          }}</span>
        </div>
        <div v-if="callId" class="flex justify-between gap-3">
          <span>{{ labels.callId }}</span>
          <span class="text-n-slate-12 text-right break-all">{{ callId }}</span>
        </div>
        <div class="flex justify-between gap-3">
          <span>{{ labels.status }}</span>
          <span class="text-n-slate-12 text-right">{{ status }}</span>
        </div>
        <div v-if="duration" class="flex justify-between gap-3">
          <span>{{ labels.duration }}</span>
          <span class="text-n-slate-12 text-right">{{ duration }}</span>
        </div>
      </div>
    </div>
  </BaseBubble>
</template>
