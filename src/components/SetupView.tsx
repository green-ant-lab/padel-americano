import React, { useId, useMemo, useState } from 'react';
import {
  Check,
  Clock,
  Grid,
  Play,
  Plus,
  Target,
  Trash2,
  UserPlus,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { useTournamentStore } from '../store/useTournamentStore';
import type { PlayerLevel, TotalCourts } from '../types';

type DurationOption = 60 | 90 | 120;
type PointsOption = 16 | 21 | 24 | 32;

const DURATION_OPTIONS: DurationOption[] = [60, 90, 120];
const COURT_OPTIONS: TotalCourts[] = [1, 2];
const POINTS_OPTIONS: PointsOption[] = [16, 21, 24, 32];

interface SetupViewProps {
  onTournamentStarted?: () => void;
}

export default function SetupView({ onTournamentStarted }: SetupViewProps) {
  const {
    roster,
    tournament,
    addRosterPlayer,
    removeRosterPlayer,
    createTournament,
  } = useTournamentStore();

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

  // Booking duration, courts, & points states
  const [selectedTimeMins, setSelectedTimeMins] = useState<DurationOption>(90);
  const [selectedCourts, setSelectedCourts] = useState<TotalCourts>(
    tournament?.totalCourts ?? 1
  );
  const [selectedPoints, setSelectedPoints] = useState<PointsOption>(
    (tournament?.targetPoints as PointsOption) ?? 21
  );

  const playerNameInputId = useId();
  const playerNameErrorId = useId();

  // Filter selected IDs against existing roster
  const validSelectedIds = useMemo(() => {
    const rosterSet = new Set(roster.map((p) => p.id));
    return selectedPlayerIds.filter((id) => rosterSet.has(id));
  }, [roster, selectedPlayerIds]);

  const totalPlayers = validSelectedIds.length;

  // Dynamic Tournament Predictor Math
  const matchDurationMins = selectedPoints * 0.85;
  const totalRounds = Math.floor(selectedTimeMins / matchDurationMins);
  const activePlayersPerRound = Math.min(totalPlayers, selectedCourts * 4);
  const waitingPlayers = totalPlayers - activePlayersPerRound;
  const playerRounds =
    totalPlayers > 0
      ? Math.floor(totalRounds * (activePlayersPerRound / totalPlayers))
      : 0;

  const predictorText =
    totalPlayers >= 4
      ? `⚡️ Expect ~${playerRounds} rounds per player. ${
          waitingPlayers > 0
            ? `${waitingPlayers} players sit out each round.`
            : 'No sit-outs.'
        }`
      : `⚡️ Select ${4 - totalPlayers} more player${
          4 - totalPlayers === 1 ? '' : 's'
        } to calculate round predictions.`;

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

  const handleStartTournament = () => {
    if (totalPlayers < 4) return;

    const selectedSet = new Set(validSelectedIds);
    const activePlayers = roster.filter((p) => selectedSet.has(p.id));
    const targetRounds = Math.max(1, totalRounds);

    createTournament({
      activePlayers,
      totalCourts: selectedCourts,
      targetPoints: selectedPoints,
      targetRounds,
    });

    onTournamentStarted?.();
  };

  return (
    <div className="space-y-5 pb-36">
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
                    totalPlayers >= 4
                      ? 'bg-lime-300/60 text-slate-950'
                      : 'bg-amber-100 text-amber-900'
                  }`}
                >
                  {totalPlayers}
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
            const isSelected = selectedTimeMins === minutes;
            return (
              <button
                key={minutes}
                type="button"
                aria-pressed={isSelected}
                onClick={() => setSelectedTimeMins(minutes)}
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

      {/* 3. Courts & Points Configuration */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-bold text-slate-900">
          Court &amp; Match Format
        </h2>

        <div className="mt-4 space-y-4">
          {/* Courts Toggle */}
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-600">
              <Grid className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Courts Available</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {COURT_OPTIONS.map((courtOpt) => {
                const isSelected = selectedCourts === courtOpt;
                return (
                  <button
                    key={courtOpt}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => setSelectedCourts(courtOpt)}
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
                const isSelected = selectedPoints === ptsOpt;
                return (
                  <button
                    key={ptsOpt}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => setSelectedPoints(ptsOpt)}
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

      {/* 4. Minimalist Dynamic Tournament Predictor */}
      <div
        role="status"
        aria-live="polite"
        className="flex items-center gap-2.5 rounded-2xl border border-lime-400 bg-lime-50/90 px-4 py-3.5 shadow-sm"
      >
        <Zap
          className="h-4 w-4 shrink-0 fill-lime-400 text-slate-950"
          aria-hidden="true"
        />
        <p className="text-sm font-extrabold text-slate-900">{predictorText}</p>
      </div>

      {/* 5. Pinned Massive Start Tournament Button */}
      <div className="fixed inset-x-0 bottom-16 z-20 border-t border-slate-200/80 bg-slate-50/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto max-w-xl">
          <button
            type="button"
            disabled={totalPlayers < 4}
            onClick={handleStartTournament}
            className={`flex min-h-[56px] w-full items-center justify-center gap-2.5 rounded-2xl px-6 py-4 text-base font-extrabold tracking-tight shadow-md transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${
              totalPlayers >= 4
                ? 'bg-lime-400 text-slate-950 hover:bg-lime-300 active:scale-[0.99]'
                : 'cursor-not-allowed bg-slate-200 text-slate-500'
            }`}
          >
            <Play
              className="h-5 w-5 fill-current"
              aria-hidden="true"
            />
            <span>
              {totalPlayers >= 4
                ? `Start Tournament (${totalPlayers} Players • ${selectedCourts}C • ${selectedPoints} Pts)`
                : `Select at least 4 Players (${totalPlayers}/4)`}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
