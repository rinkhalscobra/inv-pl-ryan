import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  MessageCircle, 
  Send, 
  Plus, 
  Clock, 
  CheckCircle, 
  AlertCircle,
  User,
  Shield,
  X,
  Search,
  Filter,
  MoreVertical,
  Paperclip,
  Smile,
  Phone,
  Video,
  Info,
  ChevronDown,
  Check
} from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../hooks/useAuth';
import BrandLogo from './BrandLogo';

interface Conversation {
  id: string;
  user_id: string;
  subject: string;
  status: 'open' | 'closed' | 'pending';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assigned_admin_id: string | null;
  assigned_admin_first_name: string | null;
  assigned_admin_last_name: string | null;
  created_at: string;
  updated_at: string;
  unread_count?: number;
  last_message?: string;
  last_message_time?: string;
}

interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  is_read: boolean;
  is_admin_message: boolean;
  created_at: string;
}

interface SupportChatProps {
  user: any;
}

type ConversationPriority = 'low' | 'medium' | 'high' | 'urgent';

const priorityOptions: Array<{
  value: ConversationPriority;
  label: string;
  color: string;
}> = [
  { value: 'low', label: 'Low Priority', color: 'bg-slate-400' },
  { value: 'medium', label: 'Medium Priority', color: 'bg-blue-400' },
  { value: 'high', label: 'High Priority', color: 'bg-amber-400' },
  { value: 'urgent', label: 'Urgent', color: 'bg-red-400' },
];

