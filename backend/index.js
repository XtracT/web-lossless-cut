const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
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

// Audio WAV proxy cache directory
const AUDIO_PROXY_DIR = path.join(OUTPUT_DIR, '.audio-proxy');
if (!fs.existsSync(AUDIO_PROXY_DIR)) fs.mkdirSync(AUDIO_PROXY_DIR, { recursive: true });
app.use('/audio-proxy', express.static(AUDIO_PROXY_DIR));

const VIDEO_EXTS = ['.mp4', '.mkv', '.mov', '.avi', '.webm', '.lrf', '.m4v', '.ts'];
const AUDIO_EXTS = ['.mp3', '.flac', '.aac', '.wav', '.ogg', '.m4a', '.opus', '.wma'];
const ALLOWED_EXTS = [...VIDEO_EXTS, ...AUDIO_EXTS];

const isVideo = (name) => {
  const ext = path.extname(name).toLowerCase();
  return VIDEO_EXTS.includes(ext);
};

const isAudio = (name) => {
  const ext = path.extname(name).toLowerCase();
  return AUDIO_EXTS.includes(ext);
};

const getFormatFlag = (filename) => {
  return path.extname(filename).toLowerCase() === '.lrf' ? '-f mp4' : '';
};

// List files with subfolder support
app.get('/api/files', (req, res) => {
  const subPath = req.query.path || '';
  const type = req.query.type || 'input'; // 'input' or 'output'
  const mediaType = req.query.mediaType || 'video'; // 'video' or 'audio'
  const rootDir = type === 'input' ? INPUT_DIR : OUTPUT_DIR;
  const targetDir = path.join(rootDir, subPath);

  // Security: Prevent path traversal
  if (!targetDir.startsWith(rootDir)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const matchesMedia = mediaType === 'audio' ? isAudio : isVideo;

  try {
    if (!fs.existsSync(targetDir)) {
      return res.json({ files: [], folders: [], parent: null });
    }

    const entries = fs.readdirSync(targetDir, { withFileTypes: true });
    
    const folders = entries
      .filter(e => e.isDirectory() && !e.name.startsWith('.'))
      .map(e => e.name)
      .sort();

    const files = entries
      .filter(e => e.isFile() && !e.name.startsWith('.') && matchesMedia(e.name))
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

  // Audio files have no video keyframes
  if (isAudio(relativePath)) {
    return res.json({ keyframes: [] });
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

// Prepare audio: convert to WAV proxy for browser preview
app.post('/api/prepare-audio', async (req, res) => {
  const { filePath } = req.body;
  if (!filePath) return res.status(400).json({ error: 'Missing filePath' });

  const inputPath = path.join(INPUT_DIR, filePath);
  if (!inputPath.startsWith(INPUT_DIR)) {
    return res.status(403).json({ error: 'Access denied' });
  }
  if (!fs.existsSync(inputPath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  // Create a stable proxy filename based on input path hash
  const hash = crypto.createHash('sha256').update(filePath).digest('hex').slice(0, 16);
  const proxyFilename = `${hash}.wav`;
  const proxyPath = path.join(AUDIO_PROXY_DIR, proxyFilename);

  // Skip if proxy already exists
  if (fs.existsSync(proxyPath)) {
    return res.json({ proxyUrl: `/audio-proxy/${proxyFilename}` });
  }

  const cmd = `ffmpeg -y -i "${inputPath}" -vn -ac 2 -ar 44100 -f wav "${proxyPath}"`;

  exec(cmd, (error) => {
    if (error) {
      console.error(`Prepare audio error: ${error.message}`);
      return res.status(500).json({ error: 'Failed to prepare audio' });
    }
    res.json({ proxyUrl: `/audio-proxy/${proxyFilename}` });
  });
});

// Cut audio: precise cut from original, re-encode to preserve format + metadata
app.post('/api/cut-audio', async (req, res) => {
  const { fileName, segments, merge, customName } = req.body;

  if (!fileName || !segments || !segments.length) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  const inputPath = path.join(INPUT_DIR, fileName);
  if (!inputPath.startsWith(INPUT_DIR)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const ext = path.extname(fileName).toLowerCase();
  const baseName = path.basename(fileName, ext);
  const finalBase = (customName && customName.trim()) ? customName.trim() : baseName;
  const timestamp = Date.now();

  const execAsync = (cmd) => new Promise((resolve, reject) => {
    exec(cmd, (err, stdout, stderr) => err ? reject(new Error(stderr || err.message)) : resolve(stdout));
  });

  const buildReencodeCmd = (wavPath, outputPath, originalPath) => {
    switch (ext) {
      case '.mp3':
        return `ffmpeg -y -i "${wavPath}" -i "${originalPath}" -map 0:a -map_metadata 1 -map 1:v? -c:v copy -c:a libmp3lame -b:a 256k -id3v2_version 3 "${outputPath}"`;
      case '.opus':
        return `ffmpeg -y -i "${wavPath}" -i "${originalPath}" -map 0:a -map_metadata 1 -c:a libopus -b:a 128k "${outputPath}"`;
      case '.aac':
      case '.m4a':
        return `ffmpeg -y -i "${wavPath}" -i "${originalPath}" -map 0:a -map_metadata 1 -c:a aac -b:a 256k "${outputPath}"`;
      case '.flac':
        return `ffmpeg -y -i "${wavPath}" -c copy "${outputPath}"`;
      case '.wav':
        return `ffmpeg -y -i "${wavPath}" -c copy "${outputPath}"`;
      case '.ogg':
        return `ffmpeg -y -i "${wavPath}" -i "${originalPath}" -map 0:a -map_metadata 1 -c:a libvorbis -b:a 256k "${outputPath}"`;
      case '.wma':
        return `ffmpeg -y -i "${wavPath}" -i "${originalPath}" -map 0:a -map_metadata 1 -c:a wmav2 -b:a 256k "${outputPath}"`;
      default:
        return `ffmpeg -y -i "${wavPath}" -c copy "${outputPath}"`;
    }
  };

  const tempDir = path.join(OUTPUT_DIR, `.temp_audio_${timestamp}`);
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    if (merge) {
      // Merge: cut each segment from original to temp wav, concat, re-encode
      const segmentFiles = [];
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        const segPath = path.join(tempDir, `seg_${i}.wav`);
        const cmd = `ffmpeg -y -i "${inputPath}" -ss ${seg.start} -t ${seg.duration} -vn -ac 2 -ar 44100 -f wav "${segPath}"`;
        await execAsync(cmd);
        segmentFiles.push(segPath);
      }

      const concatFilePath = path.join(tempDir, 'concat.txt');
      const concatContent = segmentFiles.map(f => `file '${f}'`).join('\n');
      fs.writeFileSync(concatFilePath, concatContent);

      const mergedWav = path.join(tempDir, 'merged.wav');
      await execAsync(`ffmpeg -y -f concat -safe 0 -i "${concatFilePath}" -c copy "${mergedWav}"`);

      const outputFileName = `${finalBase}_merged_${timestamp}${ext}`;
      const outputPath = path.join(OUTPUT_DIR, outputFileName);
      await execAsync(buildReencodeCmd(mergedWav, outputPath, inputPath));

      fs.rmSync(tempDir, { recursive: true, force: true });
      res.json({ message: 'Merge successful', outputFile: outputFileName });

    } else {
      // Separate files: cut each segment, re-encode to original format
      const results = [];
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        const tempWav = path.join(tempDir, `cut_${i}.wav`);
        const outputFileName = `${finalBase}_part${i + 1}_${timestamp}${ext}`;
        const outputPath = path.join(OUTPUT_DIR, outputFileName);

        // Step 1: Precise cut from original to WAV
        const cutCmd = `ffmpeg -y -i "${inputPath}" -ss ${seg.start} -t ${seg.duration} -vn -ac 2 -ar 44100 -f wav "${tempWav}"`;
        await execAsync(cutCmd);

        // Step 2: Re-encode WAV to original format with metadata
        await execAsync(buildReencodeCmd(tempWav, outputPath, inputPath));

        results.push(outputFileName);
      }

      fs.rmSync(tempDir, { recursive: true, force: true });
      res.json({ message: 'Cuts successful', outputFiles: results, outputFile: results[0] });
    }
  } catch (err) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    console.error(`Audio cut error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// Cleanup audio proxy
app.post('/api/cleanup-audio', (req, res) => {
  const { proxyFilename } = req.body;
  if (!proxyFilename) return res.status(400).json({ error: 'Missing proxyFilename' });

  // Security: only allow files in AUDIO_PROXY_DIR
  const proxyPath = path.join(AUDIO_PROXY_DIR, proxyFilename);
  if (!proxyPath.startsWith(AUDIO_PROXY_DIR)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  if (fs.existsSync(proxyPath)) {
    fs.unlinkSync(proxyPath);
  }
  res.json({ message: 'Cleaned up' });
});

// Catch-all to serve index.html for any non-API routes
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api') && !req.path.startsWith('/input-files') && !req.path.startsWith('/output-files') && !req.path.startsWith('/audio-proxy')) {
    res.sendFile(path.join(frontendPath, 'index.html'));
  }
});

app.listen(PORT, () => {
  console.log(`Backend listening at http://localhost:${PORT}`);
});
