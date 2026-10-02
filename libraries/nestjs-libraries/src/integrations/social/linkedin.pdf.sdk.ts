/**
 * Load the PDF converter on the first LinkedIn carousel with media.
 * Parallel first calls share the module load; each conversion keeps its own
 * images and stream. A failed load is cleared for a later independent call,
 * without retrying the operation that observed the failure.
 */
type ImageToPdf = typeof import('image-to-pdf');

let imageToPdfPromise: Promise<ImageToPdf> | undefined;

export const loadImageToPdf = (): Promise<ImageToPdf> =>
  (imageToPdfPromise ??= import('image-to-pdf').catch((error) => {
    imageToPdfPromise = undefined;
    throw error;
  }));
