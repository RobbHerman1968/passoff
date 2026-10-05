"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";

import {
  updateIssueAssigneeAction,
  updateIssuePriorityAction,
  updateIssueStatusAction,
  type IssueTriageActionResult,
} from "@/app/(app)/projects/issue-triage-actions";
import { useOnlineStatus } from "@/components/issues/use-online-status";
import type { IssueHistoryEvent } from "@/lib/issues/history";
import type { IssuePriority } from "@/lib/issues/statuses";
import {
  ISSUE_TRIAGE_STATUS_TRANSITIONS,
  isTriageableIssueStatus,
} from "@/lib/issues/triage-transitions";
import type { AssignableMember, IssueTriageSnapshot } from "@/lib/issues/triage-types";

export const UNASSIGNED_VALUE = "unassigned";

export type SavingField = "status" | "priority" | "assignee" | null;

type IssueTriageContextValue = {
  projectId: string;
  reviewId: string;
  issueNumber: number;
  snapshot: IssueTriageSnapshot;
  members: AssignableMember[];
  history: IssueHistoryEvent[];
  historyError: string | null;
  historyLoading: boolean;
  savingField: SavingField;
  fieldError: { field: SavingField; message: string } | null;
  online: boolean;
  setHistory: (events: IssueHistoryEvent[]) => void;
  setHistoryError: (message: string | null) => void;
  setHistoryLoading: (loading: boolean) => void;
  updateStatus: () => Promise<void>;
  updatePriority: (priority: IssuePriority) => Promise<void>;
  updateAssignee: (assigneeUserId: string | null) => Promise<void>;
  retryFailed: () => Promise<void>;
};

const IssueTriageContext = createContext<IssueTriageContextValue | null>(null);

export function useIssueTriage() {
  const value = useContext(IssueTriageContext);
  if (!value) {
    throw new Error("useIssueTriage must be used within IssueTriageProvider");
  }
  return value;
}

