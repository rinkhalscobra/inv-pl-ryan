import React, { useState, useRef } from 'react';
import { Trophy, Coins, Gift, Info, Zap, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';
import { useWheelSpin } from '../hooks/useWheelSpin';
import { useFiatCurrency } from '../hooks/useFiatCurrency';

interface WheelSegment {
  id: number;
  label: string;
  value: string;
  color: string;
  probability: number;
}

const SpinTheWheel: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { eligibleDeposit, loading: depositLoading, error: depositError, spinWheel } = useWheelSpin(user?.id);
  const { formatEur, formatFiat } = useFiatCurrency();
  const formatDepositAmount = (amount: number) => eligibleDeposit?.currency === 'EUR'
    ? formatEur(amount)
    : formatFiat(amount);
  const [isSpinning, setIsSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState<WheelSegment | null>(null);
  const [spinError, setSpinError] = useState<string | null>(null);
  const wheelRef = useRef<HTMLDivElement>(null);

  const segments: WheelSegment[] = [
    { id: 1, label: '5%', value: '5', color: '#6366f1', probability: 40 },
    { id: 2, label: '10%', value: '10', color: '#7c3aed', probability: 20 },
    { id: 3, label: '20%', value: '20', color: '#8b5cf6', probability: 8 },
    { id: 4, label: '❌', value: '0', color: '#ef4444', probability: 31.34 },
    { id: 5, label: '50%', value: '50', color: '#9333ea', probability: 0.5 },
    { id: 6, label: '70%', value: '70', color: '#7c3aed', probability: 0.1 },
    { id: 7, label: '80%', value: '80', color: '#a855f7', probability: 0.05 },
    { id: 8, label: '100%', value: '100', color: '#c026d3', probability: 0.01 },
  ];

  const totalSegments = segments.length;
  const segmentAngle = 360 / totalSegments;

  const handleSpinWheel = async () => {
    if (isSpinning || !eligibleDeposit) return;

    setIsSpinning(true);
    setResult(null);
    setSpinError(null);

    const fullRotations = 5 + Math.floor(Math.random() * 5);
    const rand = Math.random() * 100;
    let cumulativeProbability = 0;
    let winningSegment = segments[0];

    for (const segment of segments) {
      cumulativeProbability += segment.probability;
      if (rand <= cumulativeProbability) {
        winningSegment = segment;
        break;
      }
    }

    const segmentIndex = segments.findIndex(s => s.id === winningSegment.id);
    const segmentCenterAngle = (segmentIndex + 0.5) * segmentAngle;
    const targetRotation = (360 - segmentCenterAngle) % 360;
    const currentRotation = ((rotation % 360) + 360) % 360;
    const rotationToTarget = (targetRotation - currentRotation + 360) % 360;
    const finalRotation = rotation + (fullRotations * 360) + rotationToTarget;

    setRotation(finalRotation);

    setTimeout(async () => {
      setIsSpinning(false);
      setResult(winningSegment);

      const winningValue = parseInt(winningSegment.value);

      if (winningValue > 0) {
        try {
          await spinWheel(winningValue);
        } catch (error) {
          console.error('Error processing spin:', error);
          const errorMessage = error instanceof Error ? error.message : 'Failed to credit winnings. Please contact support.';
          setSpinError(errorMessage);
        }
      } else {
        try {
          await spinWheel(0);
        } catch (error) {
          console.error('Error processing spin:', error);
        }
      }
    }, 4000);
  };

  return (
    <div className="min-h-screen bg-slate-900 bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.16),transparent_34%),radial-gradient(circle_at_top_right,rgba(168,85,247,0.24),transparent_32%),radial-gradient(circle_at_bottom,rgba(147,51,234,0.16),transparent_42%)] p-4 md:p-8 overflow-hidden relative">
      <div className="max-w-7xl mx-auto relative z-10 px-4">
        <div className="text-center py-12">
          <h1 className="text-5xl md:text-6xl font-black text-white mb-4" style={{
            textShadow: '0 0 30px rgba(34, 211, 238, 0.8), 0 0 60px rgba(59, 130, 246, 0.6)',
          }}>
            {t('spinWheel.title')}
          </h1>
          <p className="text-xl text-cyan-300 font-medium">
            {t('spinWheel.subtitle')}
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-8 items-start">
          <div className="lg:col-span-1 space-y-6">
            <div className="app-surface-primary rounded-2xl p-6 border border-cyan-500/30">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 flex items-center justify-center">
                  <Info className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-xl font-bold text-white">{t('spinWheel.howToPlay')}</h3>
              </div>
              <p className="text-slate-300 leading-relaxed">
                {t('spinWheel.howToPlayDesc')}
              </p>
            </div>

            <div className="app-surface-primary rounded-2xl p-6 border border-cyan-500/30">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 flex items-center justify-center">
                  <Coins className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-xl font-bold text-white">{t('spinWheel.lastDeposit')}</h3>
              </div>
              {depositLoading ? (
                <div className="text-slate-400">{t('common.loading')}</div>
              ) : eligibleDeposit ? (
                <>
                  <div className="text-3xl font-black text-cyan-400 mb-2">
                    {formatDepositAmount(Number(eligibleDeposit.amount))}
                  </div>
                  <div className="text-sm text-slate-400">
                    {t('spinWheel.potentialWin')}: <span className="text-cyan-400 font-bold">{formatDepositAmount(Number(eligibleDeposit.amount) * 0.05)} - {formatDepositAmount(Number(eligibleDeposit.amount))}</span>
                  </div>
                </>
              ) : (
                <div className="text-slate-400">
                  {t('spinWheel.noEligibleDeposit') || 'No eligible deposits. Make a deposit to spin!'}
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-1 flex flex-col items-center justify-center gap-12">
          <div className="relative w-full max-w-[700px] aspect-square flex items-center justify-center">
            <div className="absolute inset-0 bg-purple-500/28 rounded-full blur-3xl"></div>

            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-4 z-20">
              <div className="relative">
                <svg width="60" height="60" viewBox="0 0 60 60" fill="none">
                  <path
                    d="M30 45 L15 15 L30 20 L45 15 Z"
                    fill="url(#arrowGradient)"
                    stroke="rgba(255, 255, 255, 0.8)"
                    strokeWidth="2"
                    filter="drop-shadow(0 4px 12px rgba(34, 211, 238, 0.8))"
                  />
                  <defs>
                    <linearGradient id="arrowGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#fbbf24" />
                      <stop offset="50%" stopColor="#f59e0b" />
                      <stop offset="100%" stopColor="#ea580c" />
                    </linearGradient>
                  </defs>
                </svg>
                <div className="absolute inset-0" style={{
                  background: 'radial-gradient(circle, rgba(251, 191, 36, 0.4) 0%, transparent 70%)',
                  filter: 'blur(10px)',
                }}></div>
              </div>
            </div>

            <div className="relative w-[95%] h-[95%]">
              <div className="absolute inset-0 rounded-full" style={{
                background: 'radial-gradient(circle at 30% 30%, rgba(99, 102, 241, 0.58), rgba(139, 92, 246, 0.64), rgba(168, 85, 247, 0.56))',
                boxShadow: '0 0 80px rgba(34, 211, 238, 0.6), 0 0 120px rgba(59, 130, 246, 0.4), inset 0 0 60px rgba(255, 255, 255, 0.1)',
              }}>
                <div className="absolute inset-2 rounded-full bg-gradient-to-br from-indigo-500/16 via-purple-500/16 to-fuchsia-500/14 backdrop-blur-sm border-4 border-cyan-500/50" style={{
                  boxShadow: 'inset 0 0 40px rgba(34, 211, 238, 0.3)',
                }}>

                  <div
                    ref={wheelRef}
                    className="absolute inset-8 rounded-full overflow-hidden"
                    style={{
                      transform: `rotate(${rotation}deg)`,
                      transition: isSpinning ? 'transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)' : 'none',
                      boxShadow: 'inset 0 4px 20px rgba(0, 0, 0, 0.5)',
                    }}
                  >
                    <svg className="w-full h-full" viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
                      {segments.map((segment, index) => {
                        const startAngle = (index * 360) / totalSegments;
                        const endAngle = ((index + 1) * 360) / totalSegments;
                        const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;

                        const startX = 50 + 50 * Math.cos((startAngle * Math.PI) / 180);
                        const startY = 50 + 50 * Math.sin((startAngle * Math.PI) / 180);
                        const endX = 50 + 50 * Math.cos((endAngle * Math.PI) / 180);
                        const endY = 50 + 50 * Math.sin((endAngle * Math.PI) / 180);

                        const midAngle = startAngle + (endAngle - startAngle) / 2;
                        const textRadius = 32;
                        const textX = 50 + textRadius * Math.cos((midAngle * Math.PI) / 180);
                        const textY = 50 + textRadius * Math.sin((midAngle * Math.PI) / 180);

                        return (
                          <g key={segment.id}>
                            <path
                              d={`M 50 50 L ${startX} ${startY} A 50 50 0 ${largeArcFlag} 1 ${endX} ${endY} Z`}
                              fill={segment.color}
                              stroke="rgba(255, 255, 255, 0.15)"
                              strokeWidth="0.3"
                            />
                            <text
                              x={textX}
                              y={textY}
                              fill="white"
                              fontSize="7"
                              fontWeight="900"
                              textAnchor="middle"
                              dominantBaseline="middle"
                              transform={`rotate(${midAngle + 90} ${textX} ${textY})`}
                              style={{
                                filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5))',
                                paintOrder: 'stroke fill',
                                stroke: 'rgba(0, 0, 0, 0.3)',
                                strokeWidth: '0.5px',
                              }}
                            >
                              {segment.label}
                            </text>
                          </g>
                        );
                      })}
                    </svg>

                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 rounded-full" style={{
                      background: 'radial-gradient(circle at 30% 30%, #818cf8, #8b5cf6, #c026d3)',
                      boxShadow: '0 0 30px rgba(34, 211, 238, 0.8), inset 0 0 20px rgba(255, 255, 255, 0.3)',
                    }}>
                      <div className="absolute inset-2 rounded-full bg-gradient-to-br from-purple-200/40 to-transparent"></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {result && (
            <div className="text-center animate-bounce">
              <div className={`text-6xl font-black mb-4 ${
                result.value === '0' ? 'text-red-400' : 'text-white'
              }`} style={{
                textShadow: result.value === '0'
                  ? '0 0 20px rgba(239, 68, 68, 0.8), 0 0 40px rgba(220, 38, 38, 0.6)'
                  : '0 0 20px rgba(34, 211, 238, 0.8), 0 0 40px rgba(59, 130, 246, 0.6)',
              }}>
                {result.value === '0' ? 'No Win - Try Again!' : `You Won ${result.label}!`}
              </div>
            </div>
          )}

          {!result && (
            <div className="text-6xl font-black text-white" style={{
              textShadow: '0 0 20px rgba(34, 211, 238, 0.8), 0 0 40px rgba(59, 130, 246, 0.6)',
            }}>
              Spin to Win!
            </div>
          )}

          {spinError && (
            <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-4 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-400" />
              <p className="text-red-300">{spinError}</p>
            </div>
          )}

          {!eligibleDeposit && !depositLoading && (
            <div className="bg-yellow-500/20 border border-yellow-500/50 rounded-xl p-4 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-400" />
              <p className="text-yellow-300">
                {t('spinWheel.noEligibleDeposit') || 'Make a deposit to spin the wheel!'}
              </p>
            </div>
          )}

          <button
            onClick={handleSpinWheel}
            disabled={isSpinning || !eligibleDeposit || depositLoading}
            className="relative group px-16 py-6 rounded-full text-white font-black text-3xl transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: 'radial-gradient(circle at 30% 30%, #8b5cf6, #c026d3)',
              boxShadow: '0 0 40px rgba(34, 211, 238, 0.8), 0 0 60px rgba(59, 130, 246, 0.6), inset 0 0 30px rgba(255, 255, 255, 0.2)',
              textShadow: '0 2px 10px rgba(0, 0, 0, 0.5)',
            }}
          >
            <div className="absolute -left-6 top-1/2 -translate-y-1/2">
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500" style={{
                boxShadow: '0 4px 15px rgba(148, 163, 184, 0.5)',
              }}></div>
            </div>

            <div className="absolute -left-3 top-1/4">
              <div className="w-5 h-5 rounded-full bg-gradient-to-br from-indigo-300 to-purple-400" style={{
                boxShadow: '0 4px 15px rgba(148, 163, 184, 0.5)',
              }}></div>
            </div>

            <span>{isSpinning ? `${t('common.loading')}` : t('spinWheel.spinButton')}</span>

            <div className="absolute -right-6 top-1/2 -translate-y-1/2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600" style={{
                boxShadow: '0 4px 15px rgba(148, 163, 184, 0.5)',
              }}></div>
            </div>

            <div className="absolute -right-12 bottom-1/4">
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500" style={{
                boxShadow: '0 4px 15px rgba(148, 163, 184, 0.5)',
              }}></div>
            </div>
          </button>
        </div>

        <div className="lg:col-span-1 space-y-6">
          <div className="app-surface-primary rounded-2xl p-6 border border-cyan-500/30">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 flex items-center justify-center">
                <Gift className="w-5 h-5 text-white" />
              </div>
              <h3 className="text-xl font-bold text-white">{t('spinWheel.prizes')}</h3>
            </div>
            <p className="text-slate-300 mb-4">
              {t('spinWheel.prizesDesc')}
            </p>
            <div className="space-y-2">
              {[
                { percent: '100%', color: 'from-purple-500 to-fuchsia-500' },
                { percent: '80%', color: 'from-indigo-500 to-purple-500' },
                { percent: '70%', color: 'from-indigo-500 to-purple-600' },
                { percent: '50%', color: 'from-purple-500 to-fuchsia-500' },
                { percent: '20%', color: 'from-indigo-400 to-purple-500' },
                { percent: '10%', color: 'from-purple-400 to-fuchsia-500' },
                { percent: '5%', color: 'from-indigo-400 to-purple-400' },
              ].map((prize) => (
                <div key={prize.percent} className="flex items-center gap-3 p-2 rounded-lg bg-gradient-to-br from-indigo-500/10 via-purple-500/12 to-fuchsia-500/12">
                  <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${prize.color} flex items-center justify-center shadow-lg`}>
                    <Zap className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-white font-bold">{prize.percent}</span>
                  <span className="text-slate-400 ml-auto">
                    {eligibleDeposit ? formatDepositAmount((Number(eligibleDeposit.amount) * parseInt(prize.percent)) / 100) : '-'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="app-surface-primary rounded-2xl p-6 border border-cyan-500/30">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 flex items-center justify-center">
                <Trophy className="w-5 h-5 text-white" />
              </div>
              <h3 className="text-xl font-bold text-white">{t('spinWheel.rulesTitle')}</h3>
            </div>
            <ul className="space-y-3 text-slate-300">
              <li className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-purple-400 mt-2 flex-shrink-0"></div>
                <span>{t('spinWheel.rule1')}</span>
              </li>
              <li className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-purple-400 mt-2 flex-shrink-0"></div>
                <span>{t('spinWheel.rule2')}</span>
              </li>
              <li className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-purple-400 mt-2 flex-shrink-0"></div>
                <span>{t('spinWheel.rule3')}</span>
              </li>
              <li className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-purple-400 mt-2 flex-shrink-0"></div>
                <span>{t('spinWheel.rule4')}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
      </div>

    </div>
  );
};

export default SpinTheWheel;

