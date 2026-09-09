import React, { useEffect, useState } from 'react';
import { Gift, X, Calendar, DollarSign, Ticket, Clock } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

interface GiveawayCampaign {
  id: string;
  name: string;
  description: string;
  total_prize_pool: number;
  start_date: string;
  end_date: string;
  ticket_rate: number;
  target_participants: number;
}

interface GiveawayComingSoonPopupProps {
  forceShow?: boolean;
}

export default function GiveawayComingSoonPopup({ forceShow = false }: GiveawayComingSoonPopupProps) {
  const [campaign, setCampaign] = useState<GiveawayCampaign | null>(null);
  const [showPopup, setShowPopup] = useState(false);
  const [timeUntilStart, setTimeUntilStart] = useState('');
  const [hasChecked, setHasChecked] = useState(false);

  useEffect(() => {
    if (forceShow) {
      const mockCampaign: GiveawayCampaign = {
        id: 'test-upcoming',
        name: 'Black Friday Mega Giveaway',
        description: 'Join our biggest giveaway event! Deposit USDT to earn tickets and compete for amazing prizes.',
        total_prize_pool: 250000,
        start_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        end_date: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString(),
        ticket_rate: 50,
        target_participants: 346348,
      };
      setCampaign(mockCampaign);
      setShowPopup(true);
    } else if (!hasChecked) {
      checkForUpcomingCampaign();
      setHasChecked(true);
    }
  }, [forceShow, hasChecked]);

  useEffect(() => {
    if (!campaign) return;

    const updateCountdown = () => {
      const now = new Date().getTime();
      const start = new Date(campaign.start_date).getTime();
      const diff = start - now;

      if (diff <= 0) {
        setTimeUntilStart('Starting now!');
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

      if (days > 0) {
        setTimeUntilStart(`${days}d ${hours}h ${minutes}m`);
      } else if (hours > 0) {
        setTimeUntilStart(`${hours}h ${minutes}m`);
      } else {
        setTimeUntilStart(`${minutes}m`);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 60000);

    return () => clearInterval(interval);
  }, [campaign]);

  const checkForUpcomingCampaign = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const now = new Date().toISOString();

      const { data: upcomingCampaigns, error: queryError } = await supabase
        .from('giveaway_campaigns')
        .select('*')
        .eq('status', 'pending')
        .gt('start_date', now)
        .order('start_date', { ascending: true })
        .limit(1);

      if (queryError) {
        console.error('Error querying campaigns:', queryError);
        return;
      }

      const upcomingCampaign = upcomingCampaigns && upcomingCampaigns.length > 0 ? upcomingCampaigns[0] : null;

      if (upcomingCampaign) {
        const sessionKey = `comingSoonShown_${upcomingCampaign.id}`;
        const shownThisSession = sessionStorage.getItem(sessionKey);

        if (shownThisSession) {
          return;
        }

        const storedData = localStorage.getItem('shownUpcomingGiveaways');
        const shownCampaignsData = storedData ? JSON.parse(storedData) : {};
        const lastShown = shownCampaignsData[upcomingCampaign.id];
        const currentTime = Date.now();
        const twoHours = 2 * 60 * 60 * 1000;

        if (!lastShown || (currentTime - lastShown) >= twoHours) {
          setCampaign(upcomingCampaign);
          setShowPopup(true);
        }
      } else {
        localStorage.removeItem('shownUpcomingGiveaways');
      }
    } catch (error) {
      console.error('Error checking for upcoming campaign:', error);
    }
  };

  const handleClose = () => {
    if (campaign) {
      const sessionKey = `comingSoonShown_${campaign.id}`;
      sessionStorage.setItem(sessionKey, 'true');

      const shownCampaignsData = JSON.parse(localStorage.getItem('shownUpcomingGiveaways') || '{}');
      shownCampaignsData[campaign.id] = Date.now();
      localStorage.setItem('shownUpcomingGiveaways', JSON.stringify(shownCampaignsData));
    }
    setShowPopup(false);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
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

  if (!showPopup || !campaign) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="app-auth-card rounded-2xl max-w-lg w-full border-2 border-orange-500/30 shadow-2xl shadow-orange-500/20 animate-scale-in">
        <div className="relative p-8">
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>

          <div className="flex flex-col items-center text-center mb-6">
            <div className="bg-gradient-to-r from-orange-500 to-yellow-600 p-4 rounded-full mb-4 animate-pulse-slow">
              <Gift size={48} className="text-white" />
            </div>

            <h2 className="text-3xl font-bold text-white mb-2">
              Giveaway Coming Soon!
            </h2>

            <div className="inline-block bg-gradient-to-r from-orange-500/20 to-yellow-500/20 border border-orange-500/30 rounded-xl px-6 py-3 mb-4">
              <p className="text-2xl font-bold text-orange-400">
                {formatCurrency(campaign.total_prize_pool)}
              </p>
              <p className="text-sm text-orange-300">Total Prize Pool</p>
            </div>

            <h3 className="text-xl font-semibold text-white mb-2">{campaign.name}</h3>
            <p className="text-slate-300 mb-4">{campaign.description}</p>

            <div className="flex items-center gap-2 bg-gradient-to-r from-orange-500/20 to-yellow-500/20 border border-orange-500/30 rounded-xl px-4 py-2 mb-6">
              <Clock className="w-5 h-5 text-orange-400" />
              <div className="text-left">
                <p className="text-xs text-orange-300">Starts in</p>
                <p className="text-lg font-bold text-orange-400">{timeUntilStart}</p>
              </div>
            </div>
          </div>

          <div className="space-y-3 mb-6">
            <div className="flex items-center gap-3 bg-slate-700/50 rounded-xl p-3">
              <Calendar className="w-5 h-5 text-orange-400 flex-shrink-0" />
              <div className="text-left flex-1">
                <p className="text-xs text-slate-400">Campaign Starts</p>
                <p className="text-sm text-white font-medium">
                  {formatDate(campaign.start_date)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 bg-slate-700/50 rounded-xl p-3">
              <Calendar className="w-5 h-5 text-blue-400 flex-shrink-0" />
              <div className="text-left flex-1">
                <p className="text-xs text-slate-400">Campaign Ends</p>
                <p className="text-sm text-white font-medium">
                  {formatDate(campaign.end_date)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 bg-slate-700/50 rounded-xl p-3">
              <Ticket className="w-5 h-5 text-purple-400 flex-shrink-0" />
              <div className="text-left flex-1">
                <p className="text-xs text-slate-400">How to Enter</p>
                <p className="text-sm text-white font-medium">
                  Earn 1 ticket per ${campaign.ticket_rate} USDT deposited
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 bg-slate-700/50 rounded-xl p-3">
              <DollarSign className="w-5 h-5 text-green-400 flex-shrink-0" />
              <div className="text-left flex-1">
                <p className="text-xs text-slate-400">Winner Selection</p>
                <p className="text-sm text-white font-medium">
                  Random draw weighted by tickets after campaign ends
                </p>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-r from-orange-500/10 to-yellow-500/10 border border-orange-500/20 rounded-xl p-4 mb-6">
            <p className="text-sm text-orange-300 text-center">
              Get ready! Start depositing as soon as the campaign goes live to maximize your tickets.
            </p>
          </div>

          <button
            onClick={handleClose}
            className="w-full bg-gradient-to-r from-orange-600 to-yellow-600 hover:from-orange-700 hover:to-yellow-700 text-white font-semibold py-3 rounded-xl transition-all shadow-lg shadow-orange-500/20"
          >
            Got It!
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes scale-in {
          from { transform: scale(0.9); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }

        @keyframes pulse-slow {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(1.05); }
        }

        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }

        .animate-scale-in {
          animation: scale-in 0.3s ease-out;
        }

        .animate-pulse-slow {
          animation: pulse-slow 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}

