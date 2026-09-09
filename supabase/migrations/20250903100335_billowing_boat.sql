/*
  # Fix missing RPC functions for support chat

  1. Functions
    - `get_user_conversations` - Fetches user conversations with unread message counts
    - `create_chat_conversation` - Creates new support conversations
    - `send_chat_message` - Sends messages in conversations
    - `mark_chat_messages_read` - Marks messages as read

  2. Security
    - All functions have proper security checks
    - Users can only access their own data
    - Admins can access all data
*/

-- Function to get user conversations with unread counts
CREATE OR REPLACE FUNCTION public.get_user_conversations(p_user_id uuid)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  subject text,
  status text,
  priority text,
  assigned_admin_id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  unread_count bigint,
  last_message text,
  last_message_time timestamptz
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Security check: ensure user can only access their own conversations or is admin
  IF NOT (auth.uid() = p_user_id OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT 
    c.id,
    c.user_id,
    c.subject,
    c.status,
    c.priority,
    c.assigned_admin_id,
    c.created_at,
    c.updated_at,
    COALESCE(unread.count, 0) as unread_count,
    last_msg.content as last_message,
    last_msg.created_at as last_message_time
  FROM public.conversations c
  LEFT JOIN (
    SELECT 
      conversation_id,
      COUNT(*) as count
    FROM public.messages 
    WHERE is_read = false 
      AND sender_id != p_user_id
    GROUP BY conversation_id
  ) unread ON c.id = unread.conversation_id
  LEFT JOIN (
    SELECT DISTINCT ON (conversation_id)
      conversation_id,
      content,
      created_at
    FROM public.messages
    ORDER BY conversation_id, created_at DESC
  ) last_msg ON c.id = last_msg.conversation_id
  WHERE c.user_id = p_user_id
  ORDER BY c.updated_at DESC;
END;
$$;

-- Function to create a new conversation
CREATE OR REPLACE FUNCTION public.create_chat_conversation(
  p_user_id uuid,
  p_subject text,
  p_priority text DEFAULT 'medium'
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  subject text,
  status text,
  priority text,
  assigned_admin_id uuid,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_conversation_id uuid;
BEGIN
  -- Security check: ensure user can only create conversations for themselves
  IF NOT (auth.uid() = p_user_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Validate priority
  IF p_priority NOT IN ('low', 'medium', 'high', 'urgent') THEN
    RAISE EXCEPTION 'Invalid priority level';
  END IF;

  -- Insert new conversation
  INSERT INTO public.conversations (user_id, subject, priority, status)
  VALUES (p_user_id, p_subject, p_priority, 'open')
  RETURNING conversations.id INTO new_conversation_id;

  -- Return the created conversation
  RETURN QUERY
  SELECT 
    c.id,
    c.user_id,
    c.subject,
    c.status,
    c.priority,
    c.assigned_admin_id,
    c.created_at,
    c.updated_at
  FROM public.conversations c
  WHERE c.id = new_conversation_id;
END;
$$;

-- Function to send a message
CREATE OR REPLACE FUNCTION public.send_chat_message(
  p_conversation_id uuid,
  p_sender_id uuid,
  p_content text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  message_id uuid;
  is_admin_msg boolean := false;
BEGIN
  -- Security check: ensure sender is authenticated user
  IF NOT (auth.uid() = p_sender_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Check if sender is admin
  SELECT is_admin INTO is_admin_msg
  FROM public.users
  WHERE id = p_sender_id;

  -- Verify conversation access
  IF NOT is_admin_msg THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.conversations 
      WHERE id = p_conversation_id AND user_id = p_sender_id
    ) THEN
      RAISE EXCEPTION 'Conversation not found or access denied';
    END IF;
  END IF;

  -- Insert message
  INSERT INTO public.messages (conversation_id, sender_id, content, is_admin_message)
  VALUES (p_conversation_id, p_sender_id, p_content, is_admin_msg)
  RETURNING id INTO message_id;

  -- Update conversation timestamp
  UPDATE public.conversations
  SET updated_at = now()
  WHERE id = p_conversation_id;

  RETURN message_id;
END;
$$;

-- Function to mark messages as read
CREATE OR REPLACE FUNCTION public.mark_chat_messages_read(
  p_conversation_id uuid,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Security check: ensure user can only mark their own messages as read
  IF NOT (auth.uid() = p_user_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Verify conversation access
  IF NOT EXISTS (
    SELECT 1 FROM public.conversations 
    WHERE id = p_conversation_id AND user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'Conversation not found or access denied';
  END IF;

  -- Mark messages as read (only messages not sent by the user)
  UPDATE public.messages
  SET is_read = true
  WHERE conversation_id = p_conversation_id
    AND sender_id != p_user_id
    AND is_read = false;
END;
$$;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION public.get_user_conversations(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_chat_conversation(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_chat_message(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_chat_messages_read(uuid, uuid) TO authenticated;