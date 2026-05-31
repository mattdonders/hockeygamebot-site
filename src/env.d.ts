/// <reference types="astro/client" />

// Custom window globals attached by page scripts.
// HGB_GAME_CARDS: shared game card cache between scoreboard and game-modal.
// HGB_Table: table helper exposed for inter-script column replacement.
// openModal: scoreboard game-card modal opener (called from inline onclick handlers).
interface Window {
  HGB_GAME_CARDS: Record<string, any>;
  HGB_Table: { replaceColumns?: (...args: any[]) => void } | undefined;
  openModal: (id: string, extra?: any) => void;
}
