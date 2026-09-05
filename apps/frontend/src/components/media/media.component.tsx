'use client';

import React, {
  ChangeEvent,
  ClipboardEvent,
  FC,
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Button } from '@contentfactory/react/form/button';
import { Input } from '@contentfactory/react/form/input';
import useSWR from 'swr';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { hasExtension } from '@contentfactory/helpers/utils/has.extension';
import {
  MAX_IMAGE_UPLOAD_SIZE,
  MAX_VIDEO_UPLOAD_SIZE,
  formatUploadSizeLimit,
} from '@contentfactory/nestjs-libraries/upload/upload.limits';
import { Media } from '@prisma/client';
import { useMediaDirectory } from '@contentfactory/react/helpers/use.media.directory';
import { useSettings } from '@contentfactory/frontend/components/launches/helpers/use.values';
import { useToaster } from '@contentfactory/react/toaster/toaster';
import clsx from 'clsx';
import { VideoFrame } from '@contentfactory/react/helpers/video.frame';
import { useUppyUploader } from '@contentfactory/frontend/components/media/new.uploader';
import { useUser } from '@contentfactory/frontend/components/layout/user.context';
import { AiImage } from '@contentfactory/frontend/components/launches/ai.image';
import { DropFiles } from '@contentfactory/frontend/components/layout/drop.files';
import { deleteDialog } from '@contentfactory/react/helpers/delete.dialog';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { useVariables } from '@contentfactory/react/helpers/variable.context';
import { ThirdPartyMedia } from '@contentfactory/frontend/components/third-parties/third-party.media';
import { ReactSortable } from 'react-sortablejs';
import { MediaComponentInner } from '@contentfactory/frontend/components/launches/helpers/media.settings.component';
import { AiVideo } from '@contentfactory/frontend/components/launches/ai.video';
import { useModals } from '@contentfactory/frontend/components/layout/new-modal';
import { ThirdPartyMediaLibrary } from '@contentfactory/frontend/components/third-parties/third-party.media-library';
import { Dashboard } from '@uppy/react';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
  DeleteCircleIcon,
  CloseCircleIcon,
  DragHandleIcon,
  MediaSettingsIcon,
  InsertMediaIcon,
  VerticalDividerIcon,
  NoMediaIcon,
  DesignMediaIcon,
} from '@contentfactory/frontend/components/ui/icons';
import { useLaunchStore } from '@contentfactory/frontend/components/new-launch/store';
import { useShallow } from 'zustand/react/shallow';
import { LoadingComponent } from '@contentfactory/frontend/components/layout/loading';
import { useDebounce } from 'use-debounce';
import { ImageEditorModal } from '@contentfactory/frontend/components/media/image-editor/image-editor-modal';
import { uploadEditedMedia } from '@contentfactory/frontend/components/media/image-editor/upload-edited-media';
import {
  completeEditedMedia,
  completeMediaBoxEditorSave,
  replaceEditedAttachment,
} from '@contentfactory/frontend/components/media/image-editor/media-completion';
import type {
  MediaLibraryItem,
  UploadedMedia,
} from '@contentfactory/frontend/components/media/image-editor/types';
// Keep image editing inside Content Factory: the previous vendor editor
// announced this instance's host name and forwarded stock-photo searches.
// This replacement loads the selected source locally and saves only through
// our own media endpoint.
export const Pagination: FC<{
  current: number;
  totalPages: number;
  setPage: (num: number) => void;
}> = (props) => {
  const t = useT();

  const { current, totalPages, setPage } = props;

  const paginationItems = useMemo(() => {
    // Convert to 1-based for algorithm (current is 0-based)
    const c = current + 1;
    const m = totalPages;

    // If total pages <= 10, show all pages
    if (m <= 10) {
      return Array.from({ length: m }, (_, i) => i + 1);
    }

    const delta = 3;
    const left = c - delta;
    const right = c + delta + 1;
    const range: number[] = [];
    const rangeWithDots: (number | '...')[] = [];
    let l: number | undefined;

    // Build the range of pages to show
    for (let i = 1; i <= m; i++) {
      if (i === 1 || i === m || (i >= left && i < right)) {
        range.push(i);
      }
    }

    // Add dots where there are gaps
    for (const i of range) {
      if (l !== undefined) {
        if (i - l === 2) {
          rangeWithDots.push(l + 1);
        } else if (i - l !== 1) {
          rangeWithDots.push('...');
        }
      }
      rangeWithDots.push(i);
      l = i;
    }

    // Limit to maximum 10 items by trimming pages near edges if needed
    while (rangeWithDots.length > 10) {
      const currentIndex = rangeWithDots.findIndex((item) => item === c);
      if (currentIndex !== -1 && currentIndex > rangeWithDots.length / 2) {
        // Current is in second half, remove one item from start side
        rangeWithDots.splice(2, 1);
      } else {
        // Current is in first half, remove one item from end side
        rangeWithDots.splice(-3, 1);
      }
    }

    return rangeWithDots;
  }, [current, totalPages]);

  return (
    <ul className="flex flex-row items-center gap-1 justify-center mt-[15px]">
      <li className={clsx(current === 0 && 'opacity-20 pointer-events-none')}>
        <div
          className="cursor-pointer inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 h-10 px-4 py-2 gap-1 ps-2.5 text-gray-400 hover:text-cf-accent-ink border-[#1F1F1F] hover:bg-forth"
          aria-label="Go to previous page"
          onClick={() => setPage(current - 1)}
        >
          <ChevronLeftIcon className="lucide lucide-chevron-left h-4 w-4" />
          <span>{t('previous', 'Previous')}</span>
        </div>
      </li>
      {paginationItems.map((item, index) => (
        <li key={index}>
          {item === '...' ? (
            <span className="inline-flex items-center justify-center h-10 w-10 text-textColor select-none">
              ...
            </span>
          ) : (
            <div
              aria-current="page"
              onClick={() => setPage(item - 1)}
              className={clsx(
                'cursor-pointer inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border hover:bg-forth h-10 w-10 hover:text-cf-accent-ink border-newBorder',
                current === item - 1
                  ? 'bg-forth !text-cf-accent-ink'
                  : 'text-textColor hover:text-cf-accent-ink'
              )}
            >
              {item}
            </div>
          )}
        </li>
      ))}
      <li
        className={clsx(
          current + 1 === totalPages && 'opacity-20 pointer-events-none'
        )}
      >
        <a
          className="text-textColor hover:text-cf-accent-ink group cursor-pointer inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 h-10 px-4 py-2 gap-1 pe-2.5 text-gray-400 border-[#1F1F1F] hover:bg-forth"
          aria-label="Go to next page"
          onClick={() => setPage(current + 1)}
        >
          <span>{t('next', 'Next')}</span>
          <ChevronRightIcon className="lucide lucide-chevron-right h-4 w-4" />
        </a>
      </li>
    </ul>
  );
};
/**
 * How the media library is put on screen — the one description of it.
 *
 * `MediaBox` fills its parent: the grid is positioned absolutely inside a
 * `flex-1` column, so a parent without a height collapses it to a strip. Until
 * 04.09.2026 there were two ways in and only one of them said how tall the
 * thing was. The post editor opened this modal and worked; the profile picture
 * and the bot picture went through an event emitter into a component rendered
 * straight into the page layout, and both collapsed into a ~140px band above
 * the header, with the list and the upload button out of reach
 * (`content-factory-next-fn33.15`).
 *
 * The size lives here so it cannot be given to one caller and forgotten for
 * another.
 */
