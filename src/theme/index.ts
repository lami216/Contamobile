export const colors = {
  background: '#F4F5F1',
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  surfaceMuted: '#F0F2EE',
  surfaceStrong: '#E8ECE7',
  text: '#16211D',
  textMuted: '#66716C',
  textSoft: '#8B948F',
  border: '#E1E5E0',
  borderStrong: '#CBD2CD',
  primary: '#0B5A49',
  primaryPressed: '#084538',
  primarySoft: '#E3EFEA',
  primaryFaint: '#F4F8F6',
  onPrimary: '#FFFFFF',
  accent: '#B08A4A',
  accentSoft: '#F4EEE3',
  positive: '#1B724B',
  positiveSoft: '#E9F3ED',
  negative: '#A83C3C',
  negativeSoft: '#F7EAEA',
  warning: '#95651F',
  warningSoft: '#F8F0E0',
  info: '#2F6694',
  infoSoft: '#EAF0F6',
  overlay: 'rgba(11, 22, 18, 0.48)',
  shadow: '#0A1712',
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
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  full: 999,
} as const;

export const type = {
  display: 34,
  title: 27,
  heading: 20,
  subheading: 16,
  body: 15,
  caption: 12,
  amount: 21,
  amountLarge: 31,
} as const;

export const touch = { min: 44, comfortable: 50 } as const;

export const elevation = {
  subtle: {
    shadowColor: colors.shadow,
    shadowOpacity: 0.035,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  floating: {
    shadowColor: colors.shadow,
    shadowOpacity: 0.11,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 7,
  },
} as const;
