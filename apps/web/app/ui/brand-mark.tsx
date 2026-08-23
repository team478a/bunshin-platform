export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="brand-mark" aria-label="BUNSHIN">
      <span className="brand-mark__symbol" aria-hidden="true">
        <span className="brand-mark__circle brand-mark__circle--front" />
        <span className="brand-mark__circle brand-mark__circle--back" />
      </span>
      {!compact && <span className="brand-mark__word">BUNSHIN</span>}
    </span>
  );
}
