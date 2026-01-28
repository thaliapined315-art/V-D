import React, { useState, useEffect, useRef } from 'react';
import { Chat } from "@google/genai";
import { parse } from 'marked';
import { createChatSession, sendMessageStream, generateSpeech } from './services/geminiService';
import { AppView, Message, HardwareStats, ChatMode, SearchSource } from './types';
import { 
  IconMenu, IconEdit, IconArrowUp, IconArrowLeft, 
  IconShare, IconMore, IconTerminal, IconActivity, IconUser,
  IconSearch, IconX, IconVolume, IconVolumeX
} from './components/Icons';

// Minimalist White 'V' Logo (SVG Data URI)
const LOGO_URL = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0id2hpdGUiPjxwYXRoIGQ9Ik0xMiAyMiBMMS41IDQgSDcuNSBMMTIgMTMuNSBMMTYuNSA0IEgyMi41IFogIi8+PC9zdmc+";

// --- Helper Components ---

const MarkdownRenderer = ({ content }: { content: string }) => {
  const [html, setHtml] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Parse markdown to HTML
    const parsed = parse(content) as string;
    setHtml(parsed);
  }, [content]);

  // Inject Copy Buttons after HTML render
  useEffect(() => {
    if (!containerRef.current) return;
    
    const preBlocks = containerRef.current.querySelectorAll('pre');
    preBlocks.forEach((pre) => {
        // Prevent adding multiple buttons if rerendered
        if (pre.querySelector('.copy-btn')) return;
        
        const btn = document.createElement('button');
        btn.className = 'copy-btn absolute top-2 right-2 p-1.5 rounded-lg bg-zinc-700/50 text-zinc-400 hover:text-white hover:bg-zinc-600 transition-all focus:opacity-100 cursor-pointer';
        
        // Initial Copy Icon
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
        
        btn.addEventListener('click', () => {
            const code = pre.querySelector('code')?.innerText || '';
            navigator.clipboard.writeText(code).then(() => {
                // Success Check Icon
                btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
                btn.classList.add('text-green-400');
                
                setTimeout(() => {
                    // Revert to Copy Icon
                    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
                    btn.classList.remove('text-green-400');
                }, 2000);
            });
        });
        
        pre.appendChild(btn);
    });
  }, [html]);

  return (
    <div 
      ref={containerRef}
      className="markdown-body"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

const TypewriterMarkdown = ({ content, isStreaming }: { content: string, isStreaming: boolean }) => {
  const [displayedContent, setDisplayedContent] = useState(isStreaming ? "" : content);
  const contentRef = useRef(content);
  const displayedContentLengthRef = useRef(isStreaming ? 0 : content.length);
  const [isTyping, setIsTyping] = useState(isStreaming);

  contentRef.current = content;

  useEffect(() => {
    if (!isStreaming) {
      setDisplayedContent(content);
      displayedContentLengthRef.current = content.length;
      setIsTyping(false);
      return;
    }

    setIsTyping(true);
    let animationFrameId: number;

    const animate = () => {
      const targetLen = contentRef.current.length;
      const currentLen = displayedContentLengthRef.current;
      const backlog = targetLen - currentLen;

      if (currentLen < targetLen) {
        // Latency Masking Logic (Smooth Continuity)
        // Slower trickle when close to end to avoid visual "stops" waiting for network
        // Faster catch-up when backlog is large
        let charsToAdd = 1;
        
        if (backlog > 200) charsToAdd = 15;
        else if (backlog > 100) charsToAdd = 10;
        else if (backlog > 50) charsToAdd = 6;
        else if (backlog > 20) charsToAdd = 3;
        else if (backlog > 5) charsToAdd = 2;
        else charsToAdd = 1; // Trickle mode
        
        displayedContentLengthRef.current += charsToAdd;
        
        // Clamp
        if (displayedContentLengthRef.current > targetLen) {
            displayedContentLengthRef.current = targetLen;
        }

        setDisplayedContent(contentRef.current.slice(0, displayedContentLengthRef.current));
        animationFrameId = requestAnimationFrame(animate);
      } else {
        if (isStreaming) {
           // Continue loop to catch new chunks immediately
           animationFrameId = requestAnimationFrame(animate);
        } else {
           setIsTyping(false);
        }
      }
    };

    animationFrameId = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(animationFrameId);
  }, [isStreaming]); 

  return (
    <div className={isTyping ? "typing-cursor" : ""}>
        <MarkdownRenderer content={displayedContent} />
    </div>
  );
};

const ThinkingIndicator = () => (
  <div className="flex items-center gap-2 p-2 px-3">
    <div className="relative flex items-center gap-1">
       <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-[bounce_1s_infinite_-0.3s]"></div>
       <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-[bounce_1s_infinite_-0.15s]"></div>
       <div className="w-1.5 h-1.5 bg-pink-400 rounded-full animate-[bounce_1s_infinite]"></div>
       <div className="absolute inset-0 blur-md bg-indigo-500/30 animate-pulse"></div>
    </div>
    <span className="text-xs text-zinc-500 font-mono animate-pulse tracking-widest">THINKING</span>
  </div>
);

const ProgressBar = ({ value, label, subLabel, detail }: { value: number; label: string; subLabel: string; detail?: string }) => (
  <div className="bg-zinc-900 rounded-2xl p-5 border border-zinc-800 mb-4">
    <div className="flex justify-between items-end mb-2">
      <span className="text-white font-medium text-lg">{label}</span>
      <span className="text-white font-bold text-lg">{value}%</span>
    </div>
    <div className="w-full bg-zinc-800 h-1.5 rounded-full mb-3">
      <div 
        className="bg-white h-1.5 rounded-full transition-all duration-500 ease-out" 
        style={{ width: `${value}%` }}
      ></div>
    </div>
    <div className="flex justify-between items-center text-xs text-zinc-500 uppercase font-mono tracking-wide">
      <span>{subLabel}</span>
      <span>{detail}</span>
    </div>
  </div>
);

const Chip = ({ text, onClick }: { text: string; onClick: () => void }) => (
  <button 
    onClick={onClick}
    className="border border-zinc-700 bg-zinc-900/50 text-zinc-300 px-5 py-2.5 rounded-full text-sm font-medium hover:bg-zinc-800 transition-colors whitespace-nowrap"
  >
    {text}
  </button>
);

const Toast = ({ message, show }: { message: string, show: boolean }) => (
  <div className={`fixed top-20 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 ${show ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 pointer-events-none'}`}>
    <div className="bg-zinc-800 text-white px-4 py-2 rounded-full border border-zinc-700 shadow-xl flex items-center gap-2 text-sm font-medium">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
      {message}
    </div>
  </div>
);

// --- Main App Component ---

const App: React.FC = () => {
  const [view, setView] = useState<AppView>(AppView.HOME);
  const [input, setInput] = useState('');
  const [chatMode, setChatMode] = useState<ChatMode>(ChatMode.FAST);
  const [autoRead, setAutoRead] = useState(false);
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isThinking, setIsThinking] = useState(false); 
  const [menuOpen, setMenuOpen] = useState(false);
  
  // Search & Header Functionality State
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [showToast, setShowToast] = useState(false);
  const [audioPlaying, setAudioPlaying] = useState<string | null>(null);

  // Stats Simulation
  const [stats, setStats] = useState<HardwareStats>({
    cpuLoad: 45, cpuTemp: 65,
    gpuLoad: 62, gpuTemp: 83,
    ramUsed: 8.4, ramTotal: 16,
    diskUsed: 412, diskTotal: 1024
  });

  const chatSessionRef = useRef<Chat | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Re-initialize Chat Session when Mode changes
  useEffect(() => {
    chatSessionRef.current = createChatSession(chatMode, messages);
    
    if (messages.length > 0) {
      triggerToast(`Switched to ${chatMode} mode`);
    }
  }, [chatMode]);

  // Auto-scroll chat
  useEffect(() => {
    if (messagesEndRef.current && !showSearch) {
        messagesEndRef.current.scrollIntoView({ behavior: (isStreaming || isThinking) ? 'auto' : 'smooth' });
    }
  }, [messages, isStreaming, isThinking, showSearch]);

  // Focus search input when opened
  useEffect(() => {
    if (showSearch && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [showSearch]);

  // Handle click outside for More Menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target as Node)) {
        setShowMoreMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Simulate Hardware Monitor updates
  useEffect(() => {
    const interval = setInterval(() => {
      setStats(prev => ({
        ...prev,
        cpuLoad: Math.min(100, Math.max(5, prev.cpuLoad + (Math.random() * 10 - 5))),
        gpuLoad: Math.min(100, Math.max(5, prev.gpuLoad + (Math.random() * 10 - 5))),
        ramUsed: Math.min(16, Math.max(4, prev.ramUsed + (Math.random() * 0.5 - 0.25))),
      }));
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const triggerToast = (msg: string) => {
    setToastMsg(msg);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2000);
  };

  const handleShare = () => {
    if (messages.length === 0) {
        triggerToast("Nothing to share");
        return;
    }
    const text = messages.map(m => `**${m.role === 'user' ? 'User' : 'V-D'}:**\n${m.text}\n`).join('\n---\n\n');
    navigator.clipboard.writeText(text).then(() => {
        triggerToast("Chat copied to clipboard");
    });
  };

  const handleClearChat = () => {
    setMessages([]);
    chatSessionRef.current = createChatSession(chatMode, []);
    setShowMoreMenu(false);
    triggerToast("Chat history cleared");
  };

  const handleTTS = async (text: string, msgId: string, autoPlay: boolean = false) => {
    // If clicking same button, toggle off
    if (!autoPlay && audioPlaying === msgId) {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
        }
        setAudioPlaying(null);
        return;
    }
    
    // Stop any existing playback
    if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
        setAudioPlaying(null);
    }

    if (!autoPlay) triggerToast("Generating Speech...");
    
    const url = await generateSpeech(text);
    if (url) {
        const audio = new Audio(url);
        audio.playbackRate = 1.6; // Increased speed for even faster response
        audioRef.current = audio;
        audio.play().catch(e => console.error("Playback failed", e));
        setAudioPlaying(msgId);
        audio.onended = () => setAudioPlaying(null);
    } else {
        if (!autoPlay) triggerToast("Failed to generate speech");
    }
  };

  const processMessage = async (text: string) => {
    if (!text.trim()) return;
    
    if (!chatSessionRef.current) {
        chatSessionRef.current = createChatSession(chatMode, messages);
    }
    
    if (showSearch) {
      setShowSearch(false);
      setSearchQuery('');
    }

    const userMsg: Message = { id: Date.now().toString(), role: 'user', text: text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setView(AppView.CHAT);
    
    setIsThinking(true);
    setIsStreaming(true);

    const aiMsgId = (Date.now() + 1).toString();
    const aiMsg: Message = { id: aiMsgId, role: 'model', text: '' };
    setMessages(prev => [...prev, aiMsg]);

    // Track full text for TTS
    let fullResponseText = "";

    try {
        const stream = sendMessageStream(chatSessionRef.current, text);
        let firstChunkReceived = false;
        
        for await (const chunk of stream) {
            if (!firstChunkReceived) {
                setIsThinking(false);
                firstChunkReceived = true;
            }
            
            fullResponseText += chunk.text;

            setMessages(prev => prev.map(m => {
                if (m.id === aiMsgId) {
                    const mergedSources = chunk.sources 
                        ? [...(m.sources || []), ...chunk.sources] 
                        .filter((v,i,a)=>a.findIndex(t=>(t.uri===v.uri))===i)
                        : m.sources;

                    return { 
                        ...m, 
                        text: m.text + chunk.text,
                        sources: mergedSources
                    };
                }
                return m;
            }));
        }
    } catch (e) {
        console.error("Streaming error", e);
    } finally {
        setIsThinking(false);
        setIsStreaming(false);

        // Auto-Play Logic: Play if enabled and we have text
        if (autoRead && fullResponseText.trim().length > 0) {
            // Slight delay to ensure UI settles
            setTimeout(() => {
                handleTTS(fullResponseText, aiMsgId, true);
            }, 100);
        }
    }
  };

  const handleSend = () => {
    processMessage(input);
  };

  const startQuickAction = (action: string) => {
    processMessage(action);
  };

  const filteredMessages = messages.filter(msg => 
    msg.text.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderHeader = () => {
    if (view === AppView.HOME) {
      return (
        <header className="flex justify-between items-center p-5 pt-8 z-10 sticky top-0 bg-black/80 backdrop-blur-md">
          <button onClick={() => setMenuOpen(!menuOpen)} className="text-white hover:text-zinc-300 transition-colors">
            <IconMenu />
          </button>
          <div className="flex items-center gap-3">
              <img src={LOGO_URL} alt="V-D" className="w-8 h-8 object-contain drop-shadow-[0_0_12px_rgba(255,255,255,0.4)]" />
              <h1 className="text-white font-bold text-lg tracking-widest">V-D</h1>
          </div>
          <button className="text-white hover:text-zinc-300 transition-colors">
            <IconEdit />
          </button>
        </header>
      );
    }
    if (view === AppView.MONITOR) {
      return (
        <header className="flex justify-between items-center p-5 pt-8 z-10 sticky top-0 bg-black/80 backdrop-blur-md">
           <button onClick={() => setView(AppView.HOME)} className="text-white hover:text-zinc-300 transition-colors">
             <IconArrowLeft />
           </button>
           <div className="flex items-center gap-3">
              <img src={LOGO_URL} alt="V-D" className="w-8 h-8 object-contain drop-shadow-[0_0_12px_rgba(255,255,255,0.4)]" />
              <h1 className="text-white font-bold text-lg tracking-widest">V-D</h1>
           </div>
           <div className="w-6"></div> 
        </header>
      );
    }
    if (view === AppView.CHAT) {
      return (
        <header className="flex justify-between items-center p-4 border-b border-zinc-900 bg-black/80 backdrop-blur-md sticky top-0 z-20 h-16 relative">
          {showSearch ? (
             <div className="flex items-center w-full gap-2 animate-fade-in">
                <IconSearch />
                <input 
                  ref={searchInputRef}
                  type="text" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search history..."
                  className="bg-transparent text-white w-full outline-none placeholder-zinc-500"
                />
                <button onClick={() => { setShowSearch(false); setSearchQuery(''); }} className="text-zinc-400 hover:text-white">
                  <IconX />
                </button>
             </div>
          ) : (
            <>
              <div className="flex items-center gap-3">
                 <button onClick={() => setView(AppView.HOME)} className="text-white hover:text-zinc-300 transition-colors">
                    <IconMenu />
                 </button>
                 <img src={LOGO_URL} alt="V-D" className="w-6 h-6 object-contain" />
                 <h1 className="text-white font-bold text-sm tracking-wide">V-D DIAGNOSTICS</h1>
              </div>
              <div className="flex gap-4 text-zinc-400 items-center relative">
                 <button 
                    onClick={() => {
                        const newState = !autoRead;
                        setAutoRead(newState);
                        triggerToast(`Auto-Read: ${newState ? 'ON' : 'OFF'}`);
                    }} 
                    className={`transition-colors p-1 rounded-full hover:bg-zinc-800 ${autoRead ? 'text-green-400' : 'text-zinc-400'}`}
                 >
                    {autoRead ? <IconVolume /> : <IconVolumeX />}
                 </button>
                 <button onClick={() => setShowSearch(true)} className="hover:text-white transition-colors p-1 rounded-full hover:bg-zinc-800">
                    <IconSearch />
                 </button>
                 <button onClick={handleShare} className="hover:text-white transition-colors p-1 rounded-full hover:bg-zinc-800">
                    <IconShare />
                 </button>
                 <button onClick={() => setShowMoreMenu(!showMoreMenu)} className="hover:text-white transition-colors p-1 rounded-full hover:bg-zinc-800 relative">
                    <IconMore />
                 </button>
                 
                 {/* More Dropdown */}
                 {showMoreMenu && (
                    <div ref={moreMenuRef} className="absolute top-10 right-0 w-48 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl py-1 z-50 overflow-hidden animate-fade-in origin-top-right">
                        <button 
                            onClick={handleClearChat}
                            className="w-full text-left px-4 py-3 text-sm text-red-400 hover:bg-zinc-800 hover:text-red-300 transition-colors flex items-center gap-2"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                            Clear History
                        </button>
                    </div>
                 )}
              </div>
            </>
          )}
        </header>
      );
    }
  };

  const renderHome = () => (
    <div className="flex flex-col h-full px-6 pt-10 pb-6 relative">
      <div className="flex-1 flex flex-col justify-center mb-20">
        <h2 className="text-5xl font-bold text-white mb-6 leading-tight">你好，我是 V-D</h2>
        <p className="text-zinc-400 text-lg leading-relaxed mb-12 max-w-md">
          您的专属电脑管家。诊断系统故障、硬件监控、性能优化。
        </p>

        <div className="flex flex-wrap gap-3 mb-8">
          <Chip text="电脑蓝屏 Critical Process Died" onClick={() => startQuickAction("电脑蓝屏了，错误代码是 CRITICAL_PROCESS_DIED")} />
          <Chip text="提升FPS" onClick={() => startQuickAction("如何优化Windows设置以提升游戏帧率？")} />
          <Chip text="清理C盘" onClick={() => startQuickAction("有哪些安全的命令行方法清理C盘垃圾？")} />
        </div>
      </div>

      <div className="bg-zinc-900/80 backdrop-blur rounded-2xl p-4 flex flex-col gap-4 mb-4 border border-zinc-800">
        <span className="text-white font-medium mb-1">AI 模式选择</span>
        <div className="grid grid-cols-2 gap-2">
            {[
                { id: ChatMode.FAST, label: 'Fast (Flash-Lite)' },
                { id: ChatMode.PRO, label: 'Pro (Gemini 3)' },
                { id: ChatMode.SEARCH, label: 'Search' },
                { id: ChatMode.THINKING, label: 'Thinking' }
            ].map((m) => (
                <button
                    key={m.id}
                    onClick={() => setChatMode(m.id as ChatMode)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                        chatMode === m.id 
                        ? 'bg-white text-black shadow-lg' 
                        : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                    }`}
                >
                    {m.label}
                </button>
            ))}
        </div>
      </div>

      <div className="bg-zinc-900 rounded-3xl p-1.5 pl-6 flex items-center border border-zinc-800 h-16 relative shadow-lg">
        <input 
          type="text" 
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="描述你的电脑问题..."
          className="bg-transparent w-full text-zinc-300 placeholder-zinc-500 outline-none text-lg"
        />
        <button 
            onClick={handleSend}
            className="w-12 h-full bg-white rounded-2xl flex items-center justify-center text-black hover:bg-zinc-200 transition-colors absolute right-1.5 top-1.5 bottom-1.5 shadow-sm"
        >
            <IconArrowUp />
        </button>
      </div>
      
      <div className="text-center mt-6">
        <span className="text-zinc-700 text-xs font-mono tracking-widest">V-D VERSION 3.2 • MODE: {chatMode}</span>
      </div>
    </div>
  );

  const renderMonitor = () => (
    <div className="flex flex-col px-6 pt-4 pb-6 h-full">
      <h2 className="text-3xl font-bold text-white mb-1">实时系统状态</h2>
      <p className="text-zinc-500 mb-8">正在监控硬件运行数据</p>

      <div className="flex-1 overflow-y-auto pb-4">
        <ProgressBar value={Math.round(stats.cpuLoad)} label="CPU 使用率" subLabel="Intel Core i9-13900K" detail="5.2 GHz" />
        <ProgressBar value={Math.round(stats.gpuLoad)} label="GPU 使用率" subLabel="NVIDIA RTX 4080" detail={`${stats.gpuTemp}°C`} />
        {/* ... existing monitor bars ... */}
      </div>
      {/* ... monitor footer ... */}
    </div>
  );

  const renderChat = () => (
    <div className="flex flex-col h-full relative">
      <div className="flex-1 overflow-y-auto px-4 py-4 pb-48">
        {filteredMessages.map((msg, idx) => {
          const isLast = idx === filteredMessages.length - 1;
          const isModel = msg.role === 'model';
          const shouldAnimate = !showSearch && isModel && isLast && isStreaming && msg.text.length > 0;

          return (
            <div key={idx} className="mb-8 animate-fade-in group">
              <div className="flex items-start gap-4 mb-2">
                 {msg.role === 'user' ? (
                   <div className="w-8 h-8 rounded-full bg-indigo-500/10 flex items-center justify-center border border-indigo-500/30 shrink-0 mt-1">
                      <IconUser />
                   </div>
                 ) : (
                   <div className="w-8 h-8 rounded-lg overflow-hidden shrink-0 mt-1 border border-zinc-800/50">
                      <img src={LOGO_URL} alt="V-D" className="w-full h-full object-cover p-1" />
                   </div>
                 )}
                 
                 <div className="flex-1 min-w-0">
                   <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-white text-sm">{msg.role === 'user' ? 'You' : 'V-D'}</span>
                      <span className="text-zinc-600 text-xs">{new Date(parseInt(msg.id) || Date.now()).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                      {isModel && (
                          <button 
                            onClick={() => handleTTS(msg.text, msg.id)}
                            className={`ml-2 p-1 rounded-full transition-colors ${audioPlaying === msg.id ? 'text-green-400 bg-green-900/30' : 'text-zinc-600 hover:text-white hover:bg-zinc-800'}`}
                            title="Play Text-to-Speech"
                          >
                             {audioPlaying === msg.id ? (
                                <div className="flex items-center gap-1">
                                    <span className="w-0.5 h-2 bg-green-400 animate-pulse"></span>
                                    <span className="w-0.5 h-3 bg-green-400 animate-pulse delay-75"></span>
                                    <span className="w-0.5 h-2 bg-green-400 animate-pulse delay-150"></span>
                                </div>
                             ) : (
                                <IconVolume />
                             )}
                          </button>
                      )}
                   </div>
                   
                   <div className="text-zinc-300 leading-relaxed font-sans text-sm md:text-base">
                      {msg.role === 'user' ? (
                          <div className="bg-zinc-900 inline-block px-4 py-3 rounded-2xl rounded-tl-none border border-zinc-800">
                             {msg.text}
                          </div>
                      ) : (
                          <>
                            <TypewriterMarkdown 
                                content={msg.text} 
                                isStreaming={shouldAnimate} 
                            />
                            {/* Render Search Sources */}
                            {msg.sources && msg.sources.length > 0 && (
                                <div className="mt-4 pt-3 border-t border-zinc-800/50">
                                    <span className="text-xs text-zinc-500 font-mono uppercase tracking-wider mb-2 block">Citations</span>
                                    <div className="flex flex-col gap-1.5">
                                        {msg.sources.map((source, i) => (
                                            <a 
                                                key={i} 
                                                href={source.uri} 
                                                target="_blank" 
                                                rel="noopener noreferrer"
                                                className="group flex items-start gap-2 bg-zinc-900/30 hover:bg-zinc-800/50 border border-zinc-800/50 hover:border-zinc-600 rounded-lg p-2 transition-all"
                                            >
                                                <div className="mt-0.5 min-w-[16px] h-4 rounded-sm bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-[10px] font-bold border border-indigo-500/30">
                                                    {i + 1}
                                                </div>
                                                <span className="text-sm text-zinc-400 group-hover:text-zinc-200 line-clamp-1 break-all font-medium">
                                                    {source.title || source.uri}
                                                </span>
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            )}
                          </>
                      )}
                   </div>
                 </div>
              </div>
            </div>
          );
        })}
        
        {isThinking && !showSearch && (
            <div className="mb-8 animate-fade-in pl-12">
                <ThinkingIndicator />
            </div>
        )}
        
        <div ref={messagesEndRef} className="h-4" />
      </div>

      {/* Floating Input Area */}
      {!showSearch && (
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black to-transparent pt-12 pb-6 px-4">
            <div className="max-w-3xl mx-auto">
                <div className="flex justify-between items-center mb-2 px-2">
                    <div className="flex items-center space-x-2 bg-zinc-900/80 rounded-full px-2 py-1 border border-zinc-800/50">
                         {/* Compact Mode Selector */}
                        {[
                            { id: ChatMode.FAST, icon: '⚡' },
                            { id: ChatMode.PRO, icon: '🧠' },
                            { id: ChatMode.SEARCH, icon: '🔍' },
                            { id: ChatMode.THINKING, icon: '🤔' }
                        ].map((m) => (
                            <button
                                key={m.id}
                                onClick={() => setChatMode(m.id as ChatMode)}
                                className={`w-7 h-7 flex items-center justify-center rounded-full text-xs transition-all ${
                                    chatMode === m.id 
                                    ? 'bg-white text-black shadow-md scale-110' 
                                    : 'text-zinc-500 hover:bg-zinc-800 hover:text-white'
                                }`}
                                title={m.id}
                            >
                                {m.icon}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="bg-zinc-900/80 backdrop-blur-xl rounded-[2rem] p-1.5 pl-5 flex items-center border border-zinc-700/50 shadow-2xl relative">
                    <button className="mr-3 text-zinc-400 hover:text-white transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                    </button>
                    
                    <input 
                        type="text" 
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && !isStreaming && !isThinking && handleSend()}
                        disabled={isStreaming || isThinking}
                        placeholder={isStreaming || isThinking ? "V-D is thinking..." : "Ask V-D..."}
                        className="bg-transparent flex-1 text-zinc-200 placeholder-zinc-500 outline-none text-base min-w-0 py-3 disabled:opacity-50"
                    />
                    
                    <button 
                        onClick={handleSend}
                        disabled={isStreaming || isThinking || !input.trim()}
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-black shrink-0 ml-2 transition-all duration-300 ${
                            input.trim() && !isStreaming && !isThinking
                            ? 'bg-white hover:bg-zinc-200 shadow-[0_0_15px_rgba(255,255,255,0.3)]' 
                            : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                        }`}
                    >
                        {isStreaming || isThinking ? (
                            <div className="w-3.5 h-3.5 border-2 border-zinc-600 border-t-zinc-400 rounded-full animate-spin"></div>
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="12" y1="19" x2="12" y2="5"></line>
                                <polyline points="5 12 12 5 19 12"></polyline>
                            </svg>
                        )}
                    </button>
                </div>
                
                <div className="text-center mt-3">
                    <span className="text-zinc-700 text-[10px] font-mono tracking-widest uppercase">
                    AI can make mistakes. Check critical commands.
                    </span>
                </div>
            </div>
          </div>
      )}
      
      <Toast message={toastMsg} show={showToast} />
    </div>
  );

  const Sidebar = () => (
     <div className={`fixed inset-0 z-50 transition-transform duration-300 ${menuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setMenuOpen(false)}></div>
        <div className="relative w-72 h-full bg-zinc-950 border-r border-zinc-800 p-6 flex flex-col shadow-2xl">
           <h2 className="text-2xl font-bold text-white mb-10 tracking-widest border-b border-zinc-900 pb-4">V-D</h2>
           <nav className="flex flex-col gap-2">
              <button onClick={() => { setView(AppView.HOME); setMenuOpen(false); }} className={`flex items-center gap-4 text-left p-4 rounded-2xl transition-all ${view === AppView.HOME ? 'bg-white text-black font-bold shadow-lg shadow-white/10' : 'text-zinc-400 hover:bg-zinc-900 hover:text-white'}`}>
                 <IconUser /> Home
              </button>
              <button onClick={() => { setView(AppView.MONITOR); setMenuOpen(false); }} className={`flex items-center gap-4 text-left p-4 rounded-2xl transition-all ${view === AppView.MONITOR ? 'bg-white text-black font-bold shadow-lg shadow-white/10' : 'text-zinc-400 hover:bg-zinc-900 hover:text-white'}`}>
                 <IconActivity /> Monitor
              </button>
              <button onClick={() => { setView(AppView.CHAT); setMenuOpen(false); }} className={`flex items-center gap-4 text-left p-4 rounded-2xl transition-all ${view === AppView.CHAT ? 'bg-white text-black font-bold shadow-lg shadow-white/10' : 'text-zinc-400 hover:bg-zinc-900 hover:text-white'}`}>
                 <IconTerminal /> Chat
              </button>
           </nav>
           
           <div className="mt-auto pt-6 border-t border-zinc-900">
               <div className="text-xs text-zinc-600 font-mono">
                   System Status: <span className="text-green-500">ONLINE</span><br/>
                   Version: 3.2.0<br/>
                   Mode: {chatMode}<br/>
                   Region: zh-CN
               </div>
           </div>
        </div>
     </div>
  );

  return (
    <div className="bg-black min-h-screen font-sans text-white flex justify-center">
       <Sidebar />
      <div className="w-full max-w-md h-screen flex flex-col bg-black relative shadow-2xl overflow-hidden border-x border-zinc-900">
        {renderHeader()}
        
        <main className="flex-1 overflow-hidden relative">
          {view === AppView.HOME && renderHome()}
          {view === AppView.MONITOR && renderMonitor()}
          {view === AppView.CHAT && renderChat()}
        </main>
      </div>
    </div>
  );
};

export default App;