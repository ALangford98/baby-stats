const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

// The `custom-` prefix guarantees no collision with any built-in ActivityType
// literal (all camelCase, no hyphens). It also doubles as the cheap way to
// tell built-in and custom activities apart anywhere in the UI, via
// `type.startsWith('custom-')`, without threading a separate list around.
export function generateActivityId(): string {
  let suffix = '';
  for (let i = 0; i < 8; i++) {
    suffix += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return `custom-${suffix}`;
}
