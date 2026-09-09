/*
  # Fix ambiguous column reference in get_user_conversations function

  1. Database Functions
    - Drop and recreate `get_user_conversations` function with properly qualified column references
    - Fix ambiguous "id" column references by using table aliases (c.id, m.id)
    - Ensure all column references are fully qualified to avoid SQL ambiguity errors

  2. Security
    - Maintain existing security checks and user authentication
    - Preserve SECURITY DEFINER permissions for proper access control
*/

-- Drop the existing function to avoid conflicts
DROP FUNCTION IF EXISTS public.get_user_conversations(uuid);

-- Recreate the function with properly qualified column references
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
            SELECT m2.content 
            FROM public.messages m2 
            WHERE m2.conversation_id = c.id 
            ORDER BY m2.created_at DESC 
            LIMIT 1
        ) AS last_message,
        (
            SELECT m3.created_at 
            FROM public.messages m3 
            WHERE m3.conversation_id = c.id 
            ORDER BY m3.created_at DESC 
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