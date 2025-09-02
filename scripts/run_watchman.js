require('dotenv').config();

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const chokidar = require('chokidar');
const WebSocket = require('ws');
const winston = require('winston');
const { combine, timestamp, printf } = winston.format;


// Set the source and destination folders from environment variables
const isCopy = false;
const srcFolder = './src/';
const destFolder = './build/';
const strategy = "always-trigger-hashchange";


// Check if the 'copy all files' flag is set
const copyAllFilesFlag = process.argv.includes('-c') || process.argv.includes('--copy-all');

// Check if the 'copy all files' flag is set
const wsServerFlag = process.argv.includes('-w') || process.argv.includes('--watch-all');


// Create the logger with color formatting
const logger = winston.createLogger({
  level: 'info',
  format: combine(
    timestamp(),
    printf(({ level, message, timestamp }) => {
      return `${timestamp} ${level}: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.colorize()
    })
  ]
});



// Create the WebSocket server
var wss;
var timeout;

// Function to copy files from src to dest
function copyFiles(filePath, isSkipNotify = false) {
  try {
    const relPath = path.relative(srcFolder, filePath);

    if (isCopy) {
      const destPath = path.join(destFolder, relPath);
      const destDir = path.dirname(destPath);

      // skip .git
      if (relPath.indexOf(".git") === 0) {
        return;
      }

      if (fs.existsSync(destDir)) {
        const stat = fs.lstatSync(destDir);
        if (stat.isFile()) {
          fs.rmSync(destDir);
        }
      }

      if (fs.existsSync(destPath)) {
        const stat = fs.lstatSync(destPath);
        if (stat.isDirectory()) {
          fs.rmdirSync(destPath, { recursive: true, force: true });
        }
      }

      // Create the destination directory if it doesn't exist
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      // Copy the file to the destination
      if (fs.existsSync(filePath)) {
        fs.copyFileSync(filePath, destPath);
      }

      logger.info(`[WATCHMAN] [FS] Copied ${relPath} to ${destPath}`);
    }

    if (isSkipNotify) {
      return;
    }

    // Notify the WebSocket clients of the file change
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }

    timeout = setTimeout(() => {
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: 'fileChange', filePath: relPath, strategy }));
          logger.info(`[WATCHMAN] [WebSocket] Notified WebSocket clients about change in ${relPath}`);
        }
      });
      timeout = null;
    }, 100);
  } catch (error) {
    logger.error(`[WATCHMAN] Error copying file: ${error.message}`);
    return;
  }
}

// Function to sync files from src to dest
function syncFiles(srcFolder, destFolder) {
  const files = fs.readdirSync(srcFolder, { withFileTypes: true });
  files.forEach(async (dirent) => {
    const filePath = path.join(srcFolder, dirent.name);
    if (filePath.indexOf(".git") === 0) {
      return;
    }
    if (filePath.indexOf("node_modules") === 0) {
      return;
    }
    if (dirent.isFile()) {
      const destPath = path.join(destFolder, dirent.name);
      if (!(await compareFiles(filePath, destPath))) {
        copyFiles(filePath, true);
      }
    } else if (dirent.isDirectory()) {
      syncFiles(path.join(srcFolder, dirent.name), path.join(destFolder, dirent.name));
    }
  });
}




function getFileChecksum(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256'); // You can use 'md5', 'sha1', etc.
    const fileStream = fs.createReadStream(filePath);

    fileStream.on('data', (data) => hash.update(data));
    fileStream.on('end', () => resolve(hash.digest('hex')));
    fileStream.on('error', (err) => reject(err));
  });
}

async function compareFiles(file1, file2) {
  try {
    const checksum1 = await getFileChecksum(file1);
    const checksum2 = await getFileChecksum(file2);

    if (checksum1 === checksum2) {
      return true;
    } else {
      return false;
    }
  } catch (e) {
    console.warn('[WATCHMAN] unexpected error - assume file is changed here', file1, file2);
    return false;
  }
}





// Initialize by syncing files from src to dest
if (copyAllFilesFlag) {
  logger.info('[WATCHMAN] Copying all files from source to destination...');
  syncFiles(srcFolder, destFolder);
}

// Set up Watchman to watch the src folder
if (wsServerFlag) {
  logger.info('[WATCHMAN] Starting WebSocket server on port 9996...');

  wss = new WebSocket.Server({ port: 9996 });

  chokidar.watch(srcFolder, { ignoreInitial: true }).on('all', (event, filePath) => {
    if (event === 'add' || event === 'change' || event === 'unlink') {
      copyFiles(filePath, false);
    }
  });

  logger.info('[WATCHMAN] Watching', srcFolder, 'and copying changes to', destFolder);

  // Handle WebSocket connections
  wss.on('connection', (ws) => {
    logger.info('WebSocket client connected');

    ws.on('close', () => {
      logger.info('WebSocket client disconnected');
    });
  });
}