const MEDIA_BOX_MODAL_LAYOUT = {
  askClose: false,
  closeOnEscape: true,
  fullScreen: true,
  size: 'calc(100% - 80px)',
  height: 'calc(100% - 80px)',
} as const;

/**
 * Opens the media library and hands back what was chosen.
 *
 * Every path into the library — the post editor, the profile picture, the bot
 * picture, the settings media field — goes through this and nothing else.
 * `MediaBox` closes itself through `modals.closeCurrent()` once a selection is
 * confirmed, and the cancel button does the same.
 */
export const useOpenMediaBox = () => {
  const modals = useModals();
  const t = useT();

  return useCallback(
    (
      onSelect: (media: { id: string; path: string }[]) => void,
      options?: { type?: 'image' | 'video' }
    ) => {
      modals.openModal({
        title: t('media_library', 'Media Library'),
        ...MEDIA_BOX_MODAL_LAYOUT,
        children: (close) => (
          <MediaBox
            setMedia={onSelect}
            closeModal={close}
            type={options?.type}
          />
        ),
      });
    },
    [modals, t]
  );
};
const CHUNK_SIZE = 1024 * 1024;
const MAX_UPLOAD_SIZE = 1024 * 1024 * 1024; // 1 GB
const isEditableImage = (
  media: Pick<Media, 'path' | 'name' | 'originalName'>
) =>
  [media.path, media.name, media.originalName].some((value) =>
    ['png', 'jpg', 'jpeg', 'webp'].some((extension) =>
      hasExtension(value, extension)
    )
  );
