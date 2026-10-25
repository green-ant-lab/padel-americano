import { useMemo, useRef } from 'react';
import {
  Award,
  BarChart,
  Info,
  PlusCircle,
  RotateCcw,
  Trophy,
} from 'lucide-react';
import { useTournamentStore } from '../store/useTournamentStore';
import { calculateStandings } from '../lib/americanoEngine';

interface RankingViewProps {
  onNavigateToSetup?: () => void;
  onNavigateToRounds?: () => void;
}

export default function RankingView({
  onNavigateToSetup,
  onNavigateToRounds,
}: RankingViewProps) {
  const { tournament, addBonusRound, archiveAndResetTournament } =
    useTournamentStore();
  const confirmResetDialogRef = useRef<HTMLDialogElement | null>(null);

  const standings = useMemo(() => {
    if (!tournament) return [];
    return calculateStandings(tournament);
  }, [tournament]);

  if (!tournament) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-lime-400/30 text-slate-900">
          <BarChart className="h-6 w-6" aria-hidden="true" />
        </div>
        <h2 className="mt-4 text-lg font-extrabold text-slate-900">
          No Leaderboard Available
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Start a tournament in Setup and record match scores to view live
          standings.
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

  const completedMatchesCount = tournament.rounds.reduce(
    (acc, r) => acc + r.matches.filter((m) => m.isCompleted).length,
    0
  );
  const totalScheduledMatches = tournament.rounds.reduce(
    (acc, r) => acc + r.matches.length,
    0
  );
  const hasVirtualDrawsActive = standings.some(
    (s) => s.virtualPointsAdded > 0
  );
  const virtualDrawPerMatch = tournament.targetPoints / 2;

  const handleConfirmReset = () => {
    confirmResetDialogRef.current?.close();
    archiveAndResetTournament();
    onNavigateToSetup?.();
  };

  return (
    <div className="space-y-4 pb-28">
      {/* Summary Header Card */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-lime-400">
              <Trophy className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900">
                {tournament.isFinished
                  ? 'Final Tournament Standings'
                  : 'Live Americano Standings'}
              </h2>
              <p className="text-xs font-medium text-slate-500">
                {completedMatchesCount} of {totalScheduledMatches} matches
                scored • Target {tournament.targetPoints} pts
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              addBonusRound();
              onNavigateToRounds?.();
            }}
            className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl bg-lime-400 px-3.5 py-2 text-xs font-extrabold text-slate-950 shadow-sm transition hover:bg-lime-300"
          >
            <PlusCircle className="h-4 w-4" aria-hidden="true" />
            + Bonus Round
          </button>
        </div>

        {/* Virtual Draw Explanation Notice (shown when active) */}
        {hasVirtualDrawsActive && (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-lime-400/60 bg-lime-50/80 px-3.5 py-2.5 text-xs text-slate-800">
            <Info
              className="mt-0.5 h-4 w-4 shrink-0 text-slate-900"
              aria-hidden="true"
            />
            <p>
              <strong className="font-extrabold text-slate-950">
                Virtual Draw (+VP) Active:
              </strong>{' '}
              Players who rested or missed a match receive{' '}
              <span className="font-bold">+{virtualDrawPerMatch} pts</span> per
              missed match added directly to their Total Points (PTS) without
              inflating Matches Played (MAT).
            </p>
          </div>
        )}
      </section>

      {/* Top 3 Podium Cards */}
      {standings.length >= 3 && completedMatchesCount > 0 && (
        <section
          aria-label="Top 3 Podium"
          className="grid grid-cols-3 gap-2.5"
        >
          {[standings[0], standings[1], standings[2]].map((player, idx) => {
            const rank = idx + 1;
            const podiumStyles =
              rank === 1
                ? 'border-amber-400 bg-gradient-to-b from-amber-50 to-white ring-1 ring-amber-300/60'
                : rank === 2
                  ? 'border-slate-300 bg-gradient-to-b from-slate-100 to-white'
                  : 'border-amber-700/40 bg-gradient-to-b from-orange-50/80 to-white';

            const badgeStyles =
              rank === 1
                ? 'bg-amber-400 text-slate-950'
                : rank === 2
                  ? 'bg-slate-300 text-slate-900'
                  : 'bg-amber-700 text-white';

            return (
              <div
                key={player.id}
                className={`flex flex-col items-center rounded-2xl border-2 p-3 text-center shadow-sm ${podiumStyles}`}
              >
                <span
                  className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-black shadow-sm ${badgeStyles}`}
                >
                  #{rank}
                </span>
                <p className="mt-2 w-full truncate text-sm font-extrabold text-slate-900">
                  {player.name}
                </p>
                <div className="mt-0.5 flex flex-wrap items-center justify-center gap-1">
                  <span className="text-lg font-black text-slate-950">
                    {player.totalPoints}{' '}
                    <span className="text-[10px] font-bold uppercase text-slate-500">
                      pts
                    </span>
                  </span>
                  {player.virtualPointsAdded > 0 && (
                    <span className="rounded-md bg-lime-300/80 px-1.5 py-0.5 text-[10px] font-extrabold text-slate-950">
                      +{player.virtualPointsAdded} pts
                    </span>
                  )}
                </div>
                <span className="text-[11px] font-semibold text-slate-500">
                  {player.wins}-{player.draws}-{player.losses} •{' '}
                  {player.pointDifference > 0
                    ? `+${player.pointDifference}`
                    : player.pointDifference}
                </span>
              </div>
            );
          })}
        </section>
      )}

      {/* Mobile-Optimized Horizontally Scrollable Leaderboard Table */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="w-full overflow-x-auto overscroll-x-contain">
          <table className="w-full min-w-[540px] border-collapse text-left text-sm">
            <caption className="sr-only">
              Tournament Leaderboard Standings
            </caption>
            <thead>
              <tr className="border-b border-slate-200 bg-slate-900 text-[11px] font-extrabold uppercase tracking-wider text-slate-300">
                <th scope="col" className="whitespace-nowrap py-3 pl-4 pr-2 text-center">
                  #
                </th>
                <th scope="col" className="whitespace-nowrap px-2.5 py-3">
                  Player
                </th>
                <th scope="col" className="whitespace-nowrap px-2.5 py-3 text-right text-lime-400">
                  PTS
                </th>
                <th scope="col" className="whitespace-nowrap px-2.5 py-3 text-center">
                  +VP
                </th>
                <th scope="col" className="whitespace-nowrap px-2.5 py-3 text-center">
                  W-D-L
                </th>
                <th scope="col" className="whitespace-nowrap px-2.5 py-3 text-center">
                  MAT
                </th>
                <th scope="col" className="whitespace-nowrap px-2.5 py-3 text-right">
                  AVG
                </th>
                <th scope="col" className="whitespace-nowrap py-3 pl-2.5 pr-4 text-right">
                  +/-
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {standings.map((player, index) => {
                const rank = index + 1;

                const rowAccent =
                  rank === 1
                    ? 'bg-amber-50/75 hover:bg-amber-100/70'
                    : rank === 2
                      ? 'bg-slate-100/70 hover:bg-slate-200/50'
                      : rank === 3
                        ? 'bg-orange-50/60 hover:bg-orange-100/50'
                        : 'bg-white hover:bg-slate-50';

                const rankBadge =
                  rank === 1
                    ? 'bg-amber-400 text-slate-950 font-black ring-2 ring-amber-200'
                    : rank === 2
                      ? 'bg-slate-300 text-slate-900 font-black'
                      : rank === 3
                        ? 'bg-amber-700 text-white font-black'
                        : 'bg-slate-100 text-slate-600 font-bold';

                const diffFormatted =
                  player.pointDifference > 0
                    ? `+${player.pointDifference}`
                    : `${player.pointDifference}`;

                const diffColor =
                  player.pointDifference > 0
                    ? 'text-emerald-700 font-bold'
                    : player.pointDifference < 0
                      ? 'text-rose-600 font-bold'
                      : 'text-slate-500 font-semibold';

                return (
                  <tr key={player.id} className={`transition ${rowAccent}`}>
                    {/* Position */}
                    <td className="whitespace-nowrap py-3.5 pl-4 pr-2 text-center">
                      <span
                        className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${rankBadge}`}
                      >
                        {rank}
                      </span>
                    </td>

                    {/* Player Name */}
                    <td className="whitespace-nowrap px-2.5 py-3.5">
                      <div className="flex items-center gap-1.5">
                        {rank <= 3 && (
                          <Award
                            className={`h-4 w-4 shrink-0 ${
                              rank === 1
                                ? 'text-amber-500'
                                : rank === 2
                                  ? 'text-slate-500'
                                  : 'text-amber-700'
                            }`}
                            aria-hidden="true"
                          />
                        )}
                        <span className="font-extrabold text-slate-900">
                          {player.name}
                        </span>
                        <span className="rounded bg-slate-200/80 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                          {player.level}
                        </span>
                      </div>
                      {player.virtualPointsAdded > 0 && (
                        <p className="mt-0.5 text-[11px] font-semibold text-slate-500">
                          {player.rawPoints} court pts ({player.missedMatches}{' '}
                          rested)
                        </p>
                      )}
                    </td>

                    {/* Total Points (PTS) + Inline Virtual Points Badge */}
                    <td className="whitespace-nowrap px-2.5 py-3.5 text-right">
                      <div className="inline-flex items-center justify-end gap-1.5">
                        <span className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-2.5 py-1 text-sm font-black text-lime-400">
                          {player.totalPoints}
                        </span>
                        {player.virtualPointsAdded > 0 && (
                          <span
                            title={`Includes +${player.virtualPointsAdded} Virtual Draw points`}
                            className="inline-flex items-center rounded-md border border-lime-500/50 bg-lime-300/60 px-1.5 py-0.5 text-[11px] font-extrabold text-slate-950"
                          >
                            +{player.virtualPointsAdded} pts
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Dedicated +VP Column */}
                    <td className="whitespace-nowrap px-2.5 py-3.5 text-center">
                      {player.virtualPointsAdded > 0 ? (
                        <span className="inline-flex items-center rounded-md bg-amber-100 px-2 py-0.5 text-xs font-extrabold text-amber-900">
                          +{player.virtualPointsAdded} pts
                        </span>
                      ) : (
                        <span className="text-xs font-medium text-slate-400">
                          —
                        </span>
                      )}
                    </td>

                    {/* W-D-L Column */}
                    <td className="whitespace-nowrap px-2.5 py-3.5 text-center">
                      <span className="inline-flex items-center rounded-lg bg-slate-100 px-2 py-1 font-mono text-xs font-bold text-slate-800">
                        {player.wins}-{player.draws}-{player.losses}
                      </span>
                    </td>

                    {/* Matches Played (MAT) */}
                    <td className="whitespace-nowrap px-2.5 py-3.5 text-center font-bold text-slate-700">
                      {player.matchesPlayed}
                    </td>

                    {/* Average Points (AVG) */}
                    <td className="whitespace-nowrap px-2.5 py-3.5 text-right font-semibold text-slate-700">
                      {player.averagePoints.toFixed(1)}
                    </td>

                    {/* Point Differential (+/-) */}
                    <td
                      className={`whitespace-nowrap py-3.5 pl-2.5 pr-4 text-right text-xs ${diffColor}`}
                    >
                      {diffFormatted}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Destructive End Tournament & Reset Button */}
      <div className="pt-2">
        <button
          type="button"
          onClick={() => confirmResetDialogRef.current?.showModal()}
          className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl border-2 border-rose-300 bg-rose-50 px-5 py-3.5 text-sm font-extrabold text-rose-700 transition hover:bg-rose-100 active:scale-[0.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-700"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          <span>End Tournament &amp; Reset</span>
        </button>
      </div>

      {/* Native Accessible Confirmation Modal Dialog */}
      <dialog
        ref={confirmResetDialogRef}
        aria-labelledby="reset-dialog-title"
        className="m-auto max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-xl backdrop:bg-slate-950/50"
      >
        <h3 id="reset-dialog-title" className="text-base font-extrabold text-slate-900">
          End Tournament &amp; Reset?
        </h3>
        <p className="mt-2 text-sm text-slate-600">
          This will clear the active tournament rounds and standings. Your saved
          player roster will be preserved for future sessions.
        </p>
        <div className="mt-5 flex justify-end gap-2.5">
          <button
            type="button"
            onClick={() => confirmResetDialogRef.current?.close()}
            className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirmReset}
            className="min-h-[44px] rounded-xl bg-rose-600 px-4 py-2 text-xs font-extrabold text-white hover:bg-rose-700"
          >
            Yes, Reset Tournament
          </button>
        </div>
      </dialog>
    </div>
  );
}
