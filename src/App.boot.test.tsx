import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';

// Deliberately NOT mocking ./storage/firebaseSync — this file exercises the one
// configuration nothing else covers: the real module graph loading with no
// `.env` present, which is the repo's actual shipped state (`.env` is
// gitignored) and this test environment. Firebase used to be initialized at
// module-evaluation time, so `initializeApp`/`getAuth` threw before React ever
// mounted and the whole app rendered as a blank page — contradicting the
// spec's "works fully offline, Firebase optional" promise.

beforeEach(() => {
  localStorage.clear();
});

describe('App boot without Firebase configuration', () => {
  it('renders the consent modal instead of blank-screening', () => {
    expect(import.meta.env.VITE_FIREBASE_API_KEY).toBeFalsy();

    expect(() => render(<App />)).not.toThrow();

    expect(screen.getByRole('dialog', { name: /consent/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ok|yes|agree/i })).toBeInTheDocument();
  });
});
