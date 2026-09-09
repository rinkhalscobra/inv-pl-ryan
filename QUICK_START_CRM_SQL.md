# Quick Start: SQL Commands for CRM Management

This document contains ready-to-use SQL commands for managing giveaways from your CRM.

---

## 1. Create a New Giveaway Campaign

### Step 1: Insert Campaign
```sql
INSERT INTO giveaway_campaigns (
  name,
  description,
  total_prize_pool,
  start_date,
  end_date,
  status,
  ticket_rate
)
VALUES (
  '10M USDT Mega Giveaway',
  'Deposit USDT to earn tickets! 1 ticket per 100 USDT deposited',
  10000000,
  '2024-12-01 00:00:00+00',  -- Change to your start date
  '2024-12-31 23:59:59+00',  -- Change to your end date
  'active',
  100
)
RETURNING id;
```

**IMPORTANT:** Copy the `id` returned from this query. You'll need it for the next step!

### Step 2: Create Prize Structure
Replace `PASTE_CAMPAIGN_ID_HERE` with the ID from Step 1:

```sql
INSERT INTO giveaway_prizes (campaign_id, rank_start, rank_end, prize_amount, tier_name)
VALUES
  ('PASTE_CAMPAIGN_ID_HERE', 1, 1, 1000000, '1st Place'),
  ('PASTE_CAMPAIGN_ID_HERE', 2, 2, 500000, '2nd Place'),
  ('PASTE_CAMPAIGN_ID_HERE', 3, 4, 250000, 'Top 4'),
  ('PASTE_CAMPAIGN_ID_HERE', 5, 24, 100000, 'Top 20'),
  ('PASTE_CAMPAIGN_ID_HERE', 25, 64, 50000, 'Top 40'),
  ('PASTE_CAMPAIGN_ID_HERE', 65, 164, 10000, 'Top 100'),
  ('PASTE_CAMPAIGN_ID_HERE', 165, 364, 5000, 'Top 200'),
  ('PASTE_CAMPAIGN_ID_HERE', 365, 1364, 1000, 'Top 1000');
```

---

## 2. Monitor Active Campaign

### View All Participants (Leaderboard)
Replace `PASTE_CAMPAIGN_ID_HERE` with your campaign ID:

```sql
SELECT
  u.email,
  ge.user_id,
  ge.total_tickets,
  ge.last_updated,
  ROW_NUMBER() OVER (ORDER BY ge.total_tickets DESC) as current_rank
FROM giveaway_entries ge
JOIN auth.users u ON u.id = ge.user_id
WHERE ge.campaign_id = 'PASTE_CAMPAIGN_ID_HERE'
ORDER BY ge.total_tickets DESC;
```

### View Campaign Statistics
```sql
SELECT
  gc.name,
  gc.status,
  gc.start_date,
  gc.end_date,
  COUNT(DISTINCT ge.user_id) as total_participants,
  SUM(ge.total_tickets) as total_tickets_issued,
  SUM(ge.total_tickets) * 100 as total_deposits_usd
FROM giveaway_campaigns gc
LEFT JOIN giveaway_entries ge ON ge.campaign_id = gc.id
WHERE gc.id = 'PASTE_CAMPAIGN_ID_HERE'
GROUP BY gc.id, gc.name, gc.status, gc.start_date, gc.end_date;
```

### View Recent Deposits/Tickets
```sql
SELECT
  u.email,
  gt.ticket_count,
  gt.ticket_count * 100 as deposit_amount_usd,
  gt.created_at
FROM giveaway_tickets gt
JOIN auth.users u ON u.id = gt.user_id
WHERE gt.campaign_id = 'PASTE_CAMPAIGN_ID_HERE'
ORDER BY gt.created_at DESC
LIMIT 100;
```

### Export Full Leaderboard to CSV Format
```sql
COPY (
  SELECT
    ROW_NUMBER() OVER (ORDER BY ge.total_tickets DESC) as rank,
    u.email,
    ge.user_id,
    ge.total_tickets,
    ge.last_updated
  FROM giveaway_entries ge
  JOIN auth.users u ON u.id = ge.user_id
  WHERE ge.campaign_id = 'PASTE_CAMPAIGN_ID_HERE'
  ORDER BY ge.total_tickets DESC
) TO '/tmp/leaderboard.csv' WITH CSV HEADER;
```

---

## 3. Manual Winner Selection

