import { useEffect, useState, useMemo, useDeferredValue } from 'react';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, User } from 'firebase/auth';
import { collection, onSnapshot, doc, setDoc, getDocs, updateDoc, writeBatch } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './lib/firebase';
import { INITIAL_COMMANDS } from './data/commands';
import { CheckCircle2, CircleDashed, XCircle, LogIn, LogOut, ShieldCheck, Search, Database, ChevronDown, Filter } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';

type Status = 'working' | 'in_development' | 'not_working';

interface Command {
  id: string;
  name: string;
  category: string;
  status: Status;
  updatedAt: number;
}

const ADMIN_EMAILS = [
  'nadiaparveen1526@gmail.com',
  'pintrestk11@gmail.com',
  'tuijbialnajah@gmail.com',
  'kamranaliarts69@gmail.com'
];

function isAdmin(user: User | null): boolean {
  if (!user || !user.email) return false;
  return user.emailVerified && ADMIN_EMAILS.includes(user.email);
}

const STATUS_ICONS = {
  working: null,
  in_development: null,
  not_working: null
};

const STATUS_LABELS = {
  working: 'Working',
  in_development: 'In Dev',
  not_working: 'Down'
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loadingContext, setLoadingContext] = useState(true);
  const [dbCommands, setDbCommands] = useState<Command[]>(() => {
    try {
      const cached = localStorage.getItem('cmdStatusDbCache');
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (e) {
      console.warn("Could not read from localStorage cache", e);
    }
    return [];
  });
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<Status | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoadingContext(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    localStorage.setItem('cmdStatusDbCache', JSON.stringify(dbCommands));
  }, [dbCommands]);

  useEffect(() => {
    const path = 'commands';
    const unsubscribe = onSnapshot(
      collection(db, path),
      (snapshot) => {
        const data: Command[] = [];
        snapshot.forEach((doc) => {
          data.push(doc.data() as Command);
        });
        setDbCommands(data);
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, path);
      }
    );
    return () => unsubscribe();
  }, []);

  const login = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error(error);
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error(error);
    }
  };

  const userIsAdmin = isAdmin(user);

  const allCommands = useMemo(() => {
    const cmdMap = new Map<string, Command>();
    // populate from INITIAL_COMMANDS
    for (const [category, cmds] of Object.entries(INITIAL_COMMANDS)) {
      for (const name of cmds) {
        const id = `${category.toLowerCase()}_${name}`;
        cmdMap.set(id, {
          id,
          name,
          category,
          status: 'not_working',
          updatedAt: Date.now(),
        });
      }
    }
    // overlay with firestore data
    for (const cmd of dbCommands) {
      if (cmdMap.has(cmd.id)) {
        cmdMap.set(cmd.id, { ...cmdMap.get(cmd.id)!, ...cmd });
      } else {
        cmdMap.set(cmd.id, cmd);
      }
    }
    const allList = Array.from(cmdMap.values());
    const visibleList = user ? allList : allList.filter(c => c.status !== 'not_working');
    return visibleList.sort((a, b) => {
      return a.name.localeCompare(b.name);
    });
  }, [dbCommands, user]);

  const setCommandStatus = async (command: Command, newStatus: Status) => {
    if (!userIsAdmin) return;
    setUpdating(command.id);
    try {
      setErrorMsg(null);
      const isSeeded = dbCommands.some(c => c.id === command.id);
      const cmdRef = doc(db, 'commands', command.id);
      if (isSeeded) {
        await updateDoc(cmdRef, {
          status: newStatus,
          updatedAt: Date.now()
        });
      } else {
        await setDoc(cmdRef, {
          id: command.id,
          name: command.name,
          category: command.category,
          status: newStatus,
          updatedAt: Date.now()
        });
      }
    } catch (error: any) {
      setErrorMsg("Failed to update status: " + (error.message || String(error)));
      console.error(error);
    } finally {
      setUpdating(null);
    }
  };

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const cmd of allCommands) {
      counts[cmd.category] = (counts[cmd.category] || 0) + 1;
    }
    return counts;
  }, [allCommands]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { working: 0, in_development: 0, not_working: 0 };
    for (const cmd of allCommands) {
      if (counts[cmd.status] !== undefined) {
        counts[cmd.status]++;
      }
    }
    return counts;
  }, [allCommands]);

  const workingPercent = useMemo(() => {
    if (allCommands.length === 0) return 0;
    const working = allCommands.filter(c => c.status === 'working').length;
    return Math.round((working / allCommands.length) * 100);
  }, [allCommands]);

  const categories = useMemo(() => {
    return Object.keys(categoryCounts).sort();
  }, [categoryCounts]);

  const filteredCommands = useMemo(() => {
    return allCommands.filter(c => {
      const matchesSearch = c.name.toLowerCase().includes(deferredSearch.toLowerCase());
      const matchesCat = selectedCategory ? c.category === selectedCategory : true;
      const matchesStatus = selectedStatus === null ? true : c.status === selectedStatus;
      return matchesSearch && matchesCat && matchesStatus;
    });
  }, [allCommands, deferredSearch, selectedCategory, selectedStatus]);

  return (
    <div className="h-screen bg-[#030712] text-slate-300 font-sans flex flex-col overflow-hidden selection:bg-indigo-500/30 selection:text-indigo-200 relative">
      {/* Background Effect */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff0a_1px,transparent_1px),linear-gradient(to_bottom,#ffffff0a_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none z-0" />
      
      <header className="bg-[#070B14] border-b border-white/5 px-6 sm:px-8 py-4 flex items-center justify-between shrink-0 z-20 shadow-xl shadow-black/50 relative">
        <motion.div 
          initial={{ opacity: 0, y: -10 }} 
          animate={{ opacity: 1, y: 0 }} 
          className="flex items-center gap-3 w-10 sm:w-24"
        >
        </motion.div>

        <motion.div
           initial={{ opacity: 0, scale: 0.9 }}
           animate={{ opacity: 1, scale: 1 }}
           className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center"
        >
           <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white flex items-center gap-2.5">
             <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]"></div>
             RΞSPΩNSΞ <span className="text-indigo-500 font-black">LΛB</span>
           </h1>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: -10 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ delay: 0.1 }}
          className="flex items-center gap-4"
        >
          <div className="relative hidden md:block group">
            <input 
              type="text" 
              placeholder="Search commands..." 
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                if (e.target.value.length > 0 && selectedCategory) {
                  setSelectedCategory(null);
                }
              }}
              className="bg-white/5 border border-white/10 hover:bg-white/10 rounded-full py-2 pl-10 pr-4 text-sm w-64 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:bg-white/10 focus:border-indigo-500/50 transition-colors duration-300 text-white placeholder:text-slate-500 shadow-inner shadow-black/20"
            />
            <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
          </div>

          {!loadingContext && (
            user ? (
              <div className="flex items-center gap-3">
                {userIsAdmin && (
                  <div className="bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 shadow-sm">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">{user.email?.split('@')[0]}</span>
                    <span className="bg-indigo-500 text-white px-1.5 py-0.5 text-[9px] tracking-wider rounded uppercase shadow-[0_0_8px_rgba(99,102,241,0.5)]">Admin</span>
                  </div>
                )}
                <button 
                  onClick={logout}
                  title="Logout"
                  className="w-9 h-9 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors active:scale-95"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button 
                onClick={login}
                title="Admin Login"
                className="w-10 h-10 rounded-full flex items-center justify-center text-slate-500 hover:text-indigo-400 hover:bg-white/5 border border-transparent transition-colors active:scale-95"
              >
                <ShieldCheck className="w-5 h-5" />
              </button>
            )
          )}
        </motion.div>
      </header>

      <div className="flex flex-1 overflow-hidden relative z-10">
        {/* Sidebar */}
        <aside className="w-64 bg-[#070B14] border-r border-white/5 p-5 flex-col gap-6 shrink-0 overflow-y-auto hidden md:flex z-10 shadow-[4px_0_24px_rgba(0,0,0,0.2)]">
          <nav className="space-y-1.5">
            <p className="text-[10px] uppercase font-bold text-slate-500 mb-3 px-3 tracking-widest">Modules</p>
            <button
              onClick={() => setSelectedCategory(null)}
              className={cn(
                "w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm transition-colors duration-200",
                selectedCategory === null ? "bg-indigo-500 text-white font-medium shadow-[0_0_15px_rgba(99,102,241,0.3)] shadow-indigo-500/20 border border-indigo-400/20" : "text-slate-400 hover:bg-white/5 hover:text-white font-medium border border-transparent"
              )}
            >
              <span>All Commands</span>
              <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full", selectedCategory === null ? "bg-white/20 text-white" : "bg-white/5 text-slate-400")}>
                {allCommands.length}
              </span>
            </button>
            {categories.map(cat => {
              const count = categoryCounts[cat] || 0;
              const isSelected = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={cn(
                    "w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm transition-colors duration-200 group border",
                    isSelected ? "bg-indigo-500/10 text-indigo-300 font-semibold border-indigo-500/20" : "text-slate-400 hover:bg-white/5 hover:text-slate-200 font-medium border-transparent"
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span className={cn("w-1.5 h-1.5 rounded-full transition-colors box-content border border-[#030712]", isSelected ? "bg-indigo-400" : "bg-slate-700 group-hover:bg-slate-500")} />
                    {cat}
                  </span>
                  <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full transition-colors", isSelected ? "bg-indigo-500/20 text-indigo-300" : "bg-white/5 text-slate-500 group-hover:bg-white/10")}>
                    {count}
                  </span>
                </button>
              )
            })}
          </nav>
          
          <div className="mt-auto pt-4 flex flex-col gap-4">
            {allCommands.length > 0 && (
              <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
                className="p-4 bg-white/5 rounded-xl border border-white/10 shadow-lg"
              >
                <p className="text-xs font-bold text-white mb-2 tracking-wide">System Integrity</p>
                <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden relative shadow-inner">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${workingPercent}%` }}
                    transition={{ duration: 1, ease: 'easeOut' }}
                    className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full absolute left-0 top-0 shadow-[0_0_10px_rgba(16,185,129,0.5)]" 
                  />
                </div>
                <div className="flex justify-between items-center mt-3">
                  <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Operational</p>
                  <p className="text-xs font-bold text-emerald-400">
                    {workingPercent}%
                  </p>
                </div>
              </motion.div>
            )}
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-6 md:p-8 overflow-y-auto flex flex-col gap-8 relative z-0">
          {/* Mobile Search */}
          <div className="relative md:hidden shrink-0">
            <Search className="absolute left-4 top-3.5 w-4 h-4 text-slate-500" />
            <input 
              type="text" 
              placeholder="Search commands..." 
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                if (e.target.value.length > 0 && selectedCategory) {
                  setSelectedCategory(null);
                }
              }}
              className="w-full bg-[#0B1120] border border-white/10 rounded-xl py-3 pl-11 pr-4 text-sm focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 shadow-inner text-white placeholder:text-slate-500"
            />
          </div>

          <div className="flex flex-col gap-5 shrink-0 relative z-10">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <motion.div 
                initial={{ opacity: 0, x: -20 }} 
                animate={{ opacity: 1, x: 0 }} 
                className="space-y-2"
              >
                <div className="flex items-center flex-wrap gap-x-4 gap-y-2">
                  <h2 className="text-3xl flex items-center gap-3 font-extrabold text-white tracking-tight">
                    {selectedCategory ? selectedCategory : "All Commands"}
                    {allCommands.length > 0 && (
                       <span className="text-sm font-semibold px-2.5 py-1 bg-white/5 text-slate-300 rounded-lg border border-white/10 shadow-sm tabular-nums hidden sm:inline-block">
                         {filteredCommands.length} {filteredCommands.length === allCommands.length ? 'total' : `of ${allCommands.length}`}
                       </span>
                    )}
                  </h2>
                  <div className="relative md:hidden">
                    <select
                      value={selectedCategory || ''}
                      onChange={(e) => setSelectedCategory(e.target.value || null)}
                      className="pl-9 pr-8 py-2 md:py-1.5 bg-[#0B1120] border border-white/10 text-white rounded-xl md:rounded-lg text-sm font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500/50 appearance-none transition-colors shadow-sm"
                    >
                      <option value="">All Categories</option>
                      {categories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                    <Filter className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <ChevronDown className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>
                <p className="text-sm text-slate-400 font-medium">
                  Live status tracking for {selectedCategory ? <span className="text-indigo-400 font-semibold">{selectedCategory.toLowerCase()}</span> : 'all'} bot modules.
                </p>
              </motion.div>
               {userIsAdmin && allCommands.length > 0 && (
                 <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
                   <div className="px-4 py-2 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-bold uppercase tracking-wider rounded-lg hidden sm:flex items-center gap-2 shadow-[0_0_15px_rgba(99,102,241,0.1)]">
                     <div className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.8)]" />
                     Admin Edit Mode
                   </div>
                 </motion.div>
               )}
            </div>

            {/* Status Toggles */}
            {allCommands.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }} 
                animate={{ opacity: 1, y: 0 }} 
                transition={{ delay: 0.1 }} 
                className="flex flex-wrap items-center gap-2"
              >
                {(user ? ['working', 'in_development', 'not_working'] : ['working', 'in_development'] as const).map((status: Status) => (
                  <button
                    key={status}
                    onClick={() => setSelectedStatus(selectedStatus === status ? null : status)}
                    className={cn(
                      "px-3.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors duration-300 border flex items-center gap-2",
                      selectedStatus === status 
                        ? status === 'working' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.15)]"
                        : status === 'in_development' ? "bg-amber-500/10 text-amber-400 border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.15)]"
                        : "bg-rose-500/10 text-rose-400 border-rose-500/30 shadow-[0_0_15px_rgba(244,63,94,0.15)]"
                        : "bg-white/5 text-slate-400 border-white/5 hover:bg-white/10 hover:text-white"
                    )}
                  >
                    <span>{STATUS_LABELS[status]}</span>
                    <span className={cn(
                      "px-1.5 py-0.5 rounded-md text-[10px] bg-black/20",
                      selectedStatus === status ? "text-inherit" : "text-slate-500"
                    )}>
                      {statusCounts[status] || 0}
                    </span>
                  </button>
                ))}
              </motion.div>
            )}
          </div>

          {errorMsg && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
              className="p-4 rounded-xl bg-red-500/10 text-red-300 text-sm font-medium border border-red-500/20 break-words flex items-start gap-3 shadow-lg"
            >
              <XCircle className="w-5 h-5 shrink-0 text-red-400" />
              {errorMsg}
            </motion.div>
          )}

          {allCommands.length === 0 ? (
             <motion.div 
               initial={{ opacity: 0 }} animate={{ opacity: 1 }}
               className="text-center py-24 bg-white/5 border border-white/10 rounded-2xl border-dashed shadow-inner"
             >
               <Database className="w-12 h-12 text-slate-600 mx-auto mb-4" />
               <h3 className="text-xl font-bold text-white mb-2">No commands available</h3>
               <p className="text-slate-400 text-sm max-w-sm mx-auto">
                 The initial commands configuration is empty. Admins need to seed or configure the system.
               </p>
             </motion.div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 xl:gap-5 items-start">
                {filteredCommands.map((cmd) => (
                  <div
                    key={cmd.id}
                    className={cn(
                      "bg-white/[0.03] border rounded-2xl p-5 flex flex-col gap-4 relative overflow-hidden transition-[transform,border-color,box-shadow] duration-300 group hover:-translate-y-1 ",
                      cmd.status === 'in_development' ? "border-amber-500/20 hover:border-amber-500/40 shadow-[0_4px_20px_-4px_rgba(245,158,11,0.05)] hover:shadow-[0_8px_30px_-4px_rgba(245,158,11,0.15)]" : 
                      cmd.status === 'not_working' ? "border-rose-500/20 hover:border-rose-500/40 shadow-[0_4px_20px_-4px_rgba(244,63,94,0.05)] hover:shadow-[0_8px_30px_-4px_rgba(244,63,94,0.15)]" :
                      "border-white/5 hover:border-white/10 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.2)] hover:shadow-[0_8px_30px_-4px_rgba(0,0,0,0.4)]"
                    )}
                  >
                    {/* Status Top Line Marker */}
                    <div className={cn(
                      "absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r",
                      cmd.status === 'working' ? "from-emerald-400 to-emerald-600 shadow-[0_0_8px_rgba(52,211,153,0.5)]" :
                      cmd.status === 'in_development' ? "from-amber-400 to-amber-600 shadow-[0_0_8px_rgba(251,191,36,0.5)]" :
                      "from-rose-500 to-rose-700 shadow-[0_0_8px_rgba(244,63,94,0.5)]"
                    )} />

                    <div className="flex justify-between items-start pt-1">
                      <div>
                        {selectedCategory === null && (
                          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{cmd.category}</div>
                        )}
                        <h3 className="font-bold text-lg text-white tracking-tight group-hover:text-indigo-300 transition-colors">/{cmd.name}</h3>
                      </div>
                      <span className={cn(
                        "px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider shadow-inner",
                        cmd.status === 'working' ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                        cmd.status === 'in_development' ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" :
                        "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                      )}>
                        {STATUS_LABELS[cmd.status]}
                      </span>
                    </div>

                    {!userIsAdmin && (
                      <p className="text-sm text-slate-400 leading-relaxed font-medium">
                        Standard bot interactions for the <span className="font-semibold text-slate-200">{cmd.name}</span> command.
                      </p>
                    )}

                    <div className={cn(
                      "flex flex-col gap-3 mt-auto pt-3 border-t",
                      cmd.status === 'in_development' ? "border-amber-500/10" :
                      cmd.status === 'not_working' ? "border-rose-500/10" :
                      "border-white/5"
                    )}>
                       <div className="flex items-center justify-between">
                         <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                           Updated {new Intl.RelativeTimeFormat('en', { numeric: 'auto', style: 'short' }).format(Math.sign(cmd.updatedAt - Date.now()) === -1 ? Math.floor((cmd.updatedAt - Date.now()) / (1000 * 60 * 60 * 24)) : 0, 'day')}
                         </span>
                       </div>

                       {userIsAdmin && (
                         <div className="flex gap-1.5 pt-1 opacity-100 sm:opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-300">
                           <button
                             onClick={() => setCommandStatus(cmd, 'working')}
                             disabled={updating === cmd.id}
                             className={cn(
                               "flex-1 py-1.5 px-2 rounded-lg text-[10px] font-bold transition-colors border disabled:opacity-50 active:scale-95",
                               cmd.status === 'working' ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.2)]" : "bg-white/5 text-slate-400 border-white/5 hover:bg-emerald-500/10 hover:border-emerald-500/20 hover:text-emerald-400"
                             )}
                           >
                             WORK
                           </button>
                           <button
                             onClick={() => setCommandStatus(cmd, 'in_development')}
                             disabled={updating === cmd.id}
                             className={cn(
                               "flex-1 py-1.5 px-2 rounded-lg text-[10px] font-bold transition-colors border disabled:opacity-50 active:scale-95",
                               cmd.status === 'in_development' ? "bg-amber-500/20 text-amber-300 border-amber-500/30 shadow-[0_0_10px_rgba(245,158,11,0.2)]" : "bg-white/5 text-slate-400 border-white/5 hover:bg-amber-500/10 hover:border-amber-500/20 hover:text-amber-400"
                             )}
                           >
                             DEV
                           </button>
                           <button
                             onClick={() => setCommandStatus(cmd, 'not_working')}
                             disabled={updating === cmd.id}
                             className={cn(
                               "flex-1 py-1.5 px-2 rounded-lg text-[10px] font-bold transition-colors border disabled:opacity-50 active:scale-95",
                               cmd.status === 'not_working' ? "bg-rose-500/20 text-rose-300 border-rose-500/30 shadow-[0_0_10px_rgba(244,63,94,0.2)]" : "bg-white/5 text-slate-400 border-white/5 hover:bg-rose-500/10 hover:border-rose-500/20 hover:text-rose-400"
                             )}
                           >
                             DOWN
                           </button>
                         </div>
                       )}
                    </div>
                  </div>
                ))}
            </div>
          )}

          {filteredCommands.length === 0 && allCommands.length > 0 && (
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="text-center py-20 bg-white/5 border border-white/10 rounded-2xl shadow-lg"
            >
              <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4 border border-white/10 shadow-inner">
                <Search className="w-5 h-5 text-slate-400" />
              </div>
              <h3 className="text-lg font-bold text-white mb-1">No matches found</h3>
              <p className="text-slate-400 text-sm">We couldn't find any commands matching your current filters.</p>
            </motion.div>
          )}
        </main>
      </div>
    </div>
  );
}

