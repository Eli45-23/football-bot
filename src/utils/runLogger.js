const timeUtils = require('./time');

/**
 * Centralized Run Logger for NFL Discord Bot
 * Captures and organizes all logs for a specific update run
 */
class RunLogger {
  constructor() {
    this.runLogs = new Map(); // runId -> log entries
    this.currentRunId = null;
    this.originalConsole = {};
    this.isCapturing = false;
    
    console.log('📝 RunLogger initialized');
  }

  /**
   * Start capturing logs for a specific run
   * @param {string} updateType - morning|afternoon|evening|test
   * @param {string} timeStr - Formatted time string
   * @returns {string} Generated run ID
   */
  startRun(updateType, timeStr) {
    const timestamp = Date.now();
    const runId = `${updateType}_${timestamp}`;
    
    this.currentRunId = runId;
    this.runLogs.set(runId, {
      runId,
      updateType,
      timeStr,
      startTime: timestamp,
      endTime: null,
      logs: [],
      metrics: {
        errors: 0,
        warnings: 0,
        infos: 0,
        successes: 0
      },
      status: 'running'
    });
    
    if (process.env.ENABLE_COMPREHENSIVE_LOGGING === 'true') {
      this.startCapture();
    }
    
    console.log(`📊 Starting centralized logging for ${updateType} run (ID: ${runId})`);
    return runId;
  }

  /**
   * End the current run and finalize logs
   * @param {string} status - completed|failed|skipped
   * @param {Object} finalMetrics - Final metrics to include
   */
  endRun(status = 'completed', finalMetrics = {}) {
    if (!this.currentRunId) return;
    
    const runData = this.runLogs.get(this.currentRunId);
    if (!runData) return;
    
    runData.endTime = Date.now();
    runData.status = status;
    runData.duration = runData.endTime - runData.startTime;
    runData.finalMetrics = finalMetrics;
    
    if (this.isCapturing) {
      this.stopCapture();
    }
    
    // Generate summary
    const summary = this.generateRunSummary(runData);
    console.log(`📊 Run summary for ${runData.updateType}:`);
    console.log(summary);
    
    // Cleanup old runs (keep last 10)
    this.cleanupOldRuns();
    
    this.currentRunId = null;
  }

  /**
   * Log an entry for the current run
   * @param {string} level - error|warn|info|success
   * @param {string} message - Log message
   * @param {Object} data - Additional data
   */
  log(level, message, data = {}) {
    if (!this.currentRunId) return;
    
    const runData = this.runLogs.get(this.currentRunId);
    if (!runData) return;
    
    const entry = {
      timestamp: Date.now(),
      level,
      message,
      data,
      relativeTime: Date.now() - runData.startTime
    };
    
    runData.logs.push(entry);
    runData.metrics[level === 'error' ? 'errors' : 
                    level === 'warn' ? 'warnings' : 
                    level === 'success' ? 'successes' : 'infos']++;
  }

  /**
   * Start capturing console output
   */
  startCapture() {
    if (this.isCapturing) return;
    
    this.originalConsole = {
      log: console.log,
      error: console.error,
      warn: console.warn
    };
    
    const self = this;
    
    console.log = (...args) => {
      self.originalConsole.log(...args);
      self.captureConsoleOutput('info', args);
    };
    
    console.error = (...args) => {
      self.originalConsole.error(...args);
      self.captureConsoleOutput('error', args);
    };
    
    console.warn = (...args) => {
      self.originalConsole.warn(...args);
      self.captureConsoleOutput('warn', args);
    };
    
    this.isCapturing = true;
  }

  /**
   * Stop capturing console output
   */
  stopCapture() {
    if (!this.isCapturing) return;
    
    console.log = this.originalConsole.log;
    console.error = this.originalConsole.error;
    console.warn = this.originalConsole.warn;
    
    this.isCapturing = false;
  }

  /**
   * Capture console output for current run
   * @param {string} level - Log level
   * @param {Array} args - Console arguments
   */
  captureConsoleOutput(level, args) {
    const message = args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(' ');
    
    // Filter out our own logging messages to avoid recursion
    if (message.includes('📊 Run summary') || message.includes('RunLogger')) {
      return;
    }
    
    this.log(level, message);
  }

