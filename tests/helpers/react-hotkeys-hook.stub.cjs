'use strict';

/**
 * `react-hotkeys-hook` ships ESM only, and Jest will not parse it.
 *
 * Mapped in `jest.config.cjs` rather than mocked in each suite: the package is
 * a keyboard shortcut, it is reached transitively by anything that mounts the
 * compose modal, and a suite that has to know about it in order to test a tab
 * is a suite testing the module system.
 */

const useHotkeys = () => undefined;
const useRecordHotkeys = () => [new Set(), { start() {}, stop() {}, resetKeys() {}, isRecording: false }];
const HotkeysProvider = ({ children }) => children;

module.exports = {
  useHotkeys,
  useRecordHotkeys,
  HotkeysProvider,
  useHotkeysContext: () => ({
    enabledScopes: [],
    enableScope() {},
    disableScope() {},
    toggleScope() {},
  }),
  isHotkeyPressed: () => false,
};
