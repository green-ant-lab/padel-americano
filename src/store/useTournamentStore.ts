import { create } from 'zustand';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  increment,
  onSnapshot,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, COLLECTIONS } from '../lib/firebase';
import type {
  Player,
  PlayerLevel,
  PlayerStanding,
  Round,
  TargetPoints,
  TotalCourts,
  Tournament,
  TournamentHistoryItem,
} from '../types';
import {
  calculateStandings,
  generateRounds,
  getPairKey,
} from '../lib/americanoEngine';

export interface CreateTournamentInput {
  activePlayers: Player[];
  totalCourts: TotalCourts;
  targetPoints: TargetPoints;
  targetRounds?: number;
  rounds?: Round[];
}

/**
 * Firestore document shape stored in the `tournaments` collection.
 * Includes `isActive` and `isHistorical` flags to distinguish the live session
 * from archived past sessions.
 */
export interface FirestoreTournamentDoc extends Tournament {
  isActive: boolean;
  isHistorical: boolean;
  date: string;
  configuration: string;
  finalStandings: PlayerStanding[];
  recordedPairMatchIds: string[];
  matchScores?: Record<
    string,
    {
      scoreA: number;
      scoreB: number;
      isCompleted: boolean;
      updatedAt: string;
    }
  >;
  updatedAt: string;
}

export interface TournamentState {
  /** The single active tournament state synced via Firestore onSnapshot */
  tournament: Tournament | null;
  /** Real-time list of available players from the `roster` collection */
  roster: Player[];
  /** Real-time archive of historical tournaments from `tournaments` (isHistorical == true) */
  history: TournamentHistoryItem[];
  /** Real-time teammate count map from `pair_history` collection (`"id1_id2" -> count`) */
  pairHistory: Record<string, number>;
  /** Indicates whether real-time Firestore listeners have delivered their initial snapshot */
  isSynced: boolean;

  // Real-time subscription lifecycle
  subscribeToFirestore: () => Unsubscribe;

  // Roster Actions (synced to `roster` collection)
  addRosterPlayer: (name: string, level: PlayerLevel) => Player;
  updateRosterPlayer: (
    id: string,
    updates: Partial<Pick<Player, 'name' | 'level'>>
  ) => void;
  removeRosterPlayer: (id: string) => void;

  // Core Tournament Actions (synced to `tournaments` and `pair_history` collections)
  createTournament: (input: CreateTournamentInput) => void;
  updateMatchScore: (
    matchId: string,
    scoreA: number,
    scoreB: number,
    isCompleted?: boolean
  ) => void;
  nextRound: () => void;
  setCurrentRoundIndex: (index: number) => void;
  addBonusRound: (bonusRound?: Round) => void;
  finalizeTournament: () => void;
  archiveAndResetTournament: () => void;
  resetTournament: () => void;
  clearHistory: () => void;
}

/**
 * Pure helper that deterministically recomputes each active player's
 * tournament stats (totalPoints, matchesPlayed, pointDiff) from all
 * completed matches across all rounds.
 */
function recalculatePlayerStats(players: Player[], rounds: Round[]): Player[] {
  const statsMap = new Map<
    string,
    { totalPoints: number; matchesPlayed: number; pointDiff: number }
  >();

  for (const player of players) {
    statsMap.set(player.id, {
      totalPoints: 0,
      matchesPlayed: 0,
      pointDiff: 0,
    });
  }

  for (const round of rounds) {
    for (const match of round.matches) {
      if (!match.isCompleted) continue;

      const diffA = match.scoreA - match.scoreB;
      const diffB = match.scoreB - match.scoreA;

      for (const playerId of match.teamA) {
        const current = statsMap.get(playerId);
        if (current) {
          current.totalPoints += match.scoreA;
          current.matchesPlayed += 1;
          current.pointDiff += diffA;
        }
      }

      for (const playerId of match.teamB) {
        const current = statsMap.get(playerId);
        if (current) {
          current.totalPoints += match.scoreB;
          current.matchesPlayed += 1;
          current.pointDiff += diffB;
        }
      }
    }
  }

  return players.map((player) => {
    const stats = statsMap.get(player.id);
    if (!stats) return player;
    return {
      ...player,
      totalPoints: stats.totalPoints,
      matchesPlayed: stats.matchesPlayed,
      pointDiff: stats.pointDiff,
    };
  });
}

