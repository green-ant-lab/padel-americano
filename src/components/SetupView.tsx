import React, { useId, useMemo, useRef, useState } from 'react';
import {
  Check,
  Clock,
  Grid,
  History,
  Play,
  Plus,
  Sparkles,
  Target,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useTournamentStore } from '../store/useTournamentStore';
import type { PlayerLevel, TotalCourts } from '../types';

type DurationOption = 60 | 90 | 120;
type PointsOption = 16 | 21 | 24 | 32;

const DURATION_OPTIONS: DurationOption[] = [60, 90, 120];
const COURT_OPTIONS: TotalCourts[] = [1, 2];
const POINTS_OPTIONS: PointsOption[] = [16, 21, 24, 32];

interface DirectorRecommendation {
  recommendedCourts: TotalCourts;
  recommendedPoints: PointsOption;
  estimatedRounds: number;
  restingPerRound: number;
  headline: string;
  rationale: string;
}

/**
 * Computes a smart Match Director recommendation based on court booking duration
 * and the number of selected players.
 */
function computeDirectorHint(
  playerCount: number,
  durationMinutes: DurationOption
): DirectorRecommendation {
  if (playerCount < 4) {
    return {
      recommendedCourts: 1,
      recommendedPoints: 21,
      estimatedRounds: 0,
      restingPerRound: 0,
      headline: `Select ${4 - playerCount} more player${4 - playerCount === 1 ? '' : 's'} to unlock court configuration`,
      rationale:
        'A Padel Americano requires at least 4 active players (2 pairs) on 1 court.',
    };
  }

  const recommendedCourts: TotalCourts = playerCount >= 8 ? 2 : 1;
  const activeCapacity = recommendedCourts * 4;
  const restingPerRound = Math.max(0, playerCount - activeCapacity);
  const hasRestingRotation = restingPerRound > 0;

  let recommendedPoints: PointsOption = 21;

  if (durationMinutes === 60) {
    recommendedPoints = hasRestingRotation ? 16 : 21;
  } else if (durationMinutes === 90) {
    recommendedPoints = hasRestingRotation ? 21 : 24;
  } else {
    // 120 minutes
    recommendedPoints = hasRestingRotation ? 24 : 32;
  }

  // Approximate minutes per round (~0.52m per point + 1.5m court switchover)
  const minutesPerRound = Math.round(recommendedPoints * 0.52 + 1.5);
  const estimatedRounds = Math.max(
    3,
    Math.floor((durationMinutes - 4) / minutesPerRound)
  );

  const courtLabel =
    recommendedCourts === 2 ? '2 Courts (8 on court)' : '1 Court (4 on court)';

  const headline = `Recommend ${courtLabel} • ${recommendedPoints} Points (~${estimatedRounds} rounds)`;

  const rationale = hasRestingRotation
    ? `With ${playerCount} players, ${restingPerRound} player${
        restingPerRound > 1 ? 's' : ''
      } will rotate resting each round. Playing to ${recommendedPoints} pts fits ~${estimatedRounds} fast rounds into ${durationMinutes}m and keeps rest rotations fair (Virtual Draw active).`
    : `All ${playerCount} players stay on court every round with zero sit-outs. Playing to ${recommendedPoints} pts gives ~${estimatedRounds} balanced rounds within your ${durationMinutes}m booking.`;

  return {
    recommendedCourts,
    recommendedPoints,
    estimatedRounds,
    restingPerRound,
    headline,
    rationale,
  };
}

function formatHistoryDate(isoOrTimestamp: string): string {
  const parsed = new Date(isoOrTimestamp);
  if (Number.isNaN(parsed.getTime())) return isoOrTimestamp;
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed);
}

interface SetupViewProps {
  onTournamentStarted?: () => void;
}

