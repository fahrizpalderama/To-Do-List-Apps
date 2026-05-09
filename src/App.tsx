import React, { useState, useEffect, useRef } from "react";
import imageCompression from "browser-image-compression";
import { 
  Plus, 
  Trash2, 
  CheckCircle2, 
  Circle, 
  LogOut, 
  Layout, 
  Calendar, 
  AlertCircle,
  Bell,
  Sheet,
  Loader2,
  Trash,
  Camera,
  Upload,
  RefreshCw,
  Image as ImageIcon,
  Edit2,
  User,
  Sun,
  Moon,
  X,
  Share2,
  Link2,
  Copy,
  Check
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface HistoryItem {
  timestamp: string;
  status: string;
  photoUrl: string;
  note: string;
  updaterName?: string;
}

interface Task {
  id: string;
  title: string;
  priority: 'Low' | 'Medium' | 'High';
  deadline: string;
  description: string;
  status: 'Belum Dikerjakan' | 'Sedang Dikerjakan' | 'Batal Dikerjakan' | 'Dialihkan' | 'Selesai' | 'Terlambat';
  photoUrl?: string;
  history?: HistoryItem[];
  authorName?: string;
}

export default function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [spreadsheetId, setSpreadsheetId] = useState<string>("");
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [activeTab, setActiveTab] = useState<'active' | 'completed'>('active');

  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [showDiagnostic, setShowDiagnostic] = useState(false);
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  // Form states
  const [title, setTitle] = useState("");
  const [deadline, setDeadline] = useState("");
  const [priority, setPriority] = useState<Task['priority']>('Medium');
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<Task['status']>('Belum Dikerjakan');
  const [photoUrl, setPhotoUrl] = useState("");
  const [updateNote, setUpdateNote] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [quickUpdateTask, setQuickUpdateTask] = useState<Task | null>(null);
  const [finishTask, setFinishTask] = useState<Task | null>(null);
  const [showHistoryTask, setShowHistoryTask] = useState<Task | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme');
      if (saved) return saved as 'light' | 'dark';
      // Cek preferensi sistem jika tidak ada di localStorage
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
    }
    return 'light';
  });

  const [isLocalMode, setIsLocalMode] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const dateContainerRef = useRef<HTMLDivElement>(null);

  // Helper untuk mendapatkan rentang tanggal
  const getDates = (centerDate: Date) => {
    const dates = [];
    for (let i = -10; i <= 10; i++) {
      const d = new Date(centerDate);
      d.setDate(d.getDate() + i);
      dates.push(d);
    }
    return dates;
  };

  const datesRange = getDates(new Date());

  // Helper untuk fetch dengan token
  const authenticatedFetch = (url: string, options: any = {}) => {
    const tokens = localStorage.getItem("google_tokens");
    const headers = {
      ...options.headers,
      ...(tokens ? { "Authorization": `Bearer ${tokens}` } : {})
    };
    return fetch(url, { ...options, headers });
  };

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.style.colorScheme = 'dark';
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.style.colorScheme = 'light';
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shareId = params.get("share");
    if (shareId) {
      setIsReadOnly(true);
    }

    const savedMode = localStorage.getItem("todo_mode");
    const savedTokens = localStorage.getItem("google_tokens");

    if (savedTokens) {
      setAuthenticated(true);
      setIsLocalMode(false);
      localStorage.setItem("todo_mode", "cloud");
      checkAuth(); // Pastikan ambil info user saat reload
    } else if (savedMode === "local") {
      setIsLocalMode(true);
      const localTasks = localStorage.getItem("local_tasks");
      if (localTasks) setTasks(JSON.parse(localTasks));
      setLoading(false);
    } else {
      checkAuth();
    }
    
    // Ambil info diagnosa
    fetch("/api/debug/config")
      .then(r => r.json())
      .then(setDebugInfo)
      .catch(err => console.error("Gagal ambil diagnosa:", err));

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_TOKEN_RECEIVED') {
        const tokens = JSON.stringify(event.data.tokens);
        localStorage.setItem("google_tokens", tokens);
        localStorage.setItem("todo_mode", "cloud");
        setAuthenticated(true);
        setIsLocalMode(false);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  useEffect(() => {
    if (authenticated && !isLocalMode) {
      fetchTasks();
      requestNotificationPermission();
    }
  }, [authenticated, isLocalMode]);

  // Task 3: Auto-refresh for Read-Only mode
  useEffect(() => {
    if (isReadOnly) {
      const interval = setInterval(() => {
        fetchTasks(true); // Silent refresh
      }, 30000); // 30 seconds
      return () => clearInterval(interval);
    }
  }, [isReadOnly]);

  // Task 1: Auto-scroll to today on mount or when tab becomes active
  useEffect(() => {
    if (activeTab === 'active' && dateContainerRef.current) {
      const todayBtn = dateContainerRef.current.querySelector('[data-today="true"]');
      if (todayBtn) {
        todayBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, [activeTab, loading]);

  // Handle local storage persistence
  useEffect(() => {
    if (isLocalMode) {
      localStorage.setItem("local_tasks", JSON.stringify(tasks));
    }
  }, [tasks, isLocalMode]);

  // Reminder Logic
  useEffect(() => {
    const interval = setInterval(() => {
      checkReminders();
    }, 60000); // Check every minute
    return () => clearInterval(interval);
  }, [tasks]);

  const checkAuth = async () => {
    try {
      const res = await authenticatedFetch("/api/auth/me");
      const data = await res.json();
      if (data.authenticated) {
        setAuthenticated(true);
        setUser(data.user);
        setIsLocalMode(false);
        localStorage.setItem("todo_mode", "cloud");
      } else {
        setAuthenticated(false);
        setUser(null);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const login = async () => {
    try {
      const res = await fetch("/api/auth/url");
      if (!res.ok) {
        const text = await res.text();
        console.error("Login URL fetch non-ok response:", text);
        try {
          const json = JSON.parse(text);
          throw new Error(json.error || json.message || `Status ${res.status}`);
        } catch (e) {
          throw new Error(`Server error (${res.status}). Cek environment variables di Vercel.`);
        }
      }
      
      const { url } = await res.json();
      if (!url) throw new Error("Server tidak mengembalikan URL login.");
      
      const popup = window.open(url, "oauth_popup", "width=600,height=700");
      
      const pollTimer = setInterval(() => {
        if (popup && popup.closed) {
          clearInterval(pollTimer);
          // Cek localStorage setelah popup tutup
          if (localStorage.getItem("google_tokens")) {
            setAuthenticated(true);
            setIsLocalMode(false);
          }
        }
      }, 1000);
    } catch (e: any) {
      console.error("Login URL fetch error:", e);
      alert(`Gagal memuat URL login: ${e.message}\n\nPastikan GOOGLE_CLIENT_ID dan APP_URL sudah disetting di Environment Variables Vercel.`);
    }
  };

  const enableLocalMode = () => {
    setIsLocalMode(true);
    setAuthenticated(false);
    localStorage.setItem("todo_mode", "local");
    localStorage.removeItem("google_tokens");
    const localTasks = localStorage.getItem("local_tasks");
    if (localTasks) setTasks(JSON.parse(localTasks));
    else setTasks([]);
  };

  const logout = async () => {
    try {
      await authenticatedFetch("/api/auth/logout", { method: "POST" });
    } catch (e) {
      console.error("Logout request failed:", e);
    } finally {
      // Selalu hapus state lokal walaupun request gagal
      setAuthenticated(false);
      setIsLocalMode(false);
      localStorage.removeItem("todo_mode");
      localStorage.removeItem("google_tokens");
      localStorage.removeItem("local_tasks");
      setTasks([]);
      setDebugInfo(null);
    }
  };

  const fetchTasks = async (isSilent = false) => {
    if (isLocalMode) return;
    if (!isSilent) setLoading(true);
    try {
      const params = new URLSearchParams(window.location.search);
      const shareId = params.get("share");
      
      const url = shareId ? `/api/tasks?spreadsheetId=${shareId}` : "/api/tasks";
      const res = await authenticatedFetch(url);
      const data = await res.json();
      
      if (data.tasks && Array.isArray(data.tasks)) {
        setTasks(data.tasks);
        if (data.spreadsheetId) setSpreadsheetId(data.spreadsheetId);
      } else if (Array.isArray(data)) {
        // Fallback jika API lama
        setTasks(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      if (!isSilent) setLoading(false);
    }
  };

  const copyShareLink = () => {
    if (!spreadsheetId) return;
    const shareUrl = `${window.location.origin}${window.location.pathname}?share=${spreadsheetId}`;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
      alert("Link disalin! \n\nPENTING: Agar orang lain bisa melihat tanpa login, Anda harus mengubah akses Spreadsheet (CloudSync Todo List) di Google Sheets menjadi 'Siapa saja yang memiliki link dapat melihat'.");
    });
  };

  const addTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const payload = {
      title,
      priority,
      deadline,
      description,
      status,
      photoUrl,
      authorName: user?.name || (isLocalMode ? "Tamu" : "")
    };

    if (isLocalMode) {
      const newTask: Task = {
        id: Date.now().toString(),
        ...payload,
        history: [{
          timestamp: new Date().toISOString(),
          status: payload.status,
          photoUrl: payload.photoUrl || "",
          note: "Pekerjaan dibuat (Lokal)"
        }]
      };
      setTasks([newTask, ...tasks]);
      resetForm();
      return;
    }

    try {
      const res = await authenticatedFetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const newTask = await res.json();
      setTasks([newTask, ...tasks]);
      resetForm();
    } catch (e) {
      console.error(e);
    }
  };

  const updateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask || !title.trim()) return;

    const payload = {
      title,
      priority,
      deadline,
      description,
      status,
      photoUrl,
      updateNote: (finishTask || quickUpdateTask) ? (updateNote || (finishTask ? "Pekerjaan Selesai" : "Update detail")) : "",
      updaterName: user?.name || (isLocalMode ? "Tamu" : "")
    };

    if (isLocalMode) {
      setTasks(tasks.map(t => t.id === editingTask.id ? { 
        ...t, 
        ...payload,
        history: [...(t.history || []), {
          timestamp: new Date().toISOString(),
          status: payload.status,
          photoUrl: payload.photoUrl,
          note: payload.updateNote || "Update lokal"
        }]
      } : t));
      resetForm();
      return;
    }

    try {
      const res = await authenticatedFetch(`/api/tasks/${editingTask.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const updatedTask = await res.json();
      setTasks(tasks.map(t => t.id === editingTask.id ? updatedTask : t));
      resetForm();
    } catch (e) {
      console.error(e);
    }
  };

  const resetForm = () => {
    setTitle("");
    setDeadline("");
    setPriority("Medium");
    setDescription("");
    setStatus("Belum Dikerjakan");
    setPhotoUrl("");
    setUpdateNote("");
    setEditingTask(null);
    setQuickUpdateTask(null);
    setFinishTask(null);
    setIsModalOpen(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || isLocalMode) return;

    setIsUploading(true);
    
    try {
      // Image Compression
      const options = {
        maxSizeMB: 0.5,
        maxWidthOrHeight: 1280,
        useWebWorker: true,
      };
      
      const compressedFile = await imageCompression(file, options);
      
      const formData = new FormData();
      formData.append('photo', compressedFile, file.name); // Gunakan nama file asli

      console.log("[Upload-DEBUG] Sending request to /api/upload");
      console.log("[Upload-DEBUG] File size:", compressedFile.size);
      
      const res = await authenticatedFetch("/api/upload", {
        method: "POST",
        body: formData
      });
      
      console.log("[Upload-DEBUG] Response Status:", res.status);
      const contentType = res.headers.get("content-type");
      console.log("[Upload-DEBUG] Content-Type:", contentType);
      if (res.ok) {
        if (contentType && contentType.includes("application/json")) {
          const data = await res.json();
          if (data.url) {
            setPhotoUrl(data.url);
          }
        } else {
          const text = await res.text();
          console.error("Server returned non-JSON OK response:", text.substring(0, 200));
          throw new Error("Server did not return JSON (Response was HTML or Text)");
        }
      } else {
        let errorMsg = `Upload failed (Status: ${res.status})`;
        if (contentType && contentType.includes("application/json")) {
          const errorData = await res.json();
          errorMsg = errorData.error || errorMsg;
        } else {
          const errorText = await res.text();
          console.error("Server returned non-JSON error response:", errorText.substring(0, 200));
        }
        throw new Error(errorMsg);
      }
    } catch (err: any) {
      console.error("Gagal upload:", err);
      alert(`Gagal mengunggah foto: ${err.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  const openQuickUpdate = (task: Task) => {
    setQuickUpdateTask(task);
    setEditingTask(task);
    setTitle(task.title);
    setDeadline(task.deadline);
    setPriority(task.priority);
    setDescription(task.description);
    setStatus(task.status);
    setPhotoUrl(task.photoUrl || "");
    setIsModalOpen(true);
  };

  const openEditModal = (task: Task) => {
    setEditingTask(task);
    setTitle(task.title);
    setDeadline(task.deadline);
    setPriority(task.priority);
    setDescription(task.description);
    setStatus(task.status);
    setPhotoUrl(task.photoUrl || "");
    setIsModalOpen(true);
  };

  const toggleStatus = async (task: Task) => {
    if (task.status !== 'Selesai') {
      setFinishTask(task);
      setTitle(task.title);
      setDeadline(task.deadline);
      setPriority(task.priority);
      setDescription(task.description); // Pastikan deskripsi tetap terbawa
      setPhotoUrl(""); // Reset foto untuk bukti baru
      setStatus("Selesai");
      setEditingTask(task);
      setIsModalOpen(true);
      return;
    }

    const statuses: Task['status'][] = ['Belum Dikerjakan', 'Sedang Dikerjakan', 'Batal Dikerjakan', 'Dialihkan', 'Selesai'];
    const currentIndex = statuses.indexOf(task.status);
    const updatedStatus = statuses[(currentIndex + 1) % statuses.length];
    
    if (isLocalMode) {
      setTasks(tasks.map(t => t.id === task.id ? { ...t, status: updatedStatus } : t));
      return;
    }

    try {
      const res = await authenticatedFetch(`/api/tasks/${task.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          ...task, 
          status: updatedStatus,
          updaterName: user?.name || (isLocalMode ? "Tamu" : "")
        }),
      });
      const updatedTask = await res.json();
      setTasks(tasks.map(t => t.id === task.id ? updatedTask : t));
    } catch (e) {
      console.error(e);
    }
  };

  const deleteTask = async (id: string) => {
    if (isLocalMode) {
      setTasks(tasks.filter(t => t.id !== id));
      return;
    }

    try {
      await authenticatedFetch(`/api/tasks/${id}`, { method: "DELETE" });
      setTasks(tasks.filter(t => t.id !== id));
    } catch (e) {
      console.error(e);
    }
  };


  const requestNotificationPermission = async () => {
    if ("Notification" in window) {
      await Notification.requestPermission();
    }
  };

  const checkReminders = () => {
    const now = new Date();
    tasks.forEach(task => {
      // Check for Overdue
      if (task.status !== 'Selesai' && task.status !== 'Terlambat' && task.status !== 'Batal Dikerjakan' && task.deadline) {
        const due = new Date(task.deadline);
        if (now > due) {
          handleOverdue(task);
        } else {
          // Normal Reminder
          const diff = due.getTime() - now.getTime();
          if (diff > 0 && diff < 60000) {
            new Notification("Tugas Segera Berakhir!", {
              body: `Tugas: ${task.title} harus segera diselesaikan.`,
              icon: "/favicon.ico"
            });
          }
        }
      }
    });
  };

  const handleOverdue = async (task: Task) => {
    const updatedTask = { ...task, status: 'Terlambat' as const };
    
    if (isLocalMode) {
      setTasks(prev => prev.map(t => t.id === task.id ? updatedTask : t));
      return;
    }

    try {
      // Update on server
      await authenticatedFetch(`/api/tasks/${task.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...updatedTask, updateNote: "Sistem: Deadline Terlewati" }),
      });
      setTasks(prev => prev.map(t => t.id === task.id ? updatedTask : t));
    } catch (e) {
      console.error("Auto overdue update failed:", e);
    }
  };

  if (loading && !authenticated) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!authenticated && !isLocalMode && !isReadOnly) {
    return (
      <div className="min-h-screen bg-white dark:bg-slate-950 flex flex-col items-center justify-center p-6 font-sans">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full text-center space-y-6"
        >
          <div className="space-y-2">
            <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto shadow-indigo-200 dark:shadow-none shadow-xl mb-6">
              <CheckCircle2 className="text-white w-10 h-10" />
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-slate-900 dark:text-white font-sans">My 2Dolist</h1>
            <p className="text-slate-500 dark:text-slate-400 text-lg">Kelola tugas Anda dengan sinkronisasi Google Sheets otomatis.</p>
          </div>

          <div className="space-y-3">
            <button
              onClick={login}
              className="w-full flex items-center justify-center gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 font-medium py-3.5 px-6 rounded-xl shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-all active:scale-[0.98] group"
            >
              <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" />
              Lanjutkan dengan Google
            </button>
          </div>

          <p className="text-xs text-slate-400 font-medium uppercase tracking-widest pt-4">
            Keamanan Data via Google Drive
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-indigo-50/30 dark:bg-slate-950 font-sans text-slate-900 dark:text-slate-100 pb-20 transition-colors duration-300">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="text-indigo-600 dark:text-indigo-400 w-6 h-6" />
            <span className="font-bold text-xl tracking-tight dark:text-white">My 2Dolist</span>
            {isLocalMode && (
              <span className="bg-slate-100 dark:bg-indigo-900/30 text-slate-500 dark:text-indigo-400 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-tighter">
                Local Only
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-2 sm:gap-4">
            {user && (
              <div className="flex items-center gap-2 sm:gap-3 bg-slate-50 dark:bg-slate-800/50 py-1 sm:py-1.5 px-3 sm:px-4 rounded-full border border-slate-100 dark:border-slate-700/50">
                <div className="flex flex-col text-left">
                  <span className="text-[10px] sm:text-[11px] font-black text-slate-900 dark:text-white leading-tight truncate max-w-[80px] sm:max-w-[150px]">{user.name}</span>
                  <span className="hidden sm:inline text-[9px] font-bold text-slate-400 dark:text-slate-500">{user.email}</span>
                </div>
              </div>
            )}
            
            <div className="flex items-center gap-0.5 sm:gap-1 bg-slate-50 dark:bg-slate-800/50 p-1 rounded-xl">
              <button
                onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                className="p-1.5 sm:p-2 text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-white dark:hover:bg-slate-700 rounded-lg transition-all shadow-none hover:shadow-sm"
                title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
              >
                {theme === 'light' ? <Moon className="w-4 h-4 sm:w-5 sm:h-5" /> : <Sun className="w-4 h-4 sm:w-5 sm:h-5" />}
              </button>

              {authenticated && spreadsheetId && !isReadOnly && (
                <div className="flex flex-col items-center">
                  <button
                    onClick={copyShareLink}
                    className="p-1.5 sm:p-2 text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-white dark:hover:bg-slate-700 rounded-lg transition-all shadow-none hover:shadow-sm flex items-center gap-2"
                    title="Salin Link Mode Lihat Saja"
                  >
                    {copySuccess ? <Check className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-500" /> : <Share2 className="w-4 h-4 sm:w-5 sm:h-5" />}
                    <span className="text-[10px] font-black hidden sm:inline uppercase tracking-widest">
                      {copySuccess ? <span className="text-emerald-500">Tersalin!</span> : <span>Bagikan</span>}
                    </span>
                  </button>
                </div>
              )}

              {!isLocalMode && !isReadOnly && authenticated && (
                <button 
                  onClick={fetchTasks}
                  className="p-1.5 sm:p-2 text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-white dark:hover:bg-slate-700 rounded-lg transition-all shadow-none hover:shadow-sm"
                  title="Refresh Sync"
                >
                  <Loader2 className={`w-4 h-4 sm:w-5 sm:h-5 ${loading ? 'animate-spin' : ''}`} />
                </button>
              )}
              {authenticated && !isReadOnly && (
                <button 
                  onClick={logout}
                  className="p-1.5 sm:p-2 text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-white dark:hover:bg-slate-700 rounded-lg transition-all shadow-none hover:shadow-sm"
                  title="Logout"
                >
                  <LogOut className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* Welcome Section */}
        <section className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold tracking-tight dark:text-white">
              {activeTab === 'active' ? (isLocalMode ? "Tugas Lokal" : "Tugas Aktif") : "Daftar Selesai"}
            </h2>
            <p className="text-slate-500 dark:text-slate-400 font-medium">
              {activeTab === 'active' 
                ? `${tasks.filter(t => t.status !== 'Selesai' && t.status !== 'Terlambat').length} tugas tersisa untuk dikerjakan.`
                : `${tasks.filter(t => t.status === 'Selesai' || t.status === 'Terlambat').length} tugas dalam arsip penyelesaian.`
              }
            </p>
          </div>
          
          <div className="flex items-center gap-2 bg-white dark:bg-slate-900 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <button 
              onClick={() => { setActiveTab('active'); setSelectedDate(new Date()); }}
              className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'active' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100 dark:shadow-none' : 'text-slate-400 hover:text-indigo-600'}`}
            >
              Tugas Aktif
            </button>
            <button 
              onClick={() => setActiveTab('completed')}
              className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'completed' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-100 dark:shadow-none' : 'text-slate-400 hover:text-emerald-600'}`}
            >
              Daftar Selesai
            </button>
            <div className="w-px h-6 bg-slate-100 dark:bg-slate-800 mx-1" />
            {!isReadOnly ? (
              <button 
                onClick={() => { resetForm(); setIsModalOpen(true); }}
                className="flex items-center justify-center gap-2 bg-slate-900 dark:bg-indigo-600 text-white px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest shadow-lg hover:bg-slate-800 dark:hover:bg-indigo-700 transition-all active:scale-95"
              >
                <Plus className="w-4 h-4" /> Tambah Baru
              </button>
            ) : (
              <div className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-xl text-[10px] font-black text-slate-400 uppercase tracking-widest border border-slate-200 dark:border-slate-700">
                Mode Lihat Saja
              </div>
            )}
          </div>
        </section>

        {activeTab === 'active' && (
          <motion.section 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-indigo-600/10 dark:bg-indigo-950/20 rounded-[40px] p-6 sm:p-8 space-y-6"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-black text-indigo-900 dark:text-indigo-100 tracking-tight">TaskList</h3>
              <div className="text-[10px] font-black uppercase tracking-widest text-indigo-400 bg-white dark:bg-slate-800 px-3 py-1 rounded-full shadow-sm">
                Rencana Kerja
              </div>
            </div>

            <div 
              ref={dateContainerRef}
              className="flex gap-3 overflow-x-auto pb-6 pt-2 no-scrollbar -mx-2 px-2 snap-x"
            >
              {datesRange.map((d, i) => {
                const isSelected = d.toDateString() === selectedDate.toDateString();
                const isToday = d.toDateString() === new Date().toDateString();
                const dayName = d.toLocaleDateString('id-ID', { weekday: 'short' });
                const monthName = d.toLocaleDateString('id-ID', { month: 'short' });
                const dayNum = d.getDate();
                
                return (
                  <motion.button
                    key={i}
                    data-today={isToday}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setSelectedDate(d)}
                    className={`flex-shrink-0 w-20 h-32 rounded-[28px] flex flex-col items-center justify-center gap-1 transition-all snap-center relative ${
                      isSelected 
                        ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-200 dark:shadow-none translate-y-[-4px]' 
                        : 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-slate-800 border border-indigo-100/50 dark:border-slate-800'
                    }`}
                  >
                    {isToday && (
                      <span className={`absolute -top-1 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${isSelected ? 'bg-white text-indigo-600' : 'bg-indigo-600 text-white'}`}>
                        Today
                      </span>
                    )}
                    <span className="text-[10px] font-black uppercase tracking-tighter opacity-80">{monthName}</span>
                    <span className="text-2xl font-black">{dayNum}</span>
                    <span className="text-[10px] font-bold uppercase tracking-widest">{dayName}</span>
                  </motion.button>
                );
              })}
            </div>
            <div className="flex justify-center">
               <div className="w-20 h-1.5 bg-indigo-200 dark:bg-indigo-900/50 rounded-full opacity-50" />
            </div>
          </motion.section>
        )}

        {/* Modal App */}
        <AnimatePresence>
          {isModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-md">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-[32px] shadow-2xl p-8 relative overflow-hidden ring-1 ring-slate-200 dark:ring-slate-800"
              >
                <button 
                  onClick={resetForm}
                  className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-all"
                >
                  <Plus className="w-6 h-6 rotate-45" />
                </button>

                <div className="mb-8">
                  <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                    {finishTask ? "✅ Selesaikan Pekerjaan" : (quickUpdateTask ? "💡 Update Cepat Pekerjaan" : (editingTask ? "📝 Edit Pekerjaan" : "✨ Pekerjaan Baru"))}
                  </h3>
                  <p className="text-slate-400 dark:text-slate-400 text-sm font-medium mt-1">
                    {finishTask ? "Berikan laporan akhir dan bukti foto penyelesaian." : (quickUpdateTask ? "Perbarui status dan bukti foto untuk pekerjaan ini." : "Lengkapi detail untuk hasil yang lebih terorganisir.")}
                  </p>
                </div>

                <form onSubmit={editingTask ? updateTask : addTask} className="space-y-6">
                  {finishTask ? (
                    <div className="space-y-6">
                       <div className="p-4 bg-emerald-50 dark:bg-emerald-950/20 rounded-2xl border border-emerald-100 dark:border-emerald-900/50 flex items-center gap-4">
                          <div className="w-10 h-10 bg-white dark:bg-slate-800 rounded-xl flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-sm">
                             <CheckCircle2 className="w-5 h-5" />
                          </div>
                          <div>
                             <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest leading-none">Konfirmasi Selesai</p>
                             <h4 className="text-sm font-black text-emerald-900 dark:text-emerald-100 truncate max-w-[200px]">{finishTask.title}</h4>
                          </div>
                       </div>

                       <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] ml-1">Laporan Hasil Pekerjaan</label>
                        <textarea
                          required
                          value={updateNote}
                          onChange={(e) => setUpdateNote(e.target.value)}
                          rows={3}
                          className="w-full text-sm font-bold py-3 px-4 bg-slate-50 dark:bg-slate-800 border-2 border-transparent focus:border-emerald-500 dark:focus:border-emerald-600 focus:bg-white dark:focus:bg-slate-900 focus:ring-0 rounded-2xl resize-none transition-all dark:text-white"
                          placeholder="Apa saja yang sudah diselesaikan? Berikan detailnya di sini..."
                        />
                      </div>
                    </div>
                  ) : (!quickUpdateTask ? (
                    <>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] ml-1">Nama Pekerjaan</label>
                        <input
                          required
                          type="text"
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                          placeholder="Contoh: Laporan Keuangan Bulanan"
                          className="w-full text-sm font-bold py-3 px-4 bg-slate-50 dark:bg-slate-800 border-2 border-transparent focus:border-indigo-500 dark:focus:border-indigo-600 focus:bg-white dark:focus:bg-slate-900 focus:ring-0 rounded-2xl transition-all placeholder:text-slate-300 dark:placeholder:text-slate-600 dark:text-white"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] ml-1">Prioritas</label>
                          <select
                            value={priority}
                            onChange={(e) => setPriority(e.target.value as any)}
                            className="w-full text-sm font-bold py-3 px-4 bg-slate-50 dark:bg-slate-800 border-2 border-transparent focus:border-indigo-500 dark:focus:border-indigo-600 focus:ring-0 rounded-2xl appearance-none dark:text-white"
                          >
                            <option value="Low">Low - Santai</option>
                            <option value="Medium">Medium - Biasa</option>
                            <option value="High">High - Mendesak!</option>
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] ml-1">Deadline</label>
                          <input
                            type="datetime-local"
                            value={deadline}
                            onChange={(e) => setDeadline(e.target.value)}
                            className="w-full text-sm font-bold py-3 px-4 bg-slate-50 dark:bg-slate-800 border-2 border-transparent focus:border-indigo-500 dark:focus:border-indigo-600 focus:ring-0 rounded-2xl dark:text-white"
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] ml-1">Detail Deskripsi</label>
                        <textarea
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          rows={3}
                          className="w-full text-sm font-bold py-3 px-4 bg-slate-50 dark:bg-slate-800 border-2 border-transparent focus:border-indigo-500 dark:focus:border-indigo-600 focus:ring-0 rounded-2xl resize-none dark:text-white"
                          placeholder="Jelaskan apa saja yang harus dilakukan pada bagian ini..."
                        />
                      </div>
                    </>
                  ) : (
                    <div className="p-4 bg-indigo-50 dark:bg-indigo-950/20 rounded-2xl border border-indigo-100 dark:border-indigo-900/50 flex items-center gap-4 mb-2">
                       <div className="w-10 h-10 bg-white dark:bg-slate-800 rounded-xl flex items-center justify-center text-indigo-600 dark:text-indigo-100 shadow-sm">
                          <Edit2 className="w-5 h-5" />
                       </div>
                       <div>
                          <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest leading-none">Sedang Memperbarui</p>
                          < h4 className="text-sm font-black text-indigo-900 dark:text-indigo-100 truncate max-w-[200px]">{title}</h4>
                       </div>
                    </div>
                  ))}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {!finishTask && (
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] ml-1">Update Status</label>
                        <select
                          value={status}
                          onChange={(e) => setStatus(e.target.value as any)}
                          className="w-full text-sm font-bold py-3 px-4 bg-slate-50 dark:bg-slate-800 border-2 border-transparent focus:border-indigo-500 dark:focus:border-indigo-600 focus:ring-0 rounded-2xl dark:text-white"
                        >
                          <option value="Belum Dikerjakan">Belum Dikerjakan</option>
                          <option value="Sedang Dikerjakan">Sedang Dikerjakan</option>
                          <option value="Batal Dikerjakan">Batal Dikerjakan</option>
                          <option value="Dialihkan">Dialihkan</option>
                        </select>
                      </div>
                    )}

                    {editingTask && (
                      <div className={`space-y-1.5 ${finishTask ? 'col-span-full' : ''}`}>
                        <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] ml-1">Foto Pekerjaan / Hasil Terakhir</label>
                        
                        {(photoUrl || isUploading) && (
                          <div className="mb-2 relative group min-h-[128px] bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center overflow-hidden border-2 border-indigo-100 dark:border-indigo-900/50">
                            {isUploading ? (
                              <div className="flex flex-col items-center gap-2">
                                <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                                <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">Sedang Mengunggah...</span>
                              </div>
                            ) : (
                              <>
                                <img 
                                  src={photoUrl} 
                                  alt="Preview" 
                                  className="w-full h-full object-cover"
                                  referrerPolicy="no-referrer"
                                />
                                <button 
                                  type="button"
                                  onClick={() => setPhotoUrl("")}
                                  className="absolute top-2 right-2 bg-rose-500 text-white p-1 rounded-full opacity-80 group-hover:opacity-100 transition-opacity"
                                >
                                  <Plus className="w-4 h-4 rotate-45" />
                                </button>
                              </>
                            )}
                          </div>
                        )}

                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={isUploading}
                            onClick={() => fileInputRef.current?.click()}
                            className={`w-full flex items-center justify-center gap-2 py-3 bg-slate-50 dark:bg-slate-800 border-2 border-dashed ${photoUrl ? 'border-indigo-300 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400' : 'border-slate-200 dark:border-slate-700 text-slate-400'} rounded-2xl hover:border-indigo-500 transition-all text-xs font-bold`}
                          >
                            {isUploading ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : photoUrl ? (
                              <ImageIcon className="w-4 h-4" />
                            ) : (
                              <Camera className="w-4 h-4" />
                            )}
                            {photoUrl ? "Foto Berhasil Terpilih (Klik untuk Ganti)" : "Klik untuk Ambil/Upload Foto"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <input 
                    type="file" 
                    ref={fileInputRef}
                    className="hidden"
                    accept="image/*"
                    capture="environment"
                    onChange={handleFileUpload}
                  />

                  {quickUpdateTask && (
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] ml-1">Catatan Update</label>
                      <input
                        type="text"
                        value={updateNote}
                        onChange={(e) => setUpdateNote(e.target.value)}
                        placeholder="Contoh: Sudah selesai dipacking"
                        className="w-full text-sm font-bold py-3 px-4 bg-slate-50 dark:bg-slate-800 border-2 border-transparent focus:border-indigo-500 dark:focus:border-indigo-600 focus:bg-white dark:focus:bg-slate-900 focus:ring-0 rounded-2xl dark:text-white"
                      />
                    </div>
                  )}

                  <div className="pt-6 flex gap-4">
                    <button 
                      type="button" 
                      onClick={resetForm}
                      className="flex-1 py-4 text-sm font-black text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all tracking-widest uppercase"
                    >
                      Batal
                    </button>
                    <button 
                      type="submit"
                      disabled={isUploading}
                      className={`flex-[2] py-4 ${finishTask ? 'bg-emerald-600' : 'bg-indigo-600 dark:bg-indigo-500'} text-white rounded-[24px] font-black shadow-xl hover:opacity-90 transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50 tracking-widest uppercase text-sm`}
                    >
                      {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : (finishTask ? "Selesaikan" : (editingTask ? "Update Data" : "Simpan Baru"))}
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Tasks List */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-2">
            <h4 className="text-sm font-black text-slate-900 dark:text-white tracking-widest uppercase">Tasks</h4>
            <div className="px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              {activeTab === 'active' ? 'By Date' : 'All History'}
            </div>
          </div>
          {(!tasks.some(t => {
            if (activeTab === 'completed') return (t.status === 'Selesai' || t.status === 'Terlambat');
            
            const isNotFinished = (t.status !== 'Selesai' && t.status !== 'Terlambat');
            if (!isNotFinished) return false;
            
            // Logika baru: Tampilkan dari tanggal dibuat sampai deadline
            // Kita gunakan data pertama di history sebagai tanggal pembuatan jika tidak ada field khusus
            const createDate = t.history && t.history.length > 0 && t.history[0].timestamp ? new Date(t.history[0].timestamp) : new Date();
            createDate.setHours(0, 0, 0, 0);

            const checkDate = new Date(selectedDate);
            checkDate.setHours(0, 0, 0, 0);

            if (!t.deadline) {
              // Jika tidak ada deadline, hanya muncul di hari dia dibuat
              return checkDate.toDateString() === createDate.toDateString();
            }

            const deadlineDate = new Date(t.deadline);
            deadlineDate.setHours(0, 0, 0, 0);

            return checkDate >= createDate && checkDate <= deadlineDate;
          })) && !loading ? (
            <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-300 dark:border-slate-800">
              <div className="bg-slate-100 dark:bg-slate-800 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4">
                <Sheet className="text-slate-400 w-6 h-6" />
              </div>
              <p className="text-slate-500 dark:text-slate-400 italic">
                {activeTab === 'active' ? `Belum ada tugas aktif untuk tanggal ${selectedDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long' })}.` : 'Belum ada tugas yang diselesaikan.'}
              </p>
            </div>
          ) : (
            tasks
              .filter(task => {
                if (activeTab === 'completed') return (task.status === 'Selesai' || task.status === 'Terlambat');
                
                const isNotFinished = (task.status !== 'Selesai' && task.status !== 'Terlambat');
                if (!isNotFinished) return false;
                
                const createDate = task.history && task.history.length > 0 && task.history[0].timestamp ? new Date(task.history[0].timestamp) : new Date();
                createDate.setHours(0, 0, 0, 0);

                const checkDate = new Date(selectedDate);
                checkDate.setHours(0, 0, 0, 0);

                if (!task.deadline) {
                  return checkDate.toDateString() === createDate.toDateString();
                }

                const deadlineDate = new Date(task.deadline);
                deadlineDate.setHours(0, 0, 0, 0);

                return checkDate >= createDate && checkDate <= deadlineDate;
              })
              .sort((a, b) => {
                const priorityOrder = { 'High': 0, 'Medium': 1, 'Low': 2 };
                return priorityOrder[a.priority] - priorityOrder[b.priority];
              })
              .map((task) => (
                <motion.div
                layout
                key={task.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className={`group bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4 transition-all hover:shadow-md ${task.status === 'Selesai' || task.status === 'Terlambat' ? 'opacity-80 bg-emerald-50/20 dark:bg-emerald-950/10 border-emerald-100 dark:border-emerald-900/30 shadow-inner' : ''}`}
              >
                <button 
                  onClick={(e) => { 
                    if (isReadOnly) return;
                    e.stopPropagation(); 
                    toggleStatus(task); 
                  }}
                  className={`p-2 rounded-full transition-all ${isReadOnly ? 'cursor-default' : 'cursor-pointer'} ${task.status === 'Selesai' || task.status === 'Terlambat' ? (task.status === 'Terlambat' ? 'text-rose-500 bg-rose-50 dark:bg-rose-900/30' : 'text-emerald-500 bg-emerald-50 dark:bg-emerald-900/30') : 'text-slate-300 dark:text-slate-600 hover:text-indigo-500 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-slate-800'}`}
                >
                  {task.status === 'Selesai' ? <CheckCircle2 className="w-6 h-6" /> : (task.status === 'Terlambat' ? <X className="w-6 h-6" /> : <Circle className="w-6 h-6 border-slate-200 dark:border-slate-700" />)}
                </button>

                <div className={`flex-1 min-w-0 ${isReadOnly ? '' : 'cursor-pointer'}`} onClick={() => !isReadOnly && (task.status !== 'Selesai' && task.status !== 'Terlambat') && openEditModal(task)}>
                  <h3 className={`font-bold truncate text-base ${task.status === 'Selesai' || task.status === 'Terlambat' || task.status === 'Dialihkan' || task.status === 'Batal Dikerjakan' ? 'line-through text-slate-400 dark:text-slate-500' : 'text-indigo-900 dark:text-indigo-100'}`}>
                    {task.title}
                  </h3>
                  {task.description && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">{task.description}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-3 mt-2 text-[10px] font-bold uppercase tracking-widest">
                    <span className={`px-2 py-0.5 rounded-lg ${
                      task.status === 'Selesai' ? 'bg-emerald-600 text-white shadow-emerald-100 dark:shadow-none' :
                      task.status === 'Terlambat' ? 'bg-rose-600 text-white shadow-rose-100 dark:shadow-none' :
                      task.status === 'Sedang Dikerjakan' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 border border-blue-200 dark:border-blue-900/50' : 
                      task.status === 'Belum Dikerjakan' ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400' : 
                      task.status === 'Batal Dikerjakan' ? 'bg-rose-50 dark:bg-rose-950/30 text-rose-400 dark:text-rose-400 border border-rose-100 dark:border-rose-900/50' : 
                      'bg-indigo-50 dark:bg-indigo-950/30 text-indigo-400 border border-indigo-100 dark:border-indigo-900/50'
                    }`}>
                      {task.status}
                    </span>
                    {task.deadline && (
                      <span className={`flex items-center gap-1 ${new Date() > new Date(task.deadline) && task.status !== 'Selesai' && task.status !== 'Terlambat' ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400 dark:text-slate-500'}`}>
                        <Calendar className="w-3 h-3" />
                        <span className="font-black text-[9px] mr-0.5">Deadline:</span>
                        {new Date(task.deadline).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                    <span className={`flex items-center gap-1 px-2 py-0.5 rounded-lg ${
                      task.priority === 'High' ? 'bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300' : 
                      task.priority === 'Medium' ? 'bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300' : 
                      'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
                    }`}>
                      <AlertCircle className="w-3 h-3" />
                      {task.priority === 'High' ? 'Prioritas Tinggi' : task.priority === 'Medium' ? 'Prioritas Sedang' : 'Prioritas Rendah'}
                    </span>
                    {task.photoUrl && (
                      <a href={task.photoUrl} target="_blank" onClick={(e) => e.stopPropagation()} className="flex items-center gap-1 text-indigo-600 dark:text-indigo-400 hover:underline">
                        <Camera className="w-3 h-3" /> Foto Terakhir
                      </a>
                    )}
                    {task.authorName && (
                      <div className="flex items-center gap-1.5 border-l border-slate-200 dark:border-slate-800 pl-3">
                        <User className="w-3 h-3 text-slate-400 dark:text-slate-500" />
                        <span className="text-slate-500 dark:text-slate-400 font-medium">@{task.authorName}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button 
                    onClick={() => setShowHistoryTask(task)}
                    className="p-2.5 text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-all shadow-sm border border-slate-100 dark:border-slate-700"
                    title="Lihat Riwayat"
                  >
                    <Sheet className="w-4 h-4" />
                  </button>

                  {!isReadOnly && task.status !== 'Selesai' && (
                    <button 
                      onClick={() => openQuickUpdate(task)}
                      className="p-2.5 text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-slate-800 hover:bg-indigo-600 hover:text-white rounded-xl transition-all shadow-sm border border-indigo-100 dark:border-indigo-900/50"
                      title="Update Status/Foto"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  )}

                  {!isReadOnly && (
                    <button 
                      onClick={() => deleteTask(task.id)}
                      className="p-2.5 text-slate-300 dark:text-slate-600 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-xl transition-all"
                      title="Hapus"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </motion.div>
            ))
          )}
        </div>
      </main>

      {/* History Modal */}
      <AnimatePresence>
        {showHistoryTask && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-[32px] shadow-2xl p-8 relative flex flex-col max-h-[85vh]"
            >
              <button 
                onClick={() => setShowHistoryTask(null)}
                className="absolute top-6 right-6 p-2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-all"
              >
                <Plus className="w-6 h-6 rotate-45" />
              </button>

              <div className="mb-6">
                <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                  <Sheet className="w-6 h-6 text-indigo-600 dark:text-indigo-400" /> Riwayat Pekerjaan
                </h3>
                <div className="flex flex-col mt-1 min-w-0">
                  <p className="text-slate-600 dark:text-slate-300 text-sm font-bold truncate">
                    {showHistoryTask.title}
                  </p>
                  {showHistoryTask.authorName && (
                    <p className="text-slate-400 dark:text-slate-500 text-[10px] font-bold uppercase tracking-widest flex items-center gap-1 mt-0.5">
                      <User className="w-3 h-3" /> Dibuat oleh: {showHistoryTask.authorName}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto pr-2 space-y-6 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800">
                {(!showHistoryTask.history || showHistoryTask.history.length === 0) ? (
                  <div className="text-center py-10">
                    <p className="text-slate-400 italic">Belum ada riwayat tercatat.</p>
                  </div>
                ) : (
                  showHistoryTask.history.map((item, idx) => (
                    <div key={idx} className="relative pl-6 border-l-2 border-indigo-100 dark:border-indigo-900/50">
                      <div className="absolute -left-[9px] top-0 w-4 h-4 bg-white dark:bg-slate-900 border-2 border-indigo-600 dark:border-indigo-500 rounded-full" />
                      
                      <div className="space-y-2">
                        <div className="flex justify-between items-start">
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg border ${
                            item.status === 'Sedang Dikerjakan' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 border-blue-100 dark:border-blue-900/50' : 
                            item.status === 'Belum Dikerjakan' ? 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-100 dark:border-slate-700' : 
                            item.status === 'Batal Dikerjakan' ? 'bg-rose-50 dark:bg-rose-950/30 text-rose-400 border-rose-100 dark:border-rose-900/50' : 
                            'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-400 border-indigo-100 dark:border-indigo-900/50'
                          }`}>
                            {item.status}
                          </span>
                          <div className="flex flex-col items-end gap-1">
                            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">
                              {new Date(item.timestamp).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </span>
                            {item.updaterName && (
                              <span className="text-[9px] font-black text-indigo-400 dark:text-indigo-500 uppercase tracking-wider">
                                oleh: {item.updaterName}
                              </span>
                            )}
                          </div>
                        </div>
                        
                        <p className="text-sm font-bold text-slate-700 dark:text-slate-200 leading-tight">
                          {item.note}
                        </p>

                        {item.photoUrl && (
                          <div className="mt-2 group relative inline-block">
                            <img 
                              src={item.photoUrl} 
                              alt="Update" 
                              className="w-32 h-20 object-cover rounded-xl border border-slate-200 dark:border-slate-800 cursor-pointer shadow-sm hover:shadow-md transition-all"
                              onClick={() => window.open(item.photoUrl, '_blank')}
                            />
                            <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 flex items-center justify-center rounded-xl transition-opacity pointer-events-none">
                              <ImageIcon className="text-white w-5 h-5" />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                ).reverse()}
              </div>

              <div className="mt-8">
                <button 
                  onClick={() => setShowHistoryTask(null)}
                  className="w-full py-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-[24px] font-black shadow-xl hover:bg-slate-800 dark:hover:bg-slate-100 transition-all active:scale-[0.98] tracking-widest uppercase text-sm"
                >
                  Tutup Riwayat
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Quick Update Button for mobile? No, it's inside the card already */}
    </div>
  );
}
