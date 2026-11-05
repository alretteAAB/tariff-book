import { useState } from "react";
import { styles } from "./styles.js";
import { scrollToTop, scrollToBottom } from "./lib/utils.jsx";
import GolonganView from "./views/GolonganView.jsx";
import TarifView from "./views/TarifView.jsx";
import KenaikanView from "./views/KenaikanView.jsx";
import ClinicalPathwayView from "./views/ClinicalPathwayView.jsx";
// by Aldo Oktavianus
// data by Arfan Hafidt Nashrullah
// idea Beatrice Marietta 

// Ganti dengan link Google Drive panduan penggunaan
const PANDUAN_URL = "https://drive.google.com/file/d/1B1Hc7ZFzZHywgborYsZcVJKCsiN1mDVT/view";

// Cangkang aplikasi: menyuntikkan CSS, menggambar header + navigasi tab, lalu
// menyerahkan isi halaman ke view yang aktif. Tiap view memegang state-nya
// sendiri — berpindah tab akan mengosongkannya, dan itu memang disengaja.
export default function App() {
  const [tab, setTab] = useState("tarif"); // halaman aktif: 'tarif' | 'golongan' | 'kenaikan' | 'pathway'

  return (
    <>
      <style>{styles}</style>
      <div className="app">
        <header className="header">
          <div className="header-icon">📒</div>
          <div>
            <div className="header-title">Buku Tarif</div>
            <div className="header-sub">Pencarian tarif layanan & tindakan medis rumah sakit</div>
          </div>
          <nav className="nav-tabs">
            <button
              className={`nav-tab ${tab === 'tarif' ? 'active' : ''}`}
              onClick={() => setTab('tarif')}
            >
              Tarif Layanan
            </button>
            <button
              className={`nav-tab ${tab === 'golongan' ? 'active' : ''}`}
              onClick={() => setTab('golongan')}
            >
              Golongan Operasi
            </button>
            <button
              className={`nav-tab ${tab === 'kenaikan' ? 'active' : ''}`}
              onClick={() => setTab('kenaikan')}
            >
              Dashboard
            </button>
            <button
              className={`nav-tab ${tab === 'pathway' ? 'active' : ''}`}
              onClick={() => setTab('pathway')}
            >
              Clinical Pathway
            </button>
          </nav>
          <a
            href={PANDUAN_URL}
            target="_blank"
            rel="noopener noreferrer"
            title="Buka Panduan Penggunaan"
            style={{
              flexShrink: 0,
              marginLeft: 12,
              padding: "8px 14px",
              background: "#8A6010",
              color: "#fff",
              borderRadius: 8,
              fontSize: "0.875rem",
              fontWeight: 600,
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            📘 Panduan Penggunaan
          </a>
        </header>

        {tab === 'golongan' ? <GolonganView />
          : tab === 'kenaikan' ? <KenaikanView />
          : tab === 'pathway' ? <ClinicalPathwayView />
          : <TarifView />}

        <div className="scroll-btns">
          <button className="scroll-btn" onClick={scrollToTop} title="Ke Atas">↑</button>
          <button className="scroll-btn" onClick={scrollToBottom} title="Ke Bawah">↓</button>
        </div>
      </div>
    </>
  );
}