export const MediaBox: FC<{
  setMedia: (params: { id: string; path: string }[]) => void;
  standalone?: boolean;
  type?: 'image' | 'video';
  closeModal: () => void;
}> = ({ type, standalone, setMedia }) => {
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebounce(search, 300);
  const fetch = useFetch();
  const modals = useModals();
  const toaster = useToaster();
  useEffect(() => {
    setPage(0);
  }, [debouncedSearch]);
  const loadMedia = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page + 1) });
    if (debouncedSearch.trim()) {
      params.set('search', debouncedSearch.trim());
    }
    return (await fetch(`/media?${params.toString()}`)).json();
  }, [page, debouncedSearch]);
  const { data, mutate, isLoading } = useSWR(
    `get-media-${page}-${debouncedSearch}`,
    loadMedia
  );
  const [selected, setSelected] = useState([]);
  const t = useT();
  // The units in the sentence below follow the language it is written in
  // (`content-factory-next-fn33.95`).
  const { language } = useVariables();
  const uploaderRef = useRef<any>(null);
  const mediaDirectory = useMediaDirectory();
  const [loading, setLoading] = useState(false);
  const [editorSource, setEditorSource] = useState<MediaLibraryItem | null>(
    null
  );
  const editorTrigger = useRef<HTMLElement | null>(null);

  /**
   * Полоса загрузки говорит на языке экрана (`content-factory-next-fn33.28.15`).
   *
   * Подписи внутри неё рисует не наша разметка, а `@uppy/dashboard`: у него
   * свой словарь, и без него на русском экране оставалось английское
   * «Drop files here or browse files». Переопределяем ровно те строки, что
   * видны в этой полосе высотой 46 пикселей; `%{browseFiles}` — подстановка
   * самого Uppy, поэтому она проходит сквозь перевод как есть.
   */
  const uploaderLocale = useUploaderLocale(t);

  const uppy = useUppyUploader({
    allowedFileTypes:
      type == 'image'
        ? 'image/*'
        : type == 'video'
        ? 'video/mp4'
        : 'image/*,video/mp4',
    onUploadSuccess: async (arr) => {
      await mutate();
      if (standalone) {
        return;
      }
      setSelected((prevSelected) => {
        return [...prevSelected, ...arr];
      });
    },
    onStart: () => setLoading(true),
    onEnd: () => setLoading(false),
  });

  const addRemoveSelected = useCallback(
    (media: any) => () => {
      if (standalone) {
        return;
      }
      const exists = selected.find((p: any) => p.id === media.id);
      if (exists) {
        setSelected(selected.filter((f: any) => f.id !== media.id));
        return;
      }
      setSelected([...selected, media]);
    },
    [selected]
  );

  const addMedia = useCallback(async () => {
    if (standalone) {
      return;
    }
    // @ts-ignore
    setMedia(selected);
    modals.closeCurrent();
  }, [selected]);

  const addToUpload = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      const totalSize = files.reduce((acc, file) => acc + file.size, 0);

      if (totalSize > MAX_UPLOAD_SIZE) {
        toaster.show(
          t(
            'upload_size_limit_exceeded',
            'Upload size limit exceeded. Maximum 1 GB per upload session.'
          ),
          'warning'
        );
        return;
      }

      setLoading(true);

      // @ts-ignore
      uppy.addFiles(files);
    },
    [toaster, t]
  );

  const dragAndDrop = useCallback(
    async (event: ClipboardEvent<HTMLDivElement> | File[]) => {
      // @ts-ignore
      const clipboardItems = event.map((p) => ({
        kind: 'file',
        getAsFile: () => p,
      }));
      if (!clipboardItems) {
        return;
      }

      const files: File[] = [];
      // @ts-ignore
      for (const item of clipboardItems) {
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file) {
            files.push(file);
          }
        }
      }

      const totalSize = files.reduce((acc, file) => acc + file.size, 0);

      if (totalSize > MAX_UPLOAD_SIZE) {
        toaster.show(
          t(
            'upload_size_limit_exceeded',
            'Upload size limit exceeded. Maximum 1 GB per upload session.'
          ),
          'warning'
        );
        return;
      }

      setLoading(true);

      for (const file of files) {
        uppy.addFile(file);
      }
    },
    [toaster, t]
  );

  const maximize = useCallback(
    (media: Media) => async (e: any) => {
      e.stopPropagation();
      modals.openModal({
        title: '',
        top: 10,
        children: (
          <div className="w-full h-full p-[50px]">
            {hasExtension(media.path, 'mp4') ? (
              <VideoFrame
                autoplay={true}
                url={mediaDirectory.set(media.path)}
              />
            ) : (
              <img
                width="100%"
                height="100%"
                className="w-full h-full max-h-[100%] max-w-[100%] object-cover"
                src={mediaDirectory.set(media.path)}
                alt="media"
              />
            )}
          </div>
        ),
      });
    },
    []
  );

  const deleteImage = useCallback(
    (media: Media) => async (e: any) => {
      e.stopPropagation();
      if (
        !(await deleteDialog(
          t(
            'are_you_sure_you_want_to_delete_the_image',
            'Are you sure you want to delete the image?'
          )
        ))
      ) {
        return;
      }
      await fetch(`/media/${media.id}`, {
        method: 'DELETE',
      });
      mutate();
    },
    [mutate]
  );

  const btn = useMemo(() => {
    return (
      <Button
        variant="secondary"
        disabled={loading}
        onClick={() => uploaderRef?.current?.click()}
        className="relative cursor-pointer changeColor flex gap-[8px] px-[18px] justify-center items-center rounded-[8px]"
      >
        {loading ? (
          <div className="absolute left-[50%] top-[50%] -translate-y-[50%] -translate-x-[50%]">
            <div className="animate-spin h-[20px] w-[20px] border-4 border-white border-t-transparent rounded-full" />
          </div>
        ) : (
          <PlusIcon size={14} />
        )}
        <div className={loading ? 'invisible' : undefined}>
          {t('upload', 'Upload')}
        </div>
      </Button>
    );
  }, [t, loading]);

  const onEditedMediaSaved = useCallback(
    async (uploaded: UploadedMedia) => {
      const completion = await completeMediaBoxEditorSave({
        standalone: !!standalone,
        uploaded,
        mutate,
        select: (item) =>
          setSelected(
            (current: UploadedMedia[]) =>
              completeEditedMedia({
                standalone: false,
                selected: current,
                uploaded: item,
              }).selected
          ),
        close: () => setEditorSource(null),
        onRefreshError: () => {},
      });
      toaster.show(
        completion.refreshed
          ? t('edited_image_saved', 'Edited image saved as a new media item.')
          : t(
              'edited_image_saved_refresh_warning',
              'Edited image saved, but the media library could not refresh.'
            ),
        completion.refreshed ? 'success' : 'warning'
      );
    },
    [mutate, standalone, t, toaster]
  );

  return (
    <>
      {editorSource && (
        <ImageEditorModal
          source={editorSource}
          upload={(blob, filename, signal) =>
            uploadEditedMedia(fetch, blob, filename, signal)
          }
          onSaved={onEditedMediaSaved}
          onClose={() => setEditorSource(null)}
          returnFocus={editorTrigger.current}
          locale={
            typeof document !== 'undefined' &&
            document.documentElement.lang === 'ru'
              ? 'ru'
              : 'en'
          }
        />
      )}
      <DropFiles
        disabled={loading || !!editorSource}
        className="flex flex-col flex-1"
        onDrop={dragAndDrop}
      >
        <div className="flex flex-col flex-1">
          <div
            className={clsx(
              'flex items-center gap-[12px]',
              !isLoading &&
                !data?.results?.length &&
                !debouncedSearch &&
                'hidden'
            )}
          >
            <Input
              standalone
              name="media-search"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('search_media_by_name', 'Search by file name')}
              fieldClassName="flex-1"
              className="w-full"
            />
            <input
              type="file"
              ref={uploaderRef}
              onChange={addToUpload}
              className="hidden"
              multiple={true}
            />
            <div className="flex gap-[8px]">
              {btn}
              <ThirdPartyMediaLibrary onImported={() => mutate()} />
            </div>
          </div>
          <div className="w-full pointer-events-none relative mt-[5px] mb-[5px]">
            <div className="w-full h-[46px] overflow-hidden absolute left-0 bg-newBgColorInner uppyChange">
              <Dashboard
                height={46}
                uppy={uppy}
                id={`uploader`}
                locale={uploaderLocale}
                showProgressDetails={true}
                hideUploadButton={true}
                hideRetryButton={true}
                hidePauseResumeButton={true}
                hideCancelButton={true}
                hideProgressAfterFinish={true}
              />
            </div>
            <div className="w-full h-[46px] uppyChange" />
          </div>
          <div
            className={clsx(
              'flex-1 relative',
              !isLoading &&
                !data?.results?.length &&
                'bg-newTextColor/[0.02] rounded-[12px]'
            )}
          >
            <div
              className={clsx(
                'absolute -left-[3px] -top-[3px] withp3 h-full overflow-x-hidden overflow-y-auto scrollbar scrollbar-thumb-newColColor scrollbar-track-newBgColorInner',
                !isLoading &&
                  !data?.results?.length &&
                  'flex justify-center items-center gap-[20px] flex-col'
              )}
            >
              {!isLoading && !data?.results?.length && (
                <>
                  <NoMediaIcon />
                  <div className="text-[20px] font-[600]">
                    {debouncedSearch
                      ? t(
                          'no_media_match_search',
                          'No media matches your search'
                        )
                      : t(
                          'you_dont_have_any_media_yet',
                          "You don't have any media yet"
                        )}
                  </div>
                  <div className="whitespace-pre-line text-newTextColor/[0.6] text-center">
                    {/*
                      Подпись обещала «максимум 1 GB за загрузку» — предел
                      сеанса выгрузки, — а файл на 14 МБ отклонялся, потому что
                      предел на одну картинку другой и живёт в
                      `upload.limits.ts` (`content-factory-next-fn33.71`).
                      Числа берутся оттуда же, чтобы подпись не разошлась с
                      проверкой ещё раз.
                    */}
                    {t(
                      'select_or_upload_pictures_limits',
                      'Select or upload media (images up to {{imageLimit}}, video up to {{videoLimit}}).',
                      {
                        imageLimit: formatUploadSizeLimit(
                          MAX_IMAGE_UPLOAD_SIZE,
                          language
                        ),
                        videoLimit: formatUploadSizeLimit(
                          MAX_VIDEO_UPLOAD_SIZE,
                          language
                        ),
                      }
                    )}{' '}
                    {'\n'}
                    {t(
                      'you_can_drag_drop_pictures',
                      'You can also drag & drop pictures.'
                    )}
                  </div>
                  <div className="forceChange flex gap-[8px]">
                    {btn}
                    <ThirdPartyMediaLibrary onImported={() => mutate()} />
                  </div>
                </>
              )}
              {isLoading && (
                <>
                  {[...new Array(16)].map((_, i) => (
                    <div
                      className={clsx(
                        'px-[3px] py-[3px] float-left rounded-[6px] cursor-pointer w8-max aspect-square'
                      )}
                      key={i}
                    >
                      <div className="w-full h-full bg-newSep rounded-[6px] animate-pulse" />
                    </div>
                  ))}
                </>
              )}
              {data?.results
                ?.filter((f: any) => {
                  if (type === 'video') {
                    return hasExtension(f.path, 'mp4');
                  } else if (type === 'image') {
                    return !hasExtension(f.path, 'mp4');
                  }
                  return true;
                })
                .map((media: any) => (
                  <div
                    className={clsx(
                      'group px-[3px] py-[3px] float-left rounded-[6px] w8-max aspect-square',
                      !standalone && 'cursor-pointer'
                    )}
                    key={media.id}
                  >
                    <div
                      className={clsx(
                        'w-full h-full rounded-[6px] border-[4px] relative',
                        !!selected.find((p) => p.id === media.id)
                          ? 'border-cf-accent'
                          : 'border-transparent'
                      )}
                      onClick={addRemoveSelected(media)}
                    >
                      {!!selected.find((p: any) => p.id === media.id) ? (
                        <div className="text-cf-accent-ink flex z-[101] justify-center items-center text-[14px] font-[500] w-[24px] h-[24px] rounded-full bg-cf-accent absolute -bottom-[10px] -end-[10px]">
                          {selected.findIndex((z: any) => z.id === media.id) +
                            1}
                        </div>
                      ) : (
                        <DeleteCircleIcon
                          className="cursor-pointer hidden z-[100] group-hover:block absolute -top-[5px] -end-[5px]"
                          onClick={deleteImage(media)}
                        />
                      )}
                      <div className="absolute bottom-[10px] end-[10px] z-[100]">
                        {media.originalName}
                      </div>
                      <div className="w-full h-full rounded-[6px] overflow-hidden relative">
                        <div className="absolute z-[20] left-[50%] top-[50%] -translate-x-[50%] -translate-y-[50%]">
                          <div
                            onClick={maximize(media)}
                            className="cursor-pointer p-[4px] bg-black/40 hidden group-hover:block hover:scale-150 transition-all"
                          >
                            <svg
                              width="30"
                              height="30"
                              viewBox="0 0 14 14"
                              fill="none"
                              xmlns="http://www.w3.org/2000/svg"
                            >
                              <path
                                d="M2 9H0V14H5V12H2V9ZM0 5H2V2H5V0H0V5ZM12 12H9V14H14V9H12V12ZM9 0V2H12V5H14V0H9Z"
                                fill="#F1F5F9"
                              />
                            </svg>
                          </div>
                        </div>
                        {hasExtension(media.path, 'mp4') ? (
                          <VideoFrame url={mediaDirectory.set(media.path)} />
                        ) : (
                          <img
                            width="100%"
                            height="100%"
                            className="w-full h-full object-cover"
                            src={mediaDirectory.set(media.path)}
                            alt="media"
                          />
                        )}
                        {isEditableImage(media) && (
                          <Button
                            type="button"
                            iconOnly
                            aria-label={t('edit_image', 'Edit image')}
                            variant="secondary"
                            density="standard"
                            className="absolute bottom-[8px] start-[8px] z-[30] after:absolute after:-inset-[4px]"
                            onClick={(event) => {
                              event.stopPropagation();
                              editorTrigger.current = event.currentTarget;
                              setEditorSource(media as MediaLibraryItem);
                            }}
                          >
                            <DesignMediaIcon aria-hidden="true" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
          {(data?.pages || 0) > 1 && (
            <Pagination
              current={page}
              totalPages={data?.pages}
              setPage={setPage}
            />
          )}
          {!standalone && (
            <div className="flex justify-end mt-[32px] gap-[8px]">
              <Button
                variant="secondary"
                onClick={() => modals.closeCurrent()}
                className="cursor-pointer px-[20px] items-center justify-center flex rounded-[10px]"
              >
                {t('cancel', 'Cancel')}
              </Button>
              {!isLoading && !!data?.results?.length && (
                <Button
                  onClick={standalone ? () => {} : addMedia}
                  disabled={selected.length === 0}
                  className="cursor-pointer disabled:opacity-80 disabled:cursor-not-allowed px-[20px] items-center justify-center flex rounded-[10px]"
                >
                  {t('add_selected_media', 'Add selected media')}
                </Button>
              )}
            </div>
          )}
        </div>
      </DropFiles>
    </>
  );
};
/**
 * Словарь полосы загрузки Uppy — один на оба места, где она рисуется:
 * «Медиатека» и полоса под редактором окна поста (`fn33.28.15`, `fn33.28.17`).
 */
export const useUploaderLocale = (t: ReturnType<typeof useT>) =>
  useMemo(
    () => ({
      strings: {
        dropPasteFiles: t(
          'media_drop_paste_files',
          'Drop files here or %{browseFiles}'
        ),
        browseFiles: t('media_browse_files', 'browse files'),
        dropHint: t('media_drop_hint', 'Drop your files here'),
      },
    }),
    [t]
  );

export const MultiMediaComponent: FC<{
  label: string;
  description: string;
  mediaNotAvailable?: boolean;
  dummy: boolean;
  allData: {
    content: string;
    id?: string;
    image?: Array<{
      id: string;
      path: string;
    }>;
  }[];
  value?: Array<{
    path: string;
    id: string;
  }>;
  text: string;
  name: string;
  error?: any;
  onOpen?: () => void;
  onClose?: () => void;
  toolBar?: React.ReactNode;
  information?: React.ReactNode;
  onChange: (event: {
    target: {
      name: string;
      value?: Array<{
        id: string;
        path: string;
        alt?: string;
        thumbnail?: string;
        thumbnailTimestamp?: number;
      }>;
    };
  }) => void;
}> = (props) => {
  const {
    name,
    error,
    text,
    onChange,
    value,
    allData,
    dummy,
    toolBar,
    information,
    mediaNotAvailable,
  } = props;
  const user = useUser();
  const modals = useModals();
  const openMediaBox = useOpenMediaBox();
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();
  useEffect(() => {
    if (value) {
      setCurrentMedia(value);
    }
  }, [value]);

  const [currentMedia, setCurrentMedia] = useState(value);
  // The picture a post carries is the one worth fixing, and until now the only
  // way to fix it was to leave the draft, edit in the library and come back to
  // re-attach. The editor is the same one the library opens; only the thing it
  // does on save differs.
  const [editorIndex, setEditorIndex] = useState<number | null>(null);
  const editorTrigger = useRef<HTMLElement | null>(null);
  const mediaDirectory = useMediaDirectory();
  const changeMedia = useCallback(
    (
      m:
        | {
            path: string;
            id: string;
          }
        | {
            path: string;
            id: string;
          }[]
    ) => {
      const mediaArray = Array.isArray(m) ? m : [m];
      const newMedia = [...(currentMedia || []), ...mediaArray];
      setCurrentMedia(newMedia);
      onChange({
        target: {
          name,
          value: newMedia,
        },
      });
    },
    [currentMedia]
  );
  const showModal = useCallback(() => {
    openMediaBox(changeMedia);
  }, [openMediaBox, changeMedia]);

  const clearMedia = useCallback(
    (topIndex: number) => () => {
      const newMedia = currentMedia?.filter((f, index) => index !== topIndex);
      setCurrentMedia(newMedia);
      onChange({
        target: {
          name,
          value: newMedia,
        },
      });
    },
    [currentMedia]
  );

  const editorSource =
    editorIndex === null ? null : currentMedia?.[editorIndex] || null;

  const onEditedAttachmentSaved = useCallback(
    (uploaded: UploadedMedia) => {
      const index = editorIndex;
      if (index === null) return;
      const next = replaceEditedAttachment({
        attachments: currentMedia || [],
        index,
        uploaded,
      });
      setCurrentMedia(next);
      onChange({ target: { name, value: next } });
      setEditorIndex(null);
      toaster.show(
        t('edited_image_saved', 'Edited image saved as a new media item.'),
        'success'
      );
    },
    [currentMedia, editorIndex, name, onChange, t, toaster]
  );

  return (
    <>
      {editorSource && (
        <ImageEditorModal
          source={
            {
              id: editorSource.id,
              path: editorSource.path,
              name: editorSource.path.split('/').pop() || 'image',
              originalName: null,
              thumbnail: null,
              alt: null,
            } as MediaLibraryItem
          }
          upload={(blob, filename, signal) =>
            uploadEditedMedia(fetch, blob, filename, signal)
          }
          onSaved={onEditedAttachmentSaved}
          onClose={() => setEditorIndex(null)}
          returnFocus={editorTrigger.current}
          locale={
            typeof document !== 'undefined' &&
            document.documentElement.lang === 'ru'
              ? 'ru'
              : 'en'
          }
        />
      )}
      <div className="b1 flex flex-col gap-[8px] rounded-bl-[8px] select-none w-full">
        <div className="flex gap-[10px] px-[12px]">
          {!!currentMedia && (
            <ReactSortable
              list={currentMedia}
              setList={(value) =>
                onChange({ target: { name: 'upload', value } })
              }
              className="flex gap-[10px] sortable-container"
              animation={200}
              swap={true}
              handle=".dragging"
            >
              {currentMedia.map((media, index) => (
                <div
                  key={media.id}
                  className="cursor-pointer rounded-[5px] w-[40px] h-[40px] border-2 border-tableBorder relative flex transition-all"
                >
                  <DragHandleIcon className="z-[20] dragging absolute pe-[1px] pb-[3px] -start-[4px] -top-[4px] cursor-move" />

                  <div className="w-full h-full relative group">
                    <div
                      onClick={async () => {
                        modals.openModal({
                          title: t('media_settings', 'Media Settings'),
                          children: (close) => (
                            <MediaComponentInner
                              media={media as any}
                              onClose={close}
                              onSelect={(value: any) => {
                                onChange({
                                  target: {
                                    name: 'upload',
                                    value: currentMedia.map((p) => {
                                      if (p.id === media.id) {
                                        return {
                                          ...p,
                                          ...value,
                                        };
                                      }
                                      return p;
                                    }),
                                  },
                                });
                              }}
                            />
                          ),
                        });
                      }}
                      className="absolute top-[50%] left-[50%] -translate-x-[50%] -translate-y-[50%] bg-black/80 rounded-[10px] opacity-0 group-hover:opacity-100 transition-opacity z-[9]"
                    >
                      <MediaSettingsIcon className="cursor-pointer relative z-[200]" />
                    </div>
                    {hasExtension(media?.path, 'mp4') ? (
                      <VideoFrame url={mediaDirectory.set(media?.path)} />
                    ) : (
                      <img
                        className="w-full h-full object-cover rounded-[4px]"
                        src={mediaDirectory.set(media?.path)}
                      />
                    )}
                  </div>

                  {isEditableImage({
                    path: media.path,
                    name: media.path,
                    originalName: null,
                  }) && (
                    <Button
                      type="button"
                      iconOnly
                      density="dense"
                      variant="secondary"
                      aria-label={t('edit_image', 'Edit image')}
                      onClick={(event) => {
                        event.stopPropagation();
                        editorTrigger.current = event.currentTarget;
                        setEditorIndex(index);
                      }}
                      // Dense (32px) inside the 40px thumbnail, revealed on
                      // hover like the settings control beside it, and kept off
                      // the close circle in the opposite corner. Geometry comes
                      // from the shared control; nothing here retypes a size.
                      className="absolute bottom-0 start-0 z-[20] opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                    >
                      <DesignMediaIcon aria-hidden="true" />
                    </Button>
                  )}

                  <CloseCircleIcon
                    onClick={clearMedia(index)}
                    className="absolute -end-[4px] -top-[4px] z-[20] rounded-full bg-white"
                  />
                </div>
              ))}
            </ReactSortable>
          )}
        </div>
        <div className="flex gap-[8px] px-[12px] border-t border-newColColor w-full b1 text-textColor">
          {!mediaNotAvailable && (
            <div className="flex py-[10px] b2 items-center gap-[4px]">
              <div
                onClick={showModal}
                className="cursor-pointer h-[30px] rounded-[6px] justify-center items-center flex bg-newColColor px-[8px]"
              >
                <div className="flex gap-[8px] items-center">
                  <div>
                    <InsertMediaIcon />
                  </div>
                  <div className="text-[10px] font-[600] maxMedia:hidden block">
                    {t('insert_media', 'Insert Media')}
                  </div>
                </div>
              </div>
              <ThirdPartyMedia allData={allData} onChange={changeMedia} />

              {!!user?.tier?.ai && (
                <>
                  <AiImage value={text} onChange={changeMedia} />
                  <AiVideo value={text} onChange={changeMedia} />
                </>
              )}
            </div>
          )}
          {/* The divider has one job: separate the media group from the
              toolbar beside it. It used to render whenever media was
              available, so on every screen that passes no toolbar — the
              agent, Veo3, the Reddit options — it stood alone at the end of
              the row: a stray vertical stroke with nothing on its far side.
              A separator with one side is not a separator. */}
          {!mediaNotAvailable && !!toolBar && (
            <div className="text-newColColor h-full flex items-center">
              <VerticalDividerIcon />
            </div>
          )}
          {!!toolBar && (
            <div className="flex py-[10px] b2 items-center gap-[4px]">
              {toolBar}
            </div>
          )}
          {information && (
            <div className="flex-1 justify-end flex py-[10px] b2 items-center gap-[4px]">
              {information}
            </div>
          )}
        </div>
      </div>
      <div className="text-[12px] text-red-400">{error}</div>
    </>
  );
};
export const MediaComponent: FC<{
  label: string;
  description: string;
  value?: {
    path: string;
    id: string;
  };
  name: string;
  onChange: (event: {
    target: {
      name: string;
      value?: {
        id: string;
        path: string;
      };
    };
  }) => void;
  type?: 'image' | 'video';
  width?: number;
  height?: number;
}> = (props) => {
  const t = useT();

  const { name, type, label, description, onChange, value, width, height } =
    props;
  const { getValues } = useSettings();
  const user = useUser();
  useEffect(() => {
    const settings = getValues()[props.name];
    if (settings) {
      setCurrentMedia(settings);
    }
  }, []);
  const [currentMedia, setCurrentMedia] = useState(value);
  const openMediaBox = useOpenMediaBox();
  const mediaDirectory = useMediaDirectory();

  // Disconnected with the editor itself — see the note at the top of the file.
  const changeMedia = useCallback((m: { path: string; id: string }[]) => {
    setCurrentMedia(m[0]);
    onChange({
      target: {
        name,
        value: m[0],
      },
    });
  }, []);
  const showModal = useCallback(() => {
    openMediaBox(changeMedia, { type });
  }, [openMediaBox, changeMedia, type]);
  const clearMedia = useCallback(() => {
    setCurrentMedia(undefined);
    onChange({
      target: {
        name,
        value: undefined,
      },
    });
  }, [value]);
  return (
    <div className="flex flex-col gap-[8px]">
      <div className="text-[14px]">{label}</div>
      <div className="text-[12px]">{description}</div>
      {!!currentMedia && (
        <div className="my-[20px] cursor-pointer w-[200px] h-[200px] border-2 border-tableBorder">
          <img
            className="w-full h-full object-cover"
            src={currentMedia.path}
            onClick={() => window.open(mediaDirectory.set(currentMedia.path))}
          />
        </div>
      )}
      <div className="flex gap-[5px]">
        <Button onClick={showModal}>{t('select', 'Select')}</Button>
        <Button secondary={true} onClick={clearMedia}>
          {t('clear', 'Clear')}
        </Button>
      </div>
    </div>
  );
};
