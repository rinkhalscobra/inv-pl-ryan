# Giveaway System - CRM Management Guide

## Overview
The giveaway system allows users to earn tickets by depositing USDT. Winners are manually selected via your external CRM, and prizes are distributed automatically.

---

## Database Tables

### 1. `giveaway_campaigns`
Stores giveaway campaign information.

**Columns:**
- `id` (uuid) - Unique campaign identifier
- `name` (text) - Campaign name
- `description` (text) - Campaign description
- `total_prize_pool` (numeric) - Total USDT prize pool
- `start_date` (timestamptz) - Campaign start date
- `end_date` (timestamptz) - Campaign end date
- `status` (text) - 'active', 'completed', or 'cancelled'
- `ticket_rate` (numeric) - USDT required per ticket (default: 100)
- `created_at`, `updated_at` (timestamptz)

### 2. `giveaway_prizes`
Defines prize structure for campaigns.

**Columns:**
- `id` (uuid) - Unique prize identifier
- `campaign_id` (uuid) - Foreign key to campaign
- `rank_start` (integer) - Starting rank for this tier
- `rank_end` (integer) - Ending rank for this tier
- `prize_amount` (numeric) - Prize amount in USDT
- `tier_name` (text) - Display name (e.g., "1st Place")

### 3. `giveaway_tickets`
Tracks individual ticket transactions.

**Columns:**
- `id` (uuid) - Unique ticket identifier
- `user_id` (uuid) - Foreign key to user
- `campaign_id` (uuid) - Foreign key to campaign
- `ticket_count` (integer) - Number of tickets earned
- `deposit_transaction_id` (uuid) - Link to deposit transaction
- `created_at` (timestamptz)

### 4. `giveaway_entries`
Tracks total tickets per user per campaign.

**Columns:**
- `id` (uuid) - Unique entry identifier
- `user_id` (uuid) - Foreign key to user
- `campaign_id` (uuid) - Foreign key to campaign
- `total_tickets` (integer) - Running total of user's tickets
- `last_updated` (timestamptz)

### 5. `giveaway_winners`
Stores winner information and payout status.

**Columns:**
- `id` (uuid) - Unique winner identifier
- `campaign_id` (uuid) - Foreign key to campaign
- `user_id` (uuid) - Foreign key to user
- `rank` (integer) - Winner's rank (1-1000)
- `prize_amount` (numeric) - Prize amount in USDT
- `prize_tier` (text) - Prize tier name
- `claimed` (boolean) - Whether winner acknowledged
- `claimed_at` (timestamptz) - When winner acknowledged
- `paid_out` (boolean) - Whether prize has been paid
- `paid_out_at` (timestamptz) - When prize was paid
- `created_at` (timestamptz)

---

## CRM Operations

### Creating a New Giveaway Campaign

**Step 1: Create Campaign**
```sql
INSERT INTO giveaway_campaigns
  (name, description, total_prize_pool, start_date, end_date, status, ticket_rate)
VALUES
  ('10M USDT Mega Giveaway',
   'Deposit USDT to earn tickets! 1 ticket per 100 USDT',
   10000000,
   '2024-01-01 00:00:00+00',
   '2024-01-31 23:59:59+00',
   'active',
   100)
RETURNING id;
```

**Step 2: Create Prize Structure**
```sql
-- Use the campaign_id from Step 1
INSERT INTO giveaway_prizes (campaign_id, rank_start, rank_end, prize_amount, tier_name)
VALUES
  ('CAMPAIGN_ID_HERE', 1, 1, 1000000, '1st Place'),
  ('CAMPAIGN_ID_HERE', 2, 2, 500000, '2nd Place'),
  ('CAMPAIGN_ID_HERE', 3, 4, 250000, 'Top 4'),
  ('CAMPAIGN_ID_HERE', 5, 24, 100000, 'Top 20'),
  ('CAMPAIGN_ID_HERE', 25, 64, 50000, 'Top 40'),
  ('CAMPAIGN_ID_HERE', 65, 164, 10000, 'Top 100'),
  ('CAMPAIGN_ID_HERE', 165, 364, 5000, 'Top 200'),
  ('CAMPAIGN_ID_HERE', 365, 1364, 1000, 'Top 1000');
```

