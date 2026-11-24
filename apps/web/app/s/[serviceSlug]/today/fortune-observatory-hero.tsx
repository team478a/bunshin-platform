import { ORACLE_SERVICE_NAME } from '../../../../src/services/service-auth-brand';
import { fortuneObservatoryArt } from '../fortune-observatory-art';
import './fortune-today.css';

export function FortuneObservatoryHero() {
  return (
    <header className="fortune-observatory">
      <img
        className="fortune-observatory__art"
        src={`${fortuneObservatoryArt}/hero-640.webp`}
        srcSet={`${fortuneObservatoryArt}/hero-640.webp 640w, ${fortuneObservatoryArt}/hero-1280.webp 1280w`}
        sizes="(max-width: 720px) 100vw, 720px"
        alt=""
        width={640}
        height={457}
        fetchPriority="high"
        decoding="async"
      />
      <div className="fortune-observatory__title">
        <p>{ORACLE_SERVICE_NAME}</p>
        <span className="fortune-observatory__rule" aria-hidden="true">
          ✧
        </span>
        <h1>今日の占い</h1>
      </div>
    </header>
  );
}
