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
