"use client";

import {
  BookOpenText,
  Check,
  FilePenLine,
  LoaderCircle,
  MessageSquarePlus,
  Minus,
  Move,
  MousePointer2,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  findInspectNode,
  hitTestInspectNode,
  type InspectNode,
} from "@/lib/figma/inspect";
import {
  buildFigmaExplanationsUrl,
  FIGMA_EXPLANATION_CATEGORIES,
  FIGMA_EXPLANATION_CATEGORY_LABELS,
  toggleFigmaAuthoringMode,
  type FigmaAuthoringMode,
} from "@/lib/figma/explanation-contract";
import type {
  FigmaCommentRecord,
  FigmaExplanationCategory,
  FigmaExplanationRecord,
  FigmaExplanationStatus,
  FigmaImportResult,
  FigmaInteraction,
  FigmaScreen,
} from "@/lib/figma/types";

import {
  commentsUpdatedEvent,
  focusCommentEvent,
  focusExplanationEvent,
  notifyCommentsUpdated,
  notifyExplanationsUpdated,
} from "./events";

type Props = {
  projectKey: string;
  designId?: string;
  designVersionId?: string;
  file: FigmaImportResult["file"];
  screen: FigmaScreen;
  outgoing: FigmaInteraction[];
  screens: FigmaScreen[];
  onNavigate: (screenId: string) => void;
  inspectMode?: boolean;
  inspectTree?: InspectNode | null;
  selectedNodeId?: string | null;
  onSelectNode?: (node: InspectNode | null) => void;
  selectedHotspotIndex?: number | null;
  onSelectHotspot?: (index: number | null, interaction: FigmaInteraction | null) => void;
  readOnly?: boolean;
  initialExplanations?: FigmaExplanationRecord[];
};

const EMPTY_EXPLANATIONS: FigmaExplanationRecord[] = [];

