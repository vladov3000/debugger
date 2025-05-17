import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { randomUUID } from "crypto";
import * as vscode from "vscode";
import { z } from "zod";

type Transport = StreamableHTTPServerTransport

const transports: Map<string, Transport> = new Map();

export function activate(context: vscode.ExtensionContext) {
    const disposable = vscode.commands.registerCommand("extension.startServer", async () => {
        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: sessionId => {
                transports.set(sessionId, transport);
            }
        });

        transport.onclose = () => {
            if (transport.sessionId !== undefined) {
                transports.delete(transport.sessionId);
            }
        };

        const server = new McpServer({ name: "Debugger", version: "1.0.0" });

        server.tool("add",
            { a: z.number(), b: z.number() },
            async ({ a, b }) => ({
                content: [{ type: "text", text: String(a + b) }]
            })
        );

        vscode.window.showInformationMessage("Starting server.");
        await server.connect(transport);
    });

    context.subscriptions.push(disposable);
}