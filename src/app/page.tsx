"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ScratchCard from "@/components/ScratchCard";
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
const SCRATCH_REVEAL_IMAGE = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 380">
    <defs>
      <linearGradient id="paper" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#f5e6cc"/>
        <stop offset="55%" stop-color="#e0bf92"/>
        <stop offset="100%" stop-color="#c49669"/>
      </linearGradient>
      <radialGradient id="wax" cx="35%" cy="28%" r="70%">
        <stop offset="0%" stop-color="#de7e7a"/>
        <stop offset="62%" stop-color="#982438"/>
        <stop offset="100%" stop-color="#711829"/>
      </radialGradient>
    </defs>
    <rect width="600" height="380" fill="url(#paper)"/>
    <g opacity="0.2" fill="#8a653f">
      <circle cx="48" cy="56" r="2.2"/><circle cx="98" cy="196" r="1.8"/><circle cx="181" cy="74" r="2.1"/>
      <circle cx="292" cy="143" r="1.6"/><circle cx="354" cy="62" r="2.3"/><circle cx="417" cy="184" r="1.9"/>
      <circle cx="521" cy="102" r="2.1"/><circle cx="563" cy="246" r="1.8"/><circle cx="87" cy="304" r="2"/>
      <circle cx="228" cy="286" r="2.3"/><circle cx="398" cy="312" r="1.7"/><circle cx="531" cy="318" r="2"/>
    </g>
    <circle cx="300" cy="170" r="72" fill="url(#wax)"/>
    <circle cx="300" cy="170" r="58" fill="none" stroke="#f2b5b4" stroke-opacity="0.35" stroke-width="2"/>
    <text x="300" y="180" text-anchor="middle" fill="#f8d0ca" font-family="serif" font-size="26" font-style="italic">open me</text>
    <text x="300" y="295" text-anchor="middle" fill="#6f1f2b" font-family="serif" font-size="34" font-style="italic">A letter waits below</text>
  </svg>`,
)}`;

const statusLabel: Record<LetterStatus, string> = {
  read: "Read",
  hearted: "Loved",
  archived: "Archived",
};

function CassetteIcon({ playing }: { playing: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 64 64"
      className={styles.iconCassette}
      data-playing={playing}
    >
      <rect x="8" y="14" width="48" height="36" rx="5" ry="5" />
      <circle cx="23" cy="32" r="7" />
      <circle cx="41" cy="32" r="7" />
      <path d="M16 22h32" />
      <path d="M16 44h32" />
      <path d="M28 32h8" />
    </svg>
  );
}

function HeartIcon({ active }: { active: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 64 64"
      className={styles.iconSketch}
      data-active={active}
    >
      <path d="M32 53C27 47 10 37 10 22c0-6 5-11 11-11 5 0 9 3 11 7 2-4 6-7 11-7 6 0 11 5 11 11 0 15-17 25-22 31z" />
      <path d="M20 18c2-2 4-3 6-3" />
    </svg>
  );
}

function EnvelopeIcon({ active }: { active: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 64 64"
      className={styles.iconSketch}
      data-active={active}
    >
      <rect x="10" y="17" width="44" height="30" rx="4" ry="4" />
      <path d="M10 21l22 17 22-17" />
      <path d="M10 47l16-14" />
      <path d="M54 47L38 33" />
    </svg>
  );
}

