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
    // Try to get CPU usage using top command
    const result = await execAsync(
      "top -l 1 | grep 'CPU usage' | awk '{print $3}' | sed 's/%//'"
    );
    const cpuUsage = parseFloat(result.stdout.trim());

    if (!isNaN(cpuUsage)) {
      return {
        success: true,
        usage: cpuUsage.toFixed(1),
        cores: os.cpus().length,
        model: os.cpus()[0].model,
      };
    }

    // Fallback to load average
    const loadAvg = os.loadavg();
    return {
      success: true,
      usage: 'N/A (using load average)',
      loadAverage: {
        '1min': loadAvg[0].toFixed(2),
        '5min': loadAvg[1].toFixed(2),
        '15min': loadAvg[2].toFixed(2),
      },
      cores: os.cpus().length,
      model: os.cpus()[0].model,
    };
  } catch (error) {
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
