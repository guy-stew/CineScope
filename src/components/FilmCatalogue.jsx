// src/components/FilmCatalogue.jsx
// Film management hub — Netflix-style poster grid (Restyled v3.3)
// Matches cinescope_redesign_v2 mockup design language

import React, { useState, useEffect, useMemo } from 'react';
import { Modal } from 'react-bootstrap';
import { useApp } from '../context/AppContext';
import { useTheme } from '../context/ThemeContext';
import { tmdbImageUrl } from '../utils/apiClient';
import Icon from './Icon';
import AddFilmModal from './AddFilmModal';
import FilmDetailView from './FilmDetailView';

// ─── Status config ───
const STATUS_CONFIG = {
  pre_release: { label: 'Pre-release',  cssClass: 'pre_release' },
  released:    { label: 'Released',      cssClass: 'released'    },
  screening:   { label: 'Screening',     cssClass: 'screening'   },
  completed:   { label: 'Completed',     cssClass: 'completed'   },
};

const SORT_OPTIONS = [
  { value: 'updated',     label: 'Recently Updated' },
  { value: 'title',       label: 'Title A–Z' },
  { value: 'title_desc',  label: 'Title Z–A' },
  { value: 'release',     label: 'Release Date (Newest)' },
  { value: 'release_asc', label: 'Release Date (Oldest)' },
  { value: 'revenue',     label: 'Revenue (Highest)' },
];

// Poster placeholder gradient cycle
const POSTER_GRADIENTS = ['--1', '--2', '--3', '--4'];

