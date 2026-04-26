import { useState } from 'react';
import { X, Globe, Lock, Plus } from 'lucide-react';
import { roomsApi } from '../../services/api';
import clsx from 'clsx';

const CreateRoomModal = ({ onClose, onCreate }) => {
  const [name, setName] = useState('');
  const [type, setType] = useState('open');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!name.trim()) { setError('Room name is required'); return; }
    setLoading(true);
    setError('');
    try {
      const { data } = await roomsApi.create({ name: name.trim(), type });
      onCreate(data.room);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create room');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="card w-full max-w-md p-6 animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-white" style={{ fontFamily: 'Syne, sans-serif' }}>
            Create Room
          </h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/5 transition-all">
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <div className="space-y-4">
          <div>
            <label className="label">Room Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Design Review, Team Standup…"
              className="input-field"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              maxLength={60}
            />
          </div>

          <div>
            <label className="label">Room Type</label>
            <div className="grid grid-cols-2 gap-3">
              {[
                { value: 'open', icon: Globe, label: 'Open Room', desc: 'Anyone can discover & join' },
                { value: 'private', icon: Lock, label: 'Private Room', desc: 'Join via code only' },
              ].map(({ value, icon: Icon, label, desc }) => (
                <button
                  key={value}
                  onClick={() => setType(value)}
                  className={clsx(
                    'flex flex-col gap-2 p-3 rounded-xl border transition-all text-left',
                    type === value
                      ? 'border-amber-400/50 bg-amber-400/8'
                      : 'border-white/8 bg-white/3 hover:border-white/15'
                  )}
                >
                  <Icon size={18} className={type === value ? 'text-amber-400' : 'text-slate-400'} />
                  <div>
                    <p className="text-sm font-semibold text-white">{label}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-500/10 px-3 py-2 rounded-lg">{error}</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="btn-ghost flex-1 justify-center">Cancel</button>
          <button
            onClick={handleCreate}
            disabled={loading || !name.trim()}
            className="btn-primary flex-1 justify-center disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-navy-950/30 border-t-navy-950 rounded-full animate-spin" />
            ) : (
              <Plus size={16} />
            )}
            Create Room
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateRoomModal;
