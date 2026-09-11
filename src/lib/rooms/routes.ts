export function roomPath(roomId: string) {
  return `/rooms/${encodeURIComponent(roomId)}`;
}

export function roomDesignsPath(roomId: string) {
  return `${roomPath(roomId)}/designs`;
}

export function projectRoomPath(projectId: string, roomId: string) {
  return `/projects/${encodeURIComponent(projectId)}/rooms/${encodeURIComponent(roomId)}`;
}

export function projectRoomDesignsPath(projectId: string, roomId: string) {
  return `${projectRoomPath(projectId, roomId)}/designs`;
}

export function projectDesignsPath(projectId: string) {
  return `/projects/${encodeURIComponent(projectId)}/designs`;
}

export function projectDesignPath(
  projectId: string,
  designId: string,
  options?: { roomId?: string | null; screen?: string | null },
) {
  const params = new URLSearchParams();
  if (options?.roomId) params.set("room", options.roomId);
  if (options?.screen) params.set("screen", options.screen);
  const query = params.toString();
  const path = `${projectDesignsPath(projectId)}/${encodeURIComponent(designId)}`;
  return query ? `${path}?${query}` : path;
}

export function legacyDesignFilePath(roomId: string, fileKey: string, screen?: string | null) {
  const path = `/projects/${encodeURIComponent(roomId)}/project-files/${encodeURIComponent(fileKey)}`;
  return screen ? `${path}?screen=${encodeURIComponent(screen)}` : path;
}
