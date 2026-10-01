export const colors = {
  background: '#F8FAFC',
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  surfaceMuted: '#F5F7FA',
  surfaceStrong: '#EEF2F7',
  text: '#132238',
  textMuted: '#64748B',
  textSoft: '#94A3B8',
  border: '#D8E1EC',
  borderStrong: '#B9C7D8',
  primary: '#1769E0',
  primaryPressed: '#0F54B8',
  primarySoft: '#E8F1FF',
  primaryHover: '#D9E9FF',
  primaryFaint: '#F4F8FF',
  primaryStrong: '#104C9F',
  onPrimary: '#FFFFFF',
  onPrimarySoft: '#DCE9FF',
  onPrimaryMuted: '#E7F0FF',
  accent: '#2E7BEA',
  accentSoft: '#EAF2FF',
  positive: '#16A344',
  positiveSoft: '#E8F7EE',
  negative: '#EF4444',
  negativeSoft: '#FDECEC',
  warning: '#F59E0B',
  warningSoft: '#FFF5DF',
  info: '#3475C5',
  infoSoft: '#E9F2FC',
  overlay: 'rgba(12, 31, 57, 0.48)',
  shadow: '#17365E',
} as const;

export const dashboardColors = {
  errorBorder: '#F4CDD0',
  analyticsSurface: '#EAF3FF',
  analyticsBorder: '#D5E5F8',
  analyticsIcon: '#DCEAFF',
  analyticsRule: '#D7E4F3',
  analyticsDivider: '#D5E4F4',
  chartBar: '#8ABCF8',
  chartZero: '#C8D7E8',
  selectedDivider: '#D4E2F2',
  positiveTile: '#E4F8EF',
  negativeTile: '#FDE9EB',
  amberTile: '#FFF2DA',
  purpleTile: '#F0E9FF',
  warningBorder: '#F3D59B',
  warningPressed: '#FFEDC6',
  warningTile: '#FFE4AD',
  warningText: '#A96308',
  negativeStrong: '#B92E43',
  amberStrong: '#EA920E',
  purpleStrong: '#6C3DE1',
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

export const touch = { min: 44, comfortable: 48 } as const;

export const control = {
  height: 48,
  compactHeight: 40,
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
