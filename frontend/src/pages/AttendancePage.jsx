import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Download } from 'lucide-react';
import AttendanceTable from '../components/attendance/AttendanceTable';

const AttendancePage = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();

  return (
    <div
      className="min-h-screen"
      style={{ background: 'var(--bg-primary)' }}
    >
      <header
        className="flex items-center gap-4 px-6 py-4 border-b border-white/6"
        style={{ background: 'var(--bg-secondary)' }}
      >
        <button
          onClick={() => navigate(-1)}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/5 transition-all"
        >
          <ArrowLeft size={16} />
        </button>
        <h1 className="text-lg font-bold text-white" style={{ fontFamily: 'Syne, sans-serif' }}>
          {roomId ? 'Room Attendance' : 'My Attendance History'}
        </h1>
      </header>

      <main className="p-6 max-w-5xl mx-auto">
        <AttendanceTable
          roomId={roomId}
          title={roomId ? 'Room Attendance Log' : 'My Call History'}
        />
      </main>
    </div>
  );
};

export default AttendancePage;
