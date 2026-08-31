'use client';

import { scales } from './voice-profile.review-scenes';

/**
 * A scene has to export its component at the top level. Next hands a client
 * module across the boundary export by export, so a component nested inside a
 * plain object arrives as data rather than as something renderable — which is
 * a 404 on this route and no error anywhere.
 */
export const scene = scales.scene;
export const Scene = scales.Scene;
