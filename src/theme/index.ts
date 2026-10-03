export const colors = {
  background: '#080C14',
  surface: '#101726',
  surfaceRaised: '#151E30',
  surfaceMuted: '#0D1422',
  surfaceStrong: '#1C2638',
  text: '#F4F5F7',
  textMuted: '#A4ADBD',
  textSoft: '#8994A8',
  border: '#343021',
  borderStrong: '#6A5730',
  primary: '#3B82F6',
  primaryPressed: '#1D4ED8',
  primarySoft: '#152849',
  primaryHover: '#1B3458',
  primaryFaint: '#111E35',
  primaryStrong: '#93C5FD',
  onPrimary: '#FFFFFF',
  onPrimarySoft: '#DBEAFE',
  onPrimaryMuted: '#DBEAFE',
  accent: '#D4AF37',
  accentSoft: '#2A2417',
  positive: '#34D399',
  positiveSoft: '#102C25',
  negative: '#F87171',
  negativeSoft: '#311C26',
  warning: '#FBBF24',
  warningSoft: '#2C2416',
  info: '#60A5FA',
  infoSoft: '#152849',
  overlay: 'rgba(0, 0, 0, 0.72)',
  shadow: '#000000',
} as const;

export const dashboardColors = {
  errorBorder: '#63333B',
  analyticsSurface: '#101726',
  analyticsBorder: '#6A5730',
  analyticsIcon: '#2A2417',
  analyticsRule: '#343021',
  analyticsDivider: '#343021',
  chartBar: '#D4AF37',
  chartZero: '#343021',
  selectedDivider: '#343021',
  positiveTile: '#102C25',
  negativeTile: '#311C26',
  amberTile: '#2C2416',
  purpleTile: '#26213D',
  warningBorder: '#6A5730',
  warningPressed: '#3A2E17',
  warningTile: '#3A2E17',
  warningText: '#FBBF24',
  negativeStrong: '#F87171',
  amberStrong: '#FBBF24',
  purpleStrong: '#C4B5FD',
} as const;

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 28,
  xxl: 40,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 999,
} as const;

export const type = {
  display: 32,
  title: 24,
  heading: 18,
  subheading: 15,
  body: 14,
  caption: 12,
  amount: 20,
  amountLarge: 28,
} as const;

export const touch = { min: 44, comfortable: 50 } as const;

export const control = {
  height: 50,
  compactHeight: 44,
  rowMinHeight: 60,
  denseRowMinHeight: 56,
  sectionGap: 12,
} as const;

export const layout = {
  pageGutter: 16,
  panelPadding: 14,
  densePadding: 12,
} as const;

export const elevation = {
  subtle: {
    shadowColor: colors.shadow,
    shadowOpacity: 0.025,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 0,
  },
  floating: {
    shadowColor: colors.shadow,
    shadowOpacity: 0.1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
} as const;

// Filled actions are separate from legible financial text on dark surfaces.
export const actionColors = { sale: '#2563EB', purchase: '#D97706', receive: '#10B981', spend: '#EF4444' } as const;
