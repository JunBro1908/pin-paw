export interface PhotoSelectionItem {
  name: string;
  size: number;
  lastModified: number;
}

export interface PhotoSelectionResult<T extends PhotoSelectionItem> {
  files: T[];
  added: T[];
  rejected: number;
}

function photoKey(file: PhotoSelectionItem): string {
  return `${file.name}\u0000${file.size}\u0000${file.lastModified}`;
}

export function mergePhotoSelection<T extends PhotoSelectionItem>(
  existing: T[],
  incoming: T[],
  max: number
): PhotoSelectionResult<T> {
  const unique = [...existing, ...incoming].filter(
    (file, index, all) =>
      all.findIndex((candidate) => photoKey(candidate) === photoKey(file)) ===
      index
  );
  const files = unique.slice(0, Math.max(0, max));
  return {
    files,
    added: files.slice(existing.length),
    rejected: Math.max(0, unique.length - files.length),
  };
}
