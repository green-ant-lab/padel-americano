import { useMemo } from 'react';
import { Award, Calendar, Globe, History, Trash2, Trophy } from 'lucide-react';
import { useTournamentStore } from '../store/useTournamentStore';
import type { PlayerLevel } from '../types';

interface AllTimePlayerStat {
  key: string;
  id: string;
  name: string;
  level: PlayerLevel;
  allTimeTotalPoints: number;
  tournamentsPlayed: number;
  matchesPlayed: number;
  wins: number;
  titlesWon: number;
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

export default function HistoryView() {
  const history = useTournamentStore((state) => state.history);
  const clearHistory = useTournamentStore((state) => state.clearHistory);

  // Sort past tournaments newest first
  const sortedHistory = useMemo(() => {
    return [...history].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [history]);

  // Calculate All-Time Global Leaderboard across all archived tournaments
  const globalLeaderboard = useMemo<AllTimePlayerStat[]>(() => {
    const map = new Map<string, AllTimePlayerStat>();

    // Iterate chronological or newest-first; using sortedHistory ensures latest name/level wins
    for (const tournamentItem of sortedHistory) {
      tournamentItem.finalStandings.forEach((standing, index) => {
        const normalizedKey =
          standing.id || standing.name.trim().toLowerCase();
        const existing = map.get(normalizedKey);

        if (!existing) {
          map.set(normalizedKey, {
            key: normalizedKey,
            id: standing.id,
            name: standing.name,
            level: standing.level,
            allTimeTotalPoints: standing.totalPoints,
            tournamentsPlayed: 1,
            matchesPlayed: standing.matchesPlayed,
            wins: standing.wins ?? 0,
            titlesWon: index === 0 ? 1 : 0,
          });
        } else {
          existing.allTimeTotalPoints += standing.totalPoints;
          existing.tournamentsPlayed += 1;
          existing.matchesPlayed += standing.matchesPlayed;
          existing.wins += standing.wins ?? 0;
          if (index === 0) {
            existing.titlesWon += 1;
          }
        }
      });
    }

    return Array.from(map.values()).sort((a, b) => {
      if (b.allTimeTotalPoints !== a.allTimeTotalPoints) {
        return b.allTimeTotalPoints - a.allTimeTotalPoints;
      }
      if (b.titlesWon !== a.titlesWon) {
        return b.titlesWon - a.titlesWon;
      }
      if (b.wins !== a.wins) {
        return b.wins - a.wins;
      }
      return a.name.localeCompare(b.name);
    });
  }, [sortedHistory]);

  return (
    <div className="space-y-6 pb-20">
      {/* 1. All-Time Global Leaderboard Section */}
      <section
        aria-label="All-Time Global Leaderboard"
        className="overflow-hidden rounded-2xl border-2 border-lime-400 bg-white shadow-sm"
      >
        <div className="border-b border-slate-200 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 px-5 py-4 text-white">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-lime-400 text-slate-950 shadow-sm">
                <Globe className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-lime-400">
                  Global Statistics
                </span>
                <h2 className="text-base font-extrabold tracking-tight text-white">
                  All-Time Leaderboard
                </h2>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-lime-300">
                <Trophy className="h-3.5 w-3.5" aria-hidden="true" />
                {sortedHistory.length}{' '}
                {sortedHistory.length === 1 ? 'Tournament' : 'Tournaments'}
              </span>
            </div>
          </div>
        </div>

        {globalLeaderboard.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
              <Award className="h-6 w-6" aria-hidden="true" />
            </div>
            <p className="mt-3 text-sm font-bold text-slate-800">
              No Global Stats Recorded Yet
            </p>
            <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-slate-500">
              Finish and archive your first tournament to populate the All-Time
              Global Leaderboard.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                  <th scope="col" className="py-3 pl-5 pr-2">
                    Rank
                  </th>
                  <th scope="col" className="px-3 py-3">
                    Player
                  </th>
                  <th scope="col" className="px-3 py-3 text-center">
                    Events
                  </th>
                  <th scope="col" className="py-3 pl-3 pr-5 text-right">
                    All-Time Total Points
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {globalLeaderboard.map((player, index) => {
                  const rank = index + 1;
                  const isFirst = rank === 1;
                  const isSecond = rank === 2;
                  const isThird = rank === 3;

                  const rankBadge = isFirst
                    ? '1st 🥇'
                    : isSecond
                    ? '2nd 🥈'
                    : isThird
                    ? '3rd 🥉'
                    : `#${rank}`;

                  return (
                    <tr
                      key={player.key}
                      className={`transition ${
                        isFirst
                          ? 'bg-lime-50/70 font-bold'
                          : 'bg-white hover:bg-slate-50/80'
                      }`}
                    >
                      <td className="whitespace-nowrap py-3.5 pl-5 pr-2">
                        <span
                          className={`inline-flex items-center justify-center rounded-lg px-2 py-1 text-xs font-extrabold ${
                            isFirst
                              ? 'bg-lime-400 text-slate-950 shadow-sm'
                              : isSecond
                              ? 'bg-slate-200 text-slate-900'
                              : isThird
                              ? 'bg-amber-100 text-amber-950'
                              : 'text-slate-500'
                          }`}
                        >
                          {rankBadge}
                        </span>
                      </td>

                      <td className="px-3 py-3.5">
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-slate-900">
                            {player.name}
                          </span>
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                            {player.level}
                          </span>
                          {player.titlesWon > 0 && (
                            <span
                              title={`${player.titlesWon} tournament win${
                                player.titlesWon > 1 ? 's' : ''
                              }`}
                              className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-extrabold text-amber-900"
                            >
                              🏆 {player.titlesWon}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="whitespace-nowrap px-3 py-3.5 text-center text-xs font-bold text-slate-600">
                        {player.tournamentsPlayed}
                      </td>

                      <td className="whitespace-nowrap py-3.5 pl-3 pr-5 text-right">
                        <span
                          className={`inline-flex items-center rounded-xl px-3 py-1 text-xs font-black ${
                            isFirst
                              ? 'bg-slate-900 text-lime-400 shadow-sm'
                              : 'bg-slate-100 text-slate-900'
                          }`}
                        >
                          {player.allTimeTotalPoints} pts
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 2. Past Tournaments History List */}
      <section
        aria-label="Past Tournaments"
        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-lime-400">
              <History className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-base font-extrabold text-slate-900">
                Past Tournaments
              </h2>
              <p className="text-xs text-slate-500">
                {sortedHistory.length === 0
                  ? 'No archived sessions yet'
                  : `${sortedHistory.length} completed tournament${
                      sortedHistory.length === 1 ? '' : 's'
                    }`}
              </p>
            </div>
          </div>

          {sortedHistory.length > 0 && (
            <button
              type="button"
              onClick={() => clearHistory()}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50/70 px-3 py-1.5 text-xs font-bold text-rose-700 transition hover:bg-rose-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              Clear History
            </button>
          )}
        </div>

        <div className="mt-4 space-y-3">
          {sortedHistory.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center">
              <p className="text-sm font-bold text-slate-700">
                No Past Tournaments Yet
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Completed tournaments are automatically archived here when you
                finish and reset a session.
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
                    <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-slate-900">
                      <Calendar
                        className="h-3.5 w-3.5 text-slate-500"
                        aria-hidden="true"
                      />
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
        </div>
      </section>
    </div>
  );
}
