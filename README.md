# WebLosslessCut (Pro)

A high-performance, web-based lossless video trimmer and audio cutter powered by FFmpeg.

## Features

- **Lossless Cutting**: No re-encoding, zero quality loss, near-instant processing using stream copying.
- **Audio Cutting**: Lossless audio trimming with WAV proxy for sample-accurate browser preview. Re-encodes to preserve original format, metadata, and album art.
- **Multi-Segment Support**: Define multiple ranges in a single file and export them all at once.
- **Lossless Merging**: Join your selected segments into a single file instantly without re-encoding.
- **Media Type Toggle**: Switch between Video and Audio modes in the sidebar to filter your file browser.
- **Recursive File Browser**: 
  - Navigate subfolders within your input/output volumes.
  - Video mode: `.mp4`, `.mkv`, `.mov`, `.avi`, `.webm`, `.lrf`, `.m4v`, `.ts`
  - Audio mode: `.mp3`, `.flac`, `.aac`, `.wav`, `.ogg`, `.m4a`, `.opus`, `.wma`
- **Keyframe-Accurate Navigation** (video):
  - Automatically analyzes video I-frames using `ffprobe`.
  - Snap the playhead to the nearest valid cut point, preventing frozen frames.
  - Frame-by-frame stepping ($+1 / -1$ frame) for ultra-precise selection.
- **Professional Metadata Handling**: 
  - Specialized support for DJI/GoPro `.LRF` files.
  - Preserves all data streams including metadata, GPS, and timecode tracks via `-map 0`.
  - Audio: preserves ID3 tags, album art, and container metadata across re-encoding.
- **Flexible Naming**: Custom output naming with automatic timestamping to prevent overwrites.

## Setup

1.  **Prepare Media**: Place your media files (or folders) in the `input` directory.
2.  **Start Container**:
    ```bash
    docker-compose up -d
    ```
    The image is pulled from `ghcr.io/xtract/web-lossless-cut:main`. To build from source instead, use `docker-compose up --build`.
3.  **Access App**: Navigate to `http://localhost:3001`.

### Separate media libraries

To keep different media collections organized, mount subfolders:

```yaml
volumes:
  - /nas/camera-videos:/input/camera
  - /nas/kids-music:/input/music
  - /nas/output-videos:/output/camera
  - /nas/output-music:/output/music
```

Use the **Video / Audio** toggle in the sidebar to filter which files are shown.

## Usage

### Video workflow

1.  Select **Video** in the sidebar toggle, then choose a file from the **Input** tab.
2.  Wait for "Analyzing Keyframes" to finish.
3.  Use the timeline and keyframe jump buttons to find your cut points.
4.  Click **Set Start** and **Set End**.
5.  Click **Add Segment** to save the range. Repeat for multiple segments.
6.  **Export**:
    - **Separate**: Click **Export [N] Segments** for individual files.
    - **Merged**: Check **Merge Segments** to join them into one clip.
    - **Naming**: (Optional) Enter a custom name in the output field.

### Audio workflow

1.  Select **Audio** in the sidebar toggle, then choose a file.
2.  The file is automatically converted to a WAV proxy for accurate browser preview (handles YouTube rip sample rate issues).
3.  Set cut points using the timeline and **Set Start / Set End** buttons.
4.  Export — the cut is applied to the original file with precise seeking, then re-encoded to the original format with metadata preserved.

## Project Structure

- `backend/`: Node.js server serving both the API and the compiled frontend.
- `frontend/`: React UI source code.
- `input/`: Host volume for source media (Mapped to `/input` in container).
- `output/`: Host volume for resulting clips (Mapped to `/output` in container).
- `Dockerfile`: Multi-stage build that produces a single optimized image with FFmpeg/ffprobe.