  /**
   * Generate a comprehensive run summary
   * @param {Object} runData - Run data
   * @returns {string} Formatted summary
   */
  generateRunSummary(runData) {
    const duration = timeUtils.formatDuration(runData.duration);
    const { metrics } = runData;
    
    const lines = [
      `   🏷️  Run ID: ${runData.runId}`,
      `   ⏱️  Duration: ${duration}`,
      `   🎯 Status: ${runData.status}`,
      `   📊 Metrics: ${metrics.successes} successes, ${metrics.infos} infos, ${metrics.warnings} warnings, ${metrics.errors} errors`
    ];
    
    if (runData.finalMetrics) {
      const fm = runData.finalMetrics;
      if (fm.totalProcessed) {
        lines.push(`   🔢 Processed: ${fm.totalProcessed} teams, ${fm.successfulRequests} successful`);
      }
      if (fm.contentHash) {
        lines.push(`   🔒 Content Hash: ${fm.contentHash.substring(0, 12)}...`);
      }
      if (fm.gptCalls !== undefined) {
        lines.push(`   🤖 GPT: ${fm.gptCalls} calls, ${fm.gptTokens || 0} tokens`);
      }
    }
    
    // Add error summary if any
    if (metrics.errors > 0) {
      const errorLogs = runData.logs.filter(log => log.level === 'error');
      lines.push(`   ❌ Recent errors:`);
      errorLogs.slice(-3).forEach(log => {
        lines.push(`      • ${log.message.substring(0, 80)}...`);
      });
    }
    
    return lines.join('\n');
  }

  /**
   * Get run data for monitoring
   * @param {string} runId - Run ID (optional, defaults to current)
   * @returns {Object|null} Run data
   */
  getRunData(runId = null) {
    const targetId = runId || this.currentRunId;
    return targetId ? this.runLogs.get(targetId) : null;
  }

  /**
   * Get recent runs for monitoring
   * @param {number} limit - Number of recent runs to return
   * @returns {Array} Recent run data
   */
  getRecentRuns(limit = 5) {
    const runs = Array.from(this.runLogs.values());
    return runs
      .sort((a, b) => b.startTime - a.startTime)
      .slice(0, limit)
      .map(run => ({
        runId: run.runId,
        updateType: run.updateType,
        startTime: run.startTime,
        duration: run.duration,
        status: run.status,
        metrics: run.metrics
      }));
  }

  /**
   * Cleanup old runs to prevent memory bloat
   */
  cleanupOldRuns() {
    const allRuns = Array.from(this.runLogs.entries());
    const sortedRuns = allRuns.sort((a, b) => b[1].startTime - a[1].startTime);
    
    if (sortedRuns.length > 10) {
      const toDelete = sortedRuns.slice(10);
      toDelete.forEach(([runId]) => {
        this.runLogs.delete(runId);
      });
      
      console.log(`🧹 Cleaned up ${toDelete.length} old run logs`);
    }
  }

  /**
   * Export run logs for external monitoring
   * @param {string} runId - Run ID to export
   * @returns {Object} Exportable run data
   */
  exportRun(runId) {
    const runData = this.runLogs.get(runId);
    if (!runData) return null;
    
    return {
      ...runData,
      formattedStartTime: timeUtils.formatTimestamp(runData.startTime, 'full'),
      formattedEndTime: runData.endTime ? timeUtils.formatTimestamp(runData.endTime, 'full') : null,
      formattedDuration: runData.duration ? timeUtils.formatDuration(runData.duration) : null
    };
  }

  /**
   * Get diagnostic information
   * @returns {Object} Diagnostic data
   */
  getDiagnostics() {
    return {
      currentRunId: this.currentRunId,
      totalRuns: this.runLogs.size,
      isCapturing: this.isCapturing,
      comprehensiveLogging: process.env.ENABLE_COMPREHENSIVE_LOGGING === 'true',
      recentRuns: this.getRecentRuns(3)
    };
  }
}

// Export singleton instance
module.exports = new RunLogger();