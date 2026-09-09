import React, { useEffect, useState } from 'react';
import { Gift, X, Calendar, DollarSign, Ticket } from 'lucide-react';
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

interface GiveawayCampaignPopupProps {
  forceShow?: boolean;
}

export default function GiveawayCampaignPopup({ forceShow = false }: GiveawayCampaignPopupProps) {
  const [campaign, setCampaign] = useState<GiveawayCampaign | null>(null);
  const [showPopup, setShowPopup] = useState(false);
  const [hasChecked, setHasChecked] = useState(false);

  useEffect(() => {
    if (forceShow) {
      const mockCampaign: GiveawayCampaign = {
        id: 'test-campaign',
        name: 'New Year Mega Giveaway',
        description: 'Join our biggest giveaway of the year! Deposit USDT to earn tickets and win amazing prizes.',
        total_prize_pool: 100000,
        start_date: new Date().toISOString(),
        end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        ticket_rate: 100,
        target_participants: 157823,
      };
      setCampaign(mockCampaign);
      setShowPopup(true);
    } else if (!hasChecked) {
      checkForNewCampaign();
      setHasChecked(true);
    }
  }, [forceShow, hasChecked]);

  const checkForNewCampaign = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: activeCampaign } = await supabase
        .from('giveaway_campaigns')
        .select('*')
        .eq('status', 'active')
        .gte('end_date', new Date().toISOString())
        .order('start_date', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (activeCampaign) {
        const sessionKey = `campaignShown_${activeCampaign.id}`;
        const shownThisSession = sessionStorage.getItem(sessionKey);

        if (shownThisSession) {
          return;
        }

        const shownCampaignsData = JSON.parse(localStorage.getItem('shownGiveawayCampaigns') || '{}');
        const lastShown = shownCampaignsData[activeCampaign.id];
        const now = Date.now();
        const twoHours = 2 * 60 * 60 * 1000;

        if (!lastShown || (now - lastShown) >= twoHours) {
          setCampaign(activeCampaign);
          setShowPopup(true);
        }
      }
    } catch (error) {
      console.error('Error checking for giveaway campaign:', error);
    }
  };

  const handleClose = () => {
    if (campaign) {
      const sessionKey = `campaignShown_${campaign.id}`;
      sessionStorage.setItem(sessionKey, 'true');

      const shownCampaignsData = JSON.parse(localStorage.getItem('shownGiveawayCampaigns') || '{}');
      shownCampaignsData[campaign.id] = Date.now();
      localStorage.setItem('shownGiveawayCampaigns', JSON.stringify(shownCampaignsData));
    }
    setShowPopup(false);
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

  if (!showPopup || !campaign) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="app-auth-card rounded-2xl max-w-lg w-full border-2 border-blue-500/30 shadow-2xl shadow-blue-500/20 animate-scale-in">
        <div className="relative p-8">
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>

          <div className="flex flex-col items-center text-center mb-6">
            <div className="bg-gradient-to-r from-blue-500 to-purple-600 p-4 rounded-full mb-4 animate-bounce-slow">
              <Gift size={48} className="text-white" />
            </div>

            <h2 className="text-3xl font-bold text-white mb-2">
              New Giveaway Live!
            </h2>

            <div className="inline-block bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border border-yellow-500/30 rounded-xl px-4 py-2 mb-4">
              <p className="text-2xl font-bold text-yellow-400">
                {formatCurrency(campaign.total_prize_pool)}
              </p>
              <p className="text-sm text-yellow-300">Total Prize Pool</p>
            </div>

            <h3 className="text-xl font-semibold text-white mb-2">{campaign.name}</h3>
            <p className="text-slate-300 mb-6">{campaign.description}</p>
          </div>

          <div className="space-y-3 mb-6">
            <div className="flex items-center gap-3 bg-slate-700/50 rounded-xl p-3">
              <Calendar className="w-5 h-5 text-blue-400 flex-shrink-0" />
              <div className="text-left flex-1">
                <p className="text-xs text-slate-400">Campaign Period</p>
                <p className="text-sm text-white font-medium">
                  {formatDate(campaign.start_date)} - {formatDate(campaign.end_date)}
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

          <button
            onClick={handleClose}
            className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold py-3 rounded-xl transition-all shadow-lg shadow-blue-500/20"
          >
            Start Earning Tickets!
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

        @keyframes bounce-slow {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }

        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }

        .animate-scale-in {
          animation: scale-in 0.3s ease-out;
        }

        .animate-bounce-slow {
          animation: bounce-slow 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}

