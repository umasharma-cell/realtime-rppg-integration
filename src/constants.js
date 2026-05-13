export const API_KEY = 'Eaq98XUSQ3aVrMwkR6H5P1Smbw7K6yMB5a1LGktP';

// Primary: 'wiseai' (cloud AI — HR + RR + HRV, most accurate, needs API)
// Fallback: 'chrom' (local — HR only, no API needed)
export const SDK_METHOD = 'wiseai';
export const FALLBACK_METHOD = 'chrom';

export const SESSION_DURATION = 60; // seconds

export const CONFIDENCE_THRESHOLDS = {
  VITAL_GOOD: 0.55,
  VITAL_MODERATE: 0.3,
  FACE_MIN: 0.5,
};

export const FACE_LOSS_PAUSE_DELAY = 5; // seconds before timer pauses

export const MAX_WALL_TIME = 120; // max session wall-clock time in seconds
