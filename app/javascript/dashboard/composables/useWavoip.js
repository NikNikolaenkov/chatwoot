import { ref, reactive } from 'vue';
import axios from 'axios';
import Auth from 'dashboard/api/auth';
import { frontendURL, conversationUrl } from 'dashboard/helper/URLHelper';

/**
 * Shared WAVoIP state for the dashboard. A single webphone instance is booted once
 * (its floating button hidden); the per-conversation call button drives it.
 *
 * - tokens: [{ token, waNumber, chatwootInboxId }] fetched from Business Control
 *   through Chatwoot's authenticated proxy (/integrations/wavoip/tokens).
 * - statuses: token -> device status reported by the webphone ("open" = callable).
 *
 * Calling is "possible" for a conversation when its inbox maps to a registered
 * token whose device status is "open". The business-rule allow flag lives in the
 * conversation's custom_attributes and is checked by the button, not here.
 */
const WEBPHONE_CDN =
  'https://cdn.jsdelivr.net/npm/@wavoip/wavoip-webphone@latest/dist/index.es.js';

const api = ref(null);
const tokens = ref([]);
const statuses = reactive({});

let initialized = false;
let webphoneModule = null;
let pollTimer = null;

// Tracks in-flight calls so we can compute direction/duration when they end.
const activeCalls = new Map(); // callId -> { phone, direction, acceptedAt }

function callId(payload) {
  return payload?.id ?? payload?.call?.id ?? payload?.callId ?? null;
}

function callPhone(payload) {
  return (
    payload?.peer?.phone ??
    payload?.call?.peer?.phone ??
    payload?.phone ??
    ''
  );
}

async function postCallEvent(accountId, data) {
  try {
    await axios.post(
      `/api/v1/accounts/${accountId}/integrations/wavoip/call_event`,
      data,
      { headers: authHeaders() }
    );
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[wavoip] failed to record call event', error);
  }
}

// Find-or-create the Chatwoot conversation for an incoming caller and read its
// assignee, via Chatwoot's authenticated proxy. Returns { found, conversationId, assigneeId }.
async function resolveConversation(accountId, phone, token) {
  const { data } = await axios.post(
    `/api/v1/accounts/${accountId}/integrations/wavoip/resolve`,
    { phone, token },
    { headers: authHeaders() }
  );
  return data || { found: false };
}

function authHeaders() {
  if (!Auth.hasAuthCookie?.()) return {};
  const {
    'access-token': accessToken,
    'token-type': tokenType,
    client,
    expiry,
    uid,
  } = Auth.getAuthData();
  return {
    'access-token': accessToken,
    'token-type': tokenType,
    client,
    expiry,
    uid,
  };
}

function refreshStatuses() {
  if (!api.value) return;
  try {
    (api.value.device.get() || []).forEach(device => {
      const token = device?.token ?? device?.device?.token;
      const status = device?.status ?? device?.device?.status;
      if (token) statuses[token] = status;
    });
  } catch {
    // ignore transient read errors
  }
}

