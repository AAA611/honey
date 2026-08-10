import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useApp, type DOMElement } from "ink";
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { HarnessRuntime, HarnessSession } from "../runtime/harness.js";
import { formatApprovalView, type ApprovalView } from "../runtime/approval.js";
import type { ProjectInstructionsLoadResult } from "../context/projectInstructions.js";
import type { ConversationMessage, ProviderStreamDelta } from "../types.js";
import { ApprovalPanel } from "./ApprovalPanel.js";
import { StatusBar } from "./StatusBar.js";
import { SessionBannerView } from "./SessionBannerView.js";
import { SlashOverlay } from "./SlashOverlay.js";
import {
  TranscriptView,
  type ReasoningExpandedMap,
  type ToolExpandedMap
} from "./TranscriptView.js";
import {
  buildSlashItems,
  filterSlashItems,
  getSlashQuery,
  insertSkillMention,
  type SlashItem
} from "./slashItems.js";
import {
  decodeKittyCsiUAction,
  isKittyCsiUInput,
  isSlashDismissKey
} from "./keys.js";
import { useComposerInput } from "./useComposerInput.js";
import { useComposerImeCursor } from "./useComposerImeCursor.js";
import { COMPOSER_PROMPT } from "./composerImeCursor.js";

const KEYLOG_DIR = join(process.cwd(), ".honey");
const KEYLOG_PATH = join(KEYLOG_DIR, "keylog.jsonl");
const DEBUG_KEYS = process.env.HONEY_DEBUG_KEYS !== "0";
/** Marker so re-running /context replaces the previous inventory notice. */
const CONTEXT_NOTICE_MARKER = "[context inventory]";

function formatKeyDebug(
  input: string,
  key: { escape: boolean; ctrl: boolean; meta: boolean; upArrow: boolean; downArrow: boolean }
): string {
  const hex = [...input]
    .map((ch) => ch.charCodeAt(0).toString(16).padStart(2, "0"))
    .join(" ");
  const flags = [
    key.escape ? "esc" : "",
    key.ctrl ? "ctrl" : "",
    key.meta ? "meta" : "",
    key.upArrow ? "up" : "",
    key.downArrow ? "down" : ""
  ]
    .filter(Boolean)
    .join("+");
  return `in=${JSON.stringify(input)} hex=${hex || "∅"} ${flags || "—"}`;
}

function logKeyDebug(line: string): void {
  if (!DEBUG_KEYS) {
    return;
  }
  try {
    mkdirSync(KEYLOG_DIR, { recursive: true });
    appendFileSync(KEYLOG_PATH, `${line}\n`, "utf8");
  } catch {
    // ignore logging failures
  }
}

function isUndecodedSlashDismissInput(
  input: string,
  key: {
    ctrl: boolean;
    upArrow: boolean;
    downArrow: boolean;
    leftArrow?: boolean;
    rightArrow?: boolean;
    return: boolean;
    tab: boolean;
    backspace: boolean;
    delete: boolean;
    escape: boolean;
  }
): boolean {
  return (
    input === "" &&
    !key.escape &&
    !key.ctrl &&
    !key.upArrow &&
    !key.downArrow &&
    !key.leftArrow &&
    !key.rightArrow &&
    !key.return &&
    !key.tab &&
    !key.backspace &&
    !key.delete
  );
}

export type SessionTuiProps = {
  runtime: HarnessRuntime;
  session: HarnessSession;
};

