import React, { useState, useEffect, FormEvent, createContext, useContext, useRef } from "react";
import { createRoot } from "react-dom/client";
import { createClient } from "@supabase/supabase-js";
import * as pdfjsLib from 'pdfjs-dist';
import Tesseract from 'tesseract.js';

// --- PDF.js Initialization ---
// Robustly resolve the library object. 
// Some environments put the exports on 'default', others on the root.
// We check for GlobalWorkerOptions to confirm we have the right object.
let pdfjs: any = pdfjsLib;
if ((pdfjsLib as any).default && (pdfjsLib as any).default.GlobalWorkerOptions) {
  pdfjs = (pdfjsLib as any).default;
}

// Set worker source for PDF.js safely
if (pdfjs.GlobalWorkerOptions) {
  pdfjs.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@3.11.174/build/pdf.worker.min.js`;
} else {
  console.warn("PDF.js GlobalWorkerOptions not found. Text extraction may fail.");
}

// --- Supabase Configuration ---
const SUPABASE_URL = "https://derhjngdekcssdzcxylp.supabase.co";
const SUPABASE_KEY = "sb_publishable_nbZLJsf6OVugZqE46AmC1g_YbtCgpGC";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// --- SQL Setup Script (For user convenience) ---
const SETUP_SQL = `
-- 1. Create Tables
create table if not exists users (
  id uuid default gen_random_uuid() primary key,
  name text,
  email text unique,
  password text,
  role text,
  joined text,
  university_roll text,
  class_roll text
);

create table if not exists sections (
  id uuid default gen_random_uuid() primary key,
  name text,
  code text unique,
  teacher_email text,
  created text
);

create table if not exists assignments (
  id uuid default gen_random_uuid() primary key,
  section_code text,
  title text,
  description text,
  subject text,
  due_date text,
  created_by text,
  attachment_url text
);

-- Safely add column if table already exists without it
alter table assignments add column if not exists attachment_url text;

create table if not exists enrollments (
  id uuid default gen_random_uuid() primary key,
  student_email text,
  section_code text
);

create table if not exists submissions (
  id uuid default gen_random_uuid() primary key,
  assignment_id text,
  student_email text,
  file_url text,
  submitted_at text,
  status text,
  grade numeric,
  feedback text,
  extracted_text text
);

-- Safely add column if table already exists without it
alter table submissions add column if not exists extracted_text text;

-- 2. Storage Buckets (Run in Supabase Dashboard > Storage)
-- Create a public bucket named 'assignments'
-- Create a public bucket named 'submissions'
`;

// --- Icons (SVG Components) ---
const Icons = {
  Logo: () => (
    <svg className="w-8 h-8 text-primary-600 dark:text-primary-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  ),
  Menu: () => <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18M3 6h18M3 18h18" /></svg>,
  X: () => <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>,
  User: () => <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>,
  Lock: () => <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>,
  Mail: () => <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>,
  Book: () => <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>,
  Upload: () => <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>,
  Clock: () => <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>,
  Sun: () => <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>,
  Moon: () => <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>,
  LogOut: () => <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>,
  Trash: () => <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>,
  Plus: () => <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>,
  Users: () => <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>,
  Hash: () => <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="4" y1="9" x2="20" y2="9" /><line x1="4" y1="15" x2="20" y2="15" /><line x1="10" y1="3" x2="8" y2="21" /><line x1="16" y1="3" x2="14" y2="21" /></svg>,
  Check: () => <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>,
  Database: () => <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" /></svg>,
  Message: () => <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>,
  Paperclip: () => <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>,
  Send: () => <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>,
  Alert: () => <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
};

// --- Types ---
type ViewState = 'landing' | 'login' | 'signup' | 'forgot-password' | 'dashboard' | 'admin-login' | 'admin-dashboard';
type Role = 'student' | 'teacher' | 'admin';

interface User {
  id: string;
  name: string;
  email: string;
  password?: string;
  role: Role;
  joined: string;
  university_roll?: string;
  class_roll?: string;
}

interface Section {
  id: string;
  name: string;
  code: string;
  teacher_email: string;
  created: string;
}

interface Assignment {
  id: string;
  section_code: string;
  title: string;
  description: string;
  subject: string;
  due_date: string;
  created_by: string;
  attachment_url?: string; // New field
}

interface Submission {
  id: string;
  assignment_id: string;
  student_email: string;
  file_url: string;
  submitted_at: string;
  status: 'pending' | 'graded';
  grade?: number;
  feedback?: string;
  extracted_text?: string; // New field for plagiarism detection
}

interface Enrollment {
  student_email: string;
  section_code: string;
}

// --- Helper Functions ---

const extractTextFromPDF = async (file: File, showToast: (msg: string, type: 'success' | 'error') => void): Promise<string> => {
  if (file.type !== 'application/pdf') return '';
  try {
    const arrayBuffer = await file.arrayBuffer();
    // Use the correctly resolved pdfjs object
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item: any) => item.str).join(' ');

      // If regular text extraction fails (e.g. scanned PDF), try OCR
      if (pageText.trim().length < 20) {
        console.log(`Page ${i} has little text (${pageText.length} chars). Attempting OCR...`);
        showToast(`Reading handwriting on page ${i}...`, "success"); // Notify user
        try {
          const viewport = page.getViewport({ scale: 2.0 }); // Increased scale for better accuracy
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          canvas.height = viewport.height;
          canvas.width = viewport.width;

          await page.render({ canvasContext: context!, viewport: viewport }).promise;
          const { data: { text } } = await Tesseract.recognize(canvas, 'eng', {
            logger: m => console.log(m) // Log Tesseract progress
          });
          fullText += text + ' ';
          console.log(`Page ${i} OCR Result: ${text.substring(0, 50)}...`);
        } catch (ocrErr: any) {
          console.error("OCR Failed for page " + i, ocrErr);
          showToast(`OCR failed for page ${i}: ${ocrErr.message}`, "error");
        }
      } else {
        fullText += pageText + ' ';
      }
    }
    console.log("PDF Extraction Success. Length:", fullText.length);
    return fullText;
  } catch (e) {
    console.error("PDF Parse Error", e);
    return '';
  }
};

const calculateJaccardSimilarity = (text1: string, text2: string): number => {
  if (!text1 || !text2) return 0;
  // Simple tokenization by splitting on non-alphanumeric chars
  const tokenize = (text: string) => new Set(text.toLowerCase().split(/\W+/).filter(w => w.length > 2));
  const tokens1 = tokenize(text1);
  const tokens2 = tokenize(text2);

  if (tokens1.size === 0 || tokens2.size === 0) return 0;

  const intersection = new Set([...tokens1].filter(x => tokens2.has(x)));
  const union = new Set([...tokens1, ...tokens2]);

  return (intersection.size / union.size) * 100;
};

// --- Components ---

const ChatWidget = ({ user }: { user: User }) => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<{ from: 'bot' | 'user', text: string }[]>([
    { from: 'bot', text: `Hi ${user.name}! I'm your AssignEase AI assistant. How can I help you today?` }
  ]);
  const [input, setInput] = useState('');

  const faqDatabase = [
    { q: /upload|file|size/i, a: "You can upload files up to 5MB. We support PDF, JPG, and PNG formats. If you are a student, upload from your dashboard under 'To Do'." },
    { q: /grade|score|mark/i, a: "Grades are updated by your teacher. You'll see them in the 'My Submissions' tab once released." },
    { q: /plagiarism|cheat|similarity|copy/i, a: "We use AI to detect similarity. Submissions with >70% similarity to others are flagged." },
    { q: /password|login|account/i, a: "If you forgot your password, please contact the admin or use the 'Forgot Password' link on the login page." },
    { q: /section|class code|join/i, a: "Ask your teacher for the 6-character Class Code to join a new section." },
    { q: /hello|hi+|hey|greet|wassup|good (morning|afternoon|evening)/i, a: "Hello! I am here to help. Ask me about AssignEase features, how to submit assignments, or check your grades." },
    { q: /about|assignease|what is|platform|purpose|software/i, a: "AssignEase is a comprehensive assignment management platform designed to bridge the gap between students and teachers. It features AI-powered plagiarism detection (supporting both digital PDFs and handwriting), secure class management with unique section codes, and a streamlined grading interface." },
    { q: /feature|functionality|can you do|capabilities/i, a: "My key features include: 1. AI Plagiarism Checker (detects copy-pasting & handwriting). 2. Handwriting Recognition (OCR) for image submissions. 3. Section/Class Management with unique join codes. 4. Digital Grading & Feedback. 5. Due Date Management & Late Submission blocking." },
    { q: /teacher|create assignment|create class|section/i, a: "As a Teacher, you can: 1. Create Sections (Classes) to organize students. 2. Post Assignments with descriptions and files. 3. View automated Plagiarism Scores for every submission. 4. Grade submissions and provide feedback." },
    { q: /student|join class|submit|upload/i, a: "As a Student, you can: 1. Join a Class using a 6-character Code. 2. View your 'To Do' list. 3. Upload assignments (PDF, JPG, PNG). 4. View your grades and teacher feedback once released." },
    { q: /plagiarism|cheat|similarity|copy|check/i, a: "Our advanced Plagiarism Checker uses AI to compare your submission against all other students. It extracts text from PDFs and images (using OCR) and calculates a Jaccard Similarity score. >70% similarity is flagged as 'High'. unique submissions are safe!" },
    { q: /ocr|handwriting|image|scan|photo/i, a: "Yes! We support handwritten assignments. When you upload an image (JPG/PNG) or a scanned PDF, our built-in OCR (Optical Character Recognition) engine reads your handwriting and converts it to text for plagiarism checking." },
    { q: /file|format|size|limit|type/i, a: "We support PDF, JPG, and PNG formats. The maximum file size is 5MB to ensure fast processing." },
    { q: /grade|mark|score|result/i, a: "Grades are private. Once your teacher grades your work, it will appear in the 'My Submissions' tab. You'll see a numeric score (0-100) and any personalized feedback." },
    { q: /secure|privacy|data/i, a: "Your data is secure. We use Supabase for authentication and storage. Only you and your teacher can access your submitted files." },

    { q: /bye|goodbye|see you|later|tata/i, a: "Thank you for stopping by! It was a pleasure helping you. I'm always here if you need assistance again. Have a wonderful day! 😊" }
  ];

  const handleSend = () => {
    if (!input.trim()) return;
    const userMsg = input.trim();
    setMessages([...messages, { from: 'user', text: userMsg }]);
    setInput('');

    // Simple mock AI response
    setTimeout(() => {
      // Improved matching: Check regex against the user message
      const match = faqDatabase.find(f => f.q.test(userMsg));

      let response = "I'm not sure about that. Please contact your teacher or admin for more specific help.";
      if (match) {
        response = match.a;
      } else {
        // Fallback for partial matches if regex didn't catch it
        const lowerMsg = userMsg.toLowerCase();
        if (lowerMsg.includes('upload') || lowerMsg.includes('submit')) response = faqDatabase[0].a;
        else if (lowerMsg.includes('grade')) response = faqDatabase[1].a;
      }

      setMessages(prev => [...prev, { from: 'bot', text: response }]);
    }, 600);
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      {open && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 w-80 h-96 rounded-2xl shadow-2xl mb-4 flex flex-col overflow-hidden fade-in">
          <div className="bg-primary-600 p-4 text-white font-bold flex justify-between">
            <span>Help Assistant</span>
            <button onClick={() => setOpen(false)}><Icons.X /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50 dark:bg-slate-950">
            {messages.map((m, i) => (
              <div key={i} className={`p-3 rounded-xl text-sm max-w-[85%] ${m.from === 'bot' ? 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 self-start rounded-tl-none shadow-sm' : 'bg-primary-600 text-white self-end rounded-tr-none ml-auto'}`}>
                {m.text}
              </div>
            ))}
          </div>
          <div className="p-3 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex gap-2">
            <input className="flex-1 text-sm bg-transparent outline-none dark:text-white" placeholder="Type a question..." value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSend()} />
            <button onClick={handleSend} className="text-primary-600 hover:bg-primary-50 p-2 rounded-full"><Icons.Send /></button>
          </div>
        </div>
      )}
      <button onClick={() => setOpen(!open)} className="w-14 h-14 bg-primary-600 hover:bg-primary-700 text-white rounded-full shadow-lg flex items-center justify-center transition-transform hover:scale-105">
        {open ? <Icons.X /> : <Icons.Message />}
      </button>
    </div>
  )
};

