import type { FortuneCharacter } from '../../../src/fortune/guidance-settings';
import { FortuneCharacterBadge } from './fortune-character';
import './fortune-moon-gate.css';

export function FortuneMoonGate({
  phase,
  character,
  finish,
}: {
  phase: 'gate' | 'entrance';
  character?: FortuneCharacter;
  finish: () => void;
}) {
  return (
    <div
      className="fortune-moon-stage"
      data-scene={phase}
      onAnimationEnd={(event) => {
        if (
          event.target === event.currentTarget &&
          event.animationName === `fortune-moon-${phase}`
        ) {
          finish();
        }
      }}
    >
      <div aria-hidden="true" className="fortune-moon-stage__halo" />
      <svg
        className="fortune-moon-stage__geometry"
        viewBox="0 0 300 220"
        fill="none"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="150" cy="106" r="64" className="fortune-moon-stage__orb" />
        <circle cx="150" cy="106" r="83" className="fortune-moon-stage__ring" />
        <circle
          cx="150"
          cy="106"
          r="92"
          className="fortune-moon-stage__ring fortune-moon-stage__ring--dotted"
        />
        <path d="M150 14 230 150H70Zm0 184L70 62h160Z" className="fortune-moon-stage__sigil" />
        <g className="fortune-moon-stage__orbit">
          <path d="M150 9l3 6 6 3-6 3-3 6-3-6-6-3 6-3ZM150 185l3 6 6 3-6 3-3 6-3-6-6-3 6-3Z" />
          <circle cx="62" cy="106" r="2" />
          <circle cx="238" cy="106" r="2" />
        </g>
        <g className="fortune-moon-stage__doors">
          <path d="M150 29A77 77 0 0 0 150 183Z" className="fortune-moon-stage__door--left" />
          <path d="M150 29A77 77 0 0 1 150 183Z" className="fortune-moon-stage__door--right" />
        </g>
      </svg>
      <div className="fortune-moon-stage__portrait" aria-hidden={phase === 'gate' || undefined}>
        {character?.enabled ? (
          <FortuneCharacterBadge character={character} expression="result" stage />
        ) : (
          <p className="fortune-moon-stage__fallback">月の案内役</p>
        )}
      </div>
    </div>
  );
}
