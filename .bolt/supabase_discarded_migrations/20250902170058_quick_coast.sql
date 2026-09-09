/*
  # Create RPC functions for support chat system

  1. Functions Created
    - `get_user_conversations(p_user_id)` - Get user's conversations with unread counts
    - `create_chat_conversation(p_user_id, p_subject, p_priority)` - Create new conversation
    - `send_chat_message(p_conversation_id, p_sender_id, p_content)` - Send message
    - `mark_chat_messages_read(p_conversation_id, p_user_id)` - Mark messages as read
    - `close_chat_conversation(p_conversation_id, p_user_id)` - Close conversation
    - `get_all_conversations_admin()` - Admin function to get all conversations
    - `assign_conversation_to_admin(p_conversation_id, p_admin_id)` - Assign to admin

  2. Security
    - All functions include proper user authentication checks
    - Admin functions verify admin role before execution
    - User functions ensure users can only access their own data
*/

-- Function to get user's conversations with unread message counts
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
    -- Verify the user is requesting their own conversations
    IF auth.uid() != p_user_id THEN
        RAISE EXCEPTION 'Access denied: You can only view your own conversations';
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
        COALESCE((
            SELECT COUNT(*)::bigint 
            FROM public.messages m 
            WHERE m.conversation_id = c.id 
            AND m.is_read = FALSE 
            AND m.sender_id != p_user_id
        ), 0) AS unread_count,
        (
            SELECT m.content 
            FROM public.messages m 
            WHERE m.conversation_id = c.id 
            ORDER BY m.created_at DESC 
            LIMIT 1
        ) AS last_message,
        (
            SELECT m.created_at 
            FROM public.messages m 
            WHERE m.conversation_id = c.id 
            ORDER BY m.created_at DESC 
            LIMIT 1
        ) AS last_message_time
    FROM
        public.conversations c
    WHERE
        c.user_id = p_user_id
    ORDER BY
        c.updated_at DESC;
END;
$$;

