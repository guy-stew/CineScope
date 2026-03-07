// src/components/AddFilmModal.jsx
// Two-step flow: (1) Search TMDB, (2) Review & confirm
// Supports both TMDB-linked and manual film entry

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Modal, Button, Form, InputGroup, Badge, Spinner, Row, Col, Alert } from 'react-bootstrap';
import { useApp } from '../context/AppContext';
import { tmdbImageUrl } from '../utils/apiClient';

export default function AddFilmModal({ show, onHide, onFilmAdded }) {
  const { apiClient } = useApp();

  // ─── State ───
  const [step, setStep] = useState(1); // 1 = search, 2 = review
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedTMDB, setSelectedTMDB] = useState(null); // Full TMDB details
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [manualMode, setManualMode] = useState(false);

  // Form fields (pre-populated from TMDB or blank for manual)
  const [formData, setFormData] = useState({
    title: '',
    year: '',
    status: 'pre_release',
    release_date: '',
    synopsis: '',
    genres: '',
    certification: '',
    runtime: '',
    distribution_cost: '',
    production_cost: '',
    notes: '',
  });

  const searchTimeout = useRef(null);

  // ─── Reset on open/close ───
  useEffect(() => {
    if (show) {
      setStep(1);
      setSearchQuery('');
      setSearchResults([]);
      setSelectedTMDB(null);
      setManualMode(false);
      setError(null);
      setFormData({
        title: '', year: '', status: 'pre_release', release_date: '',
        synopsis: '', genres: '', certification: '', runtime: '',
        distribution_cost: '', production_cost: '', notes: '',
      });
    }
  }, [show]);

  // ─── Debounced TMDB search ───
  const doSearch = useCallback(async (query) => {
    if (!apiClient || query.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    setError(null);
    try {
      const data = await apiClient.searchTMDB(query);
      setSearchResults(data.results || []);
    } catch (err) {
      console.error('TMDB search failed:', err);
      setError('Search failed. Check your TMDB API key is set in Vercel.');
    } finally {
      setSearching(false);
    }
  }, [apiClient]);

  const handleSearchInput = (value) => {
    setSearchQuery(value);
    clearTimeout(searchTimeout.current);
    if (value.trim().length >= 2) {
      searchTimeout.current = setTimeout(() => doSearch(value), 500);
    } else {
      setSearchResults([]);
    }
  };

  // ─── Select a TMDB result → fetch full details ───
  const handleSelectResult = async (result) => {
    setLoadingDetails(true);
    setError(null);
    try {
      const details = await apiClient.getTMDBDetails(result.tmdb_id);
      setSelectedTMDB(details);

      // Pre-populate form
      setFormData({
        title: details.title || '',
        year: details.year ? String(details.year) : '',
        status: details.status === 'Released' ? 'released' : 'pre_release',
        release_date: details.release_date || '',
        synopsis: details.overview || '',
        genres: (details.genres || []).join(', '),
        certification: details.certification || '',
        runtime: details.runtime ? String(details.runtime) : '',
        distribution_cost: '',
        production_cost: '',
        notes: '',
      });
      setStep(2);
    } catch (err) {
      console.error('Failed to fetch TMDB details:', err);
      setError('Failed to load film details from TMDB');
    } finally {
      setLoadingDetails(false);
    }
  };

  // ─── Switch to manual entry ───
  const handleManualEntry = () => {
    setManualMode(true);
    setSelectedTMDB(null);
    setFormData(prev => ({ ...prev, title: searchQuery }));
    setStep(2);
  };

  // ─── Save to catalogue ───
  const handleSave = async () => {
    if (!formData.title.trim()) {
      setError('Film title is required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      let entry;
      if (selectedTMDB && !manualMode) {
        // Create from TMDB data
        entry = await apiClient.addFilmFromTMDB(selectedTMDB.tmdb_id, {
          status: formData.status,
          distribution_cost: formData.distribution_cost ? parseFloat(formData.distribution_cost) : null,
          production_cost: formData.production_cost ? parseFloat(formData.production_cost) : null,
          notes: formData.notes || null,
        });
      } else {
        // Manual entry
        entry = await apiClient.createCatalogueEntry({
          title: formData.title.trim(),
          year: formData.year ? parseInt(formData.year) : null,
          status: formData.status,
          release_date: formData.release_date || null,
          synopsis: formData.synopsis || null,
          genres: formData.genres || null,
          certification: formData.certification || null,
          runtime: formData.runtime ? parseInt(formData.runtime) : null,
          distribution_cost: formData.distribution_cost ? parseFloat(formData.distribution_cost) : null,
          production_cost: formData.production_cost ? parseFloat(formData.production_cost) : null,
          notes: formData.notes || null,
        });
      }
      onFilmAdded(entry);
    } catch (err) {
      const msg = err.message || '';
      if (msg.startsWith('DUPLICATE:')) {
        const parts = msg.split(':');
        setError(`This film is already in your catalogue as "${parts[2]}"`);
      } else {
        setError('Failed to save film. Please try again.');
      }
      console.error('Save failed:', err);
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // ─── Step 1: Search ───
  const renderSearch = () => (
    <>
      <Modal.Header closeButton>
        <Modal.Title className="d-flex align-items-center gap-2">
          <span className="material-symbols-rounded" style={{ color: '#e50914' }}>add_circle</span>
          Add Film
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="text-muted mb-3">Search The Movie Database (TMDB) to auto-fill film details, or add manually.</p>

        <InputGroup className="mb-3">
          <InputGroup.Text>
            <span className="material-symbols-rounded" style={{ fontSize: '18px' }}>search</span>
          </InputGroup.Text>
          <Form.Control
            placeholder="Search for a film... (e.g. Importance of Being Earnest)"
            value={searchQuery}
            onChange={e => handleSearchInput(e.target.value)}
            autoFocus
          />
          {searching && (
            <InputGroup.Text>
              <Spinner animation="border" size="sm" />
            </InputGroup.Text>
          )}
        </InputGroup>

        {error && <Alert variant="danger" className="py-2">{error}</Alert>}

        {/* Loading details overlay */}
        {loadingDetails && (
          <div className="text-center py-4">
            <Spinner animation="border" variant="danger" />
            <p className="mt-2 text-muted">Loading film details from TMDB...</p>
          </div>
        )}

        {/* Search results */}
        {!loadingDetails && searchResults.length > 0 && (
          <div className="tmdb-results">
            {searchResults.slice(0, 10).map(result => (
              <div
                key={result.tmdb_id}
                className="tmdb-result-item"
                onClick={() => handleSelectResult(result)}
              >
                <div className="tmdb-result-poster">
                  {result.poster_path ? (
                    <img src={tmdbImageUrl(result.poster_path, 'w92')} alt="" />
                  ) : (
                    <div className="tmdb-result-no-poster">
                      <span className="material-symbols-rounded">movie</span>
                    </div>
                  )}
                </div>
                <div className="tmdb-result-info">
                  <div className="fw-semibold">{result.title}</div>
                  <div className="text-muted" style={{ fontSize: '0.85rem' }}>
                    {result.year || 'Unknown year'}
                    {result.vote_average > 0 && (
                      <span className="ms-2">
                        <span style={{ color: '#f5c518' }}>★</span> {result.vote_average.toFixed(1)}
                      </span>
                    )}
                  </div>
                  {result.overview && (
                    <div className="text-muted mt-1" style={{ fontSize: '0.8rem', lineHeight: 1.3 }}>
                      {result.overview.length > 150 ? result.overview.substring(0, 150) + '...' : result.overview}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* No results / manual entry link */}
        {!loadingDetails && searchQuery.length >= 2 && !searching && searchResults.length === 0 && (
          <div className="text-center py-3 text-muted">
            <p>No results found for "{searchQuery}"</p>
          </div>
        )}

        {searchQuery.length >= 2 && !loadingDetails && (
          <div className="text-center mt-3">
            <Button variant="outline-secondary" size="sm" onClick={handleManualEntry}>
              Can't find it? Add manually
            </Button>
          </div>
        )}

        {searchQuery.length < 2 && !loadingDetails && (
          <div className="text-center mt-3">
            <Button variant="outline-secondary" size="sm" onClick={() => { setManualMode(true); setStep(2); }}>
              Skip search — add manually
            </Button>
          </div>
        )}
      </Modal.Body>
    </>
  );

  // ─── Step 2: Review & Confirm ───
  const renderReview = () => {
    const posterUrl = selectedTMDB ? tmdbImageUrl(selectedTMDB.poster_path, 'w342') : null;
    const cast = selectedTMDB?.cast || [];
    const crew = selectedTMDB?.crew || [];
    const director = crew.find(c => c.job === 'Director');
    const keywords = selectedTMDB?.keywords || [];

    return (
      <>
        <Modal.Header closeButton>
          <Modal.Title className="d-flex align-items-center gap-2">
            <Button variant="link" className="p-0 text-muted" onClick={() => setStep(1)}>
              <span className="material-symbols-rounded">arrow_back</span>
            </Button>
            {manualMode ? 'Add Film Manually' : 'Review Film Details'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          {error && <Alert variant="danger" className="py-2">{error}</Alert>}

          <Row>
            {/* Poster preview (TMDB only) */}
            {posterUrl && (
              <Col xs={12} md={3} className="mb-3">
                <img
                  src={posterUrl}
                  alt={formData.title}
                  className="rounded shadow"
                  style={{ width: '100%', maxWidth: '200px' }}
                />
                {/* TMDB info summary */}
                {selectedTMDB && (
                  <div className="mt-2" style={{ fontSize: '0.8rem' }}>
                    {selectedTMDB.vote_average > 0 && (
                      <div><span style={{ color: '#f5c518' }}>★</span> {selectedTMDB.vote_average.toFixed(1)} ({selectedTMDB.vote_count} votes)</div>
                    )}
                    {selectedTMDB.popularity > 0 && (
                      <div className="text-muted">Popularity: {selectedTMDB.popularity.toFixed(0)}</div>
                    )}
                    {director && (
                      <div className="text-muted">Director: {director.name}</div>
                    )}
                    {cast.length > 0 && (
                      <div className="text-muted mt-1">
                        <strong>Cast:</strong> {cast.slice(0, 5).map(c => c.name).join(', ')}
                        {cast.length > 5 && ` +${cast.length - 5} more`}
                      </div>
                    )}
                    {keywords.length > 0 && (
                      <div className="mt-1 d-flex flex-wrap gap-1">
                        {keywords.slice(0, 8).map(k => (
                          <Badge key={k.id} bg="dark" style={{ fontSize: '0.65rem', fontWeight: 'normal' }}>
                            {k.name}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </Col>
            )}

            {/* Form fields */}
            <Col>
              <Row className="g-2 mb-2">
                <Col xs={12} md={posterUrl ? 12 : 8}>
                  <Form.Group>
                    <Form.Label className="small fw-semibold">Film Title *</Form.Label>
                    <Form.Control
                      value={formData.title}
                      onChange={e => updateField('title', e.target.value)}
                      placeholder="Enter film title"
                    />
                  </Form.Group>
                </Col>
                <Col xs={6} md={posterUrl ? 4 : 2}>
                  <Form.Group>
                    <Form.Label className="small fw-semibold">Year</Form.Label>
                    <Form.Control
                      type="number"
                      value={formData.year}
                      onChange={e => updateField('year', e.target.value)}
                      placeholder="2025"
                    />
                  </Form.Group>
                </Col>
                <Col xs={6} md={posterUrl ? 4 : 2}>
                  <Form.Group>
                    <Form.Label className="small fw-semibold">Status</Form.Label>
                    <Form.Select value={formData.status} onChange={e => updateField('status', e.target.value)}>
                      <option value="pre_release">Pre-release</option>
                      <option value="released">Released</option>
                      <option value="screening">Screening</option>
                      <option value="completed">Completed</option>
                    </Form.Select>
                  </Form.Group>
                </Col>
                <Col xs={6} md={posterUrl ? 4 : 4}>
                  <Form.Group>
                    <Form.Label className="small fw-semibold">Release Date</Form.Label>
                    <Form.Control
                      type="date"
                      value={formData.release_date}
                      onChange={e => updateField('release_date', e.target.value)}
                    />
                  </Form.Group>
                </Col>
              </Row>

              <Row className="g-2 mb-2">
                <Col xs={12} md={6}>
                  <Form.Group>
                    <Form.Label className="small fw-semibold">Genres</Form.Label>
                    <Form.Control
                      value={formData.genres}
                      onChange={e => updateField('genres', e.target.value)}
                      placeholder="Drama, Comedy, Music"
                    />
                  </Form.Group>
                </Col>
                <Col xs={6} md={3}>
                  <Form.Group>
                    <Form.Label className="small fw-semibold">Certification</Form.Label>
                    <Form.Select value={formData.certification} onChange={e => updateField('certification', e.target.value)}>
                      <option value="">—</option>
                      <option value="U">U</option>
                      <option value="PG">PG</option>
                      <option value="12A">12A</option>
                      <option value="15">15</option>
                      <option value="18">18</option>
                    </Form.Select>
                  </Form.Group>
                </Col>
                <Col xs={6} md={3}>
                  <Form.Group>
                    <Form.Label className="small fw-semibold">Runtime (mins)</Form.Label>
                    <Form.Control
                      type="number"
                      value={formData.runtime}
                      onChange={e => updateField('runtime', e.target.value)}
                      placeholder="120"
                    />
                  </Form.Group>
                </Col>
              </Row>

              <Form.Group className="mb-2">
                <Form.Label className="small fw-semibold">Synopsis</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={3}
                  value={formData.synopsis}
                  onChange={e => updateField('synopsis', e.target.value)}
                  placeholder="Brief description of the film..."
                />
              </Form.Group>

              <hr className="my-3" />
              <h6 className="text-muted mb-2">
                <span className="material-symbols-rounded me-1" style={{ fontSize: '16px', verticalAlign: 'middle' }}>payments</span>
                Financial Details (optional)
              </h6>

              <Row className="g-2 mb-2">
                <Col xs={6}>
                  <Form.Group>
                    <Form.Label className="small fw-semibold">Distribution Cost (£)</Form.Label>
                    <InputGroup>
                      <InputGroup.Text>£</InputGroup.Text>
                      <Form.Control
                        type="number"
                        step="0.01"
                        value={formData.distribution_cost}
                        onChange={e => updateField('distribution_cost', e.target.value)}
                        placeholder="0.00"
                      />
                    </InputGroup>
                  </Form.Group>
                </Col>
                <Col xs={6}>
                  <Form.Group>
                    <Form.Label className="small fw-semibold">Production Cost (£)</Form.Label>
                    <InputGroup>
                      <InputGroup.Text>£</InputGroup.Text>
                      <Form.Control
                        type="number"
                        step="0.01"
                        value={formData.production_cost}
                        onChange={e => updateField('production_cost', e.target.value)}
                        placeholder="0.00"
                      />
                    </InputGroup>
                  </Form.Group>
                </Col>
              </Row>

              <Form.Group className="mb-2">
                <Form.Label className="small fw-semibold">Notes</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={2}
                  value={formData.notes}
                  onChange={e => updateField('notes', e.target.value)}
                  placeholder="Distribution strategy, marketing plans, etc."
                />
              </Form.Group>
            </Col>
          </Row>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={() => setStep(1)}>Back</Button>
          <Button variant="danger" onClick={handleSave} disabled={saving || !formData.title.trim()}>
            {saving ? (
              <><Spinner animation="border" size="sm" className="me-1" /> Saving...</>
            ) : (
              <><span className="material-symbols-rounded me-1" style={{ fontSize: '18px' }}>save</span> Save to Catalogue</>
            )}
          </Button>
        </Modal.Footer>
      </>
    );
  };

  return (
    <Modal show={show} onHide={onHide} size="lg" centered dialogClassName="add-film-modal">
      {step === 1 ? renderSearch() : renderReview()}

      <style>{`
        .add-film-modal .modal-content {
          background: var(--cs-bg, #1a1a2e);
          color: var(--cs-text, #e0e0e0);
        }
        .tmdb-results {
          max-height: 400px;
          overflow-y: auto;
        }
        .tmdb-result-item {
          display: flex;
          gap: 0.75rem;
          padding: 0.75rem;
          border-radius: 6px;
          cursor: pointer;
          transition: background 0.15s;
          border-bottom: 1px solid var(--cs-border, rgba(255,255,255,0.06));
        }
        .tmdb-result-item:hover {
          background: var(--cs-hover, rgba(229, 9, 20, 0.08));
        }
        .tmdb-result-poster {
          flex-shrink: 0;
          width: 60px;
          height: 90px;
          border-radius: 4px;
          overflow: hidden;
          background: #2a2a4a;
        }
        .tmdb-result-poster img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .tmdb-result-no-poster {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #555;
        }
        .tmdb-result-info {
          flex: 1;
          min-width: 0;
        }

        [data-theme="light"] .add-film-modal .modal-content {
          background: #fff;
          color: #212529;
        }
        [data-theme="light"] .tmdb-result-item:hover {
          background: rgba(229, 9, 20, 0.05);
        }
      `}</style>
    </Modal>
  );
}
