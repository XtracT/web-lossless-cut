# WebLosslessCut (Pro)

A high-performance, web-based lossless video trimmer and joiner powered by FFmpeg.

## Advanced Features

- **Lossless Cutting**: No re-encoding, zero quality loss, near-instant processing using stream copying.
- **Multi-Segment Support**: Define multiple ranges in a single video and export them all at once.
- **Lossless Merging**: Join your selected segments into a single file instantly without re-encoding.
- **Recursive File Browser**: 
  - Navigate subfolders within your input/output volumes.
  - Case-insensitive filtering (only shows compatible formats like `.mp4`, `.lrf`, `.mkv`, etc.).
- **Keyframe-Accurate Navigation**:
  - Automatically analyzes video I-frames (keyframes) using `ffprobe`.
  - Use `<<` and `>>` buttons to snap the playhead to the nearest valid cut point, preventing frozen frames.
- **Precision Controls**: Frame-by-frame stepping ($+1 / -1$ frame) for ultra-precise selection.
- **Professional Metadata Handling**: 
  - Specialized support for DJI/GoPro `.LRF` files (High-performance proxy editing).
  - Preserves all data streams including metadata, GPS, and timecode tracks via `-map 0`.
- **Flexible Naming**: Custom output naming with automatic timestamping to prevent overwrites.

## Setup

1.  **Prepare Media**: Place your video files (or folders) in the `input` directory.
2.  **Start Container**:
    ```bash
    docker-compose up --build
    ```
3.  **Access App**: Navigate to `http://localhost:3001`.

## Professional Workflow

1.  **Select Video**: Navigate folders and choose a file from the **Input** tab.
2.  **Analyze**: Wait for the "Analyzing Keyframes" indicator to finish (crucial for lossless accuracy).
3.  **Navigate**: Use the timeline and keyframe jump buttons to find your desired start point.
4.  **Mark**: Click **Set Start** and **Set End**.
5.  **Add**: Click **Add Segment** to save the range to the list. Repeat for other segments.
6.  **Export**:
    - **Separate**: Click **Export [N] Segments** to get individual files.
    - **Merged**: Check **Merge Segments** to join them into one continuous clip.
    - **Naming**: (Optional) Enter a custom name in the output field.

## Project Structure

- `backend/`: Node.js server serving both the API and the compiled frontend.
- `frontend/`: React UI source code.
- `input/`: Host volume for source media (Mapped to `/input` in container).
- `output/`: Host volume for resulting clips (Mapped to `/output` in container).
- `Dockerfile`: Multi-stage build that produces a single optimized image with FFmpeg/ffprobe.
