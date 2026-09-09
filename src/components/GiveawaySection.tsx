import React, { useState, useEffect } from 'react';
import { Gift, Ticket, Trophy, Calendar, Users, DollarSign, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

interface GiveawayCampaign {
  id: string;
  name: string;
  description: string;
  total_prize_pool: number;
  start_date: string;
  end_date: string;
  status: string;
  ticket_rate: number;
  target_participants: number;
}

interface GiveawayPrize {
  id: string;
  rank_start: number;
  rank_end: number;
  prize_amount: number;
  tier_name: string;
}

interface GiveawayTicket {
  id: string;
  ticket_count: number;
  created_at: string;
  deposit_transaction_id: string;
}

interface GiveawayEntry {
  total_tickets: number;
}

interface GiveawayWinner {
  id: string;
  rank: number;
  prize_amount: number;
  prize_tier: string;
  claimed: boolean;
  paid_out: boolean;
  created_at: string;
}

export default function GiveawaySection() {
  const [activeCampaign, setActiveCampaign] = useState<GiveawayCampaign | null>(null);
  const [prizes, setPrizes] = useState<GiveawayPrize[]>([]);
  const [userTickets, setUserTickets] = useState<GiveawayTicket[]>([]);
  const [totalTickets, setTotalTickets] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [userWins, setUserWins] = useState<GiveawayWinner[]>([]);
  const [animatedParticipants, setAnimatedParticipants] = useState(0);
  const [showPrizeStructure, setShowPrizeStructure] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchGiveawayData();
  }, [refreshKey]);

  // Real-time subscription for ticket updates
  useEffect(() => {
    if (!activeCampaign) return;

    const setupRealtimeSubscription = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const ticketsChannel = supabase
        .channel('giveaway-tickets-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'giveaway_tickets',
            filter: `campaign_id=eq.${activeCampaign.id}`
          },
          (payload) => {
            fetchUserTicketsAndEntries(user.id, activeCampaign.id);
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'giveaway_entries',
            filter: `campaign_id=eq.${activeCampaign.id}`
          },
          (payload) => {
            fetchUserTicketsAndEntries(user.id, activeCampaign.id);
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'giveaway_winners',
            filter: `user_id=eq.${user.id}`
          },
          (payload) => {
            fetchUserWinnings(user.id);
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(ticketsChannel);
      };
    };

    const cleanup = setupRealtimeSubscription();
    return () => {
      cleanup.then((cleanupFn) => cleanupFn?.());
    };
  }, [activeCampaign]);

  // Calculate and animate participant count based on campaign progress
  useEffect(() => {
    if (!activeCampaign) return;

    const calculateParticipants = () => {
      const now = new Date().getTime();
      const start = new Date(activeCampaign.start_date).getTime();
      const end = new Date(activeCampaign.end_date).getTime();
      const target = activeCampaign.target_participants;

      // If campaign hasn't started, show 0
      if (now < start) {
        setAnimatedParticipants(0);
        return;
      }

      // If campaign has ended, show target
      if (now >= end) {
        setAnimatedParticipants(target);
        return;
      }

      // Calculate progress (0 to 1)
      const progress = (now - start) / (end - start);

      // Use easing function for more realistic growth (fast start, slower end)
      const easedProgress = 1 - Math.pow(1 - progress, 2);

      // Calculate current participants
      const current = Math.floor(easedProgress * target);
      setAnimatedParticipants(current);
    };

    calculateParticipants();
    const interval = setInterval(calculateParticipants, 5000); // Update every 5 seconds for smoother animation

    return () => clearInterval(interval);
  }, [activeCampaign]);

  const fetchUserTicketsAndEntries = async (userId: string, campaignId: string) => {
    try {
      const { data: ticketData } = await supabase
        .from('giveaway_tickets')
        .select('*')
        .eq('user_id', userId)
        .eq('campaign_id', campaignId)
        .order('created_at', { ascending: false });

      if (ticketData) {
        setUserTickets(ticketData);
      }

      const { data: entryData } = await supabase
        .from('giveaway_entries')
        .select('total_tickets')
        .eq('user_id', userId)
        .eq('campaign_id', campaignId)
        .single();

      if (entryData) {
        setTotalTickets(entryData.total_tickets);
      }
    } catch (error) {
      console.error('Error fetching user tickets:', error);
    }
  };

  const fetchUserWinnings = async (userId: string) => {
    try {
      const { data: winnerData } = await supabase
        .from('giveaway_winners')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (winnerData) {
        setUserWins(winnerData);
      }
    } catch (error) {
      console.error('Error fetching user winnings:', error);
    }
  };

  const fetchGiveawayData = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) return;

      const { data: campaigns } = await supabase
        .from('giveaway_campaigns')
        .select('*')
        .in('status', ['active', 'pending'])
        .gte('end_date', new Date().toISOString())
        .lte('start_date', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1);

      const campaign = campaigns && campaigns.length > 0 ? campaigns[0] : null;

      if (campaign) {
        setActiveCampaign(campaign);

        const { data: prizeData } = await supabase
          .from('giveaway_prizes')
          .select('*')
          .eq('campaign_id', campaign.id)
          .order('rank_start', { ascending: true });

        if (prizeData) {
          setPrizes(prizeData);
        }

        await fetchUserTicketsAndEntries(user.id, campaign.id);
      }

      await fetchUserWinnings(user.id);
    } catch (error) {
      console.error('Error fetching giveaway data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getDaysRemaining = (endDate: string) => {
    const end = new Date(endDate);
    const now = new Date();
    const diffTime = end.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
  };

  const handleClaimWinner = async (winnerId: string) => {
    try {
      const { error } = await supabase
        .from('giveaway_winners')
        .update({ claimed: true, claimed_at: new Date().toISOString() })
        .eq('id', winnerId);

      if (!error) {
        fetchGiveawayData();
      }
    } catch (error) {
      console.error('Error claiming winner:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  const unclaimedWins = userWins.filter(w => !w.claimed);

  return (
    <div className="space-y-6">
      {unclaimedWins.length > 0 && (
        <div className="bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border-2 border-yellow-500/50 rounded-2xl p-6">
          <div className="flex items-start gap-4">
            <div className="bg-yellow-500/20 p-3 rounded-xl">
              <Trophy className="w-8 h-8 text-yellow-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-bold text-white mb-2">Congratulations! You Won!</h3>
              {unclaimedWins.map((win) => (
                <div key={win.id} className="mb-4">
                  <p className="text-gray-300 mb-2">
                    You won <span className="text-yellow-400 font-bold">{formatCurrency(Number(win.prize_amount))}</span> (Rank {win.rank} - {win.prize_tier})!
                  </p>
                  {win.paid_out ? (
                    <div className="flex items-center gap-3">
                      <p className="text-green-400 font-medium">✓ Prize has been credited to your account!</p>
                      <button
                        onClick={() => handleClaimWinner(win.id)}
                        className="bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white font-semibold py-2 px-6 rounded-xl transition-all"
                      >
                        Acknowledge
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <p className="text-yellow-400 font-medium">⏳ Prize payment is being processed...</p>
                      <button
                        onClick={() => handleClaimWinner(win.id)}
                        className="app-action-soft text-white font-semibold py-2 px-6 rounded-xl transition-all"
                      >
                        Acknowledge
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {!activeCampaign ? (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-8 text-center">
          <Gift className="w-16 h-16 text-slate-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-white mb-2">No Active Giveaway</h3>
          <p className="text-gray-400">Check back soon for our next amazing giveaway!</p>
        </div>
      ) : (
        <>
          <div className="bg-gradient-to-br from-blue-600/20 to-purple-600/20 border border-blue-500/30 rounded-2xl p-6">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-white mb-2">{activeCampaign.name}</h2>
                <p className="text-gray-300">{activeCampaign.description}</p>
              </div>
              <div className="bg-blue-500/20 p-3 rounded-xl">
                <Gift className="w-8 h-8 text-blue-400" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-slate-800/50 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="w-5 h-5 text-green-400" />
                  <span className="text-sm text-gray-400">Total Prize Pool</span>
                </div>
                <p className="text-2xl font-bold text-white">{formatCurrency(activeCampaign.total_prize_pool)}</p>
              </div>

              <div className="bg-slate-800/50 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Ticket className="w-5 h-5 text-blue-400" />
                  <span className="text-sm text-gray-400">Your Tickets</span>
                </div>
                <p className="text-2xl font-bold text-white">{totalTickets.toLocaleString()}</p>
                <p className="text-xs text-gray-500 mt-1">Updates every deposit</p>
              </div>

              <div className="bg-slate-800/50 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="w-5 h-5 text-purple-400" />
                  <span className="text-sm text-gray-400">Participants</span>
                </div>
                <p className="text-2xl font-bold text-white">{animatedParticipants.toLocaleString()}</p>
                <p className="text-xs text-gray-500 mt-1">Live count</p>
              </div>

              <div className="bg-slate-800/50 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="w-5 h-5 text-orange-400" />
                  <span className="text-sm text-gray-400">Days Remaining</span>
                </div>
                <p className="text-2xl font-bold text-white">{getDaysRemaining(activeCampaign.end_date)}</p>
              </div>
            </div>

            <div className="bg-slate-800/50 rounded-xl p-4">
              <p className="text-sm text-gray-400 mb-2">Campaign Period</p>
              <p className="text-white">
                {formatDate(activeCampaign.start_date)} - {formatDate(activeCampaign.end_date)}
              </p>
            </div>
          </div>

          <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
            <button
              onClick={() => setShowPrizeStructure(!showPrizeStructure)}
              className="flex items-center justify-between w-full mb-4"
            >
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <Trophy className="w-6 h-6 text-yellow-400" />
                Prize Structure
              </h3>
              {showPrizeStructure ? (
                <ChevronUp className="w-5 h-5 text-gray-400" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-400" />
              )}
            </button>

            {showPrizeStructure && (
              <div className="space-y-3">
                {prizes.map((prize) => (
                  <div key={prize.id} className="flex items-center justify-between bg-slate-700/30 rounded-xl p-4">
                    <div className="flex items-center gap-4">
                      <div className="bg-gradient-to-br from-yellow-500/20 to-orange-500/20 p-2 rounded-lg">
                        <Trophy className="w-5 h-5 text-yellow-400" />
                      </div>
                      <div>
                        <p className="text-white font-semibold">{prize.tier_name}</p>
                        <p className="text-sm text-gray-400">
                          Rank {prize.rank_start}
                          {prize.rank_end !== prize.rank_start && ` - ${prize.rank_end}`}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold text-green-400">{formatCurrency(Number(prize.prize_amount))}</p>
                      {prize.rank_end !== prize.rank_start && (
                        <p className="text-xs text-gray-400">per winner</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {userTickets.length > 0 && (
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
              <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <Ticket className="w-6 h-6 text-blue-400" />
                Your Ticket History
              </h3>
              <div className="space-y-3">
                {userTickets.map((ticket) => (
                  <div key={ticket.id} className="flex items-center justify-between bg-slate-700/30 rounded-xl p-4">
                    <div>
                      <p className="text-white font-semibold">{ticket.ticket_count} Tickets Earned</p>
                      <p className="text-sm text-gray-400">{formatDate(ticket.created_at)}</p>
                    </div>
                    <div className="bg-blue-500/20 px-3 py-1 rounded-lg">
                      <p className="text-blue-400 text-sm font-medium">
                        {formatCurrency(ticket.ticket_count * activeCampaign.ticket_rate)} deposited
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-gradient-to-r from-blue-600/20 to-purple-600/20 border border-blue-500/30 rounded-2xl p-6">
            <h3 className="text-lg font-bold text-white mb-3">How to Participate</h3>
            <ul className="space-y-2 text-gray-300">
              <li className="flex items-start gap-2">
                <span className="text-blue-400 font-bold">1.</span>
                <span>Deposit USDT to your wallet</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 font-bold">2.</span>
                <span>Earn 1 ticket for every ${activeCampaign.ticket_rate} USDT deposited during the campaign period</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 font-bold">3.</span>
                <span>Winners will be randomly selected based on ticket weight after campaign ends</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 font-bold">4.</span>
                <span>Prizes will be automatically credited to winners' accounts</span>
              </li>
            </ul>
          </div>
        </>
      )}

      {userWins.length > 0 && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
          <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <Trophy className="w-6 h-6 text-yellow-400" />
            Your Winnings History
          </h3>
          <div className="space-y-3">
            {userWins.map((win) => (
              <div key={win.id} className="flex items-center justify-between bg-slate-700/30 rounded-xl p-4">
                <div>
                  <p className="text-white font-semibold">Rank {win.rank} - {win.prize_tier}</p>
                  <p className="text-sm text-gray-400">{formatDate(win.created_at)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-green-400">{formatCurrency(Number(win.prize_amount))}</p>
                  <p className="text-xs text-gray-400">
                    {win.paid_out ? 'Paid Out' : 'Pending Payment'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

