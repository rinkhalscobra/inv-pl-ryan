import React, { useState, useEffect } from 'react';
import { TrendingUp, Activity, Database, Zap } from 'lucide-react';

interface MarketLoadingScreenProps {
  onComplete?: () => void;
}

const LOADING_MESSAGES = [
  { text: 'Connecting to market feeds...', icon: Activity },
  { text: 'Loading real-time prices...', icon: TrendingUp },
  { text: 'Preparing trading pairs...', icon: Database },
  { text: 'Synchronizing wallet data...', icon: Zap },
  { text: 'Finalizing setup...', icon: Activity }
];

const MarketLoadingScreen: React.FC<MarketLoadingScreenProps> = ({ onComplete }) => {
  const [messageIndex, setMessageIndex] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const messageInterval = setInterval(() => {
      setMessageIndex((prev) => {
        if (prev < LOADING_MESSAGES.length - 1) {
          return prev + 1;
        }
        return prev;
      });
    }, 400);

    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(progressInterval);
          return 100;
        }
        return prev + 2;
      });
    }, 40);

    const completeTimer = setTimeout(() => {
      if (onComplete) {
        onComplete();
      }
    }, 2200);

    return () => {
      clearInterval(messageInterval);
      clearInterval(progressInterval);
      clearTimeout(completeTimer);
    };
  }, []);

  useEffect(() => {
    if (progress === 100) {
      const delayTimer = setTimeout(() => {
        if (onComplete) {
          onComplete();
        }
      }, 300);
      return () => clearTimeout(delayTimer);
    }
  }, [progress, onComplete]);

  const CurrentIcon = LOADING_MESSAGES[messageIndex].icon;

  return (
    <div className="fixed inset-0 app-page-bg flex items-center justify-center z-50">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-[30rem] h-[30rem] bg-blue-500/30 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-[30rem] h-[30rem] bg-purple-500/30 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[40rem] h-[40rem] bg-cyan-500/20 rounded-full blur-3xl animate-pulse delay-500"></div>
      </div>

      <div className="text-center relative z-10">
        <div className="relative mb-8">
          <div className="w-24 h-24 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>

          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-purple-600 rounded-full flex items-center justify-center animate-pulse">
              <CurrentIcon size={32} className="text-white" />
            </div>
          </div>
        </div>

        <div className="space-y-4 min-h-[120px]">
          <h2 className="text-3xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent animate-pulse">
            Getting Markets Ready
          </h2>

          <div className="h-8 flex items-center justify-center">
            <p className="text-slate-300 text-lg transition-all duration-300 animate-fade-in">
              {LOADING_MESSAGES[messageIndex].text}
            </p>
          </div>

          <div className="w-80 mx-auto mt-6">
            <div className="bg-slate-800/60 rounded-full h-2 overflow-hidden backdrop-blur-sm border border-slate-700/50">
              <div
                className="h-full bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 transition-all duration-300 ease-out rounded-full shadow-lg shadow-blue-500/50"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
            <p className="text-slate-400 text-sm mt-2">{Math.round(progress)}% Complete</p>
          </div>
        </div>

        <div className="mt-8 flex items-center justify-center gap-2 text-slate-500 text-sm">
          <div className="flex gap-1">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
            <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse delay-75"></div>
            <div className="w-2 h-2 bg-pink-500 rounded-full animate-pulse delay-150"></div>
          </div>
          <span>Secure connection established</span>
        </div>
      </div>
    </div>
  );
};

export default MarketLoadingScreen;

