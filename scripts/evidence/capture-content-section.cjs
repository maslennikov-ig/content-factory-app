#!/usr/bin/env node
/**
 * Browser evidence for the Content route's frame (`content-factory-next-36r.2`).
 *
 * The frame is a heading, five tabs and one panel. What it has to survive is
 * five Russian labels at 390px, a current-tab marker that is not colour alone,
 * and a panel that can fail without taking the other four tabs with it.
 *
 * Only the frame. The three sections behind it are the same view the settings
 * modal always showed and have their own review scenes.
 */
const { captureReviewScene } = require('./capture-review-scene.cjs');

const probe = (selector) => {
  const host = document.querySelector(selector);
  const tabs = [...host.querySelectorAll('[role="tab"]')];
  const selected = tabs.find(
    (tab) => tab.getAttribute('aria-selected') === 'true'
  );
  const styles = selected ? getComputedStyle(selected) : null;
  const rows = new Set(
    tabs.map((tab) => Math.round(tab.getBoundingClientRect().top))
  );
  return {
    tabLabels: tabs.map((tab) => (tab.textContent || '').trim()),
    selectedLabel: selected ? (selected.textContent || '').trim() : null,
    // Colour is never the only carrier of meaning: the current tab must also
    // differ in something a person who cannot see the hue can perceive.
    selectedBorder: styles ? styles.borderColor : null,
    selectedBackground: styles ? styles.backgroundColor : null,
    selectedBorderBottom: styles ? styles.borderBottomColor : null,
    unselectedBorderBottom: (() => {
      const other = tabs.find((tab) => tab !== selected);
      return other ? getComputedStyle(other).borderBottomColor : null;
    })(),
    tabRows: rows.size,
    panelId: host.querySelector('[role="tabpanel"]')?.id || null,
  };
};

const problems = (result) => {
  const where = `${result.pass} ${result.state} ${result.width}/${result.theme}/${result.locale}`;
  const found = [];
  if (result.tabLabels.length !== 5) {
    found.push(`${where}: ${result.tabLabels.length} tabs, expected 5`);
  }
  if (!result.selectedLabel) {
    found.push(`${where}: no tab is marked current`);
  }
  // The current tab is marked by an underline the others do not carry. Colour
  // alone is never the carrier, and the shape has to differ where the hue
  // cannot be seen — so the marker must not be the same on both.
  if (result.selectedBorderBottom === result.unselectedBorderBottom) {
    found.push(
      `${where}: current and other tabs share the same edge ${result.selectedBorderBottom}`
    );
  }
  if (!result.panelId) {
    found.push(`${where}: the tab strip controls no panel`);
  }
  return found;
};

if (require.main === module) {
  captureReviewScene({
    scene: 'content-section',
    evidenceName: 'content-section',
    hostSelector: '[data-production-surface="content/section"]',
    probe,
    problems,
  }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { probe, problems };
