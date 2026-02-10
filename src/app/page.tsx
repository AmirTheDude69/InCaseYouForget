"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./page.module.css";

type Letter = {
  id: string;
  number: string;
  tag: string;
  text: string;
  audio: string;
};

type LetterStatus = "read" | "hearted" | "archived";

type LetterState = {
  status: LetterStatus;
  seenAt: number;
  updatedAt: number;
};

const STORAGE_KEY = "in-case-you-forget-actions-v1";

const statusLabel: Record<LetterStatus, string> = {
  read: "Read",
  hearted: "Hearted",
  archived: "Archived",
};

function CassetteIcon({ playing }: { playing: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 64 64"
      className={styles.cassetteIcon}
      data-playing={playing}
    >
      <rect x="8" y="14" width="48" height="36" rx="4" ry="4" />
      <circle cx="24" cy="32" r="7" />
      <circle cx="40" cy="32" r="7" />
      <rect x="20" y="20" width="24" height="6" rx="2" ry="2" />
      <path d="M18 45h28" />
    </svg>
  );
}

function HeartIcon({ active }: { active: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 64 64" className={styles.lineIcon}>
      <path
        d="M32 52C26 45 11 36 11 22c0-7 5-12 12-12 4 0 8 2 10 6 2-4 6-6 10-6 7 0 12 5 12 12 0 14-15 23-23 30z"
        data-active={active}
      />
    </svg>
  );
}

function EnvelopeIcon({ active }: { active: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 64 64" className={styles.lineIcon}>
      <rect x="10" y="16" width="44" height="32" rx="4" ry="4" data-active={active} />
      <path d="M10 20l22 17 22-17" data-active={active} />
    </svg>
  );
}

const statusClass = (status: LetterStatus) => {
  if (status === "hearted") {
    return styles.statusHearted;
  }

  if (status === "archived") {
    return styles.statusArchived;
  }

  return styles.statusRead;
};

