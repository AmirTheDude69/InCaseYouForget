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
const PAPER_TEXTURE_URL =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuC7_MiOtnax-mz3VLI7n8gKIZP9qUXFfWO0c1npBMZD6ly-xckyMBr3tYLKd355wUPMfUAMPpbRn9oya4hVKZ-DyKK74i7YAnFMgdOjxIDRaLsy3J0pFE7GKRbxYI3VrrbNHR0wpUYx2oLy5m2FVB7kCzGzNWWA7M2GOznR9L-Xp8O5feJGU5AWnWEKABcdmxto38-Xxx81v3T4CT6mKqAx70vt4raF1V1sv2ABYcHVWPnbGVcvTTgrquhdo3jKpr7h1ze9ea_TCiYQ";
const SEAL_URL =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuAaoc4Tj7JOz04FRzb8gocT9CAz03tB1ZeP5QTJVTmjbCv1z91kopaXLbGP_HolGmjBEc9V5I1hX_390yPMYx2tqqPYUVe8Yj8-AfajFJ0w7h4RshqVfQiYmYFMLEDRYby_x8YIfEyfpe40TdEPeg8gwGwBtmCJl9_TVUo5Gvls4-Pr4LAcAnJ0ORsi81cIHDdoMqkWLd0EuQADxWGnXbnsopMjIomYIAhtgUrXwW47rhgxszS_9KIgiZu0-1jlJp6-YZgkJDu6X91a";
const CASSETTE_URL =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuArDdwO2TwDBSq_ZeJuvv1WkQwflMB4vZZP5fjnXaPBt0oLZ8mG31zHtHFrGlpBWciCyXqW-yJHd9S-0CCCuKq0wA48hZiNxko-oCd8hhaQBpsTlJOyBwEreqFwwrkOWcrumfMvRgL_dq8YrxR8DpFN1oBIKIqJFkxbs247uBNEephEls94ZXFR4ExszboybPzXhMv3zhplNCwMjCrz-wFNzOTzSchOQLrZ3HbaseCx41i-cF5m67CqpIG4awA4ExW-aRyXRHFQ2rRc";
const HEART_URL =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuCv16Lcxaf1bYusyc_ptpKOFKQKiaaMpRMk2TJv0aGtmQghfyvhzmrseTKj12fJTZNOaJzTsdSOqVsZB3tUgBhtMgAIPFN6L4NWfYMpGZ2-r62AlT6-CYXT_tpRhZZR8u_TXMI2DAw1pNfiUYgdjBYOKL5dslWkbQQ7dQ-ktug51Bbrj02_jr7Y-eFef-g-pJYpBM5h_bjr2MY_6VnsOj0yf17DtjcXYogi-d75InLnZnVPO_ZVIfjswZ4AQQC9rnjwLgFs5RBr1q7z";
const ENVELOPE_URL =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuApN3_q4Zweo1PbpL92-ubFqxKOLp5oRYH_xCpqpA4SSGYg8vwSWjicWqE7Z7iEvvJvovEF4hokjXZT6hW0oJjTQmoprH5vyktlLneCUdqt23wgc13-ygvdHsxL_NTQ4jUHcTiZgRnt6J3jrn5ULDeRd_zXSrotgb_COcceReNNdC3goG21qgIKkpxh_Tdw9sh2_lGEFEWuUig7YxQz1K-qN2LU2gQpOODPQHFkZgwjihJ7HIq5ck6bCo5JWt6LUyI9X75HiJ6gsG6H";

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
      className={styles.cassetteSvg}
      data-active={active}
    >
      <rect x="3.5" y="6" width="17" height="12" rx="1.5" ry="1.5" />
      <circle cx="8.5" cy="12" r="2" />
      <circle cx="15.5" cy="12" r="2" />
      <path d="M6.2 8.6h11.6" />
      <path d="M7 15.8h10" />
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

  const closeLetter = useCallback(() => {
    stopAudio();
    setCurrentId(null);
  }, [stopAudio]);

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
    }, 750);
  }, [markRead, stopAudio, unseenLetters]);

  const onTopLinkClick = () => {
    stopAudio();

    if (showArchive) {
      setShowArchive(false);
      return;
    }

    setCurrentId(null);
    setShowArchive(true);
  };

  const modeClass = showArchive
    ? styles.archiveMode
    : currentLetter
      ? styles.openedMode
      : styles.coverMode;

  return (
    <div className={`${styles.page} ${modeClass}`}>
      <div className={styles.browserBar} aria-hidden="true">
        <span className={`${styles.dot} ${styles.dotRed}`} />
        <span className={`${styles.dot} ${styles.dotAmber}`} />
        <span className={`${styles.dot} ${styles.dotGreen}`} />
      </div>

      {!loading && !error && letters.length > 0 && (
        <button type="button" className={styles.topLink} onClick={onTopLinkClick}>
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
        <section className={styles.coverScreen}>
          <div className={styles.coverPaperWrap}>
            <div
              className={styles.coverPaper}
              style={{
                backgroundImage: `url(${PAPER_TEXTURE_URL})`,
              }}
            >
              <button
                type="button"
                className={styles.sealButton}
                onClick={openRandomLetter}
                disabled={unseenLetters.length === 0}
                aria-label={
                  unseenLetters.length === 0
                    ? "No unopened letters"
                    : "Open a random letter"
                }
              >
                <img src={SEAL_URL} alt="Wax seal" className={styles.sealImage} />
              </button>

              <h1 className={styles.coverTitle}>
                In Case You
                <br />
                Forget
              </h1>
            </div>
          </div>

          {unseenLetters.length === 0 && (
            <p className={styles.coverNote}>
              Every letter has been opened. Use Archive to revisit them.
            </p>
          )}
        </section>
      )}

      {!loading && !error && letters.length > 0 && !showArchive && currentLetter && (
        <section
          className={`${styles.openedScreen} ${
            isUncrumpling ? styles.openedUncrumple : ""
          }`}
        >
          <article className={styles.openedContainer}>
            <img
              src={PAPER_TEXTURE_URL}
              alt="Parchment background"
              className={styles.openedTexture}
            />

            <div className={styles.openedTagBadge}>
              <span>{currentLetter.tag}</span>
            </div>

            <div className={styles.openedNumber}>{currentLetter.number}</div>

            <button
              type="button"
              className={styles.openedCassette}
              onClick={() => toggleAudio(currentLetter)}
              disabled={!currentLetter.audio}
              aria-label={
                activeAudioId === currentLetter.id ? "Stop audio" : "Play audio"
              }
            >
              <img src={CASSETTE_URL} alt="Cassette" />
            </button>

            <div className={styles.openedContent}>
              <p>{currentLetter.text}</p>

              <div className={styles.openedFooterIcons}>
                <button
                  type="button"
                  className={styles.iconImageButton}
                  onClick={() => {
                    updateStatus(currentLetter.id, "hearted");
                    closeLetter();
                  }}
                  aria-label="Heart this note"
                >
                  <img src={HEART_URL} alt="Heart" />
                </button>

                <button
                  type="button"
                  className={styles.iconImageButton}
                  onClick={() => {
                    updateStatus(currentLetter.id, "archived");
                    closeLetter();
                  }}
                  aria-label="Archive this note"
                >
                  <img src={ENVELOPE_URL} alt="Envelope" />
                </button>
              </div>
            </div>
          </article>
        </section>
      )}

      {!loading && !error && letters.length > 0 && showArchive && (
        <section className={styles.archiveScreen}>
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
                    <div className={styles.archiveCardHead}>
                      <span className={styles.archiveTag}>{letter.tag}</span>
                      <span className={styles.archiveNumber}>{letter.number}</span>
                    </div>

                    <p className={styles.archiveText}>{letter.text}</p>

                    <div className={styles.archiveCardFoot}>
                      <span className={`${styles.statusPill} ${statusClass(letterStatus)}`}>
                        {statusLabel[letterStatus]}
                      </span>

                      <button
                        type="button"
                        className={styles.archiveAudio}
                        onClick={() => toggleAudio(letter)}
                        disabled={!letter.audio}
                        aria-label={
                          activeAudioId === letter.id ? "Stop audio" : "Play audio"
                        }
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
