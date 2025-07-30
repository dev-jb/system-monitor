const express = require('express');
const { exec } = require('child_process');
const { promisify } = require('util');
const os = require('os');

const execAsync = promisify(exec);
const app = express();
const PORT = process.env.PORT || 8081;

// Get system RAM usage
async function getRamUsage() {
  try {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const percentage = ((usedMem / totalMem) * 100).toFixed(1);

    return {
      success: true,
      total: `${(totalMem / 1024 / 1024 / 1024).toFixed(1)}GB`,
      used: `${(usedMem / 1024 / 1024 / 1024).toFixed(1)}GB`,
      available: `${(freeMem / 1024 / 1024 / 1024).toFixed(1)}GB`,
      percentage: percentage,
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Get disk usage
async function getDiskUsage() {
  try {
    const result = await execAsync('df -h .');
    const lines = result.stdout.trim().split('\n');

    if (lines.length >= 2) {
      const parts = lines[1].split(/\s+/);

      if (parts.length >= 5) {
        return {
          success: true,
          total: parts[1],
          used: parts[2],
          available: parts[3],
          usage_percent: parts[4].replace('%', ''),
        };
      }
    }

    return { success: false, error: 'Could not parse disk usage' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Get CPU usage
async function getCpuUsage() {
  try {
    const platform = os.platform();
    console.log(`🔍 System Monitor - Detected platform: ${platform}`);
    let cpuUsage;

    if (platform === 'darwin') {
      // macOS
      console.log('🍎 System Monitor - Using macOS CPU monitoring...');
      try {
        const result = await execAsync(
          "top -l 1 | grep 'CPU usage' | awk '{print $3}' | sed 's/%//'"
        );
        cpuUsage = parseFloat(result.stdout.trim());
        console.log(
          `📊 macOS top command result: ${result.stdout.trim()} -> ${cpuUsage}`
        );

        if (!isNaN(cpuUsage) && cpuUsage >= 0 && cpuUsage <= 100) {
          return {
            success: true,
            usage: cpuUsage.toFixed(1),
            usageType: 'percentage',
            cores: os.cpus().length,
            model: os.cpus()[0].model,
            platform: platform,
          };
        }
      } catch (error) {
        console.log('⚠️ macOS CPU monitoring failed:', error.message);
      }
    } else if (platform === 'linux') {
      // Linux/Ubuntu
      console.log('🐧 System Monitor - Using Linux CPU monitoring...');

      // Method 1: Try using /proc/loadavg (most reliable)
      try {
        const loadAvgResult = await execAsync('cat /proc/loadavg');
        const loadAvg = loadAvgResult.stdout.trim().split(' ')[0];
        const cpuCount = os.cpus().length;

        // Convert load average to CPU percentage (rough approximation)
        // Load average of 1.0 = 100% CPU usage for a single core
        const loadPercentage = (parseFloat(loadAvg) / cpuCount) * 100;
        cpuUsage = Math.min(loadPercentage, 100); // Cap at 100%

        console.log(
          `📊 Load average: ${loadAvg}, CPU cores: ${cpuCount}, Estimated CPU: ${cpuUsage.toFixed(
            1
          )}%`
        );

        return {
          success: true,
          usage: cpuUsage.toFixed(1),
          usageType: 'percentage',
          cores: cpuCount,
          model: os.cpus()[0].model,
          platform: platform,
        };
      } catch (loadError) {
        console.log(
          '⚠️ Load average method failed, trying vmstat...',
          loadError.message
        );

        // Method 2: Try vmstat
        try {
          const vmstatResult = await execAsync('vmstat 1 2 | tail -1');
          const vmstatParts = vmstatResult.stdout.trim().split(/\s+/);

          if (vmstatParts.length >= 15) {
            const idle = parseFloat(vmstatParts[14]);
            cpuUsage = 100 - idle;
            console.log(
              `📊 vmstat result: idle=${idle}%, cpu=${cpuUsage.toFixed(1)}%`
            );

            return {
              success: true,
              usage: cpuUsage.toFixed(1),
              usageType: 'percentage',
              cores: os.cpus().length,
              model: os.cpus()[0].model,
              platform: platform,
            };
          } else {
            throw new Error('vmstat output format not recognized');
          }
        } catch (vmstatError) {
          console.log(
            '⚠️ vmstat method failed, trying top...',
            vmstatError.message
          );

          // Method 3: Try top (if available)
          try {
            const topResult = await execAsync(
              "top -bn1 | grep 'Cpu(s)' | awk '{print $2}' | sed 's/%us,//'"
            );
            cpuUsage = parseFloat(topResult.stdout.trim());
            console.log(
              `📊 top command result: ${topResult.stdout.trim()} -> ${cpuUsage}`
            );

            if (!isNaN(cpuUsage) && cpuUsage >= 0 && cpuUsage <= 100) {
              return {
                success: true,
                usage: cpuUsage.toFixed(1),
                usageType: 'percentage',
                cores: os.cpus().length,
                model: os.cpus()[0].model,
                platform: platform,
              };
            }
          } catch (topError) {
            console.log(
              '⚠️ top method failed, trying mpstat...',
              topError.message
            );

            // Method 4: Try mpstat (if available)
            try {
              const mpstatResult = await execAsync(
                "mpstat 1 1 | tail -1 | awk '{print 100-$NF}'"
              );
              cpuUsage = parseFloat(mpstatResult.stdout.trim());
              console.log(
                `📊 mpstat result: ${mpstatResult.stdout.trim()} -> ${cpuUsage}`
              );

              if (!isNaN(cpuUsage) && cpuUsage >= 0 && cpuUsage <= 100) {
                return {
                  success: true,
                  usage: cpuUsage.toFixed(1),
                  usageType: 'percentage',
                  cores: os.cpus().length,
                  model: os.cpus()[0].model,
                  platform: platform,
                };
              }
            } catch (mpstatError) {
              console.log(
                '⚠️ All CPU monitoring methods failed, using load average fallback',
                mpstatError.message
              );
            }
          }
        }
      }
    } else {
      // Other platforms - fallback to load average
      console.log(
        '🔄 System Monitor - Using load average fallback for platform:',
        platform
      );
    }

    // Final fallback to os.loadavg() if all methods fail
    console.log('🔄 System Monitor - Using final load average fallback...');
    const loadAvg = os.loadavg();
    const cpuCount = os.cpus().length;
    const loadPercentage = (loadAvg[0] / cpuCount) * 100;
    cpuUsage = Math.min(loadPercentage, 100);

    console.log(
      `📊 Load average fallback: ${
        loadAvg[0]
      } / ${cpuCount} cores = ${cpuUsage.toFixed(1)}%`
    );

    return {
      success: true,
      usage: cpuUsage.toFixed(1),
      usageType: 'percentage',
      cores: cpuCount,
      model: os.cpus()[0].model,
      platform: platform,
    };
  } catch (error) {
    console.log(`💥 System Monitor - CPU usage error:`, error);
    return { success: false, error: error.message };
  }
}

// Main system resources endpoint
app.get('/system', async (req, res) => {
  try {
    const ram = await getRamUsage();
    const disk = await getDiskUsage();
    const cpu = await getCpuUsage();

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      ram,
      disk,
      cpu,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🔧 System Monitor running on port ${PORT}`);
  console.log(
    `📊 System resources available at: http://localhost:${PORT}/system`
  );
});

module.exports = { getRamUsage, getDiskUsage, getCpuUsage };
