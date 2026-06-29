export type StatsNavGroupId = 'core' | 'tools' | 'history' | 'studio' | 'pwhl';

export interface StatsNavItem {
  href: string;
  label: string;
  group: StatsNavGroupId;
  activePaths?: string[];
  badge?: string;
  exact?: boolean;
  showInSubnav?: boolean;
}

export const STATS_NAV_ITEMS: StatsNavItem[] = [
  { href: '/stats', label: 'Dashboard', group: 'core', exact: true, showInSubnav: false },
  { href: '/stats/skaters', label: 'Skaters', group: 'core', activePaths: ['/stats/player'] },
  { href: '/stats/goalies', label: 'Goalies', group: 'core' },
  { href: '/stats/teams', label: 'Teams', group: 'core' },

  { href: '/stats/lines', label: 'Lines', group: 'tools' },
  { href: '/stats/wowy', label: 'WOWY', group: 'tools' },
  { href: '/stats/impact', label: 'Impact', group: 'tools' },
  { href: '/stats/explore', label: 'Explore', group: 'tools', activePaths: ['/stats/explore'] },
  { href: '/stats/edge-compare', label: 'EDGE Compare', group: 'tools' },

  { href: '/stats/series', label: 'Playoff Series', group: 'history' },
  { href: '/stats/records', label: 'Series Records', group: 'history' },

  { href: '/cards', label: 'Cards', group: 'studio', activePaths: ['/cards'], showInSubnav: false },

  { href: '/stats/pwhl', label: 'PWHL Players', group: 'pwhl', activePaths: ['/stats/pwhl'] },
  { href: '/stats/pwhl/teams', label: 'PWHL Teams', group: 'pwhl' },
];

export const STATS_NAV_GROUP_LABELS: Record<StatsNavGroupId, string> = {
  core: 'NHL',
  tools: 'Tools',
  history: 'History',
  studio: 'Studio',
  pwhl: 'PWHL',
};

export function isStatsNavItemActive(item: StatsNavItem, currentPath: string): boolean {
  const paths = [item.href, ...(item.activePaths ?? [])];
  return paths.some((href) => currentPath === href || (!item.exact && currentPath.startsWith(`${href}/`)));
}

export function getStatsNavItemsForSubnav(): StatsNavItem[] {
  return STATS_NAV_ITEMS.filter((item) => item.showInSubnav !== false);
}

export function getStatsNavGroupsForSubnav(): { group: StatsNavGroupId; label: string; items: StatsNavItem[] }[] {
  const visibleGroups: StatsNavGroupId[] = ['core', 'tools', 'history', 'pwhl'];
  return visibleGroups
    .map(g => ({
      group: g,
      label: STATS_NAV_GROUP_LABELS[g],
      items: STATS_NAV_ITEMS.filter(i => i.group === g && i.showInSubnav !== false),
    }))
    .filter(g => g.items.length > 0);
}

export function isStatsSectionActive(currentPath: string): boolean {
  return currentPath === '/stats' || currentPath.startsWith('/stats/') || currentPath === '/cards';
}