### Method A: Select Top 1000 by Tickets (Not Random)
```sql
-- This selects top 1000 participants by ticket count
WITH ranked_participants AS (
  SELECT
    ge.user_id,
    ge.total_tickets,
    ROW_NUMBER() OVER (ORDER BY ge.total_tickets DESC, ge.last_updated ASC) as rank
  FROM giveaway_entries ge
  WHERE ge.campaign_id = 'PASTE_CAMPAIGN_ID_HERE'
)
SELECT
  rp.user_id,
  rp.rank,
  CASE
    WHEN rp.rank = 1 THEN 1000000
    WHEN rp.rank = 2 THEN 500000
    WHEN rp.rank BETWEEN 3 AND 4 THEN 250000
    WHEN rp.rank BETWEEN 5 AND 24 THEN 100000
    WHEN rp.rank BETWEEN 25 AND 64 THEN 50000
    WHEN rp.rank BETWEEN 65 AND 164 THEN 10000
    WHEN rp.rank BETWEEN 165 AND 364 THEN 5000
    WHEN rp.rank BETWEEN 365 AND 1364 THEN 1000
  END as prize_amount,
  CASE
    WHEN rp.rank = 1 THEN '1st Place'
    WHEN rp.rank = 2 THEN '2nd Place'
    WHEN rp.rank BETWEEN 3 AND 4 THEN 'Top 4'
    WHEN rp.rank BETWEEN 5 AND 24 THEN 'Top 20'
    WHEN rp.rank BETWEEN 25 AND 64 THEN 'Top 40'
    WHEN rp.rank BETWEEN 65 AND 164 THEN 'Top 100'
    WHEN rp.rank BETWEEN 165 AND 364 THEN 'Top 200'
    WHEN rp.rank BETWEEN 365 AND 1364 THEN 'Top 1000'
  END as prize_tier
FROM ranked_participants rp
WHERE rp.rank <= 1000;
```

### Method B: Insert Winners from External List
If you have a CSV or list of winners from your own selection method:

```sql
-- Example: Insert single winner
INSERT INTO giveaway_winners (
  campaign_id,
  user_id,
  rank,
  prize_amount,
  prize_tier,
  claimed,
  paid_out
)
VALUES (
  'PASTE_CAMPAIGN_ID_HERE',
  'PASTE_USER_ID_HERE',
  1,  -- Winner's rank
  1000000,  -- Prize amount
  '1st Place',  -- Prize tier
  false,
  false
);
```

### Method C: Bulk Insert Winners
Prepare your CSV file with columns: `user_id,rank,prize_amount,prize_tier`

Then use this query format (repeat for all 1000 winners):

```sql
INSERT INTO giveaway_winners (campaign_id, user_id, rank, prize_amount, prize_tier, claimed, paid_out)
VALUES
  ('CAMPAIGN_ID', 'user-id-1', 1, 1000000, '1st Place', false, false),
  ('CAMPAIGN_ID', 'user-id-2', 2, 500000, '2nd Place', false, false),
  ('CAMPAIGN_ID', 'user-id-3', 3, 250000, 'Top 4', false, false),
  -- ... continue for all 1000 winners ...
  ('CAMPAIGN_ID', 'user-id-1000', 1000, 1000, 'Top 1000', false, false);
```

**TIP:** Use a script to generate this SQL from your winner list!

---

## 4. Verify Winners Before Distribution

### Count Winners
```sql
SELECT
  COUNT(*) as total_winners,
  SUM(prize_amount) as total_prize_money
FROM giveaway_winners
WHERE campaign_id = 'PASTE_CAMPAIGN_ID_HERE';
```

**Expected Result:** 1000 winners, $10,000,000 total

### Check for Duplicates
```sql
SELECT
  user_id,
  COUNT(*) as winner_count
FROM giveaway_winners
WHERE campaign_id = 'PASTE_CAMPAIGN_ID_HERE'
GROUP BY user_id
HAVING COUNT(*) > 1;
```

**Expected Result:** 0 rows (no duplicates)

### Verify Prize Structure
```sql
SELECT
  prize_tier,
  COUNT(*) as winner_count,
  MIN(rank) as min_rank,
  MAX(rank) as max_rank,
  SUM(prize_amount) as tier_total
FROM giveaway_winners
WHERE campaign_id = 'PASTE_CAMPAIGN_ID_HERE'
GROUP BY prize_tier
ORDER BY MIN(rank);
```

**Expected Results:**
- 1st Place: 1 winner, $1,000,000
- 2nd Place: 1 winner, $500,000
- Top 4: 2 winners, $500,000 total
- Top 20: 20 winners, $2,000,000 total
- Top 40: 40 winners, $2,000,000 total
- Top 100: 100 winners, $1,000,000 total
- Top 200: 200 winners, $1,000,000 total
- Top 1000: 1000 winners, $1,000,000 total

