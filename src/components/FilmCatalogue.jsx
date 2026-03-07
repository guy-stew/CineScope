// src/components/FilmCatalogue.jsx
// Full-screen overlay displaying all films in a Netflix-style poster grid
// Replaces the old "Import" button — this is the central film management hub

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Modal, Button, Form, InputGroup, Badge, Spinner, Dropdown } from 'react-bootstrap';
import { useApp } from '../context/AppContext';
import { tmdbImageUrl } from '../utils/apiClient';
import AddFilmModal from './AddFilmModal';
import FilmDetailView from './FilmDetailView';

// ─── Status config ───
const STATUS_CONFIG = {
  pre_release: { label: 'Pre-release', bg: 'info', icon: 'schedule' },
  released:    { label: 'Released',    bg: 'primary', icon: 'movie' },
  screening:   { label: 'Screening',   bg: 'warning', icon: 'theaters' },
  completed:   { label: 'Completed',   bg: 'success', icon: 'check_circle' },
};

const SORT_OPTIONS = [
  { value: 'updated', label: 'Recently Updated' },
  { value: 'title', label: 'Title A–Z' },
  { value: 'title_desc', label: 'Title Z–A' },
  { value: 'release', label: 'Release Date (Newest)' },
  { value: 'release_asc', label: 'Release Date (Oldest)' },
  { value: 'revenue', label: 'Revenue (Highest)' },
];

