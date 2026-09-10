import React from 'react'

/**
 * Zerno mark: a grain cut along a 42° diagonal into three shares.
 * The cuts are clip strips rather than holes, so the outline stays intact.
 * Geometry is generated — see `docs/fork-changes.md`.
 */
const SEED =
  'M16 2.6 C21.0 8.4 24.6 13.4 24.6 18.8 C24.6 24.6 20.9 29.8 16 29.8 C11.1 29.8 7.4 24.6 7.4 18.8 C7.4 13.4 11.0 8.4 16 2.6 Z'

const SHARES = [
  {
    id: 'zerno-share-bottom',
    fill: '#D2683F',
    clip: 'M-14.79 49.33 L50.61 -9.55 L72.85 15.15 L7.45 74.03 Z',
  },
  {
    id: 'zerno-share-middle',
    fill: '#E5A33C',
    clip: 'M-18.77 44.91 L46.63 -13.97 L49.60 -10.67 L-15.79 48.22 Z',
  },
  {
    id: 'zerno-share-top',
    fill: '#7F8C3E',
    clip: 'M-72.85 -15.15 L-7.45 -74.03 L45.63 -15.08 L-19.77 43.80 Z',
  },
]

/**
 * The mark is authored on a 32-unit grid. It is placed by its CENTROID, not by
 * its bounding box: the grain is pointed at the top and heavy at the bottom, so
 * box-centring makes it sit visibly low next to the word.
 */
const MARK_HEIGHT = 86
const MARK_SCALE = MARK_HEIGHT / 27.2
const MARK_DX = -7.4 * MARK_SCALE
const MARK_DY = -2.6 * MARK_SCALE

const styles = {
  mark: (visible: boolean) =>
    visible
      ? {
          opacity: 1,
          transform: 'none',
          transformOrigin: '27px 43px',
          transition: '1.1s cubic-bezier(0.2, 0.8, 0.2, 1)',
        }
      : {
          opacity: 0,
          transform: 'scale(0.82)',
          transformOrigin: '27px 43px',
          transition: '.5s cubic-bezier(0.6, 0, 0.8, 1)',
        },
  word: (visible: boolean) =>
    visible
      ? {
          opacity: 1,
          transition: '1.2s cubic-bezier(0.2, 0.8, 0.2, 1)',
          transitionDelay: '.35s',
        }
      : { opacity: 0, transition: '.4s ease-in' },
}

export function Logo({ fill = '#000', visible = true, ...rest }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 321 86"
      {...rest}
    >
      <defs>
        {SHARES.map(share => (
          <clipPath key={share.id} id={share.id}>
            <path d={share.clip} />
          </clipPath>
        ))}
      </defs>

      <g style={styles.mark(visible)}>
        <g transform={`translate(${MARK_DX} ${MARK_DY}) scale(${MARK_SCALE})`}>
          {SHARES.map(share => (
            <path
              key={share.id}
              d={SEED}
              fill={share.fill}
              clipPath={`url(#${share.id})`}
            />
          ))}
        </g>
      </g>

      <text
        x="74"
        y="80.6"
        fill={fill}
        fontFamily="'IBM Plex Sans', system-ui, sans-serif"
        fontSize="94"
        fontWeight="600"
        letterSpacing="-2"
        style={styles.word(visible)}
      >
        Zerno
      </text>
    </svg>
  )
}
