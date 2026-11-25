const PATHS = {
  play: 'M7 4.5v15l12-7.5z',
  pause: 'M7 4.5h3.5v15H7zM13.5 4.5H17v15h-3.5z',
  stop: 'M6 6h12v12H6z',
  rescue:
    'M12 2.5a9.5 9.5 0 1 0 0 19 9.5 9.5 0 0 0 0-19zm0 5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zM5.6 5.6l3.2 3.2M15.2 15.2l3.2 3.2M18.4 5.6l-3.2 3.2M8.8 15.2l-3.2 3.2',
  settings:
    'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM19.4 13a7.6 7.6 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.4 7.4 0 0 0-1.7-1L15 3.5h-4l-.4 2.5a7.4 7.4 0 0 0-1.7 1l-2.4-1-2 3.4L6.6 11a7.6 7.6 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.4 7.4 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7.4 7.4 0 0 0 1.7-1l2.4 1 2-3.4z',
  lock: 'M7 10.5V8a5 5 0 0 1 10 0v2.5M5.5 10.5h13v10h-13z',
  back: 'M15 5l-7 7 7 7',
  plus: 'M12 5v14M5 12h14',
  upload: 'M12 15V4M7.5 8.5L12 4l4.5 4.5M5 15v4.5h14V15',
  trash: 'M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13',
  edit: 'M4.5 19.5l1-4.5L16 4.5l3.5 3.5L9 18.5zM14 6.5l3.5 3.5',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z',
  close: 'M6 6l12 12M18 6L6 18',
  undo: 'M9 14L4.5 9.5 9 5M4.5 9.5H14a5.5 5.5 0 0 1 0 11h-2',
  slides: 'M3.5 5h17v11h-17zM12 16v3.5M8 19.5h8M7 9h6M7 12h9'
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name, title }: { name: IconName; title?: string }) {
  const filled = name === 'play' || name === 'pause' || name === 'stop' || name === 'sparkle'
  return (
    <svg
      className="icon-svg"
      viewBox="0 0 24 24"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {title && <title>{title}</title>}
      <path d={PATHS[name]} />
    </svg>
  )
}

/** Section state glyphs for the navigator: ✓ done · ◉ active · ◐ partial · ○ open. */
export function StateIcon({ state }: { state: 'done' | 'active' | 'partial' | 'open' }) {
  return (
    <svg className={`state-icon ${state}`} viewBox="0 0 16 16" aria-hidden="true">
      {state === 'done' && (
        <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      )}
      {state === 'active' && (
        <>
          <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="8" cy="8" r="3" fill="currentColor" />
        </>
      )}
      {state === 'partial' && (
        <>
          <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M8 2a6 6 0 0 1 0 12z" fill="currentColor" />
        </>
      )}
      {state === 'open' && <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.6" />}
    </svg>
  )
}