export async function initWavoip(accountId, opts = {}) {
  if (initialized) return api.value;
  initialized = true;

  const mod = await import(/* @vite-ignore */ WEBPHONE_CDN);
  webphoneModule = mod.default ?? mod;

  api.value = await webphoneModule.render({
    theme: 'system',
    // No floating launcher — calls are driven from the per-conversation button.
    widget: { startOpen: false, showWidgetButton: false },
    settingsMenu: {
      deviceMenu: {
        show: true,
        showAddDevices: true,
        showEnableDevicesButton: true,
        showRemoveDevicesButton: true,
      },
    },
    platform: 'chatwoot',
  });

  // Track call lifecycle to record an event note in the conversation, and surface
  // the panel automatically on an incoming offer. Event ids may not correlate across
  // offer/accepted/ended, so we also keep a "pending incoming" fallback. Debug logs
  // are temporary to confirm the exact payload shapes this webphone build emits.
  const tokenOf = () => tokens.value[0]?.token || '';
  let pendingIncoming = null;

  try {
    // Gate incoming offers by conversation assignment: ring everyone when the
    // conversation is unassigned, but only the assignee when it is assigned. Blocking
    // (returning without next()) hides the offer from THIS agent only — the call stays
    // available to other agents; we never reject() here so the caller isn't dropped.
    api.value.use?.('offer', async (offer, next) => {
      const phone = String(callPhone(offer)).replace(/[^0-9]/g, '');
      let resolved = null;
      try {
        resolved = await resolveConversation(accountId, phone, tokenOf());
      } catch {
        // resolve failed — fall through and present (never drop a call on our error)
      }

      const me = opts.getCurrentUserId?.();
      const assignee = resolved?.assigneeId;
      if (assignee && me && Number(assignee) !== Number(me)) {
        return; // assigned to another agent → do not present to this one
      }

      const conversationId = resolved?.conversationId ?? null;
      pendingIncoming = { phone, conversationId };
      const id = callId(offer);
      if (id) activeCalls.set(id, { phone, direction: 'incoming', conversationId });

      // Surface the ringing panel, but DON'T navigate yet — the conversation is opened
      // only for the agent who actually answers the call (see call:accepted).
      api.value?.widget?.open?.();
      next();
    });

    api.value.on?.('call:started', call => {
      const id = callId(call);
      if (id) activeCalls.set(id, { phone: callPhone(call), direction: 'outgoing' });
    });

    api.value.on?.('call:accepted', call => {
      const id = callId(call);
      if (!id) return;
      const entry = activeCalls.get(id) || {
        phone: callPhone(call) || pendingIncoming?.phone || '',
        direction: 'incoming',
        conversationId: pendingIncoming?.conversationId ?? null,
      };
      entry.acceptedAt = Date.now();
      activeCalls.set(id, entry);

      // Open the conversation only for the agent who answered the call.
      const conversationId = entry.conversationId ?? pendingIncoming?.conversationId ?? null;
      if (conversationId && opts.router) {
        try {
          opts.router.push(
            frontendURL(conversationUrl({ accountId, id: conversationId }))
          );
        } catch {
          // navigation best-effort
        }
      }
    });

    api.value.on?.('call:ended', ended => {
      const id = callId(ended);
      const entry =
        (id && activeCalls.get(id)) ||
        (pendingIncoming
          ? { phone: pendingIncoming.phone, direction: 'incoming' }
          : {});
      if (id) activeCalls.delete(id);
      pendingIncoming = null;

      const durationSec = entry.acceptedAt
        ? Math.max(0, Math.round((Date.now() - entry.acceptedAt) / 1000))
        : 0;
      const phone = entry.phone || callPhone(ended);
      if (!phone) {
        // eslint-disable-next-line no-console
        console.warn('[wavoip] call:ended without a resolvable phone — not logged', ended);
        return;
      }
      postCallEvent(accountId, {
        direction: entry.direction || 'incoming',
        status: ended?.status || 'ENDED',
        duration: durationSec,
        phone,
        token: tokenOf(),
        whatsapp_call_id: id || undefined,
      });
    });
  } catch {
    // older webphone builds may not expose .on — non-fatal
  }

  try {
    const { data } = await axios.get(
      `/api/v1/accounts/${accountId}/integrations/wavoip/tokens`,
      { headers: authHeaders() }
    );
    tokens.value = (data?.tokens ?? []).filter(entry => entry?.token);
    [...new Set(tokens.value.map(entry => entry.token))].forEach(token => {
      api.value.device.add(token, true);
      api.value.device.enable(token);
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[wavoip] failed to load tokens', error);
  }

  refreshStatuses();
  pollTimer = setInterval(refreshStatuses, 4000);
  return api.value;
}

export function destroyWavoip() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  try {
    webphoneModule?.destroy?.();
  } catch {
    // ignore teardown errors
  }
  initialized = false;
  api.value = null;
}

export function useWavoip() {
  const tokenForInbox = inboxId =>
    tokens.value.find(
      entry => Number(entry.chatwootInboxId) === Number(inboxId)
    );

  const isInboxConnected = inboxId => {
    const entry = tokenForInbox(inboxId);
    return !!entry && statuses[entry.token] === 'open';
  };

  const startCallFromInbox = async (inboxId, phone) => {
    const entry = tokenForInbox(inboxId);
    if (!api.value || !entry || !phone) return;
    api.value.widget?.open?.();
    const digits = String(phone).replace(/[^0-9]/g, '');
    await api.value.call.start(digits, { fromTokens: [entry.token] });
  };

  return {
    api,
    tokens,
    statuses,
    tokenForInbox,
    isInboxConnected,
    startCallFromInbox,
  };
}
