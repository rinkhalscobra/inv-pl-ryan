/*
  # Support Chat System Database Schema

  1. New Tables
    - `conversations`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to users)
      - `subject` (text, conversation topic)
      - `status` (text, 'open', 'closed', 'pending')
      - `priority` (text, 'low', 'medium', 'high', 'urgent')
      - `assigned_admin_id` (uuid, foreign key to users for admin assignment)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `messages`
      - `id` (uuid, primary key)
      - `conversation_id` (uuid, foreign key to conversations)
      - `sender_id` (uuid, foreign key to users)
      - `content` (text, message content)
      - `is_read` (boolean, read status)
      - `is_admin_message` (boolean, indicates if sent by admin)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on both tables
    - Users can only access their own conversations and messages
    - Admins can access all conversations and messages
    - Proper foreign key constraints

  3. Functions
    - RPC functions for creating conversations and sending messages
    - Function to mark messages as read
    - Updated_at trigger for conversations
*/

-- Create conversations table
CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  priority text NOT NULL DEFAULT 'medium',
  assigned_admin_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create messages table
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content text NOT NULL,
  is_read boolean DEFAULT false,
  is_admin_message boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Add constraints for conversations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'conversations_status_check'
  ) THEN
    ALTER TABLE conversations ADD CONSTRAINT conversations_status_check
    CHECK (status = ANY (ARRAY['open'::text, 'closed'::text, 'pending'::text]));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'conversations_priority_check'
  ) THEN
    ALTER TABLE conversations ADD CONSTRAINT conversations_priority_check
    CHECK (priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'urgent'::text]));
  END IF;
END $$;

-- Create indexes for better performance
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_conversations_user_id'
  ) THEN
    CREATE INDEX idx_conversations_user_id ON conversations(user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_conversations_status'
  ) THEN
    CREATE INDEX idx_conversations_status ON conversations(status);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_conversations_assigned_admin'
  ) THEN
    CREATE INDEX idx_conversations_assigned_admin ON conversations(assigned_admin_id) WHERE assigned_admin_id IS NOT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_conversations_created_at'
  ) THEN
    CREATE INDEX idx_conversations_created_at ON conversations(created_at DESC);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_messages_conversation_id'
  ) THEN
    CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_messages_sender_id'
  ) THEN
    CREATE INDEX idx_messages_sender_id ON messages(sender_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_messages_created_at'
  ) THEN
    CREATE INDEX idx_messages_created_at ON messages(created_at DESC);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_messages_is_read'
  ) THEN
    CREATE INDEX idx_messages_is_read ON messages(is_read) WHERE is_read = false;
  END IF;
END $$;

-- Enable RLS on both tables
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for conversations table
DO $$
BEGIN
  -- Users can view their own conversations
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'conversations' AND policyname = 'Users can view own conversations'
  ) THEN
    CREATE POLICY "Users can view own conversations"
      ON conversations
      FOR SELECT
      TO authenticated
      USING (user_id = auth.uid());
  END IF;

  -- Users can create their own conversations
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'conversations' AND policyname = 'Users can create own conversations'
  ) THEN
    CREATE POLICY "Users can create own conversations"
      ON conversations
      FOR INSERT
      TO authenticated
      WITH CHECK (user_id = auth.uid());
  END IF;

  -- Users can update their own conversations (limited fields)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'conversations' AND policyname = 'Users can update own conversations'
  ) THEN
    CREATE POLICY "Users can update own conversations"
      ON conversations
      FOR UPDATE
      TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;

  -- Admins can view all conversations
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'conversations' AND policyname = 'Admins can view all conversations'
  ) THEN
    CREATE POLICY "Admins can view all conversations"
      ON conversations
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM users 
          WHERE users.id = auth.uid() AND users.is_admin = true
        )
      );
  END IF;

  -- Admins can update all conversations
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'conversations' AND policyname = 'Admins can update all conversations'
  ) THEN
    CREATE POLICY "Admins can update all conversations"
      ON conversations
      FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM users 
          WHERE users.id = auth.uid() AND users.is_admin = true
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM users 
          WHERE users.id = auth.uid() AND users.is_admin = true
        )
      );
  END IF;

  -- Service role can manage all conversations
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'conversations' AND policyname = 'Service role can manage all conversations'
  ) THEN
    CREATE POLICY "Service role can manage all conversations"
      ON conversations
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- RLS Policies for messages table
DO $$
BEGIN
  -- Users can view messages in their own conversations
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'messages' AND policyname = 'Users can view messages in own conversations'
  ) THEN
    CREATE POLICY "Users can view messages in own conversations"
      ON messages
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM conversations 
          WHERE conversations.id = messages.conversation_id 
          AND conversations.user_id = auth.uid()
        )
      );
  END IF;

  -- Users can send messages in their own conversations
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'messages' AND policyname = 'Users can send messages in own conversations'
  ) THEN
    CREATE POLICY "Users can send messages in own conversations"
      ON messages
      FOR INSERT
      TO authenticated
      WITH CHECK (
        sender_id = auth.uid() AND
        EXISTS (
          SELECT 1 FROM conversations 
          WHERE conversations.id = messages.conversation_id 
          AND conversations.user_id = auth.uid()
        )
      );
  END IF;

  -- Users can update read status of messages in their conversations
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'messages' AND policyname = 'Users can update read status in own conversations'
  ) THEN
    CREATE POLICY "Users can update read status in own conversations"
      ON messages
      FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM conversations 
          WHERE conversations.id = messages.conversation_id 
          AND conversations.user_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM conversations 
          WHERE conversations.id = messages.conversation_id 
          AND conversations.user_id = auth.uid()
        )
      );
  END IF;

  -- Admins can view all messages
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'messages' AND policyname = 'Admins can view all messages'
  ) THEN
    CREATE POLICY "Admins can view all messages"
      ON messages
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM users 
          WHERE users.id = auth.uid() AND users.is_admin = true
        )
      );
  END IF;

  -- Admins can send messages in any conversation
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'messages' AND policyname = 'Admins can send messages in any conversation'
  ) THEN
    CREATE POLICY "Admins can send messages in any conversation"
      ON messages
      FOR INSERT
      TO authenticated
      WITH CHECK (
        sender_id = auth.uid() AND
        EXISTS (
          SELECT 1 FROM users 
          WHERE users.id = auth.uid() AND users.is_admin = true
        )
      );
  END IF;

  -- Admins can update any message
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'messages' AND policyname = 'Admins can update any message'
  ) THEN
    CREATE POLICY "Admins can update any message"
      ON messages
      FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM users 
          WHERE users.id = auth.uid() AND users.is_admin = true
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM users 
          WHERE users.id = auth.uid() AND users.is_admin = true
        )
      );
  END IF;

  -- Service role can manage all messages
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'messages' AND policyname = 'Service role can manage all messages'
  ) THEN
    CREATE POLICY "Service role can manage all messages"
      ON messages
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Create updated_at trigger for conversations
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to conversations table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'update_conversations_updated_at'
  ) THEN
    CREATE TRIGGER update_conversations_updated_at
      BEFORE UPDATE ON conversations
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- RPC Functions for chat operations

