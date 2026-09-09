/*
  # Add Notifications Table for User Alerts

  1. New Table
    - `notifications` - Stores notifications for users
    
  2. Security
    - Enable RLS on the new table
    - Add policies for authenticated users to access their own notifications
    - Add policy for service role to manage all notifications
    
  3. Features
    - Store notification type, message, and read status
    - Track when notifications were created
    - Maintain proper foreign key relationships
*/

-- Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  type text NOT NULL,
  message text NOT NULL,
  is_read boolean DEFAULT false,
  data jsonb,
  created_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies
CREATE POLICY "Users can view own notifications"
  ON notifications
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
  ON notifications
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role can manage all notifications"
  ON notifications
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read) WHERE is_read = false;

-- Update process-prop-challenge-lifecycle function to create notifications
CREATE OR REPLACE FUNCTION process_prop_challenge_lifecycle()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  challenge_rec record;
  now timestamp with time zone := now();
  current_profit numeric(20,8);
  current_drawdown_percentage numeric(10,4);
  result_message text;
BEGIN
  -- Fetch all active challenges
  FOR challenge_rec IN
    SELECT *
    FROM prop_account_balances
    WHERE status = 'active'
  LOOP
    -- Calculate current profit and drawdown
    current_profit := challenge_rec.current_balance - challenge_rec.starting_balance;
    current_drawdown_percentage := CASE 
      WHEN challenge_rec.starting_balance > 0 THEN
        ((challenge_rec.starting_balance - challenge_rec.current_balance) / challenge_rec.starting_balance) * 100
      ELSE 0
    END;
    
    -- Update max_drawdown_reached if current drawdown is higher
    IF current_drawdown_percentage > challenge_rec.max_drawdown_reached THEN
      UPDATE prop_account_balances
      SET max_drawdown_reached = current_drawdown_percentage
      WHERE id = challenge_rec.id;
      
      -- If max drawdown limit is exceeded, fail the challenge
      IF current_drawdown_percentage >= challenge_rec.max_drawdown THEN
        -- Update challenge status
        UPDATE prop_account_balances
        SET 
          status = 'failed',
          updated_at = now
        WHERE id = challenge_rec.id;
        
        -- Create notification
        INSERT INTO notifications (
          user_id,
          type,
          message,
          data
        ) VALUES (
          challenge_rec.user_id,
          'challenge_failed',
          'Challenge failed: Maximum drawdown limit exceeded',
          jsonb_build_object(
            'challenge_id', challenge_rec.challenge_id,
            'max_drawdown', challenge_rec.max_drawdown,
            'current_drawdown', current_drawdown_percentage,
            'starting_balance', challenge_rec.starting_balance,
            'current_balance', challenge_rec.current_balance
          )
        );
        
        -- Log the event
        INSERT INTO prop_logs (
          user_id,
          challenge_id,
          action,
          details
        ) VALUES (
          challenge_rec.user_id,
          challenge_rec.challenge_id,
          'challenge_failed',
          jsonb_build_object(
            'reason', 'Max drawdown exceeded',
            'max_drawdown', challenge_rec.max_drawdown,
            'current_drawdown', current_drawdown_percentage
          )
        );
        
        -- Update robot_states to clear active challenge
        UPDATE robot_states
        SET 
          active_challenge_id = null,
          challenge_account_balance = 0,
          challenge_profit_target = 0,
          challenge_max_drawdown = 0,
          challenge_time_limit = null
        WHERE 
          user_id = challenge_rec.user_id AND
          active_challenge_id = challenge_rec.challenge_id;
      END IF;
    END IF;
    
    -- Check if profit target is reached
    IF current_profit >= challenge_rec.target_profit THEN
      -- Update challenge status
      UPDATE prop_account_balances
      SET 
        status = 'completed',
        updated_at = now
      WHERE id = challenge_rec.id;
      
      -- Create notification
      INSERT INTO notifications (
        user_id,
        type,
        message,
        data
      ) VALUES (
        challenge_rec.user_id,
        'challenge_completed',
        'Congratulations! You have reached your profit target',
        jsonb_build_object(
          'challenge_id', challenge_rec.challenge_id,
          'target_profit', challenge_rec.target_profit,
          'current_profit', current_profit,
          'starting_balance', challenge_rec.starting_balance,
          'current_balance', challenge_rec.current_balance
        )
      );
      
      -- Log the event
      INSERT INTO prop_logs (
        user_id,
        challenge_id,
        action,
        details
      ) VALUES (
        challenge_rec.user_id,
        challenge_rec.challenge_id,
        'challenge_completed',
        jsonb_build_object(
          'reason', 'Profit target reached',
          'target_profit', challenge_rec.target_profit,
          'current_profit', current_profit
        )
      );
      
      -- Calculate reward amount based on challenge ID
      DECLARE
        reward_amount numeric(20,8);
        entry_fee_refund numeric(20,8);
        total_reward numeric(20,8);
      BEGIN
        -- Get reward amount
        CASE challenge_rec.challenge_id
          WHEN 'starter' THEN reward_amount := 300;
          WHEN 'bronze' THEN reward_amount := 600;
          WHEN 'silver' THEN reward_amount := 1200;
          WHEN 'gold' THEN reward_amount := 2400;
          WHEN 'platinum' THEN reward_amount := 5000;
          WHEN 'diamond' THEN reward_amount := 10000;
          ELSE reward_amount := 0;
        END CASE;
        
        -- Get entry fee refund
        CASE challenge_rec.challenge_id
          WHEN 'starter' THEN entry_fee_refund := 150;
          WHEN 'bronze' THEN entry_fee_refund := 300;
          WHEN 'silver' THEN entry_fee_refund := 600;
          WHEN 'gold' THEN entry_fee_refund := 1200;
          WHEN 'platinum' THEN entry_fee_refund := 2400;
          WHEN 'diamond' THEN entry_fee_refund := 4800;
          ELSE entry_fee_refund := 0;
        END CASE;
        
        total_reward := reward_amount + entry_fee_refund;
        
        -- Credit reward to user's main USDT balance
        IF total_reward > 0 THEN
          UPDATE balances
          SET usdt_balance = usdt_balance + total_reward
          WHERE user_id = challenge_rec.user_id;
          
          -- Add transaction record for reward
          INSERT INTO transactions (
            user_id,
            type,
            amount,
            description,
            status
          ) VALUES (
            challenge_rec.user_id,
            'challenge_reward',
            reward_amount,
            'Reward for completing ' || challenge_rec.challenge_id || ' challenge',
            'completed'
          );
          
          -- Add transaction record for entry fee refund
          INSERT INTO transactions (
            user_id,
            type,
            amount,
            description,
            status
          ) VALUES (
            challenge_rec.user_id,
            'challenge_reward',
            entry_fee_refund,
            'Entry fee refund for ' || challenge_rec.challenge_id || ' challenge',
            'completed'
          );
          
          -- Create notification for reward
          INSERT INTO notifications (
            user_id,
            type,
            message,
            data
          ) VALUES (
            challenge_rec.user_id,
            'challenge_reward',
            'You have received a reward of ' || total_reward || ' USDT for completing the ' || challenge_rec.challenge_id || ' challenge',
            jsonb_build_object(
              'challenge_id', challenge_rec.challenge_id,
              'reward_amount', reward_amount,
              'entry_fee_refund', entry_fee_refund,
              'total_reward', total_reward
            )
          );
        END IF;
      END;
      
      -- Update robot_states to clear active challenge
      UPDATE robot_states
      SET 
        active_challenge_id = null,
        challenge_account_balance = 0,
        challenge_profit_target = 0,
        challenge_max_drawdown = 0,
        challenge_time_limit = null
      WHERE 
        user_id = challenge_rec.user_id AND
        active_challenge_id = challenge_rec.challenge_id;
    END IF;
    
    -- Check for time limit expiration
    IF challenge_rec.end_date <= now THEN
      -- Update challenge status
      UPDATE prop_account_balances
      SET 
        status = 'failed',
        updated_at = now
      WHERE id = challenge_rec.id;
      
      -- Create notification
      INSERT INTO notifications (
        user_id,
        type,
        message,
        data
      ) VALUES (
        challenge_rec.user_id,
        'challenge_failed',
        'Challenge failed: Time limit expired',
        jsonb_build_object(
          'challenge_id', challenge_rec.challenge_id,
          'start_date', challenge_rec.start_date,
          'end_date', challenge_rec.end_date,
          'current_profit', current_profit,
          'target_profit', challenge_rec.target_profit
        )
      );
      
      -- Log the event
      INSERT INTO prop_logs (
        user_id,
        challenge_id,
        action,
        details
      ) VALUES (
        challenge_rec.user_id,
        challenge_rec.challenge_id,
        'challenge_failed',
        jsonb_build_object(
          'reason', 'Time limit expired',
          'start_date', challenge_rec.start_date,
          'end_date', challenge_rec.end_date
        )
      );
      
      -- Update robot_states to clear active challenge
      UPDATE robot_states
      SET 
        active_challenge_id = null,
        challenge_account_balance = 0,
        challenge_profit_target = 0,
        challenge_max_drawdown = 0,
        challenge_time_limit = null
      WHERE 
        user_id = challenge_rec.user_id AND
        active_challenge_id = challenge_rec.challenge_id;
    END IF;
  END LOOP;
