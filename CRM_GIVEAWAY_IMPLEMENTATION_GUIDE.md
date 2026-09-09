# Complete CRM Giveaway Management Implementation Guide

This guide provides detailed instructions for implementing a giveaway management interface in a separate Bolt.new project that connects to the same Supabase database.

---

## Table of Contents
1. [Database Connection Setup](#database-connection-setup)
2. [Required Database Tables](#required-database-tables)
3. [CRM Features to Implement](#crm-features-to-implement)
4. [Complete Code Examples](#complete-code-examples)
5. [API Integration](#api-integration)
6. [UI Components](#ui-components)
7. [Testing Guide](#testing-guide)

---

## Database Connection Setup

### Step 1: Supabase Configuration

**Create a `.env` file in your CRM project:**
```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_SUPABASE_SERVICE_KEY=your_supabase_service_role_key
```

**Install Supabase Client:**
```bash
npm install @supabase/supabase-js
```

**Create `src/lib/supabaseClient.ts`:**
```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Service client for admin operations
const supabaseServiceKey = import.meta.env.VITE_SUPABASE_SERVICE_KEY;
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey);
```

---

## Required Database Tables

Your CRM needs to interact with these existing tables in the Supabase database:

### 1. `giveaway_campaigns`
```sql
id              uuid (primary key)
name            text
description     text
total_prize_pool numeric
start_date      timestamptz
end_date        timestamptz
status          text (active, completed, cancelled)
ticket_rate     numeric
created_at      timestamptz
updated_at      timestamptz
```

### 2. `giveaway_prizes`
```sql
id              uuid (primary key)
campaign_id     uuid (foreign key)
rank_start      integer
rank_end        integer
prize_amount    numeric
tier_name       text
created_at      timestamptz
```

### 3. `giveaway_entries`
```sql
id              uuid (primary key)
user_id         uuid (foreign key to auth.users)
campaign_id     uuid (foreign key)
total_tickets   integer
last_updated    timestamptz
```

### 4. `giveaway_tickets`
```sql
id                      uuid (primary key)
user_id                 uuid (foreign key)
campaign_id             uuid (foreign key)
ticket_count            integer
deposit_transaction_id  uuid
created_at              timestamptz
```

### 5. `giveaway_winners`
```sql
id              uuid (primary key)
campaign_id     uuid (foreign key)
user_id         uuid (foreign key)
rank            integer
prize_amount    numeric
prize_tier      text
claimed         boolean
claimed_at      timestamptz
paid_out        boolean
paid_out_at     timestamptz
created_at      timestamptz
```

### 6. `auth.users` (Supabase Auth Table)
You'll need to join with this table to get user emails:
```sql
id              uuid (primary key)
email           text
created_at      timestamptz
```

---

## CRM Features to Implement

### Feature 1: Campaign Management Dashboard

**Purpose:** Create, view, edit, and monitor giveaway campaigns.

**UI Components Needed:**
- Campaign list view
- Create campaign form
- Edit campaign form
- Campaign statistics dashboard

**Key Functionality:**
```typescript
// Types
interface Campaign {
  id: string;
  name: string;
  description: string;
  total_prize_pool: number;
  start_date: string;
  end_date: string;
  status: 'active' | 'completed' | 'cancelled';
  ticket_rate: number;
  created_at: string;
  updated_at: string;
}

interface CampaignStats {
  total_participants: number;
  total_tickets: number;
  total_deposits_usd: number;
}

// Fetch all campaigns
async function fetchCampaigns(): Promise<Campaign[]> {
  const { data, error } = await supabase
    .from('giveaway_campaigns')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

// Create new campaign
async function createCampaign(campaign: Omit<Campaign, 'id' | 'created_at' | 'updated_at'>): Promise<Campaign> {
  const { data, error } = await supabaseAdmin
    .from('giveaway_campaigns')
    .insert([campaign])
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Create prize structure for campaign
async function createPrizeStructure(campaignId: string) {
  const prizes = [
    { rank_start: 1, rank_end: 1, prize_amount: 1000000, tier_name: '1st Place' },
    { rank_start: 2, rank_end: 2, prize_amount: 500000, tier_name: '2nd Place' },
    { rank_start: 3, rank_end: 4, prize_amount: 250000, tier_name: 'Top 4' },
    { rank_start: 5, rank_end: 24, prize_amount: 100000, tier_name: 'Top 20' },
    { rank_start: 25, rank_end: 64, prize_amount: 50000, tier_name: 'Top 40' },
    { rank_start: 65, rank_end: 164, prize_amount: 10000, tier_name: 'Top 100' },
    { rank_start: 165, rank_end: 364, prize_amount: 5000, tier_name: 'Top 200' },
    { rank_start: 365, rank_end: 1364, prize_amount: 1000, tier_name: 'Top 1000' },
  ];

  const prizesWithCampaignId = prizes.map(p => ({
    ...p,
    campaign_id: campaignId,
  }));

  const { error } = await supabaseAdmin
    .from('giveaway_prizes')
    .insert(prizesWithCampaignId);

  if (error) throw error;
}

// Get campaign statistics
async function getCampaignStats(campaignId: string): Promise<CampaignStats> {
  const { data, error } = await supabase
    .from('giveaway_entries')
    .select('total_tickets')
    .eq('campaign_id', campaignId);

  if (error) throw error;

  const total_tickets = data.reduce((sum, entry) => sum + entry.total_tickets, 0);

  return {
    total_participants: data.length,
    total_tickets,
    total_deposits_usd: total_tickets * 100, // Each ticket = 100 USDT
  };
}
```

### Feature 2: Participant Leaderboard

**Purpose:** Display all participants ranked by ticket count.

**UI Components Needed:**
- Sortable table with user email, tickets, and ranking
- Search/filter functionality
- Export to CSV button

**Key Functionality:**
```typescript
interface Participant {
  user_id: string;
  email: string;
  total_tickets: number;
  rank: number;
  last_updated: string;
}

// Fetch leaderboard with user emails
async function fetchLeaderboard(campaignId: string): Promise<Participant[]> {
  // First get entries
  const { data: entries, error: entriesError } = await supabase
    .from('giveaway_entries')
    .select('user_id, total_tickets, last_updated')
    .eq('campaign_id', campaignId)
    .order('total_tickets', { ascending: false });

  if (entriesError) throw entriesError;

  // Then get user emails
  const userIds = entries.map(e => e.user_id);
  const { data: users, error: usersError } = await supabaseAdmin
    .from('auth.users')
    .select('id, email')
    .in('id', userIds);

  if (usersError) {
    // Fallback: use RPC function or fetch individually
    console.error('Error fetching users:', usersError);
  }

  // Merge data
  const participants: Participant[] = entries.map((entry, index) => {
    const user = users?.find(u => u.id === entry.user_id);
    return {
      user_id: entry.user_id,
      email: user?.email || 'Unknown',
      total_tickets: entry.total_tickets,
      rank: index + 1,
      last_updated: entry.last_updated,
    };
  });

  return participants;
}

// Export to CSV
function exportLeaderboardToCSV(participants: Participant[]) {
  const headers = ['Rank', 'Email', 'Total Tickets', 'Last Updated'];
  const rows = participants.map(p => [
    p.rank,
    p.email,
    p.total_tickets,
    new Date(p.last_updated).toLocaleString()
  ]);

  const csv = [headers, ...rows]
    .map(row => row.join(','))
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `leaderboard_${Date.now()}.csv`;
  a.click();
}
```

### Feature 3: Winner Selection Tool

**Purpose:** Select winners manually and insert them into the database.

**UI Components Needed:**
- Winner selection interface
- Random selection tool (optional)
- Manual selection tool
- Bulk import from CSV
- Winner verification before submission

**Key Functionality:**
```typescript
interface WinnerSelection {
  user_id: string;
  email: string;
  rank: number;
  prize_amount: number;
  prize_tier: string;
}

// Random winner selection (weighted by tickets)
async function selectRandomWinners(
  campaignId: string,
  numberOfWinners: number = 1000
): Promise<WinnerSelection[]> {
  // Fetch all participants
  const participants = await fetchLeaderboard(campaignId);

  // Create weighted array (each ticket = one entry)
  const weightedPool: string[] = [];
  participants.forEach(p => {
    for (let i = 0; i < p.total_tickets; i++) {
      weightedPool.push(p.user_id);
    }
  });

  // Select unique winners
  const selectedWinners = new Set<string>();
  const winners: WinnerSelection[] = [];

  while (selectedWinners.size < numberOfWinners && selectedWinners.size < participants.length) {
    const randomIndex = Math.floor(Math.random() * weightedPool.length);
    const winnerId = weightedPool[randomIndex];

    if (!selectedWinners.has(winnerId)) {
      selectedWinners.add(winnerId);
      const participant = participants.find(p => p.user_id === winnerId)!;
      const rank = winners.length + 1;
      const { prize_amount, prize_tier } = getPrizeForRank(rank);

      winners.push({
        user_id: winnerId,
        email: participant.email,
        rank,
        prize_amount,
        prize_tier,
      });
    }
  }

  return winners;
}

// Get prize amount for specific rank
function getPrizeForRank(rank: number): { prize_amount: number; prize_tier: string } {
  if (rank === 1) return { prize_amount: 1000000, prize_tier: '1st Place' };
  if (rank === 2) return { prize_amount: 500000, prize_tier: '2nd Place' };
  if (rank >= 3 && rank <= 4) return { prize_amount: 250000, prize_tier: 'Top 4' };
  if (rank >= 5 && rank <= 24) return { prize_amount: 100000, prize_tier: 'Top 20' };
  if (rank >= 25 && rank <= 64) return { prize_amount: 50000, prize_tier: 'Top 40' };
  if (rank >= 65 && rank <= 164) return { prize_amount: 10000, prize_tier: 'Top 100' };
  if (rank >= 165 && rank <= 364) return { prize_amount: 5000, prize_tier: 'Top 200' };
  if (rank >= 365 && rank <= 1364) return { prize_amount: 1000, prize_tier: 'Top 1000' };
  return { prize_amount: 0, prize_tier: 'Not Eligible' };
}

// Insert winners into database
async function insertWinners(campaignId: string, winners: WinnerSelection[]) {
  const winnerRecords = winners.map(w => ({
    campaign_id: campaignId,
    user_id: w.user_id,
    rank: w.rank,
    prize_amount: w.prize_amount,
    prize_tier: w.prize_tier,
    claimed: false,
    paid_out: false,
  }));

  // Insert in batches of 100 to avoid timeout
  const batchSize = 100;
  for (let i = 0; i < winnerRecords.length; i += batchSize) {
    const batch = winnerRecords.slice(i, i + batchSize);
    const { error } = await supabaseAdmin
      .from('giveaway_winners')
      .insert(batch);

    if (error) {
      console.error(`Error inserting batch ${i / batchSize + 1}:`, error);
      throw error;
    }

    console.log(`Inserted batch ${i / batchSize + 1} of ${Math.ceil(winnerRecords.length / batchSize)}`);
  }

  return winnerRecords.length;
}

// Verify winners before final submission
async function verifyWinners(campaignId: string, winners: WinnerSelection[]): Promise<{
  valid: boolean;
  errors: string[];
}> {
  const errors: string[] = [];

  // Check for duplicates
  const uniqueIds = new Set(winners.map(w => w.user_id));
  if (uniqueIds.size !== winners.length) {
    errors.push('Duplicate winners detected');
  }

  // Check if exactly 1000 winners
  if (winners.length !== 1000) {
    errors.push(`Expected 1000 winners, got ${winners.length}`);
  }

  // Check if users exist in entries
  const { data: entries } = await supabase
    .from('giveaway_entries')
    .select('user_id')
    .eq('campaign_id', campaignId)
    .in('user_id', winners.map(w => w.user_id));

  const validUserIds = new Set(entries?.map(e => e.user_id) || []);
  winners.forEach(w => {
    if (!validUserIds.has(w.user_id)) {
      errors.push(`User ${w.email} is not a participant in this campaign`);
    }
  });

  // Check prize amounts match ranks
  winners.forEach(w => {
    const expectedPrize = getPrizeForRank(w.rank);
    if (w.prize_amount !== expectedPrize.prize_amount) {
      errors.push(`Rank ${w.rank} has incorrect prize amount: ${w.prize_amount} (expected ${expectedPrize.prize_amount})`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}
```

### Feature 4: Prize Distribution Management

**Purpose:** Trigger prize distribution and monitor payout status.

**UI Components Needed:**
- Distribution trigger button
- Payout progress indicator
- Success/failure status display
- Transaction log viewer

**Key Functionality:**
```typescript
interface DistributionResult {
  success: boolean;
  paidCount: number;
  errorCount: number;
  totalWinners: number;
  errors?: Array<{
    winnerId: string;
    userId: string;
    rank: number;
    error: string;
  }>;
}

// Trigger prize distribution via edge function
async function distributePrizes(campaignId: string): Promise<DistributionResult> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseServiceKey = import.meta.env.VITE_SUPABASE_SERVICE_KEY;

  const response = await fetch(
    `${supabaseUrl}/functions/v1/distribute-giveaway-prizes`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({ campaignId }),
    }
  );

  if (!response.ok) {
    throw new Error('Failed to distribute prizes');
  }

  const result: DistributionResult = await response.json();
  return result;
}

// Get payout status
async function getPayoutStatus(campaignId: string) {
  const { data, error } = await supabase
    .from('giveaway_winners')
    .select('paid_out, prize_amount')
    .eq('campaign_id', campaignId);

  if (error) throw error;

  const totalWinners = data.length;
  const paidWinners = data.filter(w => w.paid_out).length;
  const unpaidWinners = totalWinners - paidWinners;
  const totalPaidAmount = data
    .filter(w => w.paid_out)
    .reduce((sum, w) => sum + Number(w.prize_amount), 0);

  return {
    totalWinners,
    paidWinners,
    unpaidWinners,
    totalPaidAmount,
    percentComplete: (paidWinners / totalWinners) * 100,
  };
}

// Get detailed winner list with payout status
async function getWinnersList(campaignId: string) {
  const { data: winners, error: winnersError } = await supabase
    .from('giveaway_winners')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('rank', { ascending: true });

  if (winnersError) throw winnersError;

  // Get user emails
  const userIds = winners.map(w => w.user_id);
  const { data: users } = await supabaseAdmin
    .from('auth.users')
    .select('id, email')
    .in('id', userIds);

  return winners.map(winner => ({
    ...winner,
    email: users?.find(u => u.id === winner.user_id)?.email || 'Unknown',
  }));
}
```

### Feature 5: Campaign Analytics

**Purpose:** View detailed analytics and reports for campaigns.

**UI Components Needed:**
- Charts and graphs (use Chart.js or similar)
- Statistics cards
- Timeline view
- Export reports functionality

**Key Functionality:**
```typescript
interface CampaignAnalytics {
  campaign: Campaign;
  stats: CampaignStats;
  ticketDistribution: {
    date: string;
    tickets: number;
    deposits: number;
  }[];
  topParticipants: Participant[];
  prizeBreakdown: {
    tier: string;
    winners: number;
    totalAmount: number;
  }[];
}

// Get complete campaign analytics
async function getCampaignAnalytics(campaignId: string): Promise<CampaignAnalytics> {
  // Fetch campaign
  const { data: campaign } = await supabase
    .from('giveaway_campaigns')
    .select('*')
    .eq('id', campaignId)
    .single();

  // Fetch stats
  const stats = await getCampaignStats(campaignId);

  // Fetch ticket distribution over time
  const { data: tickets } = await supabase
    .from('giveaway_tickets')
    .select('created_at, ticket_count')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: true });

  const ticketDistribution = tickets?.reduce((acc, ticket) => {
    const date = new Date(ticket.created_at).toISOString().split('T')[0];
    const existing = acc.find(d => d.date === date);
    if (existing) {
      existing.tickets += ticket.ticket_count;
      existing.deposits += ticket.ticket_count * 100;
    } else {
      acc.push({
        date,
        tickets: ticket.ticket_count,
        deposits: ticket.ticket_count * 100,
      });
    }
    return acc;
  }, [] as any[]) || [];

  // Fetch top participants
  const leaderboard = await fetchLeaderboard(campaignId);
  const topParticipants = leaderboard.slice(0, 10);

  // Fetch prize breakdown
  const { data: prizes } = await supabase
    .from('giveaway_prizes')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('rank_start', { ascending: true });

  const prizeBreakdown = prizes?.map(prize => ({
    tier: prize.tier_name,
    winners: prize.rank_end - prize.rank_start + 1,
    totalAmount: Number(prize.prize_amount) * (prize.rank_end - prize.rank_start + 1),
  })) || [];

  return {
    campaign: campaign!,
    stats,
    ticketDistribution,
    topParticipants,
    prizeBreakdown,
  };
}
```

---

## Complete Code Examples

### Full CRM Dashboard Component

```typescript
// src/components/GiveawayDashboard.tsx
import React, { useState, useEffect } from 'react';
import { supabase, supabaseAdmin } from '../lib/supabaseClient';

interface Campaign {
  id: string;
  name: string;
  description: string;
  total_prize_pool: number;
  start_date: string;
  end_date: string;
  status: 'active' | 'completed' | 'cancelled';
  ticket_rate: number;
}

export default function GiveawayDashboard() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'create' | 'details' | 'leaderboard' | 'winners'>('list');

  useEffect(() => {
    fetchCampaigns();
  }, []);

  const fetchCampaigns = async () => {
    try {
      const { data, error } = await supabase
        .from('giveaway_campaigns')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCampaigns(data || []);
    } catch (error) {
      console.error('Error fetching campaigns:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white p-8">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Giveaway Management System</h1>
          <p className="text-slate-400">Manage campaigns, participants, and prize distribution</p>
        </header>

        <nav className="flex gap-4 mb-8">
          <button
            onClick={() => setView('list')}
            className={`px-6 py-3 rounded-lg font-medium transition-colors ${
              view === 'list'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            Campaigns
          </button>
          <button
            onClick={() => setView('create')}
            className={`px-6 py-3 rounded-lg font-medium transition-colors ${
              view === 'create'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            Create Campaign
          </button>
          {selectedCampaign && (
            <>
              <button
                onClick={() => setView('leaderboard')}
                className={`px-6 py-3 rounded-lg font-medium transition-colors ${
                  view === 'leaderboard'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                Leaderboard
              </button>
              <button
                onClick={() => setView('winners')}
                className={`px-6 py-3 rounded-lg font-medium transition-colors ${
                  view === 'winners'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                Winners
              </button>
            </>
          )}
        </nav>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          </div>
        ) : (
          <>
            {view === 'list' && (
              <CampaignList
                campaigns={campaigns}
                onSelectCampaign={setSelectedCampaign}
                onRefresh={fetchCampaigns}
              />
            )}
            {view === 'create' && (
              <CreateCampaign onSuccess={fetchCampaigns} />
            )}
            {view === 'leaderboard' && selectedCampaign && (
              <LeaderboardView campaign={selectedCampaign} />
            )}
            {view === 'winners' && selectedCampaign && (
              <WinnersManagement campaign={selectedCampaign} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
```

### Campaign Creation Form

```typescript
// src/components/CreateCampaign.tsx
import React, { useState } from 'react';
import { supabaseAdmin } from '../lib/supabaseClient';

interface CreateCampaignProps {
  onSuccess: () => void;
}

export default function CreateCampaign({ onSuccess }: CreateCampaignProps) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    total_prize_pool: 10000000,
    start_date: '',
    end_date: '',
    ticket_rate: 100,
  });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);

    try {
      // Create campaign
      const { data: campaign, error: campaignError } = await supabaseAdmin
        .from('giveaway_campaigns')
        .insert([{
          ...formData,
          status: 'active',
        }])
        .select()
        .single();

      if (campaignError) throw campaignError;

      // Create prize structure
      const prizes = [
        { rank_start: 1, rank_end: 1, prize_amount: 1000000, tier_name: '1st Place' },
        { rank_start: 2, rank_end: 2, prize_amount: 500000, tier_name: '2nd Place' },
        { rank_start: 3, rank_end: 4, prize_amount: 250000, tier_name: 'Top 4' },
        { rank_start: 5, rank_end: 24, prize_amount: 100000, tier_name: 'Top 20' },
        { rank_start: 25, rank_end: 64, prize_amount: 50000, tier_name: 'Top 40' },
        { rank_start: 65, rank_end: 164, prize_amount: 10000, tier_name: 'Top 100' },
        { rank_start: 165, rank_end: 364, prize_amount: 5000, tier_name: 'Top 200' },
        { rank_start: 365, rank_end: 1364, prize_amount: 1000, tier_name: 'Top 1000' },
      ];

      const prizesWithCampaignId = prizes.map(p => ({
        ...p,
        campaign_id: campaign.id,
      }));

      const { error: prizesError } = await supabaseAdmin
        .from('giveaway_prizes')
        .insert(prizesWithCampaignId);

      if (prizesError) throw prizesError;

      alert('Campaign created successfully!');
      onSuccess();
    } catch (err: any) {
      console.error('Error creating campaign:', err);
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="bg-slate-800 rounded-2xl p-8 max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold mb-6">Create New Giveaway Campaign</h2>

      {error && (
        <div className="bg-red-900/50 border border-red-500 rounded-lg p-4 mb-6">
          <p className="text-red-200">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium mb-2">Campaign Name</label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white"
            placeholder="10M USDT Mega Giveaway"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Description</label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white"
            rows={3}
            placeholder="Deposit USDT to earn tickets! 1 ticket per 100 USDT"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Total Prize Pool (USDT)</label>
            <input
              type="number"
              value={formData.total_prize_pool}
              onChange={(e) => setFormData({ ...formData, total_prize_pool: Number(e.target.value) })}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Ticket Rate (USDT per ticket)</label>
            <input
              type="number"
              value={formData.ticket_rate}
              onChange={(e) => setFormData({ ...formData, ticket_rate: Number(e.target.value) })}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white"
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Start Date</label>
            <input
              type="datetime-local"
              value={formData.start_date}
              onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">End Date</label>
            <input
              type="datetime-local"
              value={formData.end_date}
              onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white"
              required
            />
          </div>
        </div>

        <div className="bg-blue-900/30 border border-blue-500/50 rounded-lg p-4">
          <h3 className="font-semibold mb-2">Prize Structure (Automatic)</h3>
          <p className="text-sm text-slate-400 mb-3">
            The standard 8-tier structure will be created automatically:
          </p>
          <ul className="text-sm text-slate-300 space-y-1">
            <li>• Rank 1: $1,000,000</li>
            <li>• Rank 2: $500,000</li>
            <li>• Ranks 3-4: $250,000 each</li>
            <li>• Ranks 5-24: $100,000 each</li>
            <li>• Ranks 25-64: $50,000 each</li>
            <li>• Ranks 65-164: $10,000 each</li>
            <li>• Ranks 165-364: $5,000 each</li>
            <li>• Ranks 365-1364: $1,000 each</li>
          </ul>
        </div>

        <button
          type="submit"
          disabled={creating}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {creating ? 'Creating Campaign...' : 'Create Campaign'}
        </button>
      </form>
    </div>
  );
}
```

### Leaderboard Component

```typescript
// src/components/LeaderboardView.tsx
import React, { useState, useEffect } from 'react';
import { supabase, supabaseAdmin } from '../lib/supabaseClient';

interface Participant {
  user_id: string;
  email: string;
  total_tickets: number;
  rank: number;
  last_updated: string;
}

interface LeaderboardViewProps {
  campaign: {
    id: string;
    name: string;
  };
}

export default function LeaderboardView({ campaign }: LeaderboardViewProps) {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchLeaderboard();
  }, [campaign.id]);

  const fetchLeaderboard = async () => {
    try {
      // Fetch entries
      const { data: entries, error: entriesError } = await supabase
        .from('giveaway_entries')
        .select('user_id, total_tickets, last_updated')
        .eq('campaign_id', campaign.id)
        .order('total_tickets', { ascending: false });

      if (entriesError) throw entriesError;

      // Fetch user emails using service role
      const userIds = entries.map(e => e.user_id);

      // Create a map to store emails
      const emailMap = new Map<string, string>();

      // Fetch users in batches
      for (let i = 0; i < userIds.length; i += 100) {
        const batch = userIds.slice(i, i + 100);
        const { data: users } = await supabaseAdmin.auth.admin.listUsers();

        users.users.forEach(user => {
          if (batch.includes(user.id)) {
            emailMap.set(user.id, user.email || 'Unknown');
          }
        });
      }

      // Merge data
      const leaderboard: Participant[] = entries.map((entry, index) => ({
        user_id: entry.user_id,
        email: emailMap.get(entry.user_id) || 'Unknown',
        total_tickets: entry.total_tickets,
        rank: index + 1,
        last_updated: entry.last_updated,
      }));

      setParticipants(leaderboard);
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = () => {
    const headers = ['Rank', 'Email', 'Total Tickets', 'Last Updated'];
    const rows = filteredParticipants.map(p => [
      p.rank,
      p.email,
      p.total_tickets,
      new Date(p.last_updated).toLocaleString()
    ]);

    const csv = [headers, ...rows]
      .map(row => row.join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leaderboard_${campaign.name}_${Date.now()}.csv`;
    a.click();
  };

  const filteredParticipants = participants.filter(p =>
    p.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.user_id.includes(searchTerm)
  );

  return (
    <div className="bg-slate-800 rounded-2xl p-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold mb-2">Leaderboard - {campaign.name}</h2>
          <p className="text-slate-400">
            Total Participants: {participants.length.toLocaleString()} |
            Total Tickets: {participants.reduce((sum, p) => sum + p.total_tickets, 0).toLocaleString()}
          </p>
        </div>
        <button
          onClick={exportToCSV}
          className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
        >
          Export CSV
        </button>
      </div>

      <div className="mb-6">
        <input
          type="text"
          placeholder="Search by email or user ID..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left py-3 px-4">Rank</th>
                <th className="text-left py-3 px-4">Email</th>
                <th className="text-left py-3 px-4">User ID</th>
                <th className="text-right py-3 px-4">Total Tickets</th>
                <th className="text-right py-3 px-4">Last Updated</th>
              </tr>
            </thead>
            <tbody>
              {filteredParticipants.map((participant) => (
                <tr
                  key={participant.user_id}
                  className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors"
                >
                  <td className="py-3 px-4">
                    <span className={`font-bold ${
                      participant.rank === 1 ? 'text-yellow-400' :
                      participant.rank === 2 ? 'text-slate-300' :
                      participant.rank === 3 ? 'text-orange-400' :
                      'text-white'
                    }`}>
                      #{participant.rank}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-300">{participant.email}</td>
                  <td className="py-3 px-4 text-slate-400 font-mono text-sm">
                    {participant.user_id.substring(0, 8)}...
                  </td>
                  <td className="py-3 px-4 text-right font-semibold text-blue-400">
                    {participant.total_tickets.toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-right text-slate-400 text-sm">
                    {new Date(participant.last_updated).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

### Winners Management Component

```typescript
// src/components/WinnersManagement.tsx
import React, { useState, useEffect } from 'react';
import { supabase, supabaseAdmin } from '../lib/supabaseClient';

interface WinnerSelection {
  user_id: string;
  email: string;
  rank: number;
  prize_amount: number;
  prize_tier: string;
}

interface WinnersManagementProps {
  campaign: {
    id: string;
    name: string;
  };
}

export default function WinnersManagement({ campaign }: WinnersManagementProps) {
  const [selectedWinners, setSelectedWinners] = useState<WinnerSelection[]>([]);
  const [existingWinners, setExistingWinners] = useState<any[]>([]);
  const [selecting, setSelecting] = useState(false);
  const [inserting, setInserting] = useState(false);
  const [distributing, setDistributing] = useState(false);

  useEffect(() => {
    fetchExistingWinners();
  }, [campaign.id]);

  const fetchExistingWinners = async () => {
    const { data, error } = await supabase
      .from('giveaway_winners')
      .select('*')
      .eq('campaign_id', campaign.id)
      .order('rank', { ascending: true });

    if (!error && data) {
      setExistingWinners(data);
    }
  };

  const selectRandomWinners = async () => {
    setSelecting(true);

    try {
      // Fetch all participants
      const { data: entries } = await supabase
        .from('giveaway_entries')
        .select('user_id, total_tickets')
        .eq('campaign_id', campaign.id)
        .order('total_tickets', { ascending: false });

      if (!entries || entries.length === 0) {
        alert('No participants found!');
        return;
      }

      // Get user emails
      const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
      const emailMap = new Map(users.map(u => [u.id, u.email || 'Unknown']));

      // Create weighted pool
      const weightedPool: string[] = [];
      entries.forEach(entry => {
        for (let i = 0; i < entry.total_tickets; i++) {
          weightedPool.push(entry.user_id);
        }
      });

      // Select unique winners
      const selectedSet = new Set<string>();
      const winners: WinnerSelection[] = [];

      while (selectedSet.size < 1000 && selectedSet.size < entries.length) {
        const randomIndex = Math.floor(Math.random() * weightedPool.length);
        const winnerId = weightedPool[randomIndex];

        if (!selectedSet.has(winnerId)) {
          selectedSet.add(winnerId);
          const rank = winners.length + 1;
          const { prize_amount, prize_tier } = getPrizeForRank(rank);

          winners.push({
            user_id: winnerId,
            email: emailMap.get(winnerId) || 'Unknown',
            rank,
            prize_amount,
            prize_tier,
          });
        }
      }

      setSelectedWinners(winners);
      alert(`Selected ${winners.length} winners!`);
    } catch (error) {
      console.error('Error selecting winners:', error);
      alert('Failed to select winners');
    } finally {
      setSelecting(false);
    }
  };

  const getPrizeForRank = (rank: number) => {
    if (rank === 1) return { prize_amount: 1000000, prize_tier: '1st Place' };
    if (rank === 2) return { prize_amount: 500000, prize_tier: '2nd Place' };
    if (rank >= 3 && rank <= 4) return { prize_amount: 250000, prize_tier: 'Top 4' };
    if (rank >= 5 && rank <= 24) return { prize_amount: 100000, prize_tier: 'Top 20' };
    if (rank >= 25 && rank <= 64) return { prize_amount: 50000, prize_tier: 'Top 40' };
    if (rank >= 65 && rank <= 164) return { prize_amount: 10000, prize_tier: 'Top 100' };
    if (rank >= 165 && rank <= 364) return { prize_amount: 5000, prize_tier: 'Top 200' };
    if (rank >= 365 && rank <= 1364) return { prize_amount: 1000, prize_tier: 'Top 1000' };
    return { prize_amount: 0, prize_tier: 'Not Eligible' };
  };

  const insertWinnersToDatabase = async () => {
    if (!confirm(`Are you sure you want to insert ${selectedWinners.length} winners?`)) {
      return;
    }

    setInserting(true);

    try {
      const winnerRecords = selectedWinners.map(w => ({
        campaign_id: campaign.id,
        user_id: w.user_id,
        rank: w.rank,
        prize_amount: w.prize_amount,
        prize_tier: w.prize_tier,
        claimed: false,
        paid_out: false,
      }));

      // Insert in batches
      const batchSize = 100;
      for (let i = 0; i < winnerRecords.length; i += batchSize) {
        const batch = winnerRecords.slice(i, i + batchSize);
        const { error } = await supabaseAdmin
          .from('giveaway_winners')
          .insert(batch);

        if (error) throw error;
      }

      alert('Winners inserted successfully!');
      fetchExistingWinners();
      setSelectedWinners([]);
    } catch (error) {
      console.error('Error inserting winners:', error);
      alert('Failed to insert winners');
    } finally {
      setInserting(false);
    }
  };

  const distributePrizes = async () => {
    if (!confirm('Are you sure you want to distribute prizes to all winners?')) {
      return;
    }

    setDistributing(true);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseServiceKey = import.meta.env.VITE_SUPABASE_SERVICE_KEY;

      const response = await fetch(
        `${supabaseUrl}/functions/v1/distribute-giveaway-prizes`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({ campaignId: campaign.id }),
        }
      );

      if (!response.ok) throw new Error('Failed to distribute prizes');

      const result = await response.json();
      alert(`Successfully distributed prizes to ${result.paidCount} winners!`);
      fetchExistingWinners();
    } catch (error) {
      console.error('Error distributing prizes:', error);
      alert('Failed to distribute prizes');
    } finally {
      setDistributing(false);
    }
  };

  const payoutStatus = {
    total: existingWinners.length,
    paid: existingWinners.filter(w => w.paid_out).length,
    unpaid: existingWinners.filter(w => !w.paid_out).length,
  };

  return (
    <div className="space-y-6">
      {/* Status Card */}
      <div className="bg-slate-800 rounded-2xl p-6">
        <h3 className="text-xl font-bold mb-4">Winner Status</h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-slate-900 rounded-lg p-4">
            <p className="text-slate-400 text-sm mb-1">Total Winners</p>
            <p className="text-3xl font-bold text-white">{payoutStatus.total}</p>
          </div>
          <div className="bg-green-900/30 rounded-lg p-4">
            <p className="text-green-400 text-sm mb-1">Paid Out</p>
            <p className="text-3xl font-bold text-green-400">{payoutStatus.paid}</p>
          </div>
          <div className="bg-orange-900/30 rounded-lg p-4">
            <p className="text-orange-400 text-sm mb-1">Pending</p>
            <p className="text-3xl font-bold text-orange-400">{payoutStatus.unpaid}</p>
          </div>
        </div>
      </div>

      {/* Actions */}
      {existingWinners.length === 0 ? (
        <div className="bg-slate-800 rounded-2xl p-6">
          <h3 className="text-xl font-bold mb-4">Select Winners</h3>

          <button
            onClick={selectRandomWinners}
            disabled={selecting}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 rounded-lg transition-colors disabled:opacity-50 mb-4"
          >
            {selecting ? 'Selecting Winners...' : 'Select 1000 Random Winners (Weighted)'}
          </button>

          {selectedWinners.length > 0 && (
            <>
              <div className="bg-green-900/30 border border-green-500 rounded-lg p-4 mb-4">
                <p className="text-green-400 font-semibold">
                  {selectedWinners.length} winners selected!
                </p>
                <p className="text-sm text-slate-300 mt-2">
                  Total prize amount: ${selectedWinners.reduce((sum, w) => sum + w.prize_amount, 0).toLocaleString()}
                </p>
              </div>

              <button
                onClick={insertWinnersToDatabase}
                disabled={inserting}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-4 rounded-lg transition-colors disabled:opacity-50"
              >
                {inserting ? 'Inserting Winners...' : 'Insert Winners to Database'}
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="bg-slate-800 rounded-2xl p-6">
          <h3 className="text-xl font-bold mb-4">Prize Distribution</h3>

          {payoutStatus.unpaid > 0 ? (
            <>
              <p className="text-slate-300 mb-4">
                {payoutStatus.unpaid} winners are waiting for prize distribution.
              </p>
              <button
                onClick={distributePrizes}
                disabled={distributing}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-4 rounded-lg transition-colors disabled:opacity-50"
              >
                {distributing ? 'Distributing Prizes...' : `Distribute Prizes to ${payoutStatus.unpaid} Winners`}
              </button>
            </>
          ) : (
            <div className="bg-green-900/30 border border-green-500 rounded-lg p-4">
              <p className="text-green-400 font-semibold">
                All prizes have been distributed!
              </p>
            </div>
          )}
        </div>
      )}

      {/* Winners List Preview */}
      {existingWinners.length > 0 && (
        <div className="bg-slate-800 rounded-2xl p-6">
          <h3 className="text-xl font-bold mb-4">Winners List (Top 20)</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left py-3 px-4">Rank</th>
                  <th className="text-left py-3 px-4">Tier</th>
                  <th className="text-right py-3 px-4">Prize Amount</th>
                  <th className="text-center py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {existingWinners.slice(0, 20).map((winner) => (
                  <tr key={winner.id} className="border-b border-slate-700/50">
                    <td className="py-3 px-4 font-bold">#{winner.rank}</td>
                    <td className="py-3 px-4 text-slate-300">{winner.prize_tier}</td>
                    <td className="py-3 px-4 text-right font-semibold text-green-400">
                      ${winner.prize_amount.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {winner.paid_out ? (
                        <span className="bg-green-900/50 text-green-400 px-3 py-1 rounded-full text-sm">
                          Paid
                        </span>
                      ) : (
                        <span className="bg-orange-900/50 text-orange-400 px-3 py-1 rounded-full text-sm">
                          Pending
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
```

---

## API Integration

### Edge Function Endpoints

Both edge functions are deployed and accessible:

**1. Process Giveaway Tickets**
```
POST https://your-project.supabase.co/functions/v1/process-giveaway-tickets
```

**2. Distribute Giveaway Prizes**
```
POST https://your-project.supabase.co/functions/v1/distribute-giveaway-prizes
```

---

## Testing Guide

### Step 1: Test Campaign Creation
1. Create a test campaign with:
   - Name: "Test Giveaway"
   - Prize pool: 10,000 USDT
   - Start date: Today
   - End date: 7 days from now
   - Ticket rate: 100

2. Verify campaign appears in database:
```sql
SELECT * FROM giveaway_campaigns WHERE name = 'Test Giveaway';
```

3. Verify prize structure was created:
```sql
SELECT * FROM giveaway_prizes WHERE campaign_id = 'YOUR_CAMPAIGN_ID';
```

### Step 2: Test Leaderboard
1. Check if any participants exist
2. Export leaderboard to CSV
3. Verify data accuracy

### Step 3: Test Winner Selection
1. Select random winners (start with 10 for testing)
2. Review selected winners
3. Insert to database
4. Verify insertion:
```sql
SELECT COUNT(*) FROM giveaway_winners WHERE campaign_id = 'YOUR_CAMPAIGN_ID';
```

### Step 4: Test Prize Distribution
1. Trigger distribution for test campaign
2. Monitor progress in UI
3. Verify payouts:
```sql
SELECT
  COUNT(*) FILTER (WHERE paid_out = true) as paid,
  COUNT(*) FILTER (WHERE paid_out = false) as unpaid
FROM giveaway_winners
WHERE campaign_id = 'YOUR_CAMPAIGN_ID';
```

4. Check user balances increased:
```sql
SELECT * FROM transactions WHERE type = 'giveaway_prize' LIMIT 10;
```

---

## Security Considerations

1. **Use Service Role Key for Admin Operations**
   - Never expose service role key in client code
   - Only use for server-side operations
   - Store in environment variables

2. **Validate All Inputs**
   - Check campaign dates
   - Verify prize amounts
   - Validate winner selections

3. **Implement Rate Limiting**
   - Limit API calls to edge functions
   - Prevent abuse of distribution endpoint

4. **Audit Logging**
   - Log all admin actions
   - Track who created campaigns
   - Record prize distributions

---

## Deployment Checklist

- [ ] Environment variables configured
- [ ] Supabase client installed
- [ ] Database connection tested
- [ ] Campaign creation works
- [ ] Leaderboard displays correctly
- [ ] Winner selection algorithm tested
- [ ] Prize distribution tested
- [ ] CSV export works
- [ ] Error handling implemented
- [ ] Loading states added
- [ ] Confirmation dialogs in place
- [ ] Production credentials secured

---

## Support & Troubleshooting

**Common Issues:**

1. **Cannot fetch user emails**
   - Solution: Use service role key with `supabaseAdmin.auth.admin.listUsers()`

2. **Duplicate winner error**
   - Solution: Check for existing winners before insertion

3. **Prize distribution fails**
   - Solution: Check edge function logs and user balance records

4. **Slow leaderboard loading**
   - Solution: Implement pagination and caching

**Need Help?**
- Check Supabase dashboard logs
- Review edge function deployment status
- Verify database RLS policies
- Test with small datasets first
