'use client';

import { StandaloneModal } from '@contentfactory/frontend/components/standalone-modal/standalone.modal';
import { ExtensionSurface } from '@contentfactory/frontend/app/(extension)/modal/extension.surface';
export default function Modal() {
  return (
    <ExtensionSurface state="default">
    <div className="w-screen h-screen overflow-hidden bg-black">
      <div className="text-textColor h-[calc(100vh+80px)] w-[calc(100vw+80px)] -m-[40px]">
        <StandaloneModal />
      </div>
    </div>
    </ExtensionSurface>
  );
}