END;
$$;

-- Update check_prop_liquidations function to create notifications
CREATE OR REPLACE FUNCTION check_prop_liquidations()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  position_rec record;
  user_rec record;
  current_price numeric(20,8);
  should_liquidate boolean;
  pnl numeric(20,8);
  roi numeric(10,4);
  challenge_balance numeric(20,8);
  total_cross_pnl numeric(20,8);
  total_cross_margin numeric(20,8);
  total_equity numeric(20,8);
BEGIN
  -- Process isolated margin positions first
  FOR position_rec IN
    SELECT *
    FROM prop_positions
    WHERE is_open = true AND margin_type = 'isolated'
  LOOP
    -- For isolated margin, liquidate when ROI reaches -100%
    should_liquidate := position_rec.roi <= -100;
    
    IF should_liquidate THEN
      -- Record the liquidation in history
      INSERT INTO prop_position_history (
        user_id,
        challenge_id,
        symbol,
        side,
        entry_price,
        exit_price,
        amount,
        leverage,
        margin,
        pnl,
        roi,
        open_time,
        close_time,
        duration_seconds
      ) VALUES (
        position_rec.user_id,
        position_rec.challenge_id,
        position_rec.symbol,
        position_rec.side,
        position_rec.entry_price,
        position_rec.current_price,
        position_rec.amount,
        position_rec.leverage,
        position_rec.margin,
        -position_rec.margin, -- Full loss on liquidation
        -100, -- -100% ROI
        position_rec.created_at,
        now(),
        EXTRACT(EPOCH FROM (now() - position_rec.created_at))::integer
      );
      
      -- Delete the liquidated position
      DELETE FROM prop_positions WHERE id = position_rec.id;
      
      -- Log the liquidation
      INSERT INTO prop_logs (user_id, challenge_id, action, details)
      VALUES (
        position_rec.user_id,
        position_rec.challenge_id,
        'position_liquidated',
        jsonb_build_object(
          'position_id', position_rec.id,
          'symbol', position_rec.symbol,
          'side', position_rec.side,
          'entry_price', position_rec.entry_price,
          'exit_price', position_rec.current_price,
          'margin', position_rec.margin,
          'pnl', -position_rec.margin
        )
      );
      
      -- Create notification for position liquidation
      INSERT INTO notifications (
        user_id,
        type,
        message,
        data
      ) VALUES (
        position_rec.user_id,
        'position_liquidated',
        'Position liquidated: ' || position_rec.symbol || ' ' || position_rec.side,
        jsonb_build_object(
          'challenge_id', position_rec.challenge_id,
          'symbol', position_rec.symbol,
          'side', position_rec.side,
          'entry_price', position_rec.entry_price,
          'exit_price', position_rec.current_price,
          'margin', position_rec.margin,
          'pnl', -position_rec.margin
        )
      );
      
      -- Check if challenge failed due to max drawdown
      UPDATE prop_account_balances pab
      SET 
        max_drawdown_reached = GREATEST(
          max_drawdown_reached,
          (1 - (current_balance / starting_balance)) * 100
        ),
        status = CASE 
          WHEN (1 - (current_balance / starting_balance)) * 100 > max_drawdown THEN 'failed'
          ELSE status
        END,
        updated_at = now()
      WHERE 
        user_id = position_rec.user_id AND 
        challenge_id = position_rec.challenge_id;
      
      -- Log challenge failure if applicable
      IF EXISTS (
        SELECT 1 FROM prop_account_balances 
        WHERE user_id = position_rec.user_id 
          AND challenge_id = position_rec.challenge_id
          AND status = 'failed'
      ) THEN
        INSERT INTO prop_logs (user_id, challenge_id, action, details)
        VALUES (
          position_rec.user_id,
          position_rec.challenge_id,
          'challenge_failed',
          jsonb_build_object(
            'reason', 'Max drawdown exceeded',
            'position_id', position_rec.id
          )
        );
        
        -- Create notification for challenge failure
        INSERT INTO notifications (
          user_id,
          type,
          message,
          data
        ) VALUES (
          position_rec.user_id,
          'challenge_failed',
          'Challenge failed: Maximum drawdown exceeded',
          jsonb_build_object(
            'challenge_id', position_rec.challenge_id,
            'max_drawdown', (SELECT max_drawdown FROM prop_account_balances WHERE user_id = position_rec.user_id AND challenge_id = position_rec.challenge_id),
            'current_drawdown', (SELECT max_drawdown_reached FROM prop_account_balances WHERE user_id = position_rec.user_id AND challenge_id = position_rec.challenge_id)
          )
        );
        
        -- Update robot_states to clear active challenge
        UPDATE robot_states
        SET 
          active_challenge_id = null,
          challenge_account_balance = 0,
          challenge_profit_target = 0,
          challenge_max_drawdown = 0,
          challenge_time_limit = null
        WHERE 
          user_id = position_rec.user_id AND
          active_challenge_id = position_rec.challenge_id;
      END IF;
    END IF;
  END LOOP;

  -- Now process cross margin positions by user and challenge
  FOR user_rec IN
    SELECT DISTINCT user_id, challenge_id
    FROM prop_positions
    WHERE is_open = true AND margin_type = 'cross'
  LOOP
    -- Get challenge balance
    SELECT current_balance INTO challenge_balance
    FROM prop_account_balances
    WHERE user_id = user_rec.user_id AND challenge_id = user_rec.challenge_id;
    
    -- Calculate total unrealized PnL for all cross margin positions
    SELECT COALESCE(SUM(unrealized_pnl), 0), COALESCE(SUM(margin), 0)
    INTO total_cross_pnl, total_cross_margin
    FROM prop_positions
    WHERE user_id = user_rec.user_id 
      AND challenge_id = user_rec.challenge_id 
      AND is_open = true 
      AND margin_type = 'cross';
    
    -- Calculate total equity (balance + total PnL)
    total_equity := challenge_balance + total_cross_pnl;
    
    -- Check if total equity is negative or zero (account is liquidated)
    IF total_equity <= 0 THEN
      -- Liquidate all cross margin positions for this user and challenge
      FOR position_rec IN
        SELECT *
        FROM prop_positions
        WHERE user_id = user_rec.user_id 
          AND challenge_id = user_rec.challenge_id 
          AND is_open = true 
          AND margin_type = 'cross'
      LOOP
        -- Record the liquidation in history
        INSERT INTO prop_position_history (
          user_id,
          challenge_id,
          symbol,
          side,
          entry_price,
          exit_price,
          amount,
          leverage,
          margin,
          pnl,
          roi,
          open_time,
          close_time,
          duration_seconds
        ) VALUES (
          position_rec.user_id,
          position_rec.challenge_id,
          position_rec.symbol,
          position_rec.side,
          position_rec.entry_price,
          position_rec.current_price,
          position_rec.amount,
          position_rec.leverage,
          position_rec.margin,
          position_rec.unrealized_pnl, -- Actual PnL at liquidation
          position_rec.roi, -- Actual ROI at liquidation
          position_rec.created_at,
          now(),
          EXTRACT(EPOCH FROM (now() - position_rec.created_at))::integer
        );
        
        -- Log the liquidation
        INSERT INTO prop_logs (user_id, challenge_id, action, details)
        VALUES (
          position_rec.user_id,
          position_rec.challenge_id,
          'position_liquidated',
          jsonb_build_object(
            'position_id', position_rec.id,
            'symbol', position_rec.symbol,
            'side', position_rec.side,
            'entry_price', position_rec.entry_price,
            'exit_price', position_rec.current_price,
            'pnl', position_rec.unrealized_pnl,
            'roi', position_rec.roi,
            'liquidation_type', 'cross_margin'
          )
        );
        
        -- Create notification for position liquidation
        INSERT INTO notifications (
          user_id,
          type,
          message,
          data
        ) VALUES (
          position_rec.user_id,
          'position_liquidated',
          'Cross margin position liquidated: ' || position_rec.symbol || ' ' || position_rec.side,
          jsonb_build_object(
            'challenge_id', position_rec.challenge_id,
            'symbol', position_rec.symbol,
            'side', position_rec.side,
            'entry_price', position_rec.entry_price,
            'exit_price', position_rec.current_price,
            'pnl', position_rec.unrealized_pnl,
            'roi', position_rec.roi
          )
        );
      END LOOP;
      
      -- Delete all cross margin positions for this user and challenge
      DELETE FROM prop_positions 
      WHERE user_id = user_rec.user_id 
        AND challenge_id = user_rec.challenge_id 
        AND is_open = true 
        AND margin_type = 'cross';
      
      -- Set challenge balance to zero
      UPDATE prop_account_balances
      SET 
        current_balance = 0,
        max_drawdown_reached = 100, -- 100% drawdown
        status = 'failed',
        updated_at = now()
      WHERE user_id = user_rec.user_id AND challenge_id = user_rec.challenge_id;
      
      -- Log challenge failure
      INSERT INTO prop_logs (user_id, challenge_id, action, details)
      VALUES (
        user_rec.user_id,
        user_rec.challenge_id,
        'challenge_failed',
        jsonb_build_object(
          'reason', 'Account liquidated (cross margin)',
          'total_equity', total_equity,
          'challenge_balance', challenge_balance,
          'total_pnl', total_cross_pnl
        )
      );
      
      -- Create notification for challenge failure
      INSERT INTO notifications (
        user_id,
        type,
        message,
        data
      ) VALUES (
        user_rec.user_id,
        'challenge_failed',
        'Challenge failed: Account liquidated (cross margin)',
        jsonb_build_object(
          'challenge_id', user_rec.challenge_id,
          'total_equity', total_equity,
          'challenge_balance', challenge_balance,
          'total_pnl', total_cross_pnl
        )
      );
      
      -- Update robot_states to clear active challenge
      UPDATE robot_states
      SET 
        active_challenge_id = null,
        challenge_account_balance = 0,
        challenge_profit_target = 0,
        challenge_max_drawdown = 0,
        challenge_time_limit = null
      WHERE 
        user_id = user_rec.user_id AND
        active_challenge_id = user_rec.challenge_id;
    END IF;
  END LOOP;

  -- Check for stop loss / take profit for remaining positions
  FOR position_rec IN
    SELECT *
    FROM prop_positions
    WHERE is_open = true
  LOOP
    IF position_rec.sl_price IS NOT NULL THEN
      IF (position_rec.side = 'long' AND position_rec.current_price <= position_rec.sl_price) OR
         (position_rec.side = 'short' AND position_rec.current_price >= position_rec.sl_price) THEN
        -- Close position at stop loss
        PERFORM close_prop_position(position_rec.id, position_rec.current_price);
        
        -- Create notification for stop loss hit
        INSERT INTO notifications (
          user_id,
          type,
          message,
          data
        ) VALUES (
          position_rec.user_id,
          'stop_loss_triggered',
          'Stop loss triggered: ' || position_rec.symbol || ' ' || position_rec.side,
          jsonb_build_object(
            'challenge_id', position_rec.challenge_id,
            'symbol', position_rec.symbol,
            'side', position_rec.side,
            'entry_price', position_rec.entry_price,
            'stop_loss', position_rec.sl_price,
            'current_price', position_rec.current_price
          )
        );
      END IF;
    END IF;
    
    IF position_rec.tp_price IS NOT NULL THEN
      IF (position_rec.side = 'long' AND position_rec.current_price >= position_rec.tp_price) OR
         (position_rec.side = 'short' AND position_rec.current_price <= position_rec.tp_price) THEN
        -- Close position at take profit
        PERFORM close_prop_position(position_rec.id, position_rec.current_price);
        
        -- Create notification for take profit hit
        INSERT INTO notifications (
          user_id,
          type,
          message,
          data
        ) VALUES (
          position_rec.user_id,
          'take_profit_triggered',
          'Take profit triggered: ' || position_rec.symbol || ' ' || position_rec.side,
          jsonb_build_object(
            'challenge_id', position_rec.challenge_id,
            'symbol', position_rec.symbol,
            'side', position_rec.side,
            'entry_price', position_rec.entry_price,
            'take_profit', position_rec.tp_price,
            'current_price', position_rec.current_price
          )
        );
      END IF;
    END IF;
  END LOOP;
  
  -- Check if any challenges have reached their profit target
  UPDATE prop_account_balances
  SET 
    status = 'completed',
    updated_at = now()
  WHERE 
    status = 'active' AND
    current_balance >= (starting_balance + target_profit);
  
  -- Log challenge completions
  INSERT INTO prop_logs (user_id, challenge_id, action, details)
  SELECT 
    user_id,
    challenge_id,
    'challenge_completed',
    jsonb_build_object(
      'starting_balance', starting_balance,
      'final_balance', current_balance,
      'profit', current_balance - starting_balance,
      'profit_percentage', ((current_balance - starting_balance) / starting_balance) * 100,
      'max_drawdown_reached', max_drawdown_reached
    )
  FROM prop_account_balances
  WHERE status = 'completed'
    AND id NOT IN (
      SELECT (details->>'account_balance_id')::uuid
      FROM prop_logs
      WHERE action = 'challenge_completed'
        AND details->>'account_balance_id' IS NOT NULL
    );
END;
$$;