export default function FilmCatalogue({ show, onHide }) {
  const { apiClient } = useApp();

  // ─── State ───
  const [catalogue, setCatalogue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('updated');
  const [showAddFilm, setShowAddFilm] = useState(false);
  const [selectedFilmId, setSelectedFilmId] = useState(null);

  // ─── Load catalogue ───
  const loadCatalogue = useCallback(async () => {
    if (!apiClient) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.getCatalogue();
      setCatalogue(data.catalogue || []);
    } catch (err) {
      console.error('Failed to load catalogue:', err);
      setError('Failed to load film catalogue');
    } finally {
      setLoading(false);
    }
  }, [apiClient]);

  useEffect(() => {
    if (show) loadCatalogue();
  }, [show, loadCatalogue]);

  // ─── Filter & sort ───
  const filteredFilms = useMemo(() => {
    let films = [...catalogue];

    // Status filter
    if (statusFilter !== 'all') {
      films = films.filter(f => f.status === statusFilter);
    }

    // Search filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      films = films.filter(f =>
        f.title.toLowerCase().includes(term) ||
        (f.genres && f.genres.toLowerCase().includes(term))
      );
    }

    // Sort
    films.sort((a, b) => {
      switch (sortBy) {
        case 'title':
          return a.title.localeCompare(b.title);
        case 'title_desc':
          return b.title.localeCompare(a.title);
        case 'release':
          return (b.release_date || '').localeCompare(a.release_date || '');
        case 'release_asc':
          return (a.release_date || '').localeCompare(b.release_date || '');
        case 'revenue':
          return (parseFloat(b.total_uk_revenue) || 0) - (parseFloat(a.total_uk_revenue) || 0);
        default: // updated
          return new Date(b.updated_at) - new Date(a.updated_at);
      }
    });

    return films;
  }, [catalogue, statusFilter, searchTerm, sortBy]);

  // ─── Handlers ───
  const handleFilmAdded = (newEntry) => {
    setCatalogue(prev => [newEntry, ...prev]);
    setShowAddFilm(false);
  };

  const handleFilmUpdated = (updated) => {
    setCatalogue(prev => prev.map(f => f.id === updated.id ? { ...f, ...updated } : f));
  };

  const handleFilmDeleted = (deletedId) => {
    setCatalogue(prev => prev.filter(f => f.id !== deletedId));
    setSelectedFilmId(null);
  };

  // ─── Count badges ───
  const statusCounts = useMemo(() => {
    const counts = { all: catalogue.length };
    for (const f of catalogue) {
      counts[f.status] = (counts[f.status] || 0) + 1;
    }
    return counts;
  }, [catalogue]);

  // ─── Render ───
  if (selectedFilmId) {
    return (
      <Modal show={show} onHide={onHide} fullscreen dialogClassName="film-catalogue-modal">
        <FilmDetailView
          filmId={selectedFilmId}
          onBack={() => setSelectedFilmId(null)}
          onClose={onHide}
          onFilmUpdated={handleFilmUpdated}
          onFilmDeleted={handleFilmDeleted}
        />
      </Modal>
    );
  }

  return (
    <>
      <Modal show={show} onHide={onHide} fullscreen dialogClassName="film-catalogue-modal">
        <Modal.Header closeButton className="catalogue-header border-0 pb-0">
          <div className="w-100">
            <div className="d-flex align-items-center justify-content-between mb-3">
              <div className="d-flex align-items-center gap-2">
                <span className="material-symbols-rounded fs-3" style={{ color: '#e50914' }}>movie</span>
                <h4 className="mb-0 fw-bold">Film Catalogue</h4>
                <Badge bg="secondary" pill className="ms-1">{catalogue.length}</Badge>
              </div>
              <Button
                variant="danger"
                className="d-flex align-items-center gap-1"
                onClick={() => setShowAddFilm(true)}
              >
                <span className="material-symbols-rounded" style={{ fontSize: '18px' }}>add</span>
                Add Film
              </Button>
            </div>

            {/* Toolbar: Search + Filters + Sort */}
            <div className="d-flex flex-wrap gap-2 align-items-center mb-2">
              <InputGroup style={{ maxWidth: '300px' }}>
                <InputGroup.Text>
                  <span className="material-symbols-rounded" style={{ fontSize: '18px' }}>search</span>
                </InputGroup.Text>
                <Form.Control
                  placeholder="Search films..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
                {searchTerm && (
                  <Button variant="outline-secondary" size="sm" onClick={() => setSearchTerm('')}>
                    <span className="material-symbols-rounded" style={{ fontSize: '16px' }}>close</span>
                  </Button>
                )}
              </InputGroup>

              {/* Status filter pills */}
              <div className="d-flex gap-1 flex-wrap">
                {['all', 'pre_release', 'released', 'screening', 'completed'].map(status => {
                  const isActive = statusFilter === status;
                  const config = STATUS_CONFIG[status];
                  const count = statusCounts[status] || 0;
                  if (status !== 'all' && count === 0) return null;
                  return (
                    <Button
                      key={status}
                      size="sm"
                      variant={isActive ? (status === 'all' ? 'light' : config?.bg || 'light') : 'outline-secondary'}
                      className="d-flex align-items-center gap-1"
                      onClick={() => setStatusFilter(status)}
                    >
                      {status === 'all' ? 'All' : config.label}
                      <Badge bg={isActive ? 'dark' : 'secondary'} pill className="ms-1" style={{ fontSize: '0.7em' }}>
                        {count}
                      </Badge>
                    </Button>
                  );
                })}
              </div>

              <Form.Select
                size="sm"
                style={{ width: 'auto', minWidth: '180px' }}
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
              >
                {SORT_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </Form.Select>
            </div>
          </div>
        </Modal.Header>

        <Modal.Body className="catalogue-body pt-2">
          {loading ? (
            <div className="d-flex flex-column align-items-center justify-content-center" style={{ minHeight: '300px' }}>
              <Spinner animation="border" variant="danger" />
              <p className="mt-3 text-muted">Loading catalogue...</p>
            </div>
          ) : error ? (
            <div className="text-center text-danger py-5">
              <span className="material-symbols-rounded fs-1">error</span>
              <p className="mt-2">{error}</p>
              <Button variant="outline-danger" size="sm" onClick={loadCatalogue}>Retry</Button>
            </div>
          ) : filteredFilms.length === 0 ? (
            <div className="text-center py-5">
              <span className="material-symbols-rounded" style={{ fontSize: '64px', color: '#666' }}>movie</span>
              <h5 className="mt-3 text-muted">
                {catalogue.length === 0 ? 'No films yet' : 'No films match your filters'}
              </h5>
              <p className="text-muted">
                {catalogue.length === 0
                  ? 'Add your first film to get started'
                  : 'Try adjusting your search or filters'}
              </p>
              {catalogue.length === 0 && (
                <Button variant="danger" onClick={() => setShowAddFilm(true)}>
                  <span className="material-symbols-rounded me-1" style={{ fontSize: '18px' }}>add</span>
                  Add Your First Film
                </Button>
              )}
            </div>
          ) : (
            <div className="catalogue-grid">
              {filteredFilms.map(film => (
                <FilmCard key={film.id} film={film} onClick={() => setSelectedFilmId(film.id)} />
              ))}
            </div>
          )}
        </Modal.Body>
      </Modal>

      {/* Add Film sub-modal */}
      <AddFilmModal
        show={showAddFilm}
        onHide={() => setShowAddFilm(false)}
        onFilmAdded={handleFilmAdded}
      />

      {/* Catalogue-specific styles */}
      <style>{`
        .film-catalogue-modal .modal-content {
          background: var(--cs-bg, #1a1a2e);
          color: var(--cs-text, #e0e0e0);
        }
        .catalogue-header {
          background: transparent;
          padding: 1rem 1.5rem 0;
        }
        .catalogue-body {
          padding: 0.5rem 1.5rem 1.5rem;
          overflow-y: auto;
        }
        .catalogue-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
          gap: 1.25rem;
        }
        @media (min-width: 992px) {
          .catalogue-grid {
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          }
        }

        /* Card styles */
        .film-card {
          cursor: pointer;
          border-radius: 8px;
          overflow: hidden;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
          background: var(--cs-card-bg, #16213e);
          border: 1px solid var(--cs-border, rgba(255,255,255,0.08));
        }
        .film-card:hover {
          transform: translateY(-4px) scale(1.02);
          box-shadow: 0 8px 24px rgba(0,0,0,0.4);
          border-color: rgba(229, 9, 20, 0.4);
        }
        .film-card-poster {
          position: relative;
          aspect-ratio: 2/3;
          background: linear-gradient(135deg, #2a2a4a 0%, #1a1a2e 100%);
          overflow: hidden;
        }
        .film-card-poster img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .film-card-poster .placeholder-title {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
          text-align: center;
          font-weight: 600;
          font-size: 0.95rem;
          color: rgba(255,255,255,0.6);
          background: linear-gradient(135deg, #2d1f3d 0%, #1a1a2e 50%, #1f2d3d 100%);
        }
        .film-card-status {
          position: absolute;
          top: 8px;
          right: 8px;
        }
        .film-card-comscore {
          position: absolute;
          bottom: 8px;
          left: 8px;
        }
        .film-card-info {
          padding: 0.6rem 0.75rem;
        }
        .film-card-title {
          font-size: 0.85rem;
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          margin-bottom: 0.15rem;
        }
        .film-card-meta {
          font-size: 0.75rem;
          color: var(--cs-text-muted, #888);
          display: flex;
          align-items: center;
          gap: 0.4rem;
          flex-wrap: wrap;
        }
        .film-card-genres {
          font-size: 0.7rem;
          color: var(--cs-text-muted, #888);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          margin-top: 0.15rem;
        }
        .film-card-revenue {
          font-size: 0.8rem;
          font-weight: 600;
          color: #4ade80;
          margin-top: 0.25rem;
        }

        /* ── Form contrast fixes (covers FilmDetailView edit mode) ── */
        .film-catalogue-modal .form-label,
        .film-catalogue-modal h6 {
          color: #ccc !important;
        }
        .film-catalogue-modal .form-control,
        .film-catalogue-modal .form-select {
          background: rgba(255,255,255,0.08);
          border-color: rgba(255,255,255,0.15);
          color: #f0f0f0;
        }
        .film-catalogue-modal .form-control::placeholder {
          color: #888;
        }
        .film-catalogue-modal .form-control:focus,
        .film-catalogue-modal .form-select:focus {
          background: rgba(255,255,255,0.12);
          border-color: #e50914;
          color: #f0f0f0;
          box-shadow: 0 0 0 0.2rem rgba(229, 9, 20, 0.15);
        }
        .film-catalogue-modal .input-group-text {
          background: rgba(255,255,255,0.06);
          border-color: rgba(255,255,255,0.15);
          color: #aaa;
        }
        .film-catalogue-modal .nav-tabs .nav-link {
          color: #999;
        }
        .film-catalogue-modal .nav-tabs .nav-link.active {
          color: #f0f0f0;
          background: transparent;
          border-bottom-color: #e50914;
        }
        .film-catalogue-modal .form-select option {
          background: #1a1a2e;
          color: #e0e0e0;
        }

        /* Light theme overrides */
        [data-theme="light"] .film-catalogue-modal .modal-content {
          background: #f8f9fa;
          color: #212529;
        }
        [data-theme="light"] .film-card {
          background: #fff;
          border-color: #dee2e6;
        }
        [data-theme="light"] .film-card:hover {
          border-color: rgba(229, 9, 20, 0.3);
          box-shadow: 0 8px 24px rgba(0,0,0,0.12);
        }
        [data-theme="light"] .film-card-poster .placeholder-title {
          background: linear-gradient(135deg, #e8e0f0 0%, #f0f0f5 50%, #e0e8f0 100%);
          color: rgba(0,0,0,0.4);
        }
        [data-theme="light"] .film-catalogue-modal .form-label,
        [data-theme="light"] .film-catalogue-modal h6 {
          color: #495057 !important;
        }
        [data-theme="light"] .film-catalogue-modal .form-control,
        [data-theme="light"] .film-catalogue-modal .form-select {
          background: #fff;
          border-color: #ced4da;
          color: #212529;
        }
        [data-theme="light"] .film-catalogue-modal .input-group-text {
          background: #e9ecef;
          border-color: #ced4da;
          color: #495057;
        }
        [data-theme="light"] .film-catalogue-modal .nav-tabs .nav-link {
          color: #6c757d;
        }
        [data-theme="light"] .film-catalogue-modal .nav-tabs .nav-link.active {
          color: #212529;
        }
        [data-theme="light"] .film-catalogue-modal .form-select option {
          background: #fff;
          color: #212529;
        }
      `}</style>
    </>
  );
}


