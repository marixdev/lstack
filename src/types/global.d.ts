// Type augmentation for window.lstack API exposed via preload
import type { LStackAPI } from '../../main/preload';

declare global {
  interface Window {
    lstack: LStackAPI;
  }
}