### Monitoring Active Campaign

**View All Participants (Leaderboard)**
```sql
SELECT
  u.email,
  ge.total_tickets,
  ge.last_updated,
  ROW_NUMBER() OVER (ORDER BY ge.total_tickets DESC) as current_rank
FROM giveaway_entries ge
JOIN auth.users u ON u.id = ge.user_id
WHERE ge.campaign_id = 'CAMPAIGN_ID_HERE'
ORDER BY ge.total_tickets DESC;
```

**View Campaign Statistics**
```sql
SELECT
  COUNT(DISTINCT ge.user_id) as total_participants,
  SUM(ge.total_tickets) as total_tickets_issued,
  SUM(ge.total_tickets) * 100 as total_deposits_usd
FROM giveaway_entries ge
WHERE ge.campaign_id = 'CAMPAIGN_ID_HERE';
```

**View Individual Ticket Transactions**
```sql
SELECT
  u.email,
  gt.ticket_count,
  gt.ticket_count * 100 as deposit_amount_usd,
  gt.created_at
FROM giveaway_tickets gt
JOIN auth.users u ON u.id = gt.user_id
WHERE gt.campaign_id = 'CAMPAIGN_ID_HERE'
ORDER BY gt.created_at DESC;
```

### Selecting Winners Manually

**Step 1: Select Your Winners**
Use your own selection algorithm or random picker to choose 1000 winners from the participants.

**Step 2: Insert Winners into Database**
```sql
-- Insert winners one by one or in batch
-- Example for rank 1 (1st place)
INSERT INTO giveaway_winners
  (campaign_id, user_id, rank, prize_amount, prize_tier, claimed, paid_out)
VALUES
  ('CAMPAIGN_ID_HERE', 'USER_ID_HERE', 1, 1000000, '1st Place', false, false);

-- Example for rank 2 (2nd place)
INSERT INTO giveaway_winners
  (campaign_id, user_id, rank, prize_amount, prize_tier, claimed, paid_out)
VALUES
  ('CAMPAIGN_ID_HERE', 'USER_ID_HERE', 2, 500000, '2nd Place', false, false);

-- Continue for all 1000 winners...
```

**Step 3: Verify Winners Inserted**
```sql
SELECT
  COUNT(*) as total_winners,
  SUM(prize_amount) as total_prize_money
FROM giveaway_winners
WHERE campaign_id = 'CAMPAIGN_ID_HERE';
```

### Distributing Prizes

**Option 1: Use Edge Function (Recommended)**
```bash
curl -X POST \
  'YOUR_SUPABASE_URL/functions/v1/distribute-giveaway-prizes' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -d '{"campaignId": "CAMPAIGN_ID_HERE"}'
```

**Option 2: Check Payout Status**
```sql
SELECT
  u.email,
  gw.rank,
  gw.prize_tier,
  gw.prize_amount,
  gw.paid_out,
  gw.paid_out_at
FROM giveaway_winners gw
JOIN auth.users u ON u.id = gw.user_id
WHERE gw.campaign_id = 'CAMPAIGN_ID_HERE'
ORDER BY gw.rank;
```

**Verify All Winners Were Paid**
```sql
SELECT
  COUNT(*) FILTER (WHERE paid_out = true) as paid_count,
  COUNT(*) FILTER (WHERE paid_out = false) as unpaid_count,
  SUM(prize_amount) FILTER (WHERE paid_out = true) as total_paid_out
FROM giveaway_winners
WHERE campaign_id = 'CAMPAIGN_ID_HERE';
```

### Ending a Campaign

