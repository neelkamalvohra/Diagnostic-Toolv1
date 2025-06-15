// Import required modules
const { ipcRenderer } = require('electron');

// DOM Elements
const internetStatus = document.getElementById('internetStatus');
const ipv4Element = document.getElementById('ipv4');
const ipv6Element = document.getElementById('ipv6');
const urlInput = document.getElementById('urlInput');
const runButton = document.getElementById('runButton');
const stopButton = document.getElementById('stopButton');
const copyButton = document.getElementById('copyButton');
const outputArea = document.getElementById('outputArea');
const progressStatus = document.getElementById('progressStatus');
const websitePreviewContainer = document.getElementById('websitePreviewContainer');
const websitePreview = document.getElementById('websitePreview');

// DNS Server checkboxes and inputs
const dnsCheckboxes = [
  document.getElementById('dns1-check'),
  document.getElementById('dns2-check'),
  document.getElementById('dns3-check'),
  document.getElementById('dns4-check')
];

const dnsInputs = [
  document.getElementById('dns1'),
  document.getElementById('dns2'),
  document.getElementById('dns3'),
  document.getElementById('dns4')
];

// State variables
let isRunningDiagnostics = false;
let uniqueIPs = [];
let completedTracerts = 0;
let completedPings = 0;
let totalIPs = 0;
let captureFilePath = null;
let captureFileType = null;
let screenshotFiles = [];
let diagnosticOutputFilePath = null;
let zipFilePath = null;

// Check internet connectivity
function checkInternetConnectivity() {
  ipcRenderer.send('check-internet');
}

// Get public IP addresses
function getPublicIPs() {
  ipcRenderer.send('get-public-ips');
}

// Run diagnostics
function runDiagnostics() {
  if (!urlInput.value) {
    alert('Please enter a website URL');
    return;
  }
  
  // Clear previous results
  outputArea.textContent = '';
  uniqueIPs = [];
  completedTracerts = 0;
  completedPings = 0;
  screenshotFiles = [];
  diagnosticOutputFilePath = null;
  zipFilePath = null;
  
  // Hide website preview
  websitePreviewContainer.style.display = 'none';
  
  // Update UI
  isRunningDiagnostics = true;
  runButton.disabled = true;
  runButton.classList.add('button-with-spinner');
  runButton.innerHTML = '<span class="button-spinner"></span>Running...';
  stopButton.disabled = false;
  copyButton.disabled = true;
  progressStatus.textContent = '(Running...)';
  // Get selected DNS servers
  const selectedDNS = dnsCheckboxes
    .map((checkbox, index) => checkbox.checked ? dnsInputs[index].value : null)
    .filter(dns => dns !== null);
  
  if (selectedDNS.length === 0) {
    alert('Please select at least one DNS server');
    resetDiagnosticUI();
    return;
  }
  
  // Add timestamp to output
  const timestamp = new Date().toLocaleString();
  appendOutput(`DIAGNOSTIC RUN: ${timestamp}\nTarget URL: ${urlInput.value}\n`);
  
  // Start with public IP information
  appendOutput(`Public IPv4: ${ipv4Element.textContent}`);
  appendOutput(`Public IPv6: ${ipv6Element.textContent}\n`);
  
  // Run nslookup with selected DNS servers
  ipcRenderer.send('run-nslookup', {
    url: urlInput.value,
    dnsServers: selectedDNS
  });
}

// Stop diagnostics
function stopDiagnostics() {
  ipcRenderer.send('stop-diagnostics');
  resetDiagnosticUI();
  appendOutput('\nDIAGNOSTICS STOPPED BY USER\n');
  
  // Hide website preview
  websitePreviewContainer.style.display = 'none';
}

// Copy results
function copyResults() {
  navigator.clipboard.writeText(outputArea.textContent)
    .then(() => {
      const originalText = copyButton.textContent;
      copyButton.textContent = 'Copied!';
      setTimeout(() => {
        copyButton.textContent = originalText;
      }, 2000);
    })
    .catch(err => {
      console.error('Failed to copy: ', err);
    });
}

// Append text to output area
function appendOutput(text) {
  outputArea.textContent += text + '\n';
  outputArea.scrollTop = outputArea.scrollHeight; // Auto-scroll to bottom
}

// Reset diagnostic UI
function resetDiagnosticUI() {
  isRunningDiagnostics = false;
  runButton.disabled = false;
  runButton.classList.remove('button-with-spinner');
  runButton.textContent = 'Run Diagnostics';
  stopButton.disabled = true;
  progressStatus.textContent = '';
}

