const { app, BrowserWindow, ipcMain, webContents } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const os = require('os');
const url = require('url');
const fs = require('fs');
const AdmZip = require('adm-zip');

// Keep a global reference of the window object to prevent it from being garbage collected
let mainWindow;

function createWindow() {  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 900,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
      webviewTag: true  // Enable the webview tag
    },
    icon: path.join(__dirname, 'assets/icon.png')
  });

  // Load the index.html file
  mainWindow.loadFile('index.html');

  // Open DevTools during development (comment out for production)
  // mainWindow.webContents.openDevTools();

  // Handle window closed event
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Create window when Electron has finished initialization
app.whenReady().then(createWindow);

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On macOS, re-create a window when the dock icon is clicked and no other windows are open
  if (mainWindow === null) {
    createWindow();
  }
});

// Handle IPC messages from renderer process

// Check internet connectivity
ipcMain.on('check-internet', (event) => {
  const testConnection = (callback) => {
    require('dns').lookup('google.com', (err) => {
      callback(err === null);
    });
  };
  
  testConnection((isConnected) => {
    event.reply('internet-status', isConnected);
  });
});

// Get public IP addresses
ipcMain.on('get-public-ips', async (event) => {
  try {
    // Using a different method to get public IP since public-ip has API changes
    const https = require('https');
    let ipv4 = 'Not available';
    let ipv6 = 'Not available';
    
    // Get IPv4
    try {
      ipv4 = await new Promise((resolve, reject) => {
        https.get('https://api.ipify.org', (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            resolve(data);
          });
        }).on('error', (e) => {
          reject(e);
        });
      });
    } catch (err) {
      console.log('IPv4 fetch error:', err.message);
    }
    
    // Get IPv6 (if available)
    try {
      ipv6 = await new Promise((resolve, reject) => {
        const req = https.get('https://api6.ipify.org', (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            resolve(data);
          });
        });
        
        req.on('error', (e) => {
          reject(e);
        });
        
        // Set a timeout for IPv6 (many networks don't support it)
        req.setTimeout(5000, () => {
          req.destroy();
          reject(new Error('Timeout'));
        });
      });
    } catch (err) {
      console.log('IPv6 fetch error:', err.message);
    }
    
    event.reply('public-ips', { ipv4, ipv6 });
  } catch (error) {
    console.log('General IP fetch error:', error);
    event.reply('public-ips', { ipv4: 'Error', ipv6: 'Error' });
  }
});

