"use client";

import Image from "next/image";
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

type ArchiveFilter = "All" | "Favorites" | string;
type SortOrder = "Newest First" | "Oldest First";

const STORAGE_KEY = "in-case-you-forget-actions-v1";

const toPreview = (text: string, maxLength = 190) => {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength).trimEnd()}...`;
};

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.searchIcon}>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

function TapeIcon({
  playing,
  small = false,
}: {
  playing: boolean;
  small?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 48 48"
      aria-hidden="true"
      className={`${styles.tapeIcon} ${small ? styles.tapeIconSmall : ""}`.trim()}
      data-playing={playing}
    >
      <rect x="6" y="12" width="36" height="24" rx="2" />
      <circle cx="16" cy="24" r="5" />
      <circle cx="32" cy="24" r="5" />
      <path d="M16 29h16" />
      <rect x="20" y="22" width="8" height="4" />
      <line x1="10" y1="16" x2="14" y2="16" />
      <line x1="10" y1="20" x2="12" y2="20" />
    </svg>
  );
}

function HeartIcon({
  active,
  small = false,
}: {
  active: boolean;
  small?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 40 40"
      aria-hidden="true"
      className={`${styles.heartIcon} ${small ? styles.heartIconSmall : ""}`.trim()}
      data-active={active}
    >
      <path d="M20 35C18 33 4 24 4 15C4 8 8 6 12 8C15 9 18 12 20 15C22 12 25 9 28 8C32 6 36 8 36 15C36 24 22 33 20 35Z" />
    </svg>
  );
}

function EnvelopeIcon({ small = false }: { small?: boolean }) {
  return (
    <svg
      viewBox="0 0 44 44"
      aria-hidden="true"
      className={`${styles.envelopeIcon} ${small ? styles.envelopeIconSmall : ""}`.trim()}
    >
      <path d="M6 12L22 24L38 12" />
      <rect x="6" y="12" width="32" height="22" rx="1" />
      <path d="M6 34L18 23" />
      <path d="M38 34L26 23" />
    </svg>
  );
}

export default function HomePage() {
  const [letters, setLetters] = useState<Letter[]>([]);
  const [actions, setActions] = useState<Record<string, LetterState>>({});
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [showArchive, setShowArchive] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeAudioId, setActiveAudioId] = useState<string | null>(null);
  const [isRevealing, setIsRevealing] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [filterTag, setFilterTag] = useState<ArchiveFilter>("All");
  const [sortOrder, setSortOrder] = useState<SortOrder>("Newest First");

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const revealTimerRef = useRef<number | null>(null);

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
            // Ignore storage errors in private browsing mode.
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

  const triggerRevealAnimation = useCallback(() => {
    setIsRevealing(true);

    if (revealTimerRef.current) {
      window.clearTimeout(revealTimerRef.current);
    }

    revealTimerRef.current = window.setTimeout(() => {
      setIsRevealing(false);
    }, 700);
  }, []);

  const openLetterById = useCallback(
    (letterId: string) => {
      stopAudio();
      setCurrentId(letterId);
      setShowArchive(false);
      triggerRevealAnimation();
    },
    [stopAudio, triggerRevealAnimation],
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
      nextPlayer.preload = "auto";

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
      if (revealTimerRef.current) {
        window.clearTimeout(revealTimerRef.current);
      }

      stopAudio();
    };
  }, [stopAudio]);

  const unreadLetters = useMemo(
    () => letters.filter((letter) => !actions[letter.id]),
    [actions, letters],
  );

  const archiveItems = useMemo(
    () => letters.filter((letter) => Boolean(actions[letter.id])),
    [actions, letters],
  );

  const availableTags = useMemo(() => {
    const tags = new Set<string>();

    archiveItems.forEach((letter) => {
      if (letter.tag.trim()) {
        tags.add(letter.tag.trim());
      }
    });

    return Array.from(tags).sort((first, second) => first.localeCompare(second));
  }, [archiveItems]);

  const filteredArchiveItems = useMemo(() => {
    let filtered = [...archiveItems];

    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (normalizedQuery) {
      filtered = filtered.filter((letter) =>
        letter.text.toLowerCase().includes(normalizedQuery),
      );
    }

    if (filterTag === "Favorites") {
      filtered = filtered.filter((letter) => actions[letter.id]?.status === "hearted");
    } else if (filterTag !== "All") {
      filtered = filtered.filter(
        (letter) => letter.tag.toLowerCase() === filterTag.toLowerCase(),
      );
    }

    filtered.sort((first, second) => {
      const firstUpdated = actions[first.id]?.updatedAt ?? 0;
      const secondUpdated = actions[second.id]?.updatedAt ?? 0;

      if (sortOrder === "Newest First") {
        return secondUpdated - firstUpdated;
      }

      return firstUpdated - secondUpdated;
    });

    return filtered;
  }, [actions, archiveItems, filterTag, searchQuery, sortOrder]);

  const currentLetter = useMemo(
    () => letters.find((letter) => letter.id === currentId) ?? null,
    [currentId, letters],
  );

  const currentStatus = currentLetter
    ? actions[currentLetter.id]?.status ?? "read"
    : "read";

  const openRandomUnread = useCallback(() => {
    if (unreadLetters.length === 0) {
      return;
    }

    const selected = unreadLetters[Math.floor(Math.random() * unreadLetters.length)];

    markRead(selected.id);
    openLetterById(selected.id);
  }, [markRead, openLetterById, unreadLetters]);

  if (loading) {
    return (
      <div className={styles.pageState}>
        <div className={styles.messagePanel}>Gathering your letters from the sheet...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.pageState}>
        <div className={styles.messagePanel}>
          <h2>Could not load the letters</h2>
          <p>{error}</p>
          <p>
            Confirm your Google Sheet is public and has columns named <strong>#</strong>,{" "}
            <strong>Tag</strong>, <strong>Text</strong>, and <strong>Audio</strong>.
          </p>
        </div>
      </div>
    );
  }

  if (letters.length === 0) {
    return (
      <div className={styles.pageState}>
        <div className={styles.messagePanel}>No entries were found in the sheet yet.</div>
      </div>
    );
  }

  if (showArchive) {
    return (
      <div className={styles.archivePage}>
        <button
          type="button"
          className={styles.topBackLink}
          onClick={() => {
            stopAudio();
            setShowArchive(false);
            setCurrentId(null);
          }}
        >
          Back
        </button>

        <div className={styles.archiveParchment}>
          <h1 className={styles.archiveHeading}>Archive Gallery</h1>

          <div className={styles.archiveControls}>
            <label className={styles.searchWrap}>
              <input
                type="text"
                placeholder="Type..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className={styles.searchInput}
              />
              <SearchIcon />
            </label>

            <label className={styles.selectWrap}>
              <span>Filter by Tag:</span>
              <select
                value={filterTag}
                onChange={(event) => setFilterTag(event.target.value)}
                className={styles.selectInput}
              >
                <option value="All">All</option>
                <option value="Favorites">Favorites</option>
                {availableTags.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.selectWrap}>
              <span>Sort:</span>
              <select
                value={sortOrder}
                onChange={(event) => setSortOrder(event.target.value as SortOrder)}
                className={styles.selectInput}
              >
                <option value="Newest First">Newest First</option>
                <option value="Oldest First">Oldest First</option>
              </select>
            </label>
          </div>

          {filteredArchiveItems.length === 0 ? (
            <div className={styles.emptyArchive}>No matching letters in the archive.</div>
          ) : (
            <div className={styles.cardsGrid}>
              {filteredArchiveItems.map((letter) => {
                const isFavorite = actions[letter.id]?.status === "hearted";
                const isPlaying = activeAudioId === letter.id;

                return (
                  <article key={letter.id} className={styles.noteCard}>
                    <span className={styles.noteTagPill}>{letter.tag}</span>
                    <span className={styles.noteNumberMark}>{letter.number}</span>

                    <p className={styles.notePreview}>{toPreview(letter.text)}</p>

                    <div className={styles.noteFooter}>
                      <button
                        type="button"
                        className={styles.readButton}
                        onClick={() => openLetterById(letter.id)}
                      >
                        Read
                      </button>

                      <div className={styles.noteActionGroup}>
                        <HeartIcon active={isFavorite} small />
                        <button
                          type="button"
                          className={styles.tapeCardButton}
                          onClick={() => toggleAudio(letter)}
                          disabled={!letter.audio}
                          aria-label={isPlaying ? "Stop audio" : "Play audio"}
                        >
                          <TapeIcon playing={isPlaying} small />
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          <div className={styles.archiveBottomRow}>
            <button
              type="button"
              className={styles.returnButton}
              onClick={() => {
                stopAudio();
                setShowArchive(false);
                setCurrentId(null);
              }}
            >
              <span aria-hidden="true">↺</span>
              Return to Open New Notes
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (currentLetter) {
    return (
      <div className={styles.letterPage}>
        <button
          type="button"
          className={styles.topArchiveButton}
          onClick={() => {
            stopAudio();
            setShowArchive(true);
            setCurrentId(null);
          }}
          aria-label="Open archive"
        >
          <Image
            src="/assets/archive-letter.png"
            alt=""
            aria-hidden="true"
            width={1000}
            height={1000}
            className={styles.topArchiveIcon}
          />
        </button>

        <div className={`${styles.letterParchment} ${isRevealing ? styles.letterReveal : ""}`}>
          <button
            type="button"
            className={styles.backLink}
            onClick={() => {
              stopAudio();
              setShowArchive(true);
              setCurrentId(null);
            }}
          >
            ← Back to Archive
          </button>

          <div className={styles.tagWithString}>
            <span className={styles.tagString} aria-hidden="true" />
            <span className={styles.tagCard}>{currentLetter.tag}</span>
          </div>

          <div className={styles.letterNumber}>{currentLetter.number}</div>

          <div className={styles.letterBodyWrap}>
            <p className={styles.letterBody}>{currentLetter.text}</p>
          </div>

          <div className={styles.letterBottomIcons}>
            <button
              type="button"
              className={styles.iconButton}
              onClick={() => toggleAudio(currentLetter)}
              disabled={!currentLetter.audio}
              aria-label={activeAudioId === currentLetter.id ? "Stop audio" : "Play audio"}
            >
              <TapeIcon playing={activeAudioId === currentLetter.id} />
            </button>

            <button
              type="button"
              className={styles.iconButton}
              onClick={() => updateStatus(currentLetter.id, "hearted")}
              aria-label="Mark as favorite"
            >
              <HeartIcon active={currentStatus === "hearted"} />
            </button>

            <button
              type="button"
              className={styles.iconButton}
              onClick={() => {
                updateStatus(currentLetter.id, "archived");
                stopAudio();
                setShowArchive(true);
                setCurrentId(null);
              }}
              aria-label="Archive this note"
            >
              <EnvelopeIcon />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.homePage}>
      <div className={styles.homeParchment}>
        <button
          type="button"
          className={styles.topArchiveButton}
          onClick={() => {
            stopAudio();
            setShowArchive(true);
            setCurrentId(null);
          }}
          aria-label="Open archive"
        >
          <Image
            src="/assets/archive-letter.png"
            alt=""
            aria-hidden="true"
            width={1000}
            height={1000}
            className={styles.topArchiveIcon}
          />
        </button>

        <div className={styles.homeCenter}>
          <div className={styles.sealPlate}>
            <button
              type="button"
              className={styles.waxSealButton}
              onClick={openRandomUnread}
              disabled={unreadLetters.length === 0}
              aria-label={
                unreadLetters.length === 0 ? "No unread letters left" : "Open unread letter"
              }
            >
              <Image
                src="/assets/heart-wax.png"
                alt=""
                aria-hidden="true"
                width={1000}
                height={1000}
                className={styles.homeWaxHeart}
              />
            </button>
          </div>

          <h1 className={styles.homeHeading}>In Case You Forget</h1>
        </div>
      </div>
    </div>
  );
}
