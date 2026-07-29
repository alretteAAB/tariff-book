import { useState } from "react";
import { styles } from "./styles.js";
import { scrollToTop, scrollToBottom } from "./lib/utils.jsx";
import GolonganView from "./views/GolonganView.jsx";
import TarifView from "./views/TarifView.jsx";

// Cangkang aplikasi: menyuntikkan CSS, menggambar header + navigasi tab, lalu
// menyerahkan isi halaman ke view yang aktif. Tiap view memegang state-nya
// sendiri — berpindah tab akan mengosongkannya, dan itu memang disengaja.
export default function App() {
  const [tab, setTab] = useState("tarif"); // halaman aktif: 'tarif' | 'golongan'

  return (
    <>
      <style>{styles}</style>
      <div className="app">
        <header className="header">
          <div className="header-icon">📒</div>
          <div>
            <div className="header-title">Buku Tarif</div>
            <div className="header-sub">Pencarian tarif layanan & tindakan medis rumah sakit · by ASO</div>
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
          </nav>
        </header>

        {tab === 'golongan' ? <GolonganView /> : <TarifView />}

        <div className="scroll-btns">
          <button className="scroll-btn" onClick={scrollToTop} title="Ke Atas">↑</button>
          <button className="scroll-btn" onClick={scrollToBottom} title="Ke Bawah">↓</button>
        </div>
      </div>
    </>
  );
}
