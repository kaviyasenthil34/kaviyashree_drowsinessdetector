// KaviyaSessionLog.js
// 24BCE2348 — KaviyaShree S
// BCSE203E Web Programming

import React from 'react';

function KaviyaSessionLog({ events, isActive }) {
  return (
    <div className="session_log">
      <div className="sl_header">
        <span className="sl_title">Session Event Log</span>
        <span className="sl_count">
          {events.length} event{events.length !== 1 ? 's' : ''} recorded
          &nbsp;·&nbsp; 24BCE2348 KaviyaShree
        </span>
      </div>

      {events.length === 0 ? (
        <div className="sl_empty">
          {isActive
            ? 'No alerts yet — detection is running...'
            : 'Start detection to begin logging events.'}
        </div>
      ) : (
        <div className="sl_table_wrap">
          <table className="sl_table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Type</th>
                <th>Level</th>
                <th>EHR</th>
                <th>EAR</th>
                <th>PERCLOS</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev, i) => (
                <tr key={i}>
                  <td style={{ color: 'var(--muted, #5a5a72)' }}>{ev.time}</td>
                  <td className={
                    ev.type === 'CRITICAL' ? 'ev_critical'
                    : ev.type === 'DROWSY' ? 'ev_drowsy'
                    : 'ev_warning'
                  }>
                    {ev.type === 'CRITICAL' ? '🚨 CRITICAL'
                     : ev.type === 'DROWSY' ? '⚠ DROWSY'
                     : '⚡ WARNING'}
                  </td>
                  <td>{ev.level}</td>
                  <td>{ev.ehr ?? '—'}</td>
                  <td>{ev.ear ?? '—'}</td>
                  <td>{ev.perclos ?? '—'}</td>
                  <td style={{ maxWidth: '260px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {ev.message}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default KaviyaSessionLog;