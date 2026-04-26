import { useState } from 'react';
import { X, Hash } from 'lucide-react';
import { roomsApi } from '../../services/api';

const JoinByCodeModal = ({ onClose, onJoin }) => {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleJoin = async () => {
    if (code.trim().length < 6) { setError('Enter a valid 6-character room code'); return; }
    setLoading(true);
    setError('');
    try {
      const { data } = await roomsApi.getByCode(code.trim());
      onJoin(data.room);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Room not found');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="card w-full max-w-sm p-6 animate-slide-up">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-white" style={{ fontFamily: 'Syne, sans-serif' }}>
            Join by Code
          </h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/5 transition-all">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="label">Room Code</label>
            <div className="relative">
              <Hash size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
                placeholder="XXXXXX"
                className="input-field pl-9 font-mono tracking-widest text-center text-lg uppercase"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                maxLength={6}
              />
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-500/10 px-3 py-2 rounded-lg">{error}</p>
          )}
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="btn-ghost flex-1 justify-center">Cancel</button>
          <button
            onClick={handleJoin}
            disabled={loading || code.trim().length < 6}
            className="btn-primary flex-1 justify-center disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-navy-950/30 border-t-navy-950 rounded-full animate-spin" />
            ) : 'Join Room'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default JoinByCodeModal;
