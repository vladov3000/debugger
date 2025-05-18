# Debugger

An extension that lets Claude Code operate a language-agnostic debugger for you. Set breakpoints, step over lines, and evaluate expressions automatically.

## Installation

To build and install, run the following:
```
npm install
npm run compile
npx vsce package
code --install-extension debugger-1.0.0.vsix
```

Then, run `Start Server` and the server will run on port 3000.

## Development

1. Run `npm install`
2. Run `npm run watch` in a window.
3. Run `Debug: Start Debugging` from the VS Code command palette.
4. Select the VS Code extension option.
5. You now have a window running the extension.
    - Run "Start Server" to start the MCP server.
    - Run "Test Server" to run whatever test code you have in that handler.
