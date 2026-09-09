```sql
-- Add image_url column to public.messages
ALTER TABLE public.messages
ADD COLUMN image_url text;

-- Drop the existing send_chat_message function
DROP FUNCTION IF EXISTS public.send_chat_message(p_conversation_id uuid, p_sender_id uuid, p_content text);

-- Recreate the send_chat_message function with p_image_url parameter
CREATE OR REPLACE FUNCTION public.send_chat_message(
    p_conversation_id uuid,
    p_sender_id uuid,
    p_content text,
    p_image_url text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_message_id uuid;
    v_is_admin_sender boolean;
    v_conversation_exists boolean;
    v_conversation_user_id uuid;
BEGIN
    -- Check if the conversation exists and get its user_id
    SELECT EXISTS(SELECT 1 FROM public.conversations WHERE id = p_conversation_id), user_id
    INTO v_conversation_exists, v_conversation_user_id
    FROM public.conversations
    WHERE id = p_conversation_id;

    IF NOT v_conversation_exists THEN
        RAISE EXCEPTION 'Conversation with ID % does not exist.', p_conversation_id;
    END IF;

    -- Determine if the sender is an admin
    SELECT is_admin INTO v_is_admin_sender
    FROM public.users
    WHERE id = p_sender_id;

    -- Check if the sender is either the conversation owner or an admin
    IF p_sender_id != v_conversation_user_id AND NOT v_is_admin_sender THEN
        RAISE EXCEPTION 'Sender is not authorized to send messages in this conversation.';
    END IF;

    -- Insert the new message
    INSERT INTO public.messages (conversation_id, sender_id, content, is_admin_message, image_url)
    VALUES (p_conversation_id, p_sender_id, p_content, v_is_admin_sender, p_image_url)
    RETURNING id INTO v_message_id;

    -- Update the conversation's updated_at timestamp
    UPDATE public.conversations
    SET updated_at = now()
    WHERE id = p_conversation_id;

    RETURN v_message_id;
END;
$$;

-- Set ownership for the new function
ALTER FUNCTION public.send_chat_message(p_conversation_id uuid, p_sender_id uuid, p_content text, p_image_url text) OWNER TO postgres;

-- Grant execute permissions to authenticated role
GRANT EXECUTE ON FUNCTION public.send_chat_message(p_conversation_id uuid, p_sender_id uuid, p_content text, p_image_url text) TO authenticated;
```