import React, { useState, useMemo, useRef, useEffect } from 'react';
import { collection, doc, getDoc, getDocs, onSnapshot, runTransaction, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { firebaseAuth, firestoreDb } from './firebase';
import {
  Users,
  IndianRupee,
  Calendar,
  Search,
  Plus,
  Contact,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileSpreadsheet,
  Printer,
  Share2,
  Phone,
  ShieldCheck,
  ChevronRight,
  TrendingUp,
  CreditCard,
  Building,
  RefreshCw,
  X,
  FileText,
  UserCheck,
  History,
  Check,
  Download,
  Send,
  Eye,
  SlidersHorizontal,
  Home,
  Receipt,
  BarChart3,
  LogOut,
  Layers,
  Sparkles,
  PieChart,
  Wallet,
  Trash2
} from 'lucide-react';

// --- CURRENCY & TIMEZONE UTILS (Asia/Kolkata & INR) ---
const formatINR = (val) => {
  const num = Number(val) || 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(num);
};

const getKolkataDateString = (dateObj = new Date()) => {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(dateObj); // YYYY-MM-DD
};

const getDialablePhone = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  return phone;
};

const addMonthsToDate = (dateString, months) => {
  const [year, month, day] = dateString.split('-').map(Number);
  const next = new Date(year, month - 1 + months, 1);
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(day, lastDay));
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
};

const getMemberTotalValue = (member, group) =>
  Number(member.chitTotalAmount ?? group?.totalValue ?? 0);

const getMemberDuration = (member, group) =>
  Number(member.durationMonths ?? group?.totalMonths ?? 0);

const getMemberMonthlyAmount = (member, group) =>
  Number(member.monthlyAmount ?? (
    getMemberDuration(member, group) > 0
      ? getMemberTotalValue(member, group) / getMemberDuration(member, group)
      : 0
  ));

const getMemberStartDate = (member) => member.startDate || member.joinDate;

const endDateForDuration = (startDate, duration) => {
  if (!startDate || !Number.isInteger(duration) || duration <= 0) return '';
  const [year, month] = startDate.split('-').map(Number);
  if (!Number.isInteger(year) || !Number.isInteger(month)) return '';
  const lastInstallmentMonth = new Date(year, month - 1 + duration, 0);
  return `${lastInstallmentMonth.getFullYear()}-${String(lastInstallmentMonth.getMonth() + 1).padStart(2, '0')}-${String(lastInstallmentMonth.getDate()).padStart(2, '0')}`;
};

const EMPTY_CHITTI_GROUP = {
  totalValue: 0,
  monthlyAmount: 0,
  totalMonths: 0
};

const currentBusinessRef = () => {
  if (!firebaseAuth?.currentUser || !firestoreDb) {
    throw new Error('Sign in before accessing business records.');
  }
  return doc(firestoreDb, 'businesses', firebaseAuth.currentUser.uid);
};

const memberToFirestore = (member, isNew = false) => ({
  memberId: member.id,
  name: member.name.trim(),
  phone: member.phone.trim(),
  nominee: member.nominee || 'Not Specified',
  address: member.address || '',
  chittiId: member.chittiId,
  status: member.status || 'due',
  prizeMoneyLifted: member.prizeMoneyLifted === true,
  chittiCompleted: member.chittiCompleted === true,
  chitTotalPaise: Math.round(Number(member.chitTotalAmount) * 100),
  monthlyPaise: Math.round(Number(member.monthlyAmount) * 100),
  durationMonths: Number(member.durationMonths),
  startDate: member.startDate,
  endDate: member.endDate,
  joinDate: member.joinDate || getKolkataDateString(),
  ...(isNew ? { createdAt: serverTimestamp() } : {}),
  updatedAt: serverTimestamp()
});

const getMemberEndDate = (member, group) =>
  member.endDate || endDateForDuration(getMemberStartDate(member), getMemberDuration(member, group));

const memberIsScheduledInMonth = (member, group, monthString) => {
  const monthDate = new Date(`${monthString} 1`);
  if (Number.isNaN(monthDate.getTime())) return false;
  const monthStart = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}-01`;
  const monthEnd = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}-${String(new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate()).padStart(2, '0')}`;
  return getMemberStartDate(member) <= monthEnd && getMemberEndDate(member, group) >= monthStart;
};

const getInstallmentsDueThroughMonth = (member, group, monthString) => {
  const monthDate = new Date(`${monthString} 1`);
  const startDate = new Date(`${getMemberStartDate(member)}T00:00:00`);
  if (Number.isNaN(monthDate.getTime()) || Number.isNaN(startDate.getTime()) ||
      monthDate < new Date(startDate.getFullYear(), startDate.getMonth(), 1)) return 0;
  const endDate = new Date(`${getMemberEndDate(member, group)}T00:00:00`);
  const throughDate = monthDate > new Date(endDate.getFullYear(), endDate.getMonth(), 1)
    ? endDate
    : monthDate;
  const monthCount = (throughDate.getFullYear() - startDate.getFullYear()) * 12 +
    throughDate.getMonth() - startDate.getMonth() + 1;
  return Math.min(getMemberDuration(member, group), monthCount);
};

// --- CHITTI GROUPS ---
const CHITTI_GROUPS_BASE = [
  {
    id: "CHIT-1",
    name: "Chitti Cherry",
    shortName: "Cherry",
    totalValue: 0,
    monthlyAmount: 0,
    totalMonths: 0,
    currentMonthIndex: 0,
    owner: "Sreekanth",
    color: "from-pink-600 to-fuchsia-600",
    badgeColor: "bg-pink-50 text-pink-700 border-pink-200"
  }
];

const LEGACY_CHITTI_GROUPS = [
  {
    id: "CHIT-2",
    name: "Chitti 2 - Silver Growth",
    shortName: "Chitti 2 (₹1 Lakh)",
    totalValue: 100000,
    monthlyAmount: 5000,
    totalMonths: 20,
    currentMonthIndex: 7,
    color: "from-emerald-600 to-teal-600",
    badgeColor: "bg-emerald-50 text-emerald-700 border-emerald-200"
  },
  {
    id: "CHIT-3",
    name: "Chitti 3 - Business Builder",
    shortName: "Chitti 3 (₹2 Lakh)",
    totalValue: 200000,
    monthlyAmount: 10000,
    totalMonths: 20,
    currentMonthIndex: 6,
    color: "from-violet-600 to-purple-600",
    badgeColor: "bg-violet-50 text-violet-700 border-violet-200"
  },
  {
    id: "CHIT-4",
    name: "Chitti 4 - Executive Mega Pool",
    shortName: "Chitti 4 (₹5 Lakh)",
    totalValue: 500000,
    monthlyAmount: 25000,
    totalMonths: 20,
    currentMonthIndex: 5,
    color: "from-amber-600 to-orange-600",
    badgeColor: "bg-amber-50 text-amber-700 border-amber-200"
  },
  {
    id: "CHIT-5",
    name: "Chitti 5 - Gold Family Chitti",
    shortName: "Chitti 5 (₹3 Lakh Gold)",
    totalValue: 300000,
    monthlyAmount: 15000,
    totalMonths: 20,
    currentMonthIndex: 4,
    color: "from-rose-600 to-pink-600",
    badgeColor: "bg-rose-50 text-rose-700 border-rose-200"
  },
  {
    id: "CHIT-6",
    name: "Chitti Cherry",
    shortName: "Cherry",
    totalValue: 0,
    monthlyAmount: 0,
    totalMonths: 0,
    currentMonthIndex: 0,
    owner: "Sreekanth",
    color: "from-pink-600 to-fuchsia-600",
    badgeColor: "bg-pink-50 text-pink-700 border-pink-200"
  }
];

const INITIAL_BUSINESS_PROFILE = {
  name: "Cherry Chits",
  owner: "Sreekanth",
  phone: "+91 98765 43210",
  address: "Main Road, Market Complex, Mancherial, Telangana - 504208",
  regNo: "CHIT/TS/2024/7890",
  tagline: "Trusted Chitti & Savings Partner Since 2012"
};

// --- INITIAL MEMBERS DISTRIBUTED ACROSS THE 5 CHITTIS ---
const INITIAL_MEMBERS = [
  // Chitti 1 (₹50k, ₹2.5k/mo)
  {
    id: "MEM-101",
    chittiId: "CHIT-1",
    name: "K. Satish Kumar",
    phone: "9848011221",
    nominee: "K. Padma (Wife)",
    address: "Gandhi Chowk, Mancherial",
    status: "due",
    joinDate: "2026-03-01"
  },
  {
    id: "MEM-102",
    chittiId: "CHIT-1",
    name: "R. Anjali Devi",
    phone: "9848033442",
    nominee: "R. Suresh (Husband)",
    address: "Bank Colony, Mancherial",
    status: "uptodate",
    joinDate: "2026-03-01"
  },
  {
    id: "MEM-103",
    chittiId: "CHIT-1",
    name: "Mohammed Arfat",
    phone: "9988712345",
    nominee: "S. Begum (Mother)",
    address: "Station Road, Bellampalli",
    status: "due",
    joinDate: "2026-03-05"
  },

  // Chitti 2 (₹1 Lakh, ₹5k/mo)
  {
    id: "MEM-201",
    chittiId: "CHIT-2",
    name: "K. Ramesh Rao",
    phone: "9848022334",
    nominee: "K. Sunitha (Wife)",
    address: "H.No 4-21, Bellampalli Chowrasta",
    status: "due",
    joinDate: "2026-04-01"
  },
  {
    id: "MEM-202",
    chittiId: "CHIT-2",
    name: "Mohammed Ibrahim",
    phone: "9988776655",
    nominee: "Ayesha Parveen (Daughter)",
    address: "Near Jamia Masjid, Old Town",
    status: "uptodate",
    joinDate: "2026-04-01"
  },
  {
    id: "MEM-203",
    chittiId: "CHIT-2",
    name: "B. Srinivasulu",
    phone: "9701122334",
    nominee: "B. Laxmi (Mother)",
    address: "Plot 45, Vidyanagar",
    status: "overdue",
    joinDate: "2026-04-05"
  },

  // Chitti 3 (₹2 Lakh, ₹10k/mo)
  {
    id: "MEM-301",
    chittiId: "CHIT-3",
    name: "S. Venkat Reddy",
    phone: "9440123456",
    nominee: "S. Padmavathi (Wife)",
    address: "Green City Colony, Sector 2",
    status: "overdue",
    joinDate: "2026-05-01"
  },
  {
    id: "MEM-302",
    chittiId: "CHIT-3",
    name: "Dr. T. Murali Krishna",
    phone: "9440556677",
    nominee: "T. Sandhya (Wife)",
    address: "Hospital Road, Mancherial",
    status: "uptodate",
    joinDate: "2026-05-01"
  },

  // Chitti 4 (₹5 Lakh, ₹25k/mo)
  {
    id: "MEM-401",
    chittiId: "CHIT-4",
    name: "V. Jagadishwar Builder",
    phone: "9866112233",
    nominee: "V. Harish (Son)",
    address: "Engineers Enclave, Mancherial",
    status: "due",
    joinDate: "2026-06-01"
  },
  {
    id: "MEM-402",
    chittiId: "CHIT-4",
    name: "G. Sudhakar Agro Traders",
    phone: "9866778899",
    nominee: "G. Renuka (Wife)",
    address: "Gunj Market Yard, Mancherial",
    status: "uptodate",
    joinDate: "2026-06-01"
  },

  // Chitti 5 (₹3 Lakh Gold, ₹15k/mo)
  {
    id: "MEM-501",
    chittiId: "CHIT-5",
    name: "Ch. Rajani Jewellers",
    phone: "9123456780",
    nominee: "Ch. Bhanu Prakash (Husband)",
    address: "Main Saraf Bazar, Mancherial",
    status: "uptodate",
    joinDate: "2026-07-01"
  },
  {
    id: "MEM-502",
    chittiId: "CHIT-5",
    name: "P. Vinod Rao",
    phone: "9123488990",
    nominee: "P. Saritha (Wife)",
    address: "Revenue Colony, Road No 3",
    status: "due",
    joinDate: "2026-07-01"
  }
];

// --- INITIAL HISTORICAL TRANSACTIONS ---
const INITIAL_PAYMENTS = [
  {
    id: "REC-2026-1001",
    memberId: "MEM-202",
    chittiId: "CHIT-2",
    memberName: "Mohammed Ibrahim",
    amount: 5000,
    date: "2026-10-18",
    month: "October 2026",
    paymentMode: "UPI",
    referenceId: "UPI/329482910/SBI",
    notes: "October installment paid in full",
    collectedBy: "Rajesh Sharma",
    timestamp: "2026-10-18T10:30:00+05:30"
  },
  {
    id: "REC-2026-1002",
    memberId: "MEM-102",
    chittiId: "CHIT-1",
    memberName: "R. Anjali Devi",
    amount: 2500,
    date: "2026-10-18",
    month: "October 2026",
    paymentMode: "Cash",
    referenceId: "CASH-OFF-09",
    notes: "Given at branch counter",
    collectedBy: "Rajesh Sharma",
    timestamp: "2026-10-18T11:45:00+05:30"
  },
  {
    id: "REC-2026-1003",
    memberId: "MEM-302",
    chittiId: "CHIT-3",
    memberName: "Dr. T. Murali Krishna",
    amount: 10000,
    date: "2026-10-17",
    month: "October 2026",
    paymentMode: "Bank Transfer",
    referenceId: "NEFT-HDFC-88910",
    notes: "Netbanking transfer",
    collectedBy: "Rajesh Sharma",
    timestamp: "2026-10-17T14:20:00+05:30"
  },
  {
    id: "REC-2026-1004",
    memberId: "MEM-501",
    chittiId: "CHIT-5",
    memberName: "Ch. Rajani Jewellers",
    amount: 15000,
    date: "2026-10-16",
    month: "October 2026",
    paymentMode: "Cheque",
    referenceId: "CHQ-SBI-440219",
    notes: "Cheque cleared",
    collectedBy: "Rajesh Sharma",
    timestamp: "2026-10-16T16:00:00+05:30"
  },
  {
    id: "REC-2026-0901",
    memberId: "MEM-201",
    chittiId: "CHIT-2",
    memberName: "K. Ramesh Rao",
    amount: 5000,
    date: "2026-09-10",
    month: "September 2026",
    paymentMode: "UPI",
    referenceId: "UPI/GPAY/99018",
    notes: "September installment",
    collectedBy: "Rajesh Sharma",
    timestamp: "2026-09-10T11:20:00+05:30"
  },
  {
    id: "REC-2026-0902",
    memberId: "MEM-401",
    chittiId: "CHIT-4",
    memberName: "V. Jagadishwar Builder",
    amount: 25000,
    date: "2026-09-08",
    month: "September 2026",
    paymentMode: "Bank Transfer",
    referenceId: "RTGS-ICICI-00921",
    notes: "September full payment",
    collectedBy: "Rajesh Sharma",
    timestamp: "2026-09-08T15:30:00+05:30"
  }
];

