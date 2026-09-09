import React, { useState, useEffect, useRef } from 'react';
import { Upload, Camera, CheckCircle, AlertCircle, X, Info, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

interface KycDocumentUploadProps {
  onClose: () => void;
  onKycStatusChange: (status: 'not_verified' | 'pending' | 'verified') => void;
}

const KycDocumentUpload: React.FC<KycDocumentUploadProps> = ({ onClose, onKycStatusChange }) => {
  const [idDocument, setIdDocument] = useState<File | null>(null);
  const [selfieDocument, setSelfieDocument] = useState<File | Blob | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [step, setStep] = useState<'id' | 'selfie' | 'review'>('id');
  
  // Camera state
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isCameraAvailable, setIsCameraAvailable] = useState(true);
  const [isCapturingLive, setIsCapturingLive] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  
  // Refs for video and canvas elements
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Clean up camera stream when component unmounts
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
    };
  }, []);

  const handleIdDocumentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setIdDocument(e.target.files[0]);
    }
  };

  const handleSelfieDocumentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelfieDocument(e.target.files[0]);
      setCapturedImage(null);
      setIsCapturingLive(false);
      stopCamera();
    }
  };

  const handleNextStep = () => {
    if (step === 'id' && idDocument) {
      setStep('selfie');
    } else if (step === 'selfie' && (selfieDocument || capturedImage)) {
      setStep('review');
      // Stop camera if it's still active
      stopCamera();
    }
  };

  const handlePrevStep = () => {
    if (step === 'selfie') {
      setStep('id');
      // Stop camera if it's active
      stopCamera();
    } else if (step === 'review') {
      setStep('selfie');
    }
  };

  const startCamera = async () => {
    try {
      setError(null);
      
      // Check if browser supports getUserMedia
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Your browser does not support camera access. Please upload a selfie instead.');
      }
      
      // Request camera access
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        } 
      });
      
      // Store stream in ref for cleanup
      streamRef.current = stream;
      
      // Set video source
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      
      setIsCameraActive(true);
      setIsCapturingLive(true);
      setCapturedImage(null);
      setSelfieDocument(null);
    } catch (err: any) {
      console.error('Error accessing camera:', err);
      setError(err.message || 'Failed to access camera. Please try uploading a selfie instead.');
      setIsCameraAvailable(false);
      setIsCapturingLive(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    
    setIsCameraActive(false);
  };

  const captureImage = () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    // Set canvas dimensions to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    // Draw video frame to canvas
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Convert canvas to data URL
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      setCapturedImage(dataUrl);
      
      // Convert data URL to Blob for upload
      canvas.toBlob((blob) => {
        if (blob) {
          // Create a File object from Blob for consistency with the file upload flow
          const selfieFile = new File([blob], "selfie.jpg", { type: "image/jpeg" });
          setSelfieDocument(selfieFile);
        }
      }, 'image/jpeg', 0.8);
    }
  };

  const retakePhoto = () => {
    setCapturedImage(null);
    setSelfieDocument(null);
  };

  const handleSubmit = async () => {
  if (!idDocument || !selfieDocument) {
    setError('Please upload both ID document and selfie');
    return;
  }

  setLoading(true);
  setError(null);

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const uid = user.id;
    const now = Date.now();

    const extOf = (f: File) =>
      f.name.includes('.') ? f.name.slice(f.name.lastIndexOf('.')) : '';

    // --- user-scoped paths (critical for RLS) ---
    const idPath = `${uid}/id_${now}${extOf(idDocument) || '.jpg'}`;
    const selfiePath =
      selfieDocument instanceof File
        ? `${uid}/selfie_${now}${extOf(selfieDocument)}`
        : `${uid}/selfie_${now}.jpg`;

    // --- upload with contentType ---
    const { error: idUploadError } = await supabase.storage
      .from('kyc-documents')
      .upload(idPath, idDocument, {
        cacheControl: '3600',
        upsert: false,
        contentType: idDocument.type || 'application/octet-stream',
      });
    if (idUploadError) throw new Error(`Error uploading ID document: ${idUploadError.message}`);

    const { error: selfieUploadError } = await supabase.storage
      .from('kyc-documents')
      .upload(selfiePath, selfieDocument, {
        cacheControl: '3600',
        upsert: false,
        contentType: (selfieDocument as File)?.type || 'image/jpeg',
      });
    if (selfieUploadError) throw new Error(`Error uploading selfie: ${selfieUploadError.message}`);

    // --- Optional: create short-lived signed URLs (if you still want to store URLs) ---
    const { data: idSigned } = await supabase
      .storage.from('kyc-documents')
      .createSignedUrl(idPath, 60 * 60 * 24 * 7); // 7 days
    const { data: selfieSigned } = await supabase
      .storage.from('kyc-documents')
      .createSignedUrl(selfiePath, 60 * 60 * 24 * 7);

    // --- Update DB (prefer storing paths; keep URLs if your schema expects them) ---
    const { error: updateError } = await supabase
      .from('users')
      .update({
        document_id_path: idPath,           // add these columns in your schema
        document_selfie_path: selfiePath,   // (recommended)
        document_id_url: idSigned?.signedUrl,           // keep if needed
        document_selfie_url: selfieSigned?.signedUrl,   // keep if needed
        kyc_status: 'pending',
      })
      .eq('id', uid);

    if (updateError) throw new Error(`Error updating user record: ${updateError.message}`);

    setSuccess(true);
    onKycStatusChange('pending');
    setTimeout(() => onClose(), 3000);
  } catch (err: any) {
    console.error('Error uploading KYC documents:', err);
    setError(err.message || 'An unexpected error occurred');
  } finally {
    setLoading(false);
  }
};


  const renderStepContent = () => {
    switch (step) {
      case 'id':
        return (
          <div className="space-y-6">
            <h3 className="text-xl font-semibold text-white mb-4">Upload ID Document</h3>
            <p className="text-slate-300 mb-6">
              Please upload a clear photo of your government-issued ID (passport, driver's license, or national ID card).
            </p>

            <div className="app-surface-muted rounded-xl p-6 text-center">
              <div className="mb-4">
                {idDocument ? (
                  <div className="relative w-full h-48 mx-auto">
                    <img
                      src={URL.createObjectURL(idDocument)}
                      alt="ID Document Preview"
                      className="w-full h-full object-contain rounded-lg"
                    />
                    <button
                      onClick={() => setIdDocument(null)}
                      className="absolute top-2 right-2 bg-red-500/80 text-white p-1 rounded-full hover:bg-red-600 transition-colors"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <div className="w-full h-48 bg-slate-800/50 rounded-lg flex flex-col items-center justify-center border-2 border-dashed border-slate-600/50">
                    <Upload size={48} className="text-slate-500 mb-4" />
                    <p className="text-slate-400">Click to upload or drag and drop</p>
                    <p className="text-slate-500 text-sm mt-1">PNG, JPG or PDF (max 5MB)</p>
                  </div>
                )}
              </div>

              <input
                type="file"
                id="id-document"
                accept="image/png, image/jpeg, application/pdf"
                onChange={handleIdDocumentChange}
                className="hidden"
              />
              <label
                htmlFor="id-document"
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors inline-block cursor-pointer"
              >
                {idDocument ? 'Change Document' : 'Select Document'}
              </label>
            </div>

            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 flex items-start gap-3">
              <Info size={18} className="text-blue-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-blue-400 text-sm font-medium">Document Requirements</p>
                <ul className="text-slate-300 text-xs mt-1 space-y-1">
                  <li>• Document must be valid and not expired</li>
                  <li>• All corners of the document must be visible</li>
                  <li>• Text must be clearly legible</li>
                  <li>• No glare or reflections on the document</li>
                </ul>
              </div>
            </div>
          </div>
        );

      case 'selfie':
        return (
          <div className="space-y-6">
            <h3 className="text-xl font-semibold text-white mb-4">Upload or Capture Selfie</h3>
            <p className="text-slate-300 mb-6">
              Please provide a clear selfie of yourself holding your ID document next to your face.
            </p>

            <div className="app-surface-muted rounded-xl p-6">
              {/* Camera capture section */}
              {isCapturingLive ? (
                <div className="space-y-4">
                  {capturedImage ? (
                    <div className="relative w-full max-w-md mx-auto">
                      <img
                        src={capturedImage}
                        alt="Captured Selfie"
                        className="w-full rounded-lg"
                      />
                      <button
                        onClick={retakePhoto}
                        className="absolute top-2 right-2 bg-red-500/80 text-white p-1 rounded-full hover:bg-red-600 transition-colors"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <div className="relative w-full max-w-md mx-auto">
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full rounded-lg bg-black"
                        style={{ display: isCameraActive ? 'block' : 'none' }}
                      />
                      {!isCameraActive && (
                        <div className="w-full h-48 bg-slate-800/50 rounded-lg flex flex-col items-center justify-center border-2 border-dashed border-slate-600/50">
                          <Camera size={48} className="text-slate-500 mb-4" />
                          <p className="text-slate-400">Click "Start Camera" to begin</p>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Hidden canvas for capturing frames */}
                  <canvas ref={canvasRef} className="hidden" />
                  
                  <div className="flex justify-center gap-3 mt-4">
                    {!isCameraActive && !capturedImage && (
                      <button
                        onClick={startCamera}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
                      >
                        <Camera size={18} />
                        Start Camera
                      </button>
                    )}
                    
                    {isCameraActive && !capturedImage && (
                      <button
                        onClick={captureImage}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
                      >
                        <Camera size={18} />
                        Take Photo
                      </button>
                    )}
                    
                    {capturedImage && (
                      <button
                        onClick={retakePhoto}
                        className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
                      >
                        <RefreshCw size={18} />
                        Retake Photo
                      </button>
                    )}
                    
                    <button
                      onClick={() => {
                        setIsCapturingLive(false);
                        stopCamera();
                        setCapturedImage(null);
                        setSelfieDocument(null);
                      }}
                      className="bg-slate-600 hover:bg-slate-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                    >
                      Upload Instead
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center">
                  <div className="mb-4">
                    {selfieDocument ? (
                      <div className="relative w-full h-48 mx-auto">
                        <img
                          src={URL.createObjectURL(selfieDocument as Blob)}
                          alt="Selfie Preview"
                          className="w-full h-full object-contain rounded-lg"
                        />
                        <button
                          onClick={() => setSelfieDocument(null)}
                          className="absolute top-2 right-2 bg-red-500/80 text-white p-1 rounded-full hover:bg-red-600 transition-colors"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ) : (
                      <div className="w-full h-48 bg-slate-800/50 rounded-lg flex flex-col items-center justify-center border-2 border-dashed border-slate-600/50">
                        <Upload size={48} className="text-slate-500 mb-4" />
                        <p className="text-slate-400">Click to upload or drag and drop</p>
                        <p className="text-slate-500 text-sm mt-1">PNG or JPG (max 5MB)</p>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row justify-center gap-3">
                    <input
                      type="file"
                      id="selfie-document"
                      accept="image/png, image/jpeg"
                      onChange={handleSelfieDocumentChange}
                      className="hidden"
                    />
                    <label
                      htmlFor="selfie-document"
                      className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors inline-block cursor-pointer"
                    >
                      {selfieDocument ? 'Change Selfie' : 'Select Selfie'}
                    </label>
                    
                    {isCameraAvailable && (
                      <button
                        onClick={() => {
                          setIsCapturingLive(true);
                          startCamera();
                        }}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 mt-3 sm:mt-0"
                      >
                        <Camera size={18} />
                        Use Camera
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 flex items-start gap-3">
              <Info size={18} className="text-blue-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-blue-400 text-sm font-medium">Selfie Requirements</p>
                <ul className="text-slate-300 text-xs mt-1 space-y-1">
                  <li>• Your face must be clearly visible</li>
                  <li>• Hold your ID document next to your face</li>
                  <li>• Ensure good lighting with no shadows</li>
                  <li>• Look directly at the camera</li>
                </ul>
              </div>
            </div>
          </div>
        );

      case 'review':
        return (
          <div className="space-y-6">
            <h3 className="text-xl font-semibold text-white mb-4">Review Documents</h3>
            <p className="text-slate-300 mb-6">
              Please review your documents before submission. Make sure both images are clear and meet the requirements.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="app-surface-muted rounded-xl p-4">
                <h4 className="text-sm font-medium text-slate-300 mb-2">ID Document</h4>
                {idDocument && (
                  <img
                    src={URL.createObjectURL(idDocument)}
                    alt="ID Document Preview"
                    className="w-full h-32 object-contain rounded-lg"
                  />
                )}
              </div>

              <div className="app-surface-muted rounded-xl p-4">
                <h4 className="text-sm font-medium text-slate-300 mb-2">Selfie with ID</h4>
                {selfieDocument && (
                  <img
                    src={capturedImage || URL.createObjectURL(selfieDocument as Blob)}
                    alt="Selfie Preview"
                    className="w-full h-32 object-contain rounded-lg"
                  />
                )}
              </div>
            </div>

            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 flex items-start gap-3">
              <Info size={18} className="text-amber-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-amber-400 text-sm font-medium">Important Information</p>
                <p className="text-slate-300 text-xs mt-1">
                  By submitting these documents, you confirm that all information provided is accurate and authentic. 
                  Verification typically takes 1-3 business days. You'll receive an email notification once the process is complete.
                </p>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-slate-800 rounded-xl max-w-md w-full p-6 border border-slate-700 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-white">Identity Verification</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-600/20 border border-red-600 rounded-xl p-4 flex items-center gap-3 mb-6">
            <AlertCircle size={20} className="text-red-400 flex-shrink-0" />
            <span className="text-red-400">{error}</span>
          </div>
        )}

        {/* Success Message */}
        {success ? (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle size={32} className="text-green-400" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-3">Documents Submitted</h3>
            <p className="text-slate-300 mb-6">
              Your identity verification documents have been submitted successfully. We'll review them and update your account status within 1-3 business days.
            </p>
          </div>
        ) : (
          <>
            {/* Step Content */}
            {renderStepContent()}

            {/* Navigation Buttons */}
            <div className="flex justify-between mt-8">
              {step !== 'id' ? (
                <button
                  onClick={handlePrevStep}
                  className="app-action-soft text-white px-4 py-2 rounded-lg font-medium transition-colors"
                >
                  Back
                </button>
              ) : (
                <div></div> // Empty div to maintain flex spacing
              )}

              {step === 'review' ? (
                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="app-action-primary disabled:from-slate-700 disabled:to-slate-800 text-white px-6 py-2 rounded-lg font-medium transition-all duration-300 shadow-lg shadow-blue-500/20 flex items-center gap-2"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    'Submit Documents'
                  )}
                </button>
              ) : (
                <button
                  onClick={handleNextStep}
                  disabled={
                    (step === 'id' && !idDocument) || 
                    (step === 'selfie' && !selfieDocument && !capturedImage)
                  }
                  className="app-action-primary disabled:from-slate-700 disabled:to-slate-800 text-white px-6 py-2 rounded-lg font-medium transition-all duration-300 shadow-lg shadow-blue-500/20"
                >
                  Continue
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default KycDocumentUpload;