const PriorityDropdown: React.FC<{
  value: ConversationPriority;
  onChange: (value: ConversationPriority) => void;
}> = ({ value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedOption = priorityOptions.find((option) => option.value === value) ?? priorityOptions[0];

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, []);

  useEffect(() => {
    if (isOpen) optionRefs.current[focusedIndex]?.focus();
  }, [focusedIndex, isOpen]);

  const openDropdown = (index = priorityOptions.findIndex((option) => option.value === value)) => {
    setFocusedIndex(Math.max(index, 0));
    setIsOpen(true);
  };

  const closeDropdown = () => {
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  const handleListKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeDropdown();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setFocusedIndex((index) => (index + 1) % priorityOptions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setFocusedIndex((index) => (index - 1 + priorityOptions.length) % priorityOptions.length);
    } else if (event.key === 'Home') {
      event.preventDefault();
      setFocusedIndex(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setFocusedIndex(priorityOptions.length - 1);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (isOpen ? setIsOpen(false) : openDropdown())}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            openDropdown(event.key === 'ArrowDown' ? 0 : priorityOptions.length - 1);
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={`app-input flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/50 ${
          isOpen ? 'border-blue-500/70 ring-2 ring-blue-500/30' : 'border-slate-600/50'
        }`}
      >
        <span className="flex items-center gap-3 text-white">
          <span className={`h-2.5 w-2.5 rounded-full ${selectedOption.color}`} />
          {selectedOption.label}
        </span>
        <ChevronDown
          size={17}
          className={`text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div
          role="listbox"
          aria-label="Priority"
          onKeyDown={handleListKeyDown}
          className="app-dropdown absolute left-0 right-0 top-full z-[70] mt-2 overflow-hidden rounded-xl border border-slate-600/60 p-1.5 shadow-2xl shadow-black/40"
        >
          {priorityOptions.map((option, index) => {
            const isSelected = option.value === value;
            return (
              <button
                key={option.value}
                ref={(element) => { optionRefs.current[index] = element; }}
                type="button"
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setFocusedIndex(index)}
                onClick={() => {
                  onChange(option.value);
                  closeDropdown();
                }}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left transition-colors ${
                  isSelected
                    ? 'bg-gradient-to-r from-blue-500/20 via-indigo-500/20 to-purple-500/20 text-white'
                    : 'text-slate-200 hover:bg-slate-700/60 hover:text-white'
                }`}
              >
                <span className="flex items-center gap-3">
                  <span className={`h-2.5 w-2.5 rounded-full ${option.color}`} />
                  {option.label}
                </span>
                {isSelected && <Check size={16} className="text-blue-300" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

const SupportChat: React.FC<SupportChatProps> = ({ user }) => {
  const { user: authUser } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessageContent, setNewMessageContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Agent info for the selected conversation
  const [assignedAgentInfo, setAssignedAgentInfo] = useState<{
    first_name: string | null;
    last_name: string | null;
  } | null>(null);
  
  // New conversation modal state
  const [showNewConversationModal, setShowNewConversationModal] = useState(false);
  const [newConversationSubject, setNewConversationSubject] = useState('');
  const [newConversationPriority, setNewConversationPriority] = useState<ConversationPriority>('medium');
  const [creatingConversation, setCreatingConversation] = useState(false);
  
  // Search and filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed' | 'pending'>('all');
  
  // Refs for auto-scrolling
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);

  // Scroll to bottom of messages
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Fetch conversations
  const fetchConversations = useCallback(async () => {
    if (!authUser) return;

    try {
      const { data, error } = await supabase
        .rpc('get_user_conversations', {
          p_user_id: authUser.id
        });

      if (error) throw error;

      setConversations(data || []);
    } catch (err: any) {
      console.error('Error fetching conversations:', err);
      setError('Failed to load conversations');
    }
  }, [authUser]);

  // Fetch messages for a conversation
  const fetchMessages = useCallback(async (conversationId: string) => {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      setMessages(data || []);
      
      // Mark messages as read
      if (authUser) {
        await supabase.rpc('mark_chat_messages_read', {
          p_conversation_id: conversationId,
          p_user_id: authUser.id
        });
      }
    } catch (err: any) {
      console.error('Error fetching messages:', err);
      setError('Failed to load messages');
    }
  }, [authUser]);

  // Create new conversation
  const createConversation = async () => {
    if (!authUser || !newConversationSubject.trim()) return;

    setCreatingConversation(true);
    setError(null);

    try {
      const { data, error } = await supabase.rpc('create_chat_conversation', {
        p_user_id: authUser.id,
        p_subject: newConversationSubject.trim(),
        p_priority: newConversationPriority
      });

      if (error) throw error;

      if (data && data.length > 0) {
        const newConversation = data[0];
        setConversations(prev => [newConversation, ...prev]);
        setSelectedConversationId(newConversation.id);
        setShowNewConversationModal(false);
        setNewConversationSubject('');
        setNewConversationPriority('medium');
        setSuccess('New conversation created successfully');
        
        // Clear success message after 3 seconds
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (err: any) {
      console.error('Error creating conversation:', err);
      setError('Failed to create conversation');
    } finally {
      setCreatingConversation(false);
    }
  };

  // Send message
  const sendMessage = async () => {
    if (!authUser || !selectedConversationId || !newMessageContent.trim()) return;

    setSendingMessage(true);
    setError(null);

    const messageContent = newMessageContent.trim();
    
    // Clear the input immediately for better UX
    setNewMessageContent('');
    
    try {
      const { data, error } = await supabase.rpc('send_chat_message', {
        p_conversation_id: selectedConversationId,
        p_sender_id: authUser.id,
        p_content: messageContent
      });

      if (error) throw error;

      // Create optimistic message object
      const optimisticMessage: Message = {
        id: data || `temp_${Date.now()}`,
        conversation_id: selectedConversationId,
        sender_id: authUser.id,
        content: messageContent,
        is_read: false,
        is_admin_message: false,
        created_at: new Date().toISOString()
      };

      // Optimistically add the message to the UI
      setMessages(prev => {
        return [...prev, optimisticMessage];
      });

      // Scroll to bottom immediately
      setTimeout(scrollToBottom, 100);
      
    } catch (err: any) {
      console.error('Error sending message:', err);
      setError('Failed to send message');
      
      // Restore the message content if there was an error
      setNewMessageContent(messageContent);
    } finally {
      setSendingMessage(false);
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedImage(file);
      setImagePreviewUrl(URL.createObjectURL(file));
    }
  };

  const clearSelectedImage = () => {
    setSelectedImage(null);
    setImagePreviewUrl(null);
  };

  // Handle Enter key press in message input
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Initial data fetch
  useEffect(() => {
    const initializeChat = async () => {
      setLoading(true);
      await fetchConversations();
      setLoading(false);
    };

    if (authUser) {
      initializeChat();
    }
  }, [authUser, fetchConversations]);

  // Fetch messages when conversation is selected
  useEffect(() => {
    if (selectedConversationId) {
      fetchMessages(selectedConversationId);
      
      // Update assigned agent info when conversation changes
      const selectedConv = conversations.find(conv => conv.id === selectedConversationId);
      if (selectedConv) {
        setAssignedAgentInfo({
          first_name: selectedConv.assigned_admin_first_name,
          last_name: selectedConv.assigned_admin_last_name
        });
      } else {
        setAssignedAgentInfo(null);
      }
    } else {
      setMessages([]);
      setAssignedAgentInfo(null);
    }
  }, [selectedConversationId, fetchMessages, conversations]);

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Set up realtime subscriptions
  useEffect(() => {
    if (!authUser) return;

    // Subscribe to new conversations
    const conversationsChannel = supabase
      .channel('user_conversations')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversations',
          filter: `user_id=eq.${authUser.id}`
        },
        (payload) => {
          console.log('Conversation change:', payload);
          fetchConversations();
        }
      )
      .subscribe();

    // Subscribe to messages in the selected conversation
    let messagesChannel: any = null;
    
    if (selectedConversationId) {
      messagesChannel = supabase
        .channel('conversation_messages')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'messages',
            filter: `conversation_id=eq.${selectedConversationId}`
          },
          (payload) => {
            console.log('Message change:', payload);
            if (payload.eventType === 'INSERT') {
              setMessages(prev => {
                // Check if this message already exists (from optimistic update)
                const existingMessageIndex = prev.findIndex(msg => 
                  msg.id === payload.new.id ||
                  (msg.sender_id === payload.new.sender_id && 
                   msg.content === payload.new.content && 
                   Math.abs(new Date(msg.created_at).getTime() - new Date(payload.new.created_at).getTime()) < 5000)
                );
                
                if (existingMessageIndex >= 0) {
                  // Update the existing optimistic message with the confirmed data
                  const newMessages = [...prev];
                  newMessages[existingMessageIndex] = payload.new as Message;
                  return newMessages;
                } else {
                  // Add new message (likely from another user or admin)
                  return [...prev, payload.new as Message];
                }
              });
              
              // Scroll to bottom when new message arrives
              setTimeout(scrollToBottom, 100);
            } else if (payload.eventType === 'UPDATE') {
              setMessages(prev => prev.map(msg => 
                msg.id === payload.new.id ? payload.new as Message : msg
              ));
            }
          }
        )
        .subscribe();
    }

    return () => {
      conversationsChannel.unsubscribe();
      if (messagesChannel) {
        messagesChannel.unsubscribe();
      }
    };
  }, [authUser, selectedConversationId, fetchConversations]);

  // Filter conversations based on search and status
  const filteredConversations = conversations.filter(conv => {
    const matchesSearch = conv.subject.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || conv.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Get selected conversation details
  const selectedConversation = conversations.find(conv => conv.id === selectedConversationId);

  // Get status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'text-emerald-400 bg-emerald-400/10';
      case 'closed': return 'text-slate-400 bg-slate-400/10';
      case 'pending': return 'text-amber-400 bg-amber-400/10';
      default: return 'text-slate-400 bg-slate-400/10';
    }
  };

  // Get priority color
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'text-red-400 bg-red-400/10';
      case 'high': return 'text-orange-400 bg-orange-400/10';
      case 'medium': return 'text-blue-400 bg-blue-400/10';
      case 'low': return 'text-slate-400 bg-slate-400/10';
      default: return 'text-slate-400 bg-slate-400/10';
    }
  };

  // Format time
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 24) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffInHours < 168) { // 7 days
      return date.toLocaleDateString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="app-surface-primary rounded-2xl h-[600px] flex">
      {/* Conversations Sidebar */}
      <div className="w-1/3 border-r border-slate-700/50 flex flex-col">
        {/* Sidebar Header */}
        <div className="p-4 border-b border-slate-700/50">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <MessageCircle size={20} className="text-blue-400" />
              Support Chat
            </h3>
            <button
              onClick={() => setShowNewConversationModal(true)}
              className="bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white p-2 rounded-lg transition-all duration-300 shadow-lg shadow-blue-500/25"
            >
              <Plus size={16} />
            </button>
          </div>

          {/* Search */}
          <div className="relative mb-3">
            <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full app-input pl-10 pr-4 py-2 rounded-lg border border-slate-600/50 focus:outline-none focus:ring-1 focus:ring-blue-500/50 text-sm"
            />
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="w-full app-input px-3 py-2 rounded-lg border border-slate-600/50 focus:outline-none focus:ring-1 focus:ring-blue-500/50 text-sm custom-select"
          >
            <option value="all">All Conversations</option>
            <option value="open">Open</option>
            <option value="pending">Pending</option>
            <option value="closed">Closed</option>
          </select>
        </div>

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto">
          {filteredConversations.length > 0 ? (
            <div className="space-y-1 p-2">
              {filteredConversations.map((conversation) => (
                <div
                  key={conversation.id}
                  onClick={() => setSelectedConversationId(conversation.id)}
                  className={`p-3 rounded-lg cursor-pointer transition-all duration-300 ${
                    selectedConversationId === conversation.id
                      ? 'bg-blue-500/20 border border-blue-500/30'
                      : 'app-surface-muted app-surface-hover border border-transparent'
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="font-medium text-white text-sm line-clamp-1">
                      {conversation.subject}
                    </h4>
                    <div className="flex items-center gap-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${getStatusColor(conversation.status)}`}>
                        {conversation.status}
                      </span>
                      {conversation.unread_count && conversation.unread_count > 0 && (
                        <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                          {conversation.unread_count}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${getPriorityColor(conversation.priority)}`}>
                      {conversation.priority}
                    </span>
                    <span className="text-xs text-slate-400">
                      {formatTime(conversation.updated_at)}
                    </span>
                  </div>
                  
                  {conversation.last_message && (
                    <p className="text-xs text-slate-400 mt-2 line-clamp-2">
                      {conversation.last_message}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 p-4">
              <MessageCircle size={48} className="mb-4 opacity-50" />
              <p className="text-center mb-2">No conversations found</p>
              <p className="text-sm text-slate-600 text-center mb-4">
                {searchTerm || statusFilter !== 'all' 
                  ? 'Try adjusting your search or filter' 
                  : 'Start a new conversation to get help'}
              </p>
              <button
                onClick={() => setShowNewConversationModal(true)}
                className="bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 shadow-lg shadow-blue-500/25"
              >
                Start New Chat
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col">
        {selectedConversation ? (
          <>
            {/* Chat Header */}
            <div className="p-4 border-b border-slate-700/50 bg-slate-900/30">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-white">{selectedConversation.subject}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${getStatusColor(selectedConversation.status)}`}>
                      {selectedConversation.status}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${getPriorityColor(selectedConversation.priority)}`}>
                      {selectedConversation.priority} priority
                    </span>
                    {assignedAgentInfo && (assignedAgentInfo.first_name || assignedAgentInfo.last_name) && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400">
                        Dedicated Manager
                      </span>
                    )}
                    <span className="text-xs text-slate-400">
                      Created {formatTime(selectedConversation.created_at)}
                    </span>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <button className="text-slate-400 hover:text-white transition-colors p-2 rounded-lg hover:bg-slate-700/50">
                    <Info size={16} />
                  </button>
                  <button className="text-slate-400 hover:text-white transition-colors p-2 rounded-lg hover:bg-slate-700/50">
                    <MoreVertical size={16} />
                  </button>
                </div>
              </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length > 0 ? (
                <>
                  {messages.map((message) => {
                    const isOwnMessage = !message.is_admin_message && message.sender_id === authUser?.id;

                    return (
                      <div
                        key={message.id}
                        className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
                      >
                        <div className={`max-w-[70%] ${
                          isOwnMessage
                            ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white'
                            : 'bg-slate-700/50 text-white'
                        } rounded-2xl px-4 py-3 shadow-lg`}>
                          {!isOwnMessage && (
                            <div className="flex items-center gap-2 mb-2">
                              <BrandLogo className="h-auto w-14 shrink-0" />
                              <span className="text-xs font-medium text-slate-300">
                                Support
                              </span>
                            </div>
                          )}

                          <p className="text-sm leading-relaxed whitespace-pre-wrap">
                            {message.content}
                          </p>

                          <div className={`flex items-center justify-between mt-2 text-xs ${
                            isOwnMessage ? 'text-blue-100' : 'text-slate-400'
                          }`}>
                            <span>{formatTime(message.created_at)}</span>
                            {isOwnMessage && (
                              <div className="flex items-center gap-1">
                                {message.is_read ? (
                                  <CheckCircle size={12} className="text-blue-200" />
                                ) : (
                                  <Clock size={12} className="text-blue-200" />
                                )}
                                <span>{message.is_read ? 'Read' : 'Sent'}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-slate-500">
                  <MessageCircle size={48} className="mb-4 opacity-50" />
                  <p className="text-center mb-2">No messages yet</p>
                  <p className="text-sm text-slate-600 text-center">
                    Start the conversation by sending a message below
                  </p>
                </div>
              )}
            </div>

            {/* Message Input */}
            <div className="p-4 border-t border-slate-700/50 bg-slate-900/30">
              {selectedConversation.status === 'closed' ? (
                <div className="bg-slate-700/50 rounded-xl p-4 text-center">
                  <p className="text-slate-400 text-sm">This conversation has been closed</p>
                  <p className="text-slate-500 text-xs mt-1">Start a new conversation to continue getting support</p>
                </div>
              ) : (
                <div className="flex items-end gap-3">
                  <input
                    type="file"
                    id="image-upload"
                    accept="image/*"
                    onChange={handleImageSelect}
                    className="hidden"
                  />
                  <label
                    htmlFor="image-upload"
                    className="bg-slate-700/50 hover:bg-slate-600/50 text-white p-3 rounded-xl transition-colors cursor-pointer flex items-center justify-center"
                  >
                    <Paperclip size={16} />
                  </label>

                  <div className="flex-1">
                    <textarea
                      ref={messageInputRef}
                      value={newMessageContent}
                      onChange={(e) => setNewMessageContent(e.target.value)}
                      onKeyPress={handleKeyPress}
                      placeholder="Type your message..."
                      className="w-full bg-slate-800/50 text-white px-4 py-3 rounded-xl border border-slate-600/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all resize-none"
                      rows={1}
                      style={{ minHeight: '44px', maxHeight: '120px' }}
                      onInput={(e) => {
                        const target = e.target as HTMLTextAreaElement;
                        target.style.height = 'auto';
                        target.style.height = Math.min(target.scrollHeight, 120) + 'px';
                      }}
                    />
                    {imagePreviewUrl && (
                      <div className="relative mt-2 p-2 bg-slate-700/50 rounded-lg flex items-center justify-between">
                        <img src={imagePreviewUrl} alt="Image Preview" className="max-h-24 rounded-md" />
                        <button
                          onClick={clearSelectedImage}
                          className="absolute top-1 right-1 bg-black/50 rounded-full p-1 text-white hover:bg-black/70"
                        >
                          <X size={14} />
                        </button>
                        <span className="ml-2 text-sm text-slate-300">
                          {selectedImage ? selectedImage.name : ''}
                        </span>
                      </div>
                    )}


                  </div>
                  
                  <div className="flex items-center gap-2">
                    <button
                      onClick={sendMessage}
                      disabled={sendingMessage || !newMessageContent.trim()}
                      className="bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 disabled:from-slate-700 disabled:to-slate-800 text-white p-3 rounded-xl transition-all duration-300 shadow-lg shadow-blue-500/25 flex items-center justify-center"
                    >
                      {sendingMessage ? (
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <Send size={16} />
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          /* No Conversation Selected */
          <div className="flex flex-col items-center justify-center h-full text-slate-500">
            <div className="w-20 h-20 bg-slate-800/50 rounded-full flex items-center justify-center mb-6">
              <MessageCircle size={32} className="text-slate-400" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">Welcome to Support Chat</h3>
            <p className="text-slate-400 text-center mb-6 max-w-md">
              Get help from our support team. Select an existing conversation or start a new one to begin.
            </p>
            <button
              onClick={() => setShowNewConversationModal(true)}
              className="bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white px-6 py-3 rounded-xl font-semibold transition-all duration-300 shadow-lg shadow-blue-500/25 flex items-center gap-2"
            >
              <Plus size={18} />
              Start New Conversation
            </button>
          </div>
        )}
      </div>

      {/* New Conversation Modal */}
      {showNewConversationModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-slate-800 rounded-xl max-w-md w-full p-6 border border-slate-700 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold text-white">New Support Conversation</h3>
              <button
                onClick={() => setShowNewConversationModal(false)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-2">Subject</label>
                <input
                  type="text"
                  value={newConversationSubject}
                  onChange={(e) => setNewConversationSubject(e.target.value)}
                  placeholder="What do you need help with?"
                  className="w-full app-input px-4 py-3 rounded-xl border border-slate-600/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                />
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-2">Priority</label>
                <PriorityDropdown
                  value={newConversationPriority}
                  onChange={setNewConversationPriority}
                />
              </div>

              <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-3 text-sm text-blue-400">
                <p className="font-medium mb-1">Support Guidelines</p>
                <ul className="text-xs space-y-1">
                  <li>• Be specific about your issue</li>
                  <li>• Include relevant details (transaction IDs, error messages)</li>
                  <li>• Our team typically responds within 2-4 hours</li>
                </ul>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowNewConversationModal(false)}
                  disabled={creatingConversation}
                  className="flex-1 app-action-soft text-white py-3 rounded-xl font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={createConversation}
                  disabled={creatingConversation || !newConversationSubject.trim()}
                  className="flex-1 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 disabled:from-slate-700 disabled:to-slate-800 text-white py-3 rounded-xl font-semibold transition-all duration-300 shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2"
                >
                  {creatingConversation ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    'Start Conversation'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Status Messages */}
      {error && (
        <div className="fixed bottom-4 right-4 bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center gap-3 z-50">
          <AlertCircle size={20} className="text-red-400 flex-shrink-0" />
          <span className="text-red-400">{error}</span>
          <button
            onClick={() => setError(null)}
            className="text-red-400 hover:text-red-300 transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {success && (
        <div className="fixed bottom-4 right-4 bg-green-500/10 border border-green-500/30 rounded-xl p-4 flex items-center gap-3 z-50">
          <CheckCircle size={20} className="text-green-400 flex-shrink-0" />
          <span className="text-green-400">{success}</span>
          <button
            onClick={() => setSuccess(null)}
            className="text-green-400 hover:text-green-300 transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
};

export default SupportChat;



