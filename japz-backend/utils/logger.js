import { Log } from '../models/logModel.js';

/**
 * Create an activity log entry
 * @param {Object} logData - Log data object
 * @returns {Promise<Log>} - Created log record
 */
export const createLog = async (logData) => {
  try {
    const log = await Log.create({
      userId: logData.userId || null,
      userName: logData.userName || null,
      action: logData.action || 'OTHER',
      module: logData.module,
      entityId: logData.entityId || null,
      entityType: logData.entityType || null,
      description: logData.description || null,
      changes: logData.changes || null,
      ipAddress: logData.ipAddress || null,
      status: logData.status || 'success',
      errorMessage: logData.errorMessage || null,
    });
    return log;
  } catch (error) {
    console.error('Error creating log:', error);
    // Don't throw - logging failures shouldn't crash the app
  }
};

export const getClientIp = (req) => {
  return req.headers['x-forwarded-for']?.split(',')[0].trim() || 
         req.connection.remoteAddress || 
         req.socket.remoteAddress || 
         'unknown';
};