// Execute nslookup with a specific DNS server
ipcMain.on('run-nslookup', (event, { url, dnsServers }) => {
  let completedLookups = 0;
  let uniqueIPs = new Set();
  
  dnsServers.forEach((dns, index) => {
    const command = `nslookup ${url} ${dns}`;
    
    exec(command, (error, stdout, stderr) => {
      event.reply('diagnostic-output', {
        output: `\n===== NSLOOKUP with DNS ${dns} =====\n${stdout}${stderr || ''}`,
        dnsIndex: index
      });
      
      // Extract IPs from nslookup result
      const lines = stdout.split('\n');
      
      // Flag to indicate when we've found the "Addresses:" section
      let inAddressesSection = false;
      
      for (const line of lines) {
        // Skip DNS server info
        if (line.startsWith('Server:') || line.startsWith('Address:  ' + dns)) {
          continue;
        }
        
        // Look for the line with 'Addresses:' to start capturing IPs
        if (line.includes('Addresses:')) {
          inAddressesSection = true;
          
          // Extract IPv6 address if it's on the same line
          const ipv6Match = line.match(/Addresses:\s+([0-9a-f:]+)/);
          if (ipv6Match && ipv6Match[1]) {
            uniqueIPs.add(ipv6Match[1]);
          }
          
          continue;
        }
        
        // After finding the Addresses section, extract IPs from indented lines
        if (inAddressesSection && line.trim().startsWith('2')) {
          // IPv6 address (starts with 2)
          const ipv6 = line.trim();
          uniqueIPs.add(ipv6);
        } else if (inAddressesSection && /^\s+\d+\.\d+\.\d+\.\d+/.test(line)) {
          // IPv4 address
          const ipv4 = line.trim();
          uniqueIPs.add(ipv4);
        }
        
        // Also check for 'Address:' lines which contain a single IP
        if (line.includes('Address:') && !line.startsWith('Server:')) {
          const ipMatch = line.match(/Address:\s+([0-9a-f:.]+)/);
          if (ipMatch && ipMatch[1] && ipMatch[1] !== dns) {
            uniqueIPs.add(ipMatch[1]);
          }
        }
        
        // Handle the "Name:" line which might include IP information in some formats
        if (line.includes('Name:')) {
          // Move to the next line as IP information is often on the next line
          inAddressesSection = true;
        }
      }
      
      // Fallback to regex for specific patterns if no IPs were found
      if (uniqueIPs.size === 0) {
        console.log("Using fallback regex extraction for IPs");
        
        // Regex for IPv4 addresses
        const ipv4Regex = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
        // More comprehensive IPv6 regex
        const ipv6Regex = /(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))/g;
        
        let match;
        const foundIPs = new Set();
        
        // Extract all IPv4 addresses
        while ((match = ipv4Regex.exec(stdout)) !== null) {
          const ip = match[0];
          // Skip DNS server IPs and local addresses
          if (ip !== dns && !ip.startsWith('127.') && !ip.startsWith('0.0.0.')) {
            foundIPs.add(ip);
          }
        }
        
        // Extract all IPv6 addresses
        while ((match = ipv6Regex.exec(stdout)) !== null) {
          const ip = match[0];
          if (ip !== dns) {
            foundIPs.add(ip);
          }
        }
        
        // Filter out DNS server IPs
        dnsServers.forEach(dnsIP => {
          foundIPs.delete(dnsIP);
        });
        
        // Add the found IPs to our set
        foundIPs.forEach(ip => uniqueIPs.add(ip));
      }
      
      completedLookups++;
      
      // After all lookups are done, start tracert and ping
      if (completedLookups === dnsServers.length) {
        const uniqueIPsArray = Array.from(uniqueIPs);
        console.log("Unique IPs found:", uniqueIPsArray);
        event.reply('nslookup-complete', { uniqueIPs: uniqueIPsArray });
      }
    });
  });
});

// Execute tracert for a specific IP
ipcMain.on('run-tracert', (event, { ip }) => {
  const command = `tracert ${ip}`;
  
  exec(command, (error, stdout, stderr) => {
    event.reply('diagnostic-output', {
      output: `\n===== TRACERT to ${ip} =====\n${stdout}${stderr || ''}`
    });
    
    event.reply('tracert-complete', { ip });
  });
});

// Execute ping for a specific IP
ipcMain.on('run-ping', (event, { ip }) => {
  const command = `ping -n 4 ${ip}`;
  
  exec(command, (error, stdout, stderr) => {
    event.reply('diagnostic-output', {
      output: `\n===== PING to ${ip} =====\n${stdout}${stderr || ''}`
    });
    
    event.reply('ping-complete', { ip });
  });
});

// Handle stopping diagnostics
ipcMain.on('stop-diagnostics', (event) => {
  // Kill any running processes (this is a simplified approach)
  if (process.platform === 'win32') {
    exec('taskkill /F /IM nslookup.exe /T');
    exec('taskkill /F /IM tracert.exe /T');
    exec('taskkill /F /IM ping.exe /T');
  } else {
    exec('pkill -f nslookup');
    exec('pkill -f traceroute');
    exec('pkill -f ping');
  }
  
  event.reply('diagnostics-stopped');
});

// Save diagnostic output to a file
ipcMain.on('save-diagnostic-output', (event, { diagnosticOutput }) => {
  const timestamp = new Date().getTime();
  const outputFileName = `diagnostic_output_${timestamp}.txt`;
  const outputFilePath = path.join(app.getPath('userData'), outputFileName);
  
  fs.writeFileSync(outputFilePath, diagnosticOutput);
  
  event.reply('diagnostic-output-saved', { outputFilePath });
});

