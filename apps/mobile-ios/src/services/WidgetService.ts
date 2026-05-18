/**
 * WidgetService — A9
 * Pushes updated privacy score and threat count to the Android home screen widget.
 *
 * Calls WidgetModule.updateWidget() via the React Native bridge.
 * On iOS or web (where the native module is absent) the call is a no-op.
 *
 * Usage:
 *   import { WidgetService } from './WidgetService';
 *   WidgetService.updateWidget(score, threatsBlocked);
 */
import { NativeModules, Platform } from 'react-native';

export class WidgetService {
  /**
   * Update the Android home screen widget with the latest shield stats.
   *
   * @param score          Privacy score 0–100.
   * @param threatsBlocked Number of threats blocked today.
   */
  static updateWidget(score: number, threatsBlocked: number): void {
    if (Platform.OS !== 'android') return;
    if (!NativeModules.WidgetModule) {
      // Native module not yet registered — silently skip
      return;
    }
    try {
      NativeModules.WidgetModule.updateWidget(Math.round(score), Math.round(threatsBlocked));
    } catch {
      // Never crash the JS thread due to widget update failure
    }
  }
}