export default function FilmCatalogue({ show, onHide, inline = false }) {
  const { apiClient, catalogue, refreshCatalogue, analysisSet, toggleAnalysisFilm, selectAllAnalysis, clearAllAnalysis } = useApp();
  const { theme } = useTheme();

  // ─── State ───
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('updated');
  const [showAddFilm, setShowAddFilm] = useState(false);
  const [selectedFilmId, setSelectedFilmId] = useState(null);

  // Refresh catalogue when modal opens or inline view mounts
  useEffect(() => {
    if (show || inline) refreshCatalogue();
  }, [show, inline, refreshCatalogue]);

  // ─── Filter & sort ───
  const filteredFilms = useMemo(() => {
    let films = [...catalogue];

    if (statusFilter !== 'all') {
      films = films.filter(f => f.status === statusFilter);
    }

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      films = films.filter(f =>
        f.title.toLowerCase().includes(term) ||
        (f.genres && f.genres.toLowerCase().includes(term))
      );
    }

    films.sort((a, b) => {
      switch (sortBy) {
        case 'title':       return a.title.localeCompare(b.title);
        case 'title_desc':  return b.title.localeCompare(a.title);
        case 'release':     return (b.release_date || '').localeCompare(a.release_date || '');
        case 'release_asc': return (a.release_date || '').localeCompare(b.release_date || '');
        case 'revenue':     return (parseFloat(b.total_uk_revenue) || 0) - (parseFloat(a.total_uk_revenue) || 0);
        default:            return new Date(b.updated_at) - new Date(a.updated_at);
      }
    });

    return films;
  }, [catalogue, statusFilter, searchTerm, sortBy]);

  // ─── Handlers ───
  const handleFilmAdded = () => {
    refreshCatalogue();
    setShowAddFilm(false);
  };

  const handleFilmUpdated = () => refreshCatalogue();

  const handleFilmDeleted = () => {
    refreshCatalogue();
    setSelectedFilmId(null);
  };

  // ─── Derived data ───
  const statusCounts = useMemo(() => {
    const counts = { all: catalogue.length };
    for (const f of catalogue) {
      counts[f.status] = (counts[f.status] || 0) + 1;
    }
    return counts;
  }, [catalogue]);

  const filmsWithDataCount = useMemo(() =>
    catalogue.filter(f => parseInt(f.import_count) > 0).length,
    [catalogue]
  );

  const analysisCount = analysisSet.length;


  // ═══════════════════════════════════════════════════════════════
  // RENDER — CATALOGUE CONTENT
  // ═══════════════════════════════════════════════════════════════

  const catalogueContent = (
    <div className="cs-fc">
      {/* ── Toolbar ── */}
      <div className="cs-fc__toolbar">
        <h1 className="cs-fc__title">Film Catalogue</h1>
        <div className="cs-fc__toolbar-right">
          <div className="cs-fc__search-wrap">
            <Icon name="search" size={18} />
            <input
              type="text"
              className="cs-fc__search"
              placeholder="Search films..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          <button className="cs-fc__btn" onClick={() => {}}>
            <Icon name="tune" size={16} /> Filter
          </button>
          <button className="cs-fc__btn cs-fc__btn--primary" onClick={() => setShowAddFilm(true)}>
            <Icon name="add" size={16} /> Add Film
          </button>
        </div>
      </div>

      {/* ── Filter Bar ── */}
      <div className="cs-fc__filter-bar">
        <div className="cs-fc__status-pills">
          {['all', 'pre_release', 'released', 'screening', 'completed'].map(status => {
            const config = STATUS_CONFIG[status];
            const count = statusCounts[status] || 0;
            if (status !== 'all' && count === 0) return null;
            const isActive = statusFilter === status;
            return (
              <button
                key={status}
                className={`cs-fc__pill ${isActive ? 'cs-fc__pill--active' : ''}`}
                onClick={() => setStatusFilter(status)}
              >
                {status === 'all' ? 'All' : config.label}
                <span className="cs-fc__pill-count">{count}</span>
              </button>
            );
          })}
        </div>

        <select
          className="cs-fc__select"
          value={sortBy}
          onChange={e => setSortBy(e.target.value)}
        >
          {SORT_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        {filmsWithDataCount > 1 && (
          <div className="cs-fc__analysis-bar">
            <span>Analysis: {analysisCount} of {filmsWithDataCount}</span>
            <button
              className="cs-fc__analysis-btn"
              onClick={selectAllAnalysis}
              disabled={analysisCount === filmsWithDataCount}
            >
              <Icon name="check_box" size={14} /> Select All
            </button>
            <button
              className="cs-fc__analysis-btn"
              onClick={clearAllAnalysis}
              disabled={analysisCount === 0}
            >
              <Icon name="check_box_outline_blank" size={14} /> Deselect
            </button>
          </div>
        )}
      </div>

      {/* ── Loading ── */}
      {loading && (
        <div className="cs-fc__loading">
          <Icon name="progress_activity" size={24} />
          Loading catalogue...
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <div className="cs-fc__error">
          <Icon name="error" size={20} /> {error}
        </div>
      )}

      {/* ── Empty state ── */}
      {!loading && !error && filteredFilms.length === 0 && (
        <div className="cs-fc__empty">
          <span className="cs-fc__empty-icon material-symbols-rounded">movie</span>
          <div className="cs-fc__empty-title">
            {catalogue.length === 0 ? 'No films yet' : 'No films match your filters'}
          </div>
          <div className="cs-fc__empty-desc">
            {catalogue.length === 0 ? 'Add your first film to get started' : 'Try adjusting your search or filters'}
          </div>
          {catalogue.length === 0 && (
            <button
              className="cs-fc__btn cs-fc__btn--primary"
              style={{ margin: '16px auto 0', display: 'inline-flex' }}
              onClick={() => setShowAddFilm(true)}
            >
              <Icon name="add" size={16} /> Add Your First Film
            </button>
          )}
        </div>
      )}

      {/* ── Film Grid ── */}
      {!loading && !error && filteredFilms.length > 0 && (
        <div className="cs-fc__grid">
          {filteredFilms.map((film, idx) => (
            <FilmCard
              key={film.id}
              film={film}
              gradientIdx={idx % 4}
              onClick={() => setSelectedFilmId(film.id)}
              isInAnalysis={analysisSet.includes(film.id)}
              onToggleAnalysis={toggleAnalysisFilm}
            />
          ))}

          {/* Add Film placeholder card */}
          <div className="cs-fc__add-card" onClick={() => setShowAddFilm(true)}>
            <div className="cs-fc__add-card-inner">
              <div className="cs-fc__add-card-icon">+</div>
              <div className="cs-fc__add-card-label">Import Comscore Data</div>
              <div className="cs-fc__add-card-sub">or add from TMDB</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );


  // ═══════════════════════════════════════════════════════════════
  // RENDER — DETAIL VIEW (modal overlay)
  // ═══════════════════════════════════════════════════════════════

  const detailModal = selectedFilmId ? (
    <Modal show onHide={() => setSelectedFilmId(null)} fullscreen dialogClassName="film-catalogue-modal">
      <FilmDetailView
        filmId={selectedFilmId}
        onBack={() => setSelectedFilmId(null)}
        onClose={inline ? () => setSelectedFilmId(null) : onHide}
        onFilmUpdated={handleFilmUpdated}
        onFilmDeleted={handleFilmDeleted}
      />
    </Modal>
  ) : null;


  // ═══════════════════════════════════════════════════════════════
  // RENDER — INLINE vs MODAL wrapper
  // ═══════════════════════════════════════════════════════════════

  if (inline) {
    return (
      <>
        <div
          className="d-flex flex-column h-100"
          style={{ background: 'var(--cs-body)', color: 'var(--cs-text)' }}
        >
          {catalogueContent}
        </div>
        {detailModal}
        <AddFilmModal show={showAddFilm} onHide={() => setShowAddFilm(false)} onFilmAdded={handleFilmAdded} />
      </>
    );
  }

  return (
    <>
      <Modal show={show} onHide={onHide} fullscreen dialogClassName="film-catalogue-modal">
        <Modal.Header
          closeButton
          style={{
            background: theme.header,
            borderBottom: `1px solid ${theme.border}`,
          }}
        >
          <Modal.Title style={{ color: theme.headerText || '#fff' }}>
            <div className="d-flex align-items-center gap-2">
              <Icon name="movie" size={22} />
              <span className="fw-bold">Film Catalogue</span>
            </div>
          </Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ background: 'var(--cs-body)', color: 'var(--cs-text)', padding: 0 }}>
          {catalogueContent}
        </Modal.Body>
      </Modal>
      {detailModal}
      <AddFilmModal show={showAddFilm} onHide={() => setShowAddFilm(false)} onFilmAdded={handleFilmAdded} />
    </>
  );
}