// Start packet capture
ipcMain.on('start-packet-capture', (event, { url }) => {
  const timestamp = new Date().getTime();
  const captureFileName = `packet_capture_${timestamp}.txt`;
  const captureFilePath = path.join(app.getPath('userData'), captureFileName);
  
  event.reply('diagnostic-output', {
    output: `\n===== STARTING NETWORK INFORMATION CAPTURE =====\nURL: ${url}\n`
  });
  
  // Get domain from URL
  let domain = url.replace('https://', '').replace('http://', '').split('/')[0];
  
  // Use a simpler approach with individual commands
  const captureNetworkInfo = async () => {
    try {
      let networkInfo = '';
      
      // Add header information
      networkInfo += `NETWORK DIAGNOSTIC CAPTURE\n`;
      networkInfo += `Target: ${domain}\n`;
      networkInfo += `Time: ${new Date().toString()}\n`;
      networkInfo += `----------------------------------------\n\n`;
      
      // TCP Connection check - using simpler ping instead of Test-NetConnection
      networkInfo += `PING TEST:\n`;
      await new Promise((resolve) => {
        exec(`ping -n 4 ${domain}`, (error, stdout) => {
          networkInfo += stdout + '\n\n';
          resolve();
        });
      });
      
      // IP Configuration
      networkInfo += `IP CONFIGURATION:\n`;
      await new Promise((resolve) => {
        exec('ipconfig /all', (error, stdout) => {
          networkInfo += stdout + '\n\n';
          resolve();
        });
      });
      
      // Connection statistics
      networkInfo += `CONNECTION STATISTICS:\n`;
      await new Promise((resolve) => {
        exec('netstat -an | findstr ESTABLISHED', (error, stdout) => {
          networkInfo += stdout + '\n\n';
          resolve();
        });
      });
      
      // Route information
      networkInfo += `ROUTE INFORMATION:\n`;
      await new Promise((resolve) => {
        exec('route print', (error, stdout) => {
          networkInfo += stdout + '\n\n';
          resolve();
        });
      });
      
      // DNS resolution
      networkInfo += `DNS LOOKUP:\n`;
      await new Promise((resolve) => {
        exec(`nslookup ${domain}`, (error, stdout) => {
          networkInfo += stdout + '\n\n';
          resolve();
        });
      });
      
      // Write to file
      require('fs').writeFileSync(captureFilePath, networkInfo);
      
      event.reply('diagnostic-output', {
        output: `\n===== NETWORK INFORMATION CAPTURE COMPLETE =====\nFile saved at: ${captureFilePath}\n`
      });
      
      event.reply('packet-capture-complete', { 
        captureFilePath,
        captureFileType: 'TXT'
      });
      
    } catch (error) {
      event.reply('diagnostic-output', {
        output: `Warning: Network capture encountered an issue: ${error.message}\nWill continue with website loading.`
      });
      event.reply('packet-capture-error');
    }
  };
  
  // Start the capture process
  captureNetworkInfo();
  
  // Immediately notify the renderer that we've started
  event.reply('packet-capture-started', { captureFilePath });
});

// Capture screenshots of the website preview
ipcMain.on('capture-screenshots', async (event, { webContentsId }) => {
  try {
    const timestamp = new Date().getTime();
    const screenshotDir = path.join(app.getPath('userData'), 'screenshots');
    
    // Create screenshots directory if it doesn't exist
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }
    
    // Get a reference to the webview's webContents
    let webviewContents = null;
    
    if (webContentsId) {
      try {
        webviewContents = webContents.fromId(webContentsId);
      } catch (e) {
        console.error("Error accessing webContents:", e);
      }
    }
    
    if (!webviewContents) {
      // Fallback: Try to capture the mainWindow instead
      webviewContents = mainWindow.webContents;
      event.reply('diagnostic-output', {
        output: `\nNote: Using main window for screenshots instead of website preview\n`
      });
    }
    
    const screenshotFiles = [];
    const totalScreenshots = 15;
    
    // Take 15 screenshots, 1 per second
    for (let i = 1; i <= totalScreenshots; i++) {      // Update progress
      event.reply('screenshot-progress', { 
        current: i, 
        total: totalScreenshots 
      });
      
      // Capture screenshot - using simpler approach
      try {
        // Simple page capture without trying to calculate dimensions
        const image = await webviewContents.capturePage();
        const screenshotPath = path.join(screenshotDir, `screenshot_${timestamp}_${i}.png`);
          // Save screenshot
        fs.writeFileSync(screenshotPath, image.toPNG());
        screenshotFiles.push(screenshotPath);
      } catch (error) {
        console.error(`Error capturing screenshot ${i}:`, error);
        event.reply('diagnostic-output', {
          output: `\nWarning: Error capturing screenshot ${i}: ${error.message}\n`
        });
      }
      
      // Wait for 1 second before taking next screenshot
      if (i < totalScreenshots) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    event.reply('screenshots-complete', { 
      screenshotFiles,
      screenshotCount: screenshotFiles.length
    });
    
    event.reply('diagnostic-output', {
      output: `\n===== SCREENSHOT CAPTURE COMPLETE =====\n${screenshotFiles.length} screenshots captured\n`
    });
    
  } catch (error) {
    console.error('Screenshot capture error:', error);
    event.reply('screenshot-error', { error: error.message });
    event.reply('diagnostic-output', {
      output: `\nWarning: Screenshot capture encountered an issue: ${error.message}\n`
    });
  }
});

