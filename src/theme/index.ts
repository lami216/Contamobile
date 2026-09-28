export const colors = {
  background: '#F5F7FA',
  backgroundRaised: '#EEF2F6',
  surface: '#FFFFFF',
  surfaceMuted: '#F7F9FB',
  surfaceStrong: '#EAF0F4',
  text: '#10212B',
  textMuted: '#687985',
  textSubtle: '#8C9AA3',
  border: '#E1E8ED',
  borderStrong: '#CBD6DD',
  primary: '#0A6C61',
  primaryPressed: '#07574F',
  primarySoft: '#E3F2EF',
  primarySoftStrong: '#CFE8E3',
  accent: '#1E5F8A',
  accentSoft: '#E7F0F7',
  onPrimary: '#FFFFFF',
  positive: '#137A4D',
  positiveSoft: '#E4F4EB',
  negative: '#B53D43',
  negativeSoft: '#FBEAEC',
  warning: '#9A6717',
  warningSoft: '#FFF3D9',
  info: '#286C9E',
  infoSoft: '#E8F1F8',
  overlay: 'rgba(10, 26, 35, 0.48)',
  shadow: 'rgba(16, 33, 43, 0.10)',
} as const;

export const spacing = { xxs: 4, xs: 8, sm: 12, md: 16, lg: 20, xl: 28, xxl: 40 } as const;
export const radius = { sm: 10, md: 14, lg: 20, xl: 26, full: 999 } as const;
export const type = { title: 28, heading: 20, subheading: 16, body: 15, caption: 12, amount: 22, heroAmount: 30 } as const;
export const touch = { min: 46 } as const;

export const shadow = {
  card: {
    shadowColor: colors.shadow,
    shadowOpacity: 1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 7 },
    elevation: 3,
  },
  floating: {
    shadowColor: colors.shadow,
    shadowOpacity: 1,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },
} as const;
