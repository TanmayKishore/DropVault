/**
 * In-process active upload tracking registry.
 * Tracks active uploads happening within the API node process.
 */
class ActiveUploadRegistry {
  private activeUploads: Set<string> = new Set();

  public register(fileId: string): void {
    this.activeUploads.add(fileId);
  }

  public unregister(fileId: string): void {
    this.activeUploads.delete(fileId);
  }

  public isActive(fileId: string): boolean {
    return this.activeUploads.has(fileId);
  }

  public getActiveCount(): number {
    return this.activeUploads.size;
  }
}

export const activeUploadRegistry = new ActiveUploadRegistry();
