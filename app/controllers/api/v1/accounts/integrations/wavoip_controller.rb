class Api::V1::Accounts::Integrations::WavoipController < Api::V1::Accounts::BaseController
  # Server-side proxy that hands WAVoIP device tokens to the browser webphone.
  #
  # The tokens live in the Business Control backend (one per WhatsApp instance).
  # We fetch them here, server-to-server, presenting a shared key that stays in
  # this container's ENV and is never exposed to the browser. The action itself is
  # gated by the standard account authentication, so only a logged-in agent can
  # reach it.
  def tokens
    bridge_url = ENV.fetch('WAVOIP_BRIDGE_URL', '')
    bridge_key = ENV.fetch('WAVOIP_BRIDGE_KEY', '')

    return render(json: { tokens: [] }) if bridge_url.blank? || bridge_key.blank?

    response = HTTParty.get(
      bridge_url,
      headers: { 'x-wavoip-bridge-key' => bridge_key },
      query: { email: Current.user&.email },
      timeout: 5
    )

    if response.success?
      render json: response.parsed_response
    else
      render json: { tokens: [], error: 'bridge_unavailable' }, status: :bad_gateway
    end
  rescue StandardError => e
    Rails.logger.error("[wavoip] token bridge failed: #{e.message}")
    render json: { tokens: [], error: 'bridge_error' }, status: :bad_gateway
  end

  # Relays a call lifecycle event from the browser webphone to the Business Control
  # backend, which records it as a call-event note in the matching conversation.
  # The shared key is added here (server-side), never exposed to the browser.
  def call_event
    bridge_url = ENV.fetch('WAVOIP_BRIDGE_URL', '')
    bridge_key = ENV.fetch('WAVOIP_BRIDGE_KEY', '')
    return head(:service_unavailable) if bridge_url.blank? || bridge_key.blank?

    url = bridge_url.sub(%r{/tokens\z}, '/call-event')
    payload = params.permit(
      :direction, :status, :duration, :phone, :caller, :receiver,
      :whatsapp_call_id, :token
    ).to_h

    response = HTTParty.post(
      url,
      headers: {
        'x-wavoip-bridge-key' => bridge_key,
        'Content-Type' => 'application/json'
      },
      body: payload.to_json,
      timeout: 5
    )
    render json: (response.parsed_response.presence || {}), status: response.code
  rescue StandardError => e
    Rails.logger.error("[wavoip] call-event bridge failed: #{e.message}")
    head :bad_gateway
  end

  # Resolves (find-or-create) the conversation for an incoming call's caller so the
  # webphone can gate ringing by assignee and open the conversation.
  def resolve
    bridge_url = ENV.fetch('WAVOIP_BRIDGE_URL', '')
    bridge_key = ENV.fetch('WAVOIP_BRIDGE_KEY', '')
    return render(json: { found: false }) if bridge_url.blank? || bridge_key.blank?

    url = bridge_url.sub(%r{/tokens\z}, '/resolve')
    response = HTTParty.post(
      url,
      headers: {
        'x-wavoip-bridge-key' => bridge_key,
        'Content-Type' => 'application/json'
      },
      body: params.permit(:phone, :token).to_h.to_json,
      timeout: 5
    )
    render json: (response.parsed_response.presence || { found: false }), status: response.code
  rescue StandardError => e
    Rails.logger.error("[wavoip] resolve bridge failed: #{e.message}")
    render json: { found: false }, status: :bad_gateway
  end
end