export default function Home() {
  const [letters, setLetters] = useState<Letter[]>([]);
  const [actions, setActions] = useState<Record<string, LetterState>>({});
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUncrumpling, setIsUncrumpling] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [activeAudioId, setActiveAudioId] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const unfoldTimerRef = useRef<number | null>(null);

  const setAndPersistActions = useCallback(
    (
      updater: (
        previous: Record<string, LetterState>,
      ) => Record<string, LetterState>,
    ) => {
      setActions((previous) => {
        const next = updater(previous);

        if (next !== previous) {
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
          } catch {
            // Ignore write failures in private browsing contexts.
          }
        }

        return next;
      });
    },
    [],
  );

  const stopAudio = useCallback(() => {
    const player = audioRef.current;

    if (player) {
      player.pause();
      player.currentTime = 0;
      audioRef.current = null;
    }

    setActiveAudioId(null);
  }, []);

  const markRead = useCallback(
    (letterId: string) => {
      setAndPersistActions((previous) => {
        if (previous[letterId]) {
          return previous;
        }

        const now = Date.now();

        return {
          ...previous,
          [letterId]: {
            status: "read",
            seenAt: now,
            updatedAt: now,
          },
        };
      });
    },
    [setAndPersistActions],
  );

  const updateStatus = useCallback(
    (letterId: string, status: LetterStatus) => {
      setAndPersistActions((previous) => {
        const existing = previous[letterId];

        if (existing?.status === status) {
          return previous;
        }

        const now = Date.now();

        return {
          ...previous,
          [letterId]: {
            status,
            seenAt: existing?.seenAt ?? now,
            updatedAt: now,
          },
        };
      });
    },
    [setAndPersistActions],
  );

  const toggleAudio = useCallback(
    (letter: Letter) => {
      if (!letter.audio) {
        return;
      }

      if (activeAudioId === letter.id) {
        stopAudio();
        return;
      }

      const existingPlayer = audioRef.current;
      if (existingPlayer) {
        existingPlayer.pause();
        existingPlayer.currentTime = 0;
      }

      const nextPlayer = new Audio(letter.audio);

      nextPlayer.onended = () => {
        if (audioRef.current === nextPlayer) {
          audioRef.current = null;
          setActiveAudioId(null);
        }
      };

      nextPlayer.onerror = () => {
        if (audioRef.current === nextPlayer) {
          audioRef.current = null;
          setActiveAudioId(null);
        }
      };

      void nextPlayer
        .play()
        .then(() => {
          audioRef.current = nextPlayer;
          setActiveAudioId(letter.id);
        })
        .catch(() => {
          if (audioRef.current === nextPlayer) {
            audioRef.current = null;
          }
          setActiveAudioId(null);
        });
    },
    [activeAudioId, stopAudio],
  );

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);

      if (!stored) {
        return;
      }

      const parsed = JSON.parse(stored) as Record<string, LetterState>;

      if (parsed && typeof parsed === "object") {
        setActions(parsed);
      }
    } catch {
      // Ignore parse/storage errors and start fresh.
    }
  }, []);

  useEffect(() => {
    let ignore = false;

    const loadLetters = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/letters", { cache: "no-store" });
        const payload = (await response.json()) as {
          letters?: Letter[];
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error || "Could not load your letters.");
        }

        if (!Array.isArray(payload.letters)) {
          throw new Error("Unexpected data from Google Sheets.");
        }

        if (!ignore) {
          setLetters(payload.letters);
        }
      } catch (caughtError) {
        if (!ignore) {
          const message =
            caughtError instanceof Error
              ? caughtError.message
              : "Could not load your letters.";
          setError(message);
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    };

    void loadLetters();

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (unfoldTimerRef.current) {
        window.clearTimeout(unfoldTimerRef.current);
      }

      stopAudio();
    };
  }, [stopAudio]);

  const unseenLetters = useMemo(
    () => letters.filter((letter) => !actions[letter.id]),
    [actions, letters],
  );

  const archiveItems = useMemo(
    () =>
      letters
        .filter((letter) => Boolean(actions[letter.id]))
        .sort(
          (first, second) =>
            (actions[second.id]?.updatedAt ?? 0) -
            (actions[first.id]?.updatedAt ?? 0),
        ),
    [actions, letters],
  );

  const currentLetter = useMemo(
    () => letters.find((letter) => letter.id === currentId) ?? null,
    [currentId, letters],
  );

  const currentStatus = currentLetter
    ? actions[currentLetter.id]?.status ?? "read"
    : null;

  const openRandomLetter = useCallback(() => {
    if (unseenLetters.length === 0) {
      return;
    }

    stopAudio();

    const selected = unseenLetters[Math.floor(Math.random() * unseenLetters.length)];

    setCurrentId(selected.id);
    markRead(selected.id);
    setShowArchive(false);
    setIsUncrumpling(true);

    if (unfoldTimerRef.current) {
      window.clearTimeout(unfoldTimerRef.current);
    }

    unfoldTimerRef.current = window.setTimeout(() => {
      setIsUncrumpling(false);
    }, 800);
  }, [markRead, stopAudio, unseenLetters]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>In Case You Forget</h1>
        <p className={styles.subtitle}>
          A pocket of letters, poems, and little reminders written just for you.
        </p>

        <div className={styles.headerControls}>
          <button
            type="button"
            className={styles.archiveToggle}
            onClick={() => setShowArchive((previous) => !previous)}
          >
            {showArchive
              ? "Back to Sealed Notes"
              : `Archive Gallery (${archiveItems.length})`}
          </button>

          {!showArchive && (
            <p className={styles.remainingText}>{unseenLetters.length} sealed</p>
          )}
        </div>
      </header>

      <main className={styles.main}>
        {loading && (
          <section className={styles.messageCard}>
            <p>Gathering letters from your sheet...</p>
          </section>
        )}

        {!loading && error && (
          <section className={styles.messageCard}>
            <h2>Could not load the letters</h2>
            <p>{error}</p>
            <p>
              Ensure the Google Sheet is shareable for anyone with the link and
              includes columns named <strong>#</strong>, <strong>Tag</strong>,
              <strong> Text</strong>, and <strong>Audio</strong>.
            </p>
          </section>
        )}

        {!loading && !error && letters.length === 0 && (
          <section className={styles.messageCard}>
            <p>No entries were found in the sheet yet.</p>
          </section>
        )}

        {!loading && !error && letters.length > 0 && !showArchive && (
          <section className={styles.letterStage}>
            <article
              className={`${styles.paper} ${
                currentLetter ? styles.paperOpen : styles.paperClosed
              } ${isUncrumpling ? styles.uncrumple : ""}`}
            >
              {currentLetter ? (
                <>
                  <div className={styles.paperTop}>
                    <span className={styles.tag}>{currentLetter.tag}</span>

                    <button
                      type="button"
                      className={styles.cassetteButton}
                      onClick={() => toggleAudio(currentLetter)}
                      aria-label={
                        activeAudioId === currentLetter.id
                          ? "Stop audio"
                          : "Play audio"
                      }
                      disabled={!currentLetter.audio}
                      title={
                        currentLetter.audio
                          ? "Play audio"
                          : "No audio link for this note"
                      }
                    >
                      <CassetteIcon playing={activeAudioId === currentLetter.id} />
                    </button>

                    <span className={styles.number}>{currentLetter.number}</span>
                  </div>

                  <p className={styles.letterText}>{currentLetter.text}</p>

                  <div className={styles.paperBottom}>
                    <button
                      type="button"
                      className={`${styles.actionButton} ${
                        currentStatus === "hearted" ? styles.activeHeart : ""
                      }`}
                      onClick={() => updateStatus(currentLetter.id, "hearted")}
                      aria-label="Heart this note"
                    >
                      <HeartIcon active={currentStatus === "hearted"} />
                      <span>Heart</span>
                    </button>

                    <button
                      type="button"
                      className={`${styles.actionButton} ${
                        currentStatus === "archived" ? styles.activeArchive : ""
                      }`}
                      onClick={() => updateStatus(currentLetter.id, "archived")}
                      aria-label="Archive this note"
                    >
                      <EnvelopeIcon active={currentStatus === "archived"} />
                      <span>Archive</span>
                    </button>
                  </div>
                </>
              ) : (
                <div className={styles.placeholder}>
                  <p>
                    A sealed memory is waiting.
                    <br />
                    Press the wax seal to reveal a random letter.
                  </p>
                </div>
              )}
            </article>

            <button
              type="button"
              className={styles.waxSeal}
              onClick={openRandomLetter}
              disabled={unseenLetters.length === 0}
            >
              <span className={styles.waxText}>
                {unseenLetters.length === 0 ? "Done" : "Open"}
              </span>
            </button>

            {unseenLetters.length === 0 && (
              <p className={styles.completedText}>
                Every note has been opened. Revisit them in the Archive Gallery.
              </p>
            )}
          </section>
        )}

        {!loading && !error && letters.length > 0 && showArchive && (
          <section className={styles.archiveStage}>
            {archiveItems.length === 0 ? (
              <div className={styles.messageCard}>
                <p>The archive is empty until the first letter is opened.</p>
              </div>
            ) : (
              <div className={styles.archiveGrid}>
                {archiveItems.map((letter) => {
                  const letterStatus = actions[letter.id]?.status ?? "read";

                  return (
                    <article key={letter.id} className={styles.archiveCard}>
                      <div className={styles.archiveTop}>
                        <span className={styles.tag}>{letter.tag}</span>
                        <span className={styles.number}>{letter.number}</span>
                      </div>

                      <p className={styles.archiveText}>{letter.text}</p>

                      <div className={styles.archiveBottom}>
                        <span
                          className={`${styles.statusPill} ${statusClass(
                            letterStatus,
                          )}`}
                        >
                          {statusLabel[letterStatus]}
                        </span>

                        <button
                          type="button"
                          className={styles.cassetteButton}
                          onClick={() => toggleAudio(letter)}
                          aria-label={
                            activeAudioId === letter.id
                              ? "Stop audio"
                              : "Play audio"
                          }
                          disabled={!letter.audio}
                          title={
                            letter.audio
                              ? "Play audio"
                              : "No audio link for this note"
                          }
                        >
                          <CassetteIcon playing={activeAudioId === letter.id} />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
