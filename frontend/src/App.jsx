import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { 
  Scissors, Trash2, FolderOpen, RefreshCw, 
  ChevronRight, FileVideo, Plus, List, Layers, SkipBack, SkipForward,
  Clock, X, Folder, ChevronLeft
} from 'lucide-react';

const API_BASE = '/api';

function App() {
  const [browserData, setBrowserData] = useState({ files: [], folders: [], currentPath: '', parent: null });
  const [inputPath, setInputPath] = useState('');
  const [outputPath, setOutputPath] = useState('');
  
  const [selectedFile, setSelectedFile] = useState(null);
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [loading, setLoading] = useState(false);
  const [analyzingKeyframes, setAnalyzingKeyframes] = useState(false);
  const [activeTab, setActiveTab] = useState('input');
  const [customName, setCustomName] = useState('');
  
  const [segments, setSegments] = useState([]);
  const [keyframes, setKeyframes] = useState([]);
  const [shouldMerge, setShouldMerge] = useState(false);
  
  const videoRef = useRef(null);

  const fetchFiles = async () => {
    const currentPath = activeTab === 'input' ? inputPath : outputPath;
    try {
      const res = await axios.get(`${API_BASE}/files`, {
        params: { type: activeTab, path: currentPath }
      });
      setBrowserData(res.data);
    } catch (err) {
      console.error('Failed to fetch files', err);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, [activeTab, inputPath, outputPath]);

  const handleFolderClick = (folderName) => {
    const currentPath = activeTab === 'input' ? inputPath : outputPath;
    const newPath = currentPath ? `${currentPath}/${folderName}` : folderName;
    if (activeTab === 'input') setInputPath(newPath);
    else setOutputPath(newPath);
  };

  const handleGoUp = () => {
    if (browserData.parent === null) return;
    if (activeTab === 'input') setInputPath(browserData.parent);
    else setOutputPath(browserData.parent);
  };

  const handleFileSelect = async (file) => {
    const currentPath = activeTab === 'input' ? inputPath : outputPath;
    const fullRelativePath = currentPath ? `${currentPath}/${file}` : file;
    const url = activeTab === 'input' ? `/input-files/${fullRelativePath}` : `/output-files/${fullRelativePath}`;
    
    setSelectedFile({ name: file, fullPath: fullRelativePath, url, type: activeTab });
    setStartTime(0);
    setEndTime(0);
    setCustomName('');
    setSegments([]);
    setKeyframes([]);

    if (activeTab === 'input') {
      fetchKeyframes(fullRelativePath);
    }
  };

  const fetchKeyframes = async (fullPath) => {
    setAnalyzingKeyframes(true);
    try {
      const res = await axios.get(`${API_BASE}/keyframes`, {
        params: { path: fullPath }
      });
      setKeyframes(res.data.keyframes);
    } catch (err) {
      console.error('Failed to fetch keyframes', err);
    } finally {
      setAnalyzingKeyframes(false);
    }
  };

  const handleDelete = async (e, file) => {
    e.stopPropagation();
    const currentPath = activeTab === 'input' ? inputPath : outputPath;
    const fullPath = currentPath ? `${currentPath}/${file}` : file;
    if (!confirm(`Delete ${file}?`)) return;
    try {
      await axios.delete(`${API_BASE}/files/${activeTab}/${fullPath}`);
      fetchFiles();
      if (selectedFile?.fullPath === fullPath) setSelectedFile(null);
    } catch (err) {
      alert('Delete failed');
    }
  };

  const handleAddSegment = () => {
    if (startTime >= endTime) return;
    const newSeg = {
      id: Date.now(),
      start: startTime,
      end: endTime,
      duration: endTime - startTime
    };
    setSegments([...segments, newSeg]);
  };

  const removeSegment = (id) => {
    setSegments(segments.filter(s => s.id !== id));
  };

  const seekToKeyframe = (direction) => {
    if (!keyframes.length || !videoRef.current) return;
    
    let targetTime;
    if (direction === 'next') {
      targetTime = keyframes.find(k => k > currentTime + 0.01);
    } else {
      targetTime = [...keyframes].reverse().find(k => k < currentTime - 0.01);
    }

    if (targetTime !== undefined) {
      videoRef.current.currentTime = targetTime;
    }
  };

  const stepFrame = (frames) => {
    if (videoRef.current) {
      videoRef.current.currentTime += frames * (1/30);
    }
  };

  const handleBatchExport = async () => {
    const finalSegments = segments.length > 0 ? segments : [{ start: startTime, duration: endTime - startTime }];
    
    setLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/batch-cut`, {
        fileName: selectedFile.fullPath,
        segments: finalSegments,
        merge: shouldMerge,
        customName: customName
      });
      fetchFiles();
      setSegments([]);
      alert(`Export successful!\n${shouldMerge ? 'Created: ' + res.data.outputFile : 'Created ' + finalSegments.length + ' files.'}`);
    } catch (err) {
      alert('Export failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (seconds) => {
    if (isNaN(seconds)) return "00:00:00.000";
    const date = new Date(0);
    date.setSeconds(seconds);
    const timeStr = date.toISOString().substr(11, 8);
    const ms = (seconds % 1).toFixed(3).substring(2);
    return `${timeStr}.${ms}`;
  };

  return (
    <div className="flex h-screen w-full bg-zinc-950 overflow-hidden text-zinc-300 font-sans">
      {/* Sidebar - File Browser */}
      <div className="w-72 border-r border-zinc-800 flex flex-col bg-zinc-900/50">
        <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900">
          <h1 className="font-bold text-lg text-white flex items-center gap-2">
            <Scissors className="w-5 h-5 text-blue-500" />
            WebLosslessCut
          </h1>
          <button onClick={fetchFiles} className="p-1.5 hover:bg-zinc-800 rounded-md transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        <div className="flex bg-zinc-900 border-b border-zinc-800">
          <button 
            onClick={() => setActiveTab('input')}
            className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider ${activeTab === 'input' ? 'text-blue-500 border-b-2 border-blue-500 bg-zinc-800/50' : 'text-zinc-500 hover:bg-zinc-800/30'}`}
          >
            Input
          </button>
          <button 
            onClick={() => setActiveTab('output')}
            className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider ${activeTab === 'output' ? 'text-blue-500 border-b-2 border-blue-500 bg-zinc-800/50' : 'text-zinc-500 hover:bg-zinc-800/30'}`}
          >
            Output
          </button>
        </div>

        <div className="bg-zinc-900/80 px-4 py-2 flex items-center gap-2 border-b border-zinc-800">
          <button 
            onClick={handleGoUp} 
            disabled={browserData.parent === null}
            className={`p-1 rounded ${browserData.parent === null ? 'text-zinc-700' : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'}`}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="text-[10px] font-mono truncate text-zinc-500 flex-1">
            /{activeTab}{browserData.currentPath ? `/${browserData.currentPath}` : ''}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {browserData.folders.length === 0 && browserData.files.length === 0 && (
            <div className="text-center py-12 px-4">
              <FolderOpen className="w-10 h-10 mx-auto mb-3 opacity-10" />
              <p className="text-zinc-500 text-xs italic">No compatible files found</p>
            </div>
          )}
          
          {browserData.folders.map(folder => (
            <div 
              key={folder}
              onClick={() => handleFolderClick(folder)}
              className="flex items-center gap-3 p-2.5 rounded-lg cursor-pointer hover:bg-zinc-800 transition-all text-zinc-400 hover:text-zinc-200"
            >
              <Folder className="w-4 h-4 shrink-0 text-amber-500/70" />
              <span className="text-[11px] font-medium truncate flex-1">{folder}</span>
              <ChevronRight className="w-3 h-3 opacity-30" />
            </div>
          ))}

          {browserData.files.map(file => (
            <div 
              key={file}
              onClick={() => handleFileSelect(file)}
              className={`group flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-all ${selectedFile?.name === file && selectedFile?.fullPath === (browserData.currentPath ? `${browserData.currentPath}/${file}` : file) ? 'bg-blue-600 shadow-lg shadow-blue-900/20 text-white' : 'hover:bg-zinc-800'}`}
            >
              <FileVideo className={`w-4 h-4 shrink-0 ${selectedFile?.name === file ? 'text-blue-100' : 'text-zinc-500'}`} />
              <span className="text-[11px] font-medium truncate flex-1">{file}</span>
              <button 
                onClick={(e) => handleDelete(e, file)}
                className={`p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-500 transition-all ${selectedFile?.name === file ? 'text-white' : 'text-zinc-500 hover:text-white'}`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Main Area */}
      <div className="flex-1 flex flex-col relative bg-black">
        {selectedFile ? (
          <>
            <div className="flex-1 flex flex-col relative">
              <div className="flex-1 flex items-center justify-center bg-black/40 p-4">
                <video 
                  ref={videoRef}
                  src={selectedFile.url}
                  className="max-h-full max-w-full shadow-2xl rounded-sm"
                  controls
                  onLoadedMetadata={() => { setDuration(videoRef.current.duration); setEndTime(videoRef.current.duration); }}
                  onTimeUpdate={() => setCurrentTime(videoRef.current.currentTime)}
                />
              </div>

              {analyzingKeyframes && (
                <div className="absolute top-4 right-4 bg-zinc-900/90 border border-zinc-700 rounded-full px-4 py-2 flex items-center gap-3 shadow-xl backdrop-blur-sm">
                  <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />
                  <span className="text-xs font-bold text-white uppercase tracking-tighter">Analyzing Keyframes...</span>
                </div>
              )}
            </div>

            {selectedFile.type === 'input' && (
              <div className="bg-zinc-900 border-t border-zinc-800 shadow-2xl z-10">
                <div className="p-4 space-y-4">
                  <div className="flex items-center gap-6">
                    <div className="flex-1 space-y-2">
                       <div className="flex justify-between text-[10px] uppercase font-bold tracking-widest text-zinc-500 px-1">
                        <span>{formatTime(currentTime)}</span>
                        <span>{formatTime(duration)}</span>
                      </div>
                      <div className="relative h-2 bg-zinc-800 rounded-full overflow-hidden">
                        <div 
                          className="absolute h-full bg-blue-500 transition-all" 
                          style={{ width: `${(currentTime / duration) * 100}%` }}
                        ></div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 bg-zinc-800 p-1 rounded-lg">
                      <button onClick={() => seekToKeyframe('prev')} className="p-2 hover:bg-zinc-700 rounded-md text-zinc-400" title="Prev Keyframe"><SkipBack className="w-4 h-4" /></button>
                      <button onClick={() => stepFrame(-1)} className="p-2 hover:bg-zinc-700 rounded-md text-zinc-400" title="-1 Frame"><ChevronRight className="w-4 h-4 rotate-180" /></button>
                      <button onClick={() => stepFrame(1)} className="p-2 hover:bg-zinc-700 rounded-md text-zinc-400" title="+1 Frame"><ChevronRight className="w-4 h-4" /></button>
                      <button onClick={() => seekToKeyframe('next')} className="p-2 hover:bg-zinc-700 rounded-md text-zinc-400" title="Next Keyframe"><SkipForward className="w-4 h-4" /></button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => setStartTime(currentTime)}
                        className="px-4 py-2 bg-green-600/20 hover:bg-green-600/30 text-green-500 rounded-md text-xs font-bold flex items-center gap-2 border border-green-600/30 transition-colors"
                      >
                        <Clock className="w-3.5 h-3.5" /> Start: {formatTime(startTime)}
                      </button>
                      <button 
                        onClick={() => setEndTime(currentTime)}
                        className="px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-500 rounded-md text-xs font-bold flex items-center gap-2 border border-red-600/30 transition-colors"
                      >
                        <Clock className="w-3.5 h-3.5" /> End: {formatTime(endTime)}
                      </button>
                      <button 
                        onClick={handleAddSegment}
                        className="ml-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-md text-xs font-bold flex items-center gap-2 shadow-lg shadow-blue-900/20 transition-all active:scale-95"
                      >
                        <Plus className="w-4 h-4" /> Add Segment
                      </button>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2 mr-4">
                        <label className="text-[10px] font-bold uppercase text-zinc-500 cursor-pointer flex items-center gap-2">
                          <input 
                            type="checkbox" 
                            checked={shouldMerge} 
                            onChange={e => setShouldMerge(e.target.checked)}
                            className="w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-blue-500"
                          />
                          Merge Segments
                        </label>
                      </div>
                      <input 
                        type="text"
                        value={customName}
                        onChange={(e) => setCustomName(e.target.value)}
                        placeholder="Output Name..."
                        className="bg-zinc-800 border border-zinc-700 rounded-md px-4 py-2 text-xs focus:outline-none focus:border-blue-500 w-48 font-medium"
                      />
                      <button 
                        onClick={handleBatchExport}
                        disabled={loading || analyzingKeyframes || (segments.length === 0 && startTime >= endTime)}
                        className="flex items-center gap-2 bg-white hover:bg-zinc-100 disabled:bg-zinc-800 disabled:text-zinc-600 px-6 py-2 rounded-md font-bold text-zinc-950 transition-all shadow-lg active:scale-95"
                      >
                        {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Layers className="w-4 h-4" />}
                        {loading ? 'Exporting...' : (segments.length > 0 ? `Export ${segments.length} Segments` : 'Export Cut')}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-zinc-700 space-y-4">
            <div className="p-8 rounded-full bg-zinc-900/50">
               <FileVideo className="w-20 h-20 opacity-10" />
            </div>
            <p className="text-sm font-medium tracking-tight">Select a video to start your lossless workflow</p>
          </div>
        )}
      </div>

      {/* Segments Panel */}
      {selectedFile?.type === 'input' && (
        <div className="w-80 border-l border-zinc-800 bg-zinc-900 flex flex-col">
          <div className="p-4 border-b border-zinc-800 flex items-center gap-2 bg-zinc-900">
            <List className="w-4 h-4 text-blue-500" />
            <h2 className="text-xs font-bold uppercase tracking-widest text-white">Segments List</h2>
            {segments.length > 0 && (
               <span className="ml-auto bg-blue-600 text-[10px] font-black px-1.5 py-0.5 rounded-sm text-white">{segments.length}</span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {segments.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-2 opacity-30">
                <List className="w-8 h-8 mb-2" />
                <p className="text-[10px] font-bold uppercase tracking-tighter">No segments added</p>
                <p className="text-[10px]">Add ranges from the timeline to batch export or merge them.</p>
              </div>
            ) : (
              segments.map((seg, index) => (
                <div key={seg.id} className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-3 space-y-2 group hover:border-blue-500/50 transition-colors">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black text-blue-500 uppercase tracking-tighter">Segment #{index + 1}</span>
                    <button onClick={() => removeSegment(seg.id)} className="text-zinc-500 hover:text-red-500 transition-colors">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-zinc-900/50 p-2 rounded border border-zinc-800">
                       <p className="text-[8px] uppercase font-bold text-zinc-500 mb-1">Start</p>
                       <p className="text-[10px] font-mono text-zinc-300">{formatTime(seg.start)}</p>
                    </div>
                    <div className="bg-zinc-900/50 p-2 rounded border border-zinc-800">
                       <p className="text-[8px] uppercase font-bold text-zinc-500 mb-1">End</p>
                       <p className="text-[10px] font-mono text-zinc-300">{formatTime(seg.end)}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[9px] font-bold text-zinc-500">Duration: {seg.duration.toFixed(2)}s</span>
                    <button 
                      onClick={() => { videoRef.current.currentTime = seg.start; videoRef.current.play(); }}
                      className="text-[9px] font-bold text-blue-400 hover:underline"
                    >
                      Preview Range
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