// ─── Film Card Component ───
function FilmCard({ film, onClick }) {
  const posterUrl = tmdbImageUrl(film.poster_path, 'w342');
  const statusConf = STATUS_CONFIG[film.status] || STATUS_CONFIG.pre_release;
  const hasComscore = parseInt(film.import_count) > 0;
  const revenue = parseFloat(film.total_uk_revenue) || 0;

  return (
    <div className="film-card" onClick={onClick} title={film.title}>
      <div className="film-card-poster">
        {posterUrl ? (
          <img src={posterUrl} alt={film.title} loading="lazy" />
        ) : (
          <div className="placeholder-title">
            <span>{film.title}</span>
          </div>
        )}

        {/* Status badge */}
        <div className="film-card-status">
          <Badge bg={statusConf.bg} style={{ fontSize: '0.65rem' }}>
            {statusConf.label}
          </Badge>
        </div>

        {/* Comscore data indicator */}
        <div className="film-card-comscore">
          {hasComscore ? (
            <Badge bg="success" style={{ fontSize: '0.6rem' }} className="d-flex align-items-center gap-1">
              <span className="material-symbols-rounded" style={{ fontSize: '12px' }}>check</span>
              Comscore
            </Badge>
          ) : (
            <Badge bg="dark" style={{ fontSize: '0.6rem', opacity: 0.7 }}>No data</Badge>
          )}
        </div>
      </div>

      <div className="film-card-info">
        <div className="film-card-title">{film.title}</div>
        <div className="film-card-meta">
          {film.year && <span>{film.year}</span>}
          {film.certification && (
            <Badge bg="outline-light" style={{
              fontSize: '0.65rem', border: '1px solid rgba(255,255,255,0.3)',
              background: 'transparent', color: 'inherit', padding: '0.1rem 0.3rem'
            }}>
              {film.certification}
            </Badge>
          )}
          {film.runtime && <span>{film.runtime}m</span>}
        </div>
        {film.genres && (
          <div className="film-card-genres">{film.genres}</div>
        )}
        {revenue > 0 && (
          <div className="film-card-revenue">
            £{revenue.toLocaleString('en-GB', { maximumFractionDigits: 0 })}
          </div>
        )}
      </div>
    </div>
  );
}