export function InteractiveScreenCanvas({
  projectKey,
  designId,
  designVersionId,
  file,
  screen,
  outgoing,
  screens,
  onNavigate,
  inspectMode = false,
  inspectTree = null,
  selectedNodeId = null,
  onSelectNode,
  selectedHotspotIndex = null,
  onSelectHotspot,
  readOnly = false,
  initialExplanations = EMPTY_EXPLANATIONS,
}: Props) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [authoringMode, setAuthoringMode] = useState<FigmaAuthoringMode>(null);
  const [comments, setComments] = useState<FigmaCommentRecord[]>([]);
  const [draftPosition, setDraftPosition] = useState<{ x: number; y: number } | null>(null);
  const [draft, setDraft] = useState("");
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [savingComment, setSavingComment] = useState(false);
  const [explanations, setExplanations] = useState<FigmaExplanationRecord[]>([]);
  const [explanationPosition, setExplanationPosition] = useState<{ x: number; y: number } | null>(null);
  const [explanationSelection, setExplanationSelection] = useState<{ width: number; height: number } | null>(null);
  const [explanationSelectionPreview, setExplanationSelectionPreview] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [explanationNode, setExplanationNode] = useState<{ id: string; name: string } | null>(null);
  const [explanationDraft, setExplanationDraft] = useState({
    category: "intent" as FigmaExplanationCategory,
    title: "",
    body: "",
  });
  const [activeExplanationId, setActiveExplanationId] = useState<string | null>(null);
  const [editingExplanationId, setEditingExplanationId] = useState<string | null>(null);
  const [movingExplanationId, setMovingExplanationId] = useState<string | null>(null);
  const [deleteExplanationTarget, setDeleteExplanationTarget] = useState<FigmaExplanationRecord | null>(null);
  const [explanationError, setExplanationError] = useState<string | null>(null);
  const [savingExplanation, setSavingExplanation] = useState(false);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ pointerId: number; x: number; y: number; startX: number; startY: number; moved: boolean } | null>(null);
  const explanationSelectionDrag = useRef<{ pointerId: number; startX: number; startY: number; moved: boolean } | null>(null);
  const suppressExplanationClick = useRef(false);
  const didPanRef = useRef(false);
  const width = screen.width || 16;
  const height = screen.height || 10;
  const edgeMargin = 10;
  const pad = edgeMargin;
  const fitWidth = viewport.width > 0
    ? Math.max(1, Math.min(viewport.width - pad * 2, ((viewport.height - pad * 2) * width) / height))
    : Math.min(width, 800);
  const fitHeight = (fitWidth * height) / width;
  const minZoom = fitHeight > 0 && viewport.height > 0 && fitHeight >= viewport.height - edgeMargin * 2 - 1
    ? (viewport.height - edgeMargin * 2) / fitHeight
    : 1;
  const clampZoom = (value: number) => Math.min(4, Math.max(minZoom, value));
  const clampPan = (next: { x: number; y: number }, nextZoom = zoom) => {
    if (viewport.width <= 0 || viewport.height <= 0) return next;

    const scaledWidth = fitWidth * nextZoom;
    const scaledHeight = fitHeight * nextZoom;

    let x = next.x;
    if (scaledWidth <= viewport.width) {
      x = 0;
    } else {
      const minX = edgeMargin + scaledWidth / 2 - viewport.width / 2;
      const maxX = viewport.width / 2 - edgeMargin - scaledWidth / 2;
      x = Math.max(maxX, Math.min(minX, next.x));
    }

    const minY = edgeMargin + scaledHeight / 2 - viewport.height / 2;
    const maxY = viewport.height / 2 - edgeMargin - scaledHeight / 2;
    const y = Math.max(maxY, Math.min(minY, next.y));

    return { x, y };
  };
  const reset = () => { setZoom(1); setPan({ x: 0, y: 0 }); };
  const selectedNode = inspectTree && selectedNodeId ? findInspectNode(inspectTree, selectedNodeId) : null;
  const commentMode = authoringMode === "comment";
  const explainMode = authoringMode === "explain";

  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [screen.id]);

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    const update = () => {
      const rect = node.getBoundingClientRect();
      setViewport({ width: rect.width, height: rect.height });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (readOnly || !designVersionId) {
      setComments([]);
      return;
    }
    const query = new URLSearchParams({ projectKey, fileKey: file.key, screenId: screen.id, designVersionId });
    fetch(`/api/integrations/figma/comments?${query}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { comments?: FigmaCommentRecord[]; error?: string };
        if (!response.ok) throw new Error(payload.error || "Unable to load comments.");
        return payload.comments ?? [];
      })
      .then(setComments)
      .catch((reason: unknown) => setCommentError(reason instanceof Error ? reason.message : "Unable to load comments."));
  }, [designVersionId, file.key, projectKey, readOnly, screen.id]);

  useEffect(() => {
    if (readOnly || !designVersionId) {
      setExplanations(initialExplanations);
      setExplanationError(null);
      return;
    }
    fetch(buildFigmaExplanationsUrl(projectKey, file.key, screen.id, designVersionId), { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { explanations?: FigmaExplanationRecord[]; error?: string };
        if (!response.ok) throw new Error(payload.error || "Unable to load explanations.");
        return payload.explanations ?? [];
      })
      .then(setExplanations)
      .catch((reason: unknown) => setExplanationError(reason instanceof Error ? reason.message : "Unable to load explanations."));
  }, [designVersionId, file.key, initialExplanations, projectKey, readOnly, screen.id]);

  useEffect(() => {
    function focusComment(event: Event) {
      const detail = (event as CustomEvent<{ fileKey?: string; screenId?: string; commentId?: string }>).detail;
      if (detail?.fileKey === file.key && detail.screenId === screen.id && detail.commentId) {
        setDraftPosition(null);
        setActiveCommentId(detail.commentId);
      }
    }
    window.addEventListener(focusCommentEvent, focusComment);
    return () => window.removeEventListener(focusCommentEvent, focusComment);
  }, [file.key, screen.id]);

  useEffect(() => {
    function focusExplanation(event: Event) {
      const detail = (event as CustomEvent<{ fileKey?: string; screenId?: string; explanationId?: string }>).detail;
      if (detail?.fileKey === file.key && detail.screenId === screen.id && detail.explanationId) {
        setDraftPosition(null);
        setExplanationPosition(null);
        setActiveCommentId(null);
        setActiveExplanationId(detail.explanationId);
      }
    }
    window.addEventListener(focusExplanationEvent, focusExplanation);
    return () => window.removeEventListener(focusExplanationEvent, focusExplanation);
  }, [file.key, screen.id]);

  useEffect(() => {
    setZoom((current) => {
      const next = clampZoom(current);
      return next === current ? current : next;
    });
  }, [fitWidth, fitHeight, viewport.width, viewport.height, minZoom]);

  useEffect(() => {
    setPan((current) => {
      const next = clampPan(current);
      return next.x === current.x && next.y === current.y ? current : next;
    });
  }, [zoom, fitWidth, fitHeight, viewport.width, viewport.height]);

  function changeZoom(nextZoom: number) {
    const z = clampZoom(nextZoom);
    setZoom(z);
    setPan((current) => clampPan(current, z));
  }

  function handleWheel(event: React.WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    // ⌘/Ctrl + scroll zooms; plain scroll pans so tall/zoomed frames can move up and down.
    if (event.ctrlKey || event.metaKey) {
      changeZoom(zoom * (event.deltaY < 0 ? 1.04 : 0.96));
      return;
    }
    const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? fitHeight : 1;
    setPan((current) => clampPan({
      x: current.x - event.deltaX * scale,
      y: current.y - event.deltaY * scale,
    }));
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (authoringMode) return;
    if ((event.target as HTMLElement).closest("[data-hotspot], [data-viewer-control], [data-comment-pin], [data-comment-composer], [data-explanation-pin], [data-explanation-composer]")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    didPanRef.current = false;
    drag.current = {
      pointerId: event.pointerId,
      x: pan.x,
      y: pan.y,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.current.startX;
    const dy = event.clientY - drag.current.startY;
    if (!drag.current.moved && Math.hypot(dx, dy) < 4) return;
    drag.current.moved = true;
    didPanRef.current = true;
    setPan(clampPan({ x: drag.current.x + dx, y: drag.current.y + dy }));
  }

  function stopDragging(event: React.PointerEvent<HTMLDivElement>) {
    if (drag.current?.pointerId === event.pointerId) drag.current = null;
  }

  function placeComment(event: React.MouseEvent<HTMLDivElement>) {
    if (!commentMode || didPanRef.current || (event.target as HTMLElement).closest("[data-comment-pin], [data-comment-composer]")) return;
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    setDraftPosition({
      x: Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100)),
      y: Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100)),
    });
    setDraft("");
    setActiveCommentId(null);
    setCommentError(null);
  }

  function positionFromClick(event: React.MouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100)),
      y: Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100)),
    };
  }

  function beginExplanation(
    position: { x: number; y: number },
    node: { id: string; name: string } | null,
    selection: { width: number; height: number } | null,
  ) {
    setExplanationPosition(position);
    setExplanationSelection(selection);
    setExplanationNode(node);
    setExplanationDraft({ category: "intent", title: "", body: "" });
    setDraftPosition(null);
    setActiveCommentId(null);
    setActiveExplanationId(null);
    setEditingExplanationId(null);
    setExplanationError(null);
  }

  async function placeExplanation(event: React.MouseEvent<HTMLDivElement>) {
    if (!explainMode || didPanRef.current || (event.target as HTMLElement).closest("[data-explanation-pin], [data-explanation-composer]")) return;
    event.stopPropagation();
    if (suppressExplanationClick.current) {
      suppressExplanationClick.current = false;
      return;
    }
    const position = positionFromClick(event);
    if (movingExplanationId) {
      const moving = explanations.find((item) => item.id === movingExplanationId);
      const horizontalInset = (moving?.selectionWidth ?? 0) / 2;
      const verticalInset = (moving?.selectionHeight ?? 0) / 2;
      const updated = await patchExplanation(movingExplanationId, {
        x: Math.max(horizontalInset, Math.min(100 - horizontalInset, position.x)),
        y: Math.max(verticalInset, Math.min(100 - verticalInset, position.y)),
      });
      if (updated) {
        setMovingExplanationId(null);
        setAuthoringMode(null);
        setActiveExplanationId(updated.id);
      }
      return;
    }
    const clickedNode = inspectTree && screen.width && screen.height
      ? hitTestInspectNode(inspectTree, (position.x / 100) * screen.width, (position.y / 100) * screen.height)
      : null;
    if (clickedNode && screen.width && screen.height && clickedNode.width > 0 && clickedNode.height > 0) {
      const left = Math.max(0, clickedNode.x);
      const top = Math.max(0, clickedNode.y);
      const right = Math.min(screen.width, clickedNode.x + clickedNode.width);
      const bottom = Math.min(screen.height, clickedNode.y + clickedNode.height);
      const widthPercent = ((right - left) / screen.width) * 100;
      const heightPercent = ((bottom - top) / screen.height) * 100;
      beginExplanation(
        { x: ((left + right) / 2 / screen.width) * 100, y: ((top + bottom) / 2 / screen.height) * 100 },
        { id: clickedNode.id, name: clickedNode.name },
        { width: widthPercent, height: heightPercent },
      );
      return;
    }
    beginExplanation(position, null, null);
  }

  function explanationPointerPosition(event: React.PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100)),
      y: Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100)),
    };
  }

  function startExplanationSelection(event: React.PointerEvent<HTMLDivElement>) {
    if (!explainMode || movingExplanationId || event.button !== 0) return;
    if ((event.target as HTMLElement).closest("[data-explanation-pin], [data-explanation-composer]")) return;
    event.stopPropagation();
    const start = explanationPointerPosition(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    explanationSelectionDrag.current = { pointerId: event.pointerId, startX: start.x, startY: start.y, moved: false };
  }

  function updateExplanationSelection(event: React.PointerEvent<HTMLDivElement>) {
    const selectionDrag = explanationSelectionDrag.current;
    if (!selectionDrag || selectionDrag.pointerId !== event.pointerId) return;
    const position = explanationPointerPosition(event);
    const rect = event.currentTarget.getBoundingClientRect();
    const dx = ((position.x - selectionDrag.startX) / 100) * rect.width;
    const dy = ((position.y - selectionDrag.startY) / 100) * rect.height;
    if (!selectionDrag.moved && Math.hypot(dx, dy) < 4) return;
    selectionDrag.moved = true;
    const left = Math.min(selectionDrag.startX, position.x);
    const top = Math.min(selectionDrag.startY, position.y);
    setExplanationSelectionPreview({
      x: left,
      y: top,
      width: Math.abs(position.x - selectionDrag.startX),
      height: Math.abs(position.y - selectionDrag.startY),
    });
  }

  function finishExplanationSelection(event: React.PointerEvent<HTMLDivElement>) {
    const selectionDrag = explanationSelectionDrag.current;
    if (!selectionDrag || selectionDrag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    explanationSelectionDrag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const position = explanationPointerPosition(event);
    const preview = {
      x: Math.min(selectionDrag.startX, position.x),
      y: Math.min(selectionDrag.startY, position.y),
      width: Math.abs(position.x - selectionDrag.startX),
      height: Math.abs(position.y - selectionDrag.startY),
    };
    setExplanationSelectionPreview(null);
    if (!selectionDrag.moved || preview.width <= 0 || preview.height <= 0) return;
    suppressExplanationClick.current = true;
    window.setTimeout(() => {
      suppressExplanationClick.current = false;
    }, 0);
    beginExplanation(
      { x: preview.x + preview.width / 2, y: preview.y + preview.height / 2 },
      null,
      { width: preview.width, height: preview.height },
    );
  }

  function cancelExplanationSelection(event: React.PointerEvent<HTMLDivElement>) {
    if (explanationSelectionDrag.current?.pointerId !== event.pointerId) return;
    explanationSelectionDrag.current = null;
    setExplanationSelectionPreview(null);
  }

  function handleInspectClick(event: React.MouseEvent<HTMLDivElement>) {
    if (!inspectMode || !inspectTree || !onSelectNode || didPanRef.current) return;
    if ((event.target as HTMLElement).closest("[data-viewer-control], [data-comment-pin], [data-comment-composer], [data-explanation-pin], [data-explanation-composer]")) return;
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * width;
    const y = ((event.clientY - rect.top) / rect.height) * height;
    onSelectNode(hitTestInspectNode(inspectTree, x, y));
  }

  async function saveComment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draftPosition || !draft.trim() || savingComment) return;
    setSavingComment(true);
    setCommentError(null);
    try {
      const response = await fetch("/api/integrations/figma/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectKey,
          designVersionId,
          fileKey: file.key,
          fileName: file.name,
          screenId: screen.id,
          screenName: screen.name,
          x: draftPosition.x,
          y: draftPosition.y,
          body: draft,
        }),
      });
      const payload = await response.json() as FigmaCommentRecord | { error?: string };
      if (!response.ok || !("body" in payload)) throw new Error("error" in payload && payload.error ? payload.error : "Unable to save comment.");
      setComments((current) => [...current, payload]);
      setDraftPosition(null);
      setDraft("");
      setActiveCommentId(null);
      notifyCommentsUpdated(file.key, screen.id);
    } catch (reason) {
      setCommentError(reason instanceof Error ? reason.message : "Unable to save comment.");
    } finally {
      setSavingComment(false);
    }
  }

  async function setCommentStatus(comment: FigmaCommentRecord, status: "open" | "resolved") {
    setCommentError(null);
    const response = await fetch("/api/integrations/figma/comments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectKey, id: comment.id, status }),
    });
    const payload = await response.json() as FigmaCommentRecord | { error?: string };
    if (!response.ok || !("body" in payload)) return setCommentError("error" in payload && payload.error ? payload.error : "Unable to update comment.");
    setComments((current) => current.map((item) => (item.id === payload.id ? payload : item)));
    notifyCommentsUpdated(file.key, screen.id);
  }

  async function deleteComment(comment: FigmaCommentRecord) {
    setCommentError(null);
    const response = await fetch("/api/integrations/figma/comments", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectKey, id: comment.id }),
    });
    const payload = await response.json() as { deleted?: boolean; error?: string };
    if (!response.ok) return setCommentError(payload.error || "Unable to delete comment.");
    setComments((current) => current.filter((item) => item.id !== comment.id));
    setActiveCommentId(null);
    notifyCommentsUpdated(file.key, screen.id);
  }

  async function patchExplanation(
    id: string,
    changes: Partial<Pick<FigmaExplanationRecord, "title" | "body" | "category" | "x" | "y" | "status">>,
  ) {
    setSavingExplanation(true);
    setExplanationError(null);
    try {
      const response = await fetch("/api/integrations/figma/explanations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectKey, id, ...changes }),
      });
      const payload = await response.json() as FigmaExplanationRecord | { error?: string };
      if (!response.ok || !("title" in payload)) {
        throw new Error("error" in payload && payload.error ? payload.error : "Unable to update explanation.");
      }
      setExplanations((current) => current.map((item) => item.id === payload.id ? payload : item));
      notifyExplanationsUpdated(file.key, screen.id);
      return payload;
    } catch (reason) {
      setExplanationError(reason instanceof Error ? reason.message : "Unable to update explanation.");
      return null;
    } finally {
      setSavingExplanation(false);
    }
  }

  async function saveNewExplanation(status: FigmaExplanationStatus) {
    if (!explanationPosition || !explanationDraft.title.trim() || !explanationDraft.body.trim() || savingExplanation) return;
    setSavingExplanation(true);
    setExplanationError(null);
    try {
      const response = await fetch("/api/integrations/figma/explanations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectKey,
          designId,
          designVersionId,
          fileKey: file.key,
          fileName: file.name,
          screenId: screen.id,
          screenName: screen.name,
          figmaNodeId: explanationNode?.id ?? null,
          figmaNodeName: explanationNode?.name ?? null,
          x: explanationPosition.x,
          y: explanationPosition.y,
          selectionWidth: explanationSelection?.width ?? null,
          selectionHeight: explanationSelection?.height ?? null,
          category: explanationDraft.category,
          title: explanationDraft.title,
          body: explanationDraft.body,
          status,
        }),
      });
      const payload = await response.json() as FigmaExplanationRecord | { error?: string };
      if (!response.ok || !("title" in payload)) {
        throw new Error("error" in payload && payload.error ? payload.error : "Unable to save explanation.");
      }
      setExplanations((current) => [...current, payload]);
      setExplanationPosition(null);
      setExplanationSelection(null);
      setExplanationNode(null);
      setActiveExplanationId(payload.id);
      setAuthoringMode(null);
      notifyExplanationsUpdated(file.key, screen.id);
    } catch (reason) {
      setExplanationError(reason instanceof Error ? reason.message : "Unable to save explanation.");
    } finally {
      setSavingExplanation(false);
    }
  }

  async function saveExplanationEdits(explanation: FigmaExplanationRecord) {
    const updated = await patchExplanation(explanation.id, {
      category: explanationDraft.category,
      title: explanationDraft.title,
      body: explanationDraft.body,
    });
    if (updated) setEditingExplanationId(null);
  }

  function beginExplanationEdit(explanation: FigmaExplanationRecord) {
    setExplanationDraft({
      category: explanation.category,
      title: explanation.title,
      body: explanation.body,
    });
    setEditingExplanationId(explanation.id);
  }

  async function deleteExplanation(explanation: FigmaExplanationRecord) {
    setSavingExplanation(true);
    setExplanationError(null);
    try {
      const response = await fetch("/api/integrations/figma/explanations", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectKey, id: explanation.id }),
      });
      const payload = await response.json() as { deleted?: boolean; error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to delete explanation.");
      setExplanations((current) => current.filter((item) => item.id !== explanation.id));
      setActiveExplanationId(null);
      setEditingExplanationId(null);
      setDeleteExplanationTarget(null);
      notifyExplanationsUpdated(file.key, screen.id);
    } catch (reason) {
      setExplanationError(reason instanceof Error ? reason.message : "Unable to delete explanation.");
    } finally {
      setSavingExplanation(false);
    }
  }

  const hint = commentMode
    ? "Click the design to place a comment"
    : explainMode
      ? movingExplanationId
        ? "Click the design to move this explanation"
        : "Click an element or drag a box to explain an area"
    : inspectMode
      ? "Scroll or drag to pan · ⌘/Ctrl+scroll to zoom · click a layer"
      : readOnly
        ? "Read-only snapshot · drag to pan · click hotspots and notes"
        : "Scroll or drag to pan · ⌘/Ctrl+scroll to zoom · click hotspots";

  return (
    <div
      ref={viewportRef}
      className="relative flex h-full min-h-0 touch-none select-none items-center justify-center overflow-hidden overscroll-none bg-[#dfe2dc]"
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={stopDragging}
      onPointerCancel={stopDragging}
    >
      <div data-viewer-control className="absolute left-3 top-3 z-30 flex items-center gap-1 rounded-xl border border-black/10 bg-white/95 p-1 shadow-lg backdrop-blur">
        <button type="button" aria-label="Zoom Out" onClick={() => changeZoom(zoom / 1.08)} className="flex size-8 items-center justify-center rounded-lg text-black/60 hover:bg-black/5"><Minus className="size-4" /></button>
        <span className="w-12 text-center text-[10px] font-semibold tabular-nums text-black/60">{Math.round(zoom * 100)}%</span>
        <button type="button" aria-label="Zoom in" onClick={() => changeZoom(zoom * 1.08)} className="flex size-8 items-center justify-center rounded-lg text-black/60 hover:bg-black/5"><Plus className="size-4" /></button>
        <button type="button" aria-label="Reset View" onClick={reset} className="flex size-8 items-center justify-center rounded-lg text-black/60 hover:bg-black/5"><RotateCcw className="size-3.5" /></button>
        {!readOnly && (
          <>
            <span className="mx-1 h-5 w-px bg-black/10" />
            <button
              type="button"
              aria-pressed={commentMode}
              onClick={() => {
                setAuthoringMode((current) => toggleFigmaAuthoringMode(current, "comment"));
                setDraftPosition(null);
                setExplanationPosition(null);
                setExplanationSelection(null);
                setMovingExplanationId(null);
                setActiveCommentId(null);
                setActiveExplanationId(null);
              }}
              className={`flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[10px] font-semibold transition ${commentMode ? "bg-[#7c6cf0] text-white" : "text-black/60 hover:bg-black/5"}`}
            >
              <MessageSquarePlus className="size-3.5" />Comment
            </button>
            <span className="rounded-md bg-black/5 px-1.5 py-1 text-[9px] font-bold text-black/45">{comments.filter((item) => item.status === "open").length}</span>
            <button
              type="button"
              aria-pressed={explainMode}
              onClick={() => {
                setAuthoringMode((current) => toggleFigmaAuthoringMode(current, "explain"));
                setDraftPosition(null);
                setExplanationPosition(null);
                setExplanationSelection(null);
                setMovingExplanationId(null);
                setActiveCommentId(null);
                setActiveExplanationId(null);
              }}
              className={`flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[10px] font-semibold transition ${explainMode ? "bg-[#16857a] text-white" : "text-black/60 hover:bg-black/5"}`}
            >
              <BookOpenText className="size-3.5" />Explain
            </button>
            <span className="rounded-md bg-black/5 px-1.5 py-1 text-[9px] font-bold text-black/45">{explanations.length}</span>
          </>
        )}
      </div>
      <div className="pointer-events-none absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full bg-black/70 px-3 py-1.5 text-[9px] font-medium text-white/80 backdrop-blur">
        <MousePointer2 className="size-3" />{hint}
      </div>
      {(commentError || explanationError) && <div data-viewer-control role="alert" className="absolute right-3 top-3 z-40 max-w-xs rounded-xl bg-[#2e2654] px-3 py-2 text-[10px] text-white shadow-lg">{commentError || explanationError}</div>}
      {screen.imageUrl ? (
        <div
          role="img"
          aria-label={`Interactive preview of ${screen.name}`}
          onClick={(event) => {
            if (commentMode) placeComment(event);
            else if (explainMode) void placeExplanation(event);
            else if (inspectMode) handleInspectClick(event);
          }}
          onPointerDown={startExplanationSelection}
          onPointerMove={updateExplanationSelection}
          onPointerUp={finishExplanationSelection}
          onPointerCancel={cancelExplanationSelection}
          className={`relative shrink-0 bg-white bg-[length:100%_100%] bg-center bg-no-repeat shadow-xl ${authoringMode || inspectMode ? "cursor-crosshair" : "cursor-grab"} ${!authoringMode ? "active:cursor-grabbing" : ""}`}
          style={{
            aspectRatio: `${width} / ${height}`,
            backgroundImage: `url(${JSON.stringify(screen.imageUrl).slice(1, -1)})`,
            width: fitWidth,
            height: fitHeight,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "center center",
          }}
        >
          {selectedNode && screen.width && screen.height && (
            <div
              className="pointer-events-none absolute z-30 border-2 border-[#7c6cf0] shadow-[0_0_0_1px_rgba(255,255,255,.8)]"
              style={{
                left: `${(selectedNode.x / screen.width) * 100}%`,
                top: `${(selectedNode.y / screen.height) * 100}%`,
                width: `${(selectedNode.width / screen.width) * 100}%`,
                height: `${(selectedNode.height / screen.height) * 100}%`,
              }}
            >
              <span className="absolute -top-5 left-0 whitespace-nowrap rounded bg-[#7c6cf0] px-1.5 py-0.5 text-[8px] font-bold text-white">
                {Math.round(selectedNode.width)} × {Math.round(selectedNode.height)}
              </span>
            </div>
          )}
          {explanationSelectionPreview && (
            <div
              className="pointer-events-none absolute z-30 border-2 border-dashed border-[#16857a] bg-[#16857a]/10 shadow-[0_0_0_1px_rgba(255,255,255,.8)]"
              style={{
                left: `${explanationSelectionPreview.x}%`,
                top: `${explanationSelectionPreview.y}%`,
                width: `${explanationSelectionPreview.width}%`,
                height: `${explanationSelectionPreview.height}%`,
              }}
            />
          )}
          {explanationPosition && explanationSelection && (
            <div
              className="pointer-events-none absolute z-30 border-2 border-dashed border-[#16857a] bg-[#16857a]/10 shadow-[0_0_0_1px_rgba(255,255,255,.8)]"
              style={{
                left: `${explanationPosition.x - explanationSelection.width / 2}%`,
                top: `${explanationPosition.y - explanationSelection.height / 2}%`,
                width: `${explanationSelection.width}%`,
                height: `${explanationSelection.height}%`,
              }}
            />
          )}
          {explanations.map((explanation) => explanation.selectionWidth && explanation.selectionHeight ? (
            <div
              key={`selection-${explanation.id}`}
              className={`pointer-events-none absolute z-30 border-2 bg-[#16857a]/8 shadow-[0_0_0_1px_rgba(255,255,255,.75)] ${activeExplanationId === explanation.id ? "border-[#16857a]" : "border-dashed border-[#16857a]/70"}`}
              style={{
                left: `${explanation.x - explanation.selectionWidth / 2}%`,
                top: `${explanation.y - explanation.selectionHeight / 2}%`,
                width: `${explanation.selectionWidth}%`,
                height: `${explanation.selectionHeight}%`,
              }}
            />
          ) : null)}
          {!inspectMode && outgoing.map((interaction, index) => {
            const bounds = interaction.sourceBounds;
            if (!bounds || screen.x === null || screen.y === null || !screen.width || !screen.height) return null;
            const left = Math.max(0, Math.min(100, ((bounds.x - screen.x) / screen.width) * 100));
            const top = Math.max(0, Math.min(100, ((bounds.y - screen.y) / screen.height) * 100));
            const hotspotWidth = Math.max(2.5, Math.min(100 - left, (bounds.width / screen.width) * 100));
            const hotspotHeight = Math.max(2.5, Math.min(100 - top, (bounds.height / screen.height) * 100));
            const destination = screens.find((item) => item.id === interaction.destinationScreenId);
            const selected = selectedHotspotIndex === index;
            return (
              <button
                data-hotspot
                type="button"
                disabled={!destination || Boolean(authoringMode)}
                key={`${interaction.sourceNodeId}-${index}`}
                title={`${interaction.sourceNodeName} → ${destination?.name || interaction.destinationScreenId || "No destination"}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectHotspot?.(index, interaction);
                  if (destination && !inspectMode) onNavigate(destination.id);
                }}
                className={`group absolute z-20 min-h-6 min-w-6 cursor-pointer rounded border-2 bg-[#7c6cf0]/15 shadow-[0_0_0_2px_rgba(255,255,255,.65)] transition hover:bg-[#7c6cf0]/30 disabled:cursor-not-allowed ${authoringMode ? "pointer-events-none opacity-35" : ""} ${selected ? "border-[#6354d4] ring-2 ring-[#7c6cf0]/40" : "border-[#7c6cf0]"}`}
                style={{ left: `${left}%`, top: `${top}%`, width: `${hotspotWidth}%`, height: `${hotspotHeight}%` }}
              >
                <span className="absolute -right-2 -top-2 flex size-5 items-center justify-center rounded-full bg-[#6354d4] text-[9px] font-bold text-white shadow">{index + 1}</span>
                <span className="pointer-events-none absolute left-1/2 top-full mt-2 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-black/85 px-2 py-1 text-[9px] font-semibold text-white shadow-lg group-hover:block">
                  {destination?.name || "Destination unavailable"}
                </span>
              </button>
            );
          })}
          {explanations.map((explanation, index) => (
            <div
              data-explanation-pin
              key={explanation.id}
              className="absolute z-40"
              style={{ left: `${explanation.x}%`, top: `${explanation.y}%`, transform: `translate(-50%, -50%) scale(${1 / zoom})` }}
            >
              <button
                type="button"
                aria-label={`Open explanation ${index + 1}`}
                onClick={(event) => {
                  event.stopPropagation();
                  setDraftPosition(null);
                  setExplanationPosition(null);
                  setExplanationSelection(null);
                  setActiveCommentId(null);
                  setEditingExplanationId(null);
                  setActiveExplanationId((current) => current === explanation.id ? null : explanation.id);
                }}
                className={`relative flex size-8 items-center justify-center rounded-lg border-2 border-white text-white shadow-lg ${explanation.status === "draft" ? "bg-[#52706b] ring-2 ring-dashed ring-[#f3c56f]" : "bg-[#16857a]"}`}
              >
                <BookOpenText className="size-4" />
                <span className="absolute -right-2 -top-2 flex size-4 items-center justify-center rounded-full bg-[#0f4f49] text-[8px] font-bold">{index + 1}</span>
              </button>
              {activeExplanationId === explanation.id && (
                <div
                  data-explanation-composer
                  onClick={(event) => event.stopPropagation()}
                  className="absolute left-10 top-0 w-72 rounded-2xl border border-black/10 bg-white p-3 text-left text-black shadow-2xl"
                >
                  {editingExplanationId === explanation.id ? (
                    <>
                      <ExplanationFields value={explanationDraft} onChange={setExplanationDraft} />
                      <div className="mt-2 flex justify-end gap-2">
                        <button type="button" onClick={() => setEditingExplanationId(null)} className="rounded-lg px-2 py-1.5 text-[9px] font-semibold text-black/45">Cancel</button>
                        <button
                          type="button"
                          disabled={savingExplanation || !explanationDraft.title.trim() || !explanationDraft.body.trim()}
                          onClick={() => void saveExplanationEdits(explanation)}
                          className="rounded-lg bg-[#16857a] px-3 py-1.5 text-[9px] font-semibold text-white disabled:opacity-40"
                        >
                          {savingExplanation ? "Saving…" : "Save changes"}
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[9px] font-bold uppercase tracking-wide text-[#16857a]">{FIGMA_EXPLANATION_CATEGORY_LABELS[explanation.category]}</p>
                          <h3 className="mt-1 text-[12px] font-semibold leading-4">{explanation.title}</h3>
                        </div>
                        <span className={`rounded-md px-1.5 py-1 text-[8px] font-bold uppercase ${explanation.status === "draft" ? "bg-[#fff4d8] text-[#76500b]" : "bg-[#dff3ef] text-[#0f665d]"}`}>{explanation.status}</span>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-[11px] leading-5 text-black/70">{explanation.body}</p>
                      {explanation.figmaNodeName && <p className="mt-2 truncate font-mono text-[8px] text-black/35">Layer: {explanation.figmaNodeName}</p>}
                      <p className="mt-2 text-[9px] text-black/35">{explanation.authorName} · {new Date(explanation.updatedAt).toLocaleString()}</p>
                      {(explanation.canEdit || explanation.canMoveToDraft) && (
                        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-black/8 pt-2">
                          {explanation.canEdit && <button type="button" onClick={() => beginExplanationEdit(explanation)} className="flex items-center gap-1 rounded-lg bg-black/5 px-2 py-1.5 text-[9px] font-semibold"><FilePenLine className="size-3" />Edit</button>}
                          {explanation.canEdit && (
                            <button
                              type="button"
                              onClick={() => {
                                setMovingExplanationId(explanation.id);
                                setAuthoringMode("explain");
                                setActiveExplanationId(null);
                              }}
                              className="flex items-center gap-1 rounded-lg bg-black/5 px-2 py-1.5 text-[9px] font-semibold"
                            >
                              <Move className="size-3" />Move
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={savingExplanation}
                            onClick={() => void patchExplanation(explanation.id, { status: explanation.canMoveToDraft ? "draft" : "published" })}
                            className="rounded-lg bg-[#dff3ef] px-2 py-1.5 text-[9px] font-semibold text-[#0f665d]"
                          >
                            {explanation.canMoveToDraft ? "Move to draft" : "Publish"}
                          </button>
                          {explanation.canEdit && <button type="button" disabled={savingExplanation} onClick={() => setDeleteExplanationTarget(explanation)} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[9px] font-semibold text-[#b23b35] hover:bg-[#fff0ee]"><Trash2 className="size-3" />Delete</button>}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
          {comments.map((comment, index) => (
            <div data-comment-pin key={comment.id} className="absolute z-40" style={{ left: `${comment.x}%`, top: `${comment.y}%`, transform: `translate(-50%, -50%) scale(${1 / zoom})` }}>
              <button
                type="button"
                aria-label={`Open comment ${index + 1}`}
                onClick={(event) => {
                  event.stopPropagation();
                  setDraftPosition(null);
                  setActiveCommentId((current) => (current === comment.id ? null : comment.id));
                }}
                className={`flex size-7 items-center justify-center rounded-full border-2 border-white text-[10px] font-bold text-white shadow-lg ${comment.status === "resolved" ? "bg-[#63706c]" : "bg-[#ef5da8]"}`}
              >
                {index + 1}
              </button>
              {activeCommentId === comment.id && (
                <div className="absolute left-9 top-0 w-64 rounded-2xl border border-black/10 bg-white p-3 text-left text-black shadow-2xl">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[10px] font-semibold">{comment.authorName}</p>
                      <p className="mt-0.5 text-[9px] text-black/35">{new Date(comment.createdAt).toLocaleString()}</p>
                    </div>
                    <span className={`rounded-md px-1.5 py-1 text-[8px] font-bold uppercase ${comment.status === "resolved" ? "bg-[#e4dffc] text-[#6354d4]" : "bg-[#ffe8f4] text-[#a52b69]"}`}>{comment.status}</span>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-[11px] leading-5 text-black/70">{comment.body}</p>
                  <div className="mt-3 flex gap-2 border-t border-black/8 pt-2">
                    <button type="button" onClick={() => setCommentStatus(comment, comment.status === "open" ? "resolved" : "open")} className="flex items-center gap-1 rounded-lg bg-black/5 px-2 py-1.5 text-[9px] font-semibold">
                      <Check className="size-3" />{comment.status === "open" ? "Resolve" : "Reopen"}
                    </button>
                    <button type="button" aria-label="Delete Comment" onClick={() => deleteComment(comment)} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[9px] font-semibold text-[#b23b35] hover:bg-[#fff0ee]">
                      <Trash2 className="size-3" />Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {draftPosition && (
            <form
              data-comment-composer
              onSubmit={saveComment}
              onClick={(event) => event.stopPropagation()}
              className="absolute z-50 w-64 rounded-2xl border border-black/10 bg-white p-3 text-black shadow-2xl"
              style={{ left: `${draftPosition.x}%`, top: `${draftPosition.y}%`, transform: `translate(12px, 12px) scale(${1 / zoom})`, transformOrigin: "top left" }}
            >
              <label htmlFor="handoff-new-comment" className="text-[10px] font-semibold">Add a comment</label>
              <textarea
                id="handoff-new-comment"
                autoFocus
                rows={3}
                maxLength={2000}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="What should change or be clarified?"
                className="mt-2 w-full resize-none rounded-xl border border-black/10 bg-[#f7f7f4] px-3 py-2 text-[11px] leading-5 outline-none focus:border-[#7c6cf0]/60"
              />
              <div className="mt-2 flex justify-end gap-2">
                <button type="button" onClick={() => setDraftPosition(null)} className="rounded-lg px-2.5 py-1.5 text-[9px] font-semibold text-black/45">Cancel</button>
                <button type="submit" disabled={!draft.trim() || savingComment} className="rounded-lg bg-[#7c6cf0] px-3 py-1.5 text-[9px] font-semibold text-white disabled:opacity-40">
                  {savingComment ? "Saving…" : "Post Comment"}
                </button>
              </div>
            </form>
          )}
          {explanationPosition && (
            <div
              data-explanation-composer
              onClick={(event) => event.stopPropagation()}
              className="absolute z-50 w-72 rounded-2xl border border-black/10 bg-white p-3 text-black shadow-2xl"
              style={{ left: `${explanationPosition.x}%`, top: `${explanationPosition.y}%`, transform: `translate(12px, 12px) scale(${1 / zoom})`, transformOrigin: "top left" }}
            >
              <p className="text-[10px] font-semibold">Explain this design decision</p>
              <p className="mt-1 truncate font-mono text-[8px] text-black/35">
                {explanationNode ? `Attached to ${explanationNode.name}` : explanationSelection ? "Attached to selected area" : "Attached to selected point"}
              </p>
              <div className="mt-2">
                <ExplanationFields value={explanationDraft} onChange={setExplanationDraft} autoFocus />
              </div>
              <div className="mt-2 flex justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setExplanationPosition(null);
                    setExplanationSelection(null);
                    setExplanationNode(null);
                  }}
                  className="rounded-lg px-2 py-1.5 text-[9px] font-semibold text-black/45"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={savingExplanation || !explanationDraft.title.trim() || !explanationDraft.body.trim()}
                  onClick={() => void saveNewExplanation("draft")}
                  className="rounded-lg border border-[#16857a]/25 px-2 py-1.5 text-[9px] font-semibold text-[#0f665d] disabled:opacity-40"
                >
                  Save as draft
                </button>
                <button
                  type="button"
                  disabled={savingExplanation || !explanationDraft.title.trim() || !explanationDraft.body.trim()}
                  onClick={() => void saveNewExplanation("published")}
                  className="rounded-lg bg-[#16857a] px-2.5 py-1.5 text-[9px] font-semibold text-white disabled:opacity-40"
                >
                  Publish
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-black/35">Preview unavailable</p>
      )}
      <AlertDialog
        open={Boolean(deleteExplanationTarget)}
        onOpenChange={(open) => !open && setDeleteExplanationTarget(null)}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-[#fff1eb] text-[#a14428]">
              <Trash2 className="size-5" />
            </AlertDialogMedia>
            <AlertDialogTitle>Delete explanation?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes “{deleteExplanationTarget?.title}” from this design screen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={savingExplanation}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={savingExplanation || !deleteExplanationTarget}
              onClick={() => deleteExplanationTarget && void deleteExplanation(deleteExplanationTarget)}
            >
              {savingExplanation ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ExplanationFields({
  value,
  onChange,
  autoFocus = false,
}: {
  value: { category: FigmaExplanationCategory; title: string; body: string };
  onChange: (value: { category: FigmaExplanationCategory; title: string; body: string }) => void;
  autoFocus?: boolean;
}) {
  return (
    <div className="space-y-2">
      <label className="block">
        <span className="text-[9px] font-semibold text-black/50">Category</span>
        <select
          value={value.category}
          onChange={(event) => onChange({ ...value, category: event.target.value as FigmaExplanationCategory })}
          className="mt-1 h-8 w-full rounded-lg border border-black/10 bg-[#f7f7f4] px-2 text-[10px] outline-none focus:border-[#16857a]/60"
        >
          {FIGMA_EXPLANATION_CATEGORIES.map((category) => (
            <option key={category} value={category}>{FIGMA_EXPLANATION_CATEGORY_LABELS[category]}</option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-[9px] font-semibold text-black/50">Title</span>
        <input
          autoFocus={autoFocus}
          maxLength={120}
          value={value.title}
          onChange={(event) => onChange({ ...value, title: event.target.value })}
          placeholder="What implementers need to know"
          className="mt-1 h-8 w-full rounded-lg border border-black/10 bg-[#f7f7f4] px-2 text-[10px] outline-none focus:border-[#16857a]/60"
        />
      </label>
      <label className="block">
        <span className="text-[9px] font-semibold text-black/50">Explanation</span>
        <textarea
          rows={4}
          maxLength={4000}
          value={value.body}
          onChange={(event) => onChange({ ...value, body: event.target.value })}
          placeholder="Document intent, behavior, content, data, or edge cases."
          className="mt-1 w-full resize-none rounded-lg border border-black/10 bg-[#f7f7f4] px-2 py-1.5 text-[10px] leading-4 outline-none focus:border-[#16857a]/60"
        />
      </label>
    </div>
  );
}

export function ScreenCommentsPanel({
  projectKey,
  designVersionId,
  file,
  screen,
}: {
  projectKey: string;
  designVersionId: string;
  file: FigmaImportResult["file"];
  screen: FigmaScreen;
}) {
  const [comments, setComments] = useState<FigmaCommentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadComments() {
      try {
        const query = new URLSearchParams({ projectKey, fileKey: file.key, screenId: screen.id, designVersionId });
        const response = await fetch(`/api/integrations/figma/comments?${query}`, { cache: "no-store" });
        const payload = await response.json() as { comments?: FigmaCommentRecord[]; error?: string };
        if (!response.ok) throw new Error(payload.error || "Unable to load comments.");
        if (active) {
          setComments(payload.comments ?? []);
          setError(null);
        }
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Unable to load comments.");
      } finally {
        if (active) setLoading(false);
      }
    }
    function commentsChanged(event: Event) {
      const detail = (event as CustomEvent<{ fileKey?: string; screenId?: string }>).detail;
      if (detail?.fileKey === file.key && detail.screenId === screen.id) void loadComments();
    }
    void loadComments();
    window.addEventListener(commentsUpdatedEvent, commentsChanged);
    return () => {
      active = false;
      window.removeEventListener(commentsUpdatedEvent, commentsChanged);
    };
  }, [designVersionId, file.key, projectKey, screen.id]);

  const openCount = comments.filter((item) => item.status === "open").length;
  return (
    <div className="min-w-0 text-white">
      <div className="border-b border-white/10 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#a594f5]">Screen comments</p>
            <h3 className="mt-1 truncate text-sm font-semibold">{screen.name}</h3>
          </div>
          <span className="rounded-lg bg-white/8 px-2 py-1 text-[9px] font-bold text-white/55">{openCount} open</span>
        </div>
      </div>
      <div className="max-h-[520px] space-y-2 overflow-auto p-3">
        {loading ? (
          <div className="flex justify-center py-12"><LoaderCircle className="size-5 animate-spin text-white/35" /></div>
        ) : error ? (
          <p role="alert" className="rounded-xl bg-[#2e2654]/70 p-3 text-[10px] leading-4 text-white">{error}</p>
        ) : comments.length ? (
          comments.map((comment, index) => (
            <button
              type="button"
              key={comment.id}
              onClick={() => window.dispatchEvent(new CustomEvent(focusCommentEvent, { detail: { fileKey: file.key, screenId: screen.id, commentId: comment.id } }))}
              className="flex w-full items-start gap-3 rounded-2xl border border-white/8 bg-white/5 p-3 text-left transition hover:border-[#7c6cf0]/40 hover:bg-white/8"
            >
              <span className={`flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-white/70 text-[10px] font-bold text-white ${comment.status === "resolved" ? "bg-[#63706c]" : "bg-[#ef5da8]"}`}>{index + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <strong className="truncate text-[10px]">{comment.authorName}</strong>
                  <span className={`rounded px-1.5 py-0.5 text-[8px] font-bold uppercase ${comment.status === "resolved" ? "bg-[#5b4cc4] text-[#a594f5]" : "bg-[#5f2745] text-[#f7a7d0]"}`}>{comment.status}</span>
                </span>
                <span className="mt-1.5 line-clamp-3 block whitespace-pre-wrap text-[10px] leading-4 text-white/60">{comment.body}</span>
              </span>
            </button>
          ))
        ) : (
          <div className="py-10 text-center">
            <MessageSquarePlus className="mx-auto size-6 text-white/25" />
            <p className="mt-3 text-xs font-semibold text-white/65">No comments yet</p>
            <p className="mx-auto mt-1 max-w-[220px] text-[10px] leading-4 text-white/35">Use Comment on the canvas to pin feedback.</p>
          </div>
        )}
      </div>
    </div>
  );
}
