import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import AddPaymentModal from './components/AddPaymentModal';
import ReconciliationPage from './pages/ReconciliationPage';
import AnalyticsPage from './pages/AnalyticsPage';
import NarrativePage from './pages/NarrativePage';
import {
  checkBackendHealth,
  fetchClinics,
  fetchClinicDates,
  fetchEODReport,
  fetchNarrative,
  seedAllSampleDays,
} from './api/client';

export default function App() {
  // 1. Persistent State via localStorage
  const [currentTab, setCurrentTab] = useState(() => {
    return localStorage.getItem('swasthiq_tab') || 'reconciliation';
  });

  const [selectedClinic, setSelectedClinic] = useState(() => {
    return localStorage.getItem('swasthiq_clinic') || 'CLN-KNP-014';
  });

  const [selectedDate, setSelectedDate] = useState(() => {
    return localStorage.getItem('swasthiq_date') || '2026-07-28';
  });

  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('swasthiq_theme') === 'dark';
  });

  const [clinics, setClinics] = useState([
    { clinic_id: 'CLN-KNP-014', name: 'Mehta Multi-Specialty Clinic — Kanpur, Uttar Pradesh' },
  ]);
  const [availableDates, setAvailableDates] = useState(['2026-07-28', '2026-07-27', '2026-07-26', '2026-07-25']);

  const [report, setReport] = useState(null);
  const [narrativeData, setNarrativeData] = useState(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isBackendOnline, setIsBackendOnline] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [isAddPaymentOpen, setIsAddPaymentOpen] = useState(false);

  // 2. Synchronize Dark Mode Class on Root
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('swasthiq_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('swasthiq_theme', 'light');
    }
  }, [darkMode]);

  // 3. Persist navigation and clinic preferences
  useEffect(() => {
    localStorage.setItem('swasthiq_tab', currentTab);
  }, [currentTab]);

  useEffect(() => {
    localStorage.setItem('swasthiq_clinic', selectedClinic);
  }, [selectedClinic]);

  useEffect(() => {
    localStorage.setItem('swasthiq_date', selectedDate);
  }, [selectedDate]);

  // 4. Initial System Check & Data Hydration
  useEffect(() => {
    async function init() {
      const isOnline = await checkBackendHealth();
      setIsBackendOnline(isOnline);

      if (isOnline) {
        const fetchedClinics = await fetchClinics();
        if (fetchedClinics.length > 0) {
          setClinics(fetchedClinics);
          // If stored clinic is not valid in remote, default to first clinic
          const exists = fetchedClinics.some(c => c.clinic_id === selectedClinic);
          if (!exists) {
            setSelectedClinic(fetchedClinics[0].clinic_id);
          }
        }
        const dates = await fetchClinicDates(selectedClinic);
        if (dates.length > 0) {
          setAvailableDates(dates);
          // If stored date not in available dates, choose the first
          if (!dates.includes(selectedDate)) {
            setSelectedDate(dates[0]);
          }
        }
      }
    }
    init();
  }, []);

  // 5. Fetch report and narrative when clinic or date changes
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [rep, nar] = await Promise.all([
        fetchEODReport(selectedClinic, selectedDate),
        fetchNarrative(selectedClinic, selectedDate),
      ]);
      setReport(rep);
      setNarrativeData(nar);
    } catch (err) {
      console.error('Error loading clinic data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedClinic, selectedDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 6. Handle seeding sample data into backend
  const handleSeedData = async () => {
    setIsSeeding(true);
    try {
      await seedAllSampleDays(selectedClinic);
      const isOnline = await checkBackendHealth();
      setIsBackendOnline(isOnline);

      const dates = await fetchClinicDates(selectedClinic);
      setAvailableDates(dates);

      await loadData();
    } catch (err) {
      console.error('Seeding failed:', err);
    } finally {
      setIsSeeding(false);
    }
  };

  // 7. Handle transaction added from modal
  const handleTransactionAdded = async (newDate) => {
    const dates = await fetchClinicDates(selectedClinic);
    setAvailableDates(dates);
    if (newDate) {
      setSelectedDate(newDate);
    }
    await loadData();
  };

  const getPageTitle = () => {
    switch (currentTab) {
      case 'reconciliation':
        return 'EOD Reconciliation';
      case 'analytics':
        return 'Analytics';
      case 'narrative':
        return 'AI Narrative Summary';
      default:
        return 'Dashboard';
    }
  };

  const currentClinicName =
    clinics.find((c) => c.clinic_id === selectedClinic)?.name || 'Mehta Multi-Specialty Clinic — Kanpur, Uttar Pradesh';

  return (
    <div className="flex min-h-screen bg-[#f8fafc] dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans transition-colors">
      {/* 1. Persistent Shared Sidebar */}
      <Sidebar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        isBackendOnline={isBackendOnline}
        onSeedData={handleSeedData}
        isSeeding={isSeeding}
        onOpenAddPayment={() => setIsAddPaymentOpen(true)}
      />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <div className="max-w-6xl w-full mx-auto px-6 py-8 md:px-10 md:py-10">
          {/* Header with Title, Dark Mode Toggle, Clinic/Date Pickers & Add Payment */}
          <Header
            title={getPageTitle()}
            subtitle={currentClinicName}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            availableDates={availableDates}
            selectedClinic={selectedClinic}
            setSelectedClinic={setSelectedClinic}
            clinics={clinics}
            darkMode={darkMode}
            setDarkMode={setDarkMode}
            onOpenAddPayment={() => setIsAddPaymentOpen(true)}
          />

          {/* Screen Display Area */}
          <div className="mt-4">
            {currentTab === 'reconciliation' && (
              <ReconciliationPage report={report} isLoading={isLoading} />
            )}

            {currentTab === 'analytics' && (
              <AnalyticsPage report={report} isLoading={isLoading} />
            )}

            {currentTab === 'narrative' && (
              <NarrativePage narrativeData={narrativeData} isLoading={isLoading} />
            )}
          </div>
        </div>
      </main>

      {/* Add Payment / Transaction Modal */}
      <AddPaymentModal
        isOpen={isAddPaymentOpen}
        onClose={() => setIsAddPaymentOpen(false)}
        selectedClinic={selectedClinic}
        selectedDate={selectedDate}
        clinicName={currentClinicName}
        onTransactionAdded={handleTransactionAdded}
      />
    </div>
  );
}
