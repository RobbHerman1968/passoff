import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import { db } from "@/db";
import { figmaQuestions } from "@/db/schema";
import { getFigmaConnectionId } from "@/lib/figma/session";
import type { FigmaInteraction, FigmaQuestionRecord, FigmaQuestionResponse, FigmaScreen } from "@/lib/figma/types";
import { getPrototypeTenantContext } from "@/lib/tenant/context";

type QuestionBody = {
  question?: unknown;
  fileKey?: unknown;
  fileName?: unknown;
  screen?: unknown;
  screens?: unknown;
  interactions?: unknown;
};

type LocalAnalysis = Omit<FigmaQuestionResponse, "analysisSource">;

function parseJsonArray(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) && parsed.every((item) => typeof item === "string") ? parsed : [];
  } catch {
    return [];
  }
}

function isScreen(value: unknown): value is FigmaScreen {
  if (!value || typeof value !== "object") return false;
  const screen = value as Partial<FigmaScreen>;
  return typeof screen.id === "string" && typeof screen.name === "string" && typeof screen.type === "string";
}

function isInteraction(value: unknown): value is FigmaInteraction {
  if (!value || typeof value !== "object") return false;
  const interaction = value as Partial<FigmaInteraction>;
  return typeof interaction.sourceNodeId === "string" && typeof interaction.sourceScreenId === "string" && typeof interaction.trigger === "string" && Array.isArray(interaction.actions);
}

function screenName(id: string | null, screens: FigmaScreen[]) {
  if (!id) return "an unspecified destination";
  return screens.find((screen) => screen.id === id)?.name || `node ${id}`;
}

function analyzeQuestion(question: string, fileName: string, selected: FigmaScreen, screens: FigmaScreen[], interactions: FigmaInteraction[]): LocalAnalysis {
  const normalized = question.toLowerCase();
  const outgoing = interactions.filter((interaction) => interaction.sourceScreenId === selected.id);
  const incoming = interactions.filter((interaction) => interaction.destinationScreenId === selected.id);
  const disconnected = screens.filter((screen) => !interactions.some((interaction) => interaction.sourceScreenId === screen.id || interaction.destinationScreenId === screen.id));
  const stateNames = screens.filter((screen) => /error|empty|loading|success|confirm|denied|expired|disabled/i.test(screen.name));
  const evidence = [
    `${selected.name} is a ${selected.type.toLowerCase()} (${selected.id}).`,
    `${outgoing.length} outgoing and ${incoming.length} incoming prototype relationship${incoming.length === 1 ? "" : "s"} were found.`,
  ];
  const gaps: string[] = [];

  if (outgoing.length === 0) gaps.push("No outgoing prototype destination is documented for this screen.");
  if (incoming.length === 0) gaps.push("No incoming prototype path is documented for this screen.");
  if (stateNames.length === 0) gaps.push("No explicitly named loading, empty, error, denied, or success state was found in the imported top-level frames.");

  if (/what happens|after|click|next|destination|navigate|flow/.test(normalized)) {
    if (!outgoing.length) {
      return { answer: `${selected.name} has no outgoing prototype connection in ${fileName}. Figma therefore does not document what should happen next. This should become an explicit product decision before implementation.`, evidence, gaps };
    }
    const paths = outgoing.slice(0, 6).map((interaction) => `${interaction.trigger} runs ${interaction.actions.join(" + ") || "an unnamed action"} and leads to ${screenName(interaction.destinationScreenId, screens)}`);
    return { answer: `From ${selected.name}, ${paths.join("; ")}. These are design-level transitions; validation, persistence, permissions, and failure behavior are not encoded by the prototype.`, evidence: [...evidence, ...paths], gaps };
  }

  if (/state|missing|error|loading|empty|success|edge|failure/.test(normalized)) {
    const documented = stateNames.length ? stateNames.map((screen) => screen.name).join(", ") : "none";
    return { answer: `The imported file explicitly suggests these state frames: ${documented}. For ${selected.name}, I would still require default, loading/submitting, success, validation error, permission denied, empty, and recovery states to be confirmed. A Figma frame only counts as implementation evidence when it is connected or documented.`, evidence: [...evidence, `${stateNames.length} top-level frame names look like UI states.`], gaps };
  }

  if (/data|api|save|write|database|field|payload|backend/.test(normalized)) {
    return { answer: `Figma shows the visual structure and ${outgoing.length} outgoing interaction${outgoing.length === 1 ? "" : "s"} for ${selected.name}, but it does not define an API contract or persistence behavior. The handoff should document inputs, validation, read/write operations, authorization rules, idempotency, and the response that drives each destination state.`, evidence, gaps: [...gaps, "Data fields and API operations cannot be proven from the imported prototype alone."] };
  }

  if (/disconnect|orphan|unlinked|relationship|connected/.test(normalized)) {
    return { answer: disconnected.length ? `${disconnected.length} screen${disconnected.length === 1 ? " is" : "s are"} disconnected from the imported prototype graph: ${disconnected.slice(0, 10).map((screen) => screen.name).join(", ")}.` : "Every imported top-level screen participates in at least one prototype relationship.", evidence: [...evidence, `${screens.length} screens and ${interactions.length} interactions were analyzed.`], gaps };
  }

  return {
    answer: `${selected.name} is one of ${screens.length} imported screens in ${fileName}. It has ${incoming.length} incoming and ${outgoing.length} outgoing prototype paths. Figma documents the visual transition graph, but the implementation handoff still needs actors, preconditions, data effects, permissions, failure handling, analytics, and ownership decisions.` ,
    evidence,
    gaps,
  };
}