const statusClass = (status: LetterStatus) => {
  if (status === "hearted") {
    return styles.statusLoved;
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
  const [isUnfurling, setIsUnfurling] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [activeAudioId, setActiveAudioId] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const unfurlTimerRef = useRef<number | null>(null);

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
      if (unfurlTimerRef.current) {
        window.clearTimeout(unfurlTimerRef.current);
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
    setIsUnfurling(true);

    if (unfurlTimerRef.current) {
      window.clearTimeout(unfurlTimerRef.current);
    }

    unfurlTimerRef.current = window.setTimeout(() => {
      setIsUnfurling(false);
    }, 900);
  }, [markRead, stopAudio, unseenLetters]);

  const onTopAction = () => {
    stopAudio();

    if (showArchive) {
      setShowArchive(false);
      return;
    }

    setCurrentId(null);
    setShowArchive(true);
  };

  return (
    <div className={styles.page}>
      <div className={styles.grain} aria-hidden="true" />

      <header className={styles.header}>
        <h1 className={styles.headerTitle}>In Case You Forget</h1>

        {!loading && !error && letters.length > 0 && (
          <button type="button" className={styles.headerLink} onClick={onTopAction}>
            {showArchive ? "Back to Desk" : "Archive"}
          </button>
        )}
      </header>

      <main className={styles.main}>
        {loading && (
          <section className={styles.messageCard}>
            <p>Gathering your letters from the sheet...</p>
          </section>
        )}

        {!loading && error && (
          <section className={styles.messageCard}>
            <h2>Could not load the letters</h2>
            <p>{error}</p>
            <p>
              Ensure the Google Sheet is shared for anyone with the link and has
              columns named <strong>#</strong>, <strong>Tag</strong>,
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
          <section className={styles.scratchScene}>
            {unseenLetters.length > 0 ? (
              <>
                <div className={styles.scratchFrame}>
                  <div className={styles.scratchGlow} aria-hidden="true" />
                  <ScratchCard
                    className={styles.scratchCard}
                    scratchMode="scratch"
                    useImage
                    bottomImage={{ src: SCRATCH_REVEAL_IMAGE, alt: "Hidden letter preview" }}
                    topLayerColor="#d8bc94"
                    textColor="#6e1f2b"
                    topText="Scratch To Unseal"
                    brushSize={38}
                    borderRadius={18}
                    revealThreshold={0.43}
                    onRevealComplete={openRandomLetter}
                  />
                </div>

                <h2 className={styles.scratchTitle}>Uncover your next love letter</h2>
                <p className={styles.scratchNote}>{unseenLetters.length} unread letters</p>
              </>
            ) : (
              <div className={styles.emptyDesk}>
                <h2 className={styles.scratchTitle}>No sealed letters left</h2>
                <p className={styles.scratchNote}>
                  Every letter has been opened. Visit the archive to revisit them.
                </p>
              </div>
            )}
          </section>
        )}

        {!loading && !error && letters.length > 0 && !showArchive && currentLetter && (
          <section
            className={`${styles.letterScene} ${isUnfurling ? styles.unfurling : ""}`}
          >
            <article className={styles.parchment}>
              <div className={styles.burnEdgeTop} aria-hidden="true" />

              <div className={styles.letterMeta}>
                <span className={styles.letterTag}>{currentLetter.tag}</span>

                <button
                  type="button"
                  className={styles.cassetteButton}
                  onClick={() => toggleAudio(currentLetter)}
                  aria-label={
                    activeAudioId === currentLetter.id ? "Stop audio" : "Play audio"
                  }
                  disabled={!currentLetter.audio}
                >
                  <CassetteIcon playing={activeAudioId === currentLetter.id} />
                </button>

                <span className={styles.letterNumber}>{currentLetter.number}</span>
              </div>

              <p className={styles.letterText}>{currentLetter.text}</p>

              <div className={styles.letterActions}>
                <button
                  type="button"
                  className={`${styles.actionButton} ${
                    currentStatus === "hearted" ? styles.actionActive : ""
                  }`}
                  onClick={() => {
                    updateStatus(currentLetter.id, "hearted");
                    closeLetter();
                  }}
                  aria-label="Mark as loved"
                >
                  <HeartIcon active={currentStatus === "hearted"} />
                </button>

                <button
                  type="button"
                  className={`${styles.actionButton} ${
                    currentStatus === "archived" ? styles.actionActive : ""
                  }`}
                  onClick={() => {
                    updateStatus(currentLetter.id, "archived");
                    closeLetter();
                  }}
                  aria-label="Archive letter"
                >
                  <EnvelopeIcon active={currentStatus === "archived"} />
                </button>
              </div>

              <div className={styles.burnEdgeBottom} aria-hidden="true" />
            </article>

            <button
              type="button"
              className={styles.nextLetter}
              onClick={openRandomLetter}
              disabled={unseenLetters.length === 0}
            >
              {unseenLetters.length === 0 ? "No sealed letters left" : "Unseal another"}
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
                    <article key={letter.id} className={styles.archivePaper}>
                      <div className={styles.archivePaperMeta}>
                        <span className={styles.archiveTag}>{letter.tag}</span>
                        <span className={styles.archiveNumber}>{letter.number}</span>
                      </div>

                      <p className={styles.archiveText}>{letter.text}</p>

                      <div className={styles.archiveFooter}>
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
