'use client';

import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';

export function PendingSubmitButton({
  children,
  pendingLabel,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  const [submitted, setSubmitted] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const form = buttonRef.current?.form;
    if (!form) return;
    const markSubmitted = () => setSubmitted(true);
    form.addEventListener('submit', markSubmitted);
    return () => form.removeEventListener('submit', markSubmitted);
  }, []);
  const busy = pending || submitted;
  return (
    <button {...props} ref={buttonRef} type="submit" disabled={disabled || busy} aria-busy={busy}>
      {busy ? pendingLabel : children}
    </button>
  );
}
