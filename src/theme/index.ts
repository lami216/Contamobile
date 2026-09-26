export const colors = {
  background: '#F4F7FB',
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  surfaceMuted: '#F7F9FC',
  surfaceStrong: '#EAF0F8',
  text: '#14223A',
  textMuted: '#68768C',
  textSoft: '#94A0B2',
  border: '#E2E8F1',
  borderStrong: '#C9D4E2',
  primary: '#1769E0',
  primaryPressed: '#0F54B8',
  primarySoft: '#E7F0FF',
  primaryFaint: '#F4F8FF',
  primaryStrong: '#104C9F',
  onPrimary: '#FFFFFF',
  accent: '#2E7BEA',
  accentSoft: '#EAF2FF',
  positive: '#129B62',
  positiveSoft: '#E5F6EE',
  negative: '#D84A50',
  negativeSoft: '#FCEAEC',
  warning: '#D98A1B',
  warningSoft: '#FFF3DE',
  info: '#3475C5',
  infoSoft: '#E9F2FC',
  overlay: 'rgba(12, 31, 57, 0.48)',
  shadow: '#17365E',
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
  lg: 18,
  xl: 24,
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
    shadowOpacity: 0.045,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  floating: {
    shadowColor: colors.shadow,
    shadowOpacity: 0.14,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
} as const;