export default function ChittiBusinessApp() {
  // Navigation State
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard' | 'members' | 'payments' | 'chittis' | 'reports'
  const [selectedChittiFilter, setSelectedChittiFilter] = useState('ALL');
  const [selectedMonth, setSelectedMonth] = useState("October 2026");
  // Business Data State
  const [members, setMembers] = useState([]);
  const [payments, setPayments] = useState([]);
  const [savedGroups, setSavedGroups] = useState([]);
  const [deletedGroups, setDeletedGroups] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState('');

  // Modals
  const [isAddChittiOpen, setIsAddChittiOpen] = useState(false);
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [isUpdateMoneyOpen, setIsUpdateMoneyOpen] = useState(false);
  const [selectedMemberForPayment, setSelectedMemberForPayment] = useState(null);
  const [activeReceipt, setActiveReceipt] = useState(null);
  const [memberDetailModal, setMemberDetailModal] = useState(null);
  const [notification, setNotification] = useState(null);
  const [newGroupForm, setNewGroupForm] = useState({ name: '', totalAmount: '', durationMonths: '' });
  const vCardInputRef = useRef(null);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const deletedGroupIds = useMemo(() => new Set(deletedGroups.map(group => group.id)), [deletedGroups]);
  const CHITTI_GROUPS = useMemo(() => {
    const savedById = new Map(savedGroups.map(group => [group.id, group]));
    const defaultGroups = CHITTI_GROUPS_BASE.map(group => {
      const saved = savedById.get(group.id);
      return saved
        ? {
            ...group,
            ...saved,
            totalValue: Number(saved.chitTotalPaise ?? Math.round(group.totalValue * 100)) / 100,
            monthlyAmount: Number(saved.monthlyPaise ?? Math.round(group.monthlyAmount * 100)) / 100,
            totalMonths: Number(saved.durationMonths ?? group.totalMonths),
            hasFirestoreDoc: true,
            color: group.color,
            badgeColor: group.badgeColor
          }
        : group;
    });
    const knownIds = new Set(CHITTI_GROUPS_BASE.map(group => group.id));
    const referencedGroupIds = new Set([
      ...members.map(member => member.chittiId),
      ...payments.map(payment => payment.chittiId)
    ]);
    const legacyGroups = LEGACY_CHITTI_GROUPS.filter(group =>
      referencedGroupIds.has(group.id) && !savedById.has(group.id)
    );
    const palette = [...CHITTI_GROUPS_BASE, ...LEGACY_CHITTI_GROUPS];
    const additionalGroups = savedGroups
      .filter(group => !knownIds.has(group.id))
      .map((group, index) => ({
        ...group,
        totalValue: Number(group.chitTotalPaise || 0) / 100,
        monthlyAmount: Number(group.monthlyPaise || 0) / 100,
        totalMonths: Number(group.durationMonths || 0),
        hasFirestoreDoc: true,
        color: palette[index % palette.length].color,
        badgeColor: palette[index % palette.length].badgeColor,
        isCustom: true
      }));
    return [...defaultGroups, ...legacyGroups, ...additionalGroups]
      .filter(group => !deletedGroupIds.has(group.id));
  }, [savedGroups, deletedGroupIds, members, payments]);
  const activeChittiGroups = CHITTI_GROUPS;
  const getChittiLabel = (groupId) => {
    const group = CHITTI_GROUPS.find(item => item.id === groupId)
      || deletedGroups.find(item => item.id === groupId);
    return group?.shortName || group?.name || groupId;
  };

  // Temporary Payment Form Data
  const [paymentForm, setPaymentForm] = useState({
    amount: "",
    date: getKolkataDateString(),
    month: "October 2026",
    paymentMode: "UPI",
    referenceId: "",
    notes: ""
  });
  const [duplicateWarning, setDuplicateWarning] = useState("");
  const initialMemberGroup = CHITTI_GROUPS[0] || EMPTY_CHITTI_GROUP;

  // New Member Form State
  const [newMemberForm, setNewMemberForm] = useState({
    name: "",
    phone: "",
    chittiId: "CHIT-1",
    chitTotalAmount: String(initialMemberGroup.totalValue),
    durationMonths: String(initialMemberGroup.totalMonths),
    startDate: getKolkataDateString(),
    endDate: endDateForDuration(getKolkataDateString(), initialMemberGroup.totalMonths),
    nominee: "",
    address: ""
  });

  const notify = (msg, type = "success") => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3500);
  };

  const todayStr = getKolkataDateString();

  useEffect(() => {
    const businessRef = doc(firestoreDb, 'businesses', firebaseAuth.currentUser.uid);
    const membersRef = collection(businessRef, 'members');
    const paymentsRef = collection(businessRef, 'payments');
    const groupsRef = collection(businessRef, 'chittis');
    const deletedGroupsRef = collection(businessRef, 'deletedChittis');
    let loadedMembers = false;
    let loadedPayments = false;
    const unsubscribeMembers = onSnapshot(
      membersRef,
      snapshot => {
        setMembers(snapshot.docs.map(memberDoc => {
          const data = memberDoc.data();
          return {
            ...data,
            id: memberDoc.id,
            chitTotalAmount: data.chitTotalPaise / 100,
            monthlyAmount: data.monthlyPaise / 100
          };
        }));
        loadedMembers = true;
        if (loadedPayments) setDataLoading(false);
        setDataError('');
      },
      error => {
        setDataError(`Could not load members: ${error.message}`);
        setDataLoading(false);
      }
    );
    const unsubscribePayments = onSnapshot(
      paymentsRef,
      snapshot => {
        setPayments(snapshot.docs
          .sort((a, b) => {
            const left = a.data();
            const right = b.data();
            return `${right.date} ${right.createdAt?.toDate?.() || ''}`
              .localeCompare(`${left.date} ${left.createdAt?.toDate?.() || ''}`);
          })
          .map(paymentDoc => {
            const data = paymentDoc.data();
            return {
              ...data,
              id: data.receiptId || paymentDoc.id,
              firestoreId: paymentDoc.id,
              amount: data.amountPaise / 100,
              timestamp: data.createdAt?.toDate?.().toISOString() || ''
            };
          }));
        loadedPayments = true;
        if (loadedMembers) setDataLoading(false);
        setDataError('');
      },
      error => {
        setDataError(`Could not load payments: ${error.message}`);
        setDataLoading(false);
      }
    );
    const unsubscribeGroups = onSnapshot(
      groupsRef,
      snapshot => {
        setSavedGroups(snapshot.docs.map(groupDoc => ({
          ...groupDoc.data(),
          id: groupDoc.id
        })));
      },
      error => {
        setDataError(`Could not load Chitti groups: ${error.message}`);
      }
    );
    const unsubscribeDeletedGroups = onSnapshot(
      deletedGroupsRef,
      snapshot => {
        setDeletedGroups(snapshot.docs.map(groupDoc => ({
          ...groupDoc.data(),
          id: groupDoc.id
        })));
      },
      error => {
        setDataError(`Could not load deleted Chitti group records: ${error.message}`);
      }
    );
    return () => {
      unsubscribeMembers();
      unsubscribePayments();
      unsubscribeGroups();
      unsubscribeDeletedGroups();
    };
  }, []);

  // --- COMPREHENSIVE FINANCIAL & REMAINING BALANCE COMPUTATIONS ---
  
  // Member-level balances: total paid, remaining chit tenure balance, current month pending
  const memberFinancials = useMemo(() => {
    const map = {};
    members.forEach(m => {
      const chitti = CHITTI_GROUPS.find(c => c.id === m.chittiId) || EMPTY_CHITTI_GROUP;
      const memberPayments = payments.filter(p => p.memberId === m.id);
      const totalValue = getMemberTotalValue(m, chitti);
      const monthlyAmount = getMemberMonthlyAmount(m, chitti);
      const isScheduledThisMonth = memberIsScheduledInMonth(m, chitti, selectedMonth);
      
      const totalPaidLifetime = memberPayments.reduce((acc, curr) => acc + Number(curr.amount), 0);
      const remainingChitBalance = Math.max(0, totalValue - totalPaidLifetime);
      const completionPercentage = totalValue > 0 ? Math.min(100, Math.round((totalPaidLifetime / totalValue) * 100)) : 0;

      // Month-specific calculations
      const monthPaid = memberPayments
        .filter(p => p.month === selectedMonth)
        .reduce((acc, curr) => acc + Number(curr.amount), 0);

      const monthPending = isScheduledThisMonth ? Math.max(0, monthlyAmount - monthPaid) : 0;

      // Expected so far according to tenure progress
      const tenureExpected = Math.min(totalValue, monthlyAmount * getInstallmentsDueThroughMonth(m, chitti, selectedMonth));
      const overallArrears = Math.max(0, tenureExpected - totalPaidLifetime);

      map[m.id] = {
        totalPaidLifetime,
        remainingChitBalance,
        completionPercentage,
        monthPaid,
        monthPending,
        overallArrears,
        isMonthCleared: monthPending === 0
      };
    });
    return map;
  }, [members, payments, selectedMonth]);

  // Group-level Chitti aggregates
  const chittiStats = useMemo(() => {
    return CHITTI_GROUPS.map(chitti => {
      const groupMembers = members.filter(m => m.chittiId === chitti.id);
      const groupPayments = payments.filter(p => p.chittiId === chitti.id);

      const totalPoolValue = groupMembers.reduce((sum, member) => sum + getMemberTotalValue(member, chitti), 0);
      const totalCollectedLifetime = groupPayments.reduce((acc, p) => acc + Number(p.amount), 0);
      const totalRemainingChitBalance = Math.max(0, totalPoolValue - totalCollectedLifetime);
      
      const monthCollected = groupPayments
        .filter(p => p.month === selectedMonth)
        .reduce((acc, p) => acc + Number(p.amount), 0);

      const monthExpected = groupMembers
        .filter(member => memberIsScheduledInMonth(member, chitti, selectedMonth))
        .reduce((sum, member) => sum + getMemberMonthlyAmount(member, chitti), 0);
      const monthPending = Math.max(0, monthExpected - monthCollected);

      const percentageCollected = totalPoolValue > 0 
        ? Math.round((totalCollectedLifetime / totalPoolValue) * 100) 
        : 0;

      return {
        ...chitti,
        monthlyAmount: groupMembers.length
          ? groupMembers.reduce((sum, member) => sum + getMemberMonthlyAmount(member, chitti), 0) / groupMembers.length
          : chitti.monthlyAmount,
        totalMonths: groupMembers.length
          ? groupMembers.reduce((sum, member) => sum + getMemberDuration(member, chitti), 0) / groupMembers.length
          : chitti.totalMonths,
        enrolledCount: groupMembers.length,
        totalPoolValue,
        averageMemberTotal: groupMembers.length ? totalPoolValue / groupMembers.length : chitti.totalValue,
        totalCollectedLifetime,
        totalRemainingChitBalance,
        monthCollected,
        monthExpected,
        monthPending,
        percentageCollected
      };
    });
  }, [members, payments, selectedMonth]);

  // Overall Global / Filtered Dashboard Metrics
  const dashboardMetrics = useMemo(() => {
    // If a specific Chitti is selected, isolate it. Otherwise sum all groups.
    const relevantChittis = selectedChittiFilter === 'ALL'
      ? chittiStats
      : chittiStats.filter(c => c.id === selectedChittiFilter);

    const relevantPayments = payments.filter(p =>
      selectedChittiFilter === 'ALL' || p.chittiId === selectedChittiFilter
    );

    const totalCollectedToday = relevantPayments
      .filter(p => p.date === todayStr)
      .reduce((sum, p) => sum + Number(p.amount), 0);

    const totalCollectedThisMonth = relevantPayments
      .filter(p => p.month === selectedMonth)
      .reduce((sum, p) => sum + Number(p.amount), 0);

    const grandTotalRemainingBalance = relevantChittis.reduce((sum, c) => sum + c.totalRemainingChitBalance, 0);
    const grandTotalPoolValue = relevantChittis.reduce((sum, c) => sum + c.totalPoolValue, 0);
    const grandTotalMonthExpected = relevantChittis.reduce((sum, c) => sum + c.monthExpected, 0);
    const grandTotalMonthPending = Math.max(0, grandTotalMonthExpected - totalCollectedThisMonth);

    return {
      totalCollectedToday,
      totalCollectedThisMonth,
      grandTotalRemainingBalance,
      grandTotalPoolValue,
      grandTotalMonthExpected,
      grandTotalMonthPending,
      totalEnrolled: members.filter(m =>
        selectedChittiFilter === 'ALL' || m.chittiId === selectedChittiFilter
      ).length
    };
  }, [selectedChittiFilter, chittiStats, members, payments, todayStr, selectedMonth]);

  // Filtered Members List
  const filteredMembers = useMemo(() => {
    return members.filter(m => {
      if (selectedChittiFilter !== 'ALL' && m.chittiId !== selectedChittiFilter) {
        return false;
      }

      const chitti = CHITTI_GROUPS.find(c => c.id === m.chittiId);
      const matchesSearch = 
        m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.phone.includes(searchQuery) ||
        chitti?.name.toLowerCase().includes(searchQuery.toLowerCase());
      
      if (!matchesSearch) return false;
      if (statusFilter === "all") return true;

      const fin = memberFinancials[m.id];
      if (statusFilter === "uptodate") return fin?.isMonthCleared;
      if (statusFilter === "due") return !fin?.isMonthCleared && (fin?.overallArrears || 0) <= getMemberMonthlyAmount(m, chitti || EMPTY_CHITTI_GROUP);
      if (statusFilter === "overdue") return (fin?.overallArrears || 0) > getMemberMonthlyAmount(m, chitti || EMPTY_CHITTI_GROUP);

      return true;
    });
  }, [members, selectedChittiFilter, searchQuery, statusFilter, memberFinancials, CHITTI_GROUPS]);

  // Unique list of available months for passbook browsing
  const availableMonths = useMemo(() => {
    const set = new Set(["October 2026", "September 2026", "August 2026", "July 2026"]);
    payments.forEach(p => set.add(p.month));
    return Array.from(set);
  }, [payments]);

  // --- ACTIONS ---

  const openAddMemberModal = () => {
    const group = activeChittiGroups.find(item => item.id === selectedChittiFilter) || activeChittiGroups[0];
    if (!group) {
      notify('Create or restore a Chitti group before adding members.', 'error');
      return;
    }
    const startDate = getKolkataDateString();
    setNewMemberForm(current => ({
      ...current,
      chittiId: group.id,
      chitTotalAmount: group.totalValue > 0 ? String(group.totalValue) : '',
      durationMonths: group.totalMonths > 0 ? String(group.totalMonths) : '',
      startDate,
      endDate: group.totalMonths > 0 ? endDateForDuration(startDate, group.totalMonths) : ''
    }));
    setIsAddMemberOpen(true);
  };

  const handleCreateChittiGroup = async (event) => {
    event.preventDefault();
    const name = newGroupForm.name.trim();
    const totalAmount = Number(newGroupForm.totalAmount);
    const durationMonths = Number(newGroupForm.durationMonths);
    if (!name || name.length > 100) {
      notify('Enter a group name of up to 100 characters.', 'error');
      return;
    }
    if (!Number.isFinite(totalAmount) || totalAmount <= 0 || totalAmount > 100000000) {
      notify('Enter a valid group amount greater than ₹0.', 'error');
      return;
    }
    if (!Number.isInteger(durationMonths) || durationMonths < 1 || durationMonths > 600) {
      notify('Duration must be between 1 and 600 months.', 'error');
      return;
    }
    if (CHITTI_GROUPS.some(group => group.name.trim().toLowerCase() === name.toLowerCase())) {
      notify('A Chitti group with this name already exists.', 'error');
      return;
    }

    const totalPaise = Math.round(totalAmount * 100);
    const groupRef = doc(collection(currentBusinessRef(), 'chittis'));
    const groupId = groupRef.id;
    const groupData = {
      groupId,
      name,
      shortName: name,
      chitTotalPaise: totalPaise,
      monthlyPaise: Math.round(totalPaise / durationMonths),
      durationMonths,
      isCustom: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    try {
      await setDoc(groupRef, groupData);
      setSavedGroups(current => [
        ...current.filter(group => group.id !== groupId),
        { ...groupData, id: groupId, hasFirestoreDoc: true }
      ]);
      setNewGroupForm({ name: '', totalAmount: '', durationMonths: '' });
      setSelectedChittiFilter(groupId);
      setIsAddChittiOpen(false);
      setActiveTab('chittis');
      notify(`${name} was created and saved securely.`);
    } catch (error) {
      notify(`Chitti group could not be saved: ${error.message || 'Please try again.'}`, 'error');
    }
  };

  const getMemberCleanupSnapshots = async (memberRef) => {
    const [installments, paymentKeys] = await Promise.all([
      getDocs(collection(memberRef, 'installments')),
      getDocs(collection(memberRef, 'paymentKeys'))
    ]);
    if (installments.size + paymentKeys.size + 1 > 500) {
      throw new Error('This member has too many installment and duplicate-key records for one safe delete. No records were changed.');
    }
    return { memberRef, installments, paymentKeys };
  };

  const commitMemberDeletion = async ({ memberRef, installments, paymentKeys }) => {
    const batch = writeBatch(firestoreDb);
    installments.docs.forEach(installment => batch.delete(installment.ref));
    paymentKeys.docs.forEach(paymentKey => batch.delete(paymentKey.ref));
    batch.delete(memberRef);
    await batch.commit();
  };

  const deleteMember = async (member) => {
    const confirmed = window.confirm(
      `Permanently delete ${member.name}'s member record and installment tracking? Payment transactions and receipts will remain in history. This cannot be undone.`
    );
    if (!confirmed) return;

    try {
      const memberRef = doc(collection(currentBusinessRef(), 'members'), member.id);
      const cleanup = await getMemberCleanupSnapshots(memberRef);
      await commitMemberDeletion(cleanup);
      notify(`${member.name} was deleted. Their payment and receipt history was preserved.`);
    } catch (error) {
      notify(`Member could not be deleted: ${error.message || 'Please try again.'}`, 'error');
    }
  };

  const deleteChittiGroup = async (group) => {
    const confirmed = window.confirm(
      `Permanently delete ${group.name} and all of its member records? Payment transactions and receipts will remain in history. This cannot be undone.`
    );
    if (!confirmed) return;

    let deletionStep = 'loading group members';
    try {
      const businessRef = currentBusinessRef();
      const memberSnapshot = await getDocs(collection(businessRef, 'members'));
      const groupMembers = memberSnapshot.docs.filter(member => member.data().chittiId === group.id);
      deletionStep = 'loading member installment records';
      const cleanups = await Promise.all(groupMembers.map(member => getMemberCleanupSnapshots(member.ref)));

      for (const cleanup of cleanups) {
        deletionStep = 'deleting member records';
        await commitMemberDeletion(cleanup);
      }

      deletionStep = 'deleting the group and saving its history marker';
      const deletedGroupRef = doc(collection(businessRef, 'deletedChittis'), group.id);
      const deletedGroupSnapshot = await getDoc(deletedGroupRef);
      const finalBatch = writeBatch(firestoreDb);
      if (group.hasFirestoreDoc) {
        finalBatch.delete(doc(collection(businessRef, 'chittis'), group.id));
      }
      if (!deletedGroupSnapshot.exists()) {
        finalBatch.set(deletedGroupRef, {
          groupId: group.id,
          name: group.name,
          shortName: group.shortName || group.name,
          deletedAt: serverTimestamp()
        });
      }
      if (group.hasFirestoreDoc || !deletedGroupSnapshot.exists()) {
        await finalBatch.commit();
      }
      if (selectedChittiFilter === group.id) setSelectedChittiFilter('ALL');
      notify(`${group.name} and ${groupMembers.length} member record(s) were deleted. Payment history was preserved.`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Please try again.';
      const permissionDenied = typeof error === 'object'
        && error !== null
        && 'code' in error
        && error.code === 'permission-denied';
      const permissionHint = permissionDenied
        ? ` Firebase denied permission while ${deletionStep}. Publish the current firestore.rules to the same Firebase project, then retry.`
        : '';
      notify(
        `Group deletion failed while ${deletionStep}: ${errorMessage}.${permissionHint} Payment transactions and receipts were not deleted. Some member records may already have been removed; refresh to check before retrying.`,
        'error'
      );
    }
  };

  const updateMemberMilestone = async (member, field, value) => {
    const labels = {
      prizeMoneyLifted: 'prize money lifted',
      chittiCompleted: 'Chitti completed'
    };
    try {
      const memberRef = doc(collection(currentBusinessRef(), 'members'), member.id);
      await updateDoc(memberRef, {
        [field]: value,
        updatedAt: serverTimestamp()
      });
      setMemberDetailModal(current =>
        current?.id === member.id ? { ...current, [field]: value } : current
      );
      notify(`${member.name} marked as ${value ? labels[field] : `not ${labels[field]}`}.`);
    } catch (error) {
      const permissionHint = error.code === 'permission-denied'
        ? ' Publish the current firestore.rules to Firebase Console and reload the app to allow these milestone fields.'
        : '';
      notify(
        `Could not update ${labels[field]} status: ${error.message || 'Please try again.'}${permissionHint}`,
        'error'
      );
    }
  };

  const openUpdateMoneyModal = (member) => {
    setSelectedMemberForPayment(member);
    const chitti = CHITTI_GROUPS.find(c => c.id === member.chittiId) || EMPTY_CHITTI_GROUP;
    const fin = memberFinancials[member.id];
    const monthlyAmount = getMemberMonthlyAmount(member, chitti);
    
    // Suggested amount defaults to current pending balance or full installment
    const suggested = fin?.monthPending > 0 ? fin.monthPending : monthlyAmount;

    setPaymentForm({
      amount: suggested.toString(),
      date: getKolkataDateString(),
      month: selectedMonth,
      paymentMode: "UPI",
      referenceId: "",
      notes: ""
    });
    setDuplicateWarning("");
    setIsUpdateMoneyOpen(true);
  };

  const handleRecordPayment = (e) => {
    e.preventDefault();
    if (!selectedMemberForPayment) return;

    const amountNum = Number(paymentForm.amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      notify("Please enter a valid amount", "error");
      return;
    }

    const chitti = CHITTI_GROUPS.find(c => c.id === selectedMemberForPayment.chittiId);
    const memberTotalValue = getMemberTotalValue(selectedMemberForPayment, chitti || EMPTY_CHITTI_GROUP);
    const remainingAmount = memberFinancials[selectedMemberForPayment.id]?.remainingChitBalance ?? memberTotalValue;
    if (amountNum > remainingAmount) {
      notify(`Payment exceeds the remaining Chitti balance of ${formatINR(remainingAmount)}`, "error");
      return;
    }

    const duplicate = payments.find(p =>
      p.memberId === selectedMemberForPayment.id &&
      p.month === paymentForm.month &&
      p.date === paymentForm.date &&
      Number(p.amount) === amountNum
    );

    if (duplicate) {
      setDuplicateWarning(
        `This exact payment already exists for ${selectedMemberForPayment.name}. Duplicate entries are blocked.`
      );
      return;
    }

    const amountPaise = Math.round(amountNum * 100);
    const monthDate = new Date(`${paymentForm.month} 1`);
    if (Number.isNaN(monthDate.getTime())) {
      notify('Select a valid installment month.', 'error');
      return;
    }
    const installmentMonth = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`;
    const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const startDate = new Date(`${selectedMemberForPayment.startDate}T00:00:00`);
    const durationMonths = getMemberDuration(selectedMemberForPayment, chitti || EMPTY_CHITTI_GROUP);
    const installmentIndex = (monthStart.getFullYear() - startDate.getFullYear()) * 12 +
      monthStart.getMonth() - startDate.getMonth();
    const monthlyPaise = Math.round(getMemberMonthlyAmount(selectedMemberForPayment, chitti || EMPTY_CHITTI_GROUP) * 100);
    const finalInstallmentPaise = Math.max(0, Math.round(memberTotalValue * 100) - monthlyPaise * (durationMonths - 1));
    const duePaise = installmentIndex === durationMonths - 1 ? finalInstallmentPaise : monthlyPaise;
    if (!memberIsScheduledInMonth(
      selectedMemberForPayment,
      chitti || EMPTY_CHITTI_GROUP,
      paymentForm.month
    ) || duePaise <= 0) {
      notify('The selected installment month is outside this member’s schedule.', 'error');
      return;
    }

    const businessRef = currentBusinessRef();
    const memberRef = doc(collection(businessRef, 'members'), selectedMemberForPayment.id);
    const paymentRef = doc(collection(businessRef, 'payments'));
    const installmentRef = doc(collection(memberRef, 'installments'), installmentMonth);
    const duplicateKey = `${selectedMemberForPayment.id}_${installmentMonth}_${paymentForm.date}_${amountPaise}`;
    const duplicateRef = doc(collection(memberRef, 'paymentKeys'), duplicateKey);

    runTransaction(firestoreDb, async transaction => {
      const [memberSnapshot, installmentSnapshot, duplicateSnapshot] = await Promise.all([
        transaction.get(memberRef),
        transaction.get(installmentRef),
        transaction.get(duplicateRef)
      ]);
      if (!memberSnapshot.exists()) throw new Error('Member record no longer exists.');
      if (duplicateSnapshot.exists()) throw new Error('This payment was already recorded.');
      const paidPaise = installmentSnapshot.exists()
        ? installmentSnapshot.data().receivedPaise
        : 0;
      if (paidPaise + amountPaise > duePaise) {
        throw new Error(`Amount is more than the installment balance of ${formatINR((duePaise - paidPaise) / 100)}.`);
      }

      const paymentMode = paymentForm.paymentMode === 'UPI' || paymentForm.paymentMode === 'Bank Transfer'
        ? 'online'
        : paymentForm.paymentMode === 'Cheque' ? 'cheque' : 'cash';
      const receiptId = `REC-${paymentForm.date.slice(0, 4)}-${paymentRef.id.toUpperCase()}`;
      const newPayment = {
        memberId: selectedMemberForPayment.id,
        chittiId: selectedMemberForPayment.chittiId,
        chittiName: chitti?.name || getChittiLabel(selectedMemberForPayment.chittiId),
        memberName: selectedMemberForPayment.name,
        amountPaise,
        date: paymentForm.date,
        installmentMonth,
        month: paymentForm.month,
        paymentMode,
        mode: paymentMode,
        referenceId: paymentForm.referenceId.trim(),
        notes: paymentForm.notes.trim(),
        collectedBy: INITIAL_BUSINESS_PROFILE.owner,
        receiptId,
        duePaise,
        createdAt: serverTimestamp()
      };
      transaction.set(paymentRef, newPayment);
      transaction.set(installmentRef, {
        installmentMonth,
        duePaise,
        receivedPaise: paidPaise + amountPaise,
        updatedAt: serverTimestamp()
      }, { merge: true });
      transaction.set(duplicateRef, {
        paymentId: paymentRef.id,
        createdAt: serverTimestamp()
      });
      return { ...newPayment, firestoreId: paymentRef.id, amount: amountPaise / 100, id: receiptId };
    }).then(payment => {
      const newRemainingBalance = Math.max(
        0,
        memberTotalValue - ((memberFinancials[selectedMemberForPayment.id]?.totalPaidLifetime || 0) + amountNum)
      );
      setIsUpdateMoneyOpen(false);
      setDuplicateWarning('');
      notify(`Payment of ${formatINR(amountNum)} saved securely for ${selectedMemberForPayment.name}.`);
      setActiveReceipt({
        ...payment,
        chittiName: chitti?.name,
        totalChitValue: memberTotalValue,
        updatedRemainingBalance: newRemainingBalance
      });
    }).catch(error => {
      notify(error.message || 'Payment could not be saved. No collection was recorded.', 'error');
    });
  };

  const handleAddMember = async (e) => {
    e.preventDefault();
    if (!newMemberForm.name || !newMemberForm.phone) {
      notify("Please provide Name and Phone number", "error");
      return;
    }
    if (!CHITTI_GROUPS.some(group => group.id === newMemberForm.chittiId)) {
      notify('Select an existing Chitti group before adding this member.', 'error');
      return;
    }

    const totalAmount = Number(newMemberForm.chitTotalAmount);
    const durationMonths = Number(newMemberForm.durationMonths);
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      notify("Please enter a valid Chitti total amount", "error");
      return;
    }
    if (!Number.isInteger(durationMonths) || durationMonths < 1 || durationMonths > 600) {
      notify("Duration must be between 1 and 600 months", "error");
      return;
    }
    if (!newMemberForm.startDate || !newMemberForm.endDate || newMemberForm.endDate < newMemberForm.startDate) {
      notify("End date must be on or after the start date", "error");
      return;
    }

    const membersRef = collection(currentBusinessRef(), 'members');
    const memberRef = doc(membersRef);
    const newMember = {
      id: memberRef.id,
      chittiId: newMemberForm.chittiId,
      chitTotalAmount: totalAmount,
      durationMonths,
      monthlyAmount: totalAmount / durationMonths,
      startDate: newMemberForm.startDate,
      endDate: newMemberForm.endDate,
      name: newMemberForm.name,
      phone: newMemberForm.phone,
      nominee: newMemberForm.nominee || "Not Specified",
      address: newMemberForm.address || "Mancherial, Telangana",
      status: "due",
      joinDate: getKolkataDateString()
    };

    try {
      await setDoc(memberRef, memberToFirestore(newMember, true));
      setIsAddMemberOpen(false);
      notify(`Saved ${newMember.name} securely to ${CHITTI_GROUPS.find(c => c.id === newMember.chittiId)?.name}`);
    } catch (error) {
      notify(`Member could not be saved: ${error.message || 'Please try again.'}`, 'error');
      return;
    }

    const nextGroup = CHITTI_GROUPS[0];
    setNewMemberForm({
      name: "",
      phone: "",
      chittiId: nextGroup?.id || "",
      chitTotalAmount: String(nextGroup?.totalValue || ''),
      durationMonths: String(nextGroup?.totalMonths || ''),
      startDate: getKolkataDateString(),
      endDate: nextGroup?.totalMonths
        ? endDateForDuration(getKolkataDateString(), nextGroup.totalMonths)
        : '',
      nominee: "",
      address: ""
    });
  };

  const normalizeIndianMobile = (value) => {
    let digits = String(value || '').replace(/\D/g, '');
    if (digits.startsWith('0091')) digits = digits.slice(4);
    else if (digits.startsWith('91') && digits.length === 12) digits = digits.slice(2);
    else if (digits.startsWith('0') && digits.length === 11) digits = digits.slice(1);
    return /^[6-9]\d{9}$/.test(digits) ? digits : '';
  };

  const importSelectedContacts = async (contacts) => {
    const groupId = selectedChittiFilter === 'ALL' ? CHITTI_GROUPS[0]?.id : selectedChittiFilter;
    const group = CHITTI_GROUPS.find(item => item.id === groupId);
    if (!group) {
      notify('Create a Chitti group before importing member contacts.', 'error');
      return;
    }
    if (!group || group.totalValue <= 0 || group.totalMonths <= 0) {
      notify(`${group?.shortName || 'This Chitti'} has no preset amount or duration. Add members manually and enter their Chitti terms.`, 'error');
      return;
    }
    const existingPhones = new Set(
      members.map(member => normalizeIndianMobile(member.phone)).filter(Boolean)
    );
    const importedPhones = new Set();
    const additions = [];
    let skipped = 0;

    contacts.forEach(contact => {
      const name = String(contact.name?.[0] || '').trim();
      const phone = normalizeIndianMobile(contact.tel?.[0]);
      if (!name || !phone || existingPhones.has(phone) || importedPhones.has(phone)) {
        skipped += 1;
        return;
      }
      importedPhones.add(phone);
      additions.push({
        id: `MEM-${Date.now()}-${additions.length + 1}`,
        chittiId: groupId,
        chitTotalAmount: CHITTI_GROUPS.find(group => group.id === groupId).totalValue,
        durationMonths: CHITTI_GROUPS.find(group => group.id === groupId).totalMonths,
        monthlyAmount: CHITTI_GROUPS.find(group => group.id === groupId).monthlyAmount,
        startDate: getKolkataDateString(),
        endDate: endDateForDuration(getKolkataDateString(), CHITTI_GROUPS.find(group => group.id === groupId).totalMonths),
        name,
        phone,
        nominee: 'Not Specified',
        address: contact.address?.[0] || '',
        status: 'due',
        joinDate: getKolkataDateString()
      });
    });

    if (additions.length > 0) {
      try {
        const batches = [];
        for (let offset = 0; offset < additions.length; offset += 450) {
          const batch = writeBatch(firestoreDb);
          additions.slice(offset, offset + 450).forEach(member => {
            const memberRef = doc(collection(currentBusinessRef(), 'members'));
            member.id = memberRef.id;
            batch.set(memberRef, memberToFirestore(member, true));
          });
          batches.push(batch.commit());
        }
        await Promise.all(batches);
      } catch (error) {
        notify(`Contacts could not be saved: ${error.message || 'Please try again.'}`, 'error');
        return;
      }
      setSelectedChittiFilter(groupId);
      setStatusFilter('all');
      const suffix = skipped > 0 ? ` (${skipped} skipped: duplicate or missing valid Indian mobile)` : '';
      notify(`Imported ${additions.length} contacts into ${CHITTI_GROUPS.find(group => group.id === groupId)?.shortName}.${suffix}`);
    } else {
      notify(
        contacts.length === 0
          ? 'No contacts were selected.'
          : `No new contacts imported. ${skipped} skipped: duplicate or missing valid Indian mobile.`,
        contacts.length === 0 ? 'success' : 'error'
      );
    }
  };

  const handleImportPhoneContacts = async () => {
    const contactNavigator = navigator as Navigator & {
      contacts?: {
        select: (
          properties: string[],
          options?: { multiple?: boolean }
        ) => Promise<Array<{ name?: string[]; tel?: string[]; address?: string[] }>>;
      };
    };
    if (!contactNavigator.contacts?.select) {
      notify('This browser cannot open phone contacts. On Android, use Chrome over HTTPS, or import a .vcf contacts file.', 'error');
      vCardInputRef.current?.click();
      return;
    }

    try {
      const contacts = await contactNavigator.contacts.select(
        ['name', 'tel', 'address'],
        { multiple: true }
      );
      await importSelectedContacts(contacts);
    } catch (error) {
      if (error.name !== 'AbortError') {
        notify(`Could not read selected contacts: ${error.message || 'Please try again.'}`, 'error');
      }
    }
  };

  const handleVCardImport = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const contents = await file.text();
      const unfolded = contents.replace(/\r?\n[ \t]/g, '');
      const cards = unfolded.match(/BEGIN:VCARD[\s\S]*?END:VCARD/gi) || [];
      const contacts = cards.map(card => {
        const lines = card.split(/\r?\n/);
        const readValue = (prefix) => {
          const line = lines.find(item => item.toUpperCase().startsWith(prefix));
          return line ? line.slice(line.indexOf(':') + 1).replace(/\\([,;\\])/g, '$1').trim() : '';
        };
        const formattedName = readValue('FN');
        const structuredName = readValue('N');
        const name = formattedName || structuredName.split(';').filter(Boolean).reverse().join(' ');
        const phoneLine = lines.find(item => /^TEL(?:;[^:]*)?:/i.test(item));
        const addressLine = lines.find(item => /^ADR(?:;[^:]*)?:/i.test(item));
        const address = addressLine
          ? addressLine.slice(addressLine.indexOf(':') + 1).split(';').filter(Boolean).join(', ')
          : '';
        return {
          name: name ? [name] : [],
          tel: phoneLine ? [phoneLine.slice(phoneLine.indexOf(':') + 1).trim()] : [],
          address: address ? [address] : []
        };
      });
      await importSelectedContacts(contacts);
    } catch (error) {
      notify(`Could not read the contacts file: ${error.message || 'Choose a valid vCard file.'}`, 'error');
    }
  };

  const exportToCSV = () => {
    const headers = ["Receipt No", "Date", "Month", "Member ID", "Member Name", "Chitti Group", "Amount (INR)", "Payment Mode", "Ref ID", "Notes"];
    const rows = payments
      .filter(p => selectedChittiFilter === 'ALL' || p.chittiId === selectedChittiFilter)
      .map(p => {
        const c = CHITTI_GROUPS.find(x => x.id === p.chittiId)
          || deletedGroups.find(x => x.id === p.chittiId);
        return [
          p.id,
          p.date,
          `"${p.month}"`,
          p.memberId,
          `"${p.memberName}"`,
          `"${c?.name || p.chittiName || getChittiLabel(p.chittiId)}"`,
          p.amount,
          p.paymentMode,
          `"${p.referenceId || ''}"`,
          `"${p.notes || ''}"`
        ];
      });

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Chitti_Ledger_${selectedChittiFilter}_${selectedMonth.replace(/\s+/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    notify("Ledger successfully exported to CSV!");
  };

  const shareWhatsAppReceipt = (receipt) => {
    const chitti = CHITTI_GROUPS.find(c => c.id === receipt.chittiId);
    const text = `*OFFICIAL PAYMENT RECEIPT*\n` +
      `🏢 *${INITIAL_BUSINESS_PROFILE.name}*\n` +
      `🧾 *Receipt No:* ${receipt.id}\n` +
      `👤 *Member:* ${receipt.memberName} (${receipt.memberId})\n` +
      `📦 *Chitti Scheme:* ${receipt.chittiName || chitti?.name}\n` +
      `💰 *Amount Paid Now:* ${formatINR(receipt.amount)}\n` +
      `🎯 *Total Chit Value:* ${formatINR(receipt.totalChitValue || chitti?.totalValue)}\n` +
      `⏳ *REMAINING BALANCE TO PAY:* ${formatINR(receipt.updatedRemainingBalance ?? 0)}\n` +
      `📅 *Date:* ${receipt.date} (${receipt.month})\n` +
      `💳 *Payment Mode:* ${receipt.paymentMode} (Ref: ${receipt.referenceId})\n` +
      `✅ *Status:* Confirmed & Updated in Ledger\n\n` +
      `_Contact ${INITIAL_BUSINESS_PROFILE.owner}: ${INITIAL_BUSINESS_PROFILE.phone}_\n` +
      `_Mancherial, Telangana_`;

    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
  };

  if (dataLoading) {
    return <main className="min-h-screen grid place-items-center bg-slate-50"><p className="text-sm text-emerald-800">Loading your secure business records…</p></main>;
  }
  if (dataError) {
    return (
      <main className="min-h-screen grid place-items-center bg-slate-50 p-5">
        <section className="max-w-lg rounded-2xl border border-rose-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-lg font-bold text-rose-800">Business data is unavailable</h1>
          <p className="mt-2 text-sm text-slate-700">{dataError}</p>
          <button onClick={() => signOut(firebaseAuth)} className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Sign out</button>
        </section>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans antialiased pb-20 md:pb-0">
      
      {/* --- TOP TOAST NOTIFICATION --- */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-xl text-white text-xs sm:text-sm font-semibold transition-all transform animate-bounce ${
          notification.type === 'error' ? 'bg-rose-600' : 'bg-emerald-700'
        }`}>
          {notification.type === 'error' ? <AlertCircle className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
          <span>{notification.msg}</span>
        </div>
      )}

      {/* --- HEADER --- */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center font-black shadow-md shadow-emerald-500/20 text-lg">
                ₹
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="font-bold text-slate-900 leading-tight text-sm sm:text-base">
                    {INITIAL_BUSINESS_PROFILE.name}
                  </h1>
                  <span className="hidden lg:inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                    {CHITTI_GROUPS.length} Active Chittis
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  <span>Owner: {INITIAL_BUSINESS_PROFILE.owner}</span>
                  <span className="mx-1.5 text-slate-300">•</span>
                  <span className="text-emerald-700 font-medium">Asia/Kolkata</span>
                </p>
              </div>
            </div>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-1 bg-slate-100/90 p-1 rounded-xl">
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition ${
                  activeTab === 'dashboard' ? 'bg-white text-emerald-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Dashboard
              </button>
              <button
                onClick={() => setActiveTab('chittis')}
                className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition ${
                  activeTab === 'chittis' ? 'bg-white text-emerald-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Chittis ({CHITTI_GROUPS.length})
              </button>
              <button
                onClick={() => setActiveTab('members')}
                className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition ${
                  activeTab === 'members' ? 'bg-white text-emerald-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Members ({members.length})
              </button>
              <button
                onClick={() => setActiveTab('payments')}
                className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition ${
                  activeTab === 'payments' ? 'bg-white text-emerald-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Passbook Ledger
              </button>
              <button
                onClick={() => setActiveTab('reports')}
                className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition ${
                  activeTab === 'reports' ? 'bg-white text-emerald-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Audit Reports
              </button>
            </nav>

            {/* Quick Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={openAddMemberModal}
                className="hidden sm:inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-2 rounded-xl shadow-xs transition active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>Add Member</span>
              </button>

              <button
                onClick={() => signOut(firebaseAuth)}
                title="Sign out"
                className="p-2 text-slate-500 hover:text-rose-600 hover:bg-slate-100 rounded-xl transition"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>

          </div>
        </div>
      </header>

      {/* --- TOP 5-CHITTI SELECTOR & MONTH TOOLBAR --- */}
      <section className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
            
            {/* 5 Chitti Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0 scrollbar-none">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider shrink-0 mr-1 flex items-center gap-1">
                <Layers className="w-3.5 h-3.5" /> Group:
              </span>
              <button
                onClick={() => setSelectedChittiFilter('ALL')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                  selectedChittiFilter === 'ALL'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                All {CHITTI_GROUPS.length} Chittis
              </button>
              {CHITTI_GROUPS.map((cg) => (
                <button
                  key={cg.id}
                  onClick={() => setSelectedChittiFilter(cg.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition flex items-center gap-1.5 ${
                    selectedChittiFilter === cg.id
                      ? 'bg-emerald-700 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <span>{cg.shortName}</span>
                </button>
              ))}
            </div>

            {/* Installment Month Selector */}
            <div className="flex items-center gap-2 self-end md:self-auto">
              <Calendar className="w-4 h-4 text-emerald-700" />
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-slate-100 border border-slate-300 text-slate-800 text-xs font-bold rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-emerald-500 focus:outline-none cursor-pointer"
              >
                {availableMonths.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>

          </div>
        </div>
      </section>

      {/* --- MAIN BODY --- */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-5 space-y-6">

        {/* ========================================================
            TAB 1: EXECUTIVE DASHBOARD WITH REMAINING BALANCES
        ======================================================== */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            
            {/* Top 4 KPI Cards - Including Grand Remaining Balance */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              
              {/* Grand Total Remaining Chit Balance (HIGH PRIORITY) */}
              <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 rounded-2xl p-4 text-white shadow-md relative overflow-hidden">
                <div className="relative z-10">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-semibold text-indigo-200 uppercase tracking-wider">Remaining Chit Balance</p>
                    <Wallet className="w-4 h-4 text-indigo-300" />
                  </div>
                  <h3 className="text-xl sm:text-2xl font-black mt-1 text-white tracking-tight">
                    {formatINR(dashboardMetrics.grandTotalRemainingBalance)}
                  </h3>
                  <p className="text-[10px] text-indigo-300 mt-1 font-medium">
                    Total uncollected tenure pool across {selectedChittiFilter === 'ALL' ? `all ${CHITTI_GROUPS.length} groups` : 'selected group'}
                  </p>
                </div>
                <div className="absolute -right-4 -bottom-4 w-20 h-20 bg-indigo-500/10 rounded-full blur-xl pointer-events-none"></div>
              </div>

              {/* Today's Collections */}
              <div className="bg-gradient-to-br from-emerald-600 to-teal-700 rounded-2xl p-4 text-white shadow-md shadow-emerald-700/20">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold text-emerald-100 uppercase tracking-wider">Collected Today</p>
                  <TrendingUp className="w-4 h-4 text-emerald-200" />
                </div>
                <h3 className="text-xl sm:text-2xl font-black mt-1 tracking-tight">
                  {formatINR(dashboardMetrics.totalCollectedToday)}
                </h3>
                <p className="text-[10px] text-emerald-100 mt-1">
                  Live verified entries ({todayStr})
                </p>
              </div>

              {/* Month Collections */}
              <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs">
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{selectedMonth} Collections</p>
                <h3 className="text-xl sm:text-2xl font-black text-slate-900 mt-1 tracking-tight">
                  {formatINR(dashboardMetrics.totalCollectedThisMonth)}
                </h3>
                <div className="mt-1 flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">Target: {formatINR(dashboardMetrics.grandTotalMonthExpected)}</span>
                  <span className="font-bold text-emerald-600">
                    {dashboardMetrics.grandTotalMonthExpected > 0 ? Math.round((dashboardMetrics.totalCollectedThisMonth / dashboardMetrics.grandTotalMonthExpected) * 100) : 0}%
                  </span>
                </div>
              </div>

              {/* Pending Month Balance */}
              <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs">
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Pending This Month</p>
                <h3 className="text-xl sm:text-2xl font-black text-rose-600 mt-1 tracking-tight">
                  {formatINR(dashboardMetrics.grandTotalMonthPending)}
                </h3>
                <p className="text-[10px] text-amber-600 mt-1 font-semibold flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>Due for {selectedMonth.split(' ')[0]} installments</span>
                </p>
              </div>

            </div>

            {/* Chitti Overview Ribbon Cards */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-emerald-700" />
                  <span>{CHITTI_GROUPS.length} Registered Chitti Portfolios</span>
                </h3>
                <button
                  onClick={() => setActiveTab('chittis')}
                  className="text-xs font-bold text-emerald-700 hover:text-emerald-800"
                >
                  View Details & Members →
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                {chittiStats.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => {
                      setSelectedChittiFilter(c.id);
                      setActiveTab('members');
                    }}
                    className={`bg-white rounded-2xl p-3.5 border transition cursor-pointer hover:shadow-md hover:border-emerald-500 flex flex-col justify-between ${
                      selectedChittiFilter === c.id ? 'border-emerald-600 ring-2 ring-emerald-100 shadow-sm' : 'border-slate-200 shadow-xs'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-mono font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                          {c.id}
                        </span>
                        <span className="text-[11px] font-bold text-emerald-700">
                          {formatINR(c.monthlyAmount)}/mo
                        </span>
                      </div>
                      <h4 className="font-bold text-slate-900 text-xs sm:text-sm line-clamp-1">{c.name}</h4>
                      <p className="text-[11px] text-slate-500 mt-0.5">{c.enrolledCount} enrolled members</p>
                      
                      {/* Remaining Balance Callout */}
                      <div className="mt-3 bg-slate-50 rounded-xl p-2 border border-slate-100 space-y-1">
                        <div className="flex justify-between text-[10px]">
                          <span className="text-slate-500">Remaining Bal:</span>
                          <span className="font-bold text-slate-900">{formatINR(c.totalRemainingChitBalance)}</span>
                        </div>
                        <div className="flex justify-between text-[10px]">
                          <span className="text-slate-500">Total Pool:</span>
                          <span className="font-semibold text-slate-700">{formatINR(c.totalPoolValue)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 pt-2 border-t border-slate-100">
                      <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                        <span>Paid: {c.percentageCollected}%</span>
                        <span>Rem: {100 - c.percentageCollected}%</span>
                      </div>
                      <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-emerald-600 h-full rounded-full"
                          style={{ width: `${c.percentageCollected}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Record CTA + Recent Transactions */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Recent Passbook entries */}
              <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-xs p-4 sm:p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-bold text-slate-900 text-base">Recent Payments & Receipts</h3>
                    <p className="text-xs text-slate-500">Instant entries with real-time remaining balance deductions</p>
                  </div>
                  <button
                    onClick={() => setActiveTab('payments')}
                    className="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1"
                  >
                    <span>Full Passbook</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-2.5">
                  {payments.slice(0, 5).map(pay => {
                    const chitti = CHITTI_GROUPS.find(c => c.id === pay.chittiId)
                      || deletedGroups.find(c => c.id === pay.chittiId);
                    return (
                      <div
                        key={pay.id}
                        className="flex items-center justify-between p-3 rounded-xl bg-slate-50 hover:bg-slate-100 transition border border-slate-100"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs ${
                            pay.paymentMode === 'UPI' ? 'bg-violet-100 text-violet-700' :
                            pay.paymentMode === 'Cash' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'
                          }`}>
                            {pay.paymentMode.slice(0, 3)}
                          </div>
                          <div>
                            <p className="text-xs sm:text-sm font-bold text-slate-900">{pay.memberName}</p>
                            <p className="text-[11px] text-slate-500">
                              {pay.chittiName || getChittiLabel(pay.chittiId)} • {pay.date} • <span className="font-mono">{pay.id}</span>
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="text-right">
                            <span className="font-black text-slate-900 text-sm block">+{formatINR(pay.amount)}</span>
                            <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded font-medium">
                              {pay.month}
                            </span>
                          </div>
                          <button
                            onClick={() => {
                              const fin = memberFinancials[pay.memberId];
                              const member = members.find(item => item.id === pay.memberId);
                              const memberTotalValue = member
                                ? getMemberTotalValue(member, chitti || EMPTY_CHITTI_GROUP)
                                : chitti?.totalValue;
                              setActiveReceipt({
                                ...pay,
                                chittiName: chitti?.name || pay.chittiName || getChittiLabel(pay.chittiId),
                                totalChitValue: memberTotalValue,
                                updatedRemainingBalance: fin?.remainingChitBalance
                              });
                            }}
                            className="p-1.5 text-slate-400 hover:text-emerald-700 hover:bg-white rounded-lg border border-transparent hover:border-slate-200 transition"
                            title="View Receipt Slip"
                          >
                            <Receipt className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Fast Action Card */}
              <div className="bg-gradient-to-br from-emerald-800 to-teal-900 rounded-2xl p-5 text-white shadow-md flex flex-col justify-between">
                <div>
                  <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-white mb-3">
                    <Sparkles className="w-5 h-5 text-emerald-300" />
                  </div>
                  <h4 className="text-lg font-bold">Fast Chitti Update</h4>
                  <p className="text-xs text-emerald-100 mt-1 leading-relaxed">
                    Select any member from your Chitti groups to record installment payments, print receipts, or share payment statements.
                  </p>

                  <div className="mt-4 p-3 bg-white/10 rounded-xl border border-white/10 space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-emerald-200">Current Branch:</span>
                      <span className="font-bold">Mancherial (TS)</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-emerald-200">Total Enrolled:</span>
                      <span className="font-bold">{members.length} Members</span>
                    </div>
                  </div>
                </div>

                <div className="mt-6 space-y-2">
                  <button
                    onClick={() => {
                      setActiveTab('members');
                      setStatusFilter('due');
                    }}
                    className="w-full bg-amber-400 hover:bg-amber-500 text-slate-950 font-bold text-xs py-2.5 px-4 rounded-xl shadow-xs transition active:scale-95 text-center"
                  >
                    View Due Members ({selectedMonth.split(' ')[0]})
                  </button>
                  <button
                    onClick={openAddMemberModal}
                    className="w-full bg-white/15 hover:bg-white/25 text-white font-semibold text-xs py-2.5 px-4 rounded-xl transition text-center"
                  >
                    + Enroll New Member
                  </button>
                </div>
              </div>

            </div>

          </div>
        )}

        {/* ========================================================
            TAB 2: THE 5 CHITTIS DEDICATED OVERVIEW
        ======================================================== */}
        {activeTab === 'chittis' && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Chitti Groups</h3>
                <p className="text-xs text-slate-500">Deleting a group also deletes its member and installment records. Payment transactions and receipts are kept.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={openAddMemberModal}
                  disabled={activeChittiGroups.length === 0}
                  className="bg-white hover:bg-emerald-50 disabled:opacity-50 text-emerald-800 border border-emerald-200 text-xs font-bold px-3.5 py-2.5 rounded-xl flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>Enroll Member</span>
                </button>
                <button
                  onClick={() => setIsAddChittiOpen(true)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3.5 py-2.5 rounded-xl flex items-center gap-1.5 shadow-sm active:scale-95"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create Chitti Group</span>
                </button>
              </div>
            </div>

            <div className="space-y-4">
              {chittiStats.map((c) => {
                const groupMembers = members.filter(m => m.chittiId === c.id);

                return (
                  <div key={c.id} className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-5 space-y-4">
                    <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-slate-100 pb-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            {c.id}
                          </span>
                          <h4 className="text-base sm:text-lg font-bold text-slate-900">{c.name}</h4>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Owner: {c.owner || INITIAL_BUSINESS_PROFILE.owner} • Average tenure: {c.totalMonths.toFixed(0)} months • Monthly installment: <span className="font-bold text-slate-800">{formatINR(c.monthlyAmount)}</span>
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setSelectedChittiFilter(c.id);
                            setStatusFilter('all');
                            setActiveTab('members');
                          }}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition"
                        >
                          View {groupMembers.length} Members
                        </button>
                        <button
                          onClick={() => deleteChittiGroup(c)}
                          className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-xl transition flex items-center gap-1"
                          title="Permanently delete this group and its member records, keeping payment history"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete
                        </button>
                      </div>
                    </div>

                    {/* Remaining Balance & Metrics Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div className="p-3 bg-slate-900 text-white rounded-xl">
                        <span className="text-slate-400 block font-medium">Remaining Tenure Balance:</span>
                        <span className="text-base sm:text-lg font-black text-white block mt-0.5">
                          {formatINR(c.totalRemainingChitBalance)}
                        </span>
                        <span className="text-[10px] text-slate-400 block mt-1">Across member schedules</span>
                      </div>

                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                        <span className="text-slate-500 block">Total Pool Value:</span>
                        <span className="text-base sm:text-lg font-black text-slate-900 block mt-0.5">
                          {formatINR(c.totalPoolValue)}
                        </span>
                        <span className="text-[10px] text-slate-400 block mt-1">{c.enrolledCount} enrolled • member-specific amounts</span>
                      </div>

                      <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                        <span className="text-emerald-700 block font-semibold">Total Realized So Far:</span>
                        <span className="text-base sm:text-lg font-black text-emerald-800 block mt-0.5">
                          {formatINR(c.totalCollectedLifetime)}
                        </span>
                        <span className="text-[10px] text-emerald-700 block mt-1">{c.percentageCollected}% Complete</span>
                      </div>

                      <div className="p-3 bg-amber-50 rounded-xl border border-amber-200">
                        <span className="text-amber-800 block font-semibold">{selectedMonth.split(' ')[0]} Pending:</span>
                        <span className="text-base sm:text-lg font-black text-amber-900 block mt-0.5">
                          {formatINR(c.monthPending)}
                        </span>
                        <span className="text-[10px] text-amber-700 block mt-1">From {c.enrolledCount} members</span>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div>
                      <div className="flex justify-between text-xs text-slate-600 font-medium mb-1.5">
                        <span>Paid to Date: {formatINR(c.totalCollectedLifetime)}</span>
                        <span className="font-bold text-slate-800">Remaining to Collect: {formatINR(c.totalRemainingChitBalance)}</span>
                      </div>
                      <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden flex">
                        <div
                          className="bg-emerald-600 h-full rounded-l-full"
                          style={{ width: `${c.percentageCollected}%` }}
                        ></div>
                        <div
                          className="bg-slate-300 h-full rounded-r-full"
                          style={{ width: `${100 - c.percentageCollected}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {chittiStats.length === 0 && (
                <div className="text-center py-12 bg-white rounded-2xl border border-slate-200 p-6">
                  <Layers className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                  <h4 className="font-bold text-slate-700">No Chitti groups yet</h4>
                  <button onClick={() => setIsAddChittiOpen(true)} className="mt-3 text-sm font-bold text-emerald-700 hover:text-emerald-800">
                    Create your first Chitti group
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================
            TAB 3: MEMBERS DIRECTORY & PROMINENT REMAINING BALANCE
        ======================================================== */}
        {activeTab === 'members' && (
          <div className="space-y-4">
            
            {/* Filter Bar */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-3">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                
                {/* Search */}
                <div className="relative w-full sm:w-80">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search member, phone, chitti..."
                    className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Status Badges & Add */}
                <div className="flex items-center justify-between sm:justify-end w-full sm:w-auto gap-2">
                  <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
                    <button
                      onClick={() => setStatusFilter('all')}
                      className={`px-2.5 py-1 rounded-lg transition ${
                        statusFilter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                      }`}
                    >
                      All ({filteredMembers.length})
                    </button>
                    <button
                      onClick={() => setStatusFilter('due')}
                      className={`px-2.5 py-1 rounded-lg transition ${
                        statusFilter === 'due' ? 'bg-white text-amber-700 shadow-xs font-bold' : 'text-slate-600'
                      }`}
                    >
                      Due
                    </button>
                    <button
                      onClick={() => setStatusFilter('overdue')}
                      className={`px-2.5 py-1 rounded-lg transition ${
                        statusFilter === 'overdue' ? 'bg-white text-rose-700 shadow-xs font-bold' : 'text-slate-600'
                      }`}
                    >
                      Overdue
                    </button>
                    <button
                      onClick={() => setStatusFilter('uptodate')}
                      className={`px-2.5 py-1 rounded-lg transition ${
                        statusFilter === 'uptodate' ? 'bg-white text-emerald-700 shadow-xs font-bold' : 'text-slate-600'
                      }`}
                    >
                      Cleared
                    </button>
                  </div>

                  <div className="flex gap-1.5">
                    <button
                      onClick={handleImportPhoneContacts}
                      title="Import contacts from this phone"
                      className="bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold px-2.5 py-2 rounded-xl flex items-center gap-1 shadow-xs active:scale-95"
                    >
                      <Contact className="w-4 h-4" />
                      <span className="hidden sm:inline">Import contacts</span>
                    </button>
                    <button
                      onClick={openAddMemberModal}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-2 rounded-xl flex items-center gap-1 shadow-xs active:scale-95"
                    >
                      <Plus className="w-4 h-4" />
                      <span className="hidden sm:inline">Add Member</span>
                    </button>
                  </div>
                </div>

              </div>
              <input
                ref={vCardInputRef}
                type="file"
                accept=".vcf,text/vcard"
                className="hidden"
                aria-label="Choose a vCard contacts file"
                onChange={handleVCardImport}
              />
              <p className="text-[11px] text-slate-500">
                Phone contact access is only requested when you tap Import. Selected contacts are added to {selectedChittiFilter === 'ALL' ? 'Chitti 1' : CHITTI_GROUPS.find(group => group.id === selectedChittiFilter)?.shortName}; duplicates and contacts without a valid Indian mobile number are skipped.
              </p>
            </div>

            {/* Member Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredMembers.map((member) => {
                const chitti = CHITTI_GROUPS.find(c => c.id === member.chittiId) || EMPTY_CHITTI_GROUP;
                const memberTotalValue = getMemberTotalValue(member, chitti);
                const memberMonthlyAmount = getMemberMonthlyAmount(member, chitti);
                const memberDuration = getMemberDuration(member, chitti);
                const fin = memberFinancials[member.id] || {
                  totalPaidLifetime: 0,
                  remainingChitBalance: memberTotalValue,
                  completionPercentage: 0,
                  monthPending: memberMonthlyAmount,
                  isMonthCleared: false
                };

                return (
                  <div
                    key={member.id}
                    className="bg-white rounded-2xl border border-slate-200/90 shadow-xs hover:shadow-md transition p-4 sm:p-5 flex flex-col justify-between"
                  >
                    <div>
                      {/* Top Row: Identity and Chitti Badge */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                              {member.id}
                            </span>
                            <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                              {chitti.shortName}
                            </span>
                          </div>
                          <h4 className="font-bold text-slate-900 text-base mt-1.5">{member.name}</h4>
                          {(member.prizeMoneyLifted || member.chittiCompleted) && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {member.prizeMoneyLifted && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-violet-800 bg-violet-50 border border-violet-200 px-2 py-0.5 rounded-full">
                                  <Wallet className="w-3 h-3" />
                                  Prize money lifted
                                </span>
                              )}
                              {member.chittiCompleted && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                                  <CheckCircle2 className="w-3 h-3" />
                                  Chitti completed
                                </span>
                              )}
                            </div>
                          )}
                          <a
                            href={`tel:${getDialablePhone(member.phone)}`}
                            aria-label={`Call ${member.name} at +91 ${member.phone}`}
                            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-emerald-700 font-medium mt-0.5"
                          >
                            <Phone className="w-3 h-3 text-emerald-600" />
                            <span>+91 {member.phone}</span>
                          </a>
                        </div>

                        {/* Month Status Badge */}
                        <div>
                          {fin.isMonthCleared ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-emerald-50 text-emerald-700 px-2 py-1 rounded-lg border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Paid ({selectedMonth.split(' ')[0]})</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-amber-50 text-amber-700 px-2 py-1 rounded-lg border border-amber-200">
                              <Clock className="w-3 h-3" />
                              <span>Due {formatINR(fin.monthPending)}</span>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* PROMINENT REMAINING BALANCE & STATS BOX */}
                      <div className="my-3 p-3.5 bg-slate-50 rounded-xl space-y-2 border border-slate-100 text-xs">
                        
                        {/* Highlighted Remaining Balance */}
                        <div className="flex justify-between items-center bg-white p-2 rounded-lg border border-slate-200 shadow-2xs">
                          <span className="text-slate-600 font-semibold">Remaining Balance to Pay:</span>
                          <span className="font-black text-rose-600 text-sm">{formatINR(fin.remainingChitBalance)}</span>
                        </div>

                        <div className="flex justify-between text-slate-600">
                          <span>Total Chit Value:</span>
                          <span className="font-bold text-slate-800">{formatINR(memberTotalValue)}</span>
                        </div>

                        <div className="flex justify-between text-slate-600">
                          <span>Total Paid So Far:</span>
                          <span className="font-bold text-emerald-700">{formatINR(fin.totalPaidLifetime)}</span>
                        </div>

                        <div className="flex justify-between text-slate-600">
                          <span>Monthly Installment:</span>
                          <span className="font-semibold text-slate-800">{formatINR(memberMonthlyAmount)}</span>
                        </div>
                        <div className="flex justify-between text-slate-600">
                          <span>Duration / Dates:</span>
                          <span className="font-medium text-right">{memberDuration} months<br />{getMemberStartDate(member)} to {getMemberEndDate(member, chitti)}</span>
                        </div>

                        {/* Progress Bar of Completion */}
                        <div className="pt-1">
                          <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                            <span>Paid: {fin.completionPercentage}%</span>
                            <span>Remaining: {100 - fin.completionPercentage}%</span>
                          </div>
                          <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                            <div
                              className="bg-emerald-600 h-full rounded-full"
                              style={{ width: `${fin.completionPercentage}%` }}
                            ></div>
                          </div>
                        </div>

                      </div>

                    </div>

                    {/* Action Buttons */}
                    <div className="pt-3 border-t border-slate-100 flex items-center gap-2">
                      <button
                        onClick={() => openUpdateMoneyModal(member)}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold py-2.5 px-3 rounded-xl shadow-xs transition flex items-center justify-center gap-1.5"
                      >
                        <CreditCard className="w-3.5 h-3.5" />
                        <span>Update Money</span>
                      </button>

                      <button
                        onClick={() => setMemberDetailModal(member)}
                        className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition text-xs font-bold"
                        title="View Full Ledger History & Passbook"
                      >
                        <History className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => deleteMember(member)}
                        className="p-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl transition"
                        aria-label={`Permanently delete member ${member.name}`}
                        title="Permanently delete member records, preserving payment history"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                  </div>
                );
              })}
            </div>

            {filteredMembers.length === 0 && (
              <div className="text-center py-12 bg-white rounded-2xl border border-slate-200 p-6">
                <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <h4 className="font-bold text-slate-700">No members found in this view</h4>
                <p className="text-xs text-slate-400 mt-1">Try switching the Chitti filter at the top or clearing search keywords.</p>
              </div>
            )}

          </div>
        )}

        {/* ========================================================
            TAB 4: PASSBOOK LEDGER & TRANSACTIONS
        ======================================================== */}
        {activeTab === 'payments' && (
          <div className="space-y-4">
            
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Passbook Ledger Entries</h3>
                <p className="text-xs text-slate-500">
                  Showing transactions for {selectedChittiFilter === 'ALL' ? `All ${CHITTI_GROUPS.length} Chittis` : CHITTI_GROUPS.find(c => c.id === selectedChittiFilter)?.name}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={exportToCSV}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl text-xs font-bold border border-emerald-200 transition"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  <span>Export CSV</span>
                </button>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs sm:text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[11px] tracking-wider">
                      <th className="py-3 px-4">Receipt #</th>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Member Name</th>
                      <th className="py-3 px-4">Chitti Scheme</th>
                      <th className="py-3 px-4">Month</th>
                      <th className="py-3 px-4">Mode / Ref</th>
                      <th className="py-3 px-4 text-right">Amount</th>
                      <th className="py-3 px-4 text-center">Receipt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {payments
                      .filter(p => selectedChittiFilter === 'ALL' || p.chittiId === selectedChittiFilter)
                      .map((p) => {
                        const chitti = CHITTI_GROUPS.find(c => c.id === p.chittiId)
                          || deletedGroups.find(c => c.id === p.chittiId);
                        const fin = memberFinancials[p.memberId];
                        const member = members.find(item => item.id === p.memberId);
                        const memberTotalValue = member
                          ? getMemberTotalValue(member, chitti || EMPTY_CHITTI_GROUP)
                          : chitti?.totalValue;

                        return (
                          <tr key={p.id} className="hover:bg-slate-50/80 transition">
                            <td className="py-3 px-4 font-mono font-bold text-emerald-700 whitespace-nowrap">
                              {p.id}
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap">
                              <span className="font-semibold text-slate-800">{p.date}</span>
                            </td>
                            <td className="py-3 px-4 font-bold text-slate-900">
                              {p.memberName}
                              <span className="block text-[10px] text-slate-400 font-normal">ID: {p.memberId}</span>
                            </td>
                            <td className="py-3 px-4">
                              <span className="font-semibold text-slate-800 block">{p.chittiName || getChittiLabel(p.chittiId)}</span>
                              {memberTotalValue !== undefined && (
                                <span className="text-[10px] text-slate-400">Pool: {formatINR(memberTotalValue)}</span>
                              )}
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap">
                              <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-medium text-xs">
                                {p.month}
                              </span>
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap">
                              <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                                p.paymentMode === 'UPI' ? 'bg-violet-100 text-violet-700' :
                                p.paymentMode === 'Cash' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'
                              }`}>
                                {p.paymentMode}
                              </span>
                              <span className="block text-[10px] text-slate-400 truncate max-w-[110px]">{p.referenceId}</span>
                            </td>
                            <td className="py-3 px-4 text-right font-black text-slate-900 text-sm whitespace-nowrap">
                              +{formatINR(p.amount)}
                            </td>
                            <td className="py-3 px-4 text-center">
                              <button
                                onClick={() => setActiveReceipt({
                                  ...p,
                                  chittiName: chitti?.name || p.chittiName || getChittiLabel(p.chittiId),
                                  totalChitValue: memberTotalValue,
                                  updatedRemainingBalance: fin?.remainingChitBalance
                                })}
                                className="p-1.5 text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition"
                                title="Open Printable Receipt"
                              >
                                <Receipt className="w-4 h-4 mx-auto" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

        {/* ========================================================
            TAB 5: AUDIT REPORTS & REMAINING RECONCILIATIONS
        ======================================================== */}
        {activeTab === 'reports' && (
          <div className="space-y-6">
            
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 pb-4">
                <div>
                  <h3 className="font-bold text-slate-900 text-lg">Financial Audit & Remaining Balance Statement</h3>
                  <p className="text-xs text-slate-500">Consolidated reconciliation for {selectedMonth} across all {CHITTI_GROUPS.length} groups</p>
                </div>
                <button
                  onClick={exportToCSV}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-xs transition active:scale-95"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Complete Statement</span>
                </button>
              </div>

              {/* 5-Chitti Breakdown Table */}
              <div>
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">5 Chitti Reconciliation Summary</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs sm:text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold text-[11px] uppercase">
                        <th className="py-2.5 px-3">Chitti Group</th>
                        <th className="py-2.5 px-3">Members</th>
                        <th className="py-2.5 px-3">Total Chit Pool</th>
                        <th className="py-2.5 px-3">Lifetime Realized</th>
                        <th className="py-2.5 px-3 text-rose-700 font-extrabold">Total Remaining Balance</th>
                        <th className="py-2.5 px-3 text-right">{selectedMonth.split(' ')[0]} Collected</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {chittiStats.map((c) => (
                        <tr key={c.id} className="hover:bg-slate-50">
                          <td className="py-3 px-3 font-bold text-slate-900">{c.name}</td>
                          <td className="py-3 px-3">{c.enrolledCount} enrolled</td>
                          <td className="py-3 px-3 font-semibold">{formatINR(c.totalPoolValue)}</td>
                          <td className="py-3 px-3 text-emerald-700 font-semibold">{formatINR(c.totalCollectedLifetime)}</td>
                          <td className="py-3 px-3 text-rose-700 font-black">{formatINR(c.totalRemainingChitBalance)}</td>
                          <td className="py-3 px-3 text-right font-black text-slate-900">{formatINR(c.monthCollected)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Payment Mode Distribution */}
              <div className="pt-4 border-t border-slate-100">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Collections by Mode ({selectedMonth})</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                  {['UPI', 'Cash', 'Bank Transfer', 'Cheque'].map(mode => {
                    const modeTotal = payments
                      .filter(p => p.month === selectedMonth && p.paymentMode.toLowerCase() === mode.toLowerCase())
                      .reduce((sum, p) => sum + Number(p.amount), 0);
                    return (
                      <div key={mode} className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                        <span className="text-xs font-bold text-slate-700 block">{mode}</span>
                        <span className="text-sm sm:text-base font-black text-slate-900 mt-0.5 block">{formatINR(modeTotal)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>

          </div>
        )}

      </main>

      {/* ========================================================
          MODAL 1: "UPDATE MONEY" / RECORD PAYMENT MODAL
      ======================================================== */}
      {isUpdateMoneyOpen && selectedMemberForPayment && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-5 sm:p-6 border border-slate-100 animate-scaleUp">
            
            {(() => {
              const chitti = CHITTI_GROUPS.find(c => c.id === selectedMemberForPayment.chittiId) || EMPTY_CHITTI_GROUP;
              const fin = memberFinancials[selectedMemberForPayment.id];
              const memberTotalValue = getMemberTotalValue(selectedMemberForPayment, chitti);
              const memberMonthlyAmount = getMemberMonthlyAmount(selectedMemberForPayment, chitti);

              return (
                <>
                  {/* Modal Header */}
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                    <div>
                      <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        {chitti.shortName}
                      </span>
                      <h3 className="text-lg font-bold text-slate-900 mt-1">
                        Update Money: {selectedMemberForPayment.name}
                      </h3>
                    </div>
                    <button 
                      onClick={() => setIsUpdateMoneyOpen(false)}
                      className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Context Box - Prominently Showing Remaining Balance */}
                  <div className="bg-slate-50 p-3.5 rounded-xl mb-4 border border-slate-200 text-xs space-y-1.5">
                    <div className="flex justify-between items-center bg-rose-50/70 p-2 rounded-lg border border-rose-200">
                      <span className="font-bold text-rose-800">Remaining Chit Balance to Pay:</span>
                      <span className="font-black text-rose-700 text-sm">{formatINR(fin?.remainingChitBalance ?? memberTotalValue)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Monthly Installment:</span>
                      <span className="font-bold text-slate-900">{formatINR(memberMonthlyAmount)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Total Deposited So Far:</span>
                      <span className="font-semibold text-emerald-700">{formatINR(fin?.totalPaidLifetime || 0)}</span>
                    </div>
                  </div>

                  {/* Payment Form */}
                  <form onSubmit={handleRecordPayment} className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Amount Received (₹ INR) *
                      </label>
                      <div className="relative">
                        <span className="absolute left-3.5 top-2.5 text-slate-400 font-bold text-lg">₹</span>
                        <input
                          type="number"
                          required
                          min="1"
                          value={paymentForm.amount}
                          onChange={(e) => {
                            setPaymentForm({...paymentForm, amount: e.target.value});
                            setDuplicateWarning("");
                          }}
                          className="w-full pl-9 pr-4 py-2.5 bg-white border-2 border-emerald-500/40 focus:border-emerald-600 rounded-xl font-bold text-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                        />
                      </div>
                      
                      {/* Fast Pill Buttons */}
                      <div className="flex gap-2 mt-1.5">
                        <button
                          type="button"
                          onClick={() => setPaymentForm({...paymentForm, amount: memberMonthlyAmount.toFixed(2).replace(/\.00$/, '')})}
                          className="text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-1 rounded font-semibold"
                        >
                          Full Month: {formatINR(memberMonthlyAmount)}
                        </button>
                        <button
                          type="button"
                          onClick={() => setPaymentForm({...paymentForm, amount: (memberMonthlyAmount / 2).toFixed(2).replace(/\.00$/, '')})}
                          className="text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-1 rounded font-semibold"
                        >
                          Half: {formatINR(memberMonthlyAmount / 2)}
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Installment Month *
                        </label>
                        <select
                          value={paymentForm.month}
                          onChange={(e) => setPaymentForm({...paymentForm, month: e.target.value})}
                          className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        >
                          {availableMonths.map(m => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Payment Date (Asia/Kolkata) *
                        </label>
                        <input
                          type="date"
                          required
                          value={paymentForm.date}
                          onChange={(e) => setPaymentForm({...paymentForm, date: e.target.value})}
                          className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Payment Mode *
                      </label>
                      <div className="grid grid-cols-4 gap-2">
                        {['UPI', 'Cash', 'Bank Transfer', 'Cheque'].map(mode => (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => setPaymentForm({...paymentForm, paymentMode: mode})}
                            className={`py-2 px-1 text-xs font-bold rounded-xl border text-center transition ${
                              paymentForm.paymentMode === mode
                                ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                            }`}
                          >
                            {mode}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Transaction Ref / UPI UTR / Cheque No.
                      </label>
                      <input
                        type="text"
                        value={paymentForm.referenceId}
                        onChange={(e) => setPaymentForm({...paymentForm, referenceId: e.target.value})}
                        placeholder="e.g. UPI/329482910, CHQ-10492"
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Remarks / Notes
                      </label>
                      <input
                        type="text"
                        value={paymentForm.notes}
                        onChange={(e) => setPaymentForm({...paymentForm, notes: e.target.value})}
                        placeholder="e.g. Paid in office, PhonePe QR transfer"
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>

                    {/* Duplicate Guard Trigger */}
                    {duplicateWarning && (
                      <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-800 flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold">Duplicate Warning</span>
                          <p className="mt-0.5">{duplicateWarning}</p>
                        </div>
                      </div>
                    )}

                    <div className="pt-2 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setIsUpdateMoneyOpen(false)}
                        className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/30 flex items-center gap-1.5"
                      >
                        <Check className="w-4 h-4" />
                        <span>{duplicateWarning ? "Confirm Duplicate & Record" : "Save Payment & Issue Receipt"}</span>
                      </button>
                    </div>

                  </form>
                </>
              );
            })()}

          </div>
        </div>
      )}

      {/* ========================================================
          MODAL 2: PRINTABLE DIGITAL RECEIPT WITH REMAINING BALANCE
      ======================================================== */}
      {activeReceipt && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-slate-200 animate-scaleUp">
            
            <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-2">
              <span className="text-xs font-bold text-slate-400">Official Payment Slip</span>
              <button 
                onClick={() => setActiveReceipt(null)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Receipt Box */}
            <div id="receipt-paper" className="p-5 border-2 border-dashed border-slate-300 rounded-2xl bg-white relative">
              <div className="text-center pb-3 border-b border-slate-200">
                <div className="w-8 h-8 rounded-lg bg-emerald-700 text-white flex items-center justify-center font-bold text-sm mx-auto mb-1">
                  ₹
                </div>
                <h3 className="font-extrabold text-slate-900 text-base leading-tight">
                  {INITIAL_BUSINESS_PROFILE.name}
                </h3>
                <p className="text-[10px] text-slate-500 mt-0.5">{INITIAL_BUSINESS_PROFILE.address}</p>
                <p className="text-[10px] text-slate-500 font-mono">Reg: {INITIAL_BUSINESS_PROFILE.regNo} | Tel: {INITIAL_BUSINESS_PROFILE.phone}</p>
              </div>

              <div className="py-4 space-y-2 text-xs">
                <div className="flex justify-between items-center bg-slate-50 p-2 rounded-lg font-mono">
                  <span className="text-slate-500">Receipt No:</span>
                  <span className="font-bold text-emerald-800">{activeReceipt.id}</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-slate-500">Date & Time:</span>
                  <span className="font-semibold text-slate-800">{activeReceipt.date} (IST)</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-slate-500">Received From:</span>
                  <span className="font-bold text-slate-900">{activeReceipt.memberName}</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-slate-500">Member ID:</span>
                  <span className="font-mono text-slate-700">{activeReceipt.memberId}</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-slate-500">Chitti Scheme:</span>
                  <span className="font-semibold text-slate-800 text-right">{activeReceipt.chittiName || "Registered Chitti Group"}</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-slate-500">Installment Month:</span>
                  <span className="font-bold text-emerald-700">{activeReceipt.month}</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-slate-500">Mode / Ref:</span>
                  <span className="font-mono text-[11px] text-slate-700">{activeReceipt.paymentMode} ({activeReceipt.referenceId})</span>
                </div>

                <div className="pt-2 border-t border-slate-200 flex justify-between items-center text-sm">
                  <span className="font-extrabold text-slate-900">Amount Received:</span>
                  <span className="text-xl font-black text-emerald-700">{formatINR(activeReceipt.amount)}</span>
                </div>

                {/* Highlighted Remaining Balance on Receipt */}
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl flex justify-between items-center mt-2">
                  <span className="text-xs font-bold text-rose-800">Remaining Chit Balance:</span>
                  <span className="text-base font-black text-rose-700">{formatINR(activeReceipt.updatedRemainingBalance ?? 0)}</span>
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
                <div>
                  <span className="block font-semibold text-slate-600">Authorized Officer</span>
                  <span>{activeReceipt.collectedBy}</span>
                </div>
                <div className="border border-emerald-600 text-emerald-700 font-extrabold text-[9px] uppercase px-2 py-0.5 rounded rotate-[-4deg] tracking-wider">
                  VERIFIED PAYMENT
                </div>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                onClick={() => shareWhatsAppReceipt(activeReceipt)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2.5 px-3 rounded-xl flex items-center justify-center gap-1.5 shadow-xs active:scale-95 transition"
              >
                <Share2 className="w-4 h-4" />
                <span>WhatsApp Slip</span>
              </button>

              <button
                onClick={() => window.print()}
                className="bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs py-2.5 px-3 rounded-xl flex items-center justify-center gap-1.5 transition active:scale-95"
              >
                <Printer className="w-4 h-4" />
                <span>Print Slip</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {isAddChittiOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-5 sm:p-6 border border-slate-100 animate-scaleUp">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Create Chitti Group</h3>
                <p className="text-xs text-slate-500">Set the group name, total pool amount, and installment duration.</p>
              </div>
              <button
                onClick={() => setIsAddChittiOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
                aria-label="Close create group form"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateChittiGroup} className="space-y-4">
              <div>
                <label htmlFor="chitti-group-name" className="block text-xs font-bold text-slate-700 mb-1">Group name *</label>
                <input
                  id="chitti-group-name"
                  required
                  maxLength={100}
                  value={newGroupForm.name}
                  onChange={event => setNewGroupForm({ ...newGroupForm, name: event.target.value })}
                  placeholder="e.g. Festival Savings Chitti"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="chitti-group-amount" className="block text-xs font-bold text-slate-700 mb-1">Total amount (₹) *</label>
                  <input
                    id="chitti-group-amount"
                    required
                    type="number"
                    min="1"
                    max="100000000"
                    step="0.01"
                    value={newGroupForm.totalAmount}
                    onChange={event => setNewGroupForm({ ...newGroupForm, totalAmount: event.target.value })}
                    placeholder="100000"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label htmlFor="chitti-group-duration" className="block text-xs font-bold text-slate-700 mb-1">Duration (months) *</label>
                  <input
                    id="chitti-group-duration"
                    required
                    type="number"
                    min="1"
                    max="600"
                    step="1"
                    value={newGroupForm.durationMonths}
                    onChange={event => setNewGroupForm({ ...newGroupForm, durationMonths: event.target.value })}
                    placeholder="20"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
              {Number(newGroupForm.totalAmount) > 0 && Number(newGroupForm.durationMonths) > 0 && (
                <p className="text-xs text-slate-600">
                  Approximate monthly installment: <strong>{formatINR(Number(newGroupForm.totalAmount) / Number(newGroupForm.durationMonths))}</strong>
                </p>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddChittiOpen(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl"
                >
                  Create Group
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL 3: ENROLL NEW MEMBER WITH CHITTI SELECTION
      ======================================================== */}
      {isAddMemberOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-5 sm:p-6 border border-slate-100 animate-scaleUp">
            
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Enroll New Chitti Member</h3>
                <p className="text-xs text-slate-500">Register a member in one of your Chitti groups</p>
              </div>
              <button 
                onClick={() => setIsAddMemberOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddMember} className="space-y-4">
              
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Select Chitti Scheme *</label>
                <select
                  value={newMemberForm.chittiId}
                  onChange={(e) => {
                    const group = CHITTI_GROUPS.find(item => item.id === e.target.value) || EMPTY_CHITTI_GROUP;
                    const durationMonths = group.totalMonths;
                    setNewMemberForm({
                      ...newMemberForm,
                      chittiId: group.id,
                      chitTotalAmount: group.totalValue > 0 ? String(group.totalValue) : '',
                      durationMonths: durationMonths > 0 ? String(durationMonths) : '',
                      endDate: durationMonths > 0
                        ? endDateForDuration(newMemberForm.startDate, durationMonths)
                        : ''
                    });
                  }}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {CHITTI_GROUPS.map(cg => (
                    <option key={cg.id} value={cg.id}>
                      {cg.name} ({cg.totalValue > 0
                        ? `Value: ${formatINR(cg.totalValue)} | ${formatINR(cg.monthlyAmount)}/mo`
                        : `Owner: ${cg.owner} | enter amount and duration`})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Chitti Total Amount (₹) *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    step="0.01"
                    value={newMemberForm.chitTotalAmount}
                    onChange={(e) => setNewMemberForm({...newMemberForm, chitTotalAmount: e.target.value})}
                    placeholder="Type total amount"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Duration (months) *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    max="600"
                    step="1"
                    value={newMemberForm.durationMonths}
                    onChange={(e) => {
                      const durationMonths = e.target.value;
                      const numericDuration = Number(durationMonths);
                      setNewMemberForm({
                        ...newMemberForm,
                        durationMonths,
                        ...(Number.isInteger(numericDuration) && numericDuration > 0
                          ? { endDate: endDateForDuration(newMemberForm.startDate, numericDuration) }
                          : {})
                      });
                    }}
                    placeholder="e.g. 20"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Start Date *</label>
                  <input
                    type="date"
                    required
                    value={newMemberForm.startDate}
                    onChange={(e) => {
                      const startDate = e.target.value;
                      const durationMonths = Number(newMemberForm.durationMonths);
                      setNewMemberForm({
                        ...newMemberForm,
                        startDate,
                        ...(startDate && Number.isInteger(durationMonths) && durationMonths > 0
                          ? { endDate: endDateForDuration(startDate, durationMonths) }
                          : {})
                      });
                    }}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">End Date *</label>
                  <input
                    type="date"
                    required
                    min={newMemberForm.startDate}
                    value={newMemberForm.endDate}
                    onChange={(e) => setNewMemberForm({...newMemberForm, endDate: e.target.value})}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
              {Number(newMemberForm.chitTotalAmount) > 0 && Number(newMemberForm.durationMonths) > 0 && (
                <p className="text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                  Approximate monthly installment: {formatINR(Number(newMemberForm.chitTotalAmount) / Number(newMemberForm.durationMonths))}
                </p>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Full Member Name *</label>
                <input
                  type="text"
                  required
                  value={newMemberForm.name}
                  onChange={(e) => setNewMemberForm({...newMemberForm, name: e.target.value})}
                  placeholder="e.g. M. Srinivas Goud"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Mobile Number (India) *</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-slate-400 font-bold text-xs">+91</span>
                  <input
                    type="tel"
                    required
                    maxLength={10}
                    value={newMemberForm.phone}
                    onChange={(e) => setNewMemberForm({...newMemberForm, phone: e.target.value.replace(/\D/g, '')})}
                    placeholder="9876543210"
                    className="w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nominee Name & Relation</label>
                <input
                  type="text"
                  value={newMemberForm.nominee}
                  onChange={(e) => setNewMemberForm({...newMemberForm, nominee: e.target.value})}
                  placeholder="e.g. M. Sumalatha (Wife)"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Residential Address</label>
                <input
                  type="text"
                  value={newMemberForm.address}
                  onChange={(e) => setNewMemberForm({...newMemberForm, address: e.target.value})}
                  placeholder="e.g. H.No 2-34, Bellampalli Road, Mancherial"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddMemberOpen(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/30 flex items-center gap-1.5"
                >
                  <UserCheck className="w-4 h-4" />
                  <span>Confirm Enrollment</span>
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* ========================================================
          MODAL 4: INDIVIDUAL MEMBER PASSBOOK & REMAINING DETAIL
      ======================================================== */}
      {memberDetailModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full p-5 sm:p-6 border border-slate-100 animate-scaleUp">
            
            {(() => {
              const chitti = CHITTI_GROUPS.find(c => c.id === memberDetailModal.chittiId) || EMPTY_CHITTI_GROUP;
              const memberTotalValue = getMemberTotalValue(memberDetailModal, chitti);
              const memberMonthlyAmount = getMemberMonthlyAmount(memberDetailModal, chitti);
              const fin = memberFinancials[memberDetailModal.id] || { totalPaidLifetime: 0, remainingChitBalance: memberTotalValue };
              const memberTransactions = payments.filter(p => p.memberId === memberDetailModal.id);

              return (
                <div className="space-y-4">
                  <div className="flex items-start justify-between border-b border-slate-100 pb-3">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                          {memberDetailModal.id}
                        </span>
                        <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          {chitti.name}
                        </span>
                      </div>
                      <h3 className="text-xl font-bold text-slate-900 mt-1">{memberDetailModal.name}</h3>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {memberDetailModal.prizeMoneyLifted && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-violet-800 bg-violet-50 border border-violet-200 px-2 py-1 rounded-full">
                            <Wallet className="w-3 h-3" />
                            Prize money lifted
                          </span>
                        )}
                        {memberDetailModal.chittiCompleted && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-full">
                            <CheckCircle2 className="w-3 h-3" />
                            Chitti completed
                          </span>
                        )}
                        {!memberDetailModal.prizeMoneyLifted && !memberDetailModal.chittiCompleted && (
                          <span className="text-[10px] text-slate-400">No milestone tags</span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Nominee: {memberDetailModal.nominee}
                      </p>
                      <a
                        href={`tel:${getDialablePhone(memberDetailModal.phone)}`}
                        className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-emerald-700 font-medium mt-1"
                      >
                        <Phone className="w-3 h-3 text-emerald-600" />
                        <span>+91 {memberDetailModal.phone} · Tap to call</span>
                      </a>
                    </div>
                    <button 
                      onClick={() => setMemberDetailModal(null)}
                      className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="rounded-xl border border-slate-200 p-3">
                    <h4 className="text-xs font-bold text-slate-700 mb-2">Chitti Milestones</h4>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <button
                        type="button"
                        onClick={() => updateMemberMilestone(
                          memberDetailModal,
                          'prizeMoneyLifted',
                          !memberDetailModal.prizeMoneyLifted
                        )}
                        aria-pressed={memberDetailModal.prizeMoneyLifted === true}
                        className={`flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-xs font-bold transition ${
                          memberDetailModal.prizeMoneyLifted
                            ? 'bg-violet-50 border-violet-200 text-violet-800'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <Wallet className="w-4 h-4" />
                        {memberDetailModal.prizeMoneyLifted ? 'Prize money lifted' : 'Mark prize money lifted'}
                      </button>
                      <button
                        type="button"
                        onClick={() => updateMemberMilestone(
                          memberDetailModal,
                          'chittiCompleted',
                          !memberDetailModal.chittiCompleted
                        )}
                        aria-pressed={memberDetailModal.chittiCompleted === true}
                        className={`flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-xs font-bold transition ${
                          memberDetailModal.chittiCompleted
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        {memberDetailModal.chittiCompleted ? 'Chitti completed' : 'Mark Chitti completed'}
                      </button>
                    </div>
                  </div>

                  {/* Highlights Grid */}
                  <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                    <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                      <span className="text-xs text-slate-500 font-semibold block">Total Chit Pool:</span>
                      <span className="text-lg font-black text-slate-900 block mt-0.5">{formatINR(memberTotalValue)}</span>
                    </div>

                    <div className="bg-rose-50 p-2.5 rounded-lg border border-rose-200">
                      <span className="text-xs text-rose-800 font-bold block">Remaining Balance:</span>
                      <span className="text-lg font-black text-rose-700 block mt-0.5">{formatINR(fin.remainingChitBalance)}</span>
                    </div>

                    <div className="bg-emerald-50 p-2.5 rounded-lg border border-emerald-200">
                      <span className="text-xs text-emerald-800 font-semibold block">Total Realized to Date:</span>
                      <span className="text-base font-black text-emerald-700 block mt-0.5">{formatINR(fin.totalPaidLifetime)}</span>
                    </div>

                    <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                      <span className="text-xs text-slate-500 font-semibold block">Monthly Installment:</span>
                      <span className="text-base font-black text-slate-800 block mt-0.5">{formatINR(memberMonthlyAmount)}</span>
                    </div>
                    <div className="bg-white p-2.5 rounded-lg border border-slate-200 col-span-2">
                      <span className="text-xs text-slate-500 font-semibold block">Duration & Dates:</span>
                      <span className="text-sm font-bold text-slate-800 block mt-0.5">
                        {getMemberDuration(memberDetailModal, chitti)} months • {getMemberStartDate(memberDetailModal)} to {getMemberEndDate(memberDetailModal, chitti)}
                      </span>
                    </div>
                  </div>

                  {/* Transaction History for this Member */}
                  <div>
                    <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                      Personal Passbook History ({memberTransactions.length} receipts)
                    </h4>

                    {memberTransactions.length === 0 ? (
                      <p className="text-xs text-slate-400 py-4 text-center bg-slate-50 rounded-xl">No payments recorded yet for this member.</p>
                    ) : (
                      <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                        {memberTransactions.map(pt => (
                          <div key={pt.id} className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between text-xs">
                            <div>
                              <div className="font-bold text-slate-800">{pt.month}</div>
                              <div className="text-[10px] text-slate-400">{pt.date} • {pt.paymentMode} ({pt.referenceId})</div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-black text-slate-900">+{formatINR(pt.amount)}</span>
                              <button
                                onClick={() => setActiveReceipt({
                                  ...pt,
                                  chittiName: chitti.name,
                                  totalChitValue: memberTotalValue,
                                  updatedRemainingBalance: fin.remainingChitBalance
                                })}
                                title="View Receipt"
                                className="p-1 text-slate-400 hover:text-emerald-700"
                              >
                                <Receipt className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                    <button
                      onClick={() => {
                        setMemberDetailModal(null);
                        openUpdateMoneyModal(memberDetailModal);
                      }}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2 px-4 rounded-xl flex items-center gap-1.5 shadow-xs"
                    >
                      <CreditCard className="w-3.5 h-3.5" />
                      <span>Record Payment</span>
                    </button>
                  </div>
                </div>
              );
            })()}

          </div>
        </div>
      )}

      {/* ========================================================
          MOBILE BOTTOM NAVIGATION (Touch-friendly & Ergonomic)
      ======================================================== */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 px-2 py-2 flex items-center justify-around shadow-lg">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`flex flex-col items-center gap-0.5 py-1 px-3 rounded-xl transition ${
            activeTab === 'dashboard' ? 'text-emerald-700 font-bold' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <Home className="w-5 h-5" />
          <span className="text-[10px]">Home</span>
        </button>

        <button
          onClick={() => setActiveTab('chittis')}
          className={`flex flex-col items-center gap-0.5 py-1 px-3 rounded-xl transition ${
            activeTab === 'chittis' ? 'text-emerald-700 font-bold' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <Layers className="w-5 h-5" />
          <span className="text-[10px]">Chittis</span>
        </button>

        {/* Center Quick Action button */}
        <button
          onClick={() => {
            if (members.length > 0) openUpdateMoneyModal(members[0]);
          }}
          className="flex flex-col items-center -mt-5 bg-emerald-600 text-white p-3 rounded-full shadow-lg shadow-emerald-600/40 active:scale-95 transition"
          title="Collect Money"
        >
          <CreditCard className="w-5 h-5" />
        </button>

        <button
          onClick={() => setActiveTab('members')}
          className={`flex flex-col items-center gap-0.5 py-1 px-3 rounded-xl transition ${
            activeTab === 'members' ? 'text-emerald-700 font-bold' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <Users className="w-5 h-5" />
          <span className="text-[10px]">Members</span>
        </button>

        <button
          onClick={() => setActiveTab('payments')}
          className={`flex flex-col items-center gap-0.5 py-1 px-3 rounded-xl transition ${
            activeTab === 'payments' ? 'text-emerald-700 font-bold' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <Receipt className="w-5 h-5" />
          <span className="text-[10px]">Passbook</span>
        </button>
      </nav>

    </div>
  );
}