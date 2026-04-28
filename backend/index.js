const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const app = express();
const PORT = 3001;

const INPUT_DIR = '/input';
const OUTPUT_DIR = '/output';

// Ensure directories exist (though they should be mapped)
if (!fs.existsSync(INPUT_DIR)) fs.mkdirSync(INPUT_DIR);
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);

app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

// Handle LRF files as MP4 for browser preview
app.use((req, res, next) => {
  if (req.path.toLowerCase().endsWith('.lrf')) {
    res.type('video/mp4');
  }
  next();
});

// Serve frontend static files
const frontendPath = path.join(__dirname, 'public');
app.use(express.static(frontendPath));

// Serve static files for preview
app.use('/input-files', express.static(INPUT_DIR));
app.use('/output-files', express.static(OUTPUT_DIR));

const ALLOWED_EXTS = ['.mp4', '.mkv', '.mov', '.avi', '.webm', '.lrf', '.m4v', '.ts'];

const isVideo = (name) => {
  const ext = path.extname(name).toLowerCase();
  return ALLOWED_EXTS.includes(ext);
};

const getFormatFlag = (filename) => {
  return path.extname(filename).toLowerCase() === '.lrf' ? '-f mp4' : '';
};

// List files with subfolder support
app.get('/api/files', (req, res) => {
  const subPath = req.query.path || '';
  const type = req.query.type || 'input'; // 'input' or 'output'
  const rootDir = type === 'input' ? INPUT_DIR : OUTPUT_DIR;
  const targetDir = path.join(rootDir, subPath);

  // Security: Prevent path traversal
  if (!targetDir.startsWith(rootDir)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    if (!fs.existsSync(targetDir)) {
      return res.json({ files: [], folders: [], parent: null });
    }

    const entries = fs.readdirSync(targetDir, { withFileTypes: true });
    
    const folders = entries
      .filter(e => e.isDirectory())
      .map(e => e.name)
      .sort();

    const files = entries
      .filter(e => e.isFile() && isVideo(e.name))
      .map(e => e.name)
      .sort();

    const parent = subPath === '' || subPath === '.' ? null : path.dirname(subPath);

    res.json({ 
      files, 
      folders, 
      currentPath: subPath,
      parent: parent === '.' ? '' : parent
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete file
app.delete('/api/files/:type/*', (req, res) => {
  const { type } = req.params;
  const relativePath = req.params[0];
  const rootDir = type === 'input' ? INPUT_DIR : OUTPUT_DIR;
  const filePath = path.join(rootDir, relativePath);

  if (!filePath.startsWith(rootDir)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    res.json({ message: 'File deleted' });
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

// Get keyframes
app.get('/api/keyframes', (req, res) => {
  const relativePath = req.query.path;
  if (!relativePath) return res.status(400).json({ error: 'Path required' });
  
  const filePath = path.join(INPUT_DIR, relativePath);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  // Security: Prevent path traversal
  if (!filePath.startsWith(INPUT_DIR)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  // ffprobe to get I-frame timestamps
  const command = `ffprobe -v error -select_streams v:0 -skip_frame nokey -show_entries frame=pkt_pts_time -of csv=p=0 "${filePath}"`;

  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error(`ffprobe error: ${error.message}`);
      return res.status(500).json({ error: 'Failed to analyze keyframes' });
    }

    const keyframes = stdout.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(Number);

    res.json({ keyframes });
  });
});

// Batch cut and optional merge
app.post('/api/batch-cut', async (req, res) => {
  const { fileName, segments, merge, customName } = req.body;

  if (!fileName || !segments || !segments.length) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  const inputPath = path.join(INPUT_DIR, fileName);
  const ext = path.extname(fileName);
  const baseName = path.basename(fileName, ext);
  const finalBase = (customName && customName.trim()) ? customName.trim() : baseName;
  const timestamp = Date.now();

  try {
    if (merge) {
      // MERGE LOGIC
      const tempDir = path.join(OUTPUT_DIR, `temp_${timestamp}`);
      fs.mkdirSync(tempDir);

      const segmentFiles = [];
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        const segFileName = `seg_${i}.ts`; // TS is better for joining
        const segPath = path.join(tempDir, segFileName);
        
        // ffmpeg -ss [start] -i [input] -t [duration] -c copy [output]
        const cmd = `ffmpeg -y -ss ${seg.start} -i "${inputPath}" -t ${seg.duration} -c copy -map 0 -avoid_negative_ts make_zero "${segPath}"`;
        
        await new Promise((resolve, reject) => {
          exec(cmd, (err) => err ? reject(err) : resolve());
        });
        segmentFiles.push(segPath);
      }

      // Concat them
      const concatFilePath = path.join(tempDir, 'concat.txt');
      const concatContent = segmentFiles.map(f => `file '${f}'`).join('\n');
      fs.writeFileSync(concatFilePath, concatContent);

      const outputFileName = `${finalBase}_merged_${timestamp}${ext}`;
      const outputPath = path.join(OUTPUT_DIR, outputFileName);
      const formatFlag = getFormatFlag(outputFileName);
      const concatCmd = `ffmpeg -y -f concat -safe 0 -i "${concatFilePath}" -c copy -map 0 ${formatFlag} "${outputPath}"`;

      await new Promise((resolve, reject) => {
        exec(concatCmd, (err) => err ? reject(err) : resolve());
      });

      // Cleanup temp
      fs.rmSync(tempDir, { recursive: true, force: true });
      res.json({ message: 'Merge successful', outputFile: outputFileName });

    } else {
      // SEPARATE FILES LOGIC
      const results = [];
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        const outputFileName = `${finalBase}_part${i+1}_${timestamp}${ext}`;
        const outputPath = path.join(OUTPUT_DIR, outputFileName);
        const formatFlag = getFormatFlag(outputFileName);
        const cmd = `ffmpeg -y -ss ${seg.start} -i "${inputPath}" -t ${seg.duration} -c copy -map 0 ${formatFlag} "${outputPath}"`;

        await new Promise((resolve, reject) => {
          exec(cmd, (err) => err ? reject(err) : resolve());
        });
        results.push(outputFileName);
      }
      res.json({ message: 'Cuts successful', outputFiles: results, outputFile: results[0] });
    }
  } catch (err) {
    console.error(`Batch cut error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// Cut video (legacy support or simple cut)
app.post('/api/cut', (req, res) => {
  const { fileName, startTime, duration, customName } = req.body;
  
  if (!fileName || startTime === undefined || !duration) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  const inputPath = path.join(INPUT_DIR, fileName);
  const ext = path.extname(fileName);
  const baseName = path.basename(fileName, ext);
  
  // Use customName if provided, otherwise original baseName
  const finalBase = (customName && customName.trim()) ? customName.trim() : baseName;
  const outputFileName = `${finalBase}_cut_${Date.now()}${ext}`;
  const outputPath = path.join(OUTPUT_DIR, outputFileName);

  // Command: ffmpeg -ss [start] -i [input] -t [duration] -c copy [output]
  // Note: -ss before -i is faster (seeks to keyframe) but slightly less accurate. 
  // For lossless cut, we usually want to seek accurately.
  const formatFlag = getFormatFlag(outputFileName);
  const command = `ffmpeg -ss ${startTime} -i "${inputPath}" -t ${duration} -c copy -map 0 ${formatFlag} "${outputPath}"`;

  console.log(`Executing: ${command}`);

  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error: ${error.message}`);
      return res.status(500).json({ error: error.message, stderr });
    }
    res.json({ message: 'Cut successful', outputFile: outputFileName });
  });
});

// Catch-all to serve index.html for any non-API routes
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api') && !req.path.startsWith('/input-files') && !req.path.startsWith('/output-files')) {
    res.sendFile(path.join(frontendPath, 'index.html'));
  }
});

app.listen(PORT, () => {
  console.log(`Backend listening at http://localhost:${PORT}`);
});
