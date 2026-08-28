declare module 'satori' {
  import type { ReactNode } from 'react';

  type FontWeight = 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;

  interface SatoriOptions {
    width: number;
    height: number;
    fonts: Array<{
      name: string;
      data: ArrayBuffer | Uint8Array;
      weight?: FontWeight;
      style?: 'normal' | 'italic';
    }>;
    embedFont?: boolean;
    pointScaleFactor?: number;
  }

  export default function satori(element: ReactNode, options: SatoriOptions): Promise<string>;
}
