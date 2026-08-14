'use client';

import { useState } from 'react';
import { useShow } from '@/app/show-context';
import { formatTime, Panel } from './ui';

/** Queue with drag-and-drop reordering, the way a YT Music queue behaves. */
export default function QueuePanel() {
  const { queue, currentIndex, playAt, removeFromQueue, moveInQueue, clearQueue, restoreThemeQueue, theme } = useShow();
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);

  /**
   * The source index travels in the drag payload as well as in state — state
   * alone is unreliable when dragstart and drop land in the same React batch.
   */
  const onDrop = (e, to) => {
    const carried = Number(e.dataTransfer.getData('text/plain'));
    const from = Number.isInteger(carried) && carried >= 0 ? carried : dragIndex;
    if (from != null && from !== to) moveInQueue(from, to);
    setDragIndex(null);
    setOverIndex(null);
  };

  return (
    <Panel
      className="h-full flex flex-col lg:min-h-0"
      title={`Queue · ${queue.length}`}
      right={
        <div className="flex gap-1">
          <button type="button" className="btn !py-2 !px-3 lg:!py-1 lg:!px-2 !text-[10px]" onClick={restoreThemeQueue}>
            Reload list
          </button>
          <button type="button" className="btn !py-2 !px-3 lg:!py-1 lg:!px-2 !text-[10px]" onClick={clearQueue}>
            Clear
          </button>
        </div>
      }
    >
      <ol className="flex-1 lg:min-h-0 lg:overflow-y-auto scroll-thin -mx-2 px-2 space-y-1">
        {queue.length === 0 ? (
          <li className="text-sm text-white/35 py-8 text-center">
            Queue is empty. Reload the category list or search for a track.
          </li>
        ) : null}

        {queue.map((track, i) => {
          const active = i === currentIndex;
          return (
            <li
              key={track.uid}
              draggable
              data-dragging={dragIndex === i}
              data-over={overIndex === i && dragIndex !== i}
              onDragStart={(e) => {
                setDragIndex(i);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', String(i));
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                setOverIndex(i);
              }}
              onDragLeave={() => setOverIndex((o) => (o === i ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                onDrop(e, i);
              }}
              onDragEnd={() => {
                setDragIndex(null);
                setOverIndex(null);
              }}
              className={`queue-item group flex items-center gap-2 rounded-xl px-2 py-2 border transition ${
                active ? 'bg-white/10 border-white/15' : 'border-transparent hover:bg-white/5'
              }`}
            >
              {/* Touch has no HTML5 drag, so small screens get move buttons instead. */}
              <span className="flex flex-col lg:hidden">
                <button
                  type="button"
                  aria-label={`Move ${track.title} up`}
                  disabled={i === 0}
                  className="px-2.5 min-h-[32px] leading-none text-white/45 disabled:opacity-20 active:text-white"
                  onClick={() => moveInQueue(i, i - 1)}
                >
                  ▲
                </button>
                <button
                  type="button"
                  aria-label={`Move ${track.title} down`}
                  disabled={i === queue.length - 1}
                  className="px-2.5 min-h-[32px] leading-none text-white/45 disabled:opacity-20 active:text-white"
                  onClick={() => moveInQueue(i, i + 1)}
                >
                  ▼
                </button>
              </span>

              <span
                className="hidden lg:block cursor-grab active:cursor-grabbing text-white/25 hover:text-white/60 px-1"
                title="Drag to reorder"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="9" cy="6" r="1.6" />
                  <circle cx="15" cy="6" r="1.6" />
                  <circle cx="9" cy="12" r="1.6" />
                  <circle cx="15" cy="12" r="1.6" />
                  <circle cx="9" cy="18" r="1.6" />
                  <circle cx="15" cy="18" r="1.6" />
                </svg>
              </span>

              <button type="button" className="flex items-center gap-3 flex-1 min-w-0 text-left" onClick={() => playAt(i)}>
                <span
                  className="w-8 h-8 rounded-md flex-none grid place-items-center text-[10px] overflow-hidden border border-white/10"
                  style={{ background: active ? theme.accent : 'rgba(255,255,255,0.06)', color: active ? '#08090f' : 'inherit' }}
                >
                  {track.artworkUrl && !active ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={track.artworkUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    i + 1
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] truncate">{track.title}</span>
                  <span className="block text-[11px] text-white/40 truncate">
                    {track.artist}
                    {track.source === 'synth' ? ' · house deck' : ''}
                  </span>
                </span>
              </button>

              <span className="text-[11px] text-white/30 tabular-nums">{track.duration ? formatTime(track.duration) : ''}</span>
              <button
                type="button"
                aria-label={`Remove ${track.title}`}
                className="lg:opacity-0 lg:group-hover:opacity-100 focus:opacity-100 text-white/40 hover:text-white px-3 py-2 min-w-[40px] lg:min-w-0 lg:px-1 transition"
                onClick={() => removeFromQueue(track.uid)}
              >
                ✕
              </button>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}