### List All Winners
```sql
SELECT
  gw.rank,
  u.email,
  gw.user_id,
  gw.prize_tier,
  gw.prize_amount,
  gw.paid_out,
  gw.created_at
FROM giveaway_winners gw
JOIN auth.users u ON u.id = gw.user_id
WHERE gw.campaign_id = 'PASTE_CAMPAIGN_ID_HERE'
ORDER BY gw.rank;
```

---

## 5. Distribute Prizes

### Option A: Use Edge Function (RECOMMENDED)
Run this command via your CRM application or use curl:

```bash
curl -X POST \
  'https://YOUR_PROJECT.supabase.co/functions/v1/distribute-giveaway-prizes' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY' \
  -d '{"campaignId": "PASTE_CAMPAIGN_ID_HERE"}'
```

### Option B: Manual SQL Distribution (NOT RECOMMENDED)
⚠️ **Warning:** This bypasses the edge function and requires manual transaction creation. Only use if edge function fails.

```sql
-- This is complex and error-prone. Use edge function instead!
-- Shown here for reference only.
```

### Check Distribution Progress
```sql
SELECT
  COUNT(*) FILTER (WHERE paid_out = true) as paid_count,
  COUNT(*) FILTER (WHERE paid_out = false) as unpaid_count,
  SUM(prize_amount) FILTER (WHERE paid_out = true) as total_paid_out,
  SUM(prize_amount) FILTER (WHERE paid_out = false) as total_pending
FROM giveaway_winners
WHERE campaign_id = 'PASTE_CAMPAIGN_ID_HERE';
```

### View Recent Payouts
```sql
SELECT
  u.email,
  gw.rank,
  gw.prize_tier,
  gw.prize_amount,
  gw.paid_out_at,
  t.status
FROM giveaway_winners gw
JOIN auth.users u ON u.id = gw.user_id
LEFT JOIN transactions t ON t.user_id = gw.user_id
  AND t.type = 'giveaway_prize'
  AND t.description LIKE '%Rank ' || gw.rank || '%'
WHERE gw.campaign_id = 'PASTE_CAMPAIGN_ID_HERE'
  AND gw.paid_out = true
ORDER BY gw.paid_out_at DESC
LIMIT 50;
```

---

## 6. Complete Campaign

### Update Campaign Status to Completed
```sql
UPDATE giveaway_campaigns
SET status = 'completed'
WHERE id = 'PASTE_CAMPAIGN_ID_HERE';
```

### Verify Campaign Completion
```sql
SELECT
  gc.name,
  gc.status,
  gc.total_prize_pool,
  COUNT(DISTINCT ge.user_id) as total_participants,
  SUM(ge.total_tickets) as total_tickets,
  COUNT(DISTINCT gw.id) as total_winners,
  COUNT(DISTINCT gw.id) FILTER (WHERE gw.paid_out = true) as paid_winners,
  SUM(gw.prize_amount) FILTER (WHERE gw.paid_out = true) as total_paid
FROM giveaway_campaigns gc
LEFT JOIN giveaway_entries ge ON ge.campaign_id = gc.id
LEFT JOIN giveaway_winners gw ON gw.campaign_id = gc.id
WHERE gc.id = 'PASTE_CAMPAIGN_ID_HERE'
GROUP BY gc.id, gc.name, gc.status, gc.total_prize_pool;
```

---

## 7. Common Queries

### Find User by Email
```sql
SELECT
  u.id,
  u.email,
  ge.total_tickets,
  gw.rank,
  gw.prize_amount,
  gw.paid_out
FROM auth.users u
LEFT JOIN giveaway_entries ge ON ge.user_id = u.id
  AND ge.campaign_id = 'PASTE_CAMPAIGN_ID_HERE'
LEFT JOIN giveaway_winners gw ON gw.user_id = u.id
  AND gw.campaign_id = 'PASTE_CAMPAIGN_ID_HERE'
WHERE u.email = 'user@example.com';
```

### Check if User Won
```sql
SELECT
  gw.*,
  u.email
FROM giveaway_winners gw
JOIN auth.users u ON u.id = gw.user_id
WHERE gw.campaign_id = 'PASTE_CAMPAIGN_ID_HERE'
  AND u.email = 'user@example.com';
```