export default function SetupView({ onTournamentStarted }: SetupViewProps) {
  const {
    roster,
    tournament,
    history,
    addRosterPlayer,
    removeRosterPlayer,
    createTournament,
    clearHistory,
  } = useTournamentStore();

  const historyDialogRef = useRef<HTMLDialogElement | null>(null);

  // Initialize selected players from active tournament if present, otherwise all roster players
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>(() => {
    if (tournament && tournament.activePlayers.length > 0) {
      return tournament.activePlayers.map((p) => p.id);
    }
    return roster.map((p) => p.id);
  });

  // Add Player inline drawer state
  const [isAddingPlayer, setIsAddingPlayer] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [newPlayerLevel, setNewPlayerLevel] = useState<PlayerLevel>('A');
  const [nameError, setNameError] = useState('');

  // Booking duration & manual override states
  const [selectedTime, setSelectedTime] = useState<DurationOption>(90);
  const [totalCourts, setTotalCourts] = useState<TotalCourts>(
    tournament?.totalCourts ?? 1
  );
  const [targetPoints, setTargetPoints] = useState<PointsOption>(
    (tournament?.targetPoints as PointsOption) ?? 21
  );
  const [hasManualOverride, setHasManualOverride] = useState(false);

  const playerNameInputId = useId();
  const playerNameErrorId = useId();
  const historyDialogTitleId = useId();

  // Filter selected IDs against existing roster
  const validSelectedIds = useMemo(() => {
    const rosterSet = new Set(roster.map((p) => p.id));
    return selectedPlayerIds.filter((id) => rosterSet.has(id));
  }, [roster, selectedPlayerIds]);

  const selectedCount = validSelectedIds.length;

  const directorHint = useMemo(
    () => computeDirectorHint(selectedCount, selectedTime),
    [selectedCount, selectedTime]
  );

  // Sort history newest first
  const sortedHistory = useMemo(() => {
    return [...history].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [history]);

  // Sync courts and points with smart hint unless manually overridden
  const effectiveCourts: TotalCourts = hasManualOverride
    ? totalCourts
    : directorHint.recommendedCourts;
  const effectivePoints: PointsOption = hasManualOverride
    ? targetPoints
    : directorHint.recommendedPoints;

  const togglePlayerSelection = (playerId: string) => {
    setSelectedPlayerIds((prev) =>
      prev.includes(playerId)
        ? prev.filter((id) => id !== playerId)
        : [...prev, playerId]
    );
  };

  const handleAddPlayerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newPlayerName.trim();
    if (!trimmed) {
      setNameError('Please enter a player name before adding.');
      return;
    }

    const created = addRosterPlayer(trimmed, newPlayerLevel);
    setSelectedPlayerIds((prev) => [...prev, created.id]);
    setNewPlayerName('');
    setNameError('');
    setIsAddingPlayer(false);
  };

  const handleTimeChange = (duration: DurationOption) => {
    setSelectedTime(duration);
    if (!hasManualOverride) {
      const hint = computeDirectorHint(selectedCount, duration);
      setTotalCourts(hint.recommendedCourts);
      setTargetPoints(hint.recommendedPoints);
    }
  };

  const handleCourtOverride = (courts: TotalCourts) => {
    setHasManualOverride(true);
    setTotalCourts(courts);
  };

  const handlePointsOverride = (points: PointsOption) => {
    setHasManualOverride(true);
    setTargetPoints(points);
  };

  const handleApplyRecommendation = () => {
    setHasManualOverride(false);
    setTotalCourts(directorHint.recommendedCourts);
    setTargetPoints(directorHint.recommendedPoints);
  };

  const handleStartTournament = () => {
    if (selectedCount < 4) return;

    const selectedSet = new Set(validSelectedIds);
    const activePlayers = roster.filter((p) => selectedSet.has(p.id));

    // Estimate target rounds based on effective points and time
    const minutesPerRound = Math.round(effectivePoints * 0.52 + 1.5);
    const targetRounds = Math.max(
      4,
      Math.floor((selectedTime - 4) / minutesPerRound)
    );

    createTournament({
      activePlayers,
      totalCourts: effectiveCourts,
      targetPoints: effectivePoints,
      targetRounds,
    });

    onTournamentStarted?.();
  };

  // Fallback for browsers without native `<dialog closedby="any">` support (e.g., Safari)
  const handleHistoryDialogBackdropClick = (
    event: React.MouseEvent<HTMLDialogElement>
  ) => {
    const dialog = historyDialogRef.current;
    if (!dialog) return;
    if ('closedBy' in HTMLDialogElement.prototype) return;
    if (event.target !== dialog) return;

    const rect = dialog.getBoundingClientRect();
    const isDialogContent =
      rect.top <= event.clientY &&
      event.clientY <= rect.top + rect.height &&
      rect.left <= event.clientX &&
      event.clientX <= rect.left + rect.width;

    if (!isDialogContent) {
      dialog.close();
    }
  };

  return (
    <div className="space-y-5 pb-36">
      {/* Top Secondary Action: View Tournament History */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => historyDialogRef.current?.showModal()}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border-2 border-slate-300 bg-white px-4 py-2 text-xs font-extrabold text-slate-800 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
        >
          <History className="h-4 w-4 text-slate-700" aria-hidden="true" />
          <span>View Tournament History</span>
          {sortedHistory.length > 0 && (
            <span className="inline-flex items-center justify-center rounded-md bg-slate-900 px-1.5 py-0.5 text-[11px] font-black text-lime-400">
              {sortedHistory.length}
            </span>
          )}
        </button>
      </div>

      {/* 1. Player Roster Section */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-lime-400">
              <Users className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Player Roster
              </h2>
              <p className="text-xs font-medium text-slate-600">
                Players Selected:{' '}
                <span
                  className={`inline-flex items-center rounded-md px-1.5 py-0.5 font-bold ${
                    selectedCount >= 4
                      ? 'bg-lime-300/60 text-slate-950'
                      : 'bg-amber-100 text-amber-900'
                  }`}
                >
                  {selectedCount}
                </span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setIsAddingPlayer((prev) => !prev);
              setNameError('');
            }}
            aria-expanded={isAddingPlayer}
            className="inline-flex min-h-[48px] items-center gap-1.5 rounded-xl bg-lime-400 px-4 py-2.5 text-sm font-bold text-slate-950 shadow-sm transition hover:bg-lime-300 active:scale-[0.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
          >
            {isAddingPlayer ? (
              <>
                <X className="h-4 w-4 stroke-[2.5]" aria-hidden="true" />
                Cancel
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 stroke-[2.5]" aria-hidden="true" />
                + Add Player
              </>
            )}
          </button>
        </div>

        {/* Dynamic Add Player Form */}
        {isAddingPlayer && (
          <form
            onSubmit={handleAddPlayerSubmit}
            className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4"
            noValidate
          >
            <div className="space-y-3">
              <div>
                <label
                  htmlFor={playerNameInputId}
                  className="mb-1.5 block text-sm font-semibold text-slate-800"
                >
                  Player Name
                </label>
                <input
                  id={playerNameInputId}
                  name="playerName"
                  type="text"
                  value={newPlayerName}
                  onChange={(e) => {
                    setNewPlayerName(e.target.value);
                    if (nameError) setNameError('');
                  }}
                  onBlur={() => {
                    if (!newPlayerName.trim()) {
                      setNameError('Please enter a player name before adding.');
                    }
                  }}
                  aria-describedby={nameError ? playerNameErrorId : undefined}
                  aria-invalid={Boolean(nameError)}
                  required
                  autoFocus
                  enterKeyHint="done"
                  className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 shadow-sm transition focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-lime-400"
                />
                {nameError && (
                  <p
                    id={playerNameErrorId}
                    role="alert"
                    className="mt-1.5 text-xs font-semibold text-red-600"
                  >
                    {nameError}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <span className="mb-1.5 block text-xs font-semibold text-slate-700">
                    Skill Tier
                  </span>
                  <div className="inline-flex rounded-xl border border-slate-300 bg-white p-1">
                    {(['A', 'B'] as PlayerLevel[]).map((lvl) => {
                      const active = newPlayerLevel === lvl;
                      return (
                        <button
                          key={lvl}
                          type="button"
                          aria-pressed={active}
                          onClick={() => setNewPlayerLevel(lvl)}
                          className={`min-h-[40px] rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
                            active
                              ? 'bg-slate-900 text-lime-400 shadow-sm'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Level {lvl}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <button
                  type="submit"
                  className="inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-lime-400 shadow-sm transition hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
                >
                  <UserPlus className="h-4 w-4" aria-hidden="true" />
                  Save to Roster
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Roster Chips List */}
        {roster.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
            <p className="text-sm font-semibold text-slate-700">
              Your player roster is currently empty.
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Tap &ldquo;+ Add Player&rdquo; above to add players (saved automatically across sessions).
            </p>
          </div>
        ) : (
          <>
            <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
              <span>Tap chips to toggle active players for today&apos;s session</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedPlayerIds(roster.map((p) => p.id))}
                  className="font-semibold text-slate-700 underline-offset-2 hover:underline"
                >
                  Select All
                </button>
                <span aria-hidden="true">•</span>
                <button
                  type="button"
                  onClick={() => setSelectedPlayerIds([])}
                  className="font-semibold text-slate-500 underline-offset-2 hover:underline"
                >
                  Clear
                </button>
              </div>
            </div>

            <ul
              role="list"
              className="mt-3 flex flex-wrap gap-2.5"
            >
              {roster.map((player) => {
                const isSelected = validSelectedIds.includes(player.id);
                return (
                  <li
                    key={player.id}
                    className="inline-flex items-center"
                  >
                    <div
                      className={`group inline-flex min-h-[48px] items-center rounded-xl border transition ${
                        isSelected
                          ? 'border-lime-500 bg-lime-400/25 text-slate-950 shadow-sm'
                          : 'border-slate-300 bg-slate-100 text-slate-600 hover:border-slate-400 hover:bg-slate-200/60'
                      }`}
                    >
                      <button
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => togglePlayerSelection(player.id)}
                        className="inline-flex min-h-[48px] items-center gap-2 px-3.5 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
                      >
                        <span
                          className={`flex h-5 w-5 items-center justify-center rounded-md border text-xs transition ${
                            isSelected
                              ? 'border-slate-900 bg-slate-900 text-lime-400'
                              : 'border-slate-400 bg-white text-transparent'
                          }`}
                          aria-hidden="true"
                        >
                          <Check className="h-3.5 w-3.5 stroke-[3]" />
                        </span>
                        <span>{player.name}</span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${
                            isSelected
                              ? 'bg-slate-900/15 text-slate-900'
                              : 'bg-slate-200 text-slate-600'
                          }`}
                        >
                          {player.level}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => removeRosterPlayer(player.id)}
                        aria-label={`Remove ${player.name} from roster`}
                        className="mr-1.5 flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-100 hover:text-red-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-900"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      {/* 2. Time Selection */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-800">
            <Clock className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Court Booking Time
            </h2>
            <p className="text-xs text-slate-500">
              Select total rental duration to calibrate round pacing
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3">
          {DURATION_OPTIONS.map((minutes) => {
            const isSelected = selectedTime === minutes;
            return (
              <button
                key={minutes}
                type="button"
                aria-pressed={isSelected}
                onClick={() => handleTimeChange(minutes)}
                className={`flex min-h-[52px] flex-col items-center justify-center rounded-xl border-2 px-3 py-2.5 text-sm font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${
                  isSelected
                    ? 'border-slate-900 bg-lime-400 text-slate-950 shadow-sm'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-slate-100'
                }`}
              >
                <span className="text-base font-extrabold">{minutes}m</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* 3. Smart Configuration Card (Match Director Hint) */}
      <section
        aria-label="Match Director Hint"
        className="rounded-2xl border-2 border-lime-400 bg-gradient-to-br from-lime-50 via-white to-slate-50 p-5 shadow-sm"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-lime-400 text-slate-950">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-600">
                Smart Configuration
              </span>
              <h2 className="text-sm font-extrabold text-slate-900">
                Match Director Hint
              </h2>
            </div>
          </div>

          {hasManualOverride && selectedCount >= 4 && (
            <button
              type="button"
              onClick={handleApplyRecommendation}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-800 shadow-sm transition hover:bg-slate-100"
            >
              Reset to Hint
            </button>
          )}
        </div>

        <p className="mt-3 text-sm font-bold text-slate-900">
          {directorHint.headline}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-slate-600">
          {directorHint.rationale}
        </p>

        {selectedCount >= 4 && (
          <div className="mt-3.5 flex flex-wrap gap-2">
            <span className="inline-flex items-center rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-bold text-lime-400">
              Recommended: {directorHint.recommendedCourts}{' '}
              {directorHint.recommendedCourts === 1 ? 'Court' : 'Courts'}
            </span>
            <span className="inline-flex items-center rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-bold text-lime-400">
              Target: {directorHint.recommendedPoints} pts / match
            </span>
            {directorHint.restingPerRound > 0 && (
              <span className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">
                Resting: {directorHint.restingPerRound} / round
              </span>
            )}
          </div>
        )}
      </section>

      {/* 4. Manual Overrides */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">
            Manual Overrides
          </h2>
          <span className="text-xs font-medium text-slate-500">
            {hasManualOverride ? 'Custom Override Active' : 'Auto-synced with Hint'}
          </span>
        </div>

        <div className="mt-4 space-y-4">
          {/* Courts Toggle */}
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-600">
              <Grid className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Courts Available</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {COURT_OPTIONS.map((courtOpt) => {
                const isSelected = effectiveCourts === courtOpt;
                return (
                  <button
                    key={courtOpt}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => handleCourtOverride(courtOpt)}
                    className={`flex min-h-[48px] items-center justify-center gap-2 rounded-xl border-2 px-4 py-2.5 text-sm font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${
                      isSelected
                        ? 'border-slate-900 bg-slate-900 text-lime-400 shadow-sm'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    <span>
                      {courtOpt} {courtOpt === 1 ? 'Court' : 'Courts'}
                    </span>
                    <span className="text-xs font-normal opacity-80">
                      ({courtOpt * 4} players)
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Points Toggle */}
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-600">
              <Target className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Points per Match</span>
            </div>
            <div className="grid grid-cols-4 gap-2.5">
              {POINTS_OPTIONS.map((ptsOpt) => {
                const isSelected = effectivePoints === ptsOpt;
                return (
                  <button
                    key={ptsOpt}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => handlePointsOverride(ptsOpt)}
                    className={`flex min-h-[48px] flex-col items-center justify-center rounded-xl border-2 px-2 py-2 text-sm font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${
                      isSelected
                        ? 'border-slate-900 bg-slate-900 text-lime-400 shadow-sm'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    <span className="text-base font-extrabold">{ptsOpt}</span>
                    <span className="text-[10px] font-medium opacity-75">pts</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* 5. Pinned Massive Start Tournament Button */}
      <div className="fixed inset-x-0 bottom-16 z-20 border-t border-slate-200/80 bg-slate-50/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto max-w-xl">
          <button
            type="button"
            disabled={selectedCount < 4}
            onClick={handleStartTournament}
            className={`flex min-h-[56px] w-full items-center justify-center gap-2.5 rounded-2xl px-6 py-4 text-base font-extrabold tracking-tight shadow-md transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${
              selectedCount >= 4
                ? 'bg-lime-400 text-slate-950 hover:bg-lime-300 active:scale-[0.99]'
                : 'cursor-not-allowed bg-slate-200 text-slate-500'
            }`}
          >
            <Play
              className="h-5 w-5 fill-current"
              aria-hidden="true"
            />
            <span>
              {selectedCount >= 4
                ? `Start Tournament (${selectedCount} Players • ${effectiveCourts}C • ${effectivePoints} Pts)`
                : `Select at least 4 Players (${selectedCount}/4)`}
            </span>
          </button>
        </div>
      </div>

      {/* Tournament History Modal Dialog */}
      <dialog
        ref={historyDialogRef}
        {...({ closedby: 'any' } as Record<string, string>)}
        aria-labelledby={historyDialogTitleId}
        onClick={handleHistoryDialogBackdropClick}
        className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/50 backdrop:backdrop-blur-[2px]"
      >
        <div className="flex max-h-[82vh] flex-col">
          {/* Modal Header */}
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-lime-400">
                <History className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <h2
                  id={historyDialogTitleId}
                  className="text-base font-extrabold text-slate-900"
                >
                  Tournament History
                </h2>
                <p className="text-xs text-slate-500">
                  {sortedHistory.length === 0
                    ? 'No past sessions saved yet'
                    : `${sortedHistory.length} past tournament${
                        sortedHistory.length === 1 ? '' : 's'
                      } archived`}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => historyDialogRef.current?.close()}
              aria-label="Close tournament history"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {/* Modal Scrollable Body */}
          <div className="flex-1 space-y-3 overflow-y-auto overscroll-y-contain p-5">
            {sortedHistory.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center">
                <p className="text-sm font-bold text-slate-700">
                  No Past Tournaments Yet
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Completed tournaments are automatically saved here when you
                  finish or reset a session.
                </p>
              </div>
            ) : (
              sortedHistory.map((item) => {
                const topThree = item.finalStandings.slice(0, 3);
                const medals = ['1st 🥇', '2nd 🥈', '3rd 🥉'] as const;

                return (
                  <article
                    key={item.id}
                    className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 shadow-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-2.5">
                      <span className="text-xs font-extrabold text-slate-900">
                        {formatHistoryDate(item.date)}
                      </span>
                      <span className="rounded-lg bg-slate-900 px-2.5 py-0.5 text-[11px] font-bold text-lime-400">
                        {item.configuration}
                      </span>
                    </div>

                    {/* Compact Top-3 Podium List */}
                    <ol className="mt-3 space-y-1.5">
                      {topThree.map((standing, idx) => (
                        <li
                          key={standing.id}
                          className="flex items-center justify-between rounded-lg border border-slate-200/80 bg-white px-3 py-2 text-xs"
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="shrink-0 font-extrabold text-slate-700">
                              {medals[idx]}
                            </span>
                            <span className="truncate font-extrabold text-slate-900">
                              {standing.name}
                            </span>
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                              {standing.level}
                            </span>
                          </div>

                          <div className="flex shrink-0 items-center gap-1.5">
                            {standing.virtualPointsAdded > 0 && (
                              <span className="rounded bg-lime-200/80 px-1.5 py-0.5 text-[10px] font-bold text-slate-900">
                                +{standing.virtualPointsAdded} VP
                              </span>
                            )}
                            <span className="rounded-md bg-slate-900 px-2 py-0.5 font-black text-lime-400">
                              {standing.totalPoints} pts
                            </span>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </article>
                );
              })
            )}

            {/* Clear History Text Button at Very Bottom */}
            {sortedHistory.length > 0 && (
              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => clearHistory()}
                  className="text-xs font-bold text-rose-600 underline-offset-2 transition hover:text-rose-700 hover:underline"
                >
                  Clear History
                </button>
              </div>
            )}
          </div>
        </div>
      </dialog>
    </div>
  );
}
