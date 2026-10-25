import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Coffee,
  PlusCircle,
  SlidersHorizontal,
  Trophy,
  Zap,
} from 'lucide-react';
import { useTournamentStore } from '../store/useTournamentStore';
import type { Match, Player } from '../types';

interface RoundsViewProps {
  onNavigateToSetup?: () => void;
  onNavigateToRanking?: () => void;
}

export default function RoundsView({
  onNavigateToSetup,
  onNavigateToRanking,
}: RoundsViewProps) {
  const {
    tournament,
    updateMatchScore,
    nextRound,
    setCurrentRoundIndex,
    addBonusRound,
    finalizeTournament,
  } = useTournamentStore();

  // Track which match IDs have manual/incomplete score override enabled
  const [manualOverrideMatches, setManualOverrideMatches] = useState<
    Record<string, boolean>
  >({});

  // Track matches explicitly touched by the user (even if 0-0)
  const [touchedMatches, setTouchedMatches] = useState<Record<string, boolean>>(
    {}
  );

  // Local draft scores per match (falls back to match.scoreA / match.scoreB from store)
  const [draftScores, setDraftScores] = useState<
    Record<string, { scoreA: number; scoreB: number }>
  >({});

  const playerMap = useMemo(() => {
    const map = new Map<string, Player>();
    if (!tournament) return map;
    for (const p of tournament.activePlayers) {
      map.set(p.id, p);
    }
    return map;
  }, [tournament]);

  if (!tournament || tournament.rounds.length === 0) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-lime-400/30 text-slate-900">
          <Zap className="h-6 w-6" aria-hidden="true" />
        </div>
        <h2 className="mt-4 text-lg font-extrabold text-slate-900">
          No Active Tournament
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Configure your players, courts, and target points in Setup to generate
          Americano rounds.
        </p>
        {onNavigateToSetup && (
          <button
            type="button"
            onClick={onNavigateToSetup}
            className="mt-5 inline-flex min-h-[48px] items-center justify-center rounded-xl bg-lime-400 px-5 py-2.5 text-sm font-extrabold text-slate-950 shadow-sm transition hover:bg-lime-300"
          >
            Go to Setup
          </button>
        )}
      </section>
    );
  }

  const currentRound =
    tournament.rounds[tournament.currentRoundIndex] ?? tournament.rounds[0];
  const totalRounds = tournament.rounds.length;
  const isLastRound = tournament.currentRoundIndex === totalRounds - 1;
  const targetPoints = tournament.targetPoints;

  const scorePointsArray = Array.from(
    { length: targetPoints + 1 },
    (_, idx) => idx
  );

  const getEffectiveScores = (match: Match) => {
    const draft = draftScores[match.id];
    if (draft) return draft;
    return { scoreA: match.scoreA, scoreB: match.scoreB };
  };

  const toggleManualMode = (match: Match) => {
    const currentEffective = getEffectiveScores(match);
    setDraftScores((prev) => ({
      ...prev,
      [match.id]: currentEffective,
    }));
    setManualOverrideMatches((prev) => ({
      ...prev,
      [match.id]: !prev[match.id],
    }));
  };

  const handleSelectTeamAScore = (match: Match, scoreA: number) => {
    const isManual = Boolean(manualOverrideMatches[match.id]);
    const currentEffective = getEffectiveScores(match);
    const nextScoreB = isManual
      ? currentEffective.scoreB
      : Math.max(0, targetPoints - scoreA);

    setTouchedMatches((prev) => ({ ...prev, [match.id]: true }));
    setDraftScores((prev) => ({
      ...prev,
      [match.id]: { scoreA, scoreB: nextScoreB },
    }));

    // Persist immediately to store so zero data is lost on refresh
    updateMatchScore(match.id, scoreA, nextScoreB, true);
  };

  const handleSelectTeamBScore = (match: Match, scoreB: number) => {
    const currentEffective = getEffectiveScores(match);
    const nextScoreA = currentEffective.scoreA;

    setManualOverrideMatches((prev) => ({ ...prev, [match.id]: true }));
    setTouchedMatches((prev) => ({ ...prev, [match.id]: true }));
    setDraftScores((prev) => ({
      ...prev,
      [match.id]: { scoreA: nextScoreA, scoreB },
    }));

    // Persist immediately to store
    updateMatchScore(match.id, nextScoreA, scoreB, true);
  };

  const handleConfirmAndNextRound = () => {
    // Commit all matches in the current round as completed
    for (const match of currentRound.matches) {
      const { scoreA, scoreB } = getEffectiveScores(match);
      const isManual = Boolean(manualOverrideMatches[match.id]);

      // If untouched and 0-0 in standard mode, default to an even split or keep existing completed state
      if (
        !match.isCompleted &&
        !touchedMatches[match.id] &&
        scoreA === 0 &&
        scoreB === 0 &&
        !isManual
      ) {
        const halfA = Math.ceil(targetPoints / 2);
        const halfB = targetPoints - halfA;
        updateMatchScore(match.id, halfA, halfB, true);
      } else {
        updateMatchScore(match.id, scoreA, scoreB, true);
      }
    }

    if (!isLastRound) {
      nextRound();
    } else {
      finalizeTournament();
      onNavigateToRanking?.();
    }
  };

  const handleTimeIsUp = () => {
    // Save any active/partial scores in the current round and finalize
    for (const match of currentRound.matches) {
      const { scoreA, scoreB } = getEffectiveScores(match);
      const hasScore =
        scoreA > 0 ||
        scoreB > 0 ||
        Boolean(touchedMatches[match.id]) ||
        match.isCompleted;

      if (hasScore) {
        updateMatchScore(match.id, scoreA, scoreB, true);
      }
    }

    finalizeTournament();
    onNavigateToRanking?.();
  };

  const allMatchesInCurrentRoundCompleted = currentRound.matches.every(
    (m) => m.isCompleted
  );

  const restingPlayerNames = currentRound.restingPlayers
    .map((id) => playerMap.get(id)?.name)
    .filter((name): name is string => Boolean(name));

  return (
    <div className="space-y-4 pb-28">
      {/* Round Header & Switcher */}
      <section className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm">
        <button
          type="button"
          disabled={tournament.currentRoundIndex === 0}
          onClick={() =>
            setCurrentRoundIndex(tournament.currentRoundIndex - 1)
          }
          aria-label="Previous round"
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </button>

        <div className="text-center">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
            Active Matchup
          </span>
          <h2 className="text-lg font-extrabold text-slate-900">
            Round {currentRound.roundNumber} of {totalRounds}
          </h2>
        </div>

        <button
          type="button"
          disabled={isLastRound}
          onClick={() =>
            setCurrentRoundIndex(tournament.currentRoundIndex + 1)
          }
          aria-label="Next round"
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </button>
      </section>

      {/* Resting Players Notice */}
      {restingPlayerNames.length > 0 && (
        <section
          aria-label="Resting players"
          className="flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50/90 px-4 py-3.5 text-amber-950 shadow-sm"
        >
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-200/80 text-amber-900">
            <Coffee className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-extrabold uppercase tracking-wide text-amber-900">
                Resting This Round
              </h3>
              <span className="rounded-md bg-amber-200/70 px-2 py-0.5 text-[11px] font-bold text-amber-950">
                Virtual Draw: +{targetPoints / 2} pts if unplayed
              </span>
            </div>
            <p className="mt-1 text-sm font-bold text-slate-900">
              {restingPlayerNames.join(' • ')}
            </p>
          </div>
        </section>
      )}

      {/* Match Cards (Court 1, Court 2) */}
      <div className="space-y-4">
        {currentRound.matches.map((match) => {
          const { scoreA, scoreB } = getEffectiveScores(match);
          const isManual = Boolean(manualOverrideMatches[match.id]);
          const sumPoints = scoreA + scoreB;
          const isIncompleteScore =
            match.isCompleted && sumPoints !== targetPoints;

          const playerA1 = playerMap.get(match.teamA[0]);
          const playerA2 = playerMap.get(match.teamA[1]);
          const playerB1 = playerMap.get(match.teamB[0]);
          const playerB2 = playerMap.get(match.teamB[1]);

          return (
            <article
              key={match.id}
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
            >
              {/* Court Card Header */}
              <div className="flex items-center justify-between border-b border-slate-100 bg-slate-900 px-4 py-2.5 text-white">
                <div className="flex items-center gap-2">
                  <span className="inline-flex rounded-lg bg-lime-400 px-2.5 py-0.5 text-xs font-black uppercase text-slate-950">
                    Court {match.courtNumber}
                  </span>
                  <span className="text-xs font-medium text-slate-300">
                    Target: {targetPoints} pts
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {match.isCompleted ? (
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                        isIncompleteScore
                          ? 'bg-amber-400/20 text-amber-300'
                          : 'bg-lime-400/20 text-lime-300'
                      }`}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                      {isIncompleteScore
                        ? `Saved (${sumPoints}/${targetPoints} pts)`
                        : 'Saved'}
                    </span>
                  ) : (
                    <span className="text-[11px] font-semibold text-slate-400">
                      Tap score below
                    </span>
                  )}
                </div>
              </div>

              {/* Matchup Teams & Live Scoreboard */}
              <div className="p-4">
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                  {/* Team A */}
                  <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                      Team A
                    </span>
                    <div className="mt-1 space-y-1">
                      <p className="flex items-center gap-1.5 truncate text-sm font-extrabold text-slate-900">
                        <span
                          role="img"
                          aria-label="Starting server"
                          title="Starting server"
                          className="shrink-0 text-sm"
                        >
                          🎾
                        </span>
                        <span className="truncate">
                          {playerA1?.name ?? 'Player A1'}
                        </span>
                      </p>
                      <p className="truncate pl-5 text-sm font-bold text-slate-700">
                        {playerA2?.name ?? 'Player A2'}
                      </p>
                    </div>
                  </div>

                  {/* Center Score Display */}
                  <div className="flex flex-col items-center justify-center px-1">
                    <div className="flex items-center gap-1.5 rounded-2xl border-2 border-slate-900 bg-slate-900 px-3 py-2 text-white shadow-sm">
                      <span className="min-w-[2ch] text-center text-xl font-black text-lime-400">
                        {scoreA}
                      </span>
                      <span className="text-xs font-bold text-slate-400">:</span>
                      <span className="min-w-[2ch] text-center text-xl font-black text-white">
                        {scoreB}
                      </span>
                    </div>
                    <span className="mt-1 text-[10px] font-bold uppercase text-slate-400">
                      vs
                    </span>
                  </div>

                  {/* Team B */}
                  <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3 text-right">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                      Team B
                    </span>
                    <div className="mt-1 space-y-1">
                      <p className="truncate text-sm font-extrabold text-slate-900">
                        {playerB1?.name ?? 'Player B1'}
                      </p>
                      <p className="truncate text-sm font-bold text-slate-700">
                        {playerB2?.name ?? 'Player B2'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Score Selector Header & Manual Override Toggle */}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-700">
                    Tap Team A Score{' '}
                    <span className="font-normal text-slate-500">
                      {isManual
                        ? '(Manual mode)'
                        : `(Auto-sets Team B to ${targetPoints} - A)`}
                    </span>
                  </span>

                  <button
                    type="button"
                    aria-pressed={isManual}
                    onClick={() => toggleManualMode(match)}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-bold transition ${
                      isManual
                        ? 'border-amber-500 bg-amber-100 text-amber-950'
                        : 'border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <SlidersHorizontal
                      className="h-3.5 w-3.5"
                      aria-hidden="true"
                    />
                    {isManual
                      ? 'Incomplete / Manual ON'
                      : 'Incomplete Match Override'}
                  </button>
                </div>

                {/* Team A Horizontally Scrollable Score Strip */}
                <div
                  role="group"
                  aria-label={`Court ${match.courtNumber} Team A score selector`}
                  className="mt-2 flex w-full min-w-0 flex-nowrap gap-2 overflow-x-auto overscroll-x-contain pb-2 pt-1"
                >
                  {scorePointsArray.map((pts) => {
                    const isSelected =
                      (match.isCompleted || Boolean(touchedMatches[match.id])) &&
                      scoreA === pts;

                    return (
                      <button
                        key={pts}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => handleSelectTeamAScore(match, pts)}
                        className={`flex min-h-[48px] min-w-[48px] shrink-0 items-center justify-center rounded-xl border-2 text-sm font-extrabold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${
                          isSelected
                            ? 'border-slate-900 bg-lime-400 text-slate-950 shadow-sm'
                            : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-slate-100'
                        }`}
                      >
                        {pts}
                      </button>
                    );
                  })}
                </div>

                {/* Team B Horizontally Scrollable Score Strip (shown when Manual Override is active) */}
                {isManual && (
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                    <div className="flex items-center justify-between text-xs font-bold text-amber-950">
                      <span>Tap Team B Score (Manual Incomplete Override)</span>
                      <span>
                        Total: {scoreA + scoreB} / {targetPoints} pts
                      </span>
                    </div>
                    <div
                      role="group"
                      aria-label={`Court ${match.courtNumber} Team B manual score selector`}
                      className="mt-2 flex w-full min-w-0 flex-nowrap gap-2 overflow-x-auto overscroll-x-contain pb-2 pt-1"
                    >
                      {scorePointsArray.map((pts) => {
                        const isSelected =
                          (match.isCompleted ||
                            Boolean(touchedMatches[match.id])) &&
                          scoreB === pts;

                        return (
                          <button
                            key={pts}
                            type="button"
                            aria-pressed={isSelected}
                            onClick={() => handleSelectTeamBScore(match, pts)}
                            className={`flex min-h-[48px] min-w-[48px] shrink-0 items-center justify-center rounded-xl border-2 text-sm font-extrabold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${
                              isSelected
                                ? 'border-slate-900 bg-slate-900 text-lime-400 shadow-sm'
                                : 'border-amber-200 bg-white text-slate-700 hover:border-amber-300'
                            }`}
                          >
                            {pts}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {/* Action Controls */}
      <section className="space-y-3 pt-2">
        {/* Primary Confirm Scores & Next Round Button */}
        <button
          type="button"
          onClick={handleConfirmAndNextRound}
          className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl bg-lime-400 px-6 py-4 text-base font-extrabold text-slate-950 shadow-md transition hover:bg-lime-300 active:scale-[0.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
        >
          <CheckCircle2 className="h-5 w-5 stroke-[2.5]" aria-hidden="true" />
          <span>
            {isLastRound
              ? 'Confirm Final Round Scores'
              : 'Confirm Scores & Next Round'}
          </span>
        </button>

        {/* Bonus Round Section (visible when on final round or all standard rounds completed) */}
        {(isLastRound || allMatchesInCurrentRoundCompleted) && (
          <div className="flex flex-col gap-2.5 sm:flex-row">
            <button
              type="button"
              onClick={() => addBonusRound()}
              className="flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-2xl border-2 border-slate-900 bg-slate-900 px-5 py-3 text-sm font-extrabold text-lime-400 shadow-sm transition hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
            >
              <PlusCircle className="h-5 w-5" aria-hidden="true" />
              <span>+ Bonus Round</span>
            </button>

            {isLastRound && allMatchesInCurrentRoundCompleted && onNavigateToRanking && (
              <button
                type="button"
                onClick={onNavigateToRanking}
                className="flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-2xl border-2 border-slate-300 bg-white px-5 py-3 text-sm font-extrabold text-slate-900 shadow-sm transition hover:bg-slate-100"
              >
                <Trophy className="h-4 w-4" aria-hidden="true" />
                <span>View Standings</span>
              </button>
            )}
          </div>
        )}

        {/* Secondary Warning "End Round / Time is Up" Button */}
        <button
          type="button"
          onClick={handleTimeIsUp}
          className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl border-2 border-amber-400 bg-amber-100/90 px-5 py-3 text-sm font-extrabold text-amber-950 transition hover:bg-amber-200/80 active:scale-[0.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700"
        >
          <AlertTriangle className="h-4 w-4 text-amber-800" aria-hidden="true" />
          <span>End Round / Time is Up (Save Incomplete Scores)</span>
        </button>
      </section>
    </div>
  );
}
