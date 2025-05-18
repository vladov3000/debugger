import { McpServer, RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";
import { commands, debug, ExtensionContext, Location, Position, SourceBreakpoint, Uri, window, workspace } from "vscode";
import { z } from "zod";
import { startExpressServer } from "./server";

let output: string[] = [];
let exited = false;

function getOutput(): string | undefined {
    return exited ? output.join() : undefined;
}

export function activate(context: ExtensionContext) {
    const startServer = commands.registerCommand("extension.startServer", async () => {
        const server = new McpServer({ name: "Debugger", version: "1.0.0" });

        debug.registerDebugAdapterTrackerFactory('node', {
            createDebugAdapterTracker(session) {
                return {
                    onWillStartSession() {
                        output = [];
                    },
                    onDidSendMessage(message) {
                        if (message.type === 'event' && message.event === 'output') {
                            output.push(message.body.output);
                        }
                    },
                    onExit() {

                    }
                };
            }
        });

        server.tool("start", {}, async () => {
            await commands.executeCommand("workbench.action.debug.start");
            await waitUntilPaused(5000);
            return { content: [] };
        });

        const actions = ["stepOver", "stepInto", "stepOut", "continue", "pause", "restart", "stop"];
        for (const action of actions) {
            toolCommand(server, action, `workbench.action.debug.${action}`);
        }

        server.tool("addBreakpoints", {
            relativeFilePath: z.string(),
            line: z.number(),
        }, async ({ relativeFilePath, line }) => {
            addBreakpoint(relativeFilePath, line);
            return { content: [] };
        });

        server.tool("getLines", {
            count: z.number()
        }, async ({ count }) => {
            const lines = await getLines(count);
            return { content: [{ type: "text", text: lines }] };
        });

        server.tool("evaluate", { expression: z.string() }, async ({ expression }) => {
            const output = await evaluate(expression);
            return { content: [{ type: "text", text: output }] };
        });

        await commands.executeCommand("workbench.action.debug.start");

        window.showInformationMessage("Starting server.");
        await startExpressServer(server);
    });

    const testServer = commands.registerCommand("extension.testServer", async () => {
        addBreakpoint("main.js", 1);
    });

    context.subscriptions.push(startServer, testServer);
}

function toolCommand(server: McpServer, name: string, action: string): RegisteredTool {
    return server.tool(name, {}, async ({ }) => {
        const output = getOutput();
        if (output !== undefined) {
            return { content: [{ type: "text", text: "Process Exited\n" + output }] };
        }

        await commands.executeCommand(action);
        return { content: [] };
    });
}

function waitUntilPaused(timeoutMs: number): Promise<boolean> {
    return new Promise((resolve, _reject) => {
        const timeout = setTimeout(() => {
            listener.dispose();
            resolve(false);
        }, timeoutMs);

        const listener = debug.onDidReceiveDebugSessionCustomEvent(event => {
            if (event.event === "stopped") {
                clearTimeout(timeout);
                listener.dispose();
                resolve(false);
            }
        });
    });
}

async function getLines(count: number): Promise<string> {
    commands.executeCommand("workbench.action.debug.pause");
    if (await waitUntilPaused(5000)) {
        return "Thread is not paused.";
    }

    const session = debug.activeDebugSession;
    if (session === undefined) {
        return "The debugger is not paused.";
    }

    const threadId = debug.activeStackItem?.threadId;
    if (threadId === undefined) {
        return "The debugger is not paused.";
    }

    const stackTrace = await session.customRequest("stackTrace", {
        threadId,
        startFrame: 0,
        levels: 1,
    });

    const frame = stackTrace.stackFrames?.[0];
    if (!frame || !frame.source?.path || frame.line == null) {
        return "The debugger is not paused.";
    }

    const uri = Uri.file(frame.source.path);
    const doc = await workspace.openTextDocument(uri);

    let output = "";
    for (let i = -count; i < count; i++) {
        const line = frame.line + i;
        if (0 < line && line < doc.lineCount) {
            output += doc.lineAt(line).text + '\n';
        }
    }
    return output;
}

async function evaluate(input: string): Promise<string> {
    const threadId = debug.activeStackItem?.threadId;
    if (threadId === undefined) {
        return "The debugger is not running.";
    }

    const session = debug.activeDebugSession;
    if (session === undefined) {
        return "The debugger is not running.";
    }

    const stackTrace = await session.customRequest("stackTrace", {
        threadId,
        startFrame: 0,
        levels: 1,
    });

    const frameId = stackTrace.stackFrames?.[0].id;

    let output = null;
    try {
        output = await session?.customRequest("evaluate", {
            expression: input,
            frameId,
            context: "watch",
        });
    } catch (error) {
        return (error as Error).message;
    }

    return output.result;
}

function addBreakpoint(file: string, line: number) {
    const workspacePath = workspace.workspaceFolders?.[0].uri;
    if (workspacePath !== undefined) {
        const position = new Position(line - 1, 0);
        const path = Uri.joinPath(workspacePath, file);
        const location = new Location(path, position);
        const breakpoint = new SourceBreakpoint(location, true);
        debug.addBreakpoints([breakpoint]);
    }
}