function formatConfigurationLabel(tournament: Tournament): string {
  const courtLabel = tournament.totalCourts === 1 ? '1 Court' : '2 Courts';
  return `${tournament.activePlayers.length} Players • ${courtLabel} • ${tournament.targetPoints} Pts`;
}

function buildTournamentHistoryItem(
  tournament: Tournament,
  isoDate?: string
): TournamentHistoryItem {
  return {
    id: tournament.id,
    date: isoDate ?? new Date().toISOString(),
    configuration: formatConfigurationLabel(tournament),
    finalStandings: calculateStandings(tournament),
  };
}

/**
 * Computes the incremental pair counts for completed matches that have not yet
 * been recorded in `alreadyRecordedIds`.
 */
function computeUnrecordedPairIncrements(
  tournament: Tournament,
  alreadyRecordedIds: string[] = []
): {
  pairIncrements: Record<string, number>;
  updatedRecordedIds: string[];
} {
  const recordedSet = new Set(alreadyRecordedIds);
  const pairIncrements: Record<string, number> = {};

  for (const round of tournament.rounds) {
    for (const match of round.matches) {
      if (!match.isCompleted || recordedSet.has(match.id)) {
        continue;
      }

      const keyA = getPairKey(match.teamA[0], match.teamA[1]);
      const keyB = getPairKey(match.teamB[0], match.teamB[1]);

      pairIncrements[keyA] = (pairIncrements[keyA] ?? 0) + 1;
      pairIncrements[keyB] = (pairIncrements[keyB] ?? 0) + 1;

      recordedSet.add(match.id);
    }
  }

  return {
    pairIncrements,
    updatedRecordedIds: Array.from(recordedSet),
  };
}

let activeListenersUnsubscribe: Unsubscribe | null = null;

