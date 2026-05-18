/**
 * Type definitions for ankrshield desktop
 */

import 'electron';

declare module 'electron' {
  interface App {
    isQuitting?: boolean;
  }
}
