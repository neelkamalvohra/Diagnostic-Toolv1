<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

# Network Diagnostic Tool

This is an Electron application for diagnosing network and website connectivity issues. The tool performs various diagnostics including:

1. Internet connectivity check
2. Public IP address detection (IPv4 and IPv6)
3. DNS lookups using configurable DNS servers
4. Route tracing (tracert)
5. Ping tests

## Architecture

- `main.js`: Electron main process, handles system-level operations like executing network commands
- `index.html`: Main UI layout
- `styles.css`: Styling for the application
- `renderer.js`: Renderer process, handles UI interaction and displays results

## Development Notes

- The application uses IPC (Inter-Process Communication) between main and renderer processes
- Network diagnostics are executed using Node.js child_process to run system commands
- UI updates should be responsive and provide real-time feedback during diagnostics
- The application should handle errors gracefully, especially when network commands fail
