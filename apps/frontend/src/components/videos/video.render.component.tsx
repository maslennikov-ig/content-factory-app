import { createContext, FC, useCallback, useContext, useEffect } from 'react';
import './providers/image-text-slides.provider';
import './providers/veo3.provider';
import { videosList } from '@contentfactory/frontend/components/videos/video.wrapper';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { useLaunchStore } from '@contentfactory/frontend/components/new-launch/store';

const VideoFunctionWrapper = createContext({
  identifier: '',
});

export const useVideoFunction = () => {
  const { identifier } = useContext(VideoFunctionWrapper);
  const fetch = useFetch();

  return useCallback(
    async (funcName: string, params: any) => {
      return (
        await fetch(`/media/video/function`, {
          method: 'POST',
          body: JSON.stringify({ identifier, functionName: funcName, params }),
          headers: {
            'Content-Type': 'application/json',
          },
        })
      ).json();
    },
    [identifier]
  );
};

export const VideoWrapper: FC<{ identifier: string }> = (props) => {
  const setActivateExitButton = useLaunchStore((e) => e.setActivateExitButton);
  useEffect(() => {
    setActivateExitButton(false);
    return () => {
      setActivateExitButton(true);
    };
  }, []);

  const { identifier } = props;
  const Component = videosList.find(
    (v) => v.identifier === identifier
  )?.Component;
  if (!Component) {
    return null;
  }
  return (
    <VideoFunctionWrapper.Provider value={{ identifier }}>
      <Component />
    </VideoFunctionWrapper.Provider>
  );
};
