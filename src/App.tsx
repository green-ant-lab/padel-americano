import { useEffect, useState } from 'react';
import { Settings, Zap, BarChart } from 'lucide-react';
import { useTournamentStore } from './store/useTournamentStore';
import SetupView from './components/SetupView';
import RoundsView from './components/RoundsView';
import RankingView from './components/RankingView';

export type ActiveTab = 'setup' | 'rounds' | 'ranking';

export default function App() {
  const tournament = useTournamentStore((state) => state.tournament);
  const subscribeToFirestore = useTournamentStore(
    (state) => state.subscribeToFirestore
  );

  const [activeTab, setActiveTab] = useState<ActiveTab>(() => {
    if (!tournament) return 'setup';
    return tournament.isFinished ? 'ranking' : 'rounds';
  });

  // Subscribe to real-time Firestore updates across devices
  useEffect(() => {
    const unsubscribe = subscribeToFirestore();
    return () => {
      unsubscribe();
    };
  }, [subscribeToFirestore]);

  // Automatically navigate to Ranking when a tournament is finalized
  useEffect(() => {
    if (tournament?.isFinished) {
      setActiveTab('ranking');
    }
  }, [tournament?.isFinished]);

  const navItems: Array<{
    id: ActiveTab;
    label: string;
    icon: typeof Settings;
    badge?: string;
  }> = [
    {
      id: 'setup',
      label: 'Setup',
      icon: Settings,
    },
    {
      id: 'rounds',
      label: 'Rounds',
      icon: Zap,
      badge: tournament
        ? `R${tournament.currentRoundIndex + 1}/${tournament.rounds.length}`
        : undefined,
    },
    {
      id: 'ranking',
      label: 'Ranking',
      icon: BarChart,
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Top App Bar */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-xl items-center justify-between px-4 py-3.5">
          <div className="flex items-center gap-2.5">
            <span
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-lime-400 font-black text-slate-950 shadow-sm"
              aria-hidden="true"
            >
              PA
            </span>
            <div>
              <h1 className="text-base font-extrabold tracking-tight text-slate-900">
                Padel Americano
              </h1>
              <p className="text-xs font-medium text-slate-500">
                {tournament
                  ? `${tournament.activePlayers.length} Players • ${tournament.totalCourts} ${
                      tournament.totalCourts === 1 ? 'Court' : 'Courts'
                    } • ${tournament.targetPoints} Pts`
                  : 'Match Director Console'}
              </p>
            </div>
          </div>

          {tournament && (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
                tournament.isFinished
                  ? 'bg-slate-900 text-lime-400'
                  : 'bg-lime-400/30 text-slate-900'
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  tournament.isFinished ? 'bg-lime-400' : 'bg-lime-600'
                }`}
                aria-hidden="true"
              />
              {tournament.isFinished
                ? 'Finished'
                : `Round ${tournament.currentRoundIndex + 1}`}
            </span>
          )}
        </div>
      </header>

      {/* Main Content Container */}
      <main id="main-content" className="mx-auto max-w-xl px-4 pt-4 pb-24">
        {activeTab === 'setup' && (
          <SetupView onTournamentStarted={() => setActiveTab('rounds')} />
        )}
        {activeTab === 'rounds' && (
          <RoundsView
            onNavigateToSetup={() => setActiveTab('setup')}
            onNavigateToRanking={() => setActiveTab('ranking')}
          />
        )}
        {activeTab === 'ranking' && (
          <RankingView
            onNavigateToSetup={() => setActiveTab('setup')}
            onNavigateToRounds={() => setActiveTab('rounds')}
          />
        )}
      </main>

      {/* Fixed Bottom Navigation Bar */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur"
      >
        <div className="mx-auto grid h-16 max-w-xl grid-cols-3 px-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                type="button"
                aria-current={isActive ? 'page' : undefined}
                onClick={() => setActiveTab(item.id)}
                className={`relative flex flex-col items-center justify-center gap-1 rounded-xl transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-slate-900 ${
                  isActive
                    ? 'font-bold text-slate-950'
                    : 'font-medium text-slate-500 hover:text-slate-800'
                }`}
              >
                <div
                  className={`flex items-center gap-1 rounded-full px-3.5 py-1 transition ${
                    isActive ? 'bg-lime-400 text-slate-950 shadow-sm' : ''
                  }`}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                  {item.badge && (
                    <span className="text-[11px] font-extrabold">
                      {item.badge}
                    </span>
                  )}
                </div>
                <span className="text-xs leading-none">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
