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
  const [dbCommands, setDbCommands] = useState<Command[]>([]);
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
    return Array.from(cmdMap.values()).sort((a, b) => {
      return a.name.localeCompare(b.name);
    });
  }, [dbCommands]);

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

  const categories = useMemo(() => {
    const cats = new Set(allCommands.map(c => c.category));
    return Array.from(cats).sort();
  }, [allCommands]);

  const filteredCommands = useMemo(() => {
    return allCommands.filter(c => {
      const matchesSearch = c.name.toLowerCase().includes(deferredSearch.toLowerCase());
      const matchesCat = selectedCategory ? c.category === selectedCategory : true;
      const matchesStatus = selectedStatus === null ? true : c.status === selectedStatus;
      return matchesSearch && matchesCat && matchesStatus;
    });
  }, [allCommands, deferredSearch, selectedCategory, selectedStatus]);

  return (
    <div className="h-screen bg-[#F8FAFC] text-slate-800 font-sans flex flex-col overflow-hidden selection:bg-indigo-100 selection:text-indigo-900">
      <header className="bg-white/80 backdrop-blur-xl border-b border-slate-200/60 px-6 sm:px-8 py-4 flex items-center justify-between shrink-0 z-20 shadow-sm shadow-slate-100/50">
        <motion.div 
          initial={{ opacity: 0, y: -10 }} 
          animate={{ opacity: 1, y: 0 }} 
          className="flex items-center gap-3"
        >
          <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-xl flex items-center justify-center font-bold shadow-lg shadow-indigo-200/50">
             <span className="text-white text-lg">C</span>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-slate-800 hidden sm:block">
            CommandStatus<span className="text-indigo-600 font-black">.io</span>
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
              className="bg-slate-100/80 border border-transparent hover:bg-slate-100 rounded-full py-2 pl-10 pr-4 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white focus:shadow-md transition-all duration-300"
            />
            <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
          </div>

          {!loadingContext && (
            user ? (
              <div className="flex items-center gap-3">
                {userIsAdmin && (
                  <div className="bg-indigo-50 border border-indigo-100 text-indigo-700 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 shadow-sm">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">{user.email?.split('@')[0]}</span>
                    <span className="bg-indigo-600 text-white px-1.5 py-0.5 text-[9px] tracking-wider rounded uppercase">Admin</span>
                  </div>
                )}
                <button 
                  onClick={logout}
                  title="Logout"
                  className="w-9 h-9 rounded-full flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-all active:scale-95"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button 
                onClick={login}
                title="Admin Login"
                className="w-10 h-10 rounded-full flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-transparent border border-transparent hover:border-transparent transition-all active:scale-95 hover:bg-slate-100"
              >
                <ShieldCheck className="w-5 h-5" />
              </button>
            )
          )}
        </motion.div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        {/* Sidebar */}
        <aside className="w-64 bg-white/50 backdrop-blur-sm border-r border-slate-200/60 p-5 flex-col gap-6 shrink-0 overflow-y-auto hidden md:flex z-10">
          <nav className="space-y-1.5">
            <p className="text-[10px] uppercase font-bold text-slate-400 mb-3 px-3 tracking-widest">Modules</p>
            <button
              onClick={() => setSelectedCategory(null)}
              className={cn(
                "w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm transition-all duration-200",
                selectedCategory === null ? "bg-indigo-600 text-white font-medium shadow-md shadow-indigo-200" : "text-slate-600 hover:bg-slate-100/80 font-medium"
              )}
            >
              <span>All Commands</span>
              <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full", selectedCategory === null ? "bg-white/20 text-white" : "bg-slate-200/50 text-slate-500")}>
                {allCommands.length}
              </span>
            </button>
            {categories.map(cat => {
              const count = allCommands.filter(c => c.category === cat).length;
              const isSelected = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={cn(
                    "w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm transition-all duration-200 group",
                    isSelected ? "bg-indigo-50 text-indigo-700 font-semibold" : "text-slate-600 hover:bg-slate-100/80 font-medium"
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span className={cn("w-1.5 h-1.5 rounded-full transition-colors", isSelected ? "bg-indigo-500" : "bg-slate-300 group-hover:bg-slate-400")} />
                    {cat}
                  </span>
                  <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full transition-colors", isSelected ? "bg-indigo-100 text-indigo-600" : "bg-slate-100 text-slate-500 group-hover:bg-slate-200")}>
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
                className="p-4 bg-white rounded-xl border border-slate-200/60 shadow-sm"
              >
                <p className="text-xs font-bold text-slate-800 mb-2">System Integrity</p>
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden relative">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.round((allCommands.filter(c => c.status === 'working').length / Math.max(1, allCommands.length)) * 100)}%` }}
                    transition={{ duration: 1, ease: 'easeOut' }}
                    className="h-full bg-emerald-500 rounded-full absolute left-0 top-0" 
                  />
                </div>
                <div className="flex justify-between items-center mt-2.5">
                  <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">Operational</p>
                  <p className="text-xs font-bold text-emerald-600">
                    {Math.round((allCommands.filter(c => c.status === 'working').length / Math.max(1, allCommands.length)) * 100)}%
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
            <Search className="absolute left-4 top-3.5 w-4 h-4 text-slate-400" />
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
              className="w-full bg-white border border-slate-200/80 rounded-xl py-3 pl-11 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
            />
          </div>

          <div className="flex flex-col gap-5 shrink-0 relative z-10">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <motion.div 
                initial={{ opacity: 0, x: -20 }} 
                animate={{ opacity: 1, x: 0 }} 
                className="space-y-1.5"
              >
                <div className="flex items-center flex-wrap gap-x-4 gap-y-2">
                  <h2 className="text-3xl flex items-center gap-3 font-extrabold text-slate-900 tracking-tight">
                    {selectedCategory ? selectedCategory : "All Commands"}
                    {allCommands.length > 0 && (
                       <span className="text-sm font-semibold px-2.5 py-1 bg-white text-slate-600 rounded-lg border border-slate-200/60 shadow-sm tabular-nums hidden sm:inline-block">
                         {filteredCommands.length} {filteredCommands.length === allCommands.length ? 'total' : `of ${allCommands.length}`}
                       </span>
                    )}
                  </h2>
                  <div className="relative md:hidden">
                    <select
                      value={selectedCategory || ''}
                      onChange={(e) => setSelectedCategory(e.target.value || null)}
                      className="pl-9 pr-8 py-2 md:py-1.5 bg-white border border-slate-200 text-slate-700 rounded-xl md:rounded-lg text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none transition-colors shadow-sm"
                    >
                      <option value="">All Categories</option>
                      {categories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                    <Filter className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>
                <p className="text-sm text-slate-500 font-medium">
                  Live status tracking for {selectedCategory ? <span className="text-indigo-600 font-semibold">{selectedCategory.toLowerCase()}</span> : 'all'} bot modules.
                </p>
              </motion.div>
               {userIsAdmin && allCommands.length > 0 && (
                 <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
                   <div className="px-4 py-2 bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-bold uppercase tracking-wider rounded-lg hidden sm:flex items-center gap-2">
                     <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
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
                {(['working', 'in_development', 'not_working'] as const).map(status => (
                  <button
                    key={status}
                    onClick={() => setSelectedStatus(selectedStatus === status ? null : status)}
                    className={cn(
                      "px-3.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-200 border",
                      selectedStatus === status 
                        ? status === 'working' ? "bg-emerald-50 text-emerald-700 border-emerald-200 shadow-sm"
                        : status === 'in_development' ? "bg-amber-50 text-amber-700 border-amber-200 shadow-sm"
                        : "bg-rose-50 text-rose-700 border-rose-200 shadow-sm"
                        : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
                    )}
                  >
                    {STATUS_LABELS[status]}
                  </button>
                ))}
              </motion.div>
            )}
          </div>

          {errorMsg && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
              className="p-4 rounded-xl bg-red-50 text-red-800 text-sm font-medium border border-red-200 break-words flex items-start gap-3 shadow-sm"
            >
              <XCircle className="w-5 h-5 shrink-0 text-red-500" />
              {errorMsg}
            </motion.div>
          )}

          {allCommands.length === 0 ? (
             <motion.div 
               initial={{ opacity: 0 }} animate={{ opacity: 1 }}
               className="text-center py-24 bg-white/50 border border-slate-200/60 rounded-2xl border-dashed"
             >
               <Database className="w-12 h-12 text-slate-300 mx-auto mb-4" />
               <h3 className="text-xl font-bold text-slate-800 mb-2">No commands available</h3>
               <p className="text-slate-500 text-sm max-w-sm mx-auto">
                 The initial commands configuration is empty. Admins need to seed or configure the system.
               </p>
             </motion.div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 xl:gap-5 items-start">
              <AnimatePresence>
                {filteredCommands.map((cmd, i) => (
                  <motion.div
                    key={cmd.id}
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className={cn(
                      "bg-white border rounded-2xl p-5 flex flex-col gap-4 relative overflow-hidden transition-all duration-300 group hover:-translate-y-1",
                      cmd.status === 'in_development' ? "border-amber-200 shadow-[0_4px_20px_-4px_rgba(251,191,36,0.15)] hover:shadow-[0_8px_30px_-4px_rgba(251,191,36,0.25)]" : 
                      cmd.status === 'not_working' ? "border-red-200 shadow-[0_4px_20px_-4px_rgba(248,113,113,0.1)] hover:shadow-[0_8px_30px_-4px_rgba(248,113,113,0.2)]" :
                      "border-slate-200 shadow-sm hover:shadow-lg hover:border-slate-300 hover:shadow-slate-200/50"
                    )}
                  >
                    {/* Status Top Line Marker */}
                    <div className={cn(
                      "absolute top-0 left-0 w-full h-1 bg-gradient-to-r",
                      cmd.status === 'working' ? "from-emerald-400 to-green-500" :
                      cmd.status === 'in_development' ? "from-amber-400 to-orange-500" :
                      "from-red-500 to-rose-600"
                    )} />

                    <div className="flex justify-between items-start pt-1">
                      <div>
                        {selectedCategory === null && (
                          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{cmd.category}</div>
                        )}
                        <h3 className="font-bold text-lg text-slate-800 tracking-tight">/{cmd.name}</h3>
                      </div>
                      <span className={cn(
                        "px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider shadow-sm",
                        cmd.status === 'working' ? "bg-emerald-50 text-emerald-700 border border-emerald-200/60" :
                        cmd.status === 'in_development' ? "bg-amber-50 text-amber-700 border border-amber-200/60" :
                        "bg-rose-50 text-rose-700 border border-rose-200/60"
                      )}>
                        {STATUS_LABELS[cmd.status]}
                      </span>
                    </div>

                    {!userIsAdmin && (
                      <p className="text-sm text-slate-500 leading-relaxed font-medium">
                        Standard bot interactions for the <span className="font-semibold text-slate-700">{cmd.name}</span> command.
                      </p>
                    )}

                    <div className={cn(
                      "flex flex-col gap-3 mt-auto pt-3 border-t",
                      cmd.status === 'in_development' ? "border-amber-100" :
                      cmd.status === 'not_working' ? "border-red-100" :
                      "border-slate-100"
                    )}>
                       <div className="flex items-center justify-between">
                         <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
                           Updated {new Intl.RelativeTimeFormat('en', { numeric: 'auto', style: 'short' }).format(Math.sign(cmd.updatedAt - Date.now()) === -1 ? Math.floor((cmd.updatedAt - Date.now()) / (1000 * 60 * 60 * 24)) : 0, 'day')}
                         </span>
                       </div>

                       {userIsAdmin && (
                         <div className="flex gap-1.5 pt-1 opacity-100 sm:opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200">
                           <button
                             onClick={() => setCommandStatus(cmd, 'working')}
                             disabled={updating === cmd.id}
                             className={cn(
                               "flex-1 py-1.5 px-2 rounded-lg text-[10px] font-bold transition-all border disabled:opacity-50 active:scale-95",
                               cmd.status === 'working' ? "bg-emerald-500 text-white border-emerald-600 shadow-sm shadow-emerald-200" : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50 hover:border-emerald-300 hover:text-emerald-600"
                             )}
                           >
                             WORK
                           </button>
                           <button
                             onClick={() => setCommandStatus(cmd, 'in_development')}
                             disabled={updating === cmd.id}
                             className={cn(
                               "flex-1 py-1.5 px-2 rounded-lg text-[10px] font-bold transition-all border disabled:opacity-50 active:scale-95",
                               cmd.status === 'in_development' ? "bg-amber-500 text-white border-amber-600 shadow-sm shadow-amber-200" : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50 hover:border-amber-300 hover:text-amber-600"
                             )}
                           >
                             DEV
                           </button>
                           <button
                             onClick={() => setCommandStatus(cmd, 'not_working')}
                             disabled={updating === cmd.id}
                             className={cn(
                               "flex-1 py-1.5 px-2 rounded-lg text-[10px] font-bold transition-all border disabled:opacity-50 active:scale-95",
                               cmd.status === 'not_working' ? "bg-rose-500 text-white border-rose-600 shadow-sm shadow-rose-200" : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50 hover:border-rose-300 hover:text-rose-600"
                             )}
                           >
                             DOWN
                           </button>
                         </div>
                       )}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}

          {filteredCommands.length === 0 && allCommands.length > 0 && (
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="text-center py-20 bg-white/50 border border-slate-200 rounded-2xl"
            >
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                <Search className="w-5 h-5 text-slate-400" />
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-1">No matches found</h3>
              <p className="text-slate-500 text-sm">We couldn't find any commands matching your current filters.</p>
            </motion.div>
          )}
        </main>
      </div>
    </div>
  );
}

