# Network Diagnostic Tool

A standalone diagnostic tool for troubleshooting website connectivity issues. This tool allows support engineers to quickly run standard network diagnostics and collect logs without having to visit a customer's location.

## Features

- **Internet Connectivity Check**: Shows real-time status of internet connection
- **Public IP Display**: Shows the user's public IPv4 and IPv6 addresses
- **DNS Lookups**: Performs nslookup using configurable DNS servers
- **Route Tracing**: Traces the route to discovered IP addresses
- **Ping Tests**: Tests connectivity to discovered IP addresses
- **Real-time Output**: Displays diagnostic results in real-time
- **Copy Results**: One-click copying of all diagnostic results
- **Stop Functionality**: Ability to interrupt ongoing diagnostics
- **Website Preview**: Loads the target website for visual verification
- **Screenshot Capture**: Takes 15 screenshots at 1-second intervals
- **Network Information Capture**: Collects detailed network information
- **Automatic File Organization**: Creates a zip file with all diagnostic data

## Usage

1. Enter the website URL that is experiencing issues
2. Optionally configure which DNS servers to use for lookups
3. Click "Run Diagnostics"
4. View the real-time results as they appear
5. The tool will automatically load the website and capture screenshots
6. All diagnostic data is saved to a zip file with a name that includes the website URL
7. Click "Open Zip File Location" to access the complete diagnostic package

## Development

### Prerequisites

- Node.js (v14 or higher)
- npm (v6 or higher)

### Installation

```bash
# Install dependencies
npm install

# Start the application
npm start
```

### Building for Distribution

To build a standalone executable:

```bash
# Package the application
npm run package
```

This will create a distributable package in the `dist` folder.

## Technical Notes

- Built with Electron for cross-platform compatibility
- Uses native Windows commands (nslookup, tracert, ping) for diagnostics
- Website preview with automatic screenshot capture
- Comprehensive data collection including:
  - Diagnostic command outputs
  - Network configuration information
  - Website screenshots
  - All data compiled into a single zip file
- Minimal file size for easy sharing via messaging applications

## Developed by Neel
