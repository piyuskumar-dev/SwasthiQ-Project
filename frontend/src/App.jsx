import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
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
  const [currentTab, setCurrentTab] = useState('reconciliation');
  const [selectedClinic, setSelectedClinic] = useState('CLN-KNP-014');
  const [selectedDate, setSelectedDate] = useState('2026-07-27');

  const [clinics, setClinics] = useState([
    { clinic_id: 'CLN-KNP-014', name: 'Mehta Multi-Specialty Clinic — Kanpur, Uttar Pradesh' },
  ]);
  const [availableDates, setAvailableDates] = useState(['2026-07-27', '2026-07-26', '2026-07-25']);

  const [report, setReport] = useState(null);
  const [narrativeData, setNarrativeData] = useState(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isBackendOnline, setIsBackendOnline] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);

  // Check health and initialize clinics/dates on mount
  useEffect(() => {
    async function init() {
      const isOnline = await checkBackendHealth();
      setIsBackendOnline(isOnline);

      if (isOnline) {
        const fetchedClinics = await fetchClinics();
        if (fetchedClinics.length > 0) {
          setClinics(fetchedClinics);
          setSelectedClinic(fetchedClinics[0].clinic_id);
        }
        const dates = await fetchClinicDates(selectedClinic);
        if (dates.length > 0) {
          setAvailableDates(dates);
          setSelectedDate(dates[0]);
        }
      }
    }
    init();
  }, []);

  // Fetch report and narrative when clinic or date changes
  useEffect(() => {
    async function loadData() {
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
    }

    loadData();
  }, [selectedClinic, selectedDate]);

  // Handle seeding sample data into backend
  const handleSeedData = async () => {
    setIsSeeding(true);
    try {
      await seedAllSampleDays(selectedClinic);
      const isOnline = await checkBackendHealth();
      setIsBackendOnline(isOnline);

      const dates = await fetchClinicDates(selectedClinic);
      setAvailableDates(dates);

      // Refresh current date data
      const [rep, nar] = await Promise.all([
        fetchEODReport(selectedClinic, selectedDate),
        fetchNarrative(selectedClinic, selectedDate),
      ]);
      setReport(rep);
      setNarrativeData(nar);
    } catch (err) {
      console.error('Seeding failed:', err);
    } finally {
      setIsSeeding(false);
    }
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
    <div className="flex min-h-screen bg-[#f8fafc] text-slate-900 font-sans">
      {/* 1. Persistent Shared Sidebar */}
      <Sidebar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        isBackendOnline={isBackendOnline}
        onSeedData={handleSeedData}
        isSeeding={isSeeding}
      />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <div className="max-w-6xl w-full mx-auto px-6 py-8 md:px-10 md:py-10">
          {/* Header with Title & Date Picker */}
          <Header
            title={getPageTitle()}
            subtitle={currentClinicName}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            availableDates={availableDates}
            selectedClinic={selectedClinic}
            setSelectedClinic={setSelectedClinic}
            clinics={clinics}
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
    </div>
  );
}
