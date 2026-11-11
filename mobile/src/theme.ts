import { useColorScheme } from 'react-native';

const light = {
  bg: '#F5F7FB',
  card: '#FFFFFF',
  text: '#0F172A',
  muted: '#64748B',
  border: '#E2E8F0',
  primary: '#2563EB',
  primaryText: '#FFFFFF',
  good: '#16A34A',
  goodBg: '#DCFCE7',
  warn: '#D97706',
  warnBg: '#FEF3C7',
  bad: '#DC2626',
  plus: '#7C3AED',
  pro: '#DB2777',
};

const dark: typeof light = {
  bg: '#0B1120',
  card: '#151E31',
  text: '#F1F5F9',
  muted: '#94A3B8',
  border: '#24304A',
  primary: '#3B82F6',
  primaryText: '#FFFFFF',
  good: '#22C55E',
  goodBg: '#14532D',
  warn: '#F59E0B',
  warnBg: '#451A03',
  bad: '#F87171',
  plus: '#A78BFA',
  pro: '#F472B6',
};

export type Colors = typeof light;

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}

export const radius = 16;
export const space = 16;