-- Function to create a new conversation
CREATE OR REPLACE FUNCTION public.create_chat_conversation(
    p_user_id uuid,
    p_subject text,
    p_priority text DEFAULT 'medium'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    new_conversation_id uuid;
BEGIN
    -- Verify the user is creating a conversation for themselves
    IF auth.uid() != p_user_id THEN
        RAISE EXCEPTION 'Access denied: You can only create conversations for yourself';
    END IF;

    -- Validate priority
    IF p_priority NOT IN ('low', 'medium', 'high', 'urgent') THEN
        RAISE EXCEPTION 'Invalid priority. Must be one of: low, medium, high, urgent';
    END IF;

    -- Insert new conversation
    INSERT INTO public.conversations (user_id, subject, priority, status)
    VALUES (p_user_id, p_subject, p_priority, 'open')
    RETURNING id INTO new_conversation_id;

    RETURN new_conversation_id;
END;
$$;

-- Function to send a message in a conversation
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
    new_message_id uuid;
    conversation_user_id uuid;
    sender_is_admin boolean;
BEGIN
    -- Verify the sender is the authenticated user
    IF auth.uid() != p_sender_id THEN
        RAISE EXCEPTION 'Access denied: You can only send messages as yourself';
    END IF;

    -- Get conversation details
    SELECT user_id INTO conversation_user_id
    FROM public.conversations
    WHERE id = p_conversation_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Conversation not found';
    END IF;

    -- Check if sender is admin
    SELECT is_admin INTO sender_is_admin
    FROM public.users
    WHERE id = p_sender_id;

    -- Verify access: user can send to their own conversations, admins can send to any
    IF conversation_user_id != p_sender_id AND NOT COALESCE(sender_is_admin, false) THEN
        RAISE EXCEPTION 'Access denied: You can only send messages to your own conversations';
    END IF;

    -- Insert new message
    INSERT INTO public.messages (conversation_id, sender_id, content, is_admin_message)
    VALUES (p_conversation_id, p_sender_id, p_content, COALESCE(sender_is_admin, false))
    RETURNING id INTO new_message_id;

    -- Update conversation timestamp
    UPDATE public.conversations
    SET updated_at = now()
    WHERE id = p_conversation_id;

    RETURN new_message_id;
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
DECLARE
    conversation_user_id uuid;
BEGIN
    -- Verify the user is marking their own conversation as read
    IF auth.uid() != p_user_id THEN
        RAISE EXCEPTION 'Access denied: You can only mark your own messages as read';
    END IF;

    -- Get conversation details
    SELECT user_id INTO conversation_user_id
    FROM public.conversations
    WHERE id = p_conversation_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Conversation not found';
    END IF;

    -- Verify access
    IF conversation_user_id != p_user_id THEN
        RAISE EXCEPTION 'Access denied: You can only mark messages in your own conversations as read';
    END IF;

    -- Mark messages as read (only messages not sent by the user)
    UPDATE public.messages
    SET is_read = true
    WHERE conversation_id = p_conversation_id
    AND sender_id != p_user_id
    AND is_read = false;
END;
$$;

-- Function to close a conversation
CREATE OR REPLACE FUNCTION public.close_chat_conversation(
    p_conversation_id uuid,
    p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    conversation_user_id uuid;
    user_is_admin boolean;
BEGIN
    -- Verify the user is authenticated
    IF auth.uid() != p_user_id THEN
        RAISE EXCEPTION 'Access denied: Invalid user authentication';
    END IF;

    -- Get conversation details
    SELECT user_id INTO conversation_user_id
    FROM public.conversations
    WHERE id = p_conversation_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Conversation not found';
    END IF;

    -- Check if user is admin
    SELECT is_admin INTO user_is_admin
    FROM public.users
    WHERE id = p_user_id;

    -- Verify access: user can close their own conversations, admins can close any
    IF conversation_user_id != p_user_id AND NOT COALESCE(user_is_admin, false) THEN
        RAISE EXCEPTION 'Access denied: You can only close your own conversations';
    END IF;

    -- Close the conversation
    UPDATE public.conversations
    SET status = 'closed', updated_at = now()
    WHERE id = p_conversation_id;
END;
$$;

-- Admin function to get all conversations
CREATE OR REPLACE FUNCTION public.get_all_conversations_admin()
RETURNS TABLE (
    id uuid,
    user_id uuid,
    user_email text,
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
DECLARE
    user_is_admin boolean;
BEGIN
    -- Check if the current user is an admin
    SELECT is_admin INTO user_is_admin
    FROM public.users
    WHERE id = auth.uid();

    IF NOT COALESCE(user_is_admin, false) THEN
        RAISE EXCEPTION 'Access denied: Admin privileges required';
    END IF;

    RETURN QUERY
    SELECT
        c.id,
        c.user_id,
        u.email AS user_email,
        c.subject,
        c.status,
        c.priority,
        c.assigned_admin_id,
        c.created_at,
        c.updated_at,
        COALESCE((
            SELECT COUNT(*)::bigint 
            FROM public.messages m 
            WHERE m.conversation_id = c.id 
            AND m.is_read = FALSE 
            AND m.is_admin_message = FALSE
        ), 0) AS unread_count,
        (
            SELECT m.content 
            FROM public.messages m 
            WHERE m.conversation_id = c.id 
            ORDER BY m.created_at DESC 
            LIMIT 1
        ) AS last_message,
        (
            SELECT m.created_at 
            FROM public.messages m 
            WHERE m.conversation_id = c.id 
            ORDER BY m.created_at DESC 
            LIMIT 1
        ) AS last_message_time
    FROM
        public.conversations c
    JOIN
        public.users u ON c.user_id = u.id
    ORDER BY
        c.updated_at DESC;
END;
$$;

-- Function to assign conversation to admin
CREATE OR REPLACE FUNCTION public.assign_conversation_to_admin(
    p_conversation_id uuid,
    p_admin_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_is_admin boolean;
    target_is_admin boolean;
BEGIN
    -- Check if the current user is an admin
    SELECT is_admin INTO user_is_admin
    FROM public.users
    WHERE id = auth.uid();

    IF NOT COALESCE(user_is_admin, false) THEN
        RAISE EXCEPTION 'Access denied: Admin privileges required';
    END IF;

    -- Check if the target user is an admin
    SELECT is_admin INTO target_is_admin
    FROM public.users
    WHERE id = p_admin_id;

    IF NOT COALESCE(target_is_admin, false) THEN
        RAISE EXCEPTION 'Target user is not an admin';
    END IF;

    -- Assign the conversation
    UPDATE public.conversations
    SET assigned_admin_id = p_admin_id, updated_at = now()
    WHERE id = p_conversation_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Conversation not found';
    END IF;
END;
$$;