export async function POST(request: Request) {
  const connectionId = await getFigmaConnectionId();
  if (!connectionId) {
    return NextResponse.json({ error: "Connect Figma before asking questions about a file." }, { status: 401 });
  }
  if (!(request.headers.get("content-type") || "").includes("application/json")) {
    return NextResponse.json({ error: "Expected a JSON request." }, { status: 415 });
  }

  try {
    const tenant = await getPrototypeTenantContext();
    const body = await request.json() as QuestionBody;
    if (typeof body.question !== "string" || !body.question.trim() || body.question.length > 1_000) {
      return NextResponse.json({ error: "Enter a question of 1,000 characters or fewer." }, { status: 400 });
    }
    if (typeof body.fileKey !== "string" || !/^[A-Za-z0-9_-]+$/.test(body.fileKey) || typeof body.fileName !== "string" || !isScreen(body.screen) || !Array.isArray(body.screens) || !body.screens.every(isScreen) || !Array.isArray(body.interactions) || !body.interactions.every(isInteraction)) {
      return NextResponse.json({ error: "The imported Figma context is incomplete." }, { status: 400 });
    }
    const response = analyzeQuestion(body.question.trim(), body.fileName.slice(0, 200), body.screen, body.screens.slice(0, 50), body.interactions.slice(0, 500));
    const record: FigmaQuestionRecord = {
      id: randomUUID(),
      screenId: body.screen.id,
      screenName: body.screen.name,
      question: body.question.trim(),
      createdAt: new Date().toISOString(),
      analysisSource: "local",
      ...response,
    };
    await db.insert(figmaQuestions).values({
      id: record.id,
      organizationId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      projectId: tenant.projectId,
      askedByUserId: tenant.userId,
      figmaConnectionId: connectionId,
      figmaFileKey: body.fileKey,
      figmaFileName: body.fileName.slice(0, 200),
      screenId: record.screenId,
      screenName: record.screenName,
      question: record.question,
      answer: record.answer,
      analysisSource: record.analysisSource,
      evidenceJson: JSON.stringify(record.evidence),
      gapsJson: JSON.stringify(record.gaps),
      createdAt: new Date(record.createdAt),
    });
    return NextResponse.json(record, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Unable to analyze this Figma context." }, { status: 400 });
  }
}

export async function GET(request: Request) {
  const tenant = await getPrototypeTenantContext();
  const fileKey = new URL(request.url).searchParams.get("fileKey");
  if (!fileKey || !/^[A-Za-z0-9_-]+$/.test(fileKey)) {
    return NextResponse.json({ error: "A valid Figma file key is required." }, { status: 400 });
  }
  const rows = await db.select().from(figmaQuestions).where(and(eq(figmaQuestions.organizationId, tenant.organizationId), eq(figmaQuestions.projectId, tenant.projectId), eq(figmaQuestions.figmaFileKey, fileKey))).orderBy(asc(figmaQuestions.createdAt));
  const records: FigmaQuestionRecord[] = rows.map((row) => ({
    id: row.id,
    screenId: row.screenId,
    screenName: row.screenName,
    question: row.question,
    answer: row.answer,
    analysisSource: row.analysisSource === "openai" ? "openai" : "local",
    evidence: parseJsonArray(row.evidenceJson),
    gaps: parseJsonArray(row.gapsJson),
    createdAt: row.createdAt.toISOString(),
  }));
  return NextResponse.json({ questions: records }, { headers: { "Cache-Control": "no-store" } });
}
