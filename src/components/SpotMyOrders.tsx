import React, { useState } from 'react';
import { Package, X } from 'lucide-react';
import { DatabaseOrderBook, DatabaseStopOrder } from '../hooks/useDatabase';

interface SpotMyOrdersProps {
  orderBook: DatabaseOrderBook[];
  stopOrders: DatabaseStopOrder[];
  onCancelOrder?: (orderId: string) => void;
  onCancelStopOrder?: (stopOrderId: string) => void;
}

const SpotMyOrders: React.FC<SpotMyOrdersProps> = ({ 
  orderBook, 
  stopOrders,
  onCancelOrder,
  onCancelStopOrder 
}) => {
  const [activeTab, setActiveTab] = useState('Orders');
  const tabs = ['Orders', 'Stop Orders', 'Order History'];

  const activeOrders = orderBook.filter(order => order.status === 'pending' || order.status === 'partial');
  const completedOrders = orderBook.filter(order => order.status === 'filled' || order.status === 'cancelled');
  const activeStopOrders = stopOrders.filter(order => order.status === 'active');

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'filled': return 'text-emerald-400';
      case 'pending': return 'text-amber-400';
      case 'partial': return 'text-cyan-400';
      case 'cancelled': return 'text-red-400';
      default: return 'text-slate-400';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'filled': return 'Filled';
      case 'pending': return 'Open';
      case 'partial': return 'Partial';
      case 'cancelled': return 'Cancelled';
      default: return status;
    }
  };

  const formatOrderType = (order: DatabaseOrderBook) => {
    if (order.order_type === 'market') {
      return 'Market';
    }
    return `Limit @ ${order.price?.toFixed(4) || 'N/A'}`;
  };

  return (
    <div className="bg-slate-800 rounded-2xl p-8 border border-slate-700/50 shadow-2xl">
      <div className="flex items-center gap-6 mb-6">
        <h3 className="text-xl font-semibold text-cyan-400">My Orders</h3>
        <div className="flex gap-6">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`text-sm font-medium px-4 py-2 rounded-lg transition-all duration-300 ${
                activeTab === tab 
                  ? 'text-cyan-400 bg-cyan-400/10 border border-cyan-400/30 shadow-lg shadow-cyan-400/20' 
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'Orders' && (
        <>
          <div className="flex justify-between text-xs text-slate-400 mb-4 font-medium">
            <span>Date</span>
            <span>Pair</span>
            <span>Type</span>
            <span>Side</span>
            <span>Amount</span>
            <span>Filled</span>
            <span>Status</span>
            <span></span>
          </div>

          {activeOrders.length > 0 ? (
            <div className="space-y-3">
              {activeOrders.map((order) => (
                <div key={order.id} className="flex items-center justify-between app-surface-muted app-surface-hover px-6 py-4 rounded-xl transition-all duration-300 shadow-lg">
                  <span className="text-slate-300 text-sm font-mono">
                    {new Date(order.created_at).toLocaleString()}
                  </span>
                  <span className="text-white font-medium">{order.pair}</span>
                  <span className="text-slate-300 text-sm">{formatOrderType(order)}</span>
                  <span className={`text-sm font-bold px-3 py-1 rounded-lg ${
                    order.side === 'buy' ? 'text-emerald-400 bg-emerald-400/10' : 'text-red-400 bg-red-400/10'
                  }`}>
                    {order.side.toUpperCase()}
                  </span>
                  <span className="text-slate-300 font-mono text-sm">
                    {order.amount.toFixed(6)} BTC
                  </span>
                  <span className="text-slate-300 font-mono text-sm">
                    {order.filled_amount.toFixed(6)} BTC
                  </span>
                  <span className={`text-sm font-medium px-3 py-1 rounded-lg ${getStatusColor(order.status)} bg-current/10`}>
                    {getStatusText(order.status)}
                  </span>
                  {onCancelOrder && (order.status === 'pending' || order.status === 'partial') && (
                    <button 
                      onClick={() => onCancelOrder(order.id)}
                      className="text-slate-400 hover:text-red-400 transition-colors p-2 hover:bg-red-400/10 rounded-lg"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500">
              <Package size={64} className="mb-6 opacity-30" />
              <p className="text-lg">No active orders found</p>
              <p className="text-sm text-slate-600 mt-2">Your pending orders will appear here</p>
            </div>
          )}
        </>
      )}

      {activeTab === 'Stop Orders' && (
        <>
          <div className="flex justify-between text-xs text-slate-400 mb-4 font-medium">
            <span>Date</span>
            <span>Pair</span>
            <span>Type</span>
            <span>Trigger Price</span>
            <span>Amount</span>
            <span>Execution</span>
            <span>Status</span>
            <span></span>
          </div>

          {activeStopOrders.length > 0 ? (
            <div className="space-y-3">
              {activeStopOrders.map((order) => (
                <div key={order.id} className="flex items-center justify-between app-surface-muted app-surface-hover px-6 py-4 rounded-xl transition-all duration-300 shadow-lg">
                  <span className="text-slate-300 text-sm font-mono">
                    {new Date(order.created_at).toLocaleString()}
                  </span>
                  <span className="text-white font-medium">{order.pair}</span>
                  <span className={`text-sm font-bold px-3 py-1 rounded-lg ${
                    order.stop_type === 'stop_loss' ? 'text-red-400 bg-red-400/10' : 'text-emerald-400 bg-emerald-400/10'
                  }`}>
                    {order.stop_type === 'stop_loss' ? 'Stop Loss' : 'Take Profit'}
                  </span>
                  <span className="text-slate-300 font-mono text-sm">
                    {order.trigger_price.toFixed(4)}
                  </span>
                  <span className="text-slate-300 font-mono text-sm">
                    {order.amount.toFixed(6)} {order.amount_type === 'percentage' ? '%' : 'BTC'}
                  </span>
                  <span className="text-slate-300 text-sm">
                    {order.execution_type} {order.execution_price ? `@ ${order.execution_price.toFixed(4)}` : ''}
                  </span>
                  <span className={`text-sm font-medium px-3 py-1 rounded-lg ${
                    order.status === 'active' ? 'text-amber-400 bg-amber-400/10' : 
                    order.status === 'triggered' ? 'text-emerald-400 bg-emerald-400/10' : 'text-red-400 bg-red-400/10'
                  }`}>
                    {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                  </span>
                  {onCancelStopOrder && order.status === 'active' && (
                    <button 
                      onClick={() => onCancelStopOrder(order.id)}
                      className="text-slate-400 hover:text-red-400 transition-colors p-2 hover:bg-red-400/10 rounded-lg"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500">
              <Package size={64} className="mb-6 opacity-30" />
              <p className="text-lg">No stop orders found</p>
              <p className="text-sm text-slate-600 mt-2">Your stop loss and take profit orders will appear here</p>
            </div>
          )}
        </>
      )}

      {activeTab === 'Order History' && (
        <>
          <div className="flex justify-between text-xs text-slate-400 mb-4 font-medium">
            <span>Date</span>
            <span>Pair</span>
            <span>Type</span>
            <span>Side</span>
            <span>Amount</span>
            <span>Avg Price</span>
            <span>Status</span>
          </div>

          {completedOrders.length > 0 ? (
            <div className="space-y-3">
              {completedOrders.map((order) => (
                <div key={order.id} className="flex items-center justify-between app-surface-muted app-surface-hover px-6 py-4 rounded-xl transition-all duration-300 shadow-lg">
                  <span className="text-slate-300 text-sm font-mono">
                    {new Date(order.created_at).toLocaleString()}
                  </span>
                  <span className="text-white font-medium">{order.pair}</span>
                  <span className="text-slate-300 text-sm">{formatOrderType(order)}</span>
                  <span className={`text-sm font-bold px-3 py-1 rounded-lg ${
                    order.side === 'buy' ? 'text-emerald-400 bg-emerald-400/10' : 'text-red-400 bg-red-400/10'
                  }`}>
                    {order.side.toUpperCase()}
                  </span>
                  <span className="text-slate-300 font-mono text-sm">
                    {order.amount.toFixed(6)} BTC
                  </span>
                  <span className="text-slate-300 font-mono text-sm">
                    {order.price?.toFixed(4) || 'Market'}
                  </span>
                  <span className={`text-sm font-medium px-3 py-1 rounded-lg ${getStatusColor(order.status)} bg-current/10`}>
                    {getStatusText(order.status)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500">
              <Package size={64} className="mb-6 opacity-30" />
              <p className="text-lg">No order history found</p>
              <p className="text-sm text-slate-600 mt-2">Your completed orders will appear here</p>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default SpotMyOrders;