// ═══════════════════════════════════════════════════════════════
// FILM CARD COMPONENT
// ═══════════════════════════════════════════════════════════════

function FilmCard({ film, gradientIdx, onClick, isInAnalysis, onToggleAnalysis }) {
  const posterUrl = tmdbImageUrl(film.poster_path, 'w342');
  const statusConf = STATUS_CONFIG[film.status] || STATUS_CONFIG.pre_release;
  const hasComscore = parseInt(film.import_count) > 0;
  const revenue = parseFloat(film.total_uk_revenue) || 0;
  const venueCount = parseInt(film.import_count) || 0;

  const handleCheckboxClick = (e) => {
    e.stopPropagation();
    onToggleAnalysis(film.id);
  };

  return (
    <div
      className={`cs-fc__card${isInAnalysis ? ' cs-fc__card--selected' : ''}`}
      onClick={onClick}
      title={film.title}
    >
      {/* Poster */}
      <div className="cs-fc__poster">
        {posterUrl ? (
          <img src={posterUrl} alt={film.title} loading="lazy" />
        ) : (
          <div className={`cs-fc__poster-placeholder cs-fc__poster-placeholder${POSTER_GRADIENTS[gradientIdx]}`}>
            <span>{film.title}</span>
          </div>
        )}

        {/* Checkbox — only for films with Comscore data */}
        {hasComscore && (
          <div
            className={`cs-fc__checkbox${isInAnalysis ? ' cs-fc__checkbox--checked' : ''}`}
            onClick={handleCheckboxClick}
          >
            {!isInAnalysis && (
              <span className="material-symbols-rounded" style={{ fontSize: '14px', color: 'rgba(255,255,255,0.6)' }}>
                check_box_outline_blank
              </span>
            )}
          </div>
        )}

        {/* Status badge */}
        <span className={`cs-fc__status-badge cs-fc__status-badge--${statusConf.cssClass}`}>
          {statusConf.label}
        </span>

        {/* Comscore indicator */}
        <span className={`cs-fc__comscore cs-fc__comscore--${hasComscore ? 'yes' : 'no'}`}>
          {hasComscore ? (
            <><span className="material-symbols-rounded" style={{ fontSize: '10px' }}>check</span> Comscore</>
          ) : (
            'No data'
          )}
        </span>
      </div>

      {/* Info */}
      <div className="cs-fc__info">
        <div className="cs-fc__film-title">{film.title}</div>
        <div className="cs-fc__film-meta">
          {film.year && <span>{film.year}</span>}
          {film.year && film.genres && <span className="cs-fc__separator">·</span>}
          {film.genres && <span>{film.genres}</span>}
          {hasComscore && venueCount > 0 && (
            <>
              <span className="cs-fc__separator">·</span>
              <span>{venueCount} venues</span>
            </>
          )}
        </div>
        {revenue > 0 ? (
          <div className="cs-fc__film-revenue">
            £{revenue.toLocaleString('en-GB', { maximumFractionDigits: 0 })}
          </div>
        ) : (
          <div className="cs-fc__film-revenue cs-fc__film-revenue--empty">
            No data
          </div>
        )}
      </div>
    </div>
  );
}