-- Function to create a new conversation
CREATE OR REPLACE FUNCTION create_chat_conversation(
  p_subject text,
  p_priority text DEFAULT 'medium'
)
RETURNS uuid AS $$
DECLARE
  conversation_id uuid;
BEGIN
  -- Validate priority
  IF p_priority NOT IN ('low', 'medium', 'high', 'urgent') THEN
    RAISE EXCEPTION 'Invalid priority. Must be one of: low, medium, high, urgent';
  END IF;

  -- Insert new conversation
  INSERT INTO conversations (user_id, subject, priority, status)
  VALUES (auth.uid(), p_subject, p_priority, 'open')
  RETURNING id INTO conversation_id;
  
  RETURN conversation_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to send a message in a conversation
CREATE OR REPLACE FUNCTION send_chat_message(
  p_conversation_id uuid,
  p_content text
)
RETURNS uuid AS $$
DECLARE
  message_id uuid;
  is_admin boolean := false;
  conversation_user_id uuid;
BEGIN
  -- Check if sender is admin
  SELECT users.is_admin INTO is_admin
  FROM users
  WHERE users.id = auth.uid();
  
  -- Get conversation user_id
  SELECT user_id INTO conversation_user_id
  FROM conversations
  WHERE id = p_conversation_id;
  
  -- Verify user has access to this conversation
  IF NOT is_admin AND conversation_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Access denied to this conversation';
  END IF;
  
  -- Insert message
  INSERT INTO messages (conversation_id, sender_id, content, is_admin_message)
  VALUES (p_conversation_id, auth.uid(), p_content, is_admin)
  RETURNING id INTO message_id;
  
  -- Update conversation's updated_at timestamp
  UPDATE conversations 
  SET updated_at = now(),
      status = CASE 
        WHEN status = 'closed' AND NOT is_admin THEN 'open'
        ELSE status
      END
  WHERE id = p_conversation_id;
  
  RETURN message_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to mark messages as read
CREATE OR REPLACE FUNCTION mark_chat_messages_read(
  p_conversation_id uuid
)
RETURNS integer AS $$
DECLARE
  updated_count integer;
  is_admin boolean := false;
  conversation_user_id uuid;
BEGIN
  -- Check if user is admin
  SELECT users.is_admin INTO is_admin
  FROM users
  WHERE users.id = auth.uid();
  
  -- Get conversation user_id
  SELECT user_id INTO conversation_user_id
  FROM conversations
  WHERE id = p_conversation_id;
  
  -- Verify user has access to this conversation
  IF NOT is_admin AND conversation_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Access denied to this conversation';
  END IF;
  
  -- Mark messages as read (exclude messages sent by the current user)
  UPDATE messages 
  SET is_read = true
  WHERE conversation_id = p_conversation_id 
    AND sender_id != auth.uid()
    AND is_read = false;
    
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to close a conversation
CREATE OR REPLACE FUNCTION close_chat_conversation(
  p_conversation_id uuid
)
RETURNS boolean AS $$
DECLARE
  is_admin boolean := false;
  conversation_user_id uuid;
