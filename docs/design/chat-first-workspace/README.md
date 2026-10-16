# Chat-first workspace layout study

**State:** target design reference, 16 October 2026. Epic `content-factory-next-jvrq`.

**Naming:** the owner selected «ИИ-помощник» in Russian and “AI assistant” in English. The shared interface strings cover all 16 shipped locales, including right-to-left Hebrew (`he`) and Arabic (`ar`).

[Open the local prototype](prototype.html). Read the [product specification](../../product/chat-first-workspace-spec.md) and [implementation plan](../../superpowers/plans/2026-10-16-chat-first-workspace.md) for behavior and acceptance; the HTML is not product source or AI acceptance evidence.

The prototype uses the existing [Desert Lab tokens](../desert-lab/tokens.css), system font fallbacks, synthetic objects and local UI state. It loads no external assets, calls no APIs, and saves no product records. It does not copy the owner's screenshot, account data or private generated material.

Use the top controls to compare the empty conversation, chat with an artifact, and manual entry. Other interactions demonstrate the artifact picker, direct text edit, hide/restore/expand, keyboard/pointer resizing, workspace search, conversation selection, theme and compact Chat/Material switching. The manual and chat states share the same editor nodes; editing before switching retains the local text. Sending displays only the typed local message and explicitly indicates that no model ran.

The prototype narrows layout and interaction decisions. Existing production components, permissions, service records, upload/approval controls, actual text persistence and real model behavior must be integrated and accepted through the epic; none are simulated as live proof by this file.