// Open file location
ipcMain.on('open-file-location', (event, { filePath }) => {
  if (process.platform === 'win32') {
    // On Windows, use explorer to open the folder and select the file
    exec(`explorer.exe /select,"${filePath}"`);
  } else if (process.platform === 'darwin') {
    // On macOS
    exec(`open -R "${filePath}"`);
  } else {
    // On Linux, just open the folder
    exec(`xdg-open "${path.dirname(filePath)}"`);
  }
});

// Create a zip file with all diagnostic data
ipcMain.on('create-diagnostic-zip', (event, { diagnosticOutputText, filesToZip, targetUrl }) => {
  try {
    const timestamp = new Date().getTime();
    // Extract domain from URL for filename
    let urlForFilename = targetUrl || 'website';
    urlForFilename = urlForFilename.replace(/^https?:\/\//, '')  // Remove http:// or https://
                                   .replace(/[\/\\:*?"<>|]/g, '_'); // Replace invalid filename chars
    
    // Limit the length to avoid extremely long filenames
    if (urlForFilename.length > 50) {
      urlForFilename = urlForFilename.substring(0, 50);
    }
    
    const zipFileName = `website_diagnostics_${urlForFilename}_${timestamp}.zip`;
    const zipFilePath = path.join(app.getPath('userData'), zipFileName);
    
    // Create a new zip file
    const zip = new AdmZip();
    
    // Add diagnostic output text to zip
    if (diagnosticOutputText) {
      const diagnosticOutputFile = path.join(app.getPath('userData'), `diagnostic_output_${timestamp}.txt`);
      fs.writeFileSync(diagnosticOutputFile, diagnosticOutputText);
      zip.addLocalFile(diagnosticOutputFile, "", "diagnostic_output.txt");
    }
    
    // Add all files to the zip with meaningful names
    filesToZip.forEach(file => {
      if (fs.existsSync(file)) {
        // Extract the base name of the file
        const basename = path.basename(file);
        let entryName = basename;
        
        // Give meaningful names based on file content/type
        if (basename.startsWith('packet_capture_')) {
          entryName = "network_information.txt";
        } else if (basename.startsWith('screenshot_')) {
          // Keep screenshot names as is, they have numbers
        } else if (basename.startsWith('diagnostic_output_')) {
          // Skip - we already added this with a better name
          return;
        }
        
        zip.addLocalFile(file, "", entryName);
      }
    });
    
    // Write the zip file to disk
    zip.writeZip(zipFilePath);
    
    event.reply('zip-created', { zipFilePath });
    
    event.reply('diagnostic-output', {
      output: `\n===== ZIP FILE CREATED =====\nAll diagnostic data has been compiled into: ${zipFilePath}\n`
    });
  } catch (error) {
    console.error('Error creating zip file:', error);
    event.reply('zip-error', { error: error.message });
    
    event.reply('diagnostic-output', {
      output: `\nError creating zip file: ${error.message}\n`
    });
  }
});