BEGIN
  -- Check if user is admin
  SELECT users.is_admin INTO is_admin
  FROM users
  WHERE users.id = auth.uid();
  
  -- Get conversation user_id
  SELECT user_id INTO conversation_user_id
  FROM conversations
  WHERE id = p_conversation_id;
  
  -- Verify user has access to this conversation
  IF NOT is_admin AND conversation_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Access denied to this conversation';
  END IF;
  
  -- Close the conversation
  UPDATE conversations 
  SET status = 'closed',
      updated_at = now()
  WHERE id = p_conversation_id;
  
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get conversation with unread message count
CREATE OR REPLACE FUNCTION get_user_conversations()
RETURNS TABLE (
  id uuid,
  subject text,
  status text,
  priority text,
  assigned_admin_id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  unread_count bigint,
  last_message_content text,
  last_message_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.subject,
    c.status,
    c.priority,
    c.assigned_admin_id,
    c.created_at,
    c.updated_at,
    COALESCE(unread.count, 0) as unread_count,
    last_msg.content as last_message_content,
    last_msg.created_at as last_message_at
  FROM conversations c
  LEFT JOIN (
    SELECT 
      conversation_id,
      COUNT(*) as count
    FROM messages 
    WHERE sender_id != auth.uid() AND is_read = false
    GROUP BY conversation_id
  ) unread ON c.id = unread.conversation_id
  LEFT JOIN (
    SELECT DISTINCT ON (conversation_id)
      conversation_id,
      content,
      created_at
    FROM messages
    ORDER BY conversation_id, created_at DESC
  ) last_msg ON c.id = last_msg.conversation_id
  WHERE c.user_id = auth.uid()
  ORDER BY c.updated_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function for admins to get all conversations with stats
CREATE OR REPLACE FUNCTION get_all_conversations_admin()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  user_email text,
  subject text,
  status text,
  priority text,
  assigned_admin_id uuid,
  assigned_admin_email text,
  created_at timestamptz,
  updated_at timestamptz,
  message_count bigint,
  unread_count bigint,
  last_message_content text,
  last_message_at timestamptz
) AS $$
BEGIN
  -- Check if user is admin
  IF NOT EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() AND users.is_admin = true
  ) THEN
    RAISE EXCEPTION 'Access denied. Admin privileges required.';
  END IF;

  RETURN QUERY
  SELECT 
    c.id,
    c.user_id,
    u.email as user_email,
    c.subject,
    c.status,
    c.priority,
    c.assigned_admin_id,
    admin_user.email as assigned_admin_email,
    c.created_at,
    c.updated_at,
    COALESCE(msg_stats.total_count, 0) as message_count,
    COALESCE(msg_stats.unread_count, 0) as unread_count,
    last_msg.content as last_message_content,
    last_msg.created_at as last_message_at
  FROM conversations c
  JOIN users u ON c.user_id = u.id
  LEFT JOIN users admin_user ON c.assigned_admin_id = admin_user.id
  LEFT JOIN (
    SELECT 
      conversation_id,
      COUNT(*) as total_count,
      COUNT(*) FILTER (WHERE is_read = false AND is_admin_message = false) as unread_count
    FROM messages 
    GROUP BY conversation_id
  ) msg_stats ON c.id = msg_stats.conversation_id
  LEFT JOIN (
    SELECT DISTINCT ON (conversation_id)
      conversation_id,
      content,
      created_at
    FROM messages
    ORDER BY conversation_id, created_at DESC
  ) last_msg ON c.id = last_msg.conversation_id
  ORDER BY c.updated_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to assign conversation to admin
CREATE OR REPLACE FUNCTION assign_conversation_to_admin(
  p_conversation_id uuid,
  p_admin_id uuid DEFAULT NULL
)
RETURNS boolean AS $$
DECLARE
  is_admin boolean := false;
BEGIN
  -- Check if user is admin
  SELECT users.is_admin INTO is_admin
  FROM users
  WHERE users.id = auth.uid();
  
  IF NOT is_admin THEN
    RAISE EXCEPTION 'Access denied. Admin privileges required.';
  END IF;
  
  -- If no admin_id provided, assign to current admin
  IF p_admin_id IS NULL THEN
    p_admin_id := auth.uid();
  END IF;
  
  -- Verify the admin_id is actually an admin
  IF NOT EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = p_admin_id AND users.is_admin = true
  ) THEN
    RAISE EXCEPTION 'Invalid admin ID provided';
  END IF;
  
  -- Update conversation
  UPDATE conversations 
  SET assigned_admin_id = p_admin_id,
      updated_at = now()
  WHERE id = p_conversation_id;
  
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;