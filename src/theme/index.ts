export const colors = {
  background: '#F3F6F4',
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  surfaceMuted: '#EDF3F0',
  surfaceStrong: '#E3ECE8',
  text: '#10231D',
  textMuted: '#687870',
  textSoft: '#89968F',
  border: '#DCE6E1',
  borderStrong: '#C8D7D0',
  primary: '#0A705B',
  primaryPressed: '#075947',
  primarySoft: '#DDF3EB',
  primaryFaint: '#F0FAF6',
  onPrimary: '#FFFFFF',
  accent: '#B88A36',
  accentSoft: '#F8EED9',
  positive: '#157A4B',
  positiveSoft: '#E5F5EC',
  negative: '#B53B3B',
  negativeSoft: '#FBEAEA',
  warning: '#9B651A',
  warningSoft: '#FFF1D7',
  info: '#2E6FA8',
  infoSoft: '#E8F1FA',
  overlay: 'rgba(8, 22, 17, 0.52)',
  shadow: '#07150F',
} as const;

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 26,
  full: 999,
} as const;

export const type = {
  display: 34,
  title: 28,
  heading: 21,
  subheading: 17,
  body: 15,
  caption: 12,
  amount: 22,
  amountLarge: 32,
} as const;

export const touch = { min: 44, comfortable: 52 } as const;

export const elevation = {
  subtle: {
    shadowColor: colors.shadow,
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  floating: {
    shadowColor: colors.shadow,
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
} as const;
