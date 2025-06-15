const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const os = require('os');
const url = require('url');

// Keep a global reference of the window object to prevent it from being garbage collected
let mainWindow;

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
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
      
      // Extract IPs from nslookup result - improve the extraction logic
      // Parse the output more carefully to exclude the DNS server IPs
      
      // Split output into lines
      const lines = stdout.split('\n');
      let foundNonAuthoritativeAnswer = false;
      let foundAddressesSection = false;
      
      // Find the "Non-authoritative answer:" section which contains our target IPs
      for (const line of lines) {
        if (line.includes("Non-authoritative answer:")) {
          foundNonAuthoritativeAnswer = true;
          continue;
        }
        
        // After finding the section, look for Address lines
        if (foundNonAuthoritativeAnswer) {
          if (line.includes("Address:")) {
            foundAddressesSection = true;
            // Extract the IP from the line
            const ipMatch = line.match(/Address:\s+([^\s]+)/);
            if (ipMatch && ipMatch[1]) {
              const ip = ipMatch[1];
              // Skip the DNS server IP
              if (ip !== dns) {
                uniqueIPs.add(ip);
              }
            }
          }
          // If we've found addresses and hit an empty line, we're done with this section
          else if (foundAddressesSection && line.trim() === '') {
            foundAddressesSection = false;
          }
        }
      }
      
      // Fallback to regex extraction if no IPs were found using the more structured approach
      if (!foundNonAuthoritativeAnswer || uniqueIPs.size === 0) {
        console.log("Using fallback regex extraction for IPs");
        const ipv4Regex = /Address:\s+(\d+\.\d+\.\d+\.\d+)/g;
        const ipv6Regex = /Address:\s+([0-9a-f:]+)/g;
        
        let match;
        let skipFirstAddress = true; // Skip the first address which is usually the DNS server
        
        while ((match = ipv4Regex.exec(stdout)) !== null) {
          if (skipFirstAddress) {
            skipFirstAddress = false;
            continue;
          }
          if (match[1] !== dns) {
            uniqueIPs.add(match[1]);
          }
        }
        
        while ((match = ipv6Regex.exec(stdout)) !== null) {
          if (match[1] !== dns) {
            uniqueIPs.add(match[1]);
          }
        }
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