// --- Session Manager (Local) ---
// We keep the *active session* in localStorage for persistence across reloads,
// but all *data* comes from Supabase.
const Session = {
  getCurrentUser: (): User | null => JSON.parse(localStorage.getItem('app_currentUser') || 'null'),
  setCurrentUser: (user: User | null) => {
    if (user) localStorage.setItem('app_currentUser', JSON.stringify(user));
    else localStorage.removeItem('app_currentUser');
  },
};

// --- Contexts ---
const ToastContext = createContext<{ showToast: (msg: string, type?: 'success' | 'error') => void }>({ showToast: () => { } });

// --- Components ---

const Toast = () => {
  const [toast, setToast] = useState<{ msg: string, type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => setToast({ msg, type });

  return (
    <ToastContext.Provider value={{ showToast }}>
      {toast && (
        <div className={`fixed bottom-4 right-4 px-6 py-3 rounded-lg shadow-xl text-white slide-in z-50 ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
          {toast.msg}
        </div>
      )}
      <AppContent />
    </ToastContext.Provider>
  );
};

const Button = ({ children, onClick, variant = 'primary', className = '', type = 'button', disabled = false }: any) => {
  const base = "px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed";
  const variants = {
    primary: "bg-primary-600 text-white hover:bg-primary-700 focus:ring-primary-500 shadow-lg shadow-primary-500/30",
    secondary: "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 focus:ring-slate-200",
    danger: "bg-red-500 text-white hover:bg-red-600 focus:ring-red-500",
    ghost: "bg-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800",
    text: "p-0 bg-transparent text-primary-600 hover:text-primary-700 hover:underline"
  };
  return (
    <button type={type} disabled={disabled} onClick={onClick} className={`${base} ${variants[variant as keyof typeof variants]} ${className}`}>
      {children}
    </button>
  );
};

const Input = ({ label, icon, error, ...props }: any) => (
  <div className="mb-4">
    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{label}</label>
    <div className="relative">
      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
        {icon}
      </div>
      <input
        {...props}
        className={`w-full pl-10 pr-3 py-2 bg-white dark:bg-slate-800 border ${error ? 'border-red-500 focus:ring-red-200' : 'border-slate-300 dark:border-slate-700 focus:ring-primary-200'} rounded-lg focus:outline-none focus:ring-2 focus:border-primary-500 transition-all text-slate-900 dark:text-white`}
      />
    </div>
    {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
  </div>
);

const Badge = ({ children, color = 'blue' }: { children: React.ReactNode, color?: 'blue' | 'green' | 'yellow' | 'red' }) => {
  const colors = {
    blue: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    green: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    yellow: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    red: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  };
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[color]}`}>{children}</span>;
}

const applyTheme = (theme: 'light' | 'dark' | 'aurora') => {
  const root = document.documentElement;
  root.classList.remove('light', 'dark', 'aurora');
  if (theme === 'light') root.classList.add('light');
  if (theme === 'dark') root.classList.add('dark');
  if (theme === 'aurora') root.classList.add('dark', 'aurora');
  localStorage.setItem('assignease-theme', theme);
};

const getSavedTheme = (): 'light' | 'dark' | 'aurora' => {
  const saved = localStorage.getItem('assignease-theme');
  return saved === 'dark' || saved === 'aurora' ? saved : 'light';
};

const ThemeToggle = () => {
  const [theme, setTheme] = useState<'light' | 'dark' | 'aurora'>(getSavedTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const cycleTheme = () => {
    const next = theme === 'light' ? 'dark' : theme === 'dark' ? 'aurora' : 'light';
    setTheme(next);
  };

  const label = theme === 'light' ? 'Light theme' : theme === 'dark' ? 'Dark theme' : 'Aurora theme';

  return (
    <button
      onClick={cycleTheme}
      title={`${label} — click to change`}
      aria-label={`${label} — click to change theme`}
      className={`p-2 rounded-full transition-all duration-300 ${
        theme === 'aurora'
          ? 'bg-violet-500/15 text-violet-500 hover:bg-violet-500/25'
          : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400'
      }`}
    >
      {theme === 'light' ? <Icons.Sun /> : theme === 'dark' ? <Icons.Moon /> : <span className="text-lg leading-none">✦</span>}
    </button>
  );
};

const DarkModeToggle = ThemeToggle;

// --- Views ---

const AuthSystem = ({ view, setView, onLogin }: any) => {
  const { showToast } = useContext(ToastContext);
  const [formData, setFormData] = useState({ name: '', email: '', password: '', role: 'student', universityRoll: '', classRoll: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSetupHelp, setShowSetupHelp] = useState(false);

  const reset = () => { setError(''); setShowSetupHelp(false); setFormData({ name: '', email: '', password: '', role: 'student', universityRoll: '', classRoll: '' }); };
  useEffect(() => reset(), [view]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setShowSetupHelp(false);
    setLoading(true);

    try {
      if (view === 'login') {
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
          email: formData.email,
          password: formData.password,
        });
        if (authError) throw authError;

        const { data: profile, error: profileError } = await supabase
          .from('users')
          .select('*')
          .eq('email', formData.email)
          .single();

        if (profileError || !profile) {
          throw new Error("Login successful, but user profile is missing. Please contact support.");
        }
        showToast('Login successful!');
        onLogin(profile);

      } else if (view === 'signup') {
        if (formData.password.length < 6) throw new Error('Password must be at least 6 characters.');
        if (!formData.name) throw new Error('Name is required.');

        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: formData.email,
          password: formData.password,
          options: { data: { full_name: formData.name, role: formData.role } }
        });
        if (authError) throw authError;

        if (authData.user) {
          const newUser = {
            id: authData.user.id,
            name: formData.name,
            email: formData.email,
            role: formData.role,
            joined: new Date().toLocaleDateString(),
            university_roll: formData.role === 'student' ? formData.universityRoll : null,
            class_roll: formData.role === 'student' ? formData.classRoll : null
          };
          const { error: insertError } = await supabase.from('users').insert(newUser);
          if (insertError) {
            if (insertError.code === '23505') throw new Error("Email already registered in system.");
            throw insertError;
          }
          showToast('Account created! Please check your email or log in.');
          setView('login');
        }
      }
    } catch (err: any) {
      const msg = err.message || 'An error occurred.';
      setError(msg);
      if (msg.includes('relation "public.users" does not exist') || msg.includes('Could not find the table') || err.code === '42P01') {
        setError("Database tables not found. Please run the SQL setup script.");
        setShowSetupHelp(true);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
      {showSetupHelp && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-xl p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2"><Icons.Database /> Database Setup Required</h3>
              <button onClick={() => setShowSetupHelp(false)} className="text-slate-500 hover:text-slate-700"><Icons.X /></button>
            </div>
            <p className="text-slate-600 dark:text-slate-300 mb-4">
              Please run this SQL in your <b>Supabase Dashboard  SQL Editor</b> to update the schema and add support for file attachments.
            </p>
            <div className="relative">
              <pre className="bg-slate-100 dark:bg-slate-950 p-4 rounded-lg text-xs font-mono overflow-auto max-h-96 text-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-800">{SETUP_SQL}</pre>
              <button onClick={() => { navigator.clipboard.writeText(SETUP_SQL); showToast('SQL copied to clipboard!'); }} className="absolute top-2 right-2 bg-primary-600 text-white px-3 py-1 rounded text-xs font-bold hover:bg-primary-700">Copy SQL</button>
            </div>
            <div className="mt-6 flex justify-end"><Button onClick={() => setShowSetupHelp(false)}>I've ran the SQL</Button></div>
          </div>
        </div>
      )}
      <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-2xl shadow-xl p-8 fade-in border border-slate-100 dark:border-slate-800">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary-100 dark:bg-primary-900 text-primary-600 dark:text-primary-400 mb-4"><Icons.Logo /></div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{view === 'login' ? 'Welcome to AssignEase' : 'Create an Account'}</h2>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {view === 'signup' && (
            <>
              <Input label="Full Name" icon={<Icons.User />} type="text" placeholder="John Doe" value={formData.name} onChange={(e: any) => setFormData({ ...formData, name: e.target.value })} />
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">I am a...</label>
                <div className="flex gap-4">
                  <button type="button" onClick={() => setFormData({ ...formData, role: 'student' })} className={`flex-1 py-2 rounded-lg border text-sm font-medium ${formData.role === 'student' ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'}`}>Student</button>
                  <button type="button" onClick={() => setFormData({ ...formData, role: 'teacher' })} className={`flex-1 py-2 rounded-lg border text-sm font-medium ${formData.role === 'teacher' ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'}`}>Teacher</button>
                </div>
              </div>
              {formData.role === 'student' && (
                <div className="grid grid-cols-2 gap-4">
                  <Input label="Univ. Roll No" icon={<Icons.Hash />} type="text" placeholder="U-123" value={formData.universityRoll} onChange={(e: any) => setFormData({ ...formData, universityRoll: e.target.value })} />
                  <Input label="Class Roll No" icon={<Icons.Hash />} type="text" placeholder="C-45" value={formData.classRoll} onChange={(e: any) => setFormData({ ...formData, classRoll: e.target.value })} />
                </div>
              )}
            </>
          )}
          <Input label="Email Address" icon={<Icons.Mail />} type="email" placeholder="you@edu.com" value={formData.email} onChange={(e: any) => setFormData({ ...formData, email: e.target.value })} />
          <Input label="Password" icon={<Icons.Lock />} type="password" placeholder="••••••••" value={formData.password} onChange={(e: any) => setFormData({ ...formData, password: e.target.value })} />
          {error && <div className="bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-sm p-3 rounded-lg break-words">{error}{showSetupHelp && <div className="mt-2 text-xs underline cursor-pointer" onClick={() => setShowSetupHelp(true)}>View Setup Instructions</div>}</div>}
          <Button type="submit" disabled={loading} className="w-full">{loading ? 'Processing...' : (view === 'login' ? 'Sign In' : 'Register')}</Button>
        </form>
        <div className="mt-6 text-center text-sm text-slate-500">
          {view === 'login' ? <p>New here? <span className="text-primary-600 cursor-pointer hover:underline" onClick={() => setView('signup')}>Create account</span></p> : <p>Already joined? <span className="text-primary-600 cursor-pointer hover:underline" onClick={() => setView('login')}>Log in</span></p>}
        </div>
      </div>
    </div>
  );
};

// --- Teacher Dashboard ---

const TeacherDashboard = ({ user }: { user: User }) => {
  const { showToast } = useContext(ToastContext);
  const [tab, setTab] = useState<'sections' | 'assignments' | 'inbox'>('sections');

  // Data State
  const [sections, setSections] = useState<Section[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [studentsCache, setStudentsCache] = useState<Record<string, User>>({});

  // Forms State
  const [newSectionName, setNewSectionName] = useState('');
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [newAssign, setNewAssign] = useState<{ title: string; desc: string; subject: string; date: string; sectionCode: string; file: File | null }>({ title: '', desc: '', subject: '', date: '', sectionCode: '', file: null });
  const [loading, setLoading] = useState(false);

  // Grading Modal
  const [gradingSub, setGradingSub] = useState<Submission | null>(null);
  const [gradeInput, setGradeInput] = useState('');
  const [feedbackInput, setFeedbackInput] = useState('');
  const [plagiarismScore, setPlagiarismScore] = useState<number | null>(null);
  const [showSetupHelp, setShowSetupHelp] = useState(false);

  const refreshData = async () => {
    setLoading(true);
    try {
      const { data: secData } = await supabase.from('sections').select('*').eq('teacher_email', user.email);
      setSections(secData || []);
      const { data: assignData } = await supabase.from('assignments').select('*').eq('created_by', user.email);
      setAssignments(assignData || []);
      if (assignData && assignData.length > 0) {
        const assignIds = assignData.map(a => a.id);
        const { data: subData } = await supabase.from('submissions').select('*').in('assignment_id', assignIds);
        setSubmissions(subData || []);
        if (subData && subData.length > 0) {
          const emails = [...new Set(subData.map((s: Submission) => s.student_email))];
          const { data: userData } = await supabase.from('users').select('*').in('email', emails);
          const cache: Record<string, User> = {};
          userData?.forEach((u: User) => { cache[u.email] = u; });
          setStudentsCache(cache);
        }
      }
    } catch (e) { showToast("Error loading data", "error"); } finally { setLoading(false); }
  };

  useEffect(() => { refreshData(); }, [user.email]);

  const createSection = async (e: FormEvent) => {
    e.preventDefault();
    if (!newSectionName) return;
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const { error } = await supabase.from('sections').insert({ name: newSectionName, code, teacher_email: user.email, created: new Date().toISOString() });
    if (error) showToast("Failed to create section", "error"); else { setNewSectionName(''); showToast(`Section "${newSectionName}" created! Code: ${code}`); refreshData(); }
  };

  const createAssignment = async (e: FormEvent) => {
    e.preventDefault();

    // Validation
    if (!newAssign.title || !newAssign.subject || !newAssign.sectionCode || !newAssign.date) {
      return showToast("Please fill in all fields (Title, Subject, Section, Due Date)", "error");
    }

    let attachmentUrl = null;
    if (newAssign.file) {
      if (newAssign.file.size > 5 * 1024 * 1024) return showToast('File too large (Max 5MB)', 'error');
      const fileExt = newAssign.file.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
      const { data, error } = await supabase.storage.from('assignments').upload(fileName, newAssign.file);
      if (error) {
        console.error("Storage upload error:", error);
        return showToast('File upload failed. Ensure "assignments" bucket exists.', 'error');
      }
      const { data: { publicUrl } } = supabase.storage.from('assignments').getPublicUrl(fileName);
      attachmentUrl = publicUrl;
    }

    const { error } = await supabase.from('assignments').insert({
      title: newAssign.title,
      description: newAssign.desc,
      subject: newAssign.subject,
      section_code: newAssign.sectionCode,
      due_date: newAssign.date,
      created_by: user.email,
      attachment_url: attachmentUrl
    });

    if (error) {
      console.error("Assignment creation error:", error);
      showToast(`Failed to create assignment: ${error.message || 'Unknown error'}`, "error");
      if (error.message && (error.message.includes('column') || error.message.includes('relation'))) {
        setShowSetupHelp(true);
      }
    } else {
      setShowAssignModal(false);
      showToast('Assignment published successfully!');
      refreshData();
      // Reset form
      setNewAssign({ title: '', desc: '', subject: '', date: '', sectionCode: '', file: null });
    }
  };

  const calculatePlagiarism = (currentSub: Submission) => {
    console.log("Checking Plagiarism for:", currentSub.id);
    console.log("Current Text Length:", currentSub.extracted_text?.length || 0);

    if (!currentSub.extracted_text) return 0;
    // Get all other submissions for this assignment
    const others = submissions.filter(s => s.assignment_id === currentSub.assignment_id && s.id !== currentSub.id);
    console.log("Found comparison candidates:", others.length);

    if (others.length === 0) return 0;
    let maxSimilarity = 0;
    for (const other of others) {
      if (other.extracted_text) {
        const score = calculateJaccardSimilarity(currentSub.extracted_text, other.extracted_text);
        console.log(`Score vs ${other.id}: ${score}%`);
        if (score > maxSimilarity) maxSimilarity = score;
      } else {
        console.log(`Skipping ${other.id} - No extracted text`);
      }
    }
    return Math.round(maxSimilarity);
  };

  const openGrading = (sub: Submission) => {
    setGradingSub(sub);
    setGradeInput(sub.grade?.toString() || '');
    setFeedbackInput(sub.feedback || '');
    setPlagiarismScore(calculatePlagiarism(sub));
  };

  const handleGrade = async (e: FormEvent) => {
    e.preventDefault();
    if (gradingSub) {
      const { error } = await supabase.from('submissions').update({ status: 'graded', grade: Number(gradeInput), feedback: feedbackInput }).eq('id', gradingSub.id);
      if (error) showToast("Failed to grade", "error"); else { setGradingSub(null); showToast('Submission graded!'); refreshData(); }
    }
  }

  const handleDeleteAssignment = async (id: string) => {
    if (confirm('Delete this assignment?')) { const { error } = await supabase.from('assignments').delete().eq('id', id); if (!error) { refreshData(); showToast('Assignment deleted.'); } else showToast("Failed to delete", "error"); }
  }

  return (
    <div className="space-y-6">
      {showSetupHelp && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-xl p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2"><Icons.Database /> Database Setup Required</h3>
              <button onClick={() => setShowSetupHelp(false)} className="text-slate-500 hover:text-slate-700"><Icons.X /></button>
            </div>
            <p className="text-slate-600 dark:text-slate-300 mb-4">
              It looks like your database needs an update. Please run this SQL in your <b>Supabase Dashboard {'>'} SQL Editor</b>.
            </p>
            <div className="relative">
              <pre className="bg-slate-100 dark:bg-slate-950 p-4 rounded-lg text-xs font-mono overflow-auto max-h-96 text-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-800">{SETUP_SQL}</pre>
              <button onClick={() => { navigator.clipboard.writeText(SETUP_SQL); showToast('SQL copied to clipboard!'); }} className="absolute top-2 right-2 bg-primary-600 text-white px-3 py-1 rounded text-xs font-bold hover:bg-primary-700">Copy SQL</button>
            </div>
            <div className="mt-6 flex justify-end"><Button onClick={() => setShowSetupHelp(false)}>I've ran the SQL</Button></div>
          </div>
        </div>
      )}
      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-700 pb-2">
        {['sections', 'assignments', 'inbox'].map((t) => (
          <button key={t} onClick={() => setTab(t as any)} className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${tab === t ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>{t}</button>
        ))}
        {loading && <span className="text-xs text-slate-400 flex items-center ml-auto">Syncing...</span>}
      </div>

      {tab === 'sections' && (
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm h-fit">
            <h3 className="text-lg font-bold mb-4">Create New Section</h3>
            <form onSubmit={createSection} className="flex gap-2">
              <input className="flex-1 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-transparent focus:ring-2 focus:ring-primary-500 outline-none" placeholder="Section Name (e.g. CS-101 A)" value={newSectionName} onChange={e => setNewSectionName(e.target.value)} />
              <Button type="submit"><Icons.Plus /> Create</Button>
            </form>
          </div>
          <div className="space-y-4">
            {sections.length === 0 && !loading && <p className="text-slate-500 italic">No sections created yet.</p>}
            {sections.map(s => (
              <div key={s.id} className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 flex justify-between items-center shadow-sm">
                <div><h4 className="font-bold text-lg">{s.name}</h4><p className="text-sm text-slate-500">Code: <span className="font-mono bg-slate-100 dark:bg-slate-700 px-1 rounded select-all">{s.code}</span></p></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'assignments' && (
        <div>
          <div className="flex justify-between items-center mb-6"><h3 className="text-xl font-bold">Your Assignments</h3><Button onClick={() => setShowAssignModal(true)}><Icons.Plus /> New Assignment</Button></div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {assignments.map(a => (
              <div key={a.id} className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm relative group">
                <div className="flex justify-between items-start mb-2">
                  <Badge color="blue">{sections.find(s => s.code === a.section_code)?.name || a.section_code}</Badge>
                  <button onClick={() => handleDeleteAssignment(a.id)} className="text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"><Icons.Trash /></button>
                </div>
                <h4 className="font-bold text-lg mb-1">{a.title}</h4>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 line-clamp-2">{a.description}</p>
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2 text-xs text-slate-500"><Icons.Clock /> Due: {new Date(a.due_date).toLocaleDateString()}</div>
                  {a.attachment_url && <a href={a.attachment_url} target="_blank" className="text-xs text-primary-600 hover:underline flex items-center gap-1"><Icons.Paperclip /> Attachment</a>}
                </div>
              </div>
            ))}
          </div>
          {showAssignModal && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 backdrop-blur-sm fade-in">
              <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-xl p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
                <h3 className="text-xl font-bold mb-4">Create Assignment</h3>
                <form onSubmit={createAssignment} className="space-y-4">
                  <Input label="Title" value={newAssign.title} onChange={(e: any) => setNewAssign({ ...newAssign, title: e.target.value })} />
                  <Input label="Subject" value={newAssign.subject} onChange={(e: any) => setNewAssign({ ...newAssign, subject: e.target.value })} />
                  <div>
                    <label className="text-sm font-medium block mb-1">Section</label>
                    <select className="w-full p-2 border rounded-lg bg-transparent dark:border-slate-700" value={newAssign.sectionCode} onChange={e => setNewAssign({ ...newAssign, sectionCode: e.target.value })}>
                      <option value="">Select Section</option>
                      {sections.map(s => <option key={s.id} value={s.code}>{s.name}</option>)}
                    </select>
                  </div>
                  <div><label className="text-sm font-medium block mb-1">Due Date</label><input type="datetime-local" className="w-full p-2 border rounded-lg bg-transparent dark:border-slate-700 dark:text-white" onChange={e => setNewAssign({ ...newAssign, date: e.target.value })} /></div>
                  <div><label className="text-sm font-medium block mb-1">Description</label><textarea className="w-full p-2 border rounded-lg bg-transparent dark:border-slate-700 dark:text-white h-24" onChange={e => setNewAssign({ ...newAssign, desc: e.target.value })} /></div>
                  <div>
                    <label className="text-sm font-medium block mb-1">Attachment (PDF/IMG, Max 5MB)</label>
                    <input type="file" accept=".pdf,.png,.jpg,.jpeg" className="w-full text-sm" onChange={e => setNewAssign({ ...newAssign, file: e.target.files ? e.target.files[0] : null })} />
                  </div>
                  <div className="flex justify-end gap-2 mt-4"><Button variant="ghost" onClick={() => setShowAssignModal(false)}>Cancel</Button><Button type="submit">Publish</Button></div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'inbox' && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
          <table className="w-full text-left">
            <thead className="bg-slate-50 dark:bg-slate-700/50 text-xs uppercase text-slate-500">
              <tr><th className="p-4">Student</th><th className="p-4">Assignment</th><th className="p-4">Submitted</th><th className="p-4">Grade</th><th className="p-4">Status</th><th className="p-4 text-right">Action</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {submissions.map(sub => {
                const student = studentsCache[sub.student_email];
                const assignment = assignments.find(a => a.id === sub.assignment_id);
                return (
                  <tr key={sub.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                    <td className="p-4"><div className="font-medium">{student?.name || sub.student_email}</div><div className="text-xs text-slate-500">{student?.university_roll} | {student?.class_roll}</div></td>
                    <td className="p-4 text-sm">{assignment?.title}</td>
                    <td className="p-4 text-sm text-slate-500">{new Date(sub.submitted_at).toLocaleDateString()}</td>
                    <td className="p-4 font-bold text-slate-700 dark:text-slate-300">{sub.grade ?? '-'}</td>
                    <td className="p-4"><Badge color={sub.status === 'graded' ? 'green' : 'yellow'}>{sub.status}</Badge></td>
                    <td className="p-4 text-right"><Button variant="secondary" className="px-3 py-1 text-xs" onClick={() => openGrading(sub)}>Evaluate</Button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {gradingSub && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 backdrop-blur-sm fade-in">
              <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-xl p-6 shadow-2xl">
                <h3 className="text-xl font-bold mb-4">Evaluate Submission</h3>
                <p className="text-sm text-slate-500 mb-2">File: <a href={gradingSub.file_url} target="_blank" className="text-blue-500 hover:underline break-all">{gradingSub.file_url}</a></p>

                {plagiarismScore !== null && (
                  <div className={`mb-4 p-3 rounded-lg text-sm border ${plagiarismScore > 70 ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-700'}`}>
                    <div className="flex items-center gap-2 font-bold"><Icons.Alert /> AI Plagiarism Score: {plagiarismScore}%</div>
                    <p className="text-xs mt-1">{plagiarismScore > 70 ? 'High similarity detected. Please review carefully.' : 'Low similarity detected.'}</p>
                  </div>
                )}

                <form onSubmit={handleGrade} className="space-y-4">
                  <Input label="Numeric Grade (0-100)" type="number" value={gradeInput} onChange={(e: any) => setGradeInput(e.target.value)} />
                  <div><label className="text-sm font-medium block mb-1">Feedback / Remarks</label><textarea className="w-full p-2 border rounded-lg bg-transparent dark:border-slate-700 dark:text-white h-24" value={feedbackInput} onChange={e => setFeedbackInput(e.target.value)} placeholder="Good job, but..." /></div>

                  <div className="text-xs text-slate-400 bg-slate-100 dark:bg-slate-800 p-2 rounded">
                    <strong>Debug Info:</strong><br />
                    Extracted Text Length: {gradingSub.extracted_text ? gradingSub.extracted_text.length : 0} chars<br />
                    Comparisons Possible: {submissions.filter(s => s.assignment_id === gradingSub.assignment_id && s.id !== gradingSub.id).length}
                  </div>

                  <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setGradingSub(null)}>Cancel</Button><Button type="submit">Submit Grade</Button></div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// --- Student Dashboard ---

const StudentDashboard = ({ user }: { user: User }) => {
  const { showToast } = useContext(ToastContext);
  const [tab, setTab] = useState<'assignments' | 'history'>('assignments');
  const [joinCode, setJoinCode] = useState('');
  const [myAssignments, setMyAssignments] = useState<Assignment[]>([]);
  const [mySubmissions, setMySubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);

  const refreshData = async () => {
    setLoading(true);
    try {
      const { data: enrollments } = await supabase.from('enrollments').select('*').eq('student_email', user.email);
      const codes = enrollments?.map((e: any) => e.section_code) || [];
      if (codes.length > 0) {
        const { data: assignData } = await supabase.from('assignments').select('*').in('section_code', codes);
        const sorted = (assignData || []).sort((a: Assignment, b: Assignment) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());
        setMyAssignments(sorted);
      } else { setMyAssignments([]); }
      const { data: subData } = await supabase.from('submissions').select('*').eq('student_email', user.email);
      setMySubmissions(subData || []);
    } catch (e) { showToast("Error loading data", "error"); } finally { setLoading(false); }
  };

  useEffect(() => { refreshData(); }, [user.email]);

  const handleJoin = async (e: FormEvent) => {
    e.preventDefault();
    if (!joinCode) return;
    const { data: section } = await supabase.from('sections').select('*').eq('code', joinCode.toUpperCase()).single();
    if (section) {
      const { data: existing } = await supabase.from('enrollments').select('*').eq('student_email', user.email).eq('section_code', section.code).single();
      if (existing) { showToast("Already joined!", "error"); return; }
      await supabase.from('enrollments').insert({ student_email: user.email, section_code: section.code });
      showToast(`Joined section: ${section.name}`); setJoinCode(''); refreshData();
    } else { showToast('Invalid section code', 'error'); }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, assign: Assignment) => {
    if (!e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];

    // Validation
    const isLate = new Date() > new Date(assign.due_date);
    if (isLate) return showToast("Deadline passed! Cannot submit.", "error");
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)) return showToast("Invalid format. Use PDF, JPG, PNG.", "error");
    if (file.size > 5 * 1024 * 1024) return showToast("File too large. Max 5MB.", "error");

    setUploading(assign.id);
    try {
      // AI Text Extraction for Plagiarism Check
      let extractedText = '';
      if (file.type === 'application/pdf') {
        extractedText = await extractTextFromPDF(file, showToast);
      } else if (file.type.startsWith('image/')) {
        showToast("Analyzing handwriting... this may take a moment.", "success");
        const { data: { text } } = await Tesseract.recognize(file, 'eng');
        extractedText = text;
        console.log("OCR Success. Extracted:", extractedText.length, "chars");
      }

      // Upload to Storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}_${assign.id}_${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from('submissions').upload(fileName, file);
      if (uploadError) throw new Error("Upload failed. Ensure 'submissions' bucket exists.");

      const { data: { publicUrl } } = supabase.storage.from('submissions').getPublicUrl(fileName);

      // Save to DB
      const submissionData = {
        assignment_id: assign.id,
        student_email: user.email,
        file_url: publicUrl,
        submitted_at: new Date().toISOString(),
        status: 'pending',
        extracted_text: extractedText
      };

      const existingSub = mySubmissions.find(s => s.assignment_id === assign.id);
      if (existingSub) {
        await supabase.from('submissions').update(submissionData).eq('id', existingSub.id);
        showToast("Work Resubmitted!");
      } else {
        await supabase.from('submissions').insert(submissionData);
        showToast("Work Submitted!");
      }
      refreshData();
    } catch (err: any) {
      showToast(err.message || "Error submitting work", "error");
    } finally {
      setUploading(null);
    }
  };

  const handleDeleteSubmission = async (id: string) => {
    if (confirm('Delete this submission?')) { const { error } = await supabase.from('submissions').delete().eq('id', id); if (!error) { showToast('Submission deleted'); refreshData(); } else { showToast('Error deleting', 'error'); } }
  };

  const getTimeLeft = (dateStr: string) => {
    const diff = new Date(dateStr).getTime() - new Date().getTime();
    if (diff < 0) return "Expired";
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    return `${days}d ${hours}h left`;
  };

  return (
    <div className="space-y-6">
      <div className="bg-indigo-600 dark:bg-indigo-900 rounded-xl p-6 text-white flex flex-col md:flex-row items-center justify-between gap-4 shadow-lg">
        <div><h3 className="font-bold text-lg">Join a new Class</h3><p className="text-indigo-200 text-sm">Enter the code provided by your teacher.</p></div>
        <form onSubmit={handleJoin} className="flex gap-2 w-full md:w-auto"><input className="px-4 py-2 rounded-lg text-slate-900 focus:outline-none w-full md:w-48" placeholder="Enter Code (e.g. A1B2C3)" value={joinCode} onChange={e => setJoinCode(e.target.value)} /><button type="submit" className="bg-white text-indigo-600 px-4 py-2 rounded-lg font-bold hover:bg-indigo-50">Join</button></form>
      </div>
      <div className="flex gap-4 border-b border-slate-200 dark:border-slate-700 pb-2">
        <button onClick={() => setTab('assignments')} className={`pb-2 text-sm font-bold border-b-2 transition-colors ${tab === 'assignments' ? 'border-primary-500 text-primary-600' : 'border-transparent text-slate-500'}`}>To Do</button>
        <button onClick={() => setTab('history')} className={`pb-2 text-sm font-bold border-b-2 transition-colors ${tab === 'history' ? 'border-primary-500 text-primary-600' : 'border-transparent text-slate-500'}`}>My Submissions</button>
        {loading && <span className="text-xs text-slate-400 flex items-center ml-auto">Syncing...</span>}
      </div>
      {tab === 'assignments' && (
        <div className="grid md:grid-cols-2 gap-4">
          {myAssignments.length === 0 && !loading && <p className="text-slate-500 col-span-2 text-center py-10">No pending assignments! 🎉</p>}
          {myAssignments.map(a => {
            const submission = mySubmissions.find(s => s.assignment_id === a.id);
            const isLate = new Date() > new Date(a.due_date);
            return (
              <div key={a.id} className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col">
                <div className="flex justify-between mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">{a.subject}</span>
                  <span className={`text-xs font-bold px-2 py-1 rounded ${isLate ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>{getTimeLeft(a.due_date)}</span>
                </div>
                <h4 className="font-bold text-lg mb-2">{a.title}</h4>
                <p className="text-slate-500 text-sm mb-4 flex-1">{a.description}</p>
                {a.attachment_url && <a href={a.attachment_url} target="_blank" className="mb-4 text-xs bg-slate-100 dark:bg-slate-700 p-2 rounded flex items-center gap-2 hover:bg-slate-200"><Icons.Paperclip /> View Attachment</a>}
                <div className="pt-4 border-t border-slate-100 dark:border-slate-700 flex justify-between items-center">
                  {submission ? <div className="flex items-center gap-2 text-green-600 text-sm font-medium"><Icons.Check /> Submitted</div> : <span className="text-sm text-slate-400">Not submitted</span>}
                  <div className="relative">
                    <input type="file" id={`file-${a.id}`} className="hidden" onChange={(e) => handleFileUpload(e, a)} disabled={uploading === a.id || (isLate && !submission)} accept=".pdf,.jpg,.png" />
                    <label htmlFor={`file-${a.id}`} className={`cursor-pointer px-4 py-2 rounded-lg text-sm font-bold transition-all ${uploading === a.id ? 'bg-gray-400 cursor-not-allowed text-white' : submission ? 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50' : 'bg-primary-600 text-white hover:bg-primary-700'}`}>
                      {uploading === a.id ? 'Uploading...' : submission ? 'Resubmit Work' : 'Upload Work'}
                    </label>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
      {tab === 'history' && (
        <div className="space-y-4">
          {mySubmissions.map(s => {
            const assign = myAssignments.find(a => a.id === s.assignment_id) || { title: 'Unknown Assignment' };
            return (
              <div key={s.id} className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                <div><h4 className="font-bold">{assign.title}</h4><p className="text-xs text-slate-500">Submitted: {new Date(s.submitted_at).toLocaleString()}</p></div>
                <div className="flex items-center gap-4">
                  {s.feedback && <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg max-w-xs text-sm"><span className="font-bold text-blue-600 block text-xs mb-1">Teacher Remarks:</span>"{s.feedback}"</div>}
                  {s.grade != null && <span className="font-bold text-slate-900 dark:text-white">Grade: {s.grade}</span>}
                  <Badge color={s.status === 'graded' ? 'green' : 'yellow'}>{s.status}</Badge>
                  {s.status === 'pending' && <Button variant="danger" className="px-2 py-1 text-xs" onClick={() => handleDeleteSubmission(s.id)}><Icons.Trash /> Unsubmit</Button>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  );
};

// --- App Shell & Routing ---

const AppContent = () => {
  const [view, setView] = useState<ViewState>('landing');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('admin') === 'true') { setView('admin-login'); return; }
    const stored = Session.getCurrentUser();
    if (stored) { setCurrentUser(stored); setView('dashboard'); }
  }, []);

  const handleLogin = (user: User) => { Session.setCurrentUser(user); setCurrentUser(user); setView('dashboard'); };
  const handleLogout = () => { Session.setCurrentUser(null); setCurrentUser(null); setView('landing'); };

  const [showDevelopers, setShowDevelopers] = useState(false);

  const developers = [
    {
      name: 'Yash Pratap Singh',
      role: 'UI/UX & Frontend Developer',
      description: 'Passionate about building smart solutions.',
      image: '/image/yash.jpeg',
      instagram: 'https://www.instagram.com/its_thakur.1221?igsh=a3FnODJ6MmxvZXhz',
      linkedin: 'https://www.linkedin.com/in/yash-pratap-singh-7813a9363?utm_source=share_via&utm_content=profile&utm_medium=member_android',
      github: 'https://github.com/Yashprataps7822'
    },
    {
      name: 'Jaya Durgvanshi',
      role: 'Lead & Backend Developer',
      description: 'Build scalable APIs & Database Systems.',
      image: '/image/jaya.jpeg',
      instagram: 'https://www.instagram.com/_ji_as_ingh?igsh=NnBtbDZ4Y211cmMw',
      linkedin: 'https://www.linkedin.com/in/jaya-durgvanshi-509920363?utm_source=share_via&utm_content=profile&utm_medium=member_android',
      github: 'https://github.com/jaya105'
    }
  ];

  const LandingPage = () => (
    <div className="landing-page min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-white flex flex-col font-display">
      <nav className="flex items-center justify-between px-6 py-5 max-w-7xl w-full mx-auto">
        <div className="flex items-center gap-2 font-bold text-xl"><Icons.Logo /><span>Assign<span className="text-primary-600">Ease</span></span></div>
        <div className="flex gap-2 sm:gap-4 items-center"><DarkModeToggle /><Button variant="ghost" onClick={() => setView('login')}>Log in</Button><Button onClick={() => setView('signup')}>Get Started</Button></div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 pt-20 md:pt-28 pb-16 text-center fade-in flex-1">
        <div className="inline-flex items-center gap-2 px-4 py-2 mb-7 rounded-full border border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 text-sm font-semibold"><span className="w-2 h-2 rounded-full bg-primary-500 animate-pulse"></span>Smarter classrooms. Simpler assignments.</div>
        <h1 className="text-5xl md:text-7xl lg:text-8xl font-extrabold mb-7 tracking-[-0.04em] leading-[0.98]">Classroom management <br /><span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-600 via-cyan-500 to-violet-500">simplified.</span></h1>
        <p className="text-lg md:text-xl text-slate-500 dark:text-slate-300 mb-10 max-w-2xl mx-auto leading-relaxed">For Teachers & Students. Create assignments, submit work, and grade in real-time — all in one focused workspace.</p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center"><Button className="px-8 py-3 text-lg" onClick={() => setView('signup')}>I'm a Student</Button><Button variant="secondary" className="px-8 py-3 text-lg" onClick={() => setView('signup')}>I'm a Teacher</Button></div>
      </main>

      <footer className="border-t border-slate-200/80 dark:border-slate-800/80">
        <div className="max-w-7xl mx-auto px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">© {new Date().getFullYear()} AssignEase. Built for better classrooms.</p>
          <button onClick={() => setShowDevelopers(true)} className="group inline-flex items-center gap-2 text-sm font-semibold text-slate-500 dark:text-slate-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"><span className="w-7 h-7 rounded-full border border-slate-300 dark:border-slate-700 flex items-center justify-center group-hover:border-primary-400 transition-colors">⌘</span>Developers</button>
        </div>
      </footer>

      {showDevelopers && (
        <div className="fixed inset-0 z-[100] bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-5" onClick={() => setShowDevelopers(false)}>
          <div className="w-full max-w-4xl rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl p-6 md:p-8" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-7">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary-600">AssignEase Team</p>
                <h2 className="text-3xl md:text-4xl font-extrabold mt-1">Meet the developers.</h2>
              </div>
              <button onClick={() => setShowDevelopers(false)} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"><Icons.X /></button>
            </div>
            <div className="grid md:grid-cols-2 gap-5 max-w-3xl mx-auto">
              {developers.map(dev => (
                <div key={dev.name} className="group flex flex-col justify-between rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-5 text-center hover:-translate-y-1 transition-all duration-300">
                  <div>
                    <img src={dev.image} alt={dev.name} className="w-24 h-24 mx-auto rounded-full object-cover ring-4 ring-white dark:ring-slate-900 shadow-lg mb-4" />
                    <h3 className="font-bold text-lg">{dev.name}</h3>
                    <p className="text-sm font-semibold text-primary-600 dark:text-primary-400 mt-1">{dev.role}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 mb-5">{dev.description}</p>
                  </div>
                  <div className="flex flex-col gap-2 mt-auto">
                    <a href={dev.linkedin} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 w-full px-4 py-2 rounded-xl bg-[#0077b5] text-white font-semibold hover:scale-[1.02] transition-transform">LinkedIn ↗</a>
                    <a href={dev.github} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 w-full px-4 py-2 rounded-xl bg-slate-900 dark:bg-white dark:text-slate-900 text-white font-semibold hover:scale-[1.02] transition-transform">GitHub ↗</a>
                    <a href={dev.instagram} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 w-full px-4 py-2 rounded-xl bg-gradient-to-r from-pink-500 via-red-500 to-yellow-500 text-white font-semibold hover:scale-[1.02] transition-transform">Instagram ↗</a>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-center text-xs text-slate-400 mt-6">Tap any button to open the developer's profile.</p>
          </div>
        </div>
      )}
    </div>
  );

  const DashboardLayout = () => (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden">
      {sidebarOpen && <div className="fixed inset-0 bg-black/50 z-20 md:hidden" onClick={() => setSidebarOpen(false)} />}
      <aside className={`fixed md:relative z-30 w-64 h-full bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 transform transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'} flex flex-col`}>
        <div className="p-6 flex items-center justify-between"><div className="flex items-center gap-2 font-bold text-xl text-slate-900 dark:text-white"><Icons.Logo /> <span>AssignEase</span></div><button className="md:hidden" onClick={() => setSidebarOpen(false)}><Icons.X /></button></div>
        <div className="px-6 pb-6"><div className="bg-slate-100 dark:bg-slate-800 p-3 rounded-xl flex items-center gap-3"><div className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900 text-primary-600 flex items-center justify-center font-bold">{currentUser?.name.charAt(0)}</div><div className="overflow-hidden"><p className="font-bold text-sm truncate dark:text-white">{currentUser?.name}</p><p className="text-xs text-slate-500 uppercase">{currentUser?.role}</p></div></div></div>
        <nav className="flex-1 px-4 space-y-1"><div className="px-4 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider">Menu</div><button className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400"><Icons.Book /> Dashboard</button></nav>
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 space-y-2"><div className="flex justify-between items-center px-4"><span className="text-xs text-slate-500">Theme</span><DarkModeToggle /></div><button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-red-600 transition-colors"><Icons.LogOut /> Logout</button></div>
      </aside>
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-4 flex justify-between items-center md:hidden"><div className="font-bold text-lg">Dashboard</div><button onClick={() => setSidebarOpen(true)}><Icons.Menu /></button></header>
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-5xl mx-auto fade-in">
            {currentUser?.role === 'teacher' ? <TeacherDashboard user={currentUser} /> : <StudentDashboard user={currentUser} />}
          </div>
          {currentUser && <ChatWidget user={currentUser} />}
        </main>
      </div>
    </div>
  );

  const AdminPanel = () => {
    const [users, setUsers] = useState<User[]>([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(false);
    useEffect(() => { setLoading(true); supabase.from('users').select('*').then(({ data }) => { setUsers(data || []); setLoading(false); }); }, []);
    const handleDelete = async (id: string) => { if (confirm('Delete User?')) { await supabase.from('users').delete().eq('id', id); setUsers(users.filter(u => u.id !== id)); } }
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-slate-950 p-8"><div className="max-w-6xl mx-auto"><div className="flex justify-between items-center mb-8"><h1 className="text-3xl font-bold dark:text-white">Admin Console</h1><Button variant="secondary" onClick={() => setView('landing')}>Logout</Button></div><div className="bg-white dark:bg-slate-900 rounded-xl shadow border border-slate-200 dark:border-slate-800 overflow-hidden"><div className="p-4 border-b border-slate-200 dark:border-slate-800"><input className="w-full p-2 border rounded dark:bg-slate-800 dark:border-slate-700 dark:text-white" placeholder="Search users..." value={search} onChange={e => setSearch(e.target.value)} /></div><table className="w-full text-left"><thead className="bg-slate-50 dark:bg-slate-800 text-xs uppercase text-slate-500"><tr><th className="p-4">Name</th><th className="p-4">Role</th><th className="p-4">Email</th><th className="p-4 text-right">Action</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{loading && <tr><td colSpan={4} className="p-4 text-center">Loading...</td></tr>}{users.filter(u => u.name.toLowerCase().includes(search.toLowerCase())).map(u => (<tr key={u.id} className="dark:text-slate-300"><td className="p-4 font-medium">{u.name}</td><td className="p-4"><Badge color={u.role === 'teacher' ? 'blue' : 'green'}>{u.role}</Badge></td><td className="p-4">{u.email}</td><td className="p-4 text-right"><button onClick={() => handleDelete(u.id)} className="text-red-500 hover:underline">Delete</button></td></tr>))}</tbody></table></div></div></div>
    );
  };

  const AdminLogin = () => {
    const [creds, setCreds] = useState({ u: '', p: '' });
    return (
      <div className="h-screen flex items-center justify-center bg-slate-900"><div className="bg-slate-800 p-8 rounded-xl shadow-xl w-96 text-white"><h2 className="text-xl font-bold mb-4">Admin</h2><input className="w-full mb-2 p-2 bg-slate-700 rounded" placeholder="User" value={creds.u} onChange={e => setCreds({ ...creds, u: e.target.value })} /><input className="w-full mb-4 p-2 bg-slate-700 rounded" type="password" placeholder="Pass" value={creds.p} onChange={e => setCreds({ ...creds, p: e.target.value })} /><Button className="w-full" onClick={() => { if (creds.u === 'admin' && creds.p === 'admin123') setView('admin-dashboard'); }}>Login</Button></div></div>
    )
  };

  if (view === 'login' || view === 'signup') return <AuthSystem view={view} setView={setView} onLogin={handleLogin} />;
  if (view === 'dashboard' && currentUser) return <DashboardLayout />;
  if (view === 'admin-login') return <AdminLogin />;
  if (view === 'admin-dashboard') return <AdminPanel />;
  return <LandingPage />;
};

const App = () => <Toast />;
const root = createRoot(document.getElementById("root")!);
root.render(<App />);