export function SessionTuiApp(props: SessionTuiProps): React.ReactElement {
  const { exit } = useApp();
  const [messages, setMessages] = useState<ConversationMessage[]>(
    () => props.session.snapshot().transcript
  );
  const [reasoning, setReasoning] = useState<string[]>(
    () => props.session.snapshot().reasoning ?? []
  );
  const [reasoningExpanded, setReasoningExpanded] =
    useState<ReasoningExpandedMap>({});
  const [toolExpanded, setToolExpanded] = useState<ToolExpandedMap>({});
  const [draftAssistant, setDraftAssistant] = useState("");
  const [reasoningDraft, setReasoningDraft] = useState("");
  const [notices, setNotices] = useState<string[]>([
    "Session TUI ready. Type `/` for commands and Skills."
  ]);
  const [value, setValue] = useState("");
  const [cursor, setCursor] = useState(0);
  const [busy, setBusy] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [approval, setApproval] = useState<null | {
    view: ApprovalView;
    resolve: (ok: boolean) => void;
  }>(null);
  const [lastKeyDebug, setLastKeyDebug] = useState<string | null>(null);
  const composerRef = useRef<DOMElement>(null);
  const caretRowRef = useRef<DOMElement>(null);
  const [, setImeLayoutTick] = useState(0);

  const skills = props.runtime.skillRegistry.list();
  const slashQuery = getSlashQuery(value);
  const slashOpen = slashQuery !== null && !busy && !approval;
  const slashItems = useMemo(() => {
    if (slashQuery === null) {
      return [] as SlashItem[];
    }
    return filterSlashItems(buildSlashItems(skills), slashQuery);
  }, [skills, slashQuery]);

  // Refs keep the input handler stable so Esc/Ctrl+G are not dropped on resubscribe.
  const stateRef = useRef({
    value,
    cursor,
    busy,
    approval,
    slashOpen,
    slashItems,
    selectedIndex,
    reasoning,
    reasoningExpanded,
    messages,
    toolExpanded
  });
  stateRef.current = {
    value,
    cursor,
    busy,
    approval,
    slashOpen,
    slashItems,
    selectedIndex,
    reasoning,
    reasoningExpanded,
    messages,
    toolExpanded
  };

  const setComposerValue = useCallback((next: string, nextCursor = next.length) => {
    const cursorNext = Math.max(0, Math.min(nextCursor, next.length));
    setValue(next);
    setCursor(cursorNext);
    // Keep the ref in sync inside the same stdin turn. Esc often arrives as
    // `\x1b` then `[`; without this, `[` still sees slashOpen/value="/" and
    // rebuilds `/[` so the panel looks like Esc did nothing.
    const current = stateRef.current;
    const slashQueryNext = getSlashQuery(next);
    stateRef.current = {
      ...current,
      value: next,
      cursor: cursorNext,
      slashOpen: slashQueryNext !== null && !current.busy && !current.approval
    };
  }, []);

  useEffect(() => {
    setSelectedIndex(0);
  }, [slashQuery, slashItems.length]);

  useEffect(() => {
    props.runtime.config.requestApproval = async (request) =>
      await new Promise<boolean>((resolve) => {
        setApproval({
          view: formatApprovalView(request),
          resolve
        });
      });
  }, [props.runtime]);

  useEffect(() => {
    const onDelta = (delta: ProviderStreamDelta): void => {
      if (delta.kind === "assistant_text") {
        setDraftAssistant((current) => current + delta.text);
        return;
      }
      setReasoningDraft((current) => current + delta.text);
    };
    const onModelCallComplete = (): void => {
      const snap = props.session.snapshot();
      setMessages([...snap.transcript]);
      setReasoning([...(snap.reasoning ?? [])]);
      setDraftAssistant("");
      setReasoningDraft("");
    };
    props.session.setStreamListener?.(onDelta);
    props.session.setModelCallCompleteListener?.(onModelCallComplete);
    return () => {
      props.session.setStreamListener?.(null);
      props.session.setModelCallCompleteListener?.(null);
    };
  }, [props.session]);

  const syncFromSnapshot = useCallback(() => {
    const snap = props.session.snapshot();
    setMessages([...snap.transcript]);
    setReasoning([...(snap.reasoning ?? [])]);
    setDraftAssistant("");
    setReasoningDraft("");
  }, [props.session]);

  const contextNoticeSeq = useRef(0);

  const pushContextNotice = useCallback(() => {
    contextNoticeSeq.current += 1;
    const seq = contextNoticeSeq.current;
    const inventory = props.session.formatContextInventory().trimEnd();
    setNotices((current) => [
      ...current.filter((notice) => !notice.includes(CONTEXT_NOTICE_MARKER)),
      `${CONTEXT_NOTICE_MARKER} #${seq}\n${inventory}`
    ]);
  }, [props.session]);

  const dismissSlash = useCallback((wasOpen = stateRef.current.slashOpen) => {
    if (wasOpen) {
      logKeyDebug(JSON.stringify({ t: Date.now(), event: "slash-dismiss" }));
    }
    setComposerValue("");
    setSelectedIndex(0);
  }, [setComposerValue]);

  const applySlashItem = useCallback(
    async (item: SlashItem, currentValue: string): Promise<void> => {
      if (item.kind === "skill") {
        setComposerValue(insertSkillMention(currentValue, item.skillName));
        return;
      }
      setComposerValue("");
      if (item.id === "exit") {
        props.session.end();
        exit();
        return;
      }
      if (item.id === "clear") {
        props.session.clear();
        setMessages([]);
        setReasoning([]);
        setReasoningExpanded({});
        setToolExpanded({});
        setDraftAssistant("");
        setReasoningDraft("");
        setNotices(["Session cleared."]);
        return;
      }
      if (item.id === "context") {
        pushContextNotice();
        return;
      }
      if (item.id === "reload-instructions") {
        const loaded = props.session.reloadProjectInstructions();
        setNotices((current) => [
          ...current,
          formatReloadNotice(loaded)
        ]);
        return;
      }
      if (item.id === "plan") {
        props.session.enterPlanMode();
        setNotices((current) => [...current, "Plan Mode on (read-only)."]);
        return;
      }
      if (item.id === "plan-exit") {
        props.session.exitPlanMode();
        setNotices((current) => [...current, "Plan Mode off (draft kept)."]);
        return;
      }
      if (item.id === "execute") {
        const result = props.session.executePlan();
        if (!result.ok) {
          setNotices((current) => [...current, result.reason]);
          return;
        }
        setNotices((current) => [
          ...current,
          "Plan Mode off — executing Plan as Task."
        ]);
        setBusy(true);
        try {
          await props.session.runTurn("Execute the accepted Plan.");
          syncFromSnapshot();
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          setNotices((current) => [...current, `Error: ${message}`]);
        } finally {
          setBusy(false);
        }
        return;
      }
    },
    [exit, props.session, pushContextNotice, setComposerValue, syncFromSnapshot]
  );

  const submit = useCallback(
    async (raw: string): Promise<void> => {
      const line = raw.trim();
      if (!line || stateRef.current.busy) {
        return;
      }

      if (line === "/exit" || line === "/quit" || line === "exit" || line === "quit") {
        props.session.end();
        exit();
        return;
      }
      if (line === "/clear" || line === "clear") {
        props.session.clear();
        setMessages([]);
        setReasoning([]);
        setReasoningExpanded({});
        setToolExpanded({});
        setDraftAssistant("");
        setReasoningDraft("");
        setNotices(["Session cleared."]);
        setComposerValue("");
        return;
      }
      if (line === "/context" || line === "context") {
        pushContextNotice();
        setComposerValue("");
        return;
      }
      if (line === "/reload-instructions" || line === "reload-instructions") {
        const loaded = props.session.reloadProjectInstructions();
        setNotices((current) => [...current, formatReloadNotice(loaded)]);
        setComposerValue("");
        return;
      }
      if (line === "/plan" || line === "plan") {
        props.session.enterPlanMode();
        setNotices((current) => [...current, "Plan Mode on (read-only)."]);
        setComposerValue("");
        return;
      }
      if (line === "/plan-exit" || line === "plan-exit") {
        props.session.exitPlanMode();
        setNotices((current) => [...current, "Plan Mode off (draft kept)."]);
        setComposerValue("");
        return;
      }
      if (line === "/execute" || line === "execute") {
        const result = props.session.executePlan();
        setComposerValue("");
        if (!result.ok) {
          setNotices((current) => [...current, result.reason]);
          return;
        }
        setNotices((current) => [
          ...current,
          "Plan Mode off — executing Plan as Task."
        ]);
        setBusy(true);
        setDraftAssistant("");
        setReasoningDraft("");
        try {
          await props.session.runTurn("Execute the accepted Plan.");
          syncFromSnapshot();
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          setNotices((current) => [...current, `Error: ${message}`]);
        } finally {
          setBusy(false);
        }
        return;
      }
      if (line === "/" || line === "/skills") {
        return;
      }

      setBusy(true);
      setComposerValue("");
      setDraftAssistant("");
      setReasoningDraft("");
      setMessages((current) => [...current, { role: "user", content: line }]);
      try {
        await props.session.runTurn(line);
        syncFromSnapshot();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setNotices((current) => [...current, `Error: ${message}`]);
      } finally {
        setBusy(false);
      }
    },
    [exit, props.session, pushContextNotice, setComposerValue, syncFromSnapshot]
  );

  const onInput = useCallback(
    (input: string, key: {
      escape: boolean;
      meta: boolean;
      ctrl: boolean;
      upArrow: boolean;
      downArrow: boolean;
      leftArrow: boolean;
      rightArrow: boolean;
      return: boolean;
      tab: boolean;
      backspace: boolean;
      delete: boolean;
    }) => {
      const current = stateRef.current;
      setLastKeyDebug(formatKeyDebug(input, key));
      logKeyDebug(
        JSON.stringify({
          t: Date.now(),
          slashOpen: current.slashOpen,
          value: current.value,
          cursor: current.cursor,
          input,
          escape: key.escape,
          ctrl: key.ctrl,
          meta: key.meta,
          up: key.upArrow,
          down: key.downArrow,
          left: key.leftArrow,
          right: key.rightArrow,
          return: key.return,
          tab: key.tab,
          backspace: key.backspace,
          delete: key.delete
        })
      );

      // Safety net: CSI-u that slipped past rewrite (e.g. stripped `[13u`).
      let effectiveInput = input;
      let effectiveReturn = key.return;
      let effectiveTab = key.tab;
      let effectiveEscape = key.escape;
      let effectiveBackspace = key.backspace;
      const kittyAction = decodeKittyCsiUAction(input);
      if (kittyAction === "return") {
        effectiveInput = "";
        effectiveReturn = true;
      } else if (kittyAction === "tab") {
        effectiveInput = "";
        effectiveTab = true;
      } else if (kittyAction === "escape") {
        effectiveInput = "";
        effectiveEscape = true;
      } else if (kittyAction === "backspace") {
        effectiveInput = "";
        effectiveBackspace = true;
      } else if (kittyAction === "ignore") {
        return;
      }

      const isDismiss = isSlashDismissKey(effectiveInput, {
        escape: effectiveEscape,
        ctrl: key.ctrl,
        meta: key.meta
      });

      if (current.approval) {
        if (effectiveInput.toLowerCase() === "y") {
          current.approval.resolve(true);
          setApproval(null);
          return;
        }
        if (
          effectiveInput.toLowerCase() === "n" ||
          isDismiss ||
          effectiveReturn ||
          (key.ctrl && effectiveInput === "c")
        ) {
          current.approval.resolve(false);
          setApproval(null);
        }
        return;
      }

      if (current.busy) {
        return;
      }

      // Empty Composer: `r` / `t` toggle latest Reasoning / tool-result blocks.
      if (
        !current.slashOpen &&
        current.value.length === 0 &&
        !key.ctrl &&
        !key.meta
      ) {
        const keyChar = effectiveInput.toLowerCase();
        if (keyChar === "r") {
          let latest = -1;
          for (let i = 0; i < current.reasoning.length; i += 1) {
            if ((current.reasoning[i] ?? "").trim().length > 0) {
              latest = i;
            }
          }
          if (latest >= 0) {
            setReasoningExpanded((prev) => ({
              ...prev,
              [latest]: !prev[latest]
            }));
          }
          return;
        }
        if (keyChar === "t") {
          let latest = -1;
          for (let i = 0; i < current.messages.length; i += 1) {
            if (current.messages[i]?.role === "tool") {
              latest = i;
            }
          }
          if (latest >= 0) {
            setToolExpanded((prev) => ({
              ...prev,
              [latest]: !prev[latest]
            }));
          }
          return;
        }
      }

      if (current.slashOpen) {
        if (key.upArrow) {
          setSelectedIndex((index) =>
            current.slashItems.length === 0
              ? 0
              : (index - 1 + current.slashItems.length) % current.slashItems.length
          );
          return;
        }
        if (key.downArrow) {
          setSelectedIndex((index) =>
            current.slashItems.length === 0
              ? 0
              : (index + 1) % current.slashItems.length
          );
          return;
        }
        // Esc / Ctrl+G / Ctrl+C dismiss the overlay (Ctrl+C does not exit while open).
        if (
          isDismiss ||
          isUndecodedSlashDismissInput(effectiveInput, {
            ...key,
            escape: effectiveEscape,
            return: effectiveReturn,
            tab: effectiveTab,
            backspace: effectiveBackspace
          }) ||
          (key.ctrl && effectiveInput === "c")
        ) {
          dismissSlash();
          return;
        }
        if (effectiveTab || (effectiveReturn && current.slashItems.length > 0)) {
          const item =
            current.slashItems[
              Math.min(current.selectedIndex, current.slashItems.length - 1)
            ];
          if (item) {
            void applySlashItem(item, current.value);
          }
          return;
        }
      }

      if (effectiveReturn) {
        void submit(current.value);
        return;
      }

      if (isDismiss) {
        dismissSlash();
        return;
      }

      if (key.leftArrow) {
        setCursor((c) => Math.max(0, c - 1));
        return;
      }
      if (key.rightArrow) {
        setCursor((c) => Math.min(current.value.length, c + 1));
        return;
      }

      // Kitty CSI-u that Ink didn't decode (Esc already handled) — never type it.
      if (isKittyCsiUInput(effectiveInput)) {
        return;
      }

      if (effectiveBackspace || key.delete) {
        if (key.delete) {
          if (current.cursor < current.value.length) {
            const next =
              current.value.slice(0, current.cursor) +
              current.value.slice(current.cursor + 1);
            setComposerValue(next, current.cursor);
          }
          return;
        }
        if (current.cursor > 0) {
          const next =
            current.value.slice(0, current.cursor - 1) +
            current.value.slice(current.cursor);
          setComposerValue(next, current.cursor - 1);
        }
        return;
      }

      if (key.ctrl && effectiveInput === "c") {
        exit();
        return;
      }

      if (
        effectiveInput &&
        !key.ctrl &&
        effectiveInput !== "\u001b" &&
        effectiveInput !== "\x1b"
      ) {
        // Note: do not gate on key.meta — Ink marks Escape as meta=true.
        const next =
          current.value.slice(0, current.cursor) +
          effectiveInput +
          current.value.slice(current.cursor);
        setComposerValue(next, current.cursor + effectiveInput.length);
      }
    },
    [applySlashItem, dismissSlash, exit, setComposerValue, submit]
  );

  useComposerInput(onInput);

  // Remeasure after mount and whenever Composer remounts (e.g. leave Approval).
  useEffect(() => {
    setImeLayoutTick((tick) => tick + 1);
  }, [approval, busy]);

  const overlayIndex =
    slashItems.length === 0
      ? 0
      : Math.min(selectedIndex, slashItems.length - 1);

  const before = value.slice(0, cursor);
  const at = cursor < value.length ? value.charAt(cursor) : " ";
  const after = cursor < value.length ? value.slice(cursor + 1) : "";

  useComposerImeCursor({
    caretRowNode: caretRowRef.current ?? undefined,
    before,
    active: !busy && !approval
  });

  return (
    <Box flexDirection="column" width="100%">
      <SessionBannerView />
      <StatusBar
        cwd={props.runtime.config.cwd}
        busy={busy}
        awaitingApproval={Boolean(approval)}
        skillCount={skills.length}
        messageCount={messages.length}
      />
      <Box flexDirection="column" paddingX={1} marginY={1}>
        <TranscriptView
          messages={messages}
          notices={notices}
          reasoning={reasoning}
          reasoningExpanded={reasoningExpanded}
          toolExpanded={toolExpanded}
          reasoningDraft={reasoningDraft}
          draftAssistant={draftAssistant}
          thinking={busy && !approval}
        />
      </Box>
      {slashOpen ? (
        <SlashOverlay
          items={slashItems}
          selectedIndex={overlayIndex}
          query={slashQuery ?? ""}
          lastKeyDebug={lastKeyDebug}
        />
      ) : null}
      {approval ? (
        <ApprovalPanel view={approval.view} />
      ) : (
        <Box
          ref={composerRef}
          borderStyle="single"
          borderColor={busy ? "yellow" : "green"}
          paddingX={1}
        >
          <Box ref={caretRowRef} flexDirection="row">
            <Text color="green">{COMPOSER_PROMPT}</Text>
            {/*
              Real terminal caret comes from useCursor (IME). Do not also paint an
              inverse-space fake caret — that stacks into a vertical double cursor.
            */}
            <Text>
              {before}
              {cursor < value.length ? at : ""}
              {after}
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}

function formatReloadNotice(loaded: ProjectInstructionsLoadResult): string {
  const user = loaded.sources.user?.path ?? "(none)";
  const project = loaded.sources.project?.path ?? "(none)";
  const truncated = loaded.truncated ? "yes" : "no";
  return [
    "Reloaded Project instructions.",
    `  user: ${user}`,
    `  project: ${project}`,
    `  truncated: ${truncated}`
  ].join("\n");
}