// Save diagnostic output to file
function saveDiagnosticOutput() {
  const diagnosticOutput = outputArea.textContent;
  ipcRenderer.send('save-diagnostic-output', { diagnosticOutput });
}

// Check if all diagnostics are complete
function checkDiagnosticsComplete() {
  if (completedTracerts === totalIPs && completedPings === totalIPs) {
    appendOutput('\nDIAGNOSTICS COMPLETE\n');
    progressStatus.textContent = '(Complete)';
    
    // Save diagnostic output
    saveDiagnosticOutput();
    
    // Load the website in the preview pane
    loadWebsitePreview();
    
    resetDiagnosticUI();
    copyButton.disabled = false;
  }
}

// Load website in the preview pane
function loadWebsitePreview() {
  appendOutput('\nPreparing website preview...\n');
  
  // Show the preview container
  websitePreviewContainer.style.display = 'block';
  
  // Ensure URL has proper format
  let url = urlInput.value.trim();
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }
  
  // Start packet capture before loading the website
  startPacketCapture(url);
}

// Start packet capture
function startPacketCapture(url) {
  // Clear previous capture file
  captureFilePath = null;
  captureFileType = null;
  
  // Send request to start packet capture
  ipcRenderer.send('start-packet-capture', { url });
}

// Load website after packet capture starts
function loadWebsiteAfterCapture() {
  // Ensure URL has proper format
  let url = urlInput.value.trim();
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }
  
  // Load the URL in the webview
  websitePreview.src = url;
  
  // Add event listener for when webview has loaded
  websitePreview.addEventListener('did-finish-load', handleWebviewLoaded);
  
  // Scroll to the preview
  setTimeout(() => {
    websitePreviewContainer.scrollIntoView({ behavior: 'smooth' });
  }, 500);
}

// Handle webview loaded event
function handleWebviewLoaded() {
  // Remove the event listener to prevent multiple calls
  websitePreview.removeEventListener('did-finish-load', handleWebviewLoaded);
  
  try {
    // Simply use a fixed zoom factor without trying to calculate dimensions
    // This is more reliable across different websites
    websitePreview.setZoomFactor(0.7);
    
    // Wait a moment for the zoom to take effect
    setTimeout(() => {
      // Start screenshot capture
      startScreenshotCapture();
    }, 1000);
  } catch (error) {
    console.error('Error setting zoom factor:', error);
    // Start screenshot capture anyway
    startScreenshotCapture();
  }
}

// Start capturing screenshots of the website
function startScreenshotCapture() {
  // Wait a moment for the website to fully render with adjusted size
  setTimeout(() => {
    appendOutput('\nStarting screenshot capture (1 per second for 15 seconds)...');
    progressStatus.textContent = '(Capturing screenshots: 0/15)';
    
    // Get the webContents ID for the webview
    const webContentsId = websitePreview.getWebContentsId();
    
    // Send request to capture screenshots
    ipcRenderer.send('capture-screenshots', { webContentsId });
  }, 1000);
}

// Create zip file with all collected data
function createDiagnosticZip() {
  const diagnosticOutputText = outputArea.textContent;
  const filesToZip = [];
  
  // Get the target URL for the zip filename
  const targetUrl = urlInput.value.trim();
  
  // Add network capture file
  if (captureFilePath) {
    filesToZip.push(captureFilePath);
  }
  
  // Add diagnostic output file
  if (diagnosticOutputFilePath) {
    filesToZip.push(diagnosticOutputFilePath);
  }
  
  // Add screenshot files
  if (screenshotFiles.length > 0) {
    screenshotFiles.forEach(file => filesToZip.push(file));
  }
  
  // Create zip file
  ipcRenderer.send('create-diagnostic-zip', {
    diagnosticOutputText,
    filesToZip,
    targetUrl
  });
}

// Event Listeners
runButton.addEventListener('click', runDiagnostics);
stopButton.addEventListener('click', stopDiagnostics);
copyButton.addEventListener('click', copyResults);

// IPC Listeners
ipcRenderer.on('internet-status', (event, isConnected) => {
  internetStatus.classList.remove('status-online', 'status-offline');
  internetStatus.classList.add(isConnected ? 'status-online' : 'status-offline');
});

ipcRenderer.on('public-ips', (event, { ipv4, ipv6 }) => {
  ipv4Element.textContent = ipv4;
  ipv6Element.textContent = ipv6;
});

