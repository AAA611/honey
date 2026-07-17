import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import type { HarnessRuntime, HarnessSession } from "../runtime/harness.js";
import type { ConversationMessage } from "../types.js";
import { StatusBar } from "./StatusBar.js";
import { SessionBannerView } from "./SessionBannerView.js";
import { SlashOverlay } from "./SlashOverlay.js";
import { TranscriptView } from "./TranscriptView.js";
import {
  buildSlashItems,
  filterSlashItems,
  getSlashQuery,
  insertSkillMention,
  type SlashItem
} from "./slashItems.js";
import {
  isKittyCsiUInput,
  isSlashDismissKey,
  pushKittyCsiFragment
} from "./keys.js";

export type SessionTuiProps = {
  runtime: HarnessRuntime;
  session: HarnessSession;
};

export function SessionTuiApp(props: SessionTuiProps): React.ReactElement {
  const { exit } = useApp();
  const [messages, setMessages] = useState<ConversationMessage[]>(
    () => props.session.snapshot().transcript
  );
  const [notices, setNotices] = useState<string[]>([
    "Session TUI ready. Type `/` for commands and Skills."
  ]);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [confirm, setConfirm] = useState<null | {
    prompt: string;
    resolve: (ok: boolean) => void;
  }>(null);

  const skills = props.runtime.skillRegistry.list();
  const slashQuery = getSlashQuery(value);
  const slashOpen = slashQuery !== null && !busy && !confirm;
  const slashItems = useMemo(() => {
    if (slashQuery === null) {
      return [] as SlashItem[];
    }
    return filterSlashItems(buildSlashItems(skills), slashQuery);
  }, [skills, slashQuery]);

  // Refs keep useInput stable so Esc/Ctrl+G are not dropped during resubscribe.
  const stateRef = useRef({
    value,
    busy,
    confirm,
    slashOpen,
    slashItems,
    selectedIndex
  });
  stateRef.current = {
    value,
    busy,
    confirm,
    slashOpen,
    slashItems,
    selectedIndex
  };
  /** Reassembles Kitty CSI-u when stdin splits `\x1b[` from `27u`. */
  const kittyCsiBufferRef = useRef("");

  useEffect(() => {
    setSelectedIndex(0);
  }, [slashQuery, slashItems.length]);

  useEffect(() => {
    props.runtime.config.confirmSkillScript = async (request) =>
      await new Promise<boolean>((resolve) => {
        setConfirm({
          prompt: `Run user Skill script ${request.skillName}:${request.script}? [y/N]`,
          resolve
        });
      });
  }, [props.runtime]);

  const dismissSlash = useCallback(() => {
    setValue("");
    setSelectedIndex(0);
  }, []);

  const applySlashItem = useCallback(
    async (item: SlashItem, currentValue: string): Promise<void> => {
      if (item.kind === "skill") {
        setValue(insertSkillMention(currentValue, item.skillName));
        return;
      }
      setValue("");
      if (item.id === "exit") {
        props.session.end();
        exit();
        return;
      }
      if (item.id === "clear") {
        props.session.clear();
        setMessages([]);
        setNotices(["Session cleared."]);
        return;
      }
      if (item.id === "context") {
        setNotices((current) => [
          ...current,
          props.session.formatContextInventory().trimEnd()
        ]);
      }
    },
    [exit, props.session]
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
        setNotices(["Session cleared."]);
        setValue("");
        return;
      }
      if (line === "/context" || line === "context") {
        setNotices((current) => [
          ...current,
          props.session.formatContextInventory().trimEnd()
        ]);
        setValue("");
        return;
      }
      if (line === "/" || line === "/skills") {
        return;
      }

      setBusy(true);
      setValue("");
      try {
        await props.session.runTurn(line);
        setMessages([...props.session.snapshot().transcript]);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setNotices((current) => [...current, `Error: ${message}`]);
      } finally {
        setBusy(false);
      }
    },
    [exit, props.session]
  );

  const onInput = useCallback(
    (input: string, key: {
      escape: boolean;
      meta: boolean;
      ctrl: boolean;
      upArrow: boolean;
      downArrow: boolean;
      return: boolean;
      tab: boolean;
      backspace: boolean;
      delete: boolean;
    }) => {
      const current = stateRef.current;

      // Bare Esc clears any half-read CSI fragment.
      if (key.escape) {
        kittyCsiBufferRef.current = "";
      }

      // Kitty CSI-u may arrive split (`[` then `27;1:3u`). Reassemble before
      // treating input as printable — otherwise Composer becomes `/[27u` and
      // the overlay filters to nothing (Esc "fails" + skills unselectable).
      let effectiveInput = input;
      const assembled = pushKittyCsiFragment(
        kittyCsiBufferRef.current,
        input,
        { bufferLoneBracket: current.slashOpen }
      );
      kittyCsiBufferRef.current = assembled.buffer;
      if (assembled.buffer.length > 0 && assembled.completed === null) {
        // Incomplete CSI — wait for more bytes, but never block nav/edit keys.
        if (
          key.upArrow ||
          key.downArrow ||
          key.return ||
          key.tab ||
          key.backspace ||
          key.delete ||
          key.escape ||
          (key.ctrl && (input === "c" || input === "g" || input === "G"))
        ) {
          kittyCsiBufferRef.current = "";
          effectiveInput = input;
        } else {
          return;
        }
      } else if (assembled.completed !== null) {
        effectiveInput = assembled.completed;
      }

      // Ink sets key.escape for bare Esc; Kitty CSI-u Esc is handled via input.
      const isDismiss = isSlashDismissKey(effectiveInput, key);

      if (current.confirm) {
        if (effectiveInput.toLowerCase() === "y") {
          current.confirm.resolve(true);
          setConfirm(null);
          return;
        }
        if (
          effectiveInput.toLowerCase() === "n" ||
          isDismiss ||
          key.return ||
          (key.ctrl && effectiveInput === "c")
        ) {
          current.confirm.resolve(false);
          setConfirm(null);
        }
        return;
      }

      if (current.busy) {
        return;
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
        if (isDismiss || (key.ctrl && effectiveInput === "c")) {
          dismissSlash();
          return;
        }
        if (key.tab || (key.return && current.slashItems.length > 0)) {
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

      if (key.return) {
        void submit(current.value);
        return;
      }

      if (isDismiss) {
        dismissSlash();
        return;
      }

      // Kitty CSI-u that Ink didn't decode (Esc already handled) — never type it.
      if (isKittyCsiUInput(effectiveInput)) {
        return;
      }

      if (key.backspace || key.delete) {
        setValue((text) => text.slice(0, -1));
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
        setValue((text) => `${text}${effectiveInput}`);
      }
    },
    [applySlashItem, dismissSlash, exit, submit]
  );

  useInput(onInput);

  const overlayIndex =
    slashItems.length === 0
      ? 0
      : Math.min(selectedIndex, slashItems.length - 1);

  return (
    <Box flexDirection="column" width="100%">
      <SessionBannerView />
      <StatusBar
        cwd={props.runtime.config.cwd}
        busy={busy}
        skillCount={skills.length}
        messageCount={messages.length}
      />
      <Box flexDirection="column" paddingX={1} marginY={1}>
        <TranscriptView messages={messages} notices={notices} />
      </Box>
      {slashOpen ? (
        <SlashOverlay
          items={slashItems}
          selectedIndex={overlayIndex}
          query={slashQuery ?? ""}
        />
      ) : null}
      <Box borderStyle="single" borderColor={busy ? "yellow" : "green"} paddingX={1}>
        <Text color="green">honey› </Text>
        {confirm ? (
          <Text color="yellow">{confirm.prompt}</Text>
        ) : (
          <>
            {/* Sibling Text avoids Ink #867 nested-cursor wrap on 0→1 length. */}
            <Text>{value}</Text>
            {busy ? null : <Text inverse> </Text>}
          </>
        )}
      </Box>
    </Box>
  );
}
