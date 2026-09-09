/*
  # Add agent name support to chat RPC functions

  1. Database Changes
    - Drop existing RPC functions to avoid conflicts
    - Recreate get_user_conversations with agent name fields
    - Recreate get_all_conversations_admin with agent name fields
    
  2. New Fields Added
    - assigned_admin_first_name (text)
    - assigned_admin_last_name (text)
    
  3. Security
    - Maintains existing RLS policies and security checks
    - Only returns agent names for conversations where user has access
*/

-- Drop existing functions to avoid conflicts
DROP FUNCTION IF EXISTS public.get_user_conversations(uuid);
DROP FUNCTION IF EXISTS public.get_all_conversations_admin();

-- Recreate get_user_conversations with agent name support
CREATE OR REPLACE FUNCTION public.get_user_conversations(p_user_id uuid)
RETURNS TABLE (
    id uuid,
    user_id uuid,
    subject text,
    status text,
    priority text,
    assigned_admin_id uuid,
    assigned_admin_first_name text,
    assigned_admin_last_name text,
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
        au.first_name AS assigned_admin_first_name,
        au.last_name AS assigned_admin_last_name,
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
    LEFT JOIN
        public.users au ON c.assigned_admin_id = au.id
    WHERE
        c.user_id = p_user_id
    ORDER BY
        c.updated_at DESC;
END;
$$;

-- Recreate get_all_conversations_admin with agent name support
CREATE OR REPLACE FUNCTION public.get_all_conversations_admin()
RETURNS TABLE (
    id uuid,
    user_id uuid,
    user_email text,
    subject text,
    status text,
    priority text,
    assigned_admin_id uuid,
    assigned_admin_first_name text,
    assigned_admin_last_name text,
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
    SELECT u.is_admin INTO user_is_admin
    FROM public.users u
    WHERE u.id = auth.uid();

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
        au.first_name AS assigned_admin_first_name,
        au.last_name AS assigned_admin_last_name,
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
    JOIN
        public.users u ON c.user_id = u.id
    LEFT JOIN
        public.users au ON c.assigned_admin_id = au.id
    ORDER BY
        c.updated_at DESC;
END;
$$;