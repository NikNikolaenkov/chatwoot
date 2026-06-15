class Conversations::ActivityMessageJob < ApplicationJob
  queue_as :high

  def perform(conversation, message_params)
    # Backdate activity messages so they never break pagination in
    # conversations with back-dated (historical) messages.
    #
    # Without this, an activity with created_at=Time.now becomes the
    # newest-by-date message. Chatwoot frontend picks that as the reference
    # and paginates history with `before=<ref_id>`. Since the activity has
    # a HIGHER id than real back-dated messages, "before <activity_id>"
    # excludes everything — the dialog renders empty.
    #
    # Fix: set the activity's created_at to 1 second after the conversation's
    # last real message, so it slots into the timeline chronologically and
    # never blocks history from loading.
    message_params = message_params.dup
    last_real = conversation.messages
      .where.not(message_type: :activity)
      .order(created_at: :desc)
      .pick(:created_at)
    if last_real
      message_params[:created_at] = last_real + 1
    end

    conversation.messages.create!(message_params)
  end
end
