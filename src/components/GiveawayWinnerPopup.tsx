import React, { useEffect, useState } from 'react';
import { Trophy, X, Sparkles } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

interface GiveawayWinner {
  id: string;
  rank: number;
  prize_amount: number;
  prize_tier: string;
  claimed: boolean;
  paid_out: boolean;
  created_at: string;
}

interface GiveawayWinnerPopupProps {
  forceShow?: boolean;
}

export default function GiveawayWinnerPopup({ forceShow = false }: GiveawayWinnerPopupProps) {
  const [winner, setWinner] = useState<GiveawayWinner | null>(null);
  const [showPopup, setShowPopup] = useState(false);

  useEffect(() => {
    if (forceShow) {
      const mockWinner: GiveawayWinner = {
        id: 'test-winner',
        rank: 1,
        prize_amount: 100000,
        prize_tier: '1st Place',
        claimed: false,
        paid_out: true,
        created_at: new Date().toISOString(),
      };
      setWinner(mockWinner);
      setShowPopup(true);
      createConfetti();
    } else {
      checkForNewWin();

      const channel = supabase
        .channel('giveaway_winners_updates')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'giveaway_winners',
          },
          (payload) => {
            const newWinner = payload.new as GiveawayWinner;
            checkForNewWin();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [forceShow]);

  const checkForNewWin = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: latestWin } = await supabase
        .from('giveaway_winners')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestWin) {
        const shownWinners = JSON.parse(localStorage.getItem('shownGiveawayWinners') || '[]');

        if (!shownWinners.includes(latestWin.id)) {
          setWinner(latestWin);
          setShowPopup(true);
          createConfetti();
        }
      }
    } catch (error) {
      console.error('Error checking for giveaway win:', error);
    }
  };

  const handleClose = () => {
    if (winner) {
      const shownWinners = JSON.parse(localStorage.getItem('shownGiveawayWinners') || '[]');
      shownWinners.push(winner.id);
      localStorage.setItem('shownGiveawayWinners', JSON.stringify(shownWinners));
    }
    setShowPopup(false);
  };

  const createConfetti = () => {
    const duration = 5000;
    const end = Date.now() + duration;

    const frame = () => {
      const timeLeft = end - Date.now();

      if (timeLeft <= 0) {
        return;
      }

      const particleCount = 3;

      for (let i = 0; i < particleCount; i++) {
        const confetti = document.createElement('div');
        confetti.className = 'confetti-particle';
        confetti.style.left = Math.random() * 100 + '%';
        confetti.style.animationDuration = (Math.random() * 3 + 2) + 's';
        confetti.style.animationDelay = (Math.random() * 0.5) + 's';
        confetti.style.backgroundColor = ['#FFD700', '#FFA500', '#FF69B4', '#00CED1', '#9370DB'][Math.floor(Math.random() * 5)];
        document.body.appendChild(confetti);

        setTimeout(() => {
          confetti.remove();
        }, 5000);
      }

      requestAnimationFrame(frame);
    };

    frame();
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  if (!showPopup || !winner) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/78 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="app-surface-primary rounded-2xl max-w-lg w-full border-2 border-yellow-500/45 shadow-2xl shadow-yellow-500/20 animate-scale-bounce relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/10 via-transparent to-orange-500/10 animate-pulse-slow"></div>

        <div className="relative p-8">
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 text-yellow-200 hover:text-white transition-colors z-10"
          >
            <X size={24} />
          </button>

          <div className="flex flex-col items-center text-center">
            <div className="relative mb-6">
              <div className="absolute inset-0 bg-yellow-500/30 rounded-full blur-2xl animate-pulse-slow"></div>
              <div className="relative bg-gradient-to-br from-yellow-400 to-orange-500 p-6 rounded-full animate-spin-slow">
                <Trophy size={64} className="text-white" />
              </div>
              <Sparkles className="absolute -top-2 -right-2 text-yellow-300 animate-bounce" size={32} />
              <Sparkles className="absolute -bottom-2 -left-2 text-orange-300 animate-bounce" size={24} style={{ animationDelay: '0.5s' }} />
            </div>

            <h2 className="text-4xl font-bold text-white mb-4 animate-bounce-slow">
              CONGRATULATIONS!
            </h2>

            <div className="bg-gradient-to-r from-yellow-500/30 to-orange-500/30 border-2 border-yellow-400/50 rounded-2xl px-8 py-6 mb-6 backdrop-blur-sm animate-scale-pulse">
              <p className="text-yellow-200 text-lg mb-2 font-semibold">You Won</p>
              <p className="text-6xl font-bold text-white mb-2 drop-shadow-glow">
                {formatCurrency(winner.prize_amount)}
              </p>
              <p className="text-yellow-200 font-medium">
                Rank {winner.rank} - {winner.prize_tier}
              </p>
            </div>

            <div className="app-surface-muted rounded-xl p-4 mb-6">
              <p className="text-white text-sm">
                {winner.paid_out
                  ? 'Your prize has been credited to your account!'
                  : 'Your prize payment is being processed and will be credited soon!'}
              </p>
            </div>

            <button
              onClick={handleClose}
              className="w-full app-action-primary text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-yellow-500/20 text-lg"
            >
              Amazing! Let's Celebrate!
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes scale-bounce {
          0% { transform: scale(0.5); opacity: 0; }
          50% { transform: scale(1.05); }
          100% { transform: scale(1); opacity: 1; }
        }

        @keyframes bounce-slow {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-15px); }
        }

        @keyframes pulse-slow {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }

        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        @keyframes scale-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }

        @keyframes confetti-fall {
          0% {
            transform: translateY(-100vh) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(100vh) rotate(720deg);
            opacity: 0;
          }
        }

        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }

        .animate-scale-bounce {
          animation: scale-bounce 0.6s ease-out;
        }

        .animate-bounce-slow {
          animation: bounce-slow 2s ease-in-out infinite;
        }

        .animate-pulse-slow {
          animation: pulse-slow 3s ease-in-out infinite;
        }

        .animate-spin-slow {
          animation: spin-slow 8s linear infinite;
        }

        .animate-scale-pulse {
          animation: scale-pulse 2s ease-in-out infinite;
        }

        .drop-shadow-glow {
          filter: drop-shadow(0 0 20px rgba(255, 215, 0, 0.8));
        }

        .confetti-particle {
          position: fixed;
          width: 10px;
          height: 10px;
          border-radius: 50%;
          pointer-events: none;
          animation: confetti-fall linear forwards;
          z-index: 9999;
        }
      `}</style>
    </div>
  );
}