ipcRenderer.on('diagnostic-output', (event, { output, dnsIndex }) => {
  appendOutput(output);
});

ipcRenderer.on('diagnostic-output-saved', (event, { outputFilePath }) => {
  diagnosticOutputFilePath = outputFilePath;
  appendOutput(`\nDiagnostic output saved to: ${outputFilePath}\n`);
});

ipcRenderer.on('nslookup-complete', (event, { uniqueIPs: ips }) => {
  uniqueIPs = ips;
  totalIPs = ips.length;
  
  if (totalIPs === 0) {
    appendOutput('\nNo IP addresses found in nslookup results\n');
    progressStatus.textContent = '(Complete)';
    resetDiagnosticUI();
    copyButton.disabled = false;
    return;
  }
  
  // Start tracert for each unique IP
  appendOutput(`\nFound ${totalIPs} unique IP addresses:`);
  ips.forEach(ip => {
    appendOutput(`  - ${ip}`);
  });
  
  appendOutput(`\nStarting traceroute and ping tests for each IP...\n`);
  
  ips.forEach(ip => {
    ipcRenderer.send('run-tracert', { ip });
  });
});

ipcRenderer.on('tracert-complete', (event, { ip }) => {
  completedTracerts++;
  
  // Start ping after tracert is complete
  ipcRenderer.send('run-ping', { ip });
  
  checkDiagnosticsComplete();
});

ipcRenderer.on('ping-complete', (event, { ip }) => {
  completedPings++;
  checkDiagnosticsComplete();
});

ipcRenderer.on('diagnostics-stopped', () => {
  resetDiagnosticUI();
});

// Packet capture events
ipcRenderer.on('packet-capture-started', (event, { captureFilePath: filePath }) => {
  captureFilePath = filePath;
  
  // Load the website after packet capture has started
  loadWebsiteAfterCapture();
});

ipcRenderer.on('packet-capture-complete', (event, { captureFilePath: filePath, captureFileType: fileType }) => {
  captureFilePath = filePath;
  captureFileType = fileType;
  
  appendOutput(`\nNetwork information captured and saved to: ${captureFilePath}\n`);
  appendOutput(`File type: ${captureFileType} (plain text file with network diagnostics)\n`);
});

ipcRenderer.on('packet-capture-error', () => {
  // If packet capture fails, still load the website
  loadWebsiteAfterCapture();
});

// Screenshot events
ipcRenderer.on('screenshot-progress', (event, { current, total }) => {
  progressStatus.textContent = `(Capturing screenshots: ${current}/${total})`;
});

ipcRenderer.on('screenshots-complete', (event, { screenshotFiles: files, screenshotCount }) => {
  screenshotFiles = files;
  progressStatus.textContent = '';
  appendOutput(`\n${screenshotCount} screenshots captured successfully.`);
  
  // Create the zip file with all collected data
  createDiagnosticZip();
});

ipcRenderer.on('screenshot-error', (event, { error }) => {
  appendOutput(`\nError capturing screenshots: ${error}`);
  
  // Still create the zip with whatever data we have
  createDiagnosticZip();
});

// Zip events
ipcRenderer.on('zip-created', (event, { zipFilePath: filePath }) => {
  zipFilePath = filePath;
  
  // Create "Open Zip File" button
  const openZipButton = document.createElement('button');
  openZipButton.textContent = 'Open Zip File Location';
  openZipButton.className = 'capture-file-button';
  openZipButton.onclick = () => {
    ipcRenderer.send('open-file-location', { filePath: zipFilePath });
  };
  
  // Add to output area or another designated location
  const buttonContainer = document.createElement('div');
  buttonContainer.className = 'capture-button-container';
  buttonContainer.appendChild(openZipButton);
  
  // Check if there's already a button container and replace it
  const existingContainer = document.querySelector('.capture-button-container');
  if (existingContainer) {
    existingContainer.parentNode.replaceChild(buttonContainer, existingContainer);
  } else {
    // Append after output area
    outputArea.parentNode.insertBefore(buttonContainer, outputArea.nextSibling);
  }
});

ipcRenderer.on('zip-error', (event, { error }) => {
  appendOutput(`\nError creating zip file: ${error}`);
});

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  checkInternetConnectivity();
  getPublicIPs();
  
  // Periodically check internet connectivity
  setInterval(checkInternetConnectivity, 5000); // Every 5 seconds
});
