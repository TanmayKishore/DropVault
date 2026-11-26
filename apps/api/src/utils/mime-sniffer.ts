import { fileTypeFromBuffer } from 'file-type';

export interface MimeSnifferResult {
  detectedMime: string;
  detectedExt?: string;
  isSafeForDirectServing: boolean;
}

const INLINE_EXECUTABLE_MIMES = [
  'text/html',
  'application/javascript',
  'application/x-javascript',
  'text/javascript',
  'image/svg+xml',
  'application/xml',
  'text/xml',
  'application/x-sh',
  'application/x-msdos-program',
  'application/x-executable',
];

export class MimeSniffer {
  /**
   * Sniffs magic bytes from the initial chunk of a file.
   * Limitations: Plaintext files (JSON, CSV, code) do not possess magic byte signatures.
   * Unknown/ambiguous types default to 'application/octet-stream'.
   */
  static async sniff(buffer: Buffer): Promise<MimeSnifferResult> {
    try {
      const fileType = await fileTypeFromBuffer(buffer);

      if (fileType) {
        const isInlineExecutable = INLINE_EXECUTABLE_MIMES.includes(fileType.mime);
        return {
          detectedMime: fileType.mime,
          detectedExt: fileType.ext,
          isSafeForDirectServing: !isInlineExecutable,
        };
      }
    } catch (err) {
      console.warn('[MimeSniffer] Error during byte sniffing:', err);
    }

    // Default safe fallback for unidentifiable or plaintext files
    return {
      detectedMime: 'application/octet-stream',
      isSafeForDirectServing: false,
    };
  }
}