export const useTournamentStore = create<TournamentState>()((set, get) => ({
  tournament: null,
  roster: [],
  history: [],
  pairHistory: {},
  isSynced: false,

  subscribeToFirestore: () => {
    if (activeListenersUnsubscribe) {
      return activeListenersUnsubscribe;
    }

    // 1. Real-time listener for the active tournament (`tournaments` where `isActive == true`)
    const activeTournamentQuery = query(
      collection(db, COLLECTIONS.TOURNAMENTS),
      where('isActive', '==', true)
    );

    const unsubActiveTournament = onSnapshot(
      activeTournamentQuery,
      (snapshot) => {
        if (snapshot.empty) {
          set({ tournament: null, isSynced: true });
          return;
        }

        // Pick the most recently updated active tournament document
        const docs = snapshot.docs.map(
          (d) => d.data() as FirestoreTournamentDoc
        );
        docs.sort((a, b) =>
          (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')
        );
        const activeDoc = docs[0];

        set({
          tournament: {
            id: activeDoc.id,
            activePlayers: activeDoc.activePlayers,
            totalCourts: activeDoc.totalCourts,
            targetPoints: activeDoc.targetPoints,
            rounds: activeDoc.rounds,
            currentRoundIndex: activeDoc.currentRoundIndex,
            isFinished: activeDoc.isFinished,
          },
          isSynced: true,
        });
      },
      (error) => {
        console.error('Firestore active tournament listener error:', error);
      }
    );

    // 2. Real-time listener for historical tournaments (`tournaments` where `isHistorical == true`)
    const historicalTournamentsQuery = query(
      collection(db, COLLECTIONS.TOURNAMENTS),
      where('isHistorical', '==', true)
    );

    const unsubHistory = onSnapshot(
      historicalTournamentsQuery,
      (snapshot) => {
        const items: TournamentHistoryItem[] = snapshot.docs.map((docSnap) => {
          const data = docSnap.data() as FirestoreTournamentDoc;
          return {
            id: data.id ?? docSnap.id,
            date: data.date ?? data.updatedAt ?? new Date().toISOString(),
            configuration:
              data.configuration ?? formatConfigurationLabel(data),
            finalStandings:
              data.finalStandings ?? calculateStandings(data),
          };
        });

        items.sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        );

        set({ history: items });
      },
      (error) => {
        console.error('Firestore tournament history listener error:', error);
      }
    );

    // 3. Real-time listener for `roster` collection
    const unsubRoster = onSnapshot(
      collection(db, COLLECTIONS.ROSTER),
      (snapshot) => {
        const rosterPlayers: Player[] = snapshot.docs.map(
          (docSnap) => docSnap.data() as Player
        );
        rosterPlayers.sort((a, b) => a.name.localeCompare(b.name));
        set({ roster: rosterPlayers });
      },
      (error) => {
        console.error('Firestore roster listener error:', error);
      }
    );

    // 4. Real-time listener for `pair_history` collection
    const unsubPairHistory = onSnapshot(
      collection(db, COLLECTIONS.PAIR_HISTORY),
      (snapshot) => {
        const historyMap: Record<string, number> = {};
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as { count?: number };
          historyMap[docSnap.id] = Number(data.count ?? 0);
        });
        set({ pairHistory: historyMap });
      },
      (error) => {
        console.error('Firestore pair_history listener error:', error);
      }
    );

    activeListenersUnsubscribe = () => {
      unsubActiveTournament();
      unsubHistory();
      unsubRoster();
      unsubPairHistory();
      activeListenersUnsubscribe = null;
    };

    return activeListenersUnsubscribe;
  },

  addRosterPlayer: (name, level) => {
    const newPlayer: Player = {
      id: crypto.randomUUID(),
      name: name.trim(),
      level,
      totalPoints: 0,
      matchesPlayed: 0,
      pointDiff: 0,
    };

    // Optimistic UI update
    set((state) => ({
      roster: [...state.roster, newPlayer],
    }));

    // Persist to `roster` collection in Firestore
    const playerRef = doc(db, COLLECTIONS.ROSTER, newPlayer.id);
    void setDoc(playerRef, newPlayer).catch((err) => {
      console.error('Failed to add player to Firestore roster:', err);
    });

    return newPlayer;
  },

  updateRosterPlayer: (id, updates) => {
    set((state) => ({
      roster: state.roster.map((player) =>
        player.id === id ? { ...player, ...updates } : player
      ),
    }));

    const playerRef = doc(db, COLLECTIONS.ROSTER, id);
    void updateDoc(playerRef, updates).catch((err) => {
      console.error('Failed to update roster player in Firestore:', err);
    });
  },

  removeRosterPlayer: (id) => {
    set((state) => ({
      roster: state.roster.filter((player) => player.id !== id),
    }));

    const playerRef = doc(db, COLLECTIONS.ROSTER, id);
    void deleteDoc(playerRef).catch((err) => {
      console.error('Failed to delete roster player from Firestore:', err);
    });
  },

  createTournament: ({
    activePlayers,
    totalCourts,
    targetPoints,
    targetRounds,
    rounds,
  }) => {
    const state = get();
    const sanitizedPlayers: Player[] = activePlayers.map((player) => ({
      ...player,
      totalPoints: 0,
      matchesPlayed: 0,
      pointDiff: 0,
    }));

    const defaultRoundCount =
      targetRounds ?? Math.max(sanitizedPlayers.length - 1, 4);
    const generatedOrProvidedRounds =
      rounds ??
      generateRounds(
        sanitizedPlayers,
        totalCourts,
        defaultRoundCount,
        state.pairHistory
      );

    const initialPlayersWithStats = recalculatePlayerStats(
      sanitizedPlayers,
      generatedOrProvidedRounds
    );

    const nowIso = new Date().toISOString();
    const newTournament: Tournament = {
      id: crypto.randomUUID(),
      activePlayers: initialPlayersWithStats,
      totalCourts,
      targetPoints,
      rounds: generatedOrProvidedRounds,
      currentRoundIndex: 0,
      isFinished: false,
    };

    const existingRosterIds = new Set(state.roster.map((p) => p.id));
    const newRosterEntries = sanitizedPlayers.filter(
      (p) => !existingRosterIds.has(p.id)
    );

    // Optimistic local state update
    set({
      tournament: newTournament,
      roster:
        newRosterEntries.length > 0
          ? [...state.roster, ...newRosterEntries]
          : state.roster,
    });

    // Persist to Firestore: deactivate any previously active tournaments and create the new one
    void (async () => {
      try {
        const batch = writeBatch(db);

        // Deactivate any previous active tournament documents
        const prevActiveQuery = query(
          collection(db, COLLECTIONS.TOURNAMENTS),
          where('isActive', '==', true)
        );
        const prevActiveSnap = await getDocs(prevActiveQuery);
        prevActiveSnap.forEach((docSnap) => {
          batch.update(docSnap.ref, {
            isActive: false,
            updatedAt: nowIso,
          });
        });

        // Ensure any new players are also saved in the `roster` collection
        for (const newPlayer of newRosterEntries) {
          batch.set(doc(db, COLLECTIONS.ROSTER, newPlayer.id), newPlayer);
        }

        // Write the new active tournament document
        const firestoreDoc: FirestoreTournamentDoc = {
          ...newTournament,
          isActive: true,
          isHistorical: false,
          date: nowIso,
          configuration: formatConfigurationLabel(newTournament),
          finalStandings: calculateStandings(newTournament),
          recordedPairMatchIds: [],
          matchScores: {},
          updatedAt: nowIso,
        };

        batch.set(
          doc(db, COLLECTIONS.TOURNAMENTS, newTournament.id),
          firestoreDoc
        );

        await batch.commit();
      } catch (err) {
        console.error('Failed to create tournament in Firestore:', err);
      }
    })();
  },

  /**
   * Updates a single match's score using an atomic Firestore transaction
   * (`runTransaction`) and targeted field updates (`matchScores.<matchId>`,
   * `rounds`, `activePlayers`), preventing race conditions when players on
   * Court 1 and Court 2 submit scores simultaneously from different phones.
   */
  updateMatchScore: (matchId, scoreA, scoreB, isCompleted = true) => {
    const currentTournament = get().tournament;
    if (!currentTournament) return;

    const tournamentId = currentTournament.id;

    // 1. Optimistic local state update for responsive mobile feel
    set((state) => {
      if (!state.tournament || state.tournament.id !== tournamentId) {
        return state;
      }

      const updatedRounds = state.tournament.rounds.map((round) => ({
        ...round,
        matches: round.matches.map((match) =>
          match.id === matchId
            ? { ...match, scoreA, scoreB, isCompleted }
            : match
        ),
      }));

      const updatedActivePlayers = recalculatePlayerStats(
        state.tournament.activePlayers,
        updatedRounds
      );

      return {
        tournament: {
          ...state.tournament,
          rounds: updatedRounds,
          activePlayers: updatedActivePlayers,
        },
      };
    });

    // 2. Atomic Firestore transaction on `tournaments/{tournamentId}`
    const tournamentRef = doc(db, COLLECTIONS.TOURNAMENTS, tournamentId);

    void runTransaction(db, async (transaction) => {
      const tourneySnap = await transaction.get(tournamentRef);
      if (!tourneySnap.exists()) return;

      const latestData = tourneySnap.data() as FirestoreTournamentDoc;

      // Apply this match's score onto the latest server `rounds` state
      const updatedRounds = latestData.rounds.map((round) => ({
        ...round,
        matches: round.matches.map((match) =>
          match.id === matchId
            ? { ...match, scoreA, scoreB, isCompleted }
            : match
        ),
      }));

      const updatedActivePlayers = recalculatePlayerStats(
        latestData.activePlayers,
        updatedRounds
      );

      const nowIso = new Date().toISOString();

      transaction.update(tournamentRef, {
        rounds: updatedRounds,
        activePlayers: updatedActivePlayers,
        [`matchScores.${matchId}`]: {
          scoreA,
          scoreB,
          isCompleted,
          updatedAt: nowIso,
        },
        updatedAt: nowIso,
      });
    }).catch((err) => {
      console.error('Transaction failed when updating match score:', err);
    });
  },

  nextRound: () => {
    const currentTournament = get().tournament;
    if (!currentTournament) return;

    const maxIndex = Math.max(0, currentTournament.rounds.length - 1);
    const nextIndex = Math.min(
      currentTournament.currentRoundIndex + 1,
      maxIndex
    );

    set((state) =>
      state.tournament
        ? {
            tournament: {
              ...state.tournament,
              currentRoundIndex: nextIndex,
            },
          }
        : state
    );

    const tournamentRef = doc(
      db,
      COLLECTIONS.TOURNAMENTS,
      currentTournament.id
    );
    void updateDoc(tournamentRef, {
      currentRoundIndex: nextIndex,
      updatedAt: new Date().toISOString(),
    }).catch((err) => {
      console.error('Failed to advance round in Firestore:', err);
    });
  },

  setCurrentRoundIndex: (index) => {
    const currentTournament = get().tournament;
    if (!currentTournament) return;

    const clamped = Math.max(
      0,
      Math.min(index, currentTournament.rounds.length - 1)
    );

    set((state) =>
      state.tournament
        ? {
            tournament: {
              ...state.tournament,
              currentRoundIndex: clamped,
            },
          }
        : state
    );

    const tournamentRef = doc(
      db,
      COLLECTIONS.TOURNAMENTS,
      currentTournament.id
    );
    void updateDoc(tournamentRef, {
      currentRoundIndex: clamped,
      updatedAt: new Date().toISOString(),
    }).catch((err) => {
      console.error('Failed to set currentRoundIndex in Firestore:', err);
    });
  },

  addBonusRound: (bonusRound) => {
    const state = get();
    if (!state.tournament) return;

    const tournamentId = state.tournament.id;
    const currentPairHistory = state.pairHistory;

    const nextRoundNumber = state.tournament.rounds.length + 1;
    let roundToAdd: Round;

    if (bonusRound) {
      roundToAdd = {
        ...bonusRound,
        roundNumber: nextRoundNumber,
      };
    } else {
      const simulatedRounds = generateRounds(
        state.tournament.activePlayers,
        state.tournament.totalCourts,
        nextRoundNumber,
        currentPairHistory
      );
      roundToAdd = simulatedRounds[simulatedRounds.length - 1] ?? {
        id: crypto.randomUUID(),
        roundNumber: nextRoundNumber,
        matches: [],
        restingPlayers: [],
      };
    }

    const optimisticRounds = [...state.tournament.rounds, roundToAdd];

    set({
      tournament: {
        ...state.tournament,
        rounds: optimisticRounds,
        currentRoundIndex: optimisticRounds.length - 1,
        isFinished: false,
      },
    });

    const tournamentRef = doc(db, COLLECTIONS.TOURNAMENTS, tournamentId);
    void runTransaction(db, async (transaction) => {
      const snap = await transaction.get(tournamentRef);
      if (!snap.exists()) return;

      const latest = snap.data() as FirestoreTournamentDoc;
      const appendedRound: Round = {
        ...roundToAdd,
        roundNumber: latest.rounds.length + 1,
      };
      const updatedRounds = [...latest.rounds, appendedRound];

      transaction.update(tournamentRef, {
        rounds: updatedRounds,
        currentRoundIndex: updatedRounds.length - 1,
        isFinished: false,
        updatedAt: new Date().toISOString(),
      });
    }).catch((err) => {
      console.error('Failed to add bonus round in Firestore:', err);
    });
  },

  finalizeTournament: () => {
    const state = get();
    if (!state.tournament) return;

    const tournamentId = state.tournament.id;
    const nowIso = new Date().toISOString();

    const finalPlayers = recalculatePlayerStats(
      state.tournament.activePlayers,
      state.tournament.rounds
    );

    const finalizedTournament: Tournament = {
      ...state.tournament,
      activePlayers: finalPlayers,
      isFinished: true,
    };

    const historyItem = buildTournamentHistoryItem(
      finalizedTournament,
      nowIso
    );

    set((prev) => ({
      tournament: finalizedTournament,
      history: [
        historyItem,
        ...prev.history.filter((h) => h.id !== tournamentId),
      ],
    }));

    const tournamentRef = doc(db, COLLECTIONS.TOURNAMENTS, tournamentId);

    void runTransaction(db, async (transaction) => {
      const snap = await transaction.get(tournamentRef);
      if (!snap.exists()) return;

      const latest = snap.data() as FirestoreTournamentDoc;
      const recomputedPlayers = recalculatePlayerStats(
        latest.activePlayers,
        latest.rounds
      );

      const updatedTourney: Tournament = {
        ...latest,
        activePlayers: recomputedPlayers,
        isFinished: true,
      };

      const { pairIncrements, updatedRecordedIds } =
        computeUnrecordedPairIncrements(
          updatedTourney,
          latest.recordedPairMatchIds ?? []
        );

      // Update tournament document as finalized & historical
      transaction.update(tournamentRef, {
        activePlayers: recomputedPlayers,
        isFinished: true,
        isHistorical: true,
        date: nowIso,
        configuration: formatConfigurationLabel(updatedTourney),
        finalStandings: calculateStandings(updatedTourney),
        recordedPairMatchIds: updatedRecordedIds,
        updatedAt: nowIso,
      });

      // Atomically increment teammate counts in `pair_history` collection
      for (const [pairKey, delta] of Object.entries(pairIncrements)) {
        const pairDocRef = doc(db, COLLECTIONS.PAIR_HISTORY, pairKey);
        transaction.set(
          pairDocRef,
          {
            pairKey,
            count: increment(delta),
            updatedAt: nowIso,
          },
          { merge: true }
        );
      }
    }).catch((err) => {
      console.error('Failed to finalize tournament in Firestore:', err);
    });
  },

  archiveAndResetTournament: () => {
    const state = get();
    const activeTournament = state.tournament;
    if (!activeTournament) {
      set({ tournament: null });
      return;
    }

    const tournamentId = activeTournament.id;
    const nowIso = new Date().toISOString();
    const historyItem = buildTournamentHistoryItem(activeTournament, nowIso);

    set((prev) => ({
      tournament: null,
      history: [
        historyItem,
        ...prev.history.filter((h) => h.id !== tournamentId),
      ],
    }));

    const tournamentRef = doc(db, COLLECTIONS.TOURNAMENTS, tournamentId);

    void runTransaction(db, async (transaction) => {
      const snap = await transaction.get(tournamentRef);
      if (!snap.exists()) return;

      const latest = snap.data() as FirestoreTournamentDoc;
      const recomputedPlayers = recalculatePlayerStats(
        latest.activePlayers,
        latest.rounds
      );
      const updatedTourney: Tournament = {
        ...latest,
        activePlayers: recomputedPlayers,
        isFinished: true,
      };

      const { pairIncrements, updatedRecordedIds } =
        computeUnrecordedPairIncrements(
          updatedTourney,
          latest.recordedPairMatchIds ?? []
        );

      transaction.update(tournamentRef, {
        activePlayers: recomputedPlayers,
        isActive: false,
        isHistorical: true,
        isFinished: true,
        date: nowIso,
        configuration: formatConfigurationLabel(updatedTourney),
        finalStandings: calculateStandings(updatedTourney),
        recordedPairMatchIds: updatedRecordedIds,
        updatedAt: nowIso,
      });

      for (const [pairKey, delta] of Object.entries(pairIncrements)) {
        const pairDocRef = doc(db, COLLECTIONS.PAIR_HISTORY, pairKey);
        transaction.set(
          pairDocRef,
          {
            pairKey,
            count: increment(delta),
            updatedAt: nowIso,
          },
          { merge: true }
        );
      }
    }).catch((err) => {
      console.error('Failed to archive and reset tournament in Firestore:', err);
    });
  },

  resetTournament: () => {
    get().archiveAndResetTournament();
  },

  clearHistory: () => {
    set({ history: [] });

    void (async () => {
      try {
        const histQuery = query(
          collection(db, COLLECTIONS.TOURNAMENTS),
          where('isHistorical', '==', true)
        );
        const snap = await getDocs(histQuery);
        const batch = writeBatch(db);

        snap.forEach((docSnap) => {
          const data = docSnap.data() as FirestoreTournamentDoc;
          if (data.isActive) {
            batch.update(docSnap.ref, { isHistorical: false });
          } else {
            batch.delete(docSnap.ref);
          }
        });

        await batch.commit();
      } catch (err) {
        console.error('Failed to clear tournament history in Firestore:', err);
      }
    })();
  },
}));

// Automatically initialize real-time Firestore listeners in browser environments
if (typeof window !== 'undefined') {
  try {
    useTournamentStore.getState().subscribeToFirestore();
  } catch (err) {
    console.warn('Deferred Firestore listener initialization:', err);
  }
}
