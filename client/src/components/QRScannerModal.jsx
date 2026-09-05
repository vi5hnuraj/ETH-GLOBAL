import React, { useRef, useState, useEffect, useCallback } from 'react';
import jsQR from 'jsqr';
import { toast } from 'react-hot-toast';
import { 
  FiCamera, 
  FiUpload, 
  FiRefreshCw, 
  FiX, 
  FiAlertTriangle, 
  FiZap, 
  FiSun, 
  FiImage 
} from 'react-icons/fi';
import { parseAndValidateQR } from '../utils/qrUtils';

const QRScannerModal = ({ isOpen, onClose, onScanSuccess }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const animationFrameRef = useRef(null);
  const streamRef = useRef(null);

  const [activeTab, setActiveTab] = useState('camera'); // 'camera' | 'upload'
  const [cameraPermission, setCameraPermission] = useState('prompt'); // 'prompt' | 'granted' | 'denied'
  const [facingMode, setFacingMode] = useState('environment'); // 'environment' | 'user'
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [invalidData, setInvalidData] = useState(null); // { rawText, errorMsg }
  const [uploadLoading, setUploadLoading] = useState(false);

  // Stop current camera stream tracks
  const stopCamera = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setTorchOn(false);
    setTorchSupported(false);
  }, []);

  // Handle validated decoded QR payload
  const handleDecodeResult = useCallback((rawText) => {
    if (!rawText) return;

    const validation = parseAndValidateQR(rawText);

    if (validation.isValid) {
      stopCamera();
      onScanSuccess(validation.data);
      onClose();
    } else {
      setInvalidData({
        rawText: rawText,
        errorMsg: validation.error || "Invalid GlobalPay QR Code"
      });
    }
  }, [stopCamera, onScanSuccess, onClose]);

  // Scan frame continuous loop
  const scanFrame = useCallback(() => {
    if (!videoRef.current || videoRef.current.readyState !== videoRef.current.HAVE_ENOUGH_DATA) {
      animationFrameRef.current = requestAnimationFrame(scanFrame);
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current || document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');

    if (ctx) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: "attemptBoth"
      });

      if (code && code.data) {
        handleDecodeResult(code.data);
        return;
      }
    }

    animationFrameRef.current = requestAnimationFrame(scanFrame);
  }, [handleDecodeResult]);

  // Initialize camera stream
  const startCamera = useCallback(async () => {
    stopCamera();
    setInvalidData(null);

    try {
      const constraints = {
        video: {
          facingMode: facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setCameraPermission('granted');

      // Check flashlight support
      const track = stream.getVideoTracks()[0];
      if (track && typeof track.getCapabilities === 'function') {
        const capabilities = track.getCapabilities();
        if (capabilities.torch) {
          setTorchSupported(true);
        }
      }

      animationFrameRef.current = requestAnimationFrame(scanFrame);
    } catch (err) {
      console.warn("Camera access denied or error:", err);
      setCameraPermission('denied');
    }
  }, [facingMode, scanFrame, stopCamera]);

  useEffect(() => {
    if (isOpen && activeTab === 'camera' && !invalidData) {
      startCamera();
    } else {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [isOpen, activeTab, facingMode, invalidData, startCamera, stopCamera]);

  // Toggle Torch/Flashlight
  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (track && torchSupported) {
      try {
        const nextState = !torchOn;
        await track.applyConstraints({
          advanced: [{ torch: nextState }]
        });
        setTorchOn(nextState);
      } catch (err) {
        console.warn("Flashlight toggle failed:", err);
      }
    }
  };

  // Toggle Camera Front / Rear
  const toggleCamera = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  // Robust multi-pass image decoder handling transparent PNGs, retina scaling, and binarization
  const handleFileUpload = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    setUploadLoading(true);
    setInvalidData(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        // Pass 1: Standard White Background Canvas
        const tryDecodeStandard = (w, h) => {
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) return null;
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          const imageData = ctx.getImageData(0, 0, w, h);
          return jsQR(imageData.data, w, h, { inversionAttempts: "attemptBoth" });
        };

        // Pass 2: High Contrast Binarized Canvas
        const tryDecodeBinarized = (w, h) => {
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) return null;
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          const imageData = ctx.getImageData(0, 0, w, h);
          const d = imageData.data;
          for (let i = 0; i < d.length; i += 4) {
            const avg = (d[i] + d[i + 1] + d[i + 2]) / 3;
            const v = avg < 128 ? 0 : 255;
            d[i] = v;
            d[i + 1] = v;
            d[i + 2] = v;
          }
          ctx.putImageData(imageData, 0, 0);
          return jsQR(imageData.data, w, h, { inversionAttempts: "attemptBoth" });
        };

        // Multi-resolution attempts: Full, 1000px, 600px, 300px
        const resolutions = [
          { w: img.width, h: img.height },
          { w: 1000, h: Math.round(img.height * (1000 / img.width)) },
          { w: 600, h: Math.round(img.height * (600 / img.width)) },
          { w: 300, h: Math.round(img.height * (300 / img.width)) }
        ].filter(r => r.w > 50 && r.h > 50);

        let code = null;

        for (const res of resolutions) {
          code = tryDecodeStandard(res.w, res.h);
          if (code && code.data) break;
          code = tryDecodeBinarized(res.w, res.h);
          if (code && code.data) break;
        }

        setUploadLoading(false);

        if (code && code.data) {
          handleDecodeResult(code.data);
        } else {
          setInvalidData({
            rawText: "",
            errorMsg: "No QR code could be read from this file. Please make sure the QR code is clearly visible."
          });
        }
      };
      img.onerror = () => {
        setUploadLoading(false);
        toast.error("Failed to load image file.");
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-zinc-950 border border-zinc-800 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col font-sans relative">
        
        {/* Header */}
        <div className="p-5 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-900/40">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500">
              <FiZap size={18} />
            </div>
            <div>
              <h3 className="text-white text-sm font-bold tracking-tight">GlobalPay QR Scanner</h3>
              <p className="text-zinc-400 text-xs">Scan or Upload QR Code</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center transition-colors"
          >
            <FiX size={16} />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex border-b border-zinc-800/80 bg-zinc-900/20 p-1.5 gap-1">
          <button
            onClick={() => {
              setActiveTab('camera');
              setInvalidData(null);
            }}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
              activeTab === 'camera'
                ? 'bg-amber-500 text-zinc-950 shadow-md font-black'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900/50'
            }`}
          >
            <FiCamera size={15} /> Live Camera
          </button>
          <button
            onClick={() => {
              setActiveTab('upload');
              stopCamera();
              setInvalidData(null);
            }}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
              activeTab === 'upload'
                ? 'bg-amber-500 text-zinc-950 shadow-md font-black'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900/50'
            }`}
          >
            <FiUpload size={15} /> Upload Image
          </button>
        </div>

        {/* Body Container */}
        <div className="p-6 flex flex-col items-center justify-center min-h-[320px] relative">

          {/* ─── ERROR VIEW: INVALID QR CODE ─── */}
          {invalidData ? (
            <div className="flex flex-col items-center text-center space-y-4 animate-in zoom-in-95 duration-200 w-full">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500 text-2xl shadow-lg">
                <FiAlertTriangle />
              </div>

              <div>
                <h4 className="text-white text-sm font-bold">Invalid GlobalPay QR Code</h4>
                <p className="text-zinc-400 text-xs mt-1 max-w-[260px]">
                  {invalidData.errorMsg}
                </p>
              </div>

              <div className="flex flex-col w-full gap-2 pt-2">
                <button
                  onClick={() => {
                    setInvalidData(null);
                    if (activeTab === 'camera') startCamera();
                  }}
                  className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-md"
                >
                  <FiRefreshCw size={14} /> Retry Scan
                </button>

                <button
                  onClick={() => {
                    setInvalidData(null);
                    setActiveTab('upload');
                    setTimeout(() => fileInputRef.current?.click(), 100);
                  }}
                  className="w-full py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 border border-zinc-700 transition-colors"
                >
                  <FiUpload size={14} /> Upload QR Image
                </button>

                <button
                  onClick={onClose}
                  className="w-full py-2 text-zinc-400 hover:text-white text-xs font-semibold"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : activeTab === 'camera' ? (
            /* ─── TAB 1: LIVE CAMERA SCANNER ─── */
            <div className="flex flex-col items-center w-full relative">
              {cameraPermission === 'denied' ? (
                <div className="flex flex-col items-center text-center space-y-3 py-6">
                  <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400 text-xl">
                    <FiCamera />
                  </div>
                  <div>
                    <p className="text-white text-sm font-bold">Camera Access Required</p>
                    <p className="text-zinc-400 text-xs mt-1 max-w-[240px]">
                      Please allow camera permissions in your browser to scan QR codes.
                    </p>
                  </div>
                  <button
                    onClick={startCamera}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-bold rounded-xl shadow-md transition-all mt-2"
                  >
                    Allow Camera Access
                  </button>
                </div>
              ) : (
                <div className="relative w-full max-w-[280px] aspect-square rounded-2xl overflow-hidden border-2 border-amber-500/40 bg-black shadow-2xl flex items-center justify-center">
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                  <canvas ref={canvasRef} className="hidden" />

                  {/* Scanning Overlay Reticle */}
                  <div className="absolute inset-0 border-[30px] border-black/50 pointer-events-none flex items-center justify-center">
                    <div className="w-full h-full border-2 border-amber-400 rounded-lg relative animate-pulse shadow-[0_0_15px_rgba(245,158,11,0.5)]">
                      <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-amber-400 -mt-1 -ml-1" />
                      <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-amber-400 -mt-1 -mr-1" />
                      <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-amber-400 -mb-1 -ml-1" />
                      <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-amber-400 -mb-1 -mr-1" />
                    </div>
                  </div>
                </div>
              )}

              {/* Camera Controls */}
              {cameraPermission === 'granted' && (
                <div className="flex items-center gap-3 mt-4">
                  <button
                    onClick={toggleCamera}
                    className="p-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 transition-colors flex items-center gap-1.5 text-xs font-semibold"
                    title="Switch Front/Rear Camera"
                  >
                    <FiRefreshCw size={14} /> Switch Camera
                  </button>

                  {torchSupported && (
                    <button
                      onClick={toggleTorch}
                      className={`p-2.5 rounded-xl border transition-colors flex items-center gap-1.5 text-xs font-semibold ${
                        torchOn
                          ? 'bg-amber-500 text-zinc-950 border-amber-400 font-bold'
                          : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border-zinc-800'
                      }`}
                    >
                      <FiSun size={14} /> {torchOn ? 'Flash On' : 'Flash'}
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* ─── TAB 2: UPLOAD IMAGE SCANNER ─── */
            <div className="flex flex-col items-center justify-center w-full py-4 text-center space-y-4">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png, image/jpeg, image/jpg, image/webp"
                onChange={handleFileUpload}
                className="hidden"
              />

              <div
                onClick={() => fileInputRef.current?.click()}
                className="w-full max-w-[280px] aspect-square rounded-2xl border-2 border-dashed border-zinc-700 hover:border-amber-500/70 bg-zinc-900/40 hover:bg-zinc-900/80 flex flex-col items-center justify-center cursor-pointer transition-all p-6 text-center group"
              >
                <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500 group-hover:scale-110 transition-transform mb-3">
                  <FiImage size={24} />
                </div>
                <p className="text-white text-xs font-bold">
                  {uploadLoading ? "Analyzing Image..." : "Click to Upload QR Image"}
                </p>
                <p className="text-zinc-500 text-[10px] mt-1 font-semibold">
                  Supports PNG, JPEG, WEBP files
                </p>
              </div>

              {uploadLoading && (
                <div className="flex items-center gap-2 text-amber-400 text-xs font-semibold">
                  <FiRefreshCw className="animate-spin" /> Decoding QR image...
                </div>
              )}
            </div>
          )}

        </div>

        {/* Footer info */}
        <div className="p-4 border-t border-zinc-800/80 bg-zinc-900/30 flex items-center justify-between text-[11px] text-zinc-500 font-medium">
          <span>Blockchain Protocol</span>
          <span className="text-amber-500 font-bold">GlobalPay QR</span>
        </div>

      </div>
    </div>
  );
};

export default QRScannerModal;
