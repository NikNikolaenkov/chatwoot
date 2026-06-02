# Auto-assigns a conversation to the agent who sends the first reply, when it is
# still unassigned. Covers both flows the business wants:
#   - an agent answering an inbound conversation for the first time, and
#   - a manager creating a contact and sending the first outbound message.
# Both surface as `first.reply.created` (the first non-private human outgoing message).
# Round-robin auto-assignment, if enabled, runs at conversation creation; this only
# acts when the conversation is still unassigned, so the two never fight.
class AutoAssignOnFirstReplyListener < BaseListener
  def first_reply_created(event)
    message, account = extract_message_and_account(event)
    return if message.blank? || account.blank?

    conversation = message.conversation
    return if conversation.blank? || conversation.assignee_id.present?

    sender = message.sender
    return unless sender.is_a?(User)
    return unless account.users.exists?(id: sender.id)

    conversation.update!(assignee: sender)
  rescue StandardError => e
    Rails.logger.error("[wavoip] auto-assign on first reply failed: #{e.message}")
  end
end