export function IssueTriageProvider({
  projectId,
  reviewId,
  issueNumber,
  initialSnapshot,
  members,
  initialHistory,
  initialHistoryError = null,
  children,
}: {
  projectId: string;
  reviewId: string;
  issueNumber: number;
  initialSnapshot: IssueTriageSnapshot;
  members: AssignableMember[];
  initialHistory: IssueHistoryEvent[];
  initialHistoryError?: string | null;
  children: ReactNode;
}) {
  const online = useOnlineStatus();
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [history, setHistory] = useState(initialHistory);
  const [historyError, setHistoryError] = useState<string | null>(
    initialHistoryError,
  );
  const [historyLoading, setHistoryLoading] = useState(false);
  const [savingField, setSavingField] = useState<SavingField>(null);
  const [fieldError, setFieldError] = useState<{
    field: SavingField;
    message: string;
  } | null>(null);
  const [pendingPriority, setPendingPriority] = useState<IssuePriority | null>(
    null,
  );
  const [pendingAssignee, setPendingAssignee] = useState<string | null | undefined>(
    undefined,
  );

  const applySuccess = useCallback(
    (result: Extract<IssueTriageActionResult, { ok: true }>, successMessage: string) => {
      setSnapshot(result.issue);
      setHistory((current) => [result.event, ...current.filter((item) => item.id !== result.event.id)]);
      setFieldError(null);
      setPendingPriority(null);
      setPendingAssignee(undefined);
      toast.success(successMessage);
    },
    [],
  );

  const applyFailure = useCallback(
    (field: Exclude<SavingField, null>, result: Extract<IssueTriageActionResult, { ok: false }>) => {
      setFieldError({ field, message: result.message });
    },
    [],
  );

  const runStatus = useCallback(async () => {
    if (!isTriageableIssueStatus(snapshot.status)) return;
    const nextStatus = ISSUE_TRIAGE_STATUS_TRANSITIONS[snapshot.status];
    setSavingField("status");
    setFieldError((current) => (current?.field === "status" ? null : current));
    try {
      const result = await updateIssueStatusAction({
        projectId,
        reviewId,
        issueNumber,
        version: snapshot.version,
        status: nextStatus,
      });
      if (result.ok) {
        applySuccess(result, "Status updated.");
      } else {
        applyFailure("status", result);
      }
    } catch {
      applyFailure("status", {
        ok: false,
        error: "unavailable",
        message: "We couldn’t save that change. Try again.",
      });
    } finally {
      setSavingField(null);
    }
  }, [applyFailure, applySuccess, issueNumber, projectId, reviewId, snapshot.status, snapshot.version]);

  const runPriority = useCallback(
    async (priority: IssuePriority) => {
      setPendingPriority(priority);
      setSavingField("priority");
      setFieldError((current) => (current?.field === "priority" ? null : current));
      try {
        const result = await updateIssuePriorityAction({
          projectId,
          reviewId,
          issueNumber,
          version: snapshot.version,
          priority,
        });
        if (result.ok) {
          applySuccess(result, "Priority updated.");
        } else {
          applyFailure("priority", result);
        }
      } catch {
        applyFailure("priority", {
          ok: false,
          error: "unavailable",
          message: "We couldn’t save that change. Try again.",
        });
      } finally {
        setSavingField(null);
      }
    },
    [applyFailure, applySuccess, issueNumber, projectId, reviewId, snapshot.version],
  );

  const runAssignee = useCallback(
    async (assigneeUserId: string | null) => {
      setPendingAssignee(assigneeUserId);
      setSavingField("assignee");
      setFieldError((current) => (current?.field === "assignee" ? null : current));
      try {
        const result = await updateIssueAssigneeAction({
          projectId,
          reviewId,
          issueNumber,
          version: snapshot.version,
          assigneeUserId,
        });
        if (result.ok) {
          applySuccess(result, "Assignee updated.");
        } else {
          applyFailure("assignee", result);
        }
      } catch {
        applyFailure("assignee", {
          ok: false,
          error: "unavailable",
          message: "We couldn’t save that change. Try again.",
        });
      } finally {
        setSavingField(null);
      }
    },
    [applyFailure, applySuccess, issueNumber, projectId, reviewId, snapshot.version],
  );

  const retryFailed = useCallback(async () => {
    if (!fieldError?.field) return;
    if (fieldError.field === "status") {
      await runStatus();
      return;
    }
    if (fieldError.field === "priority") {
      const priority = pendingPriority ?? snapshot.priority;
      await runPriority(priority);
      return;
    }
    if (fieldError.field === "assignee") {
      const assignee =
        pendingAssignee === undefined ? snapshot.assigneeUserId : pendingAssignee;
      await runAssignee(assignee);
    }
  }, [
    fieldError,
    pendingAssignee,
    pendingPriority,
    runAssignee,
    runPriority,
    runStatus,
    snapshot.assigneeUserId,
    snapshot.priority,
  ]);

  const displayedSnapshot = useMemo<IssueTriageSnapshot>(() => {
    return {
      ...snapshot,
      priority: pendingPriority ?? snapshot.priority,
      assigneeUserId:
        pendingAssignee === undefined ? snapshot.assigneeUserId : pendingAssignee,
      assigneeDisplayName:
        pendingAssignee === undefined
          ? snapshot.assigneeDisplayName
          : pendingAssignee
            ? (members.find((member) => member.userId === pendingAssignee)?.displayName ??
              snapshot.assigneeDisplayName)
            : "Unassigned",
    };
  }, [members, pendingAssignee, pendingPriority, snapshot]);

  const value = useMemo<IssueTriageContextValue>(
    () => ({
      projectId,
      reviewId,
      issueNumber,
      snapshot: displayedSnapshot,
      members,
      history,
      historyError,
      historyLoading,
      savingField,
      fieldError,
      online,
      setHistory,
      setHistoryError,
      setHistoryLoading,
      updateStatus: runStatus,
      updatePriority: runPriority,
      updateAssignee: runAssignee,
      retryFailed,
    }),
    [
      displayedSnapshot,
      fieldError,
      history,
      historyError,
      historyLoading,
      issueNumber,
      members,
      online,
      projectId,
      reviewId,
      retryFailed,
      runAssignee,
      runPriority,
      runStatus,
      savingField,
    ],
  );

  return (
    <IssueTriageContext.Provider value={value}>{children}</IssueTriageContext.Provider>
  );
}
