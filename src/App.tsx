import { useEffect, useState, useMemo } from 'react';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, User } from 'firebase/auth';
import { collection, onSnapshot, doc, setDoc, getDocs, updateDoc, writeBatch } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './lib/firebase';
import { INITIAL_COMMANDS } from './data/commands';
import { CheckCircle2, CircleDashed, XCircle, LogIn, LogOut, ShieldCheck, Search, Database } from 'lucide-react';
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
  const [commands, setCommands] = useState<Command[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);

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
        setCommands(data);
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

  const handleSeed = async () => {
    if (!userIsAdmin) return;
    setSeeding(true);
    try {
      const batch = writeBatch(db);
      for (const [category, cmds] of Object.entries(INITIAL_COMMANDS)) {
        for (const name of cmds) {
          const id = `${category.toLowerCase()}_${name}`;
          const cmdRef = doc(db, 'commands', id);
          batch.set(cmdRef, {
            id,
            name,
            category,
            status: 'not_working',
            updatedAt: Date.now()
          });
        }
      }
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'commands');
    } finally {
      setSeeding(false);
    }
  };

  const setCommandStatus = async (command: Command, newStatus: Status) => {
    if (!userIsAdmin) return;
    setUpdating(command.id);
    try {
      const cmdRef = doc(db, 'commands', command.id);
      await updateDoc(cmdRef, {
        status: newStatus,
        updatedAt: Date.now()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `commands/${command.id}`);
    } finally {
      setUpdating(null);
    }
  };

  const categories = useMemo(() => {
    const cats = new Set(commands.map(c => c.category));
    return Array.from(cats).sort();
  }, [commands]);

  const filteredCommands = useMemo(() => {
    return commands.filter(c => {
      const matchesSearch = c.name.toLowerCase().includes(search.toLowerCase());
      const matchesCat = selectedCategory ? c.category === selectedCategory : true;
      return matchesSearch && matchesCat;
    }).sort((a, b) => {
      if (a.category !== b.category) return a.category.localeCompare(b.category);
      return a.name.localeCompare(b.name);
    });
  }, [commands, search, selectedCategory]);

  return (
    <div className="h-screen bg-slate-100 text-slate-800 font-sans flex flex-col overflow-hidden">
      <header className="bg-white/80 backdrop-blur-md border-b border-black/10 px-8 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center font-bold">
             <span className="text-white">C</span>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-slate-800 hidden sm:block">
            CommandStatus<span className="text-indigo-600">.IO</span>
          </h1>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative hidden md:block">
            <input 
              type="text" 
              placeholder="Search commands..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-slate-100 border-none rounded-full py-2 pl-10 pr-4 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
            />
            <span className="absolute left-3 top-2.5 opacity-40">🔍</span>
          </div>

          {!loadingContext && (
            user ? (
              <div className="flex items-center gap-3">
                {userIsAdmin && (
                  <div className="bg-blue-50 border border-blue-200 text-blue-700 px-3 py-1 rounded-md text-xs font-semibold flex items-center gap-2">
                    <span className="hidden sm:inline">{user.email}</span>
                    <span className="bg-blue-600 text-white px-1.5 py-0.5 text-[10px] rounded uppercase">Admin</span>
                  </div>
                )}
                <button 
                  onClick={logout}
                  title="Logout"
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button 
                onClick={login}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-slate-800 hover:bg-slate-900 rounded-lg transition-colors shadow-sm"
              >
                <LogIn className="w-4 h-4" />
                Admin Login
              </button>
            )
          )}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 bg-white border-r border-slate-200 p-5 flex-col gap-6 shrink-0 overflow-y-auto hidden md:flex">
          <nav className="space-y-1">
            <p className="text-[10px] uppercase font-bold text-slate-400 mb-2 px-3 tracking-widest">Modules</p>
            <button
              onClick={() => setSelectedCategory(null)}
              className={cn(
                "w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors",
                selectedCategory === null ? "bg-indigo-50 text-indigo-700 font-medium" : "text-slate-600 hover:bg-slate-50"
              )}
            >
              <span>All Commands</span>
              <span className="text-xs opacity-60">{commands.length}</span>
            </button>
            {categories.map(cat => {
              const count = commands.filter(c => c.category === cat).length;
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={cn(
                    "w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors",
                    selectedCategory === cat ? "bg-indigo-50 text-indigo-700 font-medium" : "text-slate-600 hover:bg-slate-50"
                  )}
                >
                  <span>{cat}</span>
                  <span className="text-xs opacity-60">{count}</span>
                </button>
              )
            })}
          </nav>
          
          <div className="mt-auto pt-4 flex flex-col gap-4">
            {commands.length > 0 && (
              <div className="p-4 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                <p className="text-xs font-semibold text-slate-800 mb-1">System Integrity</p>
                <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-green-500" 
                    style={{ width: `${Math.round((commands.filter(c => c.status === 'working').length / Math.max(1, commands.length)) * 100)}%` }}
                  ></div>
                </div>
                <p className="text-[10px] text-slate-500 mt-2">
                  {Math.round((commands.filter(c => c.status === 'working').length / Math.max(1, commands.length)) * 100)}% of commands are operational
                </p>
              </div>
            )}
            
            {userIsAdmin && commands.length === 0 && !loadingContext && (
              <div className="p-4 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                <button 
                  onClick={handleSeed}
                  disabled={seeding}
                  className="w-full py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50"
                >
                  {seeding ? 'Seeding...' : 'Seed Database'}
                </button>
              </div>
            )}
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-6 overflow-y-auto flex flex-col gap-6">
          {/* Mobile Search */}
          <div className="relative md:hidden shrink-0">
            <span className="absolute left-3 top-2.5 opacity-40">🔍</span>
            <input 
              type="text" 
              placeholder="Search commands..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-full py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="flex items-end justify-between shrink-0">
            <div className="space-y-1">
              <h2 className="text-2xl font-bold text-slate-900">
                {selectedCategory ? `${selectedCategory} Module` : "All Modules"}
              </h2>
              <p className="text-sm text-slate-500">
                Displaying current status for {selectedCategory ? selectedCategory.toLowerCase() : 'all'} commands.
              </p>
            </div>
            {/* Kept buttons logic for admins */}
             {userIsAdmin && commands.length > 0 && (
               <div className="flex gap-2">
                 <button className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg transition-colors hidden sm:block">
                   Admin Mode
                 </button>
               </div>
             )}
          </div>

          {commands.length === 0 && !loadingContext && !seeding ? (
             <div className="text-center py-20 bg-white border border-slate-200 rounded-xl border-dashed">
               <Database className="w-10 h-10 text-slate-300 mx-auto mb-3" />
               <h3 className="text-lg font-medium text-slate-800 mb-1">No commands found</h3>
               <p className="text-slate-500 text-sm">
                 {userIsAdmin 
                   ? "Click 'Seed Database' in the sidebar to initialize the dashboard."
                   : "The dashboard is currently empty. Admins are preparing the data."}
               </p>
             </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 items-start">
              <AnimatePresence mode="popLayout">
                {filteredCommands.map(cmd => (
                  <motion.div
                    key={cmd.id}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                    className={cn(
                      "bg-white border rounded-xl p-4 flex flex-col gap-3 transition-shadow duration-200 hover:shadow-sm",
                      cmd.status === 'in_development' ? "border-indigo-200 shadow-sm shadow-indigo-50" : "border-slate-200"
                    )}
                  >
                    <div className="flex justify-between items-start">
                      <h3 className="font-bold text-slate-800">/{cmd.name}</h3>
                      <span className={cn(
                        "px-2 py-[2px] rounded-full text-[11px] font-semibold uppercase tracking-wide",
                        cmd.status === 'working' ? "bg-green-100 text-green-800" :
                        cmd.status === 'in_development' ? "bg-yellow-100 text-yellow-800" :
                        "bg-red-100 text-red-800"
                      )}>
                        {STATUS_LABELS[cmd.status]}
                      </span>
                    </div>

                    <p className="text-xs text-slate-500 leading-relaxed">
                      Status tracking for the <b>/{cmd.name}</b> command in the {cmd.category} module.
                    </p>

                    <div className="flex flex-col gap-2 mt-auto pt-2 border-t border-slate-50">
                       <div className="flex items-center justify-between">
                         <span className="text-[10px] text-slate-400 italic">
                           Updated {new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(Math.round((cmd.updatedAt - Date.now()) / (1000 * 60 * 60 * 24)), 'day')}
                         </span>
                       </div>

                       {userIsAdmin && (
                         <div className="flex gap-1.5 pt-2">
                           <button
                             onClick={() => setCommandStatus(cmd, 'working')}
                             disabled={updating === cmd.id}
                             className={cn(
                               "flex-1 py-1 px-2 rounded text-[10px] font-bold transition-all border",
                               cmd.status === 'working' ? "bg-green-600 text-white border-green-600" : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50 hover:border-slate-300"
                             )}
                           >
                             WORK
                           </button>
                           <button
                             onClick={() => setCommandStatus(cmd, 'in_development')}
                             disabled={updating === cmd.id}
                             className={cn(
                               "flex-1 py-1 px-2 rounded text-[10px] font-bold transition-all border",
                               cmd.status === 'in_development' ? "bg-yellow-500 text-white border-yellow-500" : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50 hover:border-slate-300"
                             )}
                           >
                             DEV
                           </button>
                           <button
                             onClick={() => setCommandStatus(cmd, 'not_working')}
                             disabled={updating === cmd.id}
                             className={cn(
                               "flex-1 py-1 px-2 rounded text-[10px] font-bold transition-all border",
                               cmd.status === 'not_working' ? "bg-red-600 text-white border-red-600" : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50 hover:border-slate-300"
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

          {filteredCommands.length === 0 && commands.length > 0 && (
            <div className="text-center py-12">
              <p className="text-slate-500">No commands match your search.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

