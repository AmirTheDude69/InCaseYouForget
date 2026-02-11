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

function CassetteIcon({ active }: { active: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={styles.cassetteIcon}
      data-active={active}
    >
      <rect x="3.5" y="6" width="17" height="12" rx="1.6" ry="1.6" />
      <circle cx="8.5" cy="12" r="2.1" />
      <circle cx="15.5" cy="12" r="2.1" />
      <path d="M6.2 8.6h11.6" />
      <path d="M7 15.9h10" />
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
  const [showArchive, setShowArchive] = useState(false);
  const [activeAudioId, setActiveAudioId] = useState<string | null>(null);
  const [isUncrumpling, setIsUncrumpling] = useState(false);

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
    }, 700);
  }, [markRead, stopAudio, unseenLetters]);

  const closeLetter = useCallback(() => {
    stopAudio();
    setCurrentId(null);
  }, [stopAudio]);

  const modeClass = showArchive
    ? styles.archiveMode
    : currentLetter
      ? styles.letterMode
      : styles.coverMode;

  return (
    <div className={`${styles.page} ${modeClass}`}>
      <div className={styles.chromeBar} aria-hidden="true">
        <span className={`${styles.dot} ${styles.dotRed}`} />
        <span className={`${styles.dot} ${styles.dotAmber}`} />
        <span className={`${styles.dot} ${styles.dotGreen}`} />
      </div>

      {!loading && !error && letters.length > 0 && (
        <button
          type="button"
          className={styles.topLink}
          onClick={() => {
            setShowArchive((previous) => !previous);
            stopAudio();
          }}
        >
          {showArchive ? "Back" : "Archive"}
        </button>
      )}

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

      {!loading && !error && letters.length > 0 && !showArchive && !currentLetter && (
        <section className={styles.coverScene}>
          <div className={styles.coverSheet}>
            <div className={styles.coverPaper}>
              <button
                type="button"
                className={styles.sealTile}
                onClick={openRandomLetter}
                disabled={unseenLetters.length === 0}
                aria-label={
                  unseenLetters.length === 0
                    ? "No unopened letters"
                    : "Open a random letter"
                }
              >
                <span className={styles.sealMark} />
              </button>

              <h1 className={styles.coverTitle}>
                In Case You
                <br />
                Forget
              </h1>
            </div>
          </div>

          <p className={styles.coverNote}>
            {unseenLetters.length === 0
              ? "Every letter has been opened. Use Archive to revisit them."
              : `${unseenLetters.length} sealed letters waiting.`}
          </p>
        </section>
      )}

      {!loading && !error && letters.length > 0 && !showArchive && currentLetter && (
        <section
          className={`${styles.letterScene} ${isUncrumpling ? styles.uncrumple : ""}`}
        >
          <div className={styles.letterBoard}>
            <div className={styles.letterTop}>
              <span className={styles.letterTag}>{currentLetter.tag}</span>
              <span className={styles.letterNumber}>{currentLetter.number}</span>
            </div>

            <button
              type="button"
              className={styles.floatCassette}
              onClick={() => toggleAudio(currentLetter)}
              aria-label={
                activeAudioId === currentLetter.id ? "Stop audio" : "Play audio"
              }
              disabled={!currentLetter.audio}
            >
              <CassetteIcon active={activeAudioId === currentLetter.id} />
            </button>

            <p className={styles.letterText}>{currentLetter.text}</p>

            <div className={styles.letterActions}>
              <button
                type="button"
                className={`${styles.iconAction} ${
                  currentStatus === "hearted" ? styles.iconActionActive : ""
                }`}
                onClick={() => {
                  updateStatus(currentLetter.id, "hearted");
                  closeLetter();
                }}
                aria-label="Heart this note"
              >
                <HeartIcon active={currentStatus === "hearted"} />
              </button>

              <button
                type="button"
                className={`${styles.iconAction} ${
                  currentStatus === "archived" ? styles.iconActionActive : ""
                }`}
                onClick={() => {
                  updateStatus(currentLetter.id, "archived");
                  closeLetter();
                }}
                aria-label="Archive this note"
              >
                <EnvelopeIcon active={currentStatus === "archived"} />
              </button>
            </div>
          </div>

          <button
            type="button"
            className={styles.nextSeal}
            onClick={openRandomLetter}
            disabled={unseenLetters.length === 0}
          >
            {unseenLetters.length === 0 ? "No unopened letters left" : "Open next"}
          </button>
        </section>
      )}

      {!loading && !error && letters.length > 0 && showArchive && (
        <section className={styles.archiveScene}>
          <h2 className={styles.archiveTitle}>Archive Gallery</h2>

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
                    <div className={styles.archiveHead}>
                      <span className={styles.archiveTag}>{letter.tag}</span>
                      <span className={styles.archiveNumber}>{letter.number}</span>
                    </div>

                    <p className={styles.archiveText}>{letter.text}</p>

                    <div className={styles.archiveFoot}>
                      <span className={`${styles.statusPill} ${statusClass(letterStatus)}`}>
                        {statusLabel[letterStatus]}
                      </span>

                      <button
                        type="button"
                        className={styles.archiveAudio}
                        onClick={() => toggleAudio(letter)}
                        aria-label={
                          activeAudioId === letter.id ? "Stop audio" : "Play audio"
                        }
                        disabled={!letter.audio}
                      >
                        <CassetteIcon active={activeAudioId === letter.id} />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
