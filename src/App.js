// App.js
// 24BCE2348 — KaviyaShree S
// BCSE203E Web Programming

import React, { useState, useCallback } from 'react';
import './App.css';
import KaviyaDetector from './components/KaviyaDetector';
import KaviyaSessionLog from './components/KaviyaSessionLog';

function App() {
  const [isActive, setIsActive]   = useState(false);
  const [events,   setEvents]     = useState([]);

  const handleEvent = useCallback((evt) => {
    setEvents(prev => [
      { ...evt, time: new Date().toLocaleTimeString() },
      ...prev.slice(0, 49),
    ]);
  }, []);

  return (
    <div className="app_root">

      {/* ── TOP HEADER ── */}
      <header className="app_header">
        <div className="hdr_left">
          <span className="hdr_logo">DrowsyGuard</span>
          <span className="hdr_tag">Real-Time Driver Drowsiness Detection</span>
        </div>
        <div className="hdr_right">
          <a
            href="portfolio.html"
            target="_blank"
            rel="noopener noreferrer"
            className="hdr_portfolio_btn"
          >
            ◈ Portfolio — KaviyaShree
          </a>
          <a
            href="https://github.com/kaviyasenthil34"
            target="_blank"
            rel="noopener noreferrer"
            className="hdr_github_btn"
          >
            GitHub ↗
          </a>
          <span className="hdr_reg">24BCE2348 · BCSE203E</span>
        </div>
      </header>

      {/* ── MAIN BODY ── */}
      <main className="app_main">
        <KaviyaDetector
          onEvent={handleEvent}
          isActive={isActive}
          setIsActive={setIsActive}
        />
        <KaviyaSessionLog events={events} isActive={isActive} />
      </main>

      {/* ── FOOTER ── */}
      <footer className="app_footer">
        <span>
          <strong>Kaviya Shree S</strong> · 24BCE2348 · B.Tech CSE · VIT Vellore
        </span>
        <span>BCSE203E Web Programming · Dr. V. SIVAKUMAR</span>
        <div className="ftr_links">
          <a href="portfolio.html" target="_blank" rel="noopener noreferrer">Portfolio</a>
          <a href="https://github.com/kaviyasenthil34" target="_blank" rel="noopener noreferrer">GitHub</a>
        </div>
      </footer>

    </div>
  );
}

export default App;