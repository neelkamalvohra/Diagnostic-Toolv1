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
  
  // Update UI
  isRunningDiagnostics = true;
  runButton.disabled = true;
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
  stopButton.disabled = true;
  progressStatus.textContent = '';
}

// Check if all diagnostics are complete
function checkDiagnosticsComplete() {
  if (completedTracerts === totalIPs && completedPings === totalIPs) {
    appendOutput('\nDIAGNOSTICS COMPLETE\n');
    progressStatus.textContent = '(Complete)';
    resetDiagnosticUI();
    copyButton.disabled = false;
  }
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
  appendOutput(`\nFound ${totalIPs} unique IP addresses: ${ips.join(', ')}\n`);
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

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  checkInternetConnectivity();
  getPublicIPs();
  
  // Periodically check internet connectivity
  setInterval(checkInternetConnectivity, 5000); // Every 5 seconds
});