### Get User's Ticket History
```sql
SELECT
  gt.ticket_count,
  gt.created_at,
  gt.ticket_count * 100 as deposit_amount_usd
FROM giveaway_tickets gt
JOIN auth.users u ON u.id = gt.user_id
WHERE gt.campaign_id = 'PASTE_CAMPAIGN_ID_HERE'
  AND u.email = 'user@example.com'
ORDER BY gt.created_at DESC;
```

### List All Active Campaigns
```sql
SELECT
  id,
  name,
  description,
  total_prize_pool,
  start_date,
  end_date,
  status,
  ticket_rate
FROM giveaway_campaigns
WHERE status = 'active'
  AND start_date <= NOW()
  AND end_date >= NOW()
ORDER BY created_at DESC;
```

### Campaign Performance Report
```sql
SELECT
  gc.name,
  gc.status,
  gc.start_date,
  gc.end_date,
  gc.total_prize_pool,
  COUNT(DISTINCT ge.user_id) as participants,
  SUM(ge.total_tickets) as total_tickets,
  SUM(ge.total_tickets) * gc.ticket_rate as total_deposits,
  COUNT(gw.id) as winners_selected,
  COUNT(gw.id) FILTER (WHERE gw.paid_out = true) as prizes_paid,
  SUM(gw.prize_amount) FILTER (WHERE gw.paid_out = true) as amount_distributed
FROM giveaway_campaigns gc
LEFT JOIN giveaway_entries ge ON ge.campaign_id = gc.id
LEFT JOIN giveaway_winners gw ON gw.campaign_id = gc.id
WHERE gc.id = 'PASTE_CAMPAIGN_ID_HERE'
GROUP BY gc.id;
```

---

## 8. Troubleshooting Queries

### Find Winners Not Paid
```sql
SELECT
  u.email,
  gw.rank,
  gw.prize_tier,
  gw.prize_amount,
  gw.created_at
FROM giveaway_winners gw
JOIN auth.users u ON u.id = gw.user_id
WHERE gw.campaign_id = 'PASTE_CAMPAIGN_ID_HERE'
  AND gw.paid_out = false
ORDER BY gw.rank;
```

### Check User Balance After Payout
```sql
SELECT
  u.email,
  b.usdt_balance,
  gw.prize_amount as expected_prize,
  gw.paid_out
FROM giveaway_winners gw
JOIN auth.users u ON u.id = gw.user_id
JOIN balances b ON b.user_id = u.id
WHERE gw.campaign_id = 'PASTE_CAMPAIGN_ID_HERE'
  AND gw.rank = 1;  -- Check rank 1 winner
```

### View Giveaway Transactions
```sql
SELECT
  t.id,
  u.email,
  t.type,
  t.amount,
  t.description,
  t.status,
  t.created_at
FROM transactions t
JOIN auth.users u ON u.id = t.user_id
WHERE t.type = 'giveaway_prize'
  AND t.created_at >= (
    SELECT start_date
    FROM giveaway_campaigns
    WHERE id = 'PASTE_CAMPAIGN_ID_HERE'
  )
ORDER BY t.created_at DESC;
```

### Remove Invalid Winners (DANGER!)
⚠️ **Warning:** Only use if you need to reselect winners

```sql
-- DANGEROUS: This deletes all winners for a campaign
DELETE FROM giveaway_winners
WHERE campaign_id = 'PASTE_CAMPAIGN_ID_HERE'
  AND paid_out = false;  -- Safety: only delete unpaid winners
```

---

## Quick Reference

### Campaign ID Storage
When you create a campaign, save the ID immediately:
```
Campaign ID: ________________________________
```

### Status Codes
- `active` - Campaign is running
- `completed` - Campaign ended, prizes distributed
- `cancelled` - Campaign was cancelled

### Prize Tiers Quick Reference
| Rank | Tier | Prize | Count |
|------|------|-------|-------|
| 1 | 1st Place | $1,000,000 | 1 |
| 2 | 2nd Place | $500,000 | 1 |
| 3-4 | Top 4 | $250,000 | 2 |
| 5-24 | Top 20 | $100,000 | 20 |
| 25-64 | Top 40 | $50,000 | 40 |
| 65-164 | Top 100 | $10,000 | 100 |
| 165-364 | Top 200 | $5,000 | 200 |
| 365-1364 | Top 1000 | $1,000 | 1000 |

**Total: 1364 prizes = $10,000,000**

---

## Notes

1. Always replace `PASTE_CAMPAIGN_ID_HERE` with your actual campaign ID
2. Test queries on a small dataset first
3. Back up data before running DELETE queries
4. Use transactions for multi-step operations
5. Verify results after each step
6. Keep audit logs of all admin actions
