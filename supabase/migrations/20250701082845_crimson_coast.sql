/*
  # Admin Management Functions

  1. New Functions
    - Functions for admins to manage user data
    - Functions to close positions, cancel orders, and adjust balances
    - Functions to update position entry prices
    
  2. Security
    - All functions are SECURITY DEFINER
    - All functions check if the caller is an admin
*/

-- Function for admins to close a futures position
CREATE OR REPLACE FUNCTION close_futures_position_admin(
  admin_user_id uuid,
  position_id uuid,
  exit_price numeric
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  pos record;
  pnl numeric(20,8);
  roi numeric(10,4);
  duration interval;
  history_id uuid;
  is_admin boolean;
BEGIN
  -- Check if the caller is an admin
  SELECT check_admin_role(admin_user_id) INTO is_admin;
  
  IF NOT is_admin THEN
    RAISE EXCEPTION 'Only administrators can call this function';
  END IF;

  -- Get position details
  SELECT * INTO pos FROM futures_positions WHERE id = position_id AND is_open = true;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Position not found or already closed';
  END IF;
  
  -- Calculate PnL
  IF pos.side = 'long' THEN
    pnl := (exit_price - pos.entry_price) * pos.amount * pos.leverage;
  ELSE
    pnl := (pos.entry_price - exit_price) * pos.amount * pos.leverage;
  END IF;
  
  -- Calculate ROI
  roi := (pnl / pos.margin) * 100;
  
  -- Calculate duration
  duration := now() - pos.created_at;
  
  -- Insert into history
  INSERT INTO futures_position_history (
    user_id,
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
    pos.user_id,
    pos.symbol,
    pos.side,
    pos.entry_price,
    exit_price,
    pos.amount,
    pos.leverage,
    pos.margin,
    pnl,
    roi,
    pos.created_at,
    now(),
    EXTRACT(EPOCH FROM duration)::integer
  ) RETURNING id INTO history_id;
  
  -- Return margin + PnL to user's balance
  UPDATE balances
  SET usdt_balance = usdt_balance + (pos.margin + pnl),
      updated_at = now()
  WHERE user_id = pos.user_id;
  
  -- Add transaction record
  INSERT INTO transactions (
    user_id,
    type,
    amount,
    description,
    status
  ) VALUES (
    pos.user_id,
    'trade',
    pnl,
    'Closed ' || pos.side || ' position for ' || pos.symbol || ' with ' || 
      CASE WHEN pnl >= 0 THEN 'profit' ELSE 'loss' END || ' of ' || ABS(pnl) || ' USDT (by admin)',
    'completed'
  );
  
  -- Delete the position
  DELETE FROM futures_positions WHERE id = position_id;
  
  -- Log the admin action
  INSERT INTO system_logs (action, details)
  VALUES (
    'admin_close_position',
    'Admin ' || admin_user_id || ' closed position ' || position_id || ' for user ' || pos.user_id || 
    ' with exit price ' || exit_price || ' and PnL ' || pnl
  );
  
  -- Return the history record ID
  RETURN history_id;
END;
$$;

-- Function for admins to close a prop position
CREATE OR REPLACE FUNCTION close_prop_position_admin(
  admin_user_id uuid,
  position_id uuid,
  exit_price numeric
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  pos record;
  pnl numeric(20,8);
  roi numeric(10,4);
  duration interval;
  history_id uuid;
  is_admin boolean;
BEGIN
  -- Check if the caller is an admin
  SELECT check_admin_role(admin_user_id) INTO is_admin;
  
  IF NOT is_admin THEN
    RAISE EXCEPTION 'Only administrators can call this function';
  END IF;

  -- Get position details
  SELECT * INTO pos FROM prop_positions WHERE id = position_id AND is_open = true;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Position not found or already closed';
  END IF;
  
  -- Calculate PnL
  IF pos.side = 'long' THEN
    pnl := (exit_price - pos.entry_price) * pos.amount * pos.leverage;
  ELSE
    pnl := (pos.entry_price - exit_price) * pos.amount * pos.leverage;
  END IF;
  
  -- Calculate ROI
  roi := (pnl / pos.margin) * 100;
  
  -- Calculate duration
  duration := now() - pos.created_at;
  
  -- Insert into history
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
    pos.user_id,
    pos.challenge_id,
    pos.symbol,
    pos.side,
    pos.entry_price,
    exit_price,
    pos.amount,
    pos.leverage,
    pos.margin,
    pnl,
    roi,
    pos.created_at,
    now(),
    EXTRACT(EPOCH FROM duration)::integer
  ) RETURNING id INTO history_id;
  
  -- Return margin + PnL to challenge balance
  UPDATE prop_account_balances
  SET 
    current_balance = current_balance + (pos.margin + pnl),
    -- Update max_balance if current balance is higher
    max_balance = GREATEST(max_balance, current_balance + (pos.margin + pnl)),
    updated_at = now()
  WHERE 
    user_id = pos.user_id AND 
    challenge_id = pos.challenge_id;
  
  -- Delete the position
  DELETE FROM prop_positions WHERE id = position_id;
  
  -- Log the position close
  INSERT INTO prop_logs (user_id, challenge_id, action, details)
  VALUES (
    pos.user_id,
    pos.challenge_id,
    'position_closed_by_admin',
    jsonb_build_object(
      'position_id', pos.id,
      'symbol', pos.symbol,
      'side', pos.side,
      'entry_price', pos.entry_price,
      'exit_price', exit_price,
      'pnl', pnl,
      'roi', roi,
      'admin_id', admin_user_id
    )
  );
  
  -- Log the admin action
  INSERT INTO system_logs (action, details)
  VALUES (
    'admin_close_prop_position',
    'Admin ' || admin_user_id || ' closed prop position ' || position_id || ' for user ' || pos.user_id || 
    ' with exit price ' || exit_price || ' and PnL ' || pnl
  );
  
  -- Return the history record ID
  RETURN history_id;
END;
$$;

-- Function for admins to cancel a futures order
CREATE OR REPLACE FUNCTION cancel_futures_order_admin(
  admin_user_id uuid,
  order_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  order_rec record;
  is_admin boolean;
BEGIN
  -- Check if the caller is an admin
  SELECT check_admin_role(admin_user_id) INTO is_admin;
  
  IF NOT is_admin THEN
    RAISE EXCEPTION 'Only administrators can call this function';
  END IF;

  -- Get the order details
  SELECT * INTO order_rec
  FROM futures_orders
  WHERE id = order_id AND status = 'open';
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found or not open';
  END IF;
  
  -- For limit orders, refund the margin
  IF order_rec.type = 'limit' OR order_rec.type = 'stop' THEN
    -- Calculate the margin
    DECLARE
      margin numeric(20,8);
    BEGIN
      IF order_rec.price IS NOT NULL THEN
        margin := (order_rec.amount * order_rec.price) / order_rec.leverage;
      ELSE
        -- For market orders or orders without price, get current price
        DECLARE
          current_price numeric(20,8);
        BEGIN
          SELECT price INTO current_price
          FROM market_data
          WHERE symbol = order_rec.symbol
          ORDER BY timestamp DESC
          LIMIT 1;
          
          margin := (order_rec.amount * current_price) / order_rec.leverage;
        END;
      END IF;
      
      -- Refund margin to user's balance
      UPDATE balances
      SET usdt_balance = usdt_balance + margin,
          updated_at = now()
      WHERE user_id = order_rec.user_id;
      
      -- Add transaction record
      INSERT INTO transactions (
        user_id,
        type,
        amount,
        description,
        status
      ) VALUES (
        order_rec.user_id,
        'trade',
        margin,
        'Refund for cancelled ' || order_rec.type || ' order for ' || order_rec.symbol || ' (by admin)',
        'completed'
      );
    END;
  END IF;
  
  -- Update order status to cancelled
  UPDATE futures_orders
  SET status = 'cancelled',
      updated_at = now()
  WHERE id = order_id;
  
  -- Log the admin action
  INSERT INTO system_logs (action, details)
  VALUES (
    'admin_cancel_order',
    'Admin ' || admin_user_id || ' cancelled order ' || order_id || ' for user ' || order_rec.user_id
  );
  
  RETURN true;
END;
$$;

-- Function for admins to cancel a prop order
CREATE OR REPLACE FUNCTION cancel_prop_order_admin(
  admin_user_id uuid,
  order_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  order_rec record;
  is_admin boolean;
BEGIN
  -- Check if the caller is an admin
  SELECT check_admin_role(admin_user_id) INTO is_admin;
  
  IF NOT is_admin THEN
    RAISE EXCEPTION 'Only administrators can call this function';
  END IF;

  -- Get the order details
  SELECT * INTO order_rec
  FROM prop_orders
  WHERE id = order_id AND status = 'open';
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found or not open';
  END IF;
  
  -- Update order status to cancelled
  UPDATE prop_orders
  SET status = 'cancelled'
  WHERE id = order_id;
  
  -- Log the cancellation
  INSERT INTO prop_logs (user_id, challenge_id, action, details)
  VALUES (
    order_rec.user_id,
    order_rec.challenge_id,
    'order_cancelled_by_admin',
    jsonb_build_object(
      'order_id', order_rec.id,
      'symbol', order_rec.symbol,
      'side', order_rec.side,
      'type', order_rec.type,
      'admin_id', admin_user_id
    )
  );
  
  -- Log the admin action
  INSERT INTO system_logs (action, details)
  VALUES (
    'admin_cancel_prop_order',
    'Admin ' || admin_user_id || ' cancelled prop order ' || order_id || ' for user ' || order_rec.user_id
  );
  
  RETURN true;
END;
$$;

-- Function for admins to update a futures position entry price
CREATE OR REPLACE FUNCTION update_futures_position_entry_price_admin(
  admin_user_id uuid,
  position_id uuid,
  new_entry_price numeric
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  pos record;
  is_admin boolean;
  old_entry_price numeric(20,8);
  new_liquidation_price numeric(20,8);
  new_unrealized_pnl numeric(20,8);
  new_roi numeric(10,4);
BEGIN
  -- Check if the caller is an admin
  SELECT check_admin_role(admin_user_id) INTO is_admin;
  
  IF NOT is_admin THEN
    RAISE EXCEPTION 'Only administrators can call this function';
  END IF;

  -- Get position details
  SELECT * INTO pos FROM futures_positions WHERE id = position_id AND is_open = true;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Position not found or already closed';
  END IF;
  
  -- Store old entry price for logging
  old_entry_price := pos.entry_price;
  
  -- Calculate new liquidation price
  IF pos.side = 'long' THEN
    new_liquidation_price := new_entry_price * (1 - (1 / pos.leverage) * 0.95);
  ELSE
    new_liquidation_price := new_entry_price * (1 + (1 / pos.leverage) * 0.95);
  END IF;
  
  -- Calculate new unrealized PnL
  IF pos.side = 'long' THEN
    new_unrealized_pnl := (pos.current_price - new_entry_price) * pos.amount * pos.leverage;
  ELSE
    new_unrealized_pnl := (new_entry_price - pos.current_price) * pos.amount * pos.leverage;
  END IF;
  
  -- Calculate new ROI
  new_roi := (new_unrealized_pnl / pos.margin) * 100;
  
  -- Update position
  UPDATE futures_positions
  SET 
    entry_price = new_entry_price,
    liquidation_price = new_liquidation_price,
    unrealized_pnl = new_unrealized_pnl,
    roi = new_roi,
    updated_at = now()
  WHERE id = position_id;
  
  -- Log the admin action
  INSERT INTO system_logs (action, details)
  VALUES (
    'admin_update_position_entry_price',
    'Admin ' || admin_user_id || ' updated entry price for position ' || position_id || 
    ' from ' || old_entry_price || ' to ' || new_entry_price || 
    ' for user ' || pos.user_id
  );
  
  RETURN true;
END;
$$;

-- Function for admins to update a prop position entry price
CREATE OR REPLACE FUNCTION update_prop_position_entry_price_admin(
  admin_user_id uuid,
  position_id uuid,
  new_entry_price numeric
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  pos record;
  is_admin boolean;
  old_entry_price numeric(20,8);
  new_liquidation_price numeric(20,8);
  new_unrealized_pnl numeric(20,8);
  new_roi numeric(10,4);
BEGIN
  -- Check if the caller is an admin
  SELECT check_admin_role(admin_user_id) INTO is_admin;
  
  IF NOT is_admin THEN
    RAISE EXCEPTION 'Only administrators can call this function';
  END IF;

  -- Get position details
  SELECT * INTO pos FROM prop_positions WHERE id = position_id AND is_open = true;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Position not found or already closed';
  END IF;
  
  -- Store old entry price for logging
  old_entry_price := pos.entry_price;
  
  -- Calculate new liquidation price
  IF pos.side = 'long' THEN
    new_liquidation_price := new_entry_price * (1 - (1 / pos.leverage) * 0.95);
  ELSE
    new_liquidation_price := new_entry_price * (1 + (1 / pos.leverage) * 0.95);
  END IF;
  
  -- Calculate new unrealized PnL
  IF pos.side = 'long' THEN
    new_unrealized_pnl := (pos.current_price - new_entry_price) * pos.amount * pos.leverage;
  ELSE
    new_unrealized_pnl := (new_entry_price - pos.current_price) * pos.amount * pos.leverage;
  END IF;
  
  -- Calculate new ROI
  new_roi := (new_unrealized_pnl / pos.margin) * 100;
  
  -- Update position
  UPDATE prop_positions
  SET 
    entry_price = new_entry_price,
    liquidation_price = new_liquidation_price,
    unrealized_pnl = new_unrealized_pnl,
    roi = new_roi,
    updated_at = now()
  WHERE id = position_id;
  
  -- Log the admin action
  INSERT INTO prop_logs (user_id, challenge_id, action, details)
  VALUES (
    pos.user_id,
    pos.challenge_id,
    'position_entry_price_updated_by_admin',
    jsonb_build_object(
      'position_id', pos.id,
      'old_entry_price', old_entry_price,
      'new_entry_price', new_entry_price,
      'admin_id', admin_user_id
    )
  );
  
  RETURN true;
END;
$$;

-- Function for admins to adjust user balances
CREATE OR REPLACE FUNCTION adjust_user_balance_admin(
  admin_user_id uuid,
  target_user_id uuid,
  usdt_amount numeric,
  btc_amount numeric,
  description text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  is_admin boolean;
  transaction_type text;
BEGIN
  -- Check if the caller is an admin
  SELECT check_admin_role(admin_user_id) INTO is_admin;
  
  IF NOT is_admin THEN
    RAISE EXCEPTION 'Only administrators can call this function';
  END IF;

  -- Determine transaction type based on amounts
  IF usdt_amount >= 0 AND btc_amount >= 0 THEN
    transaction_type := 'deposit';
  ELSE
    transaction_type := 'withdrawal';
  END IF;
  
  -- Update USDT balance if amount is not zero
  IF usdt_amount != 0 THEN
    UPDATE balances
    SET usdt_balance = usdt_balance + usdt_amount,
        updated_at = now()
    WHERE user_id = target_user_id;
    
    -- Add transaction record for USDT
    INSERT INTO transactions (
      user_id,
      type,
      amount,
      description,
      status
    ) VALUES (
      target_user_id,
      transaction_type,
      usdt_amount,
      description || ' (USDT adjustment by admin)',
      'completed'
    );
  END IF;
  
  -- Update BTC balance if amount is not zero
  IF btc_amount != 0 THEN
    UPDATE balances
    SET btc_balance = btc_balance + btc_amount,
        updated_at = now()
    WHERE user_id = target_user_id;
    
    -- Add transaction record for BTC
    INSERT INTO transactions (
      user_id,
      type,
      amount,
      description,
      status
    ) VALUES (
      target_user_id,
      transaction_type,
      btc_amount,
      description || ' (BTC adjustment by admin)',
      'completed'
    );
  END IF;
  
  -- Log the admin action
  INSERT INTO system_logs (action, details)
  VALUES (
    'admin_adjust_balance',
    'Admin ' || admin_user_id || ' adjusted balance for user ' || target_user_id || 
    ' by ' || usdt_amount || ' USDT and ' || btc_amount || ' BTC. Reason: ' || description
  );
  
  RETURN true;
END;
$$;

-- Function for admins to set a user as admin
CREATE OR REPLACE FUNCTION set_user_admin_status(
  admin_user_id uuid,
  target_user_id uuid,
  is_admin_status boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  is_admin boolean;
BEGIN
  -- Check if the caller is an admin
  SELECT check_admin_role(admin_user_id) INTO is_admin;
  
  IF NOT is_admin THEN
    RAISE EXCEPTION 'Only administrators can call this function';
  END IF;

  -- Update user's admin status
  UPDATE users
  SET is_admin = is_admin_status,
      updated_at = now()
  WHERE id = target_user_id;
  
  -- Log the admin action
  INSERT INTO system_logs (action, details)
  VALUES (
    'admin_set_user_status',
    'Admin ' || admin_user_id || ' set admin status for user ' || target_user_id || 
    ' to ' || is_admin_status
  );
  
  RETURN true;
END;
$$;