**Update Campaign Status**
```sql
UPDATE giveaway_campaigns
SET status = 'completed'
WHERE id = 'CAMPAIGN_ID_HERE';
```

---

## Edge Functions

### 1. `process-giveaway-tickets`
**Purpose:** Automatically generates tickets when users deposit USDT.

**Called by:** Application automatically after successful USDT deposit.

**Parameters:**
```json
{
  "userId": "uuid",
  "depositAmount": 1000,
  "transactionId": "uuid"
}
```

**Returns:**
```json
{
  "success": true,
  "ticketsEarned": 10,
  "campaignName": "10M USDT Mega Giveaway",
  "totalTickets": 25
}
```

### 2. `distribute-giveaway-prizes`
**Purpose:** Distributes prizes to all unpaid winners.

**Called by:** CRM manually when ready to pay winners.

**Parameters:**
```json
{
  "campaignId": "uuid"
}
```

**Returns:**
```json
{
  "success": true,
  "paidCount": 1000,
  "errorCount": 0,
  "totalWinners": 1000
}
```

---

## User Experience

### In Profile Page
Users can view:
- Active giveaway campaign details
- Their total tickets for active campaign
- Prize structure breakdown
- Ticket earning history
- Winner announcements if they won
- Past giveaway participation

### Deposit Flow
1. User deposits USDT via Wallet page
2. System automatically calculates tickets (deposit ÷ 100)
3. Tickets are recorded in `giveaway_tickets` table
4. Running total updated in `giveaway_entries` table
5. User sees notification of tickets earned
6. Tickets visible in Giveaway tab of Profile

### Winner Notification
1. CRM manually inserts winners into `giveaway_winners` table
2. Winners see banner in Giveaway tab when they log in
3. Winners can acknowledge prize (updates `claimed` field)
4. CRM triggers prize distribution edge function
5. Prizes automatically credited to winner USDT balances
6. Transaction record created with type `giveaway_prize`

---

## Security & Best Practices

### Row Level Security
All giveaway tables have RLS enabled:
- Users can only view their own tickets and entries
- Users can only view their own winner records
- Prize structures and campaigns are publicly viewable
- Only service role can insert winners and manage campaigns

### Data Integrity
- Unique constraint: One user can only win once per campaign
- Foreign key constraints ensure data consistency
- Automatic timestamp tracking for audit trails
- Prize amounts validated as positive numbers

### Recommendations
1. **Test First:** Create a test campaign with small prize pool before live campaign
2. **Backup Winners:** Export winner list before running prize distribution
3. **Monitor Payouts:** Check payout status after distribution completes
4. **Verify Balances:** Ensure sufficient platform balance before prize distribution
5. **Communication:** Notify winners via email before distributing prizes
6. **Audit Logs:** Keep records of when winners were selected and how

---

## Troubleshooting

### No Tickets Generated
**Check:**
1. Is there an active campaign? (status = 'active', dates valid)
2. Was deposit at least 100 USDT?
3. Check edge function logs for errors
4. Verify user_id and campaign_id are correct

### Prize Distribution Failed
**Check:**
1. Are winners properly inserted in `giveaway_winners` table?
2. Do users have balance records in `balances` table?
3. Check edge function logs for specific errors
4. Verify campaign_id matches in all queries

### Duplicate Winners
**Prevention:**
- Database has unique constraint on (campaign_id, user_id)
- Attempting to insert duplicate will fail
- Use this query to check before inserting:
```sql
SELECT user_id FROM giveaway_winners
WHERE campaign_id = 'CAMPAIGN_ID_HERE'
  AND user_id = 'USER_ID_TO_CHECK';
```

---

## Support

For issues or questions about the giveaway system:
1. Check database table structures and constraints
2. Review edge function deployment status
3. Verify RLS policies are correctly configured
4. Check Supabase logs for detailed error messages
5. Test with small amounts before full campaign launch
