import React from "react";
import { render } from "ink";
import type { HarnessRuntime, HarnessSession } from "../runtime/harness.js";
import { SessionTuiApp } from "./App.js";

export async function runSessionTui(input: {
  runtime: HarnessRuntime;
  session: HarnessSession;
}): Promise<void> {
  const instance = render(
    <SessionTuiApp runtime={input.runtime} session={input.session} />,
    {
      exitOnCtrlC: false
    }
  );
  await instance.waitUntilExit();
}
