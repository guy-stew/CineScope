// src/components/FilmDetailView.jsx
// Full film detail view within the catalogue overlay
// Tabs: Overview, Performance (if Comscore data), Financials

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Button, Badge, Spinner, Alert, Tabs, Tab, Row, Col, Form, InputGroup, Table } from 'react-bootstrap';
import { useApp } from '../context/AppContext';
import { tmdbImageUrl } from '../utils/apiClient';

const STATUS_CONFIG = {
  pre_release: { label: 'Pre-release', bg: 'info' },
  released:    { label: 'Released',    bg: 'primary' },
  screening:   { label: 'Screening',   bg: 'warning' },
  completed:   { label: 'Completed',   bg: 'success' },
};

export default function FilmDetailView({ filmId, onBack, onClose, onFilmUpdated, onFilmDeleted }) {
  const { apiClient } = useApp();

  const [film, setFilm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // ─── TMDB search-on-edit state ───
  const [tmdbResults, setTmdbResults] = useState([]);
  const [tmdbSearching, setTmdbSearching] = useState(false);
  const [showTmdbDropdown, setShowTmdbDropdown] = useState(false);
  const [tmdbLinking, setTmdbLinking] = useState(false);
  const tmdbTimeout = useRef(null);
  const dropdownRef = useRef(null);

  // ─── Load full film details ───
  useEffect(() => {
    if (!apiClient || !filmId) return;
    setLoading(true);
    setError(null);
    apiClient.getCatalogueEntry(filmId)
      .then(data => {
        setFilm(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load film:', err);
        setError('Failed to load film details');
        setLoading(false);
      });
  }, [apiClient, filmId]);

  // ─── Parsed TMDB data ───
  const tmdbData = useMemo(() => {
    if (!film?.tmdb_data) return null;
    const data = typeof film.tmdb_data === 'string' ? JSON.parse(film.tmdb_data) : film.tmdb_data;
    return data;
  }, [film]);

  const cast = tmdbData?.cast || [];
  const crew = tmdbData?.crew || [];
  const keywords = tmdbData?.keywords || [];
  const director = crew.find(c => c.job === 'Director');
  const writers = crew.filter(c => ['Writer', 'Screenplay'].includes(c.job));
  const producers = crew.filter(c => c.job === 'Producer');

  // ─── Financial calculations ───
  const financials = useMemo(() => {
    if (!film) return null;
    const distCost = parseFloat(film.distribution_cost) || 0;
    const prodCost = parseFloat(film.production_cost) || 0;
    const totalCost = distCost + prodCost;
    const totalRevenue = parseFloat(film.total_uk_revenue) || 0;
    const profit = totalRevenue - totalCost;
    const roi = totalCost > 0 ? profit / totalCost : null;
    return { distCost, prodCost, totalCost, totalRevenue, profit, roi };
  }, [film]);

  // ─── Save edits ───
  const handleSave = async () => {
    setSaving(true);
    try {
      const updates = {};
      for (const [key, val] of Object.entries(editData)) {
        if (val !== undefined) {
          updates[key] = val === '' ? null : val;
        }
      }
      const updated = await apiClient.updateCatalogueEntry(filmId, updates);
      setFilm(prev => ({ ...prev, ...updated }));
      onFilmUpdated?.(updated);
      setEditing(false);
      setEditData({});
      setTmdbResults([]);
      setShowTmdbDropdown(false);
    } catch (err) {
      setError('Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  // ─── Delete film ───
  const handleDelete = async () => {
    setDeleting(true);
    try {
      await apiClient.deleteCatalogueEntry(filmId);
      onFilmDeleted?.(filmId);
    } catch (err) {
      setError('Failed to delete film');
      setDeleting(false);
    }
  };

  // ─── TMDB search (debounced, triggered by title input) ───
  const handleTitleChange = useCallback((value) => {
    setEditData(prev => ({ ...prev, title: value }));
    clearTimeout(tmdbTimeout.current);
    if (value.trim().length >= 2 && apiClient) {
      setShowTmdbDropdown(true);
      tmdbTimeout.current = setTimeout(async () => {
        setTmdbSearching(true);
        try {
          const data = await apiClient.searchTMDB(value);
          setTmdbResults(data.results || []);
        } catch (err) {
          console.error('TMDB search failed:', err);
          setTmdbResults([]);
        } finally {
          setTmdbSearching(false);
        }
      }, 500);
    } else {
      setTmdbResults([]);
      setShowTmdbDropdown(false);
    }
  }, [apiClient]);

  // ─── Select a TMDB result → fetch details & merge ───
  const handleTmdbSelect = useCallback(async (result) => {
    setShowTmdbDropdown(false);
    setTmdbResults([]);
    setTmdbLinking(true);
    try {
      const details = await apiClient.getTMDBDetails(result.tmdb_id);

      // Build TMDB fields — always set title + TMDB link fields
      const tmdbFields = {
        title: details.title,
        tmdb_id: details.tmdb_id,
        tmdb_data: details,
        poster_path: details.poster_path,
        backdrop_path: details.backdrop_path,
        tmdb_popularity: details.popularity,
        tmdb_vote_average: details.vote_average,
        tmdb_budget: details.budget,
        tmdb_revenue: details.revenue,
      };

      // Only fill in fields that are currently empty on the existing film
      if (!film.year) tmdbFields.year = details.year;
      if (!film.release_date) tmdbFields.release_date = details.release_date;
      if (!film.synopsis) tmdbFields.synopsis = details.overview;
      if (!film.genres) tmdbFields.genres = (details.genres || []).join(', ');
      if (!film.certification) tmdbFields.certification = details.certification;
      if (!film.runtime) tmdbFields.runtime = details.runtime;

      setEditData(prev => ({ ...prev, ...tmdbFields }));
    } catch (err) {
      console.error('Failed to fetch TMDB details:', err);
      setError('Failed to load film details from TMDB');
    } finally {
      setTmdbLinking(false);
    }
  }, [apiClient, film]);

  // ─── Close TMDB dropdown on click outside ───
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowTmdbDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ─── Loading / Error ───
  if (loading) {
    return (
      <>
        <div className="modal-header border-0">
          <Button variant="link" className="text-muted p-0" onClick={onBack}>
            <span className="material-symbols-rounded">arrow_back</span>
          </Button>
        </div>
        <div className="modal-body d-flex align-items-center justify-content-center" style={{ minHeight: '400px' }}>
          <Spinner animation="border" variant="danger" />
        </div>
      </>
    );
  }

  if (error && !film) {
    return (
      <>
        <div className="modal-header border-0">
          <Button variant="link" className="text-muted p-0" onClick={onBack}>
            <span className="material-symbols-rounded">arrow_back</span>
          </Button>
        </div>
        <div className="modal-body text-center py-5">
          <Alert variant="danger">{error}</Alert>
          <Button variant="outline-secondary" onClick={onBack}>Go Back</Button>
        </div>
      </>
    );
  }

  if (!film) return null;

  const posterUrl = tmdbImageUrl(film.poster_path, 'w500');
  const backdropUrl = tmdbImageUrl(film.backdrop_path, 'w780');
  const statusConf = STATUS_CONFIG[film.status] || STATUS_CONFIG.pre_release;
  const hasImports = film.imports && film.imports.length > 0;

  return (
    <>
      {/* Hero header with backdrop */}
      <div className="film-detail-hero" style={backdropUrl ? {
        backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,0.3), var(--cs-bg, #1a1a2e) 95%), url(${backdropUrl})`,
        backgroundSize: 'cover', backgroundPosition: 'center top'
      } : {}}>
        <div className="d-flex justify-content-between align-items-start p-3">
          <Button variant="link" className="text-white p-0" onClick={onBack}>
            <span className="material-symbols-rounded fs-4">arrow_back</span>
          </Button>
          <div className="d-flex gap-2">
            {!editing && (
              <Button variant="outline-light" size="sm" onClick={() => {
                setEditing(true);
                setActiveTab('financials');
                setEditData({
                  title: film.title || '',
                  status: film.status,
                  distribution_cost: film.distribution_cost || '',
                  production_cost: film.production_cost || '',
                  notes: film.notes || '',
                });
              }}>
                <span className="material-symbols-rounded me-1" style={{ fontSize: '16px' }}>edit</span>
                Edit
              </Button>
            )}
            <Button variant="link" className="text-white p-0" onClick={onClose}>
              <span className="material-symbols-rounded fs-4">close</span>
            </Button>
          </div>
        </div>

        {/* Film info row */}
        <div className="film-detail-inner d-flex gap-3 px-3 pb-3" style={{ marginTop: backdropUrl ? '60px' : '0' }}>
          {posterUrl && (
            <img
              src={posterUrl}
              alt={film.title}
              className="rounded shadow"
              style={{ width: '140px', height: 'auto', flexShrink: 0 }}
            />
          )}
          <div className="d-flex flex-column justify-content-end">
            <h3 className="fw-bold mb-1">{film.title}</h3>
            <div className="d-flex align-items-center gap-2 flex-wrap mb-2">
              <Badge bg={statusConf.bg}>{statusConf.label}</Badge>
              {film.year && <span className="text-muted">{film.year}</span>}
              {film.certification && (
                <Badge bg="dark" style={{ border: '1px solid rgba(255,255,255,0.3)' }}>
                  {film.certification}
                </Badge>
              )}
              {film.runtime && <span className="text-muted">{film.runtime} min</span>}
              {film.genres && <span className="text-muted">{film.genres}</span>}
            </div>
            {film.tmdb_vote_average > 0 && (
              <div style={{ fontSize: '0.9rem' }}>
                <span style={{ color: '#f5c518' }}>★</span> {parseFloat(film.tmdb_vote_average).toFixed(1)}
                {film.tmdb_popularity > 0 && (
                  <span className="text-muted ms-3">Popularity: {parseFloat(film.tmdb_popularity).toFixed(0)}</span>
                )}
              </div>
            )}
            {director && (
              <div className="text-muted" style={{ fontSize: '0.85rem' }}>
                Directed by <strong>{director.name}</strong>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="film-detail-body" style={{ overflowY: 'auto' }}>
        <div className="film-detail-inner pt-0">
        {error && <Alert variant="danger" className="py-2 mt-2">{error}</Alert>}

        <Tabs activeKey={activeTab} onSelect={setActiveTab} className="mb-3 mt-2" variant="pills">
          <Tab eventKey="overview" title="Overview">
            <div className="py-2">
              {/* Synopsis */}
              {film.synopsis && (
                <div className="mb-3">
                  <h6 className="text-muted text-uppercase" style={{ fontSize: '0.75rem', letterSpacing: '0.05em' }}>Synopsis</h6>
                  <p style={{ lineHeight: 1.6 }}>{film.synopsis}</p>
                </div>
              )}

              {/* Tagline */}
              {tmdbData?.tagline && (
                <p className="fst-italic text-muted mb-3">"{tmdbData.tagline}"</p>
              )}

              {/* Cast */}
              {cast.length > 0 && (
                <div className="mb-3">
                  <h6 className="text-muted text-uppercase" style={{ fontSize: '0.75rem', letterSpacing: '0.05em' }}>Cast</h6>
                  <div className="d-flex gap-2 flex-wrap">
                    {cast.slice(0, 12).map(c => (
                      <div key={c.id} className="text-center" style={{ width: '72px' }}>
                        <div style={{
                          width: '60px', height: '60px', borderRadius: '50%', overflow: 'hidden',
                          background: '#2a2a4a', margin: '0 auto 4px'
                        }}>
                          {c.profile_path ? (
                            <img src={tmdbImageUrl(c.profile_path, 'w185')} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <div className="d-flex align-items-center justify-content-center h-100">
                              <span className="material-symbols-rounded" style={{ color: '#555' }}>person</span>
                            </div>
                          )}
                        </div>
                        <div style={{ fontSize: '0.7rem', fontWeight: 600, lineHeight: 1.2 }}>{c.name}</div>
                        <div style={{ fontSize: '0.65rem', color: '#888', lineHeight: 1.2 }}>{c.character}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Crew */}
              {(writers.length > 0 || producers.length > 0) && (
                <div className="mb-3">
                  <h6 className="text-muted text-uppercase" style={{ fontSize: '0.75rem', letterSpacing: '0.05em' }}>Crew</h6>
                  <div style={{ fontSize: '0.85rem' }}>
                    {writers.length > 0 && <div><strong>Writer:</strong> {writers.map(w => w.name).join(', ')}</div>}
                    {producers.length > 0 && <div><strong>Producer:</strong> {producers.map(p => p.name).join(', ')}</div>}
                  </div>
                </div>
              )}

              {/* Keywords */}
              {keywords.length > 0 && (
                <div className="mb-3">
                  <h6 className="text-muted text-uppercase" style={{ fontSize: '0.75rem', letterSpacing: '0.05em' }}>Keywords</h6>
                  <div className="d-flex flex-wrap gap-1">
                    {keywords.map(k => (
                      <Badge key={k.id} bg="dark" style={{ fontSize: '0.75rem', fontWeight: 'normal' }}>
                        {k.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* TMDB reference data */}
              {(film.tmdb_budget > 0 || film.tmdb_revenue > 0) && (
                <div className="mb-3">
                  <h6 className="text-muted text-uppercase" style={{ fontSize: '0.75rem', letterSpacing: '0.05em' }}>TMDB Data</h6>
                  <div style={{ fontSize: '0.85rem' }}>
                    {film.tmdb_budget > 0 && <div>Budget: ${parseInt(film.tmdb_budget).toLocaleString()}</div>}
                    {film.tmdb_revenue > 0 && <div>Worldwide Revenue: ${parseInt(film.tmdb_revenue).toLocaleString()}</div>}
                  </div>
                </div>
              )}

              {/* Notes */}
              {film.notes && (
                <div className="mb-3">
                  <h6 className="text-muted text-uppercase" style={{ fontSize: '0.75rem', letterSpacing: '0.05em' }}>Notes</h6>
                  <p className="text-muted" style={{ whiteSpace: 'pre-wrap' }}>{film.notes}</p>
                </div>
              )}
            </div>
          </Tab>

          {/* Performance Tab */}
          <Tab eventKey="performance" title={
            <span>Performance {hasImports && <Badge bg="success" pill style={{ fontSize: '0.6rem' }}>{film.imports.length}</Badge>}</span>
          }>
            <div className="py-2">
              {hasImports ? (
                <>
                  {/* Summary stats */}
                  <Row className="g-3 mb-4">
                    <Col xs={6} md={3}>
                      <div className="p-3 rounded" style={{ background: 'var(--cs-card-bg, #16213e)' }}>
                        <div className="text-muted" style={{ fontSize: '0.75rem' }}>Comscore Imports</div>
                        <div className="fs-4 fw-bold">{film.imports.length}</div>
                      </div>
                    </Col>
                    <Col xs={6} md={3}>
                      <div className="p-3 rounded" style={{ background: 'var(--cs-card-bg, #16213e)' }}>
                        <div className="text-muted" style={{ fontSize: '0.75rem' }}>Total UK Revenue</div>
                        <div className="fs-4 fw-bold" style={{ color: '#4ade80' }}>
                          £{financials.totalRevenue.toLocaleString('en-GB', { maximumFractionDigits: 0 })}
                        </div>
                      </div>
                    </Col>
                    <Col xs={6} md={3}>
                      <div className="p-3 rounded" style={{ background: 'var(--cs-card-bg, #16213e)' }}>
                        <div className="text-muted" style={{ fontSize: '0.75rem' }}>Total Venues</div>
                        <div className="fs-4 fw-bold">
                          {film.imports.reduce((sum, imp) => sum + (imp.venue_count || 0), 0)}
                        </div>
                      </div>
                    </Col>
                    <Col xs={6} md={3}>
                      <div className="p-3 rounded" style={{ background: 'var(--cs-card-bg, #16213e)' }}>
                        <div className="text-muted" style={{ fontSize: '0.75rem' }}>ROI</div>
                        <div className="fs-4 fw-bold" style={{
                          color: financials.roi === null ? '#888' : financials.roi > 0 ? '#4ade80' : financials.roi < 0 ? '#f87171' : '#fbbf24'
                        }}>
                          {financials.roi !== null ? `${financials.roi.toFixed(1)}x` : '—'}
                        </div>
                      </div>
                    </Col>
                  </Row>

                  {financials.roi !== null && financials.totalCost > 0 && (
                    <Alert variant={financials.roi > 0 ? 'success' : financials.roi < 0 ? 'danger' : 'warning'} className="py-2">
                      <strong>For every £1 spent, £{(1 + financials.roi).toFixed(2)} returned</strong>
                      {financials.profit >= 0
                        ? ` — net profit of £${financials.profit.toLocaleString('en-GB', { maximumFractionDigits: 0 })}`
                        : ` — net loss of £${Math.abs(financials.profit).toLocaleString('en-GB', { maximumFractionDigits: 0 })}`
                      }
                    </Alert>
                  )}

                  {/* Import list */}
                  <h6 className="text-muted text-uppercase mt-3" style={{ fontSize: '0.75rem', letterSpacing: '0.05em' }}>Comscore Imports</h6>
                  <Table size="sm" hover responsive className="small">
                    <thead>
                      <tr>
                        <th>Title</th>
                        <th>Period</th>
                        <th className="text-end">Venues</th>
                        <th className="text-end">Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {film.imports.map(imp => (
                        <tr key={imp.id}>
                          <td>{imp.title}</td>
                          <td className="text-muted">
                            {imp.date_from && new Date(imp.date_from).toLocaleDateString('en-GB')}
                            {imp.date_to && ` – ${new Date(imp.date_to).toLocaleDateString('en-GB')}`}
                          </td>
                          <td className="text-end">{imp.venue_count}</td>
                          <td className="text-end fw-semibold">
                            £{parseFloat(imp.total_revenue).toLocaleString('en-GB', { maximumFractionDigits: 0 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </>
              ) : (
                <div className="text-center py-5">
                  <span className="material-symbols-rounded" style={{ fontSize: '48px', color: '#555' }}>assessment</span>
                  <h6 className="mt-2 text-muted">No Comscore data yet</h6>
                  <p className="text-muted small">Import a Comscore spreadsheet to see performance analytics for this film.</p>
                  <Button variant="outline-danger" size="sm" disabled>
                    <span className="material-symbols-rounded me-1" style={{ fontSize: '16px' }}>upload_file</span>
                    Import Comscore Data
                  </Button>
                  <div className="text-muted mt-1" style={{ fontSize: '0.75rem' }}>(Coming in Stage 3)</div>
                </div>
              )}
            </div>
          </Tab>

          {/* Financials Tab */}
          <Tab eventKey="financials" title="Financials">
            <div className="py-2">
              {editing ? (
                <>
                  <Form.Group className="mb-3" ref={dropdownRef} style={{ position: 'relative' }}>
                    <Form.Label className="small fw-semibold d-flex align-items-center gap-2">
                      Film Title
                      {(editData.tmdb_id || film.tmdb_id) && (
                        <Badge bg="success" style={{ fontSize: '0.65rem', fontWeight: 'normal' }}>
                          <span className="material-symbols-rounded me-1" style={{ fontSize: '12px', verticalAlign: 'middle' }}>link</span>
                          TMDB linked
                        </Badge>
                      )}
                      {tmdbLinking && <Spinner animation="border" size="sm" variant="danger" />}
                    </Form.Label>
                    <Form.Control
                      value={editData.title ?? film.title}
                      onChange={e => handleTitleChange(e.target.value)}
                      onFocus={() => { if (tmdbResults.length > 0) setShowTmdbDropdown(true); }}
                      placeholder="Type to search TMDB..."
                      autoComplete="off"
                    />
                    {!film.tmdb_id && !editData.tmdb_id && (
                      <Form.Text className="text-muted" style={{ fontSize: '0.72rem' }}>
                        Type a film title to search The Movie Database and auto-fill metadata
                      </Form.Text>
                    )}

                    {/* TMDB search results dropdown */}
                    {showTmdbDropdown && ((editData.title ?? film.title) || '').trim().length >= 2 && (
                      <div className="tmdb-edit-dropdown">
                        {tmdbSearching && (
                          <div className="text-center py-2">
                            <Spinner animation="border" size="sm" variant="secondary" />
                            <span className="ms-2" style={{ fontSize: '0.8rem', color: '#999' }}>Searching TMDB...</span>
                          </div>
                        )}
                        {!tmdbSearching && tmdbResults.length === 0 && (
                          <div className="text-center py-2" style={{ fontSize: '0.8rem', color: '#888' }}>
                            No TMDB matches found
                          </div>
                        )}
                        {!tmdbSearching && tmdbResults.slice(0, 6).map(r => (
                          <div
                            key={r.tmdb_id}
                            className="tmdb-edit-result"
                            onClick={() => handleTmdbSelect(r)}
                          >
                            <div className="tmdb-edit-poster">
                              {r.poster_path ? (
                                <img src={tmdbImageUrl(r.poster_path, 'w92')} alt="" />
                              ) : (
                                <span className="material-symbols-rounded" style={{ color: '#555', fontSize: '24px' }}>movie</span>
                              )}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div className="fw-semibold" style={{ fontSize: '0.85rem' }}>{r.title}</div>
                              <div style={{ fontSize: '0.75rem', color: '#999' }}>
                                {r.year || 'Unknown year'}
                                {r.vote_average > 0 && (
                                  <span className="ms-2"><span style={{ color: '#f5c518' }}>★</span> {r.vote_average.toFixed(1)}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </Form.Group>
                  <Row className="g-3 mb-3">
                    <Col xs={6}>
                      <Form.Group>
                        <Form.Label className="small fw-semibold">Status</Form.Label>
                        <Form.Select
                          value={editData.status || film.status}
                          onChange={e => setEditData(prev => ({ ...prev, status: e.target.value }))}
                        >
                          <option value="pre_release">Pre-release</option>
                          <option value="released">Released</option>
                          <option value="screening">Screening</option>
                          <option value="completed">Completed</option>
                        </Form.Select>
                      </Form.Group>
                    </Col>
                  </Row>
                  <Row className="g-3 mb-3">
                    <Col xs={6}>
                      <Form.Group>
                        <Form.Label className="small fw-semibold">Distribution Cost</Form.Label>
                        <InputGroup>
                          <InputGroup.Text>£</InputGroup.Text>
                          <Form.Control
                            type="number"
                            step="0.01"
                            value={editData.distribution_cost ?? ''}
                            onChange={e => setEditData(prev => ({ ...prev, distribution_cost: e.target.value ? parseFloat(e.target.value) : null }))}
                          />
                        </InputGroup>
                      </Form.Group>
                    </Col>
                    <Col xs={6}>
                      <Form.Group>
                        <Form.Label className="small fw-semibold">Production Cost</Form.Label>
                        <InputGroup>
                          <InputGroup.Text>£</InputGroup.Text>
                          <Form.Control
                            type="number"
                            step="0.01"
                            value={editData.production_cost ?? ''}
                            onChange={e => setEditData(prev => ({ ...prev, production_cost: e.target.value ? parseFloat(e.target.value) : null }))}
                          />
                        </InputGroup>
                      </Form.Group>
                    </Col>
                  </Row>
                  <Form.Group className="mb-3">
                    <Form.Label className="small fw-semibold">Notes</Form.Label>
                    <Form.Control
                      as="textarea"
                      rows={3}
                      value={editData.notes ?? ''}
                      onChange={e => setEditData(prev => ({ ...prev, notes: e.target.value }))}
                    />
                  </Form.Group>
                  <div className="d-flex gap-2">
                    <Button variant="danger" onClick={handleSave} disabled={saving}>
                      {saving ? <Spinner animation="border" size="sm" /> : 'Save Changes'}
                    </Button>
                    <Button variant="outline-secondary" onClick={() => { setEditing(false); setEditData({}); setTmdbResults([]); setShowTmdbDropdown(false); }}>Cancel</Button>
                  </div>
                </>
              ) : (
                <>
                  <Row className="g-3 mb-3">
                    <Col xs={6} md={3}>
                      <div className="p-3 rounded" style={{ background: 'var(--cs-card-bg, #16213e)' }}>
                        <div className="text-muted" style={{ fontSize: '0.75rem' }}>Distribution Cost</div>
                        <div className="fs-5 fw-bold">
                          {financials.distCost > 0
                            ? `£${financials.distCost.toLocaleString('en-GB', { minimumFractionDigits: 2 })}`
                            : '—'}
                        </div>
                      </div>
                    </Col>
                    <Col xs={6} md={3}>
                      <div className="p-3 rounded" style={{ background: 'var(--cs-card-bg, #16213e)' }}>
                        <div className="text-muted" style={{ fontSize: '0.75rem' }}>Production Cost</div>
                        <div className="fs-5 fw-bold">
                          {financials.prodCost > 0
                            ? `£${financials.prodCost.toLocaleString('en-GB', { minimumFractionDigits: 2 })}`
                            : '—'}
                        </div>
                      </div>
                    </Col>
                    <Col xs={6} md={3}>
                      <div className="p-3 rounded" style={{ background: 'var(--cs-card-bg, #16213e)' }}>
                        <div className="text-muted" style={{ fontSize: '0.75rem' }}>UK Revenue</div>
                        <div className="fs-5 fw-bold" style={{ color: '#4ade80' }}>
                          {financials.totalRevenue > 0
                            ? `£${financials.totalRevenue.toLocaleString('en-GB', { maximumFractionDigits: 0 })}`
                            : '—'}
                        </div>
                      </div>
                    </Col>
                    <Col xs={6} md={3}>
                      <div className="p-3 rounded" style={{ background: 'var(--cs-card-bg, #16213e)', border: financials.roi !== null ? `1px solid ${financials.roi > 0 ? '#4ade80' : '#f87171'}40` : 'none' }}>
                        <div className="text-muted" style={{ fontSize: '0.75rem' }}>Net Profit / Loss</div>
                        <div className="fs-5 fw-bold" style={{
                          color: financials.totalCost === 0 ? '#888' : financials.profit >= 0 ? '#4ade80' : '#f87171'
                        }}>
                          {financials.totalCost > 0
                            ? `${financials.profit >= 0 ? '+' : '-'}£${Math.abs(financials.profit).toLocaleString('en-GB', { maximumFractionDigits: 0 })}`
                            : '—'}
                        </div>
                      </div>
                    </Col>
                  </Row>

                  {financials.roi !== null && financials.totalCost > 0 && (
                    <Alert variant={financials.roi > 0 ? 'success' : financials.roi < 0 ? 'danger' : 'warning'}>
                      <strong>ROI: {(financials.roi * 100).toFixed(0)}%</strong> — For every £1 invested, £{(1 + financials.roi).toFixed(2)} returned.
                    </Alert>
                  )}

                  {film.notes && (
                    <div className="mt-3">
                      <h6 className="text-muted text-uppercase" style={{ fontSize: '0.75rem', letterSpacing: '0.05em' }}>Notes</h6>
                      <p style={{ whiteSpace: 'pre-wrap' }}>{film.notes}</p>
                    </div>
                  )}

                  {/* Delete section */}
                  <hr className="my-4" />
                  <div>
                    {confirmDelete ? (
                      <Alert variant="danger">
                        <strong>Are you sure?</strong> This will remove the catalogue entry. Any linked Comscore imports will be preserved but unlinked.
                        <div className="mt-2 d-flex gap-2">
                          <Button variant="danger" size="sm" onClick={handleDelete} disabled={deleting}>
                            {deleting ? <Spinner animation="border" size="sm" /> : 'Yes, delete'}
                          </Button>
                          <Button variant="outline-secondary" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
                        </div>
                      </Alert>
                    ) : (
                      <Button variant="outline-danger" size="sm" onClick={() => setConfirmDelete(true)}>
                        <span className="material-symbols-rounded me-1" style={{ fontSize: '16px' }}>delete</span>
                        Delete from Catalogue
                      </Button>
                    )}
                  </div>
                </>
              )}
            </div>
          </Tab>
        </Tabs>
        </div>
      </div>

      <style>{`
        .film-detail-hero {
          min-height: 200px;
          position: relative;
        }
        /* ── Hero text contrast ── */
        .film-detail-hero .text-muted {
          color: rgba(255,255,255,0.7) !important;
        }
        .film-detail-hero strong {
          color: #fff;
        }
        .film-detail-hero div,
        .film-detail-hero span {
          color: rgba(255,255,255,0.85);
        }
        /* ── Max-width container for readable text ── */
        .film-detail-inner {
          max-width: 890px;
          margin: 0 auto;
        }
        .film-detail-body {
          padding: 0 1.5rem 1.5rem;
          overflow-y: auto;
          background: var(--cs-bg, #1a1a2e);
        }
        /* ── Text contrast for dark theme ── */
        .film-detail-hero h3 {
          color: #f0f0f0;
        }
        .film-detail-body,
        .film-detail-body p,
        .film-detail-body div,
        .film-detail-body td,
        .film-detail-body th,
        .film-detail-body strong {
          color: #f0f0f0;
        }
        .film-detail-body h6.text-muted {
          color: #aaa !important;
        }
        .film-detail-body .text-muted {
          color: #aaa !important;
        }
        .film-detail-body .fst-italic {
          color: #bbb;
        }
        /* ── Tabs ── */
        .film-detail-body .nav-pills .nav-link {
          color: #aaa;
          border-radius: 20px;
          padding: 0.35rem 0.9rem;
          font-size: 0.9rem;
        }
        .film-detail-body .nav-pills .nav-link.active {
          color: #fff;
          background: #e50914;
        }
        /* ── Table ── */
        .film-detail-body .table {
          color: #ddd;
          border-color: rgba(255,255,255,0.08);
        }
        .film-detail-body .table thead th {
          color: #aaa;
          border-color: rgba(255,255,255,0.12);
        }
        .film-detail-body .table tbody tr:hover {
          background: rgba(255,255,255,0.04);
        }
        /* ── Form controls in edit mode ── */
        .film-detail-body .form-control,
        .film-detail-body .form-select {
          background: #1e2a45;
          border-color: #3a4a6a;
          color: #f0f0f0;
        }
        .film-detail-body .form-control::placeholder {
          color: #778;
        }
        .film-detail-body .form-control:focus,
        .film-detail-body .form-select:focus {
          background: #243050;
          border-color: #e50914;
          color: #f0f0f0;
          box-shadow: 0 0 0 0.2rem rgba(229, 9, 20, 0.15);
        }
        .film-detail-body .form-label {
          color: #ccc !important;
        }
        .film-detail-body .input-group-text {
          background: #16213e;
          border-color: #3a4a6a;
          color: #aaa;
        }
        .film-detail-body .form-select option {
          background: #1e2a45;
          color: #f0f0f0;
        }
        .film-detail-body .btn-outline-secondary {
          color: #ccc;
          border-color: #3a4a6a;
        }
        .film-detail-body .btn-outline-secondary:hover {
          color: #fff;
          background: rgba(255,255,255,0.1);
        }

        /* ── TMDB search dropdown in edit mode ── */
        .tmdb-edit-dropdown {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          z-index: 1050;
          background: #1e2a45;
          border: 1px solid #3a4a6a;
          border-top: none;
          border-radius: 0 0 8px 8px;
          max-height: 320px;
          overflow-y: auto;
          box-shadow: 0 8px 24px rgba(0,0,0,0.4);
        }
        .tmdb-edit-result {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          padding: 0.5rem 0.75rem;
          cursor: pointer;
          transition: background 0.12s;
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .tmdb-edit-result:hover {
          background: rgba(229, 9, 20, 0.1);
        }
        .tmdb-edit-result:last-child {
          border-bottom: none;
        }
        .tmdb-edit-poster {
          flex-shrink: 0;
          width: 40px;
          height: 60px;
          border-radius: 3px;
          overflow: hidden;
          background: #2a2a4a;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .tmdb-edit-poster img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        /* ── Light theme ── */
        [data-theme="light"] .film-detail-hero .text-muted {
          color: rgba(0,0,0,0.5) !important;
        }
        [data-theme="light"] .film-detail-hero div,
        [data-theme="light"] .film-detail-hero span {
          color: #333;
        }
        [data-theme="light"] .film-detail-hero strong {
          color: #212529;
        }
        [data-theme="light"] .film-detail-hero h3 {
          color: #212529;
        }
        [data-theme="light"] .film-detail-body,
        [data-theme="light"] .film-detail-body p,
        [data-theme="light"] .film-detail-body div,
        [data-theme="light"] .film-detail-body td,
        [data-theme="light"] .film-detail-body th,
        [data-theme="light"] .film-detail-body strong {
          color: #212529;
          background-color: transparent;
        }
        [data-theme="light"] .film-detail-body {
          background: #fff !important;
        }
        [data-theme="light"] .film-detail-body .text-muted,
        [data-theme="light"] .film-detail-body h6.text-muted {
          color: #6c757d !important;
        }
        [data-theme="light"] .film-detail-body .nav-pills .nav-link {
          color: #6c757d;
        }
        [data-theme="light"] .film-detail-body .nav-pills .nav-link.active {
          color: #fff;
        }
        [data-theme="light"] .film-detail-body .table {
          color: #212529;
          border-color: #dee2e6;
        }
        [data-theme="light"] .film-detail-body .form-control,
        [data-theme="light"] .film-detail-body .form-select {
          background: #fff;
          border-color: #ced4da;
          color: #212529;
        }
        [data-theme="light"] .film-detail-body .form-label {
          color: #495057 !important;
        }
        [data-theme="light"] .film-detail-body .input-group-text {
          background: #e9ecef;
          border-color: #ced4da;
          color: #495057;
        }
        [data-theme="light"] .film-detail-body .form-select option {
          background: #fff;
          color: #212529;
        }
        [data-theme="light"] .film-detail-body .btn-outline-secondary {
          color: #6c757d;
          border-color: #ced4da;
        }
        [data-theme="light"] .tmdb-edit-dropdown {
          background: #fff;
          border-color: #ced4da;
          box-shadow: 0 8px 24px rgba(0,0,0,0.12);
        }
        [data-theme="light"] .tmdb-edit-result:hover {
          background: rgba(229, 9, 20, 0.05);
        }
        [data-theme="light"] .tmdb-edit-result {
          border-color: #eee;
        }
        [data-theme="light"] .tmdb-edit-poster {
          background: #e9ecef;
        }
      `}</style>
    </>
